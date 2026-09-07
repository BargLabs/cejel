import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Delivery path (goal_maeve_cross_repo_lesson_delivery_2026-09-07): a Claude Code/coding-agent
// session with THIS repository open stages PENDING_cejel_<slug>_<date>.json directly into this
// directory as part of its own PR (the "has this repository open" row of alfred's
// docs/orchestration/lesson-staging-convention.md). alfred's operator-run harvest
// (BargLabs/alfred packages/api/scripts/harvest-holding-lessons.ts) then copies it, byte-for-byte
// and schema-validated exactly as an alfred-authored seed would be, into alfred's own
// docs/orchestration/maeve-unanchored-lessons/ store; a human removes the now-delivered file from
// THIS directory in a follow-up PR (mirrors the manual precedent: alfred #1345 copied a cejel
// lesson in, cejel #284 dropped it).
//
// A directory being on this allowlist is NOT the same claim as its content being delivered — an
// allowlist entry with no harvest behind it is a green check over a stranded corpus, the exact
// pass-by-absence shape this guard exists to prevent. So a file sitting here past
// MAX_HOLDING_AGE_DAYS is treated as UNDELIVERED, not merely "listed." alfred's own cross-repo
// scripts/maeve-lesson-delivery-guard.mjs enforces the identical threshold
// (`lessonHoldingMaxAgeDays: 7` for cejel in BargLabs/alfred's .github/maeve-sync-products.json)
// against a fresh checkout of this repo, daily + on every push to alfred's main + on every PR
// touching the guard. This local copy exists in DEFENSE IN DEPTH with that cross-repo cron: cejel's
// own CI catches a stalled/forgotten harvest immediately on cejel's next PR, rather than waiting
// up to a day for alfred's schedule.
const CONFIGURED_LOCAL_LESSON_DIRECTORIES: string[] = [
  'docs/orchestration/maeve-unanchored-lessons',
];
const MAX_HOLDING_AGE_DAYS = 7;

export function isLessonShaped(raw: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  return (
    Array.isArray(parsed) &&
    parsed.some(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        'statement' in entry &&
        typeof entry.statement === 'string' &&
        'scope' in entry &&
        Array.isArray(entry.scope) &&
        'tags' in entry &&
        Array.isArray(entry.tags) &&
        'anchors' in entry &&
        Array.isArray(entry.anchors) &&
        'lastSeenAt' in entry &&
        typeof entry.lastSeenAt === 'string',
    )
  );
}

export function firstCommitDate(repoRoot: string, file: string): string {
  const firstCommit = execFileSync('git', ['log', '--follow', '--format=%cI', '--', file], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (!firstCommit) {
    throw new Error(`maeve_lesson_first_commit_unresolved: file=${file}`);
  }
  return firstCommit.slice(0, 10);
}

export interface FindStaleOrUndeliveredOptions {
  repoRoot: string;
  trackedJsonFiles: string[];
  readFile?: (file: string) => string;
  commitDate?: (file: string) => string;
  now?: () => Date;
  configuredDirectories?: readonly string[];
  maxHoldingAgeDays?: number;
}

/**
 * Mirrors BargLabs/alfred's scripts/maeve-lesson-delivery-guard.mjs
 * (`findUndeliveredMaeveLessonDirectories`) for cejel's own local, dependency-free copy: a
 * lesson-shaped file outside every configured directory is undelivered; one inside a configured
 * directory past `maxHoldingAgeDays` is ALSO undelivered (stale) rather than exempt forever.
 */
export function findStaleOrUndeliveredLessonDirectories({
  repoRoot,
  trackedJsonFiles,
  readFile = (file) => readFileSync(resolve(repoRoot, file), 'utf8'),
  commitDate = (file) => firstCommitDate(repoRoot, file),
  now = () => new Date(),
  configuredDirectories = CONFIGURED_LOCAL_LESSON_DIRECTORIES,
  maxHoldingAgeDays = MAX_HOLDING_AGE_DAYS,
}: FindStaleOrUndeliveredOptions): string[] {
  const undeliveredByDirectory = new Map<string, { file: string; date: string }[]>();
  const staleFindings: string[] = [];

  for (const file of trackedJsonFiles) {
    if (!isLessonShaped(readFile(file))) continue;
    const directory = dirname(file);

    if (configuredDirectories.includes(directory)) {
      const oldest = commitDate(file);
      const ageDays = Math.floor((now().getTime() - new Date(oldest).getTime()) / 86_400_000);
      if (ageDays > maxHoldingAgeDays) {
        staleFindings.push(
          `maeve_lesson_directory_stale: product=cejel directory=${directory} file=${file} ageDays=${ageDays} maxAgeDays=${maxHoldingAgeDays} oldest=${oldest}`,
        );
      }
      continue;
    }

    const members = undeliveredByDirectory.get(directory) ?? [];
    members.push({ file, date: commitDate(file) });
    undeliveredByDirectory.set(directory, members);
  }

  const undeliveredFindings = [...undeliveredByDirectory.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([directory, members]) => {
      const oldest = members.map((member) => member.date).sort()[0];
      return `maeve_lesson_directory_undelivered: product=cejel directory=${directory} fileCount=${members.length} oldest=${oldest}`;
    });

  return [...undeliveredFindings, ...staleFindings.sort()];
}

describe('Maeve lesson delivery', () => {
  it('keeps full Git history available to the first-commit-date guard in CI', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain('fetch-depth: 0');
  });

  it('has no tracked lesson-shaped JSON undelivered (outside every configured directory, or stale within one)', () => {
    const repoRoot = resolve(process.cwd());
    const trackedJsonFiles = execFileSync('git', ['ls-files', '-z', '--', '*.json'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
      .filter((file) => existsSync(resolve(repoRoot, file)));

    const findings = findStaleOrUndeliveredLessonDirectories({ repoRoot, trackedJsonFiles });
    expect(findings, findings.join('\n')).toEqual([]);
  });
});

describe('findStaleOrUndeliveredLessonDirectories: synthetic fixtures', () => {
  const LESSON = JSON.stringify([
    {
      statement: 'A lesson that should have a configured delivery or holding path.',
      scope: ['dev-task'],
      tags: ['maeve'],
      anchors: [],
      lastSeenAt: '2026-09-01T00:00:00.000Z',
    },
  ]);

  it('flags a lesson-shaped file outside any configured directory as undelivered', () => {
    expect(
      findStaleOrUndeliveredLessonDirectories({
        repoRoot: '/repos/cejel',
        trackedJsonFiles: ['docs/misc/PENDING_cejel_stray_2026-09-01.json'],
        readFile: () => LESSON,
        commitDate: () => '2026-09-01',
      }),
    ).toEqual([
      'maeve_lesson_directory_undelivered: product=cejel directory=docs/misc fileCount=1 oldest=2026-09-01',
    ]);
  });

  it('allows a fresh file inside the configured holding directory (green)', () => {
    expect(
      findStaleOrUndeliveredLessonDirectories({
        repoRoot: '/repos/cejel',
        trackedJsonFiles: ['docs/orchestration/maeve-unanchored-lessons/PENDING_cejel_x_2026-09-01.json'],
        readFile: () => LESSON,
        commitDate: () => '2026-09-01',
        now: () => new Date('2026-09-04T00:00:00.000Z'),
      }),
    ).toEqual([]);
  });

  it('flags a file inside the configured holding directory past the age threshold as stale — demonstrates the guard red on an undelivered lesson', () => {
    expect(
      findStaleOrUndeliveredLessonDirectories({
        repoRoot: '/repos/cejel',
        trackedJsonFiles: [
          'docs/orchestration/maeve-unanchored-lessons/PENDING_cejel_stale_2026-08-01.json',
        ],
        readFile: () => LESSON,
        commitDate: () => '2026-08-01',
        now: () => new Date('2026-08-20T00:00:00.000Z'),
      }),
    ).toEqual([
      'maeve_lesson_directory_stale: product=cejel directory=docs/orchestration/maeve-unanchored-lessons file=docs/orchestration/maeve-unanchored-lessons/PENDING_cejel_stale_2026-08-01.json ageDays=19 maxAgeDays=7 oldest=2026-08-01',
    ]);
  });

  it('mutating only elapsed time flips the SAME file from green to red', () => {
    const run = (nowIso: string) =>
      findStaleOrUndeliveredLessonDirectories({
        repoRoot: '/repos/cejel',
        trackedJsonFiles: [
          'docs/orchestration/maeve-unanchored-lessons/PENDING_cejel_fresh_2026-08-01.json',
        ],
        readFile: () => LESSON,
        commitDate: () => '2026-08-01',
        now: () => new Date(nowIso),
      });

    expect(run('2026-08-04T00:00:00.000Z')).toEqual([]);
    expect(run('2026-08-09T00:00:00.000Z')).toEqual([
      'maeve_lesson_directory_stale: product=cejel directory=docs/orchestration/maeve-unanchored-lessons file=docs/orchestration/maeve-unanchored-lessons/PENDING_cejel_fresh_2026-08-01.json ageDays=8 maxAgeDays=7 oldest=2026-08-01',
    ]);
  });

  it('real git history: a lesson committed 8 days ago in the holding directory is red; delivering it (removing the file) turns the guard green', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'cejel-maeve-holding-'));
    try {
      execFileSync('git', ['init', '--quiet', '-b', 'main'], { cwd: repoRoot });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repoRoot });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoRoot });
      execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: repoRoot });

      const relativeFile = 'docs/orchestration/maeve-unanchored-lessons/PENDING_cejel_real_2026-08-01.json';
      mkdirSync(join(repoRoot, 'docs/orchestration/maeve-unanchored-lessons'), { recursive: true });
      writeFileSync(join(repoRoot, relativeFile), LESSON);
      execFileSync('git', ['add', relativeFile], { cwd: repoRoot });
      execFileSync('git', ['commit', '--quiet', '-m', 'stage an undelivered lesson'], {
        cwd: repoRoot,
        env: {
          ...process.env,
          GIT_AUTHOR_DATE: '2026-08-01T09:00:00Z',
          GIT_COMMITTER_DATE: '2026-08-01T09:00:00Z',
        },
      });

      const findingsBeforeDelivery = findStaleOrUndeliveredLessonDirectories({
        repoRoot,
        trackedJsonFiles: [relativeFile],
        now: () => new Date('2026-08-09T00:00:00Z'),
      });
      expect(findingsBeforeDelivery).toEqual([
        `maeve_lesson_directory_stale: product=cejel directory=docs/orchestration/maeve-unanchored-lessons file=${relativeFile} ageDays=8 maxAgeDays=7 oldest=2026-08-01`,
      ]);

      // Delivery: the file is removed from cejel's holding directory (mirrors the harvest's
      // follow-up PR once alfred's copy has landed). No tracked lesson-shaped JSON remains.
      execFileSync('git', ['rm', '--quiet', relativeFile], { cwd: repoRoot });
      execFileSync('git', ['commit', '--quiet', '-m', 'remove delivered lesson'], { cwd: repoRoot });

      const findingsAfterDelivery = findStaleOrUndeliveredLessonDirectories({
        repoRoot,
        trackedJsonFiles: [],
        now: () => new Date('2026-08-09T00:00:00Z'),
      });
      expect(findingsAfterDelivery).toEqual([]);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
