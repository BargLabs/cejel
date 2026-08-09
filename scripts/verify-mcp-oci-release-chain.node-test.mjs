import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyMcpOciReleaseChain } from './verify-mcp-oci-release-chain.mjs';

const version = '0.4.0';
const tag = `v${version}`;
const digest = `sha256:${'a'.repeat(64)}`;
const commit = 'b'.repeat(40);
const ref = `refs/tags/${tag}`;

function registryResponse(identifier = `ghcr.io/barglabs/cejel@${digest}`) {
  return {
    server: {
      name: 'io.github.BargLabs/cejel',
      version,
      packages: [{ registryType: 'oci', identifier, transport: { type: 'stdio' } }],
    },
  };
}

function attestationResults({
  certificateCommit = commit,
  subjectDigest = digest.slice(7),
  dependencyCommit = commit,
} = {}) {
  return [{
    verificationResult: {
      signature: {
        certificate: {
          sourceRepositoryURI: 'https://github.com/BargLabs/cejel',
          sourceRepositoryDigest: certificateCommit,
          sourceRepositoryRef: ref,
          githubWorkflowRepository: 'BargLabs/cejel',
          githubWorkflowRef: ref,
          subjectAlternativeName:
            `https://github.com/BargLabs/cejel/.github/workflows/publish-distribution.yml@${ref}`,
        },
      },
      statement: {
        subject: [{ name: 'ghcr.io/barglabs/cejel', digest: { sha256: subjectDigest } }],
        predicateType: 'https://slsa.dev/provenance/v1',
        predicate: {
          buildDefinition: {
            resolvedDependencies: [{
              uri: `git+https://github.com/BargLabs/cejel@${ref}`,
              digest: { gitCommit: dependencyCommit },
            }],
          },
        },
      },
    },
  }];
}

function verify(overrides = {}) {
  return verifyMcpOciReleaseChain({
    registryResponse: registryResponse(),
    attestationResults: attestationResults(),
    expectedVersion: version,
    expectedDigest: digest,
    expectedCommit: commit,
    expectedTag: tag,
    ...overrides,
  });
}

test('accepts an exact MCP record, OCI subject, signed commit, and tag chain', () => {
  assert.deepEqual(verify(), {
    serverName: 'io.github.BargLabs/cejel',
    version,
    ociIdentifier: `ghcr.io/barglabs/cejel@${digest}`,
    sourceCommit: commit,
    sourceRef: ref,
    signerWorkflow: '.github/workflows/publish-distribution.yml',
  });
});

test('rejects a Registry digest that differs from the attested OCI digest', () => {
  assert.throws(
    () => verify({ registryResponse: registryResponse(`ghcr.io/barglabs/cejel@sha256:${'c'.repeat(64)}`) }),
    /OCI identifier mismatch/,
  );
});

test('rejects an attestation subject digest mismatch', () => {
  assert.throws(
    () => verify({ attestationResults: attestationResults({ subjectDigest: 'c'.repeat(64) }) }),
    /No verified OCI attestation binds/,
  );
});

test('rejects a signed certificate source commit mismatch even if provenance claims the expected commit', () => {
  assert.throws(
    () => verify({ attestationResults: attestationResults({ certificateCommit: 'c'.repeat(40) }) }),
    /No verified OCI attestation binds/,
  );
});

test('rejects a provenance dependency commit mismatch', () => {
  assert.throws(
    () => verify({ attestationResults: attestationResults({ dependencyCommit: 'c'.repeat(40) }) }),
    /No verified OCI attestation binds/,
  );
});

test('rejects ambiguous OCI packages and malformed expected values', () => {
  const ambiguous = registryResponse();
  ambiguous.server.packages.push(structuredClone(ambiguous.server.packages[0]));
  assert.throws(() => verify({ registryResponse: ambiguous }), /exactly one OCI package/);
  assert.throws(() => verify({ expectedDigest: 'sha256:nope' }), /missing or malformed/);
  assert.throws(() => verify({ expectedTag: 'v0.4.1' }), /must equal v0.4.0/);
});
