import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = resolve(
  repositoryRoot,
  'docs/experiments/external-repository-exposure-registry-2026-08-10.json',
);
const sourceRevision = '0d476a655fc5a0a8f83edf47b2e0f8e9eb3e6d00';

const sourceDefinitions = [
  {
    path: 'docs/experiments/d-series-base-rate-2026-08-02/prior-exposure-exclusions.json',
    readIdentities: (text) => JSON.parse(text).identities,
  },
  {
    path: 'docs/experiments/d-series-base-rate-2026-08-02/stage0-manifest.universe.jsonl',
    readIdentities: (text) => parseJsonLines(text).map(({ fullName }) => fullName),
  },
  {
    path: 'docs/experiments/d-series-base-rate-2026-08-02/tier2-fresh-manifest.universe.jsonl',
    readIdentities: (text) => parseJsonLines(text).map(({ fullName }) => fullName),
  },
  {
    path: 'docs/experiments/d-series-base-rate-2026-08-02/owned-corpus.json',
    readIdentities: (text) => JSON.parse(text).repositories.map(({ fullName }) => fullName),
  },
  {
    path: 'leaderboard/corpus.json',
    readIdentities: (text) =>
      JSON.parse(text)
        .entries.filter(({ url }) => typeof url === 'string' && url.length > 0)
        .map(({ url }) => url),
  },
  {
    path: 'docs/experiments/d1-precision-gate-2026-07-31.json',
    readIdentities: (text) => JSON.parse(text).repositories.map(({ url }) => url),
  },
];

function parseJsonLines(text) {
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function normalizeIdentity(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('repository identity must be a non-empty string');
  }

  let identity = value.trim();
  if (identity.startsWith('https://') || identity.startsWith('http://')) {
    const url = new URL(identity);
    if (url.hostname.toLowerCase() !== 'github.com') {
      throw new Error(`unsupported repository host: ${url.hostname}`);
    }
    identity = url.pathname.replace(/^\/+|\/+$/g, '');
  }

  identity = identity.replace(/\.git$/i, '');
  const parts = identity.split('/');
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
    throw new Error(`invalid GitHub repository identity: ${value}`);
  }
  return `${parts[0]}/${parts[1]}`.toLowerCase();
}

function buildRegistry() {
  const identities = new Set();
  const sources = sourceDefinitions.map((source) => {
    const absolutePath = resolve(repositoryRoot, source.path);
    const text = readFileSync(absolutePath, 'utf8');
    const sourceIdentities = source.readIdentities(text).map(normalizeIdentity);
    for (const identity of sourceIdentities) identities.add(identity);
    return {
      path: source.path,
      sha256: sha256(text),
      recordCount: sourceIdentities.length,
    };
  });

  return {
    schemaVersion: 1,
    status: 'conservative-prior-exposure-superset',
    sourceRevision,
    generatedAt: '2026-08-10T00:00:00.000Z',
    normalization: 'lowercase GitHub owner/name; strip https://github.com/ and trailing .git',
    purpose:
      'Exclude every repository named by prior calibration, holdout, base-rate universe, owned, leaderboard, and D-series precision artifacts before external A3/B6 cohort selection.',
    sources,
    identityCount: identities.size,
    identities: [...identities].sort(),
  };
}

const rendered = `${JSON.stringify(buildRegistry(), null, 2)}\n`;
if (process.argv.includes('--check')) {
  const committed = readFileSync(outputPath, 'utf8');
  if (committed !== rendered) {
    throw new Error('external exposure registry is stale; regenerate it');
  }
} else {
  writeFileSync(outputPath, rendered);
}
