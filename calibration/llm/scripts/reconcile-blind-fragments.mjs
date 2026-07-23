#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalize } from './freeze-cohorts.mjs';

const COHORTS = ['golden', 'untouched'];
const IDENTITY_KEYS = [
  'repository_id',
  'commit_sha',
  'rule_id',
  'path',
  'start_line',
  'end_line',
  'content_sha256',
];

function opportunityIdentity(opportunity) {
  return canonicalize(Object.fromEntries(
    IDENTITY_KEYS.slice(0, -1).map((key) => [key, opportunity[key]]),
  ));
}

function identityOnly(repository, opportunity) {
  return {
    repository_id: repository.repository_id,
    commit_sha: repository.commit_sha,
    rule_id: opportunity.rule_id,
    path: opportunity.path,
    start_line: opportunity.start_line,
    end_line: opportunity.end_line,
    content_sha256: opportunity.content_sha256,
  };
}

function fragmentIndex(fragment, expectedCohort, scope) {
  if (
    fragment?.cohort !== expectedCohort ||
    typeof fragment?.reviewer_id !== 'string' ||
    !Array.isArray(fragment?.repositories)
  ) throw new Error(`${scope}: invalid blind fragment`);
  const identities = new Map();
  for (const repository of fragment.repositories) {
    if (
      typeof repository?.repository_id !== 'string' ||
      !/^[a-f0-9]{40}$/.test(repository?.commit_sha || '') ||
      !Array.isArray(repository?.opportunities)
    ) throw new Error(`${scope}: invalid repository entry`);
    for (const opportunity of repository.opportunities) {
      const item = identityOnly(repository, opportunity);
      if (
        typeof item.rule_id !== 'string' ||
        typeof item.path !== 'string' ||
        item.path.length < 1 ||
        item.path.startsWith('/') ||
        item.path.includes('\\') ||
        item.path.split('/').some((segment) => ['', '.', '..'].includes(segment)) ||
        !Number.isInteger(item.start_line) ||
        !Number.isInteger(item.end_line) ||
        item.start_line < 1 ||
        item.end_line < item.start_line ||
        !/^[a-f0-9]{64}$/.test(item.content_sha256 || '')
      ) throw new Error(`${scope}: invalid opportunity identity`);
      const identity = opportunityIdentity(item);
      if (identities.has(identity)) throw new Error(`${scope}: duplicate opportunity identity`);
      identities.set(identity, item);
    }
  }
  return { reviewerId: fragment.reviewer_id, identities };
}

export function reconcileBlindFragments(input) {
  const missingForA = {};
  const missingForB = {};
  const summary = {};
  const reviewerIds = { a: new Set(), b: new Set() };
  for (const cohort of COHORTS) {
    const left = fragmentIndex(input.reviewerA[cohort], cohort, `reviewer A ${cohort}`);
    const right = fragmentIndex(input.reviewerB[cohort], cohort, `reviewer B ${cohort}`);
    reviewerIds.a.add(left.reviewerId.trim());
    reviewerIds.b.add(right.reviewerId.trim());
    if (left.reviewerId.trim().toLowerCase() === right.reviewerId.trim().toLowerCase()) {
      throw new Error(`${cohort}: blind fragments require distinct reviewer identities`);
    }
    for (const [identity, item] of left.identities) {
      const peer = right.identities.get(identity);
      if (peer && peer.content_sha256 !== item.content_sha256) {
        throw new Error(`${cohort}: matching opportunity identity has inconsistent whole-file digest`);
      }
    }
    missingForA[cohort] = [...right.identities.entries()]
      .filter(([identity]) => !left.identities.has(identity))
      .sort(([leftIdentity], [rightIdentity]) =>
        leftIdentity < rightIdentity ? -1 : leftIdentity > rightIdentity ? 1 : 0)
      .map(([, item]) => item);
    missingForB[cohort] = [...left.identities.entries()]
      .filter(([identity]) => !right.identities.has(identity))
      .sort(([leftIdentity], [rightIdentity]) =>
        leftIdentity < rightIdentity ? -1 : leftIdentity > rightIdentity ? 1 : 0)
      .map(([, item]) => item);
    summary[cohort] = {
      reviewer_a_opportunities: left.identities.size,
      reviewer_b_opportunities: right.identities.size,
      missing_for_reviewer_a: missingForA[cohort].length,
      missing_for_reviewer_b: missingForB[cohort].length,
      exact_identity_union: missingForA[cohort].length === 0 && missingForB[cohort].length === 0,
    };
  }
  if (reviewerIds.a.size !== 1 || reviewerIds.b.size !== 1) {
    throw new Error('each blind reviewer must use one stable identity across both cohorts');
  }
  return {
    reviewerA: {
      schema_version: '1.0.0',
      record_type: 'blind_identity_union_review_request',
      payload_kind: 'opportunity_identity_only',
      cohorts: missingForA,
    },
    reviewerB: {
      schema_version: '1.0.0',
      record_type: 'blind_identity_union_review_request',
      payload_kind: 'opportunity_identity_only',
      cohorts: missingForB,
    },
    summary,
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '').replaceAll('-', '_');
    const value = argv[index + 1];
    if (!key || !value) throw new Error('every reconciliation option requires a value');
    options[key] = value;
  }
  return options;
}

function writeNew(path, document) {
  let descriptor;
  try {
    descriptor = openSync(path, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function main(argv) {
  const options = parseArgs(argv);
  for (const key of [
    'reviewer_a_golden',
    'reviewer_a_untouched',
    'reviewer_b_golden',
    'reviewer_b_untouched',
    'output_root',
  ]) if (!options[key]) throw new Error(`--${key.replaceAll('_', '-')} is required`);
  const read = (path) => JSON.parse(readFileSync(resolve(path), 'utf8'));
  const result = reconcileBlindFragments({
    reviewerA: {
      golden: read(options.reviewer_a_golden),
      untouched: read(options.reviewer_a_untouched),
    },
    reviewerB: {
      golden: read(options.reviewer_b_golden),
      untouched: read(options.reviewer_b_untouched),
    },
  });
  const outputRoot = resolve(options.output_root);
  if (existsSync(outputRoot)) throw new Error('reconciliation output root must not already exist');
  mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  const realOutputRoot = realpathSync(outputRoot);
  try {
    const containingRepository = execFileSync(
      'git',
      ['-C', realOutputRoot, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (containingRepository) {
      throw new Error('reconciliation output must be outside every Git working tree');
    }
  } catch (error) {
    if (error.message === 'reconciliation output must be outside every Git working tree') throw error;
  }
  chmodSync(realOutputRoot, 0o700);
  writeNew(join(realOutputRoot, 'reviewer-a-missing-identities.json'), result.reviewerA);
  writeNew(join(realOutputRoot, 'reviewer-b-missing-identities.json'), result.reviewerB);
  writeNew(join(realOutputRoot, 'aggregate-summary.json'), {
    schema_version: '1.0.0',
    contains_repository_identities_or_labels: false,
    cohorts: result.summary,
  });
  console.log(JSON.stringify(result.summary, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
