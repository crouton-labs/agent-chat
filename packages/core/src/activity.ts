// activity.ts — the single, always-available status signal (spec §8).
// Precedence: in-flight tool title > node-driven `display_status` > streaming
// placeholder > idle. A running tool's friendly title always wins the visible
// label — a persistent `display_status` (e.g. "<model> ready") never masks
// the fact that a tool is actively running.

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
 * 1. An in-flight tool's friendly title — `state:'tool'`. Wins even when a
 *    persistent `display_status` is also set, so a stale "<model> ready"
 *    status can never mask a tool that is actually running right now.
 * 2. `display_status`, if any key is present (and no tool is running) —
 *    label is the text of the most-recently-set surviving key, `state:'streaming'`.
 * 3. Streaming with no active tool and no `display_status` — `'Thinking…'`,
 *    or `'Responding…'` once assistant text has begun.
 * 4. Idle — not streaming.
 */
export function deriveActivity(input: DeriveActivityInput): Activity {
  const runningTool = findRunningTool(input.items);

  if (runningTool !== undefined) {
    return { state: 'tool', label: runningTool.title, tool: runningTool };
  }

  if (input.displayStatus.size > 0) {
    const entries = [...input.displayStatus.entries()];
    const label = entries[entries.length - 1]![1];
    return { state: 'streaming', label };
  }

  if (input.isStreaming) {
    return { state: 'streaming', label: hasStreamedText(input.items) ? 'Responding…' : 'Thinking…' };
  }

  return { state: 'idle', label: '' };
}
