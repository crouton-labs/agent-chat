import { defineConfig } from 'vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// The dev/build harness for the registry item source (`src/components/agent-chat/*`).
// Never shipped — it exists to typecheck/build/preview against real shadcn
// primitives + @crouton-kit/agent-chat-core (see package.json description).
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  plugins: [tailwindcss(), viteReact()],
});
