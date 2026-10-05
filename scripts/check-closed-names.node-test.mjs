// Tests for scripts/check-closed-names.mjs. Every name here is an invented token: the real
// list is held as hashes, and no closed name may appear in this public repository.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'check-closed-names.mjs');
const REAL_LIST = join(HERE, 'closed-name-hashes.json');

const TOKEN = 'zqclosedtokenzq';
const PAIR = 'zqowner/zqrepo';
const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

const work = mkdtempSync(join(tmpdir(), 'closed-name-guard-test-'));
const LIST = join(work, 'list.json');
writeFileSync(LIST, JSON.stringify({ note: 'synthetic test list', sha256: [sha256(TOKEN), sha256(PAIR)] }));
const EMPTY_LIST = join(work, 'empty-list.json');
writeFileSync(EMPTY_LIST, JSON.stringify({ note: 'synthetic test list', sha256: [] }));
const MALFORMED_LIST = join(work, 'malformed-list.json');
writeFileSync(MALFORMED_LIST, JSON.stringify({ note: 'synthetic test list', sha256: ['not-a-hash'] }));
const MISSING_LIST = join(work, 'no-such-list.json');

const TRACKED_PATH = `docs/experiments/${TOKEN}-2026-08-01/result.md`;
const TRACKED = join(work, 'tracked.txt');
writeFileSync(TRACKED, `README.md\n${TRACKED_PATH}\n`);

/** A one-file, one-hunk diff in `git diff -U0` shape. */
function diffOf({ path = 'docs/notes.md', added = [], removed = [], context = [], newFile = false }) {
  const header = newFile
    ? [`diff --git a/${path} b/${path}`, 'new file mode 100644', 'index 0000000..1111111', '--- /dev/null', `+++ b/${path}`]
    : [`diff --git a/${path} b/${path}`, 'index 1111111..2222222 100644', `--- a/${path}`, `+++ b/${path}`];
  const oldCount = removed.length + context.length;
  const newCount = added.length + context.length;
  const body = [
    `@@ -${newFile ? 0 : 10},${oldCount} +12,${newCount} @@ section heading`,
    ...context.map((l) => ` ${l}`),
    ...removed.map((l) => `-${l}`),
    ...added.map((l) => `+${l}`),
  ];
  return [...header, ...body, ''].join('\n');
}

function run(diff, { list = LIST, tracked = TRACKED, args = [] } = {}) {
  const argv = [SCRIPT, '--list', list];
  if (tracked) argv.push('--tracked', tracked);
  const result = spawnSync(process.execPath, [...argv, ...args], { input: diff, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, all: result.stdout + result.stderr };
}

function assertHit(result, message) {
  assert.equal(result.status, 1, `${message}: expected exit 1, got ${result.status}\n${result.all}`);
  assert.match(result.stderr, /closed_name_hit/, `${message}: no closed_name_hit line\n${result.all}`);
}

function assertPass(result, message) {
  assert.equal(result.status, 0, `${message}: expected exit 0, got ${result.status}\n${result.all}`);
  assert.match(result.stdout, /closed_name_guard ok/, `${message}: no ok summary\n${result.all}`);
}

test('an added line holding the token fails, in every shape a record writes it', () => {
  const shapes = [
    ['prose', `This record came from the ${TOKEN} service.`],
    ['prose, mixed case', `This record came from ${TOKEN.toUpperCase()}.`],
    ['path', `see src/${TOKEN}/index.ts for the source`],
    ['JSON value', `  "repository": "${TOKEN}",`],
    ['hyphenated compound', `the my-${TOKEN}-mirror runner`],
    ['underscore compound', `const ${TOKEN}_root = 1;`],
    ['owner/repo pair', `cloned ${PAIR} at 1234567`],
    ['owner/repo pair with .git', `git clone git@github.com:${PAIR}.git`],
    ['owner/repo pair in a URL', `https://github.com/${PAIR}/pull/12`],
    ['owner/repo pair with .git in a URL', `https://github.com/${PAIR}.git`],
  ];
  for (const [shape, line] of shapes) {
    assertHit(run(diffOf({ added: [line] })), shape);
  }
});

test('the same token on a removed line or a context line passes', () => {
  assertPass(run(diffOf({ removed: [`the ${TOKEN} service`], added: ['the private service'] })), 'removed line');
  assertPass(run(diffOf({ context: [`the ${TOKEN} service`, `cloned ${PAIR}`], added: ['an unrelated line'] })), 'context line');
});

test('the hunk header section text is not an added line', () => {
  const diff = diffOf({ added: ['an unrelated line'] }).replace('section heading', `function ${TOKEN}()`);
  assertPass(run(diff), 'hunk header');
});

test('a word that merely contains the token with other letters attached passes', () => {
  for (const line of [`pre${TOKEN}`, `${TOKEN}s`, `x${TOKEN}y and zq${PAIR}x`]) {
    assertPass(run(diffOf({ added: [line] })), line);
  }
});

test('an added line citing a base-tracked path that holds the token passes; one changed character fails', () => {
  assertPass(run(diffOf({ added: [`See ${TRACKED_PATH} for the August run.`] })), 'exact tracked path');
  assertPass(run(diffOf({ added: [`See \`./${TRACKED_PATH}\`.`] })), 'tracked path with leading ./');
  // A citation that ends a sentence carries the full stop inside the run.
  assertPass(run(diffOf({ added: [`The August run is ${TRACKED_PATH}.`] })), 'tracked path ending a sentence');
  const changed = TRACKED_PATH.replace('2026-08-01', '2026-08-02');
  assertHit(run(diffOf({ added: [`See ${changed} for the August run.`] })), 'one character changed');
  // The exemption covers the cited run only, not the rest of the line.
  assertHit(run(diffOf({ added: [`See ${TRACKED_PATH} and the ${TOKEN} notes.`] })), 'exempt run beside a bare token');
});

test('the exemption needs the tracked list: with none, the same citation fails', () => {
  assertHit(run(diffOf({ added: [`See ${TRACKED_PATH}.`] }), { tracked: null }), 'no tracked list');
});

test('a new file added at a path holding the token fails, even when empty', () => {
  assertHit(run(diffOf({ path: `docs/${TOKEN}/notes.md`, newFile: true, added: ['harmless'] })), 'new file');
  const emptyNewFile = [`diff --git a/docs/${TOKEN}.md b/docs/${TOKEN}.md`, 'new file mode 100644', 'index 0000000..e69de29', ''].join('\n');
  assertHit(run(emptyNewFile), 'empty new file');
});

test('a rename onto a path holding the token fails', () => {
  const rename = [
    `diff --git a/docs/old.md b/docs/${TOKEN}.md`,
    'similarity index 100%',
    'rename from docs/old.md',
    `rename to docs/${TOKEN}.md`,
    '',
  ].join('\n');
  assertHit(run(rename), 'rename');
});

test('a modified file whose path holds the token is not itself an added path', () => {
  assertPass(run(diffOf({ path: TRACKED_PATH, added: ['an unrelated line'] })), 'modified tracked file');
});

test('the failure output names file, line and hash prefix, and never the matched text', () => {
  const result = run(diffOf({ path: 'docs/notes.md', added: ['clean line', `the ${TOKEN} service`] }));
  assertHit(result, 'line hit');
  assert.match(result.stderr, /docs\/notes\.md:13/);
  assert.match(result.stderr, new RegExp(sha256(TOKEN).slice(0, 12)));
  assert.doesNotMatch(result.all, new RegExp(TOKEN, 'i'));

  const pathHit = run(diffOf({ path: `docs/${TOKEN}/notes.md`, newFile: true, added: [`and ${PAIR}`] }));
  assertHit(pathHit, 'path hit');
  assert.match(pathHit.stderr, new RegExp(sha256(TOKEN).slice(0, 12)));
  assert.match(pathHit.stderr, new RegExp(sha256(PAIR).slice(0, 12)));
  assert.doesNotMatch(pathHit.all, new RegExp(TOKEN, 'i'));
  assert.doesNotMatch(pathHit.all, /zqowner|zqrepo/i);
});

const REFUSALS = [
  'closed_name_guard_refused_empty_diff',
  'closed_name_guard_refused_unreadable_list',
  'closed_name_guard_refused_empty_list',
  'closed_name_guard_refused_malformed_list',
];

function assertRefusal(result, code) {
  assert.equal(result.status, 2, `${code}: expected exit 2, got ${result.status}\n${result.all}`);
  assert.match(result.stderr, new RegExp(code), result.all);
  for (const other of REFUSALS.filter((c) => c !== code)) assert.doesNotMatch(result.all, new RegExp(other));
  assert.doesNotMatch(result.all, /closed_name_guard ok/);
}

test('an empty diff is a refusal, not a pass', () => {
  assertRefusal(run(''), 'closed_name_guard_refused_empty_diff');
  assertRefusal(run('\n\n'), 'closed_name_guard_refused_empty_diff');
});

test('a missing list is a refusal, not a pass', () => {
  assertRefusal(run(diffOf({ added: ['clean'] }), { list: MISSING_LIST }), 'closed_name_guard_refused_unreadable_list');
});

test('an empty list is a refusal, not a pass', () => {
  assertRefusal(run(diffOf({ added: ['clean'] }), { list: EMPTY_LIST }), 'closed_name_guard_refused_empty_list');
});

test('a list entry that is not a sha256 is a refusal, not a pass', () => {
  assertRefusal(run(diffOf({ added: ['clean'] }), { list: MALFORMED_LIST }), 'closed_name_guard_refused_malformed_list');
});

test('commit mode diffs base...head and exempts paths tracked at base', () => {
  const repo = mkdtempSync(join(tmpdir(), 'closed-name-guard-repo-'));
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], {
      cwd: repo,
      encoding: 'utf8',
    }).trim();
  git('init', '-q', '-b', 'main');
  mkdirSync(join(repo, dirname(TRACKED_PATH)), { recursive: true });
  writeFileSync(join(repo, TRACKED_PATH), 'august record\n');
  writeFileSync(join(repo, 'notes.md'), 'start\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(repo, 'notes.md'), `start\nSee ${TRACKED_PATH}.\n`);
  git('commit', '-q', '-am', 'cite');
  const cite = git('rev-parse', 'HEAD');
  writeFileSync(join(repo, 'notes.md'), `start\nSee ${TRACKED_PATH}.\nthe ${TOKEN} service\n`);
  git('commit', '-q', '-am', 'leak');
  const leak = git('rev-parse', 'HEAD');

  const commitMode = (from, to) => {
    const result = spawnSync(process.execPath, [SCRIPT, '--list', LIST, from, to], { cwd: repo, encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, all: result.stdout + result.stderr };
  };
  assertPass(commitMode(base, cite), 'citation of a base-tracked path');
  const leaked = commitMode(cite, leak);
  assertHit(leaked, 'bare token');
  assert.match(leaked.stderr, /notes\.md:3/);
  assertRefusal(commitMode(leak, leak), 'closed_name_guard_refused_empty_diff');
});

test('the real list loads and holds exactly the eleven operator hashes, in order', async () => {
  const expected = [
    'cc6e11391c066f2ad885e2ead8ea6c398166e6f630a11eae831ec7c0a321456d',
    '3dfbf1fbdbf9d2eb39e14955dcfd073792ebed8c9b97995210e70c4059be13c9',
    '8849853b957fe153b7056d0e7d65f99fb21070daf5122ddf1d7c942d4643c33d',
    'ca762fe6450bd5fbe1cff620d73c99b9b285f940a784335ccf5d3a5cfc3be76f',
    'ec15fc852902d694c8c9fda166a84e0b71ea1ab416a0b2b26abae092848cd55c',
    '7b19d886875818cf35cf85cd0785882f546b1dbea67d52ccf25cb5c0eec06dc1',
    '01cbc0ee0b51683d4ba62ec49cbd9e38b928b500ed505fbf7c172a4a7ec2f289',
    '0e51809feb5a51094124e4e2bb33abc28352d46df9c5efc3b95b314ff85153f8',
    '464a4a92a52595a941f604845d52d7d1ba0175d2ed21578fb25326a05b80676a',
    'a283e099e40ad9e8b6983ceed6793d5471b663fe48571c8930691794bdd14af6',
    '763dda12098c8b8e09dc35130bcfa6741349468ccbaf441cde568be5261c8e56',
  ];
  const raw = JSON.parse(readFileSync(REAL_LIST, 'utf8'));
  assert.equal(typeof raw.note, 'string');
  assert.deepEqual(raw.sha256, expected);
  for (const hash of raw.sha256) assert.match(hash, /^[0-9a-f]{64}$/);
  const { loadHashList } = await import('./check-closed-names.mjs');
  const loaded = loadHashList(REAL_LIST);
  assert.equal(loaded.size, 11);
  for (const hash of expected) assert.ok(loaded.has(hash));
  // The default list is the real one: a clean diff checks against all eleven.
  const result = spawnSync(process.execPath, [SCRIPT], { input: diffOf({ added: ['clean'] }), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /list=11\b/);
});
