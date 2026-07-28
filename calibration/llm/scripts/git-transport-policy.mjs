import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPOSITORY_ID_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DENY_HELPER_EXECUTABLE = '/usr/bin/false';
const NULL_GIT_CONFIG = '/dev/null';

export function assertCanonicalRepositoryReference(repository) {
  const repositoryId = repository?.repository_id;
  const expectedUrl = `https://github.com/${repositoryId}`;
  if (
    typeof repositoryId !== 'string' ||
    !REPOSITORY_ID_PATTERN.test(repositoryId) ||
    repositoryId.split('/').some((segment) => segment === '.' || segment === '..') ||
    repository?.url !== expectedUrl
  ) {
    throw new Error(
      `${repositoryId || 'repository'}: repository.url must be the canonical HTTPS GitHub repository URL ${expectedUrl}`,
    );
  }
  return expectedUrl;
}

export function withHttpsOnlyGitTransport(args) {
  return [
    '-c',
    'protocol.allow=never',
    '-c',
    'protocol.https.allow=always',
    '-c',
    'credential.helper=',
    '-c',
    `core.askPass=${DENY_HELPER_EXECUTABLE}`,
    ...args,
  ];
}

export function isolatedGitEnvironment(environment, isolatedHome) {
  const isolated = Object.fromEntries(
    Object.entries(environment).filter(
      ([key]) =>
        !key.startsWith('GIT_') &&
        key !== 'SSH_ASKPASS' &&
        key !== 'SSH_ASKPASS_REQUIRE' &&
        key !== 'SSH_AUTH_SOCK' &&
        key !== 'HOME' &&
        key !== 'NETRC',
    ),
  );
  return {
    ...isolated,
    HOME: isolatedHome,
    GIT_ALLOW_PROTOCOL: 'https',
    GIT_ASKPASS: DENY_HELPER_EXECUTABLE,
    GIT_CONFIG_GLOBAL: NULL_GIT_CONFIG,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: NULL_GIT_CONFIG,
    GIT_LFS_SKIP_SMUDGE: '1',
    GIT_PROXY_COMMAND: DENY_HELPER_EXECUTABLE,
    GIT_SSH_COMMAND: DENY_HELPER_EXECUTABLE,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
    SSH_ASKPASS: DENY_HELPER_EXECUTABLE,
  };
}

export async function withIsolatedGitEnvironment(
  environment,
  operation,
) {
  const isolatedHome = mkdtempSync(join(tmpdir(), 'cejel-git-home-'));
  try {
    return await operation(isolatedGitEnvironment(environment, isolatedHome));
  } finally {
    rmSync(isolatedHome, { recursive: true, force: true });
  }
}
