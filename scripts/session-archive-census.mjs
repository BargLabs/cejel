#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPrivatePortfolioConfig } from './portfolio-repo-registry.mjs';

// This census is deliberately content-blind. It may stat paths and inspect names,
// but it must not open, read, or hash transcript or shell-history bodies.

const home = os.homedir();
const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const frozenSnapshot = {
  cutoff: '2026-08-01T17:18:11.396Z',
  provisionalTranscriptIds: 3_542,
  postSnapshotLedger: 'docs/experiments/session-archive-census-post-snapshot-ids-2026-08-01.json',
  idsKnownAtFirstPostSnapshotCheck: 18,
};
const frozenSnapshotCutoff = new Date(frozenSnapshot.cutoff);

export const deniedArchiveRoots = [
  {
    label: 'claude-cli-nodejs-cache',
    root: path.join(home, 'Library/Caches/claude-cli-nodejs'),
    // MCP connector logs can contain third-party message bodies, queries, and result rows.
    // Their path is sufficient to classify them as non-transcript material; never open them.
    reason: 'MCP connector caches are not agent transcripts and may contain third-party content.',
  },
];

export function isDeniedArchivePath(candidate, deniedRoots = deniedArchiveRoots.map(({ root }) => root)) {
  const resolvedCandidate = path.resolve(candidate);
  return deniedRoots.some((root) => {
    const resolvedRoot = path.resolve(root);
    return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
  });
}

const sources = [
  { label: 'codex-active', family: 'codex', root: path.join(home, '.codex/sessions') },
  { label: 'codex-archived', family: 'codex', root: path.join(home, '.codex/archived_sessions') },
  { label: 'codex-air-migration', family: 'codex', root: path.join(home, '.alfred/trace/archive/air/codex') },
  {
    label: 'codex-macbook-active-migration',
    family: 'codex',
    root: path.join(home, '.alfred/trace/archive/Houmans-MacBook-Pro/codex/sessions'),
  },
  {
    label: 'codex-macbook-archived-migration',
    family: 'codex',
    root: path.join(home, '.alfred/trace/archive/Houmans-MacBook-Pro/codex/archived_sessions'),
  },
  { label: 'claude-code-live', family: 'claude-code', root: path.join(home, '.claude/projects') },
  {
    label: 'claude-code-macbook-migration',
    family: 'claude-code',
    root: path.join(home, '.alfred/trace/archive/Houmans-MacBook-Pro/claude-code'),
  },
  {
    label: 'cowork-live',
    family: 'cowork',
    root: path.join(home, 'Library/Application Support/Claude/local-agent-mode-sessions'),
  },
  {
    label: 'cowork-partial-141248',
    family: 'cowork',
    root: path.join(home, 'Library/Application Support/Claude.partial.20260611-141248/local-agent-mode-sessions'),
  },
  {
    label: 'cowork-partial-142030',
    family: 'cowork',
    root: path.join(home, 'Library/Application Support/Claude.partial.20260611-142030/local-agent-mode-sessions'),
  },
  { label: 'cowork-alfred-archive', family: 'cowork', root: path.join(home, '.alfred/trace/cowork-archive') },
  {
    label: 'cowork-macbook-migration',
    family: 'cowork',
    root: path.join(home, '.alfred/trace/archive/Houmans-MacBook-Pro/cowork'),
  },
];

const shellSources = [
  { label: 'zsh-history-live', root: path.join(home, '.zsh_history') },
  { label: 'zsh-session-fragments', root: path.join(home, '.zsh_sessions') },
  { label: 'codex-shell-snapshots', root: path.join(home, '.codex/shell_snapshots') },
  { label: 'claude-shell-snapshots', root: path.join(home, '.claude/shell-snapshots') },
  {
    label: 'macbook-shell-history-snapshot',
    root: path.join(home, '.alfred/trace/archive/Houmans-MacBook-Pro/shell-history-2026-07-11'),
  },
  {
    label: 'macbook-codex-shell-snapshots',
    root: path.join(home, '.alfred/trace/archive/Houmans-MacBook-Pro/codex/shell_snapshots'),
  },
];

const secondaryExports = [
  { label: 'icloud-claude-documents', root: path.join(home, 'Library/Mobile Documents/com~apple~CloudDocs/Documents/Claude') },
  { label: 'icloud-codex-documents', root: path.join(home, 'Library/Mobile Documents/com~apple~CloudDocs/Documents/Codex') },
  { label: 'alfred-session-docs', root: path.join(home, 'projects/alfred/docs/sessions') },
  { label: 'lab-session-pdfs', root: path.join(home, 'projects/lab_notes/_business/session_pdfs_2026-06-30') },
  ...loadPrivatePortfolioConfig().sessionArchiveSecondaryExports.map(({ label, relativeRoot }) => ({
    label,
    root: path.join(home, relativeRoot),
  })),
];

function extensionOf(file) {
  const extension = path.extname(file).toLowerCase();
  return extension || '<none>';
}

function visibleSessionId(file) {
  if (path.extname(file).toLowerCase() !== '.jsonl') return null;
  const basename = path.basename(file, '.jsonl');
  const matches = basename.match(uuidPattern);
  if (!matches) return null;
  if (basename.startsWith('agent-')) return null;
  return matches[0].toLowerCase();
}

export function walkMetadata(root, { deniedRoots = deniedArchiveRoots.map((item) => item.root) } = {}) {
  const summary = {
    exists: false,
    files: 0,
    bytes: 0,
    jsonlFiles: 0,
    provisionalLocalSessionDirs: 0,
    localWorkspaceIds: new Set(),
    stableIds: new Set(),
    stableIdsAtFrozenSnapshot: new Set(),
    stableIdsAfterFrozenSnapshot: new Set(),
    extensions: new Map(),
    earliestMtime: null,
    latestMtime: null,
    embeddedDates: [],
    deniedSubtreesSkipped: 0,
  };
  if (isDeniedArchivePath(root, deniedRoots)) {
    summary.deniedSubtreesSkipped = 1;
    return summary;
  }
  if (!fs.existsSync(root)) return summary;
  summary.exists = true;
  const rootStat = fs.lstatSync(root);
  const stack = [root];
  if (rootStat.isFile()) stack.splice(0, 1, root);

  while (stack.length) {
    const current = stack.pop();
    if (isDeniedArchivePath(current, deniedRoots)) {
      summary.deniedSubtreesSkipped++;
      continue;
    }
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      const localWorkspaceId = path.basename(current).match(/(?:^|-)local[_-]([0-9a-f-]{36})(?:-outputs)?$/i)?.[1];
      if (localWorkspaceId) {
        summary.provisionalLocalSessionDirs++;
        summary.localWorkspaceIds.add(localWorkspaceId.toLowerCase());
      }
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        stack.push(path.join(current, entry.name));
      }
      continue;
    }
    if (!stat.isFile()) continue;

    summary.files++;
    summary.bytes += stat.size;
    const extension = extensionOf(current);
    summary.extensions.set(extension, (summary.extensions.get(extension) ?? 0) + 1);
    if (extension === '.jsonl') summary.jsonlFiles++;
    const sessionId = visibleSessionId(current);
    if (sessionId) {
      summary.stableIds.add(sessionId);
      if (stat.birthtime <= frozenSnapshotCutoff) summary.stableIdsAtFrozenSnapshot.add(sessionId);
      else summary.stableIdsAfterFrozenSnapshot.add(sessionId);
    }
    const date = path.basename(current).match(/rollout-(\d{4}-\d{2}-\d{2})/i)?.[1];
    if (date) summary.embeddedDates.push(date);
    const mtime = stat.mtime.toISOString();
    if (!summary.earliestMtime || mtime < summary.earliestMtime) summary.earliestMtime = mtime;
    if (!summary.latestMtime || mtime > summary.latestMtime) summary.latestMtime = mtime;
  }
  return summary;
}

function countDeniedTree(root) {
  const summary = { exists: false, directories: 0, files: 0, jsonlFiles: 0, bytes: 0 };
  if (!fs.existsSync(root)) return summary;
  summary.exists = true;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      summary.directories++;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        stack.push(path.join(current, entry.name));
      }
      continue;
    }
    if (!stat.isFile()) continue;
    summary.files++;
    if (path.extname(current).toLowerCase() === '.jsonl') summary.jsonlFiles++;
    summary.bytes += stat.size;
  }
  return summary;
}

function serializeSummary(summary) {
  const extensions = [...summary.extensions.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([extension, files]) => ({ extension, files }));
  const embeddedDates = summary.embeddedDates.sort();
  return {
    exists: summary.exists,
    files: summary.files,
    bytes: summary.bytes,
    jsonlFiles: summary.jsonlFiles,
    stableSessionIdsVisibleInNames: summary.stableIds.size,
    stableSessionIdsAtFrozenSnapshot: summary.stableIdsAtFrozenSnapshot.size,
    stableSessionIdsAfterFrozenSnapshot: summary.stableIdsAfterFrozenSnapshot.size,
    provisionalLocalSessionDirs: summary.provisionalLocalSessionDirs,
    provisionalLocalWorkspaceIds: summary.localWorkspaceIds.size,
    earliestMtime: summary.earliestMtime,
    latestMtime: summary.latestMtime,
    embeddedDateRange: embeddedDates.length
      ? { earliest: embeddedDates[0], latest: embeddedDates.at(-1) }
      : null,
    topExtensions: extensions,
    deniedSubtreesSkipped: summary.deniedSubtreesSkipped,
  };
}

function overlapFor(family, collected) {
  const relevant = collected.filter((item) => item.family === family);
  const occurrences = new Map();
  for (const source of relevant) {
    for (const id of source.summary.stableIds) {
      const labels = occurrences.get(id) ?? [];
      labels.push(source.label);
      occurrences.set(id, labels);
    }
  }
  const duplicateIds = [...occurrences.values()].filter((labels) => labels.length > 1);
  const pairCounts = new Map();
  for (const labels of duplicateIds) {
    const sorted = labels.sort();
    for (let index = 0; index < sorted.length; index++) {
      for (let other = index + 1; other < sorted.length; other++) {
        const pair = `${sorted[index]} <> ${sorted[other]}`;
        pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
      }
    }
  }
  return {
    stableIdsAcrossFamily: occurrences.size,
    stableIdsPresentInMultipleRoots: duplicateIds.length,
    extraRootParticipationsBeyondOnePerStableId: duplicateIds.reduce((sum, labels) => sum + labels.length - 1, 0),
    pairCounts: [...pairCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([pair, stableIds]) => ({ pair, stableIds })),
  };
}

function localWorkspaceOverlap(collected) {
  const relevant = collected.filter((item) => item.family === 'cowork');
  const occurrences = new Map();
  for (const source of relevant) {
    for (const id of source.summary.localWorkspaceIds) {
      const labels = occurrences.get(id) ?? [];
      labels.push(source.label);
      occurrences.set(id, labels);
    }
  }
  const duplicates = [...occurrences.values()].filter((labels) => labels.length > 1);
  const pairCounts = new Map();
  for (const labels of duplicates) {
    const sorted = labels.sort();
    for (let index = 0; index < sorted.length; index++) {
      for (let other = index + 1; other < sorted.length; other++) {
        const pair = `${sorted[index]} <> ${sorted[other]}`;
        pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
      }
    }
  }
  return {
    visibleLocalWorkspaceIdsAcrossRoots: occurrences.size,
    idsPresentInMultipleRoots: duplicates.length,
    extraRootParticipationsBeyondOnePerId: duplicates.reduce((sum, labels) => sum + labels.length - 1, 0),
    pairCounts: [...pairCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([pair, ids]) => ({ pair, ids })),
  };
}

function claudePathLineage(root) {
  const counts = { bargs: 0, houman: 0, private: 0, other: 0 };
  if (!fs.existsSync(root) || !fs.lstatSync(root).isDirectory()) return counts;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('-Users-bargs-')) counts.bargs++;
    else if (entry.name.startsWith('-Users-houman-')) counts.houman++;
    else if (entry.name.startsWith('-private-')) counts.private++;
    else counts.other++;
  }
  return counts;
}

function frozenFamilyIds(family, collected) {
  const ids = new Set();
  for (const source of collected.filter((item) => item.family === family)) {
    for (const id of source.summary.stableIdsAtFrozenSnapshot) ids.add(id);
  }
  return ids.size;
}

export function runCensus(outputPath = '/tmp/session-archive-census.json', { log = true } = {}) {
  const collected = sources.map((source) => ({ ...source, summary: walkMetadata(source.root) }));
  const frozenVisiblePopulation = {
    codex: frozenFamilyIds('codex', collected),
    claudeCode: frozenFamilyIds('claude-code', collected),
    cowork: frozenFamilyIds('cowork', collected),
  };
  const output = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    method: {
      contentBlind: true,
      rawBodiesRead: false,
      rawBodiesHashed: false,
      caution: 'Stable-ID overlap is provisional. Definitive content deduplication must occur only after in-memory credential scrubbing.',
    },
    frozenSnapshot: {
      ...frozenSnapshot,
      observedVisibleIdsByFamily: frozenVisiblePopulation,
      observedVisibleIdsTotal: Object.values(frozenVisiblePopulation).reduce((sum, count) => sum + count, 0),
    },
    deniedRoots: deniedArchiveRoots.map(({ label, root, reason }) => ({
      label,
      root,
      reason,
      ...countDeniedTree(root),
    })),
    sources: collected.map(({ label, family, root, summary }) => ({
      label,
      family,
      root,
      ...serializeSummary(summary),
    })),
    shellRecoveryMetadata: shellSources.map(({ label, root }) => ({ label, root, ...serializeSummary(walkMetadata(root)) })),
    secondaryExports: secondaryExports.map(({ label, root }) => ({ label, root, ...serializeSummary(walkMetadata(root)) })),
    visibleStableIdOverlap: {
      codex: overlapFor('codex', collected),
      claudeCode: overlapFor('claude-code', collected),
      cowork: overlapFor('cowork', collected),
      coworkLocalWorkspaces: localWorkspaceOverlap(collected),
    },
    migratedPathLineage: {
      claudeCodeLiveProjectKeys: claudePathLineage(path.join(home, '.claude/projects')),
    },
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
  if (log) console.log(JSON.stringify(output, null, 2));
  return output;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) runCensus(process.argv[2]);
