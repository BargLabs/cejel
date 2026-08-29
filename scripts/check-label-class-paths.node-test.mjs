import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  checkAdjudicationShape,
  checkPath,
  checkPaths,
  evaluateFullTree,
  formatFailureMessage,
  fullTreeExitCode,
} from './check-label-class-paths.mjs';

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

test('content shape catches the guarded field pair under an innocent filename without returning values', () => {
  const violation = checkAdjudicationShape(
    'notes/ordinary.json',
    JSON.stringify({ entries: [{ classification: 'DO-NOT-PRINT', rationale: 'DO-NOT-PRINT' }] }),
  );
  assert.equal(violation?.path, 'notes/ordinary.json');
  assert.match(violation?.label ?? '', /content-based/);
  assert.doesNotMatch(violation?.detail ?? '', /DO-NOT-PRINT/);
});

test('full-tree mode sanctions only an exact path and blob SHA', () => {
  const tracked = [
    { path: 'calibration/llm/private/existing.enc', blobSha: 'a'.repeat(40) },
    { path: 'README.md', blobSha: 'b'.repeat(40) },
  ];
  const firstPass = evaluateFullTree(
    tracked,
    [{ path: 'README.md', content: '# safe' }],
    { version: 'seed', date: '2026-08-28', findingCount: 0, digest: '0'.repeat(64) },
  );
  const baseline = {
    version: 'test',
    date: '2026-08-28',
    findingCount: firstPass.findingCount,
    digest: firstPass.digest,
  };
  const result = evaluateFullTree(tracked, [{ path: 'README.md', content: '# safe' }], baseline);
  assert.equal(result.filesExamined, 2);
  assert.equal(result.findingCount, 1);
  assert.equal(result.bindingMatches, true);
  assert.equal(result.baseline.findingCount, 1);
  assert.equal(fullTreeExitCode(result), 0);
});

test('full-tree mode fails on a changed grandfathered blob and on an innocent-filename shape', () => {
  const tracked = [
    { path: 'calibration/llm/private/existing.enc', blobSha: 'c'.repeat(40) },
    { path: 'notes/ordinary.json', blobSha: 'd'.repeat(40) },
  ];
  const baseline = { version: 'test', date: '2026-08-28', findingCount: 1, digest: '0'.repeat(64) };
  const result = evaluateFullTree(
    tracked,
    [
      {
        path: 'notes/ordinary.json',
        content: JSON.stringify({ entries: [{ classification: 'x', rationale: 'y' }] }),
      },
    ],
    baseline,
  );
  assert.equal(result.findingCount, 2);
  assert.equal(result.bindingMatches, false);
  assert.equal(fullTreeExitCode(result), 1);
});

test('full-tree mode fails closed on an empty tree or a stale baseline', () => {
  const empty = evaluateFullTree([], [], {
    version: 'test',
    date: '2026-08-28',
    findingCount: 0,
    digest: createHash('sha256').update('').digest('hex'),
  });
  assert.equal(fullTreeExitCode(empty), 2);

  const changed = evaluateFullTree(
    [{ path: 'README.md', blobSha: 'b'.repeat(40) }],
    [{ path: 'README.md', content: '# safe' }],
    {
      version: 'test',
      date: '2026-08-28',
      findingCount: 1,
      digest: '0'.repeat(64),
    },
  );
  assert.equal(fullTreeExitCode(changed), 1);
});

test('workflow preserves both diff and scheduled full-tree modes', async () => {
  const workflow = await readFile(new URL('../.github/workflows/label-class-path-guard.yml', import.meta.url), 'utf8');
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /check-label-class-paths\.mjs --diff/);
  assert.match(workflow, /check-label-class-paths\.mjs --full-tree/);
});
