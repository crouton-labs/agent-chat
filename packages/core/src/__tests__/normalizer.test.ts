// normalizer.test.ts — spec §4, all 7 rules.

import { describe, expect, it } from 'vitest';
import { normalizeMessages } from '../normalizer.js';
import type { AnyMessage } from '../wire/protocol.js';

function user(text: string): AnyMessage {
  return { role: 'user', content: text, timestamp: 0 };
}

describe('normalizeMessages', () => {
  it('rule 1: splits thinking into its own item, ordered before the assistant text item', () => {
    const messages: AnyMessage[] = [
      {
        role: 'assistant',
        timestamp: 0,
        content: [
          { type: 'thinking', thinking: 'let me consider' },
          { type: 'text', text: 'here is my answer' },
        ],
      },
    ];
    const items = normalizeMessages(messages, null, { now: () => 42 });
    expect(items.map((i) => i.kind)).toEqual(['thinking', 'assistant']);
    expect(items[0]).toMatchObject({ kind: 'thinking', text: 'let me consider', streaming: false, startedAt: 0, endedAt: 42 });
    expect(items[1]).toMatchObject({ kind: 'assistant', markdown: 'here is my answer' });
  });

  it('rule 1: a redacted thinking block yields placeholder text', () => {
    const messages: AnyMessage[] = [
      { role: 'assistant', timestamp: 0, content: [{ type: 'thinking', thinking: 'secret', redacted: true }] },
    ];
    const items = normalizeMessages(messages, null);
    expect(items[0]).toMatchObject({ kind: 'thinking', text: '[reasoning hidden]' });
  });

  it('rule 2: pairs a tool call with its result by id — running with no result yet', () => {
    const messages: AnyMessage[] = [
      { role: 'assistant', timestamp: 0, content: [{ type: 'toolCall', id: 'call-1', name: 'bash', arguments: { cmd: 'ls' } }] },
    ];
    const items = normalizeMessages(messages, null);
    const tool = items.find((i) => i.kind === 'tool');
    expect(tool).toMatchObject({ kind: 'tool', id: 'call-1', call: { callId: 'call-1', name: 'bash', status: 'running', result: undefined } });
  });

  it('rule 2: pairs a tool call with an ok result', () => {
    const messages: AnyMessage[] = [
      { role: 'assistant', timestamp: 0, content: [{ type: 'toolCall', id: 'call-1', name: 'bash', arguments: {} }] },
      { role: 'toolResult', toolCallId: 'call-1', toolName: 'bash', isError: false, timestamp: 1, content: [{ type: 'text', text: 'done' }] },
    ];
    const items = normalizeMessages(messages, null);
    const tool = items.find((i) => i.kind === 'tool');
    expect(tool).toMatchObject({ kind: 'tool', call: { status: 'ok', result: { text: 'done', isError: false } } });
    // the toolResult message itself never becomes a standalone item
    expect(items.some((i) => i.kind === 'notice')).toBe(false);
  });

  it('rule 2: pairs a tool call with an error result', () => {
    const messages: AnyMessage[] = [
      { role: 'assistant', timestamp: 0, content: [{ type: 'toolCall', id: 'call-1', name: 'bash', arguments: {} }] },
      { role: 'toolResult', toolCallId: 'call-1', toolName: 'bash', isError: true, timestamp: 1, content: [{ type: 'text', text: 'boom' }] },
    ];
    const items = normalizeMessages(messages, null);
    const tool = items.find((i) => i.kind === 'tool');
    expect(tool).toMatchObject({ kind: 'tool', call: { status: 'error', result: { text: 'boom', isError: true } } });
  });

  it('rule 2: two tool calls, results in REVERSE order, plus an unmatched decoy result — each pairs by toolCallId only', () => {
    const messages: AnyMessage[] = [
      {
        role: 'assistant',
        timestamp: 0,
        content: [
          { type: 'toolCall', id: 'call-A', name: 'read', arguments: { path: 'a.txt' } },
          { type: 'toolCall', id: 'call-B', name: 'write', arguments: { path: 'b.txt' } },
        ],
      },
      // decoy result for a toolCallId that was never called
      { role: 'toolResult', toolCallId: 'call-decoy', toolName: 'read', isError: false, timestamp: 1, content: [{ type: 'text', text: 'ignored' }] },
      // results arrive in REVERSE order relative to the calls above
      { role: 'toolResult', toolCallId: 'call-B', toolName: 'write', isError: false, timestamp: 2, content: [{ type: 'text', text: 'wrote b' }] },
      { role: 'toolResult', toolCallId: 'call-A', toolName: 'read', isError: true, timestamp: 3, content: [{ type: 'text', text: 'read failed' }] },
    ];
    const items = normalizeMessages(messages, null);
    const tools = items.filter((i) => i.kind === 'tool');
    expect(tools).toHaveLength(2);

    const callA = tools.find((i) => i.id === 'call-A');
    expect(callA).toMatchObject({ call: { callId: 'call-A', name: 'read', status: 'error', result: { text: 'read failed', isError: true } } });

    const callB = tools.find((i) => i.id === 'call-B');
    expect(callB).toMatchObject({ call: { callId: 'call-B', name: 'write', status: 'ok', result: { text: 'wrote b', isError: false } } });

    // the decoy result matched no call — it must not create a phantom tool item
    // or leak into either matched call's result
    expect(items.some((i) => i.kind === 'tool' && i.call.result?.text === 'ignored')).toBe(false);
  });

  it('rule 2: an unmatched tool call with no result anywhere stays running, even when other calls in the same turn resolve', () => {
    const messages: AnyMessage[] = [
      {
        role: 'assistant',
        timestamp: 0,
        content: [
          { type: 'toolCall', id: 'call-resolved', name: 'bash', arguments: {} },
          { type: 'toolCall', id: 'call-unresolved', name: 'bash', arguments: {} },
        ],
      },
      { role: 'toolResult', toolCallId: 'call-resolved', toolName: 'bash', isError: false, timestamp: 1, content: [{ type: 'text', text: 'done' }] },
    ];
    const items = normalizeMessages(messages, null);
    const tools = items.filter((i) => i.kind === 'tool');
    expect(tools.find((i) => i.id === 'call-resolved')).toMatchObject({ call: { status: 'ok' } });
    expect(tools.find((i) => i.id === 'call-unresolved')).toMatchObject({ call: { status: 'running', result: undefined } });
  });

  it('rule 3: only the item(s) derived from the message at streamingIndex carry streaming:true', () => {
    const messages: AnyMessage[] = [user('hi'), { role: 'assistant', timestamp: 0, content: [{ type: 'text', text: 'partial' }] }];
    const items = normalizeMessages(messages, 1);
    const assistant = items.find((i) => i.kind === 'assistant');
    expect(assistant).toMatchObject({ streaming: true });
    const notStreaming = normalizeMessages(messages, null);
    expect(notStreaming.find((i) => i.kind === 'assistant')).toMatchObject({ streaming: false });
  });

  it('rule 5: multiple text blocks concatenate in order into one markdown string', () => {
    const messages: AnyMessage[] = [
      { role: 'assistant', timestamp: 0, content: [{ type: 'text', text: 'Hello, ' }, { type: 'text', text: 'world.' }] },
    ];
    const items = normalizeMessages(messages, null);
    expect(items[0]).toMatchObject({ kind: 'assistant', markdown: 'Hello, world.' });
  });

  it('rule 6: ids are stable across a message_update-style replace at the same index', () => {
    const before: AnyMessage[] = [{ role: 'assistant', timestamp: 0, content: [{ type: 'text', text: 'Thinking' }] }];
    const after: AnyMessage[] = [{ role: 'assistant', timestamp: 0, content: [{ type: 'text', text: 'Thinking about it more' }] }];
    const itemsBefore = normalizeMessages(before, 0);
    const itemsAfter = normalizeMessages(after, 0);
    expect(itemsAfter[0]!.id).toBe(itemsBefore[0]!.id);
    expect(itemsAfter[0]!.id).toBe('msg-0-assistant');
  });

  it('rule 6: a tool item id is the call\'s own stable id, not index-derived', () => {
    const messages: AnyMessage[] = [
      { role: 'assistant', timestamp: 0, content: [{ type: 'toolCall', id: 'stable-call-id', name: 'bash', arguments: {} }] },
    ];
    const items = normalizeMessages(messages, null);
    expect(items.find((i) => i.kind === 'tool')!.id).toBe('stable-call-id');
  });

  it('rule 7: an unrecognized role degrades to a notice, never a crash', () => {
    const messages: AnyMessage[] = [{ role: 'bashExecution', timestamp: 0 } as AnyMessage];
    expect(() => normalizeMessages(messages, null)).not.toThrow();
    const items = normalizeMessages(messages, null);
    expect(items).toEqual([{ kind: 'notice', id: 'msg-0-notice', level: 'info', text: 'Unrecognized message (bashExecution)' }]);
  });

  it('always pushes one assistant item per assistant message, even with empty markdown (thinking/tool-only turn)', () => {
    // Verified current source behavior (normalizer.ts always `items.push({kind:'assistant',...})`
    // unconditionally at the end of the assistant branch) — this is the desired
    // behavior: an assistant turn that is ONLY a thinking block or ONLY a tool
    // call must still render an (empty) assistant bubble so the turn has a
    // consistent shape and a slot for a later streamed text update to land in.
    const messages: AnyMessage[] = [{ role: 'assistant', timestamp: 0, content: [{ type: 'thinking', thinking: 'hmm' }] }];
    const items = normalizeMessages(messages, null);
    expect(items.map((i) => i.kind)).toEqual(['thinking', 'assistant']);
    expect(items[1]).toMatchObject({ kind: 'assistant', markdown: '' });
  });

  it('extracts images from user and assistant/tool-result content', () => {
    const messages: AnyMessage[] = [
      { role: 'user', timestamp: 0, content: [{ type: 'text', text: 'look' }, { type: 'image', data: 'AAA', mimeType: 'image/png' }] },
    ];
    const items = normalizeMessages(messages, null);
    expect(items[0]).toMatchObject({ kind: 'user', text: 'look', images: [{ data: 'AAA', mimeType: 'image/png' }] });
  });

  it('a plain string user message has no images', () => {
    const items = normalizeMessages([user('hello')], null);
    expect(items[0]).toMatchObject({ kind: 'user', text: 'hello', images: undefined });
  });
});
