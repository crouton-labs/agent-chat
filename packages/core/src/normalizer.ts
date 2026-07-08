// normalizer.ts — raw pi messages → ordered, keyed `ChatItem[]` (spec §4). The
// core's primary value-add beyond wiring: one normalized view model instead of
// N per-app hand-rolled flatteners. Pure function of (messages, streamingIndex).

import type { ChatItem, ImageRef, ToolActivity } from './chat-item.js';
import { defaultToolRegistry, type ToolRegistry } from './tool-registry.js';
import {
  isAssistantMessage,
  isToolResultMessage,
  isUserMessage,
  type AnyMessage,
  type ImageContent,
  type TextContent,
  type ToolCall,
  type ToolResultMessage,
} from './wire/protocol.js';

export interface NormalizeOptions {
  toolRegistry?: ToolRegistry;
  /** Injected clock, for deterministic tests (rule: thinking `startedAt`/`endedAt`). */
  now?: () => number;
}

function imagesOf(content: (TextContent | ImageContent)[] | string): ImageRef[] | undefined {
  if (typeof content === 'string') return undefined;
  const images = content.filter((b): b is ImageContent => b.type === 'image').map((b) => ({ data: b.data, mimeType: b.mimeType }));
  return images.length > 0 ? images : undefined;
}

function textOf(content: (TextContent | ImageContent)[] | string): string {
  if (typeof content === 'string') return content;
  return content
    .filter((b): b is TextContent => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function toolResultText(result: ToolResultMessage | undefined): { text: string; isError: boolean } | undefined {
  if (result === undefined) return undefined;
  return { text: textOf(result.content), isError: result.isError };
}

/** Normalizer rule 7: an `AnyMessage` with an unrecognized `role` degrades to a
 *  `notice`, never a crash. */
function noticeLabel(role: string): string {
  return `Unrecognized message (${role})`;
}

/**
 * Normalize raw pi messages into the `ChatItem[]` view model.
 *
 * Rules (spec §4, fixed & testable):
 * 1. Thinking splits out into its own item, ordered before the assistant text
 *    item of the same message. A `redacted` block yields placeholder text.
 * 2. A `ToolCall` pairs with the `ToolResultMessage` whose `toolCallId` matches
 *    into ONE `tool` item — `running` while no result yet.
 * 3. The item(s) derived from the message at `streamingIndex` carry `streaming:true`.
 * 4. (Optimistic/queued items are a hook-level concern — §9 — not the normalizer's.)
 * 5. Multiple `TextContent` blocks concatenate, in order, into one `markdown` string.
 * 6. `id` is derived deterministically (message index + block index, or the tool
 *    call's own stable `id`) so React reconciliation across `message_update`
 *    replacements never remounts/loses scroll or disclosure state.
 * 7. An unrecognized `role` degrades to a `notice{level:'info'}`, never a crash.
 * 7a. The one exception to rule 7: `role:'custom'` (pi's own `CustomMessage`,
 *     e.g. crouter's `<crtr-context>` bearings / cycle dividers) is silently
 *     dropped — no item, no notice — rather than degrading to a notice.
 */
export function normalizeMessages(messages: readonly AnyMessage[], streamingIndex: number | null, options: NormalizeOptions = {}): ChatItem[] {
  const toolRegistry = options.toolRegistry ?? defaultToolRegistry;
  const now = options.now ?? Date.now;

  const resultsByCallId = new Map<string, ToolResultMessage>();
  for (const message of messages) {
    if (isToolResultMessage(message)) resultsByCallId.set(message.toolCallId, message);
  }

  const items: ChatItem[] = [];

  messages.forEach((message, index) => {
    const streaming = index === streamingIndex;

    if (isUserMessage(message)) {
      items.push({
        kind: 'user',
        id: `msg-${index}-user`,
        text: textOf(message.content),
        images: imagesOf(message.content),
      });
      return;
    }

    if (isAssistantMessage(message)) {
      // Rule 1: thinking items, in block order, before the assistant text item.
      message.content.forEach((block, blockIndex) => {
        if (block.type !== 'thinking') return;
        const text = block.redacted === true ? '[reasoning hidden]' : block.thinking;
        items.push({
          kind: 'thinking',
          id: `msg-${index}-thinking-${blockIndex}`,
          text,
          streaming,
          startedAt: message.timestamp,
          endedAt: streaming ? undefined : now(),
        });
      });

      // Rule 2: tool calls, in block order, paired with their result by id.
      message.content.forEach((block, blockIndex) => {
        if (block.type !== 'toolCall') return;
        const call = block as ToolCall;
        const result = resultsByCallId.get(call.id);
        const activity: ToolActivity = {
          callId: call.id,
          name: call.name,
          title: toolRegistry.titleFor(call.name, call.arguments),
          icon: toolRegistry.iconFor(call.name),
          args: call.arguments,
          status: result === undefined ? 'running' : result.isError ? 'error' : 'ok',
          result: toolResultText(result),
        };
        items.push({ kind: 'tool', id: call.id, call: activity });
        void blockIndex;
      });

      // Rule 5: concatenate every text block into one markdown string.
      const markdown = message.content
        .filter((b): b is TextContent => b.type === 'text')
        .map((b) => b.text)
        .join('');
      items.push({
        kind: 'assistant',
        id: `msg-${index}-assistant`,
        markdown,
        streaming,
      });
      return;
    }

    if (isToolResultMessage(message)) {
      // Rendered as part of the paired `tool` item above, never standalone.
      return;
    }

    if (message.role === 'custom') {
      // Rule 7a: pi's own `CustomMessage` (role:'custom', a `customType` +
      // `display` pair) is app/extension bookkeeping — crouter's injected
      // `<crtr-context>` bearings, cycle dividers, etc — never a chat turn.
      // Silently ignored on the product surface by default: it must NOT
      // degrade to a visible notice (that would leak internal prompt/bearings
      // content to the end user) and, unlike rule 7 below, there is no v1
      // opt-in diagnostic rendering for it either.
      return;
    }

    // Rule 7: any OTHER unrecognized role (e.g. an app-custom `bashExecution`
    // message) degrades to a notice, never a crash.
    items.push({ kind: 'notice', id: `msg-${index}-notice`, level: 'info', text: noticeLabel(message.role) });
  });

  return items;
}
