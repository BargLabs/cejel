#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const PACKAGE_PATH = new URL('../package.json', import.meta.url);
const SERVER_PATH = new URL('../server.json', import.meta.url);
const DOCKERFILE_PATH = new URL('../Dockerfile', import.meta.url);
const DISTRIBUTION_WORKFLOW_PATH = new URL(
  '../.github/workflows/publish-distribution.yml',
  import.meta.url,
);

const packageManifest = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));
const serverManifest = JSON.parse(readFileSync(SERVER_PATH, 'utf8'));
const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
const distributionWorkflow = readFileSync(DISTRIBUTION_WORKFLOW_PATH, 'utf8');

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
requireEqual(ociPackage.version, packageManifest.version, 'OCI/package version');
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
requireIncludes(dockerfile, 'ENTRYPOINT ["cejel-mcp"]', 'Dockerfile MCP entrypoint');
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
  'uses: actions/attest@v4',
  'distribution workflow signed provenance',
);

process.stdout.write(
  `Distribution metadata agrees on ${packageManifest.mcpName} v${packageManifest.version}.\n`,
);
