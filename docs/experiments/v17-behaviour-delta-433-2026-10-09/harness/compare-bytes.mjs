// Byte-level companion to compare.mjs, for expected value 5 in ../PREREGISTRATION.md.
//
// compare.mjs answers the scoring question (did a headline, criterion or metric move). This
// answers the format question: which report fields differ between the arms, and is every
// difference one the preregistration lists? For each row it reports whether the two reports are
// byte-identical as written, whether `rubricBehaviourFingerprint` differs, and whether they become
// byte-identical once the predicted differences are removed, each only in its predicted direction:
//
//   1. `rubricBehaviourFingerprint`, from both sides.
//   2. B6 metric `protected_path_review_gate`'s `description`, from both sides, when B6 carries
//      that metric on both.
//   3. A B6 evidence `label` that is the old fixed label on the left and, for the same path on
//      the right, the label naming the branch that fired: the CODEOWNERS label when the path's
//      basename is CODEOWNERS, otherwise the policy label (either, when the path is withheld).
//   5. `A3.prod_readiness_primitives` in a `withheldPaths` entry's `signalsAdmitting` on the
//      left and absent from the same path's entry on the right.
//
// Item 4 of expected value 5 (the rows that move at scoring level) is not removed. It appears in
// the residual, which is reported as structural names only: top-level report keys and
// `criteria.<id>`, never a value or a repository path. That keeps the private row's output free of
// anything from its report. A private-visibility row is labelled `private-row`, never its corpus
// name. "Byte-identical" re-serialises exactly as score-arm.ts writes
// (JSON.stringify(report, null, 2)).
//
//   DELTA_ROOT=~/tmp/cejel-433-delta LEFT_ARM=base RIGHT_ARM=cand node compare-bytes.mjs
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const OLD_B6_LABEL = 'CODEOWNERS/required-review gate on protected paths';
export const NEW_B6_CODEOWNERS_LABEL = 'CODEOWNERS file in a location GitHub reads (protected-path review gate)';
export const NEW_B6_POLICY_LABEL = 'Documented required-review/branch-protection policy';
const WITHHELD_SIGNAL = 'A3.prod_readiness_primitives';
// Expected value 5, item 4: where a row that moves at scoring level may differ.
const MOVED_ROW_SCOPE = new Set(['criteria.A3', 'criteria.B2', 'criteria.B6', 'overallScore', 'codeTrustScore', 'processTrustScore', 'verdict']);
const serialise = (report) => JSON.stringify(report, null, 2);

export function comparePair(leftBytes, rightBytes) {
  const left = JSON.parse(leftBytes);
  const right = JSON.parse(rightBytes);
  const removed = { b6Description: false, b6Labels: 0, withheldSignalsAdmitting: 0 };

  // 1
  const fingerprintDiffers = left.rubricBehaviourFingerprint !== right.rubricBehaviourFingerprint;
  delete left.rubricBehaviourFingerprint;
  delete right.rubricBehaviourFingerprint;

  const leftB6 = left.criteria?.find((c) => c.id === 'B6');
  const rightB6 = right.criteria?.find((c) => c.id === 'B6');
  if (leftB6 && rightB6) {
    // 2
    const leftGate = leftB6.metrics?.find((m) => m.name === 'protected_path_review_gate');
    const rightGate = rightB6.metrics?.find((m) => m.name === 'protected_path_review_gate');
    if (leftGate && rightGate) {
      removed.b6Description = leftGate.description !== rightGate.description;
      delete leftGate.description;
      delete rightGate.description;
    }
    // 3
    (leftB6.evidence ?? []).forEach((leftItem, index) => {
      const rightItem = rightB6.evidence?.[index];
      if (!rightItem || leftItem.path !== rightItem.path || leftItem.label !== OLD_B6_LABEL) return;
      const expected = rightItem.path === undefined
        ? [NEW_B6_CODEOWNERS_LABEL, NEW_B6_POLICY_LABEL]
        : [/(^|\/)CODEOWNERS$/.test(rightItem.path) ? NEW_B6_CODEOWNERS_LABEL : NEW_B6_POLICY_LABEL];
      if (!expected.includes(rightItem.label)) return;
      delete leftItem.label;
      delete rightItem.label;
      removed.b6Labels += 1;
    });
  }

  // 5
  const rightWithheld = new Map((right.withheldPaths ?? []).map((entry) => [entry.path, entry]));
  for (const leftEntry of left.withheldPaths ?? []) {
    const rightEntry = rightWithheld.get(leftEntry.path);
    if (!rightEntry || !Array.isArray(leftEntry.signalsAdmitting) || !Array.isArray(rightEntry.signalsAdmitting)) continue;
    if (leftEntry.signalsAdmitting.includes(WITHHELD_SIGNAL) && !rightEntry.signalsAdmitting.includes(WITHHELD_SIGNAL)) {
      leftEntry.signalsAdmitting = leftEntry.signalsAdmitting.filter((signal) => signal !== WITHHELD_SIGNAL);
      removed.withheldSignalsAdmitting += 1;
    }
  }

  const identicalAfterNormalisation = serialise(left) === serialise(right);
  const residual = [];
  for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
    if (key !== 'criteria' && JSON.stringify(left[key]) !== JSON.stringify(right[key])) residual.push(key);
  }
  const ids = new Set([...(left.criteria ?? []), ...(right.criteria ?? [])].map((c) => c.id));
  for (const id of [...ids].sort()) {
    const l = left.criteria?.find((c) => c.id === id);
    const r = right.criteria?.find((c) => c.id === id);
    if (JSON.stringify(l) !== JSON.stringify(r)) residual.push(`criteria.${id}`);
  }
  // Key order or criterion order alone: the serialised bytes differ but no named field does.
  if (!identicalAfterNormalisation && residual.length === 0) residual.push('(serialisation order)');

  return {
    byteIdentical: leftBytes === rightBytes,
    fingerprintDiffers,
    removed,
    identicalAfterNormalisation,
    residual,
    residualOutsideMovedRowScope: residual.filter((name) => !MOVED_ROW_SCOPE.has(name)),
  };
}

function main() {
  const ROOT = resolve(process.env.DELTA_ROOT ?? resolve(process.env.HOME ?? '', 'tmp/cejel-433-delta'));
  const LEFT = process.env.LEFT_ARM ?? 'base';
  const RIGHT = process.env.RIGHT_ARM ?? 'cand';
  const corpus = JSON.parse(readFileSync(join(ROOT, 'corpus.json'), 'utf8'));

  const rows = [];
  for (const entry of corpus.entries) {
    const leftBytes = readFileSync(join(ROOT, 'out', LEFT, `${entry.name}.json`), 'utf8');
    const rightBytes = readFileSync(join(ROOT, 'out', RIGHT, `${entry.name}.json`), 'utf8');
    rows.push({ name: entry.visibility === 'private' ? 'private-row' : entry.name, ...comparePair(leftBytes, rightBytes) });
  }

  const summary = {
    rows: rows.length,
    byteIdentical: rows.filter((r) => r.byteIdentical).length,
    fingerprintDiffers: rows.filter((r) => r.fingerprintDiffers).length,
    b6DescriptionRemoved: rows.filter((r) => r.removed.b6Description).length,
    b6LabelRemoved: rows.filter((r) => r.removed.b6Labels > 0).length,
    withheldSignalsAdmittingRemoved: rows.filter((r) => r.removed.withheldSignalsAdmitting > 0).length,
    identicalAfterNormalisation: rows.filter((r) => r.identicalAfterNormalisation).length,
    residualWithinMovedRowScope: rows.filter((r) => r.residual.length > 0 && r.residualOutsideMovedRowScope.length === 0).map((r) => r.name),
    residualOutsideMovedRowScope: rows.filter((r) => r.residualOutsideMovedRowScope.length > 0).map((r) => r.name),
  };
  writeFileSync(join(ROOT, 'bytes.json'), JSON.stringify({ summary, rows }, null, 2) + '\n');
  console.log(JSON.stringify(summary));
  for (const r of rows.filter((row) => row.residual.length > 0)) {
    console.log(`DIFF ${r.name} residual=${r.residual.join(',')} outsideMovedRowScope=${r.residualOutsideMovedRowScope.join(',') || 'none'}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
