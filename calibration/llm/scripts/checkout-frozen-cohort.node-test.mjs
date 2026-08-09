import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { checkoutFrozenCohort } from './checkout-frozen-cohort.mjs';
import { hashManifest, hashRepositoryEntry } from './freeze-cohorts.mjs';

const COMMIT_SHA = 'a'.repeat(40);
const TREE_SHA = 'b'.repeat(40);

function manifestFor(url) {
  const entryWithoutHash = {
    repository_id: 'owner/repo',
    url,
    commit_sha: COMMIT_SHA,
    git_tree_sha: TREE_SHA,
  };
  const repository = {
    ...entryWithoutHash,
    entry_sha256: hashRepositoryEntry(entryWithoutHash),
  };
  const manifestWithoutHash = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    status: 'frozen',
    cohort: 'golden',
    repositories: [repository],
  };
  return {
    ...manifestWithoutHash,
    manifest_sha256: hashManifest(manifestWithoutHash),
  };
}

for (const [name, url] of [
  ['ext transport', 'ext::sh -c id'],
  ['file transport', 'file:///tmp/x'],
  ['scp-like SSH transport', 'git@evil:repo.git'],
  ['unknown transport', 'fake://example/repo'],
]) {
  test(`frozen checkout rejects ${name} before invoking git`, async (t) => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'cejel-checkout-boundary-'));
    t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
    let gitCalls = 0;
    const gitExecutor = async () => {
      gitCalls += 1;
      throw new Error('git executor must not be reached');
    };

    await assert.rejects(
      () => checkoutFrozenCohort({
        manifest: manifestFor(url),
        workRoot: join(temporaryRoot, 'work'),
        gitExecutor,
      }),
      /canonical HTTPS GitHub repository URL/,
    );
    assert.equal(gitCalls, 0);
  });
}

test('frozen checkout permits a canonical GitHub HTTPS repository', async (t) => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'cejel-checkout-boundary-'));
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const calls = [];
  let exactCommitFetched = false;
  const gitExecutor = async (command, args, options) => {
    calls.push({ command, args, options });
    const gitArgs = args.slice(8);
    if (gitArgs.includes('checkout')) {
      assert.equal(exactCommitFetched, true, 'exact frozen commit must be fetched before checkout');
    }
    if (gitArgs.includes('fetch')) exactCommitFetched = true;
    const operation = args.at(-1);
    if (operation === 'HEAD') return { stdout: `${COMMIT_SHA}\n` };
    if (operation === 'HEAD^{tree}') return { stdout: `${TREE_SHA}\n` };
    return { stdout: '' };
  };

  const result = await checkoutFrozenCohort({
    manifest: manifestFor('https://github.com/owner/repo'),
    workRoot: join(temporaryRoot, 'work'),
    gitExecutor,
  });

  assert.equal(result.repositories.length, 1);
  assert.equal(result.repositories[0].commit_sha, COMMIT_SHA);
  assert.equal(calls.length, 5);
  assert.deepEqual(calls[1].args.slice(8), [
    '-C',
    result.repositories[0].source_root,
    'fetch',
    '--no-tags',
    'origin',
    COMMIT_SHA,
  ]);
  for (const call of calls) {
    assert.equal(call.command, 'git');
    assert.deepEqual(call.args.slice(0, 4), [
      '-c',
      'protocol.allow=never',
      '-c',
      'protocol.https.allow=always',
    ]);
    assert.equal(call.options.env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(call.options.env.GIT_ALLOW_PROTOCOL, 'https');
    assert.equal(call.options.env.GIT_CONFIG_NOSYSTEM, '1');
    assert.equal(call.options.env.GIT_LFS_SKIP_SMUDGE, '1');
  }
});
