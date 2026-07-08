// index.ts — the public export barrel for @crouton-kit/agent-chat-core.
// Everything a consumer (the registry UI package, or any hand-rolled app)
// needs is reachable from here — nothing public should require a deep import
// into a module path.

// ---------------------------------------------------------------------------
// wire/protocol — pi message model, dialog RPC, client/broker frame unions
// ---------------------------------------------------------------------------
export type {
  TextContent,
  ThinkingContent,
  ToolCall,
  ImageContent,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  AnyMessage,
  BrokerSnapshot,
  BlockingDialogRequest,
  NotifyRequest,
  ExtensionUIRequestFrame,
  DialogResponse,
  ExtensionUIResponseFrame,
  ClientRole,
  HelloFrame,
  PromptFrame,
  SteerFrame,
  AbortFrame,
  RequestControlFrame,
  WireExtensionUIResponseFrame,
  ClientToBroker,
  WelcomeFrame,
  ControlChangedFrame,
  ErrorFrame,
  DisplayStatusFrame,
  ModelChangedFrame,
  AckFrame,
  DataFrame,
  DisplayWidgetFrame,
  DisplayTitleFrame,
  BashStartFrame,
  BashOutputFrame,
  BashEndFrame,
  AgentSessionEvent,
  BrokerToClient,
} from './wire/protocol.js';
export { isUserMessage, isAssistantMessage, isToolResultMessage, isBlockingDialogRequest, isControlFrame, BROKER_CONTROL_FRAME_TYPES, AGENT_SESSION_EVENT_TYPES } from './wire/protocol.js';

// ---------------------------------------------------------------------------
// wire/close-classifier
// ---------------------------------------------------------------------------
export type { CloseKind } from './wire/close-classifier.js';
export { classifyClose } from './wire/close-classifier.js';

// ---------------------------------------------------------------------------
// wire/broker-client
// ---------------------------------------------------------------------------
export type { BrokerClientHandlers } from './wire/broker-client.js';
export { BrokerClient } from './wire/broker-client.js';

// ---------------------------------------------------------------------------
// connect-error — the typed fatal `onBeforeConnect` signal
// ---------------------------------------------------------------------------
export type { ConnectErrorKind } from './connect-error.js';
export { FatalConnectError, isFatalConnectError } from './connect-error.js';

// ---------------------------------------------------------------------------
// chat-item — the normalized view model
// ---------------------------------------------------------------------------
export type { ImageRef, ToolActivity, ChatItem } from './chat-item.js';

// ---------------------------------------------------------------------------
// tool-registry
// ---------------------------------------------------------------------------
export type { ToolPresenter, ToolRegistry } from './tool-registry.js';
export { createToolRegistry, dejargonize, defaultToolRegistry } from './tool-registry.js';

// ---------------------------------------------------------------------------
// normalizer
// ---------------------------------------------------------------------------
export type { NormalizeOptions } from './normalizer.js';
export { normalizeMessages } from './normalizer.js';

// ---------------------------------------------------------------------------
// transcript
// ---------------------------------------------------------------------------
export type { ConvState } from './transcript.js';
export { initialConvState, applySnapshot, reduce } from './transcript.js';

// ---------------------------------------------------------------------------
// activity
// ---------------------------------------------------------------------------
export type { Activity, DisplayStatusMap, DeriveActivityInput } from './activity.js';
export { emptyDisplayStatus, applyDisplayStatus, deriveActivity } from './activity.js';

// ---------------------------------------------------------------------------
// queue
// ---------------------------------------------------------------------------
export type { BusySendMode, SendRoute } from './queue.js';
export { routeSend, flushQueueOnAgentEnd, cancelQueued } from './queue.js';

// ---------------------------------------------------------------------------
// dialog
// ---------------------------------------------------------------------------
export type { DialogRequest } from './dialog.js';
export { seedDialogFromWelcome, foldExtensionUIRequest, cancelResponseFrame, answerResponseFrame } from './dialog.js';

// ---------------------------------------------------------------------------
// revive-fold
// ---------------------------------------------------------------------------
export type { ReviveExecFrame, UnknownReviveExecFrame, ReviveResult, ReviveOutcome, ReviveFoldState, ReviveFoldStep } from './revive-fold.js';
export { initReviveFold, foldReviveFrame, foldReviveFrames } from './revive-fold.js';

// ---------------------------------------------------------------------------
// chat-reducer
// ---------------------------------------------------------------------------
export type { ChatState, ChatAction } from './chat-reducer.js';
export { initialChatState, foldBrokerFrame, chatReducer } from './chat-reducer.js';

// ---------------------------------------------------------------------------
// use-agent-chat — the headless React hook
// ---------------------------------------------------------------------------
export type { ChatStatus, ChatEvent, FatalError, UseAgentChatOptions, UseAgentChatActions, UseAgentChatResult } from './use-agent-chat.js';
export { useAgentChat } from './use-agent-chat.js';
