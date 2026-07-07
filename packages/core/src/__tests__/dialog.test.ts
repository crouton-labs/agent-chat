// dialog.test.ts — spec §6/§9 dialog request/response plumbing.

import { describe, expect, it } from 'vitest';
import { answerResponseFrame, cancelResponseFrame, foldExtensionUIRequest, seedDialogFromWelcome } from '../dialog.js';
import type { BlockingDialogRequest, NotifyRequest } from '../wire/protocol.js';

const selectRequest: BlockingDialogRequest = { type: 'extension_ui_request', id: 'd1', method: 'select', title: 'Pick one', options: ['a', 'b'] };
const confirmRequest: BlockingDialogRequest = { type: 'extension_ui_request', id: 'd2', method: 'confirm', title: 'Sure?', message: 'Really do it?' };
const notifyRequest: NotifyRequest = { type: 'extension_ui_request', id: 'd3', method: 'notify', message: 'fyi' };

describe('seedDialogFromWelcome', () => {
  it('a present pending_dialog seeds dialog', () => {
    expect(seedDialogFromWelcome(selectRequest)).toBe(selectRequest);
  });
  it('an explicit null seeds null', () => {
    expect(seedDialogFromWelcome(null)).toBeNull();
  });
  it('absent (undefined) seeds null', () => {
    expect(seedDialogFromWelcome(undefined)).toBeNull();
  });
});

describe('foldExtensionUIRequest', () => {
  it('a new blocking request supersedes a currently-showing dialog', () => {
    expect(foldExtensionUIRequest(selectRequest, confirmRequest)).toBe(confirmRequest);
  });
  it('a blocking request replaces a null (no dialog showing)', () => {
    expect(foldExtensionUIRequest(null, selectRequest)).toBe(selectRequest);
  });
  it('a "notify" method never touches dialog state', () => {
    expect(foldExtensionUIRequest(selectRequest, notifyRequest)).toBe(selectRequest);
    expect(foldExtensionUIRequest(null, notifyRequest)).toBeNull();
  });
});

describe('cancelResponseFrame', () => {
  it('builds an explicit cancelled:true answer for the showing dialog', () => {
    expect(cancelResponseFrame(selectRequest)).toEqual({ type: 'extension_ui_response', id: 'd1', cancelled: true });
  });
  it('is undefined when there is no dialog to cancel', () => {
    expect(cancelResponseFrame(null)).toBeUndefined();
  });
});

describe('answerResponseFrame', () => {
  it('select → {id, value}', () => {
    expect(answerResponseFrame({ id: 'd1', value: 'a' })).toEqual({ type: 'extension_ui_response', id: 'd1', value: 'a' });
  });
  it('confirm → {id, confirmed}', () => {
    expect(answerResponseFrame({ id: 'd2', confirmed: true })).toEqual({ type: 'extension_ui_response', id: 'd2', confirmed: true });
  });
  it('input/editor answered → {id, value}', () => {
    expect(answerResponseFrame({ id: 'd4', value: 'typed text' })).toEqual({ type: 'extension_ui_response', id: 'd4', value: 'typed text' });
  });
  it('input/editor cancelled → {id, cancelled:true}', () => {
    expect(answerResponseFrame({ id: 'd4', cancelled: true })).toEqual({ type: 'extension_ui_response', id: 'd4', cancelled: true });
  });
});
