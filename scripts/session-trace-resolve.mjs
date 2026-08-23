#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OPERATOR_HOME = os.homedir();
const projectPath = (name) => path.join(OPERATOR_HOME, 'projects', name);

const REPOSITORIES = {
  'BargLabs/cejel': { path: projectPath('cejel'), tip: '97564ad17ddde4c64d213f78c98d316c01b0c12a' },
  'BargStudio/egbert': { path: projectPath('egbert'), tip: 'b8346c235a9607c0efff31af6bb44a25ee4d16bb' },
  'houman44/site-machine': { path: projectPath('site-machine'), tip: '1e4106f131f9af27a9a314a0dbb2ecc35c09b441' },
  'BargLabs/alfred': { path: projectPath('alfred'), tip: '76a631be63cf1be2cd4d9c6b303626a7124864c4' },
  'houman44/edwin': { path: projectPath('edwin'), tip: '8a9e006d1bae6653f253608ddc11eb93570fc5a1' },
  'BargStudio/therasyn': { path: projectPath('therasyn'), tip: '39f228590c2b2ecb47ddb420709d15c9271ad65a' },
  'houman44/knut': { path: projectPath('knut'), tip: '4609f13c43f8b772db2aee7020bd9dad8ffeca16' },
  'BargLabs/edwy': { path: projectPath('edwy'), tip: '99c1139ba187d7181ff9923edd782f66cc599aec' },
  'BargLabs/wilfrid': { path: projectPath('wilfrid'), tip: 'da0a474d361dd472c92e59c07b63b6139c390e42' },
  'houman44/barglabs-site': { path: projectPath('barglabs-site'), tip: '1e164da9400b0c7b8f073f2df5bafad3af48d643' },
  'BargLabs/cejel-site': { path: projectPath('cejel-site'), tip: '5ed796e3dc9926ae69e0b2b018026c099d211a2e' },
};

const EXISTING_A1_A3 = new Set([
  'BargStudio/egbert@aa20b4acfb4fac17577274bf2f612d0626500e72',
  'BargStudio/egbert@34e1dcdde0c53aa2b147533bc735c5912c658d5f',
  'BargLabs/alfred@2e2e2362675b3ab8d3a106438aef8e7736b02147',
  'BargLabs/alfred@5da4234ed184a667135228db4450577e593c1629',
  'BargLabs/alfred@904c2ad2e8dd313860b359775ea02b208cdf1461',
  'BargLabs/alfred@1a9051f699368e5c52be4665c529c5af7fb6c18e',
  'BargLabs/alfred@3acc157a722974c340ba4f30f510eb36b9361247',
  'BargLabs/alfred@57475927ec5289e33c1fef0d2d6b49c8fa3177ac',
  'BargLabs/alfred@8a381574355fe58aad7ed7e4a6e60ad203d3dc54',
  'houman44/edwin@c3c43cd47ae9f82a581f6f06ebf4aac8c36320ed',
  'houman44/edwin@6974e35c9bd168a81e360d85b12d36b2c68dacc8',
  'houman44/edwin@b78a5d2cc54b75c794817b11765b84db205f2377',
  'houman44/edwin@f88aba3ccbf182707225b35f00fcb33e1de71786',
]);

const TEST_PATH = /(?:^|\/)(?:tests?|__tests__|spec)(?:\/|$)|\.(?:test|spec)\.[^/]+$/i;
const SOURCE_PATH = /\.(?:py|pyi|ts|tsx|js|jsx|mjs|cjs|go|rs|java|rb|php|cs|c|cc|cpp|h|hpp|sh|bash|zsh|sql|ya?ml|json|toml)$/i;
const NON_SOURCE_PATH = /(?:^|\/)(?:docs?|notes?|fixtures?|snapshots?|node_modules|dist|build|coverage)(?:\/|$)|\.(?:md|mdx|txt|png|jpe?g|gif|svg|pdf|lock)$/i;

function credentialToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  const result = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) throw new Error('GitHub credential lookup failed');
  const token = result.stdout.split('\n').find((line) => line.startsWith('password='))?.slice('password='.length);
  if (!token) throw new Error('GitHub credential token unavailable');
  return token;
}

function git(repo, args, options = {}) {
  return execFileSync('git', ['-C', repo.path, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
}

function resolveLocal(repo, prefix) {
  try {
    const sha = git(repo, ['rev-parse', `${prefix}^{commit}`]);
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch { return null; }
}

function isAncestor(repo, sha) {
  return spawnSync('git', ['-C', repo.path, 'merge-base', '--is-ancestor', sha, repo.tip], { stdio: 'ignore' }).status === 0;
}

function commitFiles(repo, sha) {
  try {
    return git(repo, ['diff', '--name-only', `${sha}^1`, sha]).split('\n').filter(Boolean);
  } catch { return []; }
}

function commitParent(repo, sha) {
  try { return git(repo, ['rev-parse', `${sha}^1`]); } catch { return null; }
}

function containsEditedFile(files, edited) {
  return edited.some((edit) => files.some((file) => file === edit || file.endsWith(`/${edit}`) || edit.endsWith(`/${file}`)));
}

function hasSourceAndTest(files) {
  return files.some((file) => TEST_PATH.test(file))
    && files.some((file) => SOURCE_PATH.test(file) && !TEST_PATH.test(file) && !NON_SOURCE_PATH.test(file));
}

function gh(token, endpoint) {
  const result = spawnSync('gh', ['api', '--method', 'GET', '-H', 'Accept: application/vnd.github+json', endpoint], {
    encoding: 'utf8', maxBuffer: 1024 * 1024 * 20, env: { ...process.env, GH_TOKEN: token },
  });
  if (result.status !== 0) throw new Error(`GitHub API request failed for ${endpoint}`);
  return JSON.parse(result.stdout);
}

function mergedMainPr(pr) {
  return pr?.merged_at && pr?.base?.ref === 'main' && /^[0-9a-f]{40}$/.test(pr?.merge_commit_sha ?? '');
}

function canonicalFromPr(token, candidateRepo, hint) {
  if (hint.repo.toLowerCase() !== candidateRepo.toLowerCase()) return { exclusion: 'PR hint repository differs from session repository' };
  let pr;
  try { pr = gh(token, `/repos/${candidateRepo}/pulls/${hint.pr}`); }
  catch { return { exclusion: 'PR hint could not be fetched' }; }
  if (!mergedMainPr(pr)) return { exclusion: 'PR hint is not a merged main PR' };
  return { sha: pr.merge_commit_sha, pr: hint.pr, sourceAnchor: `pr:${hint.pr}` };
}

function canonicalFromCommit(token, candidateRepo, repo, prefix) {
  const branchSha = resolveLocal(repo, prefix);
  if (!branchSha) return { exclusion: 'short commit hint does not resolve locally' };
  if (isAncestor(repo, branchSha)) return { sha: branchSha, pr: null, sourceAnchor: `commit:${branchSha}` };
  let prs;
  try { prs = gh(token, `/repos/${candidateRepo}/commits/${branchSha}/pulls?per_page=100`); }
  catch { return { exclusion: 'branch commit is off main and commit-to-PR lookup failed', branchSha }; }
  const merged = prs.filter(mergedMainPr);
  if (merged.length !== 1) return { exclusion: `branch commit maps to ${merged.length} merged main PRs`, branchSha };
  return { sha: merged[0].merge_commit_sha, pr: merged[0].number, sourceAnchor: `commit:${branchSha}`, branchSha };
}

function mergeCandidate(existing, candidate) {
  existing.providers = [...new Set([...existing.providers, ...candidate.providers])].sort();
  existing.sessionHashes = [...new Set([...existing.sessionHashes, ...candidate.sessionHashes])].sort();
  existing.namedTests = [...new Map([...existing.namedTests, ...candidate.namedTests].map((test) => [`${test.file}::${test.name}`, test])).values()];
  existing.editedSourceFiles = [...new Set([...existing.editedSourceFiles, ...candidate.editedSourceFiles])].sort();
  existing.coverage = [...new Set([...existing.coverage, ...candidate.coverage])].sort();
  existing.exactCommand ||= candidate.exactCommand;
  existing.sourceAnchors = [...new Set([...existing.sourceAnchors, ...candidate.sourceAnchors])].sort();
  existing.branchShas = [...new Set([...existing.branchShas, ...candidate.branchShas])].sort();
  existing.prs = [...new Set([...existing.prs, ...candidate.prs])].sort((a, b) => a - b);
}

function exclusionCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    const reason = row.exclusion ?? 'unknown';
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n);
}

function main() {
  const inputPath = process.argv[2] ?? '/tmp/session-trace-extraction.json';
  const outputPath = process.argv[3] ?? '/tmp/session-trace-resolved.json';
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const token = credentialToken();
  const rows = [];
  for (let index = 0; index < input.candidates.length; index++) {
    const candidate = input.candidates[index];
    const repo = REPOSITORIES[candidate.repo];
    if (!repo) {
      rows.push({ ...candidate, resolved: false, exclusion: 'repository is outside frozen scope' });
      continue;
    }
    let canonical;
    if (candidate.anchorAction.prs.length) canonical = canonicalFromPr(token, candidate.repo, candidate.anchorAction.prs[0]);
    else canonical = canonicalFromCommit(token, candidate.repo, repo, candidate.anchorAction.shaPrefixes[0]);
    if (!canonical.sha) {
      rows.push({ ...candidate, resolved: false, ...canonical });
      continue;
    }
    const fullSha = resolveLocal(repo, canonical.sha);
    if (!fullSha) {
      rows.push({ ...candidate, resolved: false, ...canonical, exclusion: 'canonical merged SHA does not resolve locally' });
      continue;
    }
    if (!isAncestor(repo, fullSha)) {
      rows.push({ ...candidate, resolved: false, ...canonical, fixSha: fullSha, exclusion: 'canonical SHA is not an ancestor of the frozen tip' });
      continue;
    }
    const files = commitFiles(repo, fullSha);
    const containsEdit = containsEditedFile(files, candidate.editedSourceFiles);
    const condition2 = hasSourceAndTest(files);
    rows.push({
      ...candidate,
      resolved: containsEdit && condition2,
      fixSha: fullSha,
      parentSha: commitParent(repo, fullSha),
      pr: canonical.pr,
      branchSha: canonical.branchSha ?? null,
      sourceAnchor: canonical.sourceAnchor,
      files,
      containsSessionEdit: containsEdit,
      condition2,
      exclusion: !containsEdit ? 'canonical patch does not contain a session-edited source path'
        : !condition2 ? 'canonical patch does not touch both source and test files' : null,
    });
    if ((index + 1) % 20 === 0) process.stderr.write(`resolved ${index + 1}/${input.candidates.length}\n`);
  }

  const unique = new Map();
  for (const row of rows.filter((candidate) => candidate.resolved)) {
    const key = `${row.repo}@${row.fixSha}`;
    const safe = {
      repo: row.repo,
      fixSha: row.fixSha,
      parentSha: row.parentSha,
      prs: row.pr == null ? [] : [row.pr],
      providers: [row.provider],
      sessionHashes: [row.sessionHash],
      namedTests: row.namedTests,
      editedSourceFiles: row.editedSourceFiles,
      files: row.files,
      coverage: [row.coverage],
      exactCommand: row.exactCommand,
      sourceAnchors: [row.sourceAnchor],
      branchShas: row.branchSha ? [row.branchSha] : [],
      overlapsA1A3: EXISTING_A1_A3.has(key),
    };
    if (unique.has(key)) mergeCandidate(unique.get(key), safe);
    else unique.set(key, safe);
  }
  const candidates = [...unique.values()].sort((a, b) => `${a.repo}@${a.fixSha}`.localeCompare(`${b.repo}@${b.fixSha}`));
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    inputCandidates: input.candidates.length,
    rowsResolvedBeforeDefectDedup: rows.filter((row) => row.resolved).length,
    uniqueResolvedFixes: candidates.length,
    overlapA1A3: candidates.filter((candidate) => candidate.overlapsA1A3).length,
    newResolvedFixes: candidates.filter((candidate) => !candidate.overlapsA1A3).length,
    exactCommandResolvedFixes: candidates.filter((candidate) => candidate.exactCommand).length,
    exclusionCounts: exclusionCounts(rows.filter((row) => !row.resolved)),
    rows,
    candidates,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ ...result, rows: undefined, candidates: undefined }, null, 2));
}

main();
