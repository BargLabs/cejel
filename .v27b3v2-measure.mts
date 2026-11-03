// TEMPORARY measurement script (never committed). `tsx .v27b3v2-measure.mts score` scores every
// synthetic checkout under every selectable rubric with whatever scoring source is checked out and
// writes .v27b3v2-measure-<side>.json; `... compare` compares the two sides.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';

import { renderWitanHtmlReport } from './src/witan/html.js';
import { renderWitanMarkdownReport } from './src/witan/markdown.js';
import { scoreRepoWithPublicCejel } from './src/witan/public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27, WITAN_SELECTABLE_RUBRIC_VERSIONS } from './src/witan/rubric-version.js';
import {
  EDGE_FIXTURES,
  PUBLISHING_WITH_CHECKS_FIXTURES,
  V2_FIXTURES,
  V3_FIXTURES,
  V4_FIXTURES,
  V5_FIXTURES,
} from './src/witan/__tests__/fixtures/b3-publishing-with-checks-fixtures.js';
import { CI_CLAIMS_FIXTURES } from './src/witan/__tests__/fixtures/ci-claims-followups-fixtures.js';
import { FALSE_ASSURANCE_FIXTURES, buildFalseAssuranceFixture } from './src/witan/__tests__/fixtures/false-assurance-fixtures.js';

const B3_SET = [...PUBLISHING_WITH_CHECKS_FIXTURES, ...EDGE_FIXTURES, ...V2_FIXTURES, ...V3_FIXTURES, ...V4_FIXTURES, ...V5_FIXTURES];
const ALL = [...B3_SET, ...FALSE_ASSURANCE_FIXTURES, ...CI_CLAIMS_FIXTURES];

const hash = (text: string) => createHash('sha256').update(text).digest('hex');

interface Row {
  json: string;
  html: string;
  md: string;
  error?: string;
  criteria: Record<string, string>;
  b3?: { score: number; status: string; notes: string | null; metrics: Record<string, number | null> };
}

function score(): void {
  const side = readFileSync('src/witan/repo-signals.ts', 'utf8').includes('pipRequirementNamesIndexProject') ? 'head' : 'main';
  const rows: Record<string, Row> = {};
  const names = new Set<string>();
  for (const fixture of ALL) {
    if (names.has(fixture.name)) throw new Error(`duplicate fixture ${fixture.name}`);
    names.add(fixture.name);
    const dir = buildFalseAssuranceFixture(fixture);
    const real = realpathSync(dir);
    const scrub = (text: string) => text.split(real).join('<checkout>').split(dir).join('<checkout>');
    for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
      const key = `${fixture.name}@${rubricVersion}`;
      try {
        const report = scoreRepoWithPublicCejel({
          repoPath: dir,
          productSlug: 'measure-fixture',
          productDisplayName: 'Measure fixture',
          generatedAt: '2026-11-02T00:00:00.000Z',
          rubricVersion,
          ingestPatterns: [],
          autoDiscoverIngest: false,
        });
        const b3 = report.criteria.find(({ id }) => id === 'B3');
        rows[key] = {
          json: hash(scrub(JSON.stringify(report))),
          html: hash(scrub(renderWitanHtmlReport(report))),
          md: hash(scrub(renderWitanMarkdownReport(report))),
          criteria: Object.fromEntries(report.criteria.map((entry) => [entry.id, hash(scrub(JSON.stringify(entry)))])),
          ...(b3
            ? {
                b3: {
                  score: b3.score,
                  status: b3.status,
                  notes: b3.notes ?? null,
                  metrics: Object.fromEntries(b3.metrics.map(({ name, value }) => [name, value ?? null])),
                },
              }
            : {}),
        };
      } catch (error) {
        rows[key] = { json: '', html: '', md: '', criteria: {}, error: String(error) };
      }
    }
    rmSync(dir, { recursive: true, force: true });
  }
  writeFileSync(`.v27b3v2-measure-${side}.json`, `${JSON.stringify({ side, fixtures: ALL.length, b3Set: B3_SET.length, rows })}\n`);
  console.log(side, ALL.length, Object.keys(rows).length);
}

function compare(): void {
  const main = JSON.parse(readFileSync('.v27b3v2-measure-main.json', 'utf8')) as { rows: Record<string, Row>; fixtures: number; b3Set: number };
  const head = JSON.parse(readFileSync('.v27b3v2-measure-head.json', 'utf8')) as { rows: Record<string, Row> };
  const out: string[] = [`fixtures ${main.fixtures} (b3 set ${main.b3Set}), rubrics ${WITAN_SELECTABLE_RUBRIC_VERSIONS.length}`];
  const errors = (rows: Record<string, Row>) => Object.values(rows).filter(({ error }) => error !== undefined).length;
  out.push(`errors main ${errors(main.rows)} head ${errors(head.rows)}`);
  let other = 0;
  let otherSame = 0;
  let otherAllSame = 0;
  const otherDiffer: string[] = [];
  let v27 = 0;
  let v27Same = 0;
  const v27Moves: string[] = [];
  let rises = 0;
  for (const [key, before] of Object.entries(main.rows)) {
    const after = head.rows[key];
    if (!after) throw new Error(`missing ${key}`);
    const [name, rubric] = [key.slice(0, key.lastIndexOf('@')), key.slice(key.lastIndexOf('@') + 1)];
    const same = before.json === after.json;
    if (rubric === WITAN_RUBRIC_VERSION_V27) {
      v27 += 1;
      if (same) v27Same += 1;
      else {
        const criteria = Object.keys({ ...before.criteria, ...after.criteria }).filter((id) => before.criteria[id] !== after.criteria[id]);
        const b = before.b3;
        const a = after.b3;
        const v17 = head.rows[`${name}@${WITAN_RUBRIC_VERSION_V17}`]?.b3;
        let kind = 'other';
        if (b && a && v17) {
          if (a.score === b.score && JSON.stringify(a.metrics) === JSON.stringify(b.metrics)) kind = a.notes === b.notes ? 'b3-same' : 'note-only';
          else if (a.score > b.score) kind = JSON.stringify(a.metrics) === JSON.stringify(v17.metrics) && a.score === v17.score ? 'rise-to-v17' : 'rise-other';
          else kind = 'fall';
        }
        v27Moves.push(`${kind}\t${name}\t${criteria.join(',')}`);
      }
      const v17 = head.rows[`${name}@${WITAN_RUBRIC_VERSION_V17}`]?.b3;
      if (after.b3 && v17 && after.b3.score > v17.score) rises += 1;
    } else {
      other += 1;
      if (same) otherSame += 1;
      if (same && before.html === after.html && before.md === after.md) otherAllSame += 1;
      if (!(same && before.html === after.html && before.md === after.md)) {
        const criteria = Object.keys({ ...before.criteria, ...after.criteria }).filter((id) => before.criteria[id] !== after.criteria[id]);
        otherDiffer.push(`${name}@${rubric}\tjson ${same ? 'same' : 'differs'}\tcriteria ${criteria.join(',') || 'none'}`);
      }
    }
  }
  out.push(`other rubrics: ${otherSame} of ${other} JSON identical; ${otherAllSame} with HTML and Markdown identical too`);
  out.push(...otherDiffer.slice(0, 40));
  out.push(`v27: ${v27Same} of ${v27} JSON identical; v27 B3 above v17 B3 on head: ${rises}`);
  out.push(...v27Moves.sort());
  writeFileSync('.v27b3v2-measure-compare.txt', `${out.join('\n')}\n`);
  console.log(out.slice(0, 4).join('\n'));
}

if (process.argv[2] === 'notes') {
  for (const side of ['main', 'head']) {
    const rows = (JSON.parse(readFileSync(`.v27b3v2-measure-${side}.json`, 'utf8')) as { rows: Record<string, Row> }).rows;
    for (const name of process.argv.slice(3)) console.log(side, name, rows[`${name}@${WITAN_RUBRIC_VERSION_V27}`]?.b3?.notes);
  }
} else if (process.argv[2] === 'compare') compare();
else score();
