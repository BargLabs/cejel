import { isDeepStrictEqual } from 'node:util';

function observationByRole(observations, role) {
  return observations.find((observation) => observation.role === role);
}

export function evaluateCrossArtifactConformancePilot(manifest, observations) {
  const failures = [];
  const defective = observationByRole(observations, 'defective');
  const repair = observationByRole(observations, 'repair');
  const mergedRepair = observationByRole(observations, 'mergedRepair');

  for (const [role, observation] of [
    ['defective', defective],
    ['repair', repair],
    ['mergedRepair', mergedRepair],
  ]) {
    if (!observation) {
      failures.push(`missing_observation:${role}`);
      continue;
    }
    const subject = manifest.subjects.find((candidate) => candidate.role === role);
    if (!subject) {
      failures.push(`missing_manifest_subject:${role}`);
      continue;
    }
    if (observation.revision !== subject.revision) failures.push(`revision_mismatch:${role}`);
    if (observation.reportBlob !== subject.reportBlob) failures.push(`report_blob_mismatch:${role}`);
  }

  if (defective) {
    if (defective.summaries.zero.claimBearing !== true) {
      failures.push('defective_revision_did_not_reproduce_claim_bearing_true');
    }
    if (!isDeepStrictEqual(defective.summaries.zero.refusalReasons, [])) {
      failures.push('defective_revision_refusal_reasons_changed');
    }
  }

  for (const [role, observation] of [
    ['repair', repair],
    ['mergedRepair', mergedRepair],
  ]) {
    if (!observation) continue;
    if (observation.summaries.zero.claimBearing !== false) {
      failures.push(`${role}_did_not_refuse_claim_bearing_output`);
    }
    if (
      !isDeepStrictEqual(
        [...observation.summaries.zero.refusalReasons].sort(),
        [...manifest.expectedRepairRefusalReasons].sort(),
      )
    ) {
      failures.push(`${role}_refusal_reasons_mismatch`);
    }
  }

  for (const [role, observation] of [
    ['defective', defective],
    ['repair', repair],
    ['mergedRepair', mergedRepair],
  ]) {
    if (!observation) continue;
    if (observation.summaries.perfect.claimBearing !== false) {
      failures.push(`${role}_perfect_boundary_did_not_refuse_claim_bearing_output`);
    }
    if (
      !isDeepStrictEqual(
        [...observation.summaries.perfect.refusalReasons].sort(),
        [...manifest.expectedPerfectRefusalReasons].sort(),
      )
    ) {
      failures.push(`${role}_perfect_boundary_refusal_reasons_mismatch`);
    }
  }

  const defectiveSubject = manifest.subjects.find((subject) => subject.role === 'defective');
  const defectivePinsMatch =
    defective &&
    defectiveSubject &&
    defective.revision === defectiveSubject.revision &&
    defective.reportBlob === defectiveSubject.reportBlob;
  const finding =
    defectivePinsMatch &&
    defective?.summaries.zero.claimBearing === true &&
    isDeepStrictEqual(defective.summaries.zero.refusalReasons, [])
    ? {
        ruleId: 'D1-conformance',
        title: 'Declared publication-guard arms did not bind implementation behavior',
        missingArms: manifest.missingArms,
        evidence: {
          declaration: {
            revision: manifest.declaration.revision,
            path: manifest.declaration.path,
          },
          implementation: {
            revision: defective.revision,
            path: manifest.implementationPath,
          },
        },
      }
    : null;

  return {
    schemaVersion: manifest.schemaVersion,
    result: failures.length === 0 && finding ? 'pass' : 'fail',
    denominator: 1,
    findingCount: finding ? 1 : 0,
    findings: finding ? [finding] : [],
    failures,
    observations,
  };
}
