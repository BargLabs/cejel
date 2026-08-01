import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateCrossArtifactConformancePilot } from './d-series-cross-artifact-conformance-lib.mjs';

const manifest = JSON.parse(
  readFileSync(
    resolve(
      'docs/experiments/d-series-cross-artifact-conformance-pilot-manifest-2026-08-01.json',
    ),
    'utf8',
  ),
);

function observation(
  role,
  zeroClaimBearing,
  zeroRefusalReasons,
  perfectClaimBearing = false,
  perfectRefusalReasons = manifest.expectedPerfectRefusalReasons,
) {
  const subject = manifest.subjects.find((candidate) => candidate.role === role);
  assert.ok(subject);
  return {
    role,
    revision: subject.revision,
    reportBlob: subject.reportBlob,
    summaries: {
      zero: { claimBearing: zeroClaimBearing, refusalReasons: zeroRefusalReasons },
      perfect: { claimBearing: perfectClaimBearing, refusalReasons: perfectRefusalReasons },
    },
  };
}

test('accepts the frozen defective and repaired boundary behavior', () => {
  const result = evaluateCrossArtifactConformancePilot(manifest, [
    observation('defective', true, []),
    observation('repair', false, manifest.expectedRepairRefusalReasons),
    observation('mergedRepair', false, manifest.expectedRepairRefusalReasons),
  ]);

  assert.equal(result.result, 'pass');
  assert.equal(result.denominator, 1);
  assert.equal(result.findingCount, 1);
  assert.deepEqual(result.findings[0].missingArms, manifest.missingArms);
  assert.deepEqual(result.findings[0].evidence, {
    declaration: {
      revision: manifest.declaration.revision,
      path: manifest.declaration.path,
    },
    implementation: {
      revision: manifest.subjects[0].revision,
      path: manifest.implementationPath,
    },
  });
});

test('fails when either repair still permits claim-bearing output', () => {
  const result = evaluateCrossArtifactConformancePilot(manifest, [
    observation('defective', true, []),
    observation('repair', true, []),
    observation('mergedRepair', false, manifest.expectedRepairRefusalReasons),
  ]);

  assert.equal(result.result, 'fail');
  assert.match(result.failures.join('\n'), /repair_did_not_refuse_claim_bearing_output/);
  assert.match(result.failures.join('\n'), /repair_refusal_reasons_mismatch/);
});

test('fails instead of inventing a finding when the defective observation is absent', () => {
  const result = evaluateCrossArtifactConformancePilot(manifest, [
    observation('repair', false, manifest.expectedRepairRefusalReasons),
    observation('mergedRepair', false, manifest.expectedRepairRefusalReasons),
  ]);

  assert.equal(result.result, 'fail');
  assert.equal(result.findingCount, 0);
  assert.match(result.failures.join('\n'), /missing_observation:defective/);
});

test('fails without a finding when the defective zero boundary does not reproduce', () => {
  const result = evaluateCrossArtifactConformancePilot(manifest, [
    observation('defective', false, manifest.expectedRepairRefusalReasons),
    observation('repair', false, manifest.expectedRepairRefusalReasons),
    observation('mergedRepair', false, manifest.expectedRepairRefusalReasons),
  ]);

  assert.equal(result.result, 'fail');
  assert.equal(result.findingCount, 0);
  assert.match(
    result.failures.join('\n'),
    /defective_revision_did_not_reproduce_claim_bearing_true/,
  );
});

test('fails when the implemented perfect arm does not refuse', () => {
  const result = evaluateCrossArtifactConformancePilot(manifest, [
    observation('defective', true, [], true, []),
    observation('repair', false, manifest.expectedRepairRefusalReasons),
    observation('mergedRepair', false, manifest.expectedRepairRefusalReasons),
  ]);

  assert.equal(result.result, 'fail');
  assert.match(
    result.failures.join('\n'),
    /defective_perfect_boundary_did_not_refuse_claim_bearing_output/,
  );
});

test('suppresses the conformance finding when the defective revision pin changes', () => {
  const defective = observation('defective', true, []);
  defective.revision = 'f'.repeat(40);
  const result = evaluateCrossArtifactConformancePilot(manifest, [
    defective,
    observation('repair', false, manifest.expectedRepairRefusalReasons),
    observation('mergedRepair', false, manifest.expectedRepairRefusalReasons),
  ]);

  assert.equal(result.result, 'fail');
  assert.equal(result.findingCount, 0);
  assert.match(result.failures.join('\n'), /revision_mismatch:defective/);
});
