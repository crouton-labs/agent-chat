# Security policy

## Reporting a vulnerability

Please report security vulnerabilities privately, by email to **rhyneer.silas@gmail.com**. Do not open a public GitHub issue or pull request for a suspected vulnerability.

Include what you found, the version (`npm ls @crouton-kit/agent-chat-core`, run in your project) and platform, and the steps or a proof of concept that reproduce it. If the report involves a token or credential, redact it.

Reports are read by a single maintainer, and no response time is guaranteed. Fix timelines depend on severity and on what the fix involves. Say in your report if you want credit in the fix.

## Supported versions

Fixes land on `main`. `@crouton-kit/agent-chat-core` is published to npm on every push to `main`, so a fix ships in the next published version. Only the latest published version is supported. The `<AgentChat>` component is copied into your project as source, so a fix to it reaches you when you run `shadcn add` again.

## What is in scope

The code in this repository: the `@crouton-kit/agent-chat-core` package in [`packages/core`](packages/core) and the `<AgentChat>` component source in [`registry`](registry). Of particular interest:

- Transcript or tool output that the component renders as script or as a link it should not follow.
- The broker client sending a message, or a dialog response, to a node other than the one it was attached to.

The package does not authenticate anything. Your app supplies the route that proxies `/v1/attach` to a node broker, so authenticating that route is your app's responsibility. Problems in the broker itself belong in [crouter](https://github.com/crouton-labs/crouter).
