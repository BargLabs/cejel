import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function runFixture(path) {
  return spawnSync('sh', [fileURLToPath(new URL(path, import.meta.url))], { encoding: 'utf8' });
}

test('the discarded-status specimen announces verification despite a failed guard', () => {
  const result = runFixture('./guard.positive.fixture.sh');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /integrity verified/);
});

test('the paired repair makes the guard failure change the command outcome', () => {
  const result = runFixture('./guard.negative.fixture.sh');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /integrity check failed/);
});

test('the cleanup specimen remains explicitly advisory', () => {
  const result = runFixture('./cleanup.ambiguous.fixture.sh');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /best effort/);
});
