# agent-chat

The Hearth agent-chat UI component kit. Two artifacts, one hard boundary (the shadcn ethos: copyable UI over a headless engine):

- **`packages/core/`** → published npm package **`@crouton-kit/agent-chat-core`**. Wire protocol types, `BrokerClient` + close classifier, the transcript reducer, the `ChatItem[]` normalizer, activity derivation, the queue/steer/abort state machine, dialog request/response plumbing, the tool-registry factory, and the `useAgentChat` hook. Never edited by a consuming app; never imports crtr at runtime.
- **`registry/`** → a shadcn registry (`@crouton-kit/agent-chat`): the `<AgentChat>` UI source, copied into consuming apps via `npx shadcn add`, built to static JSON with the `shadcn` registry build.

Full contract: see the build-ready spec this repo was built from (referenced from the orchestrating canvas node; not duplicated here).

## Commands

```bash
pnpm install                                    # from repo root
pnpm --filter @crouton-kit/agent-chat-core build       # tsup → dist/ (ESM + .d.ts)
pnpm --filter @crouton-kit/agent-chat-core typecheck   # tsc --noEmit
pnpm --filter @crouton-kit/agent-chat-core test        # vitest run
```

## Family conventions (see `~/Code/cli/CLAUDE.md`)

- ESM-only; every relative import uses a `.js` extension even in `.ts` sources.
- Local cross-package dev: `yalc link`, never `yalc add`. `.yalc/`/`yalc.lock` are gitignored; committed `package.json` deps for in-house packages stay `"latest"`.
- `.github/workflows/publish.yml` publishes `packages/core` to npm on push to `main`. Conventional commits; a `chore: release` commit is skipped to avoid loops.
- `react` is a **peer dependency** of core (React 19) — never a direct dependency.
