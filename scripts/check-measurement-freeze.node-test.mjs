import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const script = resolve('scripts/check-measurement-freeze.mjs');
function fixture(t, frozen = true) {
  const root = mkdtempSync(join(tmpdir(), 'measurement-freeze-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  const put = (path, data = 'baseline\n') => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), data);
  };
  const commit = (signed = false) => { git('add', '.'); git('commit', ...(signed ? ['-S'] : ['--no-gpg-sign']), '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  put('src/witan/repo-signals.ts');
  put('src/witan/__tests__/control.test.ts');
  const pin = commit();
  const marker = { window: 'cycle-test', pinnedRevision: pin, authority: {
    repository: 'example/authority', record: 'docs/calibration/decision.md', signedCommit: pin,
  }, frozenPaths: ['src/witan/'], closingConditions: 'Operator records completion or signed supersession.' };
  if (frozen) { put('FREEZE.md', JSON.stringify(marker)); commit(); }
  const base = git('rev-parse', 'HEAD');
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
  return { root, git, put, commit, base, pin, run, marker };
}
function refused(result, path) {
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /REFUSED/);
  assert.ok(result.stderr.includes(path), result.stderr);
  assert.match(result.stderr, /cycle-test/);
  assert.match(result.stderr, /example\/authority:docs\/calibration\/decision.md/);
}
test('marker + scoring source change refuses with actionable provenance', t => {
  const f = fixture(t); f.put('src/witan/repo-signals.ts', 'changed'); f.commit();
  refused(f.run('--base', f.base, '--head', 'HEAD'), 'src/witan/repo-signals.ts');
});
test('tests and fixtures remain editable while frozen', t => {
  const f = fixture(t); f.put('src/witan/__tests__/control.test.ts', 'extended');
  f.put('src/witan/__tests__/fixtures/new.json', '{}'); f.commit();
  const r = f.run('--base', f.base, '--head', 'HEAD'); assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /changedPaths=2/);
});
for (const action of ['deleted', 'edited', 'renamed']) {
  test(`marker ${action} refuses, including full-tree direct-push audit`, t => {
    const f = fixture(t);
    if (action === 'deleted') f.git('rm', 'FREEZE.md');
    if (action === 'edited') f.put('FREEZE.md', '{}');
    if (action === 'renamed') f.git('mv', 'FREEZE.md', 'CLOSED.md');
    f.commit();
    refused(f.run('--base', f.base, '--head', 'HEAD'), 'FREEZE.md');
    refused(f.run('--full-tree', '--head', 'HEAD'), 'FREEZE.md');
  });
}
test('no marker in history + scoring source change passes explicitly', t => {
  const f = fixture(t, false); f.put('src/witan/repo-signals.ts', 'changed'); f.commit();
  const r = f.run('--base', f.base, '--head', 'HEAD'); assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no freeze declared/);
});
test('full-tree sweep reports scoring drift and counts examined source', t => {
  const f = fixture(t); f.put('src/witan/repo-signals.ts', 'changed'); f.commit();
  refused(f.run('--full-tree', '--head', 'HEAD'), 'src/witan/repo-signals.ts');
});
test('full-tree unchanged source passes with a nonzero inventory', t => {
  const f = fixture(t); const r = f.run('--full-tree', '--head', 'HEAD');
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /frozenFiles=1/);
});
test('rename out of scoring scope and deletion cannot clear the guard', t => {
  const f = fixture(t); f.git('mv', 'src/witan/repo-signals.ts', 'moved.ts'); f.commit();
  refused(f.run('--base', f.base, '--head', 'HEAD'), 'src/witan/repo-signals.ts');
});
test('invalid revision is unreadable, never no freeze', t => {
  const f = fixture(t); const r = f.run('--base', 'missing-ref', '--head', 'HEAD');
  assert.equal(r.status, 1); assert.match(r.stderr, /unreadable/);
});

test('a shallow checkout cannot turn missing declaration history into no freeze', t => {
  const f = fixture(t); f.git('rm', 'FREEZE.md'); f.commit();
  const shallow = join(f.root, 'shallow');
  f.git('clone', '-q', '--depth', '1', `file://${f.root}`, shallow);
  const r = spawnSync(process.execPath, [script, '--full-tree'], { cwd: shallow, encoding: 'utf8' });
  assert.equal(r.status, 1); assert.match(r.stderr, /unreadable declaration history/);
});

test('PR diff uses merge-base so newer base changes are not attributed to the PR', t => {
  const f = fixture(t); f.put('src/witan/repo-signals.ts', 'new base source'); const newerBase = f.commit();
  f.git('checkout', '-q', '--detach', f.base);
  f.put('src/witan/__tests__/control.test.ts', 'branch test'); f.commit();
  const r = f.run('--base', newerBase, '--head', 'HEAD');
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /changedPaths=1/);
});

function signing(f, name = 'operator') {
  // Disposable fixture keys only; never access an operator's private key or agent.
  const key = join(f.root, '..', `${f.root.split('/').at(-1)}-${name}`);
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
  f.git('config', 'gpg.format', 'ssh');
  f.git('config', 'user.signingkey', key);
  return { key, line: `fixture@example.invalid ${readFileSync(`${key}.pub`, 'utf8')}` };
}
function signedFixture(t) {
  const f = fixture(t);
  const signer = signing(f);
  t.after(() => { rmSync(signer.key, { force: true }); rmSync(`${signer.key}.pub`, { force: true }); });
  f.put('docs/security/allowed-signers', signer.line); f.commit();
  return f;
}
function transition(f, pin, chain = 'valid', signed = true) {
  const bytes = readFileSync(join(f.root, 'FREEZE.md'), 'utf8');
  const old = JSON.parse(bytes);
  const next = { ...old, closingConditions: `${old.closingConditions} Amended.`, pinnedRevision: pin, supersedes: {
    markerSha256: createHash('sha256').update(bytes).digest('hex'), pinnedRevision: old.pinnedRevision,
  } };
  if (chain === 'absent') delete next.supersedes;
  if (chain === 'hash') next.supersedes.markerSha256 = '0'.repeat(64);
  if (chain === 'pin') next.supersedes.pinnedRevision = '0'.repeat(40);
  if (chain === 'malformed') next.supersedes = 'not an object';
  f.put('FREEZE.md', JSON.stringify(next)); return f.commit(signed);
}
function close(f, signed = true) {
  const bytes = readFileSync(join(f.root, 'FREEZE.md'), 'utf8');
  const old = JSON.parse(bytes);
  const next = { ...old, supersedes: { markerSha256: createHash('sha256').update(bytes).digest('hex'), pinnedRevision: old.pinnedRevision }, closure: {
    closedAt: '2026-09-17T00:00:00.000Z', closedBy: { repository: 'example/authority', record: 'docs/calibration/close.md', signedCommit: old.authority.signedCommit },
  } };
  f.put('FREEZE.md', JSON.stringify(next)); return f.commit(signed);
}
function chainRefused(result, pattern) {
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /freeze REFUSED/);
  assert.match(result.stderr, /FREEZE.md/);
  assert.match(result.stderr, pattern);
}
test('signed chained supersession moves the pin and governs subsequent full-tree sweeps', t => {
  const f = signedFixture(t);
  f.put('src/witan/repo-signals.ts', 'amended source'); const pin = f.commit();
  transition(f, pin);
  const r = f.run('--full-tree');
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /freeze PASS/);
  assert.ok(r.stdout.includes(`pin=${pin}`), r.stdout);
  f.put('src/witan/repo-signals.ts', 'later scoring change'); f.commit();
  refused(f.run('--full-tree'), 'src/witan/repo-signals.ts');
});
test('signed chained closure permits a subsequent scoring-source change', t => {
  const f = signedFixture(t); close(f); const base = f.git('rev-parse', 'HEAD');
  f.put('src/witan/repo-signals.ts', 'permitted after closure'); f.commit();
  const r = f.run('--base', base); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /closed/);
});
test('initial closure refuses whether unsigned or signed', t => {
  for (const signed of [false, true]) {
    const f = fixture(t, false); const signer = signing(f, signed ? 'initial-signed' : 'initial-unsigned');
    t.after(() => { rmSync(signer.key, { force: true }); rmSync(`${signer.key}.pub`, { force: true }); });
    f.put('docs/security/allowed-signers', signer.line); f.commit();
    f.put('FREEZE.md', JSON.stringify({ ...f.marker, closure: { closedAt: '2026-09-17T00:00:00.000Z', closedBy: { repository: 'example/authority', record: 'docs/calibration/close.md', signedCommit: f.pin } } })); f.commit(signed);
    chainRefused(f.run('--full-tree'), /closure requires a predecessor/);
  }
});
for (const chain of ['absent', 'hash', 'pin', 'malformed']) {
  test(`signed supersession with ${chain} chain refuses with chain diagnosis`, t => {
    const f = signedFixture(t); transition(f, f.pin, chain);
    chainRefused(f.run('--full-tree'), /supersedes/);
  });
}
test('unsigned supersession names the missing signature even with a valid chain', t => {
  const f = signedFixture(t); transition(f, f.pin, 'valid', false);
  chainRefused(f.run('--full-tree'), /signature.*%G\?=N/);
});
test('unsigned unchained edit names both missing requirements', t => {
  const f = signedFixture(t); transition(f, f.pin, 'absent', false);
  const r = f.run('--base', f.base); chainRefused(r, /supersedes/);
  assert.match(r.stderr, /signature.*%G\?=N/);
});
test('unverifiable E signature refuses a valid supersession like unsigned N', t => {
  const f = signedFixture(t);
  transition(f, f.pin, 'valid', false);
  // Drive Git's actual %G? reader with a fixture verifier reporting NO_PUBKEY.
  // This isolates E without relying on an installed keyring or network key lookup.
  const raw = f.git('cat-file', 'commit', 'HEAD').replace('\n\n',
    '\ngpgsig -----BEGIN PGP SIGNATURE-----\n \n Zml4dHVyZQ==\n -----END PGP SIGNATURE-----\n\n');
  const sha = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], {
    cwd: f.root, input: raw, encoding: 'utf8',
  }).trim();
  f.git('update-ref', 'HEAD', sha);
  const verifier = join(f.root, 'fixture-gpg');
  writeFileSync(verifier, '#!/bin/sh\ncat >/dev/null\nprintf "[GNUPG:] ERRSIG 0123456789ABCDEF 1 10 00 0 9\\n[GNUPG:] NO_PUBKEY 0123456789ABCDEF\\n"\nexit 1\n');
  chmodSync(verifier, 0o755);
  f.git('config', 'gpg.program', verifier);
  assert.equal(f.git('show', '-s', '--format=%G?', 'HEAD'), 'E');
  chainRefused(f.run('--full-tree'), /signature.*%G\?=E/);
});
test('unlisted fixture key is refused despite a valid chain', t => {
  const f = signedFixture(t); const other = signing(f, 'unlisted');
  t.after(() => { rmSync(other.key, { force: true }); rmSync(`${other.key}.pub`, { force: true }); });
  transition(f, f.pin); chainRefused(f.run('--full-tree'), /signature/);
});
test('signed marker deletion still refuses', t => {
  const f = signedFixture(t); f.git('rm', 'FREEZE.md'); f.commit(true);
  chainRefused(f.run('--full-tree'), /delet/);
});
for (const mode of ['missing', 'key-less']) {
  test(`${mode} allowed-signers refuses a chained transition as unreadable`, t => {
    const f = signedFixture(t);
    if (mode === 'missing') f.git('rm', 'docs/security/allowed-signers');
    else f.put('docs/security/allowed-signers', '# no keys\n');
    f.commit(); transition(f, f.pin);
    chainRefused(f.run('--full-tree'), /unreadable.*allowed-signers/);
  });
}
test('empty frozen inventory is unreadable, never a successful empty sweep', t => {
  const f = fixture(t, false); f.git('rm', 'src/witan/repo-signals.ts');
  const pin = f.commit(); f.put('FREEZE.md', JSON.stringify({ ...f.marker, pinnedRevision: pin })); f.commit();
  const r = f.run('--full-tree'); assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /REFUSED unreadable/); assert.match(r.stderr, /expected nonzero frozen source files; found 0/);
});
test('__tests__/helpers.ts is excluded by its path part alone', t => {
  const f = fixture(t); f.put('src/witan/__tests__/helpers.ts', 'export const helper = 1;'); f.commit();
  const r = f.run('--base', f.base); assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /freeze PASS/); assert.match(r.stdout, /changedPaths=1/);
});
test('a second signed transition must supersede the currently effective marker', t => {
  const f = signedFixture(t); transition(f, f.pin);
  transition(f, f.pin); const r = f.run('--full-tree'); assert.equal(r.status, 0, r.stderr);
  transition(f, f.pin, 'hash'); chainRefused(f.run('--full-tree'), /supersedes/);
});
test('an unsigned intermediate edit cannot be laundered by restoring the marker', t => {
  const f = signedFixture(t); const original = readFileSync(join(f.root, 'FREEZE.md'), 'utf8');
  transition(f, f.pin, 'valid', false); f.put('FREEZE.md', original); f.commit();
  chainRefused(f.run('--full-tree'), /signature/);
});

test('merge preserves the signed transition without requiring a signature on an unchanged merge', t => {
  const f = signedFixture(t); const fork = f.git('rev-parse', 'HEAD');
  f.git('checkout', '-qb', 'transition'); transition(f, f.pin);
  f.git('checkout', '-qb', 'integration', fork); f.put('notes.md', 'unrelated'); f.commit();
  f.git('merge', '--no-gpg-sign', '--no-ff', '-qm', 'merge signed transition', 'transition');
  const r = f.run('--full-tree'); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /freeze PASS/);
});
test('competing signed successors are a fork even if a merge picks one marker', t => {
  const f = signedFixture(t); const fork = f.git('rev-parse', 'HEAD');
  f.git('checkout', '-qb', 'first'); transition(f, f.pin);
  f.git('checkout', '-qb', 'second', fork); f.put('notes.md', 'branch'); const otherPin = f.commit();
  transition(f, otherPin);
  f.git('merge', '--no-gpg-sign', '-s', 'ours', '-qm', 'choose second', 'first');
  chainRefused(f.run('--full-tree'), /supersedes fork/);
});
test('a transition cannot authorize itself by replacing allowed-signers in the same commit', t => {
  const f = signedFixture(t); const other = signing(f, 'self-authorized');
  t.after(() => { rmSync(other.key, { force: true }); rmSync(`${other.key}.pub`, { force: true }); });
  f.put('docs/security/allowed-signers', other.line); transition(f, f.pin);
  chainRefused(f.run('--full-tree'), /signature/);
});
test('signed transition passes PR mode but subsequent scoring source still refuses', t => {
  const f = signedFixture(t); transition(f, f.pin);
  const r = f.run('--base', f.base); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /freeze PASS/);
  const base = f.git('rev-parse', 'HEAD'); f.put('src/witan/repo-signals.ts', 'later'); f.commit();
  refused(f.run('--base', base), 'src/witan/repo-signals.ts');
});

test('a merged side branch cannot hide an unsigned edit followed by restoration', t => {
  const f = signedFixture(t); const original = readFileSync(join(f.root, 'FREEZE.md'), 'utf8');
  const fork = f.git('rev-parse', 'HEAD'); f.git('checkout', '-qb', 'bad-side');
  transition(f, f.pin, 'valid', false); f.put('FREEZE.md', original); f.commit();
  f.git('checkout', '-qb', 'integration', fork); f.put('notes.md', 'unrelated'); f.commit();
  f.git('merge', '--no-gpg-sign', '--no-ff', '-qm', 'merge side history', 'bad-side');
  chainRefused(f.run('--full-tree'), /signature/);
});
