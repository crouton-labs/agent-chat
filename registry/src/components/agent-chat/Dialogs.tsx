// Dialogs.tsx — the controller dialog surface (spec §10 `<Dialogs>`, §6). Renders
// the current `chat.dialog` as a shadcn `dialog` (`select`/`confirm`/`input`/
// `editor`); answer → `answerDialog`, dismiss (Escape/backdrop) → `cancelDialog`.
// Rendered only when `control==='controller'`. Also renders the registry-side
// toast/notice stack (the notice/toast GAP — see `AgentChatProvider`) — that
// stack is a broadcast to every client, so it is NOT gated on `control`.

import { useEffect, useState } from 'react';
import type { BlockingDialogRequest, DialogResponse } from '@crouton-kit/agent-chat-core';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAgentChatContext } from './context.js';
import type { DialogsProps, Notice } from './types.js';

const NOTICE_AUTO_DISMISS_MS = 6000;

function NoticeRow({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, NOTICE_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice.id]);

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10',
        notice.level === 'error' && 'border-destructive/30 bg-destructive/10 text-destructive',
      )}
    >
      <span className="flex-1">{notice.text}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="shrink-0 rounded-full p-0.5 hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}

function NoticeStack({ notices, dismissNotice }: { notices: Notice[]; dismissNotice: (id: string) => void }) {
  if (notices.length === 0) return null;
  return (
    <div className="fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {notices.map((notice) => (
        <NoticeRow key={notice.id} notice={notice} onDismiss={() => dismissNotice(notice.id)} />
      ))}
    </div>
  );
}

// Keyed by `request.id` at every call site below: core can supersede one open
// `input`/`editor` request with another while the dialog stays mounted (spec
// §6), and without a key React would reuse this instance — the lazy `useState`
// initializer would not re-run, so the new request could be answered with the
// previous request's stale text.
function DialogBody({ request, respond }: { request: BlockingDialogRequest; respond: (r: DialogResponse) => void }) {
  const [value, setValue] = useState(() => (request.method === 'editor' ? (request.prefill ?? '') : ''));

  if (request.method === 'select') {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {request.options.map((opt) => (
            <Button key={opt} type="button" variant="outline" onClick={() => respond({ id: request.id, value: opt })}>
              {opt}
            </Button>
          ))}
        </div>
      </>
    );
  }

  if (request.method === 'confirm') {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
          <DialogDescription>{request.message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => respond({ id: request.id, confirmed: false })}>
            Cancel
          </Button>
          <Button type="button" onClick={() => respond({ id: request.id, confirmed: true })}>
            Confirm
          </Button>
        </DialogFooter>
      </>
    );
  }

  if (request.method === 'input') {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
        </DialogHeader>
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={request.placeholder}
          className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => respond({ id: request.id, cancelled: true })}>
            Cancel
          </Button>
          <Button type="button" onClick={() => respond({ id: request.id, value })}>
            Submit
          </Button>
        </DialogFooter>
      </>
    );
  }

  // method === 'editor'
  return (
    <>
      <DialogHeader>
        <DialogTitle>{request.title}</DialogTitle>
      </DialogHeader>
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={8}
        className="flex max-h-80 min-h-32 w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => respond({ id: request.id, cancelled: true })}>
          Cancel
        </Button>
        <Button type="button" onClick={() => respond({ id: request.id, value })}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

export function Dialogs({ className }: DialogsProps) {
  const { chat, renderDialog, notices, dismissNotice } = useAgentChatContext();
  const { dialog, control, actions } = chat;

  const showDialog = control === 'controller' && dialog !== null;

  return (
    <div data-slot="agent-chat-dialogs" className={className}>
      {showDialog && dialog !== null && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) actions.cancelDialog();
          }}
        >
          <DialogContent>
            {renderDialog?.(dialog, actions.answerDialog, ({ request, respond }) => (
              <DialogBody key={request.id} request={request} respond={respond} />
            )) ?? <DialogBody key={dialog.id} request={dialog} respond={actions.answerDialog} />}
          </DialogContent>
        </Dialog>
      )}
      <NoticeStack notices={notices} dismissNotice={dismissNotice} />
    </div>
  );
}
