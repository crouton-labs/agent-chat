// MarkdownRenderer.tsx — the single seam between `<Message>` and whichever
// markdown renderer backs it (spec §16 GATED DEFAULT: streamdown). Swapping
// renderers is a one-file change — nothing else in the tree imports
// `streamdown` directly.

import { Streamdown, type Components } from 'streamdown';
import 'streamdown/styles.css';
import type { MarkdownConfig } from './types.js';

export function MarkdownRenderer({
  content,
  streaming,
  markdown,
}: {
  content: string;
  streaming: boolean;
  markdown?: MarkdownConfig;
}) {
  return (
    <Streamdown mode={streaming ? 'streaming' : 'static'} components={markdown?.components as Components | undefined}>
      {content}
    </Streamdown>
  );
}
