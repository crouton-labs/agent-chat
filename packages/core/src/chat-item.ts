// chat-item.ts — the normalized view model (spec §4). The UI renders
// `ChatItem[]` and never touches a raw pi message or content block.

export interface ImageRef {
  data: string;
  mimeType: string;
}

export interface ToolActivity {
  callId: string;
  name: string;
  title: string;
  icon?: string;
  args: Record<string, unknown>;
  status: 'running' | 'ok' | 'error';
  result?: { text: string; isError: boolean };
}

export type ChatItem =
  | { kind: 'user'; id: string; text: string; images?: ImageRef[]; pending?: boolean }
  | { kind: 'assistant'; id: string; markdown: string; streaming: boolean; images?: ImageRef[] }
  | { kind: 'thinking'; id: string; text: string; streaming: boolean; startedAt: number; endedAt?: number }
  | { kind: 'tool'; id: string; call: ToolActivity }
  | { kind: 'notice'; id: string; level: 'info' | 'error'; text: string };
