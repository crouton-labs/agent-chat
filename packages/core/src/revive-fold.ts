// revive-fold.ts — the pure fold over `/v1/exec`'s NDJSON frame stream that a
// Hearth `revive` server function (§5/§14, built outside this package) must
// speak. Exported from core so that implementation imports the algorithm
// instead of re-deriving it (spec: "Export it from core ... so the later
// template revive server fn imports it rather than re-deriving").
//
// Verified frame contract (`vm-agent/src/exec.ts`): `stdout`/`stderr` data may
// arrive split mid-token across multiple frames — concatenate `data` in
// arrival order, never `JSON.parse` a single frame in isolation. `heartbeat` is
// an idle keepalive — ignore. `exit`/`error` are terminal. Resolve only when
// the concatenated stdout parses to JSON with `ready === true`.

export type ReviveExecFrame =
  | { type: 'stdout'; data: string }
  | { type: 'stderr'; data: string }
  | { type: 'heartbeat' }
  | { type: 'exit'; code: number }
  | { type: 'error'; message: string };

/** Any parsed `/v1/exec` NDJSON line. Real frames are `ReviveExecFrame`; a
 *  forward-compatible caller must also tolerate a `type` this fold doesn't
 *  recognize yet (spec §5 — additive to the contract) without throwing or
 *  stalling the fold. */
export type UnknownReviveExecFrame = { type: string } & Record<string, unknown>;

const KNOWN_REVIVE_FRAME_TYPES = new Set(['stdout', 'stderr', 'heartbeat', 'exit', 'error']);

export interface ReviveResult {
  window: unknown;
  session: unknown;
  resumed: unknown;
  ready: true;
}

export type ReviveOutcome = { ok: true; result: ReviveResult } | { ok: false; error: string };

export interface ReviveFoldState {
  stdout: string;
  stderr: string;
}

export function initReviveFold(): ReviveFoldState {
  return { stdout: '', stderr: '' };
}

export type ReviveFoldStep = { done: false; state: ReviveFoldState } | { done: true; state: ReviveFoldState; outcome: ReviveOutcome };

function withStderr(message: string, stderr: string): string {
  return stderr.trim() === '' ? message : `${message}: ${stderr.trim()}`;
}

/** Fold ONE frame into the running state — the incremental step a real NDJSON
 *  stream consumer calls per parsed line. Terminal frames (`exit`/`error`)
 *  produce `done:true` with the final `ReviveOutcome`; every other frame
 *  produces `done:false` with the updated accumulator. */
export function foldReviveFrame(state: ReviveFoldState, frame: ReviveExecFrame | UnknownReviveExecFrame): ReviveFoldStep {
  if (!KNOWN_REVIVE_FRAME_TYPES.has(frame.type)) {
    // Unrecognized `/v1/exec` frame type — ignore it (spec §5: "forward-compatible
    // callers skip unknown types"), never crash the streaming caller.
    return { done: false, state };
  }
  return foldKnownFrame(state, frame as ReviveExecFrame);
}

function foldKnownFrame(state: ReviveFoldState, frame: ReviveExecFrame): ReviveFoldStep {
  switch (frame.type) {
    case 'stdout':
      return { done: false, state: { ...state, stdout: state.stdout + frame.data } };

    case 'stderr':
      return { done: false, state: { ...state, stderr: state.stderr + frame.data } };

    case 'heartbeat':
      return { done: false, state };

    case 'exit': {
      if (frame.code !== 0) {
        return { done: true, state, outcome: { ok: false, error: withStderr(`revive exited with code ${frame.code}`, state.stderr) } };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(state.stdout);
      } catch (err) {
        return { done: true, state, outcome: { ok: false, error: `revive produced invalid JSON: ${err instanceof Error ? err.message : String(err)}` } };
      }
      const result = parsed as Partial<ReviveResult> | null;
      if (result === null || typeof result !== 'object' || result.ready !== true) {
        return { done: true, state, outcome: { ok: false, error: 'revive result not ready (ready !== true)' } };
      }
      return { done: true, state, outcome: { ok: true, result: result as ReviveResult } };
    }

    case 'error':
      return { done: true, state, outcome: { ok: false, error: withStderr(frame.message, state.stderr) } };
  }
}

/** Fold a full, already-collected frame sequence (test convenience; a real
 *  streaming caller uses `foldReviveFrame` incrementally as lines arrive). */
export function foldReviveFrames(frames: readonly (ReviveExecFrame | UnknownReviveExecFrame)[]): ReviveOutcome {
  let state = initReviveFold();
  for (const frame of frames) {
    const step = foldReviveFrame(state, frame);
    state = step.state;
    if (step.done) return step.outcome;
  }
  return { ok: false, error: 'stream ended without a terminal frame' };
}
