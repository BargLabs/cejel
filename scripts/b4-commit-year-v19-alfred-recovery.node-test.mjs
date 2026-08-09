import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildCombinedDecision,
  hardenedGitArguments,
  renderCombinedMarkdown,
  renderRecoveryMarkdown,
  sanitizePrivateError,
  validateFirstRun,
} from './b4-commit-year-v19-alfred-recovery.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function summary(freshness = 2) {
  return {
    overallScore: 3,
    codeTrustScore: 2.5,
    processTrustScore: 3.5,
    verdict: 'conditional',
    coverage: {
      byCategory: [
        { category: 'code_trust', measured: 5, total: 5 },
        { category: 'process_trust', measured: 4, total: 6 },
      ],
      overall: { measured: 9, total: 11 },
      lowConfidence: false,
    },
    placement: 'transparency',
    b4: {
      score: 3.5,
      status: 'verified',
      metrics: [{ name: 'audit_freshness_depth', value: freshness }],
    },
    scanLimitations: [],
  };
}

function row(candidateFreshness = 2) {
  return {
    name: 'alfred',
    baseline: summary(),
    candidate: summary(candidateFreshness),
    nonB4CriteriaByteIdentical: true,
  };
}

test('accepts the immutable published first-run NO-GO shape', () => {
  const firstRun = JSON.parse(
    readFileSync(
      join(ROOT, 'docs/experiments/b4-commit-year-v19-2026-08-09/paired-result.json'),
      'utf8',
    ),
  );
  assert.equal(validateFirstRun(firstRun), firstRun);
});

test('the single local-clone override succeeds while the default remains denied', () => {
  const source = mkdtempSync(join(tmpdir(), 'cejel-v19-recovery-source-'));
  const targetRoot = mkdtempSync(join(tmpdir(), 'cejel-v19-recovery-target-'));
  const target = join(targetRoot, 'clone');
  execFileSync('git', ['init', '--quiet'], { cwd: source });
  execFileSync('git', ['config', 'user.name', 'Cejel Test'], { cwd: source });
  execFileSync('git', ['config', 'user.email', 'cejel@example.invalid'], { cwd: source });
  writeFileSync(join(source, 'README.md'), '# fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: source });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: source });

  assert.throws(() =>
    execFileSync(
      'git',
      hardenedGitArguments(['clone', '--quiet', '--local', '--no-checkout', source, target]),
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  );
  execFileSync(
    'git',
    hardenedGitArguments(
      ['clone', '--quiet', '--local', '--no-hardlinks', '--no-checkout', source, target],
      { allowFixedLocalClone: true },
    ),
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  assert.equal(
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: target, encoding: 'utf8' }).trim(),
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(),
  );
});

test('combined decision permits one raw Alfred numerator change and nothing else', () => {
  assert.equal(buildCombinedDecision(row()).protocolDecision, 'GO');
  const rawChange = buildCombinedDecision(row(1));
  assert.equal(rawChange.protocolDecision, 'GO');
  assert.equal(rawChange.counts.rawFreshnessChanges, 1);

  const scoreChange = row();
  scoreChange.candidate.b4.score = 3.4;
  assert.equal(buildCombinedDecision(scoreChange).protocolDecision, 'NO-GO');

  const nonB4Change = row();
  nonB4Change.nonB4CriteriaByteIdentical = false;
  assert.equal(buildCombinedDecision(nonB4Change).protocolDecision, 'NO-GO');
});

test('sanitizes every operator-supplied private path from failures', () => {
  const options = {
    privateAlfredSource: '/private/operator/alfred',
    checkoutRoot: '/private/operator/checkouts',
  };
  assert.equal(
    sanitizePrivateError(
      new Error(
        'clone /private/operator/alfred into /private/operator/checkouts/alfred failed',
      ),
      options,
    ),
    'clone [private-source] into [checkout-root]/alfred failed',
  );
});

test('renders explicit recovery and 24-row combined tables', () => {
  const alfred = row();
  const decision = buildCombinedDecision(alfred);
  const bindings = {
    recoveryPreregistrationCommit: 'a',
    executionCommit: 'b',
    alfredCommit: 'c',
    firstRunCommit: 'd',
  };
  const recovery = renderRecoveryMarkdown({ bindings, decision, row: alfred });
  assert.match(recovery, /^\| alfred \|/m);

  const rows = Array.from({ length: 24 }, (_, index) => ({ ...row(), name: `repo-${index}` }));
  const combined = renderCombinedMarkdown({
    bindings,
    provenance: { firstRunDecision: 'NO-GO' },
    decision,
    rows,
  });
  assert.equal(combined.match(/^\| repo-/gm)?.length, 24);
});
