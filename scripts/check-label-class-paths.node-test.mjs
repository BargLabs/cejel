import assert from 'node:assert/strict';
import test from 'node:test';

import { checkPath, checkPaths, formatFailureMessage } from './check-label-class-paths.mjs';

test('a planted label-class file in a public staging path fails the check', () => {
  const planted = 'calibration/llm/private/untouched-evidence-v2.enc';
  const result = checkPath(planted);
  assert.equal(result.denied, true);
  assert.equal(result.label, 'evidence payload (private)');
});

test('a retired frame reveal doc (members+commits only) passes', () => {
  const reveal = 'docs/calibration/free-core-v50/holdout-reveal-2026-08-18.md';
  assert.deepEqual(checkPath(reveal), { denied: false });
});

test('every deny-pattern class fires on a representative planted path', () => {
  const planted = [
    'calibration/llm/private/some-bundle.enc',
    'calibration/llm/reviews/some-review.md',
    'calibration/llm/results/v9.9-golden-execution-evidence.json',
    'docs/experiments/x-frame-2026-08-19/stage2-adjudication.json',
    'docs/experiments/x-frame-2026-08-19/run/manifest-wave-1.json',
    'docs/experiments/x-frame-2026-08-19/x-frame.stage0-manifest.json',
    'docs/experiments/x-frame-2026-08-19/x-frame.tier2-fresh-manifest.order.jsonl',
  ];
  const violations = checkPaths(planted);
  assert.equal(violations.length, planted.length, 'every planted path should be denied');
});

test('intentionally-public calibration/llm surfaces are never denied', () => {
  const publicByDesign = [
    'calibration/llm/cohorts/golden-manifest.json',
    'calibration/llm/cohorts/untouched-manifest-v1.9.json',
    'calibration/llm/schemas/label.schema.json',
    'calibration/llm/templates/finding-review.template.json',
    'calibration/llm/public-surface-policy.json',
  ];
  const violations = checkPaths(publicByDesign);
  assert.deepEqual(violations, []);
});

test('an unrelated file passes untouched', () => {
  assert.deepEqual(checkPath('README.md'), { denied: false });
  assert.deepEqual(checkPath('src/index.ts'), { denied: false });
});

test('the exemption only matches the reveal-doc shape, not a same-directory decoy', () => {
  // A file that merely lives in docs/calibration/<frame>/ but isn't a *reveal*.md is not
  // auto-exempted -- e.g. a raw manifest someone renamed into that directory.
  assert.deepEqual(
    checkPath('docs/calibration/free-core-v50/not-a-reveal-doc.json'),
    { denied: false }, // not in the deny list either, but also not exercising the exemption
  );
  assert.equal(
    checkPath('docs/experiments/x-frame/run/manifest-wave-1.json').denied,
    true,
    'the raw manifest format stays denied even under a differently-named directory',
  );
});

test('formatFailureMessage cites the IP boundary and hands back to the operator', () => {
  const message = formatFailureMessage([
    { path: 'calibration/llm/private/x.enc', label: 'evidence payload (private)' },
  ]);
  assert.match(message, /disclosure boundary/i);
  assert.match(message, /hand this back to the operator/i);
  assert.match(message, /calibration\/llm\/private\/x\.enc/);
});
