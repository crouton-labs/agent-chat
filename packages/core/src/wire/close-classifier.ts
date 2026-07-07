// close-classifier.ts — the WS close-code/reason → CloseKind table, mirroring
// crtr's OWN web client (`web-client/broker-client.ts`), NOT the (bugged)
// `home-ui` copy that misclassified a gone node as retryable (spec §7).

export type CloseKind = 'fatal-invalid' | 'fatal-gone' | 'transient' | 'normal';

const NO_NODE_RE = /^no node/i;
const NO_RUNNING_BROKER_RE = /^no running broker/i;

/** Classify a WebSocket close per the fixed §7 table:
 *  - `1008` (any reason)                    → `fatal-invalid` (malformed id — app must fix it)
 *  - `1011` + reason `/^no node/i`           → `fatal-gone` (unknown/terminal node — no auto-retry)
 *  - `1011` + reason `/^no running broker/i` → `transient` (revivable — re-run `onBeforeConnect`)
 *  - `1011` (other), `1009`, network drop    → `transient`
 *  - `1000`                                  → `normal` (clean close, no auto-retry)
 */
export function classifyClose(code: number, reason: string): CloseKind {
  if (code === 1008) return 'fatal-invalid';
  if (code === 1011 && NO_NODE_RE.test(reason)) return 'fatal-gone';
  if (code === 1011 && NO_RUNNING_BROKER_RE.test(reason)) return 'transient';
  if (code === 1000) return 'normal';
  return 'transient';
}
