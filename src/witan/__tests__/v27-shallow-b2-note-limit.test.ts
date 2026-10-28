import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { v27A2FailedHistoryNote } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { cloneRepository, criterionOf, git, scanRepository } from './fixtures/shallow-history-matrix.js';

// v27 freeze change F1, item A of its second pass (operator review of #605, 2026-10-28). On a
// shallow clone v27's B2 joins the uncredited-workflow note to the withheld-ratio note or to the
// abstention note. The uncredited note was trimmed to the report's 1000-character notes limit on
// its own, not after the join, so a depth-1 scan with a CI workflow, a pull-request template and
// four print-only workflows with long paths wrote no report (zod too_big at signals[6].notes).
// The joined note now keeps the first note whole and shortens the uncredited part, naming fewer
// paths and saying how many more there are.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const NOTES_LIMIT = 1000;

const CI_WORKFLOW =
  'name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install pytest\n      - run: pytest\n';
// v27 (#527): every step only checks out and prints, so v27 credits it nothing.
const PRINT_ONLY_WORKFLOW =
  'name: hello\non:\n  pull_request:\njobs:\n  hello:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo "hello"\n';
const BASE_FILES: Readonly<Record<string, string>> = {
  'pyproject.toml': '[project]\nname = "cachelib"\nversion = "1.0.0"\ndependencies = []\n',
  'README.md': '# cachelib\n',
  'src/cachelib/__init__.py': 'def get(cache, key, default=None):\n    return cache.get(key, default)\n',
  'tests/test_cache.py': 'from cachelib import get\n\n\ndef test_get_default():\n    assert get({}, "a", 1) == 1\n',
};
const RATIO_WITHHELD_LEAD =
  /^B2 abstained from the pull-request merge ratio only: this repository is a shallow clone with fewer than 12 commits visible, so the pull-request merge ratio cannot be read over its window\. .* Re-scan a full clone \(for actions\/checkout, set fetch-depth: 0\)\./;
const ABSTENTION_LEAD =
  /^B2 abstained: this repository is a shallow clone with fewer than 12 commits visible, so the pull-request merge ratio cannot be read over its window\. B2 is left out of the composite rather than scored on the commits present\. Re-scan a full clone \(for actions\/checkout, set fetch-depth: 0\)\./;

/** A print-only workflow path of exactly `length` characters, distinct by `index`. */
function printOnlyPath(index: number, length: number): string {
  const prefix = `.github/workflows/p${index}-`;
  const suffix = '.yml';
  return `${prefix}${'x'.repeat(length - prefix.length - suffix.length)}${suffix}`;
}

function buildOrigin(options: { ci: boolean; template: boolean; printOnlyPaths: readonly string[] }): string {
  const dir = mkdtempSync(join(tmpdir(), 'cejel-f1-b2-note-'));
  git(dir, ['init', '--quiet']);
  const files: Record<string, string> = {
    ...BASE_FILES,
    ...(options.ci ? { '.github/workflows/ci.yml': CI_WORKFLOW } : {}),
    ...(options.template ? { '.github/pull_request_template.md': '## Summary\n' } : {}),
    ...Object.fromEntries(options.printOnlyPaths.map((path) => [path, PRINT_ONLY_WORKFLOW])),
  };
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), contents);
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', 'initial commit']);
  for (let index = 1; index < 4; index += 1) {
    writeFileSync(join(dir, 'src/cachelib', `m${index}.py`), `VALUE_${index} = ${index}\n`);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '--quiet', '-m', `add module ${index}`]);
  }
  return dir;
}

function b2Notes(repoPath: string, rubric: string): string {
  return criterionOf(scanRepository(repoPath, rubric), 'B2').notes ?? '';
}

describe('F1 v2 A: a shallow v27 scan never fails on B2\'s joined note', () => {
  it('the reproduction: depth 1, CI + template + four print-only workflows with ~100-character paths writes a report; the withheld-ratio note stays whole and the rest says how many more', () => {
    const paths = [1, 2, 3, 4].map((index) => printOnlyPath(index, 100));
    const origin = buildOrigin({ ci: true, template: true, printOnlyPaths: paths });
    const shallow = cloneRepository(origin, 1);
    const notes = b2Notes(shallow, V27);
    expect(notes.length).toBeLessThanOrEqual(NOTES_LIMIT);
    expect(notes).toMatch(RATIO_WITHHELD_LEAD);
    expect(notes).toMatch(/not counted as a PR-trace CI workflow: [^ ]+, [^ ]+, [^ ]+ and 1 more\.$/);
    // v17 credits every workflow, so it has no uncredited note and is unchanged.
    expect(b2Notes(shallow, V17)).toMatch(RATIO_WITHHELD_LEAD);
    expect(b2Notes(shallow, V17)).not.toMatch(/not counted/);
  });

  it('the abstention branch: depth 1, no credited PR-trace file and four print-only workflows with ~150-character paths writes a report; the abstention note stays whole', () => {
    const paths = [1, 2, 3, 4].map((index) => printOnlyPath(index, 150));
    const origin = buildOrigin({ ci: false, template: false, printOnlyPaths: paths });
    const notes = b2Notes(cloneRepository(origin, 1), V27);
    expect(notes.length).toBeLessThanOrEqual(NOTES_LIMIT);
    expect(notes).toMatch(ABSTENTION_LEAD);
    expect(notes).toMatch(/ and \d more\.$/);
  });

  it('the other v27 note built by joining parts, the failed-history A2 note, fits the limit for every combination of causes; its cause sentence stays whole', () => {
    // Its parts are fixed sentences and Cejel's own limit names (the two output limits history
    // reads use, 8 MiB and 512,000 bytes, the 30-second timeout and #586's budget), so these 255
    // combinations, on both paths, are every form it can take short of the no-read causes.
    const limits = ['120-second time budget for re-reading history in batches', '30-second timeout', '500 KiB output limit', '8 MiB output limit'];
    let checked = 0;
    for (let mask = 1; mask < 1 << 8; mask += 1) {
      const input = {
        limitHits: limits.filter((_, bit) => (mask & (1 << bit)) !== 0),
        shallow: (mask & 16) !== 0,
        otherFailure: (mask & 32) !== 0,
        blobCapHit: (mask & 64) !== 0,
        controlCharacterSkip: (mask & 128) !== 0,
      };
      for (const wouldBeNotApplicable of [false, true]) {
        const note = v27A2FailedHistoryNote(input, wouldBeNotApplicable);
        expect(note.length, JSON.stringify(input)).toBeLessThanOrEqual(NOTES_LIMIT);
        // The first sentence (prefix, causes, consequence) ends at the first '. ' after the causes.
        expect(note, JSON.stringify(input)).toMatch(/(?:not applicable on a decision that rests in part on Cejel's scans of earlier commits for \.env files and credential-shaped values\.|no confirmed critical finding stands on what was read\.)( |$)/);
        checked += 1;
      }
    }
    expect(checked).toBe(510);
  });

  it('at exactly the limit the joined note is unchanged; one character over, it is shortened', () => {
    // The withheld-ratio note alone (no uncredited workflow) and, from a full clone, the
    // uncredited note alone; their join plus one space is what a shallow scan writes when it fits.
    const lead = b2Notes(cloneRepository(buildOrigin({ ci: true, template: true, printOnlyPaths: [] }), 1), V27);
    expect(lead).toMatch(RATIO_WITHHELD_LEAD);
    const probePaths = [1, 2, 3].map((index) => printOnlyPath(index, 100));
    const probeFull = b2Notes(cloneRepository(buildOrigin({ ci: true, template: true, printOnlyPaths: probePaths })), V27);
    // Each path is listed once in the uncredited note, so its length moves one for one with theirs.
    const lastLength = 100 + (NOTES_LIMIT - lead.length - 1 - probeFull.length);
    expect(lastLength).toBeGreaterThan(30);
    expect(lastLength).toBeLessThan(250);

    for (const extra of [0, 1]) {
      const paths = [...probePaths.slice(0, 2), printOnlyPath(3, lastLength + extra)];
      const origin = buildOrigin({ ci: true, template: true, printOnlyPaths: paths });
      const uncreditedAlone = b2Notes(cloneRepository(origin), V27);
      expect(uncreditedAlone.length).toBe(NOTES_LIMIT - lead.length - 1 + extra);
      const notes = b2Notes(cloneRepository(origin, 1), V27);
      if (extra === 0) {
        expect(notes.length).toBe(NOTES_LIMIT);
        expect(notes).toBe(`${lead} ${uncreditedAlone}`);
      } else {
        expect(notes.length).toBeLessThanOrEqual(NOTES_LIMIT);
        expect(notes.startsWith(`${lead} `)).toBe(true);
        expect(notes).toMatch(/: [^ ]+, [^ ]+ and 1 more\.$/);
      }
    }
  });
});
