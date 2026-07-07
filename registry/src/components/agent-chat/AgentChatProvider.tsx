// AgentChatProvider.tsx — runs `useAgentChat`, wraps `send` to also fire
// `onSend`, taps `onEvent` to derive the registry-side notice/toast surface
// (the GAP — core's public result has no notice field, see spec §10's
// `<Dialogs>` "`notify` surfaces as a toast" contract), and watches the view
// model to fire the observability callbacks (spec §11).

'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  defaultToolRegistry,
  useAgentChat,
  type BusySendMode,
  type ChatEvent,
} from '@crouton-kit/agent-chat-core';
import type { UseAgentChatOptions } from '@crouton-kit/agent-chat-core';
import { AgentChatContext } from './context.js';
import type {
  AgentChatClassNames,
  AgentChatComponents,
  AgentChatEventCallbacks,
  MarkdownConfig,
  Notice,
  RenderDialog,
  RenderEmpty,
  RenderMessage,
  RenderStatus,
  RenderThinking,
  RenderTool,
  ViewMode,
} from './types.js';

export interface AgentChatProviderProps
  extends Pick<UseAgentChatOptions, 'endpoint' | 'onBeforeConnect' | 'role' | 'busySendMode' | 'toolRegistry' | 'reconnect' | 'onDialog'>,
    AgentChatEventCallbacks {
  nodeId: string | null;
  view?: ViewMode;
  classNames?: AgentChatClassNames;
  components?: AgentChatComponents;
  markdown?: MarkdownConfig;
  suggestions?: string[];
  renderMessage?: RenderMessage;
  renderTool?: RenderTool;
  renderThinking?: RenderThinking;
  renderStatus?: RenderStatus;
  renderDialog?: RenderDialog;
  renderEmpty?: RenderEmpty;
  children: ReactNode;
}

let noticeCounter = 0;
function nextNoticeId(): string {
  noticeCounter += 1;
  return `notice-${Date.now()}-${noticeCounter}`;
}

export function AgentChatProvider({
  nodeId,
  endpoint,
  onBeforeConnect,
  role,
  busySendMode,
  toolRegistry,
  reconnect,
  onDialog,
  view = 'user',
  classNames = {},
  components = {},
  markdown,
  suggestions,
  renderMessage,
  renderTool,
  renderThinking,
  renderStatus,
  renderDialog,
  renderEmpty,
  onSend,
  onReceive,
  onToolCall,
  onError,
  onControlChange,
  children,
}: AgentChatProviderProps) {
  const [notices, setNotices] = useState<Notice[]>([]);

  const dismissNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const handleEvent = useCallback((e: ChatEvent) => {
    if (e.type !== 'frame') return;
    const frame = e.frame;
    if (frame.type === 'error') {
      setNotices((prev) => [...prev, { id: nextNoticeId(), level: 'error', text: frame.message }]);
      onErrorRef.current?.(new Error(frame.message));
    } else if (frame.type === 'extension_ui_request' && frame.method === 'notify') {
      setNotices((prev) => [...prev, { id: nextNoticeId(), level: frame.notifyType ?? 'info', text: frame.message }]);
    }
  }, []);

  const chat = useAgentChat(nodeId, {
    endpoint,
    onBeforeConnect,
    role,
    busySendMode: busySendMode as BusySendMode | undefined,
    toolRegistry,
    reconnect,
    onDialog,
    onEvent: handleEvent,
  });

  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  const actions = useMemo(
    () => ({
      ...chat.actions,
      send: (text: string) => {
        onSendRef.current?.(text);
        chat.actions.send(text);
      },
    }),
    [chat.actions],
  );

  // control changes
  useEffect(() => {
    onControlChange?.(chat.control);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.control]);

  // onReceive — fires on every transcript identity change, including
  // streaming updates (not strictly per-token, but the closest observable
  // signal `useAgentChat` exposes; a deliberate reading of an underspecified
  // callback, not a per-frame guarantee).
  useEffect(() => {
    const last = chat.transcript[chat.transcript.length - 1];
    if (last) onReceive?.(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.transcript]);

  // onToolCall — fires once per newly-seen `${callId}:${status}` transition.
  const seenToolTransitions = useRef(new Set<string>());
  useEffect(() => {
    for (const item of chat.transcript) {
      if (item.kind !== 'tool') continue;
      const key = `${item.call.callId}:${item.call.status}`;
      if (seenToolTransitions.current.has(key)) continue;
      seenToolTransitions.current.add(key);
      onToolCall?.(item.call);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.transcript]);

  const contextValue = useMemo(
    () => ({
      chat: { ...chat, actions },
      view,
      toolRegistry: toolRegistry ?? defaultToolRegistry,
      classNames,
      components,
      markdown,
      suggestions,
      renderMessage,
      renderTool,
      renderThinking,
      renderStatus,
      renderDialog,
      renderEmpty,
      notices,
      dismissNotice,
    }),
    [
      chat,
      actions,
      view,
      toolRegistry,
      classNames,
      components,
      markdown,
      suggestions,
      renderMessage,
      renderTool,
      renderThinking,
      renderStatus,
      renderDialog,
      renderEmpty,
      notices,
      dismissNotice,
    ],
  );

  return <AgentChatContext.Provider value={contextValue}>{children}</AgentChatContext.Provider>;
}
