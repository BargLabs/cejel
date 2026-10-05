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

// --- Who judges: the base's copy, never the pull request's -------------------------------------
//
// The workflow decides which commit's checker and list judge a pull request. These tests read the
// shipped workflow file, work out from its trigger and checkout ref which side of the pull request
// it runs, and run that side's copy in a temporary repository whose head tries to disable the guard.

const WORKFLOW = join(HERE, '..', '.github', 'workflows', 'closed-name-guard.yml');
const BASE_REFS = new Set(['${{ github.sha }}', '${{ github.event.pull_request.base.sha }}']);

/** Lines of a YAML block that sit deeper than `parentIndent`, starting after line `start`. */
function blockLines(lines, start, parentIndent) {
  const out = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') continue;
    if (line.search(/\S/) <= parentIndent) break;
    out.push(line);
  }
  return out;
}

const withoutComments = (text) =>
  text
    .split('\n')
    .map((line) => (/^\s*#/.test(line) ? '' : line.replace(/\s+#\s.*$/, '')))
    .join('\n');

/** The workflow's triggers, top-level permissions, and steps as {uses, with, env, run}. */
function readWorkflow(text = readFileSync(WORKFLOW, 'utf8')) {
  const lines = withoutComments(text).split('\n');
  const topLevel = (key) => lines.findIndex((line) => line.startsWith(`${key}:`));
  const mapping = (block) => {
    const indent = block.length ? block[0].search(/\S/) : 0;
    const out = {};
    for (const line of block) {
      if (line.search(/\S/) !== indent) continue;
      const match = /^\s*([^:\s]+):\s*(.*)$/.exec(line);
      if (match) out[match[1]] = match[2].replace(/^'(.*)'$/, '$1');
    }
    return out;
  };

  const onIndex = topLevel('on');
  assert.ok(onIndex !== -1, 'the workflow has no top-level on:');
  const inlineOn = lines[onIndex].slice(3).trim();
  const triggers = inlineOn
    ? inlineOn.replace(/^\[|\]$/g, '').split(',').map((t) => t.trim()).filter(Boolean)
    : Object.keys(mapping(blockLines(lines, onIndex, 0)));

  const permIndex = topLevel('permissions');
  const permissions = permIndex === -1 ? null : mapping(blockLines(lines, permIndex, 0));

  const stepsIndex = lines.findIndex((line) => /^\s+steps:\s*$/.test(line));
  assert.ok(stepsIndex !== -1, 'the workflow has no steps:');
  const stepLines = blockLines(lines, stepsIndex, lines[stepsIndex].search(/\S/));
  const itemIndent = stepLines[0].search(/\S/);
  const chunks = [];
  for (const line of stepLines) {
    if (line.search(/\S/) === itemIndent && line.trimStart().startsWith('- ')) chunks.push([]);
    chunks.at(-1).push(line);
  }
  const steps = chunks.map((chunk) => {
    const body = [' '.repeat(itemIndent + 2) + chunk[0].trimStart().slice(2), ...chunk.slice(1)];
    const fields = mapping(body);
    const sub = (key) => {
      const at = body.findIndex((line) => line.trimStart().startsWith(`${key}:`));
      return at === -1 ? {} : mapping(blockLines(body, at, itemIndent + 2));
    };
    let run = fields.run ?? null;
    if (run === '|' || run === '>') {
      const at = body.findIndex((line) => line.trimStart().startsWith('run:'));
      run = blockLines(body, at, itemIndent + 2).map((line) => line.trim()).join('\n');
    }
    return { uses: fields.uses ?? null, name: fields.name ?? null, with: sub('with'), env: sub('env'), run };
  });
  return { text, triggers, permissions, steps };
}

/**
 * Which side of the pull request the workflow's checker and list come from. Fails on anything it
 * does not recognise rather than guessing.
 */
function judgedBy(workflow) {
  if (workflow.triggers.includes('pull_request')) return 'head'; // GitHub checks out the PR merge ref
  assert.deepEqual(workflow.triggers, ['pull_request_target'], `unrecognised triggers: ${workflow.triggers}`);
  const checkouts = workflow.steps.filter((step) => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkouts.length, 1, 'expected exactly one checkout step');
  const ref = checkouts[0].with.ref;
  if (ref === undefined || BASE_REFS.has(ref)) return 'base'; // pull_request_target defaults to the base
  if (/pull_request\.head|refs\/pull\//.test(ref)) return 'head';
  throw new Error(`unrecognised checkout ref: ${ref}`);
}

/** A repository whose base carries this checker and a synthetic list; `mutate` builds the head. */
function guardedRepo(mutate) {
  const repo = mkdtempSync(join(tmpdir(), 'closed-name-guard-base-copy-'));
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], {
      cwd: repo,
      encoding: 'utf8',
    }).trim();
  git('init', '-q', '-b', 'main');
  mkdirSync(join(repo, 'scripts'));
  writeFileSync(join(repo, 'scripts', 'check-closed-names.mjs'), readFileSync(SCRIPT));
  writeFileSync(
    join(repo, 'scripts', 'closed-name-hashes.json'),
    JSON.stringify({ note: 'synthetic test list', sha256: [sha256(TOKEN), sha256(PAIR)] }),
  );
  writeFileSync(join(repo, 'notes.md'), 'start\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  git('switch', '-q', '-c', 'pr');
  mutate(repo);
  git('add', '-A');
  git('commit', '-q', '-m', 'head');
  const head = git('rev-parse', 'HEAD');
  git('switch', '-q', 'main');

  /** Check out one side and run that side's checker, with its default list, on base...head. */
  const runSide = (side) => {
    git('checkout', '-q', '--detach', side === 'base' ? base : head);
    const result = spawnSync(process.execPath, ['scripts/check-closed-names.mjs', base, head], { cwd: repo, encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, all: result.stdout + result.stderr };
  };
  return { runSide };
}

const addToken = (repo) => writeFileSync(join(repo, 'notes.md'), `start\nthe ${TOKEN} service\n`);

test('a head that shortens the list and adds the removed token fails, judged as the workflow judges', () => {
  const { runSide } = guardedRepo((repo) => {
    writeFileSync(
      join(repo, 'scripts', 'closed-name-hashes.json'),
      JSON.stringify({ note: 'synthetic test list', sha256: [sha256(PAIR)] }),
    );
    addToken(repo);
  });
  // Control: the head's own copy is defeated, so this is a real attack, not a broken fixture.
  assertPass(runSide('head'), 'head copy with the shortened list');
  const side = judgedBy(readWorkflow());
  const judged = runSide(side);
  assertHit(judged, `judged by the ${side}'s copy`);
  assert.match(judged.stdout, /list=2\b/, 'judged with the base list of two');
  assert.doesNotMatch(judged.all, new RegExp(TOKEN, 'i'));
});

test('a head that edits the checker to always pass and adds a token fails, judged as the workflow judges', () => {
  const { runSide } = guardedRepo((repo) => {
    writeFileSync(join(repo, 'scripts', 'check-closed-names.mjs'), "process.stdout.write('closed_name_guard ok\\n');\n");
    addToken(repo);
  });
  assertPass(runSide('head'), 'head copy with the always-pass checker');
  const side = judgedBy(readWorkflow());
  assertHit(runSide(side), `judged by the ${side}'s copy`);
});

test("a head that marks its files binary in .gitattributes and adds a token fails, judged as the workflow judges", () => {
  // git reads attributes from the checked-out tree; a head checkout would hide its own added lines.
  const { runSide } = guardedRepo((repo) => {
    writeFileSync(join(repo, '.gitattributes'), '*.md -diff\n');
    addToken(repo);
  });
  assertPass(runSide('head'), 'head checkout with its own attributes');
  const side = judgedBy(readWorkflow());
  assertHit(runSide(side), `judged by the ${side}'s copy`);
});

test('the workflow runs the base copy: pull_request_target, contents: read, base checkout, no head code', () => {
  const workflow = readWorkflow();
  assert.deepEqual(workflow.triggers, ['pull_request_target'], 'trigger');
  assert.deepEqual(workflow.permissions, { contents: 'read' }, 'top-level permissions');
  assert.equal(workflow.text.match(/^\s*permissions:/gm).length, 1, 'no job-level permissions');
  assert.doesNotMatch(workflow.text, /secrets\./, 'no secrets');
  assert.match(workflow.text, /^ {2}closed-name-guard:\n {4}name: closed-name-guard$/m, 'job and check name');

  const uses = workflow.steps.map((step) => step.uses).filter(Boolean);
  for (const action of uses) assert.match(action, /^actions\/(checkout|setup-node)@[0-9a-f]{40}$/, `action ${action}`);
  const [checkout, ...moreCheckouts] = workflow.steps.filter((step) => step.uses?.startsWith('actions/checkout@'));
  assert.equal(moreCheckouts.length, 0, 'exactly one checkout');
  assert.ok(BASE_REFS.has(checkout.with.ref), `checked-out ref is the base, got ${checkout.with.ref}`);
  assert.equal(checkout.with['persist-credentials'], 'false', 'no token left in .git/config');
  assert.equal(checkout.with['fetch-depth'], '0', 'full history, for the merge base');
  for (const step of workflow.steps.filter((s) => s.uses?.startsWith('actions/setup-node@'))) {
    assert.equal(step.with.cache, undefined, 'no dependency cache');
  }
  assert.equal(judgedBy(workflow), 'base');

  const runs = workflow.steps.filter((step) => step.run !== null);
  const commands = runs.flatMap((step) => step.run.split('\n')).filter(Boolean);
  for (const step of runs) {
    assert.doesNotMatch(step.run, /\$\{\{/, `expressions go through env, not into the script: ${step.run}`);
    for (const value of Object.values(step.env)) {
      if (/head/.test(value)) assert.equal(value, '${{ github.event.pull_request.head.sha }}', 'head enters by SHA only');
    }
  }
  for (const command of commands) {
    assert.doesNotMatch(
      command,
      /\b(checkout|switch|worktree|restore|reset|read-tree|checkout-index|merge|rebase|cherry-pick|pull|stash|apply|am|npm|npx|pnpm|yarn|corepack|bash|sh|source|eval)\b/,
      `no step checks out, installs or runs anything from the head: ${command}`,
    );
  }
  // The head SHA appears in exactly two commands: the fetch, and the checker's head argument.
  const headCommands = commands.filter((command) => command.includes('HEAD_SHA'));
  assert.deepEqual(headCommands, [
    'git fetch --no-tags origin "$HEAD_SHA"',
    'node scripts/check-closed-names.mjs "$BASE_SHA" "$HEAD_SHA"',
  ]);
  // node runs only the checked-out (base) checker and its tests, and never with a --list override.
  const nodeCommands = commands.filter((command) => /\bnode\b/.test(command));
  assert.deepEqual(nodeCommands, [
    'node --test scripts/check-closed-names.node-test.mjs',
    'node scripts/check-closed-names.mjs "$BASE_SHA" "$HEAD_SHA"',
  ]);
  // The working tree is still the base when the checker runs.
  assert.ok(commands.includes('test "$(git rev-parse HEAD)" = "$BASE_SHA"'), 'asserts the checkout is the base');
  for (const step of runs.filter((s) => s.run.includes('BASE_SHA'))) {
    assert.ok(BASE_REFS.has(step.env.BASE_SHA), `BASE_SHA is the base, got ${step.env.BASE_SHA}`);
    assert.equal(step.env.BASE_SHA, checkout.with.ref, 'BASE_SHA is the checked-out commit');
  }
});

test('the workflow reader names the judging side, and refuses a trigger or ref it does not recognise', () => {
  const minimal = (trigger, ref) =>
    [
      'on:', `  ${trigger}:`, 'permissions:', '  contents: read', 'jobs:', '  j:', '    steps:',
      `      - uses: actions/checkout@${'0'.repeat(40)} # v4`, '        with:', `          ref: ${ref}`, '',
    ].join('\n');
  assert.equal(judgedBy(readWorkflow(minimal('pull_request', '${{ github.sha }}'))), 'head');
  assert.equal(judgedBy(readWorkflow(minimal('pull_request_target', '${{ github.sha }}'))), 'base');
  assert.equal(judgedBy(readWorkflow(minimal('pull_request_target', '${{ github.event.pull_request.base.sha }}'))), 'base');
  assert.equal(judgedBy(readWorkflow(minimal('pull_request_target', '${{ github.event.pull_request.head.sha }}'))), 'head');
  assert.throws(() => judgedBy(readWorkflow(minimal('push', '${{ github.sha }}'))), /unrecognised triggers/);
  assert.throws(() => judgedBy(readWorkflow(minimal('pull_request_target', 'refs/heads/main'))), /unrecognised checkout ref/);
});
