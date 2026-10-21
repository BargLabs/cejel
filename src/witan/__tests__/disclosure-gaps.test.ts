import { platform } from 'node:os';

import { afterAll, describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import {
  WITAN_A2_PLACEHOLDER_SET_ASIDE_PREFIX,
  WITAN_B3_UNSHOWN_CHECK_PREFIX,
} from '../abstention.js';
import { buildRelyingPartySummary, formatCertificateMetricValue } from '../certificate-presentation.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import {
  b3UnshownCheckDisclosure,
  githubWorkflowTriggers,
  placeholderSetAsideDisclosure,
} from '../repo-signals.js';
import { projectWitanScoringSurface } from '../rubric-fingerprint.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_SELECTABLE_RUBRIC_VERSIONS } from '../rubric-version.js';
import {
  DISCLOSURE_GAP_FIXTURES,
  buildDisclosureGapFixture,
  disclosureGapFixture,
  removeDisclosureGapFixtures,
} from './fixtures/disclosure-gap-fixtures.js';

// A2 placeholder set-aside and gitignore citation, B2 trigger labels, B3 counted workflows not
// shown to run a check. Presentation only, under every selectable rubric: the certificate now says
// what Cejel read and set aside, and what the PR-gate count includes without having seen it run a
// check. Which values count and which workflows count are scoring questions for a prospective
// rubric and are not changed here.
//
// The scoring half: each fixture's scoring surface under every selectable rubric is pinned below
// to the value origin/main 1d0d4388d produced before this change. A disclosure that moved a score,
// a status, a metric value or a finding count fails there by fixture and rubric.

const V17 = WITAN_RUBRIC_VERSION_V17;
// chmod 000 does not stop root reading a file, so the unreadable fixtures test nothing there.
const canDenyReadAccess = platform() !== 'win32' && process.getuid?.() !== 0;
const NEEDS_READ_DENIAL = new Set(
  DISCLOSURE_GAP_FIXTURES.filter((fixture) => (fixture.unreadable ?? []).length > 0).map(
    (fixture) => fixture.name,
  ),
);

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
    repo = buildDisclosureGapFixture(disclosureGapFixture(name));
    repos.set(name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'disclosure-gap-fixture',
    productDisplayName: 'Disclosure-gap fixture',
    generatedAt: '2026-10-21T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, scored);
  return scored;
}

function criterion(name: string, id: string, rubricVersion: string = V17): WitanCriterionScore {
  const found = report(name, rubricVersion).criteria.find((entry) => entry.id === id);
  if (!found) throw new Error(`${name}@${rubricVersion} has no ${id}`);
  return found;
}

function labels(name: string, id: string): string[] {
  return criterion(name, id).evidence.map((pointer) => pointer.label);
}

function metricLine(name: string, id: string, metricName: string): string {
  const score = criterion(name, id);
  const found = score.metrics.find((metric) => metric.name === metricName);
  if (!found) throw new Error(`${name} ${id} has no ${metricName}`);
  return formatCertificateMetricValue(score, found);
}

function notEstablished(name: string, rubricVersion: string = V17): string {
  return buildRelyingPartySummary(report(name, rubricVersion)).notEstablished;
}

describe('A2: credential-shaped values set aside as placeholders are named', () => {
  it('names the committed env file holding the documentation pair, on the metric line, as a disclosure and on the summary', () => {
    const name = 'a2-doc-example-pair-in-committed-env-file';
    const a2 = criterion(name, 'A2');
    expect(a2.metrics.find((metric) => metric.name === 'secret_cleanliness')?.value).toBe(1);
    expect(metricLine(name, 'A2', 'secret_cleanliness')).toBe(
      'clean — no critical secret findings detected; 2 credential-shaped values set aside as documentation placeholders, not counted: config/dev.env',
    );
    const sentence =
      'Cejel read and set aside 2 credential-shaped values as documentation placeholders because they contain a placeholder marker such as "example", so they were not counted against secret cleanliness or checked further: config/dev.env.';
    expect(a2.disclosures).toEqual([sentence]);
    expect(a2.notes).not.toContain(WITAN_A2_PLACEHOLDER_SET_ASIDE_PREFIX);
    expect(notEstablished(name)).toContain(sentence);
  });

  it('names a source file holding the documentation key id', () => {
    expect(criterion('a2-doc-example-id-in-source', 'A2').disclosures).toEqual([
      'Cejel read and set aside 1 credential-shaped value as a documentation placeholder because it contains a placeholder marker such as "example", so it was not counted against secret cleanliness or checked further: src/creds.ts.',
    ]);
    expect(notEstablished('a2-doc-example-id-in-source')).toContain('or checked further: src/creds.ts.');
  });

  it('names nothing when the placeholders are not credential-shaped', () => {
    const name = 'a2-control-non-credential-placeholders';
    expect(criterion(name, 'A2').disclosures).toBeUndefined();
    expect(metricLine(name, 'A2', 'secret_cleanliness')).toBe(
      'clean — no critical secret findings detected',
    );
    expect(notEstablished(name)).not.toContain(WITAN_A2_PLACEHOLDER_SET_ASIDE_PREFIX);
  });

  it('describes nothing as set aside when the value carries no placeholder marker: detection stands', () => {
    const name = 'a2-unmarked-pair-in-committed-env-file';
    const a2 = criterion(name, 'A2');
    expect(a2.metrics.find((metric) => metric.name === 'secret_cleanliness')?.value).toBe(0);
    expect(a2.findings.some((finding) => finding.severity === 'critical')).toBe(true);
    expect(a2.disclosures).toBeUndefined();
    expect(notEstablished(name)).not.toContain(WITAN_A2_PLACEHOLDER_SET_ASIDE_PREFIX);
  });

  it('discloses on a not-applicable A2 once, apart from its reason', () => {
    const name = 'a2-not-applicable-with-set-aside';
    const a2 = criterion(name, 'A2');
    expect(a2.status).toBe('not_applicable');
    expect(a2.notes).toMatch(/^No data layer .*do not qualify\.$/);
    expect(a2.disclosures).toHaveLength(1);
    expect(a2.disclosures?.[0]).toMatch(/^Cejel read and set aside 1 credential-shaped value .*: tool\.py\.$/);
    const summary = notEstablished(name);
    expect(summary.split('or checked further: tool.py.').length - 1).toBe(1);
  });

  it.skipIf(!canDenyReadAccess)(
    'keeps the disclosure when A2 abstains and its notes are rewritten, under every rubric (#539)',
    () => {
      const name = 'a2-set-aside-with-unreadable-source';
      const sentence =
        'Cejel read and set aside 2 credential-shaped values as documentation placeholders because they contain a placeholder marker such as "example", so they were not counted against secret cleanliness or checked further: config/dev.env.';
      const rewritten: string[] = [];
      for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
        const a2 = criterion(name, 'A2', rubricVersion);
        if (a2.notes?.startsWith('Cejel abstained') || a2.notes?.startsWith('Cejel declined')) {
          rewritten.push(rubricVersion);
        }
        expect(notEstablished(name, rubricVersion), rubricVersion).toContain(sentence);
        expect(a2.disclosures, rubricVersion).toEqual([sentence]);
      }
      // The fixture exercises the rewrite on at least one rubric, or it proves nothing.
      expect(rewritten.length).toBeGreaterThan(0);
    },
  );

  it('fits a disclosure: paths are dropped before the sentence is', () => {
    const files = Array.from({ length: 6 }, (_, index) => ({
      path: `services/service-${index}/config/${'deeply/'.repeat(8)}settings.env`,
      count: 1,
    }));
    const full = placeholderSetAsideDisclosure(files);
    expect(full).toContain('and 3 more files.');
    const tight = placeholderSetAsideDisclosure(files, 330);
    expect(tight.length).toBeLessThanOrEqual(330);
    expect(tight.startsWith(WITAN_A2_PLACEHOLDER_SET_ASIDE_PREFIX)).toBe(true);
    expect(placeholderSetAsideDisclosure(files, 20)).toBe('');
  });
});

describe('A2: the gitignore citation does not contradict a committed env file', () => {
  it('names the committed env file the .env rule does not untrack', () => {
    for (const name of [
      'a2-doc-example-pair-in-committed-env-file',
      'a2-control-non-credential-placeholders',
      'a2-unmarked-pair-in-committed-env-file',
    ]) {
      expect(labels(name, 'A2')).toContain(
        '.gitignore has an .env rule, but the scanned tree includes 1 env file: config/dev.env',
      );
      expect(labels(name, 'A2')).not.toContain('.env files are gitignored');
    }
  });

  it('keeps ".env files are gitignored" when only a template is committed', () => {
    expect(labels('a2-control-template-only', 'A2')).toContain('.env files are gitignored');
  });
});

describe('B2: each cited workflow is labelled by its own trigger', () => {
  it('labels a manual-dispatch-only workflow without a pull-request claim', () => {
    expect(labels('b2b3-planted-workflows', 'B2')).toEqual([
      'Pull-request CI workflow (4 workflow files counted; 3 cited)',
      'CI workflow with no pull-request trigger (on: workflow_dispatch) (4 workflow files counted; 3 cited)',
      'Pull-request CI workflow (4 workflow files counted; 3 cited)',
    ]);
    expect(criterion('b2b3-planted-workflows', 'B2').evidence.map((pointer) => pointer.path)).toEqual([
      '.github/workflows/e2e.yml',
      '.github/workflows/release.yml',
      '.github/workflows/security.yml',
    ]);
  });

  it('leaves pull-request workflows as they were', () => {
    expect(labels('b2b3-control-pr-workflows', 'B2')).toEqual([
      'Pull-request CI workflow',
      'Pull-request CI workflow',
    ]);
  });

  it('cites a non-GitHub CI file without a pull-request claim', () => {
    expect(labels('b2-gitlab-ci', 'B2')).toContain('CI workflow (trigger not read)');
  });

  it('names fewer triggers, then none, to fit the evidence label limit, and the scan completes', () => {
    expect(labels('b2-long-trigger-names', 'B2')).toEqual([
      // One 170-character name cannot fit; of three 50-character names, two can.
      'CI workflow with no pull-request trigger',
      `CI workflow with no pull-request trigger (on: a_${'a'.repeat(48)}, b_${'b'.repeat(48)}, ...)`,
    ]);
    for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
      for (const pointer of criterion('b2-long-trigger-names', 'B2', rubricVersion).evidence) {
        expect(pointer.label.length).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe('the workflow trigger reader', () => {
  const read = (contents: string) => {
    const triggers = githubWorkflowTriggers(contents);
    return triggers ? Object.fromEntries(triggers) : null;
  };
  const none = { kind: 'none' };

  it.each([
    ['a scalar', 'on: push\n', { push: none }],
    ['a flow list', 'on: [push, pull_request] # both\n', { push: none, pull_request: none }],
    ['a quoted key', '"on":\n  pull_request:\n', { pull_request: none }],
    ['a YAML 1.1 true key', 'true:\n  workflow_dispatch:\n', { workflow_dispatch: none }],
    [
      'inline and block branch filters',
      'on:\n  push:\n    branches: [main, "release"]\n  pull_request:\n    branches:\n      - master\n',
      { push: { kind: 'names', names: ['main', 'release'] }, pull_request: { kind: 'names', names: ['master'] } },
    ],
    [
      'compact sequences under a trigger and a filter',
      "on:\n  pull_request:\n  push:\n    branches:\n    - master\n  schedule:\n  - cron: '00 01 * * *'\n\npermissions:\n  contents: read\n",
      { pull_request: none, push: { kind: 'names', names: ['master'] }, schedule: none },
    ],
    ['a compact list at column 0', 'on:\n- pull_request_target\n\npermissions:\n  contents: read\n', { pull_request_target: none }],
    ['an indented list', 'on:\n  - push\n  - workflow_dispatch\n', { push: none, workflow_dispatch: none }],
    [
      'an ignore list it does not evaluate',
      'on:\n  push:\n    branches-ignore: [gh-pages]\n',
      { push: { kind: 'unread' } },
    ],
  ])('reads %s', (_shape, contents, expected) => {
    expect(read(contents)).toEqual(expected);
  });

  it.each([
    ['no on: key', 'name: ci\njobs: {}\n'],
    ['a flow mapping', 'on: {push: {branches: [main]}}\n'],
    ['an anchor', 'on: &triggers\n  push:\n'],
    ['an inline trigger value', 'on:\n  push: main\n'],
  ])('claims nothing for %s', (_shape, contents) => {
    expect(read(contents)).toBeNull();
  });
});

describe('B3: counted PR-gate workflows not shown to run a check are named', () => {
  const sentence =
    'B3 counted workflows Cejel did not see run a check: .github/workflows/e2e.yml only prints text; .github/workflows/security.yml runs only on master, and this checkout is on main with no master branch. The PR-gate CI workflow count still includes them.';

  it('names the print-only workflow and the one confined to an absent master branch', () => {
    const b3 = criterion('b2b3-planted-workflows', 'B3');
    expect(b3.metrics.find((metric) => metric.name === 'default_branch_ci_depth')?.value).toBe(3);
    expect(b3.disclosures).toEqual([sentence]);
    expect(b3.notes).toBeUndefined();
    expect(metricLine('b2b3-planted-workflows', 'B3', 'default_branch_ci_depth')).toBe(
      '3/4 workflows; includes 2 not shown to run a check: e2e.yml only prints text; security.yml runs only on master',
    );
    expect(notEstablished('b2b3-planted-workflows')).toContain(sentence);
  });

  it('names the absent branch from a full clone by its recorded default branch', () => {
    const name = 'b3-master-target-full-clone';
    expect(criterion(name, 'B3').disclosures).toEqual([
      "B3 counted workflows Cejel did not see run a check: .github/workflows/security.yml runs only on master, and the clone's default branch is main with no master branch. The PR-gate CI workflow count still includes it.",
    ]);
  });

  it('names a counted monorepo-root workflow as a root workflow', () => {
    const name = 'b3-monorepo-root-print-only';
    const sentence =
      'B3 counted workflows Cejel did not see run a check: .github/workflows/e2e.yml at the monorepo root only prints text. The PR-gate CI workflow count still includes it.';
    expect(notEstablished(name)).toContain(sentence);
    expect(criterion(name, 'B3').disclosures).toEqual([sentence]);
    expect(metricLine(name, 'B3', 'default_branch_ci_depth')).toContain(
      'includes 1 not shown to run a check: e2e.yml at the monorepo root only prints text',
    );
  });

  it.each([
    'b2b3-control-pr-workflows',
    'b3-master-target-with-master-branch',
    'b3-master-target-detached',
    'b3-echo-with-action',
    'b3-echo-with-substitution',
    'b3-master-target-with-schedule',
    'b3-master-target-with-dispatch',
    'b3-master-target-depth-1-clone',
    'b3-master-target-single-branch-clone',
    'b3-master-target-ci-fetch',
  ])('claims nothing for %s', (name) => {
    expect(criterion(name, 'B3').disclosures).toBeUndefined();
    expect(notEstablished(name)).not.toContain(WITAN_B3_UNSHOWN_CHECK_PREFIX);
  });

  it('fits a disclosure', () => {
    const unshown = {
      printOnly: Array.from({ length: 5 }, (_, index) => `.github/workflows/${'p'.repeat(60)}-${index}.yml`),
      absentBranch: [
        { path: '.github/workflows/security.yml', target: 'master', current: 'main', source: 'checkout' as const },
      ],
    };
    expect(b3UnshownCheckDisclosure(unshown)).toContain('and 2 more only print text');
    const tight = b3UnshownCheckDisclosure(unshown, 200);
    expect(tight).toBe(
      'B3 counted workflows Cejel did not see run a check: 6 workflows. The PR-gate CI workflow count still includes them.',
    );
  });
});

describe('every disclosure is presentation only', () => {
  // Captured by scoring these fixtures, with the options in report() above, using origin/main
  // 1d0d4388d's scanner (before this change; the fixtures after 'b2-gitlab-ci' were added after
  // review and captured the same way): sha256 of
  // JSON.stringify(projectWitanScoringSurface(report)), per fixture and selectable rubric.
  it('leaves every scoring surface where origin/main left it, under every selectable rubric', async () => {
    const { createHash } = await import('node:crypto');
    const pins = SCORING_SURFACE_PINS;
    const moved: string[] = [];
    for (const fixture of DISCLOSURE_GAP_FIXTURES) {
      if (!canDenyReadAccess && NEEDS_READ_DENIAL.has(fixture.name)) continue;
      for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
        const key = `${fixture.name}@${rubricVersion}`;
        const surface = createHash('sha256')
          .update(JSON.stringify(projectWitanScoringSurface(report(fixture.name, rubricVersion))))
          .digest('hex');
        if (pins[key] !== surface) moved.push(key);
      }
    }
    expect(moved).toEqual([]);
    expect(Object.keys(pins).length).toBe(
      DISCLOSURE_GAP_FIXTURES.length * WITAN_SELECTABLE_RUBRIC_VERSIONS.length,
    );
  });
});

const SCORING_SURFACE_PINS: Readonly<Record<string, string>> = {
  'a2-doc-example-pair-in-committed-env-file@witan-rubric-v17-2026-07-24':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-doc-example-pair-in-committed-env-file@witan-rubric-v18-prospective-2026-07-25':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-doc-example-pair-in-committed-env-file@witan-rubric-v19-prospective-2026-08-09':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-doc-example-pair-in-committed-env-file@witan-rubric-v20-prospective-2026-08-10':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-doc-example-pair-in-committed-env-file@witan-rubric-v21-prospective-2026-08-10':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-doc-example-pair-in-committed-env-file@witan-rubric-v22-prospective-2026-08-10':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-doc-example-pair-in-committed-env-file@witan-rubric-v23-prospective-2026-09-06':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-doc-example-pair-in-committed-env-file@witan-rubric-v24-prospective-2026-09-15':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-doc-example-pair-in-committed-env-file@witan-rubric-v25-prospective-2026-10-12':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-doc-example-pair-in-committed-env-file@witan-rubric-v26-prospective-2026-10-14':
    'cb3ae49e957d40a8e6c97f9a1895f58d37f4cfbae7c6743e28ca9a12873e0ac2',
  'a2-doc-example-pair-in-committed-env-file@witan-rubric-v27-prospective-2026-10-19':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-control-non-credential-placeholders@witan-rubric-v17-2026-07-24':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-control-non-credential-placeholders@witan-rubric-v18-prospective-2026-07-25':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-control-non-credential-placeholders@witan-rubric-v19-prospective-2026-08-09':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-control-non-credential-placeholders@witan-rubric-v20-prospective-2026-08-10':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-control-non-credential-placeholders@witan-rubric-v21-prospective-2026-08-10':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-control-non-credential-placeholders@witan-rubric-v22-prospective-2026-08-10':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-control-non-credential-placeholders@witan-rubric-v23-prospective-2026-09-06':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-control-non-credential-placeholders@witan-rubric-v24-prospective-2026-09-15':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-control-non-credential-placeholders@witan-rubric-v25-prospective-2026-10-12':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-control-non-credential-placeholders@witan-rubric-v26-prospective-2026-10-14':
    'cb3ae49e957d40a8e6c97f9a1895f58d37f4cfbae7c6743e28ca9a12873e0ac2',
  'a2-control-non-credential-placeholders@witan-rubric-v27-prospective-2026-10-19':
    '446b554192d764dd2a2a953100484be3ead87c79344c7b183b34b0c908233495',
  'a2-control-template-only@witan-rubric-v17-2026-07-24':
    'cdcdcd32e2e8f8ccfcbb2d8f2311f3b42acd12ece02dac861a0d6b43bb0e3a0b',
  'a2-control-template-only@witan-rubric-v18-prospective-2026-07-25':
    'cdcdcd32e2e8f8ccfcbb2d8f2311f3b42acd12ece02dac861a0d6b43bb0e3a0b',
  'a2-control-template-only@witan-rubric-v19-prospective-2026-08-09':
    'cdcdcd32e2e8f8ccfcbb2d8f2311f3b42acd12ece02dac861a0d6b43bb0e3a0b',
  'a2-control-template-only@witan-rubric-v20-prospective-2026-08-10':
    'cdcdcd32e2e8f8ccfcbb2d8f2311f3b42acd12ece02dac861a0d6b43bb0e3a0b',
  'a2-control-template-only@witan-rubric-v21-prospective-2026-08-10':
    'cdcdcd32e2e8f8ccfcbb2d8f2311f3b42acd12ece02dac861a0d6b43bb0e3a0b',
  'a2-control-template-only@witan-rubric-v22-prospective-2026-08-10':
    'cdcdcd32e2e8f8ccfcbb2d8f2311f3b42acd12ece02dac861a0d6b43bb0e3a0b',
  'a2-control-template-only@witan-rubric-v23-prospective-2026-09-06':
    'cdcdcd32e2e8f8ccfcbb2d8f2311f3b42acd12ece02dac861a0d6b43bb0e3a0b',
  'a2-control-template-only@witan-rubric-v24-prospective-2026-09-15':
    'cdcdcd32e2e8f8ccfcbb2d8f2311f3b42acd12ece02dac861a0d6b43bb0e3a0b',
  'a2-control-template-only@witan-rubric-v25-prospective-2026-10-12':
    'cdcdcd32e2e8f8ccfcbb2d8f2311f3b42acd12ece02dac861a0d6b43bb0e3a0b',
  'a2-control-template-only@witan-rubric-v26-prospective-2026-10-14':
    '8005f457d63c853066997c1e90e340f2bd606877ec6078dc2abf0a9e11637a78',
  'a2-control-template-only@witan-rubric-v27-prospective-2026-10-19':
    'cdcdcd32e2e8f8ccfcbb2d8f2311f3b42acd12ece02dac861a0d6b43bb0e3a0b',
  'a2-unmarked-pair-in-committed-env-file@witan-rubric-v17-2026-07-24':
    'fd535cf00f6cd05a6762cd4ff8a72ea4052999870dbf40d35c0325f9cc3a3c93',
  'a2-unmarked-pair-in-committed-env-file@witan-rubric-v18-prospective-2026-07-25':
    'fd535cf00f6cd05a6762cd4ff8a72ea4052999870dbf40d35c0325f9cc3a3c93',
  'a2-unmarked-pair-in-committed-env-file@witan-rubric-v19-prospective-2026-08-09':
    'fd535cf00f6cd05a6762cd4ff8a72ea4052999870dbf40d35c0325f9cc3a3c93',
  'a2-unmarked-pair-in-committed-env-file@witan-rubric-v20-prospective-2026-08-10':
    'fd535cf00f6cd05a6762cd4ff8a72ea4052999870dbf40d35c0325f9cc3a3c93',
  'a2-unmarked-pair-in-committed-env-file@witan-rubric-v21-prospective-2026-08-10':
    'fd535cf00f6cd05a6762cd4ff8a72ea4052999870dbf40d35c0325f9cc3a3c93',
  'a2-unmarked-pair-in-committed-env-file@witan-rubric-v22-prospective-2026-08-10':
    'fd535cf00f6cd05a6762cd4ff8a72ea4052999870dbf40d35c0325f9cc3a3c93',
  'a2-unmarked-pair-in-committed-env-file@witan-rubric-v23-prospective-2026-09-06':
    'fd535cf00f6cd05a6762cd4ff8a72ea4052999870dbf40d35c0325f9cc3a3c93',
  'a2-unmarked-pair-in-committed-env-file@witan-rubric-v24-prospective-2026-09-15':
    'fd535cf00f6cd05a6762cd4ff8a72ea4052999870dbf40d35c0325f9cc3a3c93',
  'a2-unmarked-pair-in-committed-env-file@witan-rubric-v25-prospective-2026-10-12':
    'fd535cf00f6cd05a6762cd4ff8a72ea4052999870dbf40d35c0325f9cc3a3c93',
  'a2-unmarked-pair-in-committed-env-file@witan-rubric-v26-prospective-2026-10-14':
    'c770aa1d9b607e25a3b9c146eec67e66bd54464fc612493122b336f03bd5afd1',
  'a2-unmarked-pair-in-committed-env-file@witan-rubric-v27-prospective-2026-10-19':
    'fd535cf00f6cd05a6762cd4ff8a72ea4052999870dbf40d35c0325f9cc3a3c93',
  'a2-doc-example-id-in-source@witan-rubric-v17-2026-07-24':
    '259dd9634c095c8a6751f239577de01ad0a9d1ff54a9b6df5043eec5bcf2849f',
  'a2-doc-example-id-in-source@witan-rubric-v18-prospective-2026-07-25':
    '259dd9634c095c8a6751f239577de01ad0a9d1ff54a9b6df5043eec5bcf2849f',
  'a2-doc-example-id-in-source@witan-rubric-v19-prospective-2026-08-09':
    '259dd9634c095c8a6751f239577de01ad0a9d1ff54a9b6df5043eec5bcf2849f',
  'a2-doc-example-id-in-source@witan-rubric-v20-prospective-2026-08-10':
    '259dd9634c095c8a6751f239577de01ad0a9d1ff54a9b6df5043eec5bcf2849f',
  'a2-doc-example-id-in-source@witan-rubric-v21-prospective-2026-08-10':
    '259dd9634c095c8a6751f239577de01ad0a9d1ff54a9b6df5043eec5bcf2849f',
  'a2-doc-example-id-in-source@witan-rubric-v22-prospective-2026-08-10':
    '259dd9634c095c8a6751f239577de01ad0a9d1ff54a9b6df5043eec5bcf2849f',
  'a2-doc-example-id-in-source@witan-rubric-v23-prospective-2026-09-06':
    '259dd9634c095c8a6751f239577de01ad0a9d1ff54a9b6df5043eec5bcf2849f',
  'a2-doc-example-id-in-source@witan-rubric-v24-prospective-2026-09-15':
    '259dd9634c095c8a6751f239577de01ad0a9d1ff54a9b6df5043eec5bcf2849f',
  'a2-doc-example-id-in-source@witan-rubric-v25-prospective-2026-10-12':
    '259dd9634c095c8a6751f239577de01ad0a9d1ff54a9b6df5043eec5bcf2849f',
  'a2-doc-example-id-in-source@witan-rubric-v26-prospective-2026-10-14':
    '8517bd1b1727a2bb4a8572672774134694bca21ea42148ded2b4c6a9aebb4e75',
  'a2-doc-example-id-in-source@witan-rubric-v27-prospective-2026-10-19':
    '259dd9634c095c8a6751f239577de01ad0a9d1ff54a9b6df5043eec5bcf2849f',
  'a2-not-applicable-with-set-aside@witan-rubric-v17-2026-07-24':
    '1cf2915841173bcd4299aa4cb05fa3704a930d0d6f84a32d642caa8c50dc23e5',
  'a2-not-applicable-with-set-aside@witan-rubric-v18-prospective-2026-07-25':
    '1cf2915841173bcd4299aa4cb05fa3704a930d0d6f84a32d642caa8c50dc23e5',
  'a2-not-applicable-with-set-aside@witan-rubric-v19-prospective-2026-08-09':
    '1cf2915841173bcd4299aa4cb05fa3704a930d0d6f84a32d642caa8c50dc23e5',
  'a2-not-applicable-with-set-aside@witan-rubric-v20-prospective-2026-08-10':
    '1cf2915841173bcd4299aa4cb05fa3704a930d0d6f84a32d642caa8c50dc23e5',
  'a2-not-applicable-with-set-aside@witan-rubric-v21-prospective-2026-08-10':
    '1cf2915841173bcd4299aa4cb05fa3704a930d0d6f84a32d642caa8c50dc23e5',
  'a2-not-applicable-with-set-aside@witan-rubric-v22-prospective-2026-08-10':
    '1cf2915841173bcd4299aa4cb05fa3704a930d0d6f84a32d642caa8c50dc23e5',
  'a2-not-applicable-with-set-aside@witan-rubric-v23-prospective-2026-09-06':
    '1cf2915841173bcd4299aa4cb05fa3704a930d0d6f84a32d642caa8c50dc23e5',
  'a2-not-applicable-with-set-aside@witan-rubric-v24-prospective-2026-09-15':
    '1cf2915841173bcd4299aa4cb05fa3704a930d0d6f84a32d642caa8c50dc23e5',
  'a2-not-applicable-with-set-aside@witan-rubric-v25-prospective-2026-10-12':
    '1cf2915841173bcd4299aa4cb05fa3704a930d0d6f84a32d642caa8c50dc23e5',
  'a2-not-applicable-with-set-aside@witan-rubric-v26-prospective-2026-10-14':
    '1cf2915841173bcd4299aa4cb05fa3704a930d0d6f84a32d642caa8c50dc23e5',
  'a2-not-applicable-with-set-aside@witan-rubric-v27-prospective-2026-10-19':
    '1cf2915841173bcd4299aa4cb05fa3704a930d0d6f84a32d642caa8c50dc23e5',
  'b2b3-planted-workflows@witan-rubric-v17-2026-07-24':
    '9abd0b3001b65a4f8d77e3ff1d009cc9a5b4d40109dfa1cb117989119dd99697',
  'b2b3-planted-workflows@witan-rubric-v18-prospective-2026-07-25':
    '9abd0b3001b65a4f8d77e3ff1d009cc9a5b4d40109dfa1cb117989119dd99697',
  'b2b3-planted-workflows@witan-rubric-v19-prospective-2026-08-09':
    '9abd0b3001b65a4f8d77e3ff1d009cc9a5b4d40109dfa1cb117989119dd99697',
  'b2b3-planted-workflows@witan-rubric-v20-prospective-2026-08-10':
    '9abd0b3001b65a4f8d77e3ff1d009cc9a5b4d40109dfa1cb117989119dd99697',
  'b2b3-planted-workflows@witan-rubric-v21-prospective-2026-08-10':
    '9abd0b3001b65a4f8d77e3ff1d009cc9a5b4d40109dfa1cb117989119dd99697',
  'b2b3-planted-workflows@witan-rubric-v22-prospective-2026-08-10':
    '9abd0b3001b65a4f8d77e3ff1d009cc9a5b4d40109dfa1cb117989119dd99697',
  'b2b3-planted-workflows@witan-rubric-v23-prospective-2026-09-06':
    '9abd0b3001b65a4f8d77e3ff1d009cc9a5b4d40109dfa1cb117989119dd99697',
  'b2b3-planted-workflows@witan-rubric-v24-prospective-2026-09-15':
    '9abd0b3001b65a4f8d77e3ff1d009cc9a5b4d40109dfa1cb117989119dd99697',
  'b2b3-planted-workflows@witan-rubric-v25-prospective-2026-10-12':
    '9abd0b3001b65a4f8d77e3ff1d009cc9a5b4d40109dfa1cb117989119dd99697',
  'b2b3-planted-workflows@witan-rubric-v26-prospective-2026-10-14':
    'd36a15cabb651e6ee00d01a50edd62de230097c186f38f22b235a734281a44e0',
  'b2b3-planted-workflows@witan-rubric-v27-prospective-2026-10-19':
    '9abd0b3001b65a4f8d77e3ff1d009cc9a5b4d40109dfa1cb117989119dd99697',
  'b2b3-control-pr-workflows@witan-rubric-v17-2026-07-24':
    'bb36e73518c7e570fcf31f4d5de8ee792f32eac0118594631f28feb09201eccc',
  'b2b3-control-pr-workflows@witan-rubric-v18-prospective-2026-07-25':
    'bb36e73518c7e570fcf31f4d5de8ee792f32eac0118594631f28feb09201eccc',
  'b2b3-control-pr-workflows@witan-rubric-v19-prospective-2026-08-09':
    'bb36e73518c7e570fcf31f4d5de8ee792f32eac0118594631f28feb09201eccc',
  'b2b3-control-pr-workflows@witan-rubric-v20-prospective-2026-08-10':
    'bb36e73518c7e570fcf31f4d5de8ee792f32eac0118594631f28feb09201eccc',
  'b2b3-control-pr-workflows@witan-rubric-v21-prospective-2026-08-10':
    'bb36e73518c7e570fcf31f4d5de8ee792f32eac0118594631f28feb09201eccc',
  'b2b3-control-pr-workflows@witan-rubric-v22-prospective-2026-08-10':
    'bb36e73518c7e570fcf31f4d5de8ee792f32eac0118594631f28feb09201eccc',
  'b2b3-control-pr-workflows@witan-rubric-v23-prospective-2026-09-06':
    'bb36e73518c7e570fcf31f4d5de8ee792f32eac0118594631f28feb09201eccc',
  'b2b3-control-pr-workflows@witan-rubric-v24-prospective-2026-09-15':
    'bb36e73518c7e570fcf31f4d5de8ee792f32eac0118594631f28feb09201eccc',
  'b2b3-control-pr-workflows@witan-rubric-v25-prospective-2026-10-12':
    'bb36e73518c7e570fcf31f4d5de8ee792f32eac0118594631f28feb09201eccc',
  'b2b3-control-pr-workflows@witan-rubric-v26-prospective-2026-10-14':
    '7036f10bf02489878dd366dcc107b9c4f6f68ce9f353aa0d808deb453123f140',
  'b2b3-control-pr-workflows@witan-rubric-v27-prospective-2026-10-19':
    'bb36e73518c7e570fcf31f4d5de8ee792f32eac0118594631f28feb09201eccc',
  'b3-master-target-with-master-branch@witan-rubric-v17-2026-07-24':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-master-branch@witan-rubric-v18-prospective-2026-07-25':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-master-branch@witan-rubric-v19-prospective-2026-08-09':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-master-branch@witan-rubric-v20-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-master-branch@witan-rubric-v21-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-master-branch@witan-rubric-v22-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-master-branch@witan-rubric-v23-prospective-2026-09-06':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-master-branch@witan-rubric-v24-prospective-2026-09-15':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-master-branch@witan-rubric-v25-prospective-2026-10-12':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-master-branch@witan-rubric-v26-prospective-2026-10-14':
    '8f4f139c2a93336de130de1e99c26122ed684a05420393b9d3b167514d81d316',
  'b3-master-target-with-master-branch@witan-rubric-v27-prospective-2026-10-19':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-detached@witan-rubric-v17-2026-07-24':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-detached@witan-rubric-v18-prospective-2026-07-25':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-detached@witan-rubric-v19-prospective-2026-08-09':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-detached@witan-rubric-v20-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-detached@witan-rubric-v21-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-detached@witan-rubric-v22-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-detached@witan-rubric-v23-prospective-2026-09-06':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-detached@witan-rubric-v24-prospective-2026-09-15':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-detached@witan-rubric-v25-prospective-2026-10-12':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-detached@witan-rubric-v26-prospective-2026-10-14':
    '8f4f139c2a93336de130de1e99c26122ed684a05420393b9d3b167514d81d316',
  'b3-master-target-detached@witan-rubric-v27-prospective-2026-10-19':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-echo-with-action@witan-rubric-v17-2026-07-24':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-echo-with-action@witan-rubric-v18-prospective-2026-07-25':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-echo-with-action@witan-rubric-v19-prospective-2026-08-09':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-echo-with-action@witan-rubric-v20-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-echo-with-action@witan-rubric-v21-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-echo-with-action@witan-rubric-v22-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-echo-with-action@witan-rubric-v23-prospective-2026-09-06':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-echo-with-action@witan-rubric-v24-prospective-2026-09-15':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-echo-with-action@witan-rubric-v25-prospective-2026-10-12':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-echo-with-action@witan-rubric-v26-prospective-2026-10-14':
    '8f4f139c2a93336de130de1e99c26122ed684a05420393b9d3b167514d81d316',
  'b3-echo-with-action@witan-rubric-v27-prospective-2026-10-19':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-echo-with-substitution@witan-rubric-v17-2026-07-24':
    '12c86dc26e1a2ff7f27a21674ff145bcd9fcb9146494b4217d2ad48b1a9f904b',
  'b3-echo-with-substitution@witan-rubric-v18-prospective-2026-07-25':
    '12c86dc26e1a2ff7f27a21674ff145bcd9fcb9146494b4217d2ad48b1a9f904b',
  'b3-echo-with-substitution@witan-rubric-v19-prospective-2026-08-09':
    '12c86dc26e1a2ff7f27a21674ff145bcd9fcb9146494b4217d2ad48b1a9f904b',
  'b3-echo-with-substitution@witan-rubric-v20-prospective-2026-08-10':
    '12c86dc26e1a2ff7f27a21674ff145bcd9fcb9146494b4217d2ad48b1a9f904b',
  'b3-echo-with-substitution@witan-rubric-v21-prospective-2026-08-10':
    '12c86dc26e1a2ff7f27a21674ff145bcd9fcb9146494b4217d2ad48b1a9f904b',
  'b3-echo-with-substitution@witan-rubric-v22-prospective-2026-08-10':
    '12c86dc26e1a2ff7f27a21674ff145bcd9fcb9146494b4217d2ad48b1a9f904b',
  'b3-echo-with-substitution@witan-rubric-v23-prospective-2026-09-06':
    '12c86dc26e1a2ff7f27a21674ff145bcd9fcb9146494b4217d2ad48b1a9f904b',
  'b3-echo-with-substitution@witan-rubric-v24-prospective-2026-09-15':
    '12c86dc26e1a2ff7f27a21674ff145bcd9fcb9146494b4217d2ad48b1a9f904b',
  'b3-echo-with-substitution@witan-rubric-v25-prospective-2026-10-12':
    '12c86dc26e1a2ff7f27a21674ff145bcd9fcb9146494b4217d2ad48b1a9f904b',
  'b3-echo-with-substitution@witan-rubric-v26-prospective-2026-10-14':
    'abb7bf9c4940cd36b64e50d2e873fb7455b9c47e6b345bd28471f7954bb9b7c0',
  'b3-echo-with-substitution@witan-rubric-v27-prospective-2026-10-19':
    '12c86dc26e1a2ff7f27a21674ff145bcd9fcb9146494b4217d2ad48b1a9f904b',
  'b2b3-workflow-lfs-pointer@witan-rubric-v17-2026-07-24':
    '2b9abaac9436aaa6ddb4be420f79cd6734dfa3bb223acffaf969386bbf4196ae',
  'b2b3-workflow-lfs-pointer@witan-rubric-v18-prospective-2026-07-25':
    '2b9abaac9436aaa6ddb4be420f79cd6734dfa3bb223acffaf969386bbf4196ae',
  'b2b3-workflow-lfs-pointer@witan-rubric-v19-prospective-2026-08-09':
    '2b9abaac9436aaa6ddb4be420f79cd6734dfa3bb223acffaf969386bbf4196ae',
  'b2b3-workflow-lfs-pointer@witan-rubric-v20-prospective-2026-08-10':
    '2b9abaac9436aaa6ddb4be420f79cd6734dfa3bb223acffaf969386bbf4196ae',
  'b2b3-workflow-lfs-pointer@witan-rubric-v21-prospective-2026-08-10':
    '2b9abaac9436aaa6ddb4be420f79cd6734dfa3bb223acffaf969386bbf4196ae',
  'b2b3-workflow-lfs-pointer@witan-rubric-v22-prospective-2026-08-10':
    '2b9abaac9436aaa6ddb4be420f79cd6734dfa3bb223acffaf969386bbf4196ae',
  'b2b3-workflow-lfs-pointer@witan-rubric-v23-prospective-2026-09-06':
    '2b9abaac9436aaa6ddb4be420f79cd6734dfa3bb223acffaf969386bbf4196ae',
  'b2b3-workflow-lfs-pointer@witan-rubric-v24-prospective-2026-09-15':
    '2b9abaac9436aaa6ddb4be420f79cd6734dfa3bb223acffaf969386bbf4196ae',
  'b2b3-workflow-lfs-pointer@witan-rubric-v25-prospective-2026-10-12':
    '2b9abaac9436aaa6ddb4be420f79cd6734dfa3bb223acffaf969386bbf4196ae',
  'b2b3-workflow-lfs-pointer@witan-rubric-v26-prospective-2026-10-14':
    '52f4fed8d3b6eb33268cc79ceb3f57bf6c1f61bd5dcda074e237670d5cdda327',
  'b2b3-workflow-lfs-pointer@witan-rubric-v27-prospective-2026-10-19':
    '663a5c8bfe0e81685277090c2eaa0381b8b0f36db3b8a67a7da74c3952373d99',
  'b2b3-workflow-unreadable@witan-rubric-v17-2026-07-24':
    '98d54d756fcba4ba1eea1d8b2e4ad1fd31b4bc38673508682c3adde6b3b14e3b',
  'b2b3-workflow-unreadable@witan-rubric-v18-prospective-2026-07-25':
    '98d54d756fcba4ba1eea1d8b2e4ad1fd31b4bc38673508682c3adde6b3b14e3b',
  'b2b3-workflow-unreadable@witan-rubric-v19-prospective-2026-08-09':
    '98d54d756fcba4ba1eea1d8b2e4ad1fd31b4bc38673508682c3adde6b3b14e3b',
  'b2b3-workflow-unreadable@witan-rubric-v20-prospective-2026-08-10':
    '98d54d756fcba4ba1eea1d8b2e4ad1fd31b4bc38673508682c3adde6b3b14e3b',
  'b2b3-workflow-unreadable@witan-rubric-v21-prospective-2026-08-10':
    '98d54d756fcba4ba1eea1d8b2e4ad1fd31b4bc38673508682c3adde6b3b14e3b',
  'b2b3-workflow-unreadable@witan-rubric-v22-prospective-2026-08-10':
    '98d54d756fcba4ba1eea1d8b2e4ad1fd31b4bc38673508682c3adde6b3b14e3b',
  'b2b3-workflow-unreadable@witan-rubric-v23-prospective-2026-09-06':
    '31303ccf7b35b1931383d82ceab0be8e2af3c75cda13062bdbeea95115f6d543',
  'b2b3-workflow-unreadable@witan-rubric-v24-prospective-2026-09-15':
    '98d54d756fcba4ba1eea1d8b2e4ad1fd31b4bc38673508682c3adde6b3b14e3b',
  'b2b3-workflow-unreadable@witan-rubric-v25-prospective-2026-10-12':
    '98d54d756fcba4ba1eea1d8b2e4ad1fd31b4bc38673508682c3adde6b3b14e3b',
  'b2b3-workflow-unreadable@witan-rubric-v26-prospective-2026-10-14':
    '252d5bdd59b171bf6c19102f36ff406e8424009facc828780b4d5b7410db8434',
  'b2b3-workflow-unreadable@witan-rubric-v27-prospective-2026-10-19':
    '98d54d756fcba4ba1eea1d8b2e4ad1fd31b4bc38673508682c3adde6b3b14e3b',
  'b2-gitlab-ci@witan-rubric-v17-2026-07-24':
    'd3815e51c075e9bfc3f0d789e81b9a45f5e4f845bd800f9316d83698fbd524d7',
  'b2-gitlab-ci@witan-rubric-v18-prospective-2026-07-25':
    'd3815e51c075e9bfc3f0d789e81b9a45f5e4f845bd800f9316d83698fbd524d7',
  'b2-gitlab-ci@witan-rubric-v19-prospective-2026-08-09':
    'd3815e51c075e9bfc3f0d789e81b9a45f5e4f845bd800f9316d83698fbd524d7',
  'b2-gitlab-ci@witan-rubric-v20-prospective-2026-08-10':
    'd3815e51c075e9bfc3f0d789e81b9a45f5e4f845bd800f9316d83698fbd524d7',
  'b2-gitlab-ci@witan-rubric-v21-prospective-2026-08-10':
    'd3815e51c075e9bfc3f0d789e81b9a45f5e4f845bd800f9316d83698fbd524d7',
  'b2-gitlab-ci@witan-rubric-v22-prospective-2026-08-10':
    'd3815e51c075e9bfc3f0d789e81b9a45f5e4f845bd800f9316d83698fbd524d7',
  'b2-gitlab-ci@witan-rubric-v23-prospective-2026-09-06':
    'd3815e51c075e9bfc3f0d789e81b9a45f5e4f845bd800f9316d83698fbd524d7',
  'b2-gitlab-ci@witan-rubric-v24-prospective-2026-09-15':
    'd3815e51c075e9bfc3f0d789e81b9a45f5e4f845bd800f9316d83698fbd524d7',
  'b2-gitlab-ci@witan-rubric-v25-prospective-2026-10-12':
    'd3815e51c075e9bfc3f0d789e81b9a45f5e4f845bd800f9316d83698fbd524d7',
  'b2-gitlab-ci@witan-rubric-v26-prospective-2026-10-14':
    '277b21f32eeb0afbdd8469dbe820c3ae3c24205161e99bf9fc9400cbc5c44968',
  'b2-gitlab-ci@witan-rubric-v27-prospective-2026-10-19':
    'd3815e51c075e9bfc3f0d789e81b9a45f5e4f845bd800f9316d83698fbd524d7',
  'a2-set-aside-with-unreadable-source@witan-rubric-v17-2026-07-24':
    '3e07817e2a12413329337d12d7ccbf68d290407c194709d882de25650efb209e',
  'a2-set-aside-with-unreadable-source@witan-rubric-v18-prospective-2026-07-25':
    '3e07817e2a12413329337d12d7ccbf68d290407c194709d882de25650efb209e',
  'a2-set-aside-with-unreadable-source@witan-rubric-v19-prospective-2026-08-09':
    '3e07817e2a12413329337d12d7ccbf68d290407c194709d882de25650efb209e',
  'a2-set-aside-with-unreadable-source@witan-rubric-v20-prospective-2026-08-10':
    '3e07817e2a12413329337d12d7ccbf68d290407c194709d882de25650efb209e',
  'a2-set-aside-with-unreadable-source@witan-rubric-v21-prospective-2026-08-10':
    '3e07817e2a12413329337d12d7ccbf68d290407c194709d882de25650efb209e',
  'a2-set-aside-with-unreadable-source@witan-rubric-v22-prospective-2026-08-10':
    '3e07817e2a12413329337d12d7ccbf68d290407c194709d882de25650efb209e',
  'a2-set-aside-with-unreadable-source@witan-rubric-v23-prospective-2026-09-06':
    '3e07817e2a12413329337d12d7ccbf68d290407c194709d882de25650efb209e',
  'a2-set-aside-with-unreadable-source@witan-rubric-v24-prospective-2026-09-15':
    '3e07817e2a12413329337d12d7ccbf68d290407c194709d882de25650efb209e',
  'a2-set-aside-with-unreadable-source@witan-rubric-v25-prospective-2026-10-12':
    '3e07817e2a12413329337d12d7ccbf68d290407c194709d882de25650efb209e',
  'a2-set-aside-with-unreadable-source@witan-rubric-v26-prospective-2026-10-14':
    '3e07817e2a12413329337d12d7ccbf68d290407c194709d882de25650efb209e',
  'a2-set-aside-with-unreadable-source@witan-rubric-v27-prospective-2026-10-19':
    '3e07817e2a12413329337d12d7ccbf68d290407c194709d882de25650efb209e',
  'b2-long-trigger-names@witan-rubric-v17-2026-07-24':
    'bb2dae4bed9224ff70a5b255cdcec0527a56c9ff966deb67d0293ed95149833f',
  'b2-long-trigger-names@witan-rubric-v18-prospective-2026-07-25':
    'bb2dae4bed9224ff70a5b255cdcec0527a56c9ff966deb67d0293ed95149833f',
  'b2-long-trigger-names@witan-rubric-v19-prospective-2026-08-09':
    'bb2dae4bed9224ff70a5b255cdcec0527a56c9ff966deb67d0293ed95149833f',
  'b2-long-trigger-names@witan-rubric-v20-prospective-2026-08-10':
    'bb2dae4bed9224ff70a5b255cdcec0527a56c9ff966deb67d0293ed95149833f',
  'b2-long-trigger-names@witan-rubric-v21-prospective-2026-08-10':
    'bb2dae4bed9224ff70a5b255cdcec0527a56c9ff966deb67d0293ed95149833f',
  'b2-long-trigger-names@witan-rubric-v22-prospective-2026-08-10':
    'bb2dae4bed9224ff70a5b255cdcec0527a56c9ff966deb67d0293ed95149833f',
  'b2-long-trigger-names@witan-rubric-v23-prospective-2026-09-06':
    'bb2dae4bed9224ff70a5b255cdcec0527a56c9ff966deb67d0293ed95149833f',
  'b2-long-trigger-names@witan-rubric-v24-prospective-2026-09-15':
    'bb2dae4bed9224ff70a5b255cdcec0527a56c9ff966deb67d0293ed95149833f',
  'b2-long-trigger-names@witan-rubric-v25-prospective-2026-10-12':
    'bb2dae4bed9224ff70a5b255cdcec0527a56c9ff966deb67d0293ed95149833f',
  'b2-long-trigger-names@witan-rubric-v26-prospective-2026-10-14':
    '6cf9586a0c2368ab6c476a9dd9c62082274ffd12420a72fd6e62348b637f2746',
  'b2-long-trigger-names@witan-rubric-v27-prospective-2026-10-19':
    'bb2dae4bed9224ff70a5b255cdcec0527a56c9ff966deb67d0293ed95149833f',
  'b3-master-target-with-schedule@witan-rubric-v17-2026-07-24':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-schedule@witan-rubric-v18-prospective-2026-07-25':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-schedule@witan-rubric-v19-prospective-2026-08-09':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-schedule@witan-rubric-v20-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-schedule@witan-rubric-v21-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-schedule@witan-rubric-v22-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-schedule@witan-rubric-v23-prospective-2026-09-06':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-schedule@witan-rubric-v24-prospective-2026-09-15':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-schedule@witan-rubric-v25-prospective-2026-10-12':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-schedule@witan-rubric-v26-prospective-2026-10-14':
    '8f4f139c2a93336de130de1e99c26122ed684a05420393b9d3b167514d81d316',
  'b3-master-target-with-schedule@witan-rubric-v27-prospective-2026-10-19':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-dispatch@witan-rubric-v17-2026-07-24':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-dispatch@witan-rubric-v18-prospective-2026-07-25':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-dispatch@witan-rubric-v19-prospective-2026-08-09':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-dispatch@witan-rubric-v20-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-dispatch@witan-rubric-v21-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-dispatch@witan-rubric-v22-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-dispatch@witan-rubric-v23-prospective-2026-09-06':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-dispatch@witan-rubric-v24-prospective-2026-09-15':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-dispatch@witan-rubric-v25-prospective-2026-10-12':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-with-dispatch@witan-rubric-v26-prospective-2026-10-14':
    '8f4f139c2a93336de130de1e99c26122ed684a05420393b9d3b167514d81d316',
  'b3-master-target-with-dispatch@witan-rubric-v27-prospective-2026-10-19':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-full-clone@witan-rubric-v17-2026-07-24':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-full-clone@witan-rubric-v18-prospective-2026-07-25':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-full-clone@witan-rubric-v19-prospective-2026-08-09':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-full-clone@witan-rubric-v20-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-full-clone@witan-rubric-v21-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-full-clone@witan-rubric-v22-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-full-clone@witan-rubric-v23-prospective-2026-09-06':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-full-clone@witan-rubric-v24-prospective-2026-09-15':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-full-clone@witan-rubric-v25-prospective-2026-10-12':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-full-clone@witan-rubric-v26-prospective-2026-10-14':
    '8f4f139c2a93336de130de1e99c26122ed684a05420393b9d3b167514d81d316',
  'b3-master-target-full-clone@witan-rubric-v27-prospective-2026-10-19':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-depth-1-clone@witan-rubric-v17-2026-07-24':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-depth-1-clone@witan-rubric-v18-prospective-2026-07-25':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-depth-1-clone@witan-rubric-v19-prospective-2026-08-09':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-depth-1-clone@witan-rubric-v20-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-depth-1-clone@witan-rubric-v21-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-depth-1-clone@witan-rubric-v22-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-depth-1-clone@witan-rubric-v23-prospective-2026-09-06':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-depth-1-clone@witan-rubric-v24-prospective-2026-09-15':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-depth-1-clone@witan-rubric-v25-prospective-2026-10-12':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-depth-1-clone@witan-rubric-v26-prospective-2026-10-14':
    '8f4f139c2a93336de130de1e99c26122ed684a05420393b9d3b167514d81d316',
  'b3-master-target-depth-1-clone@witan-rubric-v27-prospective-2026-10-19':
    '087aca30f7590afba5d9c6004a72d3b9c42dcab71fd0df75aa0e0d1614978b44',
  'b3-master-target-single-branch-clone@witan-rubric-v17-2026-07-24':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-single-branch-clone@witan-rubric-v18-prospective-2026-07-25':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-single-branch-clone@witan-rubric-v19-prospective-2026-08-09':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-single-branch-clone@witan-rubric-v20-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-single-branch-clone@witan-rubric-v21-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-single-branch-clone@witan-rubric-v22-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-single-branch-clone@witan-rubric-v23-prospective-2026-09-06':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-single-branch-clone@witan-rubric-v24-prospective-2026-09-15':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-single-branch-clone@witan-rubric-v25-prospective-2026-10-12':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-single-branch-clone@witan-rubric-v26-prospective-2026-10-14':
    '8f4f139c2a93336de130de1e99c26122ed684a05420393b9d3b167514d81d316',
  'b3-master-target-single-branch-clone@witan-rubric-v27-prospective-2026-10-19':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-ci-fetch@witan-rubric-v17-2026-07-24':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-ci-fetch@witan-rubric-v18-prospective-2026-07-25':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-ci-fetch@witan-rubric-v19-prospective-2026-08-09':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-ci-fetch@witan-rubric-v20-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-ci-fetch@witan-rubric-v21-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-ci-fetch@witan-rubric-v22-prospective-2026-08-10':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-ci-fetch@witan-rubric-v23-prospective-2026-09-06':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-ci-fetch@witan-rubric-v24-prospective-2026-09-15':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-ci-fetch@witan-rubric-v25-prospective-2026-10-12':
    '5898585a3aa445f208cecbaa7ffa54d198ecee5d59e96e24c765c652ec39b24c',
  'b3-master-target-ci-fetch@witan-rubric-v26-prospective-2026-10-14':
    '8f4f139c2a93336de130de1e99c26122ed684a05420393b9d3b167514d81d316',
  'b3-master-target-ci-fetch@witan-rubric-v27-prospective-2026-10-19':
    '087aca30f7590afba5d9c6004a72d3b9c42dcab71fd0df75aa0e0d1614978b44',
  'b3-monorepo-root-print-only@witan-rubric-v17-2026-07-24':
    'c5a11cff205543bded3bbdd684d7364168df3db26d71af52885cc9f6f4e3b042',
  'b3-monorepo-root-print-only@witan-rubric-v18-prospective-2026-07-25':
    'c5a11cff205543bded3bbdd684d7364168df3db26d71af52885cc9f6f4e3b042',
  'b3-monorepo-root-print-only@witan-rubric-v19-prospective-2026-08-09':
    'c5a11cff205543bded3bbdd684d7364168df3db26d71af52885cc9f6f4e3b042',
  'b3-monorepo-root-print-only@witan-rubric-v20-prospective-2026-08-10':
    'c5a11cff205543bded3bbdd684d7364168df3db26d71af52885cc9f6f4e3b042',
  'b3-monorepo-root-print-only@witan-rubric-v21-prospective-2026-08-10':
    'c5a11cff205543bded3bbdd684d7364168df3db26d71af52885cc9f6f4e3b042',
  'b3-monorepo-root-print-only@witan-rubric-v22-prospective-2026-08-10':
    'c5a11cff205543bded3bbdd684d7364168df3db26d71af52885cc9f6f4e3b042',
  'b3-monorepo-root-print-only@witan-rubric-v23-prospective-2026-09-06':
    'c5a11cff205543bded3bbdd684d7364168df3db26d71af52885cc9f6f4e3b042',
  'b3-monorepo-root-print-only@witan-rubric-v24-prospective-2026-09-15':
    'c5a11cff205543bded3bbdd684d7364168df3db26d71af52885cc9f6f4e3b042',
  'b3-monorepo-root-print-only@witan-rubric-v25-prospective-2026-10-12':
    'c5a11cff205543bded3bbdd684d7364168df3db26d71af52885cc9f6f4e3b042',
  'b3-monorepo-root-print-only@witan-rubric-v26-prospective-2026-10-14':
    'dbc5b7c625981fd7810e9995da0387d73c510fac2423e771a301aedf55e5b989',
  'b3-monorepo-root-print-only@witan-rubric-v27-prospective-2026-10-19':
    'c5a11cff205543bded3bbdd684d7364168df3db26d71af52885cc9f6f4e3b042',
};
