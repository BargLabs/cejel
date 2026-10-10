// pnpm exec node --test docs/experiments/board-regeneration-0.6.3-full-history-2026-10-10/harness/compare.test.mjs
// Exercises compare.mjs on synthetic reports only. No corpus repository or real report is read,
// except the preregistration's own expected-values block, which must parse.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { comparableScore, compareRun, coverage, parseExpected, placements, PRIVATE_LABEL } from './compare.mjs';

const PIN = 'a'.repeat(40);
const HIDDEN = { name: 'zz-hidden-row', commit: 'f'.repeat(40) };
const NA = { score: 0, status: 'not_applicable', metrics: [] };

// A synthetic v17-shaped report: eleven criteria, A* code_trust and B* process_trust.
function report({ overall, code, process, verdict = 'conditional', headSha = PIN, ...crit }) {
  const ids = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6'];
  return {
    toolVersion: '0.6.3',
    rubricVersion: 'witan-rubric-v17-2026-07-24',
    rubricBehaviourFingerprint: 'sha256:fp',
    repo: { headSha },
    overallScore: overall, codeTrustScore: code, processTrustScore: process, verdict,
    criteria: ids.map((id) => ({ id, category: id[0] === 'A' ? 'code_trust' : 'process_trust', ...(crit[id] ?? NA) })),
  };
}
const b2 = (score, ratio, max) => ({ score, status: 'verified', metrics: [{ name: 'pr_trace_primitives', value: 2, max: 2 }, { name: 'pr_merge_ratio', value: ratio, max }] });
const base = {
  A1: { score: 2.5, status: 'verified', metrics: [{ name: 'non_hollow_test_share', value: 3, max: 3 }] },
  A4: { score: 3, status: 'verified', metrics: [] },
  A5: { score: 2, status: 'warning', metrics: [] },
  B3: { score: 3, status: 'verified', metrics: [] },
  B4: { score: 2, status: 'verified', metrics: [] },
};
// Published (depth-1): B2 4.0 at 1/1. New (full history): B2 3.6 at 6/12.
const published = report({ overall: 2.8, code: 2.5, process: 3, ...base, B2: b2(4, 1, 1) });
const fresh = report({ overall: 2.7, code: 2.5, process: 2.9, ...base, B2: b2(3.6, 6, 12) });
const expectedRow = {
  overall: 2.7, code: 2.5, process: 2.9, verdict: 'conditional', comparable: 2.7,
  coverage: 'code_trust 3/5; process_trust 3/6', placement: '1',
  criteria: { A1: '2.5/verified', A2: '0/not_applicable', A3: '0/not_applicable', A4: '3/verified', A5: '2/warning', B1: '0/not_applicable', B2: '3.6/verified', B3: '3/verified', B4: '2/verified', B5: '0/not_applicable', B6: '0/not_applicable' },
  metrics: { 'B2.pr_merge_ratio': { value: 6, max: 12 } },
};
const corpus = { entries: [{ name: 'alpha', commit: PIN, visibility: 'public' }, { name: HIDDEN.name, self: true, visibility: 'private' }] };
const expected = (row = expectedRow) => ({
  toolVersion: '0.6.3', rubricVersion: 'witan-rubric-v17-2026-07-24', rubricBehaviourFingerprint: 'sha256:fp',
  commits: { alpha: 120 }, rankOrder: ['alpha'], rows: { alpha: row },
});
const hiddenReport = report({ overall: 3.7, code: 3.6, process: 3.8, verdict: 'verified', headSha: HIDDEN.commit, ...base, B2: b2(3.9, 11, 12) });
const meta = (alpha = {}) => new Map([
  ['alpha', { head: PIN, shallow: 'false', commits: '120', ...alpha }],
  [HIDDEN.name, { head: HIDDEN.commit, shallow: 'false', commits: '999' }],
]);
const run = ({ cur = fresh, exp = expected(), m = meta(), hidden = hiddenReport } = {}) =>
  compareRun({ corpus, published: new Map([['alpha', published]]), current: new Map([['alpha', cur], [HIDDEN.name, hidden]]), meta: m, expected: exp });

test('a row equal to its expectation holds, and the board-to-new delta names what moved', () => {
  const out = run();
  const row = out.newVsPrereg.rows.find((r) => r.name === 'alpha');
  assert.equal(row.held, true);
  assert.deepEqual(row.scoringMismatches, []);
  assert.deepEqual(row.placementMismatches, []);
  assert.equal(out.newVsPrereg.summary.rankOrderHeld, true);
  assert.equal(out.newVsPrereg.summary.completed, '2/2');
  assert.deepEqual(out.newVsPrereg.run.r1, []);
  assert.deepEqual(out.newVsPrereg.run.r2, { toolVersion: 2, rubricVersion: 2, fingerprint: 2, of: 2 });
  const delta = out.boardToNew.rows.find((r) => r.name === 'alpha');
  assert.deepEqual(delta.headline, ['overall 2.8 to 2.7', 'process 3 to 2.9', 'comparable 2.8 to 2.7']);
  assert.deepEqual(delta.criteria, ['B2 4/verified to 3.6/verified']);
  assert.deepEqual(delta.metrics, ['B2.pr_merge_ratio 1/1 to 6/12']);
});

test('every deviation is listed: criterion, metric, headline, and placement apart from scoring', () => {
  const wrong = report({ overall: 2.7, code: 2.5, process: 2.9, ...base, A4: { score: 2.9, status: 'warning', metrics: [] }, B2: b2(3.6, 5, 12) });
  const out = run({ cur: wrong, exp: expected({ ...expectedRow, placement: '2' }) });
  const row = out.newVsPrereg.rows.find((r) => r.name === 'alpha');
  assert.equal(row.held, false);
  assert.deepEqual(row.scoringMismatches, ['A4 expected 3/verified, got 2.9/warning', 'B2.pr_merge_ratio expected 6/12, got 5/12']);
  assert.deepEqual(row.placementMismatches, ['placement expected 2, got 1']);
  assert.deepEqual(out.newVsPrereg.summary.rowsWithScoringMismatch, ['alpha']);
});

test('a declared alternative is recognised, and its criterion metrics are not predicted', () => {
  const a2 = (score, status, value) => ({ score, status, metrics: [{ name: 'secret_cleanliness', value, max: 1 }] });
  const pubA2 = report({ overall: 2.8, code: 2.6, process: 3, ...base, A2: a2(3.2, 'verified', 1), B2: b2(4, 1, 1) });
  const curA2 = report({ overall: 2.6, code: 2.2, process: 2.9, ...base, A2: a2(1.4, 'critical', 0), B2: b2(3.6, 6, 12) });
  const exp = {
    ...expectedRow, code: 2.6, overall: 2.8, comparable: 2.7, coverage: 'code_trust 4/5; process_trust 3/6',
    criteria: { ...expectedRow.criteria, A2: '3.2/verified' },
    metricsNotPredicted: ['A2'],
    alternatives: { 'A2-history-database-url-critical': { overall: 2.6, code: 2.2, process: 2.9, verdict: 'conditional', comparable: 2.5, coverage: 'code_trust 4/5; process_trust 3/6', placement: '1', criteria: { A2: '1.4/critical' } } },
  };
  const out = compareRun({ corpus, published: new Map([['alpha', pubA2]]), current: new Map([['alpha', curA2], [HIDDEN.name, hiddenReport]]), meta: meta(), expected: expected(exp) });
  const row = out.newVsPrereg.rows.find((r) => r.name === 'alpha');
  assert.equal(row.held, false);
  assert.equal(row.matchesAlternative, 'A2-history-database-url-critical');
  assert.ok(row.scoringMismatches.includes('A2 expected 3.2/verified, got 1.4/critical'));
  assert.ok(!row.scoringMismatches.some((s) => s.startsWith('A2.secret_cleanliness')));
});

test('the private row leaves only its label and completion status', () => {
  for (const hidden of [hiddenReport, null]) {
    const out = run({ hidden });
    const text = JSON.stringify(out);
    assert.ok(!text.includes(HIDDEN.name), 'private row name leaked');
    assert.ok(!text.includes(HIDDEN.commit), 'private row commit leaked');
    assert.ok(!text.includes('3.7') && !text.includes('3.8') && !text.includes('999'), 'private row value leaked');
    const entries = [...out.boardToNew.rows, ...out.newVsPrereg.rows].filter((r) => r.name === PRIVATE_LABEL);
    assert.deepEqual(entries, Array(2).fill({ name: PRIVATE_LABEL, status: hidden ? 'scored' : 'error', predicted: false }));
  }
});

test('R1 flags a shallow clone, a wrong head and a commit count off the record', () => {
  const out = run({ m: meta({ shallow: 'true', head: 'b'.repeat(40), commits: '1' }) });
  assert.deepEqual(out.newVsPrereg.run.r1, ['alpha: head is not the corpus pin; is-shallow-repository true; commits expected 120, got 1']);
});

test('placement: comparable score, then name; low coverage unranked; publisher-owned never ranked', () => {
  const lowCov = report({ overall: 3.5, code: 3.5, process: 3.5, A1: { score: 3.5, status: 'verified', metrics: [] }, B2: b2(3.5, 1, 1) });
  const reports = new Map([['zeta', fresh], ['beta', fresh], ['low', lowCov], ['cejel', fresh], ['gone', null], ['abstains', report({ overall: null, code: null, process: null, verdict: 'insufficient_source' })]]);
  const p = placements(reports, new Set(['cejel']));
  assert.deepEqual(Object.fromEntries(p), { zeta: '2', beta: '1', low: 'unranked', cejel: 'transparency', gone: 'error', abstains: 'unrated' });
  assert.equal(comparableScore(fresh), 2.7);
  assert.deepEqual(coverage(lowCov), { text: 'code_trust 1/5; process_trust 1/6', low: true });
});

test('the preregistration block parses: 23 public rows, 15 ranked in order, no private row', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const exp = parseExpected(readFileSync(join(here, '..', 'PREREGISTRATION.md'), 'utf8'));
  assert.equal(Object.keys(exp.rows).length, 23);
  assert.equal(exp.rankOrder.length, 15);
  const ranked = Object.entries(exp.rows).filter(([, r]) => /^\d+$/.test(r.placement)).sort((a, b) => Number(a[1].placement) - Number(b[1].placement)).map(([n]) => n);
  assert.deepEqual(ranked, exp.rankOrder);
  const corpusNames = JSON.parse(readFileSync(join(here, '..', '..', '..', '..', 'leaderboard', 'corpus.json'), 'utf8')).entries;
  assert.deepEqual(Object.keys(exp.rows).sort(), corpusNames.filter((e) => e.visibility !== 'private').map((e) => e.name).sort());
});
