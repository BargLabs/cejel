// Temporary measurement harness for the v27 B3 seventh pass; never committed. The first run (no
// .measure/main.json yet) records main's side, with main's repo-signals.ts in the working tree; the
// second records this head's side and writes .measure/summary.json comparing the two.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { it } from 'vitest';

import type { WitanReport } from '../schemas.js';

import { renderWitanHtmlReport } from '../html.js';
import { renderWitanMarkdownReport } from '../markdown.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27, WITAN_SELECTABLE_RUBRIC_VERSIONS } from '../rubric-version.js';
import {
  EDGE_FIXTURES,
  PUBLISHING_WITH_CHECKS_FIXTURES,
  V2_FIXTURES,
  V3_FIXTURES,
  V4_FIXTURES,
  V5_FIXTURES,
  V6_FIXTURES,
  V7_FIXTURES,
} from './fixtures/b3-publishing-with-checks-fixtures.js';
import { CI_CLAIMS_FIXTURES } from './fixtures/ci-claims-followups-fixtures.js';
import { FALSE_ASSURANCE_FIXTURES, buildFalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';

const OUT = join(import.meta.dirname, '..', '..', '..', '.measure');
const B3_FIXTURES = [...PUBLISHING_WITH_CHECKS_FIXTURES, ...EDGE_FIXTURES, ...V2_FIXTURES, ...V3_FIXTURES, ...V4_FIXTURES, ...V5_FIXTURES, ...V6_FIXTURES, ...V7_FIXTURES];
const SEEN = new Set<string>();
const ALL = [...B3_FIXTURES, ...FALSE_ASSURANCE_FIXTURES, ...CI_CLAIMS_FIXTURES].filter(({ name }) => (SEEN.has(name) ? false : (SEEN.add(name), true)));

const hash = (text: string) => createHash('sha256').update(text).digest('hex');

interface Row {
  json: string;
  html: string;
  md: string;
  criteria: Record<string, string>;
  b3Score: number;
  b3Depth: number | null;
  b3Notes: string;
}

it('measures', () => {
  mkdirSync(OUT, { recursive: true });
  const side = existsSync(join(OUT, 'main.json')) ? 'head' : 'main';
  const rows: Record<string, Row> = {};
  const errors: string[] = [];
  for (const fixture of ALL) {
    const repo = buildFalseAssuranceFixture(fixture);
    for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
      try {
        const report: WitanReport = scoreRepoWithPublicCejel({
          repoPath: repo,
          productSlug: 'measure',
          productDisplayName: 'Measure',
          generatedAt: '2026-11-03T00:00:00.000Z',
          rubricVersion,
          ingestPatterns: [],
          autoDiscoverIngest: false,
        });
        const clean = (text: string) => text.split(repo).join('<repo>');
        const b3 = report.criteria.find(({ id }) => id === 'B3');
        rows[`${fixture.name}@${rubricVersion}`] = {
          json: hash(clean(JSON.stringify(report))),
          html: hash(clean(renderWitanHtmlReport(report))),
          md: hash(clean(renderWitanMarkdownReport(report))),
          criteria: Object.fromEntries(report.criteria.map((entry) => [entry.id, hash(clean(JSON.stringify(entry)))])),
          b3Score: b3?.score ?? -1,
          b3Depth: b3?.metrics.find(({ name }) => name === 'default_branch_ci_depth')?.value ?? null,
          b3Notes: clean(b3?.notes ?? ''),
        };
      } catch (error) {
        errors.push(`${fixture.name}@${rubricVersion}: ${String(error)}`);
      }
    }
  }
  writeFileSync(join(OUT, `${side}.json`), JSON.stringify({ count: ALL.length, b3Count: B3_FIXTURES.length, errors, rows }));
  if (side === 'main') return;
  const main = JSON.parse(readFileSync(join(OUT, 'main.json'), 'utf8')) as { rows: Record<string, Row>; errors: string[] };
  const summary: Record<string, unknown> = { checkouts: ALL.length, b3Fixtures: B3_FIXTURES.length, mainErrors: main.errors, headErrors: errors };
  const byRubric: Record<string, { identical: number; total: number; differing: string[] }> = {};
  const v27Moves: { name: string; criteria: string[]; mainDepth: number | null; headDepth: number | null; v17Depth: number | null; noteOnly: boolean }[] = [];
  let aboveV17 = 0;
  const aboveV17Names: string[] = [];
  for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
    const entry = { identical: 0, total: 0, differing: [] as string[] };
    for (const { name } of ALL) {
      const key = `${name}@${rubricVersion}`;
      const a = main.rows[key];
      const b = rows[key];
      entry.total += 1;
      if (a && b && a.json === b.json && a.html === b.html && a.md === b.md) entry.identical += 1;
      else entry.differing.push(name);
      if (rubricVersion === WITAN_RUBRIC_VERSION_V27 && a && b && a.json !== b.json) {
        const criteria = Object.keys(b.criteria).filter((id) => a.criteria[id] !== b.criteria[id]);
        v27Moves.push({ name, criteria, mainDepth: a.b3Depth, headDepth: b.b3Depth, v17Depth: rows[`${name}@${WITAN_RUBRIC_VERSION_V17}`]?.b3Depth ?? null, noteOnly: a.b3Depth === b.b3Depth && a.b3Score === b.b3Score });
      }
      if (rubricVersion === WITAN_RUBRIC_VERSION_V27 && b) {
        const v17 = rows[`${name}@${WITAN_RUBRIC_VERSION_V17}`];
        if (v17 && b.b3Score > v17.b3Score) {
          aboveV17 += 1;
          aboveV17Names.push(name);
        }
      }
    }
    byRubric[rubricVersion] = entry;
  }
  summary.byRubric = Object.fromEntries(Object.entries(byRubric).map(([rubric, { identical, total, differing }]) => [rubric, { identical, total, differing }]));
  summary.v27Moves = v27Moves;
  summary.v27JsonIdentical = ALL.length - v27Moves.length;
  summary.rise = v27Moves.filter((move) => (move.headDepth ?? 0) > (move.mainDepth ?? 0)).map(({ name }) => name);
  summary.fall = v27Moves.filter((move) => (move.headDepth ?? 0) < (move.mainDepth ?? 0)).map(({ name }) => name);
  summary.noteOnly = v27Moves.filter((move) => move.noteOnly).map(({ name, criteria }) => `${name} [${criteria.join(',')}]`);
  summary.otherCriteria = v27Moves.filter((move) => move.criteria.some((id) => id !== 'B3')).map(({ name, criteria }) => `${name} [${criteria.join(',')}]`);
  summary.v27B3AboveV17 = aboveV17;
  summary.v27B3AboveV17Names = aboveV17Names;
  writeFileSync(join(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
}, 3_600_000);
