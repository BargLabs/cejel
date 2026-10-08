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
// not, nothing is written. Prose that names the version (README release statements, the GitLab
// include, the report pin in src/__tests__/index.test.ts) stays a reviewed manual edit and is
// listed at the end. Run `pnpm run validate:distribution` afterwards.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PLUGIN_MANIFEST_PATH, PLUGIN_MCP_CONFIG_PATH } from './claude-plugin-versions.mjs';

const SEMVER = /^\d+\.\d+\.\d+$/;

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

export const MANUAL_FOLLOW_UPS = [
  'README.md release statements (SmartScreen, distribution note, Docker and openclaw examples)',
  'ci/gitlab/cejel.gitlab-ci.yml and docs/gitlab-ci.md (include tag and CEJEL_VERSION)',
  'src/__tests__/index.test.ts cross-path report pin (moves with toolVersion)',
  'CHANGELOG.md: move [Unreleased] to the new version heading',
];

export function bumpReleaseVersion({ root, to }) {
  if (!SEMVER.test(to ?? '')) throw new Error(`version must be MAJOR.MINOR.PATCH; got ${to}`);
  const from = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  if (from === to) throw new Error(`package.json is already at ${to}; nothing to move`);

  const contents = new Map();
  const problems = [];
  for (const [path, build] of EDITS) {
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
