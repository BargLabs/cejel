import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX } from '../abstention.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { type A2HistoryIncompleteness, v27A2FailedHistoryNote } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import {
  ISSUE_556_SHAPE,
  SHALLOW_A2_SYNTHETIC_SECRET_LINE,
  buildA2HistoryOrigin,
  buildShallowA2Origin,
  cloneShallowA2Origin,
  removeShallowA2Fixtures,
} from './fixtures/shallow-a2-shapes.js';
import { READ_FAILURE_CLASSES, checkNoRise, lostFindings } from './v27-no-rise.js';

// #558 integration of #560: v27's A2 abstention after an incomplete history read (other than the
// shallow-only case) is the failed-history read-failure class, recognised by the prefix
// WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX. Every cause is derived from the code, not listed by hand:
// the fields of A2HistoryIncompleteness (repo-signals.ts) and the causes the comment on the prefix
// (abstention.ts, the source of truth) says the note names. Each is checked twice: the note
// v27A2FailedHistoryNote writes is recognised, and a real scan producing that cause passes the full
// no-rise property against v17 with A2 counted as a failed-history abstention.

// git_absent cannot be produced on a host that has git, so, as #560's own test does, one mode of
// this file's execGit mock reports it; every other call runs the real git.
const mode = { current: 'real' as 'real' | 'git-absent' };
vi.mock('../git-exec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../git-exec.js')>();
  return {
    ...actual,
    execGit: (argv: readonly string[], options: Parameters<typeof actual.execGit>[1]) =>
      mode.current === 'git-absent' ? { ok: false as const, reason: 'git_absent' as const } : actual.execGit(argv, options),
  };
});

const here = fileURLToPath(new URL('.', import.meta.url));
const source = (relative: string): string => readFileSync(join(here, relative), 'utf8');

/** The field names of A2HistoryIncompleteness, read from its declaration. */
function incompletenessFields(): string[] {
  const declaration = /export interface A2HistoryIncompleteness \{([\s\S]*?)\n\}/.exec(source('../repo-signals.ts'))?.[1];
  if (!declaration) throw new Error('A2HistoryIncompleteness not found in repo-signals.ts');
  return [...declaration.matchAll(/^\s*readonly (\w+)\??:/gm)].map((match) => match[1]!);
}

/** The causes the comment on WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX lists: bullet text and note marker, if any. */
function commentCauses(): { bullet: string; marker?: string }[] {
  const text = source('../abstention.ts');
  const end = text.indexOf('export const WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX');
  const start = text.lastIndexOf('// v27 (#556):', end);
  const comment = text
    .slice(start, end)
    .split('\n')
    .map((line) => line.replace(/^\s*\/\/ ?/, ''))
    .join('\n');
  return comment
    .split('\n- ')
    .slice(1)
    .map((bullet) => bullet.replace(/\s+/g, ' ').trim())
    .map((bullet) => ({ bullet, marker: /the note contains "([^"]+)"/.exec(bullet)?.[1] }));
}

/** One incompleteness per cause field, alone and beside a shallow clone. */
function inputsFor(field: string): A2HistoryIncompleteness[] {
  const none: A2HistoryIncompleteness = { shallow: false, limitHits: [], otherFailure: false };
  const value = field === 'limitHits' ? ['30-second timeout'] : true;
  const alone = { ...none, [field]: value } as A2HistoryIncompleteness;
  return [alone, { ...alone, shallow: true }];
}

function recognisedAs(notes: string): string[] {
  const criterion = { id: 'A2', status: 'insufficient_data', score: 0, notes } as unknown as WitanCriterionScore;
  const report = { criteria: [criterion] } as unknown as WitanReport;
  return READ_FAILURE_CLASSES.filter(({ recognises }) => recognises(report, criterion)).map(({ kind }) => kind);
}

describe('#560 failed-history abstentions are a recognised read failure: every cause, derived from the code', () => {
  const fields = incompletenessFields();
  // shallow alone keeps #442's notes (the shallow-history class); every other field is a cause.
  const causes = fields.filter((field) => field !== 'shallow');
  const notes = causes.flatMap((field) =>
    inputsFor(field).flatMap((input) => [v27A2FailedHistoryNote(input, false), v27A2FailedHistoryNote(input, true)]),
  );

  it('reads the causes from A2HistoryIncompleteness', () => {
    expect(fields).toContain('shallow');
    expect(causes.length).toBeGreaterThanOrEqual(6);
  });

  it.each(causes)('%s: the note v27 writes, on the scoring and the not-applicable path, is failed-history', (field) => {
    for (const input of inputsFor(field)) {
      for (const wouldBeNotApplicable of [false, true]) {
        const note = v27A2FailedHistoryNote(input, wouldBeNotApplicable);
        expect(note.startsWith(WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX), note).toBe(true);
        expect(recognisedAs(note), note).toEqual(['failed-history']);
      }
    }
  });

  it('every cause the abstention.ts comment lists with a note marker is written by one of those notes', () => {
    const listed = commentCauses();
    expect(listed.length).toBeGreaterThanOrEqual(5);
    for (const { bullet, marker } of listed) {
      if (marker === undefined) continue;
      expect(notes.some((note) => note.includes(marker)), bullet).toBe(true);
    }
    // The bullet without a note marker is the failed git read, whose note names a limit or an
    // unreadable part of the history; both inputs are among the causes above.
    expect(listed.filter(({ marker }) => marker === undefined).map(({ bullet }) => bullet.slice(0, 20))).toEqual(['a failed git read (a']);
  });

  it('is not recognised without the prefix, or on another criterion', () => {
    const note = v27A2FailedHistoryNote({ shallow: false, limitHits: [], otherFailure: true }, false);
    expect(recognisedAs(note.slice(1))).toEqual([]);
    const b2 = { id: 'B2', status: 'insufficient_data', score: 0, notes: note } as unknown as WitanCriterionScore;
    expect(READ_FAILURE_CLASSES.some(({ recognises }) => recognises({ criteria: [b2] } as unknown as WitanReport, b2))).toBe(false);
  });
});

function score(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'failed-history-no-rise',
    productDisplayName: 'Failed-history no-rise',
    generatedAt: '2026-10-22T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
}

const a2 = (report: WitanReport): WitanCriterionScore => report.criteria.find(({ id }) => id === 'A2')!;

/** v17 and v27 on one repository: the no-rise property holds and A2 is a failed-history abstention. */
function expectFailedHistoryNoRise(repoPath: string, marker: string): void {
  const before = score(repoPath, WITAN_RUBRIC_VERSION_V17);
  const after = score(repoPath, WITAN_RUBRIC_VERSION_V27);
  expect(a2(after).status).toBe('insufficient_data');
  expect(a2(after).notes ?? '').toContain(marker);
  const result = checkNoRise(before, after);
  expect(result.problems).toEqual([]);
  expect(lostFindings(before, after)).toEqual([]);
  expect(result.introducedAbstentions.filter(({ id }) => id === 'A2').map(({ kind }) => kind)).toEqual(['failed-history']);
}

const canDenyReadAccess = platform() !== 'win32' && process.getuid?.() !== 0;
const base = { 'package.json': '{"name":"corner","version":"1.0.0"}\n', 'src/a.js': 'export const a = 1;\n' };
const secret = `stripe_secret_key = "${SHALLOW_A2_SYNTHETIC_SECRET_LINE.trim().split('=')[1]}"\n`;
const scratch: string[] = [];

/** A copy of `repo` without its .git, in a fresh directory. */
function withoutGit(repo: string): string {
  const copy = mkdtempSync(join(tmpdir(), 'cejel-failed-history-copy-'));
  scratch.push(copy);
  cpSync(repo, copy, { recursive: true, filter: (path) => !path.split(/[\\/]/).includes('.git') });
  return copy;
}

describe('#560 failed-history abstentions on real scans pass the no-rise property against v17', () => {
  const repos = { full: '', missingBlobs: '', controlCharacters: '', overCap: '' };

  beforeAll(() => {
    const origin = buildShallowA2Origin(ISSUE_556_SHAPE);
    repos.full = cloneShallowA2Origin(origin, 'full');
    repos.missingBlobs = cloneShallowA2Origin(origin, 'missing-blobs');
    repos.controlCharacters = cloneShallowA2Origin(
      buildA2HistoryOrigin('no-rise-control-characters', [
        { write: base },
        { write: { 'secrets\tkey.txt': secret } },
        { remove: ['secrets\tkey.txt'] },
        { write: { 'README.md': '# c\n' } },
      ]),
      'full',
    );
    const certs: Record<string, string> = { ...base, '.gitignore': '.env\n' };
    for (let index = 0; index < 5_001; index += 1) certs[`certs/c${index}.pem`] = `c${index}\n`;
    repos.overCap = cloneShallowA2Origin(
      buildA2HistoryOrigin('no-rise-over-cap', [{ write: certs }, { write: { 'README.md': '# c\n' } }]),
      'full',
    );
  }, 180_000);

  afterAll(() => {
    mode.current = 'real';
    for (const path of scratch) rmSync(path, { recursive: true, force: true });
    removeShallowA2Fixtures();
  });

  it('a failed git read (a clone missing history blobs)', () => {
    expectFailedHistoryNoRise(repos.missingBlobs, 'Cejel could not read part of the commit history');
  });

  // The slowest case (about 100 s: both rubrics read 5,000 historical blobs), kept because the cap
  // is a cause the abstention.ts comment lists and no cheaper repository reaches it.
  it('the history secret scan cap of 5,000 files', () => {
    expectFailedHistoryNoRise(repos.overCap, 'stopped at its own cap of 5,000 historical files');
  }, 240_000);

  it('a credential-shaped history path with control characters', () => {
    expectFailedHistoryNoRise(repos.controlCharacters, 'unread because its name contains control characters');
  });

  it('git could not be run', () => {
    mode.current = 'git-absent';
    try {
      expectFailedHistoryNoRise(repos.full, 'git could not be run on the scanning host');
    } finally {
      mode.current = 'real';
    }
  });

  it('a .git entry git cannot open: a dangling .git symlink', () => {
    const copy = withoutGit(repos.full);
    symlinkSync(join(copy, 'gone', '.git'), join(copy, '.git'));
    expectFailedHistoryNoRise(copy, 'a .git entry is present but git could not open it as a repository');
  });

  it.skipIf(!canDenyReadAccess)('a .git entry git cannot open: an unreadable .git directory', () => {
    chmodSync(join(repos.full, '.git'), 0o000);
    try {
      expectFailedHistoryNoRise(repos.full, 'a .git entry is present but git could not open it as a repository');
    } finally {
      chmodSync(join(repos.full, '.git'), 0o755);
    }
  });
});
