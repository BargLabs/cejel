import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { renderWitanHtmlReport } from '../html.js';
import {
  COUNTED,
  EDGE_COUNTED,
  EDGE_EXCLUDED,
  EDGE_FIXTURES,
  EXCLUDED,
  MANY_CHECKED_NAME,
  MANY_CHECKED_WORKFLOWS,
  PUBLISHING_WITH_CHECKS_FIXTURES,
  V2_COUNTED,
  V2_EXCLUDED,
  V2_FIXTURES,
  V3_COUNTED,
  V3_EXCLUDED,
  V3_FIXTURES,
  publishingFile,
} from './fixtures/b3-publishing-with-checks-fixtures.js';
import { buildFalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { checkNoRise, lostFindings } from './v27-no-rise.js';

// A v27 rubric correction to #517 (operator's ruling of 1 November 2026): under v27, B3 excludes a
// publishing workflow with no pull-request trigger only when it publishes without checking. A
// workflow that runs a check (a test, lint, type-check or verifying-build command) before its
// unconditional publish step, in the publishing job or in a job that job needs, is counted. A
// check whose failure does not stop the publish (continue-on-error, `|| true`, a condition that
// can be false, a publish that runs `if: always()`) does not count. v17 and every other rubric are
// unchanged. The fixtures are in fixtures/b3-publishing-with-checks-fixtures.ts.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;

const ALL = [...PUBLISHING_WITH_CHECKS_FIXTURES, ...EDGE_FIXTURES, ...V2_FIXTURES, ...V3_FIXTURES];

const repos = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function report(name: string, rubricVersion: string): WitanReport {
  const key = `${name}@${rubricVersion}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(name);
  if (!repo) {
    const found = ALL.find((entry) => entry.name === name);
    if (!found) throw new Error(`unknown fixture ${name}`);
    repo = buildFalseAssuranceFixture(found);
    repos.set(name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'publishing-checks-fixture',
    productDisplayName: 'Publishing checks fixture',
    generatedAt: '2026-11-01T00:00:00.000Z',
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

function metricValues(score: WitanCriterionScore): Record<string, number | undefined> {
  return Object.fromEntries(score.metrics.map(({ name, value }) => [name, value]));
}

const NOT_COUNTED_SENTENCE = (file: string) =>
  `1 workflow that publishes, releases or deploys with no pull-request trigger (an unconditional step runs a publish, release or deploy command or action) is not counted as CI verification, whatever else it runs: ${file}.`;

const COUNTED_DETAILS: Readonly<Record<string, string>> = {
  'npm-test-then-publish': 'is triggered by push to main, and its publishing job declares no environment.',
  'npm-test-in-needed-job': 'is triggered by push to main, and its publishing job declares no environment.',
  'npm-test-in-transitively-needed-job': 'is triggered by push to main, and its publishing job declares no environment.',
  'publish-if-success-and-fork-guard': 'is triggered by push to main, and its publishing job declares no environment.',
  'check-piped-into-tee-with-pipefail': 'is triggered by push to main, and its publishing job declares no environment.',
  'pytest-after-plain-pip-install': 'is triggered by push to main, and its publishing job declares no environment.',
  'reusable-publish-needs-plain-pip-test': 'is triggered by push to main, and its publishing job declares no environment.',
  'set-euo-pipefail-before-check': 'is triggered by push to main, and its publishing job declares no environment.',
  'npmrc-registry-only': 'is triggered by push to main, and its publishing job declares no environment.',
  'job-level-keys-written-plainly': 'is triggered by push to main, and its publishing job declares no environment.',
};

describe('v27 (#517 correction) — a publishing workflow that checks before it publishes is counted', () => {
  for (const [name] of [...COUNTED, ...EDGE_COUNTED, ...V2_COUNTED, ...V3_COUNTED]) {
    it(`v27 counts ${name}, as v17 does`, () => {
      const file = publishingFile(name);
      const b3 = criterion(name, V27, 'B3');
      expect(metricValues(b3), name).toEqual(metricValues(criterion(name, V17, 'B3')));
      expect(b3.notes ?? '', name).not.toContain('not counted');
      expect(b3.disclosures ?? [], name).not.toContainEqual(expect.stringContaining(file));
    });

    it(`v27's B3 note says ${name} is counted because a check runs before it publishes`, () => {
      const file = publishingFile(name);
      expect(criterion(name, V27, 'B3').notes, name).toBe(
        `${file} is counted as CI verification because a check runs before it publishes; it ${COUNTED_DETAILS[name]}`,
      );
    });
  }
});

describe('v27 (#517 correction) — a publishing workflow with no check before its publish step is still excluded', () => {
  for (const [name] of [...EXCLUDED, ...EDGE_EXCLUDED, ...V2_EXCLUDED, ...V3_EXCLUDED]) {
    it(`v27 excludes ${name}, with the note and disclosure unchanged`, () => {
      const file = publishingFile(name);
      const b3 = criterion(name, V27, 'B3');
      expect(b3.notes ?? '', name).toContain(NOT_COUNTED_SENTENCE(file));
      expect(b3.notes ?? '', name).not.toContain('is counted as CI verification');
      expect(b3.disclosures, name).toContain(
        `B3 did not count CI workflows that publish, release or deploy with no pull-request trigger, whatever else they run: ${file} runs an unconditional publish, release or deploy step.`,
      );
      expect(b3.metrics.find(({ name: metric }) => metric === 'default_branch_ci_depth')?.value, name).toBeLessThan(
        criterion(name, V17, 'B3').metrics.find(({ name: metric }) => metric === 'default_branch_ci_depth')?.value ?? 0,
      );
    });
  }
});

describe('B2 and B3 agree about every workflow here (#527)', () => {
  it('B2 credits every publishing workflow, under v27 as under v17', () => {
    for (const { name } of ALL) {
      const b2 = criterion(name, V27, 'B2');
      expect(b2, name).toEqual(criterion(name, V17, 'B2'));
      for (const file of name === MANY_CHECKED_NAME ? MANY_CHECKED_WORKFLOWS : [publishingFile(name)]) {
        expect(file, name).not.toBe('');
        expect(b2.notes ?? '', name).not.toContain(file);
      }
    }
  });

  it('a workflow B3 counts under this correction is one B2 credits: neither leaves it uncredited', () => {
    for (const [name] of [...COUNTED, ...EDGE_COUNTED, ...V2_COUNTED, ...V3_COUNTED]) {
      const file = publishingFile(name);
      for (const id of ['B2', 'B3']) {
        const score = criterion(name, V27, id);
        expect(score.notes ?? '', `${name} ${id}`).not.toContain('not counted');
        expect(score.disclosures ?? [], `${name} ${id}`).not.toContainEqual(expect.stringContaining(file));
      }
    }
  });
});

describe('item D — B3 note never drops a counted publishing workflow silently', () => {
  it('at the 1000-character limit, every one of 12 long-named checked publishing workflows is named or counted', () => {
    const b3 = criterion(MANY_CHECKED_NAME, V27, 'B3');
    const note = b3.notes ?? '';
    expect(note.length).toBeLessThanOrEqual(1000);
    const named = MANY_CHECKED_WORKFLOWS.filter((file) => note.includes(file));
    expect(named.length).toBeGreaterThan(0);
    expect(named.length).toBeLessThan(MANY_CHECKED_WORKFLOWS.length);
    // Named in order, then the rest counted in one closing sentence.
    expect(named).toEqual(MANY_CHECKED_WORKFLOWS.slice(0, named.length));
    const rest = MANY_CHECKED_WORKFLOWS.length - named.length;
    expect(note.endsWith(
      ` ${rest} more publishing workflow${rest === 1 ? ' is' : 's are'} counted as CI verification because a check runs before ${rest === 1 ? 'it publishes' : 'they publish'}.`,
    )).toBe(true);
    for (const metric of ['default_branch_ci_depth', 'ci_script_depth']) {
      expect(metricValues(b3)[metric], metric).toBe(metricValues(criterion(MANY_CHECKED_NAME, V17, 'B3'))[metric]);
    }
  });
});

describe('no rise against v17 on these fixtures', () => {
  it('no score, status or composite rises, and no v17 finding is lost', () => {
    for (const { name } of ALL) {
      const before = report(name, V17);
      const after = report(name, V27);
      expect(checkNoRise(before, after).problems, name).toEqual([]);
      expect(lostFindings(before, after), name).toEqual([]);
    }
  });
});

// ---- v17 is unchanged ------------------------------------------------------------------------
//
// fixtures/b3-publishing-with-checks-v17.json pins v17's output for every fixture, scored by the
// Cejel commit named there, before this correction; fixtures/b3-publishing-with-checks-v17.html is
// that commit's v17 certificate HTML for one fixture (item H). To re-pin, set
// B3_PUBLISHING_CHECKS_V17_PIN to the JSON output path, B3_PUBLISHING_CHECKS_V17_HTML to the HTML
// output path and B3_PUBLISHING_CHECKS_V17_COMMIT to the commit, and run only the test named
// "writes the pin". The second pass re-pinned at main's fe8c261de with every fixture here.

interface CriterionProjection {
  readonly score: number;
  readonly status: string;
  readonly notes: string | null;
  readonly disclosures: readonly string[];
  readonly metrics: Readonly<Record<string, number | null>>;
  readonly findings: readonly string[];
}

interface ReportProjection {
  readonly overallScore: number | null;
  readonly codeTrustScore: number | null;
  readonly processTrustScore: number | null;
  readonly criteria: Readonly<Record<string, CriterionProjection>>;
}

interface V17Pin {
  readonly commit: string;
  readonly rubricVersion: string;
  readonly fixtures: Readonly<Record<string, ReportProjection>>;
}

function projection(scored: WitanReport): ReportProjection {
  return {
    overallScore: scored.overallScore ?? null,
    codeTrustScore: scored.codeTrustScore ?? null,
    processTrustScore: scored.processTrustScore ?? null,
    criteria: Object.fromEntries(
      scored.criteria.map((entry) => [
        entry.id,
        {
          score: entry.score,
          status: entry.status,
          notes: entry.notes ?? null,
          disclosures: entry.disclosures ?? [],
          metrics: Object.fromEntries(entry.metrics.map(({ name, value }) => [name, value ?? null])),
          findings: entry.findings.map(({ summary }) => summary),
        },
      ]),
    ),
  };
}

const PIN_PATH = join(import.meta.dirname, 'fixtures', 'b3-publishing-with-checks-v17.json');
const HTML_PIN_PATH = join(import.meta.dirname, 'fixtures', 'b3-publishing-with-checks-v17.html');
// The fixture whose v17 certificate HTML is pinned whole (item H).
const HTML_PIN_FIXTURE = 'npm-test-then-publish';

const html = (name: string, rubricVersion: string) => renderWitanHtmlReport(report(name, rubricVersion));

describe('v17 output is identical on these fixtures', () => {
  it.runIf(process.env.B3_PUBLISHING_CHECKS_V17_PIN !== undefined)('writes the pin', () => {
    const pin: V17Pin = {
      commit: process.env.B3_PUBLISHING_CHECKS_V17_COMMIT ?? '',
      rubricVersion: V17,
      fixtures: Object.fromEntries(ALL.map(({ name }) => [name, projection(report(name, V17))])),
    };
    writeFileSync(process.env.B3_PUBLISHING_CHECKS_V17_PIN ?? '', `${JSON.stringify(pin, null, 2)}\n`);
    writeFileSync(process.env.B3_PUBLISHING_CHECKS_V17_HTML ?? '', html(HTML_PIN_FIXTURE, V17));
  });

  it.skipIf(process.env.B3_PUBLISHING_CHECKS_V17_PIN !== undefined)('every fixture is pinned, and v17 matches the pin', () => {
    const pin = JSON.parse(readFileSync(PIN_PATH, 'utf8')) as V17Pin;
    expect(pin.rubricVersion).toBe(V17);
    expect(pin.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(Object.keys(pin.fixtures).sort()).toEqual(ALL.map(({ name }) => name).sort());
    for (const { name } of ALL) {
      expect(projection(report(name, V17)), name).toEqual(pin.fixtures[name]);
    }
  });

  it.skipIf(process.env.B3_PUBLISHING_CHECKS_V17_PIN !== undefined)(
    "item H — a v17 certificate's HTML is byte-identical to the pinned commit's",
    () => {
      expect(html(HTML_PIN_FIXTURE, V17) === readFileSync(HTML_PIN_PATH, 'utf8')).toBe(true);
    },
  );
});

// v27's wording of the PR-gate CI count's glossary entry says a checked publishing workflow is
// counted; only a v27 certificate shows it (item H). Every other rubric shows the sentence as it was.
const V27_GLOSSARY_CLAUSE =
  'unless a check (a test, lint, type-check or verifying-build command whose failure stops the job) runs before every publish step, in the publishing job or in a job it needs.';

describe("item H — v27's glossary wording appears on v27 certificates only", () => {
  it('a v27 certificate states the check-before-publish clause, and a v17 certificate does not', () => {
    expect(html(HTML_PIN_FIXTURE, V27)).toContain(V27_GLOSSARY_CLAUSE);
    expect(html(HTML_PIN_FIXTURE, V17)).not.toContain(V27_GLOSSARY_CLAUSE);
  });
});
