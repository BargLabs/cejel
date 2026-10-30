import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkDistTag, checkPrereleaseCommit, isPrerelease, npmDistTag, parseReleaseVersion } from './release-version.mjs';

const CLI = fileURLToPath(new URL('./release-version.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('..', import.meta.url));

function cli(...args) {
  return cliIn(undefined, ...args);
}

function cliIn(cwd, ...args) {
  try {
    return { code: 0, stdout: execFileSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', stdio: 'pipe' }) };
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

// ------------------------------------------------------------ a release candidate's commit
// A scratch repository holding real copies of the files the bump reads and writes, the bump script
// and this rule, with a bare `origin` whose main is the first commit. Nothing here touches the
// network or this repository's refs.
const SCRATCH_FILES = [
  'scripts/release-version.mjs',
  'scripts/bump-release-version.mjs',
  'scripts/claude-plugin-versions.mjs',
  'package.json',
  'server.json',
  'published-versions.json',
  'Dockerfile',
  'plugins/cejel/.claude-plugin/plugin.json',
  'plugins/cejel/.mcp.json',
  'CHANGELOG.md',
  'ci/gitlab/cejel.gitlab-ci.yml',
  'docs/gitlab-ci.md',
  'README.md',
];
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'release test',
  GIT_AUTHOR_EMAIL: 'release-test@example.invalid',
  GIT_COMMITTER_NAME: 'release test',
  GIT_COMMITTER_EMAIL: 'release-test@example.invalid',
};
const RC = '0.7.0-rc.1';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' }).trim();

function scratchRepo() {
  const base = mkdtempSync(join(tmpdir(), 'cejel-rc-rule-'));
  const origin = join(base, 'origin.git');
  const work = join(base, 'work');
  git(base, 'init', '-q', '--bare', '--initial-branch=main', origin);
  mkdirSync(work);
  git(work, 'init', '-q', '--initial-branch=main');
  for (const path of SCRATCH_FILES) {
    mkdirSync(dirname(join(work, path)), { recursive: true });
    cpSync(join(REPO, path), join(work, path));
  }
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'main');
  git(work, 'remote', 'add', 'origin', origin);
  git(work, 'push', '-q', 'origin', 'main');
  git(work, 'fetch', '-q', 'origin');
  git(work, 'switch', '-q', '-c', `release/${RC}`, 'origin/main');
  return { work, main: git(work, 'rev-parse', 'HEAD') };
}

const commitAll = (work, message) => {
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', message);
  return git(work, 'rev-parse', 'HEAD');
};

// The operator's bump commit: the bump script, then `edit` (a hand edit the rule must see), then commit.
function bumpCommit(work, version = RC, edit = () => {}) {
  execFileSync(process.execPath, ['scripts/bump-release-version.mjs', version], { cwd: work, stdio: 'pipe' });
  edit(work);
  return commitAll(work, `release ${version}`);
}

const check = (work, commit, version = RC) => checkPrereleaseCommit({ version, commit, mainRef: 'origin/main', cwd: work });

test('the rule accepts a release candidate that is one reproduced bump commit on main', () => {
  const { work, main } = scratchRepo();
  const commit = bumpCommit(work);
  const result = check(work, commit);
  assert.equal(result.commit, commit);
  assert.equal(result.parent, main);
  for (const path of ['package.json', 'CHANGELOG.md', 'ci/gitlab/cejel.gitlab-ci.yml']) {
    assert.ok(result.files.includes(path), `${path} is among the bumped files: ${result.files}`);
  }
  assert.ok(!result.files.includes('README.md'), 'a release candidate leaves README.md alone');
});

test('the rule still accepts it after main moves on: the parent need only be an ancestor of main', () => {
  const { work } = scratchRepo();
  const commit = bumpCommit(work);
  git(work, 'switch', '-q', '-c', 'later', 'origin/main');
  appendFileSync(join(work, 'README.md'), '\nlater\n');
  commitAll(work, 'later');
  git(work, 'push', '-q', 'origin', 'later:main');
  git(work, 'fetch', '-q', 'origin');
  assert.equal(check(work, commit).commit, commit);
});

test('the rule refuses a commit that changes a file the bump does not write, naming it', () => {
  const { work } = scratchRepo();
  const commit = bumpCommit(work, RC, (root) => appendFileSync(join(root, 'README.md'), '\nunreviewed\n'));
  assert.throws(() => check(work, commit), /README\.md: the commit changes it and the bump does not/);
});

test('the rule refuses a one-byte change to a bumped file, naming it', () => {
  const { work } = scratchRepo();
  const commit = bumpCommit(work, RC, (root) => {
    const path = join(root, 'server.json');
    writeFileSync(path, readFileSync(path, 'utf8').replace(`"version": "${RC}"`, `"version": "${RC} "`));
  });
  assert.throws(() => check(work, commit), /server\.json: not byte for byte what the bump writes/);
});

test("the rule refuses a commit that leaves out one of the bump's changes, naming the file", () => {
  const { work, main } = scratchRepo();
  const commit = bumpCommit(work, RC, (root) => git(root, 'checkout', main, '--', 'CHANGELOG.md'));
  assert.throws(() => check(work, commit), /CHANGELOG\.md: the bump changes it and the commit does not/);
});

test("the rule refuses two commits: the bump's parent is then not on main", () => {
  const { work } = scratchRepo();
  appendFileSync(join(work, 'README.md'), '\nfirst of two\n');
  commitAll(work, 'first of two');
  const commit = bumpCommit(work);
  assert.throws(() => check(work, commit), /is not on origin\/main/);
});

test('the rule refuses a merge commit', () => {
  const { work } = scratchRepo();
  git(work, 'switch', '-q', '-c', 'side', 'origin/main');
  appendFileSync(join(work, 'README.md'), '\nside\n');
  commitAll(work, 'side');
  git(work, 'switch', '-q', `release/${RC}`);
  bumpCommit(work);
  git(work, 'merge', '-q', '--no-ff', '--no-edit', 'side');
  assert.throws(() => check(work, git(work, 'rev-parse', 'HEAD')), /has 2 parents; a release candidate is exactly one commit/);
});

test('the rule refuses a commit whose parent is on another branch, not on main', () => {
  const { work } = scratchRepo();
  git(work, 'switch', '-q', '-c', 'elsewhere', 'origin/main');
  appendFileSync(join(work, 'README.md'), '\nelsewhere\n');
  const elsewhere = commitAll(work, 'elsewhere');
  git(work, 'push', '-q', 'origin', 'elsewhere');
  const commit = bumpCommit(work);
  assert.throws(() => check(work, commit), new RegExp(`parent ${elsewhere} is not on origin/main`));
});

test('the rule refuses a final version: a final version is released from main, never from a release branch', () => {
  const { work } = scratchRepo();
  const commit = bumpCommit(work, '0.7.0');
  assert.throws(() => check(work, commit, '0.7.0'), /0\.7\.0 is a final version/);
});

test('the rule refuses a version that is not the grammar, and a ref that is not a commit', () => {
  const { work } = scratchRepo();
  const commit = bumpCommit(work);
  assert.throws(() => check(work, commit, '0.7.0-beta.1'), /X\.Y\.Z or X\.Y\.Z-rc\.N/);
  assert.throws(() => check(work, 'no-such-ref'), /no-such-ref is not a commit/);
});

test('the rule refuses a bump to another version than the one being released', () => {
  const { work } = scratchRepo();
  const commit = bumpCommit(work, '0.7.0-rc.2');
  assert.throws(() => check(work, commit), /not byte for byte what the bump writes/);
});

test("the command line prints the accepted commit and refuses with the rule's message and exit 1", () => {
  const { work } = scratchRepo();
  const good = bumpCommit(work);
  const ok = cliIn(work, 'check-prerelease-commit', RC, good, 'origin/main');
  assert.equal(ok.code, 0, ok.stderr);
  assert.match(ok.stdout, new RegExp(`${good} may be released as ${RC.replaceAll('.', '\\.')}`));
  git(work, 'reset', '-q', '--hard', 'HEAD~1');
  const bad = bumpCommit(work, RC, (root) => appendFileSync(join(root, 'README.md'), '\nunreviewed\n'));
  const refused = cliIn(work, 'check-prerelease-commit', RC, bad, 'origin/main');
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /README\.md: the commit changes it and the bump does not/);
  assert.equal(cliIn(work, 'check-prerelease-commit', RC).code, 1);
});

// ------------------------------------------------------------ the publish gate (publish-npm.yml)
// The main-ancestry part of the "Require an exact, dispatched, unpublished release tag" step, run as
// written in the workflow: from its `git fetch` of origin/main to the `esac`, at the fetch's
// indentation, that closes the choice between a final version and a release candidate.
function mainAncestryGate() {
  const lines = readFileSync(join(REPO, '.github/workflows/publish-npm.yml'), 'utf8').split('\n');
  const start = lines.findIndex((line) => line.trim() === 'git fetch --quiet origin main:refs/remotes/origin/main');
  const indent = start >= 0 ? lines[start].slice(0, lines[start].length - lines[start].trimStart().length) : '';
  const end = lines.findIndex((line, index) => index > start && line === `${indent}esac`);
  assert.ok(start >= 0 && end > start, 'publish-npm.yml chooses the release-commit rule by version, between the origin/main fetch and an esac');
  return lines.slice(start, end + 1).join('\n');
}

function runGate(work, version, sha) {
  return spawnSync('bash', ['-e', '-c', mainAncestryGate()], {
    cwd: work,
    encoding: 'utf8',
    env: { ...GIT_ENV, package_version: version, GITHUB_SHA: sha, RELEASE_TAG: `v${version}` },
  });
}

test('the gate accepts a release-candidate tag off main when the rule holds', () => {
  const { work } = scratchRepo();
  const result = runGate(work, RC, bumpCommit(work));
  assert.equal(result.status, 0, result.stderr);
});

test("the gate refuses a release-candidate tag off main when the rule fails, with the rule's message", () => {
  const { work } = scratchRepo();
  const commit = bumpCommit(work, RC, (root) => appendFileSync(join(root, 'README.md'), '\nunreviewed\n'));
  const result = runGate(work, RC, commit);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /README\.md: the commit changes it and the bump does not/);
});

test('the gate runs the rule as it is on origin/main, so a release commit cannot bring its own rule', () => {
  const { work } = scratchRepo();
  const commit = bumpCommit(work, RC, (root) => writeFileSync(join(root, 'scripts/release-version.mjs'), 'process.exit(0);\n'));
  const result = runGate(work, RC, commit);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /scripts\/release-version\.mjs: the commit changes it and the bump does not/);
});

test('the gate refuses when the rule exits 0 without its verdict line', () => {
  const { work } = scratchRepo();
  git(work, 'switch', '-q', 'main');
  // The real module with its command-line entry removed: every export intact, so the bump still
  // runs, but run as a command it exits 0 and prints nothing.
  const silent = readFileSync(CLI, 'utf8').replace(/\n(?:\/\/[^\n]*\n)*if \(process\.argv\[1\][\s\S]*$/, '\n');
  assert.ok(!silent.includes('main(process.argv'), 'the command-line entry was removed');
  writeFileSync(join(work, 'scripts/release-version.mjs'), silent);
  commitAll(work, 'a rule that says nothing');
  git(work, 'push', '-q', 'origin', 'main');
  git(work, 'fetch', '-q', 'origin');
  git(work, 'switch', '-q', '-C', `release/${RC}`, 'origin/main');
  const result = runGate(work, RC, bumpCommit(work));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /the prerelease rule gave no verdict for v0\.7\.0-rc\.1/);
});

test('the command line runs through a symlinked directory, as the gate runs a copy from a temp directory', () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'cejel-rule-link-')));
  mkdirSync(join(base, 'real'));
  cpSync(CLI, join(base, 'real', 'release-version.mjs'));
  symlinkSync(join(base, 'real'), join(base, 'link'));
  const out = execFileSync(process.execPath, [join(base, 'link', 'release-version.mjs'), 'dist-tag', '0.7.0-rc.1'], { encoding: 'utf8' });
  assert.equal(out, 'next\n');
});

test('the gate keeps the ancestry check for a final version', () => {
  const { work, main } = scratchRepo();
  assert.equal(runGate(work, '0.6.8', main).status, 0);
  const offMain = bumpCommit(work, '0.7.0');
  const refused = runGate(work, '0.7.0', offMain);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /v0\.7\.0 is not an ancestor of origin\/main/);
});
