// wire-contract.test.ts — the drift guard for the two literal sets this
// package structurally mirrors from crtr. Per spec §18 ("fails loudly when
// crtr changes the protocol"), this test reads crtr's OWN source files at
// TEST TIME (fs.readFileSync against an absolute path — no crtr runtime
// dependency, never imported/shipped) and derives the live ground truth
// directly, instead of comparing against a list hand-copied into this file.
// If crtr adds/renames/removes a frame type, this test fails without anyone
// having to remember to update a hardcoded array here.
//
// Two live sources:
//  1. `crouter/src/core/runtime/broker-protocol.ts` — its own `BrokerToClient`
//     union. Every member except `AgentSessionEvent` is a broker CONTROL frame;
//     we resolve each member (interface or type-alias, recursively through
//     unions) down to its concrete `type: '...'` string literal(s).
//  2. `crouter/src/clients/web/web-client/transcript.ts` — crtr's own reference
//     reducer that folds `AgentSessionEvent`s (`reduce()`'s `switch (event.type)`
//     case labels). This is "wherever crtr folds them": crtr's pi dependency
//     defines a much larger `AgentSessionEvent` (turn_start/tool_execution_*/
//     compaction_*/queue_update/…), but core deliberately folds only the 5
//     transcript-relevant ones (spec §3) and ignores the rest via the
//     reducer's default case — so core's 5 must be a SUBSET of crtr's live
//     folded set (not equal to it), and must be disjoint from the live
//     control-frame set (the two namespaces never collide, per crtr's own
//     protocol.ts comment).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AGENT_SESSION_EVENT_TYPES, BROKER_CONTROL_FRAME_TYPES, isControlFrame, type AgentSessionEvent } from '../wire/protocol.js';

const here = dirname(fileURLToPath(import.meta.url));
const CRTR_BROKER_PROTOCOL_PATH = resolve(here, '../../../../../crouter/src/core/runtime/broker-protocol.ts');
const CRTR_TRANSCRIPT_REDUCER_PATH = resolve(here, '../../../../../crouter/src/clients/web/web-client/transcript.ts');

// ---------------------------------------------------------------------------
// Tiny structural parser — depth-aware so nested `{}`/`()`/`<>`/`[]` and
// embedded `;`/`|` inside object-literal union members don't truncate a match.
// ---------------------------------------------------------------------------

function extractBalancedBody(source: string, startIndex: number, open: string, close: string): string {
  let depth = 1;
  let i = startIndex;
  for (; i < source.length && depth > 0; i++) {
    if (source[i] === open) depth++;
    else if (source[i] === close) depth--;
  }
  return source.slice(startIndex, i - 1);
}

function findInterfaceBody(source: string, name: string): string | null {
  const marker = new RegExp(`export interface ${name}\\b[^{]*\\{`);
  const m = marker.exec(source);
  if (!m) return null;
  return extractBalancedBody(source, m.index + m[0].length, '{', '}');
}

function findTypeAliasBody(source: string, name: string): string | null {
  const marker = `export type ${name} =`;
  const idx = source.indexOf(marker);
  if (idx === -1) return null;
  // Scan to the top-level terminating `;` (depth-aware over {}/()/[]/<>).
  let depth = 0;
  let i = idx + marker.length;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{' || ch === '(' || ch === '[' || ch === '<') depth++;
    else if (ch === '}' || ch === ')' || ch === ']' || ch === '>') depth--;
    else if (ch === ';' && depth <= 0) break;
  }
  return source.slice(idx + marker.length, i);
}

/** Split a union body on TOP-LEVEL `|` only (not one nested inside a member's
 *  own object-literal type). */
function splitUnionMembers(body: string): string[] {
  const members: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '{' || ch === '(' || ch === '[' || ch === '<') depth++;
    else if (ch === '}' || ch === ')' || ch === ']' || ch === '>') depth--;
    if (ch === '|' && depth === 0) {
      members.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) members.push(current.trim());
  return members.filter(Boolean);
}

/** Resolve a type name (interface or union alias, recursively) down to the set
 *  of `type: '<literal>'` discriminant values its members carry. */
function resolveTypeLiterals(source: string, name: string, seen: Set<string> = new Set()): string[] {
  if (seen.has(name)) return [];
  seen.add(name);

  const iface = findInterfaceBody(source, name);
  if (iface !== null) {
    const m = /type:\s*'([a-zA-Z_]+)'/.exec(iface);
    return m ? [m[1]!] : [];
  }

  const alias = findTypeAliasBody(source, name);
  if (alias !== null) {
    return splitUnionMembers(alias).flatMap((member) => {
      const inline = /^\{[\s\S]*?type:\s*'([a-zA-Z_]+)'/.exec(member);
      if (inline) return [inline[1]!];
      const id = /^([A-Za-z_][A-Za-z0-9_]*)$/.exec(member);
      if (id) return resolveTypeLiterals(source, id[1]!, seen);
      return [];
    });
  }

  return [];
}

/** Every broker-control frame `type` literal crtr's own `BrokerToClient` union
 *  names (i.e. every union member except the raw-relayed `AgentSessionEvent`). */
function parseLiveControlFrameTypes(source: string): Set<string> {
  const body = findTypeAliasBody(source, 'BrokerToClient');
  if (body === null) throw new Error('could not find `export type BrokerToClient =` in crtr broker-protocol.ts — source shape changed, update the parser');
  const members = splitUnionMembers(body).filter((m) => m !== 'AgentSessionEvent');
  const types = new Set(members.flatMap((m) => resolveTypeLiterals(source, m)));
  if (types.size === 0) throw new Error('parsed zero control-frame types out of crtr broker-protocol.ts — parser likely broken, not a real empty set');
  return types;
}

/** The `AgentSessionEvent` `type` literals crtr's OWN reference reducer folds
 *  (`web-client/transcript.ts`'s `reduce()` — every `case '...':` label, minus
 *  `default`). This is strictly a subset of pi's much larger AgentSessionEvent
 *  union; it is the set crtr itself treats as transcript-relevant. */
function parseLiveFoldedEventTypes(source: string): Set<string> {
  const marker = 'switch (event.type) {';
  const idx = source.indexOf(marker);
  if (idx === -1) throw new Error("could not find `switch (event.type) {` in crtr's transcript.ts — source shape changed, update the parser");
  const body = extractBalancedBody(source, idx + marker.length, '{', '}');
  const cases = [...body.matchAll(/case '([a-zA-Z_]+)':/g)].map((m) => m[1]!);
  if (cases.length === 0) throw new Error('parsed zero case labels out of crtr transcript.ts reduce() — parser likely broken, not a real empty set');
  return new Set(cases);
}

const brokerProtocolSource = readFileSync(CRTR_BROKER_PROTOCOL_PATH, 'utf8');
const transcriptReducerSource = readFileSync(CRTR_TRANSCRIPT_REDUCER_PATH, 'utf8');

const liveControlFrameTypes = parseLiveControlFrameTypes(brokerProtocolSource);
const liveFoldedEventTypes = parseLiveFoldedEventTypes(transcriptReducerSource);

// Core's own folded set — the canonical literal exported from protocol.ts (not
// copied/duplicated here). Its correctness AS EXACTLY `AgentSessionEvent`'s
// literal set is enforced in protocol.ts itself by a compile-time bidirectional
// assertion, so if core's own union ever drifts from this list, `tsc --noEmit`
// goes red, independent of crtr.
const CORE_FOLDED_EVENT_TYPES: readonly string[] = AGENT_SESSION_EVENT_TYPES;

describe('wire-contract drift guard — control frame set (live crtr source)', () => {
  it('every live crtr control-frame type is recognized by isControlFrame', () => {
    for (const type of liveControlFrameTypes) {
      expect(isControlFrame(type), `expected isControlFrame('${type}') to be true (live crtr BrokerToClient member)`).toBe(true);
    }
  });

  it("core's own canonical control-frame set is EXACTLY equal (both directions) to crtr's live BrokerToClient control-frame set", () => {
    // Unlike a comparison restricted to `control ∪ folded` (which cannot see a
    // core recognizer for a type crtr no longer sends at all, since that type
    // falls out of the universe entirely), this compares core's UNRESTRICTED
    // canonical set directly against the live set. That makes it fail in
    // BOTH directions: crtr ADDING a control frame core doesn't know (core's
    // set is missing a live member) and crtr REMOVING one core still carries
    // as a stale recognizer (core's set has an extra member the live set lacks).
    expect(new Set(BROKER_CONTROL_FRAME_TYPES)).toEqual(liveControlFrameTypes);
  });

  it('isControlFrame rejects an unknown type (forward-compat default)', () => {
    expect(isControlFrame('some_future_frame_type_xyz')).toBe(false);
  });
});

describe('wire-contract drift guard — AgentSessionEvent literal set (live crtr source)', () => {
  it("core's folded set is a SUBSET of crtr's own live folded set (every name core relies on still exists upstream)", () => {
    for (const type of CORE_FOLDED_EVENT_TYPES) {
      expect(liveFoldedEventTypes.has(type), `expected crtr's own reducer to still fold '${type}' — core relies on this name`).toBe(true);
    }
  });

  it("core's folded set is disjoint from the live control-frame set (the two namespaces never collide)", () => {
    for (const type of CORE_FOLDED_EVENT_TYPES) {
      expect(liveControlFrameTypes.has(type), `'${type}' unexpectedly appears in the live control-frame set too`).toBe(false);
    }
  });

  // A compile-time exhaustiveness check: if `AgentSessionEvent` ever gains or
  // loses a `type` literal in core's OWN protocol.ts, this switch stops
  // typechecking (the `never` branch) and `pnpm typecheck` goes red.
  function assertKnownEventType(type: AgentSessionEvent['type']): void {
    switch (type) {
      case 'agent_start':
      case 'agent_end':
      case 'message_start':
      case 'message_update':
      case 'message_end':
        return;
      default: {
        const exhaustive: never = type;
        void exhaustive;
      }
    }
  }

  it('every CORE_FOLDED_EVENT_TYPES member is a valid AgentSessionEvent[\'type\'] (compiles + runs)', () => {
    for (const type of CORE_FOLDED_EVENT_TYPES) {
      expect(() => assertKnownEventType(type as AgentSessionEvent['type'])).not.toThrow();
    }
  });
});
