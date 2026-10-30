#!/usr/bin/env node
// scripts/release-version.mjs dist-tag <version>
// scripts/release-version.mjs check-dist-tag <version> <dist-tag>
// scripts/release-version.mjs check-prerelease-commit <version> <commit> [<main-ref>]
//
// The one grammar for a release version, and the npm dist-tag it publishes under. A release is a
// final version X.Y.Z or a release candidate X.Y.Z-rc.N (N >= 1); nothing else. A release
// candidate publishes under `next` and a final version under `latest`, derived from the version
// alone: publish-npm.yml takes no tag input, it calls `dist-tag` for the tag and `check-dist-tag`
// right before `npm publish`, which refuses a release candidate bound for `latest` and a final
// version bound for `next`. scripts/bump-release-version.mjs shares the grammar; scripts/release.sh
// carries the same pattern in bash.
//
// `check-prerelease-commit` is the one rule for which commit may be released as a release
// candidate (checkPrereleaseCommit below). A final version is released only from a commit on
// origin/main. A release candidate is tagged from a branch release/X.Y.Z-rc.N that is never merged,
// so main never carries an rc version, and its commit is accepted only when it is exactly the bump
// on a main commit. scripts/release.sh runs it at preflight; publish-npm.yml runs it in place of
// its ancestry check, from origin/main's copy of this file, so a release commit cannot bring its
// own rule. That is why this file imports nothing but node builtins: it must run on its own.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RELEASE_VERSION = /^\d+\.\d+\.\d+(?:-rc\.[1-9]\d*)?$/;

export function parseReleaseVersion(version) {
  if (typeof version !== 'string' || !RELEASE_VERSION.test(version)) {
    throw new Error(`version must be X.Y.Z or X.Y.Z-rc.N (N >= 1), with no leading v; got ${version}`);
  }
  return version;
}

export const isPrerelease = (version) => parseReleaseVersion(version).includes('-');

export const npmDistTag = (version) => (isPrerelease(version) ? 'next' : 'latest');

export function checkDistTag(version, distTag) {
  const expected = npmDistTag(version);
  if (distTag !== expected) {
    const kind = expected === 'next' ? 'a prerelease' : 'a final version';
    throw new Error(`${version} is ${kind} and must publish under ${expected}, not ${distTag}`);
  }
}

function runGit(cwd, args, env = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  if (result.error) throw new Error(`could not run git ${args[0]}: ${result.error.message}`);
  return result;
}

function gitOutput(cwd, args, env) {
  const result = runGit(cwd, args, env);
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim() || `exit ${result.status}`}`);
  return result.stdout;
}

// A failed read is a refusal, never an empty answer read as a commit.
function resolveCommit(cwd, ref) {
  const result = runGit(cwd, ['rev-parse', '--verify', '-q', `${ref}^{commit}`]);
  const sha = result.stdout.trim();
  if (result.status !== 0 || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(sha)) throw new Error(`${ref} is not a commit`);
  return sha;
}

const changedPaths = (cwd, from, to) =>
  gitOutput(cwd, ['diff-tree', '-r', '--no-renames', '--name-only', '-z', from, to]).split('\0').filter(Boolean);

// The tree scripts/bump-release-version.mjs <version> writes when run, as it is at <parent>, on
// <parent>'s tree: a scratch checkout of <parent> through a scratch index, so no ref, worktree or
// index of the repository changes. Returns the tree's id.
function reproduceBump(cwd, parent, version) {
  // The real path: the bump runs its main only when argv[1] is its own module path, so through a
  // symlinked temp directory (macOS /tmp, /var) it would exit 0 having written nothing.
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'cejel-prerelease-rule-')));
  try {
    const tree = join(scratch, 'tree');
    mkdirSync(tree);
    const env = {
      GIT_DIR: gitOutput(cwd, ['rev-parse', '--absolute-git-dir']).trim(),
      GIT_WORK_TREE: tree,
      GIT_INDEX_FILE: join(scratch, 'index'),
    };
    gitOutput(tree, ['read-tree', parent], env);
    gitOutput(tree, ['checkout-index', '--all'], env);
    const bump = spawnSync(process.execPath, [join(tree, 'scripts/bump-release-version.mjs'), version, '--root', tree], {
      cwd: tree,
      encoding: 'utf8',
    });
    if (bump.error || bump.status !== 0) {
      throw new Error(`scripts/bump-release-version.mjs ${version} refused on ${parent}'s tree: ${(bump.stderr || bump.error?.message || '').trim()}`);
    }
    gitOutput(tree, ['add', '--all'], env);
    return gitOutput(tree, ['write-tree'], env).trim();
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// May <commit> be released as the release candidate <version>? Only when all of these hold:
//   1. <version> is X.Y.Z-rc.N; a final version is refused (it is released only from main);
//   2. <commit> has exactly one parent, and that parent is <mainRef> or an ancestor of it;
//   3. scripts/bump-release-version.mjs <version>, as it is at the parent and run on the parent's
//      tree, reproduces <commit>'s tree byte for byte (contents, modes, paths), so
//   4. <commit> changes no file the bump does not write. The bump's own edits are the only
//      allowance; there is no second list. Every difference is refused by file name.
// Returns { commit, parent, files } (files: what the bump writes); throws with the reason otherwise.
export function checkPrereleaseCommit({ version, commit, mainRef = 'origin/main', cwd = process.cwd() }) {
  if (!isPrerelease(version)) {
    throw new Error(`${version} is a final version: it is released only from a commit on ${mainRef}, never from a release branch`);
  }
  const sha = resolveCommit(cwd, commit);
  const main = resolveCommit(cwd, mainRef);
  const parents = gitOutput(cwd, ['rev-list', '--parents', '-n', '1', sha]).trim().split(' ').slice(1);
  if (parents.length !== 1) {
    throw new Error(`${sha} has ${parents.length} parents; a release candidate is exactly one commit, the bump, on a commit of ${mainRef}`);
  }
  const [parent] = parents;
  const onMain = runGit(cwd, ['merge-base', '--is-ancestor', parent, main]);
  if (onMain.status === 1) {
    throw new Error(`${sha}'s parent ${parent} is not on ${mainRef} (${main} or an ancestor of it); a release candidate is exactly one bump commit on main`);
  }
  if (onMain.status !== 0) throw new Error(`could not read whether ${parent} is on ${mainRef}: ${onMain.stderr.trim()}`);

  const reproduced = reproduceBump(cwd, parent, version);
  const files = changedPaths(cwd, parent, reproduced);
  // A bump always writes (a no-op move refuses), so an empty reproduction is a failed run, not a match.
  if (files.length === 0) throw new Error(`scripts/bump-release-version.mjs ${version} wrote nothing on ${parent}'s tree; refusing`);
  if (reproduced !== gitOutput(cwd, ['rev-parse', `${sha}^{tree}`]).trim()) {
    const bumped = new Set(files);
    const changed = new Set(changedPaths(cwd, parent, sha));
    const problems = changedPaths(cwd, reproduced, sha).map((path) => {
      if (!bumped.has(path)) return `${path}: the commit changes it and the bump does not`;
      if (!changed.has(path)) return `${path}: the bump changes it and the commit does not`;
      return `${path}: not byte for byte what the bump writes`;
    });
    throw new Error(
      `${sha} is not the bump to ${version} on ${parent} (scripts/bump-release-version.mjs ${version} run on the parent's tree):\n  ${problems.join('\n  ')}`,
    );
  }
  return { commit: sha, parent, files };
}

const USAGE =
  'usage: release-version.mjs dist-tag <version> | check-dist-tag <version> <dist-tag> | check-prerelease-commit <version> <commit> [<main-ref>]';

function main([command, ...args]) {
  if (command === 'dist-tag' && args.length === 1) {
    process.stdout.write(`${npmDistTag(args[0])}\n`);
  } else if (command === 'check-dist-tag' && args.length === 2) {
    const [version, distTag] = args;
    checkDistTag(version, distTag);
    process.stdout.write(`${version} publishes under ${distTag}\n`);
  } else if (command === 'check-prerelease-commit' && (args.length === 2 || args.length === 3)) {
    const [version, ref, mainRef = 'origin/main'] = args;
    const { commit, parent, files } = checkPrereleaseCommit({ version, commit: ref, mainRef });
    process.stdout.write(
      `${commit} may be released as ${version}: one commit on ${parent} (on ${mainRef}), which scripts/bump-release-version.mjs ${version} reproduces byte for byte (${files.join(', ')})\n`,
    );
  } else {
    throw new Error(USAGE);
  }
}

// Through its real path: publish-npm.yml runs a copy from a temp directory, and where that directory
// is a symlink (macOS /var, /tmp) a plain comparison would skip main and exit 0 with no verdict.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
