// transcript.test.ts — spec §3 streaming invariant + reconnect reseed.

import { describe, expect, it } from 'vitest';
import { applySnapshot, initialConvState, reduce } from '../transcript.js';
import type { AnyMessage, BrokerSnapshot } from '../wire/protocol.js';

function snapshot(messages: AnyMessage[], isStreaming = false): BrokerSnapshot {
  return { messages, state: { isStreaming } };
}

describe('applySnapshot', () => {
  it('seeds messages, clears streamingIndex, and carries isStreaming from the snapshot', () => {
    const state = applySnapshot(snapshot([{ role: 'user', content: 'hi', timestamp: 0 }], true));
    expect(state.messages).toHaveLength(1);
    expect(state.streamingIndex).toBeNull();
    expect(state.isStreaming).toBe(true);
  });

  it('reconnect: applying a fresh snapshot re-seeds wholesale with no dup of prior history', () => {
    const first = applySnapshot(snapshot([{ role: 'user', content: 'a', timestamp: 0 }]));
    const second = applySnapshot(snapshot([{ role: 'user', content: 'a', timestamp: 0 }, { role: 'user', content: 'b', timestamp: 1 }]));
    expect(first.messages).toHaveLength(1);
    expect(second.messages).toHaveLength(2);
    expect(second.messages).not.toBe(first.messages);
  });
});

describe('reduce', () => {
  it('agent_start sets isStreaming true', () => {
    const state = reduce(initialConvState(), { type: 'agent_start' });
    expect(state.isStreaming).toBe(true);
  });

  it('agent_end clears isStreaming and streamingIndex', () => {
    const streaming = { ...initialConvState(), isStreaming: true, streamingIndex: 0 };
    const state = reduce(streaming, { type: 'agent_end', messages: [] });
    expect(state.isStreaming).toBe(false);
    expect(state.streamingIndex).toBeNull();
  });

  it('message_start of an assistant message sets streamingIndex to its new index', () => {
    const message: AnyMessage = { role: 'assistant', timestamp: 0, content: [] };
    const state = reduce(initialConvState(), { type: 'message_start', message });
    expect(state.messages).toEqual([message]);
    expect(state.streamingIndex).toBe(0);
  });

  it('message_start of a non-assistant message leaves streamingIndex untouched', () => {
    const message: AnyMessage = { role: 'user', content: 'hi', timestamp: 0 };
    const state = reduce(initialConvState(), { type: 'message_start', message });
    expect(state.streamingIndex).toBeNull();
  });

  it('message_update REPLACES the streaming message wholesale — same index, no duplication', () => {
    const first: AnyMessage = { role: 'assistant', timestamp: 0, content: [{ type: 'text', text: 'partial' }] };
    let state = reduce(initialConvState(), { type: 'message_start', message: first });
    const second: AnyMessage = { role: 'assistant', timestamp: 0, content: [{ type: 'text', text: 'partial and more' }] };
    state = reduce(state, { type: 'message_update', message: second });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toBe(second);
    expect(state.streamingIndex).toBe(0);
  });

  it('mid-stream attach: a message_update with no prior message_start adopts the last message when it is the assistant', () => {
    const seeded = applySnapshot(snapshot([{ role: 'user', content: 'hi', timestamp: 0 }, { role: 'assistant', timestamp: 0, content: [{ type: 'text', text: 'partial' }] }], true));
    expect(seeded.streamingIndex).toBeNull(); // applySnapshot never guesses a streamingIndex
    const updated: AnyMessage = { role: 'assistant', timestamp: 0, content: [{ type: 'text', text: 'partial more' }] };
    const state = reduce(seeded, { type: 'message_update', message: updated });
    expect(state.streamingIndex).toBe(1);
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]).toBe(updated);
  });

  it('a message_update with no streamingIndex and a non-assistant last message is a no-op', () => {
    const seeded = applySnapshot(snapshot([{ role: 'user', content: 'hi', timestamp: 0 }]));
    const state = reduce(seeded, { type: 'message_update', message: { role: 'assistant', timestamp: 0, content: [] } });
    expect(state).toBe(seeded);
  });

  it('message_end replaces the streaming message and clears streamingIndex', () => {
    const first: AnyMessage = { role: 'assistant', timestamp: 0, content: [{ type: 'text', text: 'partial' }] };
    let state = reduce(initialConvState(), { type: 'message_start', message: first });
    const final: AnyMessage = { role: 'assistant', timestamp: 0, content: [{ type: 'text', text: 'final answer' }] };
    state = reduce(state, { type: 'message_end', message: final });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toBe(final);
    expect(state.streamingIndex).toBeNull();
  });

  it('message_end with no streamingIndex is a no-op', () => {
    const state = reduce(initialConvState(), { type: 'message_end', message: { role: 'assistant', timestamp: 0, content: [] } });
    expect(state).toEqual(initialConvState());
  });
});
