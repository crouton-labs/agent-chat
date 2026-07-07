// queue.test.ts — spec §9/§17 AC#7 queue/steer/abort state machine.

import { describe, expect, it } from 'vitest';
import { cancelQueued, flushQueueOnAgentEnd, routeSend } from '../queue.js';

describe('routeSend', () => {
  it('while idle, always starts a fresh turn regardless of busySendMode', () => {
    expect(routeSend('hi', false, 'queue')).toEqual({ kind: 'prompt', text: 'hi' });
    expect(routeSend('hi', false, 'steer')).toEqual({ kind: 'prompt', text: 'hi' });
  });

  it('while busy in "queue" mode, enqueues', () => {
    expect(routeSend('hi', true, 'queue')).toEqual({ kind: 'enqueue', text: 'hi' });
  });

  it('while busy in "steer" mode, interjects into the live turn', () => {
    expect(routeSend('hi', true, 'steer')).toEqual({ kind: 'steer', text: 'hi' });
  });
});

describe('flushQueueOnAgentEnd', () => {
  it('flushes the next queued message FIFO, one at a time', () => {
    const { toSend, queue } = flushQueueOnAgentEnd(['a', 'b', 'c']);
    expect(toSend).toBe('a');
    expect(queue).toEqual(['b', 'c']);
  });

  it('an empty queue flushes nothing', () => {
    const { toSend, queue } = flushQueueOnAgentEnd([]);
    expect(toSend).toBeUndefined();
    expect(queue).toEqual([]);
  });
});

describe('cancelQueued', () => {
  it('removes the item at the given index', () => {
    expect(cancelQueued(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
  });

  it('an out-of-range index (too high) is a no-op, returning the same reference', () => {
    const queue = ['a', 'b'];
    expect(cancelQueued(queue, 5)).toBe(queue);
  });

  it('a negative index is a no-op, returning the same reference', () => {
    const queue = ['a', 'b'];
    expect(cancelQueued(queue, -1)).toBe(queue);
  });
});
