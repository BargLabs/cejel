import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { buildWitanInputFromRepo, ciWorkflowCitationLabel } from '../repo-signals.js';
import { WITAN_SELECTABLE_RUBRIC_VERSIONS } from '../rubric-version.js';
import { makeReadsDisclosureRepo } from './fixtures/reads-disclosure.js';
import {
  U1_CROSS_REPO_REUSABLE,
  U2B_COMPOSITE_ACTION_YAML,
  U2_COMPOSITE_ACTION_YML,
  U3_LOCAL_DIRECTORY_WITHOUT_ACTION,
  U4_LOCAL_REUSABLE,
  U5B_TWO_WORKFLOWS_MARKETPLACE_ONLY,
  U5_MARKETPLACE_ACTION_ONLY,
  U6_ONE_OF_EACH,
  UNREAD_CI_DISCLOSURE_FIXTURES,
} from './fixtures/unread-ci-disclosure.js';

// goal_cejel_v26_unread_ci_disclosure_2026-10-14: B3 reads every recognised workflow's commands,
// but a workflow can hand its work to a reusable workflow in another repository or to a local
// composite action, and Cejel reads neither. A test command inside delegated code is unseen, and
// the certificate read as if it were absent. Presentation only, under every selectable rubric: the
// B3 citation that already states how many workflow files were read (#467) now also states how many
// delegated steps were not read. No score, weight, detector, file selection or finding moves.

function scan(files: Readonly<Record<string, string>>, rubricVersion: string) {
  const input = buildWitanInputFromRepo({
    productSlug: 'unread-ci-disclosure-fixture',
    productDisplayName: 'Unread CI disclosure fixture',
    repoPath: makeReadsDisclosureRepo(files),
    generatedAt: '2026-10-14T00:00:00.000Z',
    rubricVersion,
  });
  const signal = (id: string) => (input.signals ?? []).find((s) => s.criterionId === id);
  const labels = (criterion: string) =>
    (signal(criterion)?.positiveEvidence ?? []).map((e) => e.label);
  const component = (criterion: string, metricName: string, label: string) =>
    signal(criterion)
      ?.metrics?.find((m) => m.name === metricName)
      ?.presentation?.components?.find((c) => c.label === label)?.count;
  return { labels, component };
}

const ciLabel = (labels: readonly string[]) => labels.filter((l) => l.startsWith('CI workflow'));

describe.each(WITAN_SELECTABLE_RUBRIC_VERSIONS)('delegated CI that was not read — %s', (rubric) => {
  it('a job calling org/other/.github/workflows/ci.yml@v1 is one reusable workflow in another repository', () => {
    const { labels } = scan(U1_CROSS_REPO_REUSABLE, rubric);
    expect(ciLabel(labels('B3'))).toEqual([
      'CI workflow (1 workflow file read; 1 cited; 1 delegated step not read (1 reusable workflow in another repository))',
    ]);
  });

  it('a step using ./.github/actions/setup-and-test with an action.yml is one composite action', () => {
    const { labels } = scan(U2_COMPOSITE_ACTION_YML, rubric);
    expect(ciLabel(labels('B3'))).toEqual([
      'CI workflow (1 workflow file read; 1 cited; 1 delegated step not read (1 composite action))',
    ]);
  });

  it('action.yaml counts too, and a quoted value, trailing slash and trailing comment do not hide it', () => {
    const { labels } = scan(U2B_COMPOSITE_ACTION_YAML, rubric);
    expect(ciLabel(labels('B3'))).toEqual([
      'CI workflow (1 workflow file read; 1 cited; 1 delegated step not read (1 composite action))',
    ]);
  });

  it('a step using ./.github/actions/x whose directory holds no action.yml or action.yaml is not counted: GitHub cannot run it as an action, so nothing is delegated', () => {
    const { labels } = scan(U3_LOCAL_DIRECTORY_WITHOUT_ACTION, rubric);
    expect(ciLabel(labels('B3'))).toEqual(['CI workflow']);
  });

  it('a local reusable workflow is counted as read and not disclosed', () => {
    const { labels, component } = scan(U4_LOCAL_REUSABLE, rubric);
    expect(ciLabel(labels('B3'))).toEqual(['CI workflow (2 workflow files read; 1 cited)']);
    // Read, not merely counted: the only test command lives in the called workflow, and B3 sees it.
    expect(component('B3', 'ci_script_depth', 'repository CI command: test')).toBe(1);
  });

  it('uses: actions/checkout@v4 is not counted', () => {
    const { labels } = scan(U5_MARKETPLACE_ACTION_ONLY, rubric);
    expect(ciLabel(labels('B3'))).toEqual(['CI workflow']);
  });

  it('zero delegated steps add nothing to the #467 count, and a uses: line inside a run script is not a step', () => {
    const { labels } = scan(U5B_TWO_WORKFLOWS_MARKETPLACE_ONLY, rubric);
    expect(ciLabel(labels('B3'))).toEqual(['CI workflow (2 workflow files read; 1 cited)']);
  });

  it('one of each kind across two workflows states both; a commented-out delegation is not counted', () => {
    const { labels } = scan(U6_ONE_OF_EACH, rubric);
    expect(ciLabel(labels('B3'))).toEqual([
      'CI workflow (2 workflow files read; 1 cited; 2 delegated steps not read (1 reusable workflow in another repository, 1 composite action))',
    ]);
  });

  it('A3 and B2 count workflow paths and read no step, so their citations carry no delegated count', () => {
    const { labels } = scan(U6_ONE_OF_EACH, rubric);
    expect(ciLabel(labels('A3'))).toEqual(['CI workflow (2 workflow files counted; 1 cited)']);
    expect(labels('B2').filter((l) => l.startsWith('Pull-request CI workflow'))).toEqual([
      'Pull-request CI workflow',
      'Pull-request CI workflow',
    ]);
  });
});

describe('the delegated-step clause stays within the 180-character evidence label cap', () => {
  const ALL_WITHHELD_REASONS = new Map([
    ['denied_path', 2500],
    ['non_regular_file', 2500],
    ['too_large', 2500],
    ['unreadable', 2499],
  ] as const);

  it('states each kind when the label fits', () => {
    expect(
      ciWorkflowCitationLabel('CI workflow', 'read', 3, 1, new Map(), {
        crossRepositoryReusableWorkflows: 2,
        compositeActions: 3,
      }),
    ).toBe(
      'CI workflow (3 workflow files read; 1 cited; 5 delegated steps not read (2 reusable workflows in other repositories, 3 composite actions))',
    );
  });

  it('drops only the per-kind breakdown, never the count, when the label would not fit', () => {
    const label = ciWorkflowCitationLabel(
      'CI workflow (monorepo root)',
      'read',
      9999,
      1,
      ALL_WITHHELD_REASONS,
      { crossRepositoryReusableWorkflows: 4999, compositeActions: 5000 },
    );
    expect(label).toBe(
      'CI workflow (monorepo root) (9999 workflow files read; 1 cited; 9999 not read (denied_path, non_regular_file, too_large, unreadable); 9999 delegated steps not read)',
    );
    expect(label.length).toBeLessThanOrEqual(180);
  });
});

// The identity proof. Each digest is over every UNREAD_CI_DISCLOSURE_FIXTURES report under one
// rubric, with only evidence labels (where the disclosure lives) and the behaviour fingerprint (which
// moves whenever the behaviour corpus is re-pinned, for reasons unrelated to these fixtures) removed.
// Captured on origin/main 902ae662, before this change. Every metric, weight, score, status and
// finding is inside the digest, so equality here is the "nothing but presentation moved" claim.
const LABEL_FREE_PINS: Readonly<Record<string, string>> = {
  'witan-rubric-v17-2026-07-24': '08779e05c889077ff87936f530e6022cde1f370beb3294d1dfffcc5922798ac6',
  'witan-rubric-v18-prospective-2026-07-25':
    'd1dce1c5b7f4af027cfac582ea3c6d7e0e48aa8e72a4a090ed396aba202be5e7',
  'witan-rubric-v19-prospective-2026-08-09':
    '8d1a2636f83cf3eabdf76facb86854836469aed3dbab870a7d7b0dca3c508326',
  'witan-rubric-v20-prospective-2026-08-10':
    '6c5e463ba009aee50ca13222cffcd01ed612571337ff1ed0c6a1a27724f3ba51',
  'witan-rubric-v21-prospective-2026-08-10':
    '70134138c38598f2a17f9b8e0767576b25c4a2a4bb24614c0137e3c672d20781',
  'witan-rubric-v22-prospective-2026-08-10':
    'aacef2cbe4c764cbfecc3a8f843d735a96cfa45aea2c539534c7189cf5ce8f77',
  'witan-rubric-v23-prospective-2026-09-06':
    '5562579527d4bc052688be580cca83f8a15367ba4acbc4f50996259cee7d9668',
  'witan-rubric-v24-prospective-2026-09-15':
    '017bba1e79cabbcf949fdbf93a56325e25d047e7d444236933b44434f63dc107',
  'witan-rubric-v25-prospective-2026-10-12':
    'e019ca0a7d93164340cebd13655be7e70f2dbc040da937ddd4747abcde5d0371',
  'witan-rubric-v26-prospective-2026-10-14':
    '3da14060e703ba22bc47a96b3d609bd416cfaa9463c3188c66fbd797dff2ec4b',
};

function withoutEvidenceLabels(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutEvidenceLabels);
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  const isEvidencePointer =
    typeof record.kind === 'string' &&
    typeof record.label === 'string' &&
    ('path' in record || 'url' in record || 'contentHash' in record);
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => !(isEvidencePointer && key === 'label'))
      .filter(([key]) => key !== 'rubricBehaviourFingerprint')
      .map(([key, nested]) => [key, withoutEvidenceLabels(nested)]),
  );
}

describe('the disclosure moves nothing but evidence labels', () => {
  it.each(WITAN_SELECTABLE_RUBRIC_VERSIONS)('%s', (rubricVersion) => {
    const reports = Object.entries(UNREAD_CI_DISCLOSURE_FIXTURES).map(([name, files]) =>
      withoutEvidenceLabels(
        scoreRepoWithPublicCejel({
          repoPath: makeReadsDisclosureRepo(files),
          productSlug: name,
          productDisplayName: name,
          generatedAt: '2026-10-14T00:00:00.000Z',
          rubricVersion,
        }),
      ),
    );
    expect(createHash('sha256').update(JSON.stringify(reports)).digest('hex')).toBe(
      LABEL_FREE_PINS[rubricVersion],
    );
  });
});
