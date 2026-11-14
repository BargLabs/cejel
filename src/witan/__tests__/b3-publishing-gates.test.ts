import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { serializeWitanReport } from '../attestation.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V27,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
} from '../rubric-version.js';
import {
  CITE_FIXTURES,
  GATE_COUNTED,
  GATE_DISCOUNTED,
  INVESTIGATION_FIXTURES,
  PUBLISHING_GATES_FIXTURES,
  UNGATED_DEPLOY_LINE,
} from './fixtures/b3-publishing-gates-fixtures.js';
import { buildFalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { checkNoRise, lostFindings } from './v27-no-rise.js';

// v27 B3, publishing rule gates and citations (2026-11-13; refs #517, #600). Item A: a publishing
// workflow whose every publishing job declares an `environment:` has a deployment gate, so v27's
// publishing rule does not discount it. Item B: every workflow B3 does not count under v27 is cited
// in B3's evidence at the line that decided it. v17 to v26 are byte-identical to main on every new
// fixture (the pins below were captured from main 64f2e574a before any code change).

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const OTHER_RUBRICS = WITAN_SELECTABLE_RUBRIC_VERSIONS.filter((version) => version !== V27);

const PINS_PATH = new URL('./fixtures/b3-publishing-gates-main-pins.json', import.meta.url);
const CAPTURE = process.env.B3_PUBLISHING_GATES_PINS;

const repos = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function report(name: string, rubricVersion: string): WitanReport {
  const key = `${rubricVersion}/${name}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(name);
  if (!repo) {
    const found = PUBLISHING_GATES_FIXTURES.find((entry) => entry.name === name);
    if (!found) throw new Error(`unknown fixture ${name}`);
    repo = buildFalseAssuranceFixture(found);
    repos.set(name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'publishing-gates-fixture',
    productDisplayName: 'Publishing gates fixture',
    generatedAt: '2026-11-13T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, scored);
  return scored;
}

function criterion(name: string, rubricVersion: string, id: string): WitanCriterionScore {
  const found = report(name, rubricVersion).criteria.find((entry) => entry.id === id);
  if (!found) throw new Error(`${name}@${rubricVersion} has no ${id}`);
  return found;
}

const metricValue = (score: WitanCriterionScore, name: string): number | undefined =>
  score.metrics.find((entry) => entry.name === name)?.value;

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const PUBLISHING_NOTE_PREFIX =
  '1 workflow that publishes, releases or deploys with no pull-request trigger (an unconditional step runs a publish, release or deploy command or action) is not counted as CI verification, whatever else it runs: .github/workflows/pages.yml.';

describe('item A — under v27 a publishing job that declares an environment is gated, so B3 and B2 count its workflow', () => {
  it.each(GATE_COUNTED.map(({ name }) => name))('%s: B3 and B2 count the workflow under v27, as under v17', (name) => {
    const v17B3 = criterion(name, V17, 'B3');
    const v27B3 = criterion(name, V27, 'B3');
    expect(metricValue(v27B3, 'default_branch_ci_depth')).toBe(metricValue(v17B3, 'default_branch_ci_depth'));
    expect(metricValue(v27B3, 'default_branch_ci_depth')).toBe(2);
    expect(v27B3.score).toBe(v17B3.score);
    expect(v27B3.status).toBe(v17B3.status);
    expect(v27B3.notes ?? '').not.toContain('is not counted as CI verification');
    // The gate is credited in the note, which says environment protection rules are not read.
    expect(v27B3.notes ?? '').toContain('.github/workflows/pages.yml is counted as CI verification because every job that publishes, releases or deploys on every run declares an environment');
    expect(v27B3.notes ?? '').toContain('Cejel cannot read offline');
    const v17B2 = criterion(name, V17, 'B2');
    const v27B2 = criterion(name, V27, 'B2');
    expect(metricValue(v27B2, 'pr_trace_primitives')).toBe(metricValue(v17B2, 'pr_trace_primitives'));
    expect(v27B2.disclosures ?? []).toEqual([]);
  });

  it.each(GATE_DISCOUNTED.map(({ name }) => name))('%s: stays discounted by B3 under v27', (name) => {
    const v27B3 = criterion(name, V27, 'B3');
    expect(metricValue(v27B3, 'default_branch_ci_depth')).toBe(1);
    expect(v27B3.notes ?? '').toContain(PUBLISHING_NOTE_PREFIX);
  });

  it('where Cejel cannot read whether a publishing job declares an environment, the note says so and no gate is credited', () => {
    for (const name of ['gate-env-expression-name', 'gate-env-mapping-without-name']) {
      expect(criterion(name, V27, 'B3').notes ?? '', name).toContain(
        'Cejel could not read whether every job that publishes on every run declares an environment, so no deployment gate is credited.',
      );
    }
    for (const name of ['gate-none-no-environment', 'gate-env-two-jobs-one-ungated', 'gate-env-own-gated-reusable-ungated']) {
      expect(criterion(name, V27, 'B3').notes ?? '', name).not.toContain('no deployment gate is credited');
    }
  });

  it('v27 is never above v17 on the same commit, on every new fixture', () => {
    for (const { name } of PUBLISHING_GATES_FIXTURES) {
      const before = report(name, V17);
      const after = report(name, V27);
      const result = checkNoRise(before, after);
      expect(result.problems, name).toEqual([]);
      expect(lostFindings(before, after), name).toEqual([]);
    }
  });
});

describe('item B — under v27 B3 cites every workflow it does not count, at the line that decided it', () => {
  const cited = (name: string, path: string) =>
    criterion(name, V27, 'B3').evidence.filter((pointer) => pointer.path === path && pointer.label.includes('not counted'));

  it('an ungated deploy no other evidence names is cited at its publishing step', () => {
    const pointers = cited('cite-ungated-deploy-only-discount', '.github/workflows/pages.yml');
    expect(pointers.map(({ line }) => line)).toEqual([UNGATED_DEPLOY_LINE]);
    expect(pointers[0]?.kind).toBe('ci_run');
    // v17 cites no such pointer, and the v27 score, status and finding count are unchanged by it.
    expect(criterion('cite-ungated-deploy-only-discount', V17, 'B3').evidence.some(({ path }) => path === '.github/workflows/pages.yml')).toBe(false);
  });

  it('a deploy run through a reusable workflow is cited at the calling job\'s uses: line', () => {
    expect(cited('cite-ungated-reusable-deploy', '.github/workflows/pages.yml').map(({ line }) => line)).toEqual([7]);
  });

  it('a workflow not shown to run a check is cited at its on: line', () => {
    expect(cited('cite-print-only-workflow', '.github/workflows/notify.yml').map(({ line }) => line)).toEqual([2]);
  });

  it('every discounted workflow on every new fixture is cited; a counted one is not', () => {
    for (const { name } of PUBLISHING_GATES_FIXTURES) {
      const b3 = criterion(name, V27, 'B3');
      const discounted = /not counted as CI verification[^:]*: ([^.]+\.ya?ml)/.exec(b3.notes ?? '')?.[1];
      const pointers = b3.evidence.filter(({ label }) => label.includes('not counted'));
      if (discounted) expect(pointers.map(({ path }) => path), name).toContain(discounted);
      for (const pointer of pointers) expect(pointer.line, name).toEqual(expect.any(Number));
    }
    for (const { name } of GATE_COUNTED) {
      expect(criterion(name, V27, 'B3').evidence.filter(({ label }) => label.includes('not counted')), name).toEqual([]);
    }
  });
});

describe('byte identity — every v17 to v26 report on the new fixtures equals main\'s', () => {
  it.runIf(CAPTURE !== undefined)('writes the pins', () => {
    const pins: Record<string, string> = {};
    for (const { name } of PUBLISHING_GATES_FIXTURES) {
      for (const rubricVersion of OTHER_RUBRICS) pins[`${rubricVersion}/${name}`] = sha256(serializeWitanReport(report(name, rubricVersion)));
    }
    writeFileSync(CAPTURE ?? '', `${JSON.stringify(pins, null, 2)}\n`);
  });

  it.runIf(CAPTURE === undefined)('matches main on every fixture under every rubric but v27', () => {
    const pins = JSON.parse(readFileSync(PINS_PATH, 'utf8')) as Record<string, string>;
    const keys = PUBLISHING_GATES_FIXTURES.flatMap(({ name }) => OTHER_RUBRICS.map((rubricVersion) => `${rubricVersion}/${name}`));
    expect(Object.keys(pins).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      const [rubricVersion = '', name = ''] = [key.slice(0, key.indexOf('/')), key.slice(key.indexOf('/') + 1)];
      expect(sha256(serializeWitanReport(report(name, rubricVersion))), key).toBe(pins[key]);
    }
  });
});

describe('item C — the investigated shape (no code change)', () => {
  it.runIf(process.env.B3_PUBLISHING_GATES_DUMP !== undefined)('dumps B2 and B3 under v17 and v27', () => {
    const out: Record<string, unknown> = {};
    for (const { name } of [...INVESTIGATION_FIXTURES, ...CITE_FIXTURES, ...GATE_COUNTED, ...GATE_DISCOUNTED]) {
      for (const rubricVersion of [V17, V27]) {
        const r = report(name, rubricVersion);
        out[`${name}@${rubricVersion}`] = {
          overall: r.overallScore,
          criteria: r.criteria
            .filter(({ id }) => id === 'B2' || id === 'B3')
            .map(({ id, score, status, metrics, findings, evidence, notes, disclosures }) => ({
              id,
              score,
              status,
              metrics: metrics.map(({ name: metricName, value, max, presentation }) => ({ metricName, value, max, presentation })),
              findings,
              evidence,
              notes,
              disclosures,
            })),
        };
      }
    }
    writeFileSync(process.env.B3_PUBLISHING_GATES_DUMP ?? '',`${JSON.stringify(out, null, 2)}\n`);
  });
});
