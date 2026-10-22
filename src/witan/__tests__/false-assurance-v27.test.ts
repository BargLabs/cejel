import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { buildWitanCliSummary } from '../../summary.js';
import { renderTerminalCertificate } from '../../terminal.js';

import { WITAN_B3_UNSHOWN_CHECK_PREFIX } from '../abstention.js';
import { CERTIFICATE_GLOSSARY } from '../certificate-presentation.js';
import { isGitLfsPointerText, readRepoTextPrefix, trackContentReads } from '../content-reads.js';
import { SHALLOW_HISTORY_LIMITATION, SHALLOW_HISTORY_V27_ABSTENTION } from '../history-depth.js';
import { renderWitanHtmlReport } from '../html.js';
import { renderWitanMarkdownReport } from '../markdown.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { BEHAVIOUR_CORPUS, buildBehaviourFixture } from './fixtures/behaviour-corpus.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V26,
  WITAN_RUBRIC_VERSION_V27,
} from '../rubric-version.js';
import {
  FALSE_ASSURANCE_FIXTURES,
  SYNTHETIC_INDEX_URL_TOKEN,
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

  it('v27: removing the human gate from an upload-only workflow and running it on every push does not raise B3', () => {
    const before = criterion('review8-b3-pypi-upload-only-gated', V27, 'B3');
    const after = criterion('review8-b3-pypi-upload-only-ungated', V27, 'B3');
    expect(after.score).toBe(before.score);
    expect(metricValue(after, 'default_branch_ci_depth')).toBe(metricValue(before, 'default_branch_ci_depth'));
    expect(after.notes).toBe(
      '1 workflow that only publishes, releases or deploys (no pull-request trigger, and every step Cejel reads only checks out, sets up a toolchain, configures credentials or uploads an already-built artifact) is not counted as CI verification: .github/workflows/publish.yml.',
    );
    expect(criterion('review8-b3-pypi-upload-only-ungated', V17, 'B3').score).toBeGreaterThan(
      criterion('review8-b3-pypi-upload-only-gated', V17, 'B3').score,
    );
  });

  it('v27: the issue\'s own repros build or install before they publish, so they stay counted (a recorded recall reduction)', () => {
    for (const name of ['b3-pypi-publish-ungated', 'b3-npm-publish-ungated']) {
      expect(criterion(name, V27, 'B3'), name).toEqual(criterion(name, V17, 'B3'));
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

// Regression guards for what two post-merge review passes of #521 (merged as f5ac02273) reproduced.
describe('post-merge review findings against #521 stay fixed', () => {
  const hookClaim = (score: WitanCriterionScore): boolean =>
    score.findings.some(({ summary }) => summary.startsWith('A pytest collection hook'));

  it('#520: no repository text between a subcommand and its flag reaches any output, under every rubric', () => {
    for (const [name, command] of [
      ['review5-a4-credential-between-subcommand-and-flag', 'uv sync … --locked'],
      ['review5-a4-credential-after-npm-ci', 'npm ci'],
      ['review5-a4-flag-value-not-quoted', 'pnpm install … --frozen-lockfile'],
    ] as const) {
      for (const rubricVersion of [V17, V27]) {
        const scored = report(name, rubricVersion);
        const a4 = criterion(name, rubricVersion, 'A4');
        expect(a4.notes ?? '', `${name}@${rubricVersion}`).toContain(`runs \`${command}\` (`);
        expect(a4.evidence[0]?.label, `${name}@${rubricVersion}`).toBe(
          `CI step runs \`${command}\`, which needs ${command.startsWith('uv') ? 'uv.lock' : command.startsWith('npm') ? 'package-lock.json or npm-shrinkwrap.json' : 'pnpm-lock.yaml'}; the scanned inventory holds none`,
        );
        const outputs = {
          'report.json': JSON.stringify(scored),
          'summary.json': JSON.stringify(buildWitanCliSummary(scored)),
          'certificate.html': renderWitanHtmlReport(scored),
          'report.md': renderWitanMarkdownReport(scored),
          terminal: renderTerminalCertificate(buildWitanCliSummary(scored), scored),
        };
        for (const [output, text] of Object.entries(outputs)) {
          expect(text.includes(SYNTHETIC_INDEX_URL_TOKEN), `${name}@${rubricVersion} ${output}`).toBe(false);
          expect(text.includes('example.com'), `${name}@${rubricVersion} ${output}`).toBe(false);
        }
      }
    }
  });

  it('#520: a command with no words before its flag is quoted exactly as before', () => {
    const a4 = criterion('a4-uv-locked-lockfile-deleted', V17, 'A4');
    expect(a4.notes).toContain('runs `uv run --locked` (');
  });

  it('#519: a pointer with CRLF line endings is a pointer, and nothing looser is', () => {
    const crlf = (text: string): string => text.replace(/\n/g, '\r\n');
    expect(isGitLfsPointerText(crlf(lfsPointerFor('test content\n')))).toBe(true);
    expect(isGitLfsPointerText(crlf(lfsPointerFor('x')).replace(/\r\n$/, ''))).toBe(true);
    // Mixed endings, a lone CR, and a CRLF text that is not a pointer stay as they were.
    const mixed = lfsPointerFor('x').replace('\n', '\r\n');
    expect(isGitLfsPointerText(mixed)).toBe(false);
    expect(isGitLfsPointerText(lfsPointerFor('x').replace(/\n/g, '\r'))).toBe(false);
    expect(isGitLfsPointerText(crlf(`# notes\n${lfsPointerFor('x')}`))).toBe(false);
    expect(
      isGitLfsPointerText(crlf(`version https://git-lfs.github.com/spec/v1\noid sha256:${'a'.repeat(63)}\nsize 12\n`)),
    ).toBe(false);
    expect(isGitLfsPointerText(crlf(`${lfsPointerFor('x')}${'padding\n'.repeat(200)}`))).toBe(false);
  });

  it('#519: CRLF pointers are counted under every rubric, and v27 abstains on them as on LF pointers', () => {
    const name = 'review5-a1-js-suite-as-crlf-lfs-pointers';
    for (const rubricVersion of [V17, WITAN_RUBRIC_VERSION_V26, V27]) {
      expect(report(name, rubricVersion).contentReadSummary?.byReason.lfsPointer, rubricVersion).toBe(2);
    }
    const a1 = criterion(name, V27, 'A1');
    expect(a1.status).toBe('insufficient_data');
    expect(a1.score).toBe(0);
    expect(criterion(name, V17, 'A1').status).toBe(criterion('a1-js-suite-as-lfs-pointers', V17, 'A1').status);
  });

  it('#518: a skip not applied to the loop variable of a loop over items is not read as skipping every test', () => {
    for (const name of [
      'review5-a1-hook-timeout-every-item-skip-one-by-id',
      'review5-a1-hook-timeout-every-item-skip-first',
      'review5-a1-hook-skip-inside-nested-loop',
    ]) {
      const v17 = criterion(name, V17, 'A1');
      const v27 = criterion(name, V27, 'A1');
      expect(hookClaim(v27), name).toBe(false);
      expect(metricValue(v27, 'non_hollow_test_share'), name).toBe(metricValue(v17, 'non_hollow_test_share'));
      expect(v27.status, name).toBe(v17.status);
    }
  });

  it('#518: a skip applied to every item still claims, inline or as a block', () => {
    for (const name of ['review5-a1-hook-skip-every-item-inline', 'a1-pytest-hook-skips-every-test']) {
      const a1 = criterion(name, V27, 'A1');
      expect(a1.findings.some(({ summary }) => summary.includes('marks every collected test skipped')), name).toBe(true);
      expect(metricValue(a1, 'non_hollow_test_share'), name).toBe(0);
    }
  });

  it('#518: pytestmark is not unconditional when reassigned later or continued onto a condition', () => {
    for (const name of [
      'review5-a1-pytestmark-reassigned-under-later-if',
      'review5-a1-pytestmark-reassigned-later',
      'review5-a1-pytestmark-backslash-continuation',
      'review5-a1-pytestmark-bracketed-condition',
    ]) {
      const v17 = criterion(name, V17, 'A1');
      const v27 = criterion(name, V27, 'A1');
      expect(metricValue(v27, 'non_hollow_test_share'), name).toBe(metricValue(v17, 'non_hollow_test_share'));
      expect(metricValue(v27, 'non_hollow_test_share'), name).toBeGreaterThan(0);
    }
    const kept = criterion('review5-a1-pytestmark-skip-unconditional-with-hash-in-reason', V27, 'A1');
    expect(metricValue(kept, 'non_hollow_test_share')).toBe(0);
  });

  it('#517: a workflow that runs anything besides setup, packaging and a publish stays counted, and the note never calls it publish-only', () => {
    for (const name of [
      'review5-b3-bun-test-then-publish',
      'review5-b3-pnpm-lint-typecheck-build-then-publish',
      'review5-b3-cargo-build-release',
      'review5-b3-publish-word-only-in-comment',
      'review5-b3-docs-build-publish-word-in-comment',
      'review5-b3-npm-publish-dry-run',
    ]) {
      const v27 = criterion(name, V27, 'B3');
      expect(v27, name).toEqual(criterion(name, V17, 'B3'));
      expect(v27.notes ?? '', name).not.toContain('only publish');
    }
  });

  it('#517: cargo build keeps B3 its build category under v27', () => {
    const b3 = criterion('review5-b3-cargo-build-release', V27, 'B3');
    const depth = b3.metrics.find(({ name }) => name === 'ci_script_depth');
    expect(depth?.presentation?.components?.find(({ label }) => label === 'repository CI command: build')?.count).toBe(1);
  });

  it('#517: npx semantic-release is not a publish Cejel admits (it runs configured plugins), so the workflow stays counted', () => {
    // Changed by the re-run of review pass 1 on #553: this fixture was a publish-only corner.
    const name = 'review5-b3-semantic-release-after-setup';
    expect(criterion(name, V27, 'B3')).toEqual(criterion(name, V17, 'B3'));
    expect(criterion(name, V27, 'B3').notes ?? '').not.toContain('only publish');
  });
});

// Regression guards for what review pass 1 of #553 reproduced against its first version.
describe('review findings against #553 stay fixed', () => {
  it('#517: a step the reader cannot place, rustup run, changesets with a command input, or a command glued to an admitted word keeps the workflow counted', () => {
    for (const name of [
      'review6-b3-flow-mapping-run-step',
      'review6-b3-flow-mapping-uses-step',
      'review6-b3-quoted-run-key',
      'review6-b3-rustup-run-cargo-build',
      'review6-b3-changesets-publish-input',
      'review6-b3-command-glued-to-echo',
    ]) {
      const v27 = criterion(name, V27, 'B3');
      expect(v27, name).toEqual(criterion(name, V17, 'B3'));
      expect(v27.notes ?? '', name).not.toContain('only publish');
    }
  });

  it('#517: upload-only workflows, with permissions, with and env, are still publish-only', () => {
    for (const [name, file] of [
      ['review8-b3-pypi-upload-only-ungated', '.github/workflows/publish.yml'],
      ['review8-b3-twine-upload-only', '.github/workflows/publish.yml'],
      ['review8-b3-npm-publish-without-install', '.github/workflows/release.yml'],
      ['review8-b3-gh-release-upload', '.github/workflows/release.yml'],
      ['review7-b3-cargo-publish-no-verify', '.github/workflows/release.yml'],
    ] as const) {
      const notes = criterion(name, V27, 'B3').notes ?? '';
      expect(notes, name).toContain('1 workflow that only publishes, releases or deploys');
      expect(notes, name).toContain(file);
    }
  });

  it('#518: a skip loop in a nested function or a loop that never runs, or a hook redefined later, makes no claim', () => {
    for (const name of [
      'review6-a1-hook-loop-in-nested-def',
      'review6-a1-hook-loop-in-zero-iteration-loop',
      'review6-a1-hook-redefined-later',
    ]) {
      const v27 = criterion(name, V27, 'A1');
      expect(
        v27.findings.some(({ summary }) => summary.startsWith('A pytest collection hook')),
        name,
      ).toBe(false);
      expect(metricValue(v27, 'non_hollow_test_share'), name).toBe(
        metricValue(criterion(name, V17, 'A1'), 'non_hollow_test_share'),
      );
    }
  });

  it('#518: pytestmark reassigned on the same line, or a skip named only in a string, is not unconditional', () => {
    for (const name of [
      'review6-a1-pytestmark-skip-then-reassigned-same-line',
      'review6-a1-pytestmark-xfail-reason-names-skip',
    ]) {
      const v27 = criterion(name, V27, 'A1');
      expect(metricValue(v27, 'non_hollow_test_share'), name).toBe(
        metricValue(criterion(name, V17, 'A1'), 'non_hollow_test_share'),
      );
      expect(metricValue(v27, 'non_hollow_test_share'), name).toBeGreaterThan(0);
    }
  });
});

// Regression guards for what the re-run of review pass 1 on #553 reproduced.
describe('re-run review findings against #553 stay fixed', () => {
  it('#517: a command that runs repository-configured code, a code-loading variable, or an unnamed setup action keeps the workflow counted', () => {
    for (const name of [
      'review7-b3-prepublishonly-script',
      'review7-b3-prepare-script',
      'review7-b3-npmrc-present',
      'review7-b3-semantic-release-with-config',
      'review7-b3-goreleaser-cli-with-hooks',
      'review7-b3-cargo-publish-verifies',
      'review7-b3-node-options-leading',
      'review7-b3-node-options-exported',
      'review7-b3-echo-into-github-env',
      'review7-b3-step-env-ld-preload',
      'review7-b3-step-env-pythonpath-twine',
      'review9-b3-step-env-ld-audit-twine',
      'review7-b3-python-build-runs-setup-py',
      'review7-b3-third-party-setup-action',
    ]) {
      const v27 = criterion(name, V27, 'B3');
      expect(v27, name).toEqual(criterion(name, V17, 'B3'));
      expect(v27.notes ?? '', name).not.toContain('only publish');
    }
  });

  it('#518: a clear in a nested function or a loop, or a hook name bound elsewhere, makes no claim', () => {
    for (const name of [
      'review7-a1-hook-clear-in-nested-def',
      'review7-a1-hook-clear-in-zero-iteration-loop',
      'review7-a1-hook-clear-in-loop-over-other-iterable',
      'review7-a1-hook-conditional-redefinition',
      'review7-a1-hook-rebound-by-assignment',
    ]) {
      const v27 = criterion(name, V27, 'A1');
      expect(
        v27.findings.some(({ summary }) => summary.startsWith('A pytest collection hook')),
        name,
      ).toBe(false);
      expect(metricValue(v27, 'non_hollow_test_share'), name).toBe(
        metricValue(criterion(name, V17, 'A1'), 'non_hollow_test_share'),
      );
    }
  });
});

// Regression guards for the second re-run of review pass 1 on #553 and the narrower rule it led to.
describe('publish-only means checkout, credentials and an upload of a built artifact', () => {
  it('#517: native addons, pnpm workspaces, installs, builds, a quoted code-loading export, or a release with no files keep the workflow counted', () => {
    for (const name of [
      'review8-b3-binding-gyp-publish',
      'review8-b3-gypfile-publish',
      'review8-b3-pnpm-workspace-publish',
      'review8-b3-uv-sync-path-source',
      'review8-b3-maturin-build',
      'review8-b3-quoted-export-node-options',
      'review8-b3-softprops-without-files',
    ]) {
      const v27 = criterion(name, V27, 'B3');
      expect(v27, name).toEqual(criterion(name, V17, 'B3'));
      expect(v27.notes ?? '', name).not.toContain('only publish');
    }
  });

  it('#517: a workflow that installs before it publishes, or uses changesets, is counted (recorded recall reductions)', () => {
    for (const name of ['review6-b3-changesets-without-command-inputs', 'review5-b3-semantic-release-after-setup']) {
      expect(criterion(name, V27, 'B3'), name).toEqual(criterion(name, V17, 'B3'));
    }
  });
});

// v27 abstains; it does not hide. A collector's own critical finding under v17 is still present
// under v27, unless the criterion abstained because the clone is shallow or a test file it read
// is an LFS pointer, the two cases where the finding was derived from content Cejel did not read.
// #527 and #535 (2026-10-22): one predicate, uncreditedCiWorkflowReason, decides for B2 and B3
// whether a CI workflow is credited. A workflow that only publishes (upload-only, #553's rule) or
// whose every step only checks out and prints is not credited under v27; under v17 both still are.
const PUBLISH_ONLY_NOTE_TAIL =
  '1 workflow that only publishes, releases or deploys (no pull-request trigger, and every step Cejel reads only checks out, sets up a toolchain, configures credentials or uploads an already-built artifact) is not counted as';
const PRINT_ONLY_NOTE_TAIL =
  '1 workflow not shown to run a check (every step Cejel reads only checks out the repository, prints text or does nothing) is not counted as';

describe('#527 — B2 does not credit a CI workflow not shown to run a check', () => {
  it('v17 is unchanged: an upload-only workflow is a PR-trace CI workflow, as the issue reports', () => {
    const b2 = criterion('b2-publish-only-is-the-only-workflow', V17, 'B2');
    expect(metricValue(b2, 'pr_trace_primitives')).toBe(1);
    expect(b2.notes).toBeUndefined();
    expect(criterion('b2-publish-only-beside-test-workflow', V17, 'B2').score).toBeGreaterThan(
      criterion('b2-test-workflow-only', V17, 'B2').score,
    );
  });

  it('v27: the upload-only workflow earns no PR-trace credit, and B2 is still scored, not abstained', () => {
    const b2 = criterion('b2-publish-only-is-the-only-workflow', V27, 'B2');
    expect(metricValue(b2, 'pr_trace_primitives')).toBe(0);
    expect(b2.status).toBe('critical');
    expect(b2.notes).toBe(`${PUBLISH_ONLY_NOTE_TAIL} a PR-trace CI workflow: .github/workflows/publish.yml.`);
    expect(b2.evidence.map(({ label }) => label)).toEqual(['CI workflow not shown to run a check (not counted)']);
  });

  it('v27: adding an upload-only workflow beside a test workflow does not raise B2', () => {
    const control = criterion('b2-test-workflow-only', V27, 'B2');
    const change = criterion('b2-publish-only-beside-test-workflow', V27, 'B2');
    expect(change.score).toBe(control.score);
    expect(metricValue(change, 'pr_trace_primitives')).toBe(metricValue(control, 'pr_trace_primitives'));
  });

  it('v27: a CI workflow B2 cannot read is a read failure, so B2 abstains at 0 instead of crediting it', () => {
    const control = falseAssuranceFixture('b2-test-workflow-only');
    const repo = buildFalseAssuranceFixture({
      ...control,
      name: 'b2-workflow-as-lfs-pointer',
      commits: [{ ...control.commits[0], '.github/workflows/e2e.yml': lfsPointerFor('e2e workflow') }],
    });
    const b2 = (rubricVersion: string) =>
      scoreRepoWithPublicCejel({
        repoPath: repo,
        productSlug: 'false-assurance-fixture',
        productDisplayName: 'False-assurance fixture',
        generatedAt: '2026-10-22T00:00:00.000Z',
        rubricVersion,
        ingestPatterns: [],
        autoDiscoverIngest: false,
      }).criteria.find(({ id }) => id === 'B2');
    expect(b2(V17)?.status).toBe('warning');
    expect(b2(V27)?.status).toBe('insufficient_data');
    expect(b2(V27)?.score).toBe(0);
  });

  it('v27: a workflow that runs the tests and then uploads keeps its credit in B2 and B3', () => {
    for (const id of ['B2', 'B3']) {
      expect(criterion('b2-test-then-upload-stays-credited', V27, id), id).toEqual(
        criterion('b2-test-then-upload-stays-credited', V17, id),
      );
    }
  });
});

describe('#535 — B3 does not count a workflow not shown to run a check', () => {
  it('v17 is unchanged: the print-only workflow is counted, and the #540 disclosure names it', () => {
    const b3 = criterion('b3-print-only-pr-workflow-beside-tests', V17, 'B3');
    expect(metricValue(b3, 'default_branch_ci_depth')).toBe(2);
    expect(b3.disclosures).toEqual([
      `${WITAN_B3_UNSHOWN_CHECK_PREFIX}.github/workflows/e2e.yml only prints text. The PR-gate CI workflow count still includes it.`,
    ]);
    expect(metricValue(criterion('b3-print-only-echo-names-a-test-command', V17, 'B3'), 'ci_script_depth')).toBe(1);
  });

  it("v27: the issue's repro scores B2 and B3 exactly as the test workflow alone, and says why", () => {
    for (const id of ['B2', 'B3']) {
      const change = criterion('b3-print-only-pr-workflow-beside-tests', V27, id);
      const control = criterion('b2-test-workflow-only', V27, id);
      expect(change.score, id).toBe(control.score);
      expect(change.metrics.map(({ name, value }) => [name, value]), id).toEqual(
        control.metrics.map(({ name, value }) => [name, value]),
      );
    }
    const b3 = criterion('b3-print-only-pr-workflow-beside-tests', V27, 'B3');
    expect(b3.disclosures).toEqual([
      'B3 did not count CI workflows Cejel did not see run a check: .github/workflows/e2e.yml only checks out the repository, prints text or does nothing.',
    ]);
    expect(b3.notes).toBe(`${PRINT_ONLY_NOTE_TAIL} CI verification: .github/workflows/e2e.yml.`);
    expect(criterion('b3-print-only-pr-workflow-beside-tests', V27, 'B2').notes).toBe(
      `${PRINT_ONLY_NOTE_TAIL} a PR-trace CI workflow: .github/workflows/e2e.yml.`,
    );
  });

  it('v27: a printed test-command word earns no CI command credit', () => {
    const b3 = criterion('b3-print-only-echo-names-a-test-command', V27, 'B3');
    expect(metricValue(b3, 'ci_script_depth')).toBe(0);
    expect(metricValue(b3, 'default_branch_ci_depth')).toBe(0);
    expect(b3.status).not.toBe('insufficient_data');
  });

  it('v27: a print step beside an unplaced action, or a block that also runs pytest, keeps its credit', () => {
    for (const name of ['b3-echo-then-unplaced-action-stays-credited', 'b3-echo-in-a-run-block-with-a-test-stays-credited']) {
      for (const id of ['B2', 'B3']) {
        expect(criterion(name, V27, id), `${name} ${id}`).toEqual(criterion(name, V17, id));
      }
    }
  });

  // The branch half of #535, ruled out of condition 3 by the operator on 2026-10-22 (#526, #535):
  // which branches exist is ref state, which the attestation's only repository revision,
  // repo.headSha, does not determine. Pinned so a change is deliberate.
  it('ruled out: a workflow confined to master in a repository whose only branch is main is still counted under v27', () => {
    const b3 = criterion('b3-master-confined-workflow-on-main-still-counted', V27, 'B3');
    expect(metricValue(b3, 'default_branch_ci_depth')).toBe(1);
    expect(b3).toEqual(criterion('b3-master-confined-workflow-on-main-still-counted', V17, 'B3'));
  });

  // Branch state is outside the attested revision (the attestation's only repository revision is
  // repo.headSha). A rule that read refs, such as "a master filter counts only if refs/heads/master
  // exists", makes these scores differ between the states below; checked by injecting exactly that
  // rule into workflowTargetsDefaultBranch while writing this test (review of #562).
  it.each(['b3-master-confined-workflow-on-main-still-counted', 'b3-print-only-pr-workflow-beside-tests'])(
    'the same commit scores the same whatever refs the checkout holds — %s',
    (name) => {
      const repo = buildFalseAssuranceFixture(falseAssuranceFixture(name));
      const score = () =>
        [V17, V27].map((rubricVersion) =>
          JSON.stringify(
            scoreRepoWithPublicCejel({
              repoPath: repo,
              productSlug: 'false-assurance-fixture',
              productDisplayName: 'False-assurance fixture',
              generatedAt: '2026-10-22T00:00:00.000Z',
              rubricVersion,
              ingestPatterns: [],
              autoDiscoverIngest: false,
            }),
          ),
        );
      const git = (...args: string[]) =>
        execFileSync('git', args, { cwd: repo, stdio: ['ignore', 'pipe', 'ignore'] });
      const onMain = score();
      const steps: ReadonlyArray<readonly [string, () => void]> = [
        ['a master branch added', () => git('branch', 'master')],
        ['the master branch deleted', () => git('branch', '-D', 'master')],
        ['main renamed to trunk', () => git('branch', '-m', 'main', 'trunk')],
        [
          'an origin/HEAD naming origin/main',
          () => {
            git('update-ref', 'refs/remotes/origin/main', 'HEAD');
            git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
          },
        ],
        [
          'origin/HEAD moved to origin/master',
          () => {
            git('update-ref', 'refs/remotes/origin/master', 'HEAD');
            git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/master');
          },
        ],
        ['a detached HEAD', () => git('-c', 'advice.detachedHead=false', 'checkout', '--quiet', '--detach')],
      ];
      for (const [state, apply] of steps) {
        apply();
        expect(score(), state).toEqual(onMain);
      }
    },
  );
});

describe('#564 — the print-only and publish-only readers claim nothing outside a bash runner', () => {
  const v17Disclosure = (name: string) => criterion(name, V17, 'B3').disclosures ?? [];
  it.each([
    'review10-print-only-windows-latest-pwsh-hashtable',
    'review10-print-only-windows-2022-pwsh-hashtable',
    'review10-print-only-self-hosted-printf',
    'review10-print-only-ubuntu-equals-sign',
    'review10-print-only-runner-expression',
    'review10-upload-only-windows-runner',
    'review10-upload-only-self-hosted-runner',
    'review11-print-only-ubuntu-xlarge-label',
    'review11-twine-upload-pwsh-hashtable-argument',
  ])('%s keeps its credit under v27 and gets no print-only disclosure under v17', (name) => {
    for (const id of ['B2', 'B3']) {
      expect(criterion(name, V27, id), `${name} ${id}`).toEqual(criterion(name, V17, id));
      expect(criterion(name, V27, id).disclosures, `${name} ${id}`).toBeUndefined();
    }
    expect(v17Disclosure(name).join(' ')).not.toContain('only prints text');
  });

  it('control: an inert echo on ubuntu-latest is still print-only under every rubric', () => {
    expect(v17Disclosure('review10-print-only-ubuntu-inert-text').join(' ')).toContain('test.yml only prints text');
    expect(metricValue(criterion('review10-print-only-ubuntu-inert-text', V27, 'B3'), 'default_branch_ci_depth')).toBe(0);
  });
});

// Review of #562: the glossary states the readers' conditions, so a PR-triggered upload-only
// workflow, which the publish-only reader never claims, is counted and the glossary says why.
describe('the v27 glossary sentences state the conditions the readers apply', () => {
  it('a pull-request-triggered upload-only workflow is counted, and the glossary names that condition', () => {
    const name = 'review11-upload-only-with-pull-request-trigger';
    for (const id of ['B2', 'B3']) expect(criterion(name, V27, id), id).toEqual(criterion(name, V17, id));
    for (const term of ['PR trace basic checks', 'PR-gate CI workflow count (automated build/test pipeline)']) {
      const entry = CERTIFICATE_GLOSSARY.find((candidate) => candidate.term === term);
      expect(entry?.definition, term).toContain('for a workflow with no pull-request trigger, as only uploading an already-built artifact');
      expect(entry?.definition, term).toContain('only when every job runs on a documented GitHub-hosted Ubuntu or macOS runner');
    }
  });
});

describe('v27 certificates say a CI workflow was not credited, never that it is missing (review of #562)', () => {
  const rendered = (repoPath: string) => {
    const scored = scoreRepoWithPublicCejel({
      repoPath,
      productSlug: 'false-assurance-fixture',
      productDisplayName: 'False-assurance fixture',
      generatedAt: '2026-10-22T00:00:00.000Z',
      rubricVersion: V27,
      ingestPatterns: [],
      autoDiscoverIngest: false,
    });
    return {
      markdown: renderWitanMarkdownReport(scored),
      html: renderWitanHtmlReport(scored),
      terminal: renderTerminalCertificate(buildWitanCliSummary(scored), scored),
    };
  };
  const corpusFixture = BEHAVIOUR_CORPUS.find(({ name }) => name === 'workspace-package-scripts');
  it.each([
    ['workspace-package-scripts', () => buildBehaviourFixture(corpusFixture as (typeof BEHAVIOUR_CORPUS)[number]), 'ci.yml'],
    ['b2-publish-only-is-the-only-workflow', () => buildFalseAssuranceFixture(falseAssuranceFixture('b2-publish-only-is-the-only-workflow')), 'publish.yml'],
  ] as const)('%s', (_name, build, file) => {
    for (const [surface, text] of Object.entries(rendered(build()))) {
      expect(text, surface).not.toContain('missing: CI workflow');
      expect(text, surface).toContain('B2 did not count CI workflows Cejel did not see run a check: .github/workflows/' + file);
      expect(text, surface).toContain('B3 did not count CI workflows Cejel did not see run a check: .github/workflows/' + file);
    }
  });
});

describe('B2 and B3 never disagree about which workflows are credited (v27)', () => {
  for (const fixture of FALSE_ASSURANCE_FIXTURES) {
    it(fixture.name, () => {
      const b2 = criterion(fixture.name, V27, 'B2');
      const b3 = criterion(fixture.name, V27, 'B3');
      // Skipped where either abstains: an abstaining criterion carries no count to compare.
      if (b2.status === 'insufficient_data' || b3.status === 'insufficient_data') return;
      expect(b2.notes?.replaceAll('a PR-trace CI workflow', 'CI verification')).toBe(b3.notes);
      // The counts agree too: B2 credits every CI workflow file B3 does not set aside.
      const files = new Set<string>();
      for (const commit of fixture.commits) {
        for (const [path, contents] of Object.entries(commit)) {
          if (contents === null) files.delete(path);
          else files.add(path);
        }
      }
      const ciFiles = [...files].filter((path) => /^\.github\/workflows\/.+\.ya?ml$/.test(path)).length;
      const uncreditedCount = (score: WitanCriterionScore, metricName: string) =>
        Number(/^(\d+) CI workflow files? not shown to run a check/.exec(
          score.metrics.find(({ name }) => name === metricName)?.presentation?.condition ?? '',
        )?.[1] ?? 0);
      const b3Uncredited = uncreditedCount(b3, 'default_branch_ci_depth');
      expect(uncreditedCount(b2, 'pr_trace_primitives')).toBe(b3Uncredited);
      const ciComponent = b2.metrics
        .find(({ name }) => name === 'pr_trace_primitives')
        ?.presentation?.components?.find(({ label }) => /CI workflow/.test(label));
      expect(ciComponent?.count).toBe(ciFiles - b3Uncredited);
    });
  }
});

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
