# agent-chat — a chat UI kit for crouter agent nodes: a headless engine and copyable React components

![agent-chat](https://raw.githubusercontent.com/crouton-labs/agent-chat/main/assets/banner.svg)

<p align="center">
  <a href="https://www.npmjs.com/package/@crouton-kit/agent-chat-core"><img alt="npm" src="https://img.shields.io/npm/v/@crouton-kit/agent-chat-core?label=agent-chat-core"></a>
  <a href="https://nodejs.org"><img alt="node" src="https://img.shields.io/badge/node-%3E%3D20-339933"></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-GPL--3.0-blue"></a>
  <a href="https://discord.gg/afwW4saEtr"><img alt="discord" src="https://img.shields.io/badge/discord-join-5865F2?logo=discord&logoColor=white"></a>
</p>

agent-chat is the code for putting a chat window on a [crouter](https://github.com/crouton-labs/crouter) agent node in a React app. It has two parts. `@crouton-kit/agent-chat-core` is a headless npm package: it connects to a node's broker over a WebSocket, folds the incoming frames into a transcript, and exposes that as a `useAgentChat` hook and a list of normalized `ChatItem`s, along with the queue, steer and abort state and the dialog requests an agent raises. The `agent-chat` registry is a [shadcn](https://ui.shadcn.com) registry item with the `<AgentChat>` component built on top of it, copied into your project as source that you own and edit.

The core package does not import crouter at runtime. It speaks the broker's wire protocol, so your app needs a route that proxies `/v1/attach` to the node's broker and, if you want reconnect to revive a stopped node, an `onBeforeConnect` function that does it.

[Registry](https://crouton-labs.github.io/agent-chat/r/agent-chat.json) · [Component docs](registry/docs/agent-chat.md) · [crouter](https://github.com/crouton-labs/crouter)

## Install

The component, copied into your project (a shadcn-configured React 19 app):

```bash
npx shadcn add https://crouton-labs.github.io/agent-chat/r/agent-chat.json
npm install @crouton-kit/agent-chat-core streamdown
```

`shadcn add` copies `src/components/agent-chat/*` and the shadcn primitives it uses (`button`, `textarea`, `scroll-area`, `avatar`, `badge`, `dialog`, `collapsible`), but it does not install npm packages, so add the two above yourself. React 19 is a peer dependency of the core package.

To use only the engine and build your own UI:

```bash
npm install @crouton-kit/agent-chat-core
```

## Usage

```tsx
import { AgentChat } from '@/components/agent-chat';

<AgentChat nodeId={nodeId} onBeforeConnect={revive} />
```

`nodeId` is the crouter node to attach to; pass `null` to render the shell without connecting. `view="user"` (the default) shows clean text and one-line tool-call pills; `view="dev"` adds the reasoning trace and expandable tool arguments and results. How to rename tools, swap parts, or drop to the `useAgentChat` hook is covered in the [component docs](registry/docs/agent-chat.md).

## Repository layout

| Path | What it is |
|---|---|
| [`packages/core`](packages/core) | `@crouton-kit/agent-chat-core`: wire types, `BrokerClient`, the transcript reducer, the `ChatItem` normalizer, activity derivation, the queue/steer/abort state machine, dialog plumbing, `createToolRegistry`, `useAgentChat` |
| [`registry`](registry) | The `<AgentChat>` source and the Vite harness that builds it into the registry served at the link above |

A GitHub Actions workflow publishes `packages/core` to npm on every push to `main`, after running its tests; another builds the registry to GitHub Pages when `registry/` changes.

## Develop

```bash
git clone git@github.com:crouton-labs/agent-chat.git
cd agent-chat
pnpm install
pnpm test        # vitest, in packages/core
pnpm typecheck
pnpm build       # tsup, in packages/core
```

One test in core (`wire-contract.test.ts`) reads crouter's protocol source, so it expects a checkout of crouter next to this repository (`../crouter`).
