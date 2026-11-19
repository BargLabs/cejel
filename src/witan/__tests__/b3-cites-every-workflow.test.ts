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
import {
  CAP_FIXTURE,
  CAP_STALE_COUNT,
  CITE_EVERY_WORKFLOW_FIXTURES,
  DOCS_DEPLOY_LINE,
  FOUR_WORKFLOWS,
  ITEM_B_FIXTURES,
  ITEM_C_FIXTURES,
  TAG_RELEASE_LINE,
} from './fixtures/b3-cites-every-workflow-fixtures.js';
import { buildFalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { checkNoRise, lostFindings } from './v27-no-rise.js';

// v27 B3 cites every workflow it read (2026-11-19; refs #600). Item A: under v27 B3's evidence cites
// every workflow it read, each counted one at the line that earned its credit with what it earned,
// each one not counted with why, credited ones first; past the citation limit the read-count label
// says how many were not cited. Scores, statuses and findings are unchanged. v17 to v26 are
// byte-identical to main on every new fixture, and v27's score, status, metrics and findings equal
// main's (the pins below were captured from main 6b4392627 before any code change).

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const OTHER_RUBRICS = WITAN_SELECTABLE_RUBRIC_VERSIONS.filter((version) => version !== V27);

const PINS_PATH = new URL('./fixtures/b3-cites-every-workflow-main-pins.json', import.meta.url);
const CAPTURE = process.env.B3_CITES_EVERY_WORKFLOW_PINS;

const repos = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function report(name: string, rubricVersion: string): WitanReport {
  const key = `${rubricVersion}/${name}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(name);
  if (!repo) {
    const found = CITE_EVERY_WORKFLOW_FIXTURES.find((entry) => entry.name === name);
    if (!found) throw new Error(`unknown fixture ${name}`);
    repo = buildFalseAssuranceFixture(found);
    repos.set(name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'cite-every-workflow-fixture',
    productDisplayName: 'Cite every workflow fixture',
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

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** What item A must not move under v27: every criterion's score, status, metric values and findings. */
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

const workflowPointers = (b3: WitanCriterionScore): WitanEvidencePointer[] =>
  b3.evidence.filter(({ path, label }) => path.startsWith('.github/workflows/') && !/^CI workflow( \(|$)/.test(label));
const summaryPointer = (b3: WitanCriterionScore): WitanEvidencePointer | undefined =>
  b3.evidence.find(({ label }) => /^CI workflow( \(|$)/.test(label));

describe('item A — under v27 B3 cites every workflow it read, with how it was counted or why it was not', () => {
  it('the four-workflow repository: each workflow is cited once, at the line that decided it', () => {
    const b3 = criterion(FOUR_WORKFLOWS.name, V27, 'B3');
    const byPath = new Map(workflowPointers(b3).map((pointer) => [pointer.path, pointer]));
    expect([...byPath.keys()]).toEqual([
      '.github/workflows/ci.yml',
      '.github/workflows/stale.yml',
      '.github/workflows/docs.yml',
      '.github/workflows/release.yml',
    ]);
    expect(workflowPointers(b3)).toHaveLength(4);
    const ci = byPath.get('.github/workflows/ci.yml');
    expect(ci?.label).toBe(
      'CI workflow counted: targets pull requests or the default branch (cited at that line); runs test and lint commands',
    );
    expect(ci?.line).toBe(3);
    const stale = byPath.get('.github/workflows/stale.yml');
    expect(stale?.label).toBe(
      'CI workflow read, earns no credit: no pull-request or default-branch trigger and no test, lint, type-check or build command (cited at its on: trigger)',
    );
    expect(stale?.line).toBe(2);
    expect(byPath.get('.github/workflows/docs.yml')?.label).toMatch(/^CI workflow not counted: publishes/);
    expect(byPath.get('.github/workflows/docs.yml')?.line).toBe(DOCS_DEPLOY_LINE);
    expect(byPath.get('.github/workflows/release.yml')?.label).toMatch(/^CI workflow not counted: publishes/);
    expect(byPath.get('.github/workflows/release.yml')?.line).toBe(TAG_RELEASE_LINE);
    for (const pointer of b3.evidence) expect(pointer.kind).toMatch(/^(ci_run|test_run)$/);
    // The read-count label stays true: four read, four cited, at the credited workflow.
    expect(summaryPointer(b3)?.label).toBe('CI workflow (4 workflow files read; 4 cited)');
    expect(summaryPointer(b3)?.path).toBe('.github/workflows/ci.yml');
  });

  it('a workflow counted for its commands alone is cited at its first counted command', () => {
    // In the cap fixture's stale closers nothing is counted; the docs deploy is discounted. Here the
    // release-branch semantic-release run with tests first is counted for its test command only.
    const b3 = criterion('c-semantic-release-tests-first', V27, 'B3');
    const release = workflowPointers(b3).find(({ path }) => path === '.github/workflows/release.yml');
    expect(release?.label).toBe(
      'CI workflow counted toward verification depth only: runs test commands (cited at the first line naming one); no pull-request or default-branch trigger',
    );
    expect(release?.line).toBe(13);
  });

  it('every pointer label on every new fixture is within the schema\'s 180 characters', () => {
    for (const { name } of CITE_EVERY_WORKFLOW_FIXTURES) {
      for (const pointer of criterion(name, V27, 'B3').evidence) expect(pointer.label.length, `${name}: ${pointer.label}`).toBeLessThanOrEqual(180);
    }
  });

  it('every workflow read on every new fixture is cited under v27, and no other rubric cites more than one', () => {
    for (const { name, commits } of CITE_EVERY_WORKFLOW_FIXTURES) {
      const workflows = Object.keys(commits.at(-1) ?? {}).filter((path) => path.startsWith('.github/workflows/'));
      if (workflows.length > 16) continue;
      const cited = new Set(workflowPointers(criterion(name, V27, 'B3')).map(({ path }) => path));
      expect([...cited].sort(), name).toEqual([...workflows].sort());
      expect(summaryPointer(criterion(name, V27, 'B3'))?.label, name).toBe(
        workflows.length === 1 ? 'CI workflow' : `CI workflow (${workflows.length} workflow files read; ${workflows.length} cited)`,
      );
      expect(workflowPointers(criterion(name, V17, 'B3')), name).toEqual([]);
    }
  });
});

describe('item A, cap — past the citation limit the credited workflows come first and the label counts the rest', () => {
  it('cites the one credited workflow first, then sixteen in all, and says how many were not cited', () => {
    const b3 = criterion(CAP_FIXTURE.name, V27, 'B3');
    const pointers = workflowPointers(b3);
    const read = CAP_STALE_COUNT + 2;
    expect(pointers).toHaveLength(16);
    expect(pointers[0]?.path).toBe('.github/workflows/zz-ci.yml');
    expect(pointers[0]?.label).toMatch(/^CI workflow counted:/);
    // Credited first, then read and earning nothing; the discounted release comes after them, so here
    // it falls past the limit and is named only in the note and disclosure.
    expect(pointers.slice(1).every(({ label }) => label.startsWith('CI workflow read, earns no credit'))).toBe(true);
    expect(pointers.some(({ path }) => path === '.github/workflows/aa-release.yml')).toBe(false);
    expect(b3.notes ?? '').toContain('.github/workflows/aa-release.yml');
    expect(summaryPointer(b3)?.label).toBe(
      `CI workflow (${read} workflow files read; 16 cited; ${read - 16} not cited, over B3's citation limit of 16)`,
    );
    expect(summaryPointer(b3)?.path).toBe('.github/workflows/zz-ci.yml');
  });
});

describe('v27 never rises above v17, and item A moves no v27 score, status, metric or finding', () => {
  it('no rise on every new fixture', () => {
    for (const { name } of CITE_EVERY_WORKFLOW_FIXTURES) {
      const before = report(name, V17);
      const after = report(name, V27);
      expect(checkNoRise(before, after).problems, name).toEqual([]);
      expect(lostFindings(before, after), name).toEqual([]);
    }
  });

  it.runIf(CAPTURE === undefined)('v27 outcomes equal main\'s on every new fixture', () => {
    const pins = JSON.parse(readFileSync(PINS_PATH, 'utf8')) as { v27Outcomes: Record<string, unknown> };
    for (const { name } of CITE_EVERY_WORKFLOW_FIXTURES) expect(v27Outcome(name), name).toEqual(pins.v27Outcomes[name]);
  });
});

describe('byte identity — every v17 to v26 report on the new fixtures equals main\'s', () => {
  it.runIf(CAPTURE !== undefined)('writes the pins', () => {
    const reportSha256: Record<string, string> = {};
    const v27Outcomes: Record<string, unknown> = {};
    for (const { name } of CITE_EVERY_WORKFLOW_FIXTURES) {
      for (const rubricVersion of OTHER_RUBRICS) reportSha256[`${rubricVersion}/${name}`] = sha256(serializeWitanReport(report(name, rubricVersion)));
      v27Outcomes[name] = v27Outcome(name);
    }
    writeFileSync(CAPTURE ?? '', `${JSON.stringify({ reportSha256, v27Outcomes }, null, 2)}\n`);
  });

  it.runIf(CAPTURE === undefined)('matches main on every fixture under every rubric but v27', () => {
    const pins = JSON.parse(readFileSync(PINS_PATH, 'utf8')) as { reportSha256: Record<string, string> };
    const keys = CITE_EVERY_WORKFLOW_FIXTURES.flatMap(({ name }) => OTHER_RUBRICS.map((rubricVersion) => `${rubricVersion}/${name}`));
    expect(Object.keys(pins.reportSha256).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      const slash = key.indexOf('/');
      expect(sha256(serializeWitanReport(report(key.slice(slash + 1), key.slice(0, slash)))), key).toBe(pins.reportSha256[key]);
    }
  });
});

describe('items B and C — the investigated shapes (no code change)', () => {
  it.runIf(process.env.B3_CITES_EVERY_WORKFLOW_DUMP !== undefined)('dumps B2 and B3 under v17 and v27', () => {
    const out: string[] = [];
    for (const { name } of [FOUR_WORKFLOWS, ...ITEM_B_FIXTURES, ...ITEM_C_FIXTURES]) {
      for (const rubricVersion of [V17, V27]) {
        const r = report(name, rubricVersion);
        const b3 = criterion(name, rubricVersion, 'B3');
        const b2 = criterion(name, rubricVersion, 'B2');
        const values = (score: WitanCriterionScore) => score.metrics.map(({ name: metricName, value }) => `${metricName}=${value}`).join(' ');
        out.push(`${name} @ ${rubricVersion === V17 ? 'v17' : 'v27'}: overall ${r.overallScore}; B3 ${b3.score} ${b3.status} [${values(b3)}]; B2 ${b2.score} ${b2.status} [${values(b2)}]`);
        const depth = b3.metrics.find(({ name: metricName }) => metricName === 'ci_script_depth');
        out.push(`  components: ${(depth?.presentation?.components ?? []).filter(({ count }) => count > 0).map(({ label }) => label).join(', ')}`);
        out.push(`  condition: ${b3.metrics.find(({ name: metricName }) => metricName === 'default_branch_ci_depth')?.presentation?.condition ?? '-'}`);
        for (const pointer of b3.evidence) out.push(`  evidence: ${pointer.path}:${pointer.line ?? '-'} ${pointer.label}`);
        out.push(`  notes: ${b3.notes ?? '-'}`);
        for (const sentence of b3.disclosures ?? []) out.push(`  disclosure: ${sentence}`);
      }
    }
    writeFileSync(process.env.B3_CITES_EVERY_WORKFLOW_DUMP ?? '', `${out.join('\n')}\n`);
  });
});
