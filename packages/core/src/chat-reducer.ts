// chat-reducer.ts — combines the transcript reducer, the keyed display-status
// map, and dialog request/response plumbing into ONE pure reducer over
// `BrokerToClient` frames (spec §3/§6/§9). `useAgentChat` is a thin React shell
// around this — attach lifecycle + `normalizeMessages`/`deriveActivity` on top.

import { applyDisplayStatus, emptyDisplayStatus, type DisplayStatusMap } from './activity.js';
import { foldExtensionUIRequest, seedDialogFromWelcome } from './dialog.js';
import { applySnapshot, initialConvState, reduce, type ConvState } from './transcript.js';
import { isControlFrame, type AgentSessionEvent, type BlockingDialogRequest, type BrokerToClient, type ClientRole } from './wire/protocol.js';

export interface ChatState {
  clientId: string;
  conv: ConvState;
  displayStatus: DisplayStatusMap;
  dialog: BlockingDialogRequest | null;
  controllerId: string | null;
  control: ClientRole;
  notice: string | null;
}

export function initialChatState(clientId: string): ChatState {
  return {
    clientId,
    conv: initialConvState(),
    displayStatus: emptyDisplayStatus(),
    dialog: null,
    controllerId: null,
    control: 'observer',
    notice: null,
  };
}

/** Fold ONE broker→client frame. A control frame narrows to its named shape;
 *  anything else is assumed to be a raw `AgentSessionEvent` and folds into the
 *  transcript (spec §3). */
export function foldBrokerFrame(state: ChatState, frame: BrokerToClient): ChatState {
  if (!isControlFrame(frame.type)) {
    return { ...state, conv: reduce(state.conv, frame as AgentSessionEvent) };
  }
  switch (frame.type) {
    case 'welcome': {
      // A fresh `welcome` replaces transcript, display status, AND dialog
      // state wholesale on EVERY (re)connect — reconnect is authoritative, no
      // dedup/merge (spec §9/§15). displayStatus is reset here too: the broker
      // snapshot carries no display-status replay, so a key set on a prior
      // socket must not survive into the new connection (a stale key would
      // otherwise keep showing an obsolete activity label forever). This is
      // also the load-bearing re-show of an in-flight dialog after a recovered
      // drop (§17 AC #8a).
      return {
        ...state,
        conv: applySnapshot(frame.snapshot),
        displayStatus: emptyDisplayStatus(),
        controllerId: frame.controller_id,
        control: frame.controller_id === state.clientId ? 'controller' : 'observer',
        dialog: seedDialogFromWelcome(frame.pending_dialog),
        notice: null,
      };
    }
    case 'control_changed': {
      const control = frame.controller_id === state.clientId ? 'controller' : 'observer';
      return {
        ...state,
        controllerId: frame.controller_id,
        control,
        // Losing control closes an open dialog (spec §6): the broker keeps the
        // dialog pending for whoever holds control next, and re-delivers it via
        // that client's next `welcome.pending_dialog` or a become-controller
        // re-route — this client just stops showing it.
        dialog: control === 'controller' ? state.dialog : null,
      };
    }
    case 'error':
      return {
        ...state,
        notice: frame.code === 'not_controller' ? 'read-only — another viewer is the controller' : frame.message || `error: ${frame.code}`,
      };
    case 'display_status':
      return { ...state, displayStatus: applyDisplayStatus(state.displayStatus, frame.key, frame.text) };
    case 'extension_ui_request':
      // A new blocking dialog supersedes any showing one; `notify` never
      // touches dialog state (foldExtensionUIRequest no-ops for it).
      return { ...state, dialog: foldExtensionUIRequest(state.dialog, frame) };
    default:
      // Recognized-but-ignored control frames (model_changed/ack/data/
      // display_widget/display_title/bash_*) — no v1 component renders them.
      return state;
  }
}

export type ChatAction = { kind: 'reset'; clientId: string } | { kind: 'frame'; frame: BrokerToClient } | { kind: 'dismiss-dialog' };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.kind) {
    case 'reset':
      return initialChatState(action.clientId);
    case 'frame':
      return foldBrokerFrame(state, action.frame);
    case 'dismiss-dialog':
      return { ...state, dialog: null };
  }
}
