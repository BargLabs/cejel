// Compares the 0.6.3 full-history board run with (1) the published board and (2) the
// preregistered expectation, which it reads from ../PREREGISTRATION.md itself, between the
// expected-values markers, so the comparison runs against the committed text and not a copy.
// Emits board-to-new.json and new-vs-prereg.json under the run root. Neither carries a path:
// rows are named by corpus name, values are scores, statuses, metric value/max and placements.
// A private-visibility row is emitted only as `private-row`, with its completion status and
// nothing else. Its name, pin and new values never leave this machine. The CLI runs only when
// this file is executed directly; the functions are exported for compare.test.mjs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRIVATE_LABEL = 'private-row';
const measured = (c) => c.status !== 'not_applicable' && c.status !== 'insufficient_data';
const round1 = (x) => Math.round(x * 10) / 10;
const fmt = (v) => (v === null || v === undefined ? 'scoreless' : String(v));
const crit = (c) => (c ? `${c.score}/${c.status}` : 'absent');
const metricText = (m) => (m ? (m.max === undefined ? `${m.value}` : `${m.value}/${m.max}`) : 'absent');

export function parseExpected(md) {
  const m = /<!-- expected-values:begin -->\s*```json\n([\s\S]*?)\n```\s*<!-- expected-values:end -->/.exec(md);
  if (!m) throw new Error('expected-values block not found in the preregistration');
  return JSON.parse(m[1]);
}

// The board's coverage and low-confidence rule (the published leaderboard.md, "How to read").
export function coverage(report) {
  const byCat = new Map();
  for (const c of report.criteria) {
    const b = byCat.get(c.category) ?? { measured: 0, total: 0 };
    b.total += 1;
    if (measured(c)) b.measured += 1;
    byCat.set(c.category, b);
  }
  const all = [...byCat.values()].reduce((a, b) => ({ measured: a.measured + b.measured, total: a.total + b.total }), { measured: 0, total: 0 });
  const low = [...byCat.values(), all].some(({ measured: n, total }) => total > 0 && n / total < 0.5);
  return { text: [...byCat.entries()].map(([k, b]) => `${k} ${b.measured}/${b.total}`).join('; '), low };
}

// The board's ordering figure: equal-weight mean of measured criteria, B1 and B5 excluded.
export function comparableScore(report) {
  const s = report.criteria.filter((c) => c.id !== 'B1' && c.id !== 'B5' && measured(c)).map((c) => c.score);
  return s.length === 0 ? null : round1(s.reduce((a, b) => a + b, 0) / s.length);
}

// reports: Map name -> report or null (error). Publisher-owned rows are never ranked.
export function placements(reports, owned) {
  const rankable = [...reports.entries()]
    .filter(([n, r]) => r && !owned.has(n) && r.overallScore !== null && !coverage(r).low)
    .sort(([ln, l], [rn, r]) => comparableScore(r) - comparableScore(l) || ln.localeCompare(rn));
  const rank = new Map(rankable.map(([n], i) => [n, String(i + 1)]));
  const out = new Map();
  for (const [n, r] of reports) {
    out.set(n, !r ? 'error' : owned.has(n) ? 'transparency' : r.overallScore === null ? 'unrated' : coverage(r).low ? 'unranked' : rank.get(n));
  }
  return out;
}

function view(report) {
  return new Map(report.criteria.map((c) => [c.id, {
    score: c.score,
    status: c.status,
    metrics: new Map((c.metrics ?? []).map((m) => [m.name, { value: m.value, max: m.max }])),
  }]));
}
const sameMetric = (a, b) => !!a && !!b && JSON.stringify([a.value, a.max ?? null]) === JSON.stringify([b.value, b.max ?? null]);

// Published board -> new, at scoring level: headline, comparable, coverage, placement,
// per-criterion score and status, per-metric value/max. Symmetric: one-sided entries are listed.
export function boardToNewRow(pub, cur, pubPlacement, curPlacement) {
  const changes = { headline: [], criteria: [], metrics: [] };
  const pairs = [
    ['overall', pub.overallScore, cur.overallScore], ['code', pub.codeTrustScore, cur.codeTrustScore],
    ['process', pub.processTrustScore, cur.processTrustScore], ['verdict', pub.verdict, cur.verdict],
    ['comparable', comparableScore(pub), comparableScore(cur)], ['coverage', coverage(pub).text, coverage(cur).text],
    ['placement', pubPlacement, curPlacement],
  ];
  for (const [k, a, b] of pairs) if (fmt(a) !== fmt(b)) changes.headline.push(`${k} ${fmt(a)} to ${fmt(b)}`);
  const P = view(pub), C = view(cur);
  for (const id of [...new Set([...P.keys(), ...C.keys()])].sort()) {
    const p = P.get(id), c = C.get(id);
    if (crit(p) !== crit(c)) changes.criteria.push(`${id} ${crit(p)} to ${crit(c)}`);
    const names = new Set([...(p?.metrics.keys() ?? []), ...(c?.metrics.keys() ?? [])]);
    for (const n of [...names].sort()) {
      const pm = p?.metrics.get(n), cm = c?.metrics.get(n);
      if (!sameMetric(pm, cm)) changes.metrics.push(`${id}.${n} ${metricText(pm)} to ${metricText(cm)}`);
    }
  }
  return {
    from: { overall: pub.overallScore, code: pub.codeTrustScore, process: pub.processTrustScore, verdict: pub.verdict, comparable: comparableScore(pub), placement: pubPlacement },
    to: { overall: cur.overallScore, code: cur.codeTrustScore, process: cur.processTrustScore, verdict: cur.verdict, comparable: comparableScore(cur), placement: curPlacement },
    ...changes,
    unchanged: changes.headline.length + changes.criteria.length + changes.metrics.length === 0,
  };
}

// New -> preregistered expectation. Scoring mismatches and placement mismatches are kept apart:
// placement follows from comparable scores, so one score miss can move several placements.
export function checkRow(cur, pub, curPlacement, exp) {
  const scoring = [], placement = [];
  const pairs = [
    ['overall', exp.overall, cur.overallScore], ['code', exp.code, cur.codeTrustScore], ['process', exp.process, cur.processTrustScore],
    ['verdict', exp.verdict, cur.verdict], ['comparable', exp.comparable, comparableScore(cur)], ['coverage', exp.coverage, coverage(cur).text],
  ];
  for (const [k, e, a] of pairs) if (fmt(e) !== fmt(a)) scoring.push(`${k} expected ${fmt(e)}, got ${fmt(a)}`);
  if (exp.placement !== undefined && exp.placement !== curPlacement) placement.push(`placement expected ${exp.placement}, got ${curPlacement}`);
  const C = view(cur), P = view(pub);
  for (const id of [...new Set([...Object.keys(exp.criteria), ...C.keys()])].sort()) {
    const got = crit(C.get(id)), want = exp.criteria[id] ?? 'absent';
    if (got !== want) scoring.push(`${id} expected ${want}, got ${got}`);
  }
  const notPredicted = new Set(exp.metricsNotPredicted ?? []), absent = new Set(exp.metricsAbsent ?? []);
  const overrides = exp.metrics ?? {};
  for (const id of [...new Set([...P.keys(), ...C.keys()])].sort()) {
    if (notPredicted.has(id)) continue;
    const got = C.get(id)?.metrics ?? new Map();
    if (absent.has(id)) {
      for (const n of [...got.keys()].sort()) scoring.push(`${id}.${n} expected absent, got ${metricText(got.get(n))}`);
      continue;
    }
    const want = new Map(P.get(id)?.metrics ?? []);
    for (const [key, m] of Object.entries(overrides)) {
      const [cid, name] = key.split('.');
      if (cid === id) want.set(name, { value: m.value, max: m.max });
    }
    for (const n of [...new Set([...want.keys(), ...got.keys()])].sort()) {
      if (!sameMetric(want.get(n), got.get(n))) scoring.push(`${id}.${n} expected ${metricText(want.get(n))}, got ${metricText(got.get(n))}`);
    }
  }
  return { scoring, placement };
}

// A declared alternative (C1) replaces the listed headline fields and criteria; its criteria's
// metrics become not predicted. Placement is checked separately and never decides a match.
export function matchingAlternative(cur, pub, curPlacement, exp) {
  for (const [name, alt] of Object.entries(exp.alternatives ?? {})) {
    const merged = {
      ...exp, ...alt,
      criteria: { ...exp.criteria, ...alt.criteria },
      metricsNotPredicted: [...new Set([...(exp.metricsNotPredicted ?? []), ...Object.keys(alt.criteria ?? {})])],
    };
    if (checkRow(cur, pub, curPlacement, merged).scoring.length === 0) return name;
  }
  return null;
}

// corpus: parsed corpus.json. published / current: Map name -> report (current: null on error).
// meta: Map name -> { head, shallow, commits, error }. expected: parsed preregistration block.
export function compareRun({ corpus, published, current, meta, expected }) {
  const owned = new Set(corpus.entries.filter((e) => e.visibility === 'private' || e.name === 'cejel').map((e) => e.name));
  const isPrivate = (e) => e.visibility === 'private';
  const publicOnly = (m) => new Map([...m].filter(([n]) => !isPrivate(corpus.entries.find((e) => e.name === n))));
  const pubPl = placements(publicOnly(published), owned);
  const curPl = placements(publicOnly(current), owned);
  const boardRows = [], prereg = [];
  const run = { rows: corpus.entries.length, completed: 0, errors: [], r1: [], r2: { toolVersion: 0, rubricVersion: 0, fingerprint: 0, of: 0 }, r3HistoryLimitations: [] };
  for (const e of corpus.entries) {
    const cur = current.get(e.name) ?? null;
    const m = meta.get(e.name) ?? {};
    const label = isPrivate(e) ? PRIVATE_LABEL : e.name;
    if (cur) {
      run.completed += 1;
      run.r2.of += 1;
      if (cur.toolVersion === expected.toolVersion) run.r2.toolVersion += 1;
      if (cur.rubricVersion === expected.rubricVersion) run.r2.rubricVersion += 1;
      if (cur.rubricBehaviourFingerprint === expected.rubricBehaviourFingerprint) run.r2.fingerprint += 1;
    } else {
      run.errors.push(`${label}: ${m.error ?? 'missing report'}`);
    }
    if (isPrivate(e)) {
      const entry = { name: PRIVATE_LABEL, status: cur ? 'scored' : 'error', predicted: false };
      boardRows.push(entry);
      prereg.push(entry);
      continue;
    }
    const r1 = [];
    if (m.head !== e.commit) r1.push('head is not the corpus pin');
    if (m.shallow !== 'false') r1.push(`is-shallow-repository ${m.shallow ?? 'unrecorded'}`);
    if (Number(m.commits) !== expected.commits?.[e.name]) r1.push(`commits expected ${expected.commits?.[e.name]}, got ${m.commits ?? 'unrecorded'}`);
    if (cur && cur.repo?.headSha !== e.commit) r1.push('report headSha is not the corpus pin');
    if (r1.length) run.r1.push(`${e.name}: ${r1.join('; ')}`);
    if (cur && cur.historyLimitations !== undefined) run.r3HistoryLimitations.push(e.name);
    const pub = published.get(e.name) ?? null;
    if (!cur || !pub) {
      boardRows.push({ name: e.name, status: cur ? 'no-published-report' : 'error' });
      prereg.push({ name: e.name, status: cur ? 'no-published-report' : 'error' });
      continue;
    }
    boardRows.push({ name: e.name, status: 'scored', ...boardToNewRow(pub, cur, pubPl.get(e.name), curPl.get(e.name)) });
    const exp = expected.rows[e.name];
    if (!exp) { prereg.push({ name: e.name, status: 'not-preregistered' }); continue; }
    const { scoring, placement } = checkRow(cur, pub, curPl.get(e.name), exp);
    const alternative = scoring.length ? matchingAlternative(cur, pub, curPl.get(e.name), exp) : null;
    prereg.push({ name: e.name, status: 'scored', held: scoring.length === 0, matchesAlternative: alternative, scoringMismatches: scoring, placementMismatches: placement });
  }
  const ranked = [...curPl.entries()].filter(([, p]) => /^\d+$/.test(p)).sort((a, b) => Number(a[1]) - Number(b[1])).map(([n]) => n);
  const scored = prereg.filter((p) => p.status === 'scored' && p.name !== PRIVATE_LABEL);
  const summary = {
    completed: `${run.completed}/${run.rows}`,
    errors: run.errors.length,
    rowsHeld: `${scored.filter((p) => p.held).length}/${scored.length}`,
    rowsMatchingAnAlternative: scored.filter((p) => p.matchesAlternative).map((p) => `${p.name}: ${p.matchesAlternative}`),
    rowsWithScoringMismatch: scored.filter((p) => !p.held).map((p) => p.name),
    rowsWithPlacementMismatch: scored.filter((p) => p.placementMismatches.length).map((p) => p.name),
    rankOrderHeld: JSON.stringify(ranked) === JSON.stringify(expected.rankOrder),
    headlineChangedRows: boardRows.filter((b) => b.headline?.some((h) => /^(overall|code|process|verdict) /.test(h))).map((b) => b.name),
    overallChangedRows: boardRows.filter((b) => b.headline?.some((h) => h.startsWith('overall '))).map((b) => b.name),
  };
  return {
    boardToNew: { rows: boardRows },
    newVsPrereg: { summary, run, rankOrder: { expected: expected.rankOrder, got: ranked }, rows: prereg },
  };
}

function readMeta(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const ROOT = resolve(process.env.BOARD_ROOT ?? resolve(process.env.HOME ?? '', 'tmp/cejel-board-0.6.3-full'));
  const SITE = resolve(process.env.SITE_REPORTS ?? resolve(process.env.HOME ?? '', 'projects/cejel-site/leaderboard/reports'));
  const corpus = JSON.parse(readFileSync(join(ROOT, 'corpus.json'), 'utf8'));
  const expected = parseExpected(readFileSync(join(here, '..', 'PREREGISTRATION.md'), 'utf8'));
  const published = new Map(), current = new Map(), meta = new Map();
  for (const e of corpus.entries) {
    const p = join(SITE, `${e.name}.json`);
    if (e.visibility !== 'private' && existsSync(p)) published.set(e.name, JSON.parse(readFileSync(p, 'utf8')));
    const r = join(ROOT, 'out', e.name, 'report.json');
    const m = readMeta(join(ROOT, 'out', e.name, 'meta.txt'));
    meta.set(e.name, m);
    current.set(e.name, existsSync(r) && !m.error ? JSON.parse(readFileSync(r, 'utf8')) : null);
  }
  const out = compareRun({ corpus, published, current, meta, expected });
  writeFileSync(join(ROOT, 'board-to-new.json'), JSON.stringify(out.boardToNew, null, 2) + '\n');
  writeFileSync(join(ROOT, 'new-vs-prereg.json'), JSON.stringify(out.newVsPrereg, null, 2) + '\n');
  console.log(JSON.stringify(out.newVsPrereg.summary, null, 2));
  console.log(`run: completed ${out.newVsPrereg.run.completed}/${out.newVsPrereg.run.rows}; R1 issues ${out.newVsPrereg.run.r1.length}; R2 ${JSON.stringify(out.newVsPrereg.run.r2)}; R3 rows with historyLimitations ${out.newVsPrereg.run.r3HistoryLimitations.length}`);
  for (const r of out.newVsPrereg.rows) {
    if (r.scoringMismatches?.length || r.placementMismatches?.length) {
      console.log(`  ${r.name}${r.matchesAlternative ? ` (matches ${r.matchesAlternative})` : ''}: ${[...r.scoringMismatches, ...r.placementMismatches].join('; ')}`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
