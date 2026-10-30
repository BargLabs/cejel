import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  type IngestDocumentRecord,
  assertStrictIngestBinding,
  buildInputBinding,
  extractSarifIdentity,
  normalizeRepositoryIdentity,
  parseObservedAt,
} from '../input-binding.js';
import { importedAdjustmentSentence, inheritedFindingNote } from '../input-binding-presentation.js';
import { MAX_INGEST_DOCUMENTS, scoreRepoWithPublicCejel } from '../public-scan.js';
import { type WitanCriterionScore, type WitanReport, WitanReportSchema } from '../schemas.js';

import {
  CONFORMANCE_SUBJECT_REPOSITORY,
  makeConformanceRepo,
} from './fixtures/input-binding-conformance.js';

// Regression tests for the two post-merge review passes of #525 (input binding, report format
// 1.7). Each block names the finding it pins; every one of them failed on the merge commit.

// Fake GitLab tokens, assembled at runtime so no token-shaped literal sits in the source.
const FAKE_GITLAB_TOKEN = ['glpat', 'S3CR3TT0KEN0123456789'].join('-');
const FAKE_GITLAB_TOKEN_SHORT = ['glpat', 'TOKEN0123'].join('-');

const repo = makeConformanceRepo();
const ONE_HOUR_AFTER = '2026-10-01T13:00:00Z';

function score(
  inputs: readonly string[],
  options: {
    strictIngest?: boolean;
    subjectRepository?: string | null;
    repoPath?: string;
    autoDiscoverIngest?: boolean;
  } = {},
): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath: options.repoPath ?? repo.repoPath,
    productSlug: 'binding-review',
    productDisplayName: 'Binding Review',
    generatedAt: '2026-10-21T00:00:00.000Z',
    ingestPatterns: inputs,
    ...(options.subjectRepository === null
      ? {}
      : { subjectRepository: options.subjectRepository ?? CONFORMANCE_SUBJECT_REPOSITORY }),
    ...(options.strictIngest ? { strictIngest: true } : {}),
    ...(options.autoDiscoverIngest ? { autoDiscoverIngest: true } : {}),
  });
}

interface SarifRunSpec {
  provenance?: Array<{ repositoryUri?: string; revisionId?: string }>;
  times?: string[];
}

function sarif(runs: readonly SarifRunSpec[]): string {
  return JSON.stringify({
    version: '2.1.0',
    runs: runs.map((run) => ({
      tool: { driver: { name: 'ExampleSAST', semanticVersion: '3.2.1' } },
      ...(run.provenance ? { versionControlProvenance: run.provenance } : {}),
      invocations: [
        {
          executionSuccessful: true,
          ...(run.times?.[0] ? { startTimeUtc: run.times[0] } : {}),
          ...(run.times?.[1] ? { endTimeUtc: run.times[1] } : {}),
        },
      ],
      results: [
        {
          ruleId: 'sql-injection',
          level: 'error',
          message: { text: 'Untrusted input reaches a SQL query.' },
        },
      ],
    })),
  });
}

function writeInput(body: string, name = 'input.sarif'): string {
  const directory = mkdtempSync(join(tmpdir(), 'cejel-binding-review-'));
  const path = join(directory, name);
  writeFileSync(path, body, 'utf8');
  return path;
}

const MATCHING_URI = `https://${CONFORMANCE_SUBJECT_REPOSITORY}.git`;

describe('finding: credentials in an un-normalizable repository identity are never recorded', () => {
  const SECRET = FAKE_GITLAB_TOKEN;
  const forms = [
    `https://gitlab-ci-token:${SECRET}@10.20.30.40/group/repo.git`, // IP host
    `https://oauth2:${SECRET}@gitlab/group/repo`, // single-label host
    `https://user:${SECRET}@github.com./owner/repo`, // trailing-dot host
    `https://user:${SECRET}@github.com`, // no path
  ];

  it.each(forms)('withholds %s and records no part of it', (uri) => {
    const report = score([writeInput(sarif([{ provenance: [{ repositoryUri: uri, revisionId: repo.head }] }]))]);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain('gitlab-ci-token');
    const record = report.inputBinding?.inputs[0];
    expect(record?.subjects).toEqual([{ repositoryWithheld: true, commit: repo.head }]);
    // A repository Cejel cannot establish is never taken as the named one.
    expect(record?.checks.repository).toBe('mismatched');
    expect(record?.status).toBe('mismatched-repository');
  });

  it('without --subject-repository a withheld repository is unverifiable, as any repository is', () => {
    const report = score(
      [writeInput(sarif([{ provenance: [{ repositoryUri: forms[0], revisionId: repo.head }] }]))],
      { subjectRepository: null },
    );
    expect(JSON.stringify(report)).not.toContain(SECRET);
    expect(report.inputBinding?.inputs[0]?.checks.repository).toBe('unverifiable');
  });

  it('a withheld repository is refused under --strict-ingest when a subject repository is named', () => {
    expect(() =>
      score([writeInput(sarif([{ provenance: [{ repositoryUri: forms[0], revisionId: repo.head }] }]))], {
        strictIngest: true,
      }),
    ).toThrow(/mismatched-repository[\s\S]*repository withheld/);
  });

  it('the --subject-repository refusal does not echo the value', () => {
    expect(() => score([], { subjectRepository: forms[0] })).toThrow(/not echoed/);
    try {
      score([], { subjectRepository: forms[0] });
    } catch (error) {
      expect(String(error)).not.toContain(SECRET);
    }
  });
});

describe('finding: a declared repository that is not a string is withheld, not absent', () => {
  const scorecard = (head: string) =>
    JSON.stringify({
      date: ONE_HOUR_AFTER,
      repo: { name: { host: 'github.com', path: 'evil/other' }, commit: head },
      scorecard: { version: 'v5' },
      checks: [{ name: 'Code-Review', score: 3, reason: 'r', details: null }],
    });
  const sarifObject = (head: string) =>
    JSON.stringify({
      version: '2.1.0',
      runs: [
        {
          tool: { driver: { name: 't' } },
          results: [],
          versionControlProvenance: [{ repositoryUri: { uri: 'https://github.com/evil/other' }, revisionId: head }],
        },
      ],
    });

  it.each([
    ['Scorecard repo.name object', (head: string) => writeInput(scorecard(head), 'scorecard.json')],
    ['SARIF repositoryUri object', (head: string) => writeInput(sarifObject(head))],
  ])('%s: mismatched with --subject-repository, refused when strict', (_label, make) => {
    const path = make(repo.head);
    const record = score([path]).inputBinding?.inputs[0];
    expect(record?.subjects).toEqual([{ repositoryWithheld: true, commit: repo.head }]);
    expect(record?.status).toBe('mismatched-repository');
    expect(() => score([path], { strictIngest: true })).toThrow(/mismatched-repository/);
  });

  it('without --subject-repository the repository check is unverifiable', () => {
    const record = score([writeInput(sarifObject(repo.head))], { subjectRepository: null }).inputBinding
      ?.inputs[0];
    expect(record?.checks.repository).toBe('unverifiable');
  });

  it('a null or blank repository is still absent', () => {
    const record = score([
      writeInput(sarif([{ provenance: [{ repositoryUri: null as unknown as string, revisionId: repo.head }] }])),
    ]).inputBinding?.inputs[0];
    expect(record?.subjects).toEqual([{ commit: repo.head }]);
    expect(record?.status).toBe('matched');
  });
});

describe('finding: an identity whose path keeps an `@` is withheld', () => {
  it.each([
    `https://ci.bot:1234/${FAKE_GITLAB_TOKEN_SHORT}@gitlab.com/g/r`,
    `git@gitlab.com:${FAKE_GITLAB_TOKEN_SHORT}@x/r`,
  ])(
    'refuses to normalize %s',
    (uri) => {
      expect(normalizeRepositoryIdentity(uri)).toBeUndefined();
      const report = score([writeInput(sarif([{ provenance: [{ repositoryUri: uri, revisionId: repo.head }] }]))]);
      expect(JSON.stringify(report)).not.toContain('TOKEN0123');
      expect(report.inputBinding?.inputs[0]?.subjects).toEqual([{ repositoryWithheld: true, commit: repo.head }]);
    },
  );
});

describe('finding: every declared subject is checked, not only the first 8', () => {
  // Eight distinct abbreviations of HEAD for the right repository, then one foreign subject.
  const abbreviations = (head: string) =>
    Array.from({ length: 8 }, (_, index) => ({
      repositoryUri: MATCHING_URI,
      revisionId: head.slice(0, 7 + index),
    }));

  it('a foreign repository past the cap is mismatched, recorded, and refused when strict', () => {
    const path = writeInput(
      sarif([
        {
          provenance: [
            ...abbreviations(repo.head),
            { repositoryUri: 'https://github.com/other/project.git', revisionId: repo.head },
          ],
        },
      ]),
    );
    const record = score([path]).inputBinding?.inputs[0];
    expect(record?.status).toBe('mismatched-repository');
    expect(record?.subjects).toHaveLength(8);
    expect(record?.subjectsOmitted).toBe(1);
    // The recorded excerpt shows the subject that decided the status.
    expect(record?.subjects[0]).toEqual({ repository: 'github.com/other/project', commit: repo.head });
    expect(() => score([path], { strictIngest: true })).toThrow(/--strict-ingest refused 1 ingest input/);
  });

  it('a foreign commit past the cap is mismatched-commit', () => {
    const path = writeInput(
      sarif([
        {
          provenance: [
            ...abbreviations(repo.head),
            { repositoryUri: MATCHING_URI, revisionId: '0123456789abcdef0123456789abcdef01234567' },
          ],
        },
      ]),
    );
    expect(score([path]).inputBinding?.inputs[0]?.status).toBe('mismatched-commit');
    expect(() => score([path], { strictIngest: true })).toThrow(/mismatched-commit/);
  });

  it('a document with many entries is still read in linear time', () => {
    const provenance = Array.from({ length: 50_000 }, (_, index) => ({
      repositoryUri: `https://github.com/owner/repo-${index}.git`,
      revisionId: repo.head,
    }));
    const started = Date.now();
    const identity = extractSarifIdentity(JSON.parse(sarif([{ provenance }])));
    expect(identity.subjects).toHaveLength(50_000);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

describe('finding: out-of-range timestamps never reach report.json', () => {
  it.each([
    '9999-12-31T23:00:00-02:00', // year 10000 in UTC
    '0000-01-01T00:30:00+01:00', // year -1 in UTC
  ])('treats %s as absent', (value) => {
    expect(parseObservedAt(value)).toBeUndefined();
  });

  it('keeps the plain-year boundaries', () => {
    expect(parseObservedAt('9999-12-31T23:59:59Z')).toBe('9999-12-31T23:59:59.000Z');
    expect(parseObservedAt('0000-01-01T00:00:00Z')).toBe('0000-01-01T00:00:00.000Z');
  });

  it('earliest observation compares instants, and the report still validates', () => {
    const path = writeInput(
      sarif([
        {
          provenance: [{ repositoryUri: MATCHING_URI, revisionId: repo.head }],
          times: ['9999-12-31T23:00:00-02:00', ONE_HOUR_AFTER],
        },
      ]),
    );
    const report = score([path]);
    expect(report.inputBinding?.inputs[0]?.observedAt).toBe('2026-10-01T13:00:00.000Z');
    expect(WitanReportSchema.safeParse(report).success).toBe(true);
  });
});

describe('finding: the record never exceeds the schema bound of 256 inputs', () => {
  it('128 documents, each repeated explicitly and through .cejel/inputs, give a valid report', () => {
    const repeated = makeConformanceRepo();
    const inputsDir = join(repeated.repoPath, '.cejel', 'inputs');
    mkdirSync(inputsDir, { recursive: true });
    const paths: string[] = [];
    for (let index = 0; index < MAX_INGEST_DOCUMENTS; index += 1) {
      const path = join(inputsDir, `input-${String(index).padStart(3, '0')}.json`);
      writeFileSync(
        path,
        JSON.stringify({
          version: '1.0',
          tool: `scanner-${index}`,
          signals: [
            {
              dimension: 'A4',
              weight: 0.1,
              findings: [{ ruleId: 'outdated-dependency', severity: 'info', message: `finding ${index}` }],
            },
          ],
        }),
        'utf8',
      );
      paths.push(path);
    }
    // Each path: the first explicit read, an explicit repeat, and an auto-discovered repeat. On
    // the merge commit that recorded 3 x 128 = 384 inputs against the schema's 256.
    const report = score([...paths, ...paths], {
      repoPath: repeated.repoPath,
      subjectRepository: null,
      autoDiscoverIngest: true,
    });
    expect(report.inputBinding?.inputs.filter((input) => input.duplicate === undefined)).toHaveLength(
      MAX_INGEST_DOCUMENTS,
    );
    expect(report.inputBinding?.inputs.length).toBeLessThanOrEqual(256);
    expect(WitanReportSchema.safeParse(report).success).toBe(true);
  }, 60_000);

  it('the final report is validated before it is returned', async () => {
    const module = (await import('../public-scan.js')) as Record<string, unknown>;
    const assertReportVerifiable = module.assertReportVerifiable as
      | ((report: WitanReport) => WitanReport)
      | undefined;
    expect(typeof assertReportVerifiable).toBe('function');
    const report = score([writeInput(sarif([{ provenance: [{ repositoryUri: MATCHING_URI, revisionId: repo.head }] }]))]);
    expect(assertReportVerifiable?.(report)).toBe(report);
    const broken = {
      ...report,
      inputBinding: { ...report.inputBinding, scannedSubject: { commitTime: '+010000-01-01T00:00:00.000Z' } },
    } as WitanReport;
    expect(() => assertReportVerifiable?.(broken)).toThrow(/no certificate was written[\s\S]*commitTime/);
  });
});

describe('finding: a partially bound SARIF document is not matched', () => {
  it('a run with HEAD provenance beside a run with none is unbound', () => {
    const record = score([
      writeInput(sarif([{ provenance: [{ repositoryUri: MATCHING_URI, revisionId: repo.head }] }, {}])),
    ]).inputBinding?.inputs[0];
    expect(record?.checks.commit).toBe('matched');
    expect(record?.subjects).toContainEqual({});
    expect(record?.status).toBe('unbound');
  });

  it('a provenance entry with no revisionId beside one with HEAD is unbound', () => {
    const record = score([
      writeInput(
        sarif([
          { provenance: [{ repositoryUri: MATCHING_URI, revisionId: repo.head }] },
          { provenance: [{ repositoryUri: MATCHING_URI }] },
        ]),
      ),
    ]).inputBinding?.inputs[0];
    expect(record?.status).toBe('unbound');
  });

  it('a document in which no run declares a subject keeps subjects []', () => {
    const record = score([writeInput(sarif([{}, {}]))]).inputBinding?.inputs[0];
    expect(record?.subjects).toEqual([]);
    expect(record?.status).toBe('unbound');
  });

  it('every run bound to HEAD is still matched', () => {
    const record = score([
      writeInput(
        sarif([
          { provenance: [{ repositoryUri: MATCHING_URI, revisionId: repo.head }] },
          { provenance: [{ repositoryUri: MATCHING_URI, revisionId: repo.head.slice(0, 12) }] },
        ]),
      ),
    ]).inputBinding?.inputs[0];
    expect(record?.status).toBe('matched');
  });
});

describe('finding: repository normalization is idempotent', () => {
  const forms = [
    'github.com/Owner/Repo',
    'https://github.com/owner/repo.git',
    'https://github.com/owner/repo/',
    'https://github.com/owner/repo/.git',
    'https://github.com/owner/repo.git/',
    'https://github.com/owner/repo.git.git',
    'https://github.com/owner/repo//.git//',
    'git@github.com:owner/repo.git',
    'ssh://git@github.com:22/owner/repo',
    'https://user:token@github.com/owner/repo',
    'https://gitlab.example.com/group/sub/repo',
    'https://github.com/owner/repo?ref=main#readme',
    'localhost/owner/repo',
  ];
  it.each(forms)('%s is a fixed point after one normalization', (form) => {
    const once = normalizeRepositoryIdentity(form);
    expect(once).toBeDefined();
    expect(normalizeRepositoryIdentity(once ?? '')).toBe(once);
  });
  it('`https://github.com/o/r/.git` reaches github.com/o/r in one pass', () => {
    expect(normalizeRepositoryIdentity('https://github.com/o/r/.git')).toBe('github.com/o/r');
  });
});

describe('finding: an ingested ruleId cannot reach Object.prototype', () => {
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf'])(
    'has no inherited note for %s',
    (ruleId) => {
      expect(inheritedFindingNote(ruleId)).toBeUndefined();
    },
  );
  it('still has the real notes', () => {
    expect(inheritedFindingNote('scorecard:SAST')).toMatch(/Scorecard SAST/);
  });
});

describe('finding: a clamped adjustment is not described as a move', () => {
  const base = {
    id: 'A2',
    title: 'Secrets',
    category: 'code_trust',
    evidence: [],
    findings: [],
    metrics: [],
  } as unknown as WitanCriterionScore;

  it('does not say "lowered this score by 0.0" when the score did not move', () => {
    const sentence = importedAdjustmentSentence({
      ...base,
      score: 0,
      nativeScore: 0,
      status: 'critical',
      nativeStatus: 'critical',
    });
    expect(sentence).not.toMatch(/lowered/);
    expect(sentence).toMatch(/did not move its score/);
  });

  it('names a status move without claiming a score move', () => {
    const sentence = importedAdjustmentSentence({
      ...base,
      score: 1,
      nativeScore: 1,
      status: 'critical',
      nativeStatus: 'warning',
    });
    expect(sentence).not.toMatch(/lowered/);
    expect(sentence).toMatch(/did not move the score but moved the status to critical/);
  });

  it('keeps the lowered wording when the score moved', () => {
    expect(
      importedAdjustmentSentence({ ...base, score: 2.5, nativeScore: 3, status: 'info', nativeStatus: 'info' }),
    ).toBe("Ingested findings lowered this score by 0.5 from Cejel's own 3.0/4.0; the status is the native one.");
  });
});

describe('finding: the --strict-ingest refusal strips terminal controls from the path', () => {
  it('prints the path without ESC or BEL', () => {
    const document: IngestDocumentRecord = {
      sha256: 'b'.repeat(64),
      format: 'generic',
      provenance: 'auto_discovered',
      identity: { producers: [], subjects: [{ commit: '0123456789abcdef0123456789abcdef01234567' }] },
      displayPath: '.cejel/inputs/\u001b]0;owned\u0007\u001b[2Jinput.json',
    };
    const binding = buildInputBinding([document], { commit: repo.head }, 'strict');
    let message = '';
    try {
      assertStrictIngestBinding([document], binding);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('mismatched-commit');
    expect(message).toContain('input.json');
    expect(message).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/);
  });
});
