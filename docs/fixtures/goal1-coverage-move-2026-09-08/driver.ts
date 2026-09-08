// Goal-1 measurement driver: runs buildWitanInputFromRepo over a fixed fixture set
// under a given rubric version, and dumps the A1 criterion signal (findings, metrics,
// insufficientData, notes, and the payload's scanLimitations) per fixture as JSON.
//
// Usage: tsx driver.ts <fixturesRootDir> <rubricVersionConst: v22|v17> <outFile>
//
// Run from inside a cejel worktree so the relative import below resolves to that
// worktree's own src/witan (this is what makes the pin comparison meaningful).
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildWitanInputFromRepo,
} from './src/witan/repo-signals.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V22,
} from './src/witan/rubric-version.js';

const [, , fixturesRoot, versionKey, outFile] = process.argv;
if (!fixturesRoot || !versionKey || !outFile) {
  console.error('usage: tsx driver.ts <fixturesRootDir> <v22|v17> <outFile>');
  process.exit(1);
}

const rubricVersion =
  versionKey === 'v22'
    ? WITAN_RUBRIC_VERSION_V22
    : versionKey === 'v17'
      ? WITAN_RUBRIC_VERSION_V17
      : (() => {
          throw new Error(`unknown versionKey ${versionKey}`);
        })();

const fixtureNames = readdirSync(fixturesRoot)
  .filter((name) => statSync(join(fixturesRoot, name)).isDirectory())
  .sort();

const results: Record<string, unknown> = {};
for (const name of fixtureNames) {
  const repoPath = join(fixturesRoot, name);
  try {
    const input = buildWitanInputFromRepo({
      productSlug: 'fixture',
      productDisplayName: 'Fixture',
      repoPath,
      rubricVersion,
      generatedAt: '2026-09-08T00:00:00.000Z',
    });
    const a1 = (input.signals ?? []).find((s: any) => s.criterionId === 'A1') ?? null;
    results[name] = {
      a1,
      scanLimitations: input.scanLimitations ?? [],
    };
  } catch (error) {
    results[name] = { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

writeFileSync(outFile, JSON.stringify(results, null, 2) + '\n', 'utf8');
console.log(`wrote ${outFile} (${fixtureNames.length} fixtures, rubric=${rubricVersion})`);
