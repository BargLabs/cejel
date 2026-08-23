#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';

const CEJEL_ROOT = resolve(new URL('..', import.meta.url).pathname);
const ALFRED_ROOT = resolve(homedir(), 'projects', 'alfred');
const ALFRED_COMMIT = '5a8e496c33e783b2271827e78096e5f515f656a0';
const CEJEL_RULE_COMMIT = '05d5d9fca79ea9cb1d34e64fa795f9713b6d1bf1';
const V50_SPEC_PATH =
  'docs/calibration/free-core-untouched-holdout-v50-2026-07-24/selection-spec.json';
const V50_SELECTOR_PATH = 'packages/witan/scripts/cohort-selection.mjs';
const V50_FREEZER_PATH = 'packages/witan/scripts/freeze-github-cohort.mjs';
const EXPECTED_SELECTOR_SHA256 =
  '1e1ca3961d46b1da58242d9cbbc837b8dc89653491758b769a43a7ce8fcb6b78';
const EXPECTED_FREEZER_SHA256 =
  'eb25fb2c1d085d0c91ba406a3ecf946e9b989f0f398c33e995203feaaa8196a7';
const OUTPUT_ROOT = resolve(CEJEL_ROOT, 'docs/experiments/d-series-base-rate-2026-08-02');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function gitShow(repository, commit, path) {
  return execFileSync('git', ['show', `${commit}:${path}`], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function gitPaths(repository, commit) {
  return execFileSync('git', ['ls-tree', '-r', '--name-only', commit, '--', 'docs'], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
    .split('\n')
    .filter(Boolean);
}

function normalizeIdentity(value) {
  const identity = String(value)
    .trim()
    .replace(/^https?:\/\/(?:www\.)?github\.com\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
  return /^[a-z0-9-]+\/[a-z0-9._-]+$/i.test(identity) ? identity : null;
}

function collectJsonIdentities(value, identities) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonIdentities(item, identities);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === 'string' &&
      ['fullName', 'repository', 'repositoryId', 'repo', 'url'].includes(key)
    ) {
      const identity = normalizeIdentity(item);
      if (identity) identities.add(identity);
    }
    collectJsonIdentities(item, identities);
  }
}

function collectMarkdownIdentities(raw, identities) {
  for (const match of raw.matchAll(
    /https?:\/\/(?:www\.)?github\.com\/([^/\s)#]+)\/([^/\s)#]+?)(?:\.git)?(?=[\s)#]|$)/gi,
  )) {
    const identity = normalizeIdentity(`${match[1]}/${match[2]}`);
    if (identity) identities.add(identity);
  }
  for (const match of raw.matchAll(
    /(?:^|\|)\s*`?([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)`?\s*(?=\|)/gm,
  )) {
    const identity = normalizeIdentity(match[1]);
    if (identity) identities.add(identity);
  }
}

function priorExposurePath(path) {
  return (
    path === 'docs/leaderboard/corpus.json' ||
    /\/manifest-wave-[0-9]+\.json$/.test(path) ||
    /\/invalidated-[^/]*repositories[^/]*\.json$/.test(path) ||
    (/^docs\/commercial\//.test(path) &&
      /\/(?:cohort|preregistration|preregistration-waves[^/]*)\.md$/.test(path))
  );
}

function reconstructPriorExposure() {
  const identities = new Set();
  const sources = [];
  for (const path of gitPaths(ALFRED_ROOT, ALFRED_COMMIT).filter(priorExposurePath).sort()) {
    const raw = gitShow(ALFRED_ROOT, ALFRED_COMMIT, path);
    if (path.endsWith('.json')) collectJsonIdentities(JSON.parse(raw), identities);
    else collectMarkdownIdentities(raw, identities);
    sources.push({ path, sha256: sha256(raw) });
  }
  for (const identity of [
    'BargLabs/alfred',
    'BargLabs/cejel',
    'BargLabs/egbert',
    'BargStudio/egbert',
    'houman44/edwin',
    'houman44/site-machine',
    'BargStudio/therasyn',
    'houman44/knut',
  ]) {
    identities.add(normalizeIdentity(identity));
  }
  return { identities: [...identities].sort(), sources };
}

function authenticateSelector() {
  const selector = gitShow(ALFRED_ROOT, ALFRED_COMMIT, V50_SELECTOR_PATH);
  const freezer = gitShow(ALFRED_ROOT, ALFRED_COMMIT, V50_FREEZER_PATH);
  if (sha256(selector) !== EXPECTED_SELECTOR_SHA256) {
    throw new Error('pinned v17 cohort selector SHA-256 mismatch');
  }
  if (sha256(freezer) !== EXPECTED_FREEZER_SHA256) {
    throw new Error('pinned v17 cohort freezer SHA-256 mismatch');
  }
  return JSON.parse(gitShow(ALFRED_ROOT, ALFRED_COMMIT, V50_SPEC_PATH));
}

function proportionalAllocations(searches, target) {
  const originalTotal = searches.reduce((sum, search) => sum + search.allocation, 0);
  const ranked = searches.map((search, index) => {
    const exact = (search.allocation * target) / originalTotal;
    return { index, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = target - ranked.reduce((sum, row) => sum + row.floor, 0);
  for (const row of [...ranked].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (remaining === 0) break;
    row.floor += 1;
    remaining -= 1;
  }
  return searches.map((search, index) => ({ ...search, allocation: ranked[index].floor }));
}

function scaledAllocations(searches, factor) {
  return searches.map((search) => ({ ...search, allocation: search.allocation * factor }));
}

function eligibleCapacities(searches, exclusions, manifest) {
  const universePath = resolve(OUTPUT_ROOT, manifest.candidateUniverseArtifact.path);
  const universe = readFileSync(universePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const excluded = new Set(exclusions);
  const firstStratum = new Map();
  for (const search of searches) {
    for (const row of universe) {
      if (!row.matchedSearchIds.includes(search.id)) continue;
      if (search.primaryLanguageEligibility === 'none' && row.primaryLanguage !== null) continue;
      const identity = normalizeIdentity(row.fullName);
      if (!firstStratum.has(identity)) firstStratum.set(identity, search.id);
    }
  }
  return Object.fromEntries(
    searches.map((search) => [
      search.id,
      universe.filter((row) => {
        const identity = normalizeIdentity(row.fullName);
        return (
          row.matchedSearchIds.includes(search.id) &&
          (search.primaryLanguageEligibility !== 'none' || row.primaryLanguage === null) &&
          firstStratum.get(identity) === search.id &&
          !excluded.has(identity) &&
          row.revision &&
          Number.isInteger(row.sizeKb) &&
          row.sizeKb >= 0 &&
          row.sizeKb < 500000
        );
      }).length,
    ]),
  );
}

function capacityConstrainedAllocations(searches, factor, target, capacities) {
  const scaled = scaledAllocations(searches, factor);
  const allocation = new Map(
    scaled.map((search) => [search.id, Math.min(search.allocation, capacities[search.id] ?? 0)]),
  );
  let remaining = target - [...allocation.values()].reduce((sum, count) => sum + count, 0);
  while (remaining > 0) {
    const active = searches.filter(
      (search) => search.allocation > 0 && allocation.get(search.id) < capacities[search.id],
    );
    if (active.length === 0) throw new Error(`capacity shortfall leaves ${remaining} unallocated`);
    const weight = active.reduce((sum, search) => sum + search.allocation, 0);
    const quotas = active.map((search, index) => {
      const exact = (remaining * search.allocation) / weight;
      const spare = capacities[search.id] - allocation.get(search.id);
      return {
        search,
        index,
        floor: Math.min(Math.floor(exact), spare),
        remainder: exact - Math.floor(exact),
      };
    });
    let granted = 0;
    for (const row of quotas) {
      allocation.set(row.search.id, allocation.get(row.search.id) + row.floor);
      granted += row.floor;
    }
    remaining -= granted;
    if (remaining === 0) break;
    for (const row of [...quotas].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
      if (remaining === 0) break;
      if (allocation.get(row.search.id) >= capacities[row.search.id]) continue;
      allocation.set(row.search.id, allocation.get(row.search.id) + 1);
      remaining -= 1;
    }
  }
  return scaled.map((search) => ({ ...search, allocation: allocation.get(search.id) }));
}

function commonSpec(base, { id, seed, count, searches, exclusions }) {
  return {
    benchmarkId: id,
    detectorRevision: CEJEL_RULE_COMMIT,
    rubricVersion: 'cejel-d-series-base-rate-v1-2026-08-02',
    selectionSeed: seed,
    selectionStrategy: base.selectionStrategy,
    transportRecoveryPolicy: 'transient-network-v1',
    maxTransportRecoveryAttempts: 3,
    waveSize: count,
    waveCount: 1,
    plannedRepositoryCount: count,
    maximumRepositorySizeKbExclusive: base.maximumRepositorySizeKbExclusive,
    framePolicy:
      `${base.framePolicy} This experiment reuses the same ordered searches, first-match ` +
      'assignment, structural eligibility, and hash ranking. Allocations are scaled ' +
      'prospectively from the v50 200-repository proportions; no commit-message text is queried.',
    exclusions,
    exclusionSources: [],
    searches,
    provenance: {
      alfredRepositoryCommit: ALFRED_COMMIT,
      v50SelectionSpecPath: V50_SPEC_PATH,
      v50SelectionSpecSha256: sha256(gitShow(ALFRED_ROOT, ALFRED_COMMIT, V50_SPEC_PATH)),
      cohortSelectorPath: V50_SELECTOR_PATH,
      cohortSelectorSha256: EXPECTED_SELECTOR_SHA256,
      cohortFreezerPath: V50_FREEZER_PATH,
      cohortFreezerSha256: EXPECTED_FREEZER_SHA256,
    },
  };
}

function writeJson(path, value) {
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function prepareStage0() {
  const base = authenticateSelector();
  const exposure = reconstructPriorExposure();
  const exclusionsPath = resolve(OUTPUT_ROOT, 'prior-exposure-exclusions.json');
  writeJson(exclusionsPath, {
    schemaVersion: 'cejel-d-series-prior-exposure-v1',
    alfredRepositoryCommit: ALFRED_COMMIT,
    identityCount: exposure.identities.length,
    identities: exposure.identities,
    sources: exposure.sources,
  });
  const spec = commonSpec(base, {
    id: 'cejel-d-series-base-rate-stage0-2026-08-02',
    seed: 'cejel-d-series-stage0-2026-08-02-6f51d6720ab7a3dc',
    count: 50,
    searches: proportionalAllocations(base.searches, 50),
    exclusions: exposure.identities,
  });
  writeJson(resolve(OUTPUT_ROOT, 'stage0-selection-spec.json'), spec);
  process.stdout.write(
    `prepared stage0 spec with ${spec.exclusions.length} prior-exposure exclusions; ` +
      `output=${basename(exclusionsPath)}\n`,
  );
}

function prepareTier2() {
  const base = authenticateSelector();
  const exposure = reconstructPriorExposure();
  const stage0Path = resolve(OUTPUT_ROOT, 'stage0-manifest.json');
  const stage0 = JSON.parse(readFileSync(stage0Path, 'utf8'));
  if (!Array.isArray(stage0.selected) || stage0.selected.length !== 50) {
    throw new Error('stage0 manifest must contain exactly 50 frozen repositories');
  }
  const stage0Identities = stage0.selected.map((row) => normalizeIdentity(row.fullName));
  const exclusions = [...new Set([...exposure.identities, ...stage0Identities])].sort();
  const capacities = eligibleCapacities(base.searches, exclusions, stage0);
  const tier2Searches = capacityConstrainedAllocations(
    base.searches,
    10,
    2_000,
    capacities,
  );
  const spec = commonSpec(base, {
    id: 'cejel-d-series-base-rate-tier2-fresh-2026-08-02',
    seed: 'cejel-d-series-tier2-2026-08-02-c3984b2057650dea',
    count: 2_000,
    searches: tier2Searches,
    exclusions,
  });
  spec.stage0Exclusion = {
    manifestPath: 'stage0-manifest.json',
    manifestSha256: sha256(readFileSync(stage0Path)),
    identityCount: stage0Identities.length,
  };
  spec.capacityConstraint = {
    policy:
      'Start at ten times each v50 allocation; cap a stratum at its eligible count in the ' +
      'frozen Stage 0 metadata universe, then redistribute the shortfall by iterative ' +
      'largest-remainder weighting over the original nonzero v50 allocations with spare capacity.',
    capacitySourceManifest: 'stage0-manifest.json',
    capacitySourceManifestSha256: sha256(readFileSync(stage0Path)),
    eligibleByFirstMatchStratum: capacities,
    initialShortfall: base.searches.reduce(
      (sum, search) =>
        sum + Math.max(0, search.allocation * 10 - (capacities[search.id] ?? 0)),
      0,
    ),
  };
  writeJson(resolve(OUTPUT_ROOT, 'tier2-selection-spec.json'), spec);
  process.stdout.write(
    `prepared tier2 spec with ${stage0Identities.length} burned stage0 repositories and ` +
      `${exposure.identities.length} prior-exposure exclusions\n`,
  );
}

function finalizeCorpus() {
  authenticateSelector();
  const freshPath = resolve(OUTPUT_ROOT, 'tier2-fresh-manifest.json');
  const fresh = JSON.parse(readFileSync(freshPath, 'utf8'));
  if (!Array.isArray(fresh.selected) || fresh.selected.length !== 2_000) {
    throw new Error('fresh Tier 2 manifest must contain exactly 2,000 repositories');
  }
  const leaderboard = JSON.parse(gitShow(CEJEL_ROOT, CEJEL_RULE_COMMIT, 'leaderboard/corpus.json'));
  const legacy = leaderboard.entries
    .filter((entry) => entry.visibility === 'public')
    .map((entry) => {
      const fullName = entry.url
        .replace(/^https:\/\/github\.com\//, '')
        .replace(/\.git$/, '');
      return {
        fullName,
        url: entry.url,
        revision: entry.commit,
        cohort: 'legacy-23',
        legacyExpectedRawFindingCount: 0,
      };
    });
  if (legacy.length !== 23) throw new Error(`legacy cohort has ${legacy.length} entries`);
  const freshIdentities = new Set(fresh.selected.map((row) => normalizeIdentity(row.fullName)));
  const overlap = legacy.filter((row) => freshIdentities.has(normalizeIdentity(row.fullName)));
  if (overlap.length > 0) throw new Error('legacy-23 overlaps the fresh Tier 2 selection');
  const repositories = [
    ...fresh.selected.map((row) => ({
      fullName: row.fullName,
      url: row.url,
      revision: row.revision,
      selectionStratum: row.selectionStratum,
      cohort: 'fresh',
    })),
    ...legacy,
  ];
  writeJson(resolve(OUTPUT_ROOT, 'tier2-corpus.json'), {
    schemaVersion: 'cejel-d-series-tier2-corpus-v1',
    benchmarkId: 'cejel-d-series-base-rate-tier2-2026-08-02',
    freshSelectionManifest: {
      path: 'tier2-fresh-manifest.json',
      sha256: sha256(readFileSync(freshPath)),
      repositoryCount: 2_000,
    },
    legacySelectionSource: {
      repository: 'BargLabs/cejel',
      commit: CEJEL_RULE_COMMIT,
      path: 'leaderboard/corpus.json',
      sha256: sha256(gitShow(CEJEL_ROOT, CEJEL_RULE_COMMIT, 'leaderboard/corpus.json')),
      repositoryCount: 23,
    },
    repositoryCount: repositories.length,
    repositories,
  });
  process.stdout.write('finalized Tier 2 corpus with 2,000 fresh and 23 legacy entries\n');
}

function writeIntegrity() {
  const names = [
    'preregistration.md',
    'control-anchors.json',
    'owned-corpus.json',
    'prior-exposure-exclusions.json',
    'stage0-selection-spec.json',
    'stage0-manifest.json',
    'stage0-manifest.order.jsonl',
    'stage0-manifest.universe.jsonl',
    'tier2-selection-spec.json',
    'tier2-fresh-manifest.json',
    'tier2-fresh-manifest.order.jsonl',
    'tier2-fresh-manifest.universe.jsonl',
    'tier2-corpus.json',
  ];
  writeJson(resolve(OUTPUT_ROOT, 'preregistration-integrity.json'), {
    schemaVersion: 'cejel-d-series-base-rate-preregistration-integrity-v1',
    files: Object.fromEntries(
      names.map((name) => [name, sha256(readFileSync(resolve(OUTPUT_ROOT, name)))]),
    ),
    scripts: {
      'scripts/d-series-base-rate-prepare.mjs': sha256(
        readFileSync(resolve(CEJEL_ROOT, 'scripts/d-series-base-rate-prepare.mjs')),
      ),
      'scripts/d-series-base-rate-scan.ts': sha256(
        readFileSync(resolve(CEJEL_ROOT, 'scripts/d-series-base-rate-scan.ts')),
      ),
    },
  });
  process.stdout.write('wrote preregistration integrity manifest\n');
}

const mode = process.argv[2];
if (mode === '--stage0') prepareStage0();
else if (mode === '--tier2') prepareTier2();
else if (mode === '--finalize') finalizeCorpus();
else if (mode === '--integrity') writeIntegrity();
else {
  throw new Error(
    'usage: d-series-base-rate-prepare.mjs --stage0|--tier2|--finalize|--integrity',
  );
}
