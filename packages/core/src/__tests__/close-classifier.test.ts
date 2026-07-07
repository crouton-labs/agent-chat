// close-classifier.test.ts — spec §7 table, exhaustively.

import { describe, expect, it } from 'vitest';
import { classifyClose } from '../wire/close-classifier.js';

describe('classifyClose', () => {
  it('1008 (any reason) is fatal-invalid', () => {
    expect(classifyClose(1008, 'malformed client id')).toBe('fatal-invalid');
    expect(classifyClose(1008, '')).toBe('fatal-invalid');
  });

  it('1011 + reason starting "no node" (case-insensitive) is fatal-gone', () => {
    expect(classifyClose(1011, 'no node with that id')).toBe('fatal-gone');
    expect(classifyClose(1011, 'No Node found')).toBe('fatal-gone');
    expect(classifyClose(1011, 'NO NODE')).toBe('fatal-gone');
  });

  it('1011 + reason starting "no running broker" (case-insensitive) is transient', () => {
    expect(classifyClose(1011, 'no running broker for this node')).toBe('transient');
    expect(classifyClose(1011, 'No Running Broker')).toBe('transient');
  });

  it('1011 with an unmatched reason is transient', () => {
    expect(classifyClose(1011, 'something else entirely')).toBe('transient');
    expect(classifyClose(1011, '')).toBe('transient');
  });

  it('1009 (message too big) is transient', () => {
    expect(classifyClose(1009, 'message too large')).toBe('transient');
  });

  it('1000 (clean close) is normal', () => {
    expect(classifyClose(1000, '')).toBe('normal');
    expect(classifyClose(1000, 'bye')).toBe('normal');
  });

  it('a random other close code is transient', () => {
    expect(classifyClose(4000, 'app-specific')).toBe('transient');
    expect(classifyClose(1006, 'abnormal closure')).toBe('transient');
  });
});
