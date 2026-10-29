import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import type { WitanReport } from '../schemas.js';

// The #606 review's audit of every note built by joining parts, under every rubric. A1's note names
// up to four files where coverage command reachability or flag ownership was unresolved, by path,
// with no length check. Four CI workflows with long file names took it past the report's
// 1000-character notes limit, and the scan wrote no report, under v17, the default, too. A note
// that fits is unchanged. One that does not keeps its first sentence and the first path whole, names
// fewer paths and says how many more.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const LIMIT = 1000;
const LEAD =
  'A1 is detected from real test files, test runner configuration, and optional coverage configuration. ' +
  'Coverage command reachability or flag ownership was unresolved in ';
const TAIL = '; the no-coverage absence claim was withheld.';
const GO_BASE: Readonly<Record<string, string>> = {
  'go.mod': 'module example.invalid/synthetic\n\ngo 1.22\n',
  'value.go': 'package synthetic\n\nfunc Value() int { return 1 }\n',
  'value_test.go':
    'package synthetic\n\nimport "testing"\n\nfunc TestValue(t *testing.T) {\n\tif Value() != 1 {\n\t\tt.Fatal("value")\n\t}\n}\n',
};
// The cover flag's value comes from the environment, so whether coverage runs is unresolved.
const UNRESOLVED_WORKFLOW = [
  'name: test',
  'on: [push]',
  'jobs:',
  '  test:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - run: go test -cover=$WITH_COVERAGE ./...',
  '',
].join('\n');

/** A workflow path of exactly `length` characters, distinct by `index`. */
function workflowPath(index: number, length: number): string {
  const prefix = `.github/workflows/w${index}-`;
  return `${prefix}${'x'.repeat(length - prefix.length - 4)}.yml`;
}

function makeRepo(workflowPaths: readonly string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'cejel-a1-note-limit-'));
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  const files = { ...GO_BASE, ...Object.fromEntries(workflowPaths.map((path) => [path, UNRESOLVED_WORKFLOW])) };
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), contents);
    execFileSync('git', ['add', path], { cwd: dir });
  }
  return dir;
}

function scan(dir: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath: dir,
    productSlug: 'a1-note-limit',
    productDisplayName: 'A1 note limit',
    generatedAt: '2026-10-28T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
}

function a1Notes(dir: string, rubricVersion: string): string {
  return scan(dir, rubricVersion).criteria.find(({ id }) => id === 'A1')?.notes ?? '';
}

describe('the #606 review audit: A1\'s unresolved-coverage note never stops a scan from writing its report', () => {
  it('the reproduction: four unresolved workflows with 200-character paths write a report under v17 and v27; the first path stays whole and the rest are counted', () => {
    const paths = [1, 2, 3, 4].map((index) => workflowPath(index, 200));
    const dir = makeRepo(paths);
    for (const rubricVersion of [V17, V27]) {
      const notes = a1Notes(dir, rubricVersion);
      expect(notes.length, rubricVersion).toBeLessThanOrEqual(LIMIT);
      expect(notes.startsWith(`${LEAD}${paths[0]}`), rubricVersion).toBe(true);
      expect(notes, rubricVersion).toMatch(/ and \d more files?; the no-coverage absence claim was withheld\.$/);
    }
  });

  it('at exactly the limit the note is unchanged; one character over, it names fewer paths', () => {
    // Four paths, the last padded: LEAD + four paths joined by ", " + TAIL is LIMIT exactly.
    const room = LIMIT - LEAD.length - TAIL.length - 3 * 2;
    const firstThree = [1, 2, 3].map((index) => workflowPath(index, 200));
    const lastLength = room - 3 * 200;
    expect(lastLength).toBeGreaterThan(30);
    for (const extra of [0, 1]) {
      const paths = [...firstThree, workflowPath(4, lastLength + extra)];
      const dir = makeRepo(paths);
      for (const rubricVersion of [V17, V27]) {
        const notes = a1Notes(dir, rubricVersion);
        if (extra === 0) {
          expect(notes, rubricVersion).toBe(`${LEAD}${paths.join(', ')}${TAIL}`);
          expect(notes.length, rubricVersion).toBe(LIMIT);
        } else {
          expect(notes.length, rubricVersion).toBeLessThanOrEqual(LIMIT);
          expect(notes, rubricVersion).toBe(`${LEAD}${paths.slice(0, 3).join(', ')} and 1 more file${TAIL}`);
        }
      }
    }
  });

  it('two nested package.json files with 690-character paths: the first path stays whole and the second is counted', () => {
    // An evidence path may hold at most 700 characters (WitanEvidencePointerSchema), so this is
    // about the longest path a scan reaches this note with.
    const deep = (index: number) => {
      const directories = Array.from({ length: 13 }, (_, level) => `p${index}d${level}`.padEnd(50, 'x')).join('/');
      return `${directories}/${'y'.repeat(690 - directories.length - '/package.json'.length - 1)}/package.json`;
    };
    const paths = [deep(1), deep(2)];
    expect(paths.map((path) => path.length)).toEqual([690, 690]);
    const dir = makeRepo([]);
    for (const path of paths) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), JSON.stringify({ name: 'deep', version: '1.0.0', scripts: { test: 'custom-test-wrapper --coverage 88' } }));
      execFileSync('git', ['add', path], { cwd: dir });
    }
    for (const rubricVersion of [V17, V27]) {
      expect(a1Notes(dir, rubricVersion), rubricVersion).toBe(`${LEAD}${paths[0]} and 1 more file${TAIL}`);
    }
  });

  it('control: more than four unresolved files whose note fits keeps today\'s wording, the first four paths and no count', () => {
    const paths = [1, 2, 3, 4, 5].map((index) => workflowPath(index, 40));
    const notes = a1Notes(makeRepo(paths), V17);
    expect(notes).toBe(`${LEAD}${[...paths].sort().slice(0, 4).join(', ')}${TAIL}`);
  });
});
