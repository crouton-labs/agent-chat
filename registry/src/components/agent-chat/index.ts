// index.ts — the public export barrel for the `agent-chat` registry item.
// Everything a consumer needs (every component + every public type) is
// reachable from here; nothing public should require a deep import into a
// sibling file.

export type {
  AgentChatClassNames,
  AgentChatComponents,
  AgentChatEventCallbacks,
  DialogsProps,
  MarkdownConfig,
  MessageProps,
  Notice,
  QueueChipsProps,
  RenderDialog,
  RenderEmpty,
  RenderMessage,
  RenderStatus,
  RenderThinking,
  RenderTool,
  SendBarProps,
  StatusBarProps,
  ThinkingDisclosureProps,
  ToolCallCardProps,
  ToolRegistry,
  TranscriptProps,
  ViewMode,
} from './types.js';

export { AgentChatContext, useAgentChatContext, type AgentChatContextValue } from './context.js';
export { AgentChatProvider, type AgentChatProviderProps } from './AgentChatProvider.js';
export { AgentChat, type AgentChatProps } from './AgentChat.js';
export { Transcript, MessageList } from './Transcript.js';
export { Message } from './Message.js';
export { ThinkingDisclosure } from './ThinkingDisclosure.js';
export { ToolCallCard } from './ToolCallCard.js';
export { StatusBar } from './StatusBar.js';
export { SendBar } from './SendBar.js';
export { QueueChips } from './QueueChips.js';
export { Dialogs } from './Dialogs.js';
export { MarkdownRenderer } from './MarkdownRenderer.js';
