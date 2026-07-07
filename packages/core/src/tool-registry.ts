// tool-registry.ts — friendly tool-call titles (spec §11). Unknown tools fall
// back to a de-jargoned, title-cased name — never a raw `snake_case` string.

import type { ReactNode } from 'react';
import type { ToolActivity } from './chat-item.js';

export interface ToolPresenter {
  title: string | ((args: Record<string, unknown>) => string);
  icon?: string;
  renderCall?: (a: ToolActivity) => ReactNode;
  renderResult?: (a: ToolActivity) => ReactNode;
}

export interface ToolRegistry {
  get(name: string): ToolPresenter | undefined;
  titleFor(name: string, args: Record<string, unknown>): string;
  iconFor(name: string): string | undefined;
}

/** "some_weird_tool" → "Some Weird Tool". The fallback for any tool name with no
 *  registered presenter — de-jargoned and title-cased, never raw snake_case. */
export function dejargonize(name: string): string {
  const spaced = name.replace(/[_-]+/g, ' ').trim();
  if (spaced === '') return name;
  return spaced.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

export function createToolRegistry(presenters: Record<string, ToolPresenter>): ToolRegistry {
  return {
    get: (name) => presenters[name],
    titleFor: (name, args) => {
      const presenter = presenters[name];
      if (presenter === undefined) return dejargonize(name);
      return typeof presenter.title === 'function' ? presenter.title(args) : presenter.title;
    },
    iconFor: (name) => presenters[name]?.icon,
  };
}

function pathArg(args: Record<string, unknown>): string {
  const value = args.path ?? args.file ?? args.filePath;
  return typeof value === 'string' ? value.split('/').pop() ?? value : 'a file';
}

/** Common crtr tools, de-jargoned into human phrasings. Extend/override via
 *  `toolRegistry` on `useAgentChat`/`<AgentChat>` (spec §11). */
export const defaultToolRegistry: ToolRegistry = createToolRegistry({
  bash: { title: 'Running a command', icon: 'terminal' },
  exec: { title: 'Running a command', icon: 'terminal' },
  Read: { title: (args) => `Reading ${pathArg(args)}`, icon: 'file-text' },
  read: { title: (args) => `Reading ${pathArg(args)}`, icon: 'file-text' },
  Write: { title: (args) => `Writing ${pathArg(args)}`, icon: 'file-edit' },
  write: { title: (args) => `Writing ${pathArg(args)}`, icon: 'file-edit' },
  Edit: { title: (args) => `Editing ${pathArg(args)}`, icon: 'file-edit' },
  edit: { title: (args) => `Editing ${pathArg(args)}`, icon: 'file-edit' },
  Grep: { title: 'Searching your files', icon: 'search' },
  grep: { title: 'Searching your files', icon: 'search' },
  Glob: { title: 'Looking for files', icon: 'search' },
  glob: { title: 'Looking for files', icon: 'search' },
  query: { title: 'Looking at your data', icon: 'database' },
  d1_query: { title: 'Looking at your data', icon: 'database' },
  search: { title: 'Searching the web', icon: 'search' },
  webfetch: { title: 'Reading a page', icon: 'globe' },
});
