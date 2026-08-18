import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createTypeScriptModuleGraph,
  isFirstPartyModuleGraphSource,
  toModuleGraphRepoPath,
} from '../typescript-module-graph.js';

// The d-series and decision-contracts packs are opt-in: reachable only by importing
// '@cejel/cejel/d-series' or '@cejel/cejel/decision-contracts' directly. Neither is calibrated,
// and neither may ever be pulled into `cejel scan` (src/index.ts), the shared scan core
// (src/scan.ts), or the sealed public-scan path (src/witan/public-scan.ts) that both the CLI and
// every published leaderboard row share. A future edit that adds so much as an unused import from
// either pack into that chain would silently change every default certificate's dependency
// surface — this walks the real resolved TypeScript module graph (not a text grep, which an
// import split across lines or re-exported through an intermediate module would evade) from the
// three default-path entrypoints and fails if either pack's directory is reachable at all.
const REPO_ROOT = resolve(__dirname, '..', '..');
const DEFAULT_SCAN_ENTRYPOINTS = ['src/index.ts', 'src/scan.ts', 'src/witan/public-scan.ts'];
const FORBIDDEN_PACK_PREFIXES = ['src/packs/d-series/', 'src/packs/decision-contracts/'];

describe('default scan path stays isolated from opt-in packs', () => {
  it('never resolves d-series or decision-contracts from index.ts, scan.ts, or public-scan.ts', () => {
    const { program } = createTypeScriptModuleGraph(REPO_ROOT, DEFAULT_SCAN_ENTRYPOINTS);

    const reachablePackFiles = program
      .getSourceFiles()
      .filter((sourceFile) => isFirstPartyModuleGraphSource(REPO_ROOT, sourceFile))
      .map((sourceFile) => toModuleGraphRepoPath(REPO_ROOT, sourceFile.fileName))
      .filter((repoPath) => FORBIDDEN_PACK_PREFIXES.some((prefix) => repoPath.startsWith(prefix)));

    expect(reachablePackFiles).toEqual([]);
  });
});
