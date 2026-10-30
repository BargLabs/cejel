#!/usr/bin/env node
// scripts/bump-release-version.mjs <version> [--root <dir>]
//
// Moves the structured release-identity fields from package.json's current version to <version>
// in one step: package.json, server.json (version and OCI identifier), published-versions.json,
// the Dockerfile VERSION arg, and the Claude plugin's plugin.json version and .mcp.json npx pin.
// This is step 1 of the checklist in docs/release-process.md ("Required ordering"); the release
// driver (scripts/release.sh) never edits files and refuses at preflight if any field disagrees.
//
// Every edit is a single exact-text replacement that must match exactly once; if any file does
// not, nothing is written. For a final version, prose that names the version (README release
// statements, the GitLab include, the report pin in src/__tests__/index.test.ts) stays a reviewed
// manual edit and is listed at the end. Run `pnpm run validate:distribution` afterwards.
//
// <version> is X.Y.Z or a release candidate X.Y.Z-rc.N (N >= 1), the grammar in
// scripts/release-version.mjs. A release candidate moves every field below exactly as a final
// version does: each is a semver string or an OCI tag, and both hold X.Y.Z-rc.N, so no field
// needs a refusal of its own.
//
// A release candidate is tagged from a branch release/X.Y.Z-rc.N whose one commit must be exactly
// this script's output on a main commit (check-prerelease-commit in scripts/release-version.mjs),
// so it can carry no hand edit. For a release candidate the script therefore also makes the edits
// its gates need (PRERELEASE_EDITS): the CHANGELOG heading release.sh's preflight requires and the
// GitLab include `pnpm test` pins to package.json's version. The CHANGELOG heading has no date, so
// the publish gate can reproduce the commit on any later day. The README is not edited: a release
// candidate publishes no image or binary, so its README keeps naming the newest final release, and
// validate:distribution relaxes its two README OCI-version checks for a prerelease by name.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PLUGIN_MANIFEST_PATH, PLUGIN_MCP_CONFIG_PATH } from './claude-plugin-versions.mjs';
import { isPrerelease, RELEASE_VERSION } from './release-version.mjs';

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** [path, pattern builder] pairs; each builder returns the old text and its replacement. */
const EDITS = [
  ['package.json', (from, to) => [`\n  "version": "${from}",\n`, `\n  "version": "${to}",\n`]],
  ['server.json', (from, to) => [`\n  "version": "${from}",\n`, `\n  "version": "${to}",\n`]],
  ['server.json', (from, to) => [`"identifier": "ghcr.io/barglabs/cejel:${from}"`, `"identifier": "ghcr.io/barglabs/cejel:${to}"`]],
  ['published-versions.json', (from, to) => [`"mcpRegistry": "${from}"`, `"mcpRegistry": "${to}"`]],
  ['published-versions.json', (from, to) => [`"oci": "${from}"`, `"oci": "${to}"`]],
  ['Dockerfile', (from, to) => [`\nARG VERSION=${from}\n`, `\nARG VERSION=${to}\n`]],
  [PLUGIN_MANIFEST_PATH, (from, to) => [`\n  "version": "${from}",\n`, `\n  "version": "${to}",\n`]],
  [PLUGIN_MCP_CONFIG_PATH, (from, to) => [`"@cejel/cejel@${from}"`, `"@cejel/cejel@${to}"`]],
];

/** A release candidate's further edits, made after EDITS and in the same all-or-nothing step. */
const PRERELEASE_EDITS = [
  ['CHANGELOG.md', (from, to) => ['\n## [Unreleased]\n', `\n## [Unreleased]\n\n## [${to}]\n`]],
  ['ci/gitlab/cejel.gitlab-ci.yml', (from, to) => [`/BargLabs/cejel/v${from}/ci/gitlab/`, `/BargLabs/cejel/v${to}/ci/gitlab/`]],
  ['ci/gitlab/cejel.gitlab-ci.yml', (from, to) => [`CEJEL_VERSION: "${from}"`, `CEJEL_VERSION: "${to}"`]],
  ['docs/gitlab-ci.md', (from, to) => [`/BargLabs/cejel/v${from}/ci/gitlab/`, `/BargLabs/cejel/v${to}/ci/gitlab/`]],
  ['docs/gitlab-ci.md', (from, to) => [`default: '${from}'`, `default: '${to}'`]],
];

export const PRERELEASE_FILES = [...new Set(PRERELEASE_EDITS.map(([path]) => path))];

export const MANUAL_FOLLOW_UPS = [
  'README.md release statements (SmartScreen, distribution note, Docker and openclaw examples)',
  'ci/gitlab/cejel.gitlab-ci.yml and docs/gitlab-ci.md (include tag and CEJEL_VERSION)',
  'src/__tests__/index.test.ts cross-path report pin (moves with toolVersion)',
  'CHANGELOG.md: move [Unreleased] to the new version heading',
];

export function bumpReleaseVersion({ root, to }) {
  if (!RELEASE_VERSION.test(to ?? '')) {
    throw new Error(`version must be MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-rc.N (N >= 1); got ${to}`);
  }
  const from = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  if (from === to) throw new Error(`package.json is already at ${to}; nothing to move`);

  const contents = new Map();
  const problems = [];
  for (const [path, build] of isPrerelease(to) ? [...EDITS, ...PRERELEASE_EDITS] : EDITS) {
    const text = contents.get(path) ?? readFileSync(join(root, path), 'utf8');
    const [oldText, newText] = build(from, to);
    const count = (text.match(new RegExp(escape(oldText), 'g')) ?? []).length;
    if (count !== 1) {
      problems.push(`${path}: expected exactly one ${JSON.stringify(oldText.trim())}, found ${count}`);
      contents.set(path, text);
      continue;
    }
    contents.set(path, text.replace(oldText, newText));
  }
  if (problems.length > 0) {
    throw new Error(`refusing to move ${from} -> ${to}; nothing was written:\n  ${problems.join('\n  ')}`);
  }
  for (const [path, text] of contents) writeFileSync(join(root, path), text);
  return { from, to, files: [...contents.keys()] };
}

function main(argv) {
  let root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  let to;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root') root = resolve(argv[++index] ?? '');
    else if (!to) to = argv[index];
    else throw new Error(`unexpected argument: ${argv[index]}`);
  }
  const { from, files } = bumpReleaseVersion({ root, to });
  process.stdout.write(`moved ${from} -> ${to} in: ${files.join(', ')}\n`);
  if (isPrerelease(to)) {
    process.stdout.write(
      `a release candidate has nothing to edit by hand (docs/release-process.md, "Prerelease"); run pnpm run validate:distribution, then commit exactly these files on release/${to}:\n` +
        `  git commit -m "release ${to}" -- ${files.join(' ')}\n`,
    );
    return;
  }
  process.stdout.write(`still manual, then run pnpm run validate:distribution:\n  - ${MANUAL_FOLLOW_UPS.join('\n  - ')}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
