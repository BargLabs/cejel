import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalizeConfigDiff,
  eligiblePath,
  normalizeJobName,
  scrub,
  transitionsForSequence,
} from './stratum-b-extract.mjs';

test('selects preregistered configuration paths without selecting lockfiles alone', () => {
  for (const file of [
    '.github/workflows/ci.yml',
    '.github/actions/setup/action.yml',
    'package.json',
    'packages/web/tsconfig.build.json',
    'tooling/vitest.config.ts',
    'Dockerfile.production',
  ]) assert.equal(eligiblePath(file), true, file);
  for (const file of ['pnpm-lock.yaml', 'src/index.ts', 'README.md']) assert.equal(eligiblePath(file), false, file);
});

test('scrubs complete credential values before output or fingerprinting', () => {
  const input = [
    '+TOKEN=not-a-real-value-but-must-disappear',
    '+api_key: sample-value-that-must-disappear',
    '+value: ${{ secrets.DEPLOY_TOKEN }}',
    '+Authorization: Bearer sample-bearer-value-12345',
  ].join('\n');
  const result = scrub(input);
  assert.doesNotMatch(result.value, /not-a-real|sample-value|DEPLOY_TOKEN|sample-bearer/);
  assert.ok(Object.values(result.counts).reduce((sum, count) => sum + count, 0) >= 4);
});

test('content identity removes paths, headers, coordinates, and credential values', () => {
  const first = [
    'diff --git a/.github/workflows/a.yml b/.github/workflows/a.yml',
    'index 111..222 100644',
    '--- a/.github/workflows/a.yml',
    '+++ b/.github/workflows/a.yml',
    '@@ -2 +2 @@',
    '-  TOKEN=first-sensitive-value',
    '+  TOKEN=replacement-sensitive-value',
    '+  timeout-minutes: 20',
  ].join('\n');
  const second = first
    .replaceAll('.github/workflows/a.yml', 'tooling/other.config.yml')
    .replace('@@ -2 +2 @@', '@@ -90 +104 @@')
    .replace('first-sensitive-value', 'different-sensitive-value')
    .replace('replacement-sensitive-value', 'another-sensitive-value');
  const a = canonicalizeConfigDiff(first);
  const b = canonicalizeConfigDiff(second);
  assert.equal(a.canonical, b.canonical);
  assert.doesNotMatch(a.canonical, /sensitive-value/);
});

test('normalizes only a trailing matrix suffix', () => {
  assert.equal(normalizeJobName('Tests (ubuntu-latest, 22)'), 'Tests');
  assert.equal(normalizeJobName('Tests / lint'), 'Tests / lint');
});

test('requires an earlier failed commit and a success at or after the last config touch', () => {
  const sequence = { commits: ['a', 'b', 'c'], configIndices: [1] };
  const checks = [
    [{ name: 'CI', conclusion: 'failure', source: 'check-run' }],
    [{ name: 'CI', conclusion: 'success', source: 'check-run' }],
    [{ name: 'Other', conclusion: 'success', source: 'check-run' }],
  ];
  assert.deepEqual(transitionsForSequence(sequence, checks), [{
    name: 'CI',
    failedCommit: 'a',
    failedConclusion: 'failure',
    successCommit: 'b',
    successConclusion: 'success',
    source: 'check-run',
  }]);
});

test('does not count absent-to-success or same-commit reruns', () => {
  const absent = transitionsForSequence(
    { commits: ['a', 'b'], configIndices: [1] },
    [[], [{ name: 'CI', conclusion: 'success', source: 'check-run' }]],
  );
  assert.deepEqual(absent, []);
  const rerun = transitionsForSequence(
    { commits: ['a', 'b'], configIndices: [1] },
    [[], [
      { name: 'CI', conclusion: 'failure', source: 'check-run' },
      { name: 'CI', conclusion: 'success', source: 'check-run' },
    ]],
  );
  assert.deepEqual(rerun, []);
});
