// activity.ts — the single, always-available status signal (spec §8). Fixed
// precedence: node-driven `display_status` > in-flight tool title > streaming
// placeholder > idle.

import type { ChatItem, ToolActivity } from './chat-item.js';

export interface Activity {
  state: 'idle' | 'thinking' | 'tool' | 'streaming';
  label: string;
  tool?: ToolActivity;
}

/** A keyed, update-ordered status map. `applyDisplayStatus` re-inserts a key on
 *  every update so Map iteration order tracks "most-recently-set" — a frame
 *  with `text === undefined` clears its key. */
export type DisplayStatusMap = ReadonlyMap<string, string>;

export function emptyDisplayStatus(): DisplayStatusMap {
  return new Map();
}

export function applyDisplayStatus(map: DisplayStatusMap, key: string, text: string | undefined): DisplayStatusMap {
  const next = new Map(map);
  next.delete(key); // re-inserting (below) moves an updated key to the end
  if (text !== undefined) next.set(key, text);
  return next;
}

function findRunningTool(items: readonly ChatItem[]): ToolActivity | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.kind === 'tool' && item.call.status === 'running') return item.call;
  }
  return undefined;
}

function hasStreamedText(items: readonly ChatItem[]): boolean {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.kind === 'assistant' && item.streaming) return item.markdown.length > 0;
  }
  return false;
}

export interface DeriveActivityInput {
  displayStatus: DisplayStatusMap;
  items: readonly ChatItem[];
  isStreaming: boolean;
}

/**
 * Derive the current `Activity`, highest precedence first (spec §8):
 * 1. `display_status`, if any key is present — label is the text of the
 *    most-recently-set surviving key; state is `tool` if a tool is in flight,
 *    else `streaming`.
 * 2. An in-flight tool's friendly title — `state:'tool'`.
 * 3. Streaming with no active tool — `'Thinking…'`, or `'Responding…'` once
 *    assistant text has begun.
 * 4. Idle — not streaming.
 */
export function deriveActivity(input: DeriveActivityInput): Activity {
  const runningTool = findRunningTool(input.items);

  if (input.displayStatus.size > 0) {
    const entries = [...input.displayStatus.entries()];
    const label = entries[entries.length - 1]![1];
    return { state: runningTool !== undefined ? 'tool' : 'streaming', label, tool: runningTool };
  }

  if (runningTool !== undefined) {
    return { state: 'tool', label: runningTool.title, tool: runningTool };
  }

  if (input.isStreaming) {
    return { state: 'streaming', label: hasStreamedText(input.items) ? 'Responding…' : 'Thinking…' };
  }

  return { state: 'idle', label: '' };
}
