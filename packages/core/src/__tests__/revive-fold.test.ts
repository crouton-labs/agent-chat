// revive-fold.test.ts — the exact 4 AC#2a fixtures, plus the incremental vs.
// batch-fold equivalence check.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { foldReviveFrame, foldReviveFrames, initReviveFold, type ReviveExecFrame } from '../revive-fold.js';

describe('foldReviveFrames — AC#2a fixtures', () => {
  it('(a) stdout split mid-token + heartbeat interleaved + exit:0 + ready:true resolves with the parsed result', () => {
    const frames: ReviveExecFrame[] = [
      { type: 'stdout', data: '{"win' },
      { type: 'heartbeat' },
      { type: 'stdout', data: 'dow":1,"session":2,"resu' },
      { type: 'heartbeat' },
      { type: 'stdout', data: 'med":3,"ready":true}' },
      { type: 'exit', code: 0 },
    ];
    const outcome = foldReviveFrames(frames);
    expect(outcome).toEqual({ ok: true, result: { window: 1, session: 2, resumed: 3, ready: true } });
  });

  it('(b) a non-zero exit code rejects WITHOUT ever attempting to JSON.parse stdout, but preserves the raw stdout text', () => {
    // stdout is deliberately invalid JSON — if the implementation accidentally
    // tried to parse-then-ignore before checking the exit code, this fixture
    // would surface a "invalid JSON" error instead of the exit-code error.
    const frames: ReviveExecFrame[] = [{ type: 'stdout', data: 'not even close to json{' }, { type: 'exit', code: 2 }];
    const outcome = foldReviveFrames(frames);
    expect(outcome).toEqual({ ok: false, error: 'revive exited with code 2', stdout: 'not even close to json{' });
  });

  it('(b) the success JSON.parse path is provably unreachable for a non-zero exit — spies on the global JSON.parse', () => {
    // A weaker fixture (invalid-JSON stdout + a non-zero exit-code assertion)
    // would ALSO pass an implementation that calls JSON.parse, swallows the
    // SyntaxError, and then separately returns the exit-code error — masking a
    // real bug where the success path still runs. Spy on JSON.parse itself and
    // assert it is never invoked when the terminal frame is a non-zero exit,
    // even though the (unparsed) stdout is still carried on the outcome.
    const parseSpy = vi.spyOn(JSON, 'parse');
    const frames: ReviveExecFrame[] = [
      { type: 'stdout', data: '{"window":1,"session":2,"resumed":3,"ready":true}' },
      { type: 'exit', code: 7 },
    ];
    const outcome = foldReviveFrames(frames);
    expect(outcome).toEqual({ ok: false, error: 'revive exited with code 7', stdout: '{"window":1,"session":2,"resumed":3,"ready":true}' });
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it('(b) a non-zero exit with no stdout at all omits the `stdout` field rather than carrying an empty string', () => {
    const frames: ReviveExecFrame[] = [{ type: 'exit', code: 1 }];
    const outcome = foldReviveFrames(frames);
    expect(outcome).toEqual({ ok: false, error: 'revive exited with code 1' });
    expect(outcome).not.toHaveProperty('stdout');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(b, with stderr) a non-zero exit appends accumulated stderr to the error', () => {
    const frames: ReviveExecFrame[] = [
      { type: 'stderr', data: 'permission denied' },
      { type: 'exit', code: 1 },
    ];
    const outcome = foldReviveFrames(frames);
    expect(outcome).toEqual({ ok: false, error: 'revive exited with code 1: permission denied' });
  });

  it('(c) a terminal error frame with no exit rejects, surfacing the message and accumulated stderr', () => {
    const frames: ReviveExecFrame[] = [
      { type: 'stderr', data: 'boom output' },
      { type: 'error', message: 'spawn failed' },
    ];
    const outcome = foldReviveFrames(frames);
    expect(outcome).toEqual({ ok: false, error: 'spawn failed: boom output' });
  });

  it('(c, no stderr) a terminal error frame with no accumulated stderr surfaces just the message', () => {
    const outcome = foldReviveFrames([{ type: 'error', message: 'spawn failed' }]);
    expect(outcome).toEqual({ ok: false, error: 'spawn failed' });
  });

  it('(d) valid JSON with ready:false + exit:0 rejects', () => {
    const frames: ReviveExecFrame[] = [{ type: 'stdout', data: '{"window":1,"session":2,"resumed":3,"ready":false}' }, { type: 'exit', code: 0 }];
    const outcome = foldReviveFrames(frames);
    expect(outcome).toEqual({ ok: false, error: 'revive result not ready (ready !== true)' });
  });

  it('a stream that ends without a terminal frame is a fold-convenience error', () => {
    const outcome = foldReviveFrames([{ type: 'stdout', data: '{}' }]);
    expect(outcome).toEqual({ ok: false, error: 'stream ended without a terminal frame' });
  });

  it('an unknown/unrecognized frame type interleaved into an otherwise-successful stream is ignored, and the stream still resolves (spec §5)', () => {
    const frames = [
      { type: 'stdout', data: '{"win' },
      { type: 'some_future_frame_type', anything: 'goes here' },
      { type: 'stdout', data: 'dow":1,"session":2,"resu' },
      { type: 'progress', percent: 42 },
      { type: 'stdout', data: 'med":3,"ready":true}' },
      { type: 'exit', code: 0 },
    ];
    const outcome = foldReviveFrames(frames);
    expect(outcome).toEqual({ ok: true, result: { window: 1, session: 2, resumed: 3, ready: true } });
  });

  it('foldReviveFrame steps an unknown frame type as done:false with the state untouched', () => {
    const state = initReviveFold();
    const step = foldReviveFrame(state, { type: 'some_future_frame_type', anything: 'goes here' });
    expect(step).toEqual({ done: false, state });
  });
});

describe('foldReviveFrame — incremental stepping matches foldReviveFrames on the same fixture', () => {
  it('fixture (a): stepping one frame at a time yields done:false until the terminal frame, matching the batch outcome', () => {
    const frames: ReviveExecFrame[] = [
      { type: 'stdout', data: '{"win' },
      { type: 'heartbeat' },
      { type: 'stdout', data: 'dow":1,"session":2,"resu' },
      { type: 'stdout', data: 'med":3,"ready":true}' },
      { type: 'exit', code: 0 },
    ];
    let state = initReviveFold();
    let lastStep;
    for (let i = 0; i < frames.length; i++) {
      const step = foldReviveFrame(state, frames[i]!);
      state = step.state;
      lastStep = step;
      if (i < frames.length - 1) expect(step.done).toBe(false);
    }
    expect(lastStep!.done).toBe(true);
    expect(lastStep).toMatchObject({ done: true, outcome: { ok: true, result: { window: 1, session: 2, resumed: 3, ready: true } } });
    expect(foldReviveFrames(frames)).toEqual((lastStep as { outcome: unknown }).outcome);
  });

  it('fixture (b): incremental stepping on a non-zero exit matches the batch outcome', () => {
    const frames: ReviveExecFrame[] = [{ type: 'stdout', data: 'garbage' }, { type: 'exit', code: 2 }];
    let state = initReviveFold();
    let lastStep;
    for (const frame of frames) {
      const step = foldReviveFrame(state, frame);
      state = step.state;
      lastStep = step;
    }
    expect(lastStep).toMatchObject({ done: true, outcome: { ok: false, error: 'revive exited with code 2' } });
    expect(foldReviveFrames(frames)).toEqual((lastStep as { outcome: unknown }).outcome);
  });
});
