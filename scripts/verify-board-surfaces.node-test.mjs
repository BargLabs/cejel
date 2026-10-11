import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertSiteOnly, compareSurfaces, parseSurface, SITE, verifyBoardSurfaces, withdrawalDigest } from './verify-board-surfaces.mjs';

const header = '- Run date: 2026-08-25T01:09:08.813Z\n- Cejel version: @cejel/cejel@0.4.5 (published)\n- Rubric version: witan-rubric-v17-2026-07-24\n## History\n### 2026-08-18: scores withdrawn and why\n';
test('compares every header and requires withdrawal even after republication', () => {
  // compareSurfaces consumes parsed records; body integrity is tested separately below.
  const good = { ...parseSurface('site', header), withdrawal: true };
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
    assert.equal(good.surfaces.length, 3);
    assert.equal(good.errors.length, 3);
    assert.ok(good.errors.every((error) => error.includes('withdrawal')));
    writeFileSync(join(site, 'index.html'), header.replace('0.4.5', '0.2.1'));
    assert.equal((await verifyBoardSurfaces(root, site)).errors.length, 4);
    rmSync(join(site, 'index.html'));
    await assert.rejects(() => verifyBoardSurfaces(root, site), /ENOENT/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('withdrawal heading without the explanation cannot satisfy preservation', () => {
  assert.equal(parseSurface('body-deleted', header).withdrawal, false);
  assert.equal(parseSurface('status-retained', header + '**Status:** MET').withdrawal, false);
});

test('record normalization preserves body content across formats and ignores mutable status', () => {
  const markdown = '### 2026-08-18: scores withdrawn and why\n**Claim.** A `public` scorer & its scope.\n**Status:** pending';
  const html = '<h3>2026-08-18: scores withdrawn and why</h3><p><strong>Claim.</strong> A <code>public</code> scorer &amp; its scope.</p><p><strong>Status:</strong> met</p>';
  assert.equal(withdrawalDigest(markdown), withdrawalDigest(html));
  assert.notEqual(withdrawalDigest(markdown), withdrawalDigest(markdown.replace('its scope.', '')));
  assert.equal(withdrawalDigest('<!--' + markdown + '-->'), null);
  assert.equal(withdrawalDigest('<script>' + markdown + '</script>'), null);
});

// Shared ranks (#431): applied only to boards declaring 0.6.3 or later.
const RANK_MD = (version, rows) =>
  `- Cejel version: @cejel/cejel@${version} (published, npx)\n- Rubric version: witan-rubric-v17-2026-07-24\n- Run date: 2026-10-11T00:00:00.000Z\n\n## Ranking\n\n` +
  rows.map(([rank, name, score]) => `| ${rank} | [${name}](https://github.com/x/${name}) | lib | MIT | ${score} | ${score} | 3.0 | 3.0 | c | 0 | w | e |`).join('\n');
const RANK_HTML = (rows) =>
  rows.map(([rank, name, score]) => `<tr><td>${rank}</td><td><a href="https://github.com/x/${name}">${name}</a></td><td>lib</td><td>MIT</td><td class="score">${score}</td><td class="ranked-score">${score}</td><td>3.0</td></tr>`).join('\n');
const shared = [[1, 'axios', '3.2'], [1, 'pydantic', '3.2'], [1, 'vite', '3.2'], [4, 'fastapi', '3.1']];
const byName = [[1, 'axios', '3.2'], [2, 'pydantic', '3.2'], [3, 'vite', '3.2'], [4, 'fastapi', '3.1']];
const surface = (name, version, text) => ({
  ...parseSurface(name, RANK_MD(version, []) .split('## Ranking')[0] + text),
  withdrawal: true,
});

test('a 0.6.3 board with shared ranks agreeing across markdown and HTML passes', () => {
  const md = surface('site/leaderboard.md', '0.6.3', RANK_MD('0.6.3', shared).split('## Ranking')[1]);
  const html = surface('site/leaderboard.html', '0.6.3', RANK_HTML(shared));
  assert.deepEqual(md.ranking.map((row) => row.rank), [1, 1, 1, 4]);
  assert.deepEqual(compareSurfaces([md, html]), []);
});

test('a 0.6.3 board that breaks a tie by name goes red, naming the row and the rank it needs', () => {
  const md = surface('site/leaderboard.md', '0.6.3', RANK_MD('0.6.3', byName).split('## Ranking')[1]);
  const errors = compareSurfaces([md]);
  assert.ok(errors.some((error) => /pydantic is ranked 2 at comparable 3\.2; shared ranks require 1/.test(error)), errors.join('\n'));
});

test('a pre-0.6.3 board that breaks ties by name stays green: the live historical board', () => {
  const md = surface('site/leaderboard.md', '0.4.9', RANK_MD('0.4.9', byName).split('## Ranking')[1]);
  assert.deepEqual(compareSurfaces([md]), []);
});

test('markdown and HTML disagreeing on ranks, or a 0.6.3 board with no parseable ranking, goes red', () => {
  const md = surface('site/leaderboard.md', '0.6.3', RANK_MD('0.6.3', shared).split('## Ranking')[1]);
  const html = surface('site/leaderboard.html', '0.6.3', RANK_HTML(shared.slice(0, 3)));
  assert.ok(compareSurfaces([md, html]).some((error) => /ranked rows differ/.test(error)));
  const empty = surface('site/leaderboard.html', '0.6.3', '');
  assert.ok(compareSurfaces([empty]).some((error) => /no ranked rows parsed/.test(error)));
});
