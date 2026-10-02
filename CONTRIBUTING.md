# Contributing to agent-chat

Issues and pull requests are welcome at [github.com/crouton-labs/agent-chat](https://github.com/crouton-labs/agent-chat).

## Before you start

- **Bugs:** open an issue with the `@crouton-kit/agent-chat-core` version (`npm ls @crouton-kit/agent-chat-core`, run in your project), your browser, and the steps that fail. If the problem is in the component, say whether you copied it from the registry and when.
- **Features and larger changes:** open an issue first, so the direction is agreed before you write the code.
- **Questions:** ask in [Discord](https://discord.gg/afwW4saEtr) or open an issue. The component's own docs are in [`registry/docs/agent-chat.md`](registry/docs/agent-chat.md).
- **Security problems:** do not open a public issue. See [SECURITY.md](SECURITY.md).

## Set up

This is a pnpm workspace with two packages: `packages/core` (`@crouton-kit/agent-chat-core`, published to npm) and `registry` (the `<AgentChat>` source and the Vite harness that builds it into a shadcn registry). You need Node.js 20 or later (`engines` in the root `package.json`; CI runs Node 22) and pnpm 10, the version CI uses.

```bash
git clone git@github.com:crouton-labs/agent-chat.git
cd agent-chat
pnpm install
pnpm build
```

## Run the tests

The root scripts run the core package:

```bash
pnpm test         # vitest run, in packages/core
pnpm typecheck    # tsc --noEmit, in packages/core
pnpm build        # tsup, in packages/core
```

One core test, `wire-contract.test.ts`, reads crouter's protocol source and expects a checkout of [crouter](https://github.com/crouton-labs/crouter) next to this repository (`../crouter`). Without it that test file fails to load, and the others still run. To run just those:

```bash
cd packages/core
npx vitest run --exclude src/__tests__/wire-contract.test.ts
```

The `registry` package has no tests. Check changes to the component with:

```bash
pnpm --filter agent-chat-registry typecheck
pnpm --filter agent-chat-registry build        # Vite build of the harness
pnpm --filter agent-chat-registry dev          # preview it locally
```

`registry:build` (`shadcn build`) writes the registry JSON to `registry/public`, which is gitignored. The Deploy registry workflow runs it when `registry/` changes on `main`.

## Pull requests

- Branch from the current `main`, and keep one change per pull request.
- Describe what changed and why in the pull request body, and say how you tested it.
- Add or update a test for behavior you change in `packages/core`. Update [`registry/docs/agent-chat.md`](registry/docs/agent-chat.md) when you change the component's props or how it is customized.
- Keep the history linear: rebase onto `main` rather than merging it into your branch.
- Commit messages follow the style of the existing log: a short imperative subject, with a prefix such as `fix:` or `docs:`. The publish workflow bumps the core version and commits `chore: release`, so leave `version` in `packages/core/package.json` alone.
- Source files are ESM, and every relative import uses a `.js` extension, even in `.ts` files.

## Repository layout

| Path | Contents |
|---|---|
| [`packages/core`](packages/core) | `@crouton-kit/agent-chat-core`: the broker client, transcript reducer, `ChatItem` normalizer, queue/steer/abort state, and the `useAgentChat` hook |
| [`registry`](registry) | The `<AgentChat>` component source, its docs, and the Vite harness that builds the shadcn registry |

## License

agent-chat is licensed under GPL-3.0-only. By contributing, you agree that your contribution is licensed under the same terms.
