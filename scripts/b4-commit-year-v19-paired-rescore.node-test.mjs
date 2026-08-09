import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assignPlacements,
  buildDecision,
  renderMarkdown,
} from './b4-commit-year-v19-paired-rescore.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function report(overallScore, score = 3) {
  return {
    overallScore,
    criteria: [
      { id: 'A1', category: 'code_trust', score, status: 'verified' },
      { id: 'B1', category: 'process_trust', score: 0, status: 'not_applicable' },
      { id: 'B2', category: 'process_trust', score, status: 'verified' },
      { id: 'B4', category: 'process_trust', score, status: 'verified', metrics: [] },
      { id: 'B5', category: 'process_trust', score: 0, status: 'not_applicable' },
    ],
  };
}

function arm(value) {
  return {
    report: value,
    comparableScore: value.overallScore,
    summary: { coverage: { lowConfidence: false }, placement: null },
  };
}

test('placement excludes publisher-owned, scoreless, and low-confidence rows', () => {
  const rows = [
    { name: 'ranked', corpusIndex: 0, baseline: arm(report(3.5)) },
    { name: 'lower', corpusIndex: 1, baseline: arm(report(2.5)) },
    { name: 'alfred', corpusIndex: 2, baseline: arm(report(4)) },
    { name: 'scoreless', corpusIndex: 3, baseline: arm(report(null)) },
    { name: 'thin', corpusIndex: 4, baseline: arm(report(3.8)) },
  ];
  rows[4].baseline.summary.coverage.lowConfidence = true;

  assignPlacements(rows, 'baseline');

  assert.deepEqual(
    rows.map((row) => row.baseline.summary.placement),
    ['1', '2', 'transparency', 'unrated', 'unranked'],
  );
});

test('placement reproduces the frozen prospective-v18 board', () => {
  const corpus = JSON.parse(readFileSync(join(REPO_ROOT, 'leaderboard/corpus.json'), 'utf8'));
  const rows = corpus.entries.map((entry, corpusIndex) => {
    const value = JSON.parse(
      readFileSync(join(REPO_ROOT, 'leaderboard/reports', `${entry.name}.json`), 'utf8'),
    );
    const byCategory = [];
    let measured = 0;
    for (const criterion of value.criteria) {
      let bucket = byCategory.find((candidate) => candidate.category === criterion.category);
      if (!bucket) {
        bucket = { category: criterion.category, measured: 0, total: 0 };
        byCategory.push(bucket);
      }
      bucket.total += 1;
      if (criterion.status !== 'not_applicable' && criterion.status !== 'insufficient_data') {
        bucket.measured += 1;
        measured += 1;
      }
    }
    const counts = [...byCategory, { measured, total: value.criteria.length }];
    const comparable = value.criteria.filter(
      (criterion) =>
        criterion.id !== 'B1' &&
        criterion.id !== 'B5' &&
        criterion.status !== 'not_applicable' &&
        criterion.status !== 'insufficient_data',
    );
    return {
      name: entry.name,
      corpusIndex,
      baseline: {
        report: value,
        comparableScore:
          comparable.length === 0
            ? null
            : Math.round(
                (comparable.reduce((sum, criterion) => sum + criterion.score, 0) /
                  comparable.length) *
                  10,
              ) / 10,
        summary: {
          coverage: {
            lowConfidence: counts.some(
              ({ measured: count, total }) => total > 0 && count / total < 0.5,
            ),
          },
        },
      },
    };
  });

  assignPlacements(rows, 'baseline');

  assert.deepEqual(
    Object.fromEntries(rows.map((row) => [row.name, row.baseline.summary.placement])),
    {
      react: '9',
      vue: '11',
      svelte: '4',
      django: 'unranked',
      flask: '8',
      fastapi: 'unranked',
      express: 'unranked',
      vite: '1',
      esbuild: '13',
      biomejs: '6',
      requests: '7',
      pydantic: '3',
      axios: '2',
      zod: '5',
      scorecard: '10',
      ripgrep: '14',
      guava: 'unranked',
      cobra: 'unranked',
      sinatra: 'unranked',
      automapper: 'unranked',
      fmt: '12',
      carddemo: 'unrated',
      alfred: 'transparency',
      cejel: 'transparency',
    },
  );
});

test('decision requires 24 completed, stable rows and permits at most three raw changes', () => {
  const rows = Array.from({ length: 24 }, (_, index) => {
    const base = report(3);
    const candidate = structuredClone(base);
    base.criteria[3].metrics = [{ name: 'audit_freshness_depth', value: index < 3 ? 0 : 1 }];
    candidate.criteria[3].metrics = [{ name: 'audit_freshness_depth', value: 1 }];
    const summary = {
      overallScore: 3,
      codeTrustScore: 3,
      processTrustScore: 3,
      verdict: 'conditional',
      coverage: { lowConfidence: false },
      b4: { score: 3, status: 'verified' },
      placement: String(index + 1),
    };
    return {
      name: `repo-${index}`,
      baseline: { report: base, summary },
      candidate: { report: candidate, summary: structuredClone(summary) },
      nonB4CriteriaByteIdentical: true,
    };
  });

  assert.equal(buildDecision(rows).protocolDecision, 'GO');
  rows[3].candidate.report.criteria[3].metrics[0].value = 0;
  assert.equal(buildDecision(rows).protocolDecision, 'NO-GO');
});

test('markdown renders every row explicitly', () => {
  const rows = Array.from({ length: 24 }, (_, index) => ({
    name: `repo-${index}`,
    baseline: {
      b4: { score: 3, status: 'verified', metrics: [{ name: 'audit_freshness_depth', value: 1 }] },
      overallScore: 3,
      codeTrustScore: 3,
      processTrustScore: 3,
      verdict: 'conditional',
      coverage: { byCategory: [] },
      placement: String(index + 1),
    },
    candidate: {
      b4: { score: 3, status: 'verified', metrics: [{ name: 'audit_freshness_depth', value: 1 }] },
      overallScore: 3,
      codeTrustScore: 3,
      processTrustScore: 3,
      verdict: 'conditional',
      coverage: { byCategory: [] },
      placement: String(index + 1),
    },
    nonB4CriteriaByteIdentical: true,
  }));
  const markdown = renderMarkdown({
    bindings: {
      preregistrationCommit: 'a',
      executionCommit: 'b',
      generatedAt: 'c',
      corpus: { gitBlob: 'd', sha256: 'e' },
      candidateSources: {},
    },
    decision: {
      protocolDecision: 'GO',
      counts: {
        completed: 24,
        errors: 0,
        rawFreshnessChanges: 0,
        b4ScoreOrStatusChanges: 0,
        headlineChanges: 0,
        placementChanges: 0,
        nonB4Changes: 0,
      },
    },
    rows,
  });
  assert.equal(markdown.match(/^\| repo-/gm)?.length, 24);
});
