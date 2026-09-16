#!/usr/bin/env node
// Local-only reproduction. Fixture signatures never authorize the real repository.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const source = process.cwd();
const script = resolve('scripts/check-measurement-freeze.mjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const head = git(source, 'rev-parse', '--verify', `${process.argv[2] ?? 'origin/main'}^{commit}`);
const dir = mkdtempSync(join(tmpdir(), 'freeze-real-history-'));
try {
  const marker = git(source, 'show', `${head}:FREEZE.md`) + '\n';
  const markerFile = join(dir, 'historical-marker.json');
  writeFileSync(markerFile, marker);
  assert.equal(JSON.parse(marker).pinnedRevision, '85eab44b61fa31be00191d8bd5c262e281e8d65c');
  function run(cwd, label, args, paths) {
    console.log(`\n${label}: expected ${paths.length ? `REFUSED: ${paths.join(', ')}` : 'PASS with nonzero frozen inventory'}`);
    const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
    console.log(`exit=${result.status}\n${result.stdout}${result.stderr}`.trimEnd());
    assert.equal(result.status, paths.length ? 1 : 0);
    assert.match(result.stdout + result.stderr, /frozenFiles=[1-9][0-9]*/);
    const emitted = result.stderr.split('\n').filter(line => line.startsWith('  ')).map(line => line.trim());
    assert.deepEqual(emitted, paths);
    assert.match(result.stdout + result.stderr, paths.length ? /freeze REFUSED/ : /freeze PASS/);
  }
  for (const [pr, revision, paths] of [
    [312, '85eab44', ['src/witan/repo-signals.ts']],
    [314, 'cfd9b16', ['src/witan/rubric-fingerprint.ts', 'src/witan/schemas.ts', 'src/witan/scoring.ts']],
    [315, '209a058', []],
  ]) {
    run(source, `#${pr} (${revision})`, ['--marker', markerFile, '--base', `${revision}^`, '--head', revision], paths);
  }
  run(source, `Current main ${head}, original pin`, ['--full-tree', '--head', head],
    ['src/witan/rubric-fingerprint.ts', 'src/witan/schemas.ts', 'src/witan/scoring.ts']);

  const repo = join(dir, 'fixture');
  git(source, 'clone', '-q', '--shared', '--no-checkout', source, repo);
  git(repo, 'checkout', '-q', '--detach', head);
  git(repo, 'config', 'user.name', 'Freeze history fixture');
  git(repo, 'config', 'user.email', 'fixture@example.invalid');
  git(repo, 'config', 'commit.gpgsign', 'false');
  git(repo, 'config', 'core.hooksPath', '/dev/null');
  const key = join(dir, 'fixture-key');
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
  mkdirSync(join(repo, 'docs/security'), { recursive: true });
  writeFileSync(join(repo, 'docs/security/allowed-signers'), `fixture@example.invalid ${readFileSync(`${key}.pub`, 'utf8')}`);
  git(repo, 'add', 'docs/security/allowed-signers');
  git(repo, 'commit', '--no-gpg-sign', '-qm', 'fixture only: ephemeral signer');
  const bytes = readFileSync(join(repo, 'FREEZE.md'), 'utf8');
  const previous = JSON.parse(bytes);
  const pin = git(repo, 'rev-parse', 'cfd9b16^{commit}');
  writeFileSync(join(repo, 'FREEZE.md'), JSON.stringify({ ...previous, pinnedRevision: pin, supersedes: {
    markerSha256: createHash('sha256').update(bytes).digest('hex'), pinnedRevision: previous.pinnedRevision,
  } }, null, 2) + '\n');
  git(repo, 'config', 'gpg.format', 'ssh');
  git(repo, 'config', 'user.signingkey', key);
  git(repo, 'add', 'FREEZE.md');
  git(repo, 'commit', '-S', '-qm', 'fixture only: supersede measurement pin');
  run(repo, `Current main ${head} plus fixture-only signed transition to ${pin}`, ['--full-tree'], []);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
