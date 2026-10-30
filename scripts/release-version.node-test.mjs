import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkDistTag, isPrerelease, npmDistTag, parseReleaseVersion } from './release-version.mjs';

const CLI = fileURLToPath(new URL('./release-version.mjs', import.meta.url));

function cli(...args) {
  try {
    return { code: 0, stdout: execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', stdio: 'pipe' }) };
  } catch (error) {
    return { code: error.status, stdout: error.stdout, stderr: error.stderr };
  }
}

test('accepts X.Y.Z and X.Y.Z-rc.N (N >= 1), and nothing else', () => {
  for (const good of ['0.7.0', '0.7.0-rc.1', '0.7.0-rc.12', '10.20.30']) {
    assert.equal(parseReleaseVersion(good), good, good);
  }
  for (const bad of ['0.7.0-rc', '0.7.0-rc.0', '0.7.0-rc.01', '0.7.0-beta.1', 'v0.7.0-rc.1', 'v0.7.0', '0.7', '0.7.0-rc.1+build', '0.7.0-RC.1', '', undefined]) {
    assert.throws(() => parseReleaseVersion(bad), /X\.Y\.Z or X\.Y\.Z-rc\.N/, String(bad));
  }
});

test('a release candidate is a prerelease; a final version is not', () => {
  assert.equal(isPrerelease('0.7.0-rc.1'), true);
  assert.equal(isPrerelease('0.7.0'), false);
});

test('the dist-tag is derived from the version: next for a release candidate, latest for a final version', () => {
  assert.equal(npmDistTag('0.7.0-rc.1'), 'next');
  assert.equal(npmDistTag('0.7.0'), 'latest');
  assert.throws(() => npmDistTag('0.7.0-beta.1'), /X\.Y\.Z or X\.Y\.Z-rc\.N/);
});

test('the guard refuses a release candidate bound for latest and a final version bound for next', () => {
  assert.throws(() => checkDistTag('0.7.0-rc.1', 'latest'), /0\.7\.0-rc\.1 is a prerelease and must publish under next, not latest/);
  assert.throws(() => checkDistTag('0.7.0', 'next'), /0\.7\.0 is a final version and must publish under latest, not next/);
  assert.throws(() => checkDistTag('0.7.0', 'beta'), /must publish under latest, not beta/);
  assert.doesNotThrow(() => checkDistTag('0.7.0-rc.1', 'next'));
  assert.doesNotThrow(() => checkDistTag('0.7.0', 'latest'));
});

test('the command line the workflow calls prints the tag and refuses a mismatch with a non-zero exit', () => {
  assert.deepEqual(cli('dist-tag', '0.7.0-rc.1'), { code: 0, stdout: 'next\n' });
  assert.deepEqual(cli('dist-tag', '0.7.0'), { code: 0, stdout: 'latest\n' });
  assert.equal(cli('check-dist-tag', '0.7.0-rc.1', 'next').code, 0);
  assert.equal(cli('check-dist-tag', '0.7.0', 'latest').code, 0);
  const rcToLatest = cli('check-dist-tag', '0.7.0-rc.1', 'latest');
  assert.equal(rcToLatest.code, 1);
  assert.match(rcToLatest.stderr, /must publish under next, not latest/);
  const finalToNext = cli('check-dist-tag', '0.7.0', 'next');
  assert.equal(finalToNext.code, 1);
  assert.match(finalToNext.stderr, /must publish under latest, not next/);
  assert.equal(cli('dist-tag', 'v0.7.0-rc.1').code, 1);
  assert.equal(cli('dist-tag').code, 1);
  assert.equal(cli('publish', '0.7.0').code, 1);
});
