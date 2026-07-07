// chat-reducer.test.ts — spec §3/§6/§9. The pure, framework-free combination
// of transcript + display-status + dialog folding over BrokerToClient frames.

import { describe, expect, it } from 'vitest';
import { chatReducer, foldBrokerFrame, initialChatState } from '../chat-reducer.js';
import type { BlockingDialogRequest, BrokerToClient, WelcomeFrame } from '../wire/protocol.js';

const CLIENT_ID = 'client-abc';

function welcome(overrides: Partial<WelcomeFrame> = {}): WelcomeFrame {
  return {
    type: 'welcome',
    snapshot: { messages: [], state: { isStreaming: false } },
    controller_id: null,
    pending_dialog: null,
    ...overrides,
  };
}

describe('initialChatState', () => {
  it('starts as an observer with no dialog, no notice, empty display status', () => {
    const state = initialChatState(CLIENT_ID);
    expect(state.clientId).toBe(CLIENT_ID);
    expect(state.control).toBe('observer');
    expect(state.controllerId).toBeNull();
    expect(state.dialog).toBeNull();
    expect(state.notice).toBeNull();
    expect(state.displayStatus.size).toBe(0);
  });
});

describe('foldBrokerFrame — welcome', () => {
  it('seeds transcript + controller/control + dialog wholesale, and clears any prior notice', () => {
    const withNotice = { ...initialChatState(CLIENT_ID), notice: 'stale error' };
    const frame = welcome({ controller_id: CLIENT_ID, snapshot: { messages: [{ role: 'user', content: 'hi', timestamp: 0 }], state: { isStreaming: false } } });
    const state = foldBrokerFrame(withNotice, frame);
    expect(state.conv.messages).toHaveLength(1);
    expect(state.controllerId).toBe(CLIENT_ID);
    expect(state.control).toBe('controller');
    expect(state.notice).toBeNull();
  });

  it('observer case: controller_id !== clientId AND pending_dialog:null → control "observer" AND dialog null', () => {
    const frame = welcome({ controller_id: 'someone-else', pending_dialog: null });
    const state = foldBrokerFrame(initialChatState(CLIENT_ID), frame);
    expect(state.control).toBe('observer');
    expect(state.dialog).toBeNull();
  });

  it('seeds a pending_dialog present on the welcome frame (re-show after a recovered drop)', () => {
    const dialog: BlockingDialogRequest = { type: 'extension_ui_request', id: 'd1', method: 'confirm', title: 'Sure?', message: 'Continue?' };
    const frame = welcome({ controller_id: CLIENT_ID, pending_dialog: dialog });
    const state = foldBrokerFrame(initialChatState(CLIENT_ID), frame);
    expect(state.dialog).toBe(dialog);
  });

  it('a prior display status disappears after a second welcome (reconnect is authoritative, no stale keys)', () => {
    const withStatus = foldBrokerFrame(initialChatState(CLIENT_ID), { type: 'display_status', key: 'phase', text: 'Deploying…' });
    expect([...withStatus.displayStatus.entries()]).toEqual([['phase', 'Deploying…']]);

    const state = foldBrokerFrame(withStatus, welcome({ controller_id: CLIENT_ID }));
    expect(state.displayStatus.size).toBe(0);
  });

  it('reconnect: a second welcome re-seeds wholesale, leaving no trace of the prior connection', () => {
    const oldDialog: BlockingDialogRequest = { type: 'extension_ui_request', id: 'old', method: 'confirm', title: 'x', message: 'y' };
    let state = foldBrokerFrame(initialChatState(CLIENT_ID), welcome({ controller_id: CLIENT_ID, pending_dialog: oldDialog, snapshot: { messages: [{ role: 'user', content: 'first-connection', timestamp: 0 }], state: { isStreaming: false } } }));
    expect(state.dialog).toBe(oldDialog);

    state = foldBrokerFrame(state, welcome({ controller_id: CLIENT_ID, pending_dialog: null, snapshot: { messages: [{ role: 'user', content: 'after-reconnect', timestamp: 0 }], state: { isStreaming: false } } }));
    expect(state.dialog).toBeNull();
    expect(state.conv.messages).toHaveLength(1);
    expect(state.conv.messages[0]).toMatchObject({ content: 'after-reconnect' });
  });
});

describe('foldBrokerFrame — control_changed', () => {
  it('updates controllerId/control only, leaving transcript/dialog untouched when this client remains/becomes controller', () => {
    const seeded = foldBrokerFrame(initialChatState(CLIENT_ID), welcome({ controller_id: 'other' }));
    const state = foldBrokerFrame(seeded, { type: 'control_changed', controller_id: CLIENT_ID });
    expect(state.control).toBe('controller');
    expect(state.controllerId).toBe(CLIENT_ID);
    expect(state.conv).toBe(seeded.conv);
  });

  it('losing control while a dialog is open closes it (spec §6)', () => {
    const withDialog = foldBrokerFrame(
      initialChatState(CLIENT_ID),
      welcome({ controller_id: CLIENT_ID, pending_dialog: { type: 'extension_ui_request', id: 'd1', method: 'confirm', title: 't', message: 'm' } }),
    );
    expect(withDialog.dialog).not.toBeNull();

    const state = foldBrokerFrame(withDialog, { type: 'control_changed', controller_id: 'someone-else' });
    expect(state.control).toBe('observer');
    expect(state.dialog).toBeNull();
  });

  it('a control_changed that keeps this client as controller leaves an open dialog untouched', () => {
    const withDialog = foldBrokerFrame(
      initialChatState(CLIENT_ID),
      welcome({ controller_id: CLIENT_ID, pending_dialog: { type: 'extension_ui_request', id: 'd1', method: 'confirm', title: 't', message: 'm' } }),
    );
    const state = foldBrokerFrame(withDialog, { type: 'control_changed', controller_id: CLIENT_ID });
    expect(state.dialog).not.toBeNull();
  });
});

describe('foldBrokerFrame — error', () => {
  it('not_controller becomes a read-only notice', () => {
    const state = foldBrokerFrame(initialChatState(CLIENT_ID), { type: 'error', code: 'not_controller', message: '' });
    expect(state.notice).toBe('read-only — another viewer is the controller');
  });

  it('another error code surfaces its message, falling back to the code', () => {
    const withMessage = foldBrokerFrame(initialChatState(CLIENT_ID), { type: 'error', code: 'bad_request', message: 'nope' });
    expect(withMessage.notice).toBe('nope');
    const withoutMessage = foldBrokerFrame(initialChatState(CLIENT_ID), { type: 'error', code: 'bad_request', message: '' });
    expect(withoutMessage.notice).toBe('error: bad_request');
  });
});

describe('foldBrokerFrame — display_status', () => {
  it('folds into the keyed display status map', () => {
    const state = foldBrokerFrame(initialChatState(CLIENT_ID), { type: 'display_status', key: 'phase', text: 'Deploying…' });
    expect([...state.displayStatus.entries()]).toEqual([['phase', 'Deploying…']]);
  });
});

describe('foldBrokerFrame — extension_ui_request', () => {
  it('a blocking request sets/supersedes the dialog', () => {
    const state = foldBrokerFrame(initialChatState(CLIENT_ID), { type: 'extension_ui_request', id: 'd1', method: 'select', title: 't', options: ['a'] });
    expect(state.dialog).toMatchObject({ id: 'd1', method: 'select' });
  });

  it('notify never touches dialog state', () => {
    const state = foldBrokerFrame(initialChatState(CLIENT_ID), { type: 'extension_ui_request', id: 'd1', method: 'notify', message: 'fyi' });
    expect(state.dialog).toBeNull();
  });
});

describe('foldBrokerFrame — recognized-but-ignored control frames', () => {
  it('model_changed/ack/data/display_widget/display_title/bash_* are no-ops', () => {
    const seeded = initialChatState(CLIENT_ID);
    const frames: BrokerToClient[] = [
      { type: 'model_changed' } as unknown as BrokerToClient,
      { type: 'ack' } as unknown as BrokerToClient,
      { type: 'data' } as unknown as BrokerToClient,
      { type: 'display_widget' } as unknown as BrokerToClient,
      { type: 'display_title' } as unknown as BrokerToClient,
      { type: 'bash_start' } as unknown as BrokerToClient,
      { type: 'bash_output' } as unknown as BrokerToClient,
      { type: 'bash_end' } as unknown as BrokerToClient,
    ];
    for (const frame of frames) {
      expect(foldBrokerFrame(seeded, frame)).toEqual(seeded);
    }
  });
});

describe('foldBrokerFrame — non-control frames fold into the transcript', () => {
  it('an AgentSessionEvent (e.g. agent_start) reaches the transcript reducer', () => {
    const state = foldBrokerFrame(initialChatState(CLIENT_ID), { type: 'agent_start' });
    expect(state.conv.isStreaming).toBe(true);
  });
});

describe('chatReducer', () => {
  it('"reset" replaces state with a fresh initialChatState for the given clientId', () => {
    const dirty = foldBrokerFrame(initialChatState(CLIENT_ID), welcome({ controller_id: CLIENT_ID }));
    const state = chatReducer(dirty, { kind: 'reset', clientId: 'new-client' });
    expect(state).toEqual(initialChatState('new-client'));
  });

  it('"frame" delegates to foldBrokerFrame', () => {
    const state = chatReducer(initialChatState(CLIENT_ID), { kind: 'frame', frame: { type: 'display_status', key: 'k', text: 'v' } });
    expect([...state.displayStatus.entries()]).toEqual([['k', 'v']]);
  });

  it('"dismiss-dialog" clears the dialog', () => {
    const withDialog = foldBrokerFrame(initialChatState(CLIENT_ID), { type: 'extension_ui_request', id: 'd1', method: 'confirm', title: 't', message: 'm' });
    const state = chatReducer(withDialog, { kind: 'dismiss-dialog' });
    expect(state.dialog).toBeNull();
  });
});
