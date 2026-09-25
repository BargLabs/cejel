// Byte-level companion to compare.mjs, for expected value E4 in ../PREREGISTRATION.md.
//
// compare.mjs answers the scoring question (did a headline, criterion or metric move). This
// answers the format question: is `withheldPaths` the only difference between the arms? For each
// row it reports whether the two reports are byte-identical as written, whether the candidate
// carries a non-empty `withheldPaths`, and whether deleting that one key and re-serializing
// exactly as score-arm.ts writes (JSON.stringify(report, null, 2)) reproduces the baseline bytes.
// It also checks that `rubricBehaviourFingerprint` is equal across the arms.
//
//   DELTA_ROOT=~/tmp/cejel-0411-delta LEFT_ARM=base RIGHT_ARM=cand node compare-bytes.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.env.DELTA_ROOT ?? resolve(process.env.HOME ?? '', 'tmp/cejel-0411-delta'));
const LEFT = process.env.LEFT_ARM ?? 'base';
const RIGHT = process.env.RIGHT_ARM ?? 'cand';
const corpus = JSON.parse(readFileSync(join(ROOT, 'corpus.json'), 'utf8'));

const rows = [];
for (const { name } of corpus.entries) {
  const leftBytes = readFileSync(join(ROOT, 'out', LEFT, `${name}.json`), 'utf8');
  const rightBytes = readFileSync(join(ROOT, 'out', RIGHT, `${name}.json`), 'utf8');
  const left = JSON.parse(leftBytes);
  const right = JSON.parse(rightBytes);
  const { withheldPaths, ...rightWithout } = right;
  const differingKeys = [...new Set([...Object.keys(left), ...Object.keys(rightWithout)])].filter(
    (key) => JSON.stringify(left[key]) !== JSON.stringify(rightWithout[key]),
  );
  rows.push({
    name,
    byteIdentical: leftBytes === rightBytes,
    leftHasWithheldPaths: 'withheldPaths' in left,
    rightWithheldPathCount: Array.isArray(withheldPaths) ? withheldPaths.length : null,
    identicalWithoutWithheldPaths: JSON.stringify(rightWithout, null, 2) === leftBytes,
    differingKeysWithoutWithheldPaths: differingKeys,
    fingerprintEqual: left.rubricBehaviourFingerprint === right.rubricBehaviourFingerprint,
  });
}

const summary = {
  rows: rows.length,
  byteIdentical: rows.filter((r) => r.byteIdentical).length,
  rightWithNonEmptyWithheldPaths: rows.filter((r) => (r.rightWithheldPathCount ?? 0) > 0).length,
  identicalWithoutWithheldPaths: rows.filter((r) => r.identicalWithoutWithheldPaths).length,
  fingerprintEqual: rows.filter((r) => r.fingerprintEqual).length,
};
writeFileSync(join(ROOT, 'bytes.json'), JSON.stringify({ summary, rows }, null, 2) + '\n');
console.log(JSON.stringify(summary));
for (const r of rows.filter((r) => !r.identicalWithoutWithheldPaths || !r.fingerprintEqual)) {
  console.log(`DIFF ${r.name} keys=${r.differingKeysWithoutWithheldPaths.join(',')} fingerprintEqual=${r.fingerprintEqual}`);
}
