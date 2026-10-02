import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { extractTokens, isCejelCitation, main, sentenceSpans } from './check-cited-commits.mjs';

const GIT_CONFIG = [
  '-c', 'user.name=fixture',
  '-c', 'user.email=fixture@example.invalid',
  '-c', 'commit.gpgsign=false',
  '-c', 'tag.gpgsign=false',
  '-c', 'init.defaultBranch=main',
];

function git(cwd, ...args) {
  return execFileSync('git', [...GIT_CONFIG, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function write(cwd, path, content) {
  mkdirSync(dirname(join(cwd, path)), { recursive: true });
  writeFileSync(join(cwd, path), content);
}

function commitAll(cwd, message) {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

function run(cwd, argv = ['--main-ref', 'main']) {
  const out = [];
  const err = [];
  const code = main(argv, cwd, { write: (s) => out.push(s) }, { write: (s) => err.push(s) });
  return { code, stdout: out.join(''), stderr: err.join('') };
}

/**
 * A repository where an experiment's preregistration commit is squash-merged away: the
 * result cites the preregistration commit, the branch is squashed onto main and deleted.
 */
function squashedPreregistrationRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'cited-commits-'));
  git(cwd, 'init', '-q');
  write(cwd, 'README.md', 'fixture\n');
  commitAll(cwd, 'base');
  git(cwd, 'checkout', '-q', '-b', 'experiment');
  write(cwd, 'docs/experiments/x/PREREGISTRATION.md', 'Expected values, before the run.\n');
  const prereg = commitAll(cwd, 'preregister');
  const short = prereg.slice(0, 7);
  write(cwd, 'docs/experiments/x/result.md', `The preregistration was committed as \`${short}\` before the run.\n`);
  commitAll(cwd, 'result');
  git(cwd, 'checkout', '-q', 'main');
  git(cwd, 'merge', '-q', '--squash', 'experiment');
  git(cwd, 'commit', '-q', '-m', 'experiment (squash)');
  git(cwd, 'branch', '-q', '-D', 'experiment');
  return { cwd, prereg, short };
}

test('a squash-merged preregistration fails the check, and an evidence/* tag makes it pass', (t) => {
  const { cwd, prereg, short } = squashedPreregistrationRepo();
  t.after(() => rmSync(cwd, { recursive: true, force: true }));

  const before = run(cwd);
  assert.equal(before.code, 1);
  assert.match(before.stderr, new RegExp(`FAIL docs/experiments/x/result\\.md:1 ${short} -- commit in this repository, reachable from neither main nor an evidence/\\* tag`));

  git(cwd, 'tag', 'evidence/x-preregistration', prereg);
  const after = run(cwd);
  assert.equal(after.code, 0, after.stderr);
  assert.equal(after.stderr, '');
});

test('a commit merged with --merge stays reachable from main and passes', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'cited-commits-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '-q');
  write(cwd, 'README.md', 'fixture\n');
  commitAll(cwd, 'base');
  git(cwd, 'checkout', '-q', '-b', 'experiment');
  write(cwd, 'docs/experiments/x/PREREGISTRATION.md', 'Expected values.\n');
  const prereg = commitAll(cwd, 'preregister');
  write(cwd, 'docs/experiments/x/result.md', `Preregistration commit \`${prereg.slice(0, 7)}\`.\n`);
  commitAll(cwd, 'result');

  // Before merging, pull-request mode reports the citation as pending rather than failing.
  const pending = run(cwd, ['--main-ref', 'main', '--pending-ref', 'HEAD']);
  assert.equal(pending.code, 0, pending.stderr);
  assert.match(pending.stdout, /PENDING docs\/experiments\/x\/result\.md:1 .* merge with --merge, never squash/);

  git(cwd, 'checkout', '-q', 'main');
  git(cwd, 'merge', '-q', '--no-ff', '-m', 'merge experiment', 'experiment');
  const merged = run(cwd);
  assert.equal(merged.code, 0, merged.stderr);
});

test('a 40-hex blob id is ignored', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'cited-commits-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '-q');
  write(cwd, 'leaderboard/corpus.json', '{}\n');
  commitAll(cwd, 'base');
  const blob = git(cwd, 'rev-parse', 'HEAD:leaderboard/corpus.json');
  assert.equal(blob.length, 40);
  write(cwd, 'docs/experiments/x/preregistration.md', `Frozen at commit time: corpus blob \`${blob}\`.\n`);
  commitAll(cwd, 'cite a blob');
  const result = run(cwd);
  assert.equal(result.code, 0, result.stderr);
});

test('an alfred commit cited as "alfred `abc1234`" is not flagged; the same token cited bare is', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'cited-commits-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '-q');
  write(cwd, 'docs/experiments/x/result.md', 'The harness was frozen at alfred commit `abc1234` before the run.\n');
  commitAll(cwd, 'cite alfred');
  assert.equal(run(cwd).code, 0);

  write(cwd, 'docs/experiments/x/result.md', 'The harness was frozen at commit `abc1234` before the run.\n');
  commitAll(cwd, 'cite bare');
  const bare = run(cwd);
  assert.equal(bare.code, 1);
  assert.match(bare.stderr, /FAIL docs\/experiments\/x\/result\.md:1 abc1234 -- cited as a cejel commit but resolves to nothing/);
});

test('leaderboard/RUBRIC_CHANGELOG.md is scanned; files outside the scope are not', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'cited-commits-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '-q');
  write(cwd, 'docs/other.md', 'Merged in commit `abc1234`.\n');
  commitAll(cwd, 'out of scope');
  assert.equal(run(cwd).code, 0);
  write(cwd, 'leaderboard/RUBRIC_CHANGELOG.md', 'Merged in commit `abc1234`.\n');
  commitAll(cwd, 'in scope');
  assert.equal(run(cwd).code, 1);
});

function citation(text, file = 'docs/experiments/x.md') {
  const spans = sentenceSpans(text);
  const [occurrence] = extractTokens(text);
  return isCejelCitation(file, text, occurrence, spans);
}

test('grammar: a commit label without another repository makes a citation', () => {
  assert.equal(citation('The fixture-only commit `282468d` fixed the case.'), true);
  assert.equal(citation('Preregistration 1 covered the first candidate tree (`a34da1a`); both PRs took review-fix commits.'), true);
  assert.equal(citation('| Preregistration commit | `0f80959` |'), true);
});

test('grammar: another repository named in the sentence or the one before it excludes the token', () => {
  assert.equal(citation('Alfred merge `47811f767366550ba97d04e8c9bec3fd586b292c` landed.'), false);
  assert.equal(citation('| Private result commit | `30a2e067bf9857b113460fbac3ead53699d27208` |'), false);
  assert.equal(citation('Pushed as `BargLabs/alfred@2872dfe11eb35101a8305cbd623a90cf21a67fd5`, a commit.'), false);
  assert.equal(citation('The harness is in alfred. Its result commit is `a506a5e`.'), false);
  assert.equal(citation('Merged as `BargLabs/cejel@a506a5e`.'), true);
});

test('grammar: digests, patch ids, decimal runs, labels inside code spans and JSON are not citations', () => {
  assert.equal(citation('The corpus committed with sha256 `dc723f53…` was reused.'), false);
  assert.equal(citation('The commit has stable patch ID `ef784f23c031e3f2d080312956429bf9546bce85`.'), false);
  assert.equal(citation('The merge took 1234567 seconds.'), false);
  assert.equal(citation('| `docs/preregistration.md` | `755c84b6d04a708dbd3827bb2bc6ff8700a3cfe0` |'), false);
  assert.equal(citation('{"preregistrationCommit": "abc1234"}', 'docs/experiments/x.json'), false);
});
