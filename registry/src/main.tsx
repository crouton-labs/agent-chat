// main.tsx — the dev/build harness entry point (never shipped; see
// package.json's description). Mounts the batteries-included `<AgentChat>`
// with `nodeId={null}` so the harness never attempts a real WS connection —
// just enough for `vite build` to prove the whole component tree compiles
// and renders.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AgentChat } from './components/agent-chat/index.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <AgentChat nodeId={null} />
  </StrictMode>,
);
