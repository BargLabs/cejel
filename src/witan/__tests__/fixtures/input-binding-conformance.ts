import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Constructed inputs for the input-binding conformance suite (docs/input-binding.md). Nothing is
// vendored: each document is built here from the fixture repository's own HEAD.

export const CONFORMANCE_SUBJECT_REPOSITORY = 'github.com/example/conformance';
export const CONFORMANCE_COMMIT_TIME = '2026-10-01T12:00:00Z';
export const CONFORMANCE_FORMATS = ['sarif', 'scorecard', 'generic'] as const;
export const CONFORMANCE_CASES = [
  'matching',
  'wrong-repository',
  'wrong-commit',
  'stale',
  'duplicate',
  'unbound',
] as const;

export type ConformanceFormat = (typeof CONFORMANCE_FORMATS)[number];
export type ConformanceCase = (typeof CONFORMANCE_CASES)[number];

const OTHER_REPOSITORY = 'github.com/other/project';
const OTHER_COMMIT = '0123456789abcdef0123456789abcdef01234567';
const ONE_HOUR_AFTER = '2026-10-01T13:00:00Z';
const ONE_YEAR_BEFORE = '2025-10-01T12:00:00Z';

export interface ConformanceRepo {
  repoPath: string;
  head: string;
}

export function makeConformanceRepo(): ConformanceRepo {
  const repoPath = mkdtempSync(join(tmpdir(), 'cejel-binding-repo-'));
  const git = (args: string[]) =>
    execFileSync('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: CONFORMANCE_COMMIT_TIME,
        GIT_COMMITTER_DATE: CONFORMANCE_COMMIT_TIME,
      },
    }).trim();
  git(['init', '--quiet']);
  git(['config', 'user.email', 'conformance@example.invalid']);
  git(['config', 'user.name', 'Cejel Conformance']);
  git(['config', 'commit.gpgsign', 'false']);
  const write = (relative: string, contents: string) => {
    const path = join(repoPath, relative);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, contents, 'utf8');
  };
  write(
    'package.json',
    JSON.stringify({ name: 'binding-conformance', scripts: { build: 'tsc', test: 'vitest run' } }),
  );
  write('pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  write('src/index.ts', 'export const answer = 42;\n');
  write('src/index.test.ts', "it('answers', () => expect(42).toBe(42));\n");
  git(['add', '.']);
  git(['commit', '--quiet', '--no-gpg-sign', '-m', 'fixture']);
  return { repoPath, head: git(['rev-parse', 'HEAD']) };
}

interface Subject {
  repository?: string;
  commit?: string;
  observedAt?: string;
}

function subjectFor(testCase: ConformanceCase, head: string): Subject | undefined {
  switch (testCase) {
    case 'matching':
    case 'duplicate':
      return { repository: CONFORMANCE_SUBJECT_REPOSITORY, commit: head, observedAt: ONE_HOUR_AFTER };
    case 'wrong-repository':
      return { repository: OTHER_REPOSITORY, commit: OTHER_COMMIT, observedAt: ONE_HOUR_AFTER };
    case 'wrong-commit':
      return { repository: CONFORMANCE_SUBJECT_REPOSITORY, commit: OTHER_COMMIT, observedAt: ONE_HOUR_AFTER };
    case 'stale':
      return { repository: CONFORMANCE_SUBJECT_REPOSITORY, observedAt: ONE_YEAR_BEFORE };
    case 'unbound':
      return undefined;
  }
}

/** The same findings in every case, so only the declared identity differs between documents. */
export function conformanceDocument(
  format: ConformanceFormat,
  testCase: ConformanceCase,
  head: string,
): string {
  const subject = subjectFor(testCase, head);
  if (format === 'sarif') {
    return JSON.stringify({
      version: '2.1.0',
      runs: [
        {
          tool: { driver: { name: 'ExampleSAST', semanticVersion: '3.2.1' } },
          ...(subject
            ? {
                versionControlProvenance: [
                  {
                    repositoryUri: `https://${subject.repository}.git`,
                    ...(subject.commit ? { revisionId: subject.commit } : {}),
                  },
                ],
                invocations: [{ executionSuccessful: true, startTimeUtc: subject.observedAt }],
              }
            : {}),
          results: [
            {
              ruleId: 'sql-injection',
              level: 'error',
              message: { text: 'Untrusted input reaches a SQL query.' },
              locations: [
                { physicalLocation: { artifactLocation: { uri: 'src/index.ts' }, region: { startLine: 1 } } },
              ],
            },
          ],
        },
      ],
    });
  }
  if (format === 'scorecard') {
    return JSON.stringify({
      ...(subject
        ? {
            date: subject.observedAt,
            repo: {
              name: subject.repository,
              ...(subject.commit ? { commit: subject.commit } : {}),
            },
          }
        : {}),
      scorecard: { version: 'v5.6.0', commit: 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00' },
      score: 6.2,
      checks: [
        { name: 'Vulnerabilities', score: 5, reason: '2 existing vulnerabilities detected' },
        { name: 'Token-Permissions', score: 0, reason: 'detected GitHub workflow tokens with excessive permissions' },
      ],
    });
  }
  return JSON.stringify({
    version: subject ? '1.1' : '1.0',
    tool: 'example-scanner',
    ...(subject
      ? {
          subject: {
            repository: subject.repository,
            ...(subject.commit ? { commit: subject.commit } : {}),
          },
          producer: { name: 'example-scanner', version: '1.4.0' },
          observedAt: subject.observedAt,
        }
      : {}),
    signals: [
      {
        dimension: 'A4',
        weight: 0.6,
        findings: [{ ruleId: 'outdated-dependency', severity: 'warning', message: 'zod is outdated.' }],
      },
    ],
  });
}

/** Write a case's input(s) into a fresh directory; the duplicate case writes the same bytes twice. */
export function writeConformanceInputs(
  format: ConformanceFormat,
  testCase: ConformanceCase,
  head: string,
): string[] {
  const directory = mkdtempSync(join(tmpdir(), 'cejel-binding-inputs-'));
  const extension = format === 'sarif' ? 'sarif' : 'json';
  if (testCase === 'duplicate') {
    const body = conformanceDocument(format, 'matching', head);
    const first = join(directory, `first.${extension}`);
    const second = join(directory, `second.${extension}`);
    writeFileSync(first, body, 'utf8');
    writeFileSync(second, body, 'utf8');
    return [first, second];
  }
  const path = join(directory, `${testCase}.${extension}`);
  writeFileSync(path, conformanceDocument(format, testCase, head), 'utf8');
  return [path];
}
