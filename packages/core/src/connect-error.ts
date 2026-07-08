// connect-error.ts — a typed, terminal signal for `onBeforeConnect` (spec §5/§7).
// `classifyClose` (wire/close-classifier.ts) classifies WS CLOSE codes into
// `fatal-invalid`/`fatal-gone`/`transient`/`normal`; it has no say over a
// REJECTED (or synchronously thrown) `onBeforeConnect` promise (e.g. a
// `revive` server fn that already knows the nodeId is malformed, or that crtr
// reported the node unrevivable/gone). An app's `onBeforeConnect` throws
// `FatalConnectError` for a terminal outcome it has already determined;
// `useAgentChat` maps that straight to `status:'error-fatal'` with no
// reconnect attempt, same as a fatal WS close. Every OTHER thrown/rejected
// value keeps the existing transient-retry behavior unchanged.

/** Reuses the two fatal members of `CloseKind` (wire/close-classifier.ts) so a
 *  consumer handling "why did we go `error-fatal`" has ONE small kind space to
 *  match against, regardless of whether the fatal signal came from a WS close
 *  code or a rejected `onBeforeConnect`. */
export type ConnectErrorKind = 'fatal-invalid' | 'fatal-gone';

/** Thrown (or returned as a rejected promise) by an `onBeforeConnect`
 *  implementation to signal a TERMINAL preconnect failure — never retried.
 *  `kind` is `'fatal-invalid'` for a malformed/unusable nodeId (no network
 *  attempt was ever warranted) and `'fatal-gone'` for a well-formed nodeId
 *  that crtr has confirmed does not exist / cannot be revived. Any OTHER
 *  thrown value (a plain `Error`, a network timeout, a transient revive
 *  failure) keeps the existing transient-retry behavior unchanged. */
export class FatalConnectError extends Error {
  readonly kind: ConnectErrorKind;

  constructor(kind: ConnectErrorKind, message: string) {
    super(message);
    this.name = 'FatalConnectError';
    this.kind = kind;
  }
}

/** Structural check — deliberately NOT `instanceof FatalConnectError`. A
 *  yalc-linked / duplicate-installed / bundled copy of this package, or a
 *  value that crossed a serialization boundary (an RPC/server-function
 *  response, a structured-clone), produces an object with the right SHAPE but
 *  a different constructor identity; `instanceof` would silently misclassify
 *  a genuine fatal preconnect signal as an ordinary thrown value and let it
 *  retry forever. Accepts any object with a fatal `kind` and a string
 *  `message` — `name`, if present, must also match. */
export function isFatalConnectError(err: unknown): err is FatalConnectError {
  if (typeof err !== 'object' || err === null) return false;
  const candidate = err as { kind?: unknown; message?: unknown; name?: unknown };
  if (candidate.kind !== 'fatal-invalid' && candidate.kind !== 'fatal-gone') return false;
  if (typeof candidate.message !== 'string') return false;
  if (candidate.name !== undefined && candidate.name !== 'FatalConnectError') return false;
  return true;
}
