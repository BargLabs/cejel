import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { buildWitanInputFromRepo } from '../repo-signals.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V22,
  WITAN_RUBRIC_VERSION_V23,
  WITAN_RUBRIC_VERSION_V25,
} from '../rubric-version.js';
import {
  F1_TEN_WORKFLOWS,
  F2_ONE_WORKFLOW,
  F3_WORKSPACE_ROOT_WITHOUT_SCRIPTS,
  F4_NO_ROOT_PACKAGE_JSON,
  F5B_TWO_READ_ONE_SKIPPED,
  F5_ONE_WORKFLOW_SKIPPED,
  makeReadsDisclosureRepo,
} from './fixtures/reads-disclosure.js';

// goal_cejel_certificate_reads_disclosure_2026-10-13: the certificate cites one workflow file and
// reads as if only that file was checked, and two metrics read only the root package.json without
// saying so. Presentation only — no score, weight, detector or file selection moves; the
// identity proof lives in the PR, and the F2 byte pin below is its standing form.

const RUBRICS = [
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V22,
  WITAN_RUBRIC_VERSION_V23,
  WITAN_RUBRIC_VERSION_V25,
] as const;

const ROOT_ONLY = 'package scripts for this metric are read from the root package.json only';

function scan(files: Readonly<Record<string, string>>, rubricVersion: string) {
  const input = buildWitanInputFromRepo({
    productSlug: 'reads-disclosure-fixture',
    productDisplayName: 'Reads disclosure fixture',
    repoPath: makeReadsDisclosureRepo(files),
    generatedAt: '2026-10-13T00:00:00.000Z',
    rubricVersion,
  });
  const signal = (id: string) => (input.signals ?? []).find((s) => s.criterionId === id);
  const metric = (criterion: string, name: string) =>
    signal(criterion)?.metrics?.find((m) => m.name === name);
  const labels = (criterion: string) =>
    (signal(criterion)?.positiveEvidence ?? []).map((e) => e.label);
  return { input, signal, metric, labels };
}

describe.each(RUBRICS)('workflow files read vs cited — %s', (rubric) => {
  it('F1: A3, B2 and B3 each state the count beside the citation', () => {
    const { labels } = scan(F1_TEN_WORKFLOWS, rubric);
    expect(labels('A3')).toContain('CI workflow (10 workflow files counted; 1 cited)');
    expect(labels('B2').filter((l) => l.startsWith('Pull-request CI workflow'))).toEqual([
      'Pull-request CI workflow (10 workflow files counted; 3 cited)',
      'Pull-request CI workflow (10 workflow files counted; 3 cited)',
      'Pull-request CI workflow (10 workflow files counted; 3 cited)',
    ]);
    expect(labels('B3')).toContain('CI workflow (10 workflow files read; 1 cited)');
  });

  it('F2: one workflow file adds no disclosure anywhere', () => {
    const { labels } = scan(F2_ONE_WORKFLOW, rubric);
    for (const id of ['A3', 'B2', 'B3']) {
      expect(labels(id).filter((l) => /workflow/i.test(l))).not.toEqual([]);
      for (const label of labels(id)) expect(label).not.toMatch(/cited|not read/);
    }
  });

  it('F5: a workflow skipped by a content-read skip reason is counted as not read, with the reason', () => {
    const { labels } = scan(F5_ONE_WORKFLOW_SKIPPED, rubric);
    expect(labels('B3')).toContain(
      'CI workflow (1 workflow file read; 1 cited; 1 not read (too_large))',
    );
    expect(labels('A3')).toContain(
      'CI workflow (1 workflow file counted; 1 cited; 1 not read (too_large))',
    );
    expect(labels('B2')).toContain(
      'Pull-request CI workflow (1 workflow file counted; 1 cited; 1 not read (too_large))',
    );
  });

  it('F5b: read, cited and not-read are all stated when they differ', () => {
    const { labels } = scan(F5B_TWO_READ_ONE_SKIPPED, rubric);
    expect(labels('B3')).toContain(
      'CI workflow (2 workflow files read; 1 cited; 1 not read (too_large))',
    );
  });
});

describe.each(RUBRICS)('root-only package scripts — %s', (rubric) => {
  it('F3: B3 ci_script_depth states the 7 declared workspace manifests it read; A3 prod_readiness_primitives names them as unread', () => {
    const { metric } = scan(F3_WORKSPACE_ROOT_WITHOUT_SCRIPTS, rubric);
    // goal_cejel_v26_workspace_package_scripts_2026-10-14: F3 declares `workspaces`, so B3 now
    // reads those packages' scripts and says how many. A3's metric component still reads the root.
    expect(metric('B3', 'ci_script_depth')?.presentation?.condition).toBe(
      'package scripts for this metric are read from the root package.json and 7 declared workspace package.json files',
    );
    expect(metric('A3', 'prod_readiness_primitives')?.presentation?.condition).toBe(
      `${ROOT_ONLY}; 7 other package.json files present`,
    );
  });

  it('F4: states that no root package.json was found', () => {
    const { metric } = scan(F4_NO_ROOT_PACKAGE_JSON, rubric);
    expect(metric('B3', 'ci_script_depth')?.presentation?.condition).toBe(
      `no root package.json found; ${ROOT_ONLY}; 3 package.json files present`,
    );
  });

  it('F1 and F2: no other package.json means no statement', () => {
    for (const files of [F1_TEN_WORKFLOWS, F2_ONE_WORKFLOW]) {
      const { metric } = scan(files, rubric);
      expect(metric('B3', 'ci_script_depth')?.presentation?.condition).toBeUndefined();
      expect(metric('A3', 'prod_readiness_primitives')?.presentation?.condition).toBeUndefined();
    }
  });
});

describe('the disclosure moves no score', () => {
  // F2 (one workflow, no nested manifest) is the byte-identity fixture: report bytes captured on
  // origin/main c676ee3, before this change. Any later change to this fixture's report fails here
  // by rubric, so it cannot ship unnoticed.
  const F2_PRE_FIX_PINS: Readonly<Record<string, string>> = {
    [WITAN_RUBRIC_VERSION_V17]: '918da6094f808ed28953538f3f674791daa9a0fb7064482edd45b1bb01adb3d6',
    [WITAN_RUBRIC_VERSION_V22]: 'fc0849540abee436e3dac500e778dbe7177226cf4e460cb6e2bba1be74572b38',
    [WITAN_RUBRIC_VERSION_V23]: '721de1bcd175bb7e8b2d51df8247886430d2df34ddfc9c0458854062420d5cf8',
    [WITAN_RUBRIC_VERSION_V25]: '6f75c0375e8d8f7b7f9192648f68f7c2e1b0d75e2702b039739ecf3979800c5b',
  };
  // Re-pinned 2026-10-14 (goal_cejel_v26_workspace_package_scripts_2026-10-14): the behaviour
  // corpus gained a specimen, so every fingerprint moved. F2 declares no workspace; restoring only
  // the previous fingerprint recovers each previous pin (F2_PRE_WORKSPACE_PINS) byte for byte.
  // Re-pinned again 2026-10-14 (goal_cejel_v26_coverage_config_recognition_2026-10-14): A1
  // coverage recognition widened and the corpus gained three specimens, so every fingerprint moved.
  // F2 has no test file, so no coverage finding; restoring only the previous fingerprint recovers
  // each previous pin (F2_PRE_COVERAGE_PINS) byte for byte.
  // Re-pinned again 2026-10-14 (goal_cejel_v26_test_framework_recognition_2026-10-14): A1
  // test-framework recognition widened and the corpus gained six specimens, so every fingerprint
  // moved. F2 has no test file; restoring only the previous fingerprint recovers each previous pin
  // (F2_PRE_TEST_FRAMEWORK_PINS) byte for byte.
  const F2_PINS: Readonly<Record<string, string>> = {
    [WITAN_RUBRIC_VERSION_V17]: 'ed524ff31db3d6c59d64ed2d3d19ca8832ecefea1a7ae41a3c23f4b528681101',
    [WITAN_RUBRIC_VERSION_V22]: 'd7dcaef606a8c0fb8b3ee03ab1c36ab6e127e446cca8979aea04fe56f01aab26',
    [WITAN_RUBRIC_VERSION_V23]: 'acaa6125dcbdb93bbbb8e3f4d6a550157832d4531280fba2f6fc44c2fa7853dc',
    [WITAN_RUBRIC_VERSION_V25]: '1924bfe4b37d61a809ca9a28edbda5b1a63547e857a14e8f481b9dbe4dbef06c',
  };
  const F2_PRE_TEST_FRAMEWORK_PINS: Readonly<Record<string, string>> = {
    [WITAN_RUBRIC_VERSION_V17]: '0d8a27dafb5fc18d0689bb20061016d42f59e88dc39a8b006e25cf3177e4ef01',
    [WITAN_RUBRIC_VERSION_V22]: 'd3145e9f36cdb5153a3d0d97ae6dcb87147afcb3ef959fad81846ea0ec2045a3',
    [WITAN_RUBRIC_VERSION_V23]: '803ed992ad1c6351dc9b31d2eb63e033c20770503ff7db144d048a62e5a2417e',
    [WITAN_RUBRIC_VERSION_V25]: '95bd3f33131b7fbba3ae0838ce19496a995f3eabb31a58b273c07c977c9f0884',
  };
  const F2_PRE_TEST_FRAMEWORK_FINGERPRINTS: Readonly<Record<string, string>> = {
    [WITAN_RUBRIC_VERSION_V17]: 'sha256:8492999e2ebd981bfd02b63c13217e012d6979c0365017e73be292b8d9dcc03d',
    [WITAN_RUBRIC_VERSION_V22]: 'sha256:da495e0290df89b2c0e5454bd395e59c5bd5dc98e506418b00b0277322240787',
    [WITAN_RUBRIC_VERSION_V23]: 'sha256:f4a17960b210013e615e93ea1d7333f73879f1a0aed7c80494929760c8e72aef',
    [WITAN_RUBRIC_VERSION_V25]: 'sha256:2ce60ad90a956bf8b26372432b531fa7eaaa48eff8b11ef55ebaac81bc791c21',
  };
  const F2_PRE_COVERAGE_PINS: Readonly<Record<string, string>> = {
    [WITAN_RUBRIC_VERSION_V17]: '61181547342c5722b8bebd2ab28d098ede319806c9afc60cbee61417e220d432',
    [WITAN_RUBRIC_VERSION_V22]: '7541c3094a15c85a3b0d464ceaf70e309665757dac6348a42712a96d1de8aa0c',
    [WITAN_RUBRIC_VERSION_V23]: '99add7fb224a9c65e1e63afae71f6aba1340b7fea732817b26dd15e3f4a674f2',
    [WITAN_RUBRIC_VERSION_V25]: '5d3de808b38ba29f6438244502f75641e6f4262f50f5a49e009df3306e340833',
  };
  const F2_PRE_COVERAGE_FINGERPRINTS: Readonly<Record<string, string>> = {
    [WITAN_RUBRIC_VERSION_V17]: 'sha256:79fe791e46563e2b8524fbc92ab0acab4dc67946870083a4b42186a9e3799bbf',
    [WITAN_RUBRIC_VERSION_V22]: 'sha256:3efa6907cf365294e4180332d4d55685532f3beb59454ae73856c9360028389c',
    [WITAN_RUBRIC_VERSION_V23]: 'sha256:6410874e6fb44c1ac29b3fcac49c57799a2eb13bd50444c3a7ce93ebf556577f',
    [WITAN_RUBRIC_VERSION_V25]: 'sha256:909235faa0171fd3201c58d1024283259db0b0916c809557df9fb491282a99e3',
  };
  const F2_PRE_WORKSPACE_PINS: Readonly<Record<string, string>> = {
    [WITAN_RUBRIC_VERSION_V17]: '2e5b2a1160a6ec34267c04baa74e592e09e859e1bdea050bdc73ba22b37099b8',
    [WITAN_RUBRIC_VERSION_V22]: '280ea620c113013ff2dffbdcd2ff0475b2b081ac01454093f02619eafb331c1c',
    [WITAN_RUBRIC_VERSION_V23]: '855e4b3a39b4991155650fb9b88c60c91846925360bbec111419609d49010dab',
    [WITAN_RUBRIC_VERSION_V25]: 'db6a8fba79cae342f074c7c08e5a44bf44e1d5afcc92b2a0adca9faf4fd875a2',
  };
  const F2_PRE_WORKSPACE_FINGERPRINTS: Readonly<Record<string, string>> = {
    [WITAN_RUBRIC_VERSION_V17]: 'sha256:6a31f7cb96ebf17046ba0620d74b1fadb66582c4b4ae5cb0b5af04480df6dbf2',
    [WITAN_RUBRIC_VERSION_V22]: 'sha256:ac4db093dc7c37369579b49ccd7855d36eec49d9f52136964251ee7bbd69e101',
    [WITAN_RUBRIC_VERSION_V23]: 'sha256:7d48de4ac8ef3233e7ef8f4d4312830bf76294485e9766a47a671cd5440676aa',
    [WITAN_RUBRIC_VERSION_V25]: 'sha256:31a751882d02c8f053dcc8f3e90b3e4ecd57279f3250e420e95a3af875b9f019',
  };
  const F2_PRE_FIX_FINGERPRINTS: Readonly<Record<string, string>> = {
    [WITAN_RUBRIC_VERSION_V17]: 'sha256:d621dcbbd44a47b2272417e85c9b60d0116471ce2833679728bcf1cef159bf23',
    [WITAN_RUBRIC_VERSION_V22]: 'sha256:643a5110761581aef265ce73dbe38d9325ed3058e6d6ff5d3c836fb727caf5d1',
    [WITAN_RUBRIC_VERSION_V23]: 'sha256:f7bace88af1acd1048639f2cb2747e0c51a928164de7716360de5ab61bb214be',
    [WITAN_RUBRIC_VERSION_V25]: 'sha256:a7dfc0a75e34adc8566614422bbac4ed743d03086840513b4ab708ca43d92999',
  };
  it.each(RUBRICS)('F2 fingerprint change is the only report byte difference — %s', (rubricVersion) => {
    const report = scoreRepoWithPublicCejel({
      repoPath: makeReadsDisclosureRepo(F2_ONE_WORKFLOW),
      productSlug: 'f2-one-workflow',
      productDisplayName: 'f2-one-workflow',
      generatedAt: '2026-10-13T00:00:00.000Z',
      rubricVersion,
    });
    expect(createHash('sha256').update(JSON.stringify(report)).digest('hex')).toBe(
      F2_PINS[rubricVersion],
    );
    const preTestFramework = { ...report, rubricBehaviourFingerprint: F2_PRE_TEST_FRAMEWORK_FINGERPRINTS[rubricVersion] };
    expect(createHash('sha256').update(JSON.stringify(preTestFramework)).digest('hex'))
      .toBe(F2_PRE_TEST_FRAMEWORK_PINS[rubricVersion]);
    const preCoverage = { ...report, rubricBehaviourFingerprint: F2_PRE_COVERAGE_FINGERPRINTS[rubricVersion] };
    expect(createHash('sha256').update(JSON.stringify(preCoverage)).digest('hex'))
      .toBe(F2_PRE_COVERAGE_PINS[rubricVersion]);
    const preWorkspace = { ...report, rubricBehaviourFingerprint: F2_PRE_WORKSPACE_FINGERPRINTS[rubricVersion] };
    expect(createHash('sha256').update(JSON.stringify(preWorkspace)).digest('hex'))
      .toBe(F2_PRE_WORKSPACE_PINS[rubricVersion]);
    // Preserve #467's byte guard: restoring only the pre-fix fingerprint recovers its pin.
    const restored = { ...report, rubricBehaviourFingerprint: F2_PRE_FIX_FINGERPRINTS[rubricVersion] };
    expect(createHash('sha256').update(JSON.stringify(restored)).digest('hex'))
      .toBe(F2_PRE_FIX_PINS[rubricVersion]);
  });
});
