// types.ts — the public, renderer-agnostic type surface for the registry's
// agent-chat components (spec §11). Everything here is either a type-only
// re-export of core's view model or a registry-only concept (view mode,
// classNames, the render-prop slots, the toast-facing `Notice`). No runtime
// code lives in this file.

import type { ComponentType, ReactNode } from 'react';
import type {
  Activity,
  BlockingDialogRequest,
  ChatItem,
  ChatStatus,
  ClientRole,
  DialogResponse,
  ToolActivity,
  ToolRegistry,
} from '@crouton-kit/agent-chat-core';

/** `user` (default, end-user-safe) or `dev` (adds reasoning + expandable tool
 *  args/result) — spec §12. */
export type ViewMode = 'user' | 'dev';

/** Per-slot className overrides for the batteries-included `<AgentChat>` and
 *  its default sub-components — spec §11 rung 2. */
export interface AgentChatClassNames {
  root?: string;
  transcript?: string;
  bubbleUser?: string;
  bubbleAssistant?: string;
  sendBar?: string;
  statusBar?: string;
}

/** A registry-side toast/notice — NOT the `ChatItem{kind:'notice'}` transcript
 *  row (that's a normalizer fallback for an unknown message role, spec §4
 *  rule 7). This `Notice` is derived from wire `error` frames and `notify`
 *  `extension_ui_request`s (the notice/toast GAP — core has no public notice
 *  field, see `AgentChatProvider`). */
export interface Notice {
  id: string;
  level: 'info' | 'warning' | 'error';
  text: string;
}

/** Renderer-agnostic markdown config: a loose component-name → component map.
 *  The concrete `Components` type of whichever renderer backs `MarkdownRenderer`
 *  is cast at that one call site — this seam must stay renderer-agnostic
 *  (spec §16). */
export interface MarkdownConfig {
  components?: Record<string, ComponentType<any>>;
}

export type UserOrAssistantItem = Extract<ChatItem, { kind: 'user' } | { kind: 'assistant' }>;
export type ThinkingItem = Extract<ChatItem, { kind: 'thinking' }>;

export interface MessageProps {
  item: UserOrAssistantItem;
}

export interface ThinkingDisclosureProps {
  item: ThinkingItem;
}

export interface ToolCallCardProps {
  call: ToolActivity;
}

export interface StatusBarProps {
  className?: string;
}

export interface SendBarProps {
  placeholder?: string;
  className?: string;
}

export interface QueueChipsProps {
  className?: string;
}

export interface DialogsProps {
  className?: string;
}

export interface TranscriptProps {
  className?: string;
}

/** Whole-part swaps — spec §11 rung 4. `<AgentChat>` resolves `StatusBar`,
 *  `Transcript`, `QueueChips`, `SendBar`, and `Dialogs` itself (they wrap the
 *  whole compound layout); the full map also flows into context via
 *  `<AgentChatProvider>` so `<Transcript>` can resolve `Message`,
 *  `ThinkingDisclosure`, and `ToolCallCard` overrides for the leaves it
 *  renders internally, regardless of whether `<AgentChat>` or the compound
 *  form is in use. */
export interface AgentChatComponents {
  Transcript?: ComponentType<TranscriptProps>;
  Message?: ComponentType<MessageProps>;
  ThinkingDisclosure?: ComponentType<ThinkingDisclosureProps>;
  ToolCallCard?: ComponentType<ToolCallCardProps>;
  StatusBar?: ComponentType<StatusBarProps>;
  SendBar?: ComponentType<SendBarProps>;
  QueueChips?: ComponentType<QueueChipsProps>;
  Dialogs?: ComponentType<DialogsProps>;
}

/** Slot render-props — wrap, don't replace, the default `D` (spec §11 rung 3).
 *  `D` is typed as `ComponentType`, not a plain function signature, so it
 *  accepts whatever `<Transcript>` resolves as the current default — the
 *  built-in component, or a `components.X` whole-part swap (rung 4) when one
 *  is in play — and is always used as `<D .../>` (JSX), never called as a
 *  function directly. */
export type RenderMessage = (item: UserOrAssistantItem, Default: ComponentType<MessageProps>) => ReactNode;
export type RenderTool = (activity: ToolActivity, Default: ComponentType<ToolCallCardProps>) => ReactNode;
export type RenderThinking = (item: ThinkingItem, Default: ComponentType<ThinkingDisclosureProps>) => ReactNode;
export type RenderStatus = (
  activity: Activity,
  status: ChatStatus,
  Default: (p: { activity: Activity; status: ChatStatus }) => ReactNode,
) => ReactNode;
export type RenderDialog = (
  request: BlockingDialogRequest,
  respond: (r: DialogResponse) => void,
  Default: (p: { request: BlockingDialogRequest; respond: (r: DialogResponse) => void }) => ReactNode,
) => ReactNode;
export type RenderEmpty = () => ReactNode;

/** Observability / analytics event callbacks — spec §11. */
export interface AgentChatEventCallbacks {
  onSend?: (text: string) => void;
  onReceive?: (item: ChatItem) => void;
  onToolCall?: (call: ToolActivity) => void;
  onError?: (error: Error) => void;
  onControlChange?: (control: ClientRole) => void;
}

export type { ToolRegistry };
