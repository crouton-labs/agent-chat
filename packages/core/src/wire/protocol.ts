// protocol.ts — the wire contract this package mirrors, in shape only. Core
// NEVER imports crtr at runtime (spec §2/§3); every type below is a structural
// copy of crtr's `broker-protocol.ts` + pi's `Message` union, verified against
// that source at build time and guarded against drift by
// `__tests__/wire-contract.test.ts`.
//
// Transport invariant: one complete JSON frame per WebSocket message. A frame
// that fails `JSON.parse` is dropped, never fatal. An unrecognized frame `type`
// flows through and is ignored by the reducer's default case (forward-compatible
// with a broker that adds frames this kit doesn't know about yet).

// ---------------------------------------------------------------------------
// pi message model (subset of `@earendil-works/pi-ai`'s `Message` union)
// ---------------------------------------------------------------------------

export interface TextContent {
  type: 'text';
  text: string;
}
export interface ThinkingContent {
  type: 'thinking';
  thinking: string;
  redacted?: boolean;
}
export interface ToolCall {
  type: 'toolCall';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
export interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

export interface UserMessage {
  role: 'user';
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}
export interface AssistantMessage {
  role: 'assistant';
  content: (TextContent | ThinkingContent | ToolCall)[];
  timestamp: number;
}
export interface ToolResultMessage {
  role: 'toolResult';
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  isError: boolean;
  timestamp: number;
}

/** A message as it appears in `snapshot.messages` / a `message_*` event: the pi
 *  `Message` union, or an app-custom message that still carries a `role`
 *  (e.g. `bashExecution`) — rendered generically by the normalizer (§4 rule 7). */
export type AnyMessage = UserMessage | AssistantMessage | ToolResultMessage | ({ role: string } & Record<string, unknown>);

export function isUserMessage(m: AnyMessage): m is UserMessage {
  return m.role === 'user';
}
export function isAssistantMessage(m: AnyMessage): m is AssistantMessage {
  return m.role === 'assistant';
}
export function isToolResultMessage(m: AnyMessage): m is ToolResultMessage {
  return m.role === 'toolResult';
}

// ---------------------------------------------------------------------------
// Broker snapshot (the welcome-frame replay payload)
// ---------------------------------------------------------------------------

export interface BrokerSnapshot {
  messages: AnyMessage[];
  state: {
    isStreaming: boolean;
  };
}

// ---------------------------------------------------------------------------
// Extension dialog RPC (pi's rpc-types, mirrored — spec §6)
// ---------------------------------------------------------------------------

/** The four blocking dialog methods — each forwarded to the controller only,
 *  blocking the agent's turn until answered (or a broker-side timeout fires). */
export type BlockingDialogRequest =
  | { type: 'extension_ui_request'; id: string; method: 'select'; title: string; options: string[]; timeout?: number }
  | { type: 'extension_ui_request'; id: string; method: 'confirm'; title: string; message: string; timeout?: number }
  | { type: 'extension_ui_request'; id: string; method: 'input'; title: string; placeholder?: string; timeout?: number }
  | { type: 'extension_ui_request'; id: string; method: 'editor'; title: string; prefill?: string };

/** Non-blocking — broadcast to every client, no response expected. */
export interface NotifyRequest {
  type: 'extension_ui_request';
  id: string;
  method: 'notify';
  message: string;
  notifyType?: 'info' | 'warning' | 'error';
}

/** Everything that can arrive as an `extension_ui_request` frame. */
export type ExtensionUIRequestFrame = BlockingDialogRequest | NotifyRequest;

export function isBlockingDialogRequest(req: ExtensionUIRequestFrame): req is BlockingDialogRequest {
  return req.method === 'select' || req.method === 'confirm' || req.method === 'input' || req.method === 'editor';
}

/** The controller's answer to a blocking dialog. `{cancelled:true}` is sent both
 *  on an explicit Cancel and on dismiss (Escape/backdrop) — an immediate answer
 *  so the agent's turn resolves instead of waiting out the broker's timeout. */
export type DialogResponse = { id: string; value: string } | { id: string; confirmed: boolean } | { id: string; cancelled: true };

export interface ExtensionUIResponseFrame {
  type: 'extension_ui_response';
}

// ---------------------------------------------------------------------------
// Client → broker frames (the chat subset the kit sends — spec §3)
// ---------------------------------------------------------------------------

export type ClientRole = 'controller' | 'observer';

export interface HelloFrame {
  type: 'hello';
  role: ClientRole;
  client_id: string;
}
export interface PromptFrame {
  type: 'prompt';
  text: string;
}
export interface SteerFrame {
  type: 'steer';
  text: string;
}
export interface AbortFrame {
  type: 'abort';
}
export interface RequestControlFrame {
  type: 'request_control';
}
export type WireExtensionUIResponseFrame = ExtensionUIResponseFrame & DialogResponse;

export type ClientToBroker = HelloFrame | PromptFrame | SteerFrame | AbortFrame | RequestControlFrame | WireExtensionUIResponseFrame;

// ---------------------------------------------------------------------------
// Broker → client control frames (the ones the kit routes explicitly — spec §3)
// ---------------------------------------------------------------------------

export interface WelcomeFrame {
  type: 'welcome';
  snapshot: BrokerSnapshot;
  controller_id: string | null;
  role?: ClientRole;
  /** The single still-in-flight blocking dialog for a controller attaching or
   *  reconnecting mid-dialog; always `null`/absent for an observer. */
  pending_dialog?: BlockingDialogRequest | null;
  agentDir?: string;
}
export interface ControlChangedFrame {
  type: 'control_changed';
  controller_id: string | null;
}
export interface ErrorFrame {
  type: 'error';
  code: string;
  message: string;
  id?: string;
}
/** A keyed status map entry — `text === undefined` clears that key. */
export interface DisplayStatusFrame {
  type: 'display_status';
  key: string;
  text: string | undefined;
}

// ---------------------------------------------------------------------------
// Recognized-but-ignored control frames (spec §3) — no v1 component renders
// these, but they are real frames `BrokerClient` can pass to `onFrame` at
// runtime, so the public union names them explicitly rather than leaving
// `BrokerToClient` unsound for them. Mirrors crtr's `broker-protocol.ts`
// shapes (verified: `model_changed` ~L397, `ack` ~L416, `data`/`BrokerDataFrame`
// ~L518, `display_widget` ~L609, `display_title` ~L616, `bash_start`/
// `bash_output`/`bash_end` ~L433-445).
// ---------------------------------------------------------------------------

/** Broadcast after a successful `set_model`/`cycle_model`. */
export interface ModelChangedFrame {
  type: 'model_changed';
  model: string | undefined;
}

/** Result of a controller command op; `for` echoes the op name. */
export interface AckFrame {
  type: 'ack';
  for: string;
  ok: boolean;
  detail?: string;
}

/** A correlated read-op/dequeue reply (`list_models`/`list_sessions`/`get_tree`/
 *  `get_settings`/`list_scoped_models`/`dequeue`, discriminated by `kind`). Out
 *  of scope for v1 (no read-op/dequeue request is ever sent), so the shape is
 *  intentionally minimal — just enough for `BrokerToClient` to type it soundly. */
export interface DataFrame {
  type: 'data';
  id: string;
  kind: string;
}

/** `ctx.ui.setWidget(key, lines, {placement})` — `lines===undefined` clears the key. */
export interface DisplayWidgetFrame {
  type: 'display_widget';
  key: string;
  lines: string[] | undefined;
  placement: 'aboveEditor' | 'belowEditor';
}

/** `ctx.ui.setTitle(title)` — the terminal window/tab title. */
export interface DisplayTitleFrame {
  type: 'display_title';
  title: string;
}

/** A `!` bash run has begun — broadcast to every viewer. */
export interface BashStartFrame {
  type: 'bash_start';
  command: string;
  excludeFromContext?: boolean;
}

/** A streamed chunk of combined stdout+stderr for the in-flight `!` run. */
export interface BashOutputFrame {
  type: 'bash_output';
  chunk: string;
}

/** The `!` run finished. */
export interface BashEndFrame {
  type: 'bash_end';
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
}

/** Every broker control-frame `type` — recognized so it never falls through to
 *  the pi-event reducer as a bogus `AgentSessionEvent` (spec §3). `display_widget`/
 *  `display_title`/`bash_*`/`model_changed`/`ack`/`data` are recognized-but-ignored
 *  in v1 (no v1 component renders them).
 *
 *  This is the SINGLE canonical, exported source of truth for the control-frame
 *  namespace — `isControlFrame` is BUILT FROM it (never a separately maintained
 *  list), and `__tests__/wire-contract.test.ts` diffs it directly against
 *  crtr's live `BrokerToClient` union so the two can never silently drift
 *  (catches crtr ADDING or REMOVING a control frame type). */
export const BROKER_CONTROL_FRAME_TYPES = [
  'welcome',
  'control_changed',
  'model_changed',
  'error',
  'ack',
  'data',
  'display_status',
  'display_widget',
  'display_title',
  'bash_start',
  'bash_output',
  'bash_end',
  'extension_ui_request',
] as const;

const BROKER_CONTROL_FRAME_TYPE_SET: ReadonlySet<string> = new Set(BROKER_CONTROL_FRAME_TYPES);

export function isControlFrame(type: string): boolean {
  return BROKER_CONTROL_FRAME_TYPE_SET.has(type);
}

// ---------------------------------------------------------------------------
// pi AgentSessionEvent subset the transcript reducer folds (spec §3)
// ---------------------------------------------------------------------------

export type AgentSessionEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end'; messages: AnyMessage[] }
  | { type: 'message_start'; message: AnyMessage }
  | { type: 'message_update'; message: AnyMessage }
  | { type: 'message_end'; message: AnyMessage };

// The canonical, exported literal set of `AgentSessionEvent['type']` values —
// the SAME 5 names as the union above, kept in sync with it at compile time by
// the exhaustiveness assertion just below (never hand-duplicated in a test).
// This is deliberately a SUBSET of what crtr's own reference reducer folds
// (crtr's pi dependency defines a larger `AgentSessionEvent` with turn_start,
// tool_execution_start/end, compaction_start/end, queue_update, etc — see spec
// §3); core folds only these 5 transcript-relevant ones.
export const AGENT_SESSION_EVENT_TYPES = ['agent_start', 'agent_end', 'message_start', 'message_update', 'message_end'] as const;

// Compile-time, bidirectional assertion that AGENT_SESSION_EVENT_TYPES names
// EXACTLY the literals of AgentSessionEvent['type'] — no more, no less. If
// either list gains/loses a member without the other following, this becomes
// `never` and `tsc --noEmit` goes red, independent of crtr.
type _AgentSessionEventTypeLiteral = AgentSessionEvent['type'];
type _AssertAgentSessionEventTypesExact =
  [_AgentSessionEventTypeLiteral] extends [(typeof AGENT_SESSION_EVENT_TYPES)[number]]
    ? [(typeof AGENT_SESSION_EVENT_TYPES)[number]] extends [_AgentSessionEventTypeLiteral]
      ? true
      : never
    : never;
const _assertAgentSessionEventTypesExact: _AssertAgentSessionEventTypesExact = true;
void _assertAgentSessionEventTypesExact;

/** Everything a broker can send. A control frame narrows to one of the named
 *  interfaces above; anything else is assumed to be a raw `AgentSessionEvent`.
 *  Deliberately NOT given a generic `{ type: string }` catch-all member — that
 *  would match every literal in a `switch (frame.type)` and defeat
 *  discriminated-union narrowing (mirrors crtr's own protocol.ts note). A frame
 *  of a wire type this union doesn't know still flows through at runtime
 *  (`BrokerClient` does a bare `JSON.parse`, no schema validation) and is
 *  handled via an explicit cast at the one call site that folds frames. */
export type BrokerToClient =
  | WelcomeFrame
  | ControlChangedFrame
  | ErrorFrame
  | DisplayStatusFrame
  | ModelChangedFrame
  | AckFrame
  | DataFrame
  | DisplayWidgetFrame
  | DisplayTitleFrame
  | BashStartFrame
  | BashOutputFrame
  | BashEndFrame
  | ExtensionUIRequestFrame
  | AgentSessionEvent;
