import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanEvidencePointer, WitanReport } from '../schemas.js';

import { serializeWitanReport } from '../attestation.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V27,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
} from '../rubric-version.js';
import { CITE_EVERY_WORKFLOW_FIXTURES, DOCS_DEPLOY_LINE, FOUR_WORKFLOWS } from './fixtures/b3-cites-every-workflow-fixtures.js';
import type { FalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { buildFalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import {
  HOUSEKEEPING_PUBLISHING_DEPTH_FIXTURES,
  ITEM_A_LABEL_FIXTURE,
  ITEM_A_REFUSAL_FIXTURES,
  ITEM_B_REFUSAL_FIXTURES,
  ITEM_D_FIXTURE,
} from './fixtures/v27-housekeeping-publishing-depth-fixtures.js';
import { checkNoRise, lostFindings } from './v27-no-rise.js';

// v27 B2 and B3 (2026-11-19; refs #600 #748). Item A: a workflow whose every step is checkout, print,
// or a housekeeping action or GitHub CLI command (it only labels, comments on or closes issues and
// pull requests) earns no CI credit, for B2 and both B3 depth metrics, through the one shared
// predicate. Item B: a publishing workflow the #517 rule discounts still counts toward
// default_branch_ci_depth, never ci_script_depth, where one counted pull-request workflow runs both a
// test and a lint command. Item C: for that condition only, a package-script or Biome lint line
// counts as lint. Item D: a workflow file in a subfolder of .github/workflows earns no CI credit.
// Every other rubric is byte-identical to main; the pins were captured from main 646e187e7 before
// any code change.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const OTHER_RUBRICS = WITAN_SELECTABLE_RUBRIC_VERSIONS.filter((version) => version !== V27);

const PINS_PATH = new URL('./fixtures/v27-housekeeping-publishing-depth-main-pins.json', import.meta.url);
const CAPTURE = process.env.V27_HOUSEKEEPING_PUBLISHING_DEPTH_PINS;

const ALL_FIXTURES: readonly FalseAssuranceFixture[] = [...CITE_EVERY_WORKFLOW_FIXTURES, ...HOUSEKEEPING_PUBLISHING_DEPTH_FIXTURES];
const NEW_FIXTURE_NAMES = new Set(HOUSEKEEPING_PUBLISHING_DEPTH_FIXTURES.map(({ name }) => name));

const repos = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function report(name: string, rubricVersion: string): WitanReport {
  const key = `${rubricVersion}/${name}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(name);
  if (!repo) {
    const found = ALL_FIXTURES.find((entry) => entry.name === name);
    if (!found) throw new Error(`unknown fixture ${name}`);
    repo = buildFalseAssuranceFixture(found);
    repos.set(name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'housekeeping-publishing-depth-fixture',
    productDisplayName: 'Housekeeping and publishing depth fixture',
    generatedAt: '2026-11-19T00:00:00.000Z',
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

/** Every criterion's score, status, metric values and findings, and the overall score. */
function v27Outcome(name: string): Record<string, unknown> {
  const scored = report(name, V27);
  return {
    overall: scored.overallScore,
    criteria: scored.criteria.map(({ id, score, status, metrics, findings }) => ({
      id,
      score,
      status,
      metrics: metrics.map(({ name: metricName, value }) => [metricName, value]),
      findings: sha256(JSON.stringify(findings)),
    })),
  };
}

function pins(): { reportSha256: Record<string, string>; v27Outcomes: Record<string, unknown> } {
  return JSON.parse(readFileSync(PINS_PATH, 'utf8')) as { reportSha256: Record<string, string>; v27Outcomes: Record<string, unknown> };
}

const pointerAt = (b3: WitanCriterionScore, path: string): WitanEvidencePointer | undefined =>
  b3.evidence.find((pointer) => pointer.path === path && /^CI workflow (?:counted|read|not counted)/.test(pointer.label));

const HOUSEKEEPING_REASON = 'only labels, comments on or closes issues and pull requests';

describe('item A — a housekeeping workflow earns no CI credit under v27, for B2 and both B3 depth metrics', () => {
  it.each([
    ['b-stale-closer', '.github/workflows/stale.yml', 12],
    ['b-labeller-pull-request-target', '.github/workflows/labeler.yml', 11],
    ['b-labeller-pull-request', '.github/workflows/labeler.yml', 11],
    ['b-commenter-gh-cli', '.github/workflows/welcome.yml', 11],
    [ITEM_A_LABEL_FIXTURE.name, '.github/workflows/triage.yml', 12],
  ] as const)('%s: default-branch depth 1, B3 1.0, B2 primitives 1 and 1.6; cited with the new reason', (name, file, line) => {
    const b3 = criterion(name, V27, 'B3');
    const b2 = criterion(name, V27, 'B2');
    expect(metricValue(b3, 'default_branch_ci_depth')).toBe(1);
    expect(b3.score).toBe(1);
    expect(metricValue(b2, 'pr_trace_primitives')).toBe(1);
    expect(b2.score).toBe(1.6);
    const pointer = pointerAt(b3, file);
    expect(pointer?.label).toContain(HOUSEKEEPING_REASON);
    expect(pointer?.label.startsWith('CI workflow not counted')).toBe(true);
    expect(pointer?.line).toBe(line);
    expect(b2.disclosures?.join(' ') ?? '').toContain(`${file} ${HOUSEKEEPING_REASON}`);
  });

  it.runIf(CAPTURE === undefined)('b-commenter-github-script is unchanged from main: github-script runs inline code', () => {
    expect(v27Outcome('b-commenter-github-script')).toEqual(pins().v27Outcomes['b-commenter-github-script']);
  });

  it.runIf(CAPTURE === undefined)('refusals keep their credit, equal to main: a with: key outside the set, a piped gh line', () => {
    for (const { name } of ITEM_A_REFUSAL_FIXTURES) {
      expect(v27Outcome(name), name).toEqual(pins().v27Outcomes[name]);
      expect(metricValue(criterion(name, V27, 'B3'), 'default_branch_ci_depth'), name).toBe(2);
    }
  });
});

// The card's wording ("publishes, releases or deploys ...; counted for default-branch depth because
// <file> runs tests and lint on pull requests") is 203 characters after the "CI workflow" subject with
// a 24-character path, over the schema's 180, so the label says it in fewer words.
const KEPT_DOCS_LABEL =
  'CI workflow not counted for script depth: publishes with no pull-request trigger; counted for PR-gate depth because .github/workflows/ci.yml runs tests and lint on pull requests';
const KEPT_DOCS_LABEL_PATTERN = /^CI workflow not counted for script depth: publishes with no pull-request trigger; counted for PR-gate depth /;

describe('item B — a discounted publishing workflow keeps its default-branch depth where pull-request CI tests and lints', () => {
  it.each([
    ['c-docs-deploy-main', '.github/workflows/docs.yml'],
    ['c-semantic-release-main', '.github/workflows/release.yml'],
  ] as const)('%s: v27 default-branch depth 2 and B3 2.0, equal to v17; script depth 2', (name, file) => {
    const b3 = criterion(name, V27, 'B3');
    expect(metricValue(b3, 'default_branch_ci_depth')).toBe(2);
    expect(metricValue(b3, 'ci_script_depth')).toBe(2);
    expect(b3.score).toBe(2);
    expect(b3.score).toBe(criterion(name, V17, 'B3').score);
    expect(pointerAt(b3, file)?.label).toMatch(KEPT_DOCS_LABEL_PATTERN);
    expect((pointerAt(b3, file)?.label ?? '').length).toBeLessThanOrEqual(180);
  });

  it('c-docs-deploy-main cites the deploy at its publishing step, with the label naming the pull-request workflow', () => {
    const pointer = pointerAt(criterion('c-docs-deploy-main', V27, 'B3'), '.github/workflows/docs.yml');
    expect(pointer?.label).toBe(KEPT_DOCS_LABEL);
    expect(KEPT_DOCS_LABEL.length).toBeLessThanOrEqual(180);
    expect(pointer?.line).toBe(DOCS_DEPLOY_LINE);
  });

  it('cite-four-workflows: depth 2 and B3 2.0, equal to v17', () => {
    const b3 = criterion(FOUR_WORKFLOWS.name, V27, 'B3');
    expect(metricValue(b3, 'default_branch_ci_depth')).toBe(2);
    expect(b3.score).toBe(2);
    expect(b3.score).toBe(criterion(FOUR_WORKFLOWS.name, V17, 'B3').score);
  });

  it('B2 is unchanged by item B on the kept shapes', () => {
    for (const name of ['c-docs-deploy-main', 'c-semantic-release-main']) {
      expect(metricValue(criterion(name, V27, 'B2'), 'pr_trace_primitives'), name).toBe(2);
    }
  });

  it('refusals stay at depth 1: test without lint, test and lint split across two workflows, a housekeeping workflow as the only other one, lint only in a comment', () => {
    for (const { name } of ITEM_B_REFUSAL_FIXTURES) {
      const b3 = criterion(name, V27, 'B3');
      expect(metricValue(b3, 'default_branch_ci_depth'), name).toBe(1);
      expect(pointerAt(b3, '.github/workflows/docs.yml')?.label, name).toMatch(/^CI workflow not counted: publishes/);
    }
  });

  it.runIf(CAPTURE === undefined)('each refusal other than the housekeeping one equals main under v27', () => {
    for (const { name } of ITEM_B_REFUSAL_FIXTURES.filter(({ name: fixtureName }) => fixtureName !== 'b-housekeeping-other-pr-docs-deploy')) {
      expect(v27Outcome(name), name).toEqual(pins().v27Outcomes[name]);
    }
  });
});

describe('item C — package-script lint counts toward item B\'s condition only', () => {
  it('pytest and pnpm run lint with a root lint script, plus the docs deploy: depth 2, equal to v17; script depth equal to main', () => {
    const b3 = criterion('c-pnpm-lint-script-docs-deploy', V27, 'B3');
    expect(metricValue(b3, 'default_branch_ci_depth')).toBe(2);
    expect(b3.score).toBe(criterion('c-pnpm-lint-script-docs-deploy', V17, 'B3').score);
    if (CAPTURE === undefined) {
      const main = pins().v27Outcomes['c-pnpm-lint-script-docs-deploy'] as { criteria: { id: string; metrics: [string, number][] }[] };
      const mainDepth = main.criteria.find(({ id }) => id === 'B3')?.metrics.find(([metricName]) => metricName === 'ci_script_depth')?.[1];
      expect(metricValue(b3, 'ci_script_depth')).toBe(mainDepth);
    }
  });

  it.runIf(CAPTURE === undefined)('with no lint script the condition does not hold: depth 1, equal to main', () => {
    const b3 = criterion('c-pnpm-lint-no-script-docs-deploy', V27, 'B3');
    expect(metricValue(b3, 'default_branch_ci_depth')).toBe(1);
    expect(v27Outcome('c-pnpm-lint-no-script-docs-deploy')).toEqual(pins().v27Outcomes['c-pnpm-lint-no-script-docs-deploy']);
  });
});

describe('item D — a workflow file in a subfolder of .github/workflows earns no CI credit under v27', () => {
  it('the nested file earns no B2 or B3 credit and is cited with its reason', () => {
    const b3 = criterion(ITEM_D_FIXTURE.name, V27, 'B3');
    const b2 = criterion(ITEM_D_FIXTURE.name, V27, 'B2');
    expect(metricValue(b3, 'default_branch_ci_depth')).toBe(1);
    expect(metricValue(b2, 'pr_trace_primitives')).toBe(1);
    expect(pointerAt(b3, '.github/workflows/sub/ci.yml')?.label).toBe(
      'CI workflow read, earns no credit: GitHub runs only workflow files directly in .github/workflows',
    );
    // v17 still counts it; its byte identity with main is checked below.
    expect(metricValue(criterion(ITEM_D_FIXTURE.name, V17, 'B3'), 'default_branch_ci_depth')).toBe(2);
  });
});

describe('B2 and B3 agree about every workflow on every fixture here (v27)', () => {
  it('B2 credits every CI workflow file B3 does not set aside as not shown to run a check', () => {
    for (const { name, commits } of ALL_FIXTURES) {
      const b2 = criterion(name, V27, 'B2');
      const b3 = criterion(name, V27, 'B3');
      const ciFiles = Object.keys(commits.at(-1) ?? {}).filter((path) => /^\.github\/workflows\/.+\.ya?ml$/.test(path)).length;
      const uncreditedCount = (score: WitanCriterionScore, metricName: string) =>
        Number(/^(\d+) CI workflow files? not shown to run a check/.exec(
          score.metrics.find((entry) => entry.name === metricName)?.presentation?.condition ?? '',
        )?.[1] ?? 0);
      const b3Uncredited = uncreditedCount(b3, 'default_branch_ci_depth');
      expect(uncreditedCount(b2, 'pr_trace_primitives'), name).toBe(b3Uncredited);
      const ciComponent = b2.metrics
        .find((entry) => entry.name === 'pr_trace_primitives')
        ?.presentation?.components?.find(({ label }) => /CI workflow/.test(label));
      expect(ciComponent?.count, name).toBe(ciFiles - b3Uncredited);
      const shared = b2.notes?.replaceAll('a PR-trace CI workflow', 'CI verification') ?? '';
      expect((b3.notes ?? '').startsWith(shared), name).toBe(true);
    }
  });
});

describe('no rise — v27 is at or below v17 on every fixture here', () => {
  it('overall, B2 and B3', () => {
    for (const { name } of ALL_FIXTURES) {
      const before = report(name, V17);
      const after = report(name, V27);
      expect(checkNoRise(before, after).problems, name).toEqual([]);
      expect(lostFindings(before, after), name).toEqual([]);
      expect(after.overallScore ?? 0, name).toBeLessThanOrEqual(before.overallScore ?? 0);
      for (const id of ['B2', 'B3']) {
        expect(criterion(name, V27, id).score ?? 0, `${name} ${id}`).toBeLessThanOrEqual(criterion(name, V17, id).score ?? 0);
      }
    }
  });
});

describe('byte identity — every v17 to v26 report on the new fixtures equals main\'s', () => {
  it.runIf(CAPTURE !== undefined)('writes the pins', () => {
    const reportSha256: Record<string, string> = {};
    const v27Outcomes: Record<string, unknown> = {};
    for (const { name } of ALL_FIXTURES) {
      if (NEW_FIXTURE_NAMES.has(name)) {
        for (const rubricVersion of OTHER_RUBRICS) reportSha256[`${rubricVersion}/${name}`] = sha256(serializeWitanReport(report(name, rubricVersion)));
      }
      v27Outcomes[name] = v27Outcome(name);
    }
    writeFileSync(CAPTURE ?? '', `${JSON.stringify({ reportSha256, v27Outcomes }, null, 2)}\n`);
  });

  it.runIf(CAPTURE === undefined)('matches main on every new fixture under every rubric but v27', () => {
    const { reportSha256 } = pins();
    const keys = HOUSEKEEPING_PUBLISHING_DEPTH_FIXTURES.flatMap(({ name }) => OTHER_RUBRICS.map((rubricVersion) => `${rubricVersion}/${name}`));
    expect(Object.keys(reportSha256).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      const slash = key.indexOf('/');
      expect(sha256(serializeWitanReport(report(key.slice(slash + 1), key.slice(0, slash)))), key).toBe(reportSha256[key]);
    }
  });
});
