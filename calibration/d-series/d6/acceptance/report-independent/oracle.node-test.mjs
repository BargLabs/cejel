import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function runFixture(path) {
  return spawnSync('sh', [fileURLToPath(new URL(path, import.meta.url))], { encoding: 'utf8' });
}

test('the report-independent specimen claims removal despite a failed operation', () => {
  const result = runFixture('./report.positive.fixture.sh');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /removed stale-artifact/);
});

test('the paired repair makes its report and return value depend on the operation', () => {
  const result = runFixture('./report.negative.fixture.sh');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /removal failed/);
});

test('the motivating git-shaped specimen reports success after worktree removal fails', () => {
  const result = runFixture('./reaper.positive.fixture.sh');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /reaped worktree/);
});

test('the git-shaped repair makes the failed worktree removal change the outcome', () => {
  const result = runFixture('./reaper.negative.fixture.sh');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /worktree removal failed/);
});
