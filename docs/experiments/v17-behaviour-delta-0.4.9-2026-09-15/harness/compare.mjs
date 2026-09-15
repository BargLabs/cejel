// Compares out/base vs out/cand per corpus row; also checks whether the BASE arm
// reproduces the published board report (cejel-site/leaderboard/reports/<name>.json)
// criterion-for-criterion, so the delta rests on a baseline that is known to be the
// board's, not assumed to be. Emits: delta.json (machine), delta.md (table for the
// RUBRIC_CHANGELOG entry). Private-row content never leaves this machine: only
// scores/verdict/coverage/placement and criterion ids/scores/statuses are emitted.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.env.HOME ?? '', 'tmp/cejel-049-delta');
const SITE_REPORTS = resolve(process.env.HOME ?? '', 'projects/cejel-site/leaderboard/reports');
const PUBLISHER_OWNED = new Set(['alfred', 'cejel']);
const corpus = JSON.parse(readFileSync(join(ROOT, 'corpus.json'), 'utf8'));
const read = (arm, name) => JSON.parse(readFileSync(join(ROOT, 'out', arm, `${name}.json`), 'utf8'));
const manifest = (arm) => JSON.parse(readFileSync(join(ROOT, 'out', arm, '_manifest.json'), 'utf8'));

function canonicalize(v) {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonicalize(v[k])]));
  return v;
}
const cj = (v) => JSON.stringify(canonicalize(v));
const sha = (s) => createHash('sha256').update(s).digest('hex');

function coverage(report) {
  const byCat = new Map();
  let measured = 0;
  for (const c of report.criteria) {
    const b = byCat.get(c.category) ?? { measured: 0, total: 0 };
    b.total += 1;
    if (c.status !== 'not_applicable' && c.status !== 'insufficient_data') { b.measured += 1; measured += 1; }
    byCat.set(c.category, b);
  }
  const overall = { measured, total: report.criteria.length };
  const lowConfidence = [...byCat.values(), overall].some(({ measured: m, total }) => total > 0 && m / total < 0.5);
  const text = [...byCat.entries()].map(([k, b]) => `${k} ${b.measured}/${b.total}`).join('; ');
  return { byCat: Object.fromEntries(byCat), overall, lowConfidence, text };
}
function comparableScore(report) {
  const s = report.criteria.filter((c) => c.id !== 'B1' && c.id !== 'B5' && c.status !== 'not_applicable' && c.status !== 'insufficient_data').map((c) => c.score);
  return s.length === 0 ? null : Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10;
}
function placements(rows, arm) {
  const rankable = rows.filter((r) => !PUBLISHER_OWNED.has(r.name) && r[arm].report.overallScore !== null && !r[arm].cov.lowConfidence)
    .sort((l, r) => { const d = r[arm].cmp - l[arm].cmp; return d === 0 ? l.name.localeCompare(r.name) : d; });
  const rank = new Map(rankable.map((r, i) => [r.name, i + 1]));
  for (const r of rows) {
    const rep = r[arm].report;
    r[arm].placement = PUBLISHER_OWNED.has(r.name) ? 'transparency' : rep.overallScore === null ? 'unrated' : r[arm].cov.lowConfidence ? 'unranked' : String(rank.get(r.name));
  }
}
const fmt = (v) => (v === null || v === undefined ? 'scoreless' : String(v));
const verdictText = (v) => ({ conditional: 'Conditional', at_risk: 'At risk', insufficient_source: 'Insufficient source', trusted: 'Trusted' })[v] ?? v;

const rows = [];
for (const e of corpus.entries) {
  const row = { name: e.name, visibility: e.visibility };
  for (const arm of ['base', 'cand']) {
    const m = manifest(arm).rows.find((r) => r.name === e.name);
    if (!m?.ok) { row[arm] = { error: m?.error ?? 'missing' }; continue; }
    const report = read(arm, e.name);
    row[arm] = { report, cov: coverage(report), cmp: comparableScore(report) };
  }
  rows.push(row);
}
for (const arm of ['base', 'cand']) placements(rows.filter((r) => !r[arm].error), arm);

// Scoring-level view of a report: headline, per-criterion score/status, per-metric value.
// This is the level at which "same score" is a meaningful claim. Whole-report equality is NOT:
// 0.4.8 added a `derivation` field to every finding, so an older report differs from a newer
// one on byte content while agreeing on every number — the first version of this check compared
// whole objects and reported DIFFERS on all 24 rows regardless of input (review finding on
// cejel #306).
function scoringView(report) {
  return {
    headSha: report.repo?.headSha,
    overallScore: report.overallScore,
    codeTrustScore: report.codeTrustScore,
    processTrustScore: report.processTrustScore,
    verdict: report.verdict,
    criteria: [...report.criteria]
      .sort((l, r) => l.id.localeCompare(r.id))
      .map((c) => ({
        id: c.id,
        score: c.score,
        status: c.status,
        metrics: [...(c.metrics ?? [])].sort((l, r) => l.name.localeCompare(r.name)).map((m) => ({ name: m.name, value: m.value })),
      })),
  };
}

// Symmetric per-criterion / per-metric diff between two reports. Reports criteria or metrics
// present on only one side, not just those removed from the first (the first version walked the
// base report only, so a candidate-only criterion or metric would have gone unreported).
function scoringDiff(left, right) {
  const L = scoringView(left), R = scoringView(right);
  const criteria = [];
  const metrics = [];
  const ids = new Set([...L.criteria.map((c) => c.id), ...R.criteria.map((c) => c.id)]);
  for (const id of [...ids].sort()) {
    const l = L.criteria.find((c) => c.id === id), r = R.criteria.find((c) => c.id === id);
    if (!l) { criteria.push(`${id} only in right`); continue; }
    if (!r) { criteria.push(`${id} only in left`); continue; }
    if (l.score !== r.score || l.status !== r.status) criteria.push(`${id} ${fmt(l.score)}/${l.status} to ${fmt(r.score)}/${r.status}`);
    const names = new Set([...l.metrics.map((m) => m.name), ...r.metrics.map((m) => m.name)]);
    for (const name of [...names].sort()) {
      const lm = l.metrics.find((m) => m.name === name), rm = r.metrics.find((m) => m.name === name);
      if (!lm) { metrics.push(`${id}.${name} only in right`); continue; }
      if (!rm) { metrics.push(`${id}.${name} only in left`); continue; }
      if (cj(lm.value) !== cj(rm.value)) metrics.push(`${id}.${name} ${fmt(lm.value)} to ${fmt(rm.value)}`);
    }
  }
  const headline = [];
  for (const k of ['overallScore', 'codeTrustScore', 'processTrustScore', 'verdict']) if (cj(L[k]) !== cj(R[k])) headline.push(`${k} ${fmt(L[k])} to ${fmt(R[k])}`);
  return { headline, criteria, metrics, scoringIdentical: headline.length + criteria.length + metrics.length === 0 };
}

// base vs published board, at scoring level
const boardCheck = [];
for (const r of rows) {
  const p = join(SITE_REPORTS, `${r.name}.json`);
  if (!existsSync(p) || r.base.error) { boardCheck.push({ name: r.name, status: 'no-board-report-or-base-error' }); continue; }
  const board = JSON.parse(readFileSync(p, 'utf8'));
  const d = scoringDiff(board, r.base.report);
  boardCheck.push({
    name: r.name,
    status: d.scoringIdentical ? 'base-reproduces-board' : 'DIFFERS',
    headShaMatch: board.repo?.headSha === r.base.report.repo?.headSha,
    boardOverall: board.overallScore,
    baseOverall: r.base.report.overallScore,
    headline: d.headline,
    criteria: d.criteria,
    metrics: d.metrics,
  });
}

const delta = [];
const lines = [];
lines.push('| Repository | Overall | Code trust | Process trust | Verdict | Coverage | Board placement | Criteria that moved (score/status) | Metrics that moved |');
lines.push('|---|---:|---:|---:|---|---|---|---|---|');
for (const r of rows) {
  if (r.base.error || r.cand.error) {
    delta.push({ name: r.name, error: { base: r.base.error, cand: r.cand.error } });
    lines.push(`| ${r.name} | error | error | error | error | error | error | not compared | not compared |`);
    continue;
  }
  const b = r.base.report, c = r.cand.report;
  const d = scoringDiff(b, c);
  const movedCriteria = d.criteria;
  const movedMetrics = d.metrics;
  const identical = cj({ ...b, generatedAt: null }) === cj({ ...c, generatedAt: null });
  delta.push({ name: r.name, visibility: r.visibility, base: { overall: b.overallScore, code: b.codeTrustScore, process: b.processTrustScore, verdict: b.verdict, coverage: r.base.cov.text, placement: r.base.placement, reportSha256: sha(cj(b)) }, cand: { overall: c.overallScore, code: c.codeTrustScore, process: c.processTrustScore, verdict: c.verdict, coverage: r.cand.cov.text, placement: r.cand.placement, reportSha256: sha(cj(c)) }, movedCriteria, movedMetrics, reportIdentical: identical });
  const cell = (x, y) => (String(x) === String(y) ? `${x}` : `${x} to ${y}`);
  lines.push(`| ${r.name} | ${cell(fmt(b.overallScore), fmt(c.overallScore))} | ${cell(fmt(b.codeTrustScore), fmt(c.codeTrustScore))} | ${cell(fmt(b.processTrustScore), fmt(c.processTrustScore))} | ${cell(verdictText(b.verdict), verdictText(c.verdict))} | ${cell(r.base.cov.text, r.cand.cov.text)} | ${cell(r.base.placement, r.cand.placement)} | ${movedCriteria.length ? movedCriteria.join('; ') : identical ? 'identical' : 'none (report differs elsewhere)'} | ${movedMetrics.length ? movedMetrics.join('; ') : 'none'} |`);
}
const summary = {
  rows: delta.length,
  errors: delta.filter((d) => d.error).length,
  reportIdentical: delta.filter((d) => d.reportIdentical).length,
  anyCriterionMoved: delta.filter((d) => d.movedCriteria?.length).length,
  anyMetricMoved: delta.filter((d) => d.movedMetrics?.length).length,
  headlineMoved: delta.filter((d) => d.base && (d.base.overall !== d.cand.overall || d.base.verdict !== d.cand.verdict || d.base.placement !== d.cand.placement)).length,
  base: manifest('base'), cand: manifest('cand'),
};
writeFileSync(join(ROOT, 'delta.json'), JSON.stringify({ summary: { ...summary, base: { srcHead: summary.base.srcHead, packageVersion: summary.base.packageVersion }, cand: { srcHead: summary.cand.srcHead, packageVersion: summary.cand.packageVersion } }, boardCheck, delta }, null, 2));
writeFileSync(join(ROOT, 'delta.md'), lines.join('\n') + '\n');
console.log(JSON.stringify({ ...summary, base: summary.base.srcHead.slice(0, 8), cand: summary.cand.srcHead.slice(0, 8) }));
const reproduces = boardCheck.filter((b) => b.status === 'base-reproduces-board').length;
console.log(`board check: ${reproduces}/${boardCheck.length} rows reproduce the published board at scoring level`);
for (const b of boardCheck) if (b.status !== 'base-reproduces-board') console.log(`  ${b.name}: ${b.status} headline=[${(b.headline ?? []).join('; ')}] criteria=[${(b.criteria ?? []).join('; ')}] metrics=[${(b.metrics ?? []).join('; ')}]`);
