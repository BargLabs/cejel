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
import { checkNoRise, evidenceIdentity, lostFindings } from './v27-no-rise.js';

// #517, #518, #519, #520, #442: places where a v17 certificate asserted more than Cejel read.
// Synthetic fixtures only (fixtures/false-assurance-fixtures.ts), built from each issue's repro.
//
// Two halves. Under v17, the public default, scoring must not move (the presentation fixes change
// notes, labels, citation order and an LFS pointer count, nothing else), so the v17 assertions
// below pin the v17 result, defect included. The one exception is #442's B2 on a shallow clone,
// which under v17 too withholds its pull-request merge ratio and is scored on the checked-out files,
// by the operator's decision of 2026-10-27. Under witan-rubric-v27-prospective-2026-10-19 the
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

/**
 * v27's report of a shallow fixture's full clone: the same commits, not cloned at depth 1. Since the
 * v27 freeze change F1 the no-rise property compares v27's A2 and B2 on a shallow clone with it.
 * Undefined for a fixture that is not shallow.
 */
function fullCloneReport(name: string): WitanReport | undefined {
  const fixture = falseAssuranceFixture(name);
  if (!fixture.shallow) return undefined;
  const key = `${name}@full-clone@${V27}`;
  const cached = reports.get(key);
  if (cached) return cached;
  const scored = scoreRepoWithPublicCejel({
    repoPath: buildFalseAssuranceFixture({ ...fixture, shallow: false }),
    productSlug: 'false-assurance-fixture',
    productDisplayName: 'False-assurance fixture',
    generatedAt: '2026-10-19T00:00:00.000Z',
    rubricVersion: V27,
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

// #517 follow-up (2026-10-26). B3 no longer counts a workflow with no pull-request trigger that runs
// an unconditional publish, release or deploy step, whatever else it runs. The fixtures below were
// built so that the publish-only reader would refuse them, and each one is such a workflow. The
// reader still refuses them: B3's note never says "only publishes", and B2 is unchanged. B3 now
// sets them aside as publishing workflows instead of matching v17. Every other fixture these tests
// name still matches v17. The list is the set the before/after probe of this change measured as
// moving in B3.
const SET_ASIDE_AS_PUBLISHING: ReadonlySet<string> = new Set([
  'review5-b3-bun-test-then-publish',
  'review5-b3-pnpm-lint-typecheck-build-then-publish',
  'review5-b3-cargo-build-release',
  'review5-b3-semantic-release-after-setup',
  'review6-b3-flow-mapping-run-step',
  'review6-b3-flow-mapping-uses-step',
  'review6-b3-quoted-run-key',
  'review6-b3-rustup-run-cargo-build',
  'review6-b3-command-glued-to-echo',
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
  'review9-b3-step-env-ld-audit-twine',
  'review7-b3-step-env-pythonpath-twine',
  'review7-b3-python-build-runs-setup-py',
  'review7-b3-third-party-setup-action',
  'review8-b3-binding-gyp-publish',
  'review8-b3-gypfile-publish',
  'review8-b3-pnpm-workspace-publish',
  'review8-b3-uv-sync-path-source',
  'review8-b3-maturin-build',
  'review8-b3-quoted-export-node-options',
  'review8-b3-softprops-without-files',
  'review11-twine-upload-pwsh-hashtable-argument',
  'review12-pnpm-publish-glob-flag',
  'review12-yarn-publish-glob-flag',
  'review12-npm-publish-unknown-flag',
  'review12-cargo-publish-glob-flag',
  'review12-cargo-credential-provider-variable',
  'review12-twine-pythonuserbase-variable',
  'review12-cargo-home-step-env',
  'review12-gh-release-xdg-config-step-env',
  'review12-cargo-committed-config-credential-provider',
  'review12-twine-upload-flag-glob',
  'review13-poetry-project-plugin-pth',
  'review13-poetry-requires-plugins',
  'review13-uv-toml-committed',
  'review13-uv-pyproject-table',
  'review13-rust-toolchain-toml',
  'review14-uv-index-array-table',
  'review14-uv-under-tool-table-dotted',
  'review14-uv-root-dotted-key',
  'review14-uv-inline-table',
  'review14-uv-quoted-key',
  'review14-uv-escaped-key',
  'review14-poetry-quoted-requires-plugins',
  'review15-uv-hex-escaped-key',
  // Added 2026-10-27 (#517 second follow-up): a publishing action (here pypa/gh-action-pypi-publish)
  // is read on any runner, since an action does not run through the step shell; only run lines need
  // a bash runner. These two upload-only workflows, on windows-latest and on a self-hosted runner,
  // are still refused by the publish-only reader.
  'review10-upload-only-windows-runner',
  'review10-upload-only-self-hosted-runner',
]);

/**
 * The publish-only reader does not claim `name`. B3 under v27 either matches v17, or, for a
 * SET_ASIDE_AS_PUBLISHING fixture, sets the workflow aside as publishing (never as publish-only)
 * and scores no higher than v17.
 */
function expectPublishOnlyRefused(name: string): void {
  const v17 = criterion(name, V17, 'B3');
  const v27 = criterion(name, V27, 'B3');
  expect(v27.notes ?? '', name).not.toContain('only publish');
  if (!SET_ASIDE_AS_PUBLISHING.has(name)) {
    expect(v27, name).toEqual(v17);
    return;
  }
  expect(v27.notes ?? '', name).toMatch(/workflows? that publish(?:es)?, releases? or deploys? with no pull-request trigger/);
  expect(v27.score, name).toBeLessThanOrEqual(v17.score);
  expect(criterion(name, V27, 'B2'), name).toEqual(criterion(name, V17, 'B2'));
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

  // Changed 2026-10-26 (#517 follow-up): these were a recorded recall reduction, counted under v27
  // because they build or install before they publish. A workflow with no pull-request trigger that
  // runs an unconditional publish step is now not counted by B3, whatever else it runs.
  it('v27: the issue\'s own repros, which build or install before they publish, no longer raise B3 when the gate is removed', () => {
    for (const [gated, ungated] of [
      ['b3-pypi-publish-gated', 'b3-pypi-publish-ungated'],
      ['b3-npm-publish-gated', 'b3-npm-publish-ungated'],
    ] as const) {
      const before = criterion(gated, V27, 'B3');
      const after = criterion(ungated, V27, 'B3');
      expect(after.score, ungated).toBe(before.score);
      expect(metricValue(after, 'default_branch_ci_depth'), ungated).toBe(metricValue(before, 'default_branch_ci_depth'));
      expect(after.notes, ungated).toContain('1 workflow that publishes, releases or deploys with no pull-request trigger');
      expect(after.notes ?? '', ungated).not.toContain('only publish');
    }
  });

  it('v27: a workflow that runs the tests and then publishes on every push, with no pull-request trigger, is not counted', () => {
    // Changed 2026-10-26 (#517 follow-up): this corner counted under v27 before.
    const v17 = criterion('b3-test-then-publish-workflow', V17, 'B3');
    const v27 = criterion('b3-test-then-publish-workflow', V27, 'B3');
    expect(v27.score).toBeLessThan(v17.score);
    expect(metricValue(v27, 'default_branch_ci_depth')).toBe((metricValue(v17, 'default_branch_ci_depth') ?? 0) - 1);
    // Changed 2026-10-28 (v27 freeze change F3-b): the note goes on to name the trigger and the
    // publishing job's environment.
    expect(v27.notes).toBe(
      '1 workflow that publishes, releases or deploys with no pull-request trigger (an unconditional step runs a publish, release or deploy command or action) is not counted as CI verification, whatever else it runs: .github/workflows/ci-release.yml. .github/workflows/ci-release.yml is triggered by push to main, and its publishing job declares no environment.',
    );
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

  // Follow-up 2026-10-27: the skip marker held in a local or module-level name, as in the pytest
  // documentation's own example, or added by the name "skip". v17 is unchanged.
  it('v27: a skip marker held in a name or added by name marks the suite hollow and names the hook', () => {
    for (const [name, line] of [
      ['a1-pytest-hook-skip-marker-held-in-local', 4],
      ['a1-pytest-hook-skip-marker-module-constant', 6],
      ['a1-pytest-hook-skip-marker-by-name', 4],
    ] as const) {
      const v17 = criterion(name, V17, 'A1');
      expect(v17.status, name).toBe('verified');
      const a1 = criterion(name, V27, 'A1');
      expect(metricValue(a1, 'non_hollow_test_share'), name).toBe(0);
      expect(a1.status, name).toBe('critical');
      expect(a1.score, name).toBeLessThan(v17.score);
      const hook = a1.findings.find(({ summary }) => summary.startsWith('A pytest collection hook'));
      expect(hook?.severity, name).toBe('warning');
      expect(hook?.summary, name).toContain('marks every collected test skipped');
      expect(hook?.evidence.path, name).toBe('tests/conftest.py');
      expect(hook?.evidence.line, name).toBe(line);
    }
  });

  it('v27: a held marker that is conditional, rebound, bound too late, not a skip, or a skipif makes no claim', () => {
    for (const name of [
      'a1-pytest-hook-skip-marker-held-conditional',
      'a1-pytest-hook-skip-marker-rebound-before-loop',
      'a1-pytest-hook-skip-marker-bound-after-loop',
      'a1-pytest-hook-module-marker-rebound-elsewhere',
      'a1-pytest-hook-module-marker-not-skip',
      'a1-pytest-hook-skipif-marker-held',
      'a1-pytest-hook-marker-by-other-name',
    ]) {
      const v17 = criterion(name, V17, 'A1');
      const v27 = criterion(name, V27, 'A1');
      expect(
        v27.findings.some(({ summary }) => summary.startsWith('A pytest collection hook')),
        name,
      ).toBe(false);
      expect(metricValue(v27, 'non_hollow_test_share'), name).toBe(metricValue(v17, 'non_hollow_test_share'));
      expect(v27.status, name).toBe(v17.status);
    }
  });
});

// v27 freeze change F2 (operator decision 2026-10-28). #602 read run-wide skips; a file whose every
// test carries its own unconditional skip still counted as tests that run. Under v27 it is hollow,
// and A1 says which file and which skip. v17 is unchanged.
describe('F2 — a test file whose every test is unconditionally skipped is hollow (v27)', () => {
  const perTestNotes = (score: WitanCriterionScore) =>
    score.findings.filter(({ summary }) => summary.startsWith('Every test in '));
  /** non_hollow_test_share as a share: non-hollow files over rated files. */
  const share = (score: WitanCriterionScore): number | undefined => {
    const found = score.metrics.find((metric) => metric.name === 'non_hollow_test_share');
    return found?.max ? found.value / found.max : undefined;
  };

  it('v27: each shape makes its files hollow and names the file and the skip; v17 stays verified', () => {
    for (const [name, notes] of [
      [
        'f2-py-pytest-mark-skip-every-test',
        [
          ['tests/test_cache.py', 5, '@pytest.mark.skip'],
          ['tests/test_lru.py', 5, '@pytest.mark.skip'],
        ],
      ],
      [
        'f2-py-unittest-skip-every-method',
        [
          ['tests/test_cache.py', 7, '@unittest.skip'],
          ['tests/test_lru.py', 7, '@unittest.skip'],
        ],
      ],
      [
        'f2-py-skip-on-enclosing-class',
        [
          ['tests/test_cache.py', 6, '@pytest.mark.skip on class TestCache'],
          ['tests/test_lru.py', 6, '@unittest.skip on class LRUTest'],
        ],
      ],
      [
        'f2-py-skip-held-in-module-name',
        [
          ['tests/test_cache.py', 7, '@skip_all, bound to pytest.mark.skip'],
          ['tests/test_lru.py', 7, '@disabled, bound to pytest.mark.skip'],
        ],
      ],
      [
        'f2-py-skipif-literal-true',
        [
          ['tests/test_cache.py', 5, '@pytest.mark.skipif(True)'],
          ['tests/test_lru.py', 7, '@unittest.skipIf(True)'],
        ],
      ],
      [
        'f2-js-it-skip-every-test',
        [
          ['test/max.test.js', 4, 'test.skip'],
          ['test/sum.test.js', 5, 'it.skip'],
        ],
      ],
      [
        'f2-js-xit-xtest-every-test',
        [
          ['test/max.test.js', 4, 'xtest'],
          ['test/sum.test.js', 5, 'xit'],
        ],
      ],
      [
        'f2-js-xdescribe-contains-every-test',
        [
          ['test/max.test.js', 4, 'it.skip'],
          ['test/sum.test.js', 4, 'xdescribe'],
        ],
      ],
    ] as const) {
      const v17 = criterion(name, V17, 'A1');
      expect(v17.status, name).toBe('verified');
      expect(share(v17), name).toBe(1);
      expect(perTestNotes(v17), name).toEqual([]);
      const v27 = criterion(name, V27, 'A1');
      expect(share(v27), name).toBe(0);
      expect(v27.status, name).not.toBe('verified');
      expect(v27.score, name).toBeLessThan(v17.score);
      expect(
        perTestNotes(v27).map(({ severity, summary, evidence }) => [severity, summary, evidence.path, evidence.line]),
        name,
      ).toEqual(
        notes.map(([path, line, skip]) => [
          'warning',
          `Every test in ${path} is skipped unconditionally (${skip}), so the file cannot fail.`,
          path,
          line,
        ]),
      );
    }
  });

  it('v27: describe.skip, hollow under every rubric already, keeps its reading; the it.skip file beside it is hollow', () => {
    const name = 'f2-js-describe-skip-contains-every-test';
    const v17 = criterion(name, V17, 'A1');
    const v27 = criterion(name, V27, 'A1');
    expect(share(v17)).toBe(0.5);
    expect(share(v27)).toBe(0);
    expect(perTestNotes(v27).map(({ evidence }) => evidence.path)).toEqual(['test/max.test.js']);
  });

  it('v27: a mixed file, a conditional skip, a rebound name, .todo, or a file with no recognisable tests makes no claim', () => {
    for (const name of [
      'f2-py-mixed-one-test-runs',
      'f2-py-unskipped-class-method',
      'f2-py-skipif-with-condition',
      'f2-py-held-name-rebound',
      'f2-py-test-defined-in-block',
      'f2-py-class-inherits-tests',
      'f2-py-skip-under-other-decorator',
      'f2-py-no-recognisable-tests',
      'f2-js-control',
      'f2-js-mixed-one-test-runs',
      'f2-js-skipif-conditional',
      'f2-js-aliased-test-global',
      'f2-js-quote-in-regex-literal',
      'f2-js-todo-beside-skips',
    ]) {
      const v17 = criterion(name, V17, 'A1');
      const v27 = criterion(name, V27, 'A1');
      expect(perTestNotes(v27), name).toEqual([]);
      expect(share(v27), name).toBe(share(v17));
      expect(v27.status, name).toBe(v17.status);
      expect(v27.score, name).toBe(v17.score);
    }
  });
});

// v27 freeze change F3 (operator decision 2026-10-28): residuals from the #600 review, the #114
// regression check and the #608 (F2) review. Every change is under v27 only; v17 is unchanged.
describe('F3-a — a command backgrounded with a single & is not a CI lockfile requirement (v27)', () => {
  const REQUIREMENT_FINDING = "This repository's CI requires a lockfile";
  const requiringNote = "An unconditional step in this repository's CI runs `uv sync --locked` (.github/workflows/tests.yaml line 12)";

  it('v27: `uv sync --locked &` on ubuntu, windows and bash -l, and `& wait`, state no requirement; v17 still cites the line', () => {
    for (const name of [
      'f3a-uv-sync-backgrounded-ubuntu',
      'f3a-uv-sync-backgrounded-windows',
      'f3a-uv-sync-backgrounded-bash-login',
      'f3a-uv-sync-backgrounded-then-wait',
    ]) {
      const v17 = criterion(name, V17, 'A4');
      expect(v17.notes, name).toContain(requiringNote);
      const v27 = criterion(name, V27, 'A4');
      expect(v27.notes ?? '', name).not.toContain('uv sync --locked');
      expect(metricValue(v27, 'lockfile_coverage'), name).toBeUndefined();
      expect(v27.findings.some(({ summary }) => summary.startsWith(REQUIREMENT_FINDING)), name).toBe(false);
      expect(v27.evidence.some(({ path }) => path === '.github/workflows/tests.yaml'), name).toBe(false);
      expect(v27.score, name).toBe(v17.score);
      expect(v27.status, name).toBe(v17.status);
    }
  });

  it('controls: `&&` and a `2>&1` redirection keep the requirement under v27, as #600 left it', () => {
    for (const name of ['f3a-control-uv-sync-and-run', 'f3a-control-uv-sync-redirected']) {
      const v27 = criterion(name, V27, 'A4');
      expect(v27.notes, name).toContain(requiringNote);
      expect(metricValue(v27, 'lockfile_coverage'), name).toBe(0);
      const finding = v27.findings.find(({ summary }) => summary.startsWith(REQUIREMENT_FINDING));
      expect(finding?.evidence.line, name).toBe(12);
    }
  });
});

describe('F3-b — v27 B3 names what triggers a publishing workflow and whether its job declares an environment', () => {
  const PUBLISHING_SENTENCE =
    '1 workflow that publishes, releases or deploys with no pull-request trigger (an unconditional step runs a publish, release or deploy command or action) is not counted as CI verification, whatever else it runs: .github/workflows/release.yml.';

  it.each([
    ['f3b-publish-push-main-no-environment', 'is triggered by push to main, and its publishing job declares no environment.'],
    ['f3b-publish-push-main-environment-pypi', 'is triggered by push to main, and its publishing job declares the environment pypi.'],
    ['f3b-publish-on-tag-push', 'is triggered by push of a tag its filter matches, and its publishing job declares no environment.'],
    ['f3b-publish-workflow-dispatch-only', 'is triggered by workflow_dispatch, and its publishing job declares no environment.'],
    [
      'f3b-publish-release-and-dispatch-environment-mapping',
      'is triggered by release and workflow_dispatch, and its publishing job declares the environment pypi.',
    ],
  ])('%s: the earlier sentence stays a prefix; only the note changes', (name, detail) => {
    const v27 = criterion(name, V27, 'B3');
    expect(v27.notes).toBe(`${PUBLISHING_SENTENCE} .github/workflows/release.yml ${detail}`);
    // Measured on main: the publishing workflow is set aside, and nothing else about B3 differs by
    // fixture except the note.
    expect(v27.status).toBe('verified');
    expect(v27.score).toBe(1);
    expect(metricValue(v27, 'default_branch_ci_depth')).toBe(1);
    expect(criterion(name, V17, 'B3').notes).toBeUndefined();
  });
});

describe('F3-d, F3-e, F3-f — a per-test skip reader makes no claim when it cannot see every test (v27)', () => {
  const perTestNotes = (score: WitanCriterionScore) =>
    score.findings.filter(({ summary }) => summary.startsWith('Every test in '));
  const share = (score: WitanCriterionScore): number | undefined => {
    const found = score.metrics.find((metric) => metric.name === 'non_hollow_test_share');
    return found?.max ? found.value / found.max : undefined;
  };
  const expectSameAsV17 = (name: string) => {
    const v17 = criterion(name, V17, 'A1');
    const v27 = criterion(name, V27, 'A1');
    expect(perTestNotes(v27), name).toEqual([]);
    expect(share(v27), name).toBe(share(v17));
    expect(v27.status, name).toBe(v17.status);
    expect(v27.score, name).toBe(v17.score);
  };

  it('F3-d: a test registered as a method call, a shared-suite helper, JSX or a slash after ++ beside it.skip makes no claim', () => {
    for (const name of [
      'f3d-js-deno-test-beside-skip',
      'f3d-js-tap-test-beside-skip',
      'f3d-js-t-test-beside-skip',
      'f3d-js-qunit-test-beside-skip',
      'f3d-js-shared-suite-helper-beside-skip',
      'f3d-js-jsx-before-live-test',
      'f3d-js-postfix-increment-before-live-test',
      'f3d-js-jsx-hides-whole-live-test',
      'f3d-js-postfix-increment-hides-whole-live-test',
    ]) {
      expectSameAsV17(name);
    }
  });

  it('F3-e: a TestCase with a runTest makes no claim', () => {
    for (const name of ['f3e-py-runtest-beside-skipped-method', 'f3e-py-runtest-only-class-beside-skipped-class']) {
      expectSameAsV17(name);
    }
  });

  it('F3-e control: the same class with its live method named run_check, which no runner collects, is still hollow', () => {
    const v27 = criterion('f3e-control-helper-method-not-runtest', V27, 'A1');
    expect(share(v27)).toBe(0);
    expect(perTestNotes(v27).map(({ summary }) => summary)).toEqual([
      'Every test in tests/test_cache.py is skipped unconditionally (@unittest.skip), so the file cannot fail.',
    ]);
  });

  it('F3-f: a commented-out skip, a skip in a string or docstring, a member-registered test and a helper call read as v17 reads them', () => {
    for (const name of [
      'f3f-py-commented-out-skip',
      'f3f-py-skip-in-docstring-and-string',
      'f3f-py-member-registered-test',
      'f3f-py-helper-call',
      'f3f-js-commented-out-skip',
      'f3f-js-skip-in-string',
      'f3d-js-deno-test-beside-skip',
      'f3d-js-shared-suite-helper-beside-skip',
    ]) {
      expectSameAsV17(name);
    }
  });

  it('F2 change fixtures keep their claims, and so does an all-skipped file ending in a __main__ guard', () => {
    for (const name of [
      'f3f-py-main-guard-keeps-claim',
      'f2-py-pytest-mark-skip-every-test',
      'f2-py-unittest-skip-every-method',
      'f2-py-skip-on-enclosing-class',
      'f2-py-skip-held-in-module-name',
      'f2-py-skipif-literal-true',
      'f2-js-it-skip-every-test',
      'f2-js-xit-xtest-every-test',
      'f2-js-xdescribe-contains-every-test',
    ]) {
      expect(share(criterion(name, V27, 'A1')), name).toBe(0);
    }
  });
});

describe('C1, C2 (the #610 review residuals) — the Python per-test skip reader makes no claim beside a decorator or load_tests that may add tests (v27)', () => {
  const perTestNotes = (score: WitanCriterionScore) =>
    score.findings.filter(({ summary }) => summary.startsWith('Every test in '));
  const share = (score: WitanCriterionScore): number | undefined => {
    const found = score.metrics.find((metric) => metric.name === 'non_hollow_test_share');
    return found?.max ? found.value / found.max : undefined;
  };

  it.each([
    ['C1', 'c1-py-register-test-decorator-on-helper'],
    ['C1', 'c1-py-add-contract-tests-class-decorator'],
    ['C1', 'c1-py-add-contract-tests-called-class-decorator'],
    ['C2', 'c2-py-load-tests'],
  ])('%s: %s makes no claim: v27 equals v17', (_item, name) => {
    const v17 = criterion(name, V17, 'A1');
    const v27 = criterion(name, V27, 'A1');
    expect(perTestNotes(v27)).toEqual([]);
    expect(share(v27)).toBe(share(v17));
    expect(v27.status).toBe(v17.status);
    expect(v27.score).toBe(v17.score);
  });

  it('controls keep the claim: only skip decorators, parametrize beside a skip, and a decorator or load_tests named only in a comment or string', () => {
    for (const [name, skip] of [
      ['c1-control-only-skip-decorators', '@pytest.mark.skip, @pytest.mark.skipif(True), @unittest.skip'],
      ['c1-control-parametrize-beside-skip', '@pytest.mark.skip'],
      ['c1-control-decorator-in-comment-and-string', '@unittest.skip'],
      ['c2-control-load-tests-in-comment-and-string', '@unittest.skip'],
    ] as const) {
      const v27 = criterion(name, V27, 'A1');
      expect(share(v27), name).toBe(0);
      expect(perTestNotes(v27).map(({ summary }) => summary), name).toEqual([
        `Every test in tests/test_cache.py is skipped unconditionally (${skip}), so the file cannot fail.`,
      ]);
    }
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

  // Pin added 2026-10-27, green on main: one pointer among readable tests is enough. v27 does not
  // score the readable file alone, and lists no test-file evidence, pointer or not.
  it('v27: one test file of two as a pointer still abstains A1, with no test-file evidence', () => {
    const name = 'a1-js-suite-one-test-file-lfs-pointer';
    expect(report(name, V17).contentReadSummary?.byReason.lfsPointer).toBe(1);
    expect(report(name, V27).contentReadSummary?.byReason.lfsPointer).toBe(1);
    const v17 = criterion(name, V17, 'A1');
    expect(v17.evidence.find(({ path }) => path === 'test/lite.js')?.label).toContain('Git LFS pointer');
    const a1 = criterion(name, V27, 'A1');
    expect(a1.status).toBe('insufficient_data');
    expect(a1.score).toBe(0);
    expect(a1.evidence.filter(({ kind }) => kind === 'test_run')).toEqual([]);
    expect(report(name, V27).contentReadSummary?.affectedCriteria).toEqual(['A1']);
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

  // Operator decision 2026-10-26, revised 2026-10-27: a shallow clone must not lower the history
  // score, and B2 keeps the evidence it reads from the checked-out files. v17 scored B2 warning on the
  // one visible commit where the full clone scores it verified; #603 made it abstain out of the
  // composite; it now withholds only pr_merge_ratio and scores pr_trace_primitives, 2 as on the full
  // clone. Its status is warning from the score bands, since v17's calibrated verified reads the
  // withheld ratio (shallow-history-ratio-withheld-442.test.ts). A2 still scores what it read.
  it('v17: A2 scores the truncated history, B2 withholds only its ratio, behind a display-only disclosure', () => {
    expect(criterion(shallow, V17, 'A2').status).toBe('verified');
    expect(criterion('history-full-clone', V17, 'B2').status).toBe('verified');
    expect(criterion(shallow, V17, 'B2').status).toBe('warning');
    expect(criterion(shallow, V17, 'B2').score).toBe(criterion('history-full-clone', V17, 'B2').score);
    expect(criterion(shallow, V17, 'B2').metrics.map(({ name }) => name)).toEqual(['pr_trace_primitives']);
    expect(criterion(shallow, V17, 'B2').notes).toMatch(/^B2 abstained from the pull-request merge ratio only: /);
    expect(report(shallow, V17).historyLimitations).toEqual([SHALLOW_HISTORY_LIMITATION]);
  });

  // v27 freeze change F1 (operator decision 2026-10-28): until then A2 and B2 both abstained here as
  // read failures kept in the composite at 0, so process_trust fell below v17's. Now B2 is v17's
  // (the ratio withheld, scored on the checked-out files) and A2's abstention leaves the composite.
  it('v27: A2 abstains out of the composite, B2 withholds only its ratio as under v17, and the disclosure says so', () => {
    const a2 = criterion(shallow, V27, 'A2');
    expect(a2.status).toBe('insufficient_data');
    expect(a2.score).toBe(0);
    expect(a2.notes).toMatch(/^A2 abstained: this repository is a shallow clone/);
    expect(criterion(shallow, V27, 'B2')).toEqual(criterion(shallow, V17, 'B2'));
    expect(report(shallow, V27).historyLimitations).toEqual([SHALLOW_HISTORY_V27_ABSTENTION]);
    expect(SHALLOW_HISTORY_V27_ABSTENTION).toContain('left out of the composite rather than counted as 0');
    expect(report(shallow, V27).processTrustScore).toBe(report(shallow, V17).processTrustScore);
    const scoredCodeTrust = report(shallow, V27).criteria.filter(
      ({ category, status }) => category === 'code_trust' && status !== 'not_applicable' && status !== 'insufficient_data',
    );
    expect(report(shallow, V27).codeTrustScore).toBe(
      Math.round((scoredCodeTrust.reduce((sum, { score }) => sum + score, 0) / scoredCodeTrust.length) * 10) / 10,
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

  // #556 changed what this sentence must say: on a shallow clone A2 now abstains where it would
  // otherwise be not applicable (that decision rests on its history scans), so the sentence may no
  // longer say a not-applicable criterion stays not applicable. The behaviour is pinned in
  // shallow-a2-applicability-556.test.ts.
  it('#442, #556: the v27 shallow-clone sentence says where A2 and B2 abstain, including A2 not applicable', () => {
    expect(SHALLOW_HISTORY_V27_ABSTENTION).toContain(
      'including where it would otherwise be marked not applicable',
    );
    expect(SHALLOW_HISTORY_V27_ABSTENTION).toContain('B2, where it would be scored');
    expect(SHALLOW_HISTORY_V27_ABSTENTION).not.toContain('stays not applicable');
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

  // Changed 2026-10-26 (#517 follow-up): the workflows here that publish with no pull-request
  // trigger are set aside as publishing (SET_ASIDE_AS_PUBLISHING); a publish word only in a
  // comment and a dry run are not publish steps and still match v17.
  it('#517: a workflow that runs anything besides setup, packaging and a publish is never called publish-only', () => {
    for (const name of [
      'review5-b3-bun-test-then-publish',
      'review5-b3-pnpm-lint-typecheck-build-then-publish',
      'review5-b3-cargo-build-release',
      'review5-b3-publish-word-only-in-comment',
      'review5-b3-docs-build-publish-word-in-comment',
      'review5-b3-npm-publish-dry-run',
    ]) {
      expectPublishOnlyRefused(name);
    }
  });

  it('#517: a cargo build in a workflow that also publishes with no pull-request trigger no longer earns B3 its build category under v27', () => {
    // Changed 2026-10-26 (#517 follow-up): this was 1, from the release workflow's cargo build.
    const b3 = criterion('review5-b3-cargo-build-release', V27, 'B3');
    const depth = b3.metrics.find(({ name }) => name === 'ci_script_depth');
    expect(depth?.presentation?.components?.find(({ label }) => label === 'repository CI command: build')?.count).toBe(0);
    const v17Depth = criterion('review5-b3-cargo-build-release', V17, 'B3').metrics.find(({ name }) => name === 'ci_script_depth');
    expect(v17Depth?.presentation?.components?.find(({ label }) => label === 'repository CI command: build')?.count).toBe(1);
  });

  it('#517: npx semantic-release is not a publish the publish-only reader admits (it runs configured plugins)', () => {
    // Changed by the re-run of review pass 1 on #553: this fixture was a publish-only corner.
    // Changed 2026-10-26 (#517 follow-up): it is now set aside as a publishing workflow.
    expectPublishOnlyRefused('review5-b3-semantic-release-after-setup');
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
      expectPublishOnlyRefused(name);
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
      expectPublishOnlyRefused(name);
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
      expectPublishOnlyRefused(name);
    }
  });

  it('#517: changesets without a publish input stays counted; a workflow that installs before it publishes is now set aside', () => {
    // Changed 2026-10-26 (#517 follow-up): both were recorded recall reductions. changesets/action
    // publishes only with a publish input, so it is not a publish step and stays counted.
    for (const name of ['review6-b3-changesets-without-command-inputs', 'review5-b3-semantic-release-after-setup']) {
      expectPublishOnlyRefused(name);
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
    // Changed 2026-10-26 (#517 follow-up): review11's twine upload runs on ubuntu-latest, so B3 now
    // sets it aside as a publishing workflow; it is still never read as publish-only or print-only.
    // Changed 2026-10-27 (#517 second follow-up): review10's two upload-only workflows publish
    // through an action, which is read on any runner, so B3 sets them aside too.
    const ids = SET_ASIDE_AS_PUBLISHING.has(name) ? ['B2'] : ['B2', 'B3'];
    for (const id of ids) {
      expect(criterion(name, V27, id), `${name} ${id}`).toEqual(criterion(name, V17, id));
      expect(criterion(name, V27, id).disclosures, `${name} ${id}`).toBeUndefined();
    }
    expectPublishOnlyRefused(name);
    expect((criterion(name, V27, 'B3').disclosures ?? []).join(' ')).not.toContain('did not see run a check');
    expect(v17Disclosure(name).join(' ')).not.toContain('only prints text');
  });

  it('control: an inert echo on ubuntu-latest is still print-only under every rubric', () => {
    expect(v17Disclosure('review10-print-only-ubuntu-inert-text').join(' ')).toContain('test.yml only prints text');
    expect(metricValue(criterion('review10-print-only-ubuntu-inert-text', V27, 'B3'), 'default_branch_ci_depth')).toBe(0);
  });
});

// Review of #562: the glossary states the readers' conditions, so a PR-triggered upload-only
// workflow, which the publish-only reader never claims, is counted and the glossary says why.
// Round 3 of the review of #562: each shape makes an admitted publisher run repository code, so
// the publish-only reader must not claim it, and B2 and B3 keep v17's credit.
describe('publish-only admits no glob in flag position, no unknown flag, no unlisted variable, no Cargo configuration', () => {
  it.each([
    'review12-pnpm-publish-glob-flag',
    'review12-yarn-publish-glob-flag',
    'review12-npm-publish-unknown-flag',
    'review12-cargo-publish-glob-flag',
    'review12-cargo-credential-provider-variable',
    'review12-twine-pythonuserbase-variable',
    'review12-cargo-home-step-env',
    'review12-gh-release-xdg-config-step-env',
    'review12-cargo-committed-config-credential-provider',
    'review12-twine-upload-flag-glob',
    'review13-poetry-project-plugin-pth',
    'review13-poetry-requires-plugins',
    'review13-uv-toml-committed',
    'review13-uv-pyproject-table',
    'review13-rust-toolchain-toml',
    'review14-uv-index-array-table',
    'review14-uv-under-tool-table-dotted',
    'review14-uv-root-dotted-key',
    'review14-uv-inline-table',
    'review14-uv-quoted-key',
    'review14-uv-escaped-key',
    'review14-poetry-quoted-requires-plugins',
    'review15-uv-hex-escaped-key',
  ])('%s is not read as publish-only under v27', (name) => {
    // Changed 2026-10-26 (#517 follow-up): each publishes on a push with no pull-request trigger,
    // so B3 now sets it aside as a publishing workflow; B2 keeps v17's credit.
    expect(criterion(name, V27, 'B2'), name).toEqual(criterion(name, V17, 'B2'));
    expectPublishOnlyRefused(name);
  });

  it('controls: upload-only shapes with known flags, a file glob after a directory and credential variables stay publish-only', () => {
    for (const name of ['review8-b3-twine-upload-only', 'review8-b3-npm-publish-without-install', 'review7-b3-cargo-publish-no-verify', 'review8-b3-gh-release-upload', 'review13-poetry-publish-control', 'review13-uv-publish-control']) {
      expect(criterion(name, V27, 'B3').notes, name).toContain('only publishes, releases or deploys');
    }
  });
});

describe('the v27 glossary sentences state the conditions the readers apply', () => {
  it('a pull-request-triggered upload-only workflow is counted, and the glossary names that condition', () => {
    const name = 'review11-upload-only-with-pull-request-trigger';
    for (const id of ['B2', 'B3']) expect(criterion(name, V27, id), id).toEqual(criterion(name, V17, id));
    for (const term of ['PR trace basic checks', 'PR-gate CI workflow count (automated build/test pipeline)']) {
      const entry = CERTIFICATE_GLOSSARY.find((candidate) => candidate.term === term);
      expect(entry?.definition, term).toContain('for a workflow with no pull-request trigger, as only uploading an already-built artifact');
      expect(entry?.definition, term).toContain('only when the runs-on value of every job names a documented GitHub-hosted Ubuntu or macOS runner label');
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

// #517 (2026-10-26): B3 alone also sets aside a workflow that publishes, releases or deploys with no
// pull-request trigger, whatever else it runs. B2 and B3 still agree on every workflow not shown to
// run a check; B3's publishing sentence comes last in its note, after the sentences B2 shares, and
// its count is not part of the "not shown to run a check" condition.
describe('B2 and B3 never disagree about which workflows are credited (v27)', () => {
  for (const fixture of FALSE_ASSURANCE_FIXTURES) {
    it(fixture.name, () => {
      const b2 = criterion(fixture.name, V27, 'B2');
      const b3 = criterion(fixture.name, V27, 'B3');
      // Skipped where either abstains: an abstaining criterion carries no count to compare.
      if (b2.status === 'insufficient_data' || b3.status === 'insufficient_data') return;
      // F1: on a shallow clone B2's note starts with #604's withheld-ratio sentences, which B3
      // does not share; the uncredited-workflow sentences, if any, follow them.
      const shared =
        b2.notes
          ?.replace(/^B2 abstained from the pull-request merge ratio only: .*?set fetch-depth: 0\)\.\s*/, '')
          .replaceAll('a PR-trace CI workflow', 'CI verification') ?? '';
      const b3Notes = b3.notes ?? '';
      expect(b3Notes.startsWith(shared)).toBe(true);
      const publishingSentence = b3Notes.slice(shared.length).trim();
      if (publishingSentence !== '') {
        expect(publishingSentence).toMatch(
          /^\d+ workflows? that publish(?:es)?, releases? or deploys? with no pull-request trigger /,
        );
      }
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
        // Same summary, same evidence pointer and still critical: a downgrade to warning, or the
        // finding re-cited to another file, is a loss (#558 reviews).
        const key = (finding: (typeof own)[number]): string => `${finding.summary} @ ${evidenceIdentity(finding)}`;
        expect(
          v27?.findings.filter(({ severity }) => severity === 'critical').map(key),
          v17.id,
        ).toEqual(expect.arrayContaining(own.map(key)));
      }
    });
  }
});

// The property that admits v27: every movement against v17 removes an assurance. A criterion may
// lose score, become more severe, or abstain as a read failure kept in the composite at 0; a
// composite may fall. Nothing may rise, nothing v17 left unscored may be scored, and no scored
// composite may become null (v27-no-rise.ts; #531 items a and b). The same property runs over
// generated shapes in false-assurance-v27-generated-1.test.ts to -6.test.ts
// (v27-no-rise-generated-suite.ts; #531 item c). On a shallow fixture (v27 freeze change F1) A2
// and B2 are compared with v27's report of the same commits' full clone instead of with v17.
describe('no score, status or composite rises from v17 to v27 on any fixture', () => {
  for (const fixture of FALSE_ASSURANCE_FIXTURES) {
    it(fixture.name, () => {
      expect(
        checkNoRise(report(fixture.name, V17), report(fixture.name, V27), fullCloneReport(fixture.name)).problems,
      ).toEqual([]);
      expect(lostFindings(report(fixture.name, V17), report(fixture.name, V27))).toEqual([]);
    });
  }

  // Changed by the v27 freeze change F1 (operator decision 2026-10-28). Until then both shallow-
  // clone abstentions were read failures v27 introduced against v17, kept in the denominator at 0
  // ({ A2, shallow-history, kept } and { B2, shallow-history, kept }). Now B2 withholds only its
  // ratio, exactly as v17 does on this clone, and A2's abstention is left out of the composite: no
  // abstention is introduced against v17, and both history criteria pass the full-clone comparison.
  it('F1: on the shallow clone v27 introduces no abstention against v17, and A2 and B2 follow the full-clone rule', () => {
    const result = checkNoRise(
      report('history-shallow-clone', V17),
      report('history-shallow-clone', V27),
      fullCloneReport('history-shallow-clone'),
    );
    expect(result.problems).toEqual([]);
    expect(result.introducedAbstentions).toEqual([]);
    expect(criterion('history-shallow-clone', V27, 'B2')).toEqual(criterion('history-shallow-clone', V17, 'B2'));
    expect(criterion('history-shallow-clone', V27, 'A2').status).toBe('insufficient_data');
  });

  it('F1: a shallow report compared without its full clone is a problem, not a pass', () => {
    expect(checkNoRise(report('history-shallow-clone', V17), report('history-shallow-clone', V27)).problems).toEqual([
      "v27's report is of a shallow clone and no full clone of the same commit was given",
    ]);
  });

  it('#519: the LFS pointer abstention is a read failure kept in the denominator at 0', () => {
    const result = checkNoRise(
      report('a1-js-suite-as-lfs-pointers', V17),
      report('a1-js-suite-as-lfs-pointers', V27),
    );
    expect(result.introducedAbstentions).toEqual([{ id: 'A1', kind: 'content-read', denominator: 'kept' }]);
  });
});
