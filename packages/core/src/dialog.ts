// dialog.ts — controller-dialog request/response plumbing (spec §6/§9). Pure
// helpers; `useAgentChat` holds the single `dialog: BlockingDialogRequest | null`
// state and calls these on `welcome`/`extension_ui_request`/answer/cancel.

import {
  isBlockingDialogRequest,
  type BlockingDialogRequest,
  type DialogResponse,
  type ExtensionUIRequestFrame,
  type WireExtensionUIResponseFrame,
} from './wire/protocol.js';

export type { BlockingDialogRequest as DialogRequest, DialogResponse } from './wire/protocol.js';

/** Seed `dialog` from `welcome.pending_dialog` on EVERY (re)connect —
 *  byte-for-byte crtr's own web client (`?? null`). An observer's `welcome`
 *  always carries `pending_dialog: null`, so this naturally yields `null` for
 *  an observer (spec §17 AC #8a). */
export function seedDialogFromWelcome(pendingDialog: BlockingDialogRequest | null | undefined): BlockingDialogRequest | null {
  return pendingDialog ?? null;
}

/** A newer `extension_ui_request` supersedes a showing dialog (parity with
 *  crtr's web client). Non-blocking methods (`notify`) never touch dialog state —
 *  they're a separate transient toast concern. */
export function foldExtensionUIRequest(current: BlockingDialogRequest | null, incoming: ExtensionUIRequestFrame): BlockingDialogRequest | null {
  if (!isBlockingDialogRequest(incoming)) return current;
  return incoming;
}

/** The wire frame for a dismiss (Escape/backdrop) — an explicit `cancelled:true`
 *  answer, so the agent turn resolves immediately instead of waiting out the
 *  broker's timeout. `undefined` when there is no dialog to cancel. */
export function cancelResponseFrame(dialog: BlockingDialogRequest | null): WireExtensionUIResponseFrame | undefined {
  if (dialog === null) return undefined;
  return { type: 'extension_ui_response', id: dialog.id, cancelled: true };
}

/** Build the wire frame for an explicit answer (`answerDialog`). */
export function answerResponseFrame(response: DialogResponse): WireExtensionUIResponseFrame {
  return { type: 'extension_ui_response', ...response };
}
