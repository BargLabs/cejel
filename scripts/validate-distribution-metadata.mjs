#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const PACKAGE_PATH = new URL('../package.json', import.meta.url);
const SERVER_PATH = new URL('../server.json', import.meta.url);
const DOCKERFILE_PATH = new URL('../Dockerfile', import.meta.url);
const DOCKER_ENTRYPOINT_PATH = new URL('./docker-entrypoint.sh', import.meta.url);
const DISTRIBUTION_WORKFLOW_PATH = new URL(
  '../.github/workflows/publish-distribution.yml',
  import.meta.url,
);
const RELEASE_WORKFLOW_PATH = new URL('../.github/workflows/release-binaries.yml', import.meta.url);
const CLA_WORKFLOW_PATH = new URL('../.github/workflows/cla.yml', import.meta.url);
const CI_WORKFLOW_PATH = new URL('../.github/workflows/ci.yml', import.meta.url);
const LEADERBOARD_PATH = new URL('../leaderboard/leaderboard.html', import.meta.url);
const LEADERBOARD_INDEX_PATH = new URL('../leaderboard/index.html', import.meta.url);
const ACTION_PATH = new URL('../action/action.yml', import.meta.url);

const packageManifest = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));
const serverManifest = JSON.parse(readFileSync(SERVER_PATH, 'utf8'));
const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
const dockerEntrypoint = readFileSync(DOCKER_ENTRYPOINT_PATH, 'utf8');
const distributionWorkflow = readFileSync(DISTRIBUTION_WORKFLOW_PATH, 'utf8');
const releaseWorkflow = readFileSync(RELEASE_WORKFLOW_PATH, 'utf8');
const claWorkflow = readFileSync(CLA_WORKFLOW_PATH, 'utf8');
const ciWorkflow = readFileSync(CI_WORKFLOW_PATH, 'utf8');
const leaderboard = readFileSync(LEADERBOARD_PATH, 'utf8');
const leaderboardIndex = readFileSync(LEADERBOARD_INDEX_PATH, 'utf8');
const action = readFileSync(ACTION_PATH, 'utf8');

function requireEqual(actual, expected, field) {
  if (actual !== expected) {
    throw new Error(`${field} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function requireIncludes(haystack, needle, field) {
  if (!haystack.includes(needle)) {
    throw new Error(`${field} must include ${JSON.stringify(needle)}.`);
  }
}

requireEqual(serverManifest.name, packageManifest.mcpName, 'server.json name/package.json mcpName');
requireEqual(serverManifest.version, packageManifest.version, 'server.json/package.json version');
requireEqual(serverManifest.repository?.url, 'https://github.com/BargLabs/cejel', 'repository URL');
requireEqual(serverManifest.repository?.id, '1291714236', 'repository ID');
requireEqual(serverManifest.icons?.[0]?.src, 'https://cejel.dev/brand-icon.png', 'registry icon');

const ociPackage = serverManifest.packages?.find((entry) => entry.registryType === 'oci');
if (!ociPackage) throw new Error('server.json must declare an OCI package.');
if ('version' in ociPackage) {
  throw new Error('OCI package must encode its version in identifier, not a separate version field.');
}
requireEqual(
  ociPackage.identifier,
  `ghcr.io/barglabs/cejel:${packageManifest.version}`,
  'OCI identifier',
);
requireEqual(ociPackage.transport?.type, 'stdio', 'OCI transport');

requireIncludes(
  dockerfile,
  `ARG VERSION=${packageManifest.version}`,
  'Dockerfile default version',
);
requireIncludes(
  dockerfile,
  `io.modelcontextprotocol.server.name="${packageManifest.mcpName}"`,
  'Dockerfile MCP ownership label',
);
requireIncludes(dockerfile, 'ENTRYPOINT ["cejel-entrypoint"]', 'Dockerfile dispatcher entrypoint');
requireIncludes(dockerEntrypoint, 'exec cejel "$@"', 'Docker entrypoint CLI dispatch');
requireIncludes(dockerEntrypoint, 'exec cejel-mcp "$@"', 'Docker entrypoint MCP default');
requireIncludes(dockerfile, 'node:22-alpine@sha256:', 'Dockerfile pinned base image');
requireIncludes(
  distributionWorkflow,
  'IMAGE_NAME: ghcr.io/barglabs/cejel',
  'distribution workflow image',
);
requireIncludes(
  distributionWorkflow,
  './mcp-publisher login github-oidc',
  'distribution workflow registry authentication',
);
requireIncludes(
  distributionWorkflow,
  'uses: actions/attest@f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6',
  'distribution workflow signed provenance',
);
requireIncludes(
  distributionWorkflow,
  'artifact-metadata: write',
  'distribution workflow artifact metadata permission',
);

const mcpPublishJobStart = distributionWorkflow.indexOf('  publish-mcp-registry:');
if (mcpPublishJobStart < 0) {
  throw new Error('distribution workflow must define the MCP registry publish job.');
}
const mcpPublishJob = distributionWorkflow.slice(mcpPublishJobStart);
requireIncludes(
  mcpPublishJob,
  'ref: ${{ inputs.release_tag }}',
  'MCP registry publish checkout',
);
if (mcpPublishJob.includes('ref: ${{ github.sha }}')) {
  throw new Error('MCP registry publish checkout must not use the dispatch commit.');
}
requireIncludes(
  mcpPublishJob,
  'MCP_PUBLISHER_VERSION: v1.8.0',
  'pinned MCP publisher version',
);
requireIncludes(
  mcpPublishJob,
  'MCP_PUBLISHER_LINUX_AMD64_SHA256: 1370446bbe74d562608e8005a6ccce02d146a661fbd78674e11cc70b9618d6cf',
  'pinned MCP publisher amd64 checksum',
);
requireIncludes(
  mcpPublishJob,
  'MCP_PUBLISHER_LINUX_ARM64_SHA256: c978982c60e1b4903a976de090f04dc4fac4a320daa50704fcad2dbc93433d62',
  'pinned MCP publisher arm64 checksum',
);
if (mcpPublishJob.includes('/releases/latest/')) {
  throw new Error('MCP publisher download must use a pinned release, not releases/latest.');
}

requireEqual(
  leaderboardIndex,
  leaderboard,
  'deployed leaderboard index/leaderboard artifact',
);

requireIncludes(ciWorkflow, 'uses: ./action', 'CI candidate Action smoke');
requireIncludes(ciWorkflow, 'test -s .cejel-action/report.json', 'CI candidate report assertion');
requireIncludes(
  ciWorkflow,
  'test -s .cejel-action/certificate.html',
  'CI candidate certificate assertion',
);
requireIncludes(ciWorkflow, 'path: .cejel-action/', 'CI candidate artifact upload');
requireIncludes(ciWorkflow, 'include-hidden-files: true', 'CI hidden artifact upload');
requireIncludes(ciWorkflow, 'if-no-files-found: error', 'CI missing-artifact failure');

for (const [name, workflow] of [
  ['release workflow', releaseWorkflow],
  ['distribution workflow', distributionWorkflow],
  ['CLA workflow', claWorkflow],
  ['CI workflow', ciWorkflow],
  ['advertised composite action', action],
]) {
  for (const match of workflow.matchAll(/^\s*uses:\s*([^#\s]+)(?:\s+#.*)?$/gm)) {
    const reference = match[1];
    if (!reference || reference.startsWith('./')) continue;
    const separator = reference.lastIndexOf('@');
    const revision = separator >= 0 ? reference.slice(separator + 1) : '';
    if (!/^[0-9a-f]{40}$/.test(revision)) {
      throw new Error(`${name} action dependency is not commit-pinned: ${reference}`);
    }
  }
}

process.stdout.write(
  `Distribution metadata agrees on ${packageManifest.mcpName} v${packageManifest.version}.\n`,
);
