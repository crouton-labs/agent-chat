// Transcript.tsx — the scroll container (spec §10 `<Transcript>`/`<MessageList>`).
// `role="log" aria-live="polite" aria-relevant="additions"`, stick-to-bottom
// with release-on-manual-scroll-up + a "Jump to latest" affordance, empty
// state via `renderEmpty`/suggestion chips, and the `kind` → component map.
// `'thinking'` items are skipped entirely outside `dev` view — the one place
// spec §12's view gating actually happens. `components.Message` /
// `.ThinkingDisclosure` / `.ToolCallCard` overrides (spec §11 rung 4) are
// resolved here — these leaves are rendered directly by `Transcript`, not by
// `<AgentChat>`, so the override map has to reach them through context.
// Per spec §13, streaming assistant text is kept out of the polite
// live-announcement path (see `Message.tsx`'s `aria-live="off"` while
// streaming); this component instead announces once, via a visually-hidden
// `aria-live="polite"` node, when an assistant item's `streaming` transitions
// to `false`.

import { useEffect, useRef, useState } from 'react';
import type { ChatItem } from '@crouton-kit/agent-chat-core';
import { ArrowDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAgentChatContext } from './context.js';
import { Message } from './Message.js';
import { ThinkingDisclosure } from './ThinkingDisclosure.js';
import { ToolCallCard } from './ToolCallCard.js';
import type { TranscriptProps } from './types.js';

// Distance (px) from the bottom within which the viewport still counts as
// "stuck" to the latest message.
const STICK_THRESHOLD_PX = 48;

function TranscriptNoticeRow({ item }: { item: Extract<ChatItem, { kind: 'notice' }> }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card px-3 py-1.5 text-center text-xs text-muted-foreground',
        item.level === 'error' && 'border-destructive/30 bg-destructive/10 text-destructive',
      )}
    >
      {item.text}
    </div>
  );
}

function DefaultEmptyState({ suggestions, onSuggestion }: { suggestions?: string[]; onSuggestion: (text: string) => void }) {
  if (suggestions && suggestions.length > 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">What would you like to do?</p>
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <Button key={s} type="button" variant="outline" size="sm" onClick={() => onSuggestion(s)}>
              {s}
            </Button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">No messages yet.</div>
  );
}

export function Transcript({ className }: TranscriptProps) {
  const { chat, view, classNames, components, suggestions, renderMessage, renderTool, renderThinking, renderEmpty } =
    useAgentChatContext();
  const { transcript, actions } = chat;

  const MessageComp = components.Message ?? Message;
  const ThinkingDisclosureComp = components.ThinkingDisclosure ?? ThinkingDisclosure;
  const ToolCallCardComp = components.ToolCallCard ?? ToolCallCard;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [stuckToBottom, setStuckToBottom] = useState(true);

  // §13: a completion-only announcement, one clean read per assistant message
  // once it stops streaming — not a per-token spam of the whole polite region.
  // The announcement is an identity-carrying token (id + text + seq), not a
  // plain string: two completions with identical final markdown are still
  // distinct DOM updates because `seq` increments every time, so React can't
  // bail out on an equal-string state update and the live region always gets
  // a fresh node to announce.
  const [announcement, setAnnouncement] = useState<{ id: string; text: string; seq: number } | null>(null);
  const prevStreamingRef = useRef<Map<string, boolean>>(new Map());
  useEffect(() => {
    const prevStreaming = prevStreamingRef.current;
    const liveIds = new Set<string>();
    for (const item of transcript) {
      if (item.kind !== 'assistant') continue;
      liveIds.add(item.id);
      if (prevStreaming.get(item.id) && !item.streaming) {
        setAnnouncement((prev) => ({ id: item.id, text: item.markdown, seq: (prev?.seq ?? 0) + 1 }));
      }
      prevStreaming.set(item.id, item.streaming);
    }
    // Prune ids no longer present in the transcript so the map stays
    // reconciled to the live set instead of growing unbounded and carrying
    // stale/reused ids across reconnect snapshot replacement or node changes.
    for (const id of prevStreaming.keys()) {
      if (!liveIds.has(id)) prevStreaming.delete(id);
    }
  }, [transcript]);

  const isAtBottom = (el: HTMLDivElement): boolean => el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX;

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onScroll = () => setStuckToBottom(isAtBottom(el));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !stuckToBottom) return;
    el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript]);

  const jumpToLatest = () => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setStuckToBottom(true);
  };

  return (
    <div data-slot="agent-chat-transcript" className={cn('relative min-h-0 flex-1', classNames.transcript, className)}>
      <ScrollArea
        viewportRef={viewportRef}
        className="h-full"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {transcript.length === 0 ? (
          renderEmpty ? renderEmpty() : <DefaultEmptyState suggestions={suggestions} onSuggestion={actions.send} />
        ) : (
          <div className="flex flex-col gap-3 p-3">
            {transcript.map((item) => {
              if (item.kind === 'user' || item.kind === 'assistant') {
                return <div key={item.id}>{renderMessage?.(item, MessageComp) ?? <MessageComp item={item} />}</div>;
              }
              if (item.kind === 'thinking') {
                if (view !== 'dev') return null;
                return (
                  <div key={item.id}>{renderThinking?.(item, ThinkingDisclosureComp) ?? <ThinkingDisclosureComp item={item} />}</div>
                );
              }
              if (item.kind === 'tool') {
                return <div key={item.id}>{renderTool?.(item.call, ToolCallCardComp) ?? <ToolCallCardComp call={item.call} />}</div>;
              }
              // item.kind === 'notice' — normalizer's unknown-role fallback (spec §4
              // rule 7), distinct from the registry's own toast `Notice` (see Dialogs.tsx).
              return <TranscriptNoticeRow key={item.id} item={item} />;
            })}
          </div>
        )}
      </ScrollArea>
      {announcement && (
        <div key={`${announcement.id}-${announcement.seq}`} aria-live="polite" role="status" className="sr-only">
          {announcement.text}
        </div>
      )}
      {!stuckToBottom && transcript.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="pointer-events-auto shadow-lg"
            onClick={jumpToLatest}
          >
            <ArrowDownIcon className="size-3.5" />
            Jump to latest
          </Button>
        </div>
      )}
    </div>
  );
}

export { Transcript as MessageList };
