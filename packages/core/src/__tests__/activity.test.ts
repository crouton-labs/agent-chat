// activity.test.ts — spec §8 precedence: running tool > display_status >
// streaming placeholder > idle. Plus the keyed display-status map's
// set/clear/reorder-on-update semantics.

import { describe, expect, it } from 'vitest';
import { applyDisplayStatus, deriveActivity, emptyDisplayStatus } from '../activity.js';
import type { ChatItem, ToolActivity } from '../chat-item.js';

function runningTool(overrides: Partial<ToolActivity> = {}): ChatItem {
  return {
    kind: 'tool',
    id: 'call-1',
    call: { callId: 'call-1', name: 'bash', title: 'Running a command', args: {}, status: 'running', ...overrides },
  };
}

describe('applyDisplayStatus', () => {
  it('sets a key', () => {
    const map = applyDisplayStatus(emptyDisplayStatus(), 'k1', 'building…');
    expect([...map.entries()]).toEqual([['k1', 'building…']]);
  });

  it('clears a key when text is undefined', () => {
    let map = applyDisplayStatus(emptyDisplayStatus(), 'k1', 'building…');
    map = applyDisplayStatus(map, 'k1', undefined);
    expect(map.size).toBe(0);
  });

  it('re-setting an existing key moves it to the end (most-recently-set)', () => {
    let map = applyDisplayStatus(emptyDisplayStatus(), 'k1', 'first');
    map = applyDisplayStatus(map, 'k2', 'second');
    map = applyDisplayStatus(map, 'k1', 'first updated');
    expect([...map.keys()]).toEqual(['k2', 'k1']);
    expect([...map.values()]).toEqual(['second', 'first updated']);
  });
});

describe('deriveActivity precedence', () => {
  it('idle when nothing is happening', () => {
    expect(deriveActivity({ displayStatus: emptyDisplayStatus(), items: [], isStreaming: false })).toEqual({ state: 'idle', label: '' });
  });

  it('streaming with no active tool and no text yet is "Thinking…"', () => {
    const activity = deriveActivity({ displayStatus: emptyDisplayStatus(), items: [], isStreaming: true });
    expect(activity).toEqual({ state: 'streaming', label: 'Thinking…' });
  });

  it('streaming once assistant text has begun is "Responding…"', () => {
    const items: ChatItem[] = [{ kind: 'assistant', id: 'a', markdown: 'partial', streaming: true }];
    const activity = deriveActivity({ displayStatus: emptyDisplayStatus(), items, isStreaming: true });
    expect(activity).toEqual({ state: 'streaming', label: 'Responding…' });
  });

  it('a running tool overrides plain streaming, surfacing its friendly title', () => {
    const items: ChatItem[] = [runningTool({ title: 'Reading foo.ts' })];
    const activity = deriveActivity({ displayStatus: emptyDisplayStatus(), items, isStreaming: true });
    expect(activity.state).toBe('tool');
    expect(activity.label).toBe('Reading foo.ts');
    expect(activity.tool?.callId).toBe('call-1');
  });

  it('a running tool\'s friendly title outranks display_status for the label — a persistent status must never mask an in-flight tool', () => {
    const items: ChatItem[] = [runningTool()];
    const displayStatus = applyDisplayStatus(emptyDisplayStatus(), 'phase', 'Deploying…');
    const activity = deriveActivity({ displayStatus, items, isStreaming: true });
    expect(activity).toEqual({ state: 'tool', label: 'Running a command', tool: items[0]!.kind === 'tool' ? items[0].call : undefined });
  });

  it('display_status with no running tool yields state "streaming" with the status label', () => {
    const displayStatus = applyDisplayStatus(emptyDisplayStatus(), 'phase', 'Booting…');
    const activity = deriveActivity({ displayStatus, items: [], isStreaming: false });
    expect(activity).toEqual({ state: 'streaming', label: 'Booting…', tool: undefined });
  });

  it('display_status label reflects the most-recently-set surviving key', () => {
    let displayStatus = applyDisplayStatus(emptyDisplayStatus(), 'a', 'first');
    displayStatus = applyDisplayStatus(displayStatus, 'b', 'second');
    let activity = deriveActivity({ displayStatus, items: [], isStreaming: false });
    expect(activity.label).toBe('second');
    // clearing the most-recent key falls back to the remaining one
    displayStatus = applyDisplayStatus(displayStatus, 'b', undefined);
    activity = deriveActivity({ displayStatus, items: [], isStreaming: false });
    expect(activity.label).toBe('first');
  });

  it('a completed (non-running) tool does not count as an active tool', () => {
    const items: ChatItem[] = [runningTool({ status: 'ok', result: { text: 'done', isError: false } })];
    const activity = deriveActivity({ displayStatus: emptyDisplayStatus(), items, isStreaming: false });
    expect(activity).toEqual({ state: 'idle', label: '' });
  });
});
