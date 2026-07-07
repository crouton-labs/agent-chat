// queue.ts — the queue/steer/abort state machine (spec §9/§17 AC #7). Pure
// functions; `useAgentChat` owns the `queue: string[]` array and calls these.

export type BusySendMode = 'queue' | 'steer';

export type SendRoute = { kind: 'prompt'; text: string } | { kind: 'steer'; text: string } | { kind: 'enqueue'; text: string };

/** A plain `send()` while idle always starts a fresh turn (`prompt`); while busy
 *  it enqueues (default) or steers the live turn, per `busySendMode`. The
 *  explicit `steer()` action always interjects regardless of mode — that's a
 *  distinct caller-invoked route, not modeled here. */
export function routeSend(text: string, isStreaming: boolean, busySendMode: BusySendMode): SendRoute {
  if (!isStreaming) return { kind: 'prompt', text };
  return busySendMode === 'steer' ? { kind: 'steer', text } : { kind: 'enqueue', text };
}

/** On `agent_end`, flush the NEXT queued message (FIFO) as a fresh `prompt` —
 *  one at a time, since each `prompt` starts its own turn and the next flush
 *  waits for that turn's own `agent_end`. Returns `toSend: undefined` when the
 *  queue is empty (nothing to flush). */
export function flushQueueOnAgentEnd(queue: readonly string[]): { toSend: string | undefined; queue: readonly string[] } {
  if (queue.length === 0) return { toSend: undefined, queue };
  const [next, ...rest] = queue;
  return { toSend: next, queue: rest };
}

/** Remove one queued message by index (a chip's remove button). Out-of-range
 *  indexes are a no-op (returns the same array reference). */
export function cancelQueued(queue: readonly string[], index: number): readonly string[] {
  if (index < 0 || index >= queue.length) return queue;
  return queue.filter((_, i) => i !== index);
}
