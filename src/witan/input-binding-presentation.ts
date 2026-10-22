import type {
  WitanCriterionScore,
  WitanInputBinding,
  WitanInputBindingRecord,
  WitanInputBindingStatus,
} from './schemas.js';

// Presentation of input binding and inherited evidence. Nothing here reads or changes a score;
// every function formats fields report.json already carries, so the certificate says what the
// imported evidence is and is not, in the same words on every surface.

/**
 * Imported checks that restate evidence Cejel reads natively, or that the current ingest mapping
 * folds into a criterion they do not measure. Keyed by the ingested finding's ruleId. Each note is
 * a fact about the mapping, checked by src/witan/__tests__/inherited-evidence.test.ts against the
 * adapter's mapping and the native collector it names; none of them changes a score.
 */
const INHERITED_FINDING_NOTES: Readonly<Record<string, string>> = Object.freeze({
  'scorecard:Dependency-Update-Tool':
    'Restates evidence Cejel reads natively: A4 dependency_automation_ratio credits the same Dependabot or Renovate configuration. Not independent corroboration; for the same absence this adjusts A4 a second time.',
  'scorecard:Security-Policy':
    'Restates evidence Cejel reads natively: B4 counts SECURITY.md as an audit-trail file. Not independent corroboration.',
  'scorecard:SAST':
    'Scorecard SAST reports whether a static-analysis tool runs on commits. It is not a secrets or data-layer finding; the current ingest mapping folds it into A2.',
});

export function inheritedFindingNote(ruleId: string): string | undefined {
  // Own properties only. ruleId is ingested text: a plain-object index would return an
  // Object.prototype member for `constructor`, `toString` or `__proto__`, which is not a string.
  return Object.hasOwn(INHERITED_FINDING_NOTES, ruleId) ? INHERITED_FINDING_NOTES[ruleId] : undefined;
}

export function inheritedFindingNoteRuleIds(): readonly string[] {
  return Object.keys(INHERITED_FINDING_NOTES).sort();
}

function formatScore(score: number): string {
  return score.toFixed(1);
}

/**
 * The sentence a criterion carries when ingested evidence adjusted it. When the status moved, the
 * sentence says so and names the native status, so a moved status is never read as a native
 * Cejel finding. Undefined when nothing was adjusted.
 */
export function importedAdjustmentSentence(criterion: WitanCriterionScore): string | undefined {
  if (criterion.nativeScore === undefined) return undefined;
  if (criterion.status === 'not_applicable' || criterion.status === 'insufficient_data') {
    return `Ingested findings were folded into this dimension, but it is ${criterion.status}, so they moved no score.`;
  }
  const statusMoved =
    criterion.nativeStatus !== undefined && criterion.nativeStatus !== criterion.status;
  // A clamped adjustment (a native score already at 0.0) leaves the score where it was; "lowered
  // by 0.0" would claim a move that did not happen.
  if (criterion.nativeScore === criterion.score) {
    return statusMoved
      ? `Imported evidence moved this status: Cejel's own evidence gave ${criterion.nativeStatus} at ${formatScore(criterion.nativeScore)}/4.0; ingested findings did not move the score but moved the status to ${criterion.status}. The move is not a native Cejel finding.`
      : `Ingested findings were folded into this dimension but did not move its score from Cejel's own ${formatScore(criterion.nativeScore)}/4.0; the status is the native one.`;
  }
  const difference = Math.abs(criterion.nativeScore - criterion.score);
  const delta = difference < 0.05 ? 'less than 0.1' : formatScore(difference);
  if (statusMoved) {
    return `Imported evidence moved this status: Cejel's own evidence gave ${criterion.nativeStatus} at ${formatScore(criterion.nativeScore)}/4.0; ingested findings lowered the score by ${delta} to ${formatScore(criterion.score)}, which moved the status to ${criterion.status}. The move is not a native Cejel finding.`;
  }
  return `Ingested findings lowered this score by ${delta} from Cejel's own ${formatScore(criterion.nativeScore)}/4.0; the status is the native one.`;
}

const STATUS_ORDER: readonly WitanInputBindingStatus[] = [
  'matched',
  'unbound',
  'unverifiable',
  'stale',
  'mismatched-commit',
  'mismatched-repository',
];

/** "3 ingested inputs: 1 matched, 1 unbound, 1 mismatched-commit (record only)". */
export function inputBindingHeadline(binding: WitanInputBinding): string {
  const counts = new Map<WitanInputBindingStatus, number>();
  for (const input of binding.inputs) counts.set(input.status, (counts.get(input.status) ?? 0) + 1);
  const parts = STATUS_ORDER.filter((status) => counts.has(status)).map(
    (status) => `${counts.get(status)} ${status}`,
  );
  const duplicates = binding.inputs.filter((input) => input.duplicate !== undefined).length;
  if (duplicates > 0) parts.push(`${duplicates} duplicate`);
  const n = binding.inputs.length;
  const policy =
    binding.policy === 'strict'
      ? 'strict: mismatched, stale and duplicate inputs were refused'
      : 'record only: binding status did not affect any score';
  return `${n} ingested input${n === 1 ? '' : 's'}: ${parts.join(', ')} (${policy}).`;
}

function describeSubject(record: WitanInputBindingRecord): string {
  if (record.subjects.length === 0) return 'no declared subject';
  const listed = record.subjects
    .map((subject) => {
      const repository =
        subject.repository ??
        (subject.repositoryWithheld
          ? 'repository withheld (declared, not normalizable)'
          : 'repository not declared');
      return `${repository} @ ${subject.commit ?? 'commit not declared'}`;
    })
    .join('; ');
  return record.subjectsOmitted
    ? `${listed}; and ${record.subjectsOmitted} more declared subject${record.subjectsOmitted === 1 ? '' : 's'}, all checked, not recorded`
    : listed;
}

function describeProducer(record: WitanInputBindingRecord): string {
  if (record.producers.length === 0) return record.format;
  return record.producers
    .map((producer) => (producer.version ? `${producer.name} ${producer.version}` : producer.name))
    .join(', ');
}

/** One line per input, for HTML, Markdown and the terminal. Plain text: callers escape it. */
export function describeInputBindingRecord(record: WitanInputBindingRecord): string {
  const duplicate = record.duplicate
    ? `; duplicate (${record.duplicate}${record.scored ? ', scored again as before' : ', not scored again'})`
    : '';
  return `${record.status}: ${describeProducer(record)} (${record.format}, ${record.provenance}); subject ${describeSubject(record)}; observed ${record.observedAt ?? 'not declared'}; sha256:${record.sha256}${duplicate}`;
}

export function describeScannedSubject(binding: WitanInputBinding): string {
  const subject = binding.scannedSubject;
  return `Compared with: ${subject.repository ?? 'repository not named (pass --subject-repository)'} @ ${subject.commit ?? 'no git HEAD'}${subject.commitTime ? `, committed ${subject.commitTime}` : ''}; stale means observed more than ${binding.freshnessWindowSeconds} seconds before that commit time.`;
}
