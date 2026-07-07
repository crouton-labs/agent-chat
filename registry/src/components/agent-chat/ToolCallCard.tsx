// ToolCallCard.tsx — one-line collapsible tool call (spec §10 `<ToolCallCard>`).
// `user` view: title + status pill only, not expandable. `dev` view: expandable
// args/result. Status is never color-only — every pill pairs an icon with text.

import type { ComponentType } from 'react';
import {
  CircleAlertIcon,
  CircleCheckIcon,
  DatabaseIcon,
  FileEditIcon,
  FileTextIcon,
  GlobeIcon,
  Loader2Icon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
  type LucideProps,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useAgentChatContext } from './context.js';
import type { ToolCallCardProps } from './types.js';

// Explicit icon-name → component map covering the icon names `defaultToolRegistry`
// actually uses, plus a fallback for anything else (never dynamically index the
// whole `lucide-react` barrel by an arbitrary string — fragile/untyped).
const ICONS: Record<string, ComponentType<LucideProps>> = {
  terminal: TerminalIcon,
  'file-text': FileTextIcon,
  'file-edit': FileEditIcon,
  search: SearchIcon,
  database: DatabaseIcon,
  globe: GlobeIcon,
};

function iconFor(name: string | undefined): ComponentType<LucideProps> {
  if (name === undefined) return WrenchIcon;
  return ICONS[name] ?? WrenchIcon;
}

function StatusPill({ status }: { status: 'running' | 'ok' | 'error' }) {
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin motion-reduce:animate-none" />
        Running
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
        <CircleAlertIcon className="size-3" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
      <CircleCheckIcon className="size-3" />
      Done
    </span>
  );
}

function prettyResult(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function ToolCallCard({ call }: ToolCallCardProps) {
  const { view } = useAgentChatContext();
  const Icon = iconFor(call.icon);

  const row = (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{call.title}</span>
      <StatusPill status={call.status} />
    </div>
  );

  if (view === 'user') {
    return (
      <div data-slot="agent-chat-tool-call" className="rounded-lg border border-border bg-card px-2.5 py-1.5">
        {row}
      </div>
    );
  }

  return (
    <Collapsible data-slot="agent-chat-tool-call" className="rounded-lg border border-border bg-card px-2.5 py-1.5">
      <CollapsibleTrigger className="group/tool-trigger flex w-full items-center gap-2 text-left focus-visible:outline-none">
        {row}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2 border-t border-border pt-2 text-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
        <div>
          <div className="mb-1 font-medium text-muted-foreground">Args</div>
          <pre className={cn('overflow-x-auto rounded-md bg-muted p-2 whitespace-pre-wrap')}>
            {JSON.stringify(call.args, null, 2)}
          </pre>
        </div>
        {call.result && (
          <div>
            <div className="mb-1 font-medium text-muted-foreground">{call.result.isError ? 'Error' : 'Result'}</div>
            <pre className="overflow-x-auto rounded-md bg-muted p-2 whitespace-pre-wrap">{prettyResult(call.result.text)}</pre>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
