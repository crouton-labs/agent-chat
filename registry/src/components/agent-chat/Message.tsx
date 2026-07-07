// Message.tsx — one user/assistant turn (spec §10 `<Message>`). User text is
// plain; assistant markdown goes through the `MarkdownRenderer` seam (§16),
// configured via the `markdown` component-map seam (§11) read from context.
// A streaming assistant item shows a caret that clears on completion and
// carries `aria-busy` (§13); it also carries `aria-live="off"` while
// streaming so the per-frame text replacement (pi streams replace-wholesale)
// is excluded from the ancestor `role="log"` polite region — `Transcript.tsx`
// announces the message exactly once, on completion, via its own
// visually-hidden live-region node.

import { cn } from '@/lib/utils';
import { useAgentChatContext } from './context.js';
import { MarkdownRenderer } from './MarkdownRenderer.js';
import type { MessageProps } from './types.js';

function MessageImages({ images }: { images: { data: string; mimeType: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {images.map((img, i) => (
        <img
          key={i}
          src={`data:${img.mimeType};base64,${img.data}`}
          alt=""
          className="max-h-48 max-w-full rounded-lg border border-border object-contain"
        />
      ))}
    </div>
  );
}

export function Message({ item }: MessageProps) {
  const { classNames, markdown } = useAgentChatContext();

  if (item.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div
          data-slot="agent-chat-bubble-user"
          className={cn(
            'max-w-[85%] rounded-xl bg-primary px-3 py-2 text-sm whitespace-pre-wrap break-words text-primary-foreground',
            item.pending && 'opacity-70',
            classNames.bubbleUser,
          )}
        >
          {item.text}
          {item.images && item.images.length > 0 && <MessageImages images={item.images} />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div
        data-slot="agent-chat-bubble-assistant"
        aria-busy={item.streaming || undefined}
        aria-live={item.streaming ? 'off' : undefined}
        className={cn('max-w-[85%] rounded-xl bg-muted px-3 py-2 text-sm text-foreground', classNames.bubbleAssistant)}
      >
        <MarkdownRenderer content={item.markdown} streaming={item.streaming} markdown={markdown} />
        {item.streaming && (
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-foreground/60 align-text-bottom motion-reduce:animate-none"
          />
        )}
        {item.images && item.images.length > 0 && <MessageImages images={item.images} />}
      </div>
    </div>
  );
}
