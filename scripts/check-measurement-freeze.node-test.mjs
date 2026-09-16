import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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
  const commit = () => { git('add', '.'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  put('src/witan/repo-signals.ts');
  put('src/witan/__tests__/control.test.ts');
  const pin = commit();
  const marker = { window: 'cycle-test', pinnedRevision: pin, authority: {
    repository: 'example/authority', record: 'docs/calibration/decision.md', signedCommit: pin,
  }, frozenPaths: ['src/witan/'], closingConditions: 'Operator records completion or signed supersession.' };
  if (frozen) { put('FREEZE.md', JSON.stringify(marker)); commit(); }
  const base = git('rev-parse', 'HEAD');
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
  return { root, git, put, commit, base, pin, run };
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
