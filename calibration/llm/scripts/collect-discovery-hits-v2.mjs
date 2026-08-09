#!/usr/bin/env node

/**
 * Resource-bounded, detector-independent source discovery collector v2.
 *
 * This is deliberately a new surface. The SHA-pinned v1.9 collector remains at
 * collect-discovery-hits.mjs and historical contracts continue to bind it.
 * V2 requires a separately locked 2.0.0 contract and runs all regular-expression
 * work in a disposable worker so a pathological file can be interrupted.
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
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';

import { canonicalize } from './freeze-cohorts.mjs';

const COLLECTOR_PATH = 'calibration/llm/scripts/collect-discovery-hits-v2.mjs';
const COLLECTOR_ID = 'cejel-llm-discovery-collector-v2';
const WORKER_MODE = 'cejel-discovery-regex-worker-v2';
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const METHODOLOGY = /^llm-opportunity-discovery-v[0-9]+(?:\.[0-9]+)?$/;
const COHORTS = new Set(['golden', 'untouched']);
const REQUIRED_DEPENDENCIES = [
  'node:crypto',
  'node:fs',
  'node:path',
  'node:url',
  'node:worker_threads',
  'calibration/llm/scripts/freeze-cohorts.mjs',
];
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

function exactUniqueStrings(values, scope, minimum = 0) {
  if (
    !Array.isArray(values) || values.length < minimum ||
    values.some((value) => typeof value !== 'string' || value.length < 1) ||
    new Set(values).size !== values.length
  ) throw new Error(`${scope} must be an array of unique non-empty strings`);
  return values;
}

function normalisePath(path) {
  return path.split(sep).join('/');
}

function identityHash(prefix, document) {
  return `${prefix}-${sha256(Buffer.from(canonicalize(document), 'utf8'))}`;
}

function deterministicRawHitId(hit) {
  return identityHash('llm-hit', {
    cohort: hit.cohort,
    repository_id: hit.repository_id,
    commit_sha: hit.commit_sha,
    rule_id: hit.rule_id,
    query_id: hit.query_id,
    anchor: hit.anchor,
  });
}

function deterministicQueryOutputManifestHash(row, hits) {
  return canonicalHash({
    schema_version: '1.0.0',
    cohort: row.cohort,
    repository_id: row.repository_id,
    commit_sha: row.commit_sha,
    rule_id: row.rule_id,
    query_id: row.query_id,
    raw_hits: [...hits]
      .map((hit) => ({
        hit_id: hit.hit_id,
        anchor: hit.anchor,
        matched_pattern_ids: hit.matched_pattern_ids,
      }))
      .sort((left, right) => codePointCompare(left.hit_id, right.hit_id)),
  });
}

export function validateResourceBoundedDiscoveryContract(contract) {
  rejectUnknownKeys(contract, [
    '$schema', 'schema_version', 'protocol_id', 'methodology_id', 'status', 'locked_at',
    'detector_results_seen_before_lock', 'source_accessed_before_lock', 'hash_contract',
    'search_families', 'allowed_exclusion_codes', 'resource_ceilings', 'file_eligibility',
    'candidate_grouping', 'discovery_tool', 'rules', 'contract_sha256',
  ], 'resource-bounded discovery contract');
  if (
    contract.schema_version !== '2.0.0' ||
    contract.protocol_id !== 'cejel-llm-calibration-v1' ||
    !METHODOLOGY.test(contract.methodology_id || '') ||
    contract.status !== 'locked_before_source_access' ||
    contract.detector_results_seen_before_lock !== false ||
    contract.source_accessed_before_lock !== false ||
    typeof contract.locked_at !== 'string' ||
    Number.isNaN(Date.parse(contract.locked_at)) ||
    contract.hash_contract !== 'rfc8785-sha256-v1; contract excludes only contract_sha256' ||
    canonicalHash(contract, 'contract_sha256') !== contract.contract_sha256
  ) throw new Error('resource-bounded discovery contract is not a valid pre-source lock');

  const families = exactUniqueStrings(contract.search_families, 'contract search families', 1);
  exactUniqueStrings(contract.allowed_exclusion_codes, 'contract exclusion codes', 1);
  rejectUnknownKeys(contract.resource_ceilings, [
    'maximum_eligible_files_per_repository',
    'maximum_hits_per_query',
    'maximum_candidates_per_repository_rule',
    'maximum_regex_scan_milliseconds_per_file',
  ], 'contract resource ceilings');
  for (const [name, value] of Object.entries(contract.resource_ceilings)) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`contract resource ceiling ${name} must be a positive integer`);
    }
  }
  if (contract.resource_ceilings.maximum_regex_scan_milliseconds_per_file > 60_000) {
    throw new Error('per-file regex scan ceiling must not exceed 60000 milliseconds');
  }
  if (contract.candidate_grouping !== undefined && (
    !contract.candidate_grouping || typeof contract.candidate_grouping !== 'object' ||
    Array.isArray(contract.candidate_grouping) ||
    Object.keys(contract.candidate_grouping).sort(codePointCompare).join('\0') !==
      ['grouping_key', 'minimum_distinct_query_recipes'].join('\0') ||
    contract.candidate_grouping.grouping_key !== 'cohort_repository_commit_rule_anchor' ||
    !Number.isInteger(contract.candidate_grouping.minimum_distinct_query_recipes) ||
    contract.candidate_grouping.minimum_distinct_query_recipes < 1
  )) throw new Error('candidate grouping configuration is invalid');

  rejectUnknownKeys(
    contract.file_eligibility,
    ['extensions', 'excluded_path_segments'],
    'contract file eligibility',
  );
  if (
    !exactUniqueStrings(contract.file_eligibility.extensions, 'eligible source extensions', 1)
      .every((extension) => /^\.[a-z0-9]+$/i.test(extension)) ||
    !exactUniqueStrings(
      contract.file_eligibility.excluded_path_segments,
      'excluded source path segments',
      1,
    ).every((segment) => !/[\\/]/.test(segment))
  ) throw new Error('contract file eligibility is invalid');

  rejectUnknownKeys(
    contract.discovery_tool,
    ['path', 'source_sha256', 'dependency_paths'],
    'contract discovery tool',
  );
  const dependencies = exactUniqueStrings(
    contract.discovery_tool.dependency_paths,
    'discovery tool dependencies',
  );
  if (
    contract.discovery_tool.path !== COLLECTOR_PATH ||
    contract.discovery_tool.source_sha256 !== sha256(readFileSync(fileURLToPath(import.meta.url))) ||
    REQUIRED_DEPENDENCIES.some((path) => !dependencies.includes(path)) ||
    dependencies.some((path) => path.includes('src/packs/llm'))
  ) throw new Error('discovery tool is invalid, unpinned, or detector-dependent');

  if (!Array.isArray(contract.rules) || contract.rules.length < 1) {
    throw new Error('contract must declare at least one rule');
  }
  const ruleIds = new Set();
  const queryIds = new Set();
  for (const [ruleIndex, rule] of contract.rules.entries()) {
    const scope = `contract rule ${ruleIndex}`;
    rejectUnknownKeys(rule, [
      'rule_id', 'anchor_kinds', 'canonical_locus', 'negative_boundary_policy',
      'candidate_normalization', 'query_recipes',
    ], scope);
    const anchorKinds = exactUniqueStrings(rule.anchor_kinds, `${scope} anchor kinds`, 1);
    if (
      typeof rule.rule_id !== 'string' || rule.rule_id.length < 3 || ruleIds.has(rule.rule_id) ||
      typeof rule.canonical_locus !== 'string' || rule.canonical_locus.length < 20 ||
      typeof rule.negative_boundary_policy !== 'string' || rule.negative_boundary_policy.length < 20 ||
      typeof rule.candidate_normalization !== 'string' || rule.candidate_normalization.length < 20 ||
      !Array.isArray(rule.query_recipes) || rule.query_recipes.length !== families.length
    ) throw new Error(`${scope} is incomplete or duplicated`);
    const seenFamilies = new Set();
    for (const [recipeIndex, recipe] of rule.query_recipes.entries()) {
      const recipeScope = `${scope} query recipe ${recipeIndex}`;
      rejectUnknownKeys(recipe, ['query_id', 'family', 'semantic_cues', 'query_patterns'], recipeScope);
      if (
        typeof recipe.query_id !== 'string' || recipe.query_id.length < 3 ||
        queryIds.has(recipe.query_id) || !families.includes(recipe.family) ||
        seenFamilies.has(recipe.family)
      ) throw new Error(`${recipeScope} is duplicated or outside the locked methodology`);
      exactUniqueStrings(recipe.semantic_cues, `${recipeScope} semantic cues`, 1);
      if (!Array.isArray(recipe.query_patterns) || recipe.query_patterns.length < 1) {
        throw new Error(`${recipeScope} must lock at least one machine-readable query pattern`);
      }
      const patternIds = new Set();
      const patternAnchorKinds = new Set();
      for (const [patternIndex, pattern] of recipe.query_patterns.entries()) {
        rejectUnknownKeys(
          pattern,
          ['pattern_id', 'regex', 'flags', 'anchor_kind'],
          `${recipeScope} pattern ${patternIndex}`,
        );
        if (
          typeof pattern.pattern_id !== 'string' || pattern.pattern_id.length < 3 ||
          patternIds.has(pattern.pattern_id) || typeof pattern.regex !== 'string' ||
          pattern.regex.length < 1 || !/^[gimsuy]*$/.test(pattern.flags || '') ||
          !anchorKinds.includes(pattern.anchor_kind)
        ) throw new Error(`${recipeScope} has an invalid query pattern`);
        try {
          new RegExp(pattern.regex, pattern.flags.replaceAll('g', '').replaceAll('y', ''));
        } catch {
          throw new Error(`${recipeScope} has an invalid query pattern`);
        }
        patternIds.add(pattern.pattern_id);
        patternAnchorKinds.add(pattern.anchor_kind);
      }
      if (patternAnchorKinds.size !== 1) {
        throw new Error(`${recipeScope} patterns must share one canonical anchor kind`);
      }
      queryIds.add(recipe.query_id);
      seenFamilies.add(recipe.family);
    }
    if (seenFamilies.size !== families.length) throw new Error(`${scope} omits a search family`);
    ruleIds.add(rule.rule_id);
  }
  return contract;
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
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        const relativePath = normalisePath(relative(sourceRoot, absolutePath));
        const extension = relativePath.slice(relativePath.lastIndexOf('.')).toLowerCase();
        if (!extensions.has(extension)) continue;
        const bytes = readFileSync(absolutePath);
        files.push({ path: relativePath, content_sha256: sha256(bytes), bytes });
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

function flattenedRecipes(rules) {
  return rules.flatMap((rule) => rule.query_recipes.map((recipe) => ({
    rule_id: rule.rule_id,
    query_id: recipe.query_id,
    anchor_kind: recipe.query_patterns[0].anchor_kind,
    patterns: recipe.query_patterns.map(({ pattern_id, regex, flags }) => ({
      pattern_id,
      regex,
      flags: flags.replaceAll('g', '').replaceAll('y', ''),
    })),
  })));
}

function compileWorkerRecipes(recipes) {
  return recipes.map((recipe) => ({
    ...recipe,
    patterns: recipe.patterns.map((pattern) => ({
      ...pattern,
      matcher: new RegExp(pattern.regex, pattern.flags),
    })),
  }));
}

function scanWorkerFile(recipes, text) {
  const matches = [];
  const lines = text.split(/\r?\n/);
  for (const recipe of recipes) {
    for (const [lineIndex, line] of lines.entries()) {
      const matchedPatternIds = recipe.patterns
        .filter((pattern) => {
          pattern.matcher.lastIndex = 0;
          return pattern.matcher.test(line);
        })
        .map((pattern) => pattern.pattern_id)
        .sort(codePointCompare);
      if (matchedPatternIds.length > 0) {
        matches.push({
          rule_id: recipe.rule_id,
          query_id: recipe.query_id,
          anchor_kind: recipe.anchor_kind,
          line: lineIndex + 1,
          matched_pattern_ids: matchedPatternIds,
        });
      }
    }
  }
  return matches;
}

if (!isMainThread && workerData?.mode === WORKER_MODE) {
  const recipes = compileWorkerRecipes(workerData.recipes);
  parentPort.on('message', ({ jobId, text }) => {
    try {
      parentPort.postMessage({ type: 'result', jobId, matches: scanWorkerFile(recipes, text) });
    } catch (error) {
      parentPort.postMessage({ type: 'error', jobId, message: String(error?.message || error) });
    }
  });
  parentPort.postMessage({ type: 'ready' });
}

class RegexWorkerClient {
  constructor(recipes, budgetMilliseconds) {
    this.recipes = recipes;
    this.budgetMilliseconds = budgetMilliseconds;
    this.worker = undefined;
    this.nextJobId = 1;
  }

  async ensureWorker() {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL(import.meta.url), {
      workerData: { mode: WORKER_MODE, recipes: this.recipes },
    });
    this.worker = worker;
    worker.on('error', () => {
      if (this.worker === worker) this.worker = undefined;
    });
    worker.on('exit', () => {
      if (this.worker === worker) this.worker = undefined;
    });
    await new Promise((resolveReady, rejectReady) => {
      const cleanup = () => {
        worker.off('message', onMessage);
        worker.off('error', onError);
        worker.off('exit', onExit);
      };
      const onMessage = (message) => {
        if (message?.type !== 'ready') return;
        cleanup();
        resolveReady();
      };
      const onError = (error) => {
        cleanup();
        rejectReady(error);
      };
      const onExit = (code) => {
        cleanup();
        rejectReady(new Error(`regex worker exited before ready with code ${code}`));
      };
      worker.on('message', onMessage);
      worker.once('error', onError);
      worker.once('exit', onExit);
    });
    return worker;
  }

  async scan(text) {
    const worker = await this.ensureWorker();
    const jobId = this.nextJobId++;
    return new Promise((resolveScan, rejectScan) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        worker.off('message', onMessage);
        worker.off('error', onError);
        worker.off('exit', onExit);
      };
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };
      const onMessage = (message) => {
        if (message?.jobId !== jobId) return;
        if (message.type === 'result') {
          settle(resolveScan, { timedOut: false, matches: message.matches });
        } else if (message.type === 'error') {
          settle(rejectScan, new Error(`regex worker failed: ${message.message}`));
        }
      };
      const onError = (error) => {
        if (this.worker === worker) this.worker = undefined;
        settle(rejectScan, error);
      };
      const onExit = (code) => {
        if (this.worker === worker) this.worker = undefined;
        settle(rejectScan, new Error(`regex worker exited during scan with code ${code}`));
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (this.worker === worker) this.worker = undefined;
        cleanup();
        worker.terminate().then(
          () => resolveScan({ timedOut: true, matches: [] }),
          rejectScan,
        );
      }, this.budgetMilliseconds);
      worker.on('message', onMessage);
      worker.once('error', onError);
      worker.once('exit', onExit);
      try {
        worker.postMessage({ jobId, text });
      } catch (error) {
        if (this.worker === worker) this.worker = undefined;
        settle(rejectScan, error);
        void worker.terminate();
      }
    });
  }

  async close() {
    const worker = this.worker;
    this.worker = undefined;
    if (worker) await worker.terminate();
  }
}

/**
 * Groups lexical hits into one reviewable source locus while retaining every
 * supporting raw-hit ID. Kept as a v2 export so new cycles need not import the
 * SHA-pinned historical collector.
 */
export function groupCorroboratedCandidateLociV2(rawHits, minimumDistinctQueries) {
  if (!Number.isInteger(minimumDistinctQueries) || minimumDistinctQueries < 1) {
    throw new Error('candidate corroboration threshold must be a positive integer');
  }
  const groups = new Map();
  for (const hit of rawHits) {
    const key = canonicalize({
      cohort: hit.cohort,
      repository_id: hit.repository_id,
      commit_sha: hit.commit_sha,
      rule_id: hit.rule_id,
      anchor: hit.anchor,
    });
    let group = groups.get(key);
    if (!group) {
      group = {
        cohort: hit.cohort,
        repository_id: hit.repository_id,
        commit_sha: hit.commit_sha,
        rule_id: hit.rule_id,
        anchor: hit.anchor,
        query_ids: new Set(),
        supporting_hit_ids: new Set(),
      };
      groups.set(key, group);
    }
    group.query_ids.add(hit.query_id);
    group.supporting_hit_ids.add(hit.hit_id);
  }
  return [...groups.values()]
    .filter((group) => group.query_ids.size >= minimumDistinctQueries)
    .map((group) => ({
      cohort: group.cohort,
      repository_id: group.repository_id,
      commit_sha: group.commit_sha,
      rule_id: group.rule_id,
      anchor: group.anchor,
      query_ids: [...group.query_ids].sort(codePointCompare),
      supporting_hit_ids: [...group.supporting_hit_ids].sort(codePointCompare),
    }))
    .sort((left, right) => codePointCompare(canonicalize(left), canonicalize(right)));
}

export async function collectDiscoveryHitsV2({ contract, repositories }) {
  const lockedContract = validateResourceBoundedDiscoveryContract(contract);
  const matrix = readRepositoryMatrix(repositories);
  const recipes = flattenedRecipes(lockedContract.rules);
  const scanner = new RegexWorkerClient(
    recipes,
    lockedContract.resource_ceilings.maximum_regex_scan_milliseconds_per_file,
  );
  const eligibleFileInventories = [];
  const rawHitRows = [];
  const rawHits = [];
  const resourceUsage = [];
  const resourceExhaustions = [];
  try {
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

      const repositoryExhaustions = [];
      const hitsByQuery = new Map(recipes.map((recipe) => [
        `${recipe.rule_id}\0${recipe.query_id}`,
        new Map(),
      ]));
      for (const file of files) {
        const result = await scanner.scan(file.bytes.toString('utf8'));
        if (result.timedOut) {
          const exhaustion = {
            cohort: repository.cohort,
            repository_id: repository.repository_id,
            commit_sha: repository.commit_sha,
            path: file.path,
            content_sha256: file.content_sha256,
            resource: 'maximum_regex_scan_milliseconds_per_file',
            limit: lockedContract.resource_ceilings.maximum_regex_scan_milliseconds_per_file,
            affected_query_ids: recipes.map((recipe) => recipe.query_id).sort(codePointCompare),
          };
          repositoryExhaustions.push(exhaustion);
          resourceExhaustions.push(exhaustion);
          continue;
        }
        for (const match of result.matches) {
          const anchor = {
            kind: match.anchor_kind,
            path: file.path,
            start_line: match.line,
            end_line: match.line,
            content_sha256: file.content_sha256,
          };
          const provisional = {
            cohort: repository.cohort,
            repository_id: repository.repository_id,
            commit_sha: repository.commit_sha,
            rule_id: match.rule_id,
            query_id: match.query_id,
            anchor,
          };
          const hit = {
            hit_id: deterministicRawHitId(provisional),
            ...provisional,
            matched_pattern_ids: match.matched_pattern_ids,
          };
          const matches = hitsByQuery.get(`${match.rule_id}\0${match.query_id}`);
          matches.set(hit.hit_id, hit);
          if (matches.size >= lockedContract.resource_ceilings.maximum_hits_per_query) {
            throw new Error(
              `raw-hit resource ceiling reached for ${repository.cohort}:${repository.repository_id}:${match.rule_id}:${match.query_id}`,
            );
          }
        }
      }

      let repositoryHitCount = 0;
      for (const rule of lockedContract.rules) {
        for (const recipe of rule.query_recipes) {
          const hits = [...hitsByQuery.get(`${rule.rule_id}\0${recipe.query_id}`).values()]
            .sort((left, right) => codePointCompare(left.hit_id, right.hit_id));
          const row = {
            cohort: repository.cohort,
            repository_id: repository.repository_id,
            commit_sha: repository.commit_sha,
            rule_id: rule.rule_id,
            query_id: recipe.query_id,
            hit_ids: hits.map((hit) => hit.hit_id),
            observed_hit_count: hits.length,
            output_manifest_sha256: '',
            ceiling_reached: repositoryExhaustions.length > 0,
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
        regex_file_timeouts: repositoryExhaustions.length,
        ceiling_reached: repositoryExhaustions.length > 0,
      });
    }
  } finally {
    await scanner.close();
  }

  const complete = resourceExhaustions.length === 0;
  const document = {
    schema_version: '2.0.0',
    collector_id: COLLECTOR_ID,
    protocol_id: 'cejel-llm-calibration-v1',
    methodology_id: lockedContract.methodology_id,
    status: complete ? 'collected_before_review' : 'resource_ceiling_reached_before_review',
    complete,
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
    resource_exhaustions: resourceExhaustions,
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

export async function main(argv) {
  const options = parseArgs(argv);
  for (const key of ['contract', 'repositories', 'output']) {
    if (!options[key]) throw new Error(`--${key.replaceAll('_', '-')} is required`);
  }
  const result = await collectDiscoveryHitsV2({
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
  if (!result.complete) process.exitCode = 2;
  return result;
}

if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
