// StatusBar.tsx — the single always-visible state signal (spec §10 `<StatusBar>`).
// Connection + activity label, plus the matching affordance: Stop while active,
// Retry on `error-retry`, Take control when observer, a fatal notice on
// `error-fatal`. The label lives in its own `aria-live="polite"` region (§13) —
// buttons are NOT inside it.

import type { Activity, ChatStatus } from '@crouton-kit/agent-chat-core';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAgentChatContext } from './context.js';
import type { StatusBarProps } from './types.js';

function statusLabel(activity: Activity, status: ChatStatus): string {
  if (activity.label) return activity.label;
  if (status === 'connecting') return 'Connecting…';
  if (status === 'reconnecting') return 'Reconnecting…';
  if (status === 'error-retry') return 'Connection lost';
  if (status === 'error-fatal') return 'Chat unavailable';
  return '';
}

function DefaultLabel({ activity, status }: { activity: Activity; status: ChatStatus }) {
  const label = statusLabel(activity, status);
  if (!label) return null;
  return <span>{label}</span>;
}

export function StatusBar({ className }: StatusBarProps) {
  const { chat, classNames, renderStatus } = useAgentChatContext();
  const { status, activity, control, actions } = chat;

  return (
    <div data-slot="agent-chat-status-bar" className={cn('flex items-center justify-between gap-2 text-sm', classNames.statusBar, className)}>
      <div role="status" aria-live="polite" className="min-w-0 flex-1 truncate text-muted-foreground">
        {renderStatus?.(activity, status, DefaultLabel) ?? <DefaultLabel activity={activity} status={status} />}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {activity.state !== 'idle' && (
          <Button type="button" variant="outline" size="sm" onClick={() => actions.abort()}>
            Stop
          </Button>
        )}
        {status === 'error-retry' && (
          <Button type="button" variant="outline" size="sm" onClick={() => actions.reconnect()}>
            Retry
          </Button>
        )}
        {control === 'observer' && (
          <Button type="button" variant="secondary" size="sm" onClick={() => actions.requestControl()}>
            Take control
          </Button>
        )}
      </div>
    </div>
  );
}
