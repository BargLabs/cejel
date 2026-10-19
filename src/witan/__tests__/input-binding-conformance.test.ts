import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { projectWitanScoringSurface } from '../rubric-fingerprint.js';
import type { WitanInputBindingRecord, WitanReport } from '../schemas.js';

import {
  CONFORMANCE_CASES,
  CONFORMANCE_FORMATS,
  CONFORMANCE_SUBJECT_REPOSITORY,
  type ConformanceCase,
  type ConformanceFormat,
  makeConformanceRepo,
  writeConformanceInputs,
} from './fixtures/input-binding-conformance.js';

// The conformance suite of docs/input-binding.md, run from the table on that page so the
// published expectations and the behaviour cannot drift apart.

interface ConformanceRow {
  format: ConformanceFormat;
  testCase: ConformanceCase;
  status: string;
  duplicate: string;
  defaultOutcome: string;
  strictOutcome: string;
}

function readConformanceTable(): ConformanceRow[] {
  const doc = readFileSync(new URL('../../../docs/input-binding.md', import.meta.url), 'utf8');
  const section = doc.slice(doc.indexOf('## Conformance suite'));
  return section
    .split('\n')
    .filter((line) => /^\| (sarif|scorecard|generic) \|/.test(line))
    .map((line) => {
      const [format, testCase, status, duplicate, defaultOutcome, strictOutcome] = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      return {
        format: format as ConformanceFormat,
        testCase: testCase as ConformanceCase,
        status: status ?? '',
        duplicate: duplicate ?? '',
        defaultOutcome: defaultOutcome ?? '',
        strictOutcome: strictOutcome ?? '',
      };
    });
}

const repo = makeConformanceRepo();

function score(
  inputs: readonly string[],
  options: { strictIngest?: boolean; subjectRepository?: string | null } = {},
): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath: repo.repoPath,
    productSlug: 'binding-conformance',
    productDisplayName: 'Binding Conformance',
    generatedAt: '2026-10-19T00:00:00.000Z',
    ingestPatterns: inputs,
    ...(options.subjectRepository === null
      ? {}
      : { subjectRepository: options.subjectRepository ?? CONFORMANCE_SUBJECT_REPOSITORY }),
    ...(options.strictIngest ? { strictIngest: true } : {}),
  });
}

function caseRecord(report: WitanReport, testCase: ConformanceCase): WitanInputBindingRecord {
  const inputs = report.inputBinding?.inputs ?? [];
  const record =
    testCase === 'duplicate' ? inputs.find((input) => input.duplicate !== undefined) : inputs[0];
  if (!record) throw new Error(`no binding record for ${testCase}`);
  return record;
}

describe('input binding conformance (docs/input-binding.md)', () => {
  const rows = readConformanceTable();

  it('the published table covers every format and case exactly once', () => {
    expect(rows.map((row) => `${row.format}/${row.testCase}`).sort()).toEqual(
      CONFORMANCE_FORMATS.flatMap((format) =>
        CONFORMANCE_CASES.map((testCase) => `${format}/${testCase}`),
      ).sort(),
    );
  });

  for (const row of rows) {
    it(`${row.format} ${row.testCase}: ${row.status}, default ${row.defaultOutcome}, strict ${row.strictOutcome}`, () => {
      const inputs = writeConformanceInputs(row.format, row.testCase, repo.head);

      const report = score(inputs);
      expect(report.inputBinding?.policy).toBe('record-only');
      const record = caseRecord(report, row.testCase);
      expect(record.format).toBe(row.format);
      expect(record.status).toBe(row.status);
      expect(record.duplicate ?? '-').toBe(row.duplicate);
      expect(row.defaultOutcome).toBe('scored, recorded');
      expect(record.scored).toBe(true);
      expect(report.consumedSignals?.length ?? 0).toBeGreaterThan(0);

      if (row.strictOutcome === 'accepted') {
        const strict = score(inputs, { strictIngest: true });
        expect(strict.inputBinding?.policy).toBe('strict');
        expect(projectWitanScoringSurface(strict)).toEqual(projectWitanScoringSurface(report));
      } else {
        expect(row.strictOutcome).toBe('refused');
        expect(() => score(inputs, { strictIngest: true })).toThrow(
          /--strict-ingest refused 1 ingest input/,
        );
      }
    });
  }

  it('the default policy never lets binding status reach a score', () => {
    for (const format of CONFORMANCE_FORMATS) {
      const matching = score(writeConformanceInputs(format, 'matching', repo.head));
      for (const testCase of ['wrong-repository', 'wrong-commit', 'stale', 'unbound'] as const) {
        const other = score(writeConformanceInputs(format, testCase, repo.head));
        expect(caseRecord(other, testCase).status).not.toBe('matched');
        expect(projectWitanScoringSurface(other), `${format} ${testCase}`).toEqual(
          projectWitanScoringSurface(matching),
        );
      }
    }
  });

  it('without --subject-repository a wrong-repository input is a commit mismatch, still refused when strict', () => {
    for (const format of CONFORMANCE_FORMATS) {
      const inputs = writeConformanceInputs(format, 'wrong-repository', repo.head);
      const record = caseRecord(score(inputs, { subjectRepository: null }), 'wrong-repository');
      expect(record.status).toBe('mismatched-commit');
      expect(record.checks.repository).toBe('unverifiable');
      expect(() => score(inputs, { subjectRepository: null, strictIngest: true })).toThrow(
        /mismatched-commit/,
      );
    }
  });

  it('records a path supplied twice once as scored and once as an unscored same-path duplicate', () => {
    const [input] = writeConformanceInputs('scorecard', 'matching', repo.head);
    if (!input) throw new Error('fixture wrote no input');
    const once = score([input]);
    const twice = score([input, input]);
    expect(projectWitanScoringSurface(twice)).toEqual(projectWitanScoringSurface(once));
    expect(twice.inputBinding?.inputs.map((record) => [record.duplicate ?? null, record.scored])).toEqual([
      [null, true],
      ['same-path', false],
    ]);
    expect(() => score([input, input], { strictIngest: true })).toThrow(/duplicate \(same-path\)/);
  });

  it('records the declared window and the scanned subject, and orders inputs by digest', () => {
    const inputs = CONFORMANCE_FORMATS.flatMap((format) =>
      writeConformanceInputs(format, 'matching', repo.head),
    );
    const forward = score(inputs);
    const reversed = score([...inputs].reverse());
    expect(JSON.stringify(reversed.inputBinding)).toBe(JSON.stringify(forward.inputBinding));
    expect(forward.inputBinding?.freshnessWindowSeconds).toBe(86_400);
    expect(forward.inputBinding?.scannedSubject).toEqual({
      repository: CONFORMANCE_SUBJECT_REPOSITORY,
      commit: repo.head,
      commitTime: '2026-10-01T12:00:00.000Z',
    });
    const digests = forward.inputBinding?.inputs.map((record) => record.sha256) ?? [];
    expect(digests).toEqual([...digests].sort());
    expect(JSON.stringify(forward.inputBinding)).not.toContain(inputs[0] ?? '<none>');
  });

  it('a report that ingests nothing carries no inputBinding', () => {
    expect(score([])).not.toHaveProperty('inputBinding');
  });
});
