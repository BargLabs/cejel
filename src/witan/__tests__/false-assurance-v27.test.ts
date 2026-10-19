import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { isGitLfsPointerText } from '../content-reads.js';
import { SHALLOW_HISTORY_LIMITATION, SHALLOW_HISTORY_V27_ABSTENTION } from '../history-depth.js';
import { renderWitanMarkdownReport } from '../markdown.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V26,
  WITAN_RUBRIC_VERSION_V27,
} from '../rubric-version.js';
import {
  FALSE_ASSURANCE_FIXTURES,
  buildFalseAssuranceFixture,
  falseAssuranceFixture,
  lfsPointerFor,
} from './fixtures/false-assurance-fixtures.js';

// #517, #518, #519, #520, #442: places where a v17 certificate asserted more than Cejel read.
// Synthetic fixtures only (fixtures/false-assurance-fixtures.ts), built from each issue's repro.
//
// Two halves. Under v17, the public default, scoring must not move (the presentation fixes change
// notes, labels, citation order and an LFS pointer count, nothing else), so the v17 assertions
// below pin the v17 result, defect included. Under witan-rubric-v27-prospective-2026-10-19 the
// defect is gone, and the last block checks the property that admits v27 at all: no score, status
// or composite rises against v17 on any fixture.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;

const repos = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function report(name: string, rubricVersion: string): WitanReport {
  const key = `${name}@${rubricVersion}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(name);
  if (!repo) {
    repo = buildFalseAssuranceFixture(falseAssuranceFixture(name));
    repos.set(name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'false-assurance-fixture',
    productDisplayName: 'False-assurance fixture',
    generatedAt: '2026-10-19T00:00:00.000Z',
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

function metricValue(score: WitanCriterionScore, name: string): number | undefined {
  return score.metrics.find((metric) => metric.name === name)?.value;
}

describe('#517 — a workflow that only publishes is not CI depth', () => {
  it('v17 is unchanged: the ungated publish still raises B3, as the issue reports', () => {
    for (const [gated, ungated] of [
      ['b3-pypi-publish-gated', 'b3-pypi-publish-ungated'],
      ['b3-npm-publish-gated', 'b3-npm-publish-ungated'],
    ] as const) {
      expect(criterion(ungated, V17, 'B3').score).toBeGreaterThan(criterion(gated, V17, 'B3').score);
    }
  });

  it('v27: removing the human gate and running on every push does not raise B3', () => {
    for (const [gated, ungated] of [
      ['b3-pypi-publish-gated', 'b3-pypi-publish-ungated'],
      ['b3-npm-publish-gated', 'b3-npm-publish-ungated'],
    ] as const) {
      const before = criterion(gated, V27, 'B3');
      const after = criterion(ungated, V27, 'B3');
      expect(after.score).toBe(before.score);
      expect(metricValue(after, 'default_branch_ci_depth')).toBe(
        metricValue(before, 'default_branch_ci_depth'),
      );
      expect(after.notes).toBe(
        '1 workflow that only publishes, releases or deploys (no test, lint or type-check command) is not counted as CI verification: ' +
          `${ungated.startsWith('b3-pypi') ? '.github/workflows/publish.yaml' : '.github/workflows/release.yml'}.`,
      );
    }
  });

  it('v27: a workflow that runs the tests and then publishes still counts', () => {
    const v17 = criterion('b3-test-then-publish-workflow', V17, 'B3');
    const v27 = criterion('b3-test-then-publish-workflow', V27, 'B3');
    expect(v27.score).toBe(v17.score);
    expect(v27.metrics).toEqual(v17.metrics);
    expect(v27.notes).toBeUndefined();
  });
});

describe('#518 — a suite that cannot fail is not verified', () => {
  it('v17 is unchanged: conftest.py counts as a test file and A1 stays verified', () => {
    const a1 = criterion('a1-pytest-hook-skips-every-test', V17, 'A1');
    expect(a1.status).toBe('verified');
    expect(a1.evidence.map(({ path }) => path)).toContain('tests/conftest.py');
  });

  it('v27: a collection hook that skips every item marks the suite hollow and names the hook', () => {
    const a1 = criterion('a1-pytest-hook-skips-every-test', V27, 'A1');
    expect(metricValue(a1, 'non_hollow_test_share')).toBe(0);
    expect(a1.status).toBe('critical');
    const hook = a1.findings.find(({ summary }) => summary.startsWith('A pytest collection hook'));
    expect(hook?.severity).toBe('warning');
    expect(hook?.summary).toContain('marks every collected test skipped');
    expect(hook?.evidence.path).toBe('tests/conftest.py');
    expect(hook?.evidence.line).toBe(4);
  });

  it('v27: conftest.py is not a test file', () => {
    const control = criterion('a1-pytest-suite', V27, 'A1');
    for (const name of ['a1-pytest-fixture-conftest', 'a1-pytest-hook-skips-slow-only']) {
      const a1 = criterion(name, V27, 'A1');
      expect(a1.evidence.map(({ path }) => path)).not.toContain('tests/conftest.py');
      expect(metricValue(a1, 'test_to_source_ratio')).toBe(metricValue(control, 'test_to_source_ratio'));
    }
  });

  it('v27: a conditional hook makes no claim', () => {
    const control = criterion('a1-pytest-suite', V27, 'A1');
    const a1 = criterion('a1-pytest-hook-skips-slow-only', V27, 'A1');
    expect(a1.score).toBe(control.score);
    expect(a1.status).toBe(control.status);
    expect(a1.findings.some(({ summary }) => summary.startsWith('A pytest collection hook'))).toBe(false);
  });

  it('v27: a module-level unconditional pytestmark skip in every module marks the suite hollow', () => {
    const a1 = criterion('a1-pytestmark-skip-every-module', V27, 'A1');
    expect(metricValue(a1, 'non_hollow_test_share')).toBe(0);
    expect(a1.status).toBe('critical');
  });

  it('v27: a test directory holding only conftest.py stays measured rather than going unmeasured', () => {
    const a1 = criterion('a1-conftest-is-the-only-test-directory-file', V27, 'A1');
    expect(a1.status).not.toBe('insufficient_data');
    expect(metricValue(a1, 'test_to_source_ratio')).toBe(0);
  });
});

describe('#519 — Git LFS pointers are content Cejel did not read', () => {
  const lfs = 'a1-js-suite-as-lfs-pointers';

  it('recognises the v1 pointer grammar and nothing looser', () => {
    expect(isGitLfsPointerText(lfsPointerFor('test content\n'))).toBe(true);
    expect(isGitLfsPointerText(lfsPointerFor('x').replace(/\n$/, ''))).toBe(true);
    expect(isGitLfsPointerText('version https://git-lfs.github.com/spec/v1\nsize 12\n')).toBe(false);
    expect(
      isGitLfsPointerText(
        `version https://git-lfs.github.com/spec/v1\noid sha256:${'a'.repeat(63)}\nsize 12\n`,
      ),
    ).toBe(false);
    expect(isGitLfsPointerText(`# notes\n${lfsPointerFor('x')}`)).toBe(false);
    expect(isGitLfsPointerText(`${lfsPointerFor('x')}${'padding\n'.repeat(200)}`)).toBe(false);
  });

  it('every rubric counts the pointers in contentReadSummary under their own reason', () => {
    for (const rubricVersion of [V17, WITAN_RUBRIC_VERSION_V26, V27]) {
      expect(report(lfs, rubricVersion).contentReadSummary?.byReason.lfsPointer).toBe(2);
    }
    expect(report('a1-js-suite', V17).contentReadSummary?.byReason).not.toHaveProperty('lfsPointer');
  });

  it('every rubric names a pointer as one in the evidence, and the Markdown itemizes it', () => {
    const a1 = criterion(lfs, V17, 'A1');
    expect(a1.evidence.filter(({ label }) => label.includes('Git LFS pointer'))).toHaveLength(2);
    expect(renderWitanMarkdownReport(report(lfs, V17))).toContain(
      '- Git LFS pointer (content not in this checkout): 2',
    );
  });

  it('v17 is unchanged: A1 still scores the pointer text and abstains on nothing', () => {
    const a1 = criterion(lfs, V17, 'A1');
    expect(a1.status).toBe('critical');
    expect(metricValue(a1, 'non_hollow_test_share')).toBe(0);
    expect(report(lfs, V17).contentReadSummary?.affectedCriteria).toEqual([]);
  });

  it('v27: A1 abstains as a read failure, stays in the composite at 0, and says how to fix it', () => {
    const a1 = criterion(lfs, V27, 'A1');
    expect(a1.status).toBe('insufficient_data');
    expect(a1.score).toBe(0);
    expect(a1.notes).toContain('Git LFS pointers');
    expect(a1.notes).toContain('git lfs pull');
    expect(report(lfs, V27).contentReadSummary?.affectedCriteria).toEqual(['A1']);
    expect(report(lfs, V27).codeTrustScore ?? 0).toBeLessThan(report(lfs, V17).codeTrustScore ?? 0);
  });
});

describe('#520 — A4 says what the repository itself requires, and cites what drove the metric', () => {
  const deleted = 'a4-uv-locked-lockfile-deleted';

  it('every rubric: the note does not call a lockfile "not required" when CI requires one', () => {
    for (const rubricVersion of [V17, V27]) {
      const a4 = criterion(deleted, rubricVersion, 'A4');
      expect(a4.notes).not.toContain('not required');
      expect(a4.notes).toContain('`uv run --locked`, .github/workflows/ci.yml line 12');
      expect(a4.evidence[0]?.path).toBe('.github/workflows/ci.yml');
      expect(a4.evidence[0]?.line).toBe(12);
    }
  });

  it('v17: the metric-derived finding cites the requiring CI line, and nothing else moves', () => {
    const a4 = criterion(deleted, V17, 'A4');
    const derived = a4.findings.find(({ summary }) => summary.includes('metric-derived score'));
    expect(derived?.evidence.path).toBe('.github/workflows/ci.yml');
    expect(metricValue(a4, 'lockfile_coverage')).toBeUndefined();
  });

  it('keeps the library note where nothing requires a lockfile, or one is committed but withheld', () => {
    for (const name of ['a4-library-no-lockfile-not-required', 'a4-uv-locked-lockfile-too-large']) {
      for (const rubricVersion of [V17, V27]) {
        const a4 = criterion(name, rubricVersion, 'A4');
        expect(a4.notes).toContain('a committed lockfile is credited but not required');
        expect(metricValue(a4, 'lockfile_coverage')).toBeUndefined();
      }
    }
  });

  it('every rubric: the manifest holding the unconstrained dependencies is cited first', () => {
    for (const rubricVersion of [V17, V27]) {
      const a4 = criterion('a4-root-manifest-unconstrained', rubricVersion, 'A4');
      expect(a4.evidence[0]?.path).toBe('package.json');
      expect(a4.evidence[0]?.label).toBe(
        'Dependency manifest with 2 dependencies declared without a version constraint',
      );
      const derived = a4.findings.find(({ summary }) => summary.includes('metric-derived score'));
      expect(derived?.evidence.path).toBe('package.json');
    }
    // The control cites the primary manifest as before.
    expect(criterion('a4-root-manifest-pinned', V17, 'A4').evidence[0]?.label).toBe(
      'Dependency manifest',
    );
  });

  it('v27: lockfile_coverage scores 0 instead of disappearing', () => {
    expect(metricValue(criterion(deleted, V27, 'A4'), 'lockfile_coverage')).toBe(0);
    expect(criterion(deleted, V27, 'A4').score).toBeLessThan(criterion(deleted, V17, 'A4').score);
  });
});

describe('#442 — history Cejel did not read is not scored', () => {
  const shallow = 'history-shallow-clone';

  it('v17 is unchanged: A2 and B2 score the truncated history behind a display-only disclosure', () => {
    expect(criterion(shallow, V17, 'A2').status).toBe('verified');
    expect(criterion(shallow, V17, 'B2').status).toBe('warning');
    expect(report(shallow, V17).historyLimitations).toEqual([SHALLOW_HISTORY_LIMITATION]);
  });

  it('v27: A2 and B2 abstain as read failures and the disclosure says so', () => {
    for (const id of ['A2', 'B2']) {
      const score = criterion(shallow, V27, id);
      expect(score.status).toBe('insufficient_data');
      expect(score.score).toBe(0);
      expect(score.notes).toContain('shallow clone');
    }
    expect(report(shallow, V27).historyLimitations).toEqual([SHALLOW_HISTORY_V27_ABSTENTION]);
    expect(report(shallow, V27).processTrustScore ?? 0).toBeLessThan(
      report(shallow, V17).processTrustScore ?? 0,
    );
  });

  it('v27: a full clone scores exactly as v17 does', () => {
    for (const id of ['A2', 'B2']) {
      expect(criterion('history-full-clone', V27, id)).toEqual(criterion('history-full-clone', V17, id));
    }
  });

  it('v27: a confirmed critical secret on a shallow clone still scores A2 critical', () => {
    const a2 = criterion('history-shallow-clone-with-committed-secret', V27, 'A2');
    expect(a2.status).toBe('critical');
    expect(a2).toEqual(criterion('history-shallow-clone-with-committed-secret', V17, 'A2'));
  });
});

// The property that admits v27: every movement against v17 removes an assurance. A criterion may
// lose score, become more severe, or abstain; a composite may fall. Nothing may rise.
const SEVERITY: Readonly<Record<string, number>> = { verified: 0, info: 1, warning: 2, critical: 3 };

describe('no score, status or composite rises from v17 to v27 on any fixture', () => {
  for (const fixture of FALSE_ASSURANCE_FIXTURES) {
    it(fixture.name, () => {
      const before = report(fixture.name, V17);
      const after = report(fixture.name, V27);
      for (const key of ['overallScore', 'codeTrustScore', 'processTrustScore'] as const) {
        if (before[key] !== null && after[key] !== null) {
          expect(after[key] as number, key).toBeLessThanOrEqual(before[key] as number);
        }
      }
      for (const v17 of before.criteria) {
        const v27 = after.criteria.find(({ id }) => id === v17.id);
        expect(v27, v17.id).toBeDefined();
        if (!v27) continue;
        expect(v27.score, `${v17.id} score`).toBeLessThanOrEqual(v17.score);
        if (v27.status === 'insufficient_data') continue;
        if (v17.status === 'not_applicable' || v17.status === 'insufficient_data') {
          expect(v27.status, v17.id).toBe(v17.status);
          continue;
        }
        expect(SEVERITY[v27.status] ?? -1, `${v17.id} status`).toBeGreaterThanOrEqual(
          SEVERITY[v17.status] ?? 99,
        );
      }
    });
  }
});
