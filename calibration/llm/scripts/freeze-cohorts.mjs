#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);
const here = dirname(fileURLToPath(import.meta.url));
const calibrationRoot = resolve(here, '..');
const HASH_CONTRACT =
  'rfc8785-sha256-v1; entry excludes entry_sha256; manifest excludes manifest_sha256 and attestation';
const AUTOMATION_IDENTITY = /(?:^|[\s_-])(bot|claude|codex|gpt|agent|automation|machine|ci|github[\s_-]*actions?)(?:$|[\s_-])/i;

export function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON cannot contain a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`;
  }
  throw new TypeError(`canonical JSON cannot contain ${typeof value}`);
}

export function sha256Canonical(value) {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

export function hashRepositoryEntry(entry) {
  const { entry_sha256: _excluded, ...hashable } = entry;
  return sha256Canonical(hashable);
}

export function hashManifest(manifest) {
  const {
    manifest_sha256: _manifestHashExcluded,
    attestation: _attestationExcluded,
    ...hashable
  } = manifest;
  return sha256Canonical(hashable);
}

export function validateHumanReviewers(reviewers, confirmedHuman) {
  if (!confirmedHuman) {
    throw new Error('freeze requires --confirm-human-reviewers; the script cannot infer that a reviewer is human');
  }
  if (reviewers.length !== 2) {
    throw new Error('freeze requires exactly two explicit --reviewer values');
  }
  const normalized = reviewers.map((reviewer) => reviewer.trim());
  if (normalized.some((reviewer) => reviewer.length < 3)) {
    throw new Error('each reviewer must be an explicit human name of at least three characters');
  }
  if (new Set(normalized.map((reviewer) => reviewer.toLocaleLowerCase('en-US'))).size !== 2) {
    throw new Error('freeze requires two distinct reviewer names');
  }
  if (normalized.some((reviewer) => AUTOMATION_IDENTITY.test(reviewer))) {
    throw new Error('automation or model identities cannot be recorded as human reviewers');
  }
  return normalized;
}

function parseArgs(argv) {
  const options = {
    reviewers: [],
    dryRun: false,
    resolveOnly: false,
    confirmHumanReviewers: false,
    concurrency: 4,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const takeValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      index += 1;
      return value;
    };
    switch (argument) {
      case '--cohort': options.cohort = takeValue(); break;
      case '--candidate-file': options.candidateFile = takeValue(); break;
      case '--output': options.output = takeValue(); break;
      case '--reviewer': options.reviewers.push(takeValue()); break;
      case '--attestation-reference': options.attestationReference = takeValue(); break;
      case '--frozen-at': options.frozenAt = takeValue(); break;
      case '--concurrency': options.concurrency = Number.parseInt(takeValue(), 10); break;
      case '--confirm-human-reviewers': options.confirmHumanReviewers = true; break;
      case '--dry-run': options.dryRun = true; break;
      case '--resolve-only': options.resolveOnly = true; break;
      case '--help': options.help = true; break;
      default: throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function usage() {
  return `Usage:
  node calibration/llm/scripts/freeze-cohorts.mjs --cohort golden --resolve-only
  node calibration/llm/scripts/freeze-cohorts.mjs --cohort untouched --dry-run
  node calibration/llm/scripts/freeze-cohorts.mjs --cohort golden \\
    --reviewer "Human One" --reviewer "Human Two" --confirm-human-reviewers \\
    --attestation-reference "internal-witness:review-record-id"

Modes:
  --resolve-only   Resolve and print technical metadata; do not create a frozen manifest.
  --dry-run        Alias for a no-write technical resolution, or preview a complete freeze when
                   reviewers and an attestation reference are supplied.

Freeze options:
  --reviewer NAME              Required exactly twice for a real freeze.
  --confirm-human-reviewers    Explicit assertion that both named reviewers are people.
  --attestation-reference REF  Required internal witness record reference.
  --frozen-at ISO              Optional explicit UTC timestamp; defaults to current time.
  --output PATH                Optional output; defaults to cohorts/<cohort>-manifest.json.
`;
}

async function run(command, args) {
  try {
    const { stdout } = await execFile(command, args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    });
    return stdout.trim();
  } catch (error) {
    const detail = error.stderr?.trim() || error.message;
    throw new Error(`${command} ${args.join(' ')} failed: ${detail}`);
  }
}

function normalizeLicense(spdxId) {
  if (!spdxId || spdxId === 'OTHER' || spdxId === 'NOASSERTION') return 'NOASSERTION';
  if (!/^[A-Za-z0-9.+-]+$/.test(spdxId)) return 'NOASSERTION';
  return spdxId;
}

export async function resolveRepository(candidate, commandRunner = run) {
  const metadata = JSON.parse(await commandRunner('gh', ['api', `repos/${candidate.repository_id}`]));
  if (metadata.full_name.toLocaleLowerCase('en-US') !== candidate.repository_id.toLocaleLowerCase('en-US')) {
    throw new Error(
      `${candidate.repository_id}: GitHub resolved to renamed repository ${metadata.full_name}; ` +
      'apply the preregistered reserve rule instead of silently changing the candidate',
    );
  }
  if (metadata.fork) throw new Error(`${candidate.repository_id}: repository is a fork`);
  if (!metadata.default_branch) throw new Error(`${candidate.repository_id}: default branch is unavailable`);

  const remote = await commandRunner('git', [
    'ls-remote',
    candidate.url,
    `refs/heads/${metadata.default_branch}`,
  ]);
  const match = /^([a-f0-9]{40})\s+refs\/heads\/(.+)$/m.exec(remote);
  if (!match || match[2] !== metadata.default_branch) {
    throw new Error(`${candidate.repository_id}: could not resolve the observed default branch to a full commit`);
  }
  const commitSha = match[1];
  const commit = JSON.parse(await commandRunner('gh', [
    'api',
    `repos/${candidate.repository_id}/git/commits/${commitSha}`,
  ]));
  const treeSha = commit.tree?.sha;
  if (!/^[a-f0-9]{40}$/.test(treeSha || '')) {
    throw new Error(`${candidate.repository_id}: GitHub did not return a full Git tree SHA`);
  }

  const entryWithoutHash = {
    repository_id: candidate.repository_id,
    url: candidate.url,
    default_branch_observed: metadata.default_branch,
    commit_sha: commitSha,
    git_tree_sha: treeSha,
    license_spdx: normalizeLicense(metadata.license?.spdx_id),
    primary_language: candidate.primary_language,
    primary_surface: candidate.primary_surface,
    provider_surface: candidate.provider_surface,
    inclusion_reason: candidate.inclusion_reason,
    source_available_at_freeze: true,
  };
  return {
    ...entryWithoutHash,
    entry_sha256: hashRepositoryEntry(entryWithoutHash),
  };
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function assertCandidateDocument(document, cohort) {
  if (document.schema_version !== '1.0.0' || document.protocol_id !== 'cejel-llm-calibration-v1') {
    throw new Error('candidate file has an unsupported schema or protocol');
  }
  if (document.policy_id !== 'llm-selection-v1' || document.cohort !== cohort) {
    throw new Error('candidate file policy or cohort does not match the requested freeze');
  }
  if (document.status !== 'candidate_commit_freeze_pending' || document.selected_before_detector_results !== true) {
    throw new Error('candidate file was not selected and locked before detector results');
  }
  if (!Array.isArray(document.repositories) || document.repositories.length < 1) {
    throw new Error('candidate file contains no repositories');
  }
}

function toResolution(candidateDocument, repositories, candidateSha256) {
  return {
    schema_version: '1.0.0',
    protocol_id: candidateDocument.protocol_id,
    policy_id: candidateDocument.policy_id,
    cohort: candidateDocument.cohort,
    status: 'resolved_not_frozen',
    candidate_sha256: candidateSha256,
    hash_contract: HASH_CONTRACT,
    repositories,
  };
}

function toManifest(candidateDocument, repositories, reviewers, attestationReference, frozenAt) {
  const withoutHash = {
    schema_version: '1.0.0',
    protocol_id: candidateDocument.protocol_id,
    policy_id: candidateDocument.policy_id,
    cohort: candidateDocument.cohort,
    status: 'frozen',
    frozen_at: frozenAt,
    frozen_by: reviewers,
    detector_results_seen_before_freeze: false,
    hash_contract: HASH_CONTRACT,
    repositories,
  };
  const manifest = {
    ...withoutHash,
    manifest_sha256: hashManifest(withoutHash),
    attestation: {
      method: 'internal_witness',
      reference: attestationReference,
    },
  };
  if (hashManifest(manifest) !== manifest.manifest_sha256) {
    throw new Error('internal manifest hash verification failed');
  }
  return manifest;
}

function writeNewFile(path, document) {
  let descriptor;
  try {
    descriptor = openSync(path, 'wx', 0o644);
    writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!['golden', 'untouched'].includes(options.cohort)) {
    throw new Error('--cohort must be golden or untouched');
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 8) {
    throw new Error('--concurrency must be an integer from 1 through 8');
  }

  const candidatePath = resolve(
    options.candidateFile || resolve(calibrationRoot, 'cohorts', `${options.cohort}-candidates.json`),
  );
  const candidateBytes = readFileSync(candidatePath);
  const candidateDocument = JSON.parse(candidateBytes.toString('utf8'));
  assertCandidateDocument(candidateDocument, options.cohort);
  const candidateSha256 = createHash('sha256').update(candidateBytes).digest('hex');

  const hasFreezeArguments =
    options.reviewers.length > 0 || options.confirmHumanReviewers || options.attestationReference || options.frozenAt;
  const technicalResolutionOnly = options.resolveOnly || (options.dryRun && !hasFreezeArguments);
  let reviewers;
  let frozenAt;
  if (!technicalResolutionOnly) {
    reviewers = validateHumanReviewers(options.reviewers, options.confirmHumanReviewers);
    if (!options.attestationReference || !options.attestationReference.startsWith('internal-witness:')) {
      throw new Error('freeze requires --attestation-reference beginning with internal-witness:');
    }
    frozenAt = options.frozenAt || new Date().toISOString();
    if (Number.isNaN(Date.parse(frozenAt)) || !frozenAt.endsWith('Z')) {
      throw new Error('--frozen-at must be a valid UTC ISO-8601 timestamp ending in Z');
    }
  }

  const resolutionFailures = new Array(candidateDocument.repositories.length);
  const repositories = await mapLimit(
    candidateDocument.repositories,
    options.concurrency,
    async (candidate, index) => {
      try {
        return await resolveRepository(candidate);
      } catch (error) {
        resolutionFailures[index] = error.message;
        return null;
      }
    },
  );
  const failures = resolutionFailures.filter(Boolean);
  if (failures.length > 0) {
    throw new Error(
      `technical resolution failed for ${failures.length} candidate(s):\n` +
      failures.map((failure) => `- ${failure}`).join('\n'),
    );
  }

  if (technicalResolutionOnly) {
    console.log(JSON.stringify(toResolution(candidateDocument, repositories, candidateSha256), null, 2));
    return;
  }

  const manifest = toManifest(
    candidateDocument,
    repositories,
    reviewers,
    options.attestationReference,
    frozenAt,
  );
  if (options.dryRun) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  const output = resolve(
    options.output || resolve(calibrationRoot, 'cohorts', `${options.cohort}-manifest.json`),
  );
  writeNewFile(output, manifest);
  console.log(JSON.stringify({
    status: 'frozen',
    cohort: options.cohort,
    output,
    repositories: repositories.length,
    manifest_sha256: manifest.manifest_sha256,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
