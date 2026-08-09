#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SERVER_NAME = 'io.github.BargLabs/cejel';
const IMAGE_NAME = 'ghcr.io/barglabs/cejel';
const REPOSITORY = 'BargLabs/cejel';
const REPOSITORY_URI = 'https://github.com/BargLabs/cejel';
const WORKFLOW_PATH = '.github/workflows/publish-distribution.yml';

function requireMatch(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`${label} is missing or malformed: ${JSON.stringify(value)}.`);
  }
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

export function verifyMcpOciReleaseChain({
  registryResponse,
  attestationResults,
  expectedVersion,
  expectedDigest,
  expectedCommit,
  expectedTag,
}) {
  requireMatch(expectedVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'Expected version');
  requireMatch(expectedDigest, /^sha256:[0-9a-f]{64}$/, 'Expected OCI digest');
  requireMatch(expectedCommit, /^[0-9a-f]{40}$/, 'Expected source commit');
  if (expectedTag !== `v${expectedVersion}`) {
    throw new Error(`Expected tag ${expectedTag} must equal v${expectedVersion}.`);
  }

  const server = registryResponse?.server;
  if (!server || typeof server !== 'object') {
    throw new Error('MCP Registry response must contain a server object.');
  }
  if (server.name !== SERVER_NAME) {
    throw new Error(`MCP Registry server name mismatch: expected ${SERVER_NAME}, got ${server.name}.`);
  }
  if (server.version !== expectedVersion) {
    throw new Error(
      `MCP Registry version mismatch: expected ${expectedVersion}, got ${server.version}.`,
    );
  }

  const ociPackages = Array.isArray(server.packages)
    ? server.packages.filter((entry) => entry?.registryType === 'oci')
    : [];
  if (ociPackages.length !== 1) {
    throw new Error(`MCP Registry response must contain exactly one OCI package; got ${ociPackages.length}.`);
  }
  const expectedIdentifier = `${IMAGE_NAME}@${expectedDigest}`;
  if (ociPackages[0].identifier !== expectedIdentifier) {
    throw new Error(
      `MCP Registry OCI identifier mismatch: expected ${expectedIdentifier}, got ${ociPackages[0].identifier}.`,
    );
  }

  if (!Array.isArray(attestationResults) || attestationResults.length === 0) {
    throw new Error('GitHub attestation verification must return at least one verified result.');
  }

  const expectedRef = `refs/tags/${expectedTag}`;
  const expectedSigner = `${REPOSITORY_URI}/${WORKFLOW_PATH}@${expectedRef}`;
  const matchingResult = attestationResults.find((entry) => {
    const certificate = entry?.verificationResult?.signature?.certificate;
    const statement = entry?.verificationResult?.statement;
    const subjects = Array.isArray(statement?.subject) ? statement.subject : [];
    const dependencies = Array.isArray(statement?.predicate?.buildDefinition?.resolvedDependencies)
      ? statement.predicate.buildDefinition.resolvedDependencies
      : [];

    return (
      certificate?.sourceRepositoryURI === REPOSITORY_URI &&
      certificate?.sourceRepositoryDigest === expectedCommit &&
      certificate?.sourceRepositoryRef === expectedRef &&
      certificate?.githubWorkflowRepository === REPOSITORY &&
      certificate?.githubWorkflowRef === expectedRef &&
      certificate?.subjectAlternativeName === expectedSigner &&
      statement?.predicateType === 'https://slsa.dev/provenance/v1' &&
      subjects.some(
        (subject) =>
          subject?.name === IMAGE_NAME && subject?.digest?.sha256 === expectedDigest.slice(7),
      ) &&
      dependencies.some(
        (dependency) =>
          dependency?.uri === `git+${REPOSITORY_URI}@${expectedRef}` &&
          dependency?.digest?.gitCommit === expectedCommit,
      )
    );
  });

  if (!matchingResult) {
    throw new Error(
      `No verified OCI attestation binds ${expectedDigest} to ${expectedCommit} at ${expectedRef}.`,
    );
  }

  return {
    serverName: SERVER_NAME,
    version: expectedVersion,
    ociIdentifier: expectedIdentifier,
    sourceCommit: expectedCommit,
    sourceRef: expectedRef,
    signerWorkflow: WORKFLOW_PATH,
  };
}

function main() {
  const [registryPath, attestationPath, expectedVersion, expectedDigest, expectedCommit, expectedTag] =
    process.argv.slice(2);
  if (process.argv.length !== 8) {
    throw new Error(
      'Usage: verify-mcp-oci-release-chain.mjs <registry.json> <attestations.json> <version> <sha256:digest> <commit> <v-tag>',
    );
  }

  const result = verifyMcpOciReleaseChain({
    registryResponse: parseJson(readFileSync(registryPath, 'utf8'), 'MCP Registry response'),
    attestationResults: parseJson(readFileSync(attestationPath, 'utf8'), 'attestation results'),
    expectedVersion,
    expectedDigest,
    expectedCommit,
    expectedTag,
  });
  process.stdout.write(
    `Verified MCP Registry ${result.serverName} v${result.version} -> ${result.ociIdentifier}; signed tagged-source commit ${result.sourceCommit} at ${result.sourceRef}.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
