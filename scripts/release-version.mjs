#!/usr/bin/env node
// scripts/release-version.mjs dist-tag <version>
// scripts/release-version.mjs check-dist-tag <version> <dist-tag>
//
// The one grammar for a release version, and the npm dist-tag it publishes under. A release is a
// final version X.Y.Z or a release candidate X.Y.Z-rc.N (N >= 1); nothing else. A release
// candidate publishes under `next` and a final version under `latest`, derived from the version
// alone: publish-npm.yml takes no tag input, it calls `dist-tag` for the tag and `check-dist-tag`
// right before `npm publish`, which refuses a release candidate bound for `latest` and a final
// version bound for `next`. scripts/bump-release-version.mjs shares the grammar; scripts/release.sh
// carries the same pattern in bash.

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

function main([command, version, distTag, ...rest]) {
  if (command === 'dist-tag' && distTag === undefined) {
    process.stdout.write(`${npmDistTag(version)}\n`);
  } else if (command === 'check-dist-tag' && distTag !== undefined && rest.length === 0) {
    checkDistTag(version, distTag);
    process.stdout.write(`${version} publishes under ${distTag}\n`);
  } else {
    throw new Error('usage: release-version.mjs dist-tag <version> | check-dist-tag <version> <dist-tag>');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
