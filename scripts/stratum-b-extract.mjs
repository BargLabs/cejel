#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PREREG_COMMIT = '238cc9a';

const REPOSITORIES = [
  ['BargLabs/alfred', '/Users/bargs/projects/alfred', '76a631be63cf1be2cd4d9c6b303626a7124864c4', 'primary'],
  ['BargLabs/cejel', '/Users/bargs/projects/cejel', '97564ad17ddde4c64d213f78c98d316c01b0c12a', 'primary'],
  ['BargStudio/egbert', '/Users/bargs/projects/egbert', 'b8346c235a9607c0efff31af6bb44a25ee4d16bb', 'expansion'],
  ['houman44/site-machine', '/Users/bargs/projects/site-machine', '1e4106f131f9af27a9a314a0dbb2ecc35c09b441', 'expansion'],
  ['houman44/edwin', '/Users/bargs/projects/edwin', '8a9e006d1bae6653f253608ddc11eb93570fc5a1', 'expansion'],
  ['BargStudio/therasyn', '/Users/bargs/projects/therasyn', '39f228590c2b2ecb47ddb420709d15c9271ad65a', 'expansion'],
  ['BargLabs/edwy', '/Users/bargs/projects/edwy', '99c1139ba187d7181ff9923edd782f66cc599aec', 'expansion'],
  ['houman44/knut', '/Users/bargs/projects/knut', '4609f13c43f8b772db2aee7020bd9dad8ffeca16', 'expansion'],
  ['BargLabs/wilfrid', '/Users/bargs/projects/wilfrid', 'da0a474d361dd472c92e59c07b63b6139c390e42', 'expansion'],
  ['houman44/barglabs-site', '/Users/bargs/projects/barglabs-site', '1e164da9400b0c7b8f073f2df5bafad3af48d643', 'expansion'],
  ['BargLabs/cejel-site', '/Users/bargs/projects/cejel-site', '5ed796e3dc9926ae69e0b2b018026c099d211a2e', 'expansion'],
].map(([slug, localPath, tip, scope]) => ({ slug, localPath, tip, scope }));

const SECRET_RULES = [
  ['private-key', /-----BEGIN [^-\n]*(?:PRIVATE|SECRET)[^-\n]*-----[\s\S]*?-----END [^-\n]+-----/gi],
  ['github-token', /\b(?:gh[opsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g],
  ['openai-key', /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
  ['bearer', /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi],
  ['embedded-url-credential', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/gi],
  ['workflow-secret-expression', /\$\{\{\s*secrets\.[^}]+\}\}/gi],
  ['credential-assignment', /((?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)\s*[:=]\s*)[^\s,;#]+/gi],
  ['env-assignment', /(^|\n)([+\- ]*[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*=\s*)[^\n]*/g],
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function scrub(text) {
  let value = String(text ?? '');
  const counts = {};
  for (const [category, pattern] of SECRET_RULES) {
    value = value.replace(pattern, (...args) => {
      counts[category] = (counts[category] ?? 0) + 1;
      if (category === 'credential-assignment') return `${args[1]}[REDACTED:${category}]`;
      if (category === 'env-assignment') return `${args[1]}${args[2]}[REDACTED:${category}]`;
      return `[REDACTED:${category}]`;
    });
  }
  return { value, counts };
}

function mergeCounts(target, source) {
  for (const [key, count] of Object.entries(source)) target[key] = (target[key] ?? 0) + count;
  return target;
}

function safeLabel(value, fallback = 'redacted-label') {
  const { value: cleaned } = scrub(String(value ?? ''));
  const singleLine = cleaned.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300);
  return singleLine || fallback;
}

function git(repoPath, args, options = {}) {
  return execFileSync('git', ['-C', repoPath, ...args], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trimEnd();
}

function eligiblePath(filePath) {
  const normalized = String(filePath ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
  const base = path.posix.basename(normalized);
  if (/^\.github\/(?:workflows|actions)\//.test(normalized)) return true;
  if (/^\.github\/(?:dependabot\.ya?ml|[^/]+\.(?:sh|bash|zsh|py|js|mjs|cjs|ts))$/.test(normalized)) return true;
  if (/^(?:package\.json|pnpm-workspace\.yaml|pyproject\.toml|tox\.ini|pytest\.ini|setup\.cfg|Makefile|Dockerfile[^/]*|compose[^/]*\.ya?ml|Procfile|turbo\.json|vercel\.json)$/.test(base)) return true;
  if (/^(?:tsconfig[^/]*\.json|eslint\.config\.[^.]+|prettier\.config\.[^.]+|vite\.config\.[^.]+|vitest\.config\.[^.]+|jest\.config\.[^.]+|playwright\.config\.[^.]+)$/.test(base)) return true;
  return /\.config\.(?:js|cjs|mjs|ts|json|yml|yaml)$/.test(base);
}

function changedFiles(repoPath, parent, commit) {
  const output = git(repoPath, ['diff', '--name-only', '--diff-filter=ACDMRTUXB', parent, commit, '--']);
  return output ? output.split('\n').filter(Boolean) : [];
}

function commitExists(repoPath, commit) {
  try {
    git(repoPath, ['cat-file', '-e', `${commit}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function firstParent(repoPath, commit) {
  return git(repoPath, ['rev-parse', `${commit}^1`]);
}

function configDiff(repoPath, parent, commit) {
  const diff = git(repoPath, ['diff', '--no-color', '--no-ext-diff', '--unified=0', parent, commit, '--']);
  const sections = diff.split(/(?=^diff --git )/m);
  return sections.filter((section) => {
    const header = section.match(/^diff --git a\/(.+?) b\/(.+)$/m);
    return header && (eligiblePath(header[1]) || eligiblePath(header[2]));
  }).join('');
}

function canonicalizeConfigDiff(rawDiff) {
  const redactions = {};
  const bodies = [];
  for (const line of rawDiff.split('\n')) {
    if (/^(?:diff --git |index |--- |\+\+\+|new file mode |deleted file mode |old mode |new mode |similarity index |rename from |rename to |@@)/.test(line)) continue;
    if (!/^[+-]/.test(line)) continue;
    const { value, counts } = scrub(line);
    mergeCounts(redactions, counts);
    bodies.push(value.replace(/[ \t]+$/g, ''));
  }
  return { canonical: bodies.join('\n'), redactions };
}

function normalizeJobName(name) {
  return safeLabel(name).replace(/\s+\([^()]*(?:,[^()]*)?\)\s*$/, '').trim();
}

function checkConclusion(value) {
  const normalized = String(value ?? '').toLowerCase();
  if (!normalized) return null;
  return normalized === 'success' ? 'success' : normalized;
}

class GitHub {
  constructor(token) {
    this.token = token;
    this.cache = new Map();
    this.requests = 0;
  }

  async get(endpoint) {
    if (this.cache.has(endpoint)) return this.cache.get(endpoint);
    const url = `https://api.github.com${endpoint}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'cejel-stratum-b-measurement',
      },
    });
    this.requests++;
    if (!response.ok) throw new Error(`GitHub request failed: ${response.status} ${endpoint.replace(/[?#].*$/, '')}`);
    const body = await response.json();
    this.cache.set(endpoint, body);
    return body;
  }

  async pages(endpoint, arrayKey = null) {
    const rows = [];
    for (let page = 1; ; page++) {
      const separator = endpoint.includes('?') ? '&' : '?';
      const body = await this.get(`${endpoint}${separator}per_page=100&page=${page}`);
      const values = arrayKey ? body[arrayKey] : body;
      if (!Array.isArray(values)) throw new Error(`expected array at ${endpoint.replace(/[?#].*$/, '')}`);
      rows.push(...values);
      if (values.length < 100) return rows;
    }
  }

  async associatedPr(slug, commit) {
    const prs = await this.pages(`/repos/${slug}/commits/${commit}/pulls`);
    return prs
      .filter((pr) => pr.merged_at && pr.base?.ref === 'main' && pr.merge_commit_sha === commit)
      .sort((a, b) => a.number - b.number)[0] ?? null;
  }

  async prCommits(slug, number) {
    const rows = await this.pages(`/repos/${slug}/pulls/${number}/commits`);
    return rows.map((row) => row.sha).filter((sha) => /^[0-9a-f]{40}$/.test(sha));
  }

  async remoteChangedFiles(slug, commit) {
    const row = await this.get(`/repos/${slug}/commits/${commit}`);
    return (row.files ?? []).map((file) => file.filename).filter(Boolean);
  }

  async checks(slug, commit) {
    const checkRuns = await this.pages(`/repos/${slug}/commits/${commit}/check-runs?filter=all`, 'check_runs');
    const status = await this.get(`/repos/${slug}/commits/${commit}/status?per_page=100`);
    const rows = [];
    for (const check of checkRuns) {
      const conclusion = checkConclusion(check.conclusion);
      if (check.status !== 'completed' || !conclusion) continue;
      rows.push({
        name: normalizeJobName(check.name),
        conclusion,
        source: 'check-run',
        completedAt: check.completed_at ?? '',
      });
    }
    for (const legacy of status.statuses ?? []) {
      const conclusion = checkConclusion(legacy.state);
      if (!conclusion) continue;
      rows.push({
        name: normalizeJobName(legacy.context),
        conclusion,
        source: 'commit-status',
        completedAt: legacy.updated_at ?? legacy.created_at ?? '',
      });
    }
    return rows;
  }
}

async function sequenceForCandidate(repo, anchor, parent, github) {
  const pr = await github.associatedPr(repo.slug, anchor);
  if (!pr) return { pr: null, commits: [parent, anchor], configIndices: [1] };
  const commits = await github.prCommits(repo.slug, pr.number);
  if (!commits.includes(anchor)) commits.push(anchor);
  const configIndices = [];
  for (let index = 0; index < commits.length; index++) {
    const commit = commits[index];
    let files = [];
    if (commit === anchor) files = changedFiles(repo.localPath, parent, anchor);
    else if (commitExists(repo.localPath, commit)) {
      try { files = changedFiles(repo.localPath, firstParent(repo.localPath, commit), commit); } catch {}
    }
    if (files.length === 0) files = await github.remoteChangedFiles(repo.slug, commit);
    if (files.some(eligiblePath)) configIndices.push(index);
  }
  return {
    pr: pr.number,
    commits,
    configIndices: configIndices.length ? configIndices : [commits.length - 1],
  };
}

function transitionsForSequence(sequence, checksByCommit) {
  const lastConfigIndex = Math.max(...sequence.configIndices);
  const byName = new Map();
  for (let index = 0; index < sequence.commits.length; index++) {
    for (const check of checksByCommit[index]) {
      if (!check.name) continue;
      const rows = byName.get(check.name) ?? [];
      rows.push({ ...check, index, commit: sequence.commits[index] });
      byName.set(check.name, rows);
    }
  }
  const transitions = [];
  for (const [name, rows] of byName) {
    const failures = rows.filter((row) => row.conclusion !== 'success');
    const successes = rows.filter((row) => row.conclusion === 'success' && row.index >= lastConfigIndex);
    let chosen = null;
    for (const success of successes) {
      const failure = failures.filter((row) => row.index < success.index).at(-1);
      if (failure) { chosen = { failure, success }; break; }
    }
    if (!chosen) continue;
    transitions.push({
      name,
      failedCommit: chosen.failure.commit,
      failedConclusion: chosen.failure.conclusion,
      successCommit: chosen.success.commit,
      successConclusion: chosen.success.conclusion,
      source: chosen.success.source,
    });
  }
  return transitions.sort((a, b) => a.name.localeCompare(b.name));
}

function frozenDefectShas(repoRoot) {
  const files = [
    path.join(repoRoot, 'docs/experiments/strata-a-yield-2026-08-01.md'),
    path.join(repoRoot, 'docs/experiments/session-trace-recall-result-2026-08-01.md'),
  ];
  const shas = new Set();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(?:Fix SHA|Fix):\s*`([0-9a-f]{40})`/g)) shas.add(match[1]);
  }
  if (shas.size !== 16) throw new Error(`expected 16 frozen defect SHAs, found ${shas.size}`);
  return shas;
}

async function measureRepository(repo, github, frozenShas) {
  if (git(repo.localPath, ['rev-parse', repo.tip]) !== repo.tip) throw new Error(`frozen tip does not resolve: ${repo.slug}`);
  const history = git(repo.localPath, ['rev-list', '--first-parent', '--reverse', repo.tip]).split('\n').filter(Boolean);
  const localCandidates = [];
  for (let index = 1; index < history.length; index++) {
    const anchor = history[index];
    const parent = history[index - 1];
    const files = changedFiles(repo.localPath, parent, anchor);
    const eligibleFiles = files.filter(eligiblePath);
    if (eligibleFiles.length === 0) continue;
    const rawDiff = configDiff(repo.localPath, parent, anchor);
    const { canonical, redactions } = canonicalizeConfigDiff(rawDiff);
    if (!canonical) continue;
    localCandidates.push({
      repo: repo.slug,
      fixSha: anchor,
      parentSha: parent,
      committedAt: Number(git(repo.localPath, ['show', '-s', '--format=%ct', anchor])),
      eligibleFiles: eligibleFiles.map((file) => safeLabel(file)),
      contentId: sha256(canonical),
      redactions,
      overlapsFrozen16: frozenShas.has(anchor),
    });
  }

  const candidates = [];
  const exclusions = {};
  for (let index = 0; index < localCandidates.length; index++) {
    const candidate = localCandidates[index];
    process.stderr.write(`${repo.slug} ${index + 1}/${localCandidates.length} ${candidate.fixSha.slice(0, 8)}\n`);
    try {
      const sequence = await sequenceForCandidate(repo, candidate.fixSha, candidate.parentSha, github);
      const checksByCommit = [];
      for (const commit of sequence.commits) checksByCommit.push(await github.checks(repo.slug, commit));
      const transitions = transitionsForSequence(sequence, checksByCommit);
      if (transitions.length === 0) {
        exclusions['no same-name non-success-to-success transition'] = (exclusions['no same-name non-success-to-success transition'] ?? 0) + 1;
        continue;
      }
      candidates.push({ ...candidate, pr: sequence.pr, transitions });
    } catch (error) {
      const key = `API/resolution failure: ${safeLabel(error.message).replace(/[0-9a-f]{40}/g, '[commit]')}`;
      exclusions[key] = (exclusions[key] ?? 0) + 1;
    }
  }

  return {
    repository: repo.slug,
    frozenTip: repo.tip,
    scope: repo.scope,
    firstParentCommits: history.length,
    eligibleConfigAnchors: localCandidates.length,
    namedTransitionCandidatesBeforeContentDedup: candidates.length,
    exclusions,
    candidates,
  };
}

function contentDeduplicate(repositoryResults) {
  const rows = repositoryResults.flatMap((result) => result.candidates);
  rows.sort((a, b) => a.committedAt - b.committedAt || a.repo.localeCompare(b.repo) || a.fixSha.localeCompare(b.fixSha));
  const canonicalByContent = new Map();
  for (const row of rows) {
    const previous = canonicalByContent.get(row.contentId);
    if (!previous) {
      canonicalByContent.set(row.contentId, row);
      row.duplicateOf = null;
    } else {
      row.duplicateOf = { repo: previous.repo, fixSha: previous.fixSha };
    }
  }
  return rows;
}

async function run(outputPath, requestedSlugs) {
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error('GH_TOKEN is required');
  const github = new GitHub(token);
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const frozenShas = frozenDefectShas(repoRoot);
  const selected = requestedSlugs.length
    ? REPOSITORIES.filter((repo) => requestedSlugs.includes(repo.slug))
    : REPOSITORIES.filter((repo) => repo.scope === 'primary');
  if (selected.length === 0) throw new Error('no repositories selected');
  const repositories = [];
  for (const repo of selected) repositories.push(await measureRepository(repo, github, frozenShas));
  const rows = contentDeduplicate(repositories);
  const output = {
    schemaVersion: 1,
    preregistrationCommit: PREREG_COMMIT,
    generatedAt: new Date().toISOString(),
    githubRequests: github.requests,
    repositories: repositories.map(({ candidates, ...summary }) => summary),
    candidates: rows,
    totals: {
      eligibleConfigAnchors: repositories.reduce((sum, row) => sum + row.eligibleConfigAnchors, 0),
      namedTransitionCandidatesBeforeContentDedup: rows.length,
      contentUniqueNamedTransitionCandidates: rows.filter((row) => !row.duplicateOf).length,
      predecessorOverlaps: rows.filter((row) => row.overlapsFrozen16).length,
      redactionCounts: rows.reduce((counts, row) => mergeCounts(counts, row.redactions), {}),
    },
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
  const safeSummary = { ...output, candidates: undefined };
  console.log(JSON.stringify(safeSummary, null, 2));
}

export {
  canonicalizeConfigDiff,
  eligiblePath,
  normalizeJobName,
  scrub,
  transitionsForSequence,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outputPath = process.argv[2] ?? '/tmp/stratum-b-extraction.json';
  const requestedSlugs = process.argv.slice(3);
  await run(outputPath, requestedSlugs);
}
