import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { isGitLfsPointerText, readRepoTextPrefix, trackContentReads } from '../content-reads.js';
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
        '1 workflow that only publishes, releases or deploys (no pull-request trigger and no verification command Cejel recognises) is not counted as CI verification: ' +
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
      expect(a4.notes).toContain(
        'An unconditional step in this repository\'s CI runs `uv run --locked` (.github/workflows/ci.yml line 12), which exits with an error without uv.lock, and the scanned inventory holds none.',
      );
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

// Regression guards for what an adversarial review of the first implementation reproduced.
describe('review findings against the first implementation stay fixed', () => {
  it('#518: a conftest.py v17 rates hollow stays in the non-hollow share, so A1 cannot rise', () => {
    const name = 'review-a1-name-shaped-conftest-rated-hollow';
    const v17 = criterion(name, V17, 'A1');
    const v27 = criterion(name, V27, 'A1');
    expect(v27.score).toBeLessThanOrEqual(v17.score);
    expect(metricValue(v27, 'non_hollow_test_share')).toBe(metricValue(v17, 'non_hollow_test_share'));
  });

  it('#520: no lockfile requirement is read from cargo install, a committed bun.lock, or a comment', () => {
    for (const name of [
      'review-a4-cargo-install-locked',
      'review-a4-bun-lock-committed',
      'review-a4-npm-ci-in-trailing-comment',
      'review2-a4-npm-ci-guarded-by-if',
      'review2-a4-npm-ci-guarded-by-test-and-or',
      'review2-a4-npm-ci-in-echo-and-heredoc',
      'review2-a4-npm-ci-in-disabled-job',
      'review2-a4-lockfile-generated-first',
    ]) {
      for (const rubricVersion of [V17, V27]) {
        const a4 = criterion(name, rubricVersion, 'A4');
        expect(a4.notes ?? '', `${name}@${rubricVersion}`).not.toContain('which exits with an error');
        expect(metricValue(a4, 'lockfile_coverage'), `${name}@${rubricVersion}`).not.toBe(0);
      }
      expect(criterion(name, V27, 'A4')).toEqual(criterion(name, V17, 'A4'));
    }
  });

  it('#518: a conditionally defined hook and a conditional pytestmark make no claim', () => {
    for (const name of ['review-a1-hook-defined-under-try', 'review-a1-conditional-pytestmark']) {
      const a1 = criterion(name, V27, 'A1');
      expect(a1.findings.some(({ summary }) => summary.startsWith('A pytest collection hook'))).toBe(false);
      expect(metricValue(a1, 'non_hollow_test_share')).toBe(
        metricValue(criterion(name, V17, 'A1'), 'non_hollow_test_share'),
      );
    }
  });

  it('#518: a root conftest.py hook governs pytest files only, not the vitest files beside them', () => {
    const a1 = criterion('review-a1-root-conftest-beside-vitest', V27, 'A1');
    const hook = a1.findings.find(({ summary }) => summary.startsWith('A pytest collection hook'));
    expect(hook?.summary).toContain('so the 2 pytest files under the repository root cannot run');
    expect(metricValue(a1, 'non_hollow_test_share')).toBe(1);
  });

  it('#517: a workflow that runs tox on pull requests and uploads on tags is still CI', () => {
    const name = 'review-b3-tox-ci-with-tag-publish';
    expect(criterion(name, V27, 'B3')).toEqual(criterion(name, V17, 'B3'));
  });

  it('#519: an LFS pointer never erases a confirmed critical finding', () => {
    const secret = criterion('review-a2-secret-beside-planted-lfs-pointer', V27, 'A2');
    expect(secret).toEqual(criterion('review-a2-secret-beside-planted-lfs-pointer', V17, 'A2'));
    expect(secret.status).toBe('critical');
  });

  it('#519: a not-applicable result decided from an LFS pointer abstains instead', () => {
    // Applicability is decided from what a collector fails to find in content; a pointer is
    // content it did not read. Abstaining is a read failure, so the composite can only fall.
    for (const [name, id] of [
      ['review-a2-lfs-data-in-not-applicable-library', 'A2'],
      ['review2-a3-service-entrypoint-as-lfs-pointer', 'A3'],
    ] as const) {
      const after = criterion(name, V27, id);
      expect(after.status, `${name} ${id}`).toBe('insufficient_data');
      expect(report(name, V27).contentReadSummary?.affectedCriteria).toContain(id);
    }
  });

  it('#442: the v27 shallow-clone sentence does not claim A2 abstains where it is not applicable', () => {
    expect(SHALLOW_HISTORY_V27_ABSTENTION).toContain('where either would be scored');
    expect(SHALLOW_HISTORY_V27_ABSTENTION).toContain('not applicable stays not applicable');
  });
});

// Regression guards for what a third review, of the merged implementation, reproduced.
describe('third-review findings against the merged implementation stay fixed', () => {
  it('#520: a requirement is claimed when a step also runs tests, for cargo test --locked, and under CRLF', () => {
    for (const [name, command, line] of [
      ['review3-a4-npm-ci-then-npm-test-in-one-step', 'npm ci', 12],
      ['review3-a4-cargo-test-locked', 'cargo test --locked', 11],
      ['review3-a4-crlf-workflow', 'npm ci', 11],
    ] as const) {
      const v17 = criterion(name, V17, 'A4');
      expect(v17.notes ?? '', name).toContain(`runs \`${command}\``);
      expect(v17.evidence[0]?.path, name).toBe('.github/workflows/ci.yml');
      expect(v17.evidence[0]?.line, name).toBe(line);
      expect(metricValue(criterion(name, V27, 'A4'), 'lockfile_coverage'), name).toBe(0);
    }
  });

  it('#520: nothing is claimed for continue-on-error, another checkout, a directory the workflow makes, or a copied lockfile', () => {
    for (const name of [
      'review3-a4-crlf-npm-ci-in-disabled-job',
      'review3-a4-npm-ci-continue-on-error-step',
      'review3-a4-npm-ci-continue-on-error-job',
      'review3-a4-npm-ci-in-other-repository-checkout',
      'review3-a4-npm-ci-in-directory-outside-checkout',
      'review3-a4-lockfile-copied-in-first',
    ]) {
      for (const rubricVersion of [V17, V27]) {
        const a4 = criterion(name, rubricVersion, 'A4');
        expect(a4.notes ?? '', `${name}@${rubricVersion}`).not.toContain('which exits with an error');
        expect(metricValue(a4, 'lockfile_coverage'), `${name}@${rubricVersion}`).not.toBe(0);
      }
      expect(criterion(name, V27, 'A4')).toEqual(criterion(name, V17, 'A4'));
    }
  });

  it('#520: the primary manifest stays first when it holds an unconstrained dependency itself', () => {
    for (const rubricVersion of [V17, V27]) {
      const a4 = criterion('review3-a4-primary-manifest-unconstrained', rubricVersion, 'A4');
      expect(a4.evidence[0]?.path).toBe('package.json');
      expect(a4.evidence.some(({ path }) => path === 'docs/package.json')).toBe(false);
    }
  });

  it('#518: a conftest.py that is the only test-shaped file keeps A1 measured, at a test ratio of 0', () => {
    for (const name of ['review3-a1-conftest-only-no-runner', 'review3-a1-conftest-only-unproven-source']) {
      const v17 = criterion(name, V17, 'A1');
      const v27 = criterion(name, V27, 'A1');
      expect(v27.status, name).toBe(v17.status);
      expect(metricValue(v27, 'test_to_source_ratio'), name).toBe(0);
      expect(v27.evidence[0]?.label, name).toBe('pytest configuration (conftest.py), not a test file');
      expect(v27.score, name).toBeLessThanOrEqual(v17.score);
    }
  });

  it('#518: a hook that empties and refills items reorders the run and is not read as removing it', () => {
    const name = 'review3-a1-hook-reorders-items';
    const a1 = criterion(name, V27, 'A1');
    expect(a1.findings.some(({ summary }) => summary.startsWith('A pytest collection hook'))).toBe(false);
    expect(metricValue(a1, 'non_hollow_test_share')).toBe(
      metricValue(criterion(name, V17, 'A1'), 'non_hollow_test_share'),
    );
  });

  it('#518: a conftest.py is never credited as a live test, so a skipped suite credits nothing', () => {
    const name = 'review3-a1-skip-hook-beside-asserting-conftest';
    expect(metricValue(criterion(name, V17, 'A1'), 'non_hollow_test_share')).toBe(3);
    const a1 = criterion(name, V27, 'A1');
    expect(metricValue(a1, 'non_hollow_test_share')).toBe(0);
    expect(a1.findings.some(({ summary }) => summary.includes('marks every collected test skipped'))).toBe(true);
  });

  it('#519: the bounded prefix reader discloses an LFS pointer as readRepoText does', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cejel-prefix-lfs-'));
    const pointer = join(dir, 'index.html');
    const page = join(dir, 'page.html');
    writeFileSync(pointer, lfsPointerFor('<html></html>\n'));
    writeFileSync(page, '<html></html>\n');
    const read = trackContentReads(dir, () => [
      readRepoTextPrefix(pointer, 16 * 1024),
      readRepoTextPrefix(page, 16 * 1024),
    ]);
    expect(read.value[0]).toBe(lfsPointerFor('<html></html>\n'));
    expect(read.summary.byReason.lfsPointer).toBe(1);
    expect(read.summary.skipped).toBe(1);
  });
});

// Regression guards for what two post-merge reviews of #533's own fixes reproduced.
describe('fourth-review findings against #533 stay fixed', () => {
  const withheld = (name: string): void => {
    for (const rubricVersion of [V17, V27]) {
      const a4 = criterion(name, rubricVersion, 'A4');
      expect(a4.notes ?? '', `${name}@${rubricVersion}`).not.toContain('which exits with an error');
      expect(a4.evidence[0]?.path ?? '', `${name}@${rubricVersion}`).not.toBe('.github/workflows/ci.yml');
      expect(metricValue(a4, 'lockfile_coverage'), `${name}@${rubricVersion}`).not.toBe(0);
    }
    expect(criterion(name, V27, 'A4'), name).toEqual(criterion(name, V17, 'A4'));
  };

  it('#520: a guard behind a leading (, { or !, an arithmetic guard, and set +e withhold the claim', () => {
    for (const name of [
      'review4-a4-guard-in-subshell',
      'review4-a4-test-guard-in-subshell',
      'review4-a4-guard-in-brace-group',
      'review4-a4-negated-guard',
      'review4-a4-negated-subshell-guard',
      'review4-a4-arithmetic-guard',
      'review4-a4-negated-npm-ci',
      'review4-a4-set-plus-e-then-npm-test',
      'review4-a4-cd-inside-subshell',
    ]) {
      withheld(name);
    }
  });

  it('#520: a directory or manifest named by a flag that the inventory does not hold withholds the claim', () => {
    for (const name of [
      'review4-a4-npm-ci-prefix-outside',
      'review4-a4-npm-ci-prefix-equals-outside',
      'review4-a4-pnpm-dir-outside',
      'review4-a4-pnpm-short-dir-outside',
      'review4-a4-uv-sync-directory-outside',
      'review4-a4-uv-run-project-outside',
      'review4-a4-cargo-manifest-path-outside',
    ]) {
      withheld(name);
    }
  });

  it('#520: checkout directories come from the inventory, never the scanning host', () => {
    for (const name of [
      'review4-a4-working-directory-through-tracked-symlink',
      'review4-a4-working-directory-untracked-empty',
      'review4-a4-cd-wrong-case',
    ]) {
      withheld(name);
    }
  });

  it('#520: each workflow-reader rule withholds the claim on its own', () => {
    for (const name of [
      'review4-a4-other-repository-checkout-at-root',
      'review4-a4-artifact-downloaded-first',
      'review4-a4-run-key-outside-any-step',
      'review4-a4-run-key-inside-block-body',
      'review4-a4-run-key-inside-action-script',
      'review4-a4-job-guard-after-steps',
      'review4-a4-steps-key-inside-block-body',
    ]) {
      withheld(name);
    }
  });

  it('#520: a directory or manifest the inventory holds is still followed; an unguarded brace group and block-scalar text are not guards or step boundaries', () => {
    for (const [name, command, line] of [
      ['review4-a4-claims-cd-into-tracked-directory', 'npm ci', 11],
      ['review4-a4-claims-prefix-into-tracked-directory', 'npm ci', 11],
      ['review4-a4-claims-manifest-path-tracked', 'cargo test --locked', 11],
      ['review4-a4-claims-after-brace-group', 'npm ci', 13],
      ['review4-a4-claims-block-indicator-with-comment', 'npm ci', 12],
      ['review4-a4-claims-dash-line-in-earlier-block', 'npm ci', 15],
    ] as const) {
      const v17 = criterion(name, V17, 'A4');
      expect(v17.notes ?? '', name).toContain(`runs \`${command}\``);
      expect(v17.evidence[0]?.path, name).toBe('.github/workflows/ci.yml');
      expect(v17.evidence[0]?.line, name).toBe(line);
      expect(metricValue(criterion(name, V27, 'A4'), 'lockfile_coverage'), name).toBe(0);
    }
  });

  it('#518: a hook that empties items and puts back nothing removes the suite, on one line or two', () => {
    for (const name of [
      'review4-a1-hook-empties-and-refills-nothing',
      'review4-a1-hook-empties-and-refills-nothing-one-line',
    ]) {
      const a1 = criterion(name, V27, 'A1');
      expect(
        a1.findings.some(({ summary }) => summary.includes('removes every collected test')),
        name,
      ).toBe(true);
      expect(metricValue(a1, 'non_hollow_test_share'), name).toBe(0);
    }
  });

  it('#518: a one-line clear-and-extend reorders the run and is not read as removing it', () => {
    const name = 'review4-a1-hook-reorders-items-one-line';
    const a1 = criterion(name, V27, 'A1');
    expect(a1.findings.some(({ summary }) => summary.startsWith('A pytest collection hook'))).toBe(false);
    expect(metricValue(a1, 'non_hollow_test_share')).toBe(
      metricValue(criterion(name, V17, 'A1'), 'non_hollow_test_share'),
    );
  });
});

// v27 abstains; it does not hide. A collector's own critical finding under v17 is still present
// under v27, unless the criterion abstained because the clone is shallow or a test file it read
// is an LFS pointer, the two cases where the finding was derived from content Cejel did not read.
describe('v27 keeps every collector critical finding v17 reports', () => {
  for (const fixture of FALSE_ASSURANCE_FIXTURES) {
    it(fixture.name, () => {
      const after = report(fixture.name, V27);
      for (const v17 of report(fixture.name, V17).criteria) {
        const own = v17.findings.filter(
          ({ severity, summary }) => severity === 'critical' && !summary.includes('metric-derived score'),
        );
        if (own.length === 0) continue;
        const v27 = after.criteria.find(({ id }) => id === v17.id);
        expect(v27?.findings.map(({ summary }) => summary), v17.id).toEqual(
          expect.arrayContaining(own.map(({ summary }) => summary)),
        );
      }
    });
  }
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
