import { createHash } from 'node:crypto';
import {
  type Dirent,
  lstatSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { basename, dirname, extname, join, posix, relative, resolve, sep } from 'node:path';

import { MAX_REPOSITORY_CONTENT_BYTES } from '../filesystem-limits.js';
import { sanitizePresentationLine } from '../presentation-safety.js';

import { WITAN_RUBRIC_VERSION, WITAN_RUBRIC_VERSION_V8 } from './schemas.js';
import type {
  WitanCriterionMetric,
  WitanCriterionId,
  WitanCriterionSignal,
  WitanCriterionSignalPayload,
  WitanEvidencePointer,
  WitanFinding,
  WitanRepoArchetype,
  WitanReportInputPayload,
  WitanWithheldPath,
} from './schemas.js';

import {
  abstainSignalOnWithheldPaths,
  classifyAbstentionReason,
  type ContentReadSkipReason,
  contentReadSignalKey,
  isGitLfsPointerText,
  readRepoText,
  readRepoTextPrefix,
  recordContentSkip,
  recordFilesystemSkip,
  registerWithheldRepoPath,
  trackContentReads,
  type TrackedContentReads,
  withContentReadCriterion,
  withContentReadSignal,
  withContentReadSignals,
  withheldRepoPaths,
  withoutContentReadAttribution,
} from './content-reads.js';

import {
  WITAN_A2_PLACEHOLDER_SET_ASIDE_PREFIX,
  WITAN_A2_TENANT_ISOLATION_UNSETTLED_DISCLOSURE,
  WITAN_B3_UNSHOWN_CHECK_PREFIX,
  WITAN_A3_BUILD_STEP_UNSETTLED_DISCLOSURE,
  WITAN_A5_RECONCILIATION_UNSETTLED_DISCLOSURE,
  WITAN_AUTHENTICATED_A1_ABSENCE_SUMMARY,
  WITAN_DIRECTORY_WALK_AUTHENTICATED_A1_ABSENCE_SUMMARY,
  WITAN_LEGACY_AUTHENTICATED_A1_ABSENCE_SUMMARY,
  WITAN_NO_MEASUREMENT_REASON,
} from './abstention.js';
import type { CertificateMetricName } from './certificate-presentation.js';
import {
  describeGitFailure,
  execGit,
  isExpectedGitAbsence,
  type GitExecResult,
} from './git-exec.js';
import { isShallowRepository } from './history-depth.js';
import { stripBom } from './json-safe.js';
import {
  WITAN_RUBRIC_VERSION_V9,
  WITAN_RUBRIC_VERSION_V10,
  WITAN_RUBRIC_VERSION_V11,
  WITAN_RUBRIC_VERSION_V12,
  WITAN_RUBRIC_VERSION_V13,
  WITAN_RUBRIC_VERSION_V14,
  WITAN_RUBRIC_VERSION_V15,
  WITAN_RUBRIC_VERSION_V16,
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V18,
  WITAN_RUBRIC_VERSION_V19,
  WITAN_RUBRIC_VERSION_V20,
  WITAN_RUBRIC_VERSION_V21,
  WITAN_RUBRIC_VERSION_V22,
  WITAN_RUBRIC_VERSION_V23,
  WITAN_RUBRIC_VERSION_V24,
  WITAN_RUBRIC_VERSION_V25,
  WITAN_RUBRIC_VERSION_V26,
  WITAN_RUBRIC_VERSION_V27,
} from './rubric-version.js';

function usesV17DetectorClosure(rubricVersion: string): boolean {
  return (
    rubricVersion === WITAN_RUBRIC_VERSION_V17 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V27 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V18 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V19 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V20 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V21 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V22 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V23 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V24 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V25 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V26
  );
}

// witan-rubric-v27's one gate (#517, #518, #519, #520, #442). Checked against V27 alone and never
// inherited: v17 (the public default) and v18-v26 stay byte-stable. v27 is otherwise v17's
// closure (it appears beside V17 in every comparison above and in scoring.ts). See the
// WITAN_RUBRIC_VERSION_V27 declaration in rubric-version.ts.
export function usesV27FalseAssuranceClosure(rubricVersion: string): boolean {
  return rubricVersion === WITAN_RUBRIC_VERSION_V27;
}

interface InventoryScanPatternSet {
  readonly id: string;
  readonly count: number;
}

interface InventoryAbsenceContext {
  readonly rubricGeneration: 'legacy' | 'current';
  readonly inventoryProvenance: 'tracked-scan-eligible' | 'directory-walk';
}

interface InventoryAbsenceSummaries {
  readonly legacy: string;
  readonly currentTracked: string;
  readonly currentDirectoryWalk: string;
}

const LEGACY_INVENTORY_ABSENCE_CONTEXT: InventoryAbsenceContext = {
  rubricGeneration: 'legacy',
  inventoryProvenance: 'directory-walk',
};

// Stable, public identities for the exact matcher families behind native current-tree
// absence findings. `count` is the number of independently evaluated pattern/classifier
// branches in that versioned set; changing a branch requires a new ID.
const INVENTORY_SCAN_PATTERN_SETS = {
  a1AuthenticatedAbsence: {
    id: 'cejel.core-a1.test-integrity-surface.v1',
    count: 4,
  },
  a1ConcreteTests: {
    id: 'cejel.core-a1.concrete-test-files.v1',
    count: 16,
  },
  // v1 (10 branches, every rubric but v23) and v2 (14, v23) were retired on 2026-10-14
  // (goal_cejel_v26_coverage_config_recognition_2026-10-14), when v23's command-flag recognition
  // and eleven documented configuration locations shipped under every rubric. Branches, counted
  // the way v2 counted runners (one runner-flag branch however many runners it knows):
  //   configuration (19): nyc/c8/coverage/codecov .json|.yml|.yaml; .coveragerc; lcov.info;
  //     .coveralls.yml; vitest.config coverage with disabled values; jest.config coverage keys;
  //     pyproject [tool.coverage]; package.json nyc/c8/istanbul objects; .codecov.yml|.yaml;
  //     .nycrc family; .c8rc family; setup.cfg/tox.ini [coverage:run|report]; package.json
  //     "jest" coverage keys; vite.config test.coverage; .simplecov; phpunit <coverage>; JaCoCo
  //     in pom.xml; JaCoCo in build.gradle(.kts); tarpaulin.toml.
  //   commands (6): CI run steps; reachable package scripts; reachable Make/just recipes; tracked
  //     shell wrappers; coverage-tool invocation; runner coverage flags.
  // v4 is those 25. v3 adds the four v17 heuristics v23 replaced rather than kept: a bare
  // `coverage:` key in vitest.config, a jest.config coverage key of any value, a package script
  // anywhere invoking nyc/c8/istanbul, and a script named `coverage`.
  a1CoverageConfigurationV3: {
    id: 'cejel.core-a1.coverage-configuration.v3',
    count: 29,
  },
  a1CoverageConfigurationV4: {
    id: 'cejel.core-a1.coverage-configuration.v4',
    count: 25,
  },
  a2CurrentSecret: {
    id: 'cejel.core-a2.current-secret-shape.v1',
    count: 3,
  },
  a2RlsPolicy: {
    id: 'cejel.core-a2.rls-policy.v1',
    count: 3,
  },
  a3CiOrReleaseDeploy: {
    id: 'cejel.core-a3.ci-or-release-deploy.v1',
    count: 12,
  },
  a4Lockfile: {
    id: 'cejel.core-a4.lockfile.v1',
    count: 11,
  },
  a5ClaimRealityArtifact: {
    id: 'cejel.core-a5.claim-reality-artifact.v1',
    count: 3,
  },
  // v26 item 6: the one path the repository itself declared, looked up in the inventory.
  a5DeclaredClaimArtifactPath: {
    id: 'cejel.core-a5.declared-claim-artifact-path.v1',
    count: 1,
  },
} as const satisfies Record<string, InventoryScanPatternSet>;

function inventoryScanDerivation(
  inventoryCount: number,
  patternSet: InventoryScanPatternSet,
  matchCount: number,
): NonNullable<WitanFinding['derivation']> {
  return {
    kind: 'inventory-scan',
    inventoryScope: 'tracked-scan-eligible',
    inventoryCount,
    patternSetId: patternSet.id,
    patternCount: patternSet.count,
    matchCount,
  };
}

function inventoryAbsenceFinding(options: {
  readonly severity: WitanFinding['severity'];
  readonly summaries: InventoryAbsenceSummaries;
  readonly evidence: WitanEvidencePointer;
  readonly context: InventoryAbsenceContext;
  readonly inventoryCount: number;
  readonly patternSet: InventoryScanPatternSet;
  readonly matchCount: number;
}): WitanFinding {
  const { context, summaries } = options;
  const summary =
    context.rubricGeneration === 'legacy'
      ? summaries.legacy
      : context.inventoryProvenance === 'tracked-scan-eligible'
        ? summaries.currentTracked
        : summaries.currentDirectoryWalk;
  const emitsDerivation =
    context.rubricGeneration === 'current' &&
    context.inventoryProvenance === 'tracked-scan-eligible';
  return {
    severity: options.severity,
    summary,
    evidence: options.evidence,
    ...(emitsDerivation
      ? {
          derivation: inventoryScanDerivation(
            options.inventoryCount,
            options.patternSet,
            options.matchCount,
          ),
        }
      : {}),
  };
}

// Additive domain-signal extension point (goal_cejel_public_extraction_ip_scrub_2026-07-10):
// a collector appends one extra criterion signal computed from the same repo file inventory.
// This generic seam is what keeps domain-specific rule packs out of this general scanner
// entirely — a pack plugs in at the call site instead of being imported here.
export type WitanDomainSignalCollector = (
  repoPath: string,
  repoFiles: readonly string[],
) => WitanCriterionSignalPayload;

export interface BuildWitanInputOptions {
  productSlug: string;
  productDisplayName: string;
  repoPath: string;
  rubricVersion?: string;
  generatedAt?: string;
  additionalSignals?: readonly WitanCriterionSignal[];
  // Additive domain-profile opt-in. Never set automatically — collectRepoSignals' default
  // A1-B6 pass is unaffected either way. Each collector appends its own native signal; the
  // caller is responsible for also scoring against a rubric that includes the collector's
  // criterion so the extra signal actually surfaces in the report.
  domainCollectors?: readonly WitanDomainSignalCollector[];
}

// A repository content skip is a read FAILURE (Cejel expected to read something and could not)
// only for 'unreadable'/'denied_path', or when no reason was recorded at all — the historical
// conservative default. 'too_large', 'excluded_by_extension', and 'non_regular_file' are
// self-imposed coverage limits Cejel chose itself and must be described and scored differently
// (goal_cejel_0_4_8_abstention_scoring_fix_2026-09-08): disclosed, never a "could not be read"
// claim, and never counted as evidence loss in the composite.
function wholesaleCriterionAbstention(
  signal: WitanCriterionSignalPayload,
  reasons?: ReadonlySet<ContentReadSkipReason>,
): WitanCriterionSignalPayload {
  const { insufficientDataReason } = classifyAbstentionReason(reasons);
  return {
    criterionId: signal.criterionId,
    positiveEvidence: [],
    findings: [],
    metrics: [],
    insufficientData: true as const,
    ...(insufficientDataReason !== undefined ? { insufficientDataReason } : {}),
    // What the collector read and set aside is still true of the content it did read.
    ...(signal.disclosures ? { disclosures: signal.disclosures } : {}),
    notes:
      insufficientDataReason !== undefined
        ? 'Cejel abstained on this criterion because relevant repository content was declined under the repository content size limit or excluded from scanning by policy. This is a disclosed coverage limit, not a read failure, and does not affect the composite score.'
        : reasons?.size === 1 && reasons.has('lfs_pointer')
          ? 'Cejel abstained on this criterion because relevant files in this checkout are Git LFS pointers, so their content was not read. Fetch the LFS content (git lfs pull) and re-scan.'
          : 'Cejel abstained on this criterion because one or more relevant repository files could not be read. Resolve the content-read limitations and re-scan.',
  };
}

/** Union of every skip reason recorded against a criterion, whether unattributed or signal-scoped. */
function skipReasonsForCriterion(
  criterionId: WitanCriterionId,
  tracked: Pick<
    TrackedContentReads<unknown>,
    'criterionSkipReasons' | 'signalSkipReasons'
  >,
): Set<ContentReadSkipReason> {
  const combined = new Set<ContentReadSkipReason>(tracked.criterionSkipReasons.get(criterionId) ?? []);
  const prefix = contentReadSignalKey(criterionId, '');
  for (const [key, reasons] of tracked.signalSkipReasons) {
    if (!key.startsWith(prefix)) continue;
    for (const reason of reasons) combined.add(reason);
  }
  return combined;
}

/** Union of every skip reason recorded against a specific named signal within a criterion. */
function skipReasonsForSignal(
  criterionId: WitanCriterionId,
  signalName: string,
  tracked: Pick<TrackedContentReads<unknown>, 'signalSkipReasons'>,
): Set<ContentReadSkipReason> | undefined {
  const reasons = tracked.signalSkipReasons.get(contentReadSignalKey(criterionId, signalName));
  return reasons ? new Set(reasons) : undefined;
}

export function buildWitanInputFromRepo(options: BuildWitanInputOptions): WitanReportInputPayload {
  const rubricVersion = options.rubricVersion ?? WITAN_RUBRIC_VERSION;
  const tracked = trackContentReads(
    options.repoPath,
    () => buildWitanInputFromRepoUntracked(options),
    { lfsPointerAbstention: usesV27FalseAssuranceClosure(rubricVersion) },
  );
  const affectedCriteria = tracked.affectedCriteria;

  // v17 and v22 (and every other rubric) keep the exact pre-v23 wholesale-wipe behavior below,
  // byte-for-byte — this branch is untouched by the per-signal work
  // (goal_cejel_v23_per_signal_abstention_2026-09-06).
  if (rubricVersion !== WITAN_RUBRIC_VERSION_V23) {
    const readFailureCriteria: WitanCriterionId[] = [];
    const coverageLimitedCriteria: WitanCriterionId[] = [];
    // v27 (#519): a criterion whose only skips are Git LFS pointer reads keeps a critical finding
    // its collector made, rather than abstaining. Pointer text (an oid and a size) cannot produce a
    // critical finding, and an abstention there would let a pointer-shaped file erase a confirmed
    // one. Such a criterion scores exactly as v17 does, and is dropped from
    // contentReadSummary.affectedCriteria, since it did not abstain. A not-applicable result is
    // NOT kept: applicability is decided from what a collector fails to find in content, and a
    // pointer is content it did not read.
    const lfsKept = new Set<WitanCriterionId>();
    const signals = (tracked.value.signals ?? []).map((signal) => {
      if (!affectedCriteria.has(signal.criterionId)) return signal;
      const reasons = skipReasonsForCriterion(signal.criterionId, tracked);
      if (
        usesV27FalseAssuranceClosure(rubricVersion) &&
        reasons.size > 0 &&
        [...reasons].every((reason) => reason === 'lfs_pointer') &&
        (signal.findings ?? []).some(({ severity }) => severity === 'critical')
      ) {
        lfsKept.add(signal.criterionId);
        return signal;
      }
      const { insufficientDataReason } = classifyAbstentionReason(reasons);
      (insufficientDataReason !== undefined ? coverageLimitedCriteria : readFailureCriteria).push(
        signal.criterionId,
      );
      return wholesaleCriterionAbstention(signal, reasons);
    });
    const scanLimitations = [...(tracked.value.scanLimitations ?? [])];
    if (readFailureCriteria.length > 0 && scanLimitations.length < 16) {
      scanLimitations.push(
        `${readFailureCriteria.length} ${readFailureCriteria.length === 1 ? 'criterion' : 'criteria'} abstained because relevant repository content could not be read. Counts and errno classes are recorded in contentReadSummary; file paths are intentionally omitted.`,
      );
    }
    if (coverageLimitedCriteria.length > 0 && scanLimitations.length < 16) {
      scanLimitations.push(
        `${coverageLimitedCriteria.length} ${coverageLimitedCriteria.length === 1 ? 'criterion' : 'criteria'} abstained because relevant repository content was declined under the repository content size limit or excluded from scanning by policy — a disclosed coverage limit, not a read failure. This does not affect the composite score.`,
      );
    }
    return {
      ...tracked.value,
      signals,
      ...(scanLimitations.length > 0 ? { scanLimitations } : {}),
      contentReadSummary:
        lfsKept.size > 0
          ? {
              ...tracked.summary,
              affectedCriteria: tracked.summary.affectedCriteria.filter((id) => !lfsKept.has(id)),
            }
          : tracked.summary,
    };
  }

  // v23: attach abstention to the signal(s) whose own inputs were unreadable, not to the whole
  // criterion. A criterion only falls back to the wholesale wipe above when a skip inside it
  // could NOT be attributed to one named signal (tracked.unattributedCriteria) — that keeps the
  // conservative, honest default for every criterion this goal did not instrument (only A1's
  // coverage_percent and non_hollow_test_share signals are signal-scoped today).
  const wholesaleAbstainedReadFailureCriteria: WitanCriterionId[] = [];
  const wholesaleAbstainedCoverageLimitedCriteria: WitanCriterionId[] = [];
  const partiallyAbstainedReadFailureSignals: string[] = [];
  const partiallyAbstainedLargeFileSignals: string[] = [];
  const partiallyAbstainedOtherCoverageLimitedSignals: string[] = [];
  const signals = (tracked.value.signals ?? []).map((signal) => {
    if (!affectedCriteria.has(signal.criterionId)) return signal;
    if (tracked.unattributedCriteria.has(signal.criterionId)) {
      const reasons = tracked.criterionSkipReasons.get(signal.criterionId);
      const { insufficientDataReason } = classifyAbstentionReason(reasons);
      (insufficientDataReason !== undefined
        ? wholesaleAbstainedCoverageLimitedCriteria
        : wholesaleAbstainedReadFailureCriteria
      ).push(signal.criterionId);
      return wholesaleCriterionAbstention(signal, reasons);
    }
    const prefix = contentReadSignalKey(signal.criterionId, '');
    const affectedNames = [...tracked.affectedSignals]
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
    if (affectedNames.length === 0) {
      // Invariant: affectedCriteria only grows alongside affectedSignals or
      // unattributedCriteria (content-reads.ts), so this should be unreachable — fall back to
      // the conservative wipe rather than silently trust an inconsistent tracker.
      wholesaleAbstainedReadFailureCriteria.push(signal.criterionId);
      return wholesaleCriterionAbstention(signal);
    }
    const affectedNameSet = new Set(affectedNames);
    const metrics = (signal.metrics ?? []).filter((metric) => !affectedNameSet.has(metric.name));
    const anythingSurvives =
      metrics.length > 0 ||
      (signal.positiveEvidence?.length ?? 0) > 0 ||
      (signal.findings?.length ?? 0) > 0;
    const droppedReasons = new Set<ContentReadSkipReason>();
    for (const name of affectedNames) {
      for (const reason of skipReasonsForSignal(signal.criterionId, name, tracked) ?? []) {
        droppedReasons.add(reason);
      }
    }
    if (!anythingSurvives) {
      const { insufficientDataReason } = classifyAbstentionReason(droppedReasons);
      (insufficientDataReason !== undefined
        ? wholesaleAbstainedCoverageLimitedCriteria
        : wholesaleAbstainedReadFailureCriteria
      ).push(signal.criterionId);
      return wholesaleCriterionAbstention(signal, droppedReasons);
    }
    // 'too_large' gets its own bucket (named separately from the general coverage-limit bucket
    // below): a large implementation file that exceeded the read limit is a case where the
    // tree's own conclusion (no evidence found for this signal) is defensible about what was
    // read and misleading about the file that was not
    // (goal_cejel_certificate_scope_disclosure_0_4_9_2026-09-14).
    //
    // Classified per NAME, from that name's own skip reasons — not from droppedReasons above,
    // which is the UNION across every affected name in this signal. A signal whose predicate
    // matched an oversized file for one name and a separately extension-excluded file for
    // another has two names with two different, individually unambiguous reasons; classifying
    // the union once and routing every name through that single verdict mislabeled the second
    // name with the first name's cause. Only split at the per-signal/per-name level, not the
    // wholesale level above: 'too_large' only ever reaches classifyAbstentionReason here, via
    // abstainSignalOnWithheldPaths, which always narrows to a named signal — it never leaves a
    // criterion in tracked.unattributedCriteria.
    const nameBuckets = new Map<
      string,
      'read-failure' | 'too-large' | 'other-coverage'
    >();
    for (const name of affectedNames) {
      const nameReasons = skipReasonsForSignal(signal.criterionId, name, tracked);
      const { insufficientDataReason: nameReason } = classifyAbstentionReason(nameReasons);
      const bucket =
        nameReason === undefined
          ? 'read-failure'
          : nameReason === 'too_large'
            ? 'too-large'
            : 'other-coverage';
      nameBuckets.set(name, bucket);
      (bucket === 'read-failure'
        ? partiallyAbstainedReadFailureSignals
        : bucket === 'too-large'
          ? partiallyAbstainedLargeFileSignals
          : partiallyAbstainedOtherCoverageLimitedSignals
      ).push(`${signal.criterionId}.${name}`);
    }
    // notes is one sentence covering every affected name in this signal, so it can only be as
    // specific as the names agree with each other: uniform bucket gets the matching specific
    // wording (the fix for the aggregate scanLimitations line below applies here too, not just
    // there), a genuine mix falls back to the honest disjunctive wording rather than naming a
    // cause that doesn't cover every affected name.
    const distinctBuckets = new Set(nameBuckets.values());
    const uniformBucket = distinctBuckets.size === 1 ? [...distinctBuckets][0] : undefined;
    const affectedList = [...affectedNames].sort().join(', ');
    const notes =
      uniformBucket === 'read-failure'
        ? `Cejel abstained on ${affectedList} in this criterion because that content could not be read; other signals in this criterion were computed from readable files and are unaffected.`
        : uniformBucket === 'too-large'
          ? `Cejel declined ${affectedList} in this criterion under the repository content size limit; other signals in this criterion were computed from readable files and are unaffected. This is a disclosed coverage limit, not a read failure.`
          : uniformBucket === 'other-coverage'
            ? `Cejel declined ${affectedList} in this criterion under an extension exclusion or a non-regular-file skip; other signals in this criterion were computed from readable files and are unaffected. This is a disclosed coverage limit, not a read failure.`
            : `Cejel abstained on ${affectedList} in this criterion for a mix of reasons — some content could not be read, some was declined under the repository content size limit or an extension exclusion; other signals in this criterion were computed from readable files and are unaffected.`;
    return {
      ...signal,
      metrics,
      notes,
    };
  });

  const scanLimitations = [...(tracked.value.scanLimitations ?? [])];
  const candidateScanLimitations: string[] = [];
  if (wholesaleAbstainedReadFailureCriteria.length > 0) {
    candidateScanLimitations.push(
      `${wholesaleAbstainedReadFailureCriteria.length} ${wholesaleAbstainedReadFailureCriteria.length === 1 ? 'criterion' : 'criteria'} abstained because relevant repository content could not be read and the affected signal could not be isolated. Counts and errno classes are recorded in contentReadSummary; file paths are intentionally omitted.`,
    );
  }
  if (wholesaleAbstainedCoverageLimitedCriteria.length > 0) {
    candidateScanLimitations.push(
      `${wholesaleAbstainedCoverageLimitedCriteria.length} ${wholesaleAbstainedCoverageLimitedCriteria.length === 1 ? 'criterion' : 'criteria'} abstained because relevant repository content was declined under the repository content size limit or excluded from scanning by policy, and the affected signal could not be isolated. This is a disclosed coverage limit, not a read failure, and does not affect the composite score.`,
    );
  }
  if (partiallyAbstainedReadFailureSignals.length > 0) {
    candidateScanLimitations.push(
      `${partiallyAbstainedReadFailureSignals.length} ${partiallyAbstainedReadFailureSignals.length === 1 ? 'signal' : 'signals'} abstained because its own repository content could not be read, while other signals in the same criterion were unaffected: ${[...partiallyAbstainedReadFailureSignals].sort().join(', ')}.`,
    );
  }
  if (partiallyAbstainedLargeFileSignals.length > 0) {
    candidateScanLimitations.push(
      `${partiallyAbstainedLargeFileSignals.length} ${partiallyAbstainedLargeFileSignals.length === 1 ? 'signal' : 'signals'} declined a large implementation file that exceeded the repository content size limit, while other signals in the same criterion were unaffected: ${[...partiallyAbstainedLargeFileSignals].sort().join(', ')}. That file is undercounted, not scored as clean or absent — this is a disclosed coverage limit, not a read failure.`,
    );
  }
  if (partiallyAbstainedOtherCoverageLimitedSignals.length > 0) {
    candidateScanLimitations.push(
      `${partiallyAbstainedOtherCoverageLimitedSignals.length} ${partiallyAbstainedOtherCoverageLimitedSignals.length === 1 ? 'signal' : 'signals'} declined under an extension exclusion or a non-regular-file skip, while other signals in the same criterion were unaffected: ${[...partiallyAbstainedOtherCoverageLimitedSignals].sort().join(', ')}. This is a disclosed coverage limit, not a read failure.`,
    );
  }
  // Each of the five candidates above used to be gated by its own independent
  // `scanLimitations.length < 16` check, evaluated sequentially against the same mutating array
  // — splitting one combined bucket into large-file/other-coverage (this PR) made a fifth
  // candidate exist, so a repository already at 15 entries could have the fourth push consume
  // the last slot and the fifth silently vanish with no sign anything was dropped. Computing the
  // full candidate list first and reserving one slot for an explicit truncation notice when it
  // doesn't all fit turns that into a disclosed omission instead of a silent one — the D4 shape
  // this repository's own doctrine treats as a worse defect than the recall gap it would hide.
  const availableSlots = Math.max(0, 16 - scanLimitations.length);
  if (candidateScanLimitations.length <= availableSlots) {
    scanLimitations.push(...candidateScanLimitations);
  } else if (availableSlots > 0) {
    const keep = availableSlots - 1;
    scanLimitations.push(...candidateScanLimitations.slice(0, keep));
    scanLimitations.push(
      `${candidateScanLimitations.length - keep} additional disclosed scan limitation(s) omitted at the 16-entry cap — see contentReadSummary for full counts.`,
    );
  }
  // availableSlots === 0: the array arrived already at the cap from limitations recorded
  // elsewhere in the pipeline before this function ran. There is no slot left even for a
  // truncation notice; this is the schema's own hard boundary (scanLimitations.max(16)), not a
  // gap this function can close on its own.

  return {
    ...tracked.value,
    signals,
    ...(scanLimitations.length > 0 ? { scanLimitations } : {}),
    contentReadSummary: tracked.summary,
  };
}

// Maps content-reads.ts's withheldRepoPaths() into the report.json shape. registerWithheldRepoPath
// is called at most once per path within a single scan session (see its own doc comment), so
// `reasons` is always exactly one value here; sorted defensively rather than assumed.
function buildWithheldPathsReportField(): WitanWithheldPath[] {
  return withheldRepoPaths().map(({ path, reasons, signalsAdmitting, actedOn }) => ({
    path,
    reason: [...reasons].sort()[0]!,
    signalsAdmitting: [...signalsAdmitting],
    actedOn,
  }));
}

function buildWitanInputFromRepoUntracked(
  options: BuildWitanInputOptions,
): WitanReportInputPayload {
  assertRepoPathExists(options.repoPath);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const rubricVersion = options.rubricVersion ?? WITAN_RUBRIC_VERSION;
  const fileInventory = collectRepoFileInventory(options.repoPath);
  const headSha = readGitHead(options.repoPath);
  const repoFiles = fileInventory.repoFiles;
  const inventoryFiles = fileInventory.inventoryFiles;
  const ignoredTargetReason =
    repoFiles.length === 0 ? explainIgnoredScanTarget(options.repoPath) : undefined;
  const usesV17Detectors = usesV17DetectorClosure(rubricVersion);
  const inventoryAbsenceContext: InventoryAbsenceContext = {
    rubricGeneration: usesV17Detectors ? 'current' : 'legacy',
    inventoryProvenance:
      fileInventory.repoFileInventoryScope === 'tracked-scan-eligible'
        ? 'tracked-scan-eligible'
        : 'directory-walk',
  };
  const usesV18NativeRls =
    rubricVersion === WITAN_RUBRIC_VERSION_V18 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V19 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V20 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V21 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V22 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V23 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V24 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V25 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V26;
  const usesV19CommitYear =
    rubricVersion === WITAN_RUBRIC_VERSION_V19 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V20 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V21 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V22 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V23 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V24 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V25 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V26;
  const usesV20A3ExplicitGaps =
    rubricVersion === WITAN_RUBRIC_VERSION_V20 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V21 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V22 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V23 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V24 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V25 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V26;
  const usesV21ExecutedEscalations =
    rubricVersion === WITAN_RUBRIC_VERSION_V21 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V22 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V23 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V24 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V25 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V26;
  const usesV22PackageStartEntrypoint =
    rubricVersion === WITAN_RUBRIC_VERSION_V22 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V23 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V24 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V25 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V26;
  // A1 coverage command-flag recognition and its reachability abstention run under every rubric
  // since goal_cejel_v26_coverage_config_recognition_2026-10-14. What stays v23-only is the part
  // that could assert a new finding rather than withdraw one: v23 replaces the v17 coverage
  // heuristics with that analysis instead of adding to them, and counts a Make/just `test:`
  // recipe as a configured test runner.
  const usesV23StrictCoverageAndRecipeRunners = rubricVersion === WITAN_RUBRIC_VERSION_V23;
  // Explicit-only (goal_cejel_v23_pem_private_key_grammar_2026-09-06): a PEM-formatted
  // private-key value assigned to an identifier (e.g. a service-account JSON's
  // "private_key" field) is a dedicated grammar, not an extension of the shared
  // SECRET_IDENTIFIER_KEYWORD_PATTERN/findRealSecretAssignments path every other rubric
  // version also uses — v17 and v22 must stay byte-stable, so this never inherits forward
  // the way usesV17DetectorClosure does; it is checked against V23 alone.
  const usesV23PemPrivateKeyGrammar = rubricVersion === WITAN_RUBRIC_VERSION_V23;
  // Explicit-only for the same reason, and one more: a withheld-path abstention is only safe
  // because v23 can attach it to the one signal that would have read the file. Every other rubric
  // routes an attributed skip through the wholesale-wipe branch above, so inheriting this forward
  // would abstain a whole criterion over a single oversized file — which is the criterion-wide
  // over-abstention goal_cejel_0_4_8_abstention_scoring_fix_2026-09-08 removed. v17 (the public
  // default) and v22 stay byte-stable.
  const usesV23WithheldPathAbstention = rubricVersion === WITAN_RUBRIC_VERSION_V23;
  // Explicit-only (goal_cejel_secret_posture_context_track_b_2026-09-15): A2's current-tree
  // secret scan decides "real credential or documentation example?" from the matched value and a
  // bounded window of its own file's text instead of from the file's path. This is checked
  // against V24 alone and never inherits: v17 (the public default) and v22 stay byte-stable, and
  // v23's own four mechanisms are declared v23-specific, so v24 is a v22 descendant, not a v23
  // one. See the WITAN_RUBRIC_VERSION_V24 declaration in rubric-version.ts.
  const usesV24SecretContentContext = rubricVersion === WITAN_RUBRIC_VERSION_V24;
  // Explicit-only (goal_cejel_a3_handler_shapes_and_inline_health_2026-10-12): A3's scored
  // "health or readiness signal" component also credits a health/readiness route declared inline
  // in an application file. Checked against V25 and V26 only and never inherited by any other
  // rubric: v17 (the public default), v22, v23 and v24 stay byte-stable, and v25 is a v22
  // descendant. V26 is the one deliberate exception, named in its declaration: it is v25's
  // complete closure (goal_cejel_v26_rubric_scaffold_2026-10-14). See the
  // WITAN_RUBRIC_VERSION_V25 and WITAN_RUBRIC_VERSION_V26 declarations in rubric-version.ts.
  const usesV25InlineHealthRoute =
    rubricVersion === WITAN_RUBRIC_VERSION_V25 || rubricVersion === WITAN_RUBRIC_VERSION_V26;
  // v26 item 6, the one change v26 makes alone (docs/calibration/v26/ruling-item-6.md, signed by
  // the operator): A5's no-reconciliation finding and A2's tenant-without-RLS finding fire only on
  // the evidence that settles them, and otherwise abstain with a disclosure sentence. Checked
  // against V26 alone and never inherited: v17 (the public default) and v22-v25 stay byte-stable.
  const usesV26SettlingEvidence = rubricVersion === WITAN_RUBRIC_VERSION_V26;
  // v26 item 8 (docs/calibration/v26/ruling-item-8.md, signed by the operator): A3's "declares
  // neither a build nor a typecheck script" finding fires only when the package has something to
  // build or check, no step is found in any place read, and every such place was read; otherwise it
  // abstains, with a disclosure sentence when a place went unread. Checked against V26 alone and
  // never inherited: v17 (the public default) and v18-v25 stay byte-stable.
  const usesV26BuildStepEvidence = rubricVersion === WITAN_RUBRIC_VERSION_V26;
  const usesV27Closure = usesV27FalseAssuranceClosure(rubricVersion);
  const structuralArchetype = classifyRepoArchetype(inventoryFiles, rubricVersion);
  const readableArchetype =
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion)
      ? applyReadableSourceRepresentationGate(
          options.repoPath,
          inventoryFiles,
          structuralArchetype,
          headSha,
          rubricVersion,
        )
      : structuralArchetype;
  const gatedArchetype =
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion)
      ? applySemanticSourceRepresentationGate(
          options.repoPath,
          inventoryFiles,
          readableArchetype,
          rubricVersion,
        )
      : readableArchetype;
  const usesV8Detectors =
    rubricVersion === WITAN_RUBRIC_VERSION_V8 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V9 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V10 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion);
  const usesV33Detectors =
    rubricVersion === WITAN_RUBRIC_VERSION_V9 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V10 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion);
  const usesV36Detectors =
    rubricVersion === WITAN_RUBRIC_VERSION_V10 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion);
  const usesV39Detectors =
    rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion);
  const usesV47Detectors =
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion);
  const reviewableSourceProof = usesV17Detectors
    ? buildReviewableSourceProof(options.repoPath, inventoryFiles, headSha, rubricVersion)
    : undefined;
  const scanLimitations = new Set(fileInventory.scanLimitations);
  const coreSignals = collectRepoSignals(
    options.repoPath,
    generatedAt,
    repoFiles,
    usesV8Detectors,
    usesV33Detectors,
    usesV36Detectors,
    usesV39Detectors,
    usesV47Detectors,
    usesV18NativeRls,
    usesV19CommitYear,
    usesV20A3ExplicitGaps,
    usesV21ExecutedEscalations,
    usesV22PackageStartEntrypoint,
    usesV23StrictCoverageAndRecipeRunners,
    usesV23PemPrivateKeyGrammar,
    usesV23WithheldPathAbstention,
    usesV24SecretContentContext,
    usesV25InlineHealthRoute,
    usesV26SettlingEvidence,
    usesV26BuildStepEvidence,
    usesV27Closure,
    reviewableSourceProof,
    inventoryAbsenceContext,
    scanLimitations,
  );
  const archetype =
    usesV17Detectors &&
    reviewableSourceProof?.passes === true &&
    isV17RescuableAbstention(gatedArchetype.abstentionKind) &&
    coreSignals.some(isMeasuredCriterionSignal)
      ? {
          archetype: isLikelyMonorepo(inventoryFiles) ? ('monorepo' as const) : ('source' as const),
          sourceFileCount: gatedArchetype.sourceFileCount,
          totalFileCount: gatedArchetype.totalFileCount,
        }
      : gatedArchetype;

  return {
    productSlug: options.productSlug,
    productDisplayName: sanitizePresentationLine(options.productDisplayName, {
      fallback: 'Repository',
      maxLength: 120,
    }),
    repo: {
      ...(headSha ? { headSha } : {}),
    },
    generatedAt,
    ...(options.rubricVersion ? { rubricVersion: options.rubricVersion } : {}),
    archetype: archetype.archetype,
    ...((ignoredTargetReason ?? archetype.insufficientSourceReason)
      ? { insufficientSourceReason: ignoredTargetReason ?? archetype.insufficientSourceReason }
      : {}),
    ...(scanLimitations.size > 0
      ? { scanLimitations: [...scanLimitations] }
      : {}),
    // Always present, even as [] — presence is the "nothing was withheld" statement itself, not
    // merely the absence of a limitation (goal_cejel_withheld_paths_always_disclosed_2026-09-22).
    withheldPaths: buildWithheldPathsReportField(),
    signals: [
      ...coreSignals,
      ...(options.domainCollectors ?? []).map((collect) => collect(options.repoPath, repoFiles)),
      ...(options.additionalSignals ?? []),
    ],
  };
}

// ---- Repo archetype classification (goal_cejel_repo_archetype_detection_2026-07-06) ----------
//
// A deterministic, offline read of the file inventory that decides whether a repo has a
// ratable source tree at all. This is intentionally conservative: it only flags a repo as
// insufficient-source ('docs_only' | 'binary_only' | 'generated_only' |
// 'non_cohesive_source' | 'unrecognised_ecosystem' | 'empty') only from positive structural
// evidence — never merely "few source files detected". Many legitimate scan targets (a bare
// requirements.txt, a lockfile-only monorepo sub-package) have zero source-extension files of
// their own and must keep scoring exactly as before via the individual collectors' own
// archetype-aware N/A gates (see A2/A3 above) — this classifier must never gate those away.
//
// DOMINANCE, NOT PRESENCE (goal_cejel_archetype_dominance_not_presence_2026-07-15): a repo with
// ANY recognised-source file used to short-circuit straight to 'source' regardless of how small
// a fraction of the tree that file represented — nine incidental .sh deploy scripts scored a
// 329-file, 99%-COBOL repository (aws-samples/aws-mainframe-modernization-carddemo) on its shell
// scripts alone. `SOURCE_DOMINANCE_RATIO_THRESHOLD` below only engages when a competing
// unrecognised-language signal actually exists (collectUnrecognisedSourceFiles is non-empty);
// a repo with recognised source and nothing else is completely unaffected. See
// docs/calibration/archetype-ratio-golden-set.md for the calibration record.
export interface RepoArchetypeClassification {
  archetype: WitanRepoArchetype;
  sourceFileCount: number;
  totalFileCount: number;
  /** Present only for the non-source archetypes; explains why and points to --ingest. */
  insufficientSourceReason?: string;
  /** Internal closed reason identity used by prospective, versioned rescue policy. */
  abstentionKind?: RepoAbstentionKind;
}

type RepoAbstentionKind =
  | 'empty'
  | 'generated_only'
  | 'independent_catalog'
  | 'docs_source_role'
  | 'artifact_dominance'
  | 'binary_distribution'
  | 'docs_distribution'
  | 'unrecognised_ecosystem'
  | 'readable_representation'
  | 'semantic_auxiliary';

function isV17RescuableAbstention(kind: RepoAbstentionKind | undefined): boolean {
  return (
    kind === 'artifact_dominance' ||
    kind === 'docs_source_role' ||
    kind === 'readable_representation' ||
    kind === 'semantic_auxiliary'
  );
}

function isMeasuredCriterionSignal(signal: WitanCriterionSignalPayload): boolean {
  if (signal.notApplicable === true) return false;
  return (
    (signal.metrics?.length ?? 0) > 0 ||
    (signal.positiveEvidence?.length ?? 0) > 0 ||
    (signal.findings?.length ?? 0) > 0
  );
}

// goal_cejel_language_calibration_2026-07-12: widened to add the ecosystems that were cheap
// to recognise (shell, R, Lua, Julia, Haskell, Terraform, SQL, Perl, OCaml, Clojure, Erlang,
// Nim, Zig, F#, Groovy) on top of the original nineteen. V7 distinguishes recognition from
// modeling depth: cohesive source in a language whose collectors are not deep is still source;
// unsupported dimensions become insufficient_data rather than forcing a repository-wide
// abstention solely from its extension.
//
// goal_cejel_derive_dont_enumerate_2026-07-13 (Guard 3): this array is now the ONE canonical
// source for "which languages does cejel recognise as source, and how deeply is each
// modelled" — SOURCE_EXTENSION_PATTERN below is COMPILED from it rather than typed
// separately, and the public README/tests read this same array rather than a second,
// independently-maintained list. A language added or removed here propagates everywhere by
// construction; see claim-matches-code.test.ts (Guard 3) for the README/test-side assertion.
export type SourceLanguageTier = 'deep' | 'partial' | 'unmodelled';

export interface SourceLanguageEntry {
  readonly name: string;
  readonly tier: SourceLanguageTier;
  readonly extensions: readonly string[];
}

export const SOURCE_LANGUAGES: readonly SourceLanguageEntry[] = [
  {
    name: 'JS/TS',
    tier: 'deep',
    extensions: ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'],
  },
  { name: 'Python', tier: 'deep', extensions: ['py'] },
  { name: 'Go', tier: 'partial', extensions: ['go'] },
  { name: 'Rust', tier: 'partial', extensions: ['rs'] },
  { name: 'Java', tier: 'partial', extensions: ['java'] },
  { name: 'Ruby', tier: 'partial', extensions: ['rb'] },
  { name: 'PHP', tier: 'partial', extensions: ['php'] },
  { name: 'C#', tier: 'partial', extensions: ['cs'] },
  { name: 'C/C++', tier: 'partial', extensions: ['cpp', 'cc', 'cxx', 'c', 'h', 'hpp'] },
  { name: 'Swift', tier: 'partial', extensions: ['swift'] },
  { name: 'Kotlin', tier: 'partial', extensions: ['kt', 'kts'] },
  { name: 'Dart', tier: 'partial', extensions: ['dart'] },
  { name: 'Elixir', tier: 'partial', extensions: ['ex', 'exs'] },
  { name: 'Scala', tier: 'partial', extensions: ['scala'] },
  { name: 'shell', tier: 'unmodelled', extensions: ['sh', 'bash', 'zsh', 'bat', 'cmd'] },
  { name: 'R', tier: 'unmodelled', extensions: ['r'] },
  { name: 'Lua', tier: 'unmodelled', extensions: ['lua'] },
  { name: 'Julia', tier: 'unmodelled', extensions: ['jl'] },
  { name: 'Haskell', tier: 'unmodelled', extensions: ['hs'] },
  { name: 'Terraform', tier: 'unmodelled', extensions: ['tf', 'tfvars'] },
  { name: 'SQL', tier: 'unmodelled', extensions: ['sql'] },
  { name: 'Perl', tier: 'unmodelled', extensions: ['pl', 'pm'] },
  { name: 'OCaml', tier: 'unmodelled', extensions: ['ml', 'mli'] },
  { name: 'Clojure', tier: 'unmodelled', extensions: ['clj', 'cljs', 'cljc'] },
  { name: 'Erlang', tier: 'unmodelled', extensions: ['erl', 'hrl'] },
  { name: 'Nim', tier: 'unmodelled', extensions: ['nim'] },
  { name: 'Zig', tier: 'unmodelled', extensions: ['zig'] },
  { name: 'F#', tier: 'unmodelled', extensions: ['fs', 'fsx'] },
  { name: 'Groovy', tier: 'unmodelled', extensions: ['groovy', 'gvy'] },
  { name: 'Fortran', tier: 'unmodelled', extensions: ['f', 'for', 'f77', 'f90', 'f95', 'f03'] },
  { name: 'CUDA/HIP', tier: 'unmodelled', extensions: ['cu', 'cuh', 'hip'] },
  {
    name: 'Web templates/styles',
    tier: 'unmodelled',
    extensions: [
      'html',
      'htm',
      'css',
      'scss',
      'sass',
      'less',
      'hbs',
      'handlebars',
      'variables',
      'overrides',
      'vue',
      'svelte',
      'astro',
      'erb',
      'haml',
      'slim',
      'erubis',
      'hamlit',
    ],
  },
] as const;

export const SOURCE_LANGUAGES_V10: readonly SourceLanguageEntry[] = [
  ...SOURCE_LANGUAGES,
  { name: 'COBOL', tier: 'unmodelled', extensions: ['cob', 'cbl', 'cpy'] },
  { name: 'MATLAB/Objective-C', tier: 'unmodelled', extensions: ['m'] },
] as const;

const SOURCE_EXTENSION_PATTERN = new RegExp(
  `\\.(${SOURCE_LANGUAGES.flatMap((language) => language.extensions).join('|')})$`,
  'i',
);

const SOURCE_EXTENSION_PATTERN_V10 = new RegExp(
  `\\.(${SOURCE_LANGUAGES_V10.flatMap((language) => language.extensions).join('|')})$`,
  'i',
);

export function isRecognizedSourcePath(
  path: string,
  rubricVersion = WITAN_RUBRIC_VERSION,
): boolean {
  return (
    rubricVersion === WITAN_RUBRIC_VERSION_V10 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion)
      ? SOURCE_EXTENSION_PATTERN_V10
      : SOURCE_EXTENSION_PATTERN
  ).test(path);
}
// Packaged/bundled binary artifacts a closed or docs-only distribution repo ships instead of
// source — e.g. a VS Code extension .vsix, an npm tarball, a compiled binary/installer.
const BUNDLED_BINARY_EXTENSION_PATTERN =
  /\.(vsix|zip|tgz|whl|exe|dmg|pkg|msi|jar|war|apk|ipa|dll|dylib|ttf|otf|woff2?|eot|eps)$/i;

const DOCS_OR_MEDIA_EXTENSION_PATTERN = /\.(md|mdx|rst|png|jpe?g|gif|svg|webp|ico|pdf)$/i;
const ARTIFACT_DOMINANCE_EXTENSION_PATTERN =
  /\.(vsix|zip|tgz|whl|exe|dmg|pkg|msi|jar|war|apk|ipa|dll|dylib|ttf|otf|woff2?|eot|eps|png|jpe?g|gif|svg|webp|ico|pdf)$/i;
const DOC_DISTRIBUTION_COMPANION_PATTERN =
  /(^|\/)(LICENSE|LICENCE|NOTICE|COPYING|AUTHORS|CONTRIBUTORS|CODE_OF_CONDUCT)(\.[A-Za-z0-9]+)?$/i;
const GENERATED_OR_VENDOR_PATH_PATTERN =
  /(^|\/)(vendor|vendors|dist|build|generated|gen|coverage|node_modules|site-packages|\.venv|venv|\.next|__pycache__|\.terraform|public\/assets|static\/assets)(\/|$)|(^|\/)[^/]+\.min\.(?:js|css)$/i;
const V17_BUILD_OR_DEPENDENCY_CACHE_PATH_PATTERN =
  /(^|\/)(?:target|_build|\.build|DerivedData|Pods|Carthage\/Build|\.cache|\.gradle|\.m2|\.yarn\/cache|\.pnpm-store|\.dart_tool|\.tox|\.pytest_cache|\.ruff_cache|\.mypy_cache|\.turbo|\.parcel-cache|\.angular\/cache|\.svelte-kit|\.nuxt|bazel-(?:bin|out|testlogs)|buck-out)(\/|$)/i;
const INDEPENDENT_CATALOG_PATH_PATTERN =
  /(^|\/)(solutions?|exercises?|challenges?|algorithms?)(\/|$)/i;

// Non-source, non-docs, non-binary files cejel already reads meaning from without needing to
// recognise a programming language: manifests, lockfiles, structured config, and dotfiles that
// are common to legitimate repos in ANY language (including ones whose source cejel does not
// recognise). Kept deliberately broad so a Python sub-package that is only a requirements.txt +
// lockfile slice, or a repo with nothing but a README + LICENSE, stays the existing ambiguous
// 'source' default rather than being misread as an unrecognised-language repo — the class of
// false-positive this pattern exists to prevent (goal_cejel_language_calibration_2026-07-12).
const KNOWN_NON_SOURCE_EXTENSION_PATTERN =
  /\.(json|jsonc|json5|ya?ml|toml|txt|lock|xml|csv|tsv|ini|cfg|conf|cnf|properties|env|sum|mod|graphql|gql|proto|sarif|editorconfig|gitignore|gitattributes|npmrc|nvmrc|dockerignore|prettierignore|prettierrc|log|stderr|snap|grit|po|mo|dbf|shp|shx|egg|pem|key|csr|ai|txt\.license|pf|in|case|common|fortls)$/i;

// V42 review exposed that the broad unknown-extension fallback was also treating compiled,
// compressed, certificate, patch, project-metadata, resource, and domain-data artifacts as
// source. V13 narrows only those positive non-source families. Readable uncommon code stays
// source-shaped through either the canonical language table (COBOL/MATLAB) or the conservative
// unknown-extension fallback (for example JCL, TeX, and template languages).
const V13_NON_SOURCE_EXTENSION_PATTERN =
  /\.(?:\d+|class|py[co]|gz|bz2|xz|7z|rar|mat|npy|npz|h5|hdf5|onnx|pt|pth|ckpt|safetensors|crt|cer|der|p12|pfx|diff|patch|plist|pbxproj|xcworkspacedata|xcbuild|xcplayground|xcscheme|xcsettings|xcconfig|xcprivacy|xcstrings|csproj|fsproj|vbproj|sln|slnf|props|targets|projitems|shproj|pubxml|resw|resources|storyboard|xib|entitlements|modulemap|podspec|nuspec|appxmanifest|webmanifest|manifest|map|fls|aux|bbl|bib|ocm|tdb|db|sqlite|sqlcipher\d*|bin|dat|pdb|prj|resolved|sim|input|list|fig|drawio|puml|sketch|icns|flac|wav|mp3|mp4|mov|avi|mkv|nv21|xls[xb]?|mex[a-z0-9_]*|gitconfig|profile|yapf|config|desktop|typed|example|bak|_|test(?:_[a-z0-9]+)*_location_override|xamltest|tld(?:_[a-z0-9]+)?|xsd|cmake|gradle|mk|am|pro|upri|dockerfile|dockergen|makefile|alpine|android|debian|ubuntu\d+|cuda\d+_ubuntu\d+|manylinux[a-z0-9_]*)$/i;

const INGEST_POINTER =
  'To assess a closed/bundled tool, ingest its scanner output via --ingest <sarif|scorecard>.';

// The dominance threshold calibrated against docs/calibration/archetype-ratio-golden-set.md
// (goal_cejel_archetype_dominance_not_presence_2026-07-15) — committed in an EARLIER commit
// than this constant (Guard 5 in repo-archetype.test.ts checks that ordering). At least this
// fraction of a repository's source-shaped files (recognised + unrecognised-language) must be
// in a language cejel recognises for a score to be meaningful. The golden set's upper anchor
// (50% recognised, one stray COBOL file next to one TS file) must stay 'source'; the golden
// set's motivating case (carddemo, ~2.7-3.6% recognised depending on denominator) must abstain.
// Any number in a wide middle band satisfies both, which is the point: this was not reverse-
// engineered from carddemo's file count.
const SOURCE_DOMINANCE_RATIO_THRESHOLD_V8 = 0.2;
const SOURCE_DOMINANCE_RATIO_THRESHOLD_V9 = 0.8;
const SOURCE_DOMINANCE_RATIO_THRESHOLD_V10 = 0.5;
const SOURCE_DOMINANCE_RATIO_THRESHOLD_V11 = 0.2;
const V17_REVIEWABLE_SOURCE_RATABLE_SHARE_THRESHOLD = 0.2;

// V26 structural-abstention thresholds are frozen prospectively against the synthetic boundary
// matrix in free-core-v26-detector-regressions.test.ts and documented in the v26 remediation
// specification. They are deliberately count + ratio + remainder rules: no one small directory
// or ordinary generated client is enough to suppress a headline score.
const GENERATED_SOURCE_MINIMUM = 8;
const GENERATED_SOURCE_RATIO_THRESHOLD = 0.8;
const GENERATED_AUTHORED_MAXIMUM = 3;
const CATALOG_SOURCE_MINIMUM = 12;
const CATALOG_SOURCE_RATIO_THRESHOLD = 0.9;
const CATALOG_OUTSIDE_MAXIMUM = 2;

export function classifyRepoArchetype(
  repoFiles: readonly string[],
  rubricVersion = WITAN_RUBRIC_VERSION,
): RepoArchetypeClassification {
  const totalFileCount = repoFiles.length;
  const sourceFiles = repoFiles.filter((path) => isRecognizedSourcePath(path, rubricVersion));
  const sourceFileCount = sourceFiles.length;

  if (totalFileCount === 0) {
    return {
      archetype: 'empty',
      sourceFileCount: 0,
      totalFileCount: 0,
      abstentionKind: 'empty',
      insufficientSourceReason: 'Repository has no tracked files — there is nothing to certify.',
    };
  }

  const generatedSourceFiles = sourceFiles.filter((file) =>
    GENERATED_OR_VENDOR_PATH_PATTERN.test(file),
  );
  if (
    sourceFileCount >= GENERATED_SOURCE_MINIMUM &&
    generatedSourceFiles.length / sourceFileCount >= GENERATED_SOURCE_RATIO_THRESHOLD &&
    sourceFileCount - generatedSourceFiles.length <= GENERATED_AUTHORED_MAXIMUM
  ) {
    return {
      archetype: 'generated_only',
      sourceFileCount,
      totalFileCount,
      abstentionKind: 'generated_only',
      insufficientSourceReason:
        `${generatedSourceFiles.length} of ${sourceFileCount} source-shaped file(s) are under generated, vendor, build, distribution, coverage, or bundled-asset paths; only ${sourceFileCount - generatedSourceFiles.length} authored source-shaped file(s) remain. ` +
        `Cejel abstains because generated/vendor output is not a reviewable implementation surface. ${INGEST_POINTER}`,
    };
  }

  const catalogSourceFiles = sourceFiles.filter((file) =>
    INDEPENDENT_CATALOG_PATH_PATTERN.test(file),
  );
  if (
    sourceFileCount >= CATALOG_SOURCE_MINIMUM &&
    catalogSourceFiles.length / sourceFileCount >= CATALOG_SOURCE_RATIO_THRESHOLD &&
    sourceFileCount - catalogSourceFiles.length <= CATALOG_OUTSIDE_MAXIMUM
  ) {
    return {
      archetype: 'non_cohesive_source',
      sourceFileCount,
      totalFileCount,
      abstentionKind: 'independent_catalog',
      insufficientSourceReason:
        `${catalogSourceFiles.length} of ${sourceFileCount} source-shaped file(s) are under independent solution, exercise, challenge, or algorithm catalog paths; only ${sourceFileCount - catalogSourceFiles.length} source-shaped file(s) remain outside that catalog. ` +
        `Cejel abstains because the repository does not expose one cohesive product implementation to score. ${INGEST_POINTER}`,
    };
  }

  // Generated trees and independent source catalogs have stronger, already-frozen structural
  // meanings than the v11 docs/artifact refinements. Evaluate them first so incidental media in
  // either archetype cannot relabel the repository and silently change the reason for abstention.
  if (
    rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion)
  ) {
    const authoredSourceFiles = sourceFiles.filter(isAuthoredProductionPath);
    const documentationFiles = repoFiles.filter((file) =>
      DOCS_OR_MEDIA_EXTENSION_PATTERN.test(file),
    );
    if (sourceFileCount > 0 && authoredSourceFiles.length === 0 && documentationFiles.length > 0) {
      return {
        archetype: 'docs_only',
        sourceFileCount,
        totalFileCount,
        abstentionKind: 'docs_source_role',
        insufficientSourceReason:
          `${sourceFileCount} source-shaped file(s) are tests/fixtures around a documentation tree; no authored product source remains. ` +
          `Cejel abstains because documentation tests do not support a product-source headline score. ${INGEST_POINTER}`,
      };
    }

    const artifactFiles = repoFiles.filter((file) =>
      ARTIFACT_DOMINANCE_EXTENSION_PATTERN.test(file),
    );
    const materialFiles = authoredSourceFiles.length + artifactFiles.length;
    if (
      artifactFiles.length >= 10 &&
      (authoredSourceFiles.length <= 10 ||
        rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
        rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
        rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
        usesV17DetectorClosure(rubricVersion)) &&
      materialFiles > 0 &&
      authoredSourceFiles.length / materialFiles <= 0.1
    ) {
      return {
        archetype: 'binary_only',
        sourceFileCount,
        totalFileCount,
        abstentionKind: 'artifact_dominance',
        insufficientSourceReason:
          `${authoredSourceFiles.length} authored source-shaped file(s) accompany ${artifactFiles.length} packaged, font, image, or media artifact(s); the source is sparse tooling rather than a representative product implementation. ` +
          `Cejel abstains because incidental tooling cannot support a product-source headline score. ${INGEST_POINTER}`,
      };
    }
  }

  // Files with an extension that is not recognised source, not docs/media, not a bundled
  // binary, and not one of the manifest/lockfile/config extensions common to every ecosystem —
  // i.e. files that LOOK like implementation in some language, just not one cejel reads.
  // Computed unconditionally (goal_cejel_archetype_dominance_not_presence_2026-07-15): this
  // used to be reachable only when sourceFileCount === 0; it is now also the competing signal
  // the dominance ratio below weighs recognised source against.
  const unrecognisedSourceFiles = collectUnrecognisedSourceFiles(repoFiles, rubricVersion);

  if (sourceFileCount === 0) {
    // Only classify as insufficient-source when there is positive evidence of a docs or
    // bundled-binary distribution tree.
    const binaryFiles = repoFiles.filter((file) => BUNDLED_BINARY_EXTENSION_PATTERN.test(file));
    if (binaryFiles.length > 0) {
      const sample = binaryFiles[0];
      return {
        archetype: 'binary_only',
        sourceFileCount,
        totalFileCount,
        abstentionKind: 'binary_distribution',
        insufficientSourceReason:
          `${sourceFileCount} source file(s) found among ${totalFileCount} tracked file(s); repo` +
          ` appears to be a binary/bundled-distribution tree (e.g. ${sample ? basename(sample) : 'a packaged artifact'})` +
          ` — cejel rates source, not binaries. ${INGEST_POINTER}`,
      };
    }

    const docsFiles = repoFiles.filter((file) => DOCS_OR_MEDIA_EXTENSION_PATTERN.test(file));
    const docsDistributionFiles = repoFiles.filter(
      (file) =>
        DOCS_OR_MEDIA_EXTENSION_PATTERN.test(file) || DOC_DISTRIBUTION_COMPANION_PATTERN.test(file),
    );
    if (
      docsFiles.length > 0 &&
      (docsDistributionFiles.length === totalFileCount ||
        ((rubricVersion === WITAN_RUBRIC_VERSION_V9 ||
          rubricVersion === WITAN_RUBRIC_VERSION_V10 ||
          rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
          rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
          rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
          rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
          rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
          rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
          usesV17DetectorClosure(rubricVersion)) &&
          unrecognisedSourceFiles.length === 0))
    ) {
      return {
        archetype: 'docs_only',
        sourceFileCount,
        totalFileCount,
        abstentionKind: 'docs_distribution',
        insufficientSourceReason: `${sourceFileCount} source file(s) found among ${totalFileCount} tracked file(s); repo appears to be a docs/distribution tree (README/markdown/media), not a source tree — cejel rates source, not docs. ${INGEST_POINTER}`,
      };
    }

    // 'unrecognised_ecosystem' (goal_cejel_language_calibration_2026-07-12): positive evidence
    // of a source tree written in a language cejel does not recognise. This is deliberately
    // narrower than "sourceFileCount === 0": a repo whose only files are requirements.txt +
    // poetry.lock, or README.md + LICENSE, has zero candidate files under this check (both
    // extensions are in the known-non-source allow-list, or have no extension at all) and stays
    // the existing ambiguous 'source' default — see the two regression cases in
    // repo-archetype.test.ts this branch must not disturb.
    if (unrecognisedSourceFiles.length > 0) {
      return unrecognisedEcosystemResult(
        sourceFileCount,
        totalFileCount,
        unrecognisedSourceFiles,
        sourceDominanceThreshold(rubricVersion),
      );
    }

    return { archetype: 'source', sourceFileCount, totalFileCount };
  }

  // sourceFileCount > 0: recognised source exists. A repo with no competing unrecognised-
  // language signal at all is completely unaffected by this goal — same 'source'/'monorepo'
  // outcome as before goal_cejel_archetype_dominance_not_presence_2026-07-15.
  if (unrecognisedSourceFiles.length === 0) {
    return {
      archetype: isLikelyMonorepo(repoFiles) ? 'monorepo' : 'source',
      sourceFileCount,
      totalFileCount,
    };
  }

  // A competing unrecognised-language signal exists — is recognised source DOMINANT, or merely
  // incidental (carddemo's nine deploy scripts among 329 mostly-COBOL files)? Golden set:
  // docs/calibration/archetype-ratio-golden-set.md.
  const dominanceRatio = sourceFileCount / (sourceFileCount + unrecognisedSourceFiles.length);
  const dominanceThreshold = sourceDominanceThreshold(rubricVersion);
  if (dominanceRatio >= dominanceThreshold) {
    return {
      archetype: isLikelyMonorepo(repoFiles) ? 'monorepo' : 'source',
      sourceFileCount,
      totalFileCount,
    };
  }

  return unrecognisedEcosystemResult(
    sourceFileCount,
    totalFileCount,
    unrecognisedSourceFiles,
    dominanceThreshold,
  );
}

const READABLE_SOURCE_REPRESENTATION_THRESHOLD_V13 = 0.8;
const READABLE_SOURCE_REPRESENTATION_SAMPLE_LIMIT_V13 = 32;
const READABLE_SOURCE_REPRESENTATION_FILE_BYTES_V13 = 256 * 1024;
const SEMANTIC_AUXILIARY_SOURCE_MINIMUM_V14 = 20;
const SEMANTIC_AUXILIARY_SOURCE_RATIO_V14 = 0.8;
const SEMANTIC_METADATA_PREFIX_BYTES_V14 = 16 * 1024;
const SEMANTIC_AUXILIARY_PATH_PATTERN_V14 =
  /(^|\/)(?:locales?|i18n|l10n|translations?|styles?|themes?)(\/|$)|\.(?:css|scss|sass|less|styl)$/i;
const HTML_SOURCE_EXTENSION_PATTERN = /\.(?:html?|xhtml)$/i;
const HTML_META_REFRESH_PATTERN =
  /<meta\b(?=[^>]*\bhttp-equiv\s*=\s*["']?\s*refresh\b)(?=[^>]*\bcontent\s*=\s*["'][^"']*\burl\s*=)[^>]*>/i;
const RUBY_PACKAGE_RECIPE_CLASS_PATTERN = /\bclass\s+[A-Za-z0-9_:]+\s*<\s*(?:Formula|Cask)\b/;
const RUBY_PACKAGE_RECIPE_URL_PATTERN = /^\s*url\s+["'][^"']+["']/m;
const RUBY_PACKAGE_RECIPE_PATH_PATTERN = /(^|\/)(?:Formula|Casks?)(\/|$)/;

interface RepresentativeSourceGroup {
  extension: string;
  files: string[];
  allocation: number;
  remainder: number;
}

/**
 * Deterministically apportions a bounded sample across source-extension families using Hamilton
 * (largest-remainder) allocation. Unlike extension round-robin, the returned sample preserves
 * the corpus mix: a dominant family receives a dominant share while material minorities remain
 * visible. The caller supplies a sealed rank key; repository paths never enter the decision.
 */
export function selectProportionalRepresentativeSourceFiles(
  files: readonly string[],
  rankKey: string,
  limit: number,
): string[] {
  const eligibleFiles = [...new Set(files)];
  const slotCount = Math.min(Math.max(Math.floor(limit), 0), eligibleFiles.length);
  if (slotCount === 0) return [];

  const grouped = new Map<string, string[]>();
  for (const file of eligibleFiles) {
    const extension = extname(file).toLowerCase() || '(none)';
    const bucket = grouped.get(extension) ?? [];
    bucket.push(file);
    grouped.set(extension, bucket);
  }

  const groups: RepresentativeSourceGroup[] = [...grouped.entries()]
    .map(([extension, groupFiles]) => {
      const quota = (groupFiles.length / eligibleFiles.length) * slotCount;
      return {
        extension,
        files: [...groupFiles].sort((left, right) =>
          representativeSourceRank(rankKey, left).localeCompare(
            representativeSourceRank(rankKey, right),
          ),
        ),
        allocation: Math.floor(quota),
        remainder: quota - Math.floor(quota),
      };
    })
    .sort(
      (left, right) =>
        right.files.length - left.files.length || left.extension.localeCompare(right.extension),
    );

  let remaining = slotCount - groups.reduce((sum, group) => sum + group.allocation, 0);
  const remainderOrder = [...groups].sort(
    (left, right) =>
      right.remainder - left.remainder ||
      right.files.length - left.files.length ||
      left.extension.localeCompare(right.extension),
  );
  for (const group of remainderOrder) {
    if (remaining === 0) break;
    if (group.allocation >= group.files.length) continue;
    group.allocation += 1;
    remaining -= 1;
  }

  const selected: string[] = [];
  for (let offset = 0; selected.length < slotCount; offset += 1) {
    let added = false;
    for (const group of groups) {
      if (offset >= group.allocation) continue;
      const file = group.files[offset];
      if (!file) continue;
      selected.push(file);
      added = true;
    }
    if (!added) break;
  }
  return selected;
}

export function isRepresentativeSourceText(contents: string): boolean {
  if (contents.trim().length === 0) return false;
  if (contents.includes('\u0000') || contents.includes('\uFFFD')) return false;
  let disallowedControls = 0;
  for (const character of contents) {
    const code = character.charCodeAt(0);
    if (code < 32 && character !== '\n' && character !== '\r' && character !== '\t') {
      disallowedControls += 1;
    }
  }
  return disallowedControls / contents.length <= 0.01;
}

function representativeSourceRank(rankKey: string, file: string): string {
  return createHash('sha256').update(`${rankKey}:${file}`).digest('hex');
}

export interface ReviewableSourceProof {
  sourceShapedFileCount: number;
  eligibleSourceFileCount: number;
  sampledFileCount: number;
  readableSampledFileCount: number;
  firstReadablePath?: string;
  passes: boolean;
}

export function buildV17ReviewableSourceProof(
  repoPath: string,
  repoFiles: readonly string[],
): ReviewableSourceProof {
  return buildReviewableSourceProof(
    repoPath,
    listRepoInventory(repoPath, repoFiles),
    readGitHead(repoPath),
    WITAN_RUBRIC_VERSION_V17,
  );
}

/**
 * Adds repository-specific arithmetic to v17/v18's zero-measurement abstention.
 *
 * This is presentation context only: the scorer has already decided to abstain because no
 * free-core criterion was measurable. Re-deriving the existing v17 reviewable-source proof
 * here explains why a source-shaped repository did not establish a criterion-ratable surface;
 * it does not alter classification, findings, scores, or the calibrated detector closure.
 */
export function explainNoMeasurementSourceCoverage(
  repoPath: string,
  rubricVersion: string,
): string | undefined {
  if (!usesV17DetectorClosure(rubricVersion)) return undefined;

  const repoFiles = listRepoFiles(repoPath);
  const inventoryFiles = listRepoInventory(repoPath, repoFiles);
  const proof = buildReviewableSourceProof(
    repoPath,
    inventoryFiles,
    readGitHead(repoPath),
    rubricVersion,
  );
  if (proof.sourceShapedFileCount === 0) return undefined;

  const ratableShare = proof.eligibleSourceFileCount / proof.sourceShapedFileCount;
  if (ratableShare >= V17_REVIEWABLE_SOURCE_RATABLE_SHARE_THRESHOLD) return undefined;

  const ratablePct = (ratableShare * 100).toFixed(1);
  const thresholdPct = (V17_REVIEWABLE_SOURCE_RATABLE_SHARE_THRESHOLD * 100).toFixed(0);
  return (
    `${WITAN_NO_MEASUREMENT_REASON} Source coverage: ` +
    `${proof.eligibleSourceFileCount} of ${proof.sourceShapedFileCount} source-shaped files ` +
    `(${ratablePct}%) are criterion-ratable, below the ${thresholdPct}% reviewable-source ` +
    `threshold (${inventoryFiles.length} tracked files in total).`
  );
}

function buildReviewableSourceProof(
  repoPath: string,
  repoFiles: readonly string[],
  headSha: string | null,
  rubricVersion: string,
): ReviewableSourceProof {
  const sourceShapedFiles = repoFiles.filter(
    (path) =>
      isRecognizedSourcePath(path, rubricVersion) ||
      isUnrecognisedSourcePath(path, rubricVersion) ||
      /\.ipynb$/i.test(path),
  );
  const eligibleSourceFiles = sourceShapedFiles.filter(
    (path) =>
      !GENERATED_OR_VENDOR_PATH_PATTERN.test(path) &&
      !V17_BUILD_OR_DEPENDENCY_CACHE_PATH_PATTERN.test(path) &&
      (SOURCE_EXTENSION_PATTERN.test(path) || /\.m$/i.test(path)),
  );
  const sample = selectProportionalRepresentativeSourceFiles(
    eligibleSourceFiles,
    `witan-v17-reviewable-source:${headSha ?? 'unversioned'}`,
    READABLE_SOURCE_REPRESENTATION_SAMPLE_LIMIT_V13,
  );
  const readablePaths = sample.filter((file) => {
    const contents = readRepresentativeSourceText(repoPath, file);
    return contents !== null && isRepresentativeSourceText(contents);
  });
  const ratableShare =
    sourceShapedFiles.length === 0 ? 0 : eligibleSourceFiles.length / sourceShapedFiles.length;
  const readableShare = sample.length === 0 ? 0 : readablePaths.length / sample.length;

  return {
    sourceShapedFileCount: sourceShapedFiles.length,
    eligibleSourceFileCount: eligibleSourceFiles.length,
    sampledFileCount: sample.length,
    readableSampledFileCount: readablePaths.length,
    ...(readablePaths[0] ? { firstReadablePath: readablePaths[0] } : {}),
    passes:
      eligibleSourceFiles.length > 0 &&
      ratableShare >= V17_REVIEWABLE_SOURCE_RATABLE_SHARE_THRESHOLD &&
      readablePaths.length > 0 &&
      (readableShare >= 0.75 || readablePaths.length >= 8),
  };
}

function applyReadableSourceRepresentationGate(
  repoPath: string,
  repoFiles: readonly string[],
  classification: RepoArchetypeClassification,
  headSha: string | null,
  rubricVersion: string,
): RepoArchetypeClassification {
  if (classification.archetype !== 'source' && classification.archetype !== 'monorepo') {
    return classification;
  }

  const authoredSourceFiles = repoFiles.filter(
    (path) =>
      isAuthoredProductionPath(path) &&
      (isRecognizedSourcePath(path, rubricVersion) ||
        isUnrecognisedSourcePath(path, rubricVersion) ||
        /\.ipynb$/i.test(path)),
  );
  if (authoredSourceFiles.length === 0) return classification;

  const sample = selectProportionalRepresentativeSourceFiles(
    authoredSourceFiles,
    `witan-v13-readable-source:${headSha ?? 'unversioned'}`,
    READABLE_SOURCE_REPRESENTATION_SAMPLE_LIMIT_V13,
  );
  const sampledByExtension = new Map<string, { sampled: number; readable: number }>();
  for (const file of sample) {
    const extension = extname(file).toLowerCase() || '(none)';
    const counts = sampledByExtension.get(extension) ?? { sampled: 0, readable: 0 };
    counts.sampled += 1;
    const contents = readRepresentativeSourceText(repoPath, file);
    if (contents !== null && isRepresentativeSourceText(contents)) {
      counts.readable += 1;
    }
    sampledByExtension.set(extension, counts);
  }

  const sourceCountByExtension = new Map<string, number>();
  for (const file of authoredSourceFiles) {
    const extension = extname(file).toLowerCase() || '(none)';
    sourceCountByExtension.set(extension, (sourceCountByExtension.get(extension) ?? 0) + 1);
  }
  const readableSourceFileCount = [...sourceCountByExtension.entries()].reduce(
    (total, [extension, sourceCount]) => {
      const sampled = sampledByExtension.get(extension);
      if (!sampled || sampled.sampled === 0) return total;
      return total + sourceCount * (sampled.readable / sampled.sampled);
    },
    0,
  );
  const readableRatio = readableSourceFileCount / authoredSourceFiles.length;
  if (readableRatio >= READABLE_SOURCE_REPRESENTATION_THRESHOLD_V13) return classification;

  const readableCountLabel = Number.isInteger(readableSourceFileCount)
    ? String(readableSourceFileCount)
    : readableSourceFileCount.toFixed(2);
  const readablePct = (readableRatio * 100).toFixed(1);
  const thresholdPct = (READABLE_SOURCE_REPRESENTATION_THRESHOLD_V13 * 100).toFixed(0);
  return {
    archetype: 'non_cohesive_source',
    sourceFileCount: classification.sourceFileCount,
    totalFileCount: classification.totalFileCount,
    abstentionKind: 'readable_representation',
    insufficientSourceReason:
      `Readable source representation covers ${readableCountLabel} of ${authoredSourceFiles.length} authored source-shaped file(s) (${readablePct}%); this is below the ${thresholdPct}% representation threshold. ` +
      `Cejel abstains because unreadable, compressed, binary-shaped, or opaque source families cannot support a representative headline score. ${INGEST_POINTER}`,
  };
}

function applySemanticSourceRepresentationGate(
  repoPath: string,
  repoFiles: readonly string[],
  classification: RepoArchetypeClassification,
  rubricVersion: string,
): RepoArchetypeClassification {
  if (classification.archetype !== 'source' && classification.archetype !== 'monorepo') {
    return classification;
  }

  const authoredSourceFiles = repoFiles.filter(
    (path) =>
      isAuthoredProductionPath(path) &&
      (isRecognizedSourcePath(path, rubricVersion) ||
        isUnrecognisedSourcePath(path, rubricVersion) ||
        /\.ipynb$/i.test(path)),
  );
  if (authoredSourceFiles.length === 0) return classification;

  const auxiliaryFiles = authoredSourceFiles.filter((path) =>
    SEMANTIC_AUXILIARY_PATH_PATTERN_V14.test(path),
  );
  const packageMetadataFiles = authoredSourceFiles.filter((path) =>
    isRubyPackageRecipeMetadataSource(repoPath, path),
  );
  const redirectMetadataFiles = authoredSourceFiles.filter((path) =>
    isHtmlRedirectMetadataSource(repoPath, path),
  );
  const auxiliarySet = new Set([
    ...auxiliaryFiles,
    ...packageMetadataFiles,
    ...redirectMetadataFiles,
  ]);
  const representativeImplementationCount = authoredSourceFiles.filter(
    (path) => !auxiliarySet.has(path),
  ).length;

  if (representativeImplementationCount === 0) {
    const detail =
      redirectMetadataFiles.length > 0
        ? `${redirectMetadataFiles.length} redirect metadata file(s)`
        : packageMetadataFiles.length > 0
          ? `${packageMetadataFiles.length} package metadata file(s)`
          : `${auxiliaryFiles.length} localization or style metadata file(s)`;
    return {
      archetype: 'non_cohesive_source',
      sourceFileCount: classification.sourceFileCount,
      totalFileCount: classification.totalFileCount,
      abstentionKind: 'semantic_auxiliary',
      insufficientSourceReason:
        `${detail} provide no representative product implementation. ` +
        `Cejel abstains because auxiliary metadata or payload files cannot support a product-source headline score. ${INGEST_POINTER}`,
    };
  }

  const auxiliaryCount = auxiliarySet.size;
  const auxiliaryRatio = auxiliaryCount / authoredSourceFiles.length;
  if (
    authoredSourceFiles.length >= SEMANTIC_AUXILIARY_SOURCE_MINIMUM_V14 &&
    auxiliaryRatio >= SEMANTIC_AUXILIARY_SOURCE_RATIO_V14
  ) {
    return {
      archetype: 'non_cohesive_source',
      sourceFileCount: classification.sourceFileCount,
      totalFileCount: classification.totalFileCount,
      abstentionKind: 'semantic_auxiliary',
      insufficientSourceReason:
        `${auxiliaryCount} of ${authoredSourceFiles.length} authored source-shaped file(s) are localization, style, package, or redirect auxiliary material. ` +
        `Cejel abstains because an auxiliary-dominated tree does not expose representative product implementation for a headline score. ${INGEST_POINTER}`,
    };
  }

  return classification;
}

function isHtmlRedirectMetadataSource(repoPath: string, file: string): boolean {
  if (!HTML_SOURCE_EXTENSION_PATTERN.test(file)) return false;
  const contents = readSemanticMetadataPrefix(repoPath, file);
  if (contents === null) return false;
  const operativeContents = contents.replace(/<!--[\s\S]*?-->/g, '');
  if (!HTML_META_REFRESH_PATTERN.test(operativeContents)) return false;
  return !/<(?:script|form|main|article|section|canvas|template)\b/i.test(operativeContents);
}

function isRubyPackageRecipeMetadataSource(repoPath: string, file: string): boolean {
  if (!/\.rb$/i.test(file) || !RUBY_PACKAGE_RECIPE_PATH_PATTERN.test(file)) return false;
  const contents = readSemanticMetadataPrefix(repoPath, file);
  const operativeContents = contents?.replace(/^\s*#.*$/gm, '');
  return (
    operativeContents !== undefined &&
    RUBY_PACKAGE_RECIPE_CLASS_PATTERN.test(operativeContents) &&
    RUBY_PACKAGE_RECIPE_URL_PATTERN.test(operativeContents)
  );
}

function readSemanticMetadataPrefix(repoPath: string, file: string): string | null {
  const absolutePath = join(repoPath, file);
  if (!isRegularFile(absolutePath)) return null;
  return readRepoTextPrefix(absolutePath, SEMANTIC_METADATA_PREFIX_BYTES_V14);
}

function readRepresentativeSourceText(repoPath: string, file: string): string | null {
  const absolutePath = join(repoPath, file);
  try {
    if (!isRegularFile(absolutePath)) return null;
    const size = statSync(absolutePath).size;
    if (size === 0) return null;
    if (size > READABLE_SOURCE_REPRESENTATION_FILE_BYTES_V13) {
      recordContentSkip(absolutePath, 'too_large', true);
      return null;
    }
    return readRepoText(absolutePath, 'utf8');
  } catch (error: unknown) {
    recordFilesystemSkip(absolutePath, error, false, true);
    return null;
  }
}

function sourceDominanceThreshold(rubricVersion: string): number {
  if (
    rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion)
  ) {
    return SOURCE_DOMINANCE_RATIO_THRESHOLD_V11;
  }
  if (rubricVersion === WITAN_RUBRIC_VERSION_V10) return SOURCE_DOMINANCE_RATIO_THRESHOLD_V10;
  if (rubricVersion === WITAN_RUBRIC_VERSION_V9) return SOURCE_DOMINANCE_RATIO_THRESHOLD_V9;
  return SOURCE_DOMINANCE_RATIO_THRESHOLD_V8;
}

function collectUnrecognisedSourceFiles(
  repoFiles: readonly string[],
  rubricVersion: string,
): string[] {
  return repoFiles.filter((path) => isUnrecognisedSourcePath(path, rubricVersion));
}

export function isUnrecognisedSourcePath(
  file: string,
  rubricVersion = WITAN_RUBRIC_VERSION,
): boolean {
  const base = basename(file);
  if (!/\.([a-zA-Z0-9_]+)$/.test(base)) return false;
  if (KNOWN_NON_SOURCE_EXTENSION_PATTERN.test(base)) return false;
  if (
    (rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
      rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
      rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
      rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
      usesV17DetectorClosure(rubricVersion)) &&
    V13_NON_SOURCE_EXTENSION_PATTERN.test(base)
  ) {
    return false;
  }
  if (DOCS_OR_MEDIA_EXTENSION_PATTERN.test(base)) return false;
  if (BUNDLED_BINARY_EXTENSION_PATTERN.test(base)) return false;
  if (isRecognizedSourcePath(base, rubricVersion)) return false;
  return true;
}

// Ranked by how many files carry each extension, most-common first (ties broken
// alphabetically) — the reason should name the DOMINANT unrecognised language(s), not
// whichever extension happens to sort first alphabetically among a long tail of one-off
// mainframe-toolchain formats.
function extensionsByFileCountDescending(files: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const match = /\.([a-zA-Z0-9_]+)$/.exec(basename(file));
    const ext = match?.[1];
    if (!ext) continue;
    const key = `.${ext.toLowerCase()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([extA, countA], [extB, countB]) => countB - countA || extA.localeCompare(extB))
    .map(([ext]) => ext);
}

function unrecognisedEcosystemResult(
  sourceFileCount: number,
  totalFileCount: number,
  unrecognisedSourceFiles: readonly string[],
  dominanceThreshold = SOURCE_DOMINANCE_RATIO_THRESHOLD_V9,
): RepoArchetypeClassification {
  const sample = extensionsByFileCountDescending(unrecognisedSourceFiles).slice(0, 6).join(', ');
  // The reason must name the real numbers (Guard 6) — never a bare verdict — whether recognised
  // source is entirely absent (sourceFileCount === 0, the pre-existing case) or merely
  // incidental (sourceFileCount > 0 but non-dominant, carddemo's shape).
  //
  // And it must name the OPERATIVE numbers. The decision at classifyRepoArchetype divides by
  // `sourceFileCount + unrecognisedSourceFiles.length` — source-shaped files only, because
  // manifests, docs, media and bundled binaries carry no language signal on either side. An
  // earlier draft of this string published `sourceFileCount / totalFileCount` instead, so
  // carddemo's row read "9 of 329 (2.7%)" while the threshold had actually been applied to
  // 9-of-248 (3.6%) — a published figure that was true, and was not the one that decided the
  // verdict. Both are far below the threshold here, so the outcome was right by luck; a
  // repository at 25% of tracked files and 15% of source-shaped files would have abstained
  // while its reason cited 25%, visibly contradicting its own verdict. A reported metric must
  // reconcile to the inputs of the decision it explains.
  const candidateCount = sourceFileCount + unrecognisedSourceFiles.length;
  const dominancePct =
    candidateCount > 0 ? ((sourceFileCount / candidateCount) * 100).toFixed(1) : '0.0';
  const thresholdPct = (dominanceThreshold * 100).toFixed(0);
  const measuredClause =
    sourceFileCount > 0
      ? `${sourceFileCount} of ${candidateCount} source-shaped file(s) (${dominancePct}%) are in a language Cejel reads — below the ${thresholdPct}% dominance threshold a score would need to be meaningful (${totalFileCount} tracked files in total; manifests, lockfiles, docs, media and bundled binaries are excluded from both sides of the ratio)`
      : `0 of ${totalFileCount} tracked file(s) matched a recognised source extension`;
  return {
    archetype: 'unrecognised_ecosystem',
    sourceFileCount,
    totalFileCount,
    abstentionKind: 'unrecognised_ecosystem',
    insufficientSourceReason: `Cejel does not yet read this repository's dominant source language(s) (${sample}) — ${measuredClause}. Cejel abstains from a verdict rather than score a repository whose recognised source is incidental rather than dominant; the Criterion Profile and Measured coverage below show exactly which dimensions were and were not measured. ${INGEST_POINTER}`,
  };
}

function isLikelyMonorepo(repoFiles: readonly string[]): boolean {
  const packageRoots = new Set(
    repoFiles
      .filter((file) => /(^|\/)package\.json$/.test(file))
      .map((file) => (file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '')),
  );
  return packageRoots.size >= 2;
}

// M1 (Phase 3): a nonexistent path previously surfaced as a raw Node ENOENT stack trace
// (or, combined with the visitRepoDir hardening above, would have silently scored an
// empty repo). Fail fast with a clear, actionable message instead.
function assertRepoPathExists(repoPath: string): void {
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(repoPath);
  } catch {
    throw new Error(`Cejel: path not found: ${repoPath}`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`Cejel: path is not a directory: ${repoPath}`);
  }
}

function explainIgnoredScanTarget(repoPath: string): string | undefined {
  const topResult = execGit(['rev-parse', '--show-toplevel'], { cwd: repoPath });
  if (!topResult.ok) {
    if (isExpectedGitAbsence(topResult)) return undefined;
    throw new Error(describeGitFailure(topResult.reason, 'repository-root discovery'));
  }
  const top = topResult.stdout.trim();
  if (!top) return undefined;

  const topResolved = realpathSync(top);
  const targetResolved = realpathSync(repoPath);
  const target = relative(topResolved, targetResolved).split(sep).join('/');
  if (!target || target.startsWith('../')) return undefined;
  const ignored = execGit(['check-ignore', '--quiet', '--', `${target}/`], {
    cwd: topResolved,
  });
  if (!ignored.ok) {
    if (
      isExpectedGitAbsence(ignored) ||
      (ignored.reason === 'exec_failed' && ignored.exitCode === 1)
    ) {
      return undefined;
    }
    throw new Error(describeGitFailure(ignored.reason, 'ignore-rule check'));
  }
  return `The requested scan path (${target}) is excluded by this repository's Git ignore rules, so Cejel found no tracked source to evaluate. Scan a tracked project or intentionally add the path to version control; Cejel abstains rather than score an ignored or vendored working tree.`;
}

// Exported (along with isRegularFile/fileContains/evidenceForRelative below) as the small
// generic toolkit a WitanDomainSignalCollector implementation builds on.
export function buildNotApplicableSignal(
  criterionId: WitanCriterionSignalPayload['criterionId'],
  reason: string,
): WitanCriterionSignalPayload {
  return {
    criterionId,
    positiveEvidence: [],
    findings: [],
    metrics: [],
    notes: reason,
    notApplicable: true,
  };
}

function collectRepoSignals(
  repoPath: string,
  generatedAt: string,
  repoFiles: readonly string[],
  useV27Detectors: boolean,
  useV33Detectors: boolean,
  useV36Detectors: boolean,
  useV39Detectors: boolean,
  useV47Detectors: boolean,
  useV18NativeRls: boolean,
  useV19CommitYear: boolean,
  useV20A3ExplicitGaps: boolean,
  useV21ExecutedEscalations: boolean,
  useV22PackageStartEntrypoint: boolean,
  useV23StrictCoverageAndRecipeRunners: boolean,
  useV23PemPrivateKeyGrammar: boolean,
  useV23WithheldPathAbstention: boolean,
  useV24SecretContentContext: boolean,
  useV25InlineHealthRoute: boolean,
  useV26SettlingEvidence: boolean,
  useV26BuildStepEvidence: boolean,
  useV27FalseAssuranceClosure: boolean,
  reviewableSourceProof?: ReviewableSourceProof,
  inventoryAbsenceContext: InventoryAbsenceContext = LEGACY_INVENTORY_ABSENCE_CONTEXT,
  scanLimitations: Set<string> = new Set(),
): WitanCriterionSignalPayload[] {
  const signals: WitanCriterionSignalPayload[] = [];
  // Monorepo root shared-config (lockfile/CI/dep-update) that governs a sub-package
  // scan; null when scanning a standalone repo or the git root (byte-identical there).
  const mono = resolveMonorepoContext(repoPath, scanLimitations);
  const collectCriterion = <T>(criterionId: WitanCriterionId, collect: () => T): T =>
    withContentReadCriterion(criterionId, collect);
  const a1Signal = collectCriterion('A1', () =>
    collectA1TestIntegrityEvidence(
      repoPath,
      repoFiles,
      useV27Detectors,
      useV33Detectors,
      useV36Detectors,
      useV23StrictCoverageAndRecipeRunners,
      reviewableSourceProof,
      inventoryAbsenceContext,
      useV27FalseAssuranceClosure,
    ),
  );
  const a2Signal = collectCriterion('A2', () =>
    collectA2IsolationEvidence(
      repoPath,
      repoFiles,
      useV27Detectors,
      useV33Detectors,
      useV36Detectors,
      useV39Detectors,
      useV47Detectors,
      useV23PemPrivateKeyGrammar,
      useV24SecretContentContext,
      useV18NativeRls,
      inventoryAbsenceContext,
      scanLimitations,
      useV26SettlingEvidence,
      useV27FalseAssuranceClosure,
    ),
  );
  const a3Signal = collectCriterion('A3', () =>
    collectA3ProdReadinessEvidence(
      repoPath,
      repoFiles,
      useV27Detectors,
      useV20A3ExplicitGaps,
      useV22PackageStartEntrypoint,
      useV23WithheldPathAbstention,
      inventoryAbsenceContext,
      useV25InlineHealthRoute,
      useV26BuildStepEvidence,
    ),
  );
  const a4Signal = collectCriterion('A4', () =>
    collectA4DependencyEvidence(
      repoPath,
      repoFiles,
      mono,
      useV27Detectors,
      useV47Detectors,
      inventoryAbsenceContext,
      useV27FalseAssuranceClosure,
    ),
  );
  const a5Signal = collectCriterion('A5', () =>
    collectA5ClaimRealityEvidence(
      repoPath,
      repoFiles,
      useV27Detectors,
      useV23WithheldPathAbstention,
      inventoryAbsenceContext,
      useV26SettlingEvidence,
    ),
  );
  const b1Signal = buildNotApplicableSignal(
    'B1',
    'Repository scans do not evaluate the dispatch-trace process dimension.',
  );
  const b2Signal = collectCriterion('B2', () =>
    collectB2PrTraceEvidence(repoPath, repoFiles, useV27FalseAssuranceClosure),
  );
  const b3Signal = collectCriterion('B3', () =>
    collectB3CiDisciplineEvidence(repoPath, repoFiles, mono, useV27FalseAssuranceClosure),
  );
  // B4 measures generic audit-trail hygiene (CHANGELOG/SECURITY/AUDIT/STATUS + docs
  // runbooks/incident/security notes) via collectB4AuditEvidence — this is NOT
  // substrate-specific, so it runs on external code too (found 2026-06-30: external
  // repos with a real SECURITY.md/CHANGELOG were being blanket-N/A'd). When a repo has
  // zero audit artifacts the collector returns an explicit not_applicable signal — that is
  // the honest state (no audit surface exists), distinct from a bare `null`, which
  // scoreCriterion now maps to insufficient_data (a measurement gap; also excluded from the
  // composite, but surfaced as unmeasured — see unmeasuredStatus in scoring.ts,
  // goal_cejel_b2_insufficient_data_not_zero_2026-07-10). The same not_applicable gate also
  // fires when the ONLY audit artifact present is a static security-policy document (e.g. a
  // lone SECURITY.md) — that is a disclosure notice, not an audit trail, and has no
  // freshness to rate (goal_cejel_b4_archetype_gate_2026-07-11; see
  // isFreshnessRatableAuditFile below).
  // Substrate repos hit the exact same collector, so their B4 score is unchanged.
  // The Alfred-only "report-up completeness" half is not yet a distinct signal; when it
  // is added, gate ONLY that half to substrate repos — never the generic audit-trail half.
  const b4Signal = collectCriterion('B4', () =>
    collectB4AuditEvidence(
      repoPath,
      repoFiles,
      generatedAt,
      useV19CommitYear,
      scanLimitations,
    ),
  );
  const b5Signal = buildNotApplicableSignal(
    'B5',
    'Repository scans do not evaluate the learning-trace process dimension.',
  );
  // B6 is a generic governance signal (not Alfred-specific) — runs on every repo archetype.
  const b6Signal = collectCriterion('B6', () =>
    collectB6PrivilegedOpsGatingEvidence(
      repoPath,
      repoFiles,
      useV39Detectors,
      useV21ExecutedEscalations,
    ),
  );

  for (const signal of [
    a1Signal,
    a2Signal,
    a3Signal,
    a4Signal,
    a5Signal,
    b1Signal,
    b2Signal,
    b3Signal,
    b4Signal,
    b5Signal,
    b6Signal,
  ]) {
    if (signal) signals.push(signal);
  }

  return signals;
}

function collectA1TestIntegrityEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  useV27Detectors: boolean,
  useV33Detectors: boolean,
  useV36Detectors: boolean,
  useV23StrictCoverageAndRecipeRunners: boolean,
  reviewableSourceProof?: ReviewableSourceProof,
  inventoryAbsenceContext: InventoryAbsenceContext = LEGACY_INVENTORY_ABSENCE_CONTEXT,
  useV27FalseAssuranceClosure = false,
): WitanCriterionSignalPayload | null {
  const evidence: WitanEvidencePointer[] = [];
  const findings: WitanCriterionSignalPayload['findings'] = [];
  // v27 (#518): conftest.py holds pytest fixtures and hooks, not tests, so it does not count as
  // test surface (test_to_source_ratio) or test evidence. Every other rubric counts it because it
  // sits in a test directory. The non-hollow share below is still measured over the v17 list:
  // v17 rates a name-shaped conftest (e.g. under __tests__/) hollow, and dropping it from that
  // denominator would raise the share.
  const v17TestFiles = findConcreteTestFiles(
    repoPath,
    repoFiles,
    reviewableSourceProof ? WITAN_RUBRIC_VERSION_V17 : undefined,
  );
  const allTestFiles = useV27FalseAssuranceClosure
    ? v17TestFiles.filter((file) => !PYTEST_CONFTEST_PATTERN.test(file))
    : v17TestFiles;
  // v27 (#518): a conftest.py hook that skips or deselects every collected test disables the
  // whole suite under it, so those files cannot fail. Read only under v27.
  const runWideSkips = useV27FalseAssuranceClosure
    ? findPytestRunWideSkips(repoPath, repoFiles)
    : [];
  const testFiles = allTestFiles.slice(0, 8);
  const sourceFiles = repoFiles.filter(isSourceFile);
  const runnerFiles = repoFiles
    .filter(
      (file) =>
        (!useV27Detectors || isAuthoredProductionPath(file)) &&
        (isTestRunnerConfig(repoPath, file) ||
          (useV23StrictCoverageAndRecipeRunners && isRecipeTestEntry(repoPath, file))),
    )
    .slice(0, 6);
  const baseConfiguredRunnerFiles = useV33Detectors
    ? findConfiguredTestRunnerFiles(repoPath, repoFiles)
    : runnerFiles;
  const configuredRunnerFiles = useV23StrictCoverageAndRecipeRunners
    ? [
        ...new Set([
          ...baseConfiguredRunnerFiles,
          ...repoFiles.filter((file) => isRecipeTestEntry(repoPath, file)),
        ]),
      ].sort()
    : baseConfiguredRunnerFiles;
  const packageJson = findRootPackageJson(repoFiles);
  const packageScripts = packageJson ? readPackageScripts(join(repoPath, packageJson)) : new Map();
  // Scoped to the 'coverage_percent' signal (not the whole A1 criterion) so an unreadable
  // coverage file only abstains this metric — test-file and CI-script evidence computed from
  // other, readable files survives (goal_cejel_v23_per_signal_abstention_2026-09-06). The
  // classification pass (which files even ARE coverage config) and the value-extraction pass
  // both read the same candidate files, so both are wrapped together; a read failure here can
  // also under-count coverageAnalysis.hasCoverageCommand for verification_script_ratio below —
  // an accepted, narrow scope for this goal (goal_cejel_v23_per_signal_abstention_2026-09-06).
  //
  // Command-flag recognition and its unresolved-reachability abstention run under every rubric
  // (goal_cejel_v26_coverage_config_recognition_2026-10-14, a recognition fix shipped as #459
  // was). v23 alone REPLACES the v17 heuristics with them; every other rubric keeps those
  // heuristics and adds the command analysis, so the change can only withdraw an absence,
  // never assert a new one. Legacy files keep their original order ahead of the additions,
  // because coverage_percent reads the first four.
  const { coverageAnalysis, coveragePercent } = withContentReadSignal('A1', 'coverage_percent', () => {
    const commandAnalysis = analyzeCoverageConfiguration(repoPath, repoFiles, useV27Detectors);
    const analysis = useV23StrictCoverageAndRecipeRunners
      ? commandAnalysis
      : unionWithLegacyCoverageRecognition(
          commandAnalysis,
          findCoverageConfigFiles(repoPath, repoFiles, useV27Detectors),
          packageScripts.has('coverage'),
        );
    return {
      coverageAnalysis: analysis,
      coveragePercent: readCoveragePercent(repoPath, analysis.coverageFiles.slice(0, 4)),
    };
  });
  const allCoverageFiles = coverageAnalysis.coverageFiles;
  const coverageFiles = allCoverageFiles.slice(0, 4);
  const packageJsonFiles = useV27Detectors
    ? repoFiles.filter(
        (file) => /(^|\/)package\.json$/.test(file) && isAuthoredProductionPath(file),
      )
    : packageJson
      ? [packageJson]
      : [];
  // Ecosystems without a package.json (Python, Go, Rust, Java...) have no npm "test"/"lint"/
  // "typecheck" script key to credit — their real verification signal is a CI workflow that
  // actually invokes the equivalent tool (pytest, flake8/ruff, mypy, ...). Crediting only
  // npm-script presence under-scores a mature non-TS repo whose CI runs a real, multi-command
  // verification suite in a single workflow job — the normal shape for those ecosystems
  // (goal_cejel_code_trust_external_ecosystem_calibration_2026-07-06). Each category below is
  // satisfied by EITHER an npm script OR the language-agnostic CI command equivalent, so a
  // Python/Go repo can reach the same verification-depth credit as a Node repo with npm scripts.
  const ciWorkflows = repoFiles.filter(
    (file) => (!useV27Detectors || isAuthoredProductionPath(file)) && isCiWorkflow(file),
  );
  const ciTestWorkflow = ciWorkflows.find((file) =>
    fileContains(repoPath, file, CI_TEST_COMMAND_PATTERN),
  );
  const ciHasLintCommand = ciWorkflows.some((file) =>
    fileContains(repoPath, file, CI_LINT_COMMAND_PATTERN),
  );
  const ciHasTypecheckCommand = ciWorkflows.some((file) =>
    fileContains(repoPath, file, CI_TYPECHECK_COMMAND_PATTERN),
  );
  // Built once and reused verbatim by both the normal return below and the authenticated-
  // absence branch (buildA1AuthenticatedAbsenceSignal) — these four signals derive from
  // package.json/CI content, not from test-file presence, so a repo with zero test files can
  // still legitimately have a real lint/typecheck/coverage setup; zeroing them out just
  // because no test *files* exist previously made A1 flatly contradict B3, which credits the
  // same package scripts directly (goal_cejel_detector_false_assertions_0_4_9_2026-09-14
  // finding 3).
  const verificationScriptComponents = [
    { label: 'test command', count: hasCredibleTestScript(packageScripts) || Boolean(ciTestWorkflow) ? 1 : 0 },
    { label: 'coverage command', count: coverageAnalysis.hasCoverageCommand ? 1 : 0 },
    { label: 'lint command', count: packageScripts.has('lint') || ciHasLintCommand ? 1 : 0 },
    {
      label: 'type-check command',
      count: packageScripts.has('typecheck') || ciHasTypecheckCommand ? 1 : 0,
    },
  ];
  const verificationScriptCount = verificationScriptComponents.filter((c) => c.count > 0).length;
  // A lean/built-in test toolchain (e.g. Node's `node:test`) with no heavy transitive test
  // dependency is a positive supply-chain signal, not a "no coverage tool" ding — it has no
  // separate coverage-config file by design (goal_cejel_rubric_refinement_from_lua_2026-07-06).
  const usesLeanBuiltInTestRunner =
    (packageJson != null &&
      [...packageScripts.values()].some((script) =>
        LEAN_TEST_RUNNER_SCRIPT_PATTERN.test(script),
      )) ||
    // v17's first eight, under every rubric: v27's conftest exclusion must not move a file into
    // this sample and change the finding below.
    v17TestFiles
      .slice(0, 8)
      .some((file) => fileContains(repoPath, file, LEAN_TEST_RUNNER_IMPORT_PATTERN));
  // A root node:test script does not make a monorepo lean when any workspace still carries a
  // heavyweight runner. v26 missed Meteor because it inspected only the root package.json and
  // therefore suppressed a real no-coverage finding despite nested Jest dependencies.
  const hasHeavyTestDependency = packageJsonFiles.some((manifest) =>
    packageJsonHasHeavyTestDependency(repoPath, manifest),
  );
  const isLeanTestToolchain = usesLeanBuiltInTestRunner && !hasHeavyTestDependency;

  for (const file of testFiles) {
    // Every rubric (#519): a Git LFS pointer is named as one, so the evidence does not present
    // pointer text as a test. The file is read here exactly as evidenceForRelative reads it.
    const testPath = join(repoPath, file);
    const isLfsPointer =
      isRegularFile(testPath) && isGitLfsPointerText(readRepoText(testPath, 'utf8'));
    evidence.push(
      evidenceForRelative(
        repoPath,
        file,
        'test_run',
        isLfsPointer
          ? 'Detected test file (Git LFS pointer; its content is not in this checkout)'
          : 'Detected test file',
      ),
    );
  }
  // v27 (#518): where conftest.py files are the only test-shaped files, they are cited as what
  // they are. A1 then measures a suite with no test file (test_to_source_ratio 0), as v17 measured
  // it, instead of losing its only evidence and leaving the composite, which could raise it.
  if (useV27FalseAssuranceClosure && allTestFiles.length === 0) {
    for (const file of v17TestFiles.slice(0, 8)) {
      evidence.push(
        evidenceForRelative(repoPath, file, 'test_run', 'pytest configuration (conftest.py), not a test file'),
      );
    }
  }
  for (const file of runnerFiles) {
    evidence.push(evidenceForRelative(repoPath, file, 'test_run', 'Configured test runner'));
  }
  if (
    packageJson &&
    [...packageScripts.values()].some((script) => TEST_RUNNER_PATTERN.test(script))
  ) {
    evidence.push(evidenceForRelative(repoPath, packageJson, 'test_run', 'Configured test runner'));
  }
  // Wrapped with the coverage_percent signal: this evidence pointer is hashed from the same
  // coverage-config file(s) readCoveragePercent above reads, so an unreadable file here belongs
  // to the same signal, not an unattributed A1-wide skip.
  withContentReadSignal('A1', 'coverage_percent', () => {
    for (const file of coverageFiles) {
      evidence.push(evidenceForRelative(repoPath, file, 'coverage', 'Coverage configuration'));
    }
  });
  if (ciTestWorkflow) {
    evidence.push(
      evidenceForRelative(repoPath, ciTestWorkflow, 'test_run', 'CI workflow runs the test suite'),
    );
  }

  // Generalized scheduled-health-workflow sub-signal (see the constants above).
  // Not applicable when no such workflow exists (nothing to rate); a workflow whose
  // publication status cannot be determined contributes nothing (insufficient_data —
  // never a warning); only a workflow that demonstrably exists AND demonstrably hands
  // its result to nothing but an ephemeral CI artifact earns the warning.
  const scheduledHealthWorkflow = ciWorkflows.find(
    (file) =>
      fileContains(repoPath, file, SCHEDULE_TRIGGER_PATTERN) &&
      fileContains(repoPath, file, CI_TEST_COMMAND_PATTERN) &&
      (!useV36Detectors ||
        SCHEDULED_HEALTH_PATH_PATTERN.test(file) ||
        fileContains(repoPath, file, SCHEDULED_HEALTH_INTENT_PATTERN)),
  );
  if (scheduledHealthWorkflow) {
    const isPublished = fileContains(
      repoPath,
      scheduledHealthWorkflow,
      PUBLISHED_RESULT_MARKER_PATTERN,
    );
    const isEphemeralOnly =
      !isPublished &&
      fileContains(repoPath, scheduledHealthWorkflow, EPHEMERAL_ARTIFACT_ONLY_PATTERN);
    if (isPublished) {
      evidence.push(
        evidenceForRelative(
          repoPath,
          scheduledHealthWorkflow,
          'scheduled_health_summary',
          'Scheduled product-health workflow with durably published results',
        ),
      );
    } else if (isEphemeralOnly) {
      findings.push({
        severity: 'warning',
        summary:
          'A scheduled product-health workflow exists, but its results are handed only to an ephemeral, access-gated CI artifact — not a durable, checkable record.',
        evidence: evidenceForRelative(
          repoPath,
          scheduledHealthWorkflow,
          'scheduled_health_summary',
          'Scheduled product-health workflow',
        ),
      });
    }
    // Else: publication status is undeterminable from a static file-tree read —
    // insufficient_data for this sub-signal, contributing neither evidence nor a finding.
  }

  if (evidence.length === 0 && findings.length === 0 && configuredRunnerFiles.length === 0) {
    return reviewableSourceProof?.passes === true && reviewableSourceProof.firstReadablePath
      ? buildA1AuthenticatedAbsenceSignal(
          repoPath,
          reviewableSourceProof,
          repoFiles.length,
          inventoryAbsenceContext,
          verificationScriptComponents,
          runnerFiles.length,
        )
      : null;
  }

  if (testFiles.length === 0) {
    const fallback = configuredRunnerFiles[0]
      ? evidenceForRelative(
          repoPath,
          configuredRunnerFiles[0],
          'test_run',
          'Configured test runner',
        )
      : useV33Detectors
        ? undefined
        : (evidence[0] ?? findings[0]?.evidence);
    if (fallback) {
      findings.push(
        inventoryAbsenceFinding({
          severity: 'warning',
          summaries: {
            legacy: 'A test runner is configured, but no concrete test files were detected.',
            currentTracked:
              'A test runner is configured, but the tracked scan-eligible inventory matched no concrete test file.',
            currentDirectoryWalk:
              'A test runner is configured, but the bounded directory walk matched no concrete test file.',
          },
          evidence: fallback,
          context: inventoryAbsenceContext,
          inventoryCount: repoFiles.length,
          patternSet: INVENTORY_SCAN_PATTERN_SETS.a1ConcreteTests,
          matchCount: 0,
        }),
      );
    }
  } else if (
    coverageFiles.length === 0 &&
    coverageAnalysis.unresolvedFiles.length === 0 &&
    (!useV33Detectors || configuredRunnerFiles.length > 0)
  ) {
    if (isLeanTestToolchain) {
      const leanEvidenceFile = packageJson ?? testFiles[0];
      if (leanEvidenceFile) {
        evidence.push(
          evidenceForRelative(
            repoPath,
            leanEvidenceFile,
            'test_run',
            'Lean built-in test toolchain (e.g. node:test) — no heavy transitive test dependency',
          ),
        );
      }
    } else {
      const firstEvidence = evidence[0];
      if (!firstEvidence) return null;
      findings.push(
        inventoryAbsenceFinding({
          severity: 'info',
          summaries: {
            legacy: 'Test suite files are present, but no coverage configuration was detected.',
            currentTracked:
              'Test suite files are present, but the tracked scan-eligible inventory matched no coverage configuration.',
            currentDirectoryWalk:
              'Test suite files are present, but the bounded directory walk matched no coverage configuration.',
          },
          evidence: firstEvidence,
          context: inventoryAbsenceContext,
          inventoryCount: repoFiles.length,
          patternSet: useV23StrictCoverageAndRecipeRunners
            ? INVENTORY_SCAN_PATTERN_SETS.a1CoverageConfigurationV4
            : INVENTORY_SCAN_PATTERN_SETS.a1CoverageConfigurationV3,
          matchCount: 0,
        }),
      );
    }
  }

  // Scoped to the 'non_hollow_test_share' signal for the same reason as coverage_percent above:
  // an unreadable test file should only abstain this metric, not the whole A1 criterion.
  const nonHollowShare = withContentReadSignal('A1', 'non_hollow_test_share', () =>
    measureNonHollowTestShare(
      repoPath,
      v17TestFiles,
      reviewableSourceProof !== undefined,
      useV27FalseAssuranceClosure
        ? {
            disabledByRunWideSkip: (file) =>
              runWideSkips.some((skip) => isGovernedPytestFile(skip, file)),
          }
        : undefined,
    ),
  );
  for (const skip of runWideSkips.slice(0, 2)) {
    const governed = allTestFiles.filter((file) => isGovernedPytestFile(skip, file)).length;
    if (governed === 0) continue;
    findings.push({
      severity: 'warning',
      summary: `A pytest collection hook in ${skip.path} ${skip.kind === 'skip' ? 'marks every collected test skipped' : 'removes every collected test'}, so the ${governed} pytest file${governed === 1 ? '' : 's'} under ${skip.scope === '' ? 'the repository root' : `${skip.scope}/`} cannot run.`,
      evidence: evidenceForRelativeAtLine(
        repoPath,
        skip.path,
        'test_run',
        'Run-wide pytest skip hook',
        skip.line,
      ),
    });
  }

  return {
    criterionId: 'A1',
    positiveEvidence: evidence,
    findings,
    metrics: [
      metric(
        'test_to_source_ratio',
        'Test-to-source file ratio',
        allTestFiles.length,
        Math.max(sourceFiles.length, 1),
        0.3,
        'ratio',
        'Measures how much concrete test surface exists relative to implementation surface.',
        'saturating_count',
      ),
      metric(
        'coverage_percent',
        'Static coverage percentage',
        coveragePercent ?? 0,
        100,
        0.3,
        'percent',
        'Uses a static coverage report value or configured threshold when present, without running tests.',
      ),
      metric(
        'verification_script_ratio',
        'Verification script ratio',
        verificationScriptCount + runnerFiles.length,
        4,
        0.25,
        'ratio',
        'Counts detected test, coverage, lint, and typecheck commands plus detected test-runner configuration files; raw credit is capped at four.',
        'saturating_count',
        {
          components: [
            ...verificationScriptComponents,
            { label: 'test-runner configuration', count: runnerFiles.length },
          ],
        },
      ),
      metric(
        'non_hollow_test_share',
        'Non-hollow test share',
        nonHollowShare.nonHollowCount,
        Math.max(nonHollowShare.ratedCount, 1),
        0.15,
        'ratio',
        'Penalizes skipped or placeholder-only test files; test-directory support scaffolding (helpers/fixtures with no test in them) is excluded from the denominator.',
      ),
    ],
    notes:
      coverageFiles.length === 0 && coverageAnalysis.unresolvedFiles.length > 0
        ? `A1 is detected from real test files, test runner configuration, and optional coverage configuration. Coverage command reachability or flag ownership was unresolved in ${coverageAnalysis.unresolvedFiles.slice(0, 4).join(', ')}; the no-coverage absence claim was withheld.`
        : 'A1 is detected from real test files, test runner configuration, and optional coverage configuration.',
  };
}

function buildA1AuthenticatedAbsenceSignal(
  repoPath: string,
  proof: ReviewableSourceProof,
  inventoryCount: number,
  inventoryAbsenceContext: InventoryAbsenceContext,
  verificationScriptComponents: ReadonlyArray<{ label: string; count: number }>,
  runnerFileCount: number,
): WitanCriterionSignalPayload {
  const sourcePath = proof.firstReadablePath;
  if (!sourcePath) {
    throw new Error('Cejel invariant: a passing reviewable-source proof must have a readable path');
  }
  const anchor = evidenceForRelative(
    repoPath,
    sourcePath,
    'artifact',
    `Reviewable source anchor (${proof.readableSampledFileCount}/${proof.sampledFileCount} sampled files readable; ${proof.eligibleSourceFileCount}/${proof.sourceShapedFileCount} source-shaped files criterion-ratable)`,
  );
  return {
    criterionId: 'A1',
    positiveEvidence: [anchor],
    findings: [
      inventoryAbsenceFinding({
        severity: 'critical',
        summaries: {
          legacy: WITAN_LEGACY_AUTHENTICATED_A1_ABSENCE_SUMMARY,
          currentTracked: WITAN_AUTHENTICATED_A1_ABSENCE_SUMMARY,
          currentDirectoryWalk: WITAN_DIRECTORY_WALK_AUTHENTICATED_A1_ABSENCE_SUMMARY,
        },
        evidence: anchor,
        context: inventoryAbsenceContext,
        inventoryCount,
        patternSet: INVENTORY_SCAN_PATTERN_SETS.a1AuthenticatedAbsence,
        matchCount: 0,
      }),
    ],
    metrics: [
      metric(
        'test_to_source_ratio',
        'Test-to-source file ratio',
        0,
        proof.eligibleSourceFileCount,
        0.3,
        'ratio',
        'Measures how much concrete test surface exists relative to criterion-ratable implementation source.',
        'saturating_count',
      ),
      metric(
        'coverage_percent',
        'Static coverage percentage',
        0,
        100,
        0.3,
        'percent',
        'Uses a static coverage report value or configured threshold when present, without running tests.',
      ),
      metric(
        'verification_script_ratio',
        'Verification script ratio',
        // Zero test FILES does not mean zero verification signal: a lint/typecheck/coverage
        // script or CI command is a real, independently-observable fact from package.json/CI
        // content and must be credited here the same way B3 credits it, or A1 flatly
        // contradicts B3 on the same repository fact (goal_cejel_detector_false_assertions_
        // 0_4_9_2026-09-14 finding 3).
        verificationScriptComponents.filter((c) => c.count > 0).length + runnerFileCount,
        4,
        0.25,
        'ratio',
        'Counts detected test, coverage, lint, and typecheck commands plus detected test-runner configuration files; raw credit is capped at four.',
        'saturating_count',
        {
          components: [
            ...verificationScriptComponents,
            { label: 'test-runner configuration', count: runnerFileCount },
          ],
        },
      ),
      metric(
        'non_hollow_test_share',
        'Non-hollow test share',
        0,
        1,
        0.15,
        'ratio',
        'No concrete test files were present to establish non-hollow test behavior.',
      ),
    ],
    notes:
      `V17 authenticated absence: ${proof.eligibleSourceFileCount} criterion-ratable of ` +
      `${proof.sourceShapedFileCount} source-shaped files; sampled ${proof.sampledFileCount}; ` +
      `${proof.readableSampledFileCount} representative-text files. Verification-script signals ` +
      `(lint/typecheck/coverage/CI commands) are independent of test-file presence and are ` +
      `still credited above where detected.`,
  };
}

function collectA2IsolationEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  useV27Detectors: boolean,
  useV33Detectors: boolean,
  useV36Detectors: boolean,
  useV39Detectors: boolean,
  useV47Detectors: boolean,
  useV23PemPrivateKeyGrammar: boolean,
  useV24SecretContentContext: boolean,
  useV18NativeRls: boolean,
  inventoryAbsenceContext: InventoryAbsenceContext,
  scanLimitations: Set<string>,
  useV26SettlingEvidence = false,
  useV27FalseAssuranceClosure = false,
): WitanCriterionSignalPayload | null {
  const evidence: WitanEvidencePointer[] = [];
  const findings: WitanCriterionSignalPayload['findings'] = [];
  const gitignore = repoFiles.find((file) => basename(file) === '.gitignore');
  const envExamples = repoFiles.filter((file) => isEnvTemplatePath(file, useV47Detectors));
  const migrationFiles = repoFiles.filter((file) =>
    /(^|\/)(migrations?|drizzle|prisma)\//.test(file),
  );

  // Committed/history secret scan runs unconditionally, BEFORE the archetype N/A gate
  // below — a hardcoded secret (e.g. `stripe_secret_key = "sk-…"` with no .env in sight)
  // must fire critical even in an archetype the gate would otherwise call N/A; the prior
  // ordering made a real committed secret invisible whenever there was no "data layer" or
  // "secrets surface" (goal_cejel_launch_hardening_combined_2026-07-06, Phase 2 FN #2).
  // Scoped to the 'secret_cleanliness' signal: this is A2's secret matcher, the clearest case
  // of a finding that genuinely depends on file content (goal_cejel_v23_instrument_all_
  // criteria_2026-09-07) — an unreadable file here must abstain the committed-secret finding
  // and the secret_cleanliness metric, never silently report "clean" from a file it never saw.
  const { committedSecret, ambiguousSecret, currentSecretFingerprintsByPath, placeholderSetAside } =
    withContentReadSignal('A2', 'secret_cleanliness', () => {
      let match_: { path: string; match: RealSecretAssignmentMatch } | undefined;
      let ambiguous_: { path: string; match: RealSecretAssignmentMatch } | undefined;
      const setAsideFiles: PlaceholderSetAsideFile[] = [];
      for (const path of repoFiles) {
        // v24: the credential-specific path exemptions do not decide this scan. The shared
        // non-production/generated/vendor inventory rule (isAuthoredProductionPath) is unchanged
        // — widening that is a different question about what a repository's source IS, not about
        // how a matched credential value is classified.
        const authoredProductionPath = useV24SecretContentContext
          ? isAuthoredProductionPath(path)
          : useV47Detectors
            ? isV47AuthoredProductionPath(path)
            : useV39Detectors
              ? isV39AuthoredProductionPath(path)
              : isAuthoredProductionPath(path);
        if (
          (useV24SecretContentContext
            ? isV24IgnoredScanFile(path)
            : isIgnoredScanFile(path, useV47Detectors)) ||
          (useV33Detectors && !authoredProductionPath)
        ) {
          continue;
        }
        const setAside: PlaceholderSetAsideCount = { count: 0 };
        if (useV24SecretContentContext) {
          const classified = findV24ClassifiedSecretInFile(
            repoPath,
            path,
            useV36Detectors,
            useV39Detectors,
            useV47Detectors,
            setAside,
          );
          if (setAside.count > 0) setAsideFiles.push({ path, count: setAside.count });
          if (!classified) continue;
          if (classified.classification === 'real') {
            match_ = { path, match: classified.match };
            break;
          }
          ambiguous_ ??= { path, match: classified.match };
          continue;
        }
        const found = findCommittedSecretInFile(
          repoPath,
          path,
          useV36Detectors,
          useV39Detectors,
          useV47Detectors,
          useV23PemPrivateKeyGrammar,
          setAside,
        );
        if (setAside.count > 0) setAsideFiles.push({ path, count: setAside.count });
        if (!found) continue;
        match_ = { path, match: found };
        break;
      }
      const fingerprintsByPath = new Map<string, ReadonlySet<string>>();
      if (useV27Detectors) {
        for (const path of repoFiles.filter((candidate) =>
          isCredentialHistoryPath(candidate, useV36Detectors, useV23PemPrivateKeyGrammar),
        )) {
          fingerprintsByPath.set(
            path,
            new Set(
              findSecretFingerprintsInFile(
                repoPath,
                path,
                useV36Detectors,
                useV39Detectors,
                useV47Detectors,
                useV23PemPrivateKeyGrammar,
              ),
            ),
          );
        }
      }
      return {
        committedSecret: match_,
        // A confidently real match anywhere in the tree supersedes every ambiguous one: the
        // abstention exists for repositories Cejel could not classify, not as a way for one
        // unclassifiable value to withhold a metric a confirmed leak already decided.
        ambiguousSecret: match_ ? undefined : ambiguous_,
        currentSecretFingerprintsByPath: fingerprintsByPath,
        // Only a scan that read every eligible file can say what it set aside; one that stopped at
        // a confirmed secret did not, and the certificate already reports that secret.
        placeholderSetAside: match_ ? [] : setAsideFiles,
      };
    });
  // Current-tree and ancestor-history evidence are independent propositions. A current secret
  // must not suppress a distinct deleted/rotated credential finding from history. V8 excludes
  // HEAD and any still-current value fingerprints from the history pass, so unchanged credentials
  // are not emitted twice while a distinct historical value remains reviewable.
  const historySecretScan =
    committedSecret && !useV27Detectors
      ? null
      : collectHistorySecretEvidence(
          repoPath,
          useV27Detectors,
          currentSecretFingerprintsByPath,
          scanLimitations,
          useV33Detectors,
          useV36Detectors,
          useV39Detectors,
          useV47Detectors,
          useV23PemPrivateKeyGrammar,
        );
  const hasConfirmedSecretFinding = committedSecret != null || historySecretScan?.evidence != null;

  // Crypto hygiene nudge (goal_cejel_rubric_refinement_from_lua_2026-07-06): computed
  // unconditionally, BEFORE the archetype N/A gate below — a signing/HMAC/secret-comparison
  // surface in source (e.g. an audit-chain library with no .env anywhere) IS itself a ratable
  // secrets surface, same reasoning as the committed/history secret scan above. Bounded and
  // only scored when such a surface is actually found; never a penalty for repos without one.
  // Scoped to 'crypto_comparison_hygiene': independent of the secret scan above, this reads a
  // different file set (implementation files) for a different pattern family (signing/HMAC/
  // secret-comparison) and feeds its own metric plus its own findings.
  const cryptoHygiene = withContentReadSignal('A2', 'crypto_comparison_hygiene', () =>
    collectCryptoHygieneEvidence(
      repoPath,
      repoFiles.filter(isImplementationFile).slice(0, 60),
      useV39Detectors,
    ),
  );

  // Archetype-aware N/A gate. A ratable secrets surface requires at least one of:
  //   • a committed or in-history .env* file
  //   • a .env.example/.sample/.template
  //   • a .gitignore with a .env rule
  //   • credential-management code (secrets manager / KMS client)
  // Bare env reads (process.env / os.environ / std::env:: / getenv( / ENV[) are NOT a ratable
  // surface — you cannot evaluate secrets posture from the fact that code reads an env var.
  // Data layer: migration directories or DB client imports in implementation files.
  // ANTI-OVERFIT: N/A requires evidenced absence of BOTH surfaces. A repo with a committed .env
  // containing a secret → LOW/critical, never N/A. A data layer without RLS → LOW, never N/A.
  const implFiles = repoFiles.filter(isImplementationFile);
  const gitignoreHasEnvRule =
    gitignore != null && fileContains(repoPath, gitignore, /^\.env(\*|\b)|\.env\./m);
  // .env* in current tree, excluding templates (.env.example/.sample/.template are in envExamples).
  // Catches .env, .env.production, .env.staging, .env.local, etc.
  const committedEnvFilePath = repoFiles.find(
    (f) =>
      /(?:^|\/)\.env(?:\.|$)/i.test(f) &&
      !isEnvTemplatePath(f, useV47Detectors) &&
      (!useV47Detectors || isV47AuthoredProductionPath(f)) &&
      (!useV39Detectors || !hasTemplateOnlyEnvContent(repoPath, f)),
  );
  // Only scan history when the current tree has no .env* to avoid redundant scanning.
  const hasEnvInHistory =
    committedEnvFilePath === undefined && hasEnvPathInGitHistory(repoPath, scanLimitations);
  // DB client import file (checked before migrationFiles so we can use it as evidence anchor).
  const dbLayerImportFile =
    migrationFiles.length === 0
      ? implFiles.slice(0, 30).find((f) => fileContains(repoPath, f, DB_CLIENT_PATTERN))
      : undefined;
  const hasDataLayer = migrationFiles.length > 0 || dbLayerImportFile !== undefined;
  const hasSecretsSurface =
    envExamples.length > 0 ||
    committedEnvFilePath !== undefined ||
    gitignoreHasEnvRule ||
    hasEnvInHistory;

  if (
    !hasDataLayer &&
    !hasSecretsSurface &&
    !hasConfirmedSecretFinding &&
    !cryptoHygiene.hasSurface
  ) {
    return {
      ...buildNotApplicableSignal(
        'A2',
        'No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.',
      ),
      ...placeholderSetAsideDisclosures(placeholderSetAside),
    };
  }

  // Push at least one evidence anchor so evidenceCount > 0 after the full evidence-collection
  // pass. This guarantees metric-based scoring fires for any repo that passes the N/A gate,
  // preventing the null → 0.0-unverified fallback. gitignoreEnvFile and envExamples are already
  // pushed in the main evidence loop below, so they do not need an extra push here; cover the
  // remaining ratable-surface cases.
  if (committedEnvFilePath) {
    evidence.push(
      evidenceForRelative(
        repoPath,
        committedEnvFilePath,
        'secret_scan',
        'Committed .env file in repository tree',
      ),
    );
  } else if (hasEnvInHistory) {
    evidence.push({
      kind: 'secret_scan',
      label: '.env path detected in git history',
      path: '.git',
      contentHash: readGitHead(repoPath) ?? 'env-history-scan',
    });
  } else if (migrationFiles[0] != null) {
    evidence.push(
      evidenceForRelative(repoPath, migrationFiles[0], 'artifact', 'Data layer migration'),
    );
  } else if (dbLayerImportFile != null) {
    evidence.push(evidenceForRelative(repoPath, dbLayerImportFile, 'artifact', 'DB client import'));
  }
  // hasSecretsSurface via gitignoreHasEnvRule or envExamples: pushed in main loop below.

  // Scoped to ['rls_policy_count', 'tenant_scope_ratio']: both metrics (and the tenant-
  // without-RLS gap finding below) are derived from this one pass over migration files, so a
  // read failure anywhere in it abstains both rather than leaving one silently under-counted
  // from the other's partial read.
  const tenantScopePattern = useV39Detectors
    ? TENANT_SCOPE_PATTERN_V11
    : useV36Detectors
      ? TENANT_SCOPE_PATTERN_V10
      : TENANT_SCOPE_PATTERN;
  const {
    rlsMigration,
    tenantScopedFile,
    rlsPolicyCount,
    tenantScopedMigrationFileCount,
    nativeRlsInventory,
    tenantWithoutRlsPremiseFiles,
  } = withContentReadSignals('A2', ['rls_policy_count', 'tenant_scope_ratio'], () => {
    const v47RlsPolicyFiles = useV47Detectors ? findRlsPolicyFiles(repoPath, repoFiles) : [];
    const rlsInventory = useV18NativeRls ? deriveRlsPolicyScopeInventory(repoPath, repoFiles) : null;
    // V18 positive isolation credit is policy-native, but a schema that advertises a
    // tenant boundary and has zero policies must never be silently reclassified as
    // single-tenant. This legacy, conservative premise is used only to emit the
    // fail-closed gap finding; it cannot manufacture D7 credit or isolation metrics.
    const tenantWithoutRlsFiles = useV18NativeRls
      ? findTenantStoragePremiseFiles(repoPath, repoFiles)
      : [];
    const v47TenantStorageFiles =
      useV47Detectors && !useV18NativeRls
        ? findTenantStoragePremiseFiles(repoPath, repoFiles)
        : [];
    return {
      rlsMigration: useV47Detectors
        ? v47RlsPolicyFiles[0]
        : migrationFiles.find((file) => fileContains(repoPath, file, RLS_PATTERN)),
      tenantScopedFile: useV18NativeRls
        ? rlsInventory?.storageFiles[0]
        : useV47Detectors
          ? v47TenantStorageFiles[0]
          : migrationFiles.find((file) => fileContains(repoPath, file, tenantScopePattern)),
      rlsPolicyCount: useV18NativeRls
        ? (rlsInventory?.policyCount ?? 0)
        : useV47Detectors
          ? v47RlsPolicyFiles.length
          : countPatternMatches(
              repoPath,
              migrationFiles,
              /create policy|enable row level security|force row level security/gi,
            ),
      tenantScopedMigrationFileCount: useV18NativeRls
        ? (rlsInventory?.storageFiles.length ?? 0)
        : useV47Detectors
          ? v47TenantStorageFiles.length
          : countFilesContaining(repoPath, migrationFiles, tenantScopePattern),
      nativeRlsInventory: rlsInventory,
      tenantWithoutRlsPremiseFiles: tenantWithoutRlsFiles,
    };
  });
  // Scoped to 'env_handling_depth': gitignoreEnvFile and the env-read scan both feed only this
  // metric (a read failure here does not touch the secret or RLS signals above).
  const { gitignoreEnvFile, hasEnvReadsInImplementation, envHandlingDepth } = withContentReadSignal(
    'A2',
    'env_handling_depth',
    () => {
      // gitignoreEnvFile is non-null only when the gitignore actually contains an .env rule.
      const envFile =
        gitignore && fileContains(repoPath, gitignore, /^\.env(\*|\b)|\.env\./m) ? gitignore : null;
      const hasEnvReads =
        countFilesContaining(repoPath, repoFiles.filter(isImplementationFile), ENV_READ_PATTERN) >
        0;
      // FIX 3 — env_handling_depth: multi-language (match the same set as the surface detector).
      // Counts three distinct bounded practices (0–3) to prevent file-count over-indexing.
      const depth =
        (envExamples.length > 0 ? 1 : 0) + (envFile ? 1 : 0) + (hasEnvReads ? 1 : 0);
      return { gitignoreEnvFile: envFile, hasEnvReadsInImplementation: hasEnvReads, envHandlingDepth: depth };
    },
  );
  // Whether the repo claims multi-tenant architecture (tenant/studio/org-scoped schema signals).
  const isMultiTenant = useV18NativeRls
    ? (nativeRlsInventory?.policyCount ?? 0) > 0 &&
      (nativeRlsInventory?.scopeIdentifiers.length ?? 0) > 0
    : tenantScopedMigrationFileCount > 0;

  if (gitignoreEnvFile) {
    withContentReadSignal('A2', 'env_handling_depth', () =>
      evidence.push(
        evidenceForRelative(
          repoPath,
          gitignoreEnvFile,
          'secret_scan',
          gitignoreEnvRuleLabel(repoFiles.filter(isCommittedEnvFormatPath)),
        ),
      ),
    );
  }
  // Feeds env_handling_depth's 'environment template file' component — a genuinely first read
  // of these files (envExamples is filename-only), not a re-read of an already-read file.
  withContentReadSignal('A2', 'env_handling_depth', () => {
    for (const file of envExamples.slice(0, 3)) {
      evidence.push(evidenceForRelative(repoPath, file, 'secret_scan', 'Environment template'));
    }
  });
  if (rlsMigration) {
    withContentReadSignals('A2', ['rls_policy_count', 'tenant_scope_ratio'], () =>
      evidence.push(
        evidenceForRelative(repoPath, rlsMigration, 'artifact', 'RLS or tenant migration'),
      ),
    );
  }
  if (tenantScopedFile) {
    withContentReadSignals('A2', ['rls_policy_count', 'tenant_scope_ratio'], () =>
      evidence.push(
        evidenceForRelative(
          repoPath,
          tenantScopedFile,
          'artifact',
          useV18NativeRls
            ? `Repository-native RLS scope (${nativeRlsInventory?.scopeIdentifiers.join(', ')})`
            : 'Tenant scoping signal',
        ),
      ),
    );
  }

  if (committedSecret) {
    const isTestPath = isTestOrFixturePath(committedSecret.path);
    const isDefaultAdmin = committedSecret.match.kind === 'default_admin';
    const isPemPrivateKey = committedSecret.match.kind === 'pem_private_key';
    findings.push({
      severity: isTestPath ? 'info' : 'critical',
      summary: isDefaultAdmin
        ? isTestPath
          ? `Default administrative credential in a test/fixture file (${committedSecret.path}) — likely fixture data, not a production deployment default; verify.`
          : 'An explicit default administrative credential appears committed in production configuration.'
        : isPemPrivateKey
          ? isTestPath
            ? `PEM-formatted private key in a test/fixture file (${committedSecret.path}) — likely fixture data, not a production leak; verify.`
            : 'A PEM-formatted private key appears committed in the scanned repository.'
          : isTestPath
            ? `Secret-shaped value in a test/fixture file (${committedSecret.path}) — likely fixture data, not a production leak; verify.`
            : 'Secret-shaped value appears committed in the scanned repository.',
      evidence: evidenceForRelativeAtLine(
        repoPath,
        committedSecret.path,
        'secret_scan',
        secretEvidenceLabel(
          isDefaultAdmin
            ? 'Committed default administrative credential'
            : isPemPrivateKey
              ? 'Committed PEM-formatted private key'
              : 'Committed secret-shaped value',
          committedSecret.match,
        ),
        committedSecret.match.line,
      ),
    });
  } else if (committedEnvFilePath) {
    findings.push(
      inventoryAbsenceFinding({
        severity: useV33Detectors ? 'info' : 'warning',
        summaries: {
          legacy:
            'A non-template .env file is committed in the current repository tree; no secret-shaped value was detected.',
          currentTracked:
            'A tracked non-template .env file is present, while the bounded scan over the tracked scan-eligible inventory matched no secret-shaped value.',
          currentDirectoryWalk:
            'A non-template .env file is present in the bounded directory walk, which matched no secret-shaped value.',
        },
        evidence: evidenceForRelative(
          repoPath,
          committedEnvFilePath,
          'secret_scan',
          'Committed .env file (no confirmed secret value found)',
        ),
        context: inventoryAbsenceContext,
        inventoryCount: repoFiles.length,
        patternSet: INVENTORY_SCAN_PATTERN_SETS.a2CurrentSecret,
        matchCount: 0,
      }),
    );
  }
  if (ambiguousSecret) {
    // The third outcome. Deliberately `info` and deliberately NOT a critical: a critical asserts a
    // leak, and the whole point of this branch is that Cejel has not established one. The
    // withholding of `secret_cleanliness` below is what makes it an abstention rather than a
    // decorative note — a warning-with-a-clean-metric would be the silent pass in disguise.
    findings.push({
      severity: 'info',
      summary: `Secret-shaped value with an ambiguous content context — Cejel abstains on secret cleanliness rather than assert either a committed credential or a clean result, because ${ambiguousSecret.match.classificationReason ?? 'its classification is undetermined'}.`,
      evidence: evidenceForRelativeAtLine(
        repoPath,
        ambiguousSecret.path,
        'secret_scan',
        secretEvidenceLabel('Unclassified secret-shaped value', ambiguousSecret.match),
        ambiguousSecret.match.line,
      ),
    });
  }
  if (historySecretScan?.evidence) {
    const historyPath = historySecretScan.evidence.path ?? '';
    const isTestPath = isTestOrFixturePath(historyPath);
    const isPemPrivateKey = historySecretScan.secretKind === 'pem_private_key';
    findings.push({
      severity: isTestPath ? 'info' : 'critical',
      summary: isPemPrivateKey
        ? isTestPath
          ? `PEM-formatted private key in git history for a test/fixture file (${historyPath}) — likely fixture data, not a production leak; verify.`
          : 'A PEM-formatted private key appears in recent git history.'
        : isTestPath
          ? `Secret-shaped value in git history for a test/fixture file (${historyPath}) — likely fixture data, not a production leak; verify.`
          : 'Secret-shaped value appears in recent git history.',
      evidence: historySecretScan.evidence,
    });
  } else if (historySecretScan?.truncated) {
    findings.push({
      severity: useV33Detectors ? 'info' : 'warning',
      summary:
        'History secret scan reached the credential-path safety valve before scanning every matching blob.',
      evidence: {
        kind: 'secret_scan',
        label: 'History secret scan coverage bound',
        path: '.git',
        contentHash: readGitHead(repoPath) ?? 'history-scan-bound',
      },
    });
  } else if (historySecretScan?.envPathEvidence) {
    // A bare .env PATH in history (not a template, value unknown/undetected) is a
    // hygiene warning, never a critical secret leak — see goal_cejel_calibration_findings_precision_2026-07-06.
    findings.push({
      severity: useV33Detectors ? 'info' : 'warning',
      summary:
        'A non-template .env file was tracked in git history; no secret-shaped value was detected.',
      evidence: historySecretScan.envPathEvidence,
    });
  }

  // Flag a real isolation gap: tenant-scoped schema without any RLS enforcement. Not under v26,
  // whose rule below replaces it: a tenant column with no policy anywhere is consistent with
  // isolation enforced outside the database (docs/calibration/v26/ruling-item-6.md).
  const hasTenantWithoutRlsGap =
    !useV26SettlingEvidence &&
    rlsPolicyCount === 0 &&
    (useV18NativeRls ? tenantWithoutRlsPremiseFiles.length > 0 : isMultiTenant);
  if (hasTenantWithoutRlsGap) {
    const gapEvidence = rlsMigration ?? tenantScopedFile ?? tenantWithoutRlsPremiseFiles[0];
    if (gapEvidence) {
      findings.push(
        inventoryAbsenceFinding({
          severity: 'warning',
          summaries: {
            legacy:
              'Tenant-scoped schema detected but no row-level-security policies found — isolation gap.',
            currentTracked:
              'A tenant-scoped schema signal is present, while the tracked scan-eligible inventory matched no row-level-security policy.',
            currentDirectoryWalk:
              'A tenant-scoped schema signal is present, while the bounded directory walk matched no row-level-security policy.',
          },
          evidence: evidenceForRelative(
            repoPath,
            gapEvidence,
            'artifact',
            'Tenant schema without RLS policies',
          ),
          context: inventoryAbsenceContext,
          inventoryCount: repoFiles.length,
          patternSet: INVENTORY_SCAN_PATTERN_SETS.a2RlsPolicy,
          matchCount: 0,
        }),
      );
    }
  }

  // v26 item 6: the finding fires only when the repository's own SQL settles it — row-level
  // security is its mechanism (T-1), a tenant table is identifiable (T-2), and no ENABLE or
  // CREATE POLICY names that table (T-3). Otherwise Cejel abstains: no finding, and when a tenant
  // premise exists the ruling's sentence goes to the certificate. Metrics above are unchanged.
  let tenantIsolationUnsettled = false;
  if (useV26SettlingEvidence) {
    const uncoveredTables = withContentReadSignals(
      'A2',
      ['rls_policy_count', 'tenant_scope_ratio'],
      () => findUncoveredTenantTables(repoPath, repoFiles),
    );
    for (const table of uncoveredTables) {
      findings.push({
        severity: 'warning',
        summary: `Table \`${table.name}\` carries a tenant column and no row-level-security policy, while this repository enforces tenant isolation with row-level security elsewhere.`,
        evidence: evidenceForRelativeAtLine(
          repoPath,
          table.file,
          'artifact',
          'Tenant table without a row-level-security policy',
          table.line,
        ),
      });
    }
    tenantIsolationUnsettled =
      uncoveredTables.length === 0 && tenantWithoutRlsPremiseFiles.length > 0;
  }

  // cryptoHygiene was computed above (before the N/A gate); merge its evidence/findings now.
  evidence.push(...cryptoHygiene.evidence);
  findings.push(...cryptoHygiene.findings);

  // Any repo that reaches here has passed the N/A gate and had at least one evidence anchor
  // pushed. The null return below guards only the theoretically unreachable case where
  // neither branch produced evidence (kept as a safety net, not an expected path).
  if (evidence.length === 0 && findings.length === 0) return null;

  // For non-multi-tenant repos, RLS and tenant-scope are irrelevant: omit those
  // metrics entirely so a secret-clean single-tenant repo is never scored as critical
  // for absence of isolation mechanisms it does not need.
  const hasCriticalFinding = findings.some((finding) => finding.severity === 'critical');
  // v27 (#442): on a shallow clone the history half of A2 read only the commits present, so a
  // clean result asserts something about history Cejel did not read. A2 then abstains as a read
  // failure (kept in the composite at 0). A confirmed critical finding stands on what was read,
  // so A2 keeps scoring it. Withholding only secret_cleanliness is not done: the calibrated A2
  // state needs that metric, and its score-band fallback can land on a less severe status.
  if (useV27FalseAssuranceClosure && !hasCriticalFinding && isShallowRepository(repoPath)) {
    return shallowHistoryAbstention('A2', V27_A2_SHALLOW_HISTORY_NOTE);
  }
  const secretCleanliness = hasCriticalFinding ? 0 : 1;
  // v24 withholds the metric — never scores it 0, never scores it 1 — when the current-tree scan
  // ended on a value it could not classify and nothing else produced a critical. A zero earned by
  // a confirmed finding is never removed this way.
  const abstainsSecretCleanliness =
    useV24SecretContentContext && ambiguousSecret != null && !hasCriticalFinding;
  const baseMetrics: WitanCriterionMetric[] = [
    ...(abstainsSecretCleanliness
      ? []
      : [
          metric(
            'secret_cleanliness',
            'Secret cleanliness',
            secretCleanliness,
            1,
            isMultiTenant ? 0.25 : 0.7,
            'clean',
            'Credits absence of committed or recent-history secret findings in the static scan.',
            undefined,
            secretCleanliness === 1 && placeholderSetAside.length > 0
              ? { condition: placeholderSetAsideCondition(placeholderSetAside) }
              : undefined,
          ),
        ]),
    metric(
      'env_handling_depth',
      'Environment handling depth',
      envHandlingDepth,
      3,
      isMultiTenant ? 0.1 : 0.3,
      'practices',
      'Counts three bounded env-handling practices (0–3): template file, gitignore rule, env reads in any supported language.',
      undefined,
      {
        components: [
          { label: 'environment template file', count: envExamples.length > 0 ? 1 : 0 },
          { label: '.gitignore environment-file rule', count: gitignoreEnvFile ? 1 : 0 },
          {
            label: 'environment reads in implementation code',
            count: hasEnvReadsInImplementation ? 1 : 0,
          },
        ],
      },
    ),
  ];
  const isolationMetrics: WitanCriterionMetric[] = isMultiTenant
    ? [
        metric(
          'rls_policy_count',
          'RLS policy count',
          rlsPolicyCount,
          useV18NativeRls
            ? Math.max(tenantScopedMigrationFileCount, 1)
            : Math.max(tenantScopedMigrationFileCount * 3, 3),
          0.4,
          'policies',
          useV18NativeRls
            ? 'Counts CREATE POLICY definitions with repository-native USING/WITH CHECK clauses against the repository-native scoped data-layer surface.'
            : 'Counts static row-level-security enables, forced-RLS statements, and policy definitions.',
          'saturating_count',
          { condition: 'scored because a multi-tenant data surface was detected' },
        ),
        metric(
          'tenant_scope_ratio',
          'Tenant-scoped schema ratio',
          useV18NativeRls
            ? tenantScopedMigrationFileCount
            : countFilesContaining(repoPath, migrationFiles, tenantScopePattern),
          Math.max(migrationFiles.length, 1),
          0.25,
          'ratio',
          useV18NativeRls
            ? `Measures repository-native RLS scope identifiers (${nativeRlsInventory?.scopeIdentifiers.join(', ')}) across data-layer files.`
            : 'Measures tenant/studio/workspace scoping evidence across data-layer files.',
          undefined,
          { condition: 'scored because a multi-tenant data surface was detected' },
        ),
      ]
    : [];
  // Omitted entirely (not scored 0) when no signing/HMAC/secret-comparison surface was
  // detected in source — this metric never penalizes a repo that has no such surface.
  const cryptoMetrics: WitanCriterionMetric[] = cryptoHygiene.hasSurface
    ? [
        metric(
          'crypto_comparison_hygiene',
          'Crypto comparison hygiene',
          cryptoHygiene.clean ? 1 : 0,
          1,
          0.2,
          'clean',
          'Credits constant-time secret/HMAC comparison and canonical serialization before signing when a signing/HMAC surface is detected in source; only scored when such a surface exists.',
          undefined,
          {
            condition:
              'scored because a signing, HMAC, or secret-comparison surface was detected',
          },
        ),
      ]
    : [];

  return {
    criterionId: 'A2',
    positiveEvidence: evidence,
    findings,
    metrics: [...baseMetrics, ...isolationMetrics, ...cryptoMetrics],
    notes: [
      useV18NativeRls
        ? 'History secret scanning covers all reachable git history for credential-pattern paths unless the explicit credential-blob safety valve is reported. Positive multi-tenancy credit is derived only from this repository’s own CREATE POLICY USING/WITH CHECK clauses; no fixed tenant-token vocabulary can create isolation credit. A conservative schema premise is retained only to fail closed when a tenant-shaped schema has zero RLS policies.'
        : 'History secret scanning covers all reachable git history for credential-pattern paths unless the explicit credential-blob safety valve is reported.',
      ...(abstainsSecretCleanliness
        ? [
            'Cejel abstained on secret cleanliness: the current-tree scan matched a secret-shaped value it could not classify from content as either a credential or an example. The metric is withheld rather than scored; every other A2 signal is unaffected.',
          ]
        : []),
      ...(tenantIsolationUnsettled ? [WITAN_A2_TENANT_ISOLATION_UNSETTLED_DISCLOSURE] : []),
    ].join(' '),
    ...placeholderSetAsideDisclosures(placeholderSetAside),
  };
}

// A committed file in env format that is not a template: `.env`, `.env.<name>` or `<name>.env`.
// The template rule is the widest one any rubric uses, so a template is never called a committed
// env file. Presentation only (the gitignore citation below); A2's surface and metrics are
// unchanged.
function isCommittedEnvFormatPath(path: string): boolean {
  const name = basename(path);
  // Neither test covers the other: isEnvTemplatePath also knows `.dist` and the v47 translated
  // suffixes but only as the final suffix of a `.env` name; the word test also catches
  // `example.env` and `.env.example.local`, which isEnvTemplatePath does not.
  return (
    /^\.env(?:\..+)?$|.\.env$/i.test(name) &&
    !isEnvTemplatePath(path, true) &&
    !/(?:example|sample|template)/i.test(name)
  );
}

// A .gitignore rule does not untrack a committed file, so ".env files are gitignored" is not cited
// beside an env file the scanned tree still holds; the citation names that file instead. "Scanned
// tree", not "committed": a scan without git walks the directory. Only the label changes: the
// evidence pointer and the env_handling_depth component it supports stay.
function gitignoreEnvRuleLabel(committedEnvFiles: readonly string[]): string {
  const count = committedEnvFiles.length;
  if (count === 0) return '.env files are gitignored';
  const lead = `.gitignore has an .env rule, but the scanned tree includes ${count} env file${count === 1 ? '' : 's'}`;
  for (let shown = Math.min(count, 2); shown > 0; shown -= 1) {
    const more = count - shown;
    const label = `${lead}: ${committedEnvFiles.slice(0, shown).join(', ')}${more > 0 ? ` and ${more} more` : ''}`;
    if (label.length <= EVIDENCE_LABEL_MAX_LENGTH) return label;
  }
  return lead;
}

interface CryptoHygieneSignal {
  evidence: WitanEvidencePointer[];
  findings: WitanFinding[];
  /** True when a signing/HMAC/secret-comparison surface was detected at all. */
  hasSurface: boolean;
  /** True only when a surface was detected AND no insecure pattern was found within it. */
  clean: boolean;
}

// Bounded, conservative crypto-hygiene nudge (goal_cejel_rubric_refinement_from_lua_2026-07-06):
// credits constant-time secret/HMAC comparison and canonical-serialization-before-signing where
// cheaply detectable in source; flags a plain ===/!== on a clearly-named secret/HMAC compare, or
// signing over unsorted JSON, as a warning (never critical). Only ever contributes evidence/
// findings when a relevant surface is actually found — a repo with no crypto code is unaffected.
function collectCryptoHygieneEvidence(
  repoPath: string,
  implFiles: readonly string[],
  useV39Detectors = false,
): CryptoHygieneSignal {
  const evidence: WitanEvidencePointer[] = [];
  const findings: WitanFinding[] = [];
  let hasSurface = false;
  let insecureFound = false;

  // Credit (good-pattern evidence) is drawn only from PRODUCTION files: a test fixture that
  // merely demonstrates `timingSafeEqual`/canonical-serialization text is not itself evidence
  // of production crypto hygiene, the same "one notion of production code" the timing/unsorted-
  // sign findings below apply on the penalty side.
  const productionImplFiles = implFiles.filter((file) =>
    useV39Detectors ? isV39AuthoredProductionPath(file) : isProductionSourcePath(file),
  );

  const timingSafeFile = productionImplFiles.find((file) =>
    fileContains(repoPath, file, TIMING_SAFE_COMPARE_PATTERN),
  );
  if (timingSafeFile) {
    hasSurface = true;
    evidence.push(
      evidenceForRelative(
        repoPath,
        timingSafeFile,
        'artifact',
        'Constant-time secret/HMAC comparison',
      ),
    );
  }

  const canonicalSignFile = productionImplFiles.find(
    (file) =>
      fileContains(repoPath, file, CANONICAL_SERIALIZE_PATTERN) &&
      fileContains(repoPath, file, SIGN_OR_HMAC_CALL_PATTERN),
  );
  if (canonicalSignFile) {
    hasSurface = true;
    evidence.push(
      evidenceForRelative(
        repoPath,
        canonicalSignFile,
        'artifact',
        'Canonical serialization before signing',
      ),
    );
  }

  // First file (in repo listing order) with a real, per-line insecure-compare match — same
  // "first match wins" convention as every other detector in this function, just resolved to a
  // real line instead of a whole-file boolean.
  let insecureCompareFile: string | null = null;
  let insecureCompareLine: number | null = null;
  const compareFiles = useV39Detectors ? productionImplFiles : implFiles;
  for (const file of compareFiles) {
    const line = findInsecureSecretCompareLine(repoPath, file, useV39Detectors);
    if (line != null) {
      insecureCompareFile = file;
      insecureCompareLine = line;
      break;
    }
  }
  if (insecureCompareFile) {
    const insecureCompareSourceLine = lineAt(
      repoPath,
      insecureCompareFile,
      insecureCompareLine ?? 0,
    );
    const comparesDefaultSentinel =
      useV39Detectors &&
      insecureCompareSourceLine !== null &&
      DEFAULT_SECRET_SENTINEL_COMPARE_LINE_PATTERN.test(insecureCompareSourceLine);
    // ONE notion of production code, reused from the shared classifier (not a private
    // heuristic): a match inside a test/fixture path is downgraded to info, as the sibling
    // committed-secret detector does, and does not affect the
    // crypto_comparison_hygiene metric — a test fixture demonstrating the bad pattern is not
    // itself a production timing leak.
    const isTestPath = isTestOrFixturePath(insecureCompareFile);
    if (!isTestPath) {
      hasSurface = true;
      insecureFound = true;
    }
    findings.push({
      severity: isTestPath ? 'info' : 'warning',
      summary: isTestPath
        ? `A secret/HMAC/signature comparison via plain equality appears in a test/fixture file (${insecureCompareFile}) — likely a test assertion, not a production timing leak; verify.`
        : comparesDefaultSentinel
          ? 'A supplied secret is compared with a configured default-secret sentinel using ordinary equality; verify whether this comparison belongs on a constant-time authentication path.'
          : 'A secret/HMAC/signature value appears compared with a plain equality operator instead of a constant-time comparison — potential timing side-channel.',
      evidence: evidenceForRelativeAtLine(
        repoPath,
        insecureCompareFile,
        'artifact',
        'Non-constant-time secret comparison',
        insecureCompareLine,
      ),
    });
  }

  const unsortedFiles = useV39Detectors ? productionImplFiles : implFiles;
  const unsortedSignFile = unsortedFiles.find(
    (file) =>
      (useV39Detectors
        ? fileHasVariableUnsortedJsonHmac(repoPath, file)
        : fileContains(repoPath, file, UNSORTED_JSON_SIGN_PATTERN)) &&
      !fileContains(repoPath, file, CANONICAL_SERIALIZE_PATTERN),
  );
  if (unsortedSignFile) {
    const isTestPath = isTestOrFixturePath(unsortedSignFile);
    if (!isTestPath) {
      hasSurface = true;
      insecureFound = true;
    }
    const unsortedSignLine = useV39Detectors
      ? findUnsortedJsonHmacLine(repoPath, unsortedSignFile)
      : findFirstMatchingLine(repoPath, unsortedSignFile, UNSORTED_JSON_SIGN_PATTERN);
    findings.push({
      severity: isTestPath ? 'info' : 'warning',
      summary: isTestPath
        ? `Signing over unsorted JSON serialization appears in a test/fixture file (${unsortedSignFile}) — likely a test assertion, not a production signing gap; verify.`
        : 'A signature/HMAC appears computed directly over JSON.stringify output with no canonical key ordering in the same file — signatures may not verify across equivalent payloads.',
      evidence: evidenceForRelativeAtLine(
        repoPath,
        unsortedSignFile,
        'artifact',
        'Signing over unsorted JSON serialization',
        unsortedSignLine,
      ),
    });
  }

  return { evidence, findings, hasSurface, clean: hasSurface && !insecureFound };
}

function collectA3ProdReadinessEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  useV27Detectors: boolean,
  useV20ExplicitGaps = false,
  useV22PackageStartEntrypoint = false,
  useV23WithheldPathAbstention = false,
  inventoryAbsenceContext: InventoryAbsenceContext = LEGACY_INVENTORY_ABSENCE_CONTEXT,
  useV25InlineHealthRoute = false,
  useV26BuildStepEvidence = false,
): WitanCriterionSignalPayload | null {
  const v20DirectHttpEntrypoint = useV20ExplicitGaps
    ? findV20DirectHttpServerEntrypointFile(repoPath, repoFiles)
    : null;
  const v22PackageStartHttpEntrypoint = useV22PackageStartEntrypoint
    ? findV22PackageStartHttpServerEntrypointFile(repoPath, repoFiles)
    : null;
  const v20RuntimeContainer = useV20ExplicitGaps
    ? findRuntimeContainerEntrypointFile(repoPath, repoFiles, true)
    : null;
  // Archetype-aware N/A gate (mirrors A2 mechanism from #224).
  // A3 only applies to repos operated as deployable services.
  // N/A requires evidenced absence of ALL service/deploy signals:
  //   server entrypoint, explicit deploy target, and CI deploy job.
  // Dockerfile alone is ambiguous — it does not qualify.
  // ANTI-OVERFIT: a service WITH a deploy surface but missing
  //   health-checks / observability / rollback still scores LOW.
  if (
    !isDeployableService(repoPath, repoFiles, useV27Detectors) &&
    !v20DirectHttpEntrypoint &&
    !v22PackageStartHttpEntrypoint &&
    !v20RuntimeContainer
  ) {
    const dockerApplicabilityNote = useV27Detectors
      ? 'A Dockerfile without an explicit runtime start/service command is ambiguous and does not qualify.'
      : 'Dockerfile alone is ambiguous and does not qualify.';
    return buildNotApplicableSignal(
      'A3',
      `No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). ${dockerApplicabilityNote}`,
    );
  }

  const evidence: WitanEvidencePointer[] = [];
  const findings: WitanCriterionSignalPayload['findings'] = [];
  const packageJson = findRootPackageJson(repoFiles);
  const scripts = packageJson ? readPackageScripts(join(repoPath, packageJson)) : new Map();
  const workflows = repoFiles.filter(
    (file) => (!useV27Detectors || isAuthoredProductionPath(file)) && isCiWorkflow(file),
  );
  const workflow = workflows[0];
  const deployConfigs = repoFiles.filter(
    (file) =>
      (useV27Detectors ? isAuthoredProductionPath(file) : isProductionSourcePath(file)) &&
      isDeployConfig(file),
  );
  const releaseDeployConfigs = repoFiles.filter(
    (file) =>
      (useV27Detectors ? isAuthoredProductionPath(file) : isProductionSourcePath(file)) &&
      isExplicitDeployTarget(file),
  );
  const releaseDeployConfig = releaseDeployConfigs[0];
  const containerBuildConfig = deployConfigs.find((file) => /(^|\/)Dockerfile$/.test(file));
  const envTemplate = repoFiles.find(
    (file) => (!useV27Detectors || isAuthoredProductionPath(file)) && isEnvTemplatePath(file),
  );
  // Scoped to 'prod_readiness_primitives': the only content-dependent check among that
  // metric's six components (the rest are filename/path predicates).
  const healthChecks = withContentReadSignal('A3', 'prod_readiness_primitives', () =>
    repoFiles.filter(
      (file) =>
        (!useV27Detectors || isAuthoredProductionPath(file)) &&
        isHealthCheckSignalFile(repoPath, file),
    ),
  );
  const healthCheck = healthChecks[0];
  // The file-selection half of each repoFiles-walking content-pattern signal below, named once so
  // the live filter and the withheld-path check use literally the same test and cannot drift.
  // health_readiness_route also admits a `functions/` tree (Firebase/Netlify-style serverless
  // functions convention): a real, common home for a production HTTP entrypoint that sits
  // outside the shared isImplementationFile directory allowlist (src/app/lib/packages/cmd/
  // include/source/Sources). Scoped to this one signal via the extra pattern rather than widening
  // isImplementationFile itself, which also feeds observabilityDepthReads and the error-boundary
  // content scan below — both out of scope for this card (goal_cejel_a3_health_route_idioms_v23).
  const healthReadinessRouteReads = (file: string): boolean =>
    isAuthoredProductionPath(file) &&
    (isImplementationFile(file) ||
      HEALTH_ROUTE_FUNCTIONS_DIR_PATTERN.test(file) ||
      HEALTH_ROUTE_ENTRYPOINT_HOME_PATTERN.test(file));
  const observabilityDepthReads = (file: string): boolean =>
    (!useV27Detectors || isAuthoredProductionPath(file)) && isImplementationFile(file);
  // v25 only. Every other rubric's scored health component is filename-only
  // by design (isHealthCheckSignalFile), so a route declared inline in an application file earns
  // nothing there. Reuses the info finding's file-selection test and route pattern with no new
  // pattern, but evaluated with comments stripped: the finding is info-severity and may read raw
  // text, whereas a scored credit must not be earned by a commented-out `// app.get('/health')`
  // (the #352/#433 class). Skipped when a filename signal already exists: no extra content scan.
  const inlineHealthRouteFile =
    useV25InlineHealthRoute && healthChecks.length === 0
      ? withContentReadSignal('A3', 'prod_readiness_primitives', () =>
          repoFiles.find(
            (file) =>
              healthReadinessRouteReads(file) &&
              fileMatchesOutsideComments(repoPath, file, V20_HEALTH_OR_READINESS_ROUTE_PATTERN),
          ),
        )
      : undefined;
  const hasHealthOrReadinessSignal = healthChecks.length > 0 || inlineHealthRouteFile !== undefined;
  // Scoped to 'health_readiness_route': feeds only the (info-severity) health/readiness-route
  // absence finding below, never a scored metric.
  const { hasV20HealthOrReadinessRoute, hasV22PackageStartHealthOrReadinessRoute } =
    withContentReadSignal('A3', 'health_readiness_route', () => ({
      hasV20HealthOrReadinessRoute:
        useV20ExplicitGaps &&
        repoFiles.some(
          (file) =>
            healthReadinessRouteReads(file) &&
            fileContains(repoPath, file, V20_HEALTH_OR_READINESS_ROUTE_PATTERN),
        ),
      hasV22PackageStartHealthOrReadinessRoute:
        v22PackageStartHttpEntrypoint !== null &&
        fileContains(
          repoPath,
          v22PackageStartHttpEntrypoint,
          V20_HEALTH_OR_READINESS_ROUTE_PATTERN,
        ),
    }));
  // A file Cejel withheld from repoFiles never reaches the .some() above, so the health-route
  // pattern that would have been run against it silently returns false — indistinguishable from a
  // repository that genuinely has no health route, and reported below as a finding of absence.
  // Abstain instead, but only on a match this signal earned: the predicate consulted is this
  // signal's own file-selection test, so an oversized file the signal would never have opened
  // still abstains nothing (that is the path-shape over-abstention the 0.4.8 fix removed, and it
  // stays removed). Applicability gated on useV20ExplicitGaps because below that rubric the
  // signal reads no repoFiles at all and so loses nothing to a withheld path — that gate is about
  // whether the signal exists at all under this rubric, so it stays outside the call. Whether the
  // match, once found, is ACTED ON is instead passed as the call's own `act` argument
  // (useV23WithheldPathAbstention): the intersection is always computed and disclosed, even under
  // a rubric where the mechanism is off (goal_cejel_withheld_paths_always_disclosed_2026-09-22).
  const healthReadinessRouteWithheld =
    useV20ExplicitGaps &&
    abstainSignalOnWithheldPaths(
      'A3',
      'health_readiness_route',
      healthReadinessRouteReads,
      useV23WithheldPathAbstention,
    );
  const serverEntrypoint =
    v22PackageStartHttpEntrypoint ??
    findServerEntrypointFile(repoPath, repoFiles, useV27Detectors) ??
    v20DirectHttpEntrypoint ??
    null;
  const runtimeContainer = useV27Detectors
    ? findRuntimeContainerEntrypointFile(repoPath, repoFiles, useV20ExplicitGaps)
    : null;
  // Anchored to a whole path segment (#433): unanchored, `swallowed-error.ts` was an error boundary.
  const errorBoundaries = repoFiles.filter(
    (file) =>
      (!useV27Detectors || isAuthoredProductionPath(file)) &&
      isImplementationEvidencePath(file) &&
      ERROR_BOUNDARY_FILENAME_PATTERN.test(file),
  );
  // The filename check above is a frontend/React convention (error-boundary.*, error.tsx) and
  // does not read content, so an Express error-handling middleware layer — which can live in any
  // file, under any name — was invisible to it: fixing the exact gap a finding named changed
  // nothing. Widened with a content-based check across implementation files, run only when the
  // filename check found nothing so a repository already credited by filename never pays for an
  // extra content scan.
  //
  // goal_cejel_a3_error_boundary_idioms_2026-09-22: observabilityDepthReads' directory list
  // (src/app/lib/packages/cmd/include/source/Sources) and extension list both excluded a
  // conventional `server/` layout root and the `.mjs`/`.cjs` extensions — real idioms
  // (`server/plugins/errorHandler.mjs`), not a hypothetical. Widened with an OR clause scoped to
  // this signal alone, not a change to observabilityDepthReads or isImplementationFile
  // themselves, so observability_depth's file domain (and every other consumer of those shared
  // predicates) is unaffected. `src/middleware/errors.ts` and `lib/http/error.middleware.js` were
  // already admitted by observabilityDepthReads before this widening.
  const errorBoundaryFileReads = (file: string): boolean =>
    isImplementationEvidencePath(file) &&
    (observabilityDepthReads(file) ||
      ((!useV27Detectors || isAuthoredProductionPath(file)) &&
        /(^|\/)server\//.test(file) &&
        /\.(?:mjs|cjs)$/.test(file)));
  // A shape match alone credits a fully dead, never-registered stub (tutorial boilerplate that
  // declares a four-argument handler and never wires it in). Requiring the file to also either
  // register middleware (`.use(`) or make the handler reachable from elsewhere (`export`/
  // `module.exports`/`export class`) excludes that case while still crediting the real-world
  // registration idioms this repo's own fixtures use: an inline
  // `app.use((err, req, res, next) => ...)`, a named handler declared in one file and wired via
  // `app.use(errorHandler)` in another, and a class method registered via
  // `app.use(this.handleError.bind(this))` from an exported class.
  //
  // Both halves are evaluated with comments stripped. Reachability first (#352): a commented-out
  // `// app.use(errorHandler);` line satisfies `.use(` textually despite registering nothing,
  // crediting exactly the dead-stub shape this check exists to exclude. Then the shape (#433): a
  // code comment QUOTING `app.use((err, req, res, next) => …)` in a file that exports anything was
  // credited as the repository's error boundary — that is how cejel's own detector source earned
  // the credit. (Documented limit: a `//` inside a string or template literal is stripped too,
  // same as any naive same-line comment strip; not reachable from a realistic Express
  // registration call.)
  const expressErrorMiddlewareFile =
    errorBoundaries.length > 0
      ? undefined
      : withContentReadSignal('A3', 'prod_readiness_primitives', () =>
          repoFiles.find(
            (file) =>
              errorBoundaryFileReads(file) &&
              fileMatchesOutsideComments(repoPath, file, EXPRESS_ERROR_MIDDLEWARE_PATTERN) &&
              fileMatchesOutsideComments(repoPath, file, EXPRESS_MIDDLEWARE_REACHABLE_PATTERN),
          ),
        );
  const errorBoundary = errorBoundaries[0] ?? expressErrorMiddlewareFile;
  // A withheld implementation file cannot be read by this content scan either, so a match it
  // would have earned is otherwise reported as a plain "no error boundary" absence rather than
  // missing evidence — same seam as health_readiness_route and observability_depth below.
  // Skipped when a filename-based match already exists: the content scan is n/a there (line
  // 3053 above never runs it) and has nothing to abstain. Uses errorBoundaryFileReads, the same
  // file-selection test the live scan above uses. Always disclose an earned intersection;
  // the rubric's own gate controls whether the mechanism acts on it.
  if (errorBoundaries.length === 0) {
    abstainSignalOnWithheldPaths(
      'A3',
      'prod_readiness_primitives',
      errorBoundaryFileReads,
      useV23WithheldPathAbstention,
    );
  }
  // Widened past a vendor-product list plus two generic words, which missed the most common
  // Node structured-logging libraries (pino, winston, bunyan), the Express request-logging
  // convention (morgan), and the request-correlation idiom (correlationId/requestId/traceId,
  // under whichever separator style the repo uses) — none of which spell a vendor name.
  // `httpLogger` and `@opentelemetry/*` imports are already covered: they contain the existing
  // `logger` / `opentelemetry` substrings respectively, so this widening does not touch them.
  //
  // The four package names are matched case-sensitively (no /i on that half), never merged into
  // the case-insensitive vendor-list half above: those are npm identifiers, always written
  // lowercase in an import/require, unlike "Sentry"/"Datadog" which are also correctly-cased
  // proper nouns in prose. Case-insensitive on all four credited a repository whose comments
  // merely mentioned a person named Winston, Pino, or Bunyan with no logging tooling at all.
  const observabilityCount = withContentReadSignal('A3', 'observability_depth', () =>
    countFilesMatchingAny(repoPath, repoFiles.filter(observabilityDepthReads), [
      /sentry|otel|opentelemetry|datadog|prometheus|metrics|logger|logtail|\b(?:correlation|request|trace)[-_]?id\b|\basynclocalstorage\b/i,
      /\b(?:pino|winston|bunyan|morgan)\b/,
    ]),
  );
  // Same seam as health_readiness_route: a withheld implementation file cannot be counted, and an
  // under-count is reported as a lower observability score rather than as missing evidence. The
  // return value is unused because this metric IS named observability_depth, so the recorded
  // abstention drops it in buildWitanInputFromRepo without the collector doing anything further.
  // Always called, with the rubric's own gate passed as `act`, so the intersection is disclosed
  // even when this rubric does not switch the mechanism on.
  abstainSignalOnWithheldPaths(
    'A3',
    'observability_depth',
    observabilityDepthReads,
    useV23WithheldPathAbstention,
  );
  const rollbackSafetyCount = withContentReadSignal('A3', 'rollback_safety_depth', () =>
    countFilesContaining(
      repoPath,
      repoFiles.filter(
        (file) =>
          (!useV27Detectors || isAuthoredProductionPath(file)) &&
          /(^|\/)(docs|migrations?|drizzle|prisma|scripts)\//.test(file),
      ),
      /rollback|roll back|migration safety|down migration|reversible|undo migration/i,
    ),
  );

  const rootOnlyScriptsNote = rootOnlyPackageScriptsDisclosure(repoFiles, packageJson);
  if (packageJson && (scripts.has('build') || scripts.has('typecheck'))) {
    evidence.push(
      evidenceForRelative(repoPath, packageJson, 'prod_check', 'Build or typecheck script'),
    );
  }
  if (workflow) {
    evidence.push(
      evidenceForRelative(
        repoPath,
        workflow,
        'ci_run',
        ciWorkflowCitationLabel(
          'CI workflow',
          'counted',
          workflows.length,
          1,
          unreadCiWorkflowReasons((file) => !useV27Detectors || isAuthoredProductionPath(file)),
        ),
      ),
    );
  }
  if (releaseDeployConfig)
    evidence.push(
      evidenceForRelative(
        repoPath,
        releaseDeployConfig,
        'prod_check',
        'Release deploy configuration',
      ),
    );
  if (containerBuildConfig)
    evidence.push(
      evidenceForRelative(
        repoPath,
        containerBuildConfig,
        'prod_check',
        'Container build configuration',
      ),
    );
  if (envTemplate)
    evidence.push(evidenceForRelative(repoPath, envTemplate, 'prod_check', 'Environment template'));
  if (healthCheck) {
    withContentReadSignal('A3', 'prod_readiness_primitives', () =>
      evidence.push(
        evidenceForRelative(repoPath, healthCheck, 'prod_check', 'Health/readiness signal'),
      ),
    );
  } else if (inlineHealthRouteFile) {
    withContentReadSignal('A3', 'prod_readiness_primitives', () =>
      evidence.push(
        evidenceForRelativeAtLine(
          repoPath,
          inlineHealthRouteFile,
          'prod_check',
          'Health/readiness route',
          findFirstMatchingLineOutsideComments(
            repoPath,
            inlineHealthRouteFile,
            V20_HEALTH_OR_READINESS_ROUTE_PATTERN,
          ),
        ),
      ),
    );
  }
  if (errorBoundary) {
    // A filename-based match (errorBoundaries) is presence evidence — evidenceForRelative's
    // firstMeaningfulLine fallback is honest there, since no specific line was matched. A
    // content-based match (expressErrorMiddlewareFile) DID earn a specific line; using the same
    // presence-style helper for it reintroduces the exact "reports line 1" defect
    // evidenceForRelativeAtLine's own doc comment names as previously fixed.
    evidence.push(
      errorBoundary === expressErrorMiddlewareFile
        ? evidenceForRelativeAtLine(
            repoPath,
            errorBoundary,
            'prod_check',
            'Error boundary',
            findFirstMatchingLineOutsideComments(
              repoPath,
              errorBoundary,
              EXPRESS_ERROR_MIDDLEWARE_PATTERN,
            ),
          )
        : evidenceForRelative(repoPath, errorBoundary, 'prod_check', 'Error boundary'),
    );
  }

  // Anchor on the server entrypoint file when it is the only reason the N/A
  // gate passed but no other A3 signal produced evidence. Without this anchor
  // the scorer would short-circuit to null despite having identified a service.
  if (evidence.length === 0) {
    if (serverEntrypoint) {
      evidence.push(
        evidenceForRelative(
          repoPath,
          serverEntrypoint,
          'prod_check',
          'Production server entrypoint',
        ),
      );
    } else if (runtimeContainer) {
      evidence.push(
        evidenceForRelative(
          repoPath,
          runtimeContainer,
          'prod_check',
          'Runtime container entrypoint',
        ),
      );
    }
  }

  if (evidence.length === 0) return null;
  let buildStepSettlement: V26BuildStepSettlement | undefined;
  if (useV20ExplicitGaps) {
    // The root or any declared workspace package (findDeclaredWorkspaceManifests). Manifests the
    // read cap left unread are not an observed absence, so a capped read never asserts one.
    // COUPLING, deliberately not restructured: this is branch 1 of a single if / else-if chain,
    // so on a workspace monorepo where it stops firing, the HEALTHCHECK and health-route
    // branches below start running (pinned in workspace-package-scripts.test.ts).
    const workspaceManifests = packageJson
      ? findDeclaredWorkspaceManifests(repoPath, repoFiles, packageJson)
      : NO_DECLARED_WORKSPACE_MANIFESTS;
    const hasBuildOrTypecheck =
      scripts.has('build') ||
      scripts.has('typecheck') ||
      workspaceManifests.declared > workspaceManifests.read.length ||
      workspaceManifests.read.some((file) => {
        const workspaceScripts = readPackageScripts(join(repoPath, file));
        return workspaceScripts.has('build') || workspaceScripts.has('typecheck');
      });
    // v26 item 8 (docs/calibration/v26/ruling-item-8.md): two script names do not settle that the
    // package has no build or type-check step, so under v26 the finding also needs B-1, B-2 and
    // B-3 (settleV26BuildStepEvidence). It only ever narrows the condition above. Where it stops
    // the finding, the branches below run, as the coupling note says.
    buildStepSettlement =
      useV26BuildStepEvidence && packageJson
        ? settleV26BuildStepEvidence(
            repoPath,
            repoFiles,
            packageJson,
            workspaceManifests,
            workflows,
            (file) => !useV27Detectors || isAuthoredProductionPath(file),
          )
        : undefined;
    if (
      packageJson &&
      !hasBuildOrTypecheck &&
      (buildStepSettlement === undefined || buildStepSettlement === 'fires')
    ) {
      const workspaceRead = workspaceManifests.read.length;
      findings.push({
        severity: 'info',
        summary:
          'A deployable service package manifest declares neither a build nor a typecheck script.',
        evidence: evidenceForRelative(
          repoPath,
          packageJson,
          'prod_check',
          workspaceRead > 0
            ? `Deployable service manifest without a build or typecheck script (${workspaceRead} declared workspace package.json file${workspaceRead === 1 ? '' : 's'} read)`
            : 'Deployable service manifest without a build or typecheck script',
        ),
      });
    } else if (runtimeContainer) {
      const hasActiveHealthcheck = withContentReadSignal('A3', 'dockerfile_healthcheck', () =>
        fileContains(repoPath, runtimeContainer, /^\s*HEALTHCHECK\s+(?!NONE\b)/im),
      );
      if (!hasActiveHealthcheck) {
        findings.push({
          severity: 'info',
          summary: 'A runtime Dockerfile declares no active HEALTHCHECK instruction.',
          evidence: evidenceForRelative(
            repoPath,
            runtimeContainer,
            'prod_check',
            'Runtime Dockerfile without an active HEALTHCHECK',
          ),
        });
      }
    } else if (
      serverEntrypoint &&
      // An absence finding is an assertion that Cejel looked and found nothing. When a file this
      // signal would have read was withheld, Cejel did not look at everything it selected, so the
      // honest output is the recorded abstention above and no finding — never "declares no health
      // or readiness route". This is the whole defect: insufficient_data must not be emitted as a
      // finding of absence.
      !healthReadinessRouteWithheld &&
      withContentReadSignal('A3', 'health_readiness_route', () =>
        fileContains(
          repoPath,
          serverEntrypoint,
          /\b(?:request|req)\.(?:url|path|pathname|method)\b/i,
        ),
      ) &&
      healthChecks.length === 0 &&
      !hasV20HealthOrReadinessRoute &&
      !hasV22PackageStartHealthOrReadinessRoute
    ) {
      findings.push({
        severity: 'info',
        summary:
          'A production HTTP entrypoint handles requests directly but declares no health or readiness route.',
        evidence: evidenceForRelative(
          repoPath,
          serverEntrypoint,
          'prod_check',
          'Production HTTP entrypoint without a health or readiness route',
        ),
      });
    }
  }
  if (!workflow && releaseDeployConfigs.length === 0) {
    const firstEvidence = evidence[0];
    if (!firstEvidence) return null;
    findings.push(
      inventoryAbsenceFinding({
        severity: 'info',
        summaries: {
          legacy:
            'A deployable service surface exists, but no CI or release-deployment automation was detected.',
          currentTracked:
            'A deployable service signal is present, while the tracked scan-eligible inventory matched no CI workflow or release-deployment automation.',
          currentDirectoryWalk:
            'A deployable service signal is present, while the bounded directory walk matched no CI workflow or release-deployment automation.',
        },
        evidence: firstEvidence,
        context: inventoryAbsenceContext,
        inventoryCount: repoFiles.length,
        patternSet: INVENTORY_SCAN_PATTERN_SETS.a3CiOrReleaseDeploy,
        matchCount: 0,
      }),
    );
  }
  return {
    criterionId: 'A3',
    positiveEvidence: evidence,
    findings,
    metrics: [
      metric(
        'prod_readiness_primitives',
        'Production-readiness basic checks',
        [
          packageJson && (scripts.has('build') || scripts.has('typecheck')),
          workflows.length > 0,
          deployConfigs.length > 0,
          envTemplate,
          hasHealthOrReadinessSignal,
          errorBoundary !== undefined,
        ].filter(Boolean).length,
        6,
        0.55,
        'checks',
        'Counts distinct static production-readiness checks instead of treating presence as enough.',
        undefined,
        {
          components: [
            {
              label: 'build or type-check command',
              count: packageJson && (scripts.has('build') || scripts.has('typecheck')) ? 1 : 0,
            },
            { label: 'CI workflow', count: workflows.length > 0 ? 1 : 0 },
            { label: 'deployment configuration', count: deployConfigs.length > 0 ? 1 : 0 },
            { label: 'environment template', count: envTemplate ? 1 : 0 },
            { label: 'health or readiness signal', count: hasHealthOrReadinessSignal ? 1 : 0 },
            { label: 'error boundary', count: errorBoundary !== undefined ? 1 : 0 },
          ],
          ...(rootOnlyScriptsNote ? { condition: rootOnlyScriptsNote } : {}),
        },
      ),
      metric(
        'prod_workflow_depth',
        'Production workflow depth',
        workflows.length + deployConfigs.length,
        6,
        0.2,
        'signals',
        'Measures CI/deploy configuration depth instead of a single CI-present bit.',
        'saturating_count',
      ),
      metric(
        'observability_depth',
        'Observability depth',
        observabilityCount,
        4,
        0.1,
        'signals',
        'Counts static observability/logging/metrics implementation signals.',
        'saturating_count',
      ),
      metric(
        'rollback_safety_depth',
        'Rollback and migration-safety depth',
        rollbackSafetyCount,
        4,
        0.15,
        'signals',
        'Counts static rollback or migration-safety artifacts.',
        'saturating_count',
      ),
    ],
    ...(buildStepSettlement === 'unsettled'
      ? { notes: WITAN_A3_BUILD_STEP_UNSETTLED_DISCLOSURE }
      : {}),
  };
}

function collectA4DependencyEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  mono: MonorepoContext | null | undefined,
  useV27Detectors: boolean,
  useV47Detectors: boolean,
  inventoryAbsenceContext: InventoryAbsenceContext = LEGACY_INVENTORY_ABSENCE_CONTEXT,
  useV27FalseAssuranceClosure = false,
): WitanCriterionSignalPayload | null {
  const evidence: WitanEvidencePointer[] = [];
  const findings: WitanCriterionSignalPayload['findings'] = [];
  const manifests = repoFiles.filter(isDependencyManifest);
  const lockfiles = repoFiles.filter(isLockfile);
  const lockfile = lockfiles[0];
  // A lockfile / dependency-update config at the MONOREPO ROOT covers this sub-package.
  const rootLockfile = mono ? mono.sharedFiles.find(isLockfile) : undefined;
  const rootUpdateConfig = mono ? mono.sharedFiles.find(isDependencyUpdateConfig) : undefined;
  const hasLockfile = Boolean(lockfile) || Boolean(rootLockfile);
  const updateConfig = repoFiles.find(isDependencyUpdateConfig);
  const hasUpdateConfig = Boolean(updateConfig) || Boolean(rootUpdateConfig);
  // Scoped to 'dependency_automation_ratio': the only content-dependent half of that metric
  // (hasUpdateConfig above is filename-only).
  const auditConfig = withContentReadSignal('A4', 'dependency_automation_ratio', () =>
    manifests.some((file) => packageJsonHasAuditScript(repoPath, file)),
  );
  // A single parse of each manifest feeds three separate ratio metrics below
  // (pinned_dependency_ratio / declared_version_range_ratio / dependency_count_sanity) — see
  // withContentReadSignals' doc comment in content-reads.ts. An unreadable manifest abstains
  // all three rather than silently under-counting only the one computed first.
  // pickPrimaryDependencyManifest also parses every manifest candidate (to break ties by spec
  // count), so it is wrapped in the same scope — otherwise its read of the very same file would
  // happen outside any signal and force the conservative whole-criterion fallback regardless of
  // the wrap below (goal_cejel_v23_instrument_all_criteria_2026-09-07).
  const { manifest, dependencySpecs } = withContentReadSignals(
    'A4',
    ['pinned_dependency_ratio', 'declared_version_range_ratio', 'dependency_count_sanity'],
    () => ({
      // Cite the manifest that actually carries dependencies for evidence/findings, not
      // whichever sorts first (e.g. a near-empty requirements-windows.txt that precedes the
      // real requirements.txt), so the evidence pointer reflects the file the A4 score is
      // derived from. The score itself is unaffected: it aggregates specs across ALL manifests.
      manifest: pickPrimaryDependencyManifest(repoPath, manifests),
      dependencySpecs: readDependencySpecs(repoPath, manifests),
    }),
  );
  const pinnedDependencyCount = dependencySpecs.filter((dependency) =>
    isPinnedDependencyVersion(dependency.version),
  ).length;

  if (manifest) {
    // This evidence pointer is hashed from the same manifest the ratio metrics above parsed —
    // an unreadable manifest belongs to that signal group, not an unattributed A4-wide skip.
    withContentReadSignals(
      'A4',
      ['pinned_dependency_ratio', 'declared_version_range_ratio', 'dependency_count_sanity'],
      () =>
        evidence.push(
          evidenceForRelative(repoPath, manifest, 'dependency_report', 'Dependency manifest'),
        ),
    );
  }
  if (lockfile)
    evidence.push(
      evidenceForRelative(repoPath, lockfile, 'dependency_report', 'Dependency lockfile'),
    );
  else if (rootLockfile && mono)
    evidence.push(
      evidenceForRelative(
        mono.root,
        rootLockfile,
        'dependency_report',
        'Dependency lockfile (monorepo root)',
      ),
    );
  if (updateConfig) {
    evidence.push(
      evidenceForRelative(repoPath, updateConfig, 'dependency_report', 'Dependency update config'),
    );
  } else if (rootUpdateConfig && mono) {
    evidence.push(
      evidenceForRelative(
        mono.root,
        rootUpdateConfig,
        'dependency_report',
        'Dependency update config (monorepo root)',
      ),
    );
  }

  if (!manifest && !hasLockfile) return null;

  // Library-vs-app dependency calibration (goal_cejel_rubric_calibration_archetype_2026-07-10).
  // Reuses A3's archetype line (isDeployableService — the same detector behind A3's
  // "not applicable to this library/CLI archetype"): an APP/SERVICE must pin its dependency
  // tree (lockfile + pins = reproducible deploys), but a LIBRARY/CLI correctly declares
  // VERSION RANGES and typically does NOT commit a lockfile — consumers resolve their own
  // trees. Scoring library manifests against app expectations flagged correct library
  // behavior as CRITICAL (Django A4 1.4: "1/13 pinned, no lockfile").
  const packagedApplicationFiles = useV27Detectors
    ? findPackagedApplicationPremiseFiles(repoPath, repoFiles)
    : [];
  const deployableServiceFiles = useV47Detectors
    ? findDeployableServicePremiseFiles(repoPath, repoFiles, true)
    : [];
  const isAppOrService =
    (useV47Detectors
      ? deployableServiceFiles.length > 0
      : isDeployableService(repoPath, repoFiles, useV27Detectors)) ||
    packagedApplicationFiles.length > 0;

  if (isAppOrService && !hasLockfile && manifest) {
    // A missing recognized lockfile is a concrete inventory result. Do not infer the broader
    // install-reproducibility consequence here: the detector does not inspect every other
    // package-manager or deployment pinning mechanism. The evidence pointer below is hashed
    // from the same manifest the ratio metrics above parsed, so it is wrapped in that same
    // signal group rather than left to force an unattributed A4-wide skip.
    withContentReadSignals(
      'A4',
      ['pinned_dependency_ratio', 'declared_version_range_ratio', 'dependency_count_sanity'],
      () =>
        findings.push(
          inventoryAbsenceFinding({
            severity: 'critical',
            summaries: {
              legacy:
                'Dependency manifest is present without a detected lockfile — non-reproducible installs.',
              currentTracked:
                'Dependency manifest is present, but the tracked scan-eligible inventory matched no recognized lockfile.',
              currentDirectoryWalk:
                'Dependency manifest is present, but the bounded directory walk matched no recognized lockfile.',
            },
            evidence: evidenceForRelative(
              repoPath,
              manifest,
              'dependency_report',
              'Dependency manifest',
            ),
            context: inventoryAbsenceContext,
            inventoryCount: repoFiles.length + (mono?.sharedFiles.length ?? 0),
            patternSet: INVENTORY_SCAN_PATTERN_SETS.a4Lockfile,
            matchCount: 0,
          }),
        ),
    );
  }
  if (
    manifest &&
    withContentReadSignal('A4', 'suspicious_dependencies', () =>
      hasSuspiciousDependencies(repoPath, manifest, useV47Detectors),
    )
  ) {
    // Suspicious/hallucinated package names are a supply-chain risk.
    findings.push({
      severity: 'critical',
      summary: 'Dependency manifest contains obviously suspicious placeholder dependency names.',
      evidence: evidenceForRelative(
        repoPath,
        manifest,
        'dependency_report',
        'Suspicious dependency manifest',
      ),
    });
  }

  // #520. The repository's own CI can require a committed lockfile (`uv run --locked`, `npm ci`,
  // ...). Every rubric uses this for presentation only: the library note stops saying a lockfile
  // is "not required", and the requiring line is cited first, so the metric-derived finding cites
  // it. Those reads are of CI workflows B3 reads anyway and are attributed to nothing, so no
  // rubric's score or abstention can move. v27 also scores it (lockfile_coverage below), and there
  // the read is A4's own, so a workflow A4 cannot read abstains A4.
  //
  // A requirement is reported only when the specific lockfile its command needs is absent from
  // everything the scan knows of: the inventory, the monorepo root, and the paths the file walk
  // withheld (a lockfile over the size limit is still committed). Lockfiles A4 does not count
  // (bun.lock, Gemfile.lock, ...) still satisfy the command that reads them.
  const knownPaths = [
    ...repoFiles,
    ...(mono?.sharedFiles ?? []),
    ...withheldRepoPaths().map(({ path }) => path),
  ];
  const knownBasenames = new Set(knownPaths.map((path) => basename(path)));
  const findRequirement = () =>
    findLockfileRequirement(repoPath, repoFiles.filter(isGitHubActionsWorkflow), (lockfiles) =>
      lockfiles.some((name) => knownBasenames.has(name)),
    );
  const lockfileRequirement =
    hasLockfile || !manifest
      ? undefined
      : useV27FalseAssuranceClosure
        ? withContentReadSignal('A4', 'lockfile_coverage', findRequirement)
        : withoutContentReadAttribution(findRequirement);
  const leadingEvidence: WitanEvidencePointer[] = [];
  if (lockfileRequirement) {
    const cite = () =>
      evidenceForRelativeAtLine(
        repoPath,
        lockfileRequirement.file,
        'dependency_report',
        `CI step runs \`${lockfileRequirement.command}\`, which needs ${joinLockfileNames(lockfileRequirement.lockfiles)}; the scanned inventory holds none`,
        lockfileRequirement.line,
      );
    leadingEvidence.push(
      useV27FalseAssuranceClosure
        ? withContentReadSignal('A4', 'lockfile_coverage', cite)
        : withoutContentReadAttribution(cite),
    );
  }
  // #520, every rubric, presentation only. Under library norms the manifest cited first is the
  // one holding a dependency declared with no version constraint, when that is not already the
  // primary manifest. The primary manifest is chosen by spec count and also feeds the
  // suspicious-dependency check, so it is not changed; only the citation order is. These are
  // re-reads of manifests the ratio metrics above already read, in the same signal scope.
  if (!isAppOrService && manifest) {
    const unconstrained = withContentReadSignals(
      'A4',
      ['pinned_dependency_ratio', 'declared_version_range_ratio', 'dependency_count_sanity'],
      () => {
        const unconstrainedCount = (file: string) =>
          readDependencySpecs(repoPath, [file]).filter(
            (dependency) => !hasDeclaredVersionConstraint(dependency),
          ).length;
        // The primary manifest already leads the evidence: another is cited ahead of it only when
        // the primary itself declares every dependency with a constraint.
        if (unconstrainedCount(manifest) > 0) return undefined;
        for (const file of manifests) {
          if (file === manifest) continue;
          const count = unconstrainedCount(file);
          if (count > 0) return { file, count };
        }
        return undefined;
      },
    );
    if (unconstrained) {
      leadingEvidence.push(
        withContentReadSignals(
          'A4',
          ['pinned_dependency_ratio', 'declared_version_range_ratio', 'dependency_count_sanity'],
          () =>
            evidenceForRelative(
              repoPath,
              unconstrained.file,
              'dependency_report',
              `Dependency manifest with ${unconstrained.count} ${unconstrained.count === 1 ? 'dependency' : 'dependencies'} declared without a version constraint`,
            ),
        ),
      );
    }
  }
  evidence.unshift(...leadingEvidence);

  const automationMetric = metric(
    'dependency_automation_ratio',
    'Dependency automation ratio',
    (hasUpdateConfig ? 1 : 0) + (auditConfig ? 1 : 0),
    2,
    0.25,
    'ratio',
    'Credits automated dependency updates and package-manager audit hooks.',
    undefined,
    {
      components: [
        { label: 'automated dependency-update configuration', count: hasUpdateConfig ? 1 : 0 },
        { label: 'package-manager audit hook', count: auditConfig ? 1 : 0 },
      ],
    },
  );

  // APP/SERVICE norms: pinned versions + a lockfile are the reproducibility guarantee for a
  // deployed artifact. Unchanged from the pre-archetype scoring so the app case is not loosened.
  const appMetrics: WitanCriterionMetric[] = [
    metric(
      'pinned_dependency_ratio',
      'Pinned dependency ratio',
      pinnedDependencyCount,
      Math.max(dependencySpecs.length, 1),
      0.3,
      'ratio',
      // Reduced weight: semver ranges in manifests are normal when a lockfile fixes exact versions.
      'Measures exact/static dependency versions in manifests; lower weight because a lockfile is the primary reproducibility guarantee.',
    ),
    metric(
      'lockfile_coverage',
      'Lockfile coverage',
      hasLockfile ? 1 : 0,
      1,
      0.45,
      'present',
      // Presence-based (not ratio) so a single root lockfile covering a monorepo workspace scores full credit.
      'Credits presence of at least one lockfile; one root lockfile covering a monorepo is sufficient.',
    ),
    automationMetric,
  ];

  // LIBRARY/CLI norms: ranges are correct, a lockfile is optional. Score on the signals that
  // ARE library-appropriate: every dependency carries an explicit version constraint (range or
  // pin), a committed lockfile is credited when present but never required, update automation,
  // and a sane direct-dependency count. Known-vuln/abandoned-dependency checks need network
  // data this offline scan does not have — they are intentionally absent, not scored 0.
  const constrainedDependencyCount = dependencySpecs.filter(hasDeclaredVersionConstraint).length;
  const libraryMetrics: WitanCriterionMetric[] = [
    metric(
      'declared_version_range_ratio',
      'Declared version range ratio',
      constrainedDependencyCount,
      Math.max(dependencySpecs.length, 1),
      0.5,
      'ratio',
      'Measures dependencies declared with an explicit version constraint (range or exact); a library correctly ships ranges, so ranges earn full credit here.',
    ),
    ...(hasLockfile
      ? [
          metric(
            'lockfile_coverage',
            'Lockfile coverage',
            1,
            1,
            0.3,
            'present',
            'Credited when present (reproducible dev/CI installs); a library without a committed lockfile is not penalized — consumers resolve their own trees.',
          ),
        ]
      : useV27FalseAssuranceClosure && lockfileRequirement
        ? [
            // v27 (#520): the repository's own CI requires a lockfile, so its absence is not the
            // library norm. A zero term can only lower the weighted mean.
            metric(
              'lockfile_coverage',
              'Lockfile coverage',
              0,
              1,
              0.3,
              'present',
              "Scored 0: this repository's own CI requires a lockfile, and the scanned inventory holds no recognized lockfile.",
            ),
          ]
        : []),
    automationMetric,
    metric(
      'dependency_count_sanity',
      'Dependency count sanity',
      libraryDependencyCountSanity(dependencySpecs.length),
      1,
      0.1,
      'sane',
      `Credits a sane direct-dependency count for a library (full credit up to ${LIBRARY_DEPENDENCY_COUNT_SANE_MAX} declared specs across manifests, declining beyond).`,
    ),
  ];

  return {
    criterionId: 'A4',
    positiveEvidence: evidence,
    findings,
    metrics: isAppOrService ? appMetrics : libraryMetrics,
    notes: isAppOrService
      ? `A4 scored against app/service norms (${packagedApplicationFiles.length > 0 ? 'packaged application' : 'deploy surface'} detected): pinned dependencies and a lockfile are required for reproducible installs.`
      : lockfileRequirement
        ? `A4 scored against library/CLI norms (no deploy surface detected — same archetype line as A3): declared version ranges are correct library behavior. An unconditional step in this repository's CI runs \`${lockfileRequirement.command}\` (${lockfileRequirement.file} line ${lockfileRequirement.line}), which exits with an error without ${joinLockfileNames(lockfileRequirement.lockfiles)}, and the scanned inventory holds none.`.slice(0, 1000)
        : 'A4 scored against library/CLI norms (no deploy surface detected — same archetype line as A3): declared version ranges are correct library behavior; a committed lockfile is credited but not required.',
  };
}

// #520. Commands that exit with an error when the lockfile they read is absent, each with the
// lockfiles that satisfy it. Only commands whose documented behaviour is to fail without a lockfile
// are listed; commands that merely prefer one (`yarn --frozen-lockfile` on Yarn 1, `yarn
// --immutable`, which Yarn 1 does not know, `bun install --frozen-lockfile`, `pipenv install
// --deploy`, `poetry install --sync`) and tool installs (`cargo install --locked` reads the
// installed crate's lockfile) are not.
interface LockfileRequiringCommand {
  readonly tool: string;
  readonly subcommands: readonly string[];
  /** At least one must appear in the same command; `null` means the subcommand alone requires it. */
  readonly flags: readonly string[] | null;
  readonly lockfiles: readonly string[];
  /** Subcommands that write the lockfile when run without one of `flags` (`npm install`, ...). */
  readonly generators: readonly string[];
}

const LOCKFILE_REQUIRING_COMMANDS: readonly LockfileRequiringCommand[] = [
  {
    tool: 'npm',
    subcommands: ['ci'],
    flags: null,
    lockfiles: ['package-lock.json', 'npm-shrinkwrap.json'],
    generators: ['install', 'i', 'add', 'update', 'up'],
  },
  {
    tool: 'pnpm',
    subcommands: ['install', 'i'],
    flags: ['--frozen-lockfile'],
    lockfiles: ['pnpm-lock.yaml'],
    generators: ['install', 'i', 'add', 'update', 'up'],
  },
  {
    tool: 'uv',
    subcommands: ['run', 'sync'],
    flags: ['--locked', '--frozen'],
    lockfiles: ['uv.lock'],
    generators: ['run', 'sync', 'lock', 'add'],
  },
  {
    tool: 'cargo',
    subcommands: ['build', 'test', 'check', 'clippy', 'doc', 'run', 'bench'],
    flags: ['--locked', '--frozen'],
    lockfiles: ['Cargo.lock'],
    generators: ['build', 'test', 'check', 'clippy', 'doc', 'run', 'bench', 'generate-lockfile', 'update'],
  },
  {
    tool: 'poetry',
    subcommands: ['check'],
    flags: ['--lock'],
    lockfiles: ['poetry.lock'],
    generators: ['lock', 'install', 'add', 'update'],
  },
];

// Shell words that make a step's commands depend on something: a requirement inside such a step is
// not stated by the repository unconditionally (`if [ -f package-lock.json ]; then npm ci; fi`).
// Read only in command position: `npm test` and `cargo test --locked` are not conditionals.
const CONDITIONAL_SHELL_WORDS = new Set([
  'if', 'then', 'else', 'elif', 'fi', 'case', 'esac', '[', '[[', 'test', 'while', 'until', 'for',
  'do', 'done',
]);
const SHELL_COMMAND_SEPARATORS = new Set(['&&', '||', ';', '|']);
const DIRECTORY_CHANGE_COMMANDS = new Set(['cd', 'pushd']);

interface LockfileRequirement {
  readonly file: string;
  readonly line: number;
  /** The matched command, trimmed for display. */
  readonly command: string;
  readonly lockfiles: readonly string[];
}

function joinLockfileNames(names: readonly string[]): string {
  return names.length === 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

function isGitHubActionsWorkflow(file: string): boolean {
  return /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file);
}

/** The text of a line before its first comment. Plain string scanning, linear in its length. */
function beforeShellComment(line: string): string {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('#')) return '';
  const cut = [trimmed.indexOf(' #'), trimmed.indexOf('\t#')].filter((index) => index !== -1);
  return cut.length > 0 ? trimmed.slice(0, Math.min(...cut)) : trimmed;
}

/** One line's words, split into commands at shell separators. */
function shellCommands(line: string): string[][] {
  const commands: string[][] = [[]];
  for (const raw of beforeShellComment(line).split(/[ \t]+/)) {
    const word = raw.endsWith(';') && raw.length > 1 ? raw.slice(0, -1) : raw;
    if (word === '') continue;
    if (SHELL_COMMAND_SEPARATORS.has(word)) {
      commands.push([]);
      continue;
    }
    commands[commands.length - 1]?.push(word);
    if (raw.endsWith(';') && raw.length > 1) commands.push([]);
  }
  return commands.filter((command) => command.length > 0);
}

/** The command only when the tool is in command position (not an argument to echo, a heredoc, ...). */
function matchLockfileRequiringCommand(
  words: readonly string[],
  rule: LockfileRequiringCommand,
): string | undefined {
  if (words[0] !== rule.tool) return undefined;
  const subcommand = words[1];
  if (subcommand === undefined || !rule.subcommands.includes(subcommand)) return undefined;
  if (rule.flags === null) return [rule.tool, subcommand].join(' ');
  const flags = rule.flags;
  // Flags after `--` belong to the program being run, not to the tool.
  const end = words.indexOf('--');
  const own = end === -1 ? words.slice(2) : words.slice(2, end);
  const flagIndex = own.findIndex((word) => flags.includes(word.split('=')[0] ?? word));
  if (flagIndex === -1) return undefined;
  return [rule.tool, subcommand, ...own.slice(0, flagIndex + 1)].join(' ');
}

interface WorkflowRunStep {
  /** 1-based line of each command line, with its text. */
  readonly lines: readonly { readonly line: number; readonly text: string }[];
  /**
   * True when the step or its job carries an `if:` condition or a `continue-on-error:` other than
   * `false`, or when the reader cannot place the step inside a list item.
   */
  readonly conditional: boolean;
}

const RUN_KEY_PATTERN = /^([ \t]*)(?:-[ \t]+)?run:[ \t]*(.*)$/;
const IF_KEY_PATTERN = /^[ \t]*(?:-[ \t]+)?if:/;
const CONTINUE_ON_ERROR_KEY_PATTERN = /^[ \t]*(?:-[ \t]+)?continue-on-error:[ \t]*(.*)$/;
const STEPS_KEY_PATTERN = /^[ \t]*steps:[ \t]*$/;
const LIST_ITEM_PATTERN = /^[ \t]*-[ \t]/;

function lineIndent(line: string): number {
  return line.length - line.trimStart().length;
}

/** An `if:` key, or a `continue-on-error:` whose value is anything but a literal `false`. */
function isStepOrJobGuard(line: string): boolean {
  if (IF_KEY_PATTERN.test(line)) return true;
  const continueOnError = CONTINUE_ON_ERROR_KEY_PATTERN.exec(line);
  if (!continueOnError) return false;
  const value = beforeShellComment(continueOnError[1] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2');
  return value !== 'false';
}

/**
 * For each line, the index of the next non-blank line whose indent is at most (`orEqual`) or
 * strictly below its own; `lines.length` where there is none. One pass with a stack.
 */
function nextDedentIndexes(lines: readonly string[], orEqual: boolean): number[] {
  const next = new Array<number>(lines.length).fill(lines.length);
  const open: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? '';
    if (raw.trim() === '') continue;
    const indent = lineIndent(raw);
    while (open.length > 0) {
      const top = open[open.length - 1] ?? 0;
      const topIndent = lineIndent(lines[top] ?? '');
      if (orEqual ? topIndent < indent : topIndent <= indent) break;
      next[top] = index;
      open.pop();
    }
    open.push(index);
  }
  return next;
}

/**
 * The `run:` steps of a GitHub Actions workflow, read by indentation: a one-line value, or a `|` /
 * `>` block. A step is conditional when an `if:` or `continue-on-error:` key sits in the step
 * itself or at its job's level. Anything the reader cannot place is not claimed from. Linear in
 * the file: each lookup below is a precomputed index or is computed once per step or job.
 */
function githubActionsRunSteps(contents: string): WorkflowRunStep[] {
  const lines = contents.split(/\r?\n/);
  const itemAtOrAbove = new Array<number>(lines.length);
  const stepsKeyAbove = new Array<number>(lines.length);
  const lessIndentedAbove = new Array<number>(lines.length);
  {
    let lastItem = 0;
    let lastStepsKey = -1;
    const open: number[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const raw = lines[index] ?? '';
      if (LIST_ITEM_PATTERN.test(raw)) lastItem = index;
      itemAtOrAbove[index] = lastItem;
      stepsKeyAbove[index] = lastStepsKey;
      if (STEPS_KEY_PATTERN.test(raw)) lastStepsKey = index;
      if (raw.trim() === '') {
        lessIndentedAbove[index] = -1;
        continue;
      }
      const indent = lineIndent(raw);
      while (open.length > 0 && lineIndent(lines[open[open.length - 1] ?? 0] ?? '') >= indent) {
        open.pop();
      }
      lessIndentedAbove[index] = open.length > 0 ? (open[open.length - 1] ?? -1) : -1;
      open.push(index);
    }
  }
  const nextAtOrBelow = nextDedentIndexes(lines, true);
  const nextBelow = nextDedentIndexes(lines, false);
  // The least-indented guard key inside each step, by the step's first line.
  const stepGuardIndent = new Map<number, number>();
  // Whether a job carries a guard at its own key level, by `<header line>:<key indent>`.
  const jobGuarded = new Map<string, boolean>();
  const steps: WorkflowRunStep[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = RUN_KEY_PATTERN.exec(lines[index] ?? '');
    if (!match) continue;
    const keyIndent = (match[1] ?? '').length + ((lines[index] ?? '').trimStart().startsWith('-') ? 2 : 0);
    const value = (match[2] ?? '').trim();
    const body: { line: number; text: string }[] = [];
    let lastBodyLine = index;
    if (/^[|>][-+0-9]*$/.test(value)) {
      for (let next = index + 1; next < lines.length; next += 1) {
        const raw = lines[next] ?? '';
        if (raw.trim() === '') continue;
        if (lineIndent(raw) <= keyIndent) break;
        body.push({ line: next + 1, text: raw });
        lastBodyLine = next;
      }
    } else if (value !== '') {
      body.push({ line: index + 1, text: value.replace(/^(['"])(.*)\1$/, '$2') });
    }
    // The step: the nearest `- ` item at or above the key, to the next line no deeper than it. A
    // key that is not inside that item's extent (malformed, or a mapping outside any list) is not
    // placed, so nothing is claimed from it.
    const stepStart = itemAtOrAbove[index] ?? 0;
    const stepEnd = nextAtOrBelow[stepStart] ?? lines.length;
    const placed = stepStart === index || stepEnd > index;
    let guardIndent = stepGuardIndent.get(stepStart);
    if (guardIndent === undefined) {
      guardIndent = Number.POSITIVE_INFINITY;
      for (let line = stepStart; line < stepEnd; line += 1) {
        const raw = lines[line] ?? '';
        if (isStepOrJobGuard(raw)) guardIndent = Math.min(guardIndent, lineIndent(raw));
      }
      stepGuardIndent.set(stepStart, guardIndent);
    }
    const stepConditional = guardIndent <= keyIndent;
    // The job: the mapping holding the nearest `steps:` key above the step. A guard key at that
    // key's own indent, before or after `steps:`, conditions every step in the job.
    let jobConditional = false;
    const stepsKey = stepsKeyAbove[stepStart] ?? -1;
    if (stepsKey !== -1) {
      const jobKeyIndent = lineIndent(lines[stepsKey] ?? '');
      const header = lessIndentedAbove[stepsKey] ?? -1;
      const cacheKey = `${header}:${jobKeyIndent}`;
      const cached = jobGuarded.get(cacheKey);
      if (cached !== undefined) {
        jobConditional = cached;
      } else {
        const end = nextBelow[stepsKey] ?? lines.length;
        for (let line = header + 1; line < end; line += 1) {
          const raw = lines[line] ?? '';
          if (lineIndent(raw) === jobKeyIndent && isStepOrJobGuard(raw)) {
            jobConditional = true;
            break;
          }
        }
        jobGuarded.set(cacheKey, jobConditional);
      }
    }
    steps.push({ lines: body, conditional: !placed || stepConditional || jobConditional });
    // A block body is shell text, not workflow keys: never read a `run:` inside it as a step.
    index = lastBodyLine;
  }
  return steps;
}

const WORKFLOW_OTHER_REPOSITORY_PATTERN = /^[ \t]*(?:-[ \t]+)?repository:[ \t]*\S/;
const WORKFLOW_DOWNLOAD_ARTIFACT_PATTERN = /^[ \t]*(?:-[ \t]+)?uses:[ \t]*['"]?actions\/download-artifact@/;
const WORKFLOW_WORKING_DIRECTORY_PATTERN = /^[ \t]*(?:-[ \t]+)?working-directory:[ \t]*(.*)$/;

/** True when `path`, as written in a workflow, names a directory inside this checkout. */
function isCheckoutDirectory(repoPath: string, path: string): boolean {
  if (path === '' || /[$~`*?]/.test(path) || path.startsWith('/')) return false;
  if (path.split('/').some((segment) => segment === '..')) return false;
  try {
    return lstatSync(join(repoPath, path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * False when the workflow can put files in its workspace that the scanned tree does not hold:
 * another repository checked out, an artifact downloaded, or a working directory that is not a
 * directory of this checkout. A lockfile could then come from outside what Cejel read.
 */
function workflowReadsOnlyThisTree(repoPath: string, contents: string): boolean {
  for (const raw of contents.split(/\r?\n/)) {
    if (WORKFLOW_OTHER_REPOSITORY_PATTERN.test(raw)) return false;
    if (WORKFLOW_DOWNLOAD_ARTIFACT_PATTERN.test(raw)) return false;
    const workingDirectory = WORKFLOW_WORKING_DIRECTORY_PATTERN.exec(raw);
    if (workingDirectory) {
      const value = beforeShellComment(workingDirectory[1] ?? '')
        .trim()
        .replace(/^(['"])(.*)\1$/, '$2')
        .replace(/\/+$/, '')
        .replace(/^\.\//, '');
      if (value !== '.' && !isCheckoutDirectory(repoPath, value)) return false;
    }
  }
  return true;
}

/**
 * The first unconditional GitHub Actions step, in file order, whose command requires a lockfile
 * that `isSatisfied` says is absent. Cejel claims nothing about a step that is conditional or may
 * fail without failing its job, whose shell is conditional or contains a heredoc, or that changes
 * into a directory this checkout does not hold; nor about a workflow that can bring in files from
 * outside the scanned tree, or that also runs a command that writes or names that lockfile
 * (`npm install`, `uv run` without `--locked`, `cp ci/package-lock.json .`), which may create it
 * first. Linear in the workflow: what the workflow may generate is decided once per workflow.
 */
function findLockfileRequirement(
  repoPath: string,
  workflows: readonly string[],
  isSatisfied: (lockfiles: readonly string[]) => boolean,
): LockfileRequirement | undefined {
  for (const file of workflows) {
    const fullPath = join(repoPath, file);
    if (!isRegularFile(fullPath)) continue;
    const contents = readRepoText(fullPath, 'utf8');
    if (!workflowReadsOnlyThisTree(repoPath, contents)) continue;
    const steps = githubActionsRunSteps(contents);
    const commandsOf = (step: WorkflowRunStep) =>
      step.lines.flatMap(({ line, text }) => shellCommands(text).map((words) => ({ line, words })));
    const stepCommands = steps.map(commandsOf);
    const mayBeGenerated = new Set<LockfileRequiringCommand>();
    for (const { words } of stepCommands.flat()) {
      for (const rule of LOCKFILE_REQUIRING_COMMANDS) {
        if (mayBeGenerated.has(rule)) continue;
        const generates =
          words[0] === rule.tool &&
          rule.generators.includes(words[1] ?? '') &&
          matchLockfileRequiringCommand(words, rule) === undefined;
        const names = words.some((word) => rule.lockfiles.some((lockfile) => word.includes(lockfile)));
        if (generates || names) mayBeGenerated.add(rule);
      }
    }
    for (const [stepIndex, step] of steps.entries()) {
      if (step.conditional) continue;
      const commands = stepCommands[stepIndex] ?? [];
      const shellIsConditional =
        step.lines.some(({ text }) => beforeShellComment(text).includes('<<')) ||
        commands.some(({ words }) => CONDITIONAL_SHELL_WORDS.has(words[0] ?? '')) ||
        step.lines.some(({ text }) => /(^|[ \t])\|\|([ \t]|$)/.test(beforeShellComment(text)));
      if (shellIsConditional) continue;
      const leavesCheckout = commands.some(
        ({ words }) =>
          DIRECTORY_CHANGE_COMMANDS.has(words[0] ?? '') &&
          !isCheckoutDirectory(repoPath, (words[1] ?? '').replace(/\/+$/, '').replace(/^\.\//, '')),
      );
      if (leavesCheckout) continue;
      for (const { line, words } of commands) {
        for (const rule of LOCKFILE_REQUIRING_COMMANDS) {
          const command = matchLockfileRequiringCommand(words, rule);
          if (command === undefined || isSatisfied(rule.lockfiles) || mayBeGenerated.has(rule)) {
            continue;
          }
          return { file, line, command: command.slice(0, 80), lockfiles: rule.lockfiles };
        }
      }
    }
  }
  return undefined;
}

// Full credit up to this many declared dependency specs (aggregated across all manifests,
// runtime + dev); beyond it the sanity credit declines linearly. Deliberately generous so a
// monorepo aggregating many workspace manifests is not meaningfully penalized (the metric
// carries 0.1 weight — a nudge against pathological dependency sprawl, not a hard gate).
const LIBRARY_DEPENDENCY_COUNT_SANE_MAX = 120;

function libraryDependencyCountSanity(specCount: number): number {
  if (specCount <= LIBRARY_DEPENDENCY_COUNT_SANE_MAX) return 1;
  return Math.max(0, 1 - (specCount - LIBRARY_DEPENDENCY_COUNT_SANE_MAX) / 240);
}

// Library norm for a declared dependency: ANY explicit version constraint counts — an exact
// pin, a semver/PEP-440 range (^, ~, >=, <, !=, ~=), a bare numeric version (Cargo "1.2" means
// ^1.2), or a go.mod exact version (v1.2.3). Only a constraint-free spec (bare name, *, latest)
// misses: it gives consumers no compatibility contract at all.
function hasDeclaredVersionConstraint(dependency: DependencySpec): boolean {
  if (isPinnedDependencyVersion(dependency.version)) return true;
  const trimmed = dependency.version.trim();
  if (trimmed.length === 0) return false;
  if (/^(latest|\*|x)$/i.test(trimmed)) return false;
  // CMake find_package without a version: system-managed, no declared constraint.
  if (trimmed === 'find') return false;
  // Range operator anywhere in the spec (requirements.txt specs keep the full line here).
  if (/[~^<>=!]/.test(trimmed)) return true;
  // go.mod exact versions ("v1.2.3") and bare numeric versions (Cargo "1.2" = ^1.2).
  return /^v?\d/.test(trimmed);
}

function collectA5ClaimRealityEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  useV27Detectors: boolean,
  useV23WithheldPathAbstention: boolean,
  inventoryAbsenceContext: InventoryAbsenceContext = LEGACY_INVENTORY_ABSENCE_CONTEXT,
  useV26SettlingEvidence = false,
): WitanCriterionSignalPayload | null {
  // A5's three metrics are file-count proxies over repoFiles, and a file Cejel withheld from that
  // list under its own content ceiling never reaches any of the filters below: the count simply
  // comes back one lower, indistinguishable from a repository that does not have the file.
  // `claim_match_rate` is implementation files over implementation-plus-claim-source files, so a
  // withheld implementation file leaves BOTH sides of the ratio and the ratio itself falls —
  // silently, with the skip disclosed only as an anonymous count in contentReadSummary. That is
  // the demonstrated instance of the same seam #304 closed for A3's health_readiness_route.
  //
  // Abstain the affected signal instead, on an EARNED match only: each predicate handed to
  // abstainSignalOnWithheldPaths below is the signal's own file-selection test, shared by
  // reference with the live filter, never an extension map or a path-shape heuristic — the
  // over-abstention goal_cejel_0_4_8_abstention_scoring_fix_2026-09-08 removed stays removed.
  //
  // Placed before the not-applicable return below deliberately: a withheld README is the case
  // where this criterion asserts "nothing is claimed about this repo" about a repository whose
  // claim source Cejel declined to read, which is a false assertion rather than a low score.
  const claimImplementationReads = claimImplementationFileReads(useV27Detectors);
  // Always called, with the rubric's own gate passed as each call's `act` argument: the
  // intersection is always computed and disclosed, even under a rubric where the mechanism is
  // off (goal_cejel_withheld_paths_always_disclosed_2026-09-22).
  abstainSignalOnWithheldPaths(
    'A5',
    'claim_match_rate',
    (file) => claimImplementationReads(file) || isClaimSourceFile(file),
    useV23WithheldPathAbstention,
  );
  abstainSignalOnWithheldPaths(
    'A5',
    'claim_source_depth',
    isClaimSourceFile,
    useV23WithheldPathAbstention,
  );
  abstainSignalOnWithheldPaths(
    'A5',
    'reconciliation_artifact_depth',
    isClaimRealityReconciliationPath,
    useV23WithheldPathAbstention,
  );
  abstainSignalOnWithheldPaths(
    'A5',
    'negative_space_documentation',
    isNegativeSpaceDocCandidate,
    useV23WithheldPathAbstention,
  );
  const reconciliationArtifacts = useV27Detectors
    ? findClaimRealityReconciliationArtifacts(repoPath, repoFiles)
    : [];
  const claimSourceFiles = useV27Detectors
    ? findClaimSourceFiles(repoFiles)
    : repoFiles.filter(
        (file) => /^(?:README|readme)\.md$/.test(file) || /^docs\/[^/]+\.(?:md|mdx)$/.test(file),
      );
  const claimDoc = useV27Detectors
    ? (claimSourceFiles[0] ?? reconciliationArtifacts[0])
    : (repoFiles.find((file) => /^(?:README|readme)\.md$/.test(file)) ??
      repoFiles.find((file) => /^docs\/[^/]+\.(?:md|mdx)$/.test(file)) ??
      repoFiles.find((file) => /(^|\/)claim[_-]reality[_-]reconciliation\.md$/i.test(file)));
  // A repo with no README/docs has nothing to claim, so nothing to contradict — N/A (like
  // B1/B5), not a scored 0 (goal_cejel_launch_hardening_combined_2026-07-06, Phase 3 H2).
  // (Historical: the prior `return null` fell through to scoreCriterion's `!signal` branch,
  // which then scored 'unverified' at 0 INSIDE the category average; a null now maps to
  // insufficient_data, excluded — but explicit N/A remains the honest state here, since
  // "nothing is claimed" is inapplicability, not a measurement gap.)
  if (!claimDoc) {
    return buildNotApplicableSignal(
      'A5',
      'No README or docs found — nothing is claimed about this repo, so there is nothing for A5 to reconcile against.',
    );
  }

  // Same predicate object the withheld-path check above consulted: findClaimImplementationFiles
  // is claimImplementationFileReads applied to the list, so the live filter and the abstention
  // test cannot diverge.
  const implementationFiles = findClaimImplementationFiles(repoFiles, useV27Detectors);
  if (implementationFiles.length === 0) return null;
  const implementationFile = implementationFiles[0];
  if (!implementationFile) return null;
  const evidence = [
    evidenceForRelative(repoPath, claimDoc, 'claim_reconciliation', 'Repository claim source'),
    evidenceForRelative(
      repoPath,
      implementationFile,
      'artifact',
      'Code presence for claim reconciliation',
    ),
  ];
  for (const artifact of reconciliationArtifacts.slice(0, 3)) {
    if (artifact === claimDoc) continue;
    evidence.push(
      evidenceForRelative(
        repoPath,
        artifact,
        'claim_reconciliation',
        'Dedicated claim-reality reconciliation artifact',
      ),
    );
  }
  const firstEvidence = evidence[0];
  if (!firstEvidence) return null;

  // Bound the proxy denominator to prevent manufactured inflated ratios.
  // We cap both sides so the metric never displays hundreds of "claims".
  // Restrict to headline-level documents only (README + top-level docs/, not nested subdirs).
  const allDocFiles = useV27Detectors
    ? claimSourceFiles
    : repoFiles.filter(
        (file) => /^README\.md$/.test(file) || /^docs\/[^/]+\.(?:md|mdx)$/.test(file),
      );
  const boundedImplCount = Math.min(implementationFiles.length, 12);
  const boundedDocCount = Math.min(allDocFiles.length, 8);

  // Documented negative space — an explicit limitations/threat-model/"not covered" section
  // is honest scoping, not a missing-claim gap (goal_cejel_rubric_refinement_from_lua_2026-07-06).
  // Checked across the claim doc, headline docs, and common SECURITY/threat-model filenames
  // (even nested — a security doc's location shouldn't gate whether honest scoping is credited).
  const negativeSpaceCandidates = new Set([
    claimDoc,
    ...allDocFiles,
    ...repoFiles.filter(isSecurityOrThreatModelDoc),
  ]);
  // Scoped to 'negative_space_documentation': feeds no metric (A5's three metrics are all
  // file-count proxies, never content-derived — see this goal's report), only the evidence
  // pointer and the finding severity (info vs warning) below. An unreadable candidate here must
  // not silently fall through to "no documented negative space" and harden the finding's
  // wording/severity as if that had been positively confirmed.
  const negativeSpaceDoc = withContentReadSignal('A5', 'negative_space_documentation', () =>
    [...negativeSpaceCandidates].find(
      (file) =>
        fileContains(repoPath, file, NEGATIVE_SPACE_SECTION_PATTERN) ||
        fileContains(repoPath, file, NEGATIVE_SPACE_PHRASE_PATTERN),
    ),
  );
  if (negativeSpaceDoc) {
    withContentReadSignal('A5', 'negative_space_documentation', () =>
      evidence.push(
        evidenceForRelative(
          repoPath,
          negativeSpaceDoc,
          'claim_reconciliation',
          'Documented limitations / threat model / "not covered" section',
        ),
      ),
    );
  }

  // v26 item 6 (docs/calibration/v26/ruling-item-6.md): not using Cejel's own artifact format is no
  // evidence that a repository's claims are unchecked. Under v26 the finding fires only when the
  // repository itself names a claim-reconciliation artifact that is absent (S-A5); otherwise A5
  // makes no finding and the ruling's sentence goes to the certificate. A present Cejel-format
  // artifact is unchanged: evidence and metric credit as before, no finding, no sentence.
  const claimArtifactDeclarations =
    useV26SettlingEvidence && reconciliationArtifacts.length === 0
      ? withContentReadSignal('A5', 'reconciliation_artifact_depth', () =>
          scanClaimArtifactDeclarations(repoPath, repoFiles),
        )
      : undefined;
  const declaredAbsentArtifact = claimArtifactDeclarations?.firstAbsent;
  const reconciliationUnsettled =
    useV26SettlingEvidence &&
    reconciliationArtifacts.length === 0 &&
    declaredAbsentArtifact === undefined;
  // v26 item 6, amendment 1 (docs/calibration/v26/ruling-item-6-amendment-1.md): with no
  // Cejel-format artifact present and none named, reconciliation_artifact_depth would score the
  // same absence the finding no longer asserts, so it is not scored. The other A5 metrics carry the
  // score at their declared relative weights, and the disclosure sentence above already says why.
  // Named and absent (S-A5), or named and present, or a Cejel-format artifact present: scored as
  // before.
  const omitReconciliationArtifactDepth =
    claimArtifactDeclarations !== undefined && !claimArtifactDeclarations.declared;

  return {
    criterionId: 'A5',
    positiveEvidence: evidence,
    findings:
      reconciliationArtifacts.length > 0
        ? []
        : useV26SettlingEvidence
          ? declaredAbsentArtifact === undefined
            ? []
            : [
                inventoryAbsenceFinding({
                  // Same severity rule as the finding it replaces: documented negative space is
                  // itself claim-reality discipline.
                  severity: negativeSpaceDoc ? 'info' : 'warning',
                  summaries: {
                    legacy: `This repository declares a claim-reconciliation artifact at \`${declaredAbsentArtifact.path}\`, and that path is not present in the tracked scan-eligible inventory.`,
                    currentTracked: `This repository declares a claim-reconciliation artifact at \`${declaredAbsentArtifact.path}\`, and that path is not present in the tracked scan-eligible inventory.`,
                    currentDirectoryWalk: `This repository declares a claim-reconciliation artifact at \`${declaredAbsentArtifact.path}\`, and that path is not present in the bounded directory walk.`,
                  },
                  evidence: evidenceForRelativeAtLine(
                    repoPath,
                    declaredAbsentArtifact.declaringFile,
                    'claim_reconciliation',
                    'Declares a claim-reconciliation artifact that is absent',
                    declaredAbsentArtifact.line,
                  ),
                  context: inventoryAbsenceContext,
                  inventoryCount: repoFiles.length,
                  patternSet: INVENTORY_SCAN_PATTERN_SETS.a5DeclaredClaimArtifactPath,
                  matchCount: 0,
                }),
              ]
          : [
            inventoryAbsenceFinding({
              // Proxy-only A5: cap at warning (never critical) — a static proxy is lower-confidence
              // than a curated registry or reconciliation artifact. Downgraded to info when the repo
              // documents honest negative space: that scoping IS a form of claim-reality discipline,
              // not an additional gap on top of the missing dedicated artifact.
              severity: negativeSpaceDoc ? 'info' : 'warning',
              summaries: {
                legacy: negativeSpaceDoc
                  ? 'Claim source and implementation files are present; no dedicated claim-reality report artifact was supplied, but the repo explicitly documents what it does NOT cover/protect against — honest scoping, not overclaiming.'
                  : 'Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied.',
                currentTracked: negativeSpaceDoc
                  ? 'Claim-source and implementation-file signals are present, while the tracked scan-eligible inventory matched no dedicated claim-reality report artifact; the repo separately documents what it does NOT cover or protect against.'
                  : 'Claim-source and implementation-file signals are present, while the tracked scan-eligible inventory matched no dedicated claim-reality report artifact.',
                currentDirectoryWalk: negativeSpaceDoc
                  ? 'Claim-source and implementation-file signals are present, while the bounded directory walk matched no dedicated claim-reality report artifact; the repo separately documents what it does NOT cover or protect against.'
                  : 'Claim-source and implementation-file signals are present, while the bounded directory walk matched no dedicated claim-reality report artifact.',
              },
              evidence: firstEvidence,
              context: inventoryAbsenceContext,
              inventoryCount: repoFiles.length,
              patternSet: INVENTORY_SCAN_PATTERN_SETS.a5ClaimRealityArtifact,
              matchCount: 0,
            }),
          ],
    // Recalibrated (goal_cejel_launch_hardening_combined_2026-07-06, Phase 3 H1):
    // reconciliation_artifact_depth is usually 0 on the generic-proxy path, so its prior 0.3
    // weight was a floor drag on external repos regardless of how well they otherwise document
    // and back claims. Weight remains 0.15 (still a real ding when a content-authenticated,
    // generically named reconciliation artifact is absent) and is redistributed to the two
    // metrics that every well-run external repo can earn; claim_source_depth's
    // denominator lowered from 8 to 4 (README + a couple of top-level docs is already a
    // reasonably documented repo, not a fraction of an inflated 8-file bar).
    metrics: [
      metric(
        'claim_match_rate',
        'Claim match rate',
        boundedImplCount,
        Math.max(boundedImplCount + boundedDocCount, 1),
        0.5,
        'ratio',
        'Uses bounded implementation-to-claim-source depth as a static proxy when no dedicated artifact exists.',
      ),
      metric(
        'claim_source_depth',
        'Claim source depth',
        allDocFiles.length,
        4,
        0.35,
        'docs',
        'Credits multiple claim-bearing documents without judging unverified prose as truth.',
        'saturating_count',
      ),
      ...(omitReconciliationArtifactDepth
        ? []
        : [
            metric(
              'reconciliation_artifact_depth',
              'Reconciliation artifact depth',
              reconciliationArtifacts.length,
              3,
              0.15,
              'artifacts',
              'Requires a specific claim-reality artifact to reach full depth.',
            ),
          ]),
    ],
    ...(reconciliationUnsettled ? { notes: WITAN_A5_RECONCILIATION_UNSETTLED_DISCLOSURE } : {}),
  };
}

// The window B2's pr_merge_ratio reads (readRecentCommits).
const RECENT_COMMIT_WINDOW = 12;

const V27_A2_SHALLOW_HISTORY_NOTE =
  'A2 abstained: this repository is a shallow clone, so the scan for credentials and .env files in ' +
  'earlier commits read only the commits present, and no confirmed critical finding stands on what ' +
  'was read. Re-scan a full clone (for actions/checkout, set fetch-depth: 0).';
const V27_B2_SHALLOW_HISTORY_NOTE =
  `B2 abstained: this repository is a shallow clone with fewer than ${RECENT_COMMIT_WINDOW} commits ` +
  'visible, so the pull-request merge ratio cannot be read over its window. Re-scan a full clone ' +
  '(for actions/checkout, set fetch-depth: 0).';

/**
 * A criterion that reads commit history, abstaining because the clone is shallow (v27, #442). No
 * insufficientDataReason: it is a read failure, so it stays in the composite at 0 and a shallow
 * clone can never score higher than the full clone would have on that account.
 */
function shallowHistoryAbstention(
  criterionId: 'A2' | 'B2',
  notes: string,
): WitanCriterionSignalPayload {
  return {
    criterionId,
    positiveEvidence: [],
    findings: [],
    metrics: [],
    insufficientData: true,
    notes,
  };
}

function collectB2PrTraceEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  useV27FalseAssuranceClosure = false,
): WitanCriterionSignalPayload | null {
  const workflows = repoFiles.filter(isCiWorkflow);
  // GitHub recognizes both the single-file form (pull_request_template.md) and the directory
  // form (.github/PULL_REQUEST_TEMPLATE/<name>.md, used to offer multiple templates) — matching
  // only the file form reported a repo using the directory form as having no PR template.
  const prTemplate = repoFiles.find((file) =>
    /(^|\/)(pull_request_template|PULL_REQUEST_TEMPLATE)(\.md$|\/[^/]+\.md$)/.test(file),
  );
  // CODEOWNERS counts only where GitHub reads it (#433); the name-shaped alternatives are unchanged.
  const branchProtectionDoc = repoFiles.find(
    (file) => /branch.*protection|review.*gate/i.test(file) || GITHUB_CODEOWNERS_PATH_PATTERN.test(file),
  );
  const citedWorkflows = workflows.slice(0, 3);
  const unreadWorkflows = unreadCiWorkflowReasons(() => true);
  const workflowLabel = (file: string) =>
    fittedCiWorkflowCitationLabel(b2WorkflowCitationBaseLabels(repoPath, file), (baseLabel) =>
      ciWorkflowCitationLabel(
        baseLabel,
        'counted',
        workflows.length,
        citedWorkflows.length,
        unreadWorkflows,
      ),
    );
  const evidence = [
    ...citedWorkflows.map((file) =>
      evidenceForRelative(repoPath, file, 'ci_run', workflowLabel(file)),
    ),
    ...(prTemplate
      ? [evidenceForRelative(repoPath, prTemplate, 'pull_request', 'Pull request template')]
      : []),
    ...(branchProtectionDoc
      ? [
          evidenceForRelative(
            repoPath,
            branchProtectionDoc,
            'pull_request',
            'Review gate configuration',
          ),
        ]
      : []),
  ];
  if (evidence.length === 0) return null;
  // v27 (#442): pr_merge_ratio reads the most recent RECENT_COMMIT_WINDOW commits. A shallow clone
  // with fewer visible has truncated that window; B2 abstains rather than score the remainder.
  // Withholding only pr_merge_ratio is not done: B2 would then score on pr_trace_primitives alone,
  // which can be higher.
  if (
    useV27FalseAssuranceClosure &&
    isShallowRepository(repoPath) &&
    readRecentCommits(repoPath).length < RECENT_COMMIT_WINDOW
  ) {
    return shallowHistoryAbstention('B2', V27_B2_SHALLOW_HISTORY_NOTE);
  }
  return {
    criterionId: 'B2',
    positiveEvidence: evidence,
    findings: [],
    metrics: [
      // Recalibrated (goal_cejel_launch_hardening_combined_2026-07-06, Phase 3 H1): max
      // lowered from 5 to 2 and weight raised from 0.65 — a single CI workflow already
      // reaches half credit and CI + one other primitive reaches full credit; the prior
      // 5-slot denominator meant most well-run repos (CI only, no PR template/CODEOWNERS)
      // sat well under half credit here even with a healthy PR-trace posture.
      metric(
        'pr_trace_primitives',
        'PR trace basic checks',
        workflows.length + (prTemplate ? 1 : 0) + (branchProtectionDoc ? 1 : 0),
        2,
        0.8,
        'signals',
        'Measures CI, PR template, and review-gate evidence for pull-request traceability.',
        'saturating_count',
        {
          components: [
            { label: 'CI workflow', count: workflows.length },
            { label: 'pull-request template', count: prTemplate ? 1 : 0 },
            { label: 'review-gate record', count: branchProtectionDoc ? 1 : 0 },
          ],
        },
      ),
      // Weight lowered from 0.35 (Phase 3 H1): squash-merge and local-history repos with
      // no "Merge pull request"/"#123" commit-subject convention legitimately score 0/N
      // here despite otherwise healthy PR discipline — this metric is now a minor modifier
      // rather than able to single-handedly drag a well-run repo to critical.
      metric(
        'pr_merge_ratio',
        'Recent PR merge ratio',
        readRecentCommits(repoPath).filter((commit) => isPrMergeCommit(commit)).length,
        Math.max(readRecentCommits(repoPath).length, 1),
        0.2,
        'ratio',
        'Uses bounded git history as a deterministic proxy for PR outcome traceability.',
      ),
    ],
  };
}

function collectB3CiDisciplineEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  mono?: MonorepoContext | null,
  useV27FalseAssuranceClosure = false,
): WitanCriterionSignalPayload | null {
  const evidence: WitanEvidencePointer[] = [];
  const packageJson = findRootPackageJson(repoFiles);
  const scripts = packageJson ? readPackageScripts(join(repoPath, packageJson)) : new Map();
  const workflows = repoFiles.filter(isCiWorkflow);
  const workflow = workflows[0];
  // CI workflows at the MONOREPO ROOT gate this sub-package's PRs too — count them.
  const rootWorkflows = mono ? mono.sharedFiles.filter(isCiWorkflow) : [];
  // v27 (#517): a workflow that only publishes, releases or deploys is not CI verification, so it
  // counts toward neither depth metric. It stays in `workflows` for evidence and the read count,
  // so a repository whose only workflow publishes still reports B3, at depth 0. Every other rubric
  // counts it: making it run on every push raised B3.
  const countsAsCi = (root: string) => (file: string) =>
    !useV27FalseAssuranceClosure || !isPublishOnlyWorkflow(root, file);
  const { defaultBranchCiCount, defaultBranchCiWorkflows, rootDefaultBranchCiWorkflows } = withContentReadSignal(
    'B3',
    'default_branch_ci_depth',
    () => {
      const counted = workflows
        .filter(countsAsCi(repoPath))
        .filter((file) => workflowTargetsDefaultBranch(repoPath, file));
      const rootCounted = mono
        ? rootWorkflows
            .filter(countsAsCi(mono.root))
            .filter((file) => workflowTargetsDefaultBranch(mono.root, file))
        : [];
      return {
        defaultBranchCiCount: counted.length + rootCounted.length,
        defaultBranchCiWorkflows: counted,
        rootDefaultBranchCiWorkflows: rootCounted,
      };
    },
  );
  // Presentation only: the counted workflows Cejel did not see run a check, the repository's own
  // and a monorepo root's (named as such, since their paths are relative to that root).
  const unshownCheckWorkflows = mergeB3UnshownCheckWorkflows(
    findB3UnshownCheckWorkflows(repoPath, defaultBranchCiWorkflows),
    mono
      ? findB3UnshownCheckWorkflows(
          mono.root,
          rootDefaultBranchCiWorkflows,
          (file) => `${file} at the monorepo root`,
        )
      : { printOnly: [], absentBranch: [] },
  );
  const publishOnlyWorkflows = useV27FalseAssuranceClosure
    ? withContentReadSignals('B3', ['ci_script_depth', 'default_branch_ci_depth'], () =>
        workflows.filter((file) => isPublishOnlyWorkflow(repoPath, file)),
      )
    : [];

  if (packageJson && scripts.has('test')) {
    evidence.push(evidenceForRelative(repoPath, packageJson, 'test_run', 'Test script'));
  }
  if (packageJson && scripts.has('lint')) {
    evidence.push(evidenceForRelative(repoPath, packageJson, 'ci_run', 'Lint script'));
  }
  // Both evidence pointers below are hashed from the same workflow file(s) ci_script_depth and
  // default_branch_ci_depth read above — an unreadable workflow belongs to those signals, not
  // an unattributed B3-wide skip.
  // Every workflow in `workflows` and `rootWorkflows` is opened by ci_script_depth and
  // default_branch_ci_depth; the evidence names one. Only workflows the walk withheld (too_large
  // and the like) are not read, and only repoPath's own walk registers those.
  const unreadWorkflows = unreadCiWorkflowReasons(() => true);
  const workflowsRead = workflows.length + rootWorkflows.length;
  // Re-reads exactly the files default_branch_ci_depth read above, under that signal, so a read
  // failure here can only restate a skip already recorded, never abstain anything new.
  const delegatedSteps = withContentReadSignal('B3', 'default_branch_ci_depth', () =>
    sumDelegatedCiSteps(
      countDelegatedCiSteps(repoPath, workflows),
      mono ? countDelegatedCiSteps(mono.root, rootWorkflows) : NO_DELEGATED_CI_STEPS,
    ),
  );
  if (workflow) {
    withContentReadSignals('B3', ['ci_script_depth', 'default_branch_ci_depth'], () =>
      evidence.push(
        evidenceForRelative(
          repoPath,
          workflow,
          'ci_run',
          ciWorkflowCitationLabel(
            'CI workflow',
            'read',
            workflowsRead,
            1,
            unreadWorkflows,
            delegatedSteps,
          ),
        ),
      ),
    );
  } else if (rootWorkflows[0] && mono) {
    const rootWorkflow = rootWorkflows[0];
    withContentReadSignals('B3', ['ci_script_depth', 'default_branch_ci_depth'], () =>
      evidence.push(
        evidenceForRelative(
          mono.root,
          rootWorkflow,
          'ci_run',
          ciWorkflowCitationLabel(
            'CI workflow (monorepo root)',
            'read',
            workflowsRead,
            1,
            unreadWorkflows,
            delegatedSteps,
          ),
        ),
      ),
    );
  }

  if (evidence.length === 0) return null;

  // Language-agnostic CI command depth: credit test/lint/typecheck/build commands embedded in
  // CI workflows, counted by DISTINCT CATEGORY (not by file) — goal_cejel_process_rubric_
  // external_repo_calibration_2026-07-06. Counting by file structurally favored Node repos: a
  // Node project earns up to 4 via separate package.json scripts (test/lint/typecheck/build),
  // while a Python/Go/Rust project that runs pytest+flake8+mypy in a single workflow job (the
  // normal shape for those ecosystems) previously earned only 1 (one file matched, regardless
  // of how many distinct commands it ran) — verified live against a Flask-shaped fixture, which
  // landed B3 "critical" (1.0/4.0) purely from this file-vs-category mismatch, not from any
  // real CI gap. Category counting treats "this CI runs a test command, a lint command, and a
  // type-check command" the same whether that's 1 workflow file or 4.
  const CI_BUILD_COMMAND_PATTERN = /\b(cargo\s+build|cmake|ninja|make\s+(build|all))\b/i;
  const CI_COMMAND_CATEGORIES: readonly RegExp[] = [
    CI_TEST_COMMAND_PATTERN,
    CI_LINT_COMMAND_PATTERN,
    CI_TYPECHECK_COMMAND_PATTERN,
    CI_BUILD_COMMAND_PATTERN,
  ];
  // The root and every declared workspace package (findDeclaredWorkspaceManifests): a category
  // counts once when any of them declares it. With no declaration this is the root alone.
  const workspaceManifests = findDeclaredWorkspaceManifests(repoPath, repoFiles, packageJson);
  const scriptSources = [
    scripts,
    ...workspaceManifests.read.map((file) => readPackageScripts(join(repoPath, file))),
  ];
  const declaresScript = (name: string): boolean =>
    scriptSources.some((source) =>
      name === 'test' ? hasCredibleTestScript(source) : source.has(name),
    );
  const rootOnlyScriptsNote =
    workspaceManifests.read.length > 0
      ? workspacePackageScriptsDisclosure(repoFiles, packageJson, workspaceManifests)
      : rootOnlyPackageScriptsDisclosure(repoFiles, packageJson);
  const scriptDepth = ['test', 'lint', 'typecheck', 'build'].filter(declaresScript).length;
  // Scoped to 'ci_script_depth': computed once here and reused below for both the metric value
  // and its presentation components, so a read failure abstains the metric instead of leaving
  // the redisplayed components silently recomputed outside the tracked scope.
  const { repoCategoryHits, rootCategoryHits } = withContentReadSignal(
    'B3',
    'ci_script_depth',
    () => ({
      repoCategoryHits: CI_COMMAND_CATEGORIES.map((pattern) =>
        workflows.filter(countsAsCi(repoPath)).some((file) => fileContains(repoPath, file, pattern)),
      ),
      rootCategoryHits: mono
        ? CI_COMMAND_CATEGORIES.map((pattern) =>
            rootWorkflows
              .filter(countsAsCi(mono.root))
              .some((file) => fileContains(mono.root, file, pattern)),
          )
        : [],
    }),
  );
  const ciCommandDepth =
    repoCategoryHits.filter(Boolean).length + rootCategoryHits.filter(Boolean).length;
  const combinedDepth = scriptDepth + ciCommandDepth;

  return {
    criterionId: 'B3',
    positiveEvidence: evidence,
    findings: [],
    metrics: [
      metric(
        'ci_script_depth',
        'CI verification depth',
        combinedDepth,
        4,
        0.45,
        'signals',
        'Counts test/lint/typecheck/build package scripts plus those command categories in repository CI and, when applicable, monorepo-root CI; raw credit is capped at four.',
        'saturating_count',
        {
          components: [
            ...['test', 'lint', 'typecheck', 'build'].map((name) => ({
              label: `package script: ${name === 'typecheck' ? 'type-check' : name}`,
              count: declaresScript(name) ? 1 : 0,
            })),
            ...CI_COMMAND_CATEGORIES.map((_pattern, index) => ({
              label: `repository CI command: ${['test', 'lint', 'type-check', 'build'][index]}`,
              count: repoCategoryHits[index] ? 1 : 0,
            })),
            ...(mono
              ? CI_COMMAND_CATEGORIES.map((_pattern, index) => ({
                  label: `monorepo-root CI command: ${['test', 'lint', 'type-check', 'build'][index]}`,
                  count: rootCategoryHits[index] ? 1 : 0,
                }))
              : []),
          ],
          ...(rootOnlyScriptsNote ? { condition: rootOnlyScriptsNote } : {}),
        },
      ),
      metric(
        'default_branch_ci_depth',
        'PR-gate CI workflow count',
        defaultBranchCiCount,
        4,
        0.55,
        'workflows',
        'Counts CI workflows that target pull requests or the default branch, up to 4.',
        'saturating_count',
        b3UnshownCheckCount(unshownCheckWorkflows) > 0
          ? { condition: b3UnshownCheckCondition(unshownCheckWorkflows) }
          : undefined,
      ),
    ],
    ...(publishOnlyWorkflows.length > 0 ? { notes: b3PublishOnlyNote(publishOnlyWorkflows) } : {}),
    ...b3UnshownCheckDisclosures(unshownCheckWorkflows),
  };
}

function b3UnshownCheckDisclosures(unshown: B3UnshownCheckWorkflows): { disclosures?: string[] } {
  const sentence = b3UnshownCheckDisclosure(unshown, CRITERION_DISCLOSURE_MAX_LENGTH);
  return sentence ? { disclosures: [sentence] } : {};
}

function b3PublishOnlyNote(publishOnlyWorkflows: readonly string[]): string {
  return `${publishOnlyWorkflows.length === 1 ? '1 workflow that only publishes, releases or deploys' : `${publishOnlyWorkflows.length} workflows that only publish, release or deploy`} (no pull-request trigger and no verification command Cejel recognises) ${publishOnlyWorkflows.length === 1 ? 'is' : 'are'} not counted as CI verification: ${publishOnlyWorkflows.slice(0, 4).join(', ')}${publishOnlyWorkflows.length > 4 ? ', ...' : ''}.`.slice(0, CRITERION_NOTES_MAX_LENGTH);
}

// v27 (#517). A step that ships an artifact or changes a running environment, from a bounded
// vocabulary matched as a command or action name: package registry publishes, release creation,
// image pushes, and deploy commands. Matching is by word, never by file or job name.
const PUBLISH_OR_DEPLOY_STEP_PATTERN =
  /\b(?:npm|pnpm|yarn|bun)[ \t]+(?:npm[ \t]+)?publish\b|\bpypa\/gh-action-pypi-publish\b|\btwine[ \t]+upload\b|\b(?:uv|poetry|flit|hatch|cargo)[ \t]+publish\b|\bgem[ \t]+push\b|\bgh[ \t]+release[ \t]+create\b|\bsoftprops\/action-gh-release\b|\bgoreleaser\b|\bsemantic-release\b|\bchangesets\/action\b|\bdocker[ \t]+(?:image[ \t]+)?push\b|\bdocker\/build-push-action\b|\b(?:vercel|netlify|flyctl|fly|firebase|serverless|wrangler)[ \t]+deploy\b|\bkubectl[ \t]+apply\b|\bhelm[ \t]+upgrade\b|\bterraform[ \t]+apply\b/i;

// Verification Cejel recognises beyond the B3 command categories, used only to keep a workflow
// counted (#517): test runners invoked through a task runner or build tool, and pre-commit.
const PUBLISH_ONLY_EXTRA_VERIFICATION_PATTERN =
  /\b(?:tox|nox|pre-commit|bazel[ \t]+test|gradlew?[ \t]+(?:test|check|build)|mvnw?[ \t]+(?:verify|test|package)|make[ \t]+(?:check|test)|just[ \t]+test|cargo[ \t]+(?:clippy|check|nextest)|turbo[ \t]+(?:run[ \t]+)?test)\b|[ \t]-r[ \t]+test\b|\brun[ \t]+test\b/i;
// A pull-request (or merge-queue) trigger makes a workflow a pull-request gate whatever its steps.
// One list feeds both v27's publish-only test (a word match) and B2's trigger label (a parsed key).
const PULL_REQUEST_TRIGGERS = ['pull_request', 'pull_request_target', 'merge_group'] as const;
const PULL_REQUEST_TRIGGER_PATTERN = new RegExp(`\\b(?:${PULL_REQUEST_TRIGGERS.join('|')})\\b`);
// A job that calls a reusable workflow runs steps this file does not show.
const REUSABLE_WORKFLOW_CALL_PATTERN = /^[ \t]*uses:[ \t]*\S*\.github\/workflows\//m;

/**
 * True for a CI workflow whose job is to publish, release or deploy, and nothing else Cejel can
 * see: it has a step from PUBLISH_OR_DEPLOY_STEP_PATTERN, no pull-request trigger, no call to a
 * reusable workflow, and no test, lint, type-check or other recognised verification command. Any
 * doubt keeps the workflow counted: a workflow that verifies and then publishes is still CI, and
 * so is one whose verification Cejel does not recognise.
 */
function isPublishOnlyWorkflow(repoPath: string, file: string): boolean {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return false;
  const contents = readRepoText(fullPath, 'utf8');
  return (
    PUBLISH_OR_DEPLOY_STEP_PATTERN.test(contents) &&
    !PULL_REQUEST_TRIGGER_PATTERN.test(contents) &&
    !REUSABLE_WORKFLOW_CALL_PATTERN.test(contents) &&
    !CI_TEST_COMMAND_PATTERN.test(contents) &&
    !CI_LINT_COMMAND_PATTERN.test(contents) &&
    !CI_TYPECHECK_COMMAND_PATTERN.test(contents) &&
    !PUBLISH_ONLY_EXTRA_VERIFICATION_PATTERN.test(contents)
  );
}

// ---- B2 and B3 workflow disclosures, every rubric (presentation only) ------------------------
// B2 cited every CI file as "Pull-request CI workflow" without reading its trigger, and B3's
// PR-gate count credits a workflow on a `pull_request` token or a `main`/`master` branch filter
// without checking that it runs a check or that the branch exists. Which workflows count is a
// scoring question, left to a prospective rubric. What changes here is what the certificate says
// about the workflows it counted: B2 labels each cited file by its own trigger, and B3 names
// counted workflows Cejel did not see run a check. Nothing here feeds a metric or a finding.

/** A trigger's `branches:` filter: none, a list of literal names, or one Cejel did not read. */
export type WorkflowBranchFilter =
  | { readonly kind: 'none' }
  | { readonly kind: 'names'; readonly names: readonly string[] }
  | { readonly kind: 'unread' };

const WORKFLOW_ON_KEY_PATTERN = /^(?:on|"on"|'on'|true):(?:[ \t]|$)/;
const WORKFLOW_TRIGGER_NAME_PATTERN = /^[a-z_]+$/;

function stripYamlComment(text: string): string {
  return text.replace(/(?:^|[ \t])#.*$/, '');
}

function unquoteYamlScalar(text: string): string {
  return text.trim().replace(/^(['"])(.*)\1$/, '$2');
}

/** `[a, b]`, a bare scalar, or nothing; null for anything else (a flow mapping, an anchor). */
function yamlInlineList(text: string): string[] | null {
  const value = stripYamlComment(text).trim();
  if (value === '') return [];
  const flow = /^\[(.*)\]$/.exec(value);
  if (flow) {
    return (flow[1] ?? '')
      .split(',')
      .map(unquoteYamlScalar)
      .filter((item) => item !== '');
  }
  return /^[{&*|>]/.test(value) ? null : [unquoteYamlScalar(value)];
}

/**
 * The top-level `on:` triggers of a GitHub Actions workflow, read by indentation, with each
 * trigger's `branches:` filter. Null when there is no `on:` key or the reader cannot place what it
 * holds; every caller then claims nothing about the file's triggers.
 */
export function githubWorkflowTriggers(contents: string): Map<string, WorkflowBranchFilter> | null {
  const lines = contents.split(/\r?\n/);
  const onIndex = lines.findIndex((line) => WORKFLOW_ON_KEY_PATTERN.test(line));
  if (onIndex === -1) return null;
  const onLine = lines[onIndex] ?? '';
  const inline = yamlInlineList(onLine.slice(onLine.indexOf(':') + 1));
  if (inline === null) return null;
  const triggers = new Map<string, WorkflowBranchFilter>();
  if (inline.length > 0) {
    for (const name of inline) {
      if (!WORKFLOW_TRIGGER_NAME_PATTERN.test(name)) return null;
      triggers.set(name, { kind: 'none' });
    }
    return triggers;
  }
  const isContent = (line: string) => line.trim() !== '' && !line.trimStart().startsWith('#');
  // YAML allows a block sequence at its parent key's own indent ("compact" form), so a list of
  // trigger names may sit at column 0 under `on:`, and a trigger's or a filter's list may sit at
  // that key's indent.
  const firstIndex = lines.findIndex((line, index) => index > onIndex && isContent(line));
  if (firstIndex !== -1 && /^-[ \t]/.test(lines[firstIndex] ?? '')) {
    for (let index = firstIndex; index < lines.length; index += 1) {
      const raw = lines[index] ?? '';
      if (!isContent(raw)) continue;
      const item = /^-[ \t]+(.*)$/.exec(raw);
      if (!item) break;
      const name = unquoteYamlScalar(stripYamlComment(item[1] ?? ''));
      if (!WORKFLOW_TRIGGER_NAME_PATTERN.test(name)) return null;
      triggers.set(name, { kind: 'none' });
    }
    return triggers.size > 0 ? triggers : null;
  }
  let triggerIndent = -1;
  // True once a `name:` key is read at the trigger indent, false once a `- name` item is.
  let mappingForm: boolean | null = null;
  let current: { name: string; filter: WorkflowBranchFilter } | null = null;
  let branchesIndent = -1;
  const close = () => {
    if (current) triggers.set(current.name, current.filter);
    current = null;
    branchesIndent = -1;
  };
  for (let index = onIndex + 1; index < lines.length; index += 1) {
    const raw = lines[index] ?? '';
    if (!isContent(raw)) continue;
    const indent = lineIndent(raw);
    if (indent === 0) break;
    if (triggerIndent === -1) triggerIndent = indent;
    if (indent < triggerIndent) return null;
    if (indent === triggerIndent) {
      const item = /^[ \t]*-[ \t]+(.*)$/.exec(raw);
      // A compact sequence under a trigger key (`schedule:` then `- cron: ...`) is that trigger's
      // value, not another trigger.
      if (item && mappingForm === true) continue;
      close();
      if (item) {
        mappingForm = false;
        const name = unquoteYamlScalar(stripYamlComment(item[1] ?? ''));
        if (!WORKFLOW_TRIGGER_NAME_PATTERN.test(name)) return null;
        triggers.set(name, { kind: 'none' });
        continue;
      }
      if (mappingForm === false) return null;
      mappingForm = true;
      const key = /^[ \t]*([A-Za-z_]+):(.*)$/.exec(raw);
      if (!key || !WORKFLOW_TRIGGER_NAME_PATTERN.test(key[1] ?? '')) return null;
      const rest = stripYamlComment(key[2] ?? '').trim();
      // `push: {}` or `push: null` is an unfiltered trigger; anything else inline is not placed.
      if (rest !== '' && rest !== '{}' && rest !== 'null' && rest !== '~') return null;
      current = { name: key[1] ?? '', filter: { kind: 'none' } };
      continue;
    }
    if (!current) return null;
    const active: { name: string; filter: WorkflowBranchFilter } = current;
    if (
      branchesIndent !== -1 &&
      (indent > branchesIndent || (indent === branchesIndent && LIST_ITEM_PATTERN.test(raw)))
    ) {
      const item = /^[ \t]*-[ \t]+(.*)$/.exec(raw);
      if (!item || active.filter.kind !== 'names') {
        active.filter = { kind: 'unread' };
        continue;
      }
      active.filter = {
        kind: 'names',
        names: [...active.filter.names, unquoteYamlScalar(stripYamlComment(item[1] ?? ''))],
      };
      continue;
    }
    branchesIndent = -1;
    const filterKey = /^[ \t]*(branches|branches-ignore|tags|tags-ignore):(.*)$/.exec(raw);
    if (!filterKey) continue;
    if (filterKey[1] !== 'branches') {
      // A tag-only push or an ignore list is a filter Cejel does not evaluate.
      active.filter = { kind: 'unread' };
      continue;
    }
    const names = yamlInlineList(filterKey[2] ?? '');
    if (names === null || active.filter.kind === 'unread') {
      active.filter = { kind: 'unread' };
      continue;
    }
    active.filter = { kind: 'names', names };
    if (names.length === 0) branchesIndent = indent;
  }
  close();
  return triggers.size > 0 ? triggers : null;
}

const PULL_REQUEST_TRIGGER_NAMES: ReadonlySet<string> = new Set(PULL_REQUEST_TRIGGERS);
const PULL_REQUEST_CI_WORKFLOW_LABEL = 'Pull-request CI workflow';

const WORKFLOW_WITHOUT_PULL_REQUEST_TRIGGER_LABEL = 'CI workflow with no pull-request trigger';
const WORKFLOW_TRIGGER_NOT_READ_LABEL = 'CI workflow (trigger not read)';

/**
 * B2's citation labels for one CI file, from its own trigger, most specific first; B2 cites the
 * first that fits the evidence label limit with its count suffix. A GitHub Actions workflow with a
 * pull-request or merge-queue trigger keeps the label B2 always used; one without says so and
 * names up to three of its triggers, then fewer, then none; any other CI file, or a workflow whose
 * triggers Cejel could not read, is cited without a pull-request claim.
 */
function b2WorkflowCitationBaseLabels(repoPath: string, file: string): readonly string[] {
  if (!/^\.github\/workflows\//.test(file)) return [WORKFLOW_TRIGGER_NOT_READ_LABEL];
  const fullPath = join(repoPath, file);
  // B3's two depth signals read every CI workflow; this presentation-only re-read is attributed to
  // nothing, so it cannot make B2 abstain under any rubric.
  const triggers = isRegularFile(fullPath)
    ? githubWorkflowTriggers(withoutContentReadAttribution(() => readRepoText(fullPath, 'utf8')))
    : null;
  if (!triggers) return [WORKFLOW_TRIGGER_NOT_READ_LABEL];
  const names = [...triggers.keys()];
  if (names.some((name) => PULL_REQUEST_TRIGGER_NAMES.has(name))) {
    return [PULL_REQUEST_CI_WORKFLOW_LABEL];
  }
  const named = [3, 2, 1]
    .filter((shown) => shown <= names.length)
    .map(
      (shown) =>
        `${WORKFLOW_WITHOUT_PULL_REQUEST_TRIGGER_LABEL} (on: ${names.slice(0, shown).join(', ')}${names.length > shown ? ', ...' : ''})`,
    );
  return [...named, WORKFLOW_WITHOUT_PULL_REQUEST_TRIGGER_LABEL];
}

/** The first candidate whose full label fits; the last candidate is short enough to always fit. */
function fittedCiWorkflowCitationLabel(
  candidates: readonly string[],
  label: (baseLabel: string) => string,
): string {
  for (const candidate of candidates) {
    const full = label(candidate);
    if (full.length <= EVIDENCE_LABEL_MAX_LENGTH) return full;
  }
  return label(candidates[candidates.length - 1] ?? WORKFLOW_TRIGGER_NOT_READ_LABEL);
}

interface CheckoutBranches {
  /** The default branch: origin's HEAD when the clone records one, else the checked-out branch. */
  readonly current: string;
  readonly source: 'origin' | 'checkout';
}

/**
 * The default branch, from a checkout whose branch list Cejel can treat as complete. Null when
 * neither origin's HEAD nor a checked-out branch can be read (a detached CI checkout), and when
 * the checkout may lack branches its remote has: a shallow clone, a remote whose fetch refspecs do
 * not map every branch (a single-branch clone), or a remote with no fetched branch at all.
 */
function readCheckoutBranches(repoPath: string): CheckoutBranches | null {
  const originHead = execGit(['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'], {
    cwd: repoPath,
  });
  const originDefault = originHead.ok ? /^origin\/(.+)$/.exec(originHead.stdout.trim())?.[1] : undefined;
  const head = originDefault
    ? null
    : execGit(['symbolic-ref', '-q', '--short', 'HEAD'], { cwd: repoPath });
  const current = originDefault ?? (head?.ok ? head.stdout.trim() : '');
  if (current === '' || !checkoutHoldsEveryBranch(repoPath)) return null;
  return { current, source: originDefault ? 'origin' : 'checkout' };
}

function checkoutHoldsEveryBranch(repoPath: string): boolean {
  const shallow = execGit(['rev-parse', '--is-shallow-repository'], { cwd: repoPath });
  if (!shallow.ok || shallow.stdout.trim() !== 'false') return false;
  const remotes = execGit(['remote'], { cwd: repoPath });
  if (!remotes.ok) return false;
  const names = remotes.stdout.split('\n').map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) return true;
  const fetch = execGit(['config', '--get-regexp', '^remote\\..*\\.fetch$'], { cwd: repoPath });
  if (!fetch.ok) return false;
  const lines = fetch.stdout.split('\n');
  for (const name of names) {
    const refspecs = lines
      .filter((line) => line.startsWith(`remote.${name}.fetch `))
      .map((line) => line.slice(`remote.${name}.fetch `.length).trim());
    // A negative refspec drops branches; only `refs/heads/*` maps every one.
    if (refspecs.some((refspec) => refspec.startsWith('^'))) return false;
    if (!refspecs.some((refspec) => refspec.replace(/^\+/, '').split(':')[0] === 'refs/heads/*')) {
      return false;
    }
    const fetched = execGit(['for-each-ref', '--count=1', '--format=%(refname)', `refs/remotes/${name}/`], {
      cwd: repoPath,
    });
    if (!fetched.ok || fetched.stdout.trim() === '') return false;
  }
  return true;
}

/** True when a local or remote-tracking branch of that name exists; null when git cannot say. */
function checkoutHasBranch(repoPath: string, name: string): boolean | null {
  const refs = execGit(
    ['for-each-ref', '--count=1', '--format=%(refname)', `refs/heads/${name}`, `refs/remotes/*/${name}`],
    { cwd: repoPath },
  );
  return refs.ok ? refs.stdout.trim() !== '' : null;
}

const DEFAULT_BRANCH_NAMES = new Set(['main', 'master']);

/**
 * The default-branch name a counted workflow is confined to: every trigger is a push or
 * pull-request trigger, each carries a `branches:` filter, and together they name only `main` or
 * only `master`. Any other shape claims nothing: an unfiltered trigger, a glob, a third branch, or
 * any other trigger (schedule, workflow_dispatch, workflow_call and the rest can run the workflow
 * on the default branch whatever the filters say).
 */
function confinedDefaultBranchTarget(contents: string): string | null {
  const triggers = githubWorkflowTriggers(contents);
  if (!triggers) return null;
  const named = new Set<string>();
  for (const [name, filter] of triggers) {
    if (name !== 'push' && !PULL_REQUEST_TRIGGER_NAMES.has(name)) return null;
    if (filter.kind !== 'names' || filter.names.length === 0) return null;
    for (const branch of filter.names) named.add(branch);
  }
  if (named.size !== 1) return null;
  const [target] = [...named];
  return target && DEFAULT_BRANCH_NAMES.has(target) ? target : null;
}

// A run line that only prints or does nothing. Anything compound (a pipe, `&&`, `;`, a command
// substitution) or any other command is not claimed.
const PRINT_ONLY_RUN_LINE_PATTERN = /^(?:(?:echo|printf)(?:[ \t][^|&;`$()<>]*)?|true|:|exit[ \t]+0)$/;
const ANY_USES_STEP_PATTERN = /^[ \t]*(?:-[ \t]+)?uses:[ \t]*(\S+)/;

/**
 * True for a GitHub Actions workflow whose every step only prints text: at least one `run:` step,
 * every command line in every `run:` step matches PRINT_ONLY_RUN_LINE_PATTERN, and no `uses:`
 * other than actions/checkout. A workflow that calls any other action runs code this file does
 * not show, so it is never claimed.
 */
function isPrintOnlyWorkflow(contents: string): boolean {
  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    const uses = ANY_USES_STEP_PATTERN.exec(line);
    if (uses && !/^actions\/checkout@/.test(unquoteYamlScalar(uses[1] ?? ''))) return false;
  }
  const steps = githubActionsRunSteps(contents);
  if (steps.length === 0) return false;
  return steps.every(
    (step) =>
      step.lines.length > 0 &&
      step.lines.every((line) => {
        const command = stripYamlComment(line.text).trim();
        return command === '' || PRINT_ONLY_RUN_LINE_PATTERN.test(command);
      }) &&
      step.lines.some((line) => stripYamlComment(line.text).trim() !== ''),
  );
}

export interface B3AbsentBranchWorkflow {
  readonly path: string;
  /** The only branch its push and pull-request triggers name. */
  readonly target: string;
  /** The repository's default branch, and where Cejel read it. */
  readonly current: string;
  readonly source: 'origin' | 'checkout';
}

export interface B3UnshownCheckWorkflows {
  readonly printOnly: readonly string[];
  readonly absentBranch: readonly B3AbsentBranchWorkflow[];
}

/**
 * B3: of the workflows default_branch_ci_depth counted, those Cejel did not see run a check. Reads
 * only files that count already read.
 */
function findB3UnshownCheckWorkflows(
  root: string,
  counted: readonly string[],
  describePath: (file: string) => string = (file) => file,
): B3UnshownCheckWorkflows {
  const printOnly: string[] = [];
  const absentBranch: B3AbsentBranchWorkflow[] = [];
  // Read only when a workflow is confined to main or master, so most scans run no git here.
  let branches: CheckoutBranches | null | undefined;
  for (const file of counted.filter((path) => /^\.github\/workflows\//.test(path))) {
    const fullPath = join(root, file);
    if (!isRegularFile(fullPath)) continue;
    const contents = withoutContentReadAttribution(() => readRepoText(fullPath, 'utf8'));
    if (isPrintOnlyWorkflow(contents)) printOnly.push(describePath(file));
    const target = confinedDefaultBranchTarget(contents);
    if (!target) continue;
    if (branches === undefined) branches = readCheckoutBranches(root);
    if (
      branches &&
      DEFAULT_BRANCH_NAMES.has(branches.current) &&
      branches.current !== target &&
      checkoutHasBranch(root, target) === false
    ) {
      absentBranch.push({
        path: describePath(file),
        target,
        current: branches.current,
        source: branches.source,
      });
    }
  }
  return { printOnly, absentBranch };
}

function mergeB3UnshownCheckWorkflows(
  own: B3UnshownCheckWorkflows,
  root: B3UnshownCheckWorkflows,
): B3UnshownCheckWorkflows {
  return {
    printOnly: [...own.printOnly, ...root.printOnly],
    absentBranch: [...own.absentBranch, ...root.absentBranch],
  };
}

function b3UnshownCheckCount(unshown: B3UnshownCheckWorkflows): number {
  return new Set([...unshown.printOnly, ...unshown.absentBranch.map((entry) => entry.path)]).size;
}

/**
 * B3's disclosure, starting with WITAN_B3_UNSHOWN_CHECK_PREFIX; the certificate lists it under
 * "What was not established". `budget` is the schema's room for one disclosure.
 */
export function b3UnshownCheckDisclosure(
  unshown: B3UnshownCheckWorkflows,
  budget = Number.POSITIVE_INFINITY,
): string {
  const count = b3UnshownCheckCount(unshown);
  if (count === 0) return '';
  const tail = ` The PR-gate CI workflow count still includes ${count === 1 ? 'it' : 'them'}.`;
  const parts = (shown: number) => [
    ...(unshown.printOnly.length > 0
      ? [
          `${unshown.printOnly.slice(0, shown).join(', ')}${unshown.printOnly.length > shown ? ` and ${unshown.printOnly.length - shown} more` : ''} only print${unshown.printOnly.length === 1 ? 's' : ''} text`,
        ]
      : []),
    ...unshown.absentBranch
      .slice(0, shown)
      .map(
        (entry) =>
          `${entry.path} runs only on ${entry.target}, and ${entry.source === 'origin' ? "the clone's default branch is" : 'this checkout is on'} ${entry.current} with no ${entry.target} branch`,
      ),
    ...(unshown.absentBranch.length > shown
      ? [`${unshown.absentBranch.length - shown} more run only on a branch this checkout does not hold`]
      : []),
  ];
  for (let shown = 3; shown > 0; shown -= 1) {
    const sentence = `${WITAN_B3_UNSHOWN_CHECK_PREFIX}${parts(shown).join('; ')}.${tail}`;
    if (sentence.length <= budget) return sentence;
  }
  const countOnly = `${WITAN_B3_UNSHOWN_CHECK_PREFIX}${count} workflow${count === 1 ? '' : 's'}.${tail}`;
  return countOnly.length <= budget ? countOnly : '';
}

/** The same fact for the default_branch_ci_depth metric line (schema maximum 240). */
function b3UnshownCheckCondition(unshown: B3UnshownCheckWorkflows): string {
  const count = b3UnshownCheckCount(unshown);
  const files = [
    ...unshown.printOnly.map((path) => `${basename(path)} only prints text`),
    ...unshown.absentBranch.map((entry) => `${basename(entry.path)} runs only on ${entry.target}`),
  ];
  const lead = `includes ${count} not shown to run a check`;
  for (let shown = Math.min(files.length, 3); shown > 0; shown -= 1) {
    const condition = `${lead}: ${files.slice(0, shown).join('; ')}${files.length > shown ? '; ...' : ''}`;
    if (condition.length <= METRIC_CONDITION_MAX_LENGTH) return condition;
  }
  return lead;
}

export function auditFreshnessCommitterYearFromGitResult(
  result: GitExecResult,
  scanLimitations: Set<string>,
): string | null {
  if (!result.ok) {
    if (!isExpectedGitAbsence(result)) {
      scanLimitations.add(
        `${describeGitFailure(result.reason, 'HEAD committer-date discovery')} Cejel omitted the numeric B4 freshness year and retained only static freshness markers.`,
      );
    }
    return null;
  }
  const year = /^([0-9]{4})-/.exec(result.stdout.trim())?.[1];
  if (!year) {
    scanLimitations.add(
      'Cejel: local git HEAD committer-date discovery returned a malformed date. Cejel omitted the numeric B4 freshness year and retained only static freshness markers.',
    );
    return null;
  }
  return year;
}

function readAuditFreshnessCommitterYear(
  repoPath: string,
  scanLimitations: Set<string>,
): string | null {
  return auditFreshnessCommitterYearFromGitResult(
    execGit(['show', '-s', '--format=%cI', 'HEAD'], { cwd: repoPath }),
    scanLimitations,
  );
}

function collectB4AuditEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  generatedAt: string,
  useV19CommitYear = false,
  scanLimitations: Set<string> = new Set(),
): WitanCriterionSignalPayload | null {
  const evidence: WitanEvidencePointer[] = [];
  const auditFiles = repoFiles.filter(isAuditFile);
  // These evidence pointers are hashed from the same files audit_freshness_depth scans below —
  // an unreadable audit file belongs to that signal, not an unattributed B4-wide skip.
  // audit_artifact_depth itself is a pure file count and is unaffected either way.
  withContentReadSignal('B4', 'audit_freshness_depth', () => {
    for (const file of auditFiles.slice(0, 5)) {
      evidence.push(evidenceForRelative(repoPath, file, 'audit_log', 'Audit or changelog artifact'));
    }
  });
  if (evidence.length === 0) {
    // FIX (goal_cejel_calibration_fix_with_strict_gate_2026-07-06): originally a `null`
    // signal scored 0.0-unverified INSIDE the process-trust average, so this returns an
    // explicit not_applicable instead. A null now maps to insufficient_data (also excluded
    // — goal_cejel_b2_insufficient_data_not_zero_2026-07-10), but N/A stays correct here:
    // a repo with zero recognized audit-trail artifacts has no audit surface at all
    // (inapplicable), which is a different honest state than "had a surface, no data".
    return buildNotApplicableSignal(
      'B4',
      'No audit-trail artifact detected (CHANGELOG/CHANGES/HISTORY/NEWS/SECURITY/AUDIT/STATUS/ ' +
        'release-notes/runbook/provenance file) — B4 not applicable to this repo.',
    );
  }
  // FIX (goal_cejel_b4_archetype_gate_2026-07-11): a security-policy file (SECURITY.md and
  // its docs/*security* equivalent) is a static disclosure document, not a changelog/audit
  // trail — it carries no expectation of being kept "fresh" the way a CHANGELOG or AUDIT log
  // does. A repo whose ONLY audit-trail artifact is a security policy (e.g. ossf/scorecard,
  // which publishes release notes via GitHub Releases rather than a committed CHANGELOG) has
  // no surface B4 can actually rate: scoring audit_artifact_depth/audit_freshness_depth
  // against a lone SECURITY.md produced a false CRITICAL on Google's own supply-chain
  // auditing tool. Same archetype-aware N/A pattern as A2 (data-layer/secrets surface) and
  // A3 (deploy surface) above — reused, not reinvented. Where a genuine changelog/audit-log/
  // status/provenance artifact exists alongside (or instead of) the security policy, this
  // gate does not fire and B4 scores exactly as it always has (a stale/absent CHANGELOG is
  // still penalised — this narrows WHEN B4 applies, never HOW HARSHLY it scores).
  const freshnessRatableFiles = auditFiles.filter(isFreshnessRatableAuditFile);
  if (freshnessRatableFiles.length === 0) {
    return buildNotApplicableSignal(
      'B4',
      'Only a static security-policy artifact (e.g. SECURITY.md) was detected — no committed ' +
        'CHANGELOG/CHANGES/HISTORY/NEWS/AUDIT/STATUS/release-notes/runbook/provenance file to ' +
        'rate for an audit trail. The project may publish release history outside the ' +
        'repository (e.g. GitHub Releases). B4 has no ratable surface here; it is excluded ' +
        'rather than scored.',
    );
  }
  // Historical rubrics retain their exact scan-year behavior. Prospective v19 instead binds
  // numeric freshness to immutable HEAD committer metadata. If Git is expectedly absent or its
  // bounded read fails, v19 uses only static markers and never consults wall clock or file mtimes.
  const referenceYear = useV19CommitYear
    ? readAuditFreshnessCommitterYear(repoPath, scanLimitations)
    : String(new Date(generatedAt).getFullYear());
  const freshnessPattern = new RegExp(
    `${referenceYear ? `${referenceYear}|` : ''}recent|latest|current`,
    'i',
  );
  return {
    criterionId: 'B4',
    positiveEvidence: evidence,
    findings: [],
    metrics: [
      // Recalibrated (Phase 3 H1): max lowered from 6 to 3 and weight raised from 0.7 — a
      // well-run non-substrate repo typically carries SECURITY.md + CHANGELOG.md (2 files)
      // at most, not 6; the prior denominator meant that healthy baseline never cleared
      // half credit.
      metric(
        'audit_artifact_depth',
        'Audit artifact depth',
        auditFiles.length,
        3,
        0.8,
        'files',
        'Measures quantity of audit, security, runbook, incident, status, and changelog artifacts.',
        'saturating_count',
      ),
      // Weight lowered from 0.3 (Phase 3 H1): most CHANGELOGs/SECURITY docs carry dates
      // rather than the literal words "recent"/"latest"/"current", so this metric is a
      // minor freshness modifier, not able to drag a repo with real audit artifacts down
      // to critical on its own.
      metric(
        'audit_freshness_depth',
        'Audit freshness depth',
        withContentReadSignal('B4', 'audit_freshness_depth', () =>
          countFilesContaining(repoPath, auditFiles, freshnessPattern),
        ),
        Math.max(auditFiles.length, 1),
        0.2,
        'ratio',
        useV19CommitYear
          ? 'Credits audit artifacts that carry the scanned HEAD committer year or static freshness/current-state markers.'
          : 'Credits audit artifacts that carry freshness/current-state markers.',
      ),
    ],
  };
}

/**
 * B6 — does the codebase let an agent self-execute privileged/credentialed operations
 * (prod DB admin GRANTs, role/privilege escalation, access-control bypass), or does it
 * document and enforce that these stay human-gated? A repo that lets an agent self-execute
 * scores LOWER; a repo with no privileged-operation surface at all is not_applicable.
 */
function collectB6PrivilegedOpsGatingEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  useV39Detectors = false,
  useV21ExecutedEscalations = false,
): WitanCriterionSignalPayload | null {
  const evidence: WitanEvidencePointer[] = [];
  const findings: WitanCriterionSignalPayload['findings'] = [];

  // Both documentary credits below read only policy-shaped prose: never a changelog, an
  // experiment or calibration record, a review note, a generated report or a Cejel certificate
  // (#433; see isPolicyDocumentEvidencePath).
  const policyDocFiles = repoFiles.filter(
    (file) => /\.(md|mdx)$/i.test(file) && isPolicyDocumentEvidencePath(file),
  );
  const isPolicyDocMatching = (file: string, pattern: RegExp): boolean =>
    fileContains(repoPath, file, pattern) && !isCejelCertificateText(repoPath, file);
  // Scoped to 'human_gate_documented': feeds only that metric and the evidence anchor below.
  const humanGateDoc = withContentReadSignal('B6', 'human_gate_documented', () =>
    policyDocFiles.find((file) => isPolicyDocMatching(file, HUMAN_GATE_MARKER_PATTERN)),
  );

  const implFiles = repoFiles.filter(isImplementationFile);
  // The two credits labelled as code read only implementation evidence: never a test, fixture or
  // calibration path, and never a match that lies inside a comment (#433).
  const implementationEvidenceFiles = implFiles.filter(isImplementationEvidencePath);
  // Scoped to 'fail_closed_privilege_check'.
  const gatedPrivilegeCheckFile = withContentReadSignal('B6', 'fail_closed_privilege_check', () =>
    implementationEvidenceFiles.find(
      (file) =>
        fileMatchesOutsideComments(repoPath, file, GATED_PRIVILEGE_CHECK_PATTERN) &&
        fileMatchesOutsideComments(repoPath, file, SET_ROLE_PATTERN),
    ),
  );
  // Un-overridable kill-switch / fail-safe ordering (goal_cejel_rubric_refinement_from_lua_2026-07-06):
  // a named governance/safety toggle whose falsy state triggers an immediate guard-clause
  // return/throw, so no lower-priority config can proceed past it. Bounded, positive-only —
  // its absence never lowers the score. Scoped to 'kill_switch_fail_safe_present'.
  const killSwitchFile = withContentReadSignal('B6', 'kill_switch_fail_safe_present', () =>
    implementationEvidenceFiles.find(
      (file) =>
        fileMatchesOutsideComments(repoPath, file, KILL_SWITCH_NAME_PATTERN) &&
        fileMatchesOutsideComments(repoPath, file, KILL_SWITCH_FAIL_CLOSED_PATTERN),
    ),
  );

  // goal_cejel_calibration_fix_with_strict_gate_2026-07-06: most external repos have no
  // privileged-DB-operation surface at all, but still practice a general form of human
  // gating on sensitive changes — a CODEOWNERS file (or a documented required-review/branch-
  // protection policy) requires a human to sign off before a change to a protected path
  // merges. This is the OSS-observable analogue of "privileged operations stay human-gated";
  // credit it as (weaker) positive evidence instead of defaulting straight to not_applicable.
  const codeownersFile = repoFiles.find((file) => GITHUB_CODEOWNERS_PATH_PATTERN.test(file));
  // Scoped to 'protected_path_review_gate': codeownersFile above is filename-only.
  const reviewGateDoc = withContentReadSignal('B6', 'protected_path_review_gate', () =>
    policyDocFiles.find((file) => isPolicyDocMatching(file, REQUIRED_REVIEW_PATTERN)),
  );
  const protectedPathReviewGate = codeownersFile ?? reviewGateDoc;

  // Scoped to 'privilege_escalation_cleanliness': the whole ungated-escalation pipeline below is
  // A2's secret-matcher pattern applied to B6 — the clearest case of a finding (critical
  // severity) that genuinely depends on file content, not merely the metric. An unreadable file
  // here must abstain both the metric and any finding it could have produced, never silently
  // report "clean" from a file whose escalation grant was never seen
  // (goal_cejel_v23_instrument_all_criteria_2026-09-07).
  const { executableFiles, v21ExecutedEscalationFileSet, productionUngatedEscalationFiles } =
    withContentReadSignal('B6', 'privilege_escalation_cleanliness', () => {
      // Only files that actually execute SQL are candidates for an ungated escalation finding —
      // a runbook or doc comment that merely names the GRANT a human should run is not code
      // executing it, and is excluded below anyway once it carries the human-gate marker.
      const executable = implFiles.filter((file) => fileContains(repoPath, file, SQL_EXEC_PATTERN));
      const historicalUngated = executable.filter((file) => {
        if (useV39Detectors && !fileHasExecutedPrivilegeEscalation(repoPath, file)) return false;
        const hasEscalation =
          fileContains(repoPath, file, ROLE_MEMBERSHIP_GRANT_PATTERN) ||
          fileContains(repoPath, file, SUPERUSER_ESCALATION_PATTERN);
        if (!hasEscalation) return false;
        return !fileContains(repoPath, file, HUMAN_GATE_MARKER_PATTERN);
      });
      const v21Executed = useV21ExecutedEscalations
        ? repoFiles.filter(
            (file) =>
              isV39AuthoredProductionPath(file) &&
              (fileHasV21RawSqlEscalation(repoPath, file) ||
                (isImplementationFile(file) && fileHasV21DriverEscalation(repoPath, file))),
          )
        : [];
      const v21ExecutedSet = new Set(v21Executed);
      const ungated = [...new Set([...historicalUngated, ...v21Executed])].filter(
        (file) => !fileContains(repoPath, file, HUMAN_GATE_MARKER_PATTERN),
      );
      // A GRANT statement asserted inside a test file exercises the detector itself, not a
      // production self-execution path — exclude it from both the finding set and the
      // production cleanliness metric.
      const productionUngated = ungated.filter((file) =>
        useV39Detectors ? isV39AuthoredProductionPath(file) : !isTestOrFixturePath(file),
      );
      return {
        executableFiles: executable,
        v21ExecutedEscalationFileSet: v21ExecutedSet,
        productionUngatedEscalationFiles: productionUngated,
      };
    });

  // Each evidence pointer below is hashed from the same file its signal already read
  // successfully above — wrapped anyway so a TOCTOU re-read failure belongs to that signal
  // rather than an unattributed B6-wide skip.
  if (humanGateDoc) {
    withContentReadSignal('B6', 'human_gate_documented', () =>
      evidence.push(
        evidenceForRelative(
          repoPath,
          humanGateDoc,
          'artifact',
          'Documents privileged operations as human-executed/gated',
        ),
      ),
    );
  }
  if (gatedPrivilegeCheckFile) {
    withContentReadSignal('B6', 'fail_closed_privilege_check', () =>
      evidence.push(
        evidenceForRelative(
          repoPath,
          gatedPrivilegeCheckFile,
          'artifact',
          'Fail-closed privilege-membership check before role elevation',
        ),
      ),
    );
  }
  if (killSwitchFile) {
    withContentReadSignal('B6', 'kill_switch_fail_safe_present', () =>
      evidence.push(
        evidenceForRelative(
          repoPath,
          killSwitchFile,
          'artifact',
          'Un-overridable kill-switch / fail-safe governance toggle',
        ),
      ),
    );
  }
  if (protectedPathReviewGate) {
    // Unlike the others above, codeownersFile (when chosen over reviewGateDoc) is filename-only
    // and was never read before this point — a genuinely new read, not a re-read. The label
    // names the branch that fired (#433): a CODEOWNERS file and a policy document are different
    // evidence, and one fixed label for both asserted whichever the reader assumed.
    withContentReadSignal('B6', 'protected_path_review_gate', () =>
      evidence.push(
        evidenceForRelative(
          repoPath,
          protectedPathReviewGate,
          'artifact',
          protectedPathReviewGate === codeownersFile
            ? 'CODEOWNERS file in a location GitHub reads (protected-path review gate)'
            : 'Documented required-review/branch-protection policy',
        ),
      ),
    );
  }
  withContentReadSignal('B6', 'privilege_escalation_cleanliness', () => {
    for (const file of productionUngatedEscalationFiles.slice(0, 5)) {
      const isV21ExecutedShape = v21ExecutedEscalationFileSet.has(file);
      findings.push({
        severity: 'critical',
        summary: isV21ExecutedShape
          ? 'This file contains an authored administrative SQL statement — role-membership grant, SUPERUSER escalation, or schema-wide table privilege grant — or executes one through a direct database-driver call, and does not itself contain text matching the human-gate marker pattern.'
          : 'This file executes a role-membership GRANT or SUPERUSER escalation and does not itself contain text matching the human-gate marker pattern.',
        evidence: evidenceForRelative(
          repoPath,
          file,
          'artifact',
          isV21ExecutedShape
            ? 'Ungated authored or directly executed administrative SQL statement'
            : 'Ungated privilege-escalation statement',
        ),
      });
    }
  });

  if (evidence.length === 0 && findings.length === 0) {
    return buildNotApplicableSignal(
      'B6',
      'No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or ' +
        'documented human-gate governance) detected in this repo.',
    );
  }

  // Omitted entirely (not scored 0) when no kill-switch pattern was detected — positive-only,
  // its absence never lowers the score.
  const killSwitchMetrics: WitanCriterionMetric[] = killSwitchFile
    ? [
        metric(
          'kill_switch_fail_safe_present',
          'Un-overridable kill-switch present',
          1,
          1,
          0.15,
          'present',
          'Credits a governance/safety toggle that fails closed before any lower-priority config can override it.',
          undefined,
          {
            condition:
              'shown because a fail-closed kill switch was detected; this positive-only metric is omitted when absent',
          },
        ),
      ]
    : [];

  // goal_cejel_calibration_fix_with_strict_gate_2026-07-06: the first two metrics below
  // (human_gate_documented, fail_closed_privilege_check) are only meaningful when the repo
  // actually has SOMETHING privileged-operation-shaped to gate — a SQL-executing file, a
  // human-gate doc, or a fail-closed check. Most external repos have none of that surface at
  // all; scoring those two metrics 0 in that case would penalize a repo for not building a
  // defense against a threat it doesn't have, rather than measuring whether it gates the
  // privileged operations it DOES have. When no such surface exists, shift their weight onto
  // the two metrics that remain meaningful (cleanliness — vacuously true with nothing to be
  // unclean — and the general protected-path review-gate proxy).
  const hasPrivilegedOpsSurface =
    humanGateDoc != null ||
    gatedPrivilegeCheckFile != null ||
    executableFiles.length > 0 ||
    v21ExecutedEscalationFileSet.size > 0;

  return {
    criterionId: 'B6',
    positiveEvidence: evidence,
    findings,
    metrics: [
      ...(hasPrivilegedOpsSurface
        ? [
            metric(
              'human_gate_documented',
              'Human gate documented',
              humanGateDoc ? 1 : 0,
              1,
              0.4,
              'present',
              'Credits explicit documentation that privileged/credentialed operations are human-executed, never agent-run.',
              undefined,
              {
                condition:
                  'scored because a privileged-operation-shaped surface was detected',
              },
            ),
            metric(
              'fail_closed_privilege_check',
              'Fail-closed privilege check present',
              gatedPrivilegeCheckFile ? 1 : 0,
              1,
              0.3,
              'present',
              'Credits code that checks role membership and fails closed before elevating privilege, instead of attempting elevation blind.',
              undefined,
              {
                condition:
                  'scored because a privileged-operation-shaped surface was detected',
              },
            ),
          ]
        : []),
      metric(
        'privilege_escalation_cleanliness',
        'Privilege-escalation cleanliness',
        productionUngatedEscalationFiles.length === 0 ? 1 : 0,
        1,
        hasPrivilegedOpsSurface ? 0.3 : 0.4,
        'clean',
        useV21ExecutedEscalations
          ? 'Penalizes authored SQL containing, and direct database-driver literals executing, an administrative role grant, SUPERUSER escalation, or schema-wide table privilege grant with no documented human gate; docs, tests, and fixtures are excluded.'
          : 'Penalizes code that executes a role-membership GRANT or SUPERUSER escalation with no documented human gate (test/fixture SQL is excluded from this production-code measurement).',
      ),
      metric(
        'protected_path_review_gate',
        'Protected-path review gate',
        protectedPathReviewGate ? 1 : 0,
        1,
        hasPrivilegedOpsSurface ? 0.2 : 0.6,
        'present',
        'Credits a CODEOWNERS file where GitHub reads it (root, .github/ or docs/) or a documented ' +
          'required-review/branch-protection policy (not a changelog, record, review note or ' +
          'report) — the general OSS-observable analogue of human-gating changes to sensitive paths.',
      ),
      ...killSwitchMetrics,
    ],
    notes: useV21ExecutedEscalations
      ? 'B6 rewards documented, fail-closed human gating of privileged/credentialed operations and penalizes ungated administrative SQL contained in authored migrations or executed from direct database-driver literals.'
      : 'B6 rewards documented, fail-closed human gating of privileged/credentialed operations and penalizes ungated privilege-escalation code paths.',
  };
}

const CPP_TEST_FRAMEWORK_PATTERN =
  /<gtest\/gtest\.h>|<catch2\/|<doctest\/|<boost\/test\/|"gtest\/gtest\.h"|"catch2\//;
const CPP_TEST_MACRO_PATTERN =
  /\bTEST\s*\(|\bTEST_F\s*\(|\bTEST_CASE\s*\(|\bSECTION\s*\(|\bCATCH_|BOOST_AUTO_TEST_CASE\b|BOOST_FIXTURE_TEST_CASE\b/;
const CPP_CONTENT_SCAN_LIMIT = 150;

// ---- BEGIN canonical production-source classifier (single source of truth) ---------------
// THE ONE derived notion of "is this production code" for every content-scan detector in this
// file that anchors a finding's severity/inclusion to a file path — A2 secret scan, A2 crypto-
// timing/signing scan, B6 privilege-escalation scan, A3 deploy-entrypoint detection, and any
// future detector of the same shape. Test suites, mocks, fixtures, and examples routinely embed
// fake secrets and example dangerous statements to exercise these very detectors — flagging one
// of those paths as a live production finding is a cry-wolf false positive (cejel flagged its
// OWN test fixtures this way twice: goal_cejel_test_path_downgrade_2026-07-06, then again on the
// crypto-timing sub-rule in goal_cejel_a2_one_notion_of_production_code_2026-07-13 — the second
// time was the SAME defect one rule over, because that rule had no fixture awareness at all).
// Downgrade, never silence: the identical pattern in a real non-test path (src/, a migration, a
// workflow) still fires at full severity.
//
// NO RULE MAY DEFINE ITS OWN test-directory/fixture/spec/example PATH REGEX OUTSIDE THIS BLOCK.
// If a rule needs to know whether a path is production code, it calls isProductionSourcePath (or
// its complement isTestOrFixturePath) below — enforced by the static "Guard 3" assert in
// one-notion-of-production-code.test.ts.
const NON_PRODUCTION_DIR_PATTERN =
  /(^|\/)(__tests__|__mocks__|__fixtures__|tests?|fixtures?|testdata|e2e|cypress|examples?|samples?|demos?)(\/|$)/i;
const NON_PRODUCTION_FILE_SUFFIX_PATTERN =
  /\.(test|spec|stories)\.[^/]+$|_test\.go$|(^|\/)test_.*\.py$/i;

export function isTestOrFixturePath(path: string): boolean {
  return NON_PRODUCTION_DIR_PATTERN.test(path) || NON_PRODUCTION_FILE_SUFFIX_PATTERN.test(path);
}

function isProductionSourcePath(path: string): boolean {
  return !isTestOrFixturePath(path);
}

export function isAuthoredProductionPath(path: string): boolean {
  return isProductionSourcePath(path) && !GENERATED_OR_VENDOR_PATH_PATTERN.test(path);
}

const V39_NON_PRODUCTION_CREDENTIAL_PATH_PATTERN =
  /(^|\/)(?:docs?|documentation|e2e[-_]?tests?)(\/|$)|(^|\/)(?:test|tests)[._-][^/]+$|(^|\/)[^/]*(?:appium|e2e[-_]?tests?)[^/]*$/i;

function isV39AuthoredProductionPath(path: string): boolean {
  return isAuthoredProductionPath(path) && !V39_NON_PRODUCTION_CREDENTIAL_PATH_PATTERN.test(path);
}

// V47's failure-derived credential boundary covers semantic registries and instructional trees
// that are source-shaped but do not execute as the product. A value that resembles a credential
// inside generated bindings, localization/reference payloads, cookbook lessons, or markdown is
// review material, not evidence of a live production credential. This is deliberately versioned:
// v14 and the public default remain byte-stable.
const V47_NON_PRODUCTION_CREDENTIAL_PATH_PATTERN =
  /(^|\/)(?:auto[-_]?gen(?:erated)?|generated|i18n|locales?|cookbooks?|lessons?)(\/|$)|\.(?:md|mdx|rst|adoc)$/i;

function isV47AuthoredProductionPath(path: string): boolean {
  return (
    isV39AuthoredProductionPath(path) && !V47_NON_PRODUCTION_CREDENTIAL_PATH_PATTERN.test(path)
  );
}

// A1 asks two narrower questions than content-scan detectors do: whether a file belongs in
// the test-to-source ratio, and whether its NAME declares a test rather than support
// scaffolding. Their language-specific conventions live here too, so this remains the only
// block that owns a notion of test/fixture/example paths even though the answers differ.
const TEST_DIRECTORY_SOURCE_PATTERN = new RegExp(
  `(^|/)(?:__tests__|tests?|specs?|[^/]+(?:Tests|Specs))/(?:.*\\.)?(?:${SOURCE_LANGUAGES.flatMap((language) => language.extensions).join('|')})$`,
);
const TEST_DIRECTORY_SOURCE_PATTERN_V17 = new RegExp(
  `(^|/)(?:__tests__|tests?|specs?|[^/]+(?:Tests|Specs))/(?:.*\\.)?(?:${[
    ...SOURCE_LANGUAGES_V10.flatMap((language) => language.extensions),
    'bats',
  ].join('|')})$`,
  'i',
);

function isTestFile(file: string, rubricVersion = WITAN_RUBRIC_VERSION): boolean {
  return (
    (usesV17DetectorClosure(rubricVersion) &&
      (TEST_DIRECTORY_SOURCE_PATTERN_V17.test(file) ||
        /\.tftest\.hcl$/i.test(file) ||
        /\.bats$/i.test(file) ||
        /(^|\/)test[^/]*\.m$/i.test(file) ||
        /_test\.m$/i.test(file))) ||
    TEST_DIRECTORY_SOURCE_PATTERN.test(file) ||
    // AVA's default discovery includes test.js and test-*.js at the scanned package root.
    // Keep this root-anchored: nested files need an existing test-directory/suffix convention.
    /^test(?:-[^/]+)?\.[cm]?[jt]sx?$/.test(file) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) ||
    /(^|\/)test_.*\.py$/.test(file) ||
    /_test\.go$/.test(file) ||
    /(^|\/)test_.*\.(cpp|cc|cxx)$/.test(file) ||
    /_(test|tests)\.(cpp|cc|cxx)$/.test(file) ||
    /Tests?\.(java|kt)$/.test(file) ||
    /(_test|_spec)\.(rs|rb|php|swift|kt)$/.test(file)
  );
}

// Files whose NAME declares them to be tests (as opposed to files that merely live under a
// test/tests/spec directory). Big suites keep substantial support scaffolding next to their
// tests — Django's tests/<app>/models.py + urls.py, fixture files in Rust crates' tests/
// dirs — and counting that scaffolding as "hollow test files" misreads a mature suite the
// same way the missing-assertion-idiom bug did (Django: ~1100 of 2036 detected "test files"
// are scaffolding with no test in them).
const NAME_SHAPED_TEST_FILE_PATTERN =
  /^test(?:-[^/]+)?\.[cm]?[jt]sx?$|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)__tests__\/|(^|\/)test_[^/]*\.py$|(^|\/)tests?\.py$|_test\.go$|(^|\/)test_[^/]*\.(cpp|cc|cxx)$|_(test|tests)\.(cpp|cc|cxx)$|Tests?\.(java|kt)$|(_test|_spec)\.(rs|rb|php|swift|kt)$/;
const NAME_SHAPED_TEST_FILE_PATTERN_V17 = /\.tftest\.hcl$|\.bats$|(^|\/)test[^/]*\.m$|_test\.m$/i;

// Evidence sources (cejel #433). A positive credit names a file as evidence that a control
// exists, and the certificate cites it. Text that only DESCRIBES the control is not the control:
// cejel's own self-scan credited a fail-closed check from a test file's fixture strings, an error
// boundary from `swallowed-error.ts` and then from a code comment quoting a handler, a human gate
// from changelog prose, and a required-review policy from a calibration review note; a committed
// Cejel certificate of another repository quotes the human-gate phrase in its evidence labels.
// Not gated on rubric version: a false assertion is wrong under every rubric.
//
// Implementation evidence — a credit that names a file as the CODE implementing a control — never
// comes from a test or fixture path (the classifier above) or a calibration specimen tree. The
// match itself must also lie outside comments; that half is fileMatchesOutsideComments below.
const CALIBRATION_RECORD_DIR_PATTERN = /(^|\/)calibrations?(\/|$)/i;

function isImplementationEvidencePath(path: string): boolean {
  return isProductionSourcePath(path) && !CALIBRATION_RECORD_DIR_PATTERN.test(path);
}

// Documentary evidence — a credit that names a document as the statement of a policy — never
// comes from a changelog (it reports that something changed, often the detector itself), an
// experiment or calibration record, a review note, a generated report, or a test/fixture tree.
// A Cejel certificate is recognised by content wherever it is committed (isCejelCertificateText),
// because its evidence labels quote these very policy phrases about some other repository.
// Kept: README, SECURITY, CONTRIBUTING, governance/runbook/ADR docs and every other prose file.
const CHANGELOG_FILE_PATTERN =
  /(^|\/)(?:CHANGELOG|CHANGES|HISTORY|NEWS|RELEASE[-_]?NOTES|RELEASES)(?:\.[^/]*)?$/i;
const NON_POLICY_RECORD_DIR_PATTERN =
  /(^|\/)(?:\.changesets?|changelogs?|changelog\.d|experiments?|calibrations?|reviews|review[-_]notes?|reports)(\/|$)/i;

function isPolicyDocumentEvidencePath(path: string): boolean {
  return (
    isProductionSourcePath(path) &&
    !CHANGELOG_FILE_PATTERN.test(path) &&
    !NON_POLICY_RECORD_DIR_PATTERN.test(path)
  );
}
// ---- END canonical production-source classifier -------------------------------------------

// The Markdown certificate this tool writes (markdown.ts): its title line, then a `- Rubric:` line.
const CEJEL_CERTIFICATE_TEXT_PATTERN = /^# Cejel Trust Report\b[\s\S]*?^- Rubric: /m;

function isCejelCertificateText(repoPath: string, file: string): boolean {
  return fileContains(repoPath, file, CEJEL_CERTIFICATE_TEXT_PATTERN);
}

const TEST_RUNNER_PATTERN =
  /\b(vitest|jest|mocha|ava|tap|pytest|go test|cargo test|rspec|phpunit|gradle test|mvn test|node\s+--test|node:test)\b/i;
// A package script matching only by KEY NAME ("test") credits an npm-generated placeholder
// (`"test": "echo \"Error: no test specified\" && exit 1"`) identically to a real test suite —
// npm writes that exact placeholder into every `npm init` package.json by default, so presence
// alone is not evidence of a test capability. Requiring TEST_RUNNER_PATTERN content match here
// closes that false-assertion gap for both A1's verification_script_ratio and B3's
// ci_script_depth, which both credit a "test" package script. lint/typecheck/build carry no
// equivalent universal auto-generated placeholder, so presence remains the check for those.
function hasCredibleTestScript(scripts: Map<string, string>): boolean {
  const script = scripts.get('test');
  return script != null && TEST_RUNNER_PATTERN.test(script);
}
// Language-agnostic "CI actually runs the test suite" signal — shared by A1 (test integrity)
// and B3 (CI discipline) so a repo whose tests only run inside a CI workflow (the normal
// shape for Python/Go/Rust/Java, which have no package.json to hold an npm "test" script)
// gets credited the same as a repo with an npm test script (goal_cejel_code_trust_external_
// ecosystem_calibration_2026-07-06).
const CI_TEST_COMMAND_PATTERN =
  /\b(pytest|go\s+test|cargo\s+test|mvn\s+test|gradle\s+test|dotnet\s+test|ctest|make\s+test|jest|vitest|mocha|rspec|phpunit|pnpm\s+(?:run\s+)?test|npm\s+(?:run\s+)?test|yarn\s+(?:run\s+)?test|node\s+--test|node:test)\b|--target[=\s]+test\b/i;
// Same rationale as CI_TEST_COMMAND_PATTERN above — shared by A1 and B3 so a Python/Go/Rust
// repo whose lint/typecheck discipline only shows up as a CI command (no package.json script
// key to credit) is recognized the same as a Node repo with npm "lint"/"typecheck" scripts.
const CI_LINT_COMMAND_PATTERN = /\b(eslint|pylint|flake8|black|ruff)\b/i;
const CI_TYPECHECK_COMMAND_PATTERN = /\b(tsc|mypy|pyright)\b/i;

// ---- Scheduled product-health workflow (generalized A1 sub-signal) -----------
//
// The concept, detected by SHAPE, never by filename: does this repository run a
// cron-scheduled workflow that exercises its verification suite, and are that
// workflow's results durably published somewhere a reader could actually check —
// or only handed to an ephemeral, access-gated CI artifact? A cron-scheduled workflow that
// runs the verification suite and only uploads an ephemeral CI artifact is one recognized
// instance of the shape. A differently named
// workflow with the same shape is detected identically, while a workflow whose name
// suggests nightly health verification but lacks the shape (no schedule trigger or
// test-run command) is not flagged at all
// (goal_cejel_generalize_homefield_rule_and_rescore_protocol_2026-07-12).
const SCHEDULE_TRIGGER_PATTERN = /(^|\n)\s*schedule:\s*\r?\n\s*-\s*cron:/;
// Durable-publication markers: the workflow visibly does more than hand its result
// to an ephemeral, access-gated CI artifact — it pushes a persisted, checkable
// record (a public pages deploy, a commit back to the repo, a PR/issue comment).
const PUBLISHED_RESULT_MARKER_PATTERN =
  /actions\/deploy-pages|actions\/upload-pages-artifact|peaceiris\/actions-gh-pages|git\s+push\b|create-or-update-comment/i;
const EPHEMERAL_ARTIFACT_ONLY_PATTERN = /actions\/upload-artifact/i;
const SCHEDULED_HEALTH_PATH_PATTERN = /(?:health|smoke|monitor|status|uptime|canary)/i;
const SCHEDULED_HEALTH_INTENT_PATTERN =
  /\b(?:product[- ]?health|health check|smoke test|monitor(?:ing)?|uptime|canary|fault detection)\b/i;

const RLS_PATTERN = /row level security|enable rls|create policy|tenant[_-]?id|studio[_-]?id/i;
// DB client imports across JS/TS, Python, Go, Rust, Ruby, Java, PHP.
const DB_CLIENT_PATTERN =
  /\b(pg|mysql|mysql2|sqlite3|mongodb|mongoose|sequelize|drizzle|prisma|knex|typeorm|redis|ioredis|better-sqlite3|asyncpg|psycopg2?|sqlalchemy|pymongo|aiosqlite|database\/sql|gorm|sqlx|diesel|rusqlite|ActiveRecord|Sequel|PDO|JDBC|Hibernate)\b/i;
// Env-var read patterns across JS/TS, Python, Ruby, Go, Rust, C/C++, PHP.
// FIX 3: Multi-language — matches same set as the surface detector recognizes
// (os.environ, getenv(, std::env::, ENV[) so non-JS repos aren't penalised.
const ENV_READ_PATTERN = /process\.env\b|Deno\.env\b|os\.environ\b|getenv\s*\(|std::env::|ENV\[/;
const TENANT_SCOPE_PATTERN =
  /tenantId|tenant_id|studioId|studio_id|organizationId|org_id|workspaceId/i;
const TENANT_SCOPE_PATTERN_V10 =
  /tenantId|tenant_id|studioId|studio_id|organizationId|organization_id|org_id|accountTenantId|account_tenant_id/i;
const TENANT_SCOPE_PATTERN_V11 = /tenantId|tenant_id|accountTenantId|account_tenant_id/i;
// B6 — privileged-operation human gating (goal_privileged_op_human_gate_learn_2026-07-04).
// Doc-level: privileged ops are documented as human-executed/gated, not agent-run.
const HUMAN_GATE_MARKER_PATTERN =
  /human[- ]executed|human[- ]gated|operator[- ]run|never agent-run|agents? (?:never|does not|do not) (?:hold|execute|run) (?:prod(?:uction)?\s+)?(?:admin|db) (?:credential|privilege)/i;
// Code-level: a role-membership/administrative GRANT (as opposed to an ordinary object
// privilege grant like SELECT/INSERT/USAGE, which is routine and does not escalate a role).
const ROLE_MEMBERSHIP_GRANT_PATTERN =
  /\bGRANT\s+(?!SELECT\b|INSERT\b|UPDATE\b|DELETE\b|USAGE\b|ALL\b|EXECUTE\b|TRIGGER\b|REFERENCES\b|CREATE\b|CONNECT\b|TEMP(?:ORARY)?\b)[A-Za-z_]\w*\s+TO\b/i;
const SUPERUSER_ESCALATION_PATTERN = /\b(ALTER|CREATE)\s+(ROLE|USER)\s+\w+[^;]*\bSUPERUSER\b/i;
const BROAD_SCHEMA_TABLE_GRANT_PATTERN =
  /\bGRANT\s+ALL\s+PRIVILEGES\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\b/i;
// Marks a file that actually executes SQL (vs. one that only documents or references it).
const SQL_EXEC_PATTERN = /\.execute\s*\(|sql\.raw\s*\(/;
const EXECUTED_ESCALATION_LITERAL_PATTERN =
  /(?:\.execute|sql\.raw)\s*\(\s*(?:[rubf]+)?["'`][^"'`]{0,500}(?:GRANT\s+(?!SELECT\b|INSERT\b|UPDATE\b|DELETE\b|USAGE\b|ALL\b|EXECUTE\b|TRIGGER\b|REFERENCES\b|CREATE\b|CONNECT\b|TEMP(?:ORARY)?\b)[A-Za-z_]\w*\s+TO\b|(?:ALTER|CREATE)\s+(?:ROLE|USER)\s+\w+[^;]*\bSUPERUSER\b)/i;
const V21_DRIVER_EXECUTED_ESCALATION_PATTERN =
  /\.(?:query|execute)\s*\(\s*(?:[rubf]+)?["'`]\s*(?:GRANT\s+(?!SELECT\b|INSERT\b|UPDATE\b|DELETE\b|USAGE\b|ALL\b|EXECUTE\b|TRIGGER\b|REFERENCES\b|CREATE\b|CONNECT\b|TEMP(?:ORARY)?\b)[A-Za-z_]\w*\s+TO\b|(?:ALTER|CREATE)\s+(?:ROLE|USER)\s+\w+[^;]*\bSUPERUSER\b|GRANT\s+ALL\s+PRIVILEGES\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\b)/i;
const V21_RAW_SQL_ESCALATION_PATTERN = new RegExp(
  `(?:^|[;\\n])\\s*(?:${ROLE_MEMBERSHIP_GRANT_PATTERN.source}|${SUPERUSER_ESCALATION_PATTERN.source}|${BROAD_SCHEMA_TABLE_GRANT_PATTERN.source})`,
  'i',
);

function fileHasExecutedPrivilegeEscalation(repoPath: string, file: string): boolean {
  return fileContains(repoPath, file, EXECUTED_ESCALATION_LITERAL_PATTERN);
}

function fileHasV21DriverEscalation(repoPath: string, file: string): boolean {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return false;
  const withoutComments = stripCommentAndDocumentationExamples(
    readRepoText(fullPath, 'utf8'),
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\r\n]*/g, '');
  return V21_DRIVER_EXECUTED_ESCALATION_PATTERN.test(withoutComments);
}

function fileHasV21RawSqlEscalation(repoPath: string, file: string): boolean {
  if (!/\.sql$/i.test(file)) return false;
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return false;
  const withoutComments = readRepoText(fullPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
  return V21_RAW_SQL_ESCALATION_PATTERN.test(withoutComments);
}
// Fail-closed privilege-membership check ahead of a role elevation (see verifyAsAppRole).
const GATED_PRIVILEGE_CHECK_PATTERN = /pg_has_role\s*\(|has_role\s*\(|is not a member of/i;
const SET_ROLE_PATTERN = /\bset\s+(local\s+)?role\b/i;
// OSS-observable analogue for B6 (goal_cejel_calibration_fix_with_strict_gate_2026-07-06): a
// documented required-review / branch-protection policy, distinct from a bare CODEOWNERS file
// which is detected separately by presence alone.
const REQUIRED_REVIEW_PATTERN = /required review|branch protection|protected branch/i;
// GitHub reads CODEOWNERS only from the repository root, `.github/` and `docs/`. A file of that
// name anywhere else (`.github/workflows/CODEOWNERS`, a package directory) gates nothing (#433).
const GITHUB_CODEOWNERS_PATH_PATTERN = /^(?:\.github\/|docs\/)?CODEOWNERS$/;
const HISTORY_SECRET_SCAN_CREDENTIAL_BLOB_LIMIT = 5_000;
// v23-only: V23_KEY_SHAPED_JSON_PATH_PATTERN's bare "key" alternative also matches ordinary
// non-credential *.json basenames (sort-key.json, cache-key.json, license-key.json,
// public-key.json, ...) — a path-only heuristic can't tell those apart from a real
// service-account key export. Walked most-recent-first, a history with many such files would
// let that noise consume the whole HISTORY_SECRET_SCAN_CREDENTIAL_BLOB_LIMIT budget before an
// older genuine leak on a base-classified path (isCredentialHistoryPath) is ever reached. Paths
// that qualify ONLY through the v23 widening (not through any base check) draw from this smaller
// budget instead, so they can never crowd out the established candidate set.
const V23_PEM_WIDENED_HISTORY_BLOB_LIMIT = 500;
// Keyword may appear ANYWHERE in the identifier left of `=`/`:` (not just immediately
// before it) so `stripe_secret_key`, `myApiKey`, `access_token_value` are caught, not just
// bare `secret =` / `apiKey =` (goal_cejel_launch_hardening_combined_2026-07-06, Phase 2 FN
// #3). This deliberately over-matches identifiers like `tokenizerConfig` — that's fine,
// because looksLikeSecretValue below still requires the assigned VALUE to look
// secret-shaped before anything fires.
const SECRET_IDENTIFIER_KEYWORD_PATTERN = /secret|token|api[_-]?key|password|access[_-]?key/gi;
const SINGLE_WHITESPACE_PATTERN = /\s/u;
// Unambiguous branded secret formats — the prefix alone is enough evidence (real API keys
// use these exact vendor-specific shapes; nothing benign collides with them).
const SECRET_VALUE_BRANDED_PATTERN =
  /^(?:sk-[A-Za-z0-9_-]{24,}|sk-ant-api\d{2}-[A-Za-z0-9_-]{80,}|ghp_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{24,}|AKIA[0-9A-Z]{16}|vcp_[A-Za-z0-9_:-]{24,})$/;
// Generic (unbranded) token shape — the same charset a base64/hex checksum, JWT segment,
// or bcrypt hash also uses. Shape alone is NOT sufficient; isGenericSecretValue below also
// requires real entropy and excludes known digest lengths before treating this as a secret.
const GENERIC_SECRET_SHAPE_PATTERN = /^[A-Za-z0-9/+_-]{40,}$/;
// Digest lengths for hex-encoded MD5/SHA-1/SHA-256/SHA-512 (32/40/64/128 hex chars).
const KNOWN_HEX_DIGEST_LENGTHS = new Set([32, 40, 64, 128]);
// Byte lengths for MD5/SHA-1/SHA-224/SHA-256/SHA-384/SHA-512 once base64-decoded.
const KNOWN_DIGEST_BYTE_LENGTHS = new Set([16, 20, 28, 32, 48, 64]);

// ---- goal_cejel_rubric_refinement_from_lua_2026-07-06 -------------------------------------
// Rubric refinements surfaced by reading a well-built MIT governance library (Lua
// governance-sdk) that cejel mis-scored: honest scoping, a lean built-in test toolchain, and
// crypto/governance hygiene were treated as gaps rather than credited as positive signals.

// A5 — a doc that explicitly names what it does NOT protect against/cover is MORE
// trustworthy than one that overclaims; do not treat this honest scoping as a missing-claim
// gap. Requires an explicit heading or phrase — a bare mention of the word "limitations" in
// prose is not enough to avoid rewarding vague hedging.
const NEGATIVE_SPACE_SECTION_PATTERN =
  /^#{1,6}\s*(?:security\s+)?(?:limitations?|threat model|non-goals?|out of scope|known limitations|what this (?:library|package|tool|sdk|project) does not)/im;
const NEGATIVE_SPACE_PHRASE_PATTERN =
  /does not (?:protect|defend|guard|cover)s? against|not (?:covered|protected|defended) by this|out of scope for this (?:library|package|tool|sdk|project)/i;

// A1/B3 — a lean/built-in test toolchain (e.g. Node's built-in `node:test` runner) with no
// heavy transitive test dependency is a positive supply-chain signal, not a "missing coverage
// tool" ding — it has no separate coverage-config file by design (coverage is a CLI flag).
const LEAN_TEST_RUNNER_SCRIPT_PATTERN = /\bnode\s+(?:--test\b|--experimental-test-coverage\b)/;
const LEAN_TEST_RUNNER_IMPORT_PATTERN =
  /from\s+['"]node:test['"]|require\(\s*['"]node:test['"]\s*\)/;
const HEAVY_TEST_DEPENDENCY_NAME_PATTERN =
  /^(?:(?:jest|mocha|ava|tape|jasmine|karma|vitest|cypress|playwright)(?:$|-|\/)|@(?:vitest|playwright)\/)/i;

// A2 — bounded, conservative crypto-hygiene nudge. Only ever scored when a signing/HMAC/
// secret-comparison surface is actually detected in source; repos with no such surface are
// unaffected. Never a critical — a "nudge," not a new cry-wolf vector.
const TIMING_SAFE_COMPARE_PATTERN =
  /\btiming[-_]?safe[-_]?(?:equal|compare)\b|crypto\.timingSafeEqual\s*\(/i;
const CANONICAL_SERIALIZE_PATTERN =
  /\bcanonicalize\s*\(|\bcanonicalJson\b|\bstableStringify\s*\(|json-stable-stringify|safe-stable-stringify|\bsortKeys\s*\(/i;
const SIGN_OR_HMAC_CALL_PATTERN = /\bcreateHmac\s*\(|\bcreateSign\s*\(|\.sign\s*\(/;
// A plain ===/!== comparing a value whose identifier clearly names a crypto compare target
// (hmac/signature/mac — deliberately narrower than "secret"/"token" to avoid matching
// routine string comparisons like `type === 'secret'`), against something other than a
// literal/undefined/null (which would be an ordinary presence check, not a security compare).
// A digest name alone is not secret evidence: public content and grammar hashes use it too
// (#430). hmacDigest/signatureDigest/macDigest still match their authentication marker.
// Matched per LINE (not per file) so a real hit carries the actual line, never a fabricated
// one — see findInsecureSecretCompareLine below.
const INSECURE_SECRET_COMPARE_LINE_PATTERN =
  /\b\w*(?:hmac|signature|\bmac)\w*\s*(===|!==)\s*(?!['"`]|undefined\b|null\b)([\w.]+(?:\s*[-+]\s*\d+)?)/i;
const DEFAULT_SECRET_SENTINEL_COMPARE_LINE_PATTERN =
  /\b(?:secret|token|password|apiKey)\w*\s*(?:===|!==|==|!=)\s*[\w.]*default(?:Secret|Token|Password|ApiKey)\b/i;
// The rule must establish a plausible secret VALUE, never merely a secret-shaped NAME: a
// numeric-shaped right-hand operand — a bare number, a `.length`/`.size`/`.count` read, or an
// index/offset-named identifier — can never itself be a timing-leak-relevant secret value (it
// is a bounds check, e.g. `dotIndex === token.length - 1`, not a credential compare) and must
// never fire, however secret-shaped the left-hand identifier looks
// (goal_cejel_a2_one_notion_of_production_code_2026-07-13).
const NUMERIC_SHAPED_OPERAND_PATTERN =
  /^-?\d+$|\.(?:length|len|size|count)\b|(?:length|index|idx|offset|count|size|len)$/i;

function lineHasInsecureSecretCompare(line: string, useV39Detectors = false): boolean {
  if (useV39Detectors && DEFAULT_SECRET_SENTINEL_COMPARE_LINE_PATTERN.test(line)) return true;
  const match = INSECURE_SECRET_COMPARE_LINE_PATTERN.exec(line);
  const operand = match?.[2];
  if (!operand) return false;
  return !NUMERIC_SHAPED_OPERAND_PATTERN.test(operand.trim());
}

// Returns the real 1-based line of the first insecure comparison in the file, or null when
// none is found — never a fabricated position (D4: a position rendered where none was
// measured).
function findInsecureSecretCompareLine(
  repoPath: string,
  file: string,
  useV39Detectors = false,
): number | null {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return null;
  const contents = readRepoText(fullPath, 'utf8');
  const lines = contents.split('\n');
  const index = lines.findIndex((line) => lineHasInsecureSecretCompare(line, useV39Detectors));
  const keyedDigestLine = findKeyedHmacDigestCompareLine(file, contents);
  if (keyedDigestLine === null) return index === -1 ? null : index + 1;
  return index === -1 ? keyedDigestLine : Math.min(index + 1, keyedDigestLine);
}

// A value named `digest` is secret when the same file computes it with a keyed HMAC, not because
// of its name (goal_cejel_v26_hmac_digest_compare_2026-10-14). #430 dropped the bare name from the
// line pattern above; this restores the HMAC case by binding the compared identifier to what
// produced it, under every rubric. Shapes, each from the runtime's documentation:
//   Node    createHmac(algorithm, key[, options]) … .digest([encoding])  (nodejs.org/api/crypto.html)
//   Web     crypto.subtle.sign(algorithm, key, data), algorithm 'HMAC' or { name: 'HMAC' }  (MDN)
//   Python  hmac.new(key, msg, digestmod) … .digest()/.hexdigest(); hmac.digest(key, msg, digest)
//   Go      hmac.New(h, key) then .Sum(b)  (pkg.go.dev/crypto/hmac)
//   Ruby    OpenSSL::HMAC.digest/.hexdigest/.base64digest(digest, key, data); HMAC.new(key, digest)
// An identifier is bound when its assignment produces a digest from a keyed HMAC directly, or reads
// one earlier HMAC binding: an HMAC object's digest method, or a value already produced. One hop,
// never a chain. A Ruby OpenSSL::HMAC instance is never bound: HMAC#== compares in constant time.
// Assignments and comparisons are read outside comments and strings, so a commented-out comparison
// or a quoted computation binds nothing. Bindings ignore scope: a same-named parameter in another
// function of the same file is read as the bound value.
interface KeyedHmacGrammar {
  /** Names a keyed HMAC computation; the key is part of each API. */
  readonly keyed: RegExp;
  /** Produces a digest value, as opposed to constructing an HMAC object. */
  readonly produces: RegExp;
  /** The digest-producing method on an HMAC object, following the object's identifier. */
  readonly objectDigestCall: string;
  readonly equality: string;
  readonly hashComments: boolean;
}

const KEYED_HMAC_GRAMMARS: readonly (readonly [RegExp, KeyedHmacGrammar])[] = [
  [
    /\.(?:ts|tsx|js|jsx)$/,
    {
      keyed:
        /\bcreateHmac\s*\(|\bsubtle\s*\.\s*sign\s*\(\s*(?:['"]HMAC['"]|\{\s*name\s*:\s*['"]HMAC['"])/,
      produces: /\.\s*digest\s*\(|\bsubtle\s*\.\s*sign\s*\(/,
      objectDigestCall: String.raw`\.\s*digest\s*\(`,
      equality: '===|!==',
      hashComments: false,
    },
  ],
  [
    /\.py$/,
    {
      keyed: /\bhmac\s*\.\s*(?:new|digest)\s*\(/,
      produces: /\.\s*(?:hex)?digest\s*\(/,
      objectDigestCall: String.raw`\.\s*(?:hex)?digest\s*\(`,
      equality: '==|!=',
      hashComments: true,
    },
  ],
  [
    /\.go$/,
    {
      keyed: /\bhmac\s*\.\s*New\s*\(/,
      produces: /\.\s*Sum\s*\(/,
      objectDigestCall: String.raw`\.\s*Sum\s*\(`,
      equality: '==|!=',
      hashComments: false,
    },
  ],
  [
    /\.rb$/,
    {
      keyed: /\bOpenSSL\s*::\s*HMAC\s*\.\s*(?:new|(?:hex|base64)?digest)\b/,
      produces: /\.\s*(?:hex|base64)?digest\b/,
      objectDigestCall: String.raw`\.\s*(?:hex|base64)?digest\b`,
      equality: '==|!=',
      hashComments: true,
    },
  ],
];

// A variable assignment: `x =`, `x :=`, `const x: T =`; never `==`, `=>`, or a property (`a.x =`).
const VARIABLE_ASSIGNMENT_PATTERN =
  /(?<![\w$.])([A-Za-z_$][\w$]*)(?:\s*:\s*[A-Za-z_$][\w$.<>[\]]*)?\s*:?=(?![=>])/g;
const ASSIGNED_EXPRESSION_MAX_CHARS = 512;

// End of the expression assigned at `start`: a `;`, `,` or unmatched closing bracket at depth 0, or
// a line break at depth 0 not followed by a `.` chain continuation. Read on masked code.
function assignedExpressionEnd(code: string, start: number): number {
  const limit = Math.min(code.length, start + ASSIGNED_EXPRESSION_MAX_CHARS);
  let depth = 0;
  for (let i = start; i < limit; i += 1) {
    const ch = code[i]!;
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) return i;
      depth -= 1;
    } else if (depth === 0 && (ch === ';' || ch === ',')) return i;
    else if (depth === 0 && ch === '\n' && !/^\s*\./.test(code.slice(i + 1, i + 65))) return i;
  }
  return limit;
}

const escapeIdentifier = (identifier: string) => identifier.replace(/\$/g, '\\$');

function findKeyedHmacDigestCompareLine(file: string, contents: string): number | null {
  const grammar = KEYED_HMAC_GRAMMARS.find(([extension]) => extension.test(file))?.[1];
  if (!grammar || !/digest/i.test(contents) || !grammar.produces.test(contents)) return null;
  const { commentFree, code } = maskCommentsAndStrings(contents, grammar.hashComments);
  // A match counts only where it starts in code, never inside a string literal. The text searched
  // keeps strings, so `subtle.sign('HMAC', …)` still reads its quoted algorithm name.
  const startsInCode = (pattern: RegExp, from: number, to: number) => {
    for (const match of commentFree.slice(from, to).matchAll(new RegExp(pattern.source, 'g'))) {
      if (code[from + match.index!] === commentFree[from + match.index!]) return true;
    }
    return false;
  };

  // Earliest offset at which each identifier holds a keyed HMAC digest.
  const boundAt = new Map<string, number>();
  const hmacValues: string[] = [];
  const hmacObjects: string[] = [];
  for (const assignment of code.matchAll(VARIABLE_ASSIGNMENT_PATTERN)) {
    const name = assignment[1]!;
    const start = assignment.index! + assignment[0].length;
    const end = assignedExpressionEnd(code, start);
    const keyed = startsInCode(grammar.keyed, start, end);
    let bound = false;
    if (keyed && startsInCode(grammar.produces, start, end)) {
      hmacValues.push(name);
      bound = true;
    } else if (keyed) {
      hmacObjects.push(name);
    } else {
      bound =
        hmacValues.some((value) =>
          startsInCode(new RegExp(`(?<![\\w$.])${escapeIdentifier(value)}(?![\\w$])`), start, end),
        ) ||
        hmacObjects.some((object) =>
          startsInCode(
            new RegExp(`(?<![\\w$.])${escapeIdentifier(object)}\\s*${grammar.objectDigestCall}`),
            start,
            end,
          ),
        );
    }
    if (bound && !boundAt.has(name)) boundAt.set(name, assignment.index!);
  }
  if (boundAt.size === 0) return null;

  const comparison = new RegExp(
    `(?<![\\w$.])([A-Za-z_$][\\w$]*)\\s*(?:${grammar.equality})(?!=)\\s*` +
      `(?!['"\`]|undefined\\b|null\\b|None\\b|nil\\b)([\\w.]+(?:\\s*[-+]\\s*\\d+)?)`,
    'g',
  );
  for (const match of commentFree.matchAll(comparison)) {
    const at = match.index!;
    const name = match[1]!;
    if (code[at] !== commentFree[at] || !/digest/i.test(name)) continue;
    const assignedAt = boundAt.get(name);
    if (assignedAt === undefined || assignedAt > at) continue;
    if (NUMERIC_SHAPED_OPERAND_PATTERN.test(match[2]!.trim())) continue;
    return contents.slice(0, at).split('\n').length;
  }
  return null;
}

// Real 1-based line of the first line matching pattern, or null when the file-level match
// (already confirmed via fileContains against the whole content) does not resolve to any single
// line — e.g. a match spanning a line break. Honest null, never a fabricated fallback.
function findFirstMatchingLine(repoPath: string, file: string, pattern: RegExp): number | null {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return null;
  const lines = readRepoText(fullPath, 'utf8').split('\n');
  const index = lines.findIndex((line) => pattern.test(line));
  return index === -1 ? null : index + 1;
}

function lineAt(repoPath: string, file: string, line: number): string | null {
  if (line < 1) return null;
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return null;
  return readRepoText(fullPath, 'utf8').split('\n')[line - 1] ?? null;
}
// Signing/HMAC-ing a bare JSON.stringify(...) call with no canonicalization step in the same
// file — the "sign-over-unsorted-JSON" gap named in the goal.
const UNSORTED_JSON_SIGN_PATTERN =
  /\.update\s*\(\s*JSON\.stringify\s*\(|\.sign\s*\([^)]*JSON\.stringify\s*\(/;
const UNSORTED_JSON_DIRECT_SIGN_PATTERN = /\.sign\s*\([^)]*JSON\.stringify\s*\(/;
const UNSORTED_JSON_CONSTRUCTOR_UPDATE_PATTERN =
  /\bcreate(?:Hmac|Sign)\s*\([^;\n]{0,256}\)\s*\.update\s*\(\s*JSON\.stringify\s*\(/;
const JSON_STRINGIFY_ASSIGNMENT_PATTERN =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*JSON\.stringify\s*\(/g;

function findUnsortedJsonHmacLine(repoPath: string, file: string): number | null {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return null;
  const contents = readRepoText(fullPath, 'utf8');
  const directSign = findFirstMatchingLine(repoPath, file, UNSORTED_JSON_DIRECT_SIGN_PATTERN);
  if (directSign !== null) return directSign;
  const directConstructorUpdate = findFirstMatchingLine(
    repoPath,
    file,
    UNSORTED_JSON_CONSTRUCTOR_UPDATE_PATTERN,
  );
  if (directConstructorUpdate !== null) return directConstructorUpdate;
  JSON_STRINGIFY_ASSIGNMENT_PATTERN.lastIndex = 0;
  let match = JSON_STRINGIFY_ASSIGNMENT_PATTERN.exec(contents);
  while (match !== null) {
    const identifier = match[1];
    if (identifier) {
      const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const constructorUpdate = new RegExp(
        `\\bcreate(?:Hmac|Sign)\\s*\\([^;\\n]{0,256}\\)\\s*\\.update\\s*\\(\\s*${escaped}\\b`,
      );
      // Search only the bounded forward-use window for each assignment. Testing the complete
      // file once per JSON.stringify assignment would become quadratic on generated input.
      const usageWindow = contents.slice(match.index, match.index + 2_048);
      if (constructorUpdate.test(usageWindow)) {
        return contents.slice(0, match.index).split('\n').length;
      }
    }
    match = JSON_STRINGIFY_ASSIGNMENT_PATTERN.exec(contents);
  }
  return null;
}

function fileHasVariableUnsortedJsonHmac(repoPath: string, file: string): boolean {
  return findUnsortedJsonHmacLine(repoPath, file) !== null;
}

// B6 — an un-overridable kill-switch / fail-safe governance toggle: a named safety toggle
// whose absence/false state triggers an immediate guard-clause return/throw, so no
// lower-priority config can proceed past it.
// Positive-only: absence of this pattern never lowers a score, it simply omits the credit.
const KILL_SWITCH_NAME_FRAGMENT =
  'kill[_-]?switch|emergency[_-]?stop|circuit[_-]?breaker|safety[_-]?(?:toggle|gate|switch)|governance[_-]?(?:toggle|gate)';
const KILL_SWITCH_NAME_PATTERN = new RegExp(`\\b(?:${KILL_SWITCH_NAME_FRAGMENT})\\b`, 'i');
const KILL_SWITCH_FAIL_CLOSED_PATTERN = new RegExp(
  `if\\s*\\(\\s*!\\s*[\\w.]*?(?:${KILL_SWITCH_NAME_FRAGMENT})[\\w.]*?\\s*\\)\\s*\\{?\\s*(?:return|throw)`,
  'i',
);

function shannonEntropyPerChar(value: string): number {
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function hasMixedCharacterClasses(value: string): boolean {
  const classCount = [/[a-z]/, /[A-Z]/, /[0-9]/, /[+/_-]/].filter((pattern) =>
    pattern.test(value),
  ).length;
  return classCount >= 3;
}

// A checksum/hash/JWT-segment is low-entropy relative to its length once you account for
// its restricted alphabet (pure hex, or a fixed-size digest) — real secrets (API keys,
// tokens) are high-entropy across the full base64/hex charset with no fixed target length.
function isLikelyDigestOrHash(value: string): boolean {
  if (/^[0-9a-fA-F]+$/.test(value) && KNOWN_HEX_DIGEST_LENGTHS.has(value.length)) return true;
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length % 4 === 0) {
    try {
      const decoded = Buffer.from(value, 'base64');
      const roundTrips = decoded.toString('base64').replace(/=+$/, '') === value.replace(/=+$/, '');
      if (roundTrips && KNOWN_DIGEST_BYTE_LENGTHS.has(decoded.length)) return true;
    } catch {
      // Not valid base64 — fall through to the entropy check below.
    }
  }
  return false;
}

function isGenericSecretValue(value: string): boolean {
  if (!GENERIC_SECRET_SHAPE_PATTERN.test(value)) return false;
  if (isLikelyDigestOrHash(value)) return false;
  if (!hasMixedCharacterClasses(value)) return false;
  return shannonEntropyPerChar(value) >= 3.5;
}

export function looksLikeSecretValue(value: string): boolean {
  return SECRET_VALUE_BRANDED_PATTERN.test(value) || isGenericSecretValue(value);
}
const PLACEHOLDER_SECRET_PATTERN =
  /(?:^|[-_])(?:your|example|sample|placeholder|dummy|changeme|replace(?:-?me)?|redacted)(?:$|[-_])|^x{3,}$|^\.\.\.|^\$\{[^}]+}$|^<[^>]+>$/i;
// A committed .env.example/.sample/.template/.dist is a TEMPLATE — the canonical safe pattern
// for documenting expected env vars, never a secret leak. Any placeholder value it carries is
// by definition not a real credential, so template paths must never be scanned as a secret
// source (current tree OR git history) — see goal_cejel_calibration_findings_precision_2026-07-06.
const ENV_TEMPLATE_PATTERN = /(^|\/)\.env(?:\.[^/]+)?\.(?:example|sample|template|dist)$/i;
const ENV_TEMPLATE_PATTERN_V47 =
  /(^|\/)\.env(?:\.[^/]+)?\.(?:example|sample|template|dist|exemplo|ejemplo|exemple|esempio|beispiel|voorbeeld)$/i;

function isEnvTemplatePath(path: string, useV47Detectors = false): boolean {
  return (useV47Detectors ? ENV_TEMPLATE_PATTERN_V47 : ENV_TEMPLATE_PATTERN).test(path);
}
const HARD_EXCLUDED_PATH_PATTERN =
  /(^|\/)(?:\.git|\.venv|venv|site-packages|node_modules|dist|build|\.next|__pycache__|vendor|\.terraform|coverage)(?:\/|$)/;
const COVERAGE_PERCENT_PATTERN =
  /(?:statements|branches|lines|functions|fail_under)\s*[:=]\s*["']?(\d+(?:\.\d+)?)/gi;

interface RepoFileInventory {
  readonly repoFiles: string[];
  readonly inventoryFiles: string[];
  readonly repoFileInventoryScope?: 'tracked-scan-eligible';
  readonly scanLimitations: string[];
}

function gitFailureDetail(reason: Exclude<GitExecResult, { readonly ok: true }>['reason']): string {
  if (reason === 'buffer_exceeded') return 'output exceeded the explicit 8 MiB limit';
  if (reason === 'timeout') return 'execution exceeded the explicit 30 second timeout';
  return 'the local Git command failed';
}

function readGitTrackedFileOutput(repoPath: string): GitExecResult {
  const workTree = execGit(['rev-parse', '--is-inside-work-tree'], { cwd: repoPath });
  if (!workTree.ok) return workTree;
  if (workTree.stdout.trim() !== 'true') return { ok: false, reason: 'not_a_repo' };
  return execGit(['ls-files', '--cached'], { cwd: repoPath });
}

function parseGitTrackedFiles(
  repoPath: string,
  output: string,
  includeHardExcluded: boolean,
  // Set only for the list the per-criterion collectors actually walk (repoFiles). The inventory
  // and monorepo-root passes list a different scope — the monorepo pass is even relative to a
  // different root — so registering their drops would offer collectors paths they were never
  // going to read, and an earned match against one of those would be a fabricated abstention.
  registerWithheld = false,
): string[] {
  const files: string[] = [];
  const withhold = (file: string, reason: ContentReadSkipReason): void => {
    if (registerWithheld) registerWithheldRepoPath(file, reason);
  };
  for (const file of output.trim().split('\n')) {
    if (file.length === 0) continue;
    const fullPath = join(repoPath, file);
    if (!includeHardExcluded && isHardExcludedPath(file)) {
      recordContentSkip(fullPath, 'denied_path', true);
      withhold(file, 'denied_path');
      continue;
    }
    try {
      const stat = lstatSync(fullPath);
      if (!stat.isFile()) {
        recordContentSkip(fullPath, 'non_regular_file', true);
        withhold(file, 'non_regular_file');
        continue;
      }
      if (stat.size > MAX_REPOSITORY_CONTENT_BYTES) {
        // Cejel's own 512,000-byte content-read ceiling, not a read failure: the skip is counted
        // and disclosed in contentReadSummary, but it must never pre-emptively abstain criteria
        // by the file's path shape before any collector has run on the files that ARE readable
        // (goal_cejel_0_4_8_abstention_scoring_fix_2026-09-08, defect 1 — a repository holding a
        // 6.3KB README that fully answers A5 was abstaining A5 anyway because two unrelated
        // oversized .txt fixtures also map to A5 by extension). Each collector decides for itself,
        // from whatever content it actually receives, whether it has enough to measure — but it
        // can only decide that about a file it knows existed, so the path is also registered as
        // withheld and a signal whose own file-selection test admits it abstains on that basis
        // alone (abstainSignalOnWithheldPaths).
        recordContentSkip(fullPath, 'too_large', true);
        withhold(file, 'too_large');
        continue;
      }
    } catch (error: unknown) {
      // deniedContext is false here, so a recorded skip is always 'unreadable' — a genuine read
      // failure of a tracked file. recordFilesystemSkip rethrows anything without an errno, so
      // reaching the next line means the skip was recorded under that reason.
      recordFilesystemSkip(fullPath, error, false, true);
      withhold(file, 'unreadable');
      continue;
    }
    if (!isPotentialContentPath(file)) {
      recordContentSkip(fullPath, 'excluded_by_extension', true);
    }
    files.push(file);
  }
  return files.sort();
}

function directoryInventory(repoPath: string): string[] {
  const files: string[] = [];
  const rootDevice = statSync(repoPath).dev;
  visitRepoDir(repoPath, repoPath, files, rootDevice);
  return files.filter((file) => !isHardExcludedPath(file)).sort();
}

function collectRepoFileInventory(repoPath: string): RepoFileInventory {
  const tracked = readGitTrackedFileOutput(repoPath);
  if (tracked.ok) {
    return {
      repoFiles: parseGitTrackedFiles(repoPath, tracked.stdout, false, true),
      inventoryFiles: parseGitTrackedFiles(repoPath, tracked.stdout, true),
      repoFileInventoryScope: 'tracked-scan-eligible',
      scanLimitations: [],
    };
  }

  const fallbackFiles = directoryInventory(repoPath);
  if (isExpectedGitAbsence(tracked)) {
    return {
      repoFiles: fallbackFiles,
      inventoryFiles: fallbackFiles,
      scanLimitations: [],
    };
  }

  return {
    repoFiles: fallbackFiles,
    inventoryFiles: fallbackFiles,
    scanLimitations: [
      `Tracked-file inventory was unavailable because ${gitFailureDetail(tracked.reason)}. Cejel used a bounded directory walk with different exclusion semantics; re-scan after the local Git failure is resolved to compare the certificate.`,
    ],
  };
}

function listRepoFiles(repoPath: string): string[] {
  return [...collectRepoFileInventory(repoPath).repoFiles];
}

function listRepoInventory(repoPath: string, fallbackFiles: readonly string[]): string[] {
  const tracked = readGitTrackedFileOutput(repoPath);
  if (tracked.ok) return parseGitTrackedFiles(repoPath, tracked.stdout, true);
  if (isExpectedGitAbsence(tracked)) return [...fallbackFiles];
  throw new Error(describeGitFailure(tracked.reason, 'tracked-file inventory'));
}

// Monorepo-root shared config that legitimately governs a sub-package but lives at
// the repo root (a lockfile, CI workflows, dependency-update config). When Witan is
// pointed at a sub-package, `git ls-files` only lists that sub-tree, so these root
// files are invisible and A4/B3 emit FALSE CRITICALS ("no lockfile", "0 CI workflows")
// even though the monorepo has them (found 2026-06-30 scoring packages/api). This
// surfaces ONLY those shared-config categories from the root — never the whole tree,
// so sub-package-scoped metrics (tests, secrets, prod-readiness) are unchanged. When
// the scan target IS the git root, this returns null and behavior is byte-identical.
interface MonorepoContext {
  readonly root: string;
  readonly sharedFiles: readonly string[];
}

function resolveMonorepoContext(
  repoPath: string,
  scanLimitations: Set<string>,
): MonorepoContext | null {
  const topResult = execGit(['rev-parse', '--show-toplevel'], { cwd: repoPath });
  if (!topResult.ok) {
    if (isExpectedGitAbsence(topResult)) return null;
    scanLimitations.add(
      `${describeGitFailure(topResult.reason, 'repository-root discovery')} Cejel continued without monorepo root-level shared configuration.`,
    );
    return null;
  }
  const top = topResult.stdout.trim();
  if (!top) return null;
  // git resolves symlinks in --show-toplevel (e.g. macOS /var -> /private/var);
  // realpath the scan path too so the prefix check below compares like with like.
  const rootResolved = resolve(top);
  const repoResolved = (() => {
    try {
      return realpathSync(repoPath);
    } catch {
      return resolve(repoPath);
    }
  })();
  // Scanning the git root itself → no augmentation → byte-identical to prior behavior.
  if (rootResolved === repoResolved) return null;
  // The scan target must be nested inside the git root.
  if (!repoResolved.startsWith(rootResolved + sep)) return null;

  const rootFiles = listGitTrackedFiles(rootResolved, scanLimitations);
  if (!rootFiles || rootFiles.length === 0) return null;

  // Sub-package path relative to the root, so we exclude files already inside the
  // sub-package (those are in repoFiles and handled by the normal collectors).
  const subRel = repoResolved
    .slice(rootResolved.length + 1)
    .split(sep)
    .join('/');
  const subPrefix = subRel ? `${subRel}/` : '';
  const sharedFiles = rootFiles.filter(
    (file) =>
      (isLockfile(file) || isCiWorkflow(file) || isDependencyUpdateConfig(file)) &&
      (subPrefix === '' || !file.startsWith(subPrefix)),
  );
  if (sharedFiles.length === 0) return null;
  return { root: rootResolved, sharedFiles };
}

function listGitTrackedFiles(
  repoPath: string,
  scanLimitations: Set<string>,
  includeHardExcluded = false,
): string[] | null {
  const tracked = readGitTrackedFileOutput(repoPath);
  if (tracked.ok) return parseGitTrackedFiles(repoPath, tracked.stdout, includeHardExcluded);
  if (isExpectedGitAbsence(tracked)) return null;
  scanLimitations.add(
    `${describeGitFailure(tracked.reason, 'monorepo shared-file inventory')} Cejel continued without monorepo root-level shared configuration.`,
  );
  return null;
}

function visitRepoDir(
  repoPath: string,
  dirPath: string,
  files: string[],
  rootDevice: number | bigint,
): void {
  // M1 (goal_cejel_launch_hardening_combined_2026-07-06, Phase 3): a non-git repo can have
  // an unreadable subdirectory (e.g. chmod 000) or a broken symlink entry; readdirSync/
  // statSync throw EACCES/ENOENT in those cases, which previously crashed the whole scan.
  // Skip the unreadable entry instead of failing the entire repo — a permissions quirk on
  // one directory should never make Cejel unusable on the rest of the tree.
  let entries: Dirent[];
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch (error: unknown) {
    recordFilesystemSkip(dirPath, error, true);
    return;
  }
  // The three skips in this loop that drop a DIRECTORY (the readdirSync catch above, the
  // skip-list name below, and the cross-device check) are deliberately not registered as withheld
  // paths. A withheld-path abstention has to be earned by running the signal's own test against
  // the path, and the contents of a directory Cejel did not descend into are unknown — no
  // predicate can establish that a signal would have matched something inside it. Registering the
  // directory itself would abstain on a path no signal was ever going to read. These remain
  // disclosed as counts in contentReadSummary; see the PR that added this comment for the
  // denied_path finding.
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (shouldSkipDir(entry.name)) {
      recordContentSkip(fullPath, 'denied_path');
      continue;
    }
    if (entry.isDirectory()) {
      try {
        if (lstatSync(fullPath, { bigint: true }).dev !== BigInt(rootDevice)) {
          recordContentSkip(fullPath, 'denied_path');
          continue;
        }
      } catch (error: unknown) {
        recordFilesystemSkip(fullPath, error);
        continue;
      }
      visitRepoDir(repoPath, fullPath, files, rootDevice);
      continue;
    }
    const repoRelativePath = relative(repoPath, fullPath);
    if (!entry.isFile()) {
      recordContentSkip(fullPath, 'non_regular_file');
      registerWithheldRepoPath(repoRelativePath, 'non_regular_file');
      continue;
    }
    let size: number;
    try {
      size = statSync(fullPath).size;
    } catch (error: unknown) {
      recordFilesystemSkip(fullPath, error);
      registerWithheldRepoPath(repoRelativePath, 'unreadable');
      continue;
    }
    if (size > MAX_REPOSITORY_CONTENT_BYTES) {
      // See the matching comment in parseGitTrackedFiles: this is Cejel's own size ceiling, not
      // a read failure, and must not pre-emptively abstain criteria by path shape — but the path
      // is registered as withheld so a signal whose own test admits it can abstain on that.
      recordContentSkip(fullPath, 'too_large');
      registerWithheldRepoPath(repoRelativePath, 'too_large');
      continue;
    }
    if (!isPotentialContentPath(repoRelativePath)) {
      recordContentSkip(fullPath, 'excluded_by_extension');
    }
    files.push(repoRelativePath);
  }
}

const CONTENT_FILE_EXTENSIONS = new Set([
  '.c', '.cc', '.cfg', '.cjs', '.cmake', '.conf', '.cpp', '.cs', '.css', '.cts', '.cxx',
  '.env', '.go', '.gradle', '.graphql', '.h', '.hpp', '.html', '.ini', '.java', '.js', '.json',
  '.json5', '.jsx', '.kt', '.kts', '.lua', '.md', '.mdx', '.mjs', '.mts', '.php', '.properties',
  '.proto', '.py', '.rb', '.rs', '.rst', '.scss', '.sh', '.sql', '.swift', '.toml', '.ts', '.tsx',
  '.txt', '.xml', '.yaml', '.yml',
]);

function isPotentialContentPath(path: string): boolean {
  const name = basename(path);
  if (CONTENT_FILE_EXTENSIONS.has(extname(name).toLowerCase())) return true;
  return (
    /^(?:Dockerfile|Makefile|Rakefile|Gemfile|Pipfile|Procfile|CMakeLists\.txt)$/i.test(name) ||
    /^\.(?:env|gitignore|npmrc|nvmrc|prettierrc|eslintrc)(?:\.|$)/i.test(name)
  );
}

function shouldSkipDir(name: string): boolean {
  return [
    '.git',
    'node_modules',
    'dist',
    'build',
    '.next',
    'coverage',
    '.venv',
    'venv',
    'site-packages',
    '__pycache__',
    '.terraform',
    'vendor',
    'target',
  ].includes(name);
}

function isHardExcludedPath(path: string): boolean {
  return HARD_EXCLUDED_PATH_PATTERN.test(path);
}

// Detect C++ test files by content for files not caught by naming conventions.
// Limited to CPP_CONTENT_SCAN_LIMIT candidates to bound I/O on large repos.
function collectContentBasedCppTestFiles(repoPath: string, repoFiles: readonly string[]): string[] {
  const candidates = repoFiles
    .filter((file) => /\.(cpp|cc|cxx)$/.test(file) && !isTestFile(file))
    .slice(0, CPP_CONTENT_SCAN_LIMIT);
  return candidates.filter((file) => {
    const fullPath = join(repoPath, file);
    if (!isRegularFile(fullPath)) return false;
    const contents = readRepoText(fullPath, 'utf8');
    return CPP_TEST_FRAMEWORK_PATTERN.test(contents) || CPP_TEST_MACRO_PATTERN.test(contents);
  });
}

function isSourceFile(file: string): boolean {
  // Exclude C/C++ headers (.h/.hpp/.hxx) from the denominator: headers are declarations,
  // not implementation units. Counting them alongside .cpp files would double the denominator
  // for C++ repos and unfairly depress the test-to-source ratio.
  return isImplementationFile(file) && !isTestFile(file) && !isCppHeader(file);
}

function isCppHeader(file: string): boolean {
  return /\.(h|hpp|hxx|h\+\+)$/.test(file);
}

// JS/TS assertion idioms (jest/vitest/mocha/chai/node:assert).
const JS_TEST_ASSERTION_PATTERN = /(expect\(|assert\.|should\.|toEqual\(|toBe\(|assert\s)/;
// C++ assertion and test-macro patterns (gtest, catch2, doctest, boost.test).
const CPP_TEST_ASSERTION_PATTERN =
  /\bEXPECT_|ASSERT_EQ\b|ASSERT_TRUE\b|ASSERT_FALSE\b|\bREQUIRE\s*\(|\bCHECK\s*\(|\bTEST\s*\(|\bTEST_F\s*\(|\bTEST_CASE\s*\(|\bSECTION\s*\(/;
// Assertion idioms for the remaining major ecosystems. The pre-2026-07-10 heuristic knew only
// the JS/TS and C++ shapes above, so a mature Python unittest suite — self.assertEqual(...) et
// al, no bare `assert ` and no expect( — counted as HOLLOW file by file (Django scored 38/2034
// non-hollow; goal_cejel_rubric_calibration_archetype_2026-07-10). Covers: Python unittest
// (.assertEqual/.assertRaises/self.fail) and pytest.raises; Go testing (t.Error/t.Fatal…) and
// testify (require.X); Rust assert!/assert_eq!/assert_ne!; JUnit/kotlin.test static-import
// assertEquals(...) via the leading \bassert[A-Z] shape; Ruby minitest assert_equal…/RSpec
// .to matchers (expect( is already matched above); PHPUnit $this->assertX.
const MULTI_ECOSYSTEM_TEST_ASSERTION_PATTERN =
  /\.assert[A-Z_]\w*\s*\(|\bassert[A-Z]\w*\s*\(|\bpytest\.raises\b|\bself\.fail\s*\(|\bt\.(?:Error|Errorf|Fatal|Fatalf|Fail|FailNow)\b|\brequire\.[A-Z]\w*\s*\(|\b(?:debug_)?assert(?:_eq|_ne)?!\s*\(|\bassert_\w+\b|\$this->assert\w+\s*\(/;
// A SUITE-LEVEL skip (describe.skip/suite.skip/context.skip) disables the whole file even when
// assertion bodies exist. Individual it.skip/test.skip markers deliberately do NOT make a file
// hollow: the pre-2026-07-10 rule disqualified an entire file with hundreds of live assertions
// for a single skipped case, which misreads mature suites.
const SUITE_LEVEL_SKIP_PATTERN = /\b(?:describe|suite|context)\.skip\s*\(/;

// AVA assertions count only in an inline, active callback registered through an imported
// AVA runner. A t.is string, comment, unrelated object, or skipped test is not a live assertion.
function hasLiveAvaAssertion(contents: string): boolean {
  const uncommented = stripJavaScriptComments(contents);
  const imports = [...uncommented.matchAll(/\bimport\s+([A-Za-z_$][\w$]*)\s+from\s*['"]ava['"]|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*['"]ava['"]\s*\)/g)];
  if (!imports.length) return false;
  // Blank string/template contents while preserving offsets and delimiters outside them.
  let quote = '';
  let escaped = false;
  const characters = uncommented.split('');
  for (let i = 0; i < characters.length; i += 1) {
    const ch = characters[i]!;
    if (quote) {
      characters[i] = ch === '\n' ? '\n' : ' ';
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      characters[i] = ' ';
    }
  }
  const code = characters.join('');
  // An import-shaped string is fixture text, not a binding. Its keyword was blanked above.
  const imported = imports.find(candidate => code[candidate.index!] === uncommented[candidate.index!]);
  const runner = imported?.[1] ?? imported?.[2];
  if (!runner) return false;
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const calls = new RegExp(`\\b${escape(runner)}((?:\\.\\w+)*)\\s*\\(`, 'g');
  const closeAt = (open: number, left: string, right: string): number => {
    let depth = 1;
    for (let i = open + 1; i < code.length; i += 1) {
      if (code[i] === left) depth += 1;
      else if (code[i] === right && --depth === 0) return i;
    }
    return -1;
  };
  for (const call of code.matchAll(calls)) {
    const modifiers = call[1]!.split('.').filter(Boolean);
    if (modifiers.some((modifier) => !['serial', 'only', 'failing'].includes(modifier))) continue;
    const open = call.index! + call[0].length - 1;
    const close = closeAt(open, '(', ')');
    if (close < 0) continue;
    const args = code.slice(open + 1, close);
    const callback = /(?:\basync\s+)?(?:\(\s*([A-Za-z_$][\w$]*)\s*\)|(?<![\w$])([A-Za-z_$][\w$]*))\s*=>|\bfunction(?:\s+\w+)?\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/.exec(args);
    const parameter = callback?.[1] ?? callback?.[2] ?? callback?.[3];
    if (!callback || !parameter) continue;
    let start = open + 1 + callback.index + callback[0].length;
    while (/\s/.test(code[start] ?? '') && start < close) start += 1;
    const end = code[start] === '{' ? closeAt(start, '{', '}') : close;
    if (end < 0 || end > close) continue;
    const assertion = new RegExp(`\\b${escape(parameter)}\\.(?:assert|pass|fail|truthy|falsy|true|false|is|not|deepEqual|notDeepEqual|throws|throwsAsync|notThrows|notThrowsAsync|regex|notRegex|snapshot|like)\\s*\\(`);
    const body = code.slice(start, end);
    const active = body.split('');
    // A nested callback/declaration may never execute or may bind a different context.
    // Credit assertions in this registered callback's own scope only.
    let maskedThrough = -1;
    for (const nested of body.matchAll(/=>\s*|\bfunction(?:\s+\w+)?\s*\([^)]*\)\s*/g)) {
      if (nested.index! < maskedThrough) continue;
      const begin = nested.index! + nested[0].length;
      let stop = begin;
      if (body[begin] === '{') {
        stop = closeAt(start + begin, '{', '}') - start + 1;
      } else {
        let depth = 0;
        while (stop < body.length) {
          const ch = body[stop]!;
          if (depth === 0 && /[;,)]/.test(ch)) break;
          if (ch === '(' || ch === '[') depth += 1;
          else if (ch === ')' || ch === ']') depth -= 1;
          stop += 1;
        }
      }
      if (stop <= begin) continue;
      for (let i = nested.index!; i < Math.min(stop, active.length); i += 1) active[i] = ' ';
      maskedThrough = stop;
    }
    if (assertion.test(active.join(''))) return true;
  }
  return false;
}

// Test frameworks the patterns above cannot read (goal_cejel_v26_test_framework_recognition_2026-10-14;
// #406). A recognition fix under every rubric. Each idiom is the framework's documented form and
// counts only in live code: outside comments and string literals, and, where the spelling is not
// the framework's own, only with the framework's import. The raw patterns above are unchanged.
//   - xUnit, NUnit, MSTest: Assert.X( / ClassicAssert / CollectionAssert / StringAssert. No import
//     gate: the xUnit and MSTest templates import their namespace project-wide (`<Using>`).
//   - XCTest: XCTAssert…( / XCTFail( / XCTUnwrap(.
//   - ScalaTest: assert( / assertThrows[ / intercept[ with an org.scalatest import; should/must
//     matchers with a ScalaTest matchers import.
//   - Kotest: shouldX matchers with an io.kotest matchers or assertions import.
//   - tape and tap: t.<assertion>( with a live tape or tap import or require.
const DOTNET_ASSERTION_PATTERN = /\b(?:Classic|Collection|String)?Assert\.[A-Z]\w*\s*(?:<[^<>()]*>\s*)?\(/;
const XCTEST_ASSERTION_PATTERN = /\bXCT(?:Assert\w*|Fail|Unwrap)\s*\(/;
const SCALATEST_IMPORT_PATTERN = /\bimport\s+org\.scalatest\b/;
const SCALATEST_ASSERTION_PATTERN = /\b(?:assert|assertResult)\s*\(|\b(?:assertThrows|intercept)\s*\[/;
const SCALATEST_MATCHERS_IMPORT_PATTERN =
  /\bimport\s+org\.scalatest\.(?:matchers\b|(?:Should|Must)?Matchers\b|_|\*|\{[^}]*\b(?:Should|Must)?Matchers\b)/;
const SCALATEST_MATCHER_PATTERN =
  /\b(?:should|must)(?:Be|Equal)\b|\b(?:should|must)\s+(?:not\s+)?(?:be|equal|have|contain|include|startWith|endWith|matchPattern)\b|\b(?:should|must)\s*===/;
const KOTEST_MATCHERS_IMPORT_PATTERN = /\bimport\s+io\.kotest\.(?:matchers|assertions)\b/;
const KOTEST_MATCHER_PATTERN = /\bshould[A-Z]\w*\b/;
const TAPE_OR_TAP_BINDING_PATTERN = /\bfrom\s*['"]tape?['"]|\brequire\s*\(\s*['"]tape?['"]\s*\)/g;
const TAPE_OR_TAP_ASSERTION_PATTERN =
  /\bt\.(?:ok|notOk|notok|true|false|assert|error|ifError|ifErr|iferror|equal|equals|isEqual|strictEqual|strictEquals|is|notEqual|notEquals|isNotEqual|doesNotEqual|isInequal|notStrictEqual|notStrictEquals|isNot|not|looseEqual|looseEquals|notLooseEqual|notLooseEquals|deepEqual|deepEquals|isEquivalent|same|notDeepEqual|notDeepEquals|notEquivalent|notDeeply|notSame|deepLooseEqual|notDeepLooseEqual|strictSame|strictNotSame|has|notHas|hasStrict|notHasStrict|match|notMatch|doesNotMatch|matchOnly|notMatchOnly|matchStrict|notMatchStrict|matchOnlyStrict|notMatchOnlyStrict|type|throws|doesNotThrow|rejects|resolves|resolveMatch|emits|pass|fail)\s*\(/;
// Framework-documented suite-level skips. NUnit and MSTest [Ignore] on the fixture class, ScalaTest
// @Ignore and Kotest @Ignored on the suite class skip every test in it. Per-test skips ([Fact(Skip
// = …)], [Ignore] on a method, ScalaTest ignore(…)) do not make a file hollow. xUnit, XCTest, tape
// and tap document no suite-level skip.
const DOTNET_IGNORED_CLASS_PATTERN =
  /\[[^[\]]*\b(?:NUnit\.Framework\.|Microsoft\.VisualStudio\.TestTools\.UnitTesting\.)?Ignore(?:Attribute)?\b[^[\]]*\](?:\s*\[[^[\]]*\])*\s*(?:(?:public|internal|private|protected|sealed|abstract|static|partial|file)\s+)*class\b/;
const SCALATEST_IGNORED_CLASS_PATTERN =
  /@(?:org\.scalatest\.)?Ignore\b(?:\s*@[\w.]+(?:\([^)]*\))?)*\s*(?:(?:final|abstract|sealed|private|protected)\s+)*class\b/;
const KOTEST_IMPORT_PATTERN = /\bimport\s+io\.kotest\b/;
const KOTEST_IGNORED_CLASS_PATTERN =
  /@(?:io\.kotest\.core\.annotation\.)?Ignored\b(?:\s*@[\w.]+(?:\([^)]*\))?)*\s*(?:(?:public|internal|private|open|abstract)\s+)*class\b/;
// Files whose name declares a test in these frameworks. Rated hollow by name only when a
// documented suite-level skip disables them: an unrecognised assertion library (FluentAssertions,
// Shouldly, specs2, …) is not evidence of a placeholder, so such a file stays out of the
// denominator, as it did before. Swift and JS conventions are absent because neither framework
// documents a suite-level skip.
const SUITE_SKIP_NAME_SHAPED_TEST_FILE_PATTERN = /Tests?\.cs$|(?:Spec|Test|Suite)\.scala$/;

interface MaskedSource {
  /** Comments blanked; string literals kept. */
  commentFree: string;
  /** Comments and string literals (with their delimiters) blanked. */
  code: string;
}

// Blank comments and string literals in C-family source (C#, Swift, Scala, Kotlin, JS), preserving
// offsets and newlines. Block comments nest (Swift, Scala, Kotlin), triple-quoted strings run to
// the next `"""`, and a C# `@"…"` verbatim string takes no backslash escapes. Where the lexing is
// wrong for a language, it blanks too much, which withholds credit rather than inventing it.
// With hashComments (Python, Ruby), `#` opens the line comment, `//` and `/*` are not comments,
// and `'''` strings run to the next `'''` as `"""` ones do.
function maskCommentsAndStrings(contents: string, hashComments = false): MaskedSource {
  const commentFree = contents.split('');
  const code = contents.split('');
  const blank = (target: string[], from: number, to: number) => {
    for (let i = from; i < to; i += 1) if (target[i] !== '\n') target[i] = ' ';
  };
  let i = 0;
  while (i < contents.length) {
    const ch = contents[i]!;
    const next = contents[i + 1];
    let end = i + 1;
    if (hashComments ? ch === '#' : ch === '/' && next === '/') {
      end = contents.indexOf('\n', i);
      if (end < 0) end = contents.length;
      blank(commentFree, i, end);
      blank(code, i, end);
    } else if (!hashComments && ch === '/' && next === '*') {
      let depth = 1;
      end = i + 2;
      while (end < contents.length && depth > 0) {
        if (contents.startsWith('/*', end)) { depth += 1; end += 2; }
        else if (contents.startsWith('*/', end)) { depth -= 1; end += 2; }
        else end += 1;
      }
      blank(commentFree, i, end);
      blank(code, i, end);
    } else if (contents.startsWith('"""', i) || (hashComments && contents.startsWith("'''", i))) {
      const close = contents.indexOf(contents.slice(i, i + 3), i + 3);
      end = close < 0 ? contents.length : close + 3;
      blank(code, i, end);
    } else if (ch === '"' || ch === "'" || ch === '`') {
      const verbatim = ch === '"' && contents[i - 1] === '@';
      end = i + 1;
      while (end < contents.length) {
        const c = contents[end]!;
        if (verbatim && c === '"' && contents[end + 1] === '"') { end += 2; continue; }
        if (!verbatim && c === '\\') { end += 2; continue; }
        end += 1;
        if (c === ch) break;
      }
      blank(code, i, end);
    }
    i = Math.max(end, i + 1);
  }
  return { commentFree: commentFree.join(''), code: code.join('') };
}

function hasLiveFrameworkAssertion({ commentFree, code }: MaskedSource): boolean {
  // An import names an idiom without using it (`import io.kotest.matchers.shouldBe`).
  const body = code.replace(/^[ \t]*import\b.*$/gm, (line) => ' '.repeat(line.length));
  if (DOTNET_ASSERTION_PATTERN.test(body) || XCTEST_ASSERTION_PATTERN.test(body)) return true;
  if (SCALATEST_IMPORT_PATTERN.test(code) && SCALATEST_ASSERTION_PATTERN.test(body)) return true;
  if (SCALATEST_MATCHERS_IMPORT_PATTERN.test(code) && SCALATEST_MATCHER_PATTERN.test(body)) return true;
  if (KOTEST_MATCHERS_IMPORT_PATTERN.test(code) && KOTEST_MATCHER_PATTERN.test(body)) return true;
  // The module name is a string literal, so the binding is read from the comment-free text; its
  // keyword must survive string blanking, or the import is itself quoted fixture text.
  const tapeBound = [...commentFree.matchAll(TAPE_OR_TAP_BINDING_PATTERN)].some(
    (binding) => code[binding.index!] === commentFree[binding.index!],
  );
  return tapeBound && TAPE_OR_TAP_ASSERTION_PATTERN.test(body);
}

function hasFrameworkSuiteLevelSkip({ code }: MaskedSource): boolean {
  return (
    DOTNET_IGNORED_CLASS_PATTERN.test(code) ||
    (SCALATEST_IMPORT_PATTERN.test(code) && SCALATEST_IGNORED_CLASS_PATTERN.test(code)) ||
    (KOTEST_IMPORT_PATTERN.test(code) && KOTEST_IGNORED_CLASS_PATTERN.test(code))
  );
}

interface NonHollowTestShare {
  /** Files containing live assertions (and not suite-level-skipped). */
  nonHollowCount: number;
  /**
   * The honest denominator: asserting files plus name-shaped test files that fail the
   * assertion check (true placeholders / skipped suites). A non-name-shaped file under a
   * test directory with no assertions is support scaffolding — excluded from the share.
   */
  ratedCount: number;
}

interface RunWideSkipOptions {
  /** True for a test file a run-wide pytest hook disables (findPytestRunWideSkips). */
  readonly disabledByRunWideSkip: (file: string) => boolean;
}

function measureNonHollowTestShare(
  repoPath: string,
  files: readonly string[],
  useV17Detectors = false,
  // witan-rubric-v27 only (#518). Absent, this function behaves exactly as it does for v17.
  runWideSkip?: RunWideSkipOptions,
): NonHollowTestShare {
  let nonHollowCount = 0;
  let ratedCount = 0;
  for (const file of files) {
    const fullPath = join(repoPath, file);
    if (!isRegularFile(fullPath)) continue;
    const contents = readRepoText(fullPath, 'utf8');
    let maskedSource: MaskedSource | undefined;
    const masked = () => (maskedSource ??= maskCommentsAndStrings(contents));
    const frameworkSuiteSkipped = /\bIgnored?\b/.test(contents) && hasFrameworkSuiteLevelSkip(masked());
    const asserting =
      JS_TEST_ASSERTION_PATTERN.test(contents) ||
      CPP_TEST_ASSERTION_PATTERN.test(contents) ||
      MULTI_ECOSYSTEM_TEST_ASSERTION_PATTERN.test(contents) ||
      hasLiveAvaAssertion(contents) ||
      hasLiveFrameworkAssertion(masked());
    // A file the run cannot execute as a test is hollow however live its assertions read: one a
    // run-wide skip disables, and (v27) a conftest.py, which pytest never collects tests from. It
    // stays where v17 rates it, so this can only lower the share, never shrink the denominator to
    // the files that still run.
    const cannotRunAsTest =
      runWideSkip !== undefined &&
      (PYTEST_CONFTEST_PATTERN.test(file) ||
        runWideSkip.disabledByRunWideSkip(file) ||
        hasUnconditionalPytestModuleSkip(file, contents));
    const nonHollow =
      asserting &&
      !SUITE_LEVEL_SKIP_PATTERN.test(contents) &&
      !frameworkSuiteSkipped &&
      !cannotRunAsTest;
    if (nonHollow) {
      nonHollowCount += 1;
      ratedCount += 1;
    } else if (
      NAME_SHAPED_TEST_FILE_PATTERN.test(file) ||
      (useV17Detectors && NAME_SHAPED_TEST_FILE_PATTERN_V17.test(file)) ||
      (frameworkSuiteSkipped && SUITE_SKIP_NAME_SHAPED_TEST_FILE_PATTERN.test(file)) ||
      (cannotRunAsTest && asserting)
    ) {
      ratedCount += 1;
    }
  }
  return { nonHollowCount, ratedCount };
}

// ---- Run-wide pytest skips (witan-rubric-v27, #518) ----------------------------------------
//
// A conftest.py is pytest's per-directory plugin: fixtures and hooks, never tests.
const PYTEST_CONFTEST_PATTERN = /(^|\/)conftest\.py$/;
// A module-level, unconditional skip of every test in the file: a top-level `pytestmark = ...`
// statement on one line naming `pytest.mark.skip`, with or without arguments, alone or in a list.
// `skipif`, and any `if` on that line (a conditional expression), is not unconditional.
const PYTEST_MODULE_SKIP_MARK_PATTERN = /\bpytest\.mark\.skip\b(?!if)/;
const PYTEST_MODULE_SKIP_ASSIGNMENT_PATTERN = /^pytestmark[ \t]*=/;

function hasUnconditionalPytestModuleSkip(file: string, contents: string): boolean {
  if (!/\.py$/.test(file)) return false;
  for (const line of contents.split('\n')) {
    if (!PYTEST_MODULE_SKIP_ASSIGNMENT_PATTERN.test(line)) continue;
    const code = stripPythonLineComment(line);
    if (/\bif\b/.test(code)) continue;
    if (PYTEST_MODULE_SKIP_MARK_PATTERN.test(code)) return true;
  }
  return false;
}

/** The line up to its first `#` (a comment start, or a `#` in a string, which only shortens it). */
function stripPythonLineComment(line: string): string {
  const hash = line.indexOf('#');
  return hash === -1 ? line : line.slice(0, hash);
}

/** A pytest test file a run-wide hook governs: a .py test file under the conftest's directory. */
function isGovernedPytestFile(skip: PytestRunWideSkip, file: string): boolean {
  if (!/\.py$/.test(file) || PYTEST_CONFTEST_PATTERN.test(file)) return false;
  return skip.scope === '' || file.startsWith(`${skip.scope}/`);
}

// Only a hook defined at the top level of conftest.py is read: one defined inside an `if`, `try`
// or other block exists only on some runs, so it is conditional too.
const PYTEST_COLLECTION_HOOK_PATTERN = /^def[ \t]+pytest_collection_modifyitems[ \t]*\(/;
// Inside the hook: any of these makes what it does depend on something, and Cejel then makes no
// claim about it.
const PYTEST_HOOK_CONDITIONAL_PATTERN =
  /^(?:if|elif|else|while|try|except|finally|with|match|case|return|break|continue|yield)\b|\bskipif\b|\bif\b/;
const PYTEST_HOOK_SKIP_EVERY_ITEM_PATTERN = /\badd_marker\s*\(\s*pytest\.mark\.skip\b(?!if)/;
const PYTEST_HOOK_FOR_EVERY_ITEM_PATTERN = /^for[ \t]+[A-Za-z_]\w*[ \t]+in[ \t]+items[ \t]*:/;
const PYTEST_HOOK_CLEAR_ITEMS_PATTERN =
  /^(?:items\.clear\(\s*\)|items\[\s*:\s*\][ \t]*=[ \t]*\[\s*\]|del[ \t]+items\[\s*:\s*\])/;
// Any statement that puts items back (`items.clear()` then `items.extend(ordered)` is how a hook
// reorders the run): the list is not left empty, so the hook is not read as removing the suite.
const PYTEST_HOOK_REFILL_ITEMS_PATTERN =
  /^items(?:[ \t]*\.[ \t]*(?:extend|append|insert)[ \t]*\(|[ \t]*\+=|[ \t]*\[[^\]]*\][ \t]*=(?!=))/;

interface PytestRunWideSkip {
  /** The conftest.py, repository-relative. */
  readonly path: string;
  /** 1-based line of the hook's `def`. */
  readonly line: number;
  /** The directory the conftest governs, '' for the repository root. */
  readonly scope: string;
  readonly kind: 'skip' | 'clear';
}

/**
 * Finds conftest.py hooks that disable every test they collect: a `pytest_collection_modifyitems`
 * whose body, with no conditional anywhere in it, either loops over `items` adding a skip marker
 * or empties the list. Anything conditional is not reported, so a hook that skips only slow tests,
 * or only on one platform, is never read as disabling the suite.
 */
function findPytestRunWideSkips(
  repoPath: string,
  repoFiles: readonly string[],
): PytestRunWideSkip[] {
  const found: PytestRunWideSkip[] = [];
  for (const file of repoFiles) {
    // Test directories are where a conftest.py lives, so only generated or vendored copies are
    // excluded here, not test paths.
    if (!PYTEST_CONFTEST_PATTERN.test(file) || GENERATED_OR_VENDOR_PATH_PATTERN.test(file)) continue;
    const fullPath = join(repoPath, file);
    if (!isRegularFile(fullPath)) continue;
    const lines = readRepoText(fullPath, 'utf8').split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (!PYTEST_COLLECTION_HOOK_PATTERN.test(lines[index] ?? '')) continue;
      const body: string[] = [];
      for (let next = index + 1; next < lines.length; next += 1) {
        const raw = lines[next] ?? '';
        const trimmed = raw.trim();
        if (trimmed === '' || trimmed.startsWith('#')) continue;
        if (raw.length === raw.trimStart().length) break;
        body.push(stripPythonLineComment(trimmed).trim());
      }
      if (body.some((statement) => PYTEST_HOOK_CONDITIONAL_PATTERN.test(statement))) continue;
      const clears = body.some((statement) => PYTEST_HOOK_CLEAR_ITEMS_PATTERN.test(statement));
      const refills = body.some(
        (statement) =>
          !PYTEST_HOOK_CLEAR_ITEMS_PATTERN.test(statement) &&
          PYTEST_HOOK_REFILL_ITEMS_PATTERN.test(statement),
      );
      const kind = clears && !refills
        ? ('clear' as const)
        : body.some((statement) => PYTEST_HOOK_FOR_EVERY_ITEM_PATTERN.test(statement)) &&
            body.some((statement) => PYTEST_HOOK_SKIP_EVERY_ITEM_PATTERN.test(statement))
          ? ('skip' as const)
          : undefined;
      if (!kind) continue;
      const scope = dirname(file);
      found.push({ path: file, line: index + 1, scope: scope === '.' ? '' : scope, kind });
      break;
    }
  }
  return found;
}

function countFilesContaining(repoPath: string, files: readonly string[], pattern: RegExp): number {
  return files.filter((file) => fileContains(repoPath, file, pattern)).length;
}

// Counts files matching ANY of several patterns, never double-counting a file that matches more
// than one — a single RegExp with an `i` flag cannot mix case-insensitive and case-sensitive
// alternatives, so a caller that needs both (e.g. case-insensitive vendor-product words plus
// case-sensitive npm package identifiers) passes them as separate patterns here instead.
function countFilesMatchingAny(
  repoPath: string,
  files: readonly string[],
  patterns: readonly RegExp[],
): number {
  return files.filter((file) => patterns.some((pattern) => fileContains(repoPath, file, pattern)))
    .length;
}

function countPatternMatches(repoPath: string, files: readonly string[], pattern: RegExp): number {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  let count = 0;

  for (const file of files) {
    const fullPath = join(repoPath, file);
    if (!isRegularFile(fullPath)) continue;
    count += [...readRepoText(fullPath, 'utf8').matchAll(matcher)].length;
  }

  return count;
}

function readCoveragePercent(repoPath: string, files: readonly string[]): number | null {
  for (const file of files) {
    const fullPath = join(repoPath, file);
    if (!isRegularFile(fullPath)) continue;
    const contents = readRepoText(fullPath, 'utf8');
    const summaryPercent = parseCoverageSummaryPercent(contents);
    if (summaryPercent !== null) return summaryPercent;
    const thresholdPercent = parseCoverageThresholdPercent(contents);
    if (thresholdPercent !== null) return thresholdPercent;
  }

  return null;
}

function parseCoverageSummaryPercent(contents: string): number | null {
  const parsed = parseJsonObject(contents);
  const total = parsed ? parsed.total : null;
  if (!isRecord(total)) return null;

  const percentages = ['statements', 'lines', 'branches', 'functions']
    .map((key) => {
      const bucket = total[key];
      if (!isRecord(bucket)) return null;
      return typeof bucket.pct === 'number' ? bucket.pct : null;
    })
    .filter((value): value is number => value !== null && value >= 0 && value <= 100);

  return averageNumbers(percentages);
}

function parseCoverageThresholdPercent(contents: string): number | null {
  const statementMatch = /statements\s*[:=]\s*["']?(\d+(?:\.\d+)?)/i.exec(contents);
  if (statementMatch?.[1]) return Number(statementMatch[1]);

  const percentages = [...contents.matchAll(COVERAGE_PERCENT_PATTERN)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);

  return averageNumbers(percentages);
}

function averageNumbers(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

interface DependencySpec {
  name: string;
  version: string;
}

// Choose the manifest that parses the most dependency specs, so evidence
// pointers and the suspicious-name check target the file that actually carries
// dependencies. Falls back to the first manifest when none parse any specs
// (preserving prior behavior), and returns undefined when there are none.
function pickPrimaryDependencyManifest(
  repoPath: string,
  manifests: readonly string[],
): string | undefined {
  let best: string | undefined;
  let bestCount = -1;
  for (const candidate of manifests) {
    const count = readDependencySpecs(repoPath, [candidate]).length;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

function readDependencySpecs(repoPath: string, manifests: readonly string[]): DependencySpec[] {
  const specs: DependencySpec[] = [];

  for (const manifest of manifests) {
    const fullPath = join(repoPath, manifest);
    if (!isRegularFile(fullPath)) continue;
    if (manifest.endsWith('package.json')) {
      specs.push(...readPackageJsonDependencySpecs(fullPath));
      continue;
    }
    if (/requirements(?:[^/]*)\.txt$/.test(manifest)) {
      specs.push(...readRequirementsDependencySpecs(fullPath));
      continue;
    }
    if (manifest.endsWith('go.mod')) {
      specs.push(...readGoModDependencySpecs(fullPath));
      continue;
    }
    if (manifest.endsWith('Cargo.toml')) {
      specs.push(...readCargoTomlDependencySpecs(fullPath));
      continue;
    }
    if (manifest.endsWith('pyproject.toml')) {
      specs.push(...readPyprojectDependencySpecs(fullPath));
      continue;
    }
    if (manifest.endsWith('Pipfile')) {
      specs.push(...readPipfileDependencySpecs(fullPath));
      continue;
    }
    if (manifest.endsWith('vcpkg.json')) {
      specs.push(...readVcpkgJsonDependencySpecs(fullPath));
      continue;
    }
    if (manifest.endsWith('conanfile.txt')) {
      specs.push(...readConanfileTxtDependencySpecs(fullPath));
      continue;
    }
    if (manifest.endsWith('conanfile.py')) {
      specs.push(...readConanfilePyDependencySpecs(fullPath));
      continue;
    }
    if (manifest.endsWith('CMakeLists.txt')) {
      specs.push(...readCMakeDependencySpecs(fullPath));
    }
  }

  return specs;
}

function readGoModDependencySpecs(path: string): DependencySpec[] {
  const specs: DependencySpec[] = [];
  const contents = readRepoText(path, 'utf8');
  // Match both block and single-line require statements
  const blockPattern = /require\s*\(([^)]+)\)/gs;
  const singlePattern = /^require\s+(\S+)\s+(\S+)/gm;

  for (const blockMatch of contents.matchAll(blockPattern)) {
    const block = blockMatch[1] ?? '';
    for (const line of block.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        specs.push({ name: parts[0] ?? trimmed, version: parts[1] ?? '' });
      }
    }
  }

  for (const singleMatch of contents.matchAll(singlePattern)) {
    specs.push({ name: singleMatch[1] ?? '', version: singleMatch[2] ?? '' });
  }

  return specs;
}

function readCargoTomlDependencySpecs(path: string): DependencySpec[] {
  const specs: DependencySpec[] = [];
  const contents = readRepoText(path, 'utf8');
  // Find [dependencies] section
  const depSectionPattern =
    /^\[(?:dependencies|dev-dependencies|build-dependencies)\]([\s\S]*?)(?=^\[|(?![\s\S]))/gm;

  for (const sectionMatch of contents.matchAll(depSectionPattern)) {
    const section = sectionMatch[1] ?? '';
    for (const line of section.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      // name = "version" or name = { version = "version", ... }
      const simpleMatch = /^(\w[\w-]*)\s*=\s*"([^"]+)"/.exec(trimmed);
      if (simpleMatch) {
        specs.push({ name: simpleMatch[1] ?? trimmed, version: simpleMatch[2] ?? '' });
        continue;
      }
      const tableMatch = /^(\w[\w-]*)\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/.exec(trimmed);
      if (tableMatch) {
        specs.push({ name: tableMatch[1] ?? trimmed, version: tableMatch[2] ?? '' });
      }
    }
  }

  return specs;
}

function readPyprojectDependencySpecs(path: string): DependencySpec[] {
  const specs: DependencySpec[] = [];
  const contents = readRepoText(path, 'utf8');
  // (?![\s\S]) is a JS-compatible end-of-string anchor (no char follows).
  // \z is not valid in JS regex (treated as literal 'z'), so we use this instead.

  // Poetry style: [tool.poetry.dependencies] / name = "^version"
  const poetrySectionPattern = /^\[tool\.poetry\.dependencies\]([\s\S]*?)(?=^\[|(?![\s\S]))/gm;
  for (const sectionMatch of contents.matchAll(poetrySectionPattern)) {
    const section = sectionMatch[1] ?? '';
    for (const line of section.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('python')) continue;
      const match = /^([\w-]+)\s*=\s*"([^"]+)"/.exec(trimmed);
      if (match) {
        specs.push({ name: match[1] ?? trimmed, version: match[2] ?? '' });
      }
    }
  }
  // PEP 621 style: [project] / dependencies = ["name>=version"]
  const pep621Pattern = /^\[project\]([\s\S]*?)(?=^\[|(?![\s\S]))/gm;
  for (const sectionMatch of contents.matchAll(pep621Pattern)) {
    const section = sectionMatch[1] ?? '';
    const depsArrayMatch = /dependencies\s*=\s*\[([\s\S]*?)\]/m.exec(section);
    if (depsArrayMatch) {
      for (const rawDep of (depsArrayMatch[1] ?? '').split(',')) {
        const dep = rawDep.replace(/["'\s]/g, '');
        if (!dep) continue;
        const nameMatch = /^([A-Za-z0-9][\w.-]*)/.exec(dep);
        const versionMatch = /([><=~!^]+[\d.]+)/.exec(dep);
        const depName = nameMatch?.[1];
        if (depName) {
          specs.push({ name: depName, version: versionMatch?.[1] ?? dep });
        }
      }
    }
  }

  return specs;
}

function readPipfileDependencySpecs(path: string): DependencySpec[] {
  const specs: DependencySpec[] = [];
  const contents = readRepoText(path, 'utf8');
  const sectionPattern = /^\[(?:packages|dev-packages)\]([\s\S]*?)(?=^\[|$(?![\s\S]))/gm;
  for (const sectionMatch of contents.matchAll(sectionPattern)) {
    for (const line of (sectionMatch[1] ?? '').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = /^([\w][\w.-]*)\s*=\s*["']?([^"'\n#]+?)["']?\s*(?:#.*)?$/.exec(trimmed);
      if (match) specs.push({ name: match[1] ?? trimmed, version: match[2]?.trim() ?? '' });
    }
  }
  return specs;
}

function readVcpkgJsonDependencySpecs(path: string): DependencySpec[] {
  const parsed = parseJsonObject(readRepoText(path, 'utf8'));
  if (!parsed) return [];
  const rawDeps = Array.isArray(parsed.dependencies) ? parsed.dependencies : [];
  const specs: DependencySpec[] = [];
  for (const dep of rawDeps) {
    if (typeof dep === 'string') {
      // No version constraint: vcpkg pins via the builtin-baseline field in vcpkg.json.
      specs.push({ name: dep, version: 'baseline' });
    } else if (isRecord(dep) && typeof dep.name === 'string') {
      // { "name": "foo", "version>=": "1.2.11" } or { "name": "foo" }
      const version =
        dep['version>='] ?? dep['version=='] ?? dep.version ?? dep['version>'] ?? 'baseline';
      specs.push({ name: dep.name, version: String(version) });
    }
  }
  return specs;
}

function readConanfileTxtDependencySpecs(path: string): DependencySpec[] {
  const specs: DependencySpec[] = [];
  const contents = readRepoText(path, 'utf8');
  const requiresMatch = /^\[requires\]([\s\S]*?)(?=^\[|$(?![\s\S]))/m.exec(contents);
  if (!requiresMatch) return specs;
  for (const line of (requiresMatch[1] ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Format: name/version or name/version@user/channel
    const match = /^([\w.\-]+)\/([\w.\-]+)/.exec(trimmed);
    if (match) specs.push({ name: match[1] ?? trimmed, version: match[2] ?? '' });
  }
  return specs;
}

function readConanfilePyDependencySpecs(path: string): DependencySpec[] {
  const specs: DependencySpec[] = [];
  const contents = readRepoText(path, 'utf8');
  // self.requires("name/version") or self.requires("name/version@user/channel")
  for (const match of contents.matchAll(/self\.requires\s*\(\s*["']([\w.\-]+)\/([\w.\-]+)["']/g)) {
    specs.push({ name: match[1] ?? '', version: match[2] ?? '' });
  }
  // requirements = ["name/version", ...]
  const listMatch = /requirements\s*=\s*\[([\s\S]*?)\]/m.exec(contents);
  if (listMatch) {
    for (const match of (listMatch[1] ?? '').matchAll(/["']([\w.\-]+)\/([\w.\-]+)["']/g)) {
      specs.push({ name: match[1] ?? '', version: match[2] ?? '' });
    }
  }
  return specs;
}

function readCMakeDependencySpecs(path: string): DependencySpec[] {
  const specs: DependencySpec[] = [];
  const contents = readRepoText(path, 'utf8');
  // find_package(Name [version] [REQUIRED ...])
  for (const match of contents.matchAll(/find_package\s*\(\s*([\w]+)(?:\s+([\d.]+))?/gi)) {
    const name = match[1];
    if (!name) continue;
    // Skip cmake-internal packages that are not real dependencies
    if (/^(Threads|PkgConfig|CMakePackageConfigHelpers|GNUInstallDirs)$/i.test(name)) continue;
    specs.push({ name, version: match[2] ?? 'find' });
  }
  // FetchContent_Declare(name ... GIT_TAG tag)
  for (const match of contents.matchAll(
    /FetchContent_Declare\s*\(\s*([\w]+)[\s\S]*?GIT_TAG\s+([\w.\-]+)/gi,
  )) {
    specs.push({ name: match[1] ?? '', version: match[2] ?? '' });
  }
  return specs;
}

function readPackageJsonDependencySpecs(packageJsonPath: string): DependencySpec[] {
  const parsed = parseJsonObject(readRepoText(packageJsonPath, 'utf8'));
  if (!parsed) return [];

  // Peer deps marked optional via peerDependenciesMeta are a declared compatibility range,
  // not installed runtime attack surface — a clean zero-runtime-dep library commonly declares
  // many of these (e.g. an optional test-framework integration). Do not count them toward the
  // pinned-dependency-ratio denominator (goal_cejel_rubric_refinement_from_lua_2026-07-06).
  const optionalPeerNames = new Set<string>();
  const peerDependenciesMeta = parsed.peerDependenciesMeta;
  if (isRecord(peerDependenciesMeta)) {
    for (const [name, meta] of Object.entries(peerDependenciesMeta)) {
      if (isRecord(meta) && meta.optional === true) optionalPeerNames.add(name);
    }
  }

  const specs: DependencySpec[] = [];
  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    const dependencies = parsed[field];
    if (!isRecord(dependencies)) continue;
    for (const [name, version] of Object.entries(dependencies)) {
      if (typeof version !== 'string') continue;
      if (field === 'peerDependencies' && optionalPeerNames.has(name)) continue;
      specs.push({ name, version });
    }
  }
  return specs;
}

function readRequirementsDependencySpecs(path: string): DependencySpec[] {
  return readRepoText(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const [name = line, version = ''] = line.split(/[<>=~!]=?/, 2);
      return { name: name.trim(), version: line.includes('==') ? version.trim() : line };
    });
}

function isPinnedDependencyVersion(version: string): boolean {
  const trimmed = version.trim();
  if (/^(workspace:|file:|link:|portal:)/.test(trimmed)) return true;
  // vcpkg baseline: packages are pinned via the builtin-baseline hash in vcpkg.json
  if (trimmed === 'baseline') return true;
  // Python exact pin: "==1.2.3" in pyproject.toml [project] dependencies array
  if (/^==\d/.test(trimmed)) return true;
  if (/^(latest|\*|x)$/i.test(trimmed)) return false;
  if (/^[~^<>=]/.test(trimmed)) return false;
  // CMake find_package without an explicit version: system-managed, not a version pin
  if (trimmed === 'find') return false;
  return /^\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?$/.test(trimmed);
}

function workflowTargetsDefaultBranch(repoPath: string, file: string): boolean {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return false;
  const contents = readRepoText(fullPath, 'utf8').toLowerCase();
  return (
    /\bpull_request\b/.test(contents) ||
    /\bbranches:\s*\[[^\]]*\b(main|master)\b[^\]]*\]/.test(contents) ||
    /\bbranches:\s*\n\s*-\s*(main|master)\b/.test(contents)
  );
}

function isPrMergeCommit(commit: GitCommitSummary): boolean {
  return /merge pull request|pull request|#\d+/i.test(commit.subject);
}

function parseJsonObject(contents: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(stripBom(contents)) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTestRunnerConfig(repoPath: string, file: string): boolean {
  return (
    /(^|\/)(vitest|jest|pytest|playwright|cypress|mocha)\.config\.[cm]?[jt]s$/.test(file) ||
    /(^|\/)(pytest\.ini|tox\.ini)$/.test(file) ||
    /(^|\/)phpunit\.xml(\.dist)?$/.test(file) ||
    (/(^|\/)pyproject\.toml$/.test(file) &&
      fileContains(repoPath, file, /^\[tool\.pytest(?:\.|\])/m)) ||
    (/(^|\/)CMakeLists\.txt$/.test(file) &&
      fileContains(repoPath, file, /\b(?:enable_testing|add_test|ctest_add_tests)\s*\(/i)) ||
    (/(^|\/)Makefile$/.test(file) && fileContains(repoPath, file, /^\s*(?:test|tests|check)\s*:/m))
  );
}

function isRecipeTestEntry(repoPath: string, file: string): boolean {
  return (
    isRecipeFile(file) && fileContains(repoPath, file, /^\s*(?:test|tests|check)\s*:/m)
  );
}

export function findCoverageConfigFiles(
  repoPath: string,
  repoFiles: readonly string[],
  authoredOnly = false,
): string[] {
  return repoFiles.filter(
    (file) => (!authoredOnly || isAuthoredProductionPath(file)) && isCoverageConfig(repoPath, file),
  );
}

export function findConcreteTestFiles(
  repoPath: string,
  repoFiles: readonly string[],
  rubricVersion = WITAN_RUBRIC_VERSION,
): string[] {
  const contentCppTests = collectContentBasedCppTestFiles(repoPath, repoFiles);
  return [
    ...repoFiles.filter((file) => isTestFile(file, rubricVersion)),
    ...contentCppTests.filter((file) => !isTestFile(file, rubricVersion)),
  ];
}

export function findConfiguredTestRunnerFiles(
  repoPath: string,
  repoFiles: readonly string[],
): string[] {
  const configured = repoFiles.filter(
    (file) => isAuthoredProductionPath(file) && isTestRunnerConfig(repoPath, file),
  );
  for (const packageJson of repoFiles.filter(
    (file) => /(^|\/)package\.json$/.test(file) && isAuthoredProductionPath(file),
  )) {
    if (
      [...readPackageScripts(join(repoPath, packageJson)).values()].some((script) =>
        TEST_RUNNER_PATTERN.test(script),
      )
    ) {
      configured.push(packageJson);
    }
  }
  configured.push(
    ...repoFiles
      .filter((file) => isAuthoredProductionPath(file) && isCiWorkflow(file))
      .filter((file) => fileContains(repoPath, file, CI_TEST_COMMAND_PATTERN)),
  );
  return [...new Set(configured)].sort();
}

export function findNonLeanTestToolchainPremiseFiles(
  repoPath: string,
  repoFiles: readonly string[],
  rubricVersion = WITAN_RUBRIC_VERSION,
): string[] {
  const testFiles = findConcreteTestFiles(repoPath, repoFiles, rubricVersion);
  if (testFiles.length === 0) return [];
  const packageJsonFiles = repoFiles.filter(
    (file) => /(^|\/)package\.json$/.test(file) && isAuthoredProductionPath(file),
  );
  const configured = findConfiguredTestRunnerFiles(repoPath, repoFiles);
  const usesLeanBuiltInTestRunner =
    packageJsonFiles.some((manifest) =>
      [...readPackageScripts(join(repoPath, manifest)).values()].some((script) =>
        LEAN_TEST_RUNNER_SCRIPT_PATTERN.test(script),
      ),
    ) || testFiles.some((file) => fileContains(repoPath, file, LEAN_TEST_RUNNER_IMPORT_PATTERN));
  const heavyManifests = packageJsonFiles.filter((manifest) =>
    packageJsonHasHeavyTestDependency(repoPath, manifest),
  );
  if (usesLeanBuiltInTestRunner && heavyManifests.length === 0) return [];
  return [...new Set([...heavyManifests, ...configured])].sort();
}

export function findTenantStoragePremiseFiles(
  repoPath: string,
  repoFiles: readonly string[],
): string[] {
  return repoFiles
    .filter((file) => /(^|\/)(?:migrations?|drizzle|prisma)\/|\.(?:sql|prisma)$/i.test(file))
    .filter((file) => fileContains(repoPath, file, TENANT_SCOPE_PATTERN_V11));
}

export function findRlsPolicyFiles(repoPath: string, repoFiles: readonly string[]): string[] {
  return repoFiles
    .filter((file) => /(^|\/)(?:migrations?|drizzle|prisma)\/|\.(?:sql|prisma)$/i.test(file))
    .filter((file) =>
      fileContains(
        repoPath,
        file,
        /\b(?:create\s+policy|enable\s+row\s+level\s+security|force\s+row\s+level\s+security)\b/i,
      ),
    );
}

export interface RlsPolicyScopeInventory {
  policyFiles: string[];
  policyCount: number;
  scopeIdentifiers: string[];
  storageFiles: string[];
}

const RLS_CLAUSE_SQL_WORDS = new Set([
  'all',
  'and',
  'any',
  'as',
  'asc',
  'between',
  'by',
  'case',
  'cast',
  'current',
  'desc',
  'distinct',
  'else',
  'end',
  'exists',
  'false',
  'from',
  'in',
  'is',
  'join',
  'like',
  'limit',
  'not',
  'null',
  'on',
  'or',
  'order',
  'select',
  'then',
  'text',
  'true',
  'uuid',
  'varchar',
  'when',
  'where',
]);

function extractBalancedSqlClause(statement: string, keyword: 'using' | 'with check'): string[] {
  const clauses: string[] = [];
  const keywordPattern = keyword === 'using' ? /\busing\s*\(/gi : /\bwith\s+check\s*\(/gi;
  for (const match of statement.matchAll(keywordPattern)) {
    const openingParen = (match.index ?? 0) + match[0].lastIndexOf('(');
    let depth = 0;
    let quote: "'" | '"' | null = null;
    for (let index = openingParen; index < statement.length; index += 1) {
      const character = statement[index];
      if (quote) {
        if (character === quote && statement[index - 1] !== '\\') quote = null;
        continue;
      }
      if (character === "'" || character === '"') {
        quote = character;
      } else if (character === '(') {
        depth += 1;
      } else if (character === ')') {
        depth -= 1;
        if (depth === 0) {
          clauses.push(statement.slice(openingParen + 1, index));
          break;
        }
      }
    }
  }
  return clauses;
}

function extractRlsScopeIdentifiers(clause: string): string[] {
  const scrubbed = clause.replace(/'(?:''|[^'])*'/g, ' ').replace(/"(?:""|[^"])*"/g, ' ');
  const identifiers = new Set<string>();
  const identifierPattern = /\b[A-Za-z_][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_$]*)*\b/g;
  for (const match of scrubbed.matchAll(identifierPattern)) {
    const token = match[0];
    const segments = token.split('.').map((segment) => segment.toLowerCase());
    const lastSegment = segments.at(-1);
    if (!lastSegment || lastSegment.length < 2 || RLS_CLAUSE_SQL_WORDS.has(lastSegment)) continue;
    if (['app', 'auth', 'jwt', 'request', 'session'].includes(segments[0] ?? '')) continue;
    const remainder = scrubbed.slice((match.index ?? 0) + token.length);
    if (/^\s*\(/.test(remainder)) continue;
    if (['auth', 'current_setting', 'jwt', 'pg_catalog', 'public', 'uid'].includes(lastSegment)) {
      continue;
    }
    identifiers.add(lastSegment);
  }
  return [...identifiers].sort();
}

/**
 * Re-derive multi-tenancy from the repository's own RLS language.
 *
 * There is deliberately no tenant/org/workspace token dictionary here. We first
 * locate RLS policy files, then parse CREATE POLICY statements and their
 * USING/WITH CHECK clauses. Identifiers found in those clauses become that
 * repository's native isolation vocabulary and are traced across its data-layer
 * files. A schema token with no policy cannot manufacture a multi-tenant claim.
 */
export function deriveRlsPolicyScopeInventory(
  repoPath: string,
  repoFiles: readonly string[],
): RlsPolicyScopeInventory {
  const candidatePolicyFiles = findRlsPolicyFiles(repoPath, repoFiles);
  const policyFiles = new Set<string>();
  const scopeIdentifiers = new Set<string>();
  let policyCount = 0;

  for (const file of candidatePolicyFiles) {
    let content: string;
    try {
      content = readRepoText(join(repoPath, file), 'utf8');
    } catch {
      continue;
    }
    for (const match of content.matchAll(/\bcreate\s+policy\b[\s\S]*?(?:;|$)/gi)) {
      const statement = match[0];
      const clauses = [
        ...extractBalancedSqlClause(statement, 'using'),
        ...extractBalancedSqlClause(statement, 'with check'),
      ];
      if (clauses.length === 0) continue;
      policyCount += 1;
      policyFiles.add(file);
      for (const clause of clauses) {
        for (const identifier of extractRlsScopeIdentifiers(clause)) {
          scopeIdentifiers.add(identifier);
        }
      }
    }
  }

  const identifiers = [...scopeIdentifiers].sort();
  const dataLayerFiles = repoFiles.filter((file) =>
    /(^|\/)(?:migrations?|drizzle|prisma)\/|\.(?:sql|prisma)$/i.test(file),
  );
  const storageFiles =
    identifiers.length === 0
      ? []
      : dataLayerFiles.filter((file) =>
          identifiers.some((identifier) =>
            fileContains(
              repoPath,
              file,
              new RegExp(`\\b${identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
            ),
          ),
        );

  return {
    policyFiles: [...policyFiles].sort(),
    policyCount,
    scopeIdentifiers: identifiers,
    storageFiles,
  };
}

// ---- v26 item 6, A2 T-1..T-3: an identifiable tenant table with no row-level security --------
//
// docs/calibration/v26/ruling-item-6.md. The finding fires only when the repository's own SQL
// settles it: row-level security is its mechanism (T-1), a CREATE TABLE statement defines a tenant
// column under a readable name (T-2), and no ENABLE ROW LEVEL SECURITY or CREATE POLICY ... ON names
// that table, a later DISABLE counting as uncovered (T-3). Anything Cejel cannot read settles
// nothing, and the reading chosen wherever the ruling is silent is the one that fires less:
//   - only `.sql` files are parsed; an RLS statement in any other data-layer file (an ORM migration,
//     a Prisma schema) means coverage Cejel cannot read, so it abstains on every table;
//   - comments are not code; an RLS statement inside a string or dollar-quoted body is dynamic SQL,
//     and so is one whose table name cannot be normalised: either abstains on every table;
//   - table names compare case-insensitively on their last segment, so coverage written with a
//     different case, quoting or schema prefix still covers (two schemas' same-named tables count
//     as one);
//   - DISABLE uncovers a table only when it is later than the table's last ENABLE or CREATE POLICY
//     in the same directory; migration files are ordered by path with numeric runs compared as
//     numbers, and statements by position;
//   - a name with more than two segments, or a quoted name that is not a plain identifier, is not
//     identifiable, so that table yields no finding;
//   - a table that no longer exists under its CREATE TABLE name is followed
//     (goal_cejel_v26_item6_revision_2026-10-14): a later DROP TABLE in the same directory removes
//     it, and a later ALTER TABLE ... RENAME TO moves its name and its coverage history. Across
//     directories there is no readable order, so a DROP or RENAME there means the table may be
//     gone and it is not named. A DROP or RENAME whose name cannot be normalised, or one inside a
//     string or dollar-quoted body, may name any table, so it abstains on every table;
//   - at most three tables are named.
const DATA_LAYER_PATH_PATTERN = /(^|\/)(?:migrations?|drizzle|prisma)\/|\.(?:sql|prisma)$/i;
const RLS_STATEMENT_PHRASE_PATTERN =
  /\b(?:enable|disable)\s+row\s+level\s+security\b|\bcreate\s+(?:or\s+replace\s+)?policy\b/i;
const SQL_TABLE_REMOVAL_PHRASE_PATTERN = /\bdrop\s+table\b|\brename\s+to\b/i;
const SQL_CREATE_TABLE_HEAD =
  /^create\s+(?:(?:global|local)\s+)?(?:(?:temporary|temp|unlogged)\s+)?table\s+(?:if\s+not\s+exists\s+)?/i;
const SQL_ALTER_TABLE_HEAD = /^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?/i;
const SQL_DROP_TABLE_HEAD = /^drop\s+table\s+(?:if\s+exists\s+)?/i;
const SQL_RENAME_TO_CLAUSE = /^\s+rename\s+to\s+/i;
const SQL_CREATE_POLICY_HEAD = /^create\s+(?:or\s+replace\s+)?policy\s+/i;
const SQL_RLS_TOGGLE_PATTERN = /\b(enable|disable)\s+row\s+level\s+security\b/gi;
const SQL_PLAIN_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const SQL_TABLE_CONSTRAINT_PATTERN = /^(?:constraint|primary|foreign|unique|check|exclude|like)\b/i;
const MAX_UNCOVERED_TENANT_TABLES = 3;

export interface UncoveredTenantTable {
  /** Normalised: lower case, unquoted, `schema.table` when the CREATE TABLE qualified it. */
  readonly name: string;
  readonly file: string;
  /** 1-based line of the CREATE TABLE statement. */
  readonly line: number;
}

/** Path order for migrations: numeric runs compare as numbers, everything else by code unit. */
function compareMigrationPaths(left: string, right: string): number {
  const leftChunks = left.match(/\d+|\D+/g) ?? [];
  const rightChunks = right.match(/\d+|\D+/g) ?? [];
  for (let index = 0; index < Math.min(leftChunks.length, rightChunks.length); index += 1) {
    const a = leftChunks[index] as string;
    const b = rightChunks[index] as string;
    if (a === b) continue;
    if (/^\d/.test(a) && /^\d/.test(b)) {
      const x = a.replace(/^0+(?=\d)/, '');
      const y = b.replace(/^0+(?=\d)/, '');
      if (x.length !== y.length) return x.length - y.length;
      if (x !== y) return x < y ? -1 : 1;
      return a.length - b.length;
    }
    return a < b ? -1 : 1;
  }
  return leftChunks.length - rightChunks.length;
}

/**
 * Blank comments, string literal bodies and dollar-quoted bodies to spaces, keeping every offset
 * and line break, so statement positions still map to lines. `dynamic` is true when a blanked
 * string or body names an RLS statement, a DROP TABLE or a RENAME TO: SQL Cejel cannot attribute
 * to a table.
 */
function blankSqlNonCode(text: string): { code: string; dynamic: boolean } {
  const out = text.split('');
  let dynamic = false;
  const blank = (from: number, to: number): void => {
    for (let index = from; index < to; index += 1) {
      if (out[index] !== '\n' && out[index] !== '\r') out[index] = ' ';
    }
  };
  const noteBody = (from: number, to: number): void => {
    const body = text.slice(from, to);
    if (RLS_STATEMENT_PHRASE_PATTERN.test(body) || SQL_TABLE_REMOVAL_PHRASE_PATTERN.test(body)) {
      dynamic = true;
    }
  };
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '-' && next === '-') {
      const newline = text.indexOf('\n', index);
      const end = newline === -1 ? text.length : newline;
      blank(index, end);
      index = end;
    } else if (character === '/' && next === '*') {
      let depth = 1;
      let cursor = index + 2;
      while (cursor < text.length && depth > 0) {
        if (text[cursor] === '/' && text[cursor + 1] === '*') {
          depth += 1;
          cursor += 2;
        } else if (text[cursor] === '*' && text[cursor + 1] === '/') {
          depth -= 1;
          cursor += 2;
        } else {
          cursor += 1;
        }
      }
      blank(index, cursor);
      index = cursor;
    } else if (character === "'") {
      const escapes =
        index > 0 && /[Ee]/.test(text[index - 1] ?? '') && !/[A-Za-z0-9_$]/.test(text[index - 2] ?? '');
      let cursor = index + 1;
      while (cursor < text.length) {
        if (escapes && text[cursor] === '\\') {
          cursor += 2;
        } else if (text[cursor] === "'") {
          if (text[cursor + 1] !== "'") break;
          cursor += 2;
        } else {
          cursor += 1;
        }
      }
      noteBody(index + 1, cursor);
      blank(index + 1, cursor);
      index = cursor + 1;
    } else if (character === '"') {
      // A quoted identifier is code: kept, and skipped so nothing inside it opens a comment.
      let cursor = index + 1;
      while (cursor < text.length) {
        if (text[cursor] === '"') {
          if (text[cursor + 1] !== '"') break;
          cursor += 2;
        } else {
          cursor += 1;
        }
      }
      index = cursor + 1;
    } else if (character === '$' && !/[A-Za-z0-9_$]/.test(text[index - 1] ?? '')) {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(index, index + 66))?.[0];
      if (tag === undefined) {
        index += 1;
        continue;
      }
      const close = text.indexOf(tag, index + tag.length);
      const end = close === -1 ? text.length : close;
      noteBody(index + tag.length, end);
      blank(index + tag.length, end);
      index = close === -1 ? text.length : close + tag.length;
    } else {
      index += 1;
    }
  }
  return { code: out.join(''), dynamic };
}

function splitSqlStatements(code: string): { text: string; start: number }[] {
  const statements: { text: string; start: number }[] = [];
  let start = 0;
  let quoted = false;
  for (let index = 0; index <= code.length; index += 1) {
    const character = code[index];
    if (character === '"') quoted = !quoted;
    if (index === code.length || (character === ';' && !quoted)) {
      const raw = code.slice(start, index);
      const lead = raw.length - raw.trimStart().length;
      if (raw.trim() !== '') statements.push({ text: raw.slice(lead), start: start + lead });
      start = index + 1;
    }
  }
  return statements;
}

/** One identifier, quoted or bare, from `from`. `value` is null when it is not a plain identifier. */
function readSqlIdentifier(text: string, from: number): { value: string | null; end: number } | null {
  let index = from;
  while (/\s/.test(text[index] ?? '')) index += 1;
  if (text[index] === '"') {
    let cursor = index + 1;
    while (cursor < text.length) {
      if (text[cursor] === '"') {
        if (text[cursor + 1] !== '"') break;
        cursor += 2;
      } else {
        cursor += 1;
      }
    }
    if (cursor >= text.length) return null;
    const inner = text.slice(index + 1, cursor).replace(/""/g, '"');
    return { value: SQL_PLAIN_IDENTIFIER_PATTERN.test(inner) ? inner : null, end: cursor + 1 };
  }
  const bare = /^[^\s(),;.]+/.exec(text.slice(index))?.[0];
  if (bare === undefined) return null;
  return { value: SQL_PLAIN_IDENTIFIER_PATTERN.test(bare) ? bare : null, end: index + bare.length };
}

/** A one- or two-segment table name, lower-cased; `segments` is null when it cannot be normalised. */
function readSqlTableName(text: string, from: number): { segments: string[] | null; end: number } {
  const segments: string[] = [];
  let normalisable = true;
  let index = from;
  for (;;) {
    const identifier = readSqlIdentifier(text, index);
    if (identifier === null) return { segments: null, end: index };
    if (identifier.value === null) normalisable = false;
    else segments.push(identifier.value.toLowerCase());
    index = identifier.end;
    let cursor = index;
    while (/\s/.test(text[cursor] ?? '')) cursor += 1;
    if (text[cursor] !== '.') break;
    index = cursor + 1;
  }
  return {
    segments: normalisable && segments.length >= 1 && segments.length <= 2 ? segments : null,
    end: index,
  };
}

/** Whether a CREATE TABLE column list, starting at its `(`, defines a tenant column. */
function sqlColumnListHasTenantColumn(text: string, open: number): boolean {
  let depth = 0;
  let quoted = false;
  let elementStart = open + 1;
  const elements: string[] = [];
  for (let index = open; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') quoted = !quoted;
    if (quoted) continue;
    if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        elements.push(text.slice(elementStart, index));
        break;
      }
    } else if (character === ',' && depth === 1) {
      elements.push(text.slice(elementStart, index));
      elementStart = index + 1;
    }
  }
  return elements.some((element) => {
    const trimmed = element.trim();
    if (trimmed === '' || SQL_TABLE_CONSTRAINT_PATTERN.test(trimmed)) return false;
    const column = readSqlIdentifier(trimmed, 0)?.value;
    return column != null && TENANT_SCOPE_PATTERN_V11.test(column);
  });
}

function lineAtOffset(text: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset && index < text.length; index += 1) {
    if (text[index] === '\n') line += 1;
  }
  return line;
}

/**
 * The identifiable tenant tables this repository's SQL leaves without row-level security, when
 * row-level security is its mechanism; otherwise []. [] is also the answer whenever coverage
 * cannot be read, so the caller cannot tell "covered" from "unsettled" here and must not try.
 */
export function findUncoveredTenantTables(
  repoPath: string,
  repoFiles: readonly string[],
): UncoveredTenantTable[] {
  interface CoverageEvent {
    readonly key: string;
    readonly covers: boolean;
    readonly order: number;
    readonly dir: string;
  }
  // A DROP TABLE (`to` undefined) or an ALTER TABLE ... RENAME TO.
  interface NameEvent {
    readonly key: string;
    readonly to?: string;
    readonly order: number;
    readonly dir: string;
  }
  interface TenantTable {
    readonly key: string;
    readonly segments: readonly string[];
    readonly file: string;
    readonly line: number;
    readonly order: number;
    readonly dir: string;
  }
  const events: CoverageEvent[] = [];
  const nameEvents: NameEvent[] = [];
  const tenantTables: TenantTable[] = [];
  let order = 0;
  const dataLayerFiles = repoFiles
    .filter((file) => DATA_LAYER_PATH_PATTERN.test(file))
    .sort(compareMigrationPaths);
  for (const file of dataLayerFiles) {
    const fullPath = join(repoPath, file);
    if (!isRegularFile(fullPath)) continue;
    const contents = readRepoText(fullPath, 'utf8');
    if (!/\.sql$/i.test(file)) {
      if (RLS_STATEMENT_PHRASE_PATTERN.test(contents)) return [];
      continue;
    }
    const { code, dynamic } = blankSqlNonCode(contents);
    if (dynamic) return [];
    const dir = posix.dirname(file);
    for (const statement of splitSqlStatements(code)) {
      order += 1;
      const createTable = SQL_CREATE_TABLE_HEAD.exec(statement.text);
      if (createTable) {
        const { segments, end } = readSqlTableName(statement.text, createTable[0].length);
        const open = statement.text.slice(end).search(/\S/);
        if (segments === null || open === -1 || statement.text[end + open] !== '(') continue;
        if (sqlColumnListHasTenantColumn(statement.text, end + open)) {
          tenantTables.push({
            key: segments[segments.length - 1] as string,
            segments,
            file,
            line: lineAtOffset(contents, statement.start),
            order,
            dir,
          });
        }
        continue;
      }
      const dropTable = SQL_DROP_TABLE_HEAD.exec(statement.text);
      if (dropTable) {
        let cursor = dropTable[0].length;
        for (;;) {
          const { segments, end } = readSqlTableName(statement.text, cursor);
          if (segments === null) return [];
          nameEvents.push({ key: segments[segments.length - 1] as string, order, dir });
          const comma = /^\s*,/.exec(statement.text.slice(end));
          if (!comma) break;
          cursor = end + comma[0].length;
        }
        continue;
      }
      const alterTable = SQL_ALTER_TABLE_HEAD.exec(statement.text);
      if (alterTable) {
        const { segments: renamed, end: renamedEnd } = readSqlTableName(
          statement.text,
          alterTable[0].length,
        );
        const renameTo =
          renamed === null ? null : SQL_RENAME_TO_CLAUSE.exec(statement.text.slice(renamedEnd));
        if (renamed !== null && renameTo) {
          const { segments: to } = readSqlTableName(statement.text, renamedEnd + renameTo[0].length);
          if (to === null) return [];
          nameEvents.push({
            key: renamed[renamed.length - 1] as string,
            to: to[to.length - 1] as string,
            order,
            dir,
          });
          continue;
        }
        const toggles = [...statement.text.matchAll(SQL_RLS_TOGGLE_PATTERN)];
        if (toggles.length === 0) {
          // A RENAME TO on a table Cejel cannot name may have moved any table.
          if (SQL_TABLE_REMOVAL_PHRASE_PATTERN.test(statement.text)) return [];
          continue;
        }
        const { segments } = readSqlTableName(statement.text, alterTable[0].length);
        if (segments === null) return [];
        const key = segments[segments.length - 1] as string;
        for (const toggle of toggles) {
          order += 1; // two toggles in one statement are ordered by position
          events.push({ key, covers: toggle[1]?.toLowerCase() === 'enable', order, dir });
        }
        continue;
      }
      const createPolicy = SQL_CREATE_POLICY_HEAD.exec(statement.text);
      if (createPolicy) {
        const policyName = readSqlIdentifier(statement.text, createPolicy[0].length);
        const on = policyName ? /^\s+on\s+/i.exec(statement.text.slice(policyName.end)) : null;
        if (!policyName || !on) return [];
        const { segments } = readSqlTableName(statement.text, policyName.end + on[0].length);
        if (segments === null) return [];
        events.push({ key: segments[segments.length - 1] as string, covers: true, order, dir });
        continue;
      }
      if (RLS_STATEMENT_PHRASE_PATTERN.test(statement.text)) return [];
    }
  }
  // T-1: row-level security is this repository's own mechanism.
  if (!events.some((event) => event.covers)) return [];
  // The names a table has held, each with the statement positions it held it between, or null
  // when the table may no longer exist: a later DROP in its directory, or any DROP or RENAME of
  // one of its names in another directory, where there is no order to read.
  interface NameSpan {
    readonly key: string;
    readonly from: number;
    readonly until: number;
  }
  const followTable = (table: TenantTable): NameSpan[] | null => {
    const spans: NameSpan[] = [];
    let key = table.key;
    let from = Number.NEGATIVE_INFINITY;
    for (;;) {
      const current = key;
      if (nameEvents.some((event) => event.key === current && event.dir !== table.dir)) return null;
      const next = nameEvents.find(
        (event) => event.key === current && event.dir === table.dir && event.order > Math.max(from, table.order),
      );
      if (next === undefined) {
        spans.push({ key, from, until: Number.POSITIVE_INFINITY });
        return spans;
      }
      if (next.to === undefined) return null;
      spans.push({ key, from, until: next.order });
      key = next.to;
      from = next.order;
    }
  };
  // Coverage follows the table through a rename: an event counts when it names the table by the
  // name it held at that point. An event in another directory has no order, so it counts under
  // any of the table's names.
  const isCovered = (table: TenantTable, spans: readonly NameSpan[]): boolean => {
    const forTable = events.filter((event) =>
      spans.some(
        (span) =>
          span.key === event.key &&
          (event.dir !== table.dir || (event.order > span.from && event.order < span.until)),
      ),
    );
    const lastCover = forTable.filter((event) => event.covers).at(-1);
    const lastDisable = forTable.filter((event) => !event.covers).at(-1);
    if (lastCover === undefined) return false;
    if (lastDisable === undefined) return true;
    // Files in different directories have no order Cejel can read, so the DISABLE is not later.
    if (lastCover.dir !== lastDisable.dir) return true;
    return lastCover.order > lastDisable.order;
  };
  const uncovered = new Map<string, UncoveredTenantTable & { readonly order: number }>();
  for (const table of tenantTables) {
    const spans = followTable(table);
    const current = spans?.at(-1)?.key;
    if (spans === null || current === undefined || uncovered.has(current)) continue;
    if (isCovered(table, spans)) continue;
    uncovered.set(current, {
      name: [...table.segments.slice(0, -1), current].join('.'),
      file: table.file,
      line: table.line,
      order: table.order,
    });
  }
  return [...uncovered.values()]
    .sort((left, right) => left.order - right.order)
    .slice(0, MAX_UNCOVERED_TENANT_TABLES)
    .map(({ name, file, line }) => ({ name, file, line }));
}

export function findCiOrReleaseDeployFiles(
  _repoPath: string,
  repoFiles: readonly string[],
): string[] {
  return repoFiles.filter(
    (file) =>
      isAuthoredProductionPath(file) && (isCiWorkflow(file) || isExplicitDeployTarget(file)),
  );
}

export function findDependencyLockfiles(repoFiles: readonly string[]): string[] {
  return repoFiles.filter(isLockfile);
}

export function findDependencyManifests(repoFiles: readonly string[]): string[] {
  return repoFiles.filter(isDependencyManifest);
}

export function findDeployableServicePremiseFiles(
  repoPath: string,
  repoFiles: readonly string[],
  strictOperationalBoundary = false,
): string[] {
  const explicitTargets = repoFiles.filter(
    (file) =>
      isAuthoredProductionPath(file) &&
      isExplicitDeployTarget(file) &&
      (!strictOperationalBoundary || isV47OperationalApplicationPath(file)),
  );
  const deployWorkflows = repoFiles
    .filter((file) => isAuthoredProductionPath(file) && isCiWorkflow(file))
    .filter((file) => fileContains(repoPath, file, CI_DEPLOY_JOB_PATTERN))
    .filter(
      (file) => !strictOperationalBoundary || !isDocumentationOnlyDeployWorkflow(repoPath, file),
    );
  const serverEntrypoint = findServerEntrypointFile(repoPath, repoFiles, true);
  const runtimeContainer = findRuntimeContainerEntrypointFile(repoPath, repoFiles);
  if (strictOperationalBoundary) {
    const runtimeFiles = [serverEntrypoint, runtimeContainer].filter(
      (file): file is string => file != null && isV47OperationalApplicationPath(file),
    );
    const directApplicationTargets = explicitTargets.filter(
      (file) => !isInfrastructureOnlyDeployTarget(file),
    );
    const infrastructureTargets =
      runtimeFiles.length > 0
        ? [...explicitTargets.filter(isInfrastructureOnlyDeployTarget), ...deployWorkflows]
        : [];
    return [...directApplicationTargets, ...runtimeFiles, ...infrastructureTargets];
  }
  return [
    ...explicitTargets,
    ...deployWorkflows,
    ...(serverEntrypoint &&
    (!strictOperationalBoundary || isV47OperationalApplicationPath(serverEntrypoint))
      ? [serverEntrypoint]
      : []),
    ...(runtimeContainer &&
    (!strictOperationalBoundary || isV47OperationalApplicationPath(runtimeContainer))
      ? [runtimeContainer]
      : []),
  ];
}

function isInfrastructureOnlyDeployTarget(file: string): boolean {
  return (
    /(^|\/)docker-compose\.ya?ml$/i.test(file) ||
    /(^|\/)(?:k8s|kubernetes|manifests?)\/.+\.ya?ml$/i.test(file) ||
    /(^|\/)(?:charts?|helm)\/.+\.ya?ml$/i.test(file)
  );
}

const V47_NON_OPERATIONAL_APPLICATION_PATH_PATTERN =
  /(^|\/)(?:cookbooks?|lessons?|tutorials?|docs?|documentation|examples?|samples?|demos?)(\/|$)/i;

function isV47OperationalApplicationPath(path: string): boolean {
  return !V47_NON_OPERATIONAL_APPLICATION_PATH_PATTERN.test(path);
}

function isDocumentationOnlyDeployWorkflow(repoPath: string, file: string): boolean {
  if (/(?:docs?|pages?)/i.test(basename(file))) return true;
  return fileContains(
    repoPath,
    file,
    /\b(?:deploy[-_ ]?docs?|mkdocs|docusaurus|vitepress|gh-pages|github pages)\b/i,
  );
}

export function findPackagedApplicationPremiseFiles(
  repoPath: string,
  repoFiles: readonly string[],
): string[] {
  return repoFiles
    .filter((file) => /(^|\/)package\.json$/.test(file) && isAuthoredProductionPath(file))
    .filter((file) => packageJsonDescribesPackagedApplication(repoPath, file, repoFiles));
}

// The file-selection half of each repoFiles-walking A5 signal, named once so the live filter and
// the withheld-path check consult literally the same test and cannot drift — the same discipline
// A3's healthReadinessRouteReads/observabilityDepthReads follow. Each is a path test only: it is
// the predicate that decides which files the signal looks at, never a content judgement, and
// never an extension map or a criterion association (see abstainSignalOnWithheldPaths).
export function isClaimSourceFile(file: string): boolean {
  return /^(?:README|readme)\.md$/.test(file) || /^docs\/[^/]+\.(?:md|mdx)$/.test(file);
}

export function isClaimRealityReconciliationPath(file: string): boolean {
  return /(^|\/)claim[-_]reality[-_]reconciliation\.(?:md|mdx|json)$/i.test(file);
}

export function isSecurityOrThreatModelDoc(file: string): boolean {
  return /(^|\/)(SECURITY|THREAT[_-]?MODEL)\.md$/i.test(file);
}

export function isNegativeSpaceDocCandidate(file: string): boolean {
  return isClaimSourceFile(file) || isSecurityOrThreatModelDoc(file);
}

export function claimImplementationFileReads(authoredOnly: boolean): (file: string) => boolean {
  return (file) =>
    isImplementationFile(file) && (!authoredOnly || isAuthoredProductionPath(file));
}

export function findClaimSourceFiles(repoFiles: readonly string[]): string[] {
  return repoFiles.filter(isClaimSourceFile).sort((left, right) => {
    const leftRootReadme = /^(?:README|readme)\.md$/.test(left);
    const rightRootReadme = /^(?:README|readme)\.md$/.test(right);
    return Number(rightRootReadme) - Number(leftRootReadme) || left.localeCompare(right);
  });
}

export function findClaimImplementationFiles(
  repoFiles: readonly string[],
  authoredOnly = false,
): string[] {
  return repoFiles.filter(claimImplementationFileReads(authoredOnly));
}

export function findClaimRealityReconciliationArtifacts(
  repoPath: string,
  repoFiles: readonly string[],
): string[] {
  return repoFiles
    .filter(isClaimRealityReconciliationPath)
    .filter((file) => isAuthenticatedClaimRealityArtifact(repoPath, file));
}

function isAuthenticatedClaimRealityArtifact(repoPath: string, file: string): boolean {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return false;
  const contents = readRepoText(fullPath, 'utf8');
  if (/\.json$/i.test(file)) {
    return parseJsonObject(contents)?.artifactKind === 'claim_reality_reconciliation';
  }
  let inFence = false;
  for (const line of contents.split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && /^#\s+Claim Reality Reconciliation\s*$/i.test(line)) return true;
  }
  return false;
}

// ---- v26 item 6, S-A5: a declared claim-reconciliation artifact that is absent ---------------
//
// docs/calibration/v26/ruling-item-6.md. The repository itself names the artifact, and the named
// path is not in the tree. Where the ruling is silent, each choice below is the reading that fires
// less, and each is listed in the change's record.

// The bounded vocabulary: `claim` or `claims`, then `reconciliation`, `register` or `ledger`, with
// an optional `reality` between, joined by `-`, `_`, `.` or nothing, in any case. A document or a
// data file only.
const DECLARED_CLAIM_ARTIFACT_BASENAME_PATTERN =
  /^claims?[-_.]?(?:reality[-_.]?)?(?:reconciliation|register|ledger)\.(?:md|mdx|json|ya?ml)$/i;
// Only a path Cejel can state back verbatim counts as a declaration; anything else cannot be
// normalised and declares nothing.
const DECLARED_CLAIM_ARTIFACT_PATH_PATTERN = /^[A-Za-z0-9._/-]{1,160}$/;
const MARKDOWN_FENCE_PATTERN = /^\s{0,3}(`{3,}|~{3,})/;
const MARKDOWN_INLINE_LINK_PATTERN = /(!?)\[[^\]]*\]\(\s*<?([^\s)>]+)>?[^)]*\)/g;
const MARKDOWN_REFERENCE_DEFINITION_PATTERN = /^\s{0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?/;
const MARKDOWN_CODE_SPAN_PATTERN = /`([^`]+)`/g;

interface DeclaredClaimArtifact {
  /** Repository-relative, normalised. */
  readonly path: string;
  readonly declaringFile: string;
  readonly line: number;
}

interface ClaimArtifactDeclaration {
  /** Every repository-relative reading of the declared path; present if any one is present. */
  readonly candidates: readonly string[];
  readonly line: number;
}

// The places the ruling names: a claim source (README.md, a top-level docs/ page), CONTRIBUTING,
// and a step of a GitHub Actions workflow.
function isClaimArtifactDeclaringDocument(file: string): boolean {
  return isClaimSourceFile(file) || /^CONTRIBUTING\.md$/i.test(file);
}

function isClaimArtifactDeclaringWorkflow(file: string): boolean {
  return /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file);
}

function normaliseDeclaredClaimArtifactPath(candidate: string, baseDir: string): string | null {
  if (!DECLARED_CLAIM_ARTIFACT_PATH_PATTERN.test(candidate)) return null;
  const joined = candidate.startsWith('/')
    ? posix.normalize(candidate.slice(1))
    : posix.normalize(posix.join(baseDir, candidate));
  const path = joined.replace(/\/+$/, '');
  if (path === '' || path === '.' || path === '..' || path.startsWith('../') || path.startsWith('/')) {
    return null;
  }
  return DECLARED_CLAIM_ARTIFACT_BASENAME_PATTERN.test(posix.basename(path)) ? path : null;
}

function markdownLinkTarget(target: string): string | null {
  // An external URL, a protocol-relative URL or an in-page anchor names no repository path.
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//') || target.startsWith('#')) {
    return null;
  }
  const withoutSuffix = target.replace(/[?#].*$/, '');
  try {
    return decodeURIComponent(withoutSuffix);
  } catch {
    return null;
  }
}

function markdownClaimArtifactDeclarations(
  file: string,
  contents: string,
): ClaimArtifactDeclaration[] {
  const baseDir = posix.dirname(file);
  const declarations: ClaimArtifactDeclaration[] = [];
  let fence: string | null = null;
  let inHtmlComment = false;
  contents.split(/\r?\n/).forEach((rawLine, index) => {
    const marker = MARKDOWN_FENCE_PATTERN.exec(rawLine)?.[1];
    if (fence !== null) {
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      return;
    }
    if (marker !== undefined) {
      fence = marker;
      return;
    }
    let line = rawLine;
    if (inHtmlComment) {
      const close = line.indexOf('-->');
      if (close === -1) return;
      line = line.slice(close + 3);
      inHtmlComment = false;
    }
    line = line.replace(/<!--[\s\S]*?-->/g, ' ');
    const open = line.indexOf('<!--');
    if (open !== -1) {
      line = line.slice(0, open);
      inHtmlComment = true;
    }
    const lineNumber = index + 1;
    // A code-span path is read from the repository root and from the declaring file's
    // directory; it is present if either reading is.
    for (const match of line.matchAll(MARKDOWN_CODE_SPAN_PATTERN)) {
      const span = (match[1] ?? '').trim().replace(/^\.\//, '');
      const candidates = [
        normaliseDeclaredClaimArtifactPath(span, '.'),
        normaliseDeclaredClaimArtifactPath(span, baseDir),
      ].filter((path): path is string => path !== null);
      if (candidates.length > 0) declarations.push({ candidates: [...new Set(candidates)], line: lineNumber });
    }
    const prose = line.replace(MARKDOWN_CODE_SPAN_PATTERN, ' ');
    const targets: string[] = [];
    for (const match of prose.matchAll(MARKDOWN_INLINE_LINK_PATTERN)) {
      if (match[1] === '!') continue; // an image embeds a file; it does not declare an artifact
      targets.push(match[2] ?? '');
    }
    const reference = MARKDOWN_REFERENCE_DEFINITION_PATTERN.exec(prose);
    if (reference?.[1]) targets.push(reference[1]);
    for (const target of targets) {
      const decoded = markdownLinkTarget(target);
      // A relative link resolves against the declaring file, as the Markdown renderer resolves it.
      const path = decoded === null ? null : normaliseDeclaredClaimArtifactPath(decoded, baseDir);
      if (path !== null) declarations.push({ candidates: [path], line: lineNumber });
    }
  });
  return declarations;
}

// A path a step writes is output, not a declaration of a file the repository should hold. Every
// token after the first of these on a line is a written path: a shell redirect (`>`, `>>`), `tee`,
// or an output option (`-o`, `--out`, `--output`, and other `--out…` spellings). Read loosely on
// purpose, because a written path wrongly read as declared is the reading that fires more.
const WORKFLOW_WRITE_OPERATOR_PATTERN = />|(?:^|[\s|;&(])(?:tee|-o|--out[\w-]*)(?=[\s=]|$)/;
// The artifact actions' `path:` is what the step uploads or downloads, so the whole step declares
// nothing. Any version or sub-action.
const WORKFLOW_ARTIFACT_ACTION_PATTERN =
  /^\s*(?:-\s+)?uses\s*:\s*["']?actions\/(?:upload|download)-artifact(?:[/@]|["']?\s*$)/i;

function workflowClaimArtifactDeclarations(contents: string): ClaimArtifactDeclaration[] {
  // A step that may run elsewhere than the repository root names a path Cejel cannot resolve.
  if (/^\s*(?:-\s+)?working-directory\s*:/m.test(contents)) return [];
  const declarations: ClaimArtifactDeclaration[] = [];
  let stepsIndent: number | null = null;
  let stepItemIndent: number | null = null;
  // One step's declarations, kept back until the step ends, because its `uses:` may follow them.
  let step: { declarations: ClaimArtifactDeclaration[]; movesArtifact: boolean } | null = null;
  // A write operator on a line that ends in `\` carries on to the continuation line.
  let writeContinues = false;
  const closeStep = (): void => {
    if (step !== null && !step.movesArtifact) declarations.push(...step.declarations);
    step = null;
    writeContinues = false;
  };
  contents.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.replace(/(^|\s)#.*$/, '');
    if (line.trim() === '') return;
    const indent = line.length - line.trimStart().length;
    if (
      stepsIndent !== null &&
      (indent < stepsIndent || (indent === stepsIndent && !line.trimStart().startsWith('- ')))
    ) {
      closeStep();
      stepsIndent = null;
    }
    const stepsKey = /^(\s*)steps\s*:\s*$/.exec(line);
    if (stepsKey) {
      closeStep();
      stepsIndent = stepsKey[1]?.length ?? 0;
      stepItemIndent = null;
      return;
    }
    if (stepsIndent === null) return;
    if (line.trimStart().startsWith('- ') && (stepItemIndent === null || indent <= stepItemIndent)) {
      closeStep();
      stepItemIndent = indent;
    }
    step ??= { declarations: [], movesArtifact: false };
    if (WORKFLOW_ARTIFACT_ACTION_PATTERN.test(line)) step.movesArtifact = true;
    const writeAt = writeContinues ? 0 : line.search(WORKFLOW_WRITE_OPERATOR_PATTERN);
    writeContinues = writeAt !== -1 && /\\\s*$/.test(line);
    const read = writeAt === -1 ? line : line.slice(0, writeAt);
    for (const token of read.split(/[\s'"`=,;:()[\]{}<>|&]+/)) {
      const path = normaliseDeclaredClaimArtifactPath(token.replace(/^\.\//, ''), '.');
      if (path !== null) step.declarations.push({ candidates: [path], line: index + 1 });
    }
  });
  closeStep();
  return declarations;
}

export interface ClaimArtifactDeclarationScan {
  /** Whether the repository names any claim-reconciliation artifact, present or absent. */
  readonly declared: boolean;
  /** The first named artifact that is absent from the tree, if any. */
  readonly firstAbsent?: DeclaredClaimArtifact;
}

/**
 * Whether this repository names a claim-reconciliation artifact, and the first one it names that
 * is absent from its tree. "Absent" is checked against the tracked file list plus every path the
 * walk withheld from it, case-insensitively, so a file Cejel declined to read is never reported
 * missing.
 */
export function scanClaimArtifactDeclarations(
  repoPath: string,
  repoFiles: readonly string[],
): ClaimArtifactDeclarationScan {
  const declaringFiles = repoFiles
    .filter((file) => isClaimArtifactDeclaringDocument(file) || isClaimArtifactDeclaringWorkflow(file))
    .sort();
  let declared = false;
  if (declaringFiles.length === 0) return { declared };
  const known = [...repoFiles, ...withheldRepoPaths().map(({ path }) => path)].map((path) =>
    path.toLowerCase(),
  );
  const isPresent = (path: string): boolean => {
    const lower = path.toLowerCase();
    return known.some((file) => file === lower || file.startsWith(`${lower}/`));
  };
  for (const file of declaringFiles) {
    const fullPath = join(repoPath, file);
    if (!isRegularFile(fullPath)) continue;
    const contents = readRepoText(fullPath, 'utf8');
    const declarations = isClaimArtifactDeclaringWorkflow(file)
      ? workflowClaimArtifactDeclarations(contents)
      : markdownClaimArtifactDeclarations(file, contents);
    for (const declaration of declarations) {
      declared = true;
      if (declaration.candidates.some(isPresent)) continue;
      const [path] = declaration.candidates;
      if (path !== undefined) {
        return { declared, firstAbsent: { path, declaringFile: file, line: declaration.line } };
      }
    }
  }
  return { declared };
}

function isCoverageConfig(repoPath: string, file: string): boolean {
  if (
    /(^|\/)(nyc|c8|coverage|codecov)\.(json|yml|yaml)$/.test(file) ||
    /(^|\/)\.coveragerc$/.test(file) ||
    /(^|\/)lcov\.info$/.test(file) ||
    /(^|\/)\.coveralls\.yml$/.test(file)
  ) {
    return true;
  }
  // Documented configuration locations, every rubric
  // (goal_cejel_v26_coverage_config_recognition_2026-10-14). Each is the tool's own documented
  // file; the PR that added them lists each documentation URL.
  if (
    /(^|\/)\.codecov\.ya?ml$/.test(file) ||
    /(^|\/)\.nycrc(?:\.json|\.ya?ml)?$/.test(file) ||
    /(^|\/)\.c8rc(?:\.json)?$/.test(file) ||
    /(^|\/)\.?tarpaulin\.toml$/.test(file)
  ) {
    return true;
  }
  if (/(^|\/)(?:setup\.cfg|tox\.ini)$/.test(file)) {
    // coverage.py reads these files only under the `coverage:`-prefixed section names.
    return fileContains(repoPath, file, /^\s*\[coverage:(?:run|report)\]\s*$/m);
  }
  if (/(^|\/)vite\.config\.[cm]?[jt]s$/.test(file)) {
    return viteConfigCollectsCoverage(repoPath, file);
  }
  if (/(^|\/)\.simplecov$/.test(file)) {
    return fileContains(repoPath, file, /^(?!\s*#).*\bSimpleCov\b/m);
  }
  if (/(^|\/)phpunit\.xml(?:\.dist)?$/.test(file)) {
    return /<coverage(?=[\s>/])/.test(stripXmlComments(readRepoText(join(repoPath, file), 'utf8')));
  }
  if (/(^|\/)pom\.xml$/.test(file)) {
    return pomAppliesJacoco(readRepoText(join(repoPath, file), 'utf8'));
  }
  if (/(^|\/)build\.gradle(?:\.kts)?$/.test(file)) {
    return gradleAppliesJacoco(readRepoText(join(repoPath, file), 'utf8'));
  }
  if (/(^|\/)vitest\.config\.[cm]?[jt]s$/.test(file)) {
    return fileContains(repoPath, file, /\bcoverage\s*:/i);
  }
  if (/(^|\/)jest\.config\.[cm]?[jt]s$/.test(file)) {
    return fileContains(
      repoPath,
      file,
      /\b(?:collectCoverage|coverageThreshold|coverageProvider|coverageDirectory)\s*:/,
    );
  }
  if (/(^|\/)pyproject\.toml$/.test(file)) {
    return fileContains(repoPath, file, /^\[tool\.coverage(?:\.|\])/m);
  }
  if (/(^|\/)package\.json$/.test(file)) {
    return packageJsonHasCoverageTooling(repoPath, file);
  }
  return false;
}

function packageJsonHasCoverageTooling(repoPath: string, file: string): boolean {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return false;
  const parsed = parseJsonObject(readRepoText(fullPath, 'utf8'));
  if (!parsed) return false;

  const scripts = parsed.scripts;
  if (typeof scripts === 'object' && scripts !== null && !Array.isArray(scripts)) {
    for (const command of Object.values(scripts)) {
      if (typeof command === 'string' && commandInvokesCoverageTool(command)) {
        return true;
      }
    }
  }

  return packageJsonHasStaticCoverageTooling(repoPath, file);
}

// The v23 disabled-value rules for a Vitest `coverage` property: absent, `false`, `null` or
// `undefined`, or an object alongside `enabled: false`, does not collect. `contents` must already
// have comments stripped.
function vitestCoveragePropertyCollects(contents: string): boolean {
  const property = /(?:^|[{,])\s*["']?coverage["']?\s*:\s*([^,\r\n}]*)/im
    .exec(contents)?.[1]
    ?.trim();
  if (!property || /^(?:false\b|null\b|undefined\b)/i.test(property)) return false;
  if (/^\{/.test(property) && /\benabled\s*:\s*false\b/i.test(contents)) return false;
  return true;
}

// Vitest reads `test` from vite.config unless a vitest.config beside it takes priority, which it
// does wholesale unless it merges vite.config in (vitest.dev/config/). Only the `test` block's
// own `coverage` property counts, under the same disabled-value rules as vitest.config.
function viteConfigCollectsCoverage(repoPath: string, file: string): boolean {
  const directory = dirname(file);
  for (const extension of ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs']) {
    const sibling = join(repoPath, directory, `vitest.config.${extension}`);
    if (!isRegularFile(sibling)) continue;
    const vitestConfig = stripJavaScriptComments(readRepoText(sibling, 'utf8'));
    if (!/["']\.\/vite\.config(?:\.[cm]?[jt]s)?["']/.test(vitestConfig)) return false;
  }
  const contents = stripJavaScriptComments(readRepoText(join(repoPath, file), 'utf8'));
  const testProperty = /(?:^|[{,])\s*["']?test["']?\s*:\s*\{/m.exec(contents);
  if (!testProperty) return false;
  const block = balancedBraceBlock(contents, testProperty.index + testProperty[0].length - 1);
  return vitestCoveragePropertyCollects(block);
}

/** The `{...}` block opening at `open`, quote-aware; the rest of the text if it never closes. */
function balancedBraceBlock(contents: string, open: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let index = open; index < contents.length; index += 1) {
    const character = contents[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') quote = character;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return contents.slice(open, index + 1);
    }
  }
  return contents.slice(open);
}

function stripXmlComments(contents: string): string {
  return contents.replace(/<!--[\s\S]*?-->/g, '');
}

// JaCoCo's Maven plugin collects only when the build applies it: <pluginManagement> alone applies
// nothing (maven.apache.org/pom.html), and `skip` / `jacoco.skip` suppress execution.
function pomAppliesJacoco(contents: string): boolean {
  const pom = stripXmlComments(contents).replace(/<pluginManagement>[\s\S]*?<\/pluginManagement>/g, '');
  if (/<jacoco\.skip>\s*true\s*<\/jacoco\.skip>/i.test(pom)) return false;
  for (const plugin of pom.matchAll(/<plugin>([\s\S]*?)<\/plugin>/g)) {
    const body = plugin[1] ?? '';
    if (!/<artifactId>\s*jacoco-maven-plugin\s*<\/artifactId>/.test(body)) continue;
    if (/<skip>\s*true\s*<\/skip>/i.test(body)) continue;
    return true;
  }
  return false;
}

// Gradle's JaCoCo plugin, applied in either DSL: `id 'jacoco'` / `id("jacoco")` / Kotlin's bare
// `jacoco` inside `plugins { }`, or `apply plugin: 'jacoco'` / `apply(plugin = "jacoco")`.
function gradleAppliesJacoco(contents: string): boolean {
  const script = stripJavaScriptComments(contents);
  if (/\bapply\s*\(?\s*plugin\s*[:=]\s*["']jacoco["']/.test(script)) return true;
  for (const block of script.matchAll(/\bplugins\s*\{([^{}]*)\}/g)) {
    if (
      /(?:^|[\s;])(?:id\s*\(?\s*["']jacoco["']\s*\)?|jacoco)[ \t]*(?:$|[\s;])/m.test(block[1] ?? '')
    ) {
      return true;
    }
  }
  return false;
}

function isV23CoverageConfig(repoPath: string, file: string): boolean {
  if (/(^|\/)vitest\.config\.[cm]?[jt]s$/.test(file)) {
    return vitestCoveragePropertyCollects(
      stripJavaScriptComments(readRepoText(join(repoPath, file), 'utf8')),
    );
  }
  if (/(^|\/)jest\.config\.[cm]?[jt]s$/.test(file)) {
    const contents = stripJavaScriptComments(readRepoText(join(repoPath, file), 'utf8'));
    return (
      /(?:^|[{,])\s*["']?collectCoverage["']?\s*:\s*true\b/m.test(contents) ||
      /(?:^|[{,])\s*["']?(?:coverageThreshold|coverageProvider|coverageDirectory)["']?\s*:/m.test(
        contents,
      )
    );
  }
  if (/(^|\/)package\.json$/.test(file)) {
    return packageJsonHasStaticCoverageTooling(repoPath, file);
  }
  return isCoverageConfig(repoPath, file);
}

function coverageConfigurationDecision(
  repoPath: string,
  file: string,
): CoverageDetectorDecision | null {
  const detectorState = isV23CoverageConfig(repoPath, file) ? 'collects' : 'none';
  if (/(^|\/)vitest\.config\.[cm]?[jt]s$/.test(file)) {
    const rawContents = readRepoText(join(repoPath, file), 'utf8');
    const contents = stripJavaScriptComments(rawContents);
    const match = /(?:^|[{,])\s*["']?coverage["']?\s*:\s*([^,\r\n}]*)/im.exec(contents);
    if (!match) return null;
    return {
      path: file,
      source: 'runner-configuration',
      locator: 'coverage',
      evidence: rawContents.slice(match.index, match.index + match[0].length).trim(),
      detectorRecognized: true,
      detectorState,
    };
  }
  if (/(^|\/)jest\.config\.[cm]?[jt]s$/.test(file)) {
    const rawContents = readRepoText(join(repoPath, file), 'utf8');
    const contents = stripJavaScriptComments(rawContents);
    const match = /(?:^|[{,])\s*["']?(collectCoverage|coverageThreshold|coverageProvider|coverageDirectory)["']?\s*:\s*([^,\r\n}]*)/m.exec(
      contents,
    );
    if (!match) return null;
    return {
      path: file,
      source: 'runner-configuration',
      locator: match[1] ?? 'coverage',
      evidence: rawContents.slice(match.index, match.index + match[0].length).trim(),
      detectorRecognized: true,
      detectorState,
    };
  }
  if (detectorState === 'none') return null;
  return {
    path: file,
    source: 'runner-configuration',
    locator: 'coverage',
    evidence: file,
    detectorRecognized: true,
    detectorState,
  };
}

function packageJsonHasStaticCoverageTooling(repoPath: string, file: string): boolean {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return false;
  const parsed = parseJsonObject(readRepoText(fullPath, 'utf8'));
  if (!parsed) return false;
  // Jest reads its configuration from a top-level "jest" key (jestjs.io/docs/configuration);
  // the same keys, with collectCoverage only when true, that v23 reads in jest.config.
  const jest = parsed.jest;
  if (
    isRecord(jest) &&
    (jest.collectCoverage === true ||
      isRecord(jest.coverageThreshold) ||
      typeof jest.coverageProvider === 'string')
  ) {
    return true;
  }
  return ['nyc', 'c8', 'istanbul'].some((key) => {
    const config = parsed[key];
    return typeof config === 'object' && config !== null && !Array.isArray(config);
  });
}

export type CoverageCommandState = 'none' | 'collects' | 'unresolved';

// Observability seam for review evidence: `evidence` preserves the source fact while the
// detector-prefixed fields label Cejel's interpretation. This is intentionally not attached to a
// certificate or presentation surface.
export interface CoverageDetectorDecision {
  readonly path: string;
  readonly source: 'ci-run' | 'package-script' | 'recipe-command' | 'runner-configuration';
  readonly locator: string;
  /** Raw repository evidence. Callers must sanitize it before presentation or persistence. */
  readonly evidence: string;
  readonly detectorRecognized: boolean;
  readonly detectorState: CoverageCommandState;
}

export interface CoverageConfigurationAnalysis {
  readonly coverageFiles: string[];
  readonly unresolvedFiles: string[];
  readonly hasCoverageCommand: boolean;
  readonly detectorDecisions: readonly CoverageDetectorDecision[];
}

interface PackageScriptReferences {
  readonly names: string[];
  readonly dynamic: boolean;
}

interface RecipeTarget {
  readonly dependencies: string[];
  readonly commands: string[];
}

// Coverage absence is an assertion, so command-derived coverage needs two independent facts:
// a coverage-capable runner owns an enabling flag, and the command is reachable from a test entry
// point. Mentions, upload-only commands, unused scripts, and dependencies alone prove neither.
export function analyzeCoverageConfiguration(
  repoPath: string,
  repoFiles: readonly string[],
  authoredOnly = false,
): CoverageConfigurationAnalysis {
  const eligibleFiles = repoFiles.filter(
    (file) => !authoredOnly || isAuthoredProductionPath(file),
  );
  const eligibleSet = new Set(eligibleFiles);
  const coverageFiles = new Set<string>();
  const unresolvedFiles = new Set<string>();
  const ciCommandsByFile = new Map<string, string[]>();
  const detectorDecisions: CoverageDetectorDecision[] = [];
  let hasCoverageCommand = false;

  for (const file of eligibleFiles.filter(isCiWorkflow)) {
    const commands = extractCiRunCommands(readRepoText(join(repoPath, file), 'utf8'));
    ciCommandsByFile.set(file, commands);
    const commandDecisions = commands.map((command, index) =>
      coverageDetectorDecision(repoPath, eligibleSet, {
        path: file,
        source: 'ci-run',
        locator: String(index),
        command,
      }),
    );
    detectorDecisions.push(...commandDecisions);
    const state = combineCoverageCommandStates(
      commandDecisions.map((decision) => decision.detectorState),
    );
    if (state === 'collects') {
      coverageFiles.add(file);
      hasCoverageCommand = true;
    }
    if (state === 'unresolved') unresolvedFiles.add(file);
  }

  const ciCommands = [...ciCommandsByFile.values()].flat();
  for (const file of eligibleFiles) {
    if (isCiWorkflow(file) || isRecipeFile(file)) continue;
    if (/(^|\/)package\.json$/.test(file)) {
      if (packageJsonHasStaticCoverageTooling(repoPath, file)) coverageFiles.add(file);
      const packageState = packageScriptCoverageState(
        repoPath,
        eligibleSet,
        file,
        file === 'package.json' ? ciCommands : [],
        detectorDecisions,
      );
      if (packageState === 'collects') {
        coverageFiles.add(file);
        hasCoverageCommand = true;
      }
      if (packageState === 'unresolved') unresolvedFiles.add(file);
      continue;
    }
    const configurationDecision = coverageConfigurationDecision(repoPath, file);
    if (configurationDecision) detectorDecisions.push(configurationDecision);
    if (configurationDecision?.detectorState === 'collects') coverageFiles.add(file);
  }

  for (const file of eligibleFiles.filter(isRecipeFile)) {
    const state = recipeCoverageState(
      repoPath,
      eligibleSet,
      file,
      ciCommands,
      detectorDecisions,
    );
    if (state === 'collects') {
      coverageFiles.add(file);
      hasCoverageCommand = true;
    }
    if (state === 'unresolved') unresolvedFiles.add(file);
  }

  for (const file of coverageFiles) unresolvedFiles.delete(file);
  return {
    coverageFiles: [...coverageFiles].sort(),
    unresolvedFiles: [...unresolvedFiles].sort(),
    hasCoverageCommand,
    detectorDecisions,
  };
}

function unionWithLegacyCoverageRecognition(
  analysis: CoverageConfigurationAnalysis,
  legacyFiles: readonly string[],
  hasLegacyCoverageScript: boolean,
): CoverageConfigurationAnalysis {
  const legacy = new Set(legacyFiles);
  const coverageFiles = [
    ...legacyFiles,
    ...analysis.coverageFiles.filter((file) => !legacy.has(file)),
  ];
  return {
    coverageFiles,
    unresolvedFiles: analysis.unresolvedFiles.filter((file) => !legacy.has(file)),
    hasCoverageCommand: hasLegacyCoverageScript || analysis.hasCoverageCommand,
    detectorDecisions: analysis.detectorDecisions,
  };
}

function stripJavaScriptComments(contents: string): string {
  let output = '';
  let quote: "'" | '"' | '`' | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index] ?? '';
    const next = contents[index + 1] ?? '';
    if (lineComment) {
      if (character === '\n') {
        lineComment = false;
        output += '\n';
      } else {
        output += ' ';
      }
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        output += '  ';
        index += 1;
        blockComment = false;
      } else {
        output += character === '\n' ? '\n' : ' ';
      }
      continue;
    }
    if (escaped) {
      output += character;
      escaped = false;
      continue;
    }
    if (quote) {
      output += character;
      if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      output += character;
      continue;
    }
    if (character === '/' && next === '/') {
      output += '  ';
      index += 1;
      lineComment = true;
      continue;
    }
    if (character === '/' && next === '*') {
      output += '  ';
      index += 1;
      blockComment = true;
      continue;
    }
    output += character;
  }
  return output;
}

function packageScriptCoverageState(
  repoPath: string,
  repoFiles: ReadonlySet<string>,
  packageJson: string,
  ciCommands: readonly string[],
  detectorDecisions: CoverageDetectorDecision[],
): CoverageCommandState {
  const scripts = readPackageScripts(join(repoPath, packageJson));
  if (scripts.size === 0) return 'none';

  const roots = new Set<string>();
  let unresolved = false;
  if (scripts.has('test')) roots.add('test');
  for (const command of ciCommands) {
    const references = packageScriptReferences(command, scripts);
    for (const name of references.names) roots.add(name);
    if (
      references.dynamic &&
      [...scripts.values()].some(
        (candidate) =>
          commandInvokesCoverageTool(candidate) || containsPotentialCoverageFlag(candidate),
      )
    ) {
      unresolved = true;
    }
  }

  const queue = [...roots];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const name = queue.shift();
    if (!name || visited.has(name)) continue;
    const command = scripts.get(name);
    if (command === undefined) continue;
    visited.add(name);

    const decision = coverageDetectorDecision(repoPath, repoFiles, {
      path: packageJson,
      source: 'package-script',
      locator: name,
      command,
    });
    detectorDecisions.push(decision);
    const state = decision.detectorState;
    if (state === 'collects') return 'collects';
    if (state === 'unresolved') unresolved = true;

    const references = packageScriptReferences(command, scripts);
    for (const referenced of references.names) {
      if (!visited.has(referenced)) queue.push(referenced);
    }
    for (const lifecycle of [`pre${name}`, `post${name}`]) {
      if (scripts.has(lifecycle) && !visited.has(lifecycle)) queue.push(lifecycle);
    }
    if (
      references.dynamic &&
      [...scripts.values()].some(
        (candidate) =>
          commandInvokesCoverageTool(candidate) || containsPotentialCoverageFlag(candidate),
      )
    ) {
      unresolved = true;
    }
  }
  return unresolved ? 'unresolved' : 'none';
}

function packageScriptReferences(
  command: string,
  scripts: ReadonlyMap<string, string>,
): PackageScriptReferences {
  const names = new Set<string>();
  let dynamic = false;
  for (const segment of splitShellCommandSegments(command)) {
    // A `pnpm run /<regex>/` selector is never compiled: the regex is repository text, and
    // evaluating it lets the repository stall the scan (goal_cejel_scan_path_regex_bounds_2026-10-15).
    // It is a reference Cejel cannot resolve, so it takes the existing dynamic path. Any argument
    // starting with `/` counts: no literal script name below can start with one, and the former
    // `\/((?:\\.|[^/])+)\/` capture was itself ambiguous on backslashes.
    if (/\bpnpm\s+run\s+\//iu.test(segment)) dynamic = true;

    for (const match of segment.matchAll(
      /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?([A-Za-z0-9][A-Za-z0-9:._-]*)/giu,
    )) {
      const name = match[1];
      if (name && scripts.has(name)) names.add(name);
    }
    if (/\b(?:npm|pnpm|yarn)\s+run\s+(?:\$|["']\$|`)/u.test(segment)) dynamic = true;
  }
  return { names: [...names], dynamic };
}

function extractCiRunCommands(contents: string): string[] {
  const lines = contents.split(/\r?\n/);
  const commands: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const match = /^(\s*)(?:-\s*)?run\s*:\s*(.*)$/u.exec(line);
    if (!match) continue;
    const indentation = match[1]?.length ?? 0;
    const value = match[2]?.trim() ?? '';
    if (value === '|' || value === '>' || value.startsWith('|-') || value.startsWith('>-')) {
      const block: string[] = [];
      for (index += 1; index < lines.length; index += 1) {
        const nested = lines[index] ?? '';
        if (nested.trim().length === 0) {
          block.push('');
          continue;
        }
        const nestedIndentation = /^\s*/u.exec(nested)?.[0].length ?? 0;
        if (nestedIndentation <= indentation) {
          index -= 1;
          break;
        }
        block.push(nested.slice(Math.min(nested.length, indentation + 2)));
      }
      commands.push(block.join(value.startsWith('>') ? ' ' : '\n'));
      continue;
    }
    if (value.length === 0) continue;
    const quoted = /^(?:"([\s\S]*)"|'([\s\S]*)')$/u.exec(value);
    commands.push(quoted ? (quoted[1] ?? quoted[2] ?? '') : value);
  }
  return commands;
}

function isRecipeFile(file: string): boolean {
  return /(^|\/)(?:Makefile|makefile|GNUmakefile|[Jj]ustfile)$/.test(file);
}

function recipeCoverageState(
  repoPath: string,
  repoFiles: ReadonlySet<string>,
  file: string,
  ciCommands: readonly string[],
  detectorDecisions: CoverageDetectorDecision[],
): CoverageCommandState {
  const targets = readRecipeTargets(readRepoText(join(repoPath, file), 'utf8'));
  const roots = new Set(['test', 'tests', 'check'].filter((target) => targets.has(target)));
  const runner = /[Jj]ustfile$/.test(file) ? 'just' : 'make';
  for (const command of ciCommands) {
    for (const match of command.matchAll(new RegExp(`\\b${runner}\\s+([A-Za-z0-9._-]+)`, 'gu'))) {
      const target = match[1];
      if (target && targets.has(target)) roots.add(target);
    }
  }

  const queue = [...roots];
  const visited = new Set<string>();
  let unresolved = false;
  while (queue.length > 0) {
    const name = queue.shift();
    if (!name || visited.has(name)) continue;
    const target = targets.get(name);
    if (!target) continue;
    visited.add(name);
    const commandDecisions = target.commands.map((command, index) =>
      coverageDetectorDecision(repoPath, repoFiles, {
        path: file,
        source: 'recipe-command',
        locator: `${name}:${index}`,
        command,
      }),
    );
    detectorDecisions.push(...commandDecisions);
    const state = combineCoverageCommandStates(
      commandDecisions.map((decision) => decision.detectorState),
    );
    if (state === 'collects') return 'collects';
    if (state === 'unresolved') unresolved = true;
    for (const dependency of target.dependencies) {
      if (targets.has(dependency) && !visited.has(dependency)) queue.push(dependency);
    }
    for (const command of target.commands) {
      const pattern = new RegExp(`(?:\\$\\(MAKE\\)|\\b${runner})\\s+([A-Za-z0-9._-]+)`, 'gu');
      for (const match of command.matchAll(pattern)) {
        const referenced = match[1];
        if (referenced && targets.has(referenced) && !visited.has(referenced)) queue.push(referenced);
      }
    }
  }
  return unresolved ? 'unresolved' : 'none';
}

function readRecipeTargets(contents: string): Map<string, RecipeTarget> {
  const targets = new Map<string, { dependencies: string[]; commands: string[] }>();
  let active: { dependencies: string[]; commands: string[] } | null = null;
  for (const line of contents.split(/\r?\n/)) {
    const header = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*:\s*([^#]*)/u.exec(line);
    if (header) {
      const name = header[1];
      if (!name) continue;
      active = {
        dependencies: (header[2] ?? '').trim().split(/\s+/u).filter(Boolean),
        commands: [],
      };
      targets.set(name, active);
      continue;
    }
    if (active && /^\s+/u.test(line) && line.trim().length > 0) {
      active.commands.push(line.trim().replace(/^[@+-]+/u, ''));
      continue;
    }
    if (line.trim().length > 0 && !line.trimStart().startsWith('#')) active = null;
  }
  return targets;
}

interface CoverageCommandEvaluation {
  readonly recognized: boolean;
  readonly state: CoverageCommandState;
}

function coverageCommandEvaluation(
  repoPath: string,
  repoFiles: ReadonlySet<string>,
  command: string,
  depth = 0,
): CoverageCommandEvaluation {
  if (depth > 4) {
    const recognized = containsPotentialCoverageFlag(command);
    return { recognized, state: recognized ? 'unresolved' : 'none' };
  }
  const normalized = normalizeCoverageCommandPrefixes(command);
  const segments = normalized.splitShellOperators
    ? splitShellCommandSegments(normalized.segment)
    : [normalized.segment];
  const evaluations = segments.map((rawSegment): CoverageCommandEvaluation => {
    const candidate = normalizeCoverageCommandPrefixes(rawSegment);
    if (commandInvokesCoverageTool(candidate.segment)) {
      return { recognized: true, state: 'collects' };
    }
    const words = shellWords(candidate.segment);
    if (words.length === 0) return { recognized: false, state: 'none' };
    const direct = coverageFlagCommandState(words);
    if (direct !== 'none') return { recognized: true, state: direct };
    const hasCoverageSyntax = containsPotentialCoverageFlag(candidate.segment);
    if (isRecognizedCoverageFlagRunner(words)) {
      return { recognized: hasCoverageSyntax, state: 'none' };
    }

    const wrapper = reachableShellWrapper(words, repoFiles);
    if (wrapper) {
      return coverageCommandEvaluation(
        repoPath,
        repoFiles,
        readRepoText(join(repoPath, wrapper), 'utf8'),
        depth + 1,
      );
    }
    const executable = commandExecutable(words);
    const potentialFlagState = flagState(
      words.slice(1),
      ['--experimental-test-coverage', '--collectcoverage', '--collect-coverage', '--coverage', '--cov'],
      [
        '--no-experimental-test-coverage',
        '--no-collectcoverage',
        '--no-collect-coverage',
        '--no-coverage',
        '--no-cov',
      ],
    );
    if (
      hasCoverageSyntax &&
      potentialFlagState !== 'none' &&
      executable &&
      /(?:test|spec|runner)/i.test(executable) &&
      !/(?:docs?|map|report|upload|codecov|coveralls)/i.test(executable)
    ) {
      return { recognized: true, state: 'unresolved' };
    }
    return { recognized: false, state: 'none' };
  });
  return {
    recognized: evaluations.some((evaluation) => evaluation.recognized),
    state: combineCoverageCommandStates(
      evaluations.map((evaluation) => evaluation.state),
    ),
  };
}

function coverageDetectorDecision(
  repoPath: string,
  repoFiles: ReadonlySet<string>,
  input: {
    readonly path: string;
    readonly source: CoverageDetectorDecision['source'];
    readonly locator: string;
    readonly command: string;
  },
): CoverageDetectorDecision {
  const evaluation = coverageCommandEvaluation(repoPath, repoFiles, input.command);
  return {
    path: input.path,
    source: input.source,
    locator: input.locator,
    evidence: input.command,
    detectorRecognized: evaluation.recognized,
    detectorState: evaluation.state,
  };
}

function combineCoverageCommandStates(states: readonly CoverageCommandState[]): CoverageCommandState {
  if (states.includes('collects')) return 'collects';
  return states.includes('unresolved') ? 'unresolved' : 'none';
}

function shellWords(segment: string): string[] {
  const words: string[] = [];
  let offset = 0;
  while (offset < segment.length) {
    const scanned = scanShellWord(segment, offset);
    if (!scanned) break;
    words.push(scanned.word);
    if (scanned.end <= offset) break;
    offset = scanned.end;
  }
  return words;
}

function commandExecutable(words: readonly string[]): string | undefined {
  const normalized = unwrapPackageManagerExecutable(words);
  const executable = normalized[0];
  return executable ? basename(executable).replace(/\.cmd$/i, '').toLowerCase() : undefined;
}

function unwrapPackageManagerExecutable(words: readonly string[]): string[] {
  if (words.length === 0) return [];
  const first = basename(words[0] ?? '').toLowerCase();
  if (first === 'pnpm' || first === 'yarn') {
    const second = words[1]?.toLowerCase();
    return words.slice(second === 'exec' || second === 'dlx' ? 2 : 1);
  }
  if (first === 'npx') return words.slice(1).filter((word) => !/^--(?:yes|no-install)$/u.test(word));
  if (first === 'npm' && words[1]?.toLowerCase() === 'exec') {
    let offset = 2;
    while (/^--(?:yes|no-install)$/u.test(words[offset] ?? '')) offset += 1;
    if (words[offset] === '--') offset += 1;
    return words.slice(offset);
  }
  return [...words];
}

function coverageFlagCommandState(words: readonly string[]): CoverageCommandState {
  const command = unwrapPackageManagerExecutable(words);
  const executable = basename(command[0] ?? '').replace(/\.cmd$/i, '').toLowerCase();
  const args = command.slice(1);
  if (!executable) return 'none';

  if (executable === 'node') {
    if (!args.includes('--test')) return 'none';
    return flagState(args, ['--experimental-test-coverage'], ['--no-experimental-test-coverage']);
  }
  if (executable === 'pytest' || executable === 'py.test') {
    return flagState(args, ['--cov'], ['--no-cov']);
  }
  if (executable === 'bun' || executable === 'deno') {
    if (args[0]?.toLowerCase() !== 'test') return 'none';
    return flagState(args.slice(1), ['--coverage'], ['--no-coverage']);
  }
  if (executable === 'jest') {
    return flagState(
      args,
      ['--coverage', '--collectcoverage', '--collect-coverage'],
      ['--no-coverage', '--no-collectcoverage', '--no-collect-coverage'],
    );
  }
  if (executable === 'vitest' || executable === 'bnt') {
    return flagState(args, ['--coverage'], ['--no-coverage']);
  }
  // goal_cejel_v26_coverage_config_recognition_2026-10-14, each from the tool's own documentation.
  if (isPythonModuleRunner(executable, args)) {
    // `python -m pytest` is pytest (docs.pytest.org); flags before `-m` are the interpreter's.
    return flagState(args.slice(2), ['--cov'], ['--no-cov']);
  }
  if (executable === 'go') {
    if (args[0]?.toLowerCase() !== 'test') return 'none';
    // Everything after -args goes to the test binary uninterpreted (go help testflag).
    const end = args.findIndex((arg, index) => index > 0 && /^--?args$/i.test(arg));
    return goTestCoverageState(end < 0 ? args.slice(1) : args.slice(1, end));
  }
  if (executable === 'dotnet') {
    if (args[0]?.toLowerCase() !== 'test') return 'none';
    // Arguments after `--` are RunSettings key=value pairs, not dotnet test options.
    const end = args.indexOf('--', 1);
    return dotnetTestCoverageState(end < 0 ? args.slice(1) : args.slice(1, end));
  }
  if (executable === 'cargo') {
    const subcommand = args[0]?.startsWith('+') ? args.slice(1) : args;
    if (subcommand[0]?.toLowerCase() !== 'llvm-cov') return 'none';
    // `report`, `clean` and `show-env` run no tests, nor does `--no-run`; `run` runs a binary,
    // not the tests (github.com/taiki-e/cargo-llvm-cov).
    if (['report', 'clean', 'show-env', 'run'].includes(subcommand[1]?.toLowerCase() ?? '')) {
      return 'none';
    }
    const end = subcommand.indexOf('--');
    const owned = end < 0 ? subcommand.slice(1) : subcommand.slice(1, end);
    return owned.some((arg) => arg.toLowerCase() === '--no-run') ? 'none' : 'collects';
  }
  return 'none';
}

function isPythonModuleRunner(executable: string, args: readonly string[]): boolean {
  return (
    /^(?:python[0-9.]*|py)$/.test(executable) &&
    args[0] === '-m' &&
    (args[1] === 'pytest' || args[1] === 'py.test')
  );
}

// `-cover` enables coverage; `-covermode`, `-coverpkg` and `-coverprofile` each "set -cover"
// whatever their value. Go accepts one or two leading dashes.
function goTestCoverageState(args: readonly string[]): CoverageCommandState {
  let enabled = false;
  let disabled = false;
  let unresolved = false;
  for (const raw of args) {
    const [name, assigned] = raw.toLowerCase().replace(/^--/u, '-').split('=', 2);
    if (name === '-covermode' || name === '-coverpkg' || name === '-coverprofile') {
      enabled = true;
    } else if (name === '-cover') {
      if (assigned === undefined || /^(?:true|t|1)$/u.test(assigned)) enabled = true;
      else if (/^(?:false|f|0)$/u.test(assigned)) disabled = true;
      else unresolved = true;
    }
  }
  if (unresolved || (enabled && disabled)) return 'unresolved';
  return enabled ? 'collects' : 'none';
}

// `--collect "XPlat Code Coverage"` (coverlet) or `--collect "Code Coverage"` (Microsoft), the
// friendly name case-insensitive (learn.microsoft.com/dotnet/core/testing/unit-testing-code-coverage);
// or coverlet.msbuild's `/p:CollectCoverage=true` (coverlet MSBuildIntegration.md).
function dotnetTestCoverageState(args: readonly string[]): CoverageCommandState {
  let enabled = false;
  let disabled = false;
  let unresolved = false;
  for (let index = 0; index < args.length; index += 1) {
    const lower = (args[index] ?? '').toLowerCase();
    const collect = /^--collect(?:[:=]([\s\S]*))?$/u.exec(lower);
    if (collect) {
      const value = (collect[1] ?? args[(index += 1)]?.toLowerCase() ?? '').trim();
      if (/\$|\{|\}/u.test(value)) unresolved = true;
      else if (value === 'xplat code coverage' || value === 'code coverage') enabled = true;
      continue;
    }
    const property = /^(?:[/-]p|--property):([\s\S]*)$/u.exec(lower);
    if (!property) continue;
    for (const assignment of (property[1] ?? '').split(/[;,]/u)) {
      const [name, value] = assignment.split('=', 2).map((part) => part.trim());
      if (name !== 'collectcoverage' || value === undefined) continue;
      if (value === 'true') enabled = true;
      else if (value === 'false') disabled = true;
      else unresolved = true;
    }
  }
  if (unresolved || (enabled && disabled)) return 'unresolved';
  return enabled ? 'collects' : 'none';
}

function isRecognizedCoverageFlagRunner(words: readonly string[]): boolean {
  const command = unwrapPackageManagerExecutable(words);
  const executable = basename(command[0] ?? '').replace(/\.cmd$/i, '').toLowerCase();
  if (['bnt', 'vitest', 'jest', 'pytest', 'py.test'].includes(executable)) return true;
  if (executable === 'node') return command.slice(1).includes('--test');
  if (isPythonModuleRunner(executable, command.slice(1))) return true;
  const subcommand = command[1]?.toLowerCase();
  if (executable === 'go' || executable === 'dotnet') return subcommand === 'test';
  if (executable === 'cargo') {
    return (subcommand?.startsWith('+') ? command[2] : command[1])?.toLowerCase() === 'llvm-cov';
  }
  return (executable === 'bun' || executable === 'deno') && subcommand === 'test';
}

function flagState(
  args: readonly string[],
  enablingNames: readonly string[],
  disablingNames: readonly string[],
): CoverageCommandState {
  let enabled = false;
  let disabled = false;
  let unresolved = false;
  const enabling = new Set(enablingNames.map((name) => name.toLowerCase()));
  const disabling = new Set(disablingNames.map((name) => name.toLowerCase()));

  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index] ?? '';
    const lower = raw.toLowerCase();
    if (disabling.has(lower)) {
      disabled = true;
      continue;
    }
    const [name, assigned] = lower.split('=', 2);
    if (!name || !enabling.has(name)) continue;
    if (assigned !== undefined) {
      if (assigned === 'false' || assigned === '0' || assigned === 'off') disabled = true;
      else if (/\$|\{|\}/u.test(assigned)) unresolved = true;
      else enabled = true;
      continue;
    }
    const next = args[index + 1]?.toLowerCase();
    if (next === 'false' || next === '0' || next === 'off') {
      disabled = true;
      index += 1;
    } else if (next && /\$|\{|\}/u.test(next)) {
      unresolved = true;
      index += 1;
    } else {
      enabled = true;
    }
  }
  if (unresolved || (enabled && disabled)) return 'unresolved';
  return enabled && !disabled ? 'collects' : 'none';
}

function containsPotentialCoverageFlag(command: string): boolean {
  return /(?:^|\s)--(?:experimental-test-coverage|collect-?coverage|no-coverage|coverage|no-cov|cov)(?:[=\s]|$)/iu.test(
    command,
  );
}

function reachableShellWrapper(
  words: readonly string[],
  repoFiles: ReadonlySet<string>,
): string | undefined {
  const executable = basename(words[0] ?? '').toLowerCase();
  const candidate = /^(?:ba|da|k|z)?sh$/u.test(executable) ? words[1] : words[0];
  if (!candidate || !/(?:^|\/)\.?[^\s]*\.sh$/i.test(candidate)) return undefined;
  const normalized = candidate.replace(/^\.\//u, '');
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) return undefined;
  return repoFiles.has(normalized) ? normalized : undefined;
}

function commandInvokesCoverageTool(command: string): boolean {
  return normalizedCommandInvokesCoverageTool(normalizeCoverageCommandPrefixes(command), 0);
}

function normalizedCommandInvokesCoverageTool(
  normalized: { segment: string; splitShellOperators: boolean },
  depth: number,
): boolean {
  const segments = normalized.splitShellOperators
    ? splitShellCommandSegments(normalized.segment)
    : [normalized.segment];
  return segments.some((rawSegment) => {
    const candidate = normalizeCoverageCommandPrefixes(rawSegment);
    if (/^(?:nyc|c8|istanbul)(?:\s|$)/iu.test(candidate.segment)) return true;
    return (
      depth < 4 &&
      candidate.splitShellOperators &&
      candidate.segment !== rawSegment.trim() &&
      normalizedCommandInvokesCoverageTool(candidate, depth + 1)
    );
  });
}

function splitShellCommandSegments(command: string): string[] {
  const segments: string[] = [];
  let start = 0;
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === '#' && (index === 0 || /[\s;|&()]/u.test(command[index - 1] ?? ''))) {
      segments.push(command.slice(start, index));
      const newline = command.indexOf('\n', index + 1);
      if (newline < 0) return segments;
      index = newline;
      start = newline + 1;
      continue;
    }

    const isBoundary =
      character === ';' || character === '|' || character === '&' || character === '\n';
    if (!isBoundary) continue;
    segments.push(command.slice(start, index));
    if ((character === '|' || character === '&') && command[index + 1] === character) index += 1;
    start = index + 1;
  }
  segments.push(command.slice(start));
  return segments;
}

function normalizeCoverageCommandPrefixes(rawSegment: string): {
  segment: string;
  splitShellOperators: boolean;
} {
  let segment = rawSegment.trim();
  let unwrapQuotedShellCommand = false;
  let splitShellOperators = true;
  for (let index = 0; index < 8; index += 1) {
    const before = segment;
    segment = stripOuterShellGroup(segment);
    segment = segment.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)*/u, '');
    segment = segment.replace(
      /^(?:npx|npm\s+exec|pnpm\s+(?:exec|dlx)|yarn\s+(?:exec|dlx))(?:\s+--(?:no-install|yes))*(?:\s+--)?\s+/iu,
      '',
    );
    segment = segment.replace(/^(?:command(?:\s+-p)?(?:\s+--)?|time(?:\s+-p)?)\s+/iu, '');
    const explicitShellCommand = extractExplicitShellCommand(segment);
    if (explicitShellCommand !== null) {
      segment = explicitShellCommand;
      unwrapQuotedShellCommand = false;
      splitShellOperators = true;
    }
    const environmentPrefix = stripEnvironmentCommandPrefix(segment);
    segment = environmentPrefix.segment;
    unwrapQuotedShellCommand ||= environmentPrefix.unwrapQuotedShellCommand;
    if (environmentPrefix.splitShellOperators !== null) {
      splitShellOperators = environmentPrefix.splitShellOperators;
    }
    if (segment === before) break;
  }
  return {
    segment: unwrapQuotedShellCommand ? segment.replace(/^(["'])(.*)\1$/u, '$2').trim() : segment,
    splitShellOperators,
  };
}

function extractExplicitShellCommand(segment: string): string | null {
  const shellExecutable = /^(?:(?:\/(?:usr\/)?bin\/)?(?<shell>(?:ba|da|k|z)?sh))(?=\s|$)/iu.exec(
    segment,
  );
  if (!shellExecutable) return null;
  const shell = shellExecutable.groups?.shell?.toLowerCase();
  if (!shell) return null;

  let offset = shellExecutable[0].length;
  let noExecute = false;
  let dumpStrings = false;
  for (let optionCount = 0; optionCount < 32; optionCount += 1) {
    const option = scanShellWord(segment, offset);
    if (!option || (!option.word.startsWith('-') && !option.word.startsWith('+'))) return null;
    offset = option.end;

    if (option.word === '--') return null;

    const zshLongOption =
      shell === 'zsh' ? /^(?<sign>--|\+-)(?<name>[A-Za-z][A-Za-z_-]*)$/u.exec(option.word) : null;
    if (zshLongOption) {
      const optionName = zshLongOption.groups?.name?.replaceAll('-', '');
      if (!optionName) return null;
      const resolvedSetOption = resolveSupportedShellSetOption(shell, optionName);
      if (!resolvedSetOption && !isSupportedZshLongInvocationOption(optionName)) return null;
      if (resolvedSetOption?.name === 'noexec') {
        noExecute = (zshLongOption.groups?.sign === '--') !== resolvedSetOption.inverted;
      }
      continue;
    }

    if (option.word === '--rcfile' || option.word === '--init-file') {
      const operand = scanShellWord(segment, offset);
      if (shell !== 'bash' || !operand) return null;
      offset = operand.end;
      continue;
    }
    if (
      shell === 'bash' &&
      /^--(?:debug|debugger|login|noediting|noprofile|norc|posix|protected|restricted|verbose)$/u.test(
        option.word,
      )
    ) {
      continue;
    }

    const cluster = parseSupportedShellOptionCluster(shell, option.word);
    if (!cluster) return null;
    if (cluster.changesNoExecute) noExecute = cluster.sign === '-';
    if (cluster.enablesDumpStrings) dumpStrings = true;

    if (cluster.operandKind) {
      const operand = scanShellWord(segment, offset);
      const resolvedSetOperand =
        operand && cluster.operandKind === 'set'
          ? resolveSupportedShellSetOption(shell, operand.word)
          : null;
      const operandIsZshInvocationOption =
        shell === 'zsh' &&
        operand !== null &&
        cluster.operandKind === 'set' &&
        isSupportedZshLongInvocationOption(operand.word);
      const operandIsSupported =
        cluster.operandKind === 'set'
          ? resolvedSetOperand !== null || operandIsZshInvocationOption
          : shell === 'bash' && operand && BASH_SHOPT_OPTIONS.has(operand.word);
      if (!operand || !operandIsSupported) return null;
      if (resolvedSetOperand?.name === 'noexec') {
        noExecute = (cluster.sign === '-') !== resolvedSetOperand.inverted;
      }
      offset = operand.end;
    }

    if (cluster.hasCommand) {
      return noExecute || dumpStrings ? null : readShellWord(segment, offset);
    }
  }
  return null;
}

const BASH_SET_OPTIONS = new Set([
  'allexport',
  'braceexpand',
  'emacs',
  'errexit',
  'errtrace',
  'functrace',
  'hashall',
  'histexpand',
  'history',
  'ignoreeof',
  'keyword',
  'monitor',
  'noclobber',
  'noexec',
  'noglob',
  'nolog',
  'notify',
  'nounset',
  'onecmd',
  'physical',
  'pipefail',
  'posix',
  'privileged',
  'verbose',
  'vi',
  'xtrace',
]);

const BASH_SHOPT_OPTIONS = new Set([
  'autocd',
  'cdable_vars',
  'cdspell',
  'checkhash',
  'checkjobs',
  'checkwinsize',
  'cmdhist',
  'complete_fullquote',
  'direxpand',
  'dirspell',
  'dotglob',
  'execfail',
  'expand_aliases',
  'extdebug',
  'extglob',
  'extquote',
  'failglob',
  'force_fignore',
  'globasciiranges',
  'globskipdots',
  'globstar',
  'gnu_errfmt',
  'histappend',
  'histreedit',
  'histverify',
  'hostcomplete',
  'huponexit',
  'inherit_errexit',
  'interactive_comments',
  'lastpipe',
  'lithist',
  'localvar_inherit',
  'localvar_unset',
  'login_shell',
  'mailwarn',
  'nocaseglob',
  'nocasematch',
  'no_empty_cmd_completion',
  'nullglob',
  'progcomp',
  'progcomp_alias',
  'promptvars',
  'restricted_shell',
  'shift_verbose',
  'sourcepath',
  'varredir_close',
  'xpg_echo',
]);

const POSIX_SET_OPTIONS = new Set([
  'allexport',
  'errexit',
  'ignoreeof',
  'noclobber',
  'noexec',
  'noglob',
  'nounset',
  'verbose',
  'vi',
  'xtrace',
]);

const ZSH_LONG_INVOCATION_OPTIONS = new Set([
  'interactive',
  'login',
  'privileged',
  'shinstdin',
  'stdin',
]);

function isSupportedShellSetOption(shell: string, option: string): boolean {
  if (shell === 'bash') return BASH_SET_OPTIONS.has(option);
  if (shell === 'sh' || shell === 'dash') return POSIX_SET_OPTIONS.has(option);
  if (shell === 'ksh' || shell === 'zsh') {
    return POSIX_SET_OPTIONS.has(option) || option === 'pipefail';
  }
  return false;
}

function normalizeShellSetOption(shell: string, option: string): string {
  if (shell === 'zsh') return option.toLowerCase().replaceAll('_', '');
  return option;
}

function isSupportedZshLongInvocationOption(option: string): boolean {
  const normalized = normalizeShellSetOption('zsh', option);
  if (ZSH_LONG_INVOCATION_OPTIONS.has(normalized)) return true;
  return (
    normalized.startsWith('no') &&
    !normalized.startsWith('nono') &&
    ZSH_LONG_INVOCATION_OPTIONS.has(normalized.slice(2))
  );
}

function resolveSupportedShellSetOption(
  shell: string,
  option: string,
): { name: string; inverted: boolean } | null {
  const normalized = normalizeShellSetOption(shell, option);
  if (shell === 'zsh' && normalized === 'exec') {
    return { name: 'noexec', inverted: true };
  }
  if (isSupportedShellSetOption(shell, normalized)) {
    return { name: normalized, inverted: false };
  }
  if (
    shell === 'zsh' &&
    normalized.startsWith('no') &&
    !normalized.startsWith('nono') &&
    isSupportedShellSetOption(shell, normalized.slice(2))
  ) {
    return { name: normalized.slice(2), inverted: true };
  }
  return null;
}

function parseSupportedShellOptionCluster(
  shell: string,
  option: string,
): {
  sign: '-' | '+';
  hasCommand: boolean;
  changesNoExecute: boolean;
  enablesDumpStrings: boolean;
  operandKind: 'set' | 'shopt' | null;
} | null {
  if (!/^[+-][A-Za-z]+$/u.test(option)) return null;
  const sign = option[0] as '-' | '+';
  let letters = option.slice(1);
  let operandKind: 'set' | 'shopt' | null = null;
  const operandLetter = letters.at(-1);
  if (operandLetter === 'o' || operandLetter === 'O') {
    if (operandLetter === 'O' && shell !== 'bash') return null;
    letters = letters.slice(0, -1);
    if (letters.includes('c')) return null;
    operandKind = operandLetter === 'o' ? 'set' : 'shopt';
  }

  const supportedLetters =
    shell === 'bash'
      ? 'abcefhkmnptuvxBCEHPTilrsD'
      : shell === 'sh'
        ? 'abCcefimnsuvx'
        : shell === 'dash'
          ? 'abCcefilmnsuvx'
          : 'acefilmnpsuvx';
  if (![...letters].every((letter) => supportedLetters.includes(letter))) return null;

  return {
    sign,
    hasCommand: letters.includes('c'),
    changesNoExecute: letters.includes('n'),
    enablesDumpStrings: shell === 'bash' && letters.includes('D'),
    operandKind,
  };
}

function scanShellWord(value: string, start: number): { word: string; end: number } | null {
  let result = '';
  let quote: "'" | '"' | null = null;
  let escaped = false;
  let index = start;

  while (index < value.length && /\s/u.test(value[index] ?? '')) index += 1;
  const wordStart = index;

  for (; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      if (character !== '\n') result += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      const nextCharacter = value[index + 1];
      const escapesNext =
        quote !== '"' ||
        nextCharacter === '$' ||
        nextCharacter === '`' ||
        nextCharacter === '"' ||
        nextCharacter === '\\' ||
        nextCharacter === '\n';
      if (escapesNext) {
        escaped = true;
      } else {
        result += character;
      }
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        result += character;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/u.test(character ?? '')) break;
    result += character;
  }

  if (escaped || quote || index === wordStart) return null;
  return { word: result, end: index };
}

function readShellWord(value: string, start: number): string | null {
  return scanShellWord(value, start)?.word ?? null;
}

function stripOuterShellGroup(segment: string): string {
  if (!segment.startsWith('(') || segment.startsWith('((')) return segment;

  let depth = 0;
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (let index = 0; index < segment.length; index += 1) {
    const character = segment[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === '(') {
      depth += 1;
      continue;
    }
    if (character !== ')') continue;
    depth -= 1;
    if (depth < 0) return segment;
    if (depth === 0) {
      if (segment.slice(index + 1).trim().length > 0) return segment;
      return segment.slice(1, index).trim();
    }
  }
  return segment;
}

function stripEnvironmentCommandPrefix(segment: string): {
  segment: string;
  unwrapQuotedShellCommand: boolean;
  splitShellOperators: boolean | null;
} {
  const wrapper = /^(cross-env(?:-shell)?|env)(?:\s|$)/iu.exec(segment);
  if (!wrapper) {
    return { segment, unwrapQuotedShellCommand: false, splitShellOperators: null };
  }

  let remainder = segment.slice(wrapper[0].length).trimStart();
  let unwrapQuotedShellCommand = wrapper[1]?.toLowerCase() === 'cross-env-shell';
  let splitShellOperators = true;
  while (remainder.length > 0) {
    const splitString =
      /^(?:-S|--split-string)(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s]+))(?:\s+|$)/u.exec(remainder);
    if (splitString) {
      const splitCommand = splitString[1] ?? splitString[2] ?? splitString[3] ?? '';
      remainder = `${splitCommand} ${remainder.slice(splitString[0].length)}`.trim();
      unwrapQuotedShellCommand = false;
      splitShellOperators = false;
      continue;
    }

    const assignment = /^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)(?:\s+|$)/u.exec(
      remainder,
    );
    if (assignment) {
      remainder = remainder.slice(assignment[0].length).trimStart();
      continue;
    }

    const optionWithValue =
      /^(?:-u|--unset|-C|--chdir)(?:=|\s+)(?:"[^"]*"|'[^']*'|[^\s]+)(?:\s+|$)/u.exec(remainder);
    if (optionWithValue) {
      remainder = remainder.slice(optionWithValue[0].length).trimStart();
      continue;
    }

    const flag = /^(?:--ignore-environment|-i|--)(?:\s+|$)/u.exec(remainder);
    if (flag) {
      remainder = remainder.slice(flag[0].length).trimStart();
      continue;
    }
    break;
  }
  return { segment: remainder, unwrapQuotedShellCommand, splitShellOperators };
}

function isCiWorkflow(file: string): boolean {
  return (
    /^\.github\/workflows\/.+\.ya?ml$/.test(file) ||
    /^\.gitlab-ci\.ya?ml$/.test(file) ||
    /^\.circleci\/config\.ya?ml$/.test(file) ||
    /^azure-pipelines\.ya?ml$/.test(file) ||
    /^Jenkinsfile$/.test(file)
  );
}

function isDeployConfig(file: string): boolean {
  return (
    /(^|\/)(vercel|netlify|fly|render|railway)\.(json|toml|ya?ml)$/.test(file) ||
    /(^|\/)Dockerfile$/.test(file) ||
    /(^|\/)docker-compose\.ya?ml$/.test(file) ||
    /(^|\/)k8s\//.test(file)
  );
}

// Explicit deploy targets — Dockerfile alone is excluded because it is often
// a build or CI artifact; require it paired with a server entrypoint or
// a platform-specific deploy config to treat a repo as a deployable service.
function isExplicitDeployTarget(file: string): boolean {
  return (
    /(^|\/)(vercel|netlify|fly|render|railway)\.(json|toml|ya?ml)$/.test(file) ||
    /(^|\/)docker-compose\.ya?ml$/.test(file) ||
    /(^|\/)Procfile$/.test(file) ||
    /(^|\/)app\.ya?ml$/.test(file) ||
    /(^|\/)serverless\.ya?ml$/.test(file) ||
    /(^|\/)(k8s|kubernetes|manifests?)\/.+\.ya?ml$/i.test(file) ||
    /(^|\/)(charts?|helm)\/.+\.ya?ml$/i.test(file)
  );
}

// Entry-point-shaped file names (main, server, app, wsgi, asgi, index, etc.).
// Limiting server-entrypoint content scanning to these avoids false positives
// on framework source files that define (but do not call) listen/serve methods.
const MAIN_ENTRYPOINT_FILE_PATTERN =
  /(^|\/)(main|server|app|wsgi|asgi|index|entry|start|run)\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs)$/i;
const RACK_ENTRYPOINT_FILE_PATTERN = /(^|\/)(?:config\.ru|(?:main|server|app|start|run)\.rb)$/i;

// app.listen / app.run under a test/example/fixture dir does NOT make the repo a deployable
// service — uses the shared isTestOrFixturePath classifier (see canonical block above), not a
// private regex of its own.

// Active server/port-binding calls across common frameworks and languages.
// Matches invocations (app.listen(port), uvicorn.run(app, ...), etc.) rather
// than method definitions in framework source (Application.prototype.listen = ...).
const SERVER_ENTRYPOINT_PATTERN =
  /\bapp\.listen\s*\(|\bserver\.listen\s*\(\s*(?:PORT|port|\d+)|http\.ListenAndServe\s*\(|http\.ListenAndServeTLS\s*\(|axum::Server(?:::|\.)|actix_web::HttpServer(?:::|\.)|uvicorn\.run\s*\(/;
// V20-only direct Node HTTP shape. Requiring both an entrypoint-shaped authored path and a
// bounded createServer(...).listen(port) expression avoids changing historical deployability
// classification or treating a helper that merely constructs an unbound server as production.
const V20_DIRECT_HTTP_SERVER_PATTERN =
  /\b(?:http|https)\.createServer\s*\([\s\S]{0,1500}?\)\.listen\s*\(\s*(?:PORT|port|\d+)/;
// Firebase/Netlify-style serverless functions convention. See healthReadinessRouteReads above
// for why this is a separate, signal-scoped pattern rather than a change to isImplementationFile.
const HEALTH_ROUTE_FUNCTIONS_DIR_PATTERN =
  /(^|\/)functions\/.*\.(?:ts|tsx|js|jsx|py|go|rs|java|rb|cpp|cc|cxx|c|h|hpp|kt|swift|php)$/;
// goal_cejel_a3_handler_shapes_and_inline_health_2026-10-12: the other ordinary homes of a
// production HTTP entrypoint that sit outside isImplementationFile's directory list, catalogued
// in a3-health-route-idioms.test.ts. Each is anchored to the REPOSITORY ROOT, never to a nested
// path, so `docs/api/index.js` or `vendor/server/x.js` cannot match:
//   - a root-level single-file server (`server.ts`, `index.js`, `app.ts`, `main.js`), the
//     smallest Express/Fastify service layout;
//   - a `server/`, `backend/` or `api/` tree (a conventional Node backend root; `api/` is also the
//     Vercel functions directory).
// Scoped to this one signal like the functions/ pattern above. It is always evaluated together
// with isAuthoredProductionPath, which still excludes tests, fixtures, examples, generated and
// vendored paths; `scripts/`, `tools/` and `docs/` are not admitted.
const HEALTH_ROUTE_ENTRYPOINT_HOME_PATTERN =
  /^(?:(?:server|index|app|main)\.(?:ts|tsx|js|jsx|mjs|cjs)|(?:server|backend|api)\/.*\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php))$/;
// Widened from an exact `["'`]/(health|ready|...)["'`]` match, which required the route
// literal to contain nothing but the bare keyword. That missed the Kubernetes convention
// (/healthz, /readyz, /livez), any mount prefix (/api/health), and any suffix (/health/live) —
// all public-documentation idioms, not narrow spellings. Still bounded to a single path segment
// on each side of the keyword so it cannot cross string boundaries or read like arbitrary prose;
// a route defined by a router mounted at '/health' with its own relative '/' handler is a
// cross-expression case this pattern still cannot see (goal_cejel_a3_runtime_pattern_coverage,
// stated as out of scope).
//
// goal_cejel_a3_health_route_idioms_v23 widened this further, on fixture evidence
// (a3-health-route-idioms.test.ts), in two bounded ways plus one new keyword:
//   - a single `_` or `-` is now allowed directly between the mandatory leading `/` and the
//     keyword (`/_health`, `/-/ready` already matched via the multi-segment case; `/_health` did
//     not, and it is the same GAE/`_ah`-style convention).
//   - bare whole-string keywords are limited to healthz, readiness, and liveness.
//     The common word health additionally requires `@Get('health')` decorator context.
//     Whole-string matching alone still credits unrelated state/event/config literals such as
//     'ready', 'live', and 'health'; the idiom suite guards those false positives.
// `up` was added as a keyword — Rails' documented convention (`/up`) — but ONLY in the
// slash-anchored form above, never in the bare-string alternative: an un-anchored bare 'up' also
// matches ordinary direction/toggle literals (`'up' | 'down'`), which the slash requirement rules
// out. `ping`, `status`, and `alive` were considered and deliberately left uncredited: they are
// either too generic (a `/status` or `/ping` endpoint is common for meanings that have nothing to
// do with health) or not a named, documented convention the way `/up` and `/healthz` are — see
// the idiom table in a3-health-route-idioms.test.ts. A trailing query string (`/health?probe=1`)
// is also deliberately left uncredited: crediting it would also credit an outbound probe/test URL
// with a query string appended, and this signal treats a false assertion as worse than a miss.
const V20_HEALTH_OR_READINESS_ROUTE_PATTERN =
  /["'`](?:[\w${}./-]{0,60}\/[_-]?(?:(?:health|ready|live)z?|readiness|liveness|up)(?=["'`/])|(?:healthz|readiness|liveness)(?=["'`]))|@Get\s*\(\s*(["'`])health\1\s*\)/i;
// Express recognizes error-handling middleware by arity alone — any four-parameter
// function/arrow is treated as an error handler — but the canonical public-documentation form
// names the parameters (err, req, res, next), optionally TypeScript-typed. Matching by name
// rather than bare arity keeps this from firing on an unrelated four-parameter function.
//
// The type-annotation group tolerates one level of generic type arguments (`Request<P, ResBody,
// ReqBody>`) by treating a balanced `<...>` span as a single atom the surrounding comma-split
// cannot see inside — a bare `[^,()]+` stops at the first comma INSIDE the generic, so a
// realistic Express+TypeScript handler typed with route/response/body generics never matched.
// Does not handle nested generics (`Foo<Bar<Baz, Qux>>`); that is a documented limit, not silent.
//
// goal_cejel_a3_error_boundary_idioms_2026-09-22: the first and fourth parameter names also
// tolerate a leading underscore (`_err`, `_next`) — the ordinary lint-driven convention for
// marking a required-but-unused parameter, still a named four-parameter match, not an arity-only
// one. A three-parameter form with `next` omitted entirely is deliberately NOT matched here:
// Express recognizes error middleware by arity, so a bare `(err, req, res)` is indistinguishable
// from ordinary middleware missing its fourth parameter by mistake, and matching on three names
// alone is the arity-adjacent false positive this pattern exists to avoid. Stated limit, not a
// silent gap: recorded in src/witan/__tests__/a3-error-boundary-idioms.test.ts.
//
// goal_cejel_a3_handler_shapes_and_inline_health_2026-10-12 widened this in two bounded ways, on
// fixture evidence (rows 10a-10h in the same test file):
//   - the second and third parameter names (`req`/`request`, `res`/`response`) also tolerate a
//     leading underscore. Same lint convention as `_err`/`_next`: a required-but-unused
//     parameter, `(err, _req, res, next)`, is the ordinary spelling when the handler never reads
//     the request. Still four NAMED parameters, never an arity-only match.
//   - one optional trailing comma after the fourth parameter and its optional type, before the
//     closing paren. Prettier's default `trailingComma: "all"` emits it on every multi-line
//     parameter list, so a handler formatted one parameter per line never matched. `,?` allows
//     exactly one comma after `next`; it does not admit an extra parameter, and a three-parameter
//     list with a trailing comma stays uncredited (row 4c's limit is unchanged).
// Reachability (EXPRESS_MIDDLEWARE_REACHABLE_PATTERN) and the test/docs/comment exclusions apply
// unchanged to every newly matched shape: rows D6-D8 pin that.
const EXPRESS_ERROR_MIDDLEWARE_PATTERN =
  /\(\s*(?:_?err|_?error)(?:\s*:\s*(?:[^,()<]|<[^<>]*>)*)?\s*,\s*_?(?:req|request)(?:\s*:\s*(?:[^,()<]|<[^<>]*>)*)?\s*,\s*_?(?:res|response)(?:\s*:\s*(?:[^,()<]|<[^<>]*>)*)?\s*,\s*_?next(?:\s*:\s*(?:[^,()<]|<[^<>]*>)*)?\s*,?\s*\)\s*(?:=>|\{)/i;
// A parameter-shape match alone also matches a fully dead, never-registered stub. Requiring the
// same file to show some sign the handler is reachable — passed directly to `.use(`, or exported
// so another file could import and register it — excludes tutorial boilerplate copy-pasted into
// an unrelated file with nothing else referencing it, without requiring the wiring call site
// itself to be in the same file (frequently isn't: a named handler declared in one file is
// commonly registered via `app.use(errorHandler)` in the app's entrypoint).
//
// goal_cejel_a3_error_boundary_idioms_2026-09-22: `export class` added alongside the existing
// `export default`/`function`/`const` alternatives — a class-based handler
// (`export class ErrorService { handleError(err, req, res, next) {...} }`, registered elsewhere
// via `app.use(svc.handleError.bind(svc))`) is a real, public-documentation Express idiom that
// the original three alternatives did not cover. Evaluated with comments stripped first (see
// fileMatchesOutsideComments) so a commented-out `.use(` cannot satisfy this pattern while
// registering nothing.
const EXPRESS_MIDDLEWARE_REACHABLE_PATTERN =
  /\.use\s*\(|\bmodule\.exports\b|\bexport\s+(?:default\b|function\b|const\b|class\b)/;
// A3's filename-convention error boundary: `error-boundary.tsx`, or a Next.js-style `error.tsx`
// route file. Anchored to a whole path segment (#433).
const ERROR_BOUNDARY_FILENAME_PATTERN = /(^|\/)(?:error-boundary|error)\.(?:tsx|jsx|ts|js)$/;
const RACK_SERVER_ENTRYPOINT_PATTERN = /Rack::(?:Server|Handler(?:::\w+)?)\.(?:start|run)\s*\(/;
const RACK_CONFIG_RUN_PATTERN = /^\s*run\s+(?:(?:[A-Z]\w*(?:::\w+)*(?:\.new)?|lambda)\b|->)/m;
const RUNTIME_CONTAINER_COMMAND_PATTERN =
  /^\s*(?:CMD|ENTRYPOINT)\s+.*(?:\b(?:start|serve|server|qgis|nginx|apache|gunicorn|uvicorn)\b|manage\.py\s+runserver).*$/im;
const NON_RUNTIME_CONTAINER_COMMAND_PATTERN = /\b(?:test|lint|build|compile|package|check)\b/i;
const V20_NODE_RUNTIME_CONTAINER_COMMAND_PATTERN =
  /\bnode\b.*\b(?:main|server|app|service|index)\.(?:[cm]?js|ts)\b/i;

// CI workflow job/step patterns that indicate a real deployment step.
// Covers named deploy jobs in YAML and common deploy CLI commands.
const CI_DEPLOY_JOB_PATTERN =
  /(?:^\s{2,4}deploy\s*:|\b(?:fly|heroku|vercel|netlify|railway|render)\s+deploy\b|kubectl\s+apply\b|helm\s+(?:install|upgrade|deploy)\b|docker\s+push\b)/im;

function isDeployableService(
  repoPath: string,
  repoFiles: readonly string[],
  useV27Detectors: boolean,
): boolean {
  // Explicit platform deploy target (Procfile, vercel.json, docker-compose, k8s, etc.)
  if (
    repoFiles.some(
      (file) =>
        (useV27Detectors ? isAuthoredProductionPath(file) : isProductionSourcePath(file)) &&
        isExplicitDeployTarget(file),
    )
  ) {
    return true;
  }
  // CI workflow with a real deploy job/step
  if (detectCiDeployJob(repoPath, repoFiles, useV27Detectors)) return true;
  // Production server entrypoint in a main/server/app file (not in examples/tests)
  if (detectServerEntrypoint(repoPath, repoFiles, useV27Detectors)) return true;
  // A production Dockerfile is a runtime surface only when it declares an actual start
  // command. Build/test-only Dockerfiles remain non-deployable.
  if (useV27Detectors && findRuntimeContainerEntrypointFile(repoPath, repoFiles)) return true;
  return false;
}

function detectCiDeployJob(
  repoPath: string,
  repoFiles: readonly string[],
  authoredOnly = false,
): boolean {
  const workflows = repoFiles.filter(
    (file) => (!authoredOnly || isAuthoredProductionPath(file)) && isCiWorkflow(file),
  );
  return workflows.some((file) => fileContains(repoPath, file, CI_DEPLOY_JOB_PATTERN));
}

function detectServerEntrypoint(
  repoPath: string,
  repoFiles: readonly string[],
  useV27Detectors: boolean,
): boolean {
  return findServerEntrypointFile(repoPath, repoFiles, useV27Detectors) !== null;
}

function findServerEntrypointFile(
  repoPath: string,
  repoFiles: readonly string[],
  useV27Detectors: boolean,
): string | null {
  // Restrict to entry-point-shaped files to avoid matching framework source files
  // (e.g. gin's gin.go, express's lib/application.js) that define but never call serve.
  const candidates = repoFiles
    .filter(
      (file) =>
        (MAIN_ENTRYPOINT_FILE_PATTERN.test(file) ||
          (useV27Detectors && RACK_ENTRYPOINT_FILE_PATTERN.test(file))) &&
        (useV27Detectors ? isAuthoredProductionPath(file) : isProductionSourcePath(file)),
    )
    .slice(0, 30);
  return (
    candidates.find(
      (file) =>
        fileContains(repoPath, file, SERVER_ENTRYPOINT_PATTERN) ||
        (useV27Detectors && fileContains(repoPath, file, RACK_SERVER_ENTRYPOINT_PATTERN)) ||
        (useV27Detectors &&
          /\.ru$/i.test(file) &&
          fileContains(repoPath, file, RACK_CONFIG_RUN_PATTERN)),
    ) ?? null
  );
}

function findV20DirectHttpServerEntrypointFile(
  repoPath: string,
  repoFiles: readonly string[],
): string | null {
  return (
    repoFiles
      .filter(
        (file) => MAIN_ENTRYPOINT_FILE_PATTERN.test(file) && isAuthoredProductionPath(file),
      )
      .slice(0, 30)
      .find((file) => fileContains(repoPath, file, V20_DIRECT_HTTP_SERVER_PATTERN)) ?? null
  );
}

const V22_SIMPLE_PACKAGE_START_PATTERN =
  /^(?:node|tsx)\s+(\.?\/?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.[cm]?[jt]s)$/;

function findV22PackageStartHttpServerEntrypointFile(
  repoPath: string,
  repoFiles: readonly string[],
): string | null {
  const packageJson = findRootPackageJson(repoFiles);
  if (!packageJson) return null;
  const start = readPackageScripts(join(repoPath, packageJson)).get('start')?.trim();
  if (!start) return null;
  const declaredPath = V22_SIMPLE_PACKAGE_START_PATTERN.exec(start)?.[1];
  if (!declaredPath) return null;
  const normalizedPath = declaredPath.replace(/^\.\//, '');
  if (
    normalizedPath.startsWith('/') ||
    normalizedPath.split('/').includes('..') ||
    !repoFiles.includes(normalizedPath) ||
    !isAuthoredProductionPath(normalizedPath)
  ) {
    return null;
  }
  return fileContains(repoPath, normalizedPath, V20_DIRECT_HTTP_SERVER_PATTERN)
    ? normalizedPath
    : null;
}

function findRuntimeContainerEntrypointFile(
  repoPath: string,
  repoFiles: readonly string[],
  useV20NodeEntrypoints = false,
): string | null {
  return (
    repoFiles
      .filter((file) => /(^|\/)Dockerfile$/i.test(file) && isAuthoredProductionPath(file))
      .find((file) => {
        const fullPath = join(repoPath, file);
        if (!isRegularFile(fullPath)) return false;
        const lines = readRepoText(fullPath, 'utf8').split(/\r?\n/);
        const finalStageStart = lines.reduce(
          (last, line, index) => (/^\s*FROM\b/i.test(line) ? index : last),
          0,
        );
        const finalStageLines = lines.slice(finalStageStart);
        const entrypoint = [...finalStageLines]
          .reverse()
          .find((line) => /^\s*ENTRYPOINT\b/i.test(line));
        const command = [...finalStageLines].reverse().find((line) => /^\s*CMD\b/i.test(line));
        const effectiveCommand = [entrypoint, command].filter(Boolean).join(' ');
        return (
          effectiveCommand.length > 0 &&
          (RUNTIME_CONTAINER_COMMAND_PATTERN.test(effectiveCommand) ||
            (useV20NodeEntrypoints &&
              V20_NODE_RUNTIME_CONTAINER_COMMAND_PATTERN.test(effectiveCommand))) &&
          !NON_RUNTIME_CONTAINER_COMMAND_PATTERN.test(effectiveCommand)
        );
      }) ?? null
  );
}

function isHealthCheckSignalFile(repoPath: string, file: string): boolean {
  if (/docs\/|audit|architecture|adr/i.test(file)) return false;
  if (/^Dockerfile$/.test(file) && fileContains(repoPath, file, /\bHEALTHCHECK\b/i)) return true;
  if (/k8s\/|kubernetes\/|helm\//.test(file)) {
    return fileContains(repoPath, file, /livenessProbe|readinessProbe/i);
  }
  if (/(^|\/)(health|healthcheck|readiness|liveness|ready)\.[cm]?[jt]sx?$/.test(file)) {
    return fileContains(repoPath, file, /health|ready|readiness|liveness/i);
  }
  if (/(^|\/)(health|healthcheck|readiness|liveness|ready)\.py$/.test(file)) {
    return fileContains(repoPath, file, /health|ready|readiness|liveness/i);
  }
  return false;
}

function isDependencyManifest(file: string): boolean {
  return /(^|\/)(package\.json|pyproject\.toml|requirements(?:[^/]*)?\.txt|go\.mod|Cargo\.toml|pom\.xml|build\.gradle|vcpkg\.json|Pipfile|CMakeLists\.txt|conanfile\.txt|conanfile\.py)$/.test(
    file,
  );
}

function isLockfile(file: string): boolean {
  return /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|uv\.lock|poetry\.lock|go\.sum|Cargo\.lock|Pipfile\.lock|composer\.lock|conan\.lock|vcpkg\.lock\.json)$/.test(
    file,
  );
}

function isDependencyUpdateConfig(file: string): boolean {
  return (
    /(^|\/)(renovate\.json|renovate\.json5|\.renovaterc\.json|dependabot\.ya?ml)$/.test(file) ||
    /^\.github\/dependabot\.ya?ml$/.test(file)
  );
}

function packageJsonHasAuditScript(repoPath: string, manifest: string): boolean {
  if (!manifest.endsWith('package.json')) return false;
  const scripts = readPackageScripts(join(repoPath, manifest));
  return [...scripts.values()].some((script) =>
    /\b(audit|npm audit|pnpm audit|yarn audit)\b/i.test(script),
  );
}

function packageJsonHasHeavyTestDependency(repoPath: string, manifest: string): boolean {
  const fullPath = join(repoPath, manifest);
  if (!isRegularFile(fullPath)) return false;
  const parsed = parseJsonObject(readRepoText(fullPath, 'utf8'));
  if (!parsed) return false;
  const names = [
    ...Object.keys(isRecord(parsed.dependencies) ? parsed.dependencies : {}),
    ...Object.keys(isRecord(parsed.devDependencies) ? parsed.devDependencies : {}),
  ];
  return names.some((name) => HEAVY_TEST_DEPENDENCY_NAME_PATTERN.test(name));
}

function packageJsonDescribesPackagedApplication(
  repoPath: string,
  manifest: string,
  repoFiles: readonly string[],
): boolean {
  const fullPath = join(repoPath, manifest);
  if (!isRegularFile(fullPath)) return false;
  const parsed = parseJsonObject(readRepoText(fullPath, 'utf8'));
  if (!parsed) return false;
  const scripts = isRecord(parsed.scripts) ? Object.values(parsed.scripts) : [];
  const dependencies = {
    ...(isRecord(parsed.dependencies) ? parsed.dependencies : {}),
    ...(isRecord(parsed.devDependencies) ? parsed.devDependencies : {}),
  };
  const build = isRecord(parsed.build) ? parsed.build : null;
  const hasDesktopRuntime = Object.keys(dependencies).some(
    (name) => name.toLowerCase() === 'electron' || /^@tauri-apps\/(?:api|plugin-)/i.test(name),
  );
  const hasPackagingCommand = scripts.some(
    (script) =>
      typeof script === 'string' &&
      /\b(?:electron-builder|electron-packager|tauri\s+build)\b/i.test(script),
  );
  const hasApplicationMetadata =
    isNonEmptyString(parsed.productName) ||
    isNonEmptyString(parsed.main) ||
    (build != null && isNonEmptyString(build.appId)) ||
    findTauriApplicationMetadata(repoPath, manifest, repoFiles);
  return hasDesktopRuntime && hasPackagingCommand && hasApplicationMetadata;
}

function findTauriApplicationMetadata(
  repoPath: string,
  manifest: string,
  repoFiles: readonly string[],
): boolean {
  const manifestDirectory = dirname(manifest);
  const prefix = manifestDirectory === '.' ? '' : `${manifestDirectory}/`;
  const candidates = [`${prefix}src-tauri/tauri.conf.json`, `${prefix}tauri.conf.json`];
  return candidates.some((file) => {
    if (!repoFiles.includes(file)) return false;
    const fullPath = join(repoPath, file);
    if (!isRegularFile(fullPath)) return false;
    const config = parseJsonObject(readRepoText(fullPath, 'utf8'));
    const packageMetadata = isRecord(config?.package) ? config.package : null;
    return (
      isNonEmptyString(config?.productName) ||
      isNonEmptyString(config?.identifier) ||
      (packageMetadata != null && isNonEmptyString(packageMetadata.productName))
    );
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isImplementationFile(file: string): boolean {
  return (
    /(^|\/)(src|app|lib|packages|cmd|include|source|Sources)\//.test(file) &&
    /\.(ts|tsx|js|jsx|py|go|rs|java|rb|cpp|cc|cxx|c|h|hpp|kt|swift|php)$/.test(file)
  );
}

function isAuditFile(file: string): boolean {
  return (
    // goal_cejel_calibration_fix_with_strict_gate_2026-07-06: mature OSS repos document the
    // same audit-trail practice under different filenames/extensions than Alfred's own
    // conventions (Flask ships CHANGES.rst, not CHANGELOG.md) — recognize the common OSS
    // release-notes/security-policy/provenance equivalents so real audit-trail artifacts are
    // credited instead of silently missing the pattern.
    /(^|\/)(CHANGELOG|CHANGES|HISTORY|NEWS|RELEASE_NOTES|RELEASES|SECURITY|AUDIT|STATUS)\.(md|rst|txt)$/i.test(
      file,
    ) ||
    /(^|\/)docs\/.*(audit|runbook|incident|changelog|security).*\.(md|rst)$/i.test(file) ||
    // Provenance/signed-release tooling config is itself audit-trail evidence (a repo that
    // wires SLSA/cosign attestation or CITATION.cff is documenting release provenance).
    /(^|\/)CITATION\.cff$/i.test(file)
  );
}

// A security-policy document (SECURITY.md and its docs/*security* equivalent) is a static
// vulnerability-disclosure notice, not a changelog/audit trail — real-world copies rarely
// change after being written, so there is no "freshness" for B4 to rate. Every other
// isAuditFile match (CHANGELOG/CHANGES/HISTORY/NEWS/RELEASE_NOTES/RELEASES/AUDIT/STATUS,
// docs runbook/incident/changelog notes, CITATION.cff) is a genuine over-time trail.
// goal_cejel_b4_archetype_gate_2026-07-11: distinguishes "has a security policy" from
// "has an audit trail" so the N/A gate below can tell them apart.
function isSecurityPolicyOnlyAuditFile(file: string): boolean {
  return (
    /(^|\/)SECURITY\.(md|rst|txt)$/i.test(file) || /(^|\/)docs\/.*security.*\.(md|rst)$/i.test(file)
  );
}

function isFreshnessRatableAuditFile(file: string): boolean {
  return isAuditFile(file) && !isSecurityPolicyOnlyAuditFile(file);
}

function isIgnoredScanFile(file: string, useV47Detectors = false): boolean {
  return (
    /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|README\.md|CHANGELOG\.md)$/.test(file) ||
    isEnvTemplatePath(file, useV47Detectors)
  );
}

// v24-only. README.md and CHANGELOG.md are documentation pages, and excluding them BY NAME is the
// same class of path rule this rubric exists to remove: the README is where a placeholder is most
// likely and, for exactly that reason, the last place anyone would look for a real credential.
// Lockfiles and `.env` templates stay excluded — a lockfile is a generated artifact (the same
// family as GENERATED_OR_VENDOR_PATH_PATTERN, which v24 does not touch), and an
// `.env.example`/`.sample`/`.template` is placeholder content by definition, which is a claim
// about content rather than a claim about a directory.
function isV24IgnoredScanFile(file: string): boolean {
  return (
    /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(file) ||
    isEnvTemplatePath(file, true)
  );
}

function findRootPackageJson(repoFiles: readonly string[]): string | null {
  return repoFiles.includes('package.json') ? 'package.json' : null;
}

// Declared workspace packages (goal_cejel_v26_workspace_package_scripts_2026-10-14). In npm, yarn
// and pnpm workspaces the root package.json often only orchestrates and the scripts live in the
// workspace packages, so a script check that reads the root alone asserts an absence the repository
// does not have. A recognition fix under every rubric, not gated on rubric version.
//
// Only what the workspace DECLARES is read: the root package.json `workspaces` field (array form,
// https://docs.npmjs.com/cli/v10/using-npm/workspaces, and yarn's `{ packages: [...] }` form,
// https://classic.yarnpkg.com/lang/en/docs/workspaces/) and the `packages:` list of a root
// pnpm-workspace.yaml (https://pnpm.io/pnpm-workspace_yaml). No declaration, no reading: workspaces
// are never inferred from directory shape. Globs are matched against package directories in the
// scan's existing file inventory — never a filesystem walk — with `*`, `?` and whole-segment `**`
// supported and leading-dot segments unmatched by wildcards. A `!` pattern excludes whatever it
// matches, in any position. Each package.json must also pass A1's authored-production predicate
// (isAuthoredProductionPath), so vendored, generated and test/example trees never count.
//
// Fails toward the root-only behaviour, never toward a credit: a negation that cannot be parsed,
// more than WORKSPACE_PATTERN_LIMIT patterns, or an unreadable declaration discards the whole
// declaration; an unparseable positive pattern matches nothing. At most
// WORKSPACE_PACKAGE_MANIFEST_LIMIT manifests are read, in path order, and the count declared
// beyond that is kept so callers can say so.
const WORKSPACE_PATTERN_LIMIT = 64;
const WORKSPACE_PACKAGE_MANIFEST_LIMIT = 200;

interface DeclaredWorkspaceManifests {
  /** Authored workspace package.json paths read, path-sorted, at most the manifest limit. */
  readonly read: readonly string[];
  /** Authored workspace package.json paths the declaration matched, before the cap. */
  readonly declared: number;
  /**
   * True when a declaration exists but was discarded, or one of its patterns matched nothing
   * because it could not be parsed. Read only by v26 item 8, for which that is an unread place.
   */
  readonly unreadable?: true;
}

const NO_DECLARED_WORKSPACE_MANIFESTS: DeclaredWorkspaceManifests = { read: [], declared: 0 };
const UNREADABLE_WORKSPACE_DECLARATION: DeclaredWorkspaceManifests = {
  read: [],
  declared: 0,
  unreadable: true,
};

function findDeclaredWorkspaceManifests(
  repoPath: string,
  repoFiles: readonly string[],
  rootPackageJson: string | null,
): DeclaredWorkspaceManifests {
  const patterns: string[] = [];
  if (rootPackageJson) {
    const declared = readPackageJsonWorkspacePatterns(join(repoPath, rootPackageJson));
    if (declared === null) return UNREADABLE_WORKSPACE_DECLARATION;
    patterns.push(...declared);
  }
  if (repoFiles.includes('pnpm-workspace.yaml')) {
    const declared = readPnpmWorkspacePatterns(join(repoPath, 'pnpm-workspace.yaml'));
    if (declared === null) return UNREADABLE_WORKSPACE_DECLARATION;
    patterns.push(...declared);
  }
  if (patterns.length === 0) return NO_DECLARED_WORKSPACE_MANIFESTS;
  if (patterns.length > WORKSPACE_PATTERN_LIMIT) return UNREADABLE_WORKSPACE_DECLARATION;
  const include: ((dir: string) => boolean)[] = [];
  const exclude: ((dir: string) => boolean)[] = [];
  let unparsedPattern = false;
  for (const pattern of patterns) {
    const negated = pattern.startsWith('!');
    const matcher = workspaceGlobMatcher(negated ? pattern.slice(1) : pattern);
    if (negated) {
      if (matcher === null) return UNREADABLE_WORKSPACE_DECLARATION;
      exclude.push(matcher);
    } else if (matcher !== null) {
      include.push(matcher);
    } else {
      unparsedPattern = true;
    }
  }
  const matched = repoFiles
    .filter((file) => {
      if (file === rootPackageJson || !file.endsWith('/package.json')) return false;
      if (!isAuthoredProductionPath(file)) return false;
      const dir = file.slice(0, -'/package.json'.length);
      return include.some((matches) => matches(dir)) && !exclude.some((matches) => matches(dir));
    })
    .sort();
  return {
    read: matched.slice(0, WORKSPACE_PACKAGE_MANIFEST_LIMIT),
    declared: matched.length,
    ...(unparsedPattern ? { unreadable: true as const } : {}),
  };
}

/** `[]` when the manifest declares no workspaces; null when it cannot be read as declared. */
function readPackageJsonWorkspacePatterns(packageJsonPath: string): string[] | null {
  if (!isRegularFile(packageJsonPath)) return [];
  const parsed = parseJsonObject(readRepoText(packageJsonPath, 'utf8'));
  const workspaces = parsed?.workspaces;
  if (workspaces === undefined) return [];
  const list = isRecord(workspaces) ? workspaces.packages : workspaces;
  if (list === undefined && isRecord(workspaces)) return [];
  if (!Array.isArray(list) || !list.every((entry) => typeof entry === 'string')) return null;
  return list as string[];
}

/**
 * The `packages:` list of a pnpm-workspace.yaml: a top-level block sequence of plain or quoted
 * scalars, or a one-line flow sequence. Anything else under `packages:` is null (unreadable),
 * never a guess. Other top-level keys (catalog, onlyBuiltDependencies, ...) are skipped.
 */
function readPnpmWorkspacePatterns(yamlPath: string): string[] | null {
  if (!isRegularFile(yamlPath)) return [];
  const patterns: string[] = [];
  let inPackages = false;
  for (const line of readRepoText(yamlPath, 'utf8').split(/\r?\n/)) {
    if (!inPackages) {
      const key = /^packages\s*:(.*)$/.exec(line);
      if (!key) continue;
      const rest = stripYamlLineComment(key[1] ?? '').trim();
      if (rest === '') {
        inPackages = true;
        continue;
      }
      const flow = /^\[(.*)\]$/.exec(rest);
      if (!flow) return null;
      if ((flow[1] ?? '').trim() === '') return [];
      for (const item of (flow[1] ?? '').split(',')) {
        const scalar = yamlScalar(item.trim());
        if (scalar === null) return null;
        patterns.push(scalar);
      }
      return patterns;
    }
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item) {
      const scalar = yamlScalar((item[1] ?? '').trim());
      if (scalar === null) return null;
      patterns.push(scalar);
      continue;
    }
    if (/^\S/.test(line)) break;
    return null;
  }
  return patterns;
}

function stripYamlLineComment(text: string): string {
  return /^\s*#/.test(text) ? '' : text.replace(/\s+#.*$/, '');
}

function yamlScalar(raw: string): string | null {
  const single = /^'((?:[^']|'')*)'\s*(?:#.*)?$/.exec(raw);
  if (single) return (single[1] ?? '').replace(/''/g, "'");
  const double = /^"([^"\\]*)"\s*(?:#.*)?$/.exec(raw);
  if (double) return double[1] ?? '';
  const plain = stripYamlLineComment(raw).trim();
  return plain === '' || /^["'[{&*|>]/.test(plain) ? null : plain;
}

// A declared glob is repository text, so it is never compiled to a regex: a glob with many `*`s
// against a long directory name backtracked polynomially and stalled the scan
// (goal_cejel_scan_path_regex_bounds_2026-10-15). Past either cap a pattern is unparseable.
export const WORKSPACE_GLOB_MAX_LENGTH = 256;
export const WORKSPACE_GLOB_MAX_SEGMENTS = 32;

/**
 * A workspace glob as a matcher over a package directory, or null when unsupported. `*` and `?`
 * stay inside one segment; a whole `**` segment is zero or more segments (one or more when it is
 * the entire pattern); a segment starting with `*` or `?`, and every segment `**` crosses, never
 * matches a leading dot. Matching is iterative, with no regex and no recursion: a set of reachable
 * pattern positions advanced one path segment at a time, each segment compared by
 * `matchesWildcardSegment`.
 */
export function workspaceGlobMatcher(pattern: string): ((dir: string) => boolean) | null {
  // Capped before any normalisation, so no regex below ever sees an unbounded pattern.
  if (pattern.length > WORKSPACE_GLOB_MAX_LENGTH) return null;
  const normalised = pattern.trim().replace(/^\.\//, '').replace(/\/+$/, '');
  if (
    normalised === '' ||
    normalised.startsWith('/') ||
    /(^|\/)\.\.?(\/|$)/.test(normalised) ||
    /[[\]{}()!+@\\]/.test(normalised)
  ) {
    return null;
  }
  const split = normalised.split('/');
  if (split.length > WORKSPACE_GLOB_MAX_SEGMENTS) return null;
  // Consecutive `**` segments mean the same as one.
  const segments = split.filter((segment, index, all) => !(segment === '**' && all[index - 1] === '**'));
  const isAnySegment = (part: string): boolean => part !== '' && !part.startsWith('.');
  if (segments.length === 1 && segments[0] === '**') {
    return (dir) => dir.split('/').every(isAnySegment);
  }
  return (dir) => {
    // reachable[i]: the path segments read so far can be matched by segments[0..i).
    let reachable = withGlobstarSkips(segments, [true, ...segments.map(() => false)]);
    for (const part of dir.split('/')) {
      const next = segments.map(() => false).concat(false);
      segments.forEach((segment, index) => {
        if (!reachable[index]) return;
        if (segment === '**') {
          if (isAnySegment(part)) next[index] = true;
        } else if (matchesWildcardSegment(segment, part)) {
          next[index + 1] = true;
        }
      });
      reachable = withGlobstarSkips(segments, next);
      if (!reachable.includes(true)) return false;
    }
    return reachable[segments.length] === true;
  };
}

/** A `**` matches zero segments too, so reaching it also reaches the position after it. */
function withGlobstarSkips(segments: readonly string[], reachable: boolean[]): boolean[] {
  segments.forEach((segment, index) => {
    if (segment === '**' && reachable[index]) reachable[index + 1] = true;
  });
  return reachable;
}

/**
 * One glob segment against one path segment, `*` any run and `?` any one character. The standard
 * iterative wildcard match: two indices and one backtrack point (the latest `*`), no recursion.
 */
function matchesWildcardSegment(glob: string, part: string): boolean {
  if ((glob.startsWith('*') || glob.startsWith('?')) && part.startsWith('.')) return false;
  let g = 0;
  let p = 0;
  let starGlob = -1;
  let starPart = 0;
  while (p < part.length) {
    if (g < glob.length && glob[g] === '*') {
      starGlob = g;
      starPart = p;
      g += 1;
    } else if (g < glob.length && (glob[g] === '?' || glob[g] === part[p])) {
      g += 1;
      p += 1;
    } else if (starGlob !== -1) {
      g = starGlob + 1;
      starPart += 1;
      p = starPart;
    } else {
      return false;
    }
  }
  while (g < glob.length && glob[g] === '*') g += 1;
  return g === glob.length;
}

// Presentation-only disclosure (goal_cejel_certificate_reads_disclosure_2026-10-13): the citation
// names one workflow file, so the certificate states how many the criterion counted or read.
// Nothing here feeds a score, a weight, or file selection.
//
// `verb` is the true one for the criterion: B3 opens every workflow's content ('read'); A3 and B2
// count path-recognised workflows ('counted'). `unread` is the workflows the file walk withheld
// before any collector saw them, grouped by existing skip reason (never an invented one). Silent
// when nothing differs, so a repository with one workflow file renders exactly as before.
//
// `delegated` (goal_cejel_v26_unread_ci_disclosure_2026-10-14) is the steps the read workflows hand
// to code Cejel does not read; only B3, which reads workflow commands, passes it. Silent at zero.
export function ciWorkflowCitationLabel(
  baseLabel: string,
  verb: 'read' | 'counted',
  considered: number,
  cited: number,
  unread: ReadonlyMap<ContentReadSkipReason, number>,
  delegated: DelegatedCiSteps = NO_DELEGATED_CI_STEPS,
): string {
  const unreadTotal = [...unread.values()].reduce((sum, count) => sum + count, 0);
  const { crossRepositoryReusableWorkflows: crossRepository, compositeActions } = delegated;
  const delegatedTotal = crossRepository + compositeActions;
  if (considered <= cited && unreadTotal === 0 && delegatedTotal === 0) return baseLabel;
  const parts = [
    `${considered} workflow file${considered === 1 ? '' : 's'} ${verb}`,
    `${cited} cited`,
  ];
  if (unreadTotal > 0) {
    const reasons = [...unread.keys()].sort().join(', ');
    parts.push(`${unreadTotal} not read (${reasons})`);
  }
  if (delegatedTotal === 0) return `${baseLabel} (${parts.join('; ')})`;
  const delegatedCount = `${delegatedTotal} delegated step${delegatedTotal === 1 ? '' : 's'} not read`;
  const kinds = [
    ...(crossRepository > 0
      ? [
          `${crossRepository} reusable workflow${crossRepository === 1 ? ' in another repository' : 's in other repositories'}`,
        ]
      : []),
    ...(compositeActions > 0
      ? [`${compositeActions} local action${compositeActions === 1 ? '' : 's'}`]
      : []),
  ];
  const full = `${baseLabel} (${[...parts, `${delegatedCount} (${kinds.join(', ')})`].join('; ')})`;
  // The per-kind breakdown is the only part dropped to stay within the schema's label cap; the
  // count always stays. At most four skip reasons reach `unread` (excluded_by_extension paths are
  // never withheld), so the short form fits for any count below 10,000.
  return full.length <= EVIDENCE_LABEL_MAX_LENGTH
    ? full
    : `${baseLabel} (${[...parts, delegatedCount].join('; ')})`;
}

// WitanEvidencePointerSchema's `label` maximum.
const EVIDENCE_LABEL_MAX_LENGTH = 180;

export interface DelegatedCiSteps {
  readonly crossRepositoryReusableWorkflows: number;
  readonly compositeActions: number;
}

const NO_DELEGATED_CI_STEPS: DelegatedCiSteps = {
  crossRepositoryReusableWorkflows: 0,
  compositeActions: 0,
};

function sumDelegatedCiSteps(left: DelegatedCiSteps, right: DelegatedCiSteps): DelegatedCiSteps {
  return {
    crossRepositoryReusableWorkflows:
      left.crossRepositoryReusableWorkflows + right.crossRepositoryReusableWorkflows,
    compositeActions: left.compositeActions + right.compositeActions,
  };
}

// `{owner}/{repo}/.github/workflows/{file}.yml@{ref}`: GitHub's form for calling a reusable
// workflow from another repository. A same-repository call written this way also names content
// at a ref Cejel does not read, so it is counted with them.
const CROSS_REPOSITORY_REUSABLE_WORKFLOW_PATTERN =
  /^[^./\s][^/\s]*\/[^/\s]+\/\.github\/workflows\/[^@\s]+\.ya?ml@\S+$/u;

// Counts, per recognised GitHub Actions workflow under `root`, the `uses:` values that hand work to
// code Cejel does not read: a reusable workflow in another repository, and a local action (a
// `./path` whose directory holds action.yml or action.yaml; GitHub runs nothing as an action from
// a directory without one). A local reusable workflow (`./.github/workflows/x.yml`) is one of the
// workflows already read, and a marketplace action (`actions/checkout@v4`) runs no repository
// command, so neither is counted. Presentation only: nothing here feeds a score or a weight.
function countDelegatedCiSteps(root: string, workflows: readonly string[]): DelegatedCiSteps {
  let crossRepositoryReusableWorkflows = 0;
  let compositeActions = 0;
  for (const file of workflows) {
    if (!/^\.github\/workflows\//.test(file)) continue;
    const fullPath = join(root, file);
    if (!isRegularFile(fullPath)) continue;
    for (const uses of extractWorkflowUsesValues(readRepoText(fullPath, 'utf8'))) {
      if (CROSS_REPOSITORY_REUSABLE_WORKFLOW_PATTERN.test(uses)) {
        crossRepositoryReusableWorkflows += 1;
        continue;
      }
      if (!uses.startsWith('./') || /^\.\/\.github\/workflows\//.test(uses)) continue;
      const directory = uses.slice(2).replace(/\/+$/u, '');
      if (directory.length === 0 || directory.split('/').includes('..')) continue;
      if (
        isRegularFile(join(root, directory, 'action.yml')) ||
        isRegularFile(join(root, directory, 'action.yaml'))
      ) {
        compositeActions += 1;
      }
    }
  }
  return { crossRepositoryReusableWorkflows, compositeActions };
}

// Line-based, like extractCiRunCommands: every `uses:` key's scalar value, unquoted and without a
// trailing comment. A commented-out line never matches, and lines inside a `|` or `>` block scalar
// (a `run:` script that merely prints "uses: ...") are skipped.
function extractWorkflowUsesValues(contents: string): string[] {
  const values: string[] = [];
  let blockScalarIndentation: number | null = null;
  for (const line of contents.split(/\r?\n/u)) {
    const indentation = /^\s*/u.exec(line)?.[0].length ?? 0;
    if (blockScalarIndentation !== null) {
      if (line.trim().length === 0 || indentation > blockScalarIndentation) continue;
      blockScalarIndentation = null;
    }
    const match = /^\s*(?:-\s*)?uses\s*:\s*(.*)$/u.exec(line);
    if (match) {
      const value = (match[1] ?? '').replace(/\s+#.*$/u, '').trim();
      const quoted = /^(?:"(.*)"|'(.*)')$/u.exec(value);
      values.push(quoted ? (quoted[1] ?? quoted[2] ?? '') : value);
      continue;
    }
    if (/:\s*[|>][-+0-9]*\s*(?:#.*)?$/u.test(line)) blockScalarIndentation = indentation;
  }
  return values;
}

function unreadCiWorkflowReasons(
  includes: (file: string) => boolean,
): Map<ContentReadSkipReason, number> {
  const unread = new Map<ContentReadSkipReason, number>();
  for (const { path, reasons } of withheldRepoPaths()) {
    if (!isCiWorkflow(path) || !includes(path)) continue;
    const reason = [...reasons].sort()[0];
    if (reason !== undefined) unread.set(reason, (unread.get(reason) ?? 0) + 1);
  }
  return unread;
}

// v26 item 8 (docs/calibration/v26/ruling-item-8.md, operator-signed). A3's "declares neither a
// build nor a typecheck script" finding claims the deployed package has no build or type-check
// step. Under v26 it fires only when all three of the ruling's conditions hold:
//   B-1 the root package has authored TypeScript or a tsconfig (otherwise nothing to build, and
//       nothing to disclose);
//   B-2 no step from BUILD_STEP_* below is found in any package script, CI `run`, Dockerfile `RUN`
//       or Makefile/justfile target read (a step found: nothing to disclose);
//   B-3 every place a step could be was read, and every command in them could be parsed.
// Where the ruling is silent this takes the reading that fires less; each such reading is named
// where it is made. Nothing here feeds a metric.
type V26BuildStepSettlement = 'nothing-to-build' | 'step-found' | 'unsettled' | 'fires';
type BuildStepCommandState = 'step' | 'none' | 'unparseable';

// B-2's fixed vocabulary, matched against the command word after shell splitting, never as a
// substring. A compiler, type checker or bundler run under its own name...
const BUILD_STEP_EXECUTABLES: ReadonlySet<string> = new Set([
  'babel',
  'esbuild',
  'ncc',
  'rollup',
  'svelte-check',
  'swc',
  'tsc',
  'tsup',
  'vue-tsc',
  'webpack',
  'webpack-cli',
]);
// ...one whose build is a subcommand of a wider tool (`vite` alone is a dev server)...
const BUILD_STEP_SUBCOMMANDS: ReadonlyMap<string, string> = new Map([
  ['bun', 'build'],
  ['nest', 'build'],
  ['next', 'build'],
  ['ng', 'build'],
  ['parcel', 'build'],
  ['vite', 'build'],
]);
// ...and a task runner's `build` or `typecheck` target, whatever it runs (Nx also as `project:build`).
const BUILD_STEP_TASK_RUNNERS: ReadonlySet<string> = new Set([
  'bun',
  'gmake',
  'just',
  'lerna',
  'make',
  'npm',
  'nx',
  'pnpm',
  'turbo',
  'yarn',
]);
const BUILD_STEP_TARGET_NAME_PATTERN = /^(?:build|typecheck)$/u;
const BUILD_STEP_TARGET_ARGUMENT_PATTERN = /^(?:[^\s:]+:)?(?:build|typecheck)$/u;

const TYPESCRIPT_SOURCE_PATTERN = /\.(?:ts|tsx|mts|cts)$/u;
const TYPESCRIPT_DECLARATION_PATTERN = /\.d\.(?:ts|mts|cts)$/u;
const TSCONFIG_PATTERN = /(^|\/)tsconfig[^/]*\.json$/u;
const BUILD_STEP_DOCKERFILE_PATTERN = /(^|\/)(?:dockerfile|containerfile)(?:\.[^/]*)?$|[^/]\.dockerfile$/iu;

function settleV26BuildStepEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  packageJson: string,
  workspaceManifests: DeclaredWorkspaceManifests,
  workflows: readonly string[],
  includesWorkflow: (file: string) => boolean,
): V26BuildStepSettlement {
  // B-1. "The package the manifest belongs to" is read narrowly: a file under a directory with its
  // own package.json, workspace or not, belongs to that package, and only authored, readable paths
  // count. A .d.mts or .d.cts is a declaration like a .d.ts.
  const nestedPackageDirs = repoFiles
    .filter((file) => file !== packageJson && /(^|\/)package\.json$/u.test(file))
    .map((file) => file.slice(0, -'package.json'.length));
  const hasSomethingToBuild = repoFiles.some(
    (file) =>
      isAuthoredProductionPath(file) &&
      ((TYPESCRIPT_SOURCE_PATTERN.test(file) && !TYPESCRIPT_DECLARATION_PATTERN.test(file)) ||
        TSCONFIG_PATTERN.test(file)) &&
      !nestedPackageDirs.some((dir) => file.startsWith(dir)),
  );
  if (!hasSomethingToBuild) return 'nothing-to-build';

  // B-2, one block per place. A command that cannot be parsed, or a read file that cannot be
  // parsed as its kind, is not read as an absence: it leaves the question unsettled (B-3).
  let unsettled = false;
  const commandRunsStep = (command: string): boolean => {
    const state = classifyBuildStepCommand(command);
    if (state === 'unparseable') unsettled = true;
    return state === 'step';
  };

  // Place 1: any script, under any name, in the root or a declared workspace package.json read.
  for (const manifest of [packageJson, ...workspaceManifests.read]) {
    const scripts = readBuildStepPackageScripts(join(repoPath, manifest));
    if (scripts === null) {
      unsettled = true;
      continue;
    }
    for (const [name, command] of scripts) {
      if (BUILD_STEP_TARGET_NAME_PATTERN.test(name) || commandRunsStep(command)) return 'step-found';
    }
  }

  // Place 2: any `run` command in a CI workflow read. Only GitHub Actions workflows are read as
  // `run` steps; another CI system's commands are not, so its file is an unread place.
  for (const workflow of workflows) {
    const fullPath = join(repoPath, workflow);
    if (!/^\.github\/workflows\//u.test(workflow) || !isRegularFile(fullPath)) {
      unsettled = true;
      continue;
    }
    if (extractCiRunCommands(readRepoText(fullPath, 'utf8')).some(commandRunsStep)) {
      return 'step-found';
    }
  }

  // Place 3: any RUN instruction in a tracked Dockerfile.
  for (const file of repoFiles.filter((path) => BUILD_STEP_DOCKERFILE_PATTERN.test(path))) {
    const fullPath = join(repoPath, file);
    if (!isRegularFile(fullPath)) {
      unsettled = true;
      continue;
    }
    const run = dockerfileRunCommands(readRepoText(fullPath, 'utf8'));
    if (run.unparseable) unsettled = true;
    if (run.commands.some(commandRunsStep)) return 'step-found';
  }

  // Place 4: any target in a tracked Makefile, GNUmakefile or justfile. A recipe line's trailing
  // continuation backslash is dropped; the continued line is read as a command of its own.
  for (const file of repoFiles.filter(isRecipeFile)) {
    const fullPath = join(repoPath, file);
    if (!isRegularFile(fullPath)) {
      unsettled = true;
      continue;
    }
    for (const [name, target] of readRecipeTargets(readRepoText(fullPath, 'utf8'))) {
      if (BUILD_STEP_TARGET_NAME_PATTERN.test(name)) return 'step-found';
      if (target.commands.some((command) => commandRunsStep(command.replace(/\\$/u, '')))) {
        return 'step-found';
      }
    }
  }

  // B-3. Nothing withheld or delegated, no manifest left unread. A withheld authored package.json
  // counts as well as the four places the ruling names.
  if (workspaceManifests.declared > workspaceManifests.read.length || workspaceManifests.unreadable) {
    unsettled = true;
  }
  if (unreadCiWorkflowReasons(includesWorkflow).size > 0) unsettled = true;
  const delegated = countDelegatedCiSteps(repoPath, workflows);
  if (delegated.crossRepositoryReusableWorkflows + delegated.compositeActions > 0) unsettled = true;
  if (
    withheldRepoPaths().some(
      ({ path }) =>
        BUILD_STEP_DOCKERFILE_PATTERN.test(path) ||
        isRecipeFile(path) ||
        (/(^|\/)package\.json$/u.test(path) && isAuthoredProductionPath(path)),
    )
  ) {
    unsettled = true;
  }
  return unsettled ? 'unsettled' : 'fires';
}

/** A package.json's scripts; null when it is not a JSON object or a script is not a string. */
function readBuildStepPackageScripts(packageJsonPath: string): Map<string, string> | null {
  if (!isRegularFile(packageJsonPath)) return null;
  const parsed = parseJsonObject(readRepoText(packageJsonPath, 'utf8'));
  if (parsed === null) return null;
  if (parsed.scripts === undefined) return new Map();
  if (!isRecord(parsed.scripts)) return null;
  const entries = Object.entries(parsed.scripts);
  if (!entries.every((entry): entry is [string, string] => typeof entry[1] === 'string')) return null;
  return new Map(entries);
}

/**
 * Every RUN instruction's command, continuation lines joined and BuildKit `--flag`s dropped. The
 * exec form is re-quoted so it reaches the same shell splitting as the shell form. A heredoc, an
 * exec form that is not a JSON array of strings, or an `escape` parser directive is unparseable.
 */
export function dockerfileRunCommands(contents: string): {
  readonly commands: readonly string[];
  readonly unparseable: boolean;
} {
  if (/^#\s*escape\s*=/imu.test(contents)) return { commands: [], unparseable: true };
  const lines = contents.split(/\r?\n/u);
  const commands: string[] = [];
  let unparseable = false;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\s*RUN(?:\s+(.*))?$/iu.exec(lines[index] ?? '');
    if (!match) continue;
    // The instruction is kept as chunks so each continuation looks only at its tail. Re-testing
    // and rewriting the whole joined string on every line was quadratic in the Dockerfile's
    // length; the result is byte-identical to that form.
    const chunks = [match[1] ?? ''];
    while (endsWithLineContinuation(chunks) && index + 1 < lines.length) {
      index += 1;
      const next = lines[index] ?? '';
      // Docker drops a comment line inside a continued instruction; the backslash still stands.
      if (/^\s*#/u.test(next)) continue;
      dropLineContinuation(chunks);
      chunks.push(' ', next.trim());
    }
    let instruction = chunks.join('');
    instruction = instruction.replace(/^(?:--[A-Za-z][\w-]*(?:=\S*)?\s+)*/u, '').trim();
    if (instruction === '' || /<<-?\s*["']?[A-Za-z_]/u.test(instruction)) {
      unparseable = true;
      continue;
    }
    if (!instruction.startsWith('[')) {
      commands.push(instruction);
      continue;
    }
    const execForm = dockerfileExecFormCommand(instruction);
    if (execForm === null) unparseable = true;
    else commands.push(execForm);
  }
  return { commands, unparseable };
}

/** True when the joined chunks end in a backslash followed only by whitespace. */
function endsWithLineContinuation(chunks: readonly string[]): boolean {
  for (let c = chunks.length - 1; c >= 0; c -= 1) {
    const chunk = chunks[c] ?? '';
    for (let i = chunk.length - 1; i >= 0; i -= 1) {
      const character = chunk.charAt(i);
      if (/\s/u.test(character)) continue;
      return character === '\\';
    }
  }
  return false;
}

/** Removes that trailing backslash and the whitespace after it; callers check it is there. */
function dropLineContinuation(chunks: string[]): void {
  while (chunks.length > 0) {
    const chunk = chunks[chunks.length - 1] ?? '';
    let i = chunk.length - 1;
    while (i >= 0 && /\s/u.test(chunk.charAt(i))) i -= 1;
    if (i < 0) {
      chunks.pop();
      continue;
    }
    chunks[chunks.length - 1] = chunk.slice(0, i);
    return;
  }
}

function dockerfileExecFormCommand(instruction: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(instruction);
  } catch {
    return null;
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    !parsed.every((part): part is string => typeof part === 'string')
  ) {
    return null;
  }
  return parsed
    .map((part) =>
      /^[A-Za-z0-9_@%+=:,./-]+$/u.test(part) ? part : `'${part.replaceAll("'", "'\\''")}'`,
    )
    .join(' ');
}

/**
 * B-2's command test: `step` when a segment's command word is in the vocabulary above, `none`
 * when no segment's is, and `unparseable` when a segment cannot be split into words or its
 * command word (or a package manager's script name) is an expansion Cejel cannot resolve.
 */
export function classifyBuildStepCommand(command: string): BuildStepCommandState {
  return buildStepCommandState(command, 0);
}

function buildStepCommandState(command: string, depth: number): BuildStepCommandState {
  if (depth > 4) return 'unparseable';
  const states = splitShellCommandSegments(command).map((segment) =>
    buildStepSegmentState(segment, depth),
  );
  if (states.includes('step')) return 'step';
  return states.includes('unparseable') ? 'unparseable' : 'none';
}

function buildStepSegmentState(raw: string, depth: number): BuildStepCommandState {
  let segment = stripUnbalancedShellParentheses(raw.trim());
  for (;;) {
    const keyword = /^(?:if|then|else|elif|do|while|until|exec|!|\{)(?:\s+|$)/u.exec(segment);
    if (!keyword) break;
    segment = segment.slice(keyword[0].length);
  }
  if (segment === '' || /^(?:fi|done|esac|\})$/u.test(segment)) return 'none';
  const normalized = normalizeCoverageCommandPrefixes(segment);
  if (
    normalized.splitShellOperators &&
    splitShellCommandSegments(normalized.segment).length > 1
  ) {
    return buildStepCommandState(normalized.segment, depth + 1);
  }
  if (/\b(?:npm|pnpm|yarn|bun)\s+run\s+(?:\$|["']\$|`)/u.test(normalized.segment)) {
    return 'unparseable';
  }
  const words = strictShellWords(normalized.segment);
  if (words === null) return 'unparseable';
  return words.length === 0 ? 'none' : buildStepWordsState(words);
}

function buildStepWordsState(words: readonly string[]): BuildStepCommandState {
  const first = words[0] === '$(MAKE)' || words[0] === '${MAKE}' ? 'make' : (words[0] ?? '');
  if (isUnresolvedCommandWord(first)) return 'unparseable';
  const runner = buildStepCommandName(first);
  if (
    BUILD_STEP_TASK_RUNNERS.has(runner) &&
    words.slice(1).some((word) => BUILD_STEP_TARGET_ARGUMENT_PATTERN.test(word))
  ) {
    return 'step';
  }
  const command =
    runner === 'bunx'
      ? words.slice(1)
      : runner === 'bun' && words[1] === 'x'
        ? words.slice(2)
        : unwrapPackageManagerExecutable(words);
  const executable = command[0] ?? '';
  if (isUnresolvedCommandWord(executable)) return 'unparseable';
  const name = buildStepCommandName(executable);
  if (BUILD_STEP_EXECUTABLES.has(name)) return 'step';
  const subcommand = BUILD_STEP_SUBCOMMANDS.get(name);
  return subcommand !== undefined && command.slice(1).includes(subcommand) ? 'step' : 'none';
}

function isUnresolvedCommandWord(word: string): boolean {
  return word.startsWith('$') || word.includes('`');
}

function buildStepCommandName(word: string): string {
  return basename(word).replace(/\.(?:cmd|exe)$/iu, '').toLowerCase();
}

/** `(cd app` and `tsc -p .)` are the two halves of a subshell that segment splitting cut apart. */
function stripUnbalancedShellParentheses(segment: string): string {
  const opens = segment.split('(').length - 1;
  const closes = segment.split(')').length - 1;
  if (opens > closes) return segment.replace(/^\(+\s*/u, '');
  if (closes > opens) return segment.replace(/\s*\)+$/u, '');
  return segment;
}

/** shellWords, but null instead of a silent stop when a word cannot be read to its end. */
function strictShellWords(segment: string): string[] | null {
  const words: string[] = [];
  let offset = 0;
  for (;;) {
    while (offset < segment.length && /\s/u.test(segment[offset] ?? '')) offset += 1;
    if (offset >= segment.length) return words;
    const scanned = scanShellWord(segment, offset);
    if (!scanned) return null;
    if (scanned.word !== '') words.push(scanned.word);
    offset = scanned.end;
  }
}

// A3's build/type-check component reads package scripts from the root package.json only, as does
// B3's ci_script_depth when no workspace is declared, while A1 reads every authored package.json.
// "Authored" is A1's own predicate (isAuthoredProductionPath), so vendored and dependency trees are
// not counted. Returns null when there is nothing to say (no other authored package.json), leaving
// the output unchanged.
function rootOnlyPackageScriptsDisclosure(
  repoFiles: readonly string[],
  rootPackageJson: string | null,
): string | null {
  const others = repoFiles.filter(
    (file) =>
      file !== rootPackageJson &&
      /(^|\/)package\.json$/.test(file) &&
      isAuthoredProductionPath(file),
  ).length;
  if (others === 0) return null;
  const present = `${others}${rootPackageJson ? ' other' : ''} package.json file${others === 1 ? '' : 's'} present`;
  return `${rootPackageJson ? '' : 'no root package.json found; '}package scripts for this metric are read from the root package.json only; ${present}`;
}

// The same disclosure once declared workspace packages were read (B3's ci_script_depth): how many
// were read, how many the cap left unread, and how many other authored package.json files remain.
function workspacePackageScriptsDisclosure(
  repoFiles: readonly string[],
  rootPackageJson: string | null,
  workspace: DeclaredWorkspaceManifests,
): string {
  const readCount = workspace.read.length;
  const workspaceRead =
    workspace.declared > readCount
      ? `the first ${readCount} of ${workspace.declared} declared workspace package.json files`
      : `${readCount} declared workspace package.json file${readCount === 1 ? '' : 's'}`;
  const read = new Set(workspace.read);
  const others = repoFiles.filter(
    (file) =>
      file !== rootPackageJson &&
      !read.has(file) &&
      /(^|\/)package\.json$/.test(file) &&
      isAuthoredProductionPath(file),
  ).length;
  return [
    ...(rootPackageJson ? [] : ['no root package.json found']),
    `package scripts for this metric are read from ${rootPackageJson ? `the root package.json and ${workspaceRead}` : workspaceRead}`,
    ...(others > 0 ? [`${others} other package.json file${others === 1 ? '' : 's'} present`] : []),
  ].join('; ');
}

// Returns true only for regular files — directories and missing paths both return false.
// This prevents EISDIR crashes when git ls-files returns submodule directory entries.
export function isRegularFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

export function fileContains(repoPath: string, file: string, pattern: RegExp): boolean {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return false;
  return pattern.test(readRepoText(fullPath, 'utf8'));
}

// Same as fileContains, but strips comments before testing. Used wherever a match is credited as
// implementation evidence: a commented-out call (e.g. `// app.use(errorHandler);`) or a comment
// quoting a handler satisfies a pattern textually while implementing nothing at runtime (#352,
// and #433 for the shape half). A `//` directly preceded by `:` is the scheme separator of a URL
// (`'https://api.example'`), not a comment, and is left alone so a one-line
// `const base = 'https://api.example'; app.use(handler);` still matches. Every other `//` strips to
// end of line, including a trailing comment after code (`x(); // app.use(handler);`) — keeping
// that text would credit a dead stub, and a false credit is the worse error here. `/* ... */`
// blocks are blanked with their line breaks kept, so line numbers survive for evidence anchors.
// Python and Ruby files also lose whole-line `#` comments. Naive by design: it does not parse
// string or template literals, so a `//` or `/*` inside one strips too — a documented limit that
// fails toward a miss, never a false credit.
const HASH_COMMENT_SOURCE_PATTERN = /\.(?:py|rb)$/i;

function stripCodeComments(file: string, contents: string): string {
  const withoutComments = contents
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ''))
    .replace(/(?<!:)\/\/.*$/gm, '');
  return HASH_COMMENT_SOURCE_PATTERN.test(file)
    ? withoutComments.replace(/^[ \t]*#.*$/gm, '')
    : withoutComments;
}

function fileMatchesOutsideComments(repoPath: string, file: string, pattern: RegExp): boolean {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return false;
  return pattern.test(stripCodeComments(file, readRepoText(fullPath, 'utf8')));
}

function findFirstMatchingLineOutsideComments(
  repoPath: string,
  file: string,
  pattern: RegExp,
): number | null {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return null;
  const lines = stripCodeComments(file, readRepoText(fullPath, 'utf8')).split('\n');
  const index = lines.findIndex((line) => pattern.test(line));
  return index === -1 ? null : index + 1;
}

// ---- v23-only: PEM-formatted private-key assignment grammar -------------------------------
// (goal_cejel_v23_pem_private_key_grammar_2026-09-06). SECRET_IDENTIFIER_KEYWORD_PATTERN above
// requires "secret", "token", "api_key", "password" or "access_key" in the identifier —
// "private_key" (the canonical GCP/AWS service-account-JSON field name) matches none of those.
// And even a matching identifier's value would not survive findRealSecretAssignments' capture:
// that loop stops the value at the first real quote or whitespace character, which a PEM
// block trips on its own embedded newline (real, or a JSON string's literal `\n` two-character
// escape makes no difference — [\s\S] below spans both) and on the literal space inside
// "PRIVATE KEY" itself. This is why it is a dedicated, whole-file grammar rather than an
// extension of the shared keyword/value scan — and why it is threaded as its own
// useV23PemPrivateKeyGrammar flag through every call site instead of folding into
// useV39Detectors/useV47Detectors: v17 and v22 must stay byte-stable, and this closure was
// never part of either.
//
// FP discipline: a public key or certificate can never match (the pattern requires the
// literal substring "PRIVATE KEY", which "PUBLIC KEY" and "CERTIFICATE" do not contain).
// Documentation examples, __fixtures__/test-fixture paths, and generated/vendor paths are
// already excluded upstream by the same isV47AuthoredProductionPath gate every other secret
// check in this file uses (see the authoredProductionPath check in collectA2IsolationEvidence)
// — this grammar adds no path filtering of its own for those. What it does add locally is
// what those upstream gates cannot know from a path alone: an identifier/context match for
// "dev"/"self-signed"/"snakeoil"-shaped material, and a nearby "rotated"/"revoked" annotation.
// The body capture is bounded (not an unbounded `[\s\S]*?`): with no bound, a file containing
// several unterminated "-----BEGIN ... PRIVATE KEY-----" markers (no matching END) makes the
// engine re-attempt an ever-shrinking suffix scan from every such start position, which
// measures as clearly super-linear (super-linear time on repeated-unterminated-marker input —
// verified directly: ~61ms to ~3.7s as input doubled from ~165KB to ~1.3MB). 32KB is far more
// than any real PEM private key (even RSA-8192 is a few KB), so this bound never truncates a
// genuine match while capping worst-case per-position work to a constant.
const PEM_PRIVATE_KEY_ASSIGNMENT_PATTERN =
  /(?:["'])?([A-Za-z_$][\w$.-]*)(?:["'])?\s*[:=]\s*(?:\|[-+0-9]*\s*\r?\n[ \t]*)?["'`]?-----BEGIN((?: (?:RSA|DSA|EC|OPENSSH|ENCRYPTED))? PRIVATE KEY)-----([\s\S]{0,32768}?)-----END\2-----/g;
// A bare key file (id_rsa, server.key, some-cert.pem) has no `identifier =`/`identifier:`
// wrapper at all — isCredentialHistoryPath already treats these basenames as scan-eligible, but
// the assignment grammar above never matched their content. This is the same regex with that
// leading identifier/operator prefix made optional, used only for basenames shaped like a
// standalone key file (see isBarePemKeyFile) so the wider, prefix-free match never runs against
// arbitrary source/doc/log content. Same shape as PEM_PRIVATE_KEY_ASSIGNMENT_PATTERN minus the
// leading identifier/operator group — so the key-type backreference is \1 here (there is no
// group before it), not \2.
const BARE_PEM_PRIVATE_KEY_PATTERN =
  /["'`]?-----BEGIN((?: (?:RSA|DSA|EC|OPENSSH|ENCRYPTED))? PRIVATE KEY)-----([\s\S]{0,32768}?)-----END\1-----/g;
const BARE_PEM_KEY_FILE_PATTERN = /(?:^|\/)id_(?:rsa|dsa|ecdsa|ed25519)$|\.(?:pem|key)$/i;
function isBarePemKeyFile(file: string): boolean {
  return BARE_PEM_KEY_FILE_PATTERN.test(file);
}
// A committed self-signed/local-dev key is a routine, low-value artifact (see e.g. Debian's
// ssl-cert-snakeoil convention) — checked against the identifier, a small surrounding-line
// window, and the file path itself. Lookarounds (not \b) treat "_"/"-" as boundaries too, so
// "self_signed_key" and "local-dev.pem" both match, not just space-delimited prose. "staging" is
// deliberately not in this list: unlike "dev"/"local"/"self-signed", a staging path names a
// real, reachable deployment environment, not routine throwaway material.
const DEV_OR_SELF_SIGNED_KEY_CONTEXT_PATTERN =
  /(?<![A-Za-z0-9])(?:dev|development|local|localhost|self[-_]?signed|snakeoil|insecure|dummy|sample|demo|placeholder|fixture|generated)(?![A-Za-z0-9])/i;
// A key documented as rotated/revoked in its own surrounding context is retired material, not
// a live leak — an honest abstention in the direction of fewer false positives, per this
// goal's binding FP-discipline constraint, even at some cost to recall.
const ROTATED_OR_REVOKED_KEY_CONTEXT_PATTERN =
  /(?<![A-Za-z0-9])(?:rotated|revoked|expired|deprecated|compromised|invalidated|superseded)(?![A-Za-z0-9])|do[-_ ]not[-_ ]use|no longer valid/i;

// A real PEM body is a long run of base64 characters (plus real/escaped newlines and
// indentation, stripped before this check runs) — never a short placeholder, an all-filler
// run, or a synthetic fixture alphabet. Reuses the same placeholder heuristics every other
// secret value in this file is judged by, rather than inventing a parallel notion of "fake".
function isPlausiblePemKeyBody(rawBody: string): boolean {
  const normalized = rawBody.replace(/\\[nr]|[\r\n\s]/g, '');
  if (normalized.length < 40) return false;
  if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) return false;
  return !isPlaceholderSecretValue(normalized);
}

// Runs one compiled PEM pattern over `contents` and returns the first match that survives every
// FP guard, or null. Shared by both the identifier-prefixed grammar and the bare-key-file
// fallback below so the FP-guard logic (dev/self-signed context, rotated/revoked context,
// plausible body) and the evidence-metadata computation exist in exactly one place.
function scanForPemPrivateKeyMatch(
  pattern: RegExp,
  contents: string,
  lines: readonly string[],
  hasIdentifierGroup: boolean,
): RealSecretAssignmentMatch | null {
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(contents)) !== null) {
    const full = match[0];
    // PEM_PRIVATE_KEY_ASSIGNMENT_PATTERN captures (identifier, keyType, body);
    // BARE_PEM_PRIVATE_KEY_PATTERN has no identifier group, so it captures (keyType, body).
    const identifier = hasIdentifierGroup ? (match[1] ?? '') : '';
    const body = (hasIdentifierGroup ? match[3] : match[2]) ?? '';
    const line = contents.slice(0, match.index).split('\n').length;
    const contextLines = lines.slice(Math.max(0, line - 5), line + 4).join('\n');
    const isDevOrSelfSigned = DEV_OR_SELF_SIGNED_KEY_CONTEXT_PATTERN.test(
      `${identifier}\n${contextLines}`,
    );
    const isRotatedOrRevoked = ROTATED_OR_REVOKED_KEY_CONTEXT_PATTERN.test(contextLines);
    if (isPlausiblePemKeyBody(body) && !isDevOrSelfSigned && !isRotatedOrRevoked) {
      // The evidence value is the PEM block itself (armor + body), not `full` — `full` also
      // contains the identifier and assignment syntax, which would otherwise (a) make
      // characterClasses/valueLength describe the wrapper rather than the secret, and (b) make
      // the fingerprint sensitive to unrelated edits to that wrapper, breaking the
      // current-tree/history dedup this match feeds (see currentFingerprints callers below).
      const value = full.slice(full.indexOf('-----BEGIN'));
      const characterClasses = [
        /[a-z]/.test(value) ? 'lower' : '',
        /[A-Z]/.test(value) ? 'upper' : '',
        /\d/.test(value) ? 'digit' : '',
        /[^A-Za-z0-9]/.test(value) ? 'symbol' : '',
      ]
        .filter(Boolean)
        .join('+');
      return {
        identifier,
        line,
        valueLength: value.length,
        characterClasses: characterClasses || 'other',
        valueFingerprint: createHash('sha256').update(value).digest('hex'),
        kind: 'pem_private_key',
      };
    }
  }
  return null;
}

// Returns the first PEM-formatted private-key assignment in `contents` that survives every FP
// guard, or null — never a fabricated match. `file` is the path being scanned: used for the
// dev/self-signed path check, and to decide whether the identifier-free bare-key-file fallback
// applies (id_rsa, *.pem, *.key have no `identifier =` wrapper at all). The path-based
// fixture/doc/generated exclusion itself already happened upstream, before this function is
// ever called.
function findPemPrivateKeyAssignment(
  contents: string,
  file: string,
): RealSecretAssignmentMatch | null {
  if (!contents.includes('-----BEGIN')) return null;
  if (DEV_OR_SELF_SIGNED_KEY_CONTEXT_PATTERN.test(file)) return null;
  const lines = contents.split('\n');
  const assignmentMatch = scanForPemPrivateKeyMatch(
    PEM_PRIVATE_KEY_ASSIGNMENT_PATTERN,
    contents,
    lines,
    true,
  );
  if (assignmentMatch) return assignmentMatch;
  if (!isBarePemKeyFile(file)) return null;
  return scanForPemPrivateKeyMatch(BARE_PEM_PRIVATE_KEY_PATTERN, contents, lines, false);
}

function findCommittedSecretInFile(
  repoPath: string,
  file: string,
  useV36Detectors = false,
  useV39Detectors = false,
  useV47Detectors = false,
  useV23PemPrivateKeyGrammar = false,
  setAside?: PlaceholderSetAsideCount,
): RealSecretAssignmentMatch | null {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return null;
  const contents = readRepoText(fullPath, 'utf8');
  const isTestCredentialConfiguration =
    useV39Detectors && isLikelyTestCredentialConfiguration(file, contents);
  const secretScanContents = prepareCredentialScanContents(
    contents,
    file,
    useV36Detectors,
    useV39Detectors,
    useV47Detectors,
  );
  // The count rides on the detection pass. That pass stops only at a match, and a match ends the
  // A2 scan, which then reports no set-aside values; otherwise it has seen every value.
  const secret = findRealSecretAssignment(secretScanContents, new Set(), {
    allowCredentialNamedDigest: useV36Detectors,
    ...(setAside
      ? {
          observeValue: (value: string, outcome: V24ClassificationOutcome) => {
            if (isPlaceholderSetAsideSecret(value, outcome)) setAside.count += 1;
          },
        }
      : {}),
  });
  if (secret) return secret;
  if (useV23PemPrivateKeyGrammar) {
    const pemSecret = findPemPrivateKeyAssignment(secretScanContents, file);
    if (pemSecret) return pemSecret;
  }
  if (useV39Detectors && isEnvHistoryPath(file, useV36Detectors)) {
    const databaseUrlCredential = findDatabaseUrlUserinfoCredential(secretScanContents);
    if (databaseUrlCredential) return databaseUrlCredential;
    const weakCredential = findWeakExplicitEnvCredential(secretScanContents);
    if (weakCredential) return weakCredential;
  }
  return useV36Detectors && !isTestCredentialConfiguration
    ? findDefaultAdministrativeCredential(secretScanContents)
    : null;
}

interface V24ClassifiedCommittedSecret {
  readonly match: RealSecretAssignmentMatch;
  readonly classification: Exclude<V24SecretClassification, 'no_finding'>;
}

/**
 * v24-only current-tree secret scan. Same assignment grammar and same content preparation as
 * findCommittedSecretInFile; only the value gate differs.
 */
function findV24ClassifiedSecretInFile(
  repoPath: string,
  file: string,
  useV36Detectors: boolean,
  useV39Detectors: boolean,
  useV47Detectors: boolean,
  setAside?: PlaceholderSetAsideCount,
): V24ClassifiedCommittedSecret | null {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return null;
  const contents = readRepoText(fullPath, 'utf8');
  const isTestCredentialConfiguration =
    useV39Detectors && isLikelyTestCredentialConfiguration(file, contents);
  const secretScanContents = prepareCredentialScanContents(
    contents,
    file,
    useV36Detectors,
    useV39Detectors,
    useV47Detectors,
    true,
  );
  // The context window reads the RAW file, not the prepared copy. Every preparation step maps one
  // line to one replacement line, so line numbers are identical between the two — but v39's
  // comment stripping blanks exactly the lines that most often carry the instructional marker
  // (`# replace this with your own key`). Classifying against the stripped copy would discard the
  // evidence this mechanism exists to read.
  const rawLines = contents.split(/\r?\n/);
  const classifyFor =
    (wanted: Exclude<V24SecretClassification, 'no_finding'>, countSetAside = false) =>
    (value: string, identifier: string, line: number): V24ClassificationOutcome => {
      const outcome = classifyV24SecretShapedValue(
        value,
        identifier,
        line,
        rawLines,
        useV36Detectors,
      );
      // Counted on the first pass only, from the classifier's own verdict: a value v24 reports as
      // real or ambiguous is never also described as set aside. That pass sees every value unless
      // it stops at a real one, which ends the A2 scan with no set-aside values reported.
      if (countSetAside && setAside && isPlaceholderSetAsideSecret(value, outcome)) {
        setAside.count += 1;
      }
      return outcome.classification === wanted ? outcome : V24_NO_FINDING;
    };

  // Two bounded passes, not one. A single pass stopping at the first match of either kind would
  // let one unclassifiable value earlier in the file pre-empt a genuine leak below it. The first
  // pass stops at the first confidently real value, so the cost of the common (clean) case is one
  // extra linear scan and the cost of the flagging case is unchanged.
  const real = findRealSecretAssignment(secretScanContents, new Set(), {
    allowCredentialNamedDigest: useV36Detectors,
    classifyValue: classifyFor('real', true),
  });
  if (real) return { match: real, classification: 'real' };

  if (useV39Detectors && isEnvHistoryPath(file, useV36Detectors)) {
    const weakCredential = findWeakExplicitEnvCredential(secretScanContents);
    if (weakCredential) return { match: weakCredential, classification: 'real' };
  }
  const defaultAdministrative =
    useV36Detectors && !isTestCredentialConfiguration
      ? findDefaultAdministrativeCredential(secretScanContents)
      : null;
  if (defaultAdministrative) {
    return { match: defaultAdministrative, classification: 'real' };
  }

  const ambiguous = findRealSecretAssignment(secretScanContents, new Set(), {
    allowCredentialNamedDigest: useV36Detectors,
    classifyValue: classifyFor('ambiguous'),
  });
  return ambiguous ? { match: ambiguous, classification: 'ambiguous' } : null;
}

function prepareCredentialScanContents(
  contents: string,
  file: string,
  useV36Detectors: boolean,
  useV39Detectors: boolean,
  useV47Detectors = false,
  useContentOnlyPublicKeyContext = false,
): string {
  const withoutXamlEventNames =
    useV36Detectors && /\.xaml$/i.test(file)
      ? contents.replace(/\bTokenItem(?:Added|Removed)(?=\s*=)/gi, 'EventHandler')
      : contents;
  const withoutDocumentationExamples = useV39Detectors
    ? stripCommentAndDocumentationExamples(withoutXamlEventNames)
    : withoutXamlEventNames;
  return useV47Detectors
    ? stripV47PublicIdentifiersAndNonCredentialValues(
        withoutDocumentationExamples,
        file,
        useContentOnlyPublicKeyContext,
      )
    : withoutDocumentationExamples;
}

function stripV47PublicIdentifiersAndNonCredentialValues(
  contents: string,
  file: string,
  useContentOnlyPublicKeyContext = false,
): string {
  const lines = contents.split(/\r?\n/);
  return lines
    .map((line, index) => {
      let sanitized = line.replace(
        /^(\s*(?:export\s+)?(?:PUBLIC_)?ALGOLIA_(?:PUBLIC_)?API_KEY\s*[:=]\s*)[^\s#]+/i,
        '$1""',
      );
      if (isPublicDocumentationSearchKeyContext(
        lines,
        index,
        file,
        useContentOnlyPublicKeyContext,
      )) {
        sanitized = sanitized.replace(/(\bapiKey\s*[:=]\s*)(['"])[^'"]+\2/gi, '$1$2$2');
      }
      sanitized = sanitized.replace(
        /(\b[A-Za-z_][A-Za-z0-9_]*(?:token|api[_-]?key|access[_-]?key)[A-Za-z0-9_]*\s*[:=]\s*)(['"]?)0x[0-9a-f]{40}\2/gi,
        '$1""',
      );
      sanitized = sanitized.replace(
        /(\b[A-Za-z_][A-Za-z0-9_]*(?:token|api[_-]?key|access[_-]?key)[A-Za-z0-9_]*\s*[:=]\s*)(['"])([a-z][a-z0-9]*(?:_[a-z0-9]+){2,})\2/gi,
        (assignment, prefix: string, quote: string, value: string) =>
          /\b(?:cost|input|output|context|model|limit|price|usage|audio)\b/i.test(
            value.replaceAll('_', ' '),
          )
            ? `${prefix}${quote}${quote}`
            : assignment,
      );
      return sanitized;
    })
    .join('\n');
}

function isPublicDocumentationSearchKeyContext(
  lines: readonly string[],
  lineIndex: number,
  file: string,
  useContentOnlyPublicKeyContext = false,
): boolean {
  const windowStart = Math.max(0, lineIndex - 6);
  const preceding = lines.slice(windowStart, lineIndex + 1);
  for (let index = preceding.length - 1; index >= 0; index -= 1) {
    const candidate = preceding[index] ?? '';
    if (/}/.test(candidate) && index < preceding.length - 1) return false;
    if (/\bdocsearch(?:Options)?\b/i.test(candidate)) return true;
    if (
      /\balgolia\b/i.test(candidate) &&
      (useContentOnlyPublicKeyContext ||
        /(?:^|\/)(?:website|docs?)(?:\/|$)|(?:site[-_]?config|\.dumirc|docusaurus)/i.test(
          file,
        ))
    ) {
      return true;
    }
  }
  return false;
}

function stripCommentAndDocumentationExamples(contents: string): string {
  let blockCommentEnd: '*/' | '-->' | null = null;
  return contents
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trimStart();
      if (blockCommentEnd) {
        if (trimmed.includes(blockCommentEnd)) blockCommentEnd = null;
        return '';
      }
      if (trimmed.startsWith('/*')) {
        if (!trimmed.includes('*/')) blockCommentEnd = '*/';
        return '';
      }
      if (trimmed.startsWith('<!--')) {
        if (!trimmed.includes('-->')) blockCommentEnd = '-->';
        return '';
      }
      if (/^(?:\/\/|#|\*)/.test(trimmed)) return '';
      if (/\.description\s*\(/i.test(line) && /api[_-]?key|token|password|secret/i.test(line)) {
        return '';
      }
      return line;
    })
    .join('\n');
}

function isLikelyTestCredentialConfiguration(file: string, contents: string): boolean {
  if (!/\.(?:ya?ml|json|toml|ini|conf)$/i.test(file) && !/(?:^|\/)docker-compose/i.test(file)) {
    return false;
  }
  const testMarkers =
    contents.match(/(?:^|[^A-Za-z])(?:tests?|testing|e2e|appium|fixture)(?:[^A-Za-z]|$)/gi)
      ?.length ?? 0;
  return testMarkers >= 2;
}

function hasTemplateOnlyEnvContent(repoPath: string, file: string): boolean {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return false;
  const substantiveLines = readRepoText(fullPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !/^\s*#/.test(line));
  if (substantiveLines.length === 0) return true;
  const assignments = substantiveLines.map(
    (line) => /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*?)\s*$/.exec(line)?.[1] ?? null,
  );
  if (assignments.some((value) => value === null)) return false;
  return assignments.every((raw) => {
    if (raw === null) return false;
    const value = raw.replace(/^['"]|['"]$/g, '').trim();
    return value.length === 0 || isPlaceholderSecretValue(value);
  });
}

function findSecretFingerprintsInFile(
  repoPath: string,
  file: string,
  useV36Detectors = false,
  useV39Detectors = false,
  useV47Detectors = false,
  useV23PemPrivateKeyGrammar = false,
): string[] {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return [];
  const contents = readRepoText(fullPath, 'utf8');
  const scanContents = prepareCredentialScanContents(
    contents,
    file,
    useV36Detectors,
    useV39Detectors,
    useV47Detectors,
  );
  const fingerprints = findRealSecretAssignments(
    scanContents,
    new Set(),
    Number.POSITIVE_INFINITY,
    { allowCredentialNamedDigest: useV36Detectors },
  ).map(({ valueFingerprint }) => valueFingerprint);
  if (useV23PemPrivateKeyGrammar) {
    const pemSecret = findPemPrivateKeyAssignment(scanContents, file);
    if (pemSecret) fingerprints.push(pemSecret.valueFingerprint);
  }
  if (useV39Detectors && isEnvHistoryPath(file, useV36Detectors)) {
    const databaseUrlCredential = findDatabaseUrlUserinfoCredential(scanContents);
    if (databaseUrlCredential) fingerprints.push(databaseUrlCredential.valueFingerprint);
    const weakCredential = findWeakExplicitEnvCredential(scanContents);
    if (weakCredential) fingerprints.push(weakCredential.valueFingerprint);
  }
  return [...new Set(fingerprints)];
}

export function containsRealSecret(contents: string): boolean {
  return findRealSecretAssignment(contents) !== null;
}

interface RealSecretAssignmentMatch {
  identifier: string;
  line: number;
  valueLength: number;
  characterClasses: string;
  valueFingerprint: string;
  kind?: 'secret' | 'default_admin' | 'pem_private_key';
  /** v24-only; absent on every other rubric, which is what keeps v17 and v22 byte-stable. */
  classification?: Exclude<V24SecretClassification, 'no_finding'>;
  classificationReason?: string;
}

interface SecretAssignmentOptions {
  allowCredentialNamedDigest?: boolean;
  /**
   * v24-only. When supplied, the classifier's verdict replaces the fixed
   * `!isPlaceholderSecretValue(value) && looksLikeSecretValue(value)` value gate: it widens what
   * counts as a candidate and decides among no_finding / real / ambiguous. Absent on every other
   * rubric, so the legacy branch below is reached unchanged.
   */
  classifyValue?: (value: string, identifier: string, line: number) => V24ClassificationOutcome;
  /** Sees every assignment value the pass reaches, with its verdict. Never changes the verdict. */
  observeValue?: (value: string, outcome: V24ClassificationOutcome) => void;
}

function findRealSecretAssignment(
  contents: string,
  excludedValueFingerprints: ReadonlySet<string> = new Set(),
  options: SecretAssignmentOptions = {},
): RealSecretAssignmentMatch | null {
  return findRealSecretAssignments(contents, excludedValueFingerprints, 1, options)[0] ?? null;
}

function findRealSecretAssignments(
  contents: string,
  excludedValueFingerprints: ReadonlySet<string> = new Set(),
  maximumMatches = Number.POSITIVE_INFINITY,
  options: SecretAssignmentOptions = {},
): RealSecretAssignmentMatch[] {
  const matches: RealSecretAssignmentMatch[] = [];
  // The former all-in-one expression started its greedy identifier scan at every character.
  // On large generated or minified files with no assignment, that can revisit the same suffix
  // quadratically. Search for the required keyword first, then parse only its identifier suffix,
  // assignment delimiter, and value. This accepts the same assignment grammar as the former
  // expression while keeping the scan linear in file size.
  SECRET_IDENTIFIER_KEYWORD_PATTERN.lastIndex = 0;
  let match = SECRET_IDENTIFIER_KEYWORD_PATTERN.exec(contents);
  let line = 1;
  let lineCursor = 0;
  while (match !== null) {
    const keyword = match[0];
    const keywordStart = match.index;
    while (lineCursor < keywordStart) {
      if (contents.charCodeAt(lineCursor) === 10) line += 1;
      lineCursor += 1;
    }

    let cursor = keywordStart + keyword.length;
    while (cursor < contents.length && isSecretIdentifierCharacter(contents.charCodeAt(cursor))) {
      cursor += 1;
    }
    const identifierEnd = cursor;
    let identifierStart = keywordStart;
    while (
      identifierStart > 0 &&
      isSecretIdentifierCharacter(contents.charCodeAt(identifierStart - 1))
    ) {
      identifierStart -= 1;
    }
    const identifier = contents.slice(identifierStart, identifierEnd);
    let nextSearchIndex = identifierEnd;
    while (cursor < contents.length && SINGLE_WHITESPACE_PATTERN.test(contents[cursor] ?? '')) {
      cursor += 1;
    }
    const delimiter = contents[cursor];
    if (delimiter === ':' || delimiter === '=') {
      cursor += 1;
      while (cursor < contents.length && SINGLE_WHITESPACE_PATTERN.test(contents[cursor] ?? '')) {
        cursor += 1;
      }
      if (contents[cursor] === "'" || contents[cursor] === '"') cursor += 1;

      const valueStart = cursor;
      while (cursor < contents.length) {
        const character = contents[cursor] ?? '';
        if (character === "'" || character === '"' || SINGLE_WHITESPACE_PATTERN.test(character)) {
          break;
        }
        cursor += 1;
      }
      if (cursor > valueStart) {
        const value = contents.slice(valueStart, cursor).replace(/[,;)]$/, '');
        // The former global assignment expression consumed the complete raw value before looking
        // for another assignment. Preserve that behavior and avoid rescans inside the value.
        nextSearchIndex = cursor;
        const outcome: V24ClassificationOutcome = options.classifyValue
          ? options.classifyValue(value, identifier, line)
          : !isPlaceholderSecretValue(value) &&
              (looksLikeSecretValue(value) ||
                (options.allowCredentialNamedDigest === true &&
                  isLikelyDigestOrHash(value) &&
                  isExplicitCredentialIdentifier(identifier)))
            ? V24_REAL
            : V24_NO_FINDING;
        options.observeValue?.(value, outcome);
        if (outcome.classification !== 'no_finding') {
          const valueFingerprint = createHash('sha256').update(value).digest('hex');
          const characterClasses = [
            /[a-z]/.test(value) ? 'lower' : '',
            /[A-Z]/.test(value) ? 'upper' : '',
            /\d/.test(value) ? 'digit' : '',
            /[^A-Za-z0-9]/.test(value) ? 'symbol' : '',
          ]
            .filter(Boolean)
            .join('+');
          if (!excludedValueFingerprints.has(valueFingerprint)) {
            matches.push({
              identifier,
              line,
              valueLength: value.length,
              characterClasses: characterClasses || 'other',
              valueFingerprint,
              // Only ever set on the v24 classifier path; the legacy branch above yields V24_REAL,
              // whose `reason` is undefined, so these two keys stay absent exactly as before.
              ...(options.classifyValue
                ? {
                    classification: outcome.classification as Exclude<
                      V24SecretClassification,
                      'no_finding'
                    >,
                    ...(outcome.reason ? { classificationReason: outcome.reason } : {}),
                  }
                : {}),
            });
            if (matches.length >= maximumMatches) return matches;
          }
        }
      }
    }
    // Every later keyword before identifierEnd belongs to the same identifier and would inspect
    // the same suffix. Skip it so keyword-dense generated identifiers remain a single pass. When
    // a value matched, nextSearchIndex also skips the raw value consumed by the former expression.
    SECRET_IDENTIFIER_KEYWORD_PATTERN.lastIndex = nextSearchIndex;
    match = SECRET_IDENTIFIER_KEYWORD_PATTERN.exec(contents);
  }
  return matches;
}

function isExplicitCredentialIdentifier(identifier: string): boolean {
  return /^(?:github|gitlab|api|access)[_-]?(?:token|key)$/i.test(identifier);
}

function findWeakExplicitEnvCredential(contents: string): RealSecretAssignmentMatch | null {
  const lines = contents.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (/^\s*#/.test(line)) continue;
    const match =
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*(?:PASSWORD|PASSWD|PWD|SECRET(?:_KEY)?|API_KEY|TOKEN))\s*=\s*['"]?([^\s#'"]+)['"]?/i.exec(
        line,
      );
    const identifier = match?.[1];
    const value = match?.[2];
    if (!identifier || !value || isPlaceholderSecretValue(value)) continue;
    const minimumLength = /(?:API_KEY|TOKEN)$/i.test(identifier) ? 12 : 6;
    if (value.length < minimumLength) continue;
    const characterClasses = [
      /[a-z]/.test(value) ? 'lower' : '',
      /[A-Z]/.test(value) ? 'upper' : '',
      /\d/.test(value) ? 'digit' : '',
      /[^A-Za-z0-9]/.test(value) ? 'symbol' : '',
    ]
      .filter(Boolean)
      .join('+');
    return {
      identifier,
      line: index + 1,
      valueLength: value.length,
      characterClasses: characterClasses || 'other',
      valueFingerprint: createHash('sha256').update(value).digest('hex'),
    };
  }
  return null;
}

function findDatabaseUrlUserinfoCredential(contents: string): RealSecretAssignmentMatch | null {
  const lines = contents.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (/^\s*#/.test(line)) continue;
    const match =
      /^\s*(?:export\s+)?(DATABASE_URL)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))/i.exec(line);
    const identifier = match?.[1];
    const rawValue = match?.[2] ?? match?.[3] ?? match?.[4];
    if (!identifier || !rawValue) continue;
    let parsed: URL;
    try {
      parsed = new URL(rawValue);
    } catch {
      continue;
    }
    if (
      (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') ||
      !parsed.username ||
      !parsed.password
    ) {
      continue;
    }
    let password: string;
    try {
      password = decodeURIComponent(parsed.password);
    } catch {
      continue;
    }
    if (isPlaceholderSecretValue(password)) continue;
    const characterClasses = [
      /[a-z]/.test(password) ? 'lower' : '',
      /[A-Z]/.test(password) ? 'upper' : '',
      /\d/.test(password) ? 'digit' : '',
      /[^A-Za-z0-9]/.test(password) ? 'symbol' : '',
    ]
      .filter(Boolean)
      .join('+');
    return {
      identifier,
      line: index + 1,
      valueLength: password.length,
      characterClasses: characterClasses || 'other',
      valueFingerprint: createHash('sha256').update(password).digest('hex'),
    };
  }
  return null;
}

function findDefaultAdministrativeCredential(contents: string): RealSecretAssignmentMatch | null {
  const lines = contents.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const match =
      /\b([A-Za-z0-9_]*(?:ADMIN|ROOT)[A-Za-z0-9_]*(?:PASSWORD|PASSWD|PWD))\s*[:=]\s*["']?(admin|root|password)["']?(?:\s|$)/i.exec(
        line,
      );
    const identifier = match?.[1];
    const value = match?.[2];
    if (!identifier || !value) continue;
    return {
      identifier,
      line: index + 1,
      valueLength: value.length,
      characterClasses: 'lower',
      valueFingerprint: createHash('sha256').update(value).digest('hex'),
      kind: 'default_admin',
    };
  }
  return null;
}

function secretEvidenceLabel(prefix: string, match: RealSecretAssignmentMatch): string {
  return `${prefix} (value redacted; length ${match.valueLength}; classes ${match.characterClasses})`;
}

function isSecretIdentifierCharacter(characterCode: number): boolean {
  return (
    (characterCode >= 48 && characterCode <= 57) ||
    (characterCode >= 65 && characterCode <= 90) ||
    characterCode === 95 ||
    (characterCode >= 97 && characterCode <= 122)
  );
}

interface HistorySecretScanResult {
  // A confirmed high-entropy secret value found in a historical blob — critical.
  evidence: WitanEvidencePointer | null;
  // The `kind` of the match `evidence` was built from (mirrors RealSecretAssignmentMatch['kind']
  // — e.g. 'pem_private_key'), carried alongside `evidence` rather than recovered by matching
  // substrings in `evidence.label`, so a future wording change to that label can never silently
  // reclassify the finding. Only meaningful when `evidence` is non-null.
  secretKind: RealSecretAssignmentMatch['kind'] | null;
  // A non-template .env file path was tracked in history, but no confirmed secret
  // value was found in the scanned content — at most a warning, never a critical
  // ("bare path", not a "value"). Templates never reach this: isCredentialHistoryPath
  // excludes them before they are ever blob-scanned.
  envPathEvidence: WitanEvidencePointer | null;
  truncated: boolean;
}

const CONTROL_CHARACTER_HISTORY_PATH_LIMITATION =
  'Git history contained a credential-shaped pathname with control characters. Cejel omitted that path from historical blob inspection and continued with reduced history evidence.';

function declareHistoryFailure(
  scanLimitations: Set<string>,
  reason: Exclude<GitExecResult, { readonly ok: true }>['reason'],
  operation: string,
  maxBufferBytes?: number,
): void {
  scanLimitations.add(
    `${describeGitFailure(reason, operation, maxBufferBytes)} Cejel continued with reduced Git history evidence.`,
  );
}

function collectHistorySecretEvidence(
  repoPath: string,
  excludeHead: boolean,
  currentSecretFingerprintsByPath: ReadonlyMap<string, ReadonlySet<string>>,
  scanLimitations: Set<string>,
  authoredProductionOnly = false,
  useV36Detectors = false,
  useV39Detectors = false,
  useV47Detectors = false,
  useV23PemPrivateKeyGrammar = false,
): HistorySecretScanResult {
  const historyEntries = readCredentialHistoryEntries(
    repoPath,
    scanLimitations,
    useV36Detectors,
    useV23PemPrivateKeyGrammar,
  );
  const head = excludeHead ? readGitHead(repoPath) : null;
  let scannedFiles = 0;
  let v23WidenedOnlyScanned = 0;
  let envPathEvidence: WitanEvidencePointer | null = null;
  for (const entry of historyEntries) {
    if (head && entry.commit === head) continue;
    if (
      authoredProductionOnly &&
      !(useV47Detectors
        ? isV47AuthoredProductionPath(entry.path)
        : useV39Detectors
          ? isV39AuthoredProductionPath(entry.path)
          : isAuthoredProductionPath(entry.path))
    ) {
      continue;
    }
    // Draws from the small, separate v23-widened budget instead of the main one — see
    // V23_PEM_WIDENED_HISTORY_BLOB_LIMIT above — so it can never crowd out base-classified
    // candidates from HISTORY_SECRET_SCAN_CREDENTIAL_BLOB_LIMIT.
    const isV23WidenedOnly =
      useV23PemPrivateKeyGrammar &&
      isV23PemCredentialHistoryPath(historyPathBasename(entry.path.toLowerCase())) &&
      !isCredentialHistoryPath(entry.path, useV36Detectors, false);
    if (isV23WidenedOnly) {
      if (v23WidenedOnlyScanned >= V23_PEM_WIDENED_HISTORY_BLOB_LIMIT) continue;
      v23WidenedOnlyScanned += 1;
    } else {
      if (scannedFiles >= HISTORY_SECRET_SCAN_CREDENTIAL_BLOB_LIMIT) {
        return { evidence: null, secretKind: null, envPathEvidence, truncated: true };
      }
      scannedFiles += 1;
    }
    const contents = readGitBlob(repoPath, entry.commit, entry.path, scanLimitations);
    if (!contents) continue;
    const scanContents = prepareCredentialScanContents(
      contents,
      entry.path,
      useV36Detectors,
      useV39Detectors,
      useV47Detectors,
    );
    const currentFingerprints = currentSecretFingerprintsByPath.get(entry.path) ?? new Set();
    let secretMatch = findRealSecretAssignment(scanContents, currentFingerprints, {
      allowCredentialNamedDigest: useV36Detectors,
    });
    if (!secretMatch && useV23PemPrivateKeyGrammar) {
      const pemMatch = findPemPrivateKeyAssignment(scanContents, entry.path);
      if (pemMatch && !currentFingerprints.has(pemMatch.valueFingerprint)) {
        secretMatch = pemMatch;
      }
    }
    if (
      !secretMatch &&
      useV39Detectors &&
      isEnvHistoryPath(entry.path, useV36Detectors, useV47Detectors)
    ) {
      const databaseUrlCredential = findDatabaseUrlUserinfoCredential(scanContents);
      if (databaseUrlCredential && !currentFingerprints.has(databaseUrlCredential.valueFingerprint)) {
        secretMatch = databaseUrlCredential;
      }
    }
    if (
      !secretMatch &&
      useV39Detectors &&
      isEnvHistoryPath(entry.path, useV36Detectors, useV47Detectors)
    ) {
      const weakCredential = findWeakExplicitEnvCredential(scanContents);
      if (weakCredential && !currentFingerprints.has(weakCredential.valueFingerprint)) {
        secretMatch = weakCredential;
      }
    }
    if (secretMatch) {
      return {
        evidence: {
          kind: 'secret_scan',
          label: secretEvidenceLabel(
            secretMatch.kind === 'pem_private_key'
              ? 'Committed PEM-formatted private key in recent git history'
              : 'Committed secret in recent git history',
            secretMatch,
          ),
          path: entry.path,
          line: secretMatch.line,
          contentHash: entry.commit,
        },
        secretKind: secretMatch.kind ?? null,
        envPathEvidence,
        truncated: false,
      };
    }
    if (!envPathEvidence && isEnvHistoryPath(entry.path, useV36Detectors, useV47Detectors)) {
      envPathEvidence = {
        kind: 'secret_scan',
        label: '.env file (not a template) tracked in git history; no confirmed secret value found',
        path: entry.path,
        contentHash: entry.commit,
      };
    }
  }
  return { evidence: null, secretKind: null, envPathEvidence, truncated: false };
}

interface GitHistoryEntry {
  commit: string;
  path: string;
}

function readCredentialHistoryEntries(
  repoPath: string,
  scanLimitations: Set<string>,
  useV36Detectors = false,
  useV23PemPrivateKeyGrammar = false,
): GitHistoryEntry[] {
  const entries: GitHistoryEntry[] = [];
  const seen = new Set<string>();

  const appendEntry = (entry: GitHistoryEntry): void => {
    const key = `${entry.commit}:${entry.path}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };

  // A report is bound to the checked-out revision. Unrelated local branches and
  // remote-tracking refs are ambient clone state, not evidence for that revision.
  const commitsResult = execGit(['rev-list', 'HEAD'], { cwd: repoPath });
  if (!commitsResult.ok && !isExpectedGitAbsence(commitsResult)) {
    declareHistoryFailure(scanLimitations, commitsResult.reason, 'history revision enumeration');
  }
  if (commitsResult.ok) {
    const historyResult = execGit(
      [
        'diff-tree',
        '--stdin',
        '--root',
        '--name-only',
        '-r',
        '--diff-filter=AM',
        '-z',
        '--pretty=format:commit:%H%x00',
      ],
      { cwd: repoPath, input: commitsResult.stdout },
    );
    if (!historyResult.ok) {
      if (!isExpectedGitAbsence(historyResult)) {
        declareHistoryFailure(scanLimitations, historyResult.reason, 'history tree enumeration');
      }
    } else {
      let currentCommit: string | null = null;
      for (const rawToken of historyResult.stdout.split('\0')) {
        const token = rawToken.startsWith('\n') ? rawToken.slice(1) : rawToken;
        if (token.startsWith('commit:')) {
          currentCommit = token.slice('commit:'.length);
          continue;
        }
        const path = token;
        if (!currentCommit || !path) continue;
        if (/[\u0000-\u001f\u007f]/.test(path)) {
          scanLimitations.add(CONTROL_CHARACTER_HISTORY_PATH_LIMITATION);
          continue;
        }
        if (!isCredentialHistoryPath(path, useV36Detectors, useV23PemPrivateKeyGrammar)) continue;
        appendEntry({ commit: currentCommit, path });
      }
    }
  }

  for (const entry of readDeletedCredentialHistoryEntries(
    repoPath,
    scanLimitations,
    useV36Detectors,
    useV23PemPrivateKeyGrammar,
  )) {
    appendEntry(entry);
  }

  return entries;
}

function readDeletedCredentialHistoryEntries(
  repoPath: string,
  scanLimitations: Set<string>,
  useV36Detectors = false,
  useV23PemPrivateKeyGrammar = false,
): GitHistoryEntry[] {
  const deletedPaths = readDeletedCredentialHistoryPaths(
    repoPath,
    scanLimitations,
    useV36Detectors,
    useV23PemPrivateKeyGrammar,
  );
  const entries: GitHistoryEntry[] = [];
  const seen = new Set<string>();
  for (const path of deletedPaths) {
    for (const commit of readHistoryCommitsForPath(repoPath, path, scanLimitations)) {
      const key = `${commit}:${path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ commit, path });
    }
  }
  return entries;
}

function readDeletedCredentialHistoryPaths(
  repoPath: string,
  scanLimitations: Set<string>,
  useV36Detectors = false,
  useV23PemPrivateKeyGrammar = false,
): string[] {
  const historyResult = execGit(
    [
      'log',
      '--no-show-signature',
      'HEAD',
      '--diff-filter=D',
      '--name-only',
      '-z',
      '--format=commit:%H%x00',
    ],
    { cwd: repoPath },
  );
  if (!historyResult.ok) {
    if (isExpectedGitAbsence(historyResult)) return [];
    declareHistoryFailure(scanLimitations, historyResult.reason, 'deleted-path history scan');
    return [];
  }
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const rawToken of historyResult.stdout.split('\0')) {
    const path = rawToken.startsWith('\n') ? rawToken.slice(1) : rawToken;
    if (path.startsWith('commit:') || !path) continue;
    if (/[\u0000-\u001f\u007f]/.test(path)) {
      scanLimitations.add(CONTROL_CHARACTER_HISTORY_PATH_LIMITATION);
      continue;
    }
    if (!path || seen.has(path)) continue;
    if (!isCredentialHistoryPath(path, useV36Detectors, useV23PemPrivateKeyGrammar)) continue;
    seen.add(path);
    paths.push(path);
  }
  return paths;
}

function readHistoryCommitsForPath(
  repoPath: string,
  path: string,
  scanLimitations: Set<string>,
): string[] {
  const historyResult = execGit(
    ['log', '--no-show-signature', 'HEAD', '--diff-filter=AM', '--format=%H', '--', path],
    { cwd: repoPath },
  );
  if (!historyResult.ok) {
    if (isExpectedGitAbsence(historyResult)) return [];
    declareHistoryFailure(scanLimitations, historyResult.reason, 'path history scan');
    return [];
  }
  return historyResult.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[0-9a-f]{40}$/i.test(line));
}

// v23-only (goal_cejel_v23_pem_private_key_grammar_2026-09-06): a service-account key export
// (GCP/AWS-style) is conventionally named around "key" or "service-account", not "secret" or
// "credential" — the cycle-12 miss was exactly this shape, and isCredentialHistoryPath's prior
// path candidate set excludes it, so the blob is never even read for the value grammar below to
// reject or accept. Narrowly widened to basenames that are both ".json" AND key-shaped, rather
// than every ".json" in history, to keep the history-scan blob-read cost bounded — the same
// reasoning that keeps the rest of this candidate set to a short, specific list.
const V23_KEY_SHAPED_JSON_PATH_PATTERN =
  /(?<![A-Za-z0-9])(?:service[-_]?account|private[-_]?key|creds?|key)(?![A-Za-z0-9])/i;

// Shared by isCredentialHistoryPath and isV23PemCredentialHistoryPath so a future hardening of
// basename extraction here (e.g. also splitting on `\` for Windows-style paths) is inherited by
// both instead of being applied to one and silently missed on the other.
function historyPathBasename(lowerPath: string): string {
  return lowerPath.split('/').at(-1) ?? lowerPath;
}

function isV23PemCredentialHistoryPath(basename: string): boolean {
  return basename.endsWith('.json') && V23_KEY_SHAPED_JSON_PATH_PATTERN.test(basename);
}

function isCredentialHistoryPath(
  path: string,
  _useV36Detectors = false,
  useV23PemPrivateKeyGrammar = false,
): boolean {
  if (isHardExcludedPath(path)) return false;
  // Note: template paths (.env.example etc.) are intentionally NOT excluded here —
  // a real secret can still leak through a template path (e.g. committed, then later
  // redacted to placeholders in a follow-up commit); the path alone never proves the
  // content is safe. containsRealSecret (content-based) is what decides critical vs
  // not — see isPlaceholderSecretValue's ALL_CAPS_SNAKE_PLACEHOLDER_PATTERN for how
  // genuine template placeholder VALUES are told apart from real leaked values.
  const lowerPath = path.toLowerCase();
  const basename = historyPathBasename(lowerPath);
  if (/\.env(?:\.|$)/.test(basename)) {
    return true;
  }
  if (
    lowerPath.includes('secret') ||
    lowerPath.includes('credential') ||
    basename.endsWith('.pem') ||
    basename.endsWith('.key') ||
    basename === 'id_rsa' ||
    basename.endsWith('.p12') ||
    basename.endsWith('.pfx')
  ) {
    return true;
  }
  return useV23PemPrivateKeyGrammar && isV23PemCredentialHistoryPath(basename);
}

// Non-template .env-shaped path — explicitly excludes .env.example/.sample/.template/.dist,
// since a bare template PATH (with no confirmed secret value) is never even a warning: it's
// the canonical safe pattern (goal_cejel_calibration_findings_precision_2026-07-06). Used to
// distinguish "a real, non-template .env file was tracked, value unknown" (warning) from
// "a real high-entropy secret value was found" (critical, handled separately via containsRealSecret).
function isEnvHistoryPath(path: string, useV36Detectors = false, useV47Detectors = false): boolean {
  if (isEnvTemplatePath(path, useV47Detectors)) return false;
  if (useV47Detectors && !isV47AuthoredProductionPath(path)) return false;
  const basename = path.toLowerCase().split('/').at(-1) ?? path.toLowerCase();
  return (useV36Detectors ? /^\.env(?:\.|$)/ : /\.env(?:\.|$)/).test(basename);
}

function readGitBlob(
  repoPath: string,
  commit: string,
  path: string,
  scanLimitations: Set<string>,
): string | null {
  const maxBufferBytes = 512_000;
  const blobResult = execGit(['show', `${commit}:${path}`], {
    cwd: repoPath,
    maxBufferBytes,
  });
  if (!blobResult.ok) {
    if (isExpectedGitAbsence(blobResult)) return null;
    declareHistoryFailure(
      scanLimitations,
      blobResult.reason,
      'historical blob read',
      maxBufferBytes,
    );
    return null;
  }
  return blobResult.stdout;
}

// A human-readable ALL-CAPS snake_case label (YOUR_API_KEY_HERE, CHANGE_THIS_VALUE,
// INSERT_SECRET_HERE, NOT_SET) is a common .env.example placeholder convention that
// doesn't necessarily contain "your"/"example"/etc — but real secret tokens are never
// pure-uppercase English words joined by underscores; they use mixed-case/base64/hex
// charsets with no natural word boundaries. Requires >=1 underscore so contiguous
// all-caps IDs like AKIA... (no separator) are unaffected — found running Cejel on
// site-machine's .env.example (goal_cejel_calibration_findings_precision_2026-07-06).
const ALL_CAPS_SNAKE_PLACEHOLDER_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

export function isPlaceholderSecretValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    PLACEHOLDER_SECRET_PATTERN.test(normalized) ||
    normalized.includes('your-') ||
    normalized.includes('example') ||
    ALL_CAPS_SNAKE_PLACEHOLDER_PATTERN.test(value.trim()) ||
    isSyntheticFixtureSecretValue(normalized) ||
    isFillerRunSecretValue(normalized)
  );
}

// A2 disclosure, every rubric. A value that has the shape of a credential (looksLikeSecretValue)
// but that isPlaceholderSecretValue sets aside — the AWS documentation pair, for example, which
// contains "EXAMPLE" — does not count against secret cleanliness. That is a precision choice and is
// unchanged. Before this, it left no trace, so "clean" read as "nothing credential-shaped was
// found". These values are now counted, by file, and named on the certificate. Nothing here feeds
// a metric, a finding or an evidence pointer.
interface PlaceholderSetAsideCount {
  count: number;
}

/**
 * A credential-shaped value the placeholder rule set aside: the scan reported nothing for it, it
 * carries a placeholder marker, and without that marker it would read as a secret.
 */
function isPlaceholderSetAsideSecret(value: string, outcome: V24ClassificationOutcome): boolean {
  return (
    outcome.classification === 'no_finding' &&
    isPlaceholderSecretValue(value) &&
    looksLikeSecretValue(value)
  );
}

export interface PlaceholderSetAsideFile {
  readonly path: string;
  readonly count: number;
}

const PLACEHOLDER_SET_ASIDE_PATHS_SHOWN = 3;

function placeholderSetAsidePathList(files: readonly PlaceholderSetAsideFile[], shown: number): string {
  const named = files.slice(0, shown).map((file) => file.path);
  const more = files.length - named.length;
  return more > 0 ? `${named.join(', ')} and ${more} more file${more === 1 ? '' : 's'}` : named.join(', ');
}

function placeholderSetAsideValues(files: readonly PlaceholderSetAsideFile[]): string {
  const total = files.reduce((sum, file) => sum + file.count, 0);
  return `${total} credential-shaped value${total === 1 ? '' : 's'}`;
}

/**
 * A2's disclosure, which the certificate lists under "What was not established". It always starts
 * with WITAN_A2_PLACEHOLDER_SET_ASIDE_PREFIX. `budget` is the schema's room for one disclosure;
 * paths are dropped to fit.
 */
export function placeholderSetAsideDisclosure(
  files: readonly PlaceholderSetAsideFile[],
  budget = Number.POSITIVE_INFINITY,
): string {
  const total = files.reduce((sum, file) => sum + file.count, 0);
  const lead = `${WITAN_A2_PLACEHOLDER_SET_ASIDE_PREFIX}${placeholderSetAsideValues(files)} as ${total === 1 ? 'a documentation placeholder because it contains' : 'documentation placeholders because they contain'} a placeholder marker such as "example", so ${total === 1 ? 'it was' : 'they were'} not counted against secret cleanliness or checked further`;
  for (let shown = Math.min(files.length, PLACEHOLDER_SET_ASIDE_PATHS_SHOWN); shown > 0; shown -= 1) {
    const sentence = `${lead}: ${placeholderSetAsidePathList(files, shown)}.`;
    if (sentence.length <= budget) return sentence;
  }
  const countOnly = `${lead}, in ${files.length} file${files.length === 1 ? '' : 's'}.`;
  return countOnly.length <= budget ? countOnly : '';
}

/** The same fact, short enough for the secret_cleanliness metric line (schema maximum 240). */
function placeholderSetAsideCondition(files: readonly PlaceholderSetAsideFile[]): string {
  const lead = `${placeholderSetAsideValues(files)} set aside as documentation placeholders, not counted`;
  for (let shown = Math.min(files.length, PLACEHOLDER_SET_ASIDE_PATHS_SHOWN); shown > 0; shown -= 1) {
    const condition = `${lead}: ${placeholderSetAsidePathList(files, shown)}`;
    if (condition.length <= METRIC_CONDITION_MAX_LENGTH) return condition;
  }
  return `${lead} (${files.length} file${files.length === 1 ? '' : 's'})`;
}

// WitanCriterionMetric presentation `condition` maximum.
const METRIC_CONDITION_MAX_LENGTH = 240;
// WitanCriterionSignalPayload `notes` maximum.
const CRITERION_NOTES_MAX_LENGTH = 1000;
// WitanCriterionDisclosuresSchema's per-sentence maximum.
const CRITERION_DISCLOSURE_MAX_LENGTH = 1000;

function placeholderSetAsideDisclosures(
  files: readonly PlaceholderSetAsideFile[],
): { disclosures?: string[] } {
  if (files.length === 0) return {};
  const sentence = placeholderSetAsideDisclosure(files, CRITERION_DISCLOSURE_MAX_LENGTH);
  return sentence ? { disclosures: [sentence] } : {};
}

// A doc placeholder often looks like a real token — a plausible prefix followed
// by a long run of a single filler character (e.g. `qd_agent_xxxxxxxx…`,
// `sk-xxxxxxxx`, `ghp_0000…`). PLACEHOLDER_SECRET_PATTERN only catches values that
// are ENTIRELY filler (`^x{3,}$`), so a prefixed filler-run slips through and gets
// scored as a committed secret (found 2026-06-30 running Witan on the QuantDinger
// competitor repo). This recognizes an entropy-free body: after optionally stripping
// a prefix that ends in a separator, the remainder is dominated by one repeated
// character with at most two distinct characters. A genuine high-entropy secret has
// many distinct characters and is never matched.
function isFillerRunSecretValue(value: string): boolean {
  const candidates = [value];
  const sepIdx = Math.max(value.lastIndexOf('_'), value.lastIndexOf('-'));
  if (sepIdx > 0 && sepIdx < value.length - 1) {
    candidates.push(value.slice(sepIdx + 1));
  }
  for (const body of candidates) {
    if (body.length < 8) continue;
    const counts = new Map<string, number>();
    for (const ch of body) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    const distinct = counts.size;
    const maxRun = Math.max(...counts.values());
    if (distinct <= 2 && maxRun / body.length >= 0.8) return true;
  }
  return false;
}

function isSyntheticFixtureSecretValue(value: string): boolean {
  return (
    value.includes('abcdefghijklmnopqrstuvwxyz') ||
    value.includes('0123456789abcdefghijklmnopqrstuvwxyz') ||
    value.includes('abcdefghijklmnopqrstuvwxyz0123456789') ||
    value.includes('abcdefghijklmnopqrst')
  );
}

// ---- v24-only: A2 content-context classification of secret-shaped values -------------------
// (goal_cejel_secret_posture_context_track_b_2026-09-15.) Every rubric up to v23 answers part of
// "is this matched value a real credential?" from the file's PATH: V39_NON_PRODUCTION_CREDENTIAL_
// PATH_PATTERN and V47_NON_PRODUCTION_CREDENTIAL_PATH_PATTERN delete docs/, documentation/,
// lessons/, cookbooks/ and every .md/.mdx/.rst/.adoc file from A2's current-tree secret scan. That
// rule is disqualified by design, not by defect: it cannot tell a placeholder written into a
// documentation page from a live credential accidentally committed to one, and it silences the
// second in order to suppress the first. A real secret under docs/ must still flag.
//
// v24 replaces it with a classification of the value itself plus a bounded window of that file's
// own text, producing exactly one of three outcomes:
//
//   no_finding — the value is intrinsically instructional, or below the candidate net entirely;
//   real       — the value clears the unchanged v22 high-confidence bar, flagged at unchanged
//                severity and evidence wherever it lives;
//   ambiguous  — Cejel cannot decide from content, and abstains `secret_cleanliness` with a
//                stated reason instead of reporting a silent pass.
//
// SIGNALS THE CLASSIFIER USES: the matched value's own composition — word structure against a
// closed committed gazetteer, character classes, Shannon entropy, filler runs, template
// interpolation, a documented vendor test-mode prefix combined with a placeholder-shaped body —
// and a ±3-line window of the same file's raw text matched against a closed committed
// instructional-marker vocabulary.
//
// SIGNALS IT DELIBERATELY DOES NOT USE: the file's path, directory name, or extension; the
// repository's name, archetype, language, or size; the assigned identifier's resemblance to a
// path; and anything outside the file being scanned. Identical bytes therefore produce an
// identical verdict wherever they live — asserted directly in a2-secret-content-context-v24.test.ts
// rather than inferred from the absence of a path read here.
type V24SecretClassification = 'no_finding' | 'real' | 'ambiguous';

interface V24ClassificationOutcome {
  readonly classification: V24SecretClassification;
  readonly reason?: string;
}

const V24_NO_FINDING: V24ClassificationOutcome = { classification: 'no_finding' };
const V24_REAL: V24ClassificationOutcome = { classification: 'real' };

// Both reasons are reproduced verbatim in the emitted finding, so a certificate reader sees why
// Cejel declined to answer rather than a bare "insufficient_data".
const V24_AMBIGUOUS_INSTRUCTIONAL_REASON =
  'the value clears the confident real-secret bar but sits in an instructional context, and a committed example is indistinguishable from a pasted live credential by content alone';
const V24_AMBIGUOUS_UNCLASSIFIED_REASON =
  'the value clears neither the placeholder vocabulary nor the confident real-secret bar, so Cejel has no basis to call it either a credential or an example';

const V24_CONTEXT_LINE_RADIUS = 3;
// Each window line is truncated before matching. The marker pattern is a flat literal alternation
// with no nested quantifier, but a minified or generated file can still be one megabyte-long line
// and there is no instructional marker worth finding past the first few hundred characters
// (docs/filename-redos-verification-2026-09-10.md discipline).
const V24_CONTEXT_LINE_SCAN_LIMIT = 400;

// Closed, explicit, version-controlled instructional vocabulary. Reviewable in the pull request,
// never inferred at runtime, never extended from repository content.
const V24_INSTRUCTIONAL_MARKER_PATTERN =
  /replace (?:this|it|the|with|these|your)|your own|for example|example only|sample value|placeholder|dummy value|not a real|not real|do not use this|never commit|for illustration|paste your|copy your|insert your|fill in|shown here/i;

// The same discipline for the value itself: a credential is never a sequence of ordinary English
// instruction words, however long or mixed-case it is. Lexical shape alone cannot separate
// `ReplaceThisWithYourOwnApiKeyValue1234567890` from a token — word composition can
// (alfred_pr_lessons_2026-07-09, entry 22).
const V24_PLACEHOLDER_WORD_GAZETTEER: ReadonlySet<string> = new Set([
  'a', 'actual', 'add', 'api', 'application', 'before', 'change', 'changeme', 'console', 'copy',
  'credential', 'dashboard', 'demo', 'do', 'docs', 'documentation', 'dummy', 'enter', 'example',
  'fake', 'fill', 'for', 'from', 'generate', 'get', 'goes', 'here', 'hidden', 'in', 'insert',
  'instead', 'key', 'live', 'me', 'my', 'not', 'of', 'obtain', 'omitted', 'on', 'own', 'paste',
  'password', 'placeholder', 'production', 'provide', 'put', 'real', 'redacted', 'removed',
  'replace', 'running', 'sample', 'secret', 'set', 'supply', 'the', 'this', 'to', 'token',
  'tutorial', 'type', 'use', 'value', 'with', 'your',
]);

const V24_TEMPLATE_INTERPOLATION_PATTERN =
  /\{\{[^{}]{1,64}\}\}|\$\{[^{}]{1,64}\}|%\([A-Za-z_][A-Za-z0-9_]{0,63}\)s|^<[^<>]{1,64}>$|^\$[A-Z][A-Z0-9_]{2,63}$/;

// Publicly documented vendor test-mode prefixes. The prefix ALONE never qualifies a value: a real
// key is routinely copy-pasted into a variable whose name says `test`, so the body must itself be
// placeholder-shaped.
const V24_VENDOR_TEST_MODE_PREFIX_PATTERN = /^(?:sk|pk|rk|whsec)_test_/i;

// The candidate net — deliberately wider than `looksLikeSecretValue`, because the whole point of
// the third outcome is that values BETWEEN "obviously an example" and "confidently a credential"
// stop disappearing silently.
const V24_CANDIDATE_VALUE_PATTERN = /^[A-Za-z0-9/+_.:~-]{16,}$/;
const V24_CANDIDATE_MINIMUM_ENTROPY_PER_CHAR = 3;
// A value that is plainly a REFERENCE to a credential rather than a credential: a dotted
// identifier chain (`process.env.API_KEY`, `settings.SECRET_KEY`), a URL, or a filesystem path.
// Without these the candidate net would abstain on the single most common CORRECT way to handle a
// secret, which would make the abstention worthless noise rather than a signal.
const V24_CREDENTIAL_REFERENCE_PATTERN =
  /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/;
const V24_URL_OR_FILESYSTEM_VALUE_PATTERN = /^(?:[a-z][a-z0-9+.-]{0,31}:\/\/|\.{0,2}\/|~\/)/i;

/**
 * Splits a value into words on separators, camelCase boundaries, and letter/digit boundaries.
 * The last of those matters: `...ApiKeyValue1234567890` is one instructional phrase with a filler
 * digit run glued to its final word, and without that split the whole value fails the gazetteer on
 * a token (`Value1234567890`) that is not a word at all.
 */
function splitV24ValueWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0);
}

/**
 * True when every alphabetic word in the value is drawn from the committed gazetteer and there are
 * at least three of them. Requiring EVERY word (not a majority) is what keeps this safe: a real
 * credential would have to be composed entirely of common instruction words to collide.
 */
function isV24InstructionalPhraseValue(value: string): boolean {
  const words = splitV24ValueWords(value);
  if (words.length < 3) return false;
  let alphabeticWords = 0;
  for (const word of words) {
    if (/^\d+$/.test(word)) continue;
    if (!V24_PLACEHOLDER_WORD_GAZETTEER.has(word.toLowerCase())) return false;
    alphabeticWords += 1;
  }
  return alphabeticWords >= 3;
}

/**
 * Value-intrinsic placeholder evidence. This is the ONLY branch that can clear a value to a silent
 * no-finding, so it reads nothing but the value: an instructional phrase, an unfilled template
 * interpolation, or a vendor test-mode prefix over a placeholder-shaped body. Surrounding prose can
 * never reach this branch — prose next to a real-looking value abstains instead.
 */
function isV24IntrinsicPlaceholderValue(value: string): boolean {
  if (isPlaceholderSecretValue(value)) return true;
  if (isV24InstructionalPhraseValue(value)) return true;
  if (V24_TEMPLATE_INTERPOLATION_PATTERN.test(value)) return true;
  if (V24_VENDOR_TEST_MODE_PREFIX_PATTERN.test(value)) {
    const body = value.replace(V24_VENDOR_TEST_MODE_PREFIX_PATTERN, '');
    return isPlaceholderSecretValue(body) || isV24InstructionalPhraseValue(body);
  }
  return false;
}

function isV24CandidateSecretValue(value: string): boolean {
  if (!V24_CANDIDATE_VALUE_PATTERN.test(value)) return false;
  if (V24_CREDENTIAL_REFERENCE_PATTERN.test(value)) return false;
  if (V24_URL_OR_FILESYSTEM_VALUE_PATTERN.test(value)) return false;
  if (isLikelyDigestOrHash(value)) return false;
  const classCount = [/[a-z]/, /[A-Z]/, /[0-9]/, /[+/_.:~-]/].filter((pattern) =>
    pattern.test(value),
  ).length;
  if (classCount < 2) return false;
  return shannonEntropyPerChar(value) >= V24_CANDIDATE_MINIMUM_ENTROPY_PER_CHAR;
}

function hasV24InstructionalContext(rawLines: readonly string[], line: number): boolean {
  const start = Math.max(0, line - 1 - V24_CONTEXT_LINE_RADIUS);
  const end = Math.min(rawLines.length, line + V24_CONTEXT_LINE_RADIUS);
  for (let index = start; index < end; index += 1) {
    const candidate = (rawLines[index] ?? '').slice(0, V24_CONTEXT_LINE_SCAN_LIMIT);
    if (V24_INSTRUCTIONAL_MARKER_PATTERN.test(candidate)) return true;
  }
  return false;
}

function classifyV24SecretShapedValue(
  value: string,
  identifier: string,
  line: number,
  rawLines: readonly string[],
  allowCredentialNamedDigest: boolean,
): V24ClassificationOutcome {
  if (isV24IntrinsicPlaceholderValue(value)) return V24_NO_FINDING;
  // Rule 3 of the protocol: a match satisfying no intrinsic placeholder signal is evaluated
  // against the EXISTING high-confidence bar, unchanged. Context can move it to an abstention but
  // must never downgrade it to a silent pass.
  const clearsRealBar =
    looksLikeSecretValue(value) ||
    (allowCredentialNamedDigest &&
      isLikelyDigestOrHash(value) &&
      isExplicitCredentialIdentifier(identifier));
  const instructionalContext = hasV24InstructionalContext(rawLines, line);
  if (clearsRealBar) {
    return instructionalContext
      ? { classification: 'ambiguous', reason: V24_AMBIGUOUS_INSTRUCTIONAL_REASON }
      : V24_REAL;
  }
  if (!isV24CandidateSecretValue(value)) return V24_NO_FINDING;
  if (instructionalContext) return V24_NO_FINDING;
  return { classification: 'ambiguous', reason: V24_AMBIGUOUS_UNCLASSIFIED_REASON };
}

function hasSuspiciousDependencies(
  repoPath: string,
  manifest: string,
  useV47Detectors = false,
): boolean {
  if (!manifest.endsWith('package.json')) return false;
  const fullPath = join(repoPath, manifest);
  if (!isRegularFile(fullPath)) return false;
  // A malformed/BOM'd package.json must skip this check, never abort the scan.
  const parsed = parseJsonObject(readRepoText(fullPath, 'utf8'));
  if (!parsed) return false;
  const dependencies = isRecord(parsed.dependencies) ? parsed.dependencies : {};
  const devDependencies = isRecord(parsed.devDependencies) ? parsed.devDependencies : {};
  const names = [...Object.keys(dependencies), ...Object.keys(devDependencies)];
  if (
    names.some((name) =>
      /^(todo|fake|placeholder|example)-|does-not-exist| hallucinated/i.test(name),
    )
  ) {
    return true;
  }
  if (!useV47Detectors || typeof parsed.name !== 'string') return false;
  const placeholderIdentity = /^(?:example|sample|placeholder|todo|fake)(?:-|$)/i.test(parsed.name);
  const placeholderMetadata =
    (typeof parsed.author === 'string' &&
      /^(?:your name|example|placeholder)$/i.test(parsed.author)) ||
    (typeof parsed.description === 'string' &&
      /^(?:package description|example|placeholder|todo)$/i.test(parsed.description));
  return placeholderIdentity && placeholderMetadata;
}

interface GitCommitSummary {
  sha: string;
  subject: string;
}

function readRecentCommits(repoPath: string): GitCommitSummary[] {
  const historyResult = execGit(
    ['log', '--no-show-signature', `--max-count=${RECENT_COMMIT_WINDOW}`, '--format=%H%x00%s'],
    {
      cwd: repoPath,
    },
  );
  if (!historyResult.ok) {
    if (isExpectedGitAbsence(historyResult)) return [];
    throw new Error(describeGitFailure(historyResult.reason, 'recent history scan'));
  }
  const output = historyResult.stdout.trim();
  if (!output) return [];
  return output
    .split('\n')
    .map((line) => {
      const [sha = '', subject = ''] = line.split('\0');
      return { sha, subject };
    })
    .filter((commit) => commit.sha.length >= 7);
}

function readPackageScripts(packageJsonPath: string): Map<string, string> {
  if (!isRegularFile(packageJsonPath)) return new Map();
  // A malformed/BOM'd package.json must skip this check, never abort the scan.
  const parsed = parseJsonObject(readRepoText(packageJsonPath, 'utf8'));
  const scripts = parsed?.scripts;
  if (!isRecord(scripts)) return new Map();
  return new Map(
    Object.entries(scripts).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

export function evidenceForRelative(
  repoPath: string,
  path: string,
  kind: WitanEvidencePointer['kind'],
  label: string,
): WitanEvidencePointer {
  const fullPath = join(repoPath, path);
  const contents = isRegularFile(fullPath) ? readRepoText(fullPath, 'utf8') : '';
  return {
    kind,
    label,
    path,
    ...(contents
      ? {
          line: firstMeaningfulLine(contents),
          contentHash: createHash('sha256').update(contents).digest('hex'),
        }
      : {}),
  };
}

// Evidence for a finding anchored to a SPECIFIC in-file match (not mere file presence): line is
// the real 1-based line the caller already measured, or explicit null when no real position was
// found — never firstMeaningfulLine's "first non-blank line of the file" fallback, which is a
// fabricated position for a match-anchored finding (D4 — cejel reported `line: 1` for its own
// test fixture this way; see goal_cejel_a2_one_notion_of_production_code_2026-07-13).
export function evidenceForRelativeAtLine(
  repoPath: string,
  path: string,
  kind: WitanEvidencePointer['kind'],
  label: string,
  line: number | null,
): WitanEvidencePointer {
  const fullPath = join(repoPath, path);
  const contents = isRegularFile(fullPath) ? readRepoText(fullPath, 'utf8') : '';
  return {
    kind,
    label,
    path,
    line,
    ...(contents ? { contentHash: createHash('sha256').update(contents).digest('hex') } : {}),
  };
}

function metric(
  name: CertificateMetricName,
  label: string,
  value: number,
  max: number,
  weight: number,
  unit: string,
  description: string,
  kind?: 'ratio' | 'saturating_count',
  presentation?: WitanCriterionMetric['presentation'],
): WitanCriterionMetric {
  const normalizedValue = Math.max(0, value);
  if (presentation?.components) {
    const explainedValue = presentation.components.reduce(
      (sum, component) => sum + component.count,
      0,
    );
    if (explainedValue !== normalizedValue) {
      throw new Error(
        `Cejel invariant: presentation components for ${name} total ${explainedValue}, expected ${normalizedValue}`,
      );
    }
  }
  return {
    name,
    label,
    value: normalizedValue,
    max,
    ...(kind ? { kind } : {}),
    weight,
    unit,
    description,
    ...(presentation ? { presentation } : {}),
  };
}

function firstMeaningfulLine(contents: string): number {
  const lines = contents.split('\n');
  const index = lines.findIndex((line) => line.trim().length > 0);
  return index === -1 ? 1 : index + 1;
}

function readGitHead(repoPath: string): string | null {
  const headResult = execGit(['rev-parse', 'HEAD'], { cwd: repoPath });
  if (!headResult.ok) {
    if (isExpectedGitAbsence(headResult)) return null;
    throw new Error(describeGitFailure(headResult.reason, 'HEAD resolution'));
  }
  return headResult.stdout.trim() || null;
}

// True if any .env* file has ever been added/modified in git history (including deleted files).
// A once-committed .env file is a ratable secrets surface even after deletion.
function hasEnvPathInGitHistory(repoPath: string, scanLimitations: Set<string>): boolean {
  const historyResult = execGit(
    ['log', '--no-show-signature', 'HEAD', '--diff-filter=AM', '--name-only', '-z', '--format='],
    { cwd: repoPath },
  );
  if (!historyResult.ok) {
    if (isExpectedGitAbsence(historyResult)) return false;
    declareHistoryFailure(scanLimitations, historyResult.reason, 'environment-file history scan');
    return false;
  }
  const output = historyResult.stdout;
  if (!output) return false;
  return output.split('\0').some((rawPath) => {
    const path = rawPath.startsWith('\n') ? rawPath.slice(1) : rawPath;
    if (/[\u0000-\u001f\u007f]/.test(path)) {
      scanLimitations.add(CONTROL_CHARACTER_HISTORY_PATH_LIMITATION);
      return false;
    }
    return /(?:^|\/)\.env(?:\.|$)/i.test(path);
  });
}
