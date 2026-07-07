// broker-client.ts — a thin, framework-free WS client for one node's broker.
// Construct, `connect()`, receive frames via handlers, `send()` client frames,
// `close()` to detach. Not an EventEmitter — handlers are passed in. Single-use
// per connect; `useAgentChat` owns reconnect policy (spec §9).

import { classifyClose, type CloseKind } from './close-classifier.js';
import type { BrokerToClient, ClientToBroker } from './protocol.js';

export type { CloseKind } from './close-classifier.js';

export interface BrokerClientHandlers {
  /** WS open — the socket is up; the broker's `welcome` frame follows. */
  onOpen?: () => void;
  /** One decoded broker→client frame. */
  onFrame?: (frame: BrokerToClient) => void;
  /** The socket closed. `kind` classifies why (spec §7). */
  onClose?: (kind: CloseKind, reason: string) => void;
}

export class BrokerClient {
  private ws: WebSocket | undefined;
  private closedReported = false;

  constructor(
    private readonly url: string,
    private readonly handlers: BrokerClientHandlers,
  ) {}

  connect(): void {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      // A malformed URL is the only synchronous throw; treat as a transient
      // close so the caller's reconnect policy decides.
      this.reportClose('transient', `failed to open ws: ${String(err)}`);
      return;
    }
    this.ws = ws;
    ws.onopen = () => this.handlers.onOpen?.();
    ws.onmessage = (ev: MessageEvent) => this.onMessage(ev);
    ws.onclose = (ev: CloseEvent) => {
      const kind = classifyClose(ev.code, ev.reason);
      this.reportClose(kind, ev.reason || `closed (${ev.code})`);
    };
    // An error is always followed by a close — let the close path report; this
    // handler just prevents an unhandled error from surfacing.
    ws.onerror = () => {};
  }

  private onMessage(ev: MessageEvent): void {
    // One complete JSON frame per WS message — no FrameDecoder needed, the
    // WebSocket transport preserves message boundaries. Guard a non-string
    // payload (a Blob on an older browser) by ignoring it.
    if (typeof ev.data !== 'string') return;
    let frame: BrokerToClient;
    try {
      frame = JSON.parse(ev.data) as BrokerToClient;
    } catch {
      // A malformed frame must never crash the client — drop it (parity with
      // the broker's own bad-JSON drop).
      return;
    }
    this.handlers.onFrame?.(frame);
  }

  /** Encode + send one client→broker frame. No-op if the socket isn't open. */
  send(frame: ClientToBroker): void {
    const ws = this.ws;
    if (ws === undefined || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      /* dead socket — onclose will drive teardown */
    }
  }

  /** Detach: close the socket. `onClose` fires once via the close path. */
  close(): void {
    const ws = this.ws;
    if (ws !== undefined && ws.readyState <= WebSocket.OPEN) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }

  private reportClose(kind: CloseKind, reason: string): void {
    if (this.closedReported) return;
    this.closedReported = true;
    this.ws = undefined;
    this.handlers.onClose?.(kind, reason);
  }
}
