import { defineConfig } from 'tsup';

// The published `cejel` bin must run under plain `node` via `npx cejel`. This
// package ships with empty `dependencies` (see package.json) — there is no node_modules
// resolve step for a real npm dependency at install time, so tsup's default bundling
// (everything reachable from the entry point, including `zod`) is what makes the
// published dist runnable standalone. Second entry: the MCP stdio server bin
// (dist/mcp/index.js) — same bundling story, same offline guarantee.
export default defineConfig({
  entry: ['src/index.ts', 'src/mcp/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
});
