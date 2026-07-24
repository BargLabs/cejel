#!/usr/bin/env node

/**
 * Deterministic, detector-independent source discovery for the v1.5 LLM
 * calibration cycle.  This deliberately performs only the lexical searches
 * locked in the public anchor contract; it does not import or execute the
 * product detector, select repositories, label candidates, or reach the
 * network.
 */

import { createHash } from 'node:crypto';
import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  deterministicQueryOutputManifestHash,
  deterministicRawHitId,
  validateDiscoveryAnchorContract,
} from './assemble-discovery-integrity.mjs';
import { canonicalize } from './freeze-cohorts.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const COHORTS = new Set(['golden', 'untouched']);
const codePointCompare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonicalHash = (document, omittedKey) => {
  const hashable = structuredClone(document);
  if (omittedKey) delete hashable[omittedKey];
  return sha256(Buffer.from(canonicalize(hashable), 'utf8'));
};

function rejectUnknownKeys(value, allowed, scope) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${scope} must be an object`);
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${scope} contains unknown field(s): ${unknown.sort().join(', ')}`);
  }
}

function normalisePath(path) {
  return path.split(sep).join('/');
}

function readRepositoryMatrix(document) {
  rejectUnknownKeys(document, ['repositories'], 'repository matrix input');
  if (!Array.isArray(document.repositories) || document.repositories.length < 1) {
    throw new Error('repository matrix input must contain at least one repository');
  }
  const rows = [];
  const seen = new Set();
  for (const [index, repository] of document.repositories.entries()) {
    const scope = `repository matrix row ${index}`;
    rejectUnknownKeys(repository, ['cohort', 'repository_id', 'commit_sha', 'source_root'], scope);
    const key = `${repository.cohort}:${repository.repository_id}`;
    if (
      !COHORTS.has(repository.cohort) || !REPOSITORY.test(repository.repository_id || '') ||
      !COMMIT.test(repository.commit_sha || '') || typeof repository.source_root !== 'string' ||
      repository.source_root.length < 1 || seen.has(key)
    ) throw new Error(`${scope} is invalid or duplicated`);
    const sourceRoot = resolve(repository.source_root);
    if (!lstatSync(sourceRoot).isDirectory()) throw new Error(`${scope} source root is not a directory`);
    seen.add(key);
    rows.push({ ...repository, source_root: sourceRoot });
  }
  return rows.sort((left, right) =>
    codePointCompare(`${left.cohort}:${left.repository_id}`, `${right.cohort}:${right.repository_id}`));
}

function enumerateEligibleFiles(sourceRoot, fileEligibility, maximumFiles) {
  const excluded = new Set(fileEligibility.excluded_path_segments);
  const extensions = new Set(fileEligibility.extensions.map((extension) => extension.toLowerCase()));
  const files = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort(codePointCompare)) {
      if (excluded.has(name)) continue;
      const absolutePath = resolve(directory, name);
      const entry = lstatSync(absolutePath);
      if (entry.isSymbolicLink()) {
        // A Git symlink is not a regular source file. Do not traverse or read its target;
        // omitting it is deterministic and prevents source discovery from escaping the frozen tree.
        continue;
      }
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        const relativePath = normalisePath(relative(sourceRoot, absolutePath));
        const extension = relativePath.slice(relativePath.lastIndexOf('.')).toLowerCase();
        if (!extensions.has(extension)) continue;
        const bytes = readFileSync(absolutePath);
        files.push({
          path: relativePath,
          content_sha256: sha256(bytes),
          bytes,
        });
        if (files.length >= maximumFiles) {
          throw new Error(`eligible file resource ceiling reached at ${maximumFiles}`);
        }
      }
    }
  };
  visit(sourceRoot);
  return files.sort((left, right) => codePointCompare(left.path, right.path));
}

function fileManifestHash(files) {
  return canonicalHash({
    schema_version: '1.0.0',
    files: files.map(({ path, content_sha256 }) => ({ path, content_sha256 })),
  });
}

function executeRecipe(repository, rule, recipe, files, maximumHits) {
  const patterns = recipe.query_patterns.map((pattern) => ({
    ...pattern,
    matcher: new RegExp(pattern.regex, pattern.flags.replaceAll('g', '').replaceAll('y', '')),
  }));
  const matches = new Map();
  for (const file of files) {
    const lines = file.bytes.toString('utf8').split(/\r?\n/);
    for (const [lineIndex, line] of lines.entries()) {
      const matchedPatternIds = patterns
        .filter((pattern) => {
          pattern.matcher.lastIndex = 0;
          return pattern.matcher.test(line);
        })
        .map((pattern) => pattern.pattern_id)
        .sort(codePointCompare);
      if (matchedPatternIds.length === 0) continue;
      const anchor = {
        kind: patterns[0].anchor_kind,
        path: file.path,
        start_line: lineIndex + 1,
        end_line: lineIndex + 1,
        content_sha256: file.content_sha256,
      };
      const provisional = {
        cohort: repository.cohort,
        repository_id: repository.repository_id,
        commit_sha: repository.commit_sha,
        rule_id: rule.rule_id,
        query_id: recipe.query_id,
        anchor,
      };
      const hit = {
        hit_id: deterministicRawHitId(provisional),
        ...provisional,
        matched_pattern_ids: matchedPatternIds,
      };
      matches.set(hit.hit_id, hit);
      if (matches.size >= maximumHits) {
        throw new Error(
          `raw-hit resource ceiling reached for ${repository.cohort}:${repository.repository_id}:${rule.rule_id}:${recipe.query_id}`,
        );
      }
    }
  }
  return [...matches.values()].sort((left, right) => codePointCompare(left.hit_id, right.hit_id));
}

export function collectDiscoveryHits({ contract, repositories }) {
  const lockedContract = validateDiscoveryAnchorContract(contract);
  const matrix = readRepositoryMatrix(repositories);
  const eligibleFileInventories = [];
  const rawHitRows = [];
  const rawHits = [];
  const resourceUsage = [];
  for (const repository of matrix) {
    const files = enumerateEligibleFiles(
      repository.source_root,
      lockedContract.file_eligibility,
      lockedContract.resource_ceilings.maximum_eligible_files_per_repository,
    );
    eligibleFileInventories.push({
      cohort: repository.cohort,
      repository_id: repository.repository_id,
      commit_sha: repository.commit_sha,
      eligible_file_count: files.length,
      eligible_file_manifest_sha256: fileManifestHash(files),
      ceiling_reached: false,
    });
    let repositoryHitCount = 0;
    for (const rule of lockedContract.rules) {
      for (const recipe of rule.query_recipes) {
        const hits = executeRecipe(
          repository,
          rule,
          recipe,
          files,
          lockedContract.resource_ceilings.maximum_hits_per_query,
        );
        const row = {
          cohort: repository.cohort,
          repository_id: repository.repository_id,
          commit_sha: repository.commit_sha,
          rule_id: rule.rule_id,
          query_id: recipe.query_id,
          hit_ids: hits.map((hit) => hit.hit_id),
          observed_hit_count: hits.length,
          output_manifest_sha256: '',
          ceiling_reached: false,
        };
        row.output_manifest_sha256 = deterministicQueryOutputManifestHash(row, hits);
        rawHitRows.push(row);
        rawHits.push(...hits);
        repositoryHitCount += hits.length;
      }
    }
    resourceUsage.push({
      cohort: repository.cohort,
      repository_id: repository.repository_id,
      eligible_files: files.length,
      raw_hits: repositoryHitCount,
      candidates: 0,
      ceiling_reached: false,
    });
  }
  const document = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    methodology_id: lockedContract.methodology_id,
    status: 'collected_before_review',
    detector_results_seen_before_collection: false,
    bindings: { anchor_contract_sha256: lockedContract.contract_sha256 },
    repository_matrix: matrix.map(({ cohort, repository_id, commit_sha }) => ({
      cohort,
      repository_id,
      commit_sha,
    })),
    eligible_file_inventories: eligibleFileInventories,
    raw_hit_rows: rawHitRows,
    raw_hits: rawHits,
    resource_usage: resourceUsage,
  };
  return { ...document, collection_sha256: canonicalHash(document) };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '').replaceAll('-', '_');
    const value = argv[index + 1];
    if (!key || !value) throw new Error('every option requires a value');
    options[key] = value;
  }
  return options;
}

export function main(argv) {
  const options = parseArgs(argv);
  for (const key of ['contract', 'repositories', 'output']) {
    if (!options[key]) throw new Error(`--${key.replaceAll('_', '-')} is required`);
  }
  const result = collectDiscoveryHits({
    contract: JSON.parse(readFileSync(resolve(options.contract), 'utf8')),
    repositories: JSON.parse(readFileSync(resolve(options.repositories), 'utf8')),
  });
  const output = resolve(options.output);
  mkdirSync(resolve(output, '..'), { recursive: true });
  let descriptor;
  try {
    descriptor = openSync(output, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
