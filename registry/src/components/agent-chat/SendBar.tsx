// SendBar.tsx — the auto-growing multiline composer (spec §10 `<SendBar>`).
// Enter sends, Shift+Enter newlines, Escape aborts the live turn (composer
// text is untouched). Observer → disabled + "Take control"; streaming → send
// still enqueues/steers per `busySendMode`, plus a visible Stop. Focus returns
// to the composer after send. Auto-grows on every value change
// (`height: auto` then clamp to `scrollHeight`, capped at `MAX_TEXTAREA_HEIGHT_PX`
// to match the `max-h-40` visual cap) via a layout effect, so height updates
// apply before paint — no flash of the wrong size.

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAgentChatContext } from './context.js';
import type { SendBarProps } from './types.js';

const MAX_TEXTAREA_HEIGHT_PX = 160; // matches the `max-h-40` cap below

export function SendBar({ placeholder = 'Message…', className }: SendBarProps) {
  const { chat, classNames } = useAgentChatContext();
  const { activity, control, actions } = chat;
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isObserver = control === 'observer';
  const isActive = activity.state !== 'idle';

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }, [text]);

  const send = () => {
    const trimmed = text.trim();
    if (trimmed === '' || isObserver) return;
    actions.send(trimmed);
    setText('');
    textareaRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      actions.abort();
    }
  };

  return (
    <div data-slot="agent-chat-send-bar" className={cn('flex items-end gap-2', classNames.sendBar, className)}>
      {isObserver ? (
        <Button type="button" variant="secondary" className="flex-1" onClick={() => actions.requestControl()}>
          Take control to send messages
        </Button>
      ) : (
        <>
          <Textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="max-h-40 flex-1 resize-none overflow-y-auto"
            aria-label="Message"
          />
          {isActive && (
            <Button type="button" variant="outline" onClick={() => actions.abort()}>
              Stop
            </Button>
          )}
          <Button type="button" onClick={send} disabled={text.trim() === ''}>
            Send
          </Button>
        </>
      )}
    </div>
  );
}
