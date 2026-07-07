// ThinkingDisclosure.tsx — collapsible reasoning (spec §10 `<ThinkingDisclosure>`).
// "Thinking…" while streaming/no `endedAt`, "Thought for Ns" once ended;
// auto-collapses on completion. View-gating (`dev`-only) is a `Transcript`
// concern, not this component's.

import { useEffect, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { ThinkingDisclosureProps } from './types.js';

export function ThinkingDisclosure({ item }: ThinkingDisclosureProps) {
  // Already-completed reasoning (e.g. from a reconnect snapshot) starts
  // collapsed — only an item still streaming (no `endedAt` yet) starts open.
  const [open, setOpen] = useState(() => item.endedAt === undefined);

  // Auto-collapse the instant reasoning completes.
  useEffect(() => {
    if (item.endedAt !== undefined) setOpen(false);
  }, [item.endedAt]);

  const label =
    item.endedAt === undefined ? 'Thinking…' : `Thought for ${Math.max(0, Math.round((item.endedAt - item.startedAt) / 1000))}s`;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="text-sm text-muted-foreground">
      <CollapsibleTrigger
        aria-expanded={open}
        className="group/thinking-trigger flex items-center gap-1 rounded-md px-1 py-0.5 hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ChevronDownIcon className="size-3.5 transition-transform group-data-[panel-open]/thinking-trigger:rotate-180" />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 border-l-2 border-border pl-3 whitespace-pre-wrap data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
        {item.text}
      </CollapsibleContent>
    </Collapsible>
  );
}
