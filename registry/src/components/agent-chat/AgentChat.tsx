// AgentChat.tsx — the batteries-included entry point (spec §10 `<AgentChat>`,
// §11 rung 1). Wires `<AgentChatProvider>` + the five compound parts,
// resolving `components` overrides for the five top-level slots directly
// here (they wrap the whole compound layout) and also forwarding the full
// `components` map into `<AgentChatProvider>` so nested leaves
// (`Message`/`ThinkingDisclosure`/`ToolCallCard`, rendered inside
// `<Transcript>`) can resolve their own overrides from context.

import type { BlockingDialogRequest, BusySendMode, ClientRole, DialogResponse, ToolRegistry } from '@crouton-kit/agent-chat-core';
import { cn } from '@/lib/utils';
import { AgentChatProvider } from './AgentChatProvider.js';
import { Dialogs } from './Dialogs.js';
import { QueueChips } from './QueueChips.js';
import { SendBar } from './SendBar.js';
import { StatusBar } from './StatusBar.js';
import { Transcript } from './Transcript.js';
import type {
  AgentChatClassNames,
  AgentChatComponents,
  AgentChatEventCallbacks,
  MarkdownConfig,
  RenderDialog,
  RenderEmpty,
  RenderMessage,
  RenderStatus,
  RenderThinking,
  RenderTool,
  ViewMode,
} from './types.js';

export interface AgentChatProps extends AgentChatEventCallbacks {
  nodeId: string | null;
  endpoint?: (nodeId: string) => string;
  onBeforeConnect?: (nodeId: string) => Promise<void>;
  role?: ClientRole;
  view?: ViewMode;
  busySendMode?: BusySendMode;
  toolRegistry?: ToolRegistry;
  reconnect?: { delayMs?: number; maxAttempts?: number };
  suggestions?: string[];
  renderMessage?: RenderMessage;
  renderTool?: RenderTool;
  renderThinking?: RenderThinking;
  renderStatus?: RenderStatus;
  renderDialog?: RenderDialog;
  renderEmpty?: RenderEmpty;
  onDialog?: (request: BlockingDialogRequest, respond: (r: DialogResponse) => void) => boolean;
  components?: AgentChatComponents;
  markdown?: MarkdownConfig;
  classNames?: AgentChatClassNames;
}

export function AgentChat({
  nodeId,
  endpoint,
  onBeforeConnect,
  role,
  view,
  busySendMode,
  toolRegistry,
  reconnect,
  suggestions,
  renderMessage,
  renderTool,
  renderThinking,
  renderStatus,
  renderDialog,
  renderEmpty,
  onDialog,
  components = {},
  markdown,
  classNames = {},
  onSend,
  onReceive,
  onToolCall,
  onError,
  onControlChange,
}: AgentChatProps) {
  const StatusBarComp = components.StatusBar ?? StatusBar;
  const TranscriptComp = components.Transcript ?? Transcript;
  const QueueChipsComp = components.QueueChips ?? QueueChips;
  const SendBarComp = components.SendBar ?? SendBar;
  const DialogsComp = components.Dialogs ?? Dialogs;

  return (
    <AgentChatProvider
      nodeId={nodeId}
      endpoint={endpoint}
      onBeforeConnect={onBeforeConnect}
      role={role}
      view={view}
      busySendMode={busySendMode}
      toolRegistry={toolRegistry}
      reconnect={reconnect}
      suggestions={suggestions}
      renderMessage={renderMessage}
      renderTool={renderTool}
      renderThinking={renderThinking}
      renderStatus={renderStatus}
      renderDialog={renderDialog}
      renderEmpty={renderEmpty}
      onDialog={onDialog}
      components={components}
      markdown={markdown}
      classNames={classNames}
      onSend={onSend}
      onReceive={onReceive}
      onToolCall={onToolCall}
      onError={onError}
      onControlChange={onControlChange}
    >
      <div data-slot="agent-chat" className={cn('flex h-full flex-col gap-2', classNames.root)}>
        <StatusBarComp />
        <TranscriptComp className={classNames.transcript} />
        <QueueChipsComp />
        <SendBarComp className={classNames.sendBar} />
        <DialogsComp />
      </div>
    </AgentChatProvider>
  );
}
