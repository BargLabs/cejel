#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const PACKAGE_PATH = new URL('../package.json', import.meta.url);
const PUBLISHED_VERSIONS_PATH = new URL('../published-versions.json', import.meta.url);
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
const ALFRED_REPORT_PATH = new URL('../leaderboard/reports/alfred.json', import.meta.url);
const README_PATH = new URL('../README.md', import.meta.url);
const ROOT_ACTION_PATH = new URL('../action.yml', import.meta.url);
const NESTED_ACTION_PATH = new URL('../action/action.yml', import.meta.url);
const ACTION_RUNNER_PATH = new URL('../action/run.mjs', import.meta.url);
const SEA_BUILD_PATH = new URL('./sea-build-cejel.mjs', import.meta.url);
const BINARY_VERIFY_PATH = new URL('./verify-cejel-binary.mjs', import.meta.url);
const OFFLINE_VERIFY_PATH = new URL('./verify-cejel-binary-offline.mjs', import.meta.url);
const RELEASE_SET_VERIFY_PATH = new URL('./verify-cejel-release-set.mjs', import.meta.url);

const packageManifest = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));
const publishedVersions = JSON.parse(readFileSync(PUBLISHED_VERSIONS_PATH, 'utf8'));
const serverManifest = JSON.parse(readFileSync(SERVER_PATH, 'utf8'));
const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
const dockerEntrypoint = readFileSync(DOCKER_ENTRYPOINT_PATH, 'utf8');
const distributionWorkflow = readFileSync(DISTRIBUTION_WORKFLOW_PATH, 'utf8');
const releaseWorkflow = readFileSync(RELEASE_WORKFLOW_PATH, 'utf8');
const claWorkflow = readFileSync(CLA_WORKFLOW_PATH, 'utf8');
const ciWorkflow = readFileSync(CI_WORKFLOW_PATH, 'utf8');
const leaderboard = readFileSync(LEADERBOARD_PATH, 'utf8');
const leaderboardIndex = readFileSync(LEADERBOARD_INDEX_PATH, 'utf8');
const alfredReport = JSON.parse(readFileSync(ALFRED_REPORT_PATH, 'utf8'));
const readme = readFileSync(README_PATH, 'utf8');
const rootAction = readFileSync(ROOT_ACTION_PATH, 'utf8');
const nestedAction = readFileSync(NESTED_ACTION_PATH, 'utf8');
const actionRunner = readFileSync(ACTION_RUNNER_PATH, 'utf8');
const seaBuild = readFileSync(SEA_BUILD_PATH, 'utf8');
const binaryVerify = readFileSync(BINARY_VERIFY_PATH, 'utf8');
const offlineVerify = readFileSync(OFFLINE_VERIFY_PATH, 'utf8');
const releaseSetVerify = readFileSync(RELEASE_SET_VERIFY_PATH, 'utf8');
const ACTION_USE_PATTERN = /^\s*(?:-\s*)?uses:\s*([^#\s]+)(?:\s+#.*)?$/gm;

function requireEqual(actual, expected, field) {
  if (actual !== expected) {
    throw new Error(
      `${field} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`,
    );
  }
}

function requireIncludes(haystack, needle, field) {
  if (!haystack.includes(needle)) {
    throw new Error(`${field} must include ${JSON.stringify(needle)}.`);
  }
}

requireEqual(serverManifest.name, packageManifest.mcpName, 'server.json name/package.json mcpName');
requireEqual(
  serverManifest.version,
  publishedVersions.mcpRegistry,
  'server.json/published MCP Registry version',
);
requireEqual(serverManifest.repository?.url, 'https://github.com/BargLabs/cejel', 'repository URL');
requireEqual(serverManifest.repository?.id, '1291714236', 'repository ID');
requireEqual(serverManifest.icons?.[0]?.src, 'https://cejel.dev/brand-icon.png', 'registry icon');

const ociPackage = serverManifest.packages?.find((entry) => entry.registryType === 'oci');
if (!ociPackage) throw new Error('server.json must declare an OCI package.');
if ('version' in ociPackage) {
  throw new Error(
    'OCI package must encode its version in identifier, not a separate version field.',
  );
}
requireEqual(
  ociPackage.identifier,
  `ghcr.io/barglabs/cejel:${publishedVersions.oci}`,
  'OCI identifier',
);
requireEqual(ociPackage.transport?.type, 'stdio', 'OCI transport');

requireIncludes(dockerfile, `ARG VERSION=${publishedVersions.oci}`, 'Dockerfile default version');
requireIncludes(
  readme,
  `ghcr.io/barglabs/cejel:${packageManifest.version}`,
  'README release OCI version',
);
if (
  packageManifest.version !== publishedVersions.oci &&
  readme.includes(`ghcr.io/barglabs/cejel:${publishedVersions.oci}`)
) {
  throw new Error(
    `README contains stale OCI pin ghcr.io/barglabs/cejel:${publishedVersions.oci}; expected release version ${packageManifest.version}.`,
  );
}
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
requireIncludes(releaseWorkflow, 'runner: windows-latest', 'Windows release runner');
requireIncludes(
  releaseWorkflow,
  'asset: cejel-Windows-x86_64.exe',
  'Windows release asset',
);
requireIncludes(
  releaseWorkflow,
  'uses: anchore/sbom-action@e22c389904149dbc22b58101806040fa8d37a610',
  'release SBOM generation',
);
requireIncludes(
  releaseWorkflow,
  'Get-AuthenticodeSignature',
  'explicit Windows signing-status assertion',
);
requireIncludes(seaBuild, "win32: 'Windows'", 'Windows SEA platform mapping');
requireIncludes(seaBuild, "node_modules/postject/dist/cli.js", 'cross-platform postject entry');
requireIncludes(seaBuild, 'signtool.exe', 'Windows inherited-signature removal');
requireIncludes(binaryVerify, "execFileSync(binaryPath, ['--version']", 'binary version smoke');
requireIncludes(binaryVerify, "execFileSync(binaryPath, ['--help']", 'binary help smoke');
requireIncludes(
  offlineVerify,
  'New-NetFirewallRule',
  'Windows network-denied binary verification',
);
requireIncludes(
  releaseSetVerify,
  "'cejel-Windows-x86_64.exe'",
  'Windows complete-release guard',
);
requireIncludes(readme, 'Windows signing status:', 'README Windows signing disclosure');
requireIncludes(readme, 'npx @cejel/cejel@latest --version', 'README npx cache guidance');
requireIncludes(readme, '## Install on OpenClaw', 'README OpenClaw installation');
const openClawSectionStart = readme.indexOf('## Install on OpenClaw');
const openClawSectionEnd = readme.indexOf('\n## ', openClawSectionStart + 1);
const openClawSection = readme.slice(
  openClawSectionStart,
  openClawSectionEnd < 0 ? undefined : openClawSectionEnd,
);
requireIncludes(
  openClawSection,
  `ghcr.io/barglabs/cejel:${packageManifest.version}`,
  'README OpenClaw release OCI version',
);
requireIncludes(
  readme,
  'does **not** watch, intercept,',
  'README free-pack runtime-governance boundary',
);

const mcpPublishJobStart = distributionWorkflow.indexOf('  publish-mcp-registry:');
if (mcpPublishJobStart < 0) {
  throw new Error('distribution workflow must define the MCP registry publish job.');
}
const mcpPublishJob = distributionWorkflow.slice(mcpPublishJobStart);
requireIncludes(mcpPublishJob, 'ref: ${{ inputs.release_tag }}', 'MCP registry publish checkout');
if (mcpPublishJob.includes('ref: ${{ github.sha }}')) {
  throw new Error('MCP registry publish checkout must not use the dispatch commit.');
}
requireIncludes(mcpPublishJob, 'MCP_PUBLISHER_VERSION: v1.8.0', 'pinned MCP publisher version');
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

requireEqual(leaderboardIndex, leaderboard, 'deployed leaderboard index/leaderboard artifact');
requireIncludes(
  readme,
  `${alfredReport.overallScore.toFixed(1)}/4.0 on its rubric-native certificate`,
  'README Alfred dogfood score',
);
requireIncludes(
  readme,
  'ranked population and receives no verdict band',
  'README Alfred comparative-board boundary',
);

requireIncludes(ciWorkflow, '\n        uses: ./\n', 'CI root candidate Action smoke');
requireIncludes(ciWorkflow, '\n        uses: ./action\n', 'CI nested candidate Action smoke');
requireIncludes(ciWorkflow, 'test -s .cejel-action/report.json', 'CI candidate report assertion');
requireIncludes(
  ciWorkflow,
  'test -s .cejel-action/certificate.html',
  'CI candidate certificate assertion',
);
requireIncludes(ciWorkflow, 'test -s .cejel-action/summary.json', 'CI candidate summary assertion');
requireIncludes(
  ciWorkflow,
  'test -s .cejel-action-nested/report.json',
  'CI nested candidate report assertion',
);
requireIncludes(
  ciWorkflow,
  'test -s .cejel-action-nested/certificate.html',
  'CI nested candidate certificate assertion',
);
requireIncludes(
  ciWorkflow,
  'test -s .cejel-action-nested/summary.json',
  'CI nested candidate summary assertion',
);
requireIncludes(ciWorkflow, '.cejel-action/', 'CI root candidate artifact upload');
requireIncludes(ciWorkflow, '.cejel-action-nested/', 'CI nested candidate artifact upload');
requireIncludes(ciWorkflow, 'include-hidden-files: true', 'CI hidden artifact upload');
requireIncludes(ciWorkflow, 'if-no-files-found: error', 'CI missing-artifact failure');

requireIncludes(
  rootAction,
  'cd "${{ github.action_path }}"',
  'root Action repository working directory',
);
requireIncludes(
  rootAction,
  'node "${{ github.action_path }}/action/run.mjs"',
  'root Action runner path',
);
requireIncludes(
  rootAction,
  'Overall Cejel trust score (0.0-4.0), or empty when Cejel abstains.',
  'root Action score output contract',
);
requireIncludes(
  rootAction,
  'Unverified / Insufficient source /',
  'root Action verdict output contract',
);
requireIncludes(rootAction, 'Insufficient evidence).', 'root Action evidence abstention verdict');
requireIncludes(
  nestedAction,
  'cd "$(dirname "${{ github.action_path }}")"',
  'nested Action repository working directory',
);
requireIncludes(
  nestedAction,
  'node "${{ github.action_path }}/run.mjs"',
  'nested Action runner path',
);
requireIncludes(
  nestedAction,
  'Overall Cejel trust score (0.0-4.0), or empty when Cejel abstains.',
  'nested Action score output contract',
);
requireIncludes(
  nestedAction,
  'Unverified / Insufficient source /',
  'nested Action verdict output contract',
);
requireIncludes(
  nestedAction,
  'Insufficient evidence).',
  'nested Action evidence abstention verdict',
);
if (rootAction === nestedAction) {
  throw new Error('Root and nested Action manifests must use distinct relative paths.');
}
requireIncludes(
  actionRunner,
  "s.verdict === 'Insufficient evidence'",
  'Action insufficient-evidence abstention guard',
);
requireIncludes(actionRunner, 'finding.displaySummary ?? finding.summary', 'Action finding copy');
requireIncludes(actionRunner, 'dimension band:', 'Action dimension-band label');

const listFormActionReference = 'owner/action@0123456789abcdef0123456789abcdef01234567';
requireEqual(
  [...`- uses: ${listFormActionReference}`.matchAll(ACTION_USE_PATTERN)][0]?.[1],
  listFormActionReference,
  'list-form action dependency matcher',
);

for (const [name, workflow] of [
  ['release workflow', releaseWorkflow],
  ['distribution workflow', distributionWorkflow],
  ['CLA workflow', claWorkflow],
  ['CI workflow', ciWorkflow],
  ['root advertised composite action', rootAction],
  ['nested compatibility composite action', nestedAction],
]) {
  for (const match of workflow.matchAll(ACTION_USE_PATTERN)) {
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
  `Distribution metadata agrees on npm v${packageManifest.version}, MCP Registry v${publishedVersions.mcpRegistry}, and OCI v${publishedVersions.oci} for ${packageManifest.mcpName}.\n`,
);
