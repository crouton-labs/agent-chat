// use-agent-chat.ts — the single headless engine (spec §9). Owns attach
// lifecycle, revive-before-connect, the queue/steer/abort state machine,
// activity derivation, dialog request/response plumbing, and exposes the
// normalized view model + actions. Everything it composes (the reducer,
// normalizer, activity derivation, queue SM, dialog helpers) is pure and
// independently unit-tested; this file is the thin React shell around them.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Activity } from './activity.js';
import { deriveActivity } from './activity.js';
import type { ChatItem } from './chat-item.js';
import { chatReducer, initialChatState } from './chat-reducer.js';
import { answerResponseFrame, cancelResponseFrame } from './dialog.js';
import { normalizeMessages } from './normalizer.js';
import { cancelQueued as cancelQueuedAt, flushQueueOnAgentEnd, routeSend, type BusySendMode } from './queue.js';
import { defaultToolRegistry, type ToolRegistry } from './tool-registry.js';
import { BrokerClient, type CloseKind } from './wire/broker-client.js';
import type { BlockingDialogRequest, BrokerToClient, ClientRole, DialogResponse } from './wire/protocol.js';

export type ChatStatus = 'connecting' | 'open' | 'reconnecting' | 'error-retry' | 'error-fatal';

export type ChatEvent = { type: 'status'; status: ChatStatus } | { type: 'frame'; frame: BrokerToClient } | { type: 'close'; kind: CloseKind; reason: string };

export interface UseAgentChatOptions {
  /** default: absolute same-origin `wss(s)://<host>/v1/attach?nodeId=…` */
  endpoint?: (nodeId: string) => string;
  /** revive-before-attach; awaited before every WS open, incl. revivable reconnects. */
  onBeforeConnect?: (nodeId: string) => Promise<void>;
  role?: ClientRole;
  /** what a plain `send()` does while busy; default 'queue'. */
  busySendMode?: BusySendMode;
  toolRegistry?: ToolRegistry;
  reconnect?: { delayMs?: number; maxAttempts?: number };
  /** app owns the dialog response path; `respond` sends the correct wire answer. */
  onDialog?: (request: BlockingDialogRequest, respond: (r: DialogResponse) => void) => boolean;
  /** observability tap — every lifecycle + wire event, post-normalization. */
  onEvent?: (e: ChatEvent) => void;
}

export interface UseAgentChatActions {
  send: (text: string) => void;
  steer: (text: string) => void;
  abort: () => void;
  cancelQueued: (index: number) => void;
  requestControl: () => void;
  answerDialog: (r: DialogResponse) => void;
  cancelDialog: () => void;
  reconnect: () => void;
}

export interface UseAgentChatResult {
  transcript: ChatItem[];
  status: ChatStatus;
  control: ClientRole;
  activity: Activity;
  queue: string[];
  dialog: BlockingDialogRequest | null;
  actions: UseAgentChatActions;
}

const DEFAULT_RECONNECT_DELAY_MS = 1000;
const DEFAULT_MAX_ATTEMPTS = 5;

function defaultEndpoint(nodeId: string): string {
  const proto = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof location !== 'undefined' ? location.host : '';
  return `${proto}//${host}/v1/attach?nodeId=${encodeURIComponent(nodeId)}`;
}

function backoffDelay(base: number, attempt: number): number {
  return base * 2 ** Math.max(0, attempt - 1);
}

export function useAgentChat(nodeId: string | null, options: UseAgentChatOptions = {}): UseAgentChatResult {
  const clientIdRef = useRef<string>('');
  if (clientIdRef.current === '') clientIdRef.current = crypto.randomUUID();

  const [state, dispatch] = useState(() => initialChatState(clientIdRef.current));
  const [status, setStatusState] = useState<ChatStatus>('connecting');
  const [queue, setQueue] = useState<string[]>([]);
  const [pending, setPending] = useState<{ id: string; text: string }[]>([]);

  // Options read via refs so `connect`'s identity stays stable across renders
  // (only `nodeId` should ever re-trigger the attach effect) while every call
  // site still sees the LATEST option values.
  const endpointRef = useRef(options.endpoint ?? defaultEndpoint);
  endpointRef.current = options.endpoint ?? defaultEndpoint;
  const onBeforeConnectRef = useRef(options.onBeforeConnect);
  onBeforeConnectRef.current = options.onBeforeConnect;
  const roleRef = useRef<ClientRole>(options.role ?? 'controller');
  roleRef.current = options.role ?? 'controller';
  const busySendModeRef = useRef<BusySendMode>(options.busySendMode ?? 'queue');
  busySendModeRef.current = options.busySendMode ?? 'queue';
  const toolRegistryRef = useRef<ToolRegistry>(options.toolRegistry ?? defaultToolRegistry);
  toolRegistryRef.current = options.toolRegistry ?? defaultToolRegistry;
  const reconnectDelayRef = useRef(options.reconnect?.delayMs ?? DEFAULT_RECONNECT_DELAY_MS);
  reconnectDelayRef.current = options.reconnect?.delayMs ?? DEFAULT_RECONNECT_DELAY_MS;
  const maxAttemptsRef = useRef(options.reconnect?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  maxAttemptsRef.current = options.reconnect?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const onEventRef = useRef(options.onEvent);
  onEventRef.current = options.onEvent;
  const onDialogRef = useRef(options.onDialog);
  onDialogRef.current = options.onDialog;

  const stateRef = useRef(state);
  stateRef.current = state;
  const controlRef = useRef<ClientRole>(state.control);
  controlRef.current = state.control;
  const isStreamingRef = useRef(state.conv.isStreaming);
  isStreamingRef.current = state.conv.isStreaming;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const lastSeenDialogIdRef = useRef<string | null>(null);
  // Set (not a ref) so hiding the dialog after `onDialog` returns `true`
  // actually re-renders the hook's consumers — mutating a ref alone would
  // leave the already-committed render's exposed `dialog` stale (spec §9:
  // "return true to suppress built-in UI"). Keyed by dialog id so a NEW
  // (superseding) dialog is shown again even while an older id stays
  // suppressed.
  const [suppressedDialogId, setSuppressedDialogId] = useState<string | null>(null);

  const clientRef = useRef<BrokerClient | null>(null);
  const genRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  const setStatus = useCallback((next: ChatStatus) => {
    setStatusState(next);
    onEventRef.current?.({ type: 'status', status: next });
  }, []);

  const send = useCallback((frame: Parameters<BrokerClient['send']>[0]) => {
    clientRef.current?.send(frame);
  }, []);

  const scheduleReconnect = useCallback((gen: number, connectFn: () => void) => {
    attemptsRef.current += 1;
    if (attemptsRef.current >= maxAttemptsRef.current) {
      setStatus('error-retry');
      return;
    }
    setStatus('reconnecting');
    const delay = backoffDelay(reconnectDelayRef.current, attemptsRef.current);
    timerRef.current = setTimeout(() => {
      if (gen !== genRef.current) return;
      connectFn();
    }, delay);
  }, [setStatus]);

  const connect = useCallback(() => {
    if (nodeId === null) return;
    const gen = genRef.current;
    const before = onBeforeConnectRef.current ? onBeforeConnectRef.current(nodeId) : Promise.resolve();
    before
      .then(() => {
        if (gen !== genRef.current) return;
        const client = new BrokerClient(endpointRef.current(nodeId), {
          onOpen: () => {
            if (gen !== genRef.current) return;
            client.send({ type: 'hello', role: roleRef.current, client_id: clientIdRef.current });
          },
          onFrame: (frame) => {
            if (gen !== genRef.current) return;
            dispatch((prev) => chatReducer(prev, { kind: 'frame', frame }));
            onEventRef.current?.({ type: 'frame', frame });
            if (frame.type === 'welcome') {
              attemptsRef.current = 0;
              setStatus('open');
              if (roleRef.current === 'controller' && frame.controller_id !== clientIdRef.current) {
                client.send({ type: 'request_control' });
              }
            }
            if (frame.type === 'agent_end') {
              const { toSend, queue: rest } = flushQueueOnAgentEnd(queueRef.current);
              if (toSend !== undefined) {
                setQueue([...rest]);
                setPending((p) => [...p, { id: crypto.randomUUID(), text: toSend }]);
                client.send({ type: 'prompt', text: toSend });
              }
            }
          },
          onClose: (closeKind, reason) => {
            if (gen !== genRef.current) return;
            onEventRef.current?.({ type: 'close', kind: closeKind, reason });
            if (closeKind === 'fatal-invalid' || closeKind === 'fatal-gone') {
              setStatus('error-fatal');
              return;
            }
            if (closeKind === 'normal') return; // clean close, no auto-retry
            scheduleReconnect(gen, connect);
          },
        });
        clientRef.current = client;
        client.connect();
      })
      .catch(() => {
        if (gen !== genRef.current) return;
        // onBeforeConnect (revive) failing is a transient failure the
        // reconnect loop can retry (spec §7 residual-risk note).
        scheduleReconnect(gen, connect);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, setStatus, scheduleReconnect]);

  useEffect(() => {
    if (nodeId === null) return;
    genRef.current += 1;
    attemptsRef.current = 0;
    dispatch(() => initialChatState(clientIdRef.current));
    setQueue([]);
    setPending([]);
    setSuppressedDialogId(null);
    setStatus('connecting');
    connect();
    return () => {
      genRef.current += 1;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      clientRef.current?.close();
      clientRef.current = null;
    };
  }, [nodeId, connect, setStatus]);

  // Reconcile optimistic `pending` user items: any growth in the raw message
  // count means the broker has echoed/started processing a sent turn, so the
  // oldest still-pending item is reconciled (spec §4 rule 4).
  const messageCount = state.conv.messages.length;
  const lastMessageCountRef = useRef(0);
  useEffect(() => {
    if (messageCount > lastMessageCountRef.current) {
      setPending((p) => (p.length > 0 ? p.slice(1) : p));
    }
    lastMessageCountRef.current = messageCount;
  }, [messageCount]);

  // Fire `onDialog` exactly once per newly-appeared blocking dialog. If it
  // returns `true`, mark this dialog id suppressed — the exposed `dialog`
  // view-model state (below) hides it while `respond`/`answerDialog`/
  // `cancelDialog` keep operating on the underlying reducer state and still
  // send the correct wire frame (spec §9: "return true to suppress built-in
  // UI"). A later dialog with a DIFFERENT id is shown again.
  const dialogId = state.dialog?.id ?? null;
  useEffect(() => {
    if (dialogId === null || dialogId === lastSeenDialogIdRef.current) return;
    lastSeenDialogIdRef.current = dialogId;
    if (state.dialog !== null) {
      const suppress = onDialogRef.current?.(state.dialog, answerDialogAction);
      if (suppress === true) setSuppressedDialogId(dialogId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogId]);

  const exposedDialog = state.dialog !== null && state.dialog.id === suppressedDialogId ? null : state.dialog;

  const transcript = useMemo(() => {
    const items = normalizeMessages(state.conv.messages, state.conv.streamingIndex, { toolRegistry: toolRegistryRef.current });
    if (pending.length === 0) return items;
    return [...items, ...pending.map((p) => ({ kind: 'user' as const, id: p.id, text: p.text, pending: true }))];
  }, [state.conv, pending]);

  const activity = useMemo(
    () => deriveActivity({ displayStatus: state.displayStatus, items: transcript, isStreaming: state.conv.isStreaming }),
    [state.displayStatus, transcript, state.conv.isStreaming],
  );

  const sendAction = useCallback(
    (text: string) => {
      if (controlRef.current !== 'controller') return;
      const route = routeSend(text, isStreamingRef.current, busySendModeRef.current);
      if (route.kind === 'prompt') {
        setPending((p) => [...p, { id: crypto.randomUUID(), text: route.text }]);
        send({ type: 'prompt', text: route.text });
      } else if (route.kind === 'steer') {
        send({ type: 'steer', text: route.text });
      } else {
        setQueue((q) => [...q, route.text]);
      }
    },
    [send],
  );

  const steerAction = useCallback(
    (text: string) => {
      if (controlRef.current !== 'controller') return;
      send({ type: 'steer', text });
    },
    [send],
  );

  const abortAction = useCallback(() => {
    if (controlRef.current !== 'controller') return;
    send({ type: 'abort' });
  }, [send]);

  const cancelQueuedAction = useCallback((index: number) => {
    setQueue((q) => [...cancelQueuedAt(q, index)]);
  }, []);

  const requestControlAction = useCallback(() => {
    send({ type: 'request_control' });
  }, [send]);

  const answerDialogAction = useCallback(
    (r: DialogResponse) => {
      // extension_ui_response is controller-gated (spec §3), same as
      // send/steer/abort. An observer's stale local dialog is still cleared
      // (it's already closed by control_changed — this is belt-and-suspenders
      // for a dialog answered right as control is lost) but no frame is sent.
      if (controlRef.current === 'controller') send(answerResponseFrame(r));
      dispatch((prev) => chatReducer(prev, { kind: 'dismiss-dialog' }));
    },
    [send],
  );

  const cancelDialogAction = useCallback(() => {
    if (controlRef.current === 'controller') {
      const frame = cancelResponseFrame(stateRef.current.dialog);
      if (frame !== undefined) send(frame);
    }
    dispatch((prev) => chatReducer(prev, { kind: 'dismiss-dialog' }));
  }, [send]);

  const reconnectAction = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    genRef.current += 1;
    attemptsRef.current = 0;
    clientRef.current?.close();
    setStatus('connecting');
    connect();
  }, [connect, setStatus]);

  return {
    transcript,
    status,
    control: state.control,
    activity,
    queue,
    dialog: exposedDialog,
    actions: {
      send: sendAction,
      steer: steerAction,
      abort: abortAction,
      cancelQueued: cancelQueuedAction,
      requestControl: requestControlAction,
      answerDialog: answerDialogAction,
      cancelDialog: cancelDialogAction,
      reconnect: reconnectAction,
    },
  };
}
