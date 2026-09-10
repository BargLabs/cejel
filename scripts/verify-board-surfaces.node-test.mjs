import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertSiteOnly, compareSurfaces, parseSurface, SITE, verifyBoardSurfaces } from './verify-board-surfaces.mjs';

const header = '- Run date: 2026-08-25T01:09:08.813Z\n- Cejel version: @cejel/cejel@0.4.5 (published)\n- Rubric version: witan-rubric-v17-2026-07-24\n## History\n### 2026-08-18: scores withdrawn and why\n';
test('compares every header and requires withdrawal even after republication', () => {
  const good = parseSurface('site', header);
  assert.deepEqual(compareSurfaces([good, { ...good, name: 'mirror' }]), []);
  for (const [key, value] of [['version', '@cejel/cejel@0.2.1'], ['rubric', 'witan-rubric-v18-prospective-2026-07-25'], ['date', '2026-07-27T01:48:38.955Z']]) {
    assert.equal(compareSurfaces([good, { ...good, name: 'mirror', [key]: value }]).length, 1);
  }
  assert.match(compareSurfaces([{ ...good, withdrawal: false }])[0], /withdrawal/);
  assert.match(compareSurfaces([{ ...good, rubric: 'witan-rubric-v18-prospective-2026-07-25', withdrawal: false }])[0], /withdrawal/);
  assert.throws(() => compareSurfaces([]), /No public/);
});
test('missing or duplicate headers fail instead of certifying an empty comparison', () => {
  assert.throws(() => parseSurface('empty', ''), /header/);
  assert.throws(() => parseSurface('duplicate', header + header), /exactly one/);
  const html = header.split('\n').map((line) => `<p>${line}</p>`).join('');
  assert.equal(parseSurface('html', html).version, '@cejel/cejel@0.4.5');
});
test('site-only policy refuses a reintroduced report, even without a board index', () => {
  const root = mkdtempSync(join(tmpdir(), 'board-policy-'));
  try {
    writeFileSync(join(root, 'README.md'), `[Board](${SITE})`);
    mkdirSync(join(root, 'leaderboard'));
    assertSiteOnly(root);
    mkdirSync(join(root, 'leaderboard/reports'));
    assert.throws(() => assertSiteOnly(root), /second scored board/);
    rmSync(join(root, 'leaderboard/reports'), { recursive: true });
    writeFileSync(join(root, 'README.md'), `[Board](${SITE}) [old](./leaderboard/leaderboard.md)`);
    assert.throws(() => assertSiteOnly(root), /removed local/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('reads all three site formats and fails closed on an unreadable surface', async () => {
  const root = mkdtempSync(join(tmpdir(), 'board-surfaces-'));
  try {
    writeFileSync(join(root, 'README.md'), `[Board](${SITE})`);
    const site = join(root, 'site'); mkdirSync(site);
    for (const name of ['leaderboard.md', 'leaderboard.html', 'index.html']) writeFileSync(join(site, name), header);
    const good = await verifyBoardSurfaces(root, site);
    assert.equal(good.surfaces.length, 3); assert.deepEqual(good.errors, []);
    writeFileSync(join(site, 'index.html'), header.replace('0.4.5', '0.2.1'));
    assert.equal((await verifyBoardSurfaces(root, site)).errors.length, 1);
    rmSync(join(site, 'index.html'));
    await assert.rejects(() => verifyBoardSurfaces(root, site), /ENOENT/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('withdrawal heading without the explanation cannot satisfy preservation', () => {
  assert.equal(parseSurface('body-deleted', header).withdrawal, false);
});
