import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'tsup';

const packageJsonPath = fileURLToPath(new URL('./package.json', import.meta.url));
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
  name?: unknown;
  version?: unknown;
};
if (typeof packageJson.name !== 'string' || packageJson.name.length === 0) {
  throw new Error(`[build:sea-js] ${packageJsonPath} has no name.`);
}
if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
  throw new Error(`[build:sea-js] ${packageJsonPath} has no version.`);
}

// This is the free public executable build, deliberately separate from the commercial on-prem
// configuration. It contains no licence, customer, build-id, or watermark definitions.
export default defineConfig({
  entry: { cejel: 'src/sea-entry.ts' },
  format: ['cjs'],
  outExtension: () => ({ js: '.js' }),
  outDir: 'dist/sea',
  platform: 'node',
  target: 'node22',
  noExternal: ['zod'],
  clean: true,
  minify: true,
  banner: { js: '#!/usr/bin/env node' },
  define: {
    __CEJEL_SEA_PACKAGE_NAME__: JSON.stringify(packageJson.name),
    __CEJEL_SEA_VERSION__: JSON.stringify(packageJson.version),
  },
});
