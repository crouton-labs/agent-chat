// context.tsx — the compound-form context boundary (spec §10 `<AgentChatProvider>`).
// Carries the already-wrapped `useAgentChat` result plus every piece of the
// customization surface a default sub-component needs to read without
// prop-drilling.

'use client';

import { createContext, useContext } from 'react';
import type { ToolRegistry, UseAgentChatResult } from '@crouton-kit/agent-chat-core';
import type {
  AgentChatClassNames,
  AgentChatComponents,
  MarkdownConfig,
  Notice,
  RenderDialog,
  RenderEmpty,
  RenderMessage,
  RenderStatus,
  RenderThinking,
  RenderTool,
  ViewMode,
} from './types.js';

export interface AgentChatContextValue {
  chat: UseAgentChatResult;
  view: ViewMode;
  toolRegistry: ToolRegistry;
  classNames: AgentChatClassNames;
  components: AgentChatComponents;
  markdown?: MarkdownConfig;
  suggestions?: string[];
  renderMessage?: RenderMessage;
  renderTool?: RenderTool;
  renderThinking?: RenderThinking;
  renderStatus?: RenderStatus;
  renderDialog?: RenderDialog;
  renderEmpty?: RenderEmpty;
  notices: Notice[];
  dismissNotice: (id: string) => void;
}

export const AgentChatContext = createContext<AgentChatContextValue | null>(null);

export function useAgentChatContext(): AgentChatContextValue {
  const value = useContext(AgentChatContext);
  if (value === null) throw new Error('useAgentChatContext must be used within <AgentChatProvider>');
  return value;
}
