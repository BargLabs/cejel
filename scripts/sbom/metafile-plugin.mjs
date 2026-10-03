/**
 * esbuild plugin that enables the bundler metafile and writes it to
 * `.build/metafiles/<name>.json`. It is written outside `dist/` on purpose: `dist/` is shipped
 * in the npm package and copied into the OCI image, and the metafile is build input to the SBOM,
 * not a shipped artefact.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function metafilePath(name) {
  return join(REPO_ROOT, '.build', 'metafiles', `${name}.json`);
}

export function bundleMetafilePlugin(name) {
  return {
    name: `cejel-bundle-metafile-${name}`,
    setup(build) {
      build.initialOptions.metafile = true;
      build.onEnd((result) => {
        if (!result.metafile) {
          throw new Error(`bundle metafile for ${name} was not produced; refusing a silent build.`);
        }
        const target = metafilePath(name);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, `${JSON.stringify(result.metafile)}\n`);
      });
    },
  };
}
