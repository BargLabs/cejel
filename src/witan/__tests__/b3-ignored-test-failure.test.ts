import { createHash } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { buildPlainSummary } from '../../plain-summary.js';
import { buildWitanCliSummary } from '../../summary.js';
import { renderTerminalCertificate } from '../../terminal.js';
import { WITAN_B3_IGNORED_TEST_FAILURE_PREFIX } from '../abstention.js';
import { buildRelyingPartySummary } from '../certificate-presentation.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { b3IgnoredTestFailureDisclosure, findIgnoredTestFailures } from '../repo-signals.js';
import { projectWitanScoringSurface, WITAN_PROJECTED_RUBRIC_PLACEHOLDER } from '../rubric-fingerprint.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V27,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
} from '../rubric-version.js';
import { buildDisclosureGapFixture, removeDisclosureGapFixtures } from './fixtures/disclosure-gap-fixtures.js';
import { IGNORED_TEST_FAILURE_FIXTURES, ignoredTestFailureFixture } from './fixtures/ignored-test-failure-fixtures.js';

// B3, every rubric, presentation only: a counted PR-gate workflow in which a failing test command
// is ignored (continue-on-error: true on its step, or the command's exit status discarded
// by `|| true`, `|| :`, `|| exit 0` and the like) is named in one of B3's disclosures. The PR-gate
// count, B3's score, its status and every other scoring field stay as main left them: each
// fixture's scoring surface under every selectable rubric is pinned below to the value origin/main
// fe3b07074 produced before this change.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;

afterAll(() => {
  removeDisclosureGapFixtures();
});

const repos = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function report(name: string, rubricVersion: string = V17): WitanReport {
  const key = `${name}@${rubricVersion}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(name);
  if (!repo) {
    repo = buildDisclosureGapFixture(ignoredTestFailureFixture(name));
    repos.set(name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'ignored-test-failure-fixture',
    productDisplayName: 'Ignored-test-failure fixture',
    generatedAt: '2026-11-18T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, scored);
  return scored;
}

function b3(name: string, rubricVersion: string = V17): WitanCriterionScore {
  const found = report(name, rubricVersion).criteria.find((entry) => entry.id === 'B3');
  if (!found) throw new Error(`${name}@${rubricVersion} has no B3`);
  return found;
}

function ignoredDisclosure(name: string, rubricVersion: string = V17): string | undefined {
  return b3(name, rubricVersion).disclosures?.find((text) => text.startsWith(WITAN_B3_IGNORED_TEST_FAILURE_PREFIX));
}

const TAIL_ONE = ' Cejel did not check whether another step fails the run. The PR-gate CI workflow count still includes it.';
const TAIL_MANY = ' Cejel did not check whether another step fails the run. The PR-gate CI workflow count still includes them.';

describe('the ignored-test-failure reader', () => {
  const wf = (steps: string, jobKeys = '', runsOn = 'ubuntu-latest') =>
    `on:\n  pull_request:\njobs:\n  test:\n    runs-on: ${runsOn}\n${jobKeys}    steps:\n      - uses: actions/checkout@v4\n${steps}`;

  it.each([
    ['|| true', '      - run: pnpm test || true\n', 8, '|| true'],
    ['|| :', '      - run: pytest -q || :\n', 8, '|| :'],
    ['|| exit 0', '      - run: go test ./... || exit 0\n', 8, '|| exit 0'],
    ['|| /bin/true', '      - run: cargo test || /bin/true\n', 8, '|| /bin/true'],
    ['|| echo', '      - run: npm test || echo "tests failed"\n', 8, '|| echo'],
    ['a pipe before the fallback', '      - run: pnpm test | tee test.log || true\n', 8, '|| true'],
    ['&& before the fallback', '      - run: pnpm test && pnpm run build || true\n', 8, '|| true'],
    ['a continued line', '      - run: |\n          pnpm test \\\n            --reporter dot || true\n', 9, '|| true'],
    ['an env assignment first', '      - run: CI=1 pnpm test || true\n', 8, '|| true'],
    ['behind npx', '      - run: npx jest --ci || true\n', 8, '|| true'],
    ['behind poetry run', '      - run: poetry run pytest -q || true\n', 8, '|| true'],
    ['behind python -m', '      - run: python -m pytest || true\n', 8, '|| true'],
    ['a runner named by its path', '      - run: ./node_modules/.bin/jest || true\n', 8, '|| true'],
    ['a binary run through pnpm', '      - run: pnpm vitest run || true\n', 8, '|| true'],
    ['a test script with a suffix', '      - run: npm run test:unit || true\n', 8, '|| true'],
    ['later lines only print', '      - run: |\n          pytest || true\n          echo "done" >> "$GITHUB_STEP_SUMMARY"\n', 9, '|| true'],
  ])('names a test command whose exit status is discarded: %s', (_label, steps, line, how) => {
    expect(findIgnoredTestFailures(wf(steps))).toEqual([{ line, how }]);
  });

  it('names continue-on-error: true on the step at the test command line, and not on the job', () => {
    expect(findIgnoredTestFailures(wf('      - continue-on-error: true\n        run: pnpm test\n'))).toEqual([
      { line: 9, how: 'continue-on-error: true on its step' },
    ]);
    // On a job, GitHub still marks the job failed while the run passes, so whether a failing test
    // leaves a required check passing depends on which check is required: not named.
    expect(findIgnoredTestFailures(wf('      - run: pnpm test\n', '    continue-on-error: true\n'))).toEqual([]);
    // A fallback in that job is still named.
    expect(findIgnoredTestFailures(wf('      - run: pnpm test || true\n', '    continue-on-error: true\n'))).toEqual([
      { line: 9, how: '|| true' },
    ]);
  });

  // Review of #741: each of these made the reader state that a failing test is ignored when the
  // shape does not show it. A false sentence here is worse than a missed one.
  it.each([
    ['an install that names a runner', '      - run: pip install pytest pytest-cov || true\n'],
    ['a directory named after a runner', '      - run: mkdir -p jest-results || true\n'],
    ['a file named after a runner', '      - run: rm -f jest.config.js || true\n'],
    ['a runner name inside another word', '      - run: pytest-cov-report || true\n'],
    ['a later line greps the result', '      - run: |\n          pytest | tee out.log || true\n          ! grep -q FAILED out.log\n'],
    ['a later line re-runs the tests', '      - run: |\n          pytest || true\n          pytest --lf\n'],
    ['a later line fails', '      - run: |\n          npm test || echo failed\n          false\n'],
    ['the line is heredoc data', "      - run: |\n          cat <<EOF > run.sh\n          pytest || true\n          EOF\n          bash run.sh\n"],
    ['a folded block joins the next line', '      - run: >-\n          pytest || true\n          && false\n'],
    ['continue-on-error on a setup step', '      - continue-on-error: true\n        run: pip install pytest-xdist\n      - run: pytest\n'],
    ['continue-on-error under env', '      - env:\n          continue-on-error: true\n        run: pnpm test\n'],
    ['a run: under with:', '      - uses: some/action@v1\n        with:\n          run: pnpm test || true\n'],
  ])('names nothing the shape does not show: %s', (_label, steps) => {
    expect(findIgnoredTestFailures(wf(steps))).toEqual([]);
  });

  it('labels a job-level continue-on-error by the job, never by a key nested in the step', () => {
    // The job's key is not named, and the nested one under env: is not the step's.
    expect(
      findIgnoredTestFailures(wf('      - env:\n          continue-on-error: true\n        run: npm test\n', '    continue-on-error: true\n')),
    ).toEqual([]);
  });

  it.each([
    ['no fallback', '      - run: pnpm test\n'],
    ['the fallback fails', '      - run: pnpm test || exit 1\n'],
    ['a subshell that fails', '      - run: pnpm test || (echo "failed"; exit 1)\n'],
    ['the fallback is another check', '      - run: pnpm test || pnpm test --retry\n'],
    ['the fallback comes before the test', '      - run: pnpm run lint || true && pnpm test\n'],
    ['a ; before the fallback', '      - run: pnpm test; pnpm run lint || true\n'],
    ['the shape is quoted', '      - run: echo "pnpm test || true"\n'],
    ['the test word is printed', '      - run: echo running pnpm test || true\n'],
    ['the shape is a comment', '      - run: |\n          # pnpm test || true\n          pnpm test\n'],
    ['a later line can exit non-zero', '      - run: |\n          pnpm test || true\n          exit "$status"\n'],
    ['a later line reads $?', '      - run: |\n          pnpm test || true\n          echo $?\n'],
    ['continue-on-error: false', '      - continue-on-error: false\n        run: pnpm test\n'],
    ['continue-on-error by expression', "      - continue-on-error: ${{ matrix.experimental }}\n        run: pnpm test\n"],
    ['a lint command', '      - run: pnpm run lint || true\n'],
  ])('names nothing: %s', (_label, steps) => {
    expect(findIgnoredTestFailures(wf(steps))).toEqual([]);
  });

  it('does not read || on a runner or step whose shell is not bash or sh', () => {
    expect(findIgnoredTestFailures(wf('      - run: pnpm test || true\n', '', 'windows-latest'))).toEqual([]);
    expect(findIgnoredTestFailures(wf('      - shell: pwsh\n        run: pnpm test || true\n'))).toEqual([]);
    // continue-on-error does not depend on the shell.
    expect(
      findIgnoredTestFailures(wf('      - continue-on-error: true\n        run: pnpm test\n', '', 'windows-latest')),
    ).toEqual([{ line: 9, how: 'continue-on-error: true on its step' }]);
  });

  it('names one line per step: the first test command it can name', () => {
    expect(
      findIgnoredTestFailures(wf('      - continue-on-error: true\n        run: |\n          pnpm test || true\n          pnpm test\n')),
    ).toEqual([{ line: 10, how: 'continue-on-error: true on its step' }]);
  });
});

describe('the disclosure sentence', () => {
  it('names each workflow with its first line, and fits the schema budget by naming fewer', () => {
    const one = b3IgnoredTestFailureDisclosure([{ file: '.github/workflows/test.yml', line: 12, how: '|| true' }]);
    expect(one).toBe(`${WITAN_B3_IGNORED_TEST_FAILURE_PREFIX}.github/workflows/test.yml line 12 (|| true).${TAIL_ONE}`);
    const many = Array.from({ length: 9 }, (_, index) => ({
      file: `.github/workflows/${'w'.repeat(90)}-${index}.yml`,
      line: index + 1,
      how: 'continue-on-error: true on its step',
    }));
    const fitted = b3IgnoredTestFailureDisclosure(many, 1000);
    expect(fitted.length).toBeLessThanOrEqual(1000);
    expect(fitted.startsWith(WITAN_B3_IGNORED_TEST_FAILURE_PREFIX)).toBe(true);
    expect(fitted).toMatch(/ and \d+ more\./);
    expect(b3IgnoredTestFailureDisclosure([])).toBe('');
  });
});

describe('B3: counted workflows in which a failing test command is ignored are named', () => {
  it.each([
    ['itf-step-continue-on-error', '.github/workflows/test.yml line 14 (continue-on-error: true on its step)'],
    ['itf-or-true', '.github/workflows/test.yml line 12 (|| true)'],
    ['itf-or-exit-0-in-block', '.github/workflows/ci.yml line 14 (|| exit 0)'],
  ])('%s, under v17 and v27', (name, named) => {
    const sentence = `${WITAN_B3_IGNORED_TEST_FAILURE_PREFIX}${named}.${TAIL_ONE}`;
    for (const rubricVersion of [V17, V27]) {
      expect(ignoredDisclosure(name, rubricVersion), rubricVersion).toBe(sentence);
      expect(buildRelyingPartySummary(report(name, rubricVersion)).notEstablished, rubricVersion).toContain(sentence);
    }
  });

  it('names two workflows in file order, and not the one whose || true follows a lint command', () => {
    expect(ignoredDisclosure('itf-two-workflows')).toBe(
      `${WITAN_B3_IGNORED_TEST_FAILURE_PREFIX}.github/workflows/a-unit.yml line 12 (|| true); .github/workflows/b-e2e.yml line 13 (continue-on-error: true on its step).${TAIL_MANY}`,
    );
  });

  it.each([
    'itf-control-plain',
    'itf-control-continue-on-error-false',
    'itf-control-continue-on-error-expression',
    'itf-control-or-true-on-lint',
    'itf-control-or-exit-1',
    'itf-control-later-line-can-fail',
    'itf-control-not-counted',
    'itf-control-windows-runner',
    'itf-control-quoted',
    'itf-job-continue-on-error',
  ])('names nothing in the control %s, under any selectable rubric', (name) => {
    for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
      expect(ignoredDisclosure(name, rubricVersion), rubricVersion).toBeUndefined();
    }
  });

  it('puts one plain line on the first page and one line under What to check next', () => {
    const plain = buildPlainSummary(report('itf-or-true'));
    const item = plain.notKnown.find((entry) => entry.source.kind === 'disclosure' && entry.area !== undefined && entry.text.includes('failing test'));
    expect(item?.text).toBe(
      'Some workflows counted as automated checks run the tests in a way that can let a failing test leave the check passing.',
    );
    const next = plain.checkNext.find((entry) => entry.for === item?.id);
    expect(next?.key).toBe('disclosure:ignored-test-failure');
    expect(next?.fromTable).toBe(true);
  });

  it('prints in the terminal certificate', () => {
    const scored = report('itf-or-true');
    expect(renderTerminalCertificate(buildWitanCliSummary(scored), scored)).toContain(
      '.github/workflows/test.yml line 12 (|| true)',
    );
  });
});

describe('the disclosure is presentation only', () => {
  // sha256 of JSON.stringify(projectWitanScoringSurface(report)) for each fixture under each
  // selectable rubric, captured with origin/main fe3b07074's scanner before this change, with the
  // options in report() above.
  it('leaves every scoring surface where origin/main left it, under every selectable rubric', () => {
    const moved: string[] = [];
    const surfaces: Record<string, string> = {};
    for (const fixture of IGNORED_TEST_FAILURE_FIXTURES) {
      for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
        const key = `${fixture.name}@${rubricVersion}`;
        const projected = projectWitanScoringSurface(report(fixture.name, rubricVersion));
        const asPinned =
          projected.insufficientSourceReason === null
            ? projected
            : {
                ...projected,
                insufficientSourceReason: projected.insufficientSourceReason
                  .split(WITAN_PROJECTED_RUBRIC_PLACEHOLDER)
                  .join(rubricVersion),
              };
        const surface = createHash('sha256').update(JSON.stringify(asPinned)).digest('hex');
        surfaces[key] = surface;
        if (SCORING_SURFACE_PINS[key] !== surface) moved.push(key);
      }
    }
    if (process.env.CEJEL_PRINT_ITF_PINS === '1') process.stdout.write(`ITF_PINS ${JSON.stringify(surfaces)}\n`);
    expect(moved).toEqual([]);
    expect(Object.keys(SCORING_SURFACE_PINS).length).toBe(
      IGNORED_TEST_FAILURE_FIXTURES.length * WITAN_SELECTABLE_RUBRIC_VERSIONS.length,
    );
  });
});

const SCORING_SURFACE_PINS: Readonly<Record<string, string>> = {
  'itf-step-continue-on-error@witan-rubric-v17-2026-07-24':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-step-continue-on-error@witan-rubric-v18-prospective-2026-07-25':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-step-continue-on-error@witan-rubric-v19-prospective-2026-08-09':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-step-continue-on-error@witan-rubric-v20-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-step-continue-on-error@witan-rubric-v21-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-step-continue-on-error@witan-rubric-v22-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-step-continue-on-error@witan-rubric-v23-prospective-2026-09-06':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-step-continue-on-error@witan-rubric-v24-prospective-2026-09-15':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-step-continue-on-error@witan-rubric-v25-prospective-2026-10-12':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-step-continue-on-error@witan-rubric-v26-prospective-2026-10-14':
    '84ef3117963d1da8327da03bc2c84a54628c7651af6315e375b1cef0428f86be',
  'itf-step-continue-on-error@witan-rubric-v27-prospective-2026-10-19':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-job-continue-on-error@witan-rubric-v17-2026-07-24':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-job-continue-on-error@witan-rubric-v18-prospective-2026-07-25':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-job-continue-on-error@witan-rubric-v19-prospective-2026-08-09':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-job-continue-on-error@witan-rubric-v20-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-job-continue-on-error@witan-rubric-v21-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-job-continue-on-error@witan-rubric-v22-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-job-continue-on-error@witan-rubric-v23-prospective-2026-09-06':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-job-continue-on-error@witan-rubric-v24-prospective-2026-09-15':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-job-continue-on-error@witan-rubric-v25-prospective-2026-10-12':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-job-continue-on-error@witan-rubric-v26-prospective-2026-10-14':
    '84ef3117963d1da8327da03bc2c84a54628c7651af6315e375b1cef0428f86be',
  'itf-job-continue-on-error@witan-rubric-v27-prospective-2026-10-19':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-true@witan-rubric-v17-2026-07-24':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-true@witan-rubric-v18-prospective-2026-07-25':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-true@witan-rubric-v19-prospective-2026-08-09':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-true@witan-rubric-v20-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-true@witan-rubric-v21-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-true@witan-rubric-v22-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-true@witan-rubric-v23-prospective-2026-09-06':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-true@witan-rubric-v24-prospective-2026-09-15':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-true@witan-rubric-v25-prospective-2026-10-12':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-true@witan-rubric-v26-prospective-2026-10-14':
    '84ef3117963d1da8327da03bc2c84a54628c7651af6315e375b1cef0428f86be',
  'itf-or-true@witan-rubric-v27-prospective-2026-10-19':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-exit-0-in-block@witan-rubric-v17-2026-07-24':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-exit-0-in-block@witan-rubric-v18-prospective-2026-07-25':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-exit-0-in-block@witan-rubric-v19-prospective-2026-08-09':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-exit-0-in-block@witan-rubric-v20-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-exit-0-in-block@witan-rubric-v21-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-exit-0-in-block@witan-rubric-v22-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-exit-0-in-block@witan-rubric-v23-prospective-2026-09-06':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-exit-0-in-block@witan-rubric-v24-prospective-2026-09-15':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-exit-0-in-block@witan-rubric-v25-prospective-2026-10-12':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-or-exit-0-in-block@witan-rubric-v26-prospective-2026-10-14':
    '84ef3117963d1da8327da03bc2c84a54628c7651af6315e375b1cef0428f86be',
  'itf-or-exit-0-in-block@witan-rubric-v27-prospective-2026-10-19':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-two-workflows@witan-rubric-v17-2026-07-24':
    '48403b34b28e305ef160594033ba5e06f372c8ca2b2b99bbbf90605952426987',
  'itf-two-workflows@witan-rubric-v18-prospective-2026-07-25':
    '48403b34b28e305ef160594033ba5e06f372c8ca2b2b99bbbf90605952426987',
  'itf-two-workflows@witan-rubric-v19-prospective-2026-08-09':
    '48403b34b28e305ef160594033ba5e06f372c8ca2b2b99bbbf90605952426987',
  'itf-two-workflows@witan-rubric-v20-prospective-2026-08-10':
    '48403b34b28e305ef160594033ba5e06f372c8ca2b2b99bbbf90605952426987',
  'itf-two-workflows@witan-rubric-v21-prospective-2026-08-10':
    '48403b34b28e305ef160594033ba5e06f372c8ca2b2b99bbbf90605952426987',
  'itf-two-workflows@witan-rubric-v22-prospective-2026-08-10':
    '48403b34b28e305ef160594033ba5e06f372c8ca2b2b99bbbf90605952426987',
  'itf-two-workflows@witan-rubric-v23-prospective-2026-09-06':
    '48403b34b28e305ef160594033ba5e06f372c8ca2b2b99bbbf90605952426987',
  'itf-two-workflows@witan-rubric-v24-prospective-2026-09-15':
    '48403b34b28e305ef160594033ba5e06f372c8ca2b2b99bbbf90605952426987',
  'itf-two-workflows@witan-rubric-v25-prospective-2026-10-12':
    '48403b34b28e305ef160594033ba5e06f372c8ca2b2b99bbbf90605952426987',
  'itf-two-workflows@witan-rubric-v26-prospective-2026-10-14':
    '4b1f5dcd22cf7f69eb614c20b315d78093938dbf4a95b8c2c36d76dd4cbab040',
  'itf-two-workflows@witan-rubric-v27-prospective-2026-10-19':
    '48403b34b28e305ef160594033ba5e06f372c8ca2b2b99bbbf90605952426987',
  'itf-control-plain@witan-rubric-v17-2026-07-24':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-plain@witan-rubric-v18-prospective-2026-07-25':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-plain@witan-rubric-v19-prospective-2026-08-09':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-plain@witan-rubric-v20-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-plain@witan-rubric-v21-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-plain@witan-rubric-v22-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-plain@witan-rubric-v23-prospective-2026-09-06':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-plain@witan-rubric-v24-prospective-2026-09-15':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-plain@witan-rubric-v25-prospective-2026-10-12':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-plain@witan-rubric-v26-prospective-2026-10-14':
    '84ef3117963d1da8327da03bc2c84a54628c7651af6315e375b1cef0428f86be',
  'itf-control-plain@witan-rubric-v27-prospective-2026-10-19':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-false@witan-rubric-v17-2026-07-24':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-false@witan-rubric-v18-prospective-2026-07-25':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-false@witan-rubric-v19-prospective-2026-08-09':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-false@witan-rubric-v20-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-false@witan-rubric-v21-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-false@witan-rubric-v22-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-false@witan-rubric-v23-prospective-2026-09-06':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-false@witan-rubric-v24-prospective-2026-09-15':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-false@witan-rubric-v25-prospective-2026-10-12':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-false@witan-rubric-v26-prospective-2026-10-14':
    '84ef3117963d1da8327da03bc2c84a54628c7651af6315e375b1cef0428f86be',
  'itf-control-continue-on-error-false@witan-rubric-v27-prospective-2026-10-19':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-expression@witan-rubric-v17-2026-07-24':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-expression@witan-rubric-v18-prospective-2026-07-25':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-expression@witan-rubric-v19-prospective-2026-08-09':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-expression@witan-rubric-v20-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-expression@witan-rubric-v21-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-expression@witan-rubric-v22-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-expression@witan-rubric-v23-prospective-2026-09-06':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-expression@witan-rubric-v24-prospective-2026-09-15':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-expression@witan-rubric-v25-prospective-2026-10-12':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-continue-on-error-expression@witan-rubric-v26-prospective-2026-10-14':
    '84ef3117963d1da8327da03bc2c84a54628c7651af6315e375b1cef0428f86be',
  'itf-control-continue-on-error-expression@witan-rubric-v27-prospective-2026-10-19':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-true-on-lint@witan-rubric-v17-2026-07-24':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-true-on-lint@witan-rubric-v18-prospective-2026-07-25':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-true-on-lint@witan-rubric-v19-prospective-2026-08-09':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-true-on-lint@witan-rubric-v20-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-true-on-lint@witan-rubric-v21-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-true-on-lint@witan-rubric-v22-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-true-on-lint@witan-rubric-v23-prospective-2026-09-06':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-true-on-lint@witan-rubric-v24-prospective-2026-09-15':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-true-on-lint@witan-rubric-v25-prospective-2026-10-12':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-true-on-lint@witan-rubric-v26-prospective-2026-10-14':
    '84ef3117963d1da8327da03bc2c84a54628c7651af6315e375b1cef0428f86be',
  'itf-control-or-true-on-lint@witan-rubric-v27-prospective-2026-10-19':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-exit-1@witan-rubric-v17-2026-07-24':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-exit-1@witan-rubric-v18-prospective-2026-07-25':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-exit-1@witan-rubric-v19-prospective-2026-08-09':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-exit-1@witan-rubric-v20-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-exit-1@witan-rubric-v21-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-exit-1@witan-rubric-v22-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-exit-1@witan-rubric-v23-prospective-2026-09-06':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-exit-1@witan-rubric-v24-prospective-2026-09-15':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-exit-1@witan-rubric-v25-prospective-2026-10-12':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-or-exit-1@witan-rubric-v26-prospective-2026-10-14':
    '84ef3117963d1da8327da03bc2c84a54628c7651af6315e375b1cef0428f86be',
  'itf-control-or-exit-1@witan-rubric-v27-prospective-2026-10-19':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-later-line-can-fail@witan-rubric-v17-2026-07-24':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-later-line-can-fail@witan-rubric-v18-prospective-2026-07-25':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-later-line-can-fail@witan-rubric-v19-prospective-2026-08-09':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-later-line-can-fail@witan-rubric-v20-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-later-line-can-fail@witan-rubric-v21-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-later-line-can-fail@witan-rubric-v22-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-later-line-can-fail@witan-rubric-v23-prospective-2026-09-06':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-later-line-can-fail@witan-rubric-v24-prospective-2026-09-15':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-later-line-can-fail@witan-rubric-v25-prospective-2026-10-12':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-later-line-can-fail@witan-rubric-v26-prospective-2026-10-14':
    '84ef3117963d1da8327da03bc2c84a54628c7651af6315e375b1cef0428f86be',
  'itf-control-later-line-can-fail@witan-rubric-v27-prospective-2026-10-19':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-not-counted@witan-rubric-v17-2026-07-24':
    '78e4cbd4ea9497415e41559de8b14a66adae865c9588849dd3170b88c4f020d3',
  'itf-control-not-counted@witan-rubric-v18-prospective-2026-07-25':
    '78e4cbd4ea9497415e41559de8b14a66adae865c9588849dd3170b88c4f020d3',
  'itf-control-not-counted@witan-rubric-v19-prospective-2026-08-09':
    '78e4cbd4ea9497415e41559de8b14a66adae865c9588849dd3170b88c4f020d3',
  'itf-control-not-counted@witan-rubric-v20-prospective-2026-08-10':
    '78e4cbd4ea9497415e41559de8b14a66adae865c9588849dd3170b88c4f020d3',
  'itf-control-not-counted@witan-rubric-v21-prospective-2026-08-10':
    '78e4cbd4ea9497415e41559de8b14a66adae865c9588849dd3170b88c4f020d3',
  'itf-control-not-counted@witan-rubric-v22-prospective-2026-08-10':
    '78e4cbd4ea9497415e41559de8b14a66adae865c9588849dd3170b88c4f020d3',
  'itf-control-not-counted@witan-rubric-v23-prospective-2026-09-06':
    '78e4cbd4ea9497415e41559de8b14a66adae865c9588849dd3170b88c4f020d3',
  'itf-control-not-counted@witan-rubric-v24-prospective-2026-09-15':
    '78e4cbd4ea9497415e41559de8b14a66adae865c9588849dd3170b88c4f020d3',
  'itf-control-not-counted@witan-rubric-v25-prospective-2026-10-12':
    '78e4cbd4ea9497415e41559de8b14a66adae865c9588849dd3170b88c4f020d3',
  'itf-control-not-counted@witan-rubric-v26-prospective-2026-10-14':
    '2b33e63f1bcc9dd8e25936bbc25ed686a9c98e3f5f0bf3d2abde39264e00b10d',
  'itf-control-not-counted@witan-rubric-v27-prospective-2026-10-19':
    '78e4cbd4ea9497415e41559de8b14a66adae865c9588849dd3170b88c4f020d3',
  'itf-control-windows-runner@witan-rubric-v17-2026-07-24':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-windows-runner@witan-rubric-v18-prospective-2026-07-25':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-windows-runner@witan-rubric-v19-prospective-2026-08-09':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-windows-runner@witan-rubric-v20-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-windows-runner@witan-rubric-v21-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-windows-runner@witan-rubric-v22-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-windows-runner@witan-rubric-v23-prospective-2026-09-06':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-windows-runner@witan-rubric-v24-prospective-2026-09-15':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-windows-runner@witan-rubric-v25-prospective-2026-10-12':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-windows-runner@witan-rubric-v26-prospective-2026-10-14':
    '84ef3117963d1da8327da03bc2c84a54628c7651af6315e375b1cef0428f86be',
  'itf-control-windows-runner@witan-rubric-v27-prospective-2026-10-19':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-quoted@witan-rubric-v17-2026-07-24':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-quoted@witan-rubric-v18-prospective-2026-07-25':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-quoted@witan-rubric-v19-prospective-2026-08-09':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-quoted@witan-rubric-v20-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-quoted@witan-rubric-v21-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-quoted@witan-rubric-v22-prospective-2026-08-10':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-quoted@witan-rubric-v23-prospective-2026-09-06':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-quoted@witan-rubric-v24-prospective-2026-09-15':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-quoted@witan-rubric-v25-prospective-2026-10-12':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
  'itf-control-quoted@witan-rubric-v26-prospective-2026-10-14':
    '84ef3117963d1da8327da03bc2c84a54628c7651af6315e375b1cef0428f86be',
  'itf-control-quoted@witan-rubric-v27-prospective-2026-10-19':
    '995c207598c37cce1ac322783ae11d4018195e8515d826ab32234fe789d996f8',
};
