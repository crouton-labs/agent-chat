# Agent Chat

A batteries-included, fully customizable chat UI for a crtr agent node. The headless view model — attach lifecycle, the normalized transcript, activity derivation, the queue/steer/abort state machine, and dialog request/response — lives in the published npm package `@crouton-kit/agent-chat-core`; this registry item is copied source (base-ui `render=` composition, `lucide-react`, `base-nova` tokens) that you own and can edit like any other shadcn component.

## Install

```
npx shadcn add @crouton-kit/agent-chat
```

This pulls `src/components/agent-chat/*` into your project plus the seven shadcn primitives it depends on (`button`, `textarea`, `scroll-area`, `avatar`, `badge`, `dialog`, `collapsible`). Add the npm dependencies it declares — `@crouton-kit/agent-chat-core` and `streamdown` — with your package manager, since `shadcn add` does not install npm packages for you.

## Usage

```tsx
import { AgentChat } from '@/components/agent-chat';

<AgentChat nodeId={nodeId} onBeforeConnect={revive} />
```

`nodeId` is the crtr node id to attach to; pass `null` to render the shell without attempting a connection (useful for a harness or a loading state). `onBeforeConnect` is awaited before every WebSocket open, including revivable reconnects — a scaffolded app wires this to its own revive server function. Your app owns the transport requirement described in spec §5 (the attach-proxy route and the revive function); this component never assumes a specific backend beyond the `/v1/attach` wire contract.

## Customization

The full escape-hatch ladder — props on `<AgentChat>`, `classNames`, slot render-props that wrap the default renderer, `components` whole-part swaps, the compound form (`<AgentChatProvider>` + individual parts for full layout control), owning the copied source outright, or dropping to the headless `useAgentChat` hook directly — is documented inline in `src/components/agent-chat/types.ts` and demonstrated end-to-end in `AgentChat.tsx`. Every rung is independently sufficient; none forces a fork.

### Tool-registry override example

```tsx
import { createToolRegistry } from '@crouton-kit/agent-chat-core';

const coachTools = createToolRegistry({
  d1_query: { title: 'Looking at your data', icon: 'database' },
  webfetch: { title: (args) => `Reading ${args.url}`, icon: 'globe' },
});

<AgentChat nodeId={nodeId} onBeforeConnect={revive} toolRegistry={coachTools} />
```

Unknown tools fall back to a de-jargoned, title-cased name in the `user` view — never a raw `snake_case` string.

## Views

`view="user"` (default) shows clean text, markdown, and friendly one-line tool-call pills with no raw reasoning or tool args. `view="dev"` additionally shows the collapsible `<ThinkingDisclosure>` reasoning trace and expandable tool-call args/results. Controller dialogs (confirm/select/input/editor) render identically in both views — they are the human's answer path, not developer detail.
