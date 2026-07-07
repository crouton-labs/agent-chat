// use-agent-chat.test.tsx — WIRING tests only (per test-only-what-changed):
// every pure function this hook composes (reducer, normalizer, activity,
// queue, dialog) already has its own exhaustive test file. This file proves
// the hook wires them together correctly against a scripted fake WebSocket:
// attach → welcome → open/seed/request_control; transient close → reconnect;
// pending_dialog seeding; fatal close → no reconnect.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeMessages } from '../normalizer.js';
import { useAgentChat } from '../use-agent-chat.js';
import type { AnyMessage } from '../wire/protocol.js';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  /** Test helper: simulate the server accepting the connection. */
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  /** Test helper: simulate one decoded broker→client frame arriving. */
  message(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  /** Test helper: simulate the server closing the connection. */
  serverClose(code: number, reason: string): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

async function flush(): Promise<void> {
  // Flush the microtask queue (the `onBeforeConnect` promise chain inside
  // `connect()`) without depending on real timers.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function sentFrames(ws: FakeWebSocket): Array<Record<string, unknown>> {
  return ws.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
}

function welcomeFrame(overrides: Record<string, unknown> = {}) {
  return {
    type: 'welcome',
    snapshot: { messages: [] as AnyMessage[], state: { isStreaming: false } },
    controller_id: null,
    pending_dialog: null,
    ...overrides,
  };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useAgentChat — wiring', () => {
  it('welcome seeds transcript + status:open, and requests control when not already controller', async () => {
    const { result } = renderHook(() => useAgentChat('node-1', { endpoint: (id) => `ws://test/${id}`, role: 'controller' }));
    await flush();

    expect(FakeWebSocket.instances).toHaveLength(1);
    const ws = FakeWebSocket.instances[0]!;
    expect(ws.url).toBe('ws://test/node-1');

    act(() => ws.open());
    expect(JSON.parse(ws.sent[0]!)).toMatchObject({ type: 'hello', role: 'controller' });

    const messages: AnyMessage[] = [{ role: 'user', content: 'hi', timestamp: 0 }];
    act(() => ws.message(welcomeFrame({ controller_id: 'someone-else', snapshot: { messages, state: { isStreaming: false } } })));

    expect(result.current.status).toBe('open');
    expect(result.current.transcript).toEqual(normalizeMessages(messages, null));
    expect(JSON.parse(ws.sent[1]!)).toEqual({ type: 'request_control' });
  });

  it('welcome.pending_dialog seeds dialog on first connect', async () => {
    const { result } = renderHook(() => useAgentChat('node-1', { endpoint: (id) => `ws://test/${id}` }));
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    act(() => ws.open());

    const dialog = { type: 'extension_ui_request', id: 'd1', method: 'confirm', title: 'Sure?', message: 'Continue?' };
    act(() => ws.message(welcomeFrame({ controller_id: 'me-or-whoever', pending_dialog: dialog })));

    expect(result.current.dialog).toEqual(dialog);
  });

  it('a transient close reconnects with a fresh welcome, reaching status:open again with no duplicated transcript', async () => {
    const { result } = renderHook(() => useAgentChat('node-1', { endpoint: (id) => `ws://test/${id}`, reconnect: { delayMs: 1000, maxAttempts: 5 } }));
    await flush();
    const ws1 = FakeWebSocket.instances[0]!;
    act(() => ws1.open());
    act(() => ws1.message(welcomeFrame({ controller_id: 'x', snapshot: { messages: [{ role: 'user', content: 'first', timestamp: 0 }], state: { isStreaming: false } } })));
    expect(result.current.status).toBe('open');
    expect(result.current.transcript).toHaveLength(1);

    act(() => ws1.serverClose(1011, 'no running broker for this node'));
    expect(result.current.status).toBe('reconnecting');
    expect(FakeWebSocket.instances).toHaveLength(1); // no new socket until the backoff timer fires

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(FakeWebSocket.instances).toHaveLength(2);
    const ws2 = FakeWebSocket.instances[1]!;
    act(() => ws2.open());
    act(() => ws2.message(welcomeFrame({ controller_id: 'x', snapshot: { messages: [{ role: 'user', content: 'after-reconnect', timestamp: 0 }], state: { isStreaming: false } } })));

    expect(result.current.status).toBe('open');
    expect(result.current.transcript).toHaveLength(1);
    expect(result.current.transcript[0]).toMatchObject({ text: 'after-reconnect' });
  });

  it('a fatal (1008) close goes to status:error-fatal and never schedules a reconnect', async () => {
    const { result } = renderHook(() => useAgentChat('node-1', { endpoint: (id) => `ws://test/${id}`, reconnect: { delayMs: 1000, maxAttempts: 5 } }));
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    act(() => ws.open());

    act(() => ws.serverClose(1008, 'malformed client id'));
    expect(result.current.status).toBe('error-fatal');

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(FakeWebSocket.instances).toHaveLength(1); // still just the one — no retry timer was ever armed
  });

  it('idle send() appends an optimistic pending user item and emits a prompt frame (§4 rule 4)', async () => {
    const { result } = renderHook(() => useAgentChat('node-1', { endpoint: (id) => `ws://test/${id}` }));
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    act(() => ws.open());
    const clientId = (JSON.parse(ws.sent[0]!) as { client_id: string }).client_id;
    act(() => ws.message(welcomeFrame({ controller_id: clientId })));
    expect(result.current.control).toBe('controller');

    act(() => result.current.actions.send('hello there'));

    expect(result.current.transcript.at(-1)).toMatchObject({ kind: 'user', text: 'hello there', pending: true });
    expect(sentFrames(ws)).toContainEqual({ type: 'prompt', text: 'hello there' });
  });

  it('busy queue-mode send appears immediately in queue and flushes as a prompt on agent_end', async () => {
    const { result } = renderHook(() => useAgentChat('node-1', { endpoint: (id) => `ws://test/${id}`, busySendMode: 'queue' }));
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    act(() => ws.open());
    const clientId = (JSON.parse(ws.sent[0]!) as { client_id: string }).client_id;
    act(() => ws.message(welcomeFrame({ controller_id: clientId })));
    act(() => ws.message({ type: 'agent_start' }));
    expect(result.current.activity.state).not.toBe('idle');

    act(() => result.current.actions.send('queued message'));

    expect(result.current.queue).toEqual(['queued message']);
    expect(sentFrames(ws).some((f) => f['type'] === 'prompt')).toBe(false);

    act(() => ws.message({ type: 'agent_end', messages: [] }));

    expect(result.current.queue).toEqual([]);
    expect(sentFrames(ws)).toContainEqual({ type: 'prompt', text: 'queued message' });
  });

  it('an optimistic pending item reconciles once the raw message count grows', async () => {
    const { result } = renderHook(() => useAgentChat('node-1', { endpoint: (id) => `ws://test/${id}` }));
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    act(() => ws.open());
    const clientId = (JSON.parse(ws.sent[0]!) as { client_id: string }).client_id;
    act(() => ws.message(welcomeFrame({ controller_id: clientId })));

    act(() => result.current.actions.send('hi'));
    expect(result.current.transcript.at(-1)).toMatchObject({ pending: true });

    act(() => ws.message({ type: 'message_start', message: { role: 'user', content: 'hi', timestamp: 0 } }));

    expect(result.current.transcript.some((i) => i.kind === 'user' && 'pending' in i && i.pending)).toBe(false);
  });

  it('steer-mode busy send emits a steer frame, not a queue entry', async () => {
    const { result } = renderHook(() => useAgentChat('node-1', { endpoint: (id) => `ws://test/${id}`, busySendMode: 'steer' }));
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    act(() => ws.open());
    const clientId = (JSON.parse(ws.sent[0]!) as { client_id: string }).client_id;
    act(() => ws.message(welcomeFrame({ controller_id: clientId })));
    act(() => ws.message({ type: 'agent_start' }));

    act(() => result.current.actions.send('interject!'));

    expect(result.current.queue).toEqual([]);
    expect(sentFrames(ws)).toContainEqual({ type: 'steer', text: 'interject!' });
  });

  it('onBeforeConnect is awaited before EVERY WS open — initial connect AND each reconnect (§9/§17 AC#9)', async () => {
    let current = deferred<void>();
    const onBeforeConnect = vi.fn((_nodeId: string) => current.promise);

    renderHook(() => useAgentChat('node-1', { endpoint: (id) => `ws://test/${id}`, onBeforeConnect, reconnect: { delayMs: 1000, maxAttempts: 5 } }));
    await flush();

    // No WebSocket is constructed until the (initial) onBeforeConnect resolves.
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(onBeforeConnect).toHaveBeenCalledTimes(1);
    expect(onBeforeConnect).toHaveBeenNthCalledWith(1, 'node-1');

    current.resolve();
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(1);

    const ws1 = FakeWebSocket.instances[0]!;
    act(() => ws1.open());
    act(() => ws1.message(welcomeFrame({ controller_id: 'x' })));

    // A transient close triggers a reconnect. Re-arm a fresh unresolved deferred
    // BEFORE the backoff timer fires, so we can prove the second WS does NOT
    // open until this second onBeforeConnect call resolves.
    current = deferred<void>();
    act(() => ws1.serverClose(1011, 'no running broker for this node'));

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    // The backoff timer fired and re-ran onBeforeConnect, but it has not
    // resolved yet — no second socket yet.
    expect(onBeforeConnect).toHaveBeenCalledTimes(2);
    expect(onBeforeConnect).toHaveBeenNthCalledWith(2, 'node-1');
    expect(FakeWebSocket.instances).toHaveLength(1);

    current.resolve();
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('an observer\'s answerDialog/cancelDialog send no frame (extension_ui_response is controller-gated, §3)', async () => {
    const { result } = renderHook(() => useAgentChat('node-1', { endpoint: (id) => `ws://test/${id}` }));
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    act(() => ws.open());

    const dialog = { type: 'extension_ui_request', id: 'd1', method: 'confirm', title: 'Sure?', message: 'Continue?' };
    // controller_id !== this client's own id → this mount is an OBSERVER.
    act(() => ws.message(welcomeFrame({ controller_id: 'someone-else', pending_dialog: dialog })));
    expect(result.current.control).toBe('observer');
    expect(result.current.dialog).toEqual(dialog);

    const sentBefore = ws.sent.length;
    act(() => result.current.actions.answerDialog({ id: 'd1', confirmed: true }));
    expect(ws.sent).toHaveLength(sentBefore); // no extension_ui_response sent
    expect(result.current.dialog).toBeNull(); // stale local dialog state still clears

    // Re-seed a dialog to test cancelDialog the same way.
    act(() => ws.message({ type: 'extension_ui_request', id: 'd2', method: 'confirm', title: 'Sure?', message: 'Continue?' }));
    expect(result.current.dialog).not.toBeNull();
    const sentBeforeCancel = ws.sent.length;
    act(() => result.current.actions.cancelDialog());
    expect(ws.sent).toHaveLength(sentBeforeCancel);
    expect(result.current.dialog).toBeNull();
  });

  it('onDialog returning true suppresses the built-in dialog surface, but respond still sends the correct frame (spec §9)', async () => {
    const onDialog = vi.fn((_request: unknown, respond: (r: { id: string; confirmed: boolean }) => void) => {
      respond({ id: 'd1', confirmed: true });
      return true;
    });
    const { result } = renderHook(() => useAgentChat('node-1', { endpoint: (id) => `ws://test/${id}`, onDialog: onDialog as never }));
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    act(() => ws.open());
    const clientId = (JSON.parse(ws.sent[0]!) as { client_id: string }).client_id;
    act(() => ws.message(welcomeFrame({ controller_id: clientId })));

    act(() => ws.message({ type: 'extension_ui_request', id: 'd1', method: 'confirm', title: 'Sure?', message: 'Continue?' }));

    expect(onDialog).toHaveBeenCalledTimes(1);
    expect(onDialog).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }), expect.any(Function));
    // suppressed: the built-in view-model surface stays null/hidden…
    expect(result.current.dialog).toBeNull();
    // …while `respond` (called synchronously inside onDialog above) still sent
    // the correct extension_ui_response frame.
    expect(sentFrames(ws)).toContainEqual({ type: 'extension_ui_response', id: 'd1', confirmed: true });
  });

  it('a NEW dialog id supersedes and is shown again even while an earlier id stays suppressed', async () => {
    const onDialog = vi.fn((request: { id: string }) => request.id === 'd1');
    const { result } = renderHook(() => useAgentChat('node-1', { endpoint: (id) => `ws://test/${id}`, onDialog: onDialog as never }));
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    act(() => ws.open());
    const clientId = (JSON.parse(ws.sent[0]!) as { client_id: string }).client_id;
    act(() => ws.message(welcomeFrame({ controller_id: clientId })));

    act(() => ws.message({ type: 'extension_ui_request', id: 'd1', method: 'confirm', title: 'Sure?', message: 'Continue?' }));
    expect(result.current.dialog).toBeNull();

    act(() => ws.message({ type: 'extension_ui_request', id: 'd2', method: 'confirm', title: 'Sure?', message: 'Continue?' }));
    expect(result.current.dialog).toEqual({ type: 'extension_ui_request', id: 'd2', method: 'confirm', title: 'Sure?', message: 'Continue?' });
  });
});
