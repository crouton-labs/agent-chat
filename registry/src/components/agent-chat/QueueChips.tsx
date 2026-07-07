// QueueChips.tsx — the queued-but-not-yet-sent turns (spec §10 `<QueueChips>`).
// Absent when the queue is empty; each chip removes via `cancelQueued(index)`.

import { XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAgentChatContext } from './context.js';
import type { QueueChipsProps } from './types.js';

export function QueueChips({ className }: QueueChipsProps) {
  const { chat } = useAgentChatContext();
  const { queue, actions } = chat;

  if (queue.length === 0) return null;

  return (
    <div data-slot="agent-chat-queue-chips" className={cn('flex flex-wrap gap-1.5', className)}>
      {queue.map((text, index) => (
        <Badge key={`${index}-${text}`} variant="secondary" className="max-w-[16rem] gap-1 pr-1">
          <span className="truncate">{text}</span>
          <button
            type="button"
            aria-label={`Remove queued message: ${text}`}
            onClick={() => actions.cancelQueued(index)}
            className="ml-0.5 rounded-full p-0.5 hover:bg-secondary-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}
