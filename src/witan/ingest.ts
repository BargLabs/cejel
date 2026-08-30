import { lstatSync, opendirSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { WitanIngestProvenance, WitanInputSignal } from './schemas.js';

import { sanitizePresentationLine } from '../presentation-safety.js';

import { clampFinding } from './finding-limits.js';
import { isGenericSignalDocument, parseGenericJson } from './generic-adapter.js';
import { stripBom } from './json-safe.js';
import { type SarifDimensionRule, parseSarifJson } from './sarif-adapter.js';
import { parseScorecardJson } from './scorecard-adapter.js';
import {
  isMissingIngestPath,
  isResolvedIngestPathContained,
  resolveIngestFilePath,
} from './ingest-files.js';

export { resolveIngestFilePath } from './ingest-files.js';

function looksLikeSarif(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  return Array.isArray((raw as { runs?: unknown }).runs);
}

function looksLikeScorecard(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  return Array.isArray((raw as { checks?: unknown }).checks);
}

// Raw result/check/finding count for the detected format, independent of Witan's dimension
// mapping — used only to detect the "parsed fine but mapped nothing" case below.
function countRawEntries(raw: unknown): number {
  const obj = raw as { runs?: unknown; checks?: unknown; signals?: unknown };
  if (Array.isArray(obj.runs)) {
    return obj.runs.reduce((sum: number, run) => {
      const results = (run as { results?: unknown }).results;
      return sum + (Array.isArray(results) ? results.length : 0);
    }, 0);
  }
  if (Array.isArray(obj.checks)) return obj.checks.length;
  if (Array.isArray(obj.signals)) {
    return obj.signals.reduce((sum: number, signal) => {
      const findings = (signal as { findings?: unknown }).findings;
      return sum + (Array.isArray(findings) ? findings.length : 0);
    }, 0);
  }
  return 0;
}

// Best-effort tool name for the silent-zero warning below — derived straight from the raw
// document since a fully-dropped source never produces a WitanInputSignal to read it from.
function rawToolName(raw: unknown): string {
  const obj = raw as { runs?: unknown; tool?: unknown };
  if (Array.isArray(obj.runs)) {
    const firstRun = obj.runs[0] as { tool?: { driver?: { name?: string } } } | undefined;
    return firstRun?.tool?.driver?.name ?? 'unknown';
  }
  if (typeof obj.tool === 'string' && obj.tool.length > 0) return obj.tool;
  return 'scorecard';
}

// Parse a single external-scanner JSON file, auto-detecting SARIF / OpenSSF Scorecard / the
// generic Cejel external-signal shape by structure. Offline — reads a local file only.
export interface ParseIngestFileOptions {
  extraSarifDimensionRules?: readonly SarifDimensionRule[];
  maxFindingCandidates?: number;
  provenance?: WitanIngestProvenance;
}

const MAX_INGEST_SOURCE_LENGTH = 120;

// Scanner names are untrusted presentation input. Strip Unicode control/format characters and
// cap the complete source identifier before it reaches report JSON or any certificate renderer.
export function sanitizeIngestSource(source: string): string {
  return sanitizePresentationLine(source, {
    fallback: 'unknown',
    maxLength: MAX_INGEST_SOURCE_LENGTH,
  });
}

export function parseIngestFile(
  filePath: string,
  options: ParseIngestFileOptions = {},
): WitanInputSignal[] {
  const resolvedFilePath = resolveIngestFilePath(filePath);
  let raw: unknown;
  try {
    raw = JSON.parse(stripBom(readFileSync(resolvedFilePath, 'utf8')));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cejel: could not parse ingest file as JSON: ${filePath} (${message})`);
  }

  const rawCount = countRawEntries(raw);
  if (
    options.maxFindingCandidates !== undefined &&
    rawCount > options.maxFindingCandidates
  ) {
    throw new Error(
      `Cejel: ${rawCount.toLocaleString('en-US')} ingest finding candidates exceed the ${options.maxFindingCandidates.toLocaleString('en-US')} remaining retained ingest finding budget; refusing before adapter materialization.`,
    );
  }

  let signals: WitanInputSignal[] | undefined;
  if (looksLikeSarif(raw)) signals = parseSarifJson(raw, options.extraSarifDimensionRules);
  else if (looksLikeScorecard(raw)) signals = parseScorecardJson(raw);
  else if (isGenericSignalDocument(raw)) signals = parseGenericJson(raw);

  if (!signals) {
    throw new Error(
      `Cejel: unrecognized ingest file format: ${filePath} — expected SARIF (a "runs" array), OpenSSF Scorecard JSON (a "checks" array), or the versioned generic Cejel external-signal shape (a "version" string + "tool" string + "signals" array). See the cejel README "Aggregate your scanners".`,
    );
  }

  // A source that parses but maps to nothing must say so — the silent zero is exactly what
  // hid 488 dropped Semgrep findings (rule-default severity, not per-result) in production.
  const mappedCount = signals.reduce((sum, signal) => sum + signal.findings.length, 0);
  if (rawCount > 0 && mappedCount === 0) {
    process.stderr.write(
      `Cejel: ${rawCount} findings from ${rawToolName(raw)} (${filePath}), 0 mapped to trust criteria\n`,
    );
  }

  // Clamp every finding's variable-length fields (ruleId/message/location) to the schema's
  // caps here, at the single funnel all three adapters' output passes through — a scanner
  // that emits one over-long message must degrade to a truncated string, never fail the
  // whole certificate downstream in WitanReportSchema.parse().
  return signals.map((signal) => ({
    ...signal,
    source: sanitizeIngestSource(signal.source),
    provenance: options.provenance ?? 'operator_supplied',
    findings: signal.findings.map(clampFinding),
  }));
}

// Expand a glob-ish --ingest argument into concrete file paths. Supports a bare file path or
// a single `*` wildcard against one directory level (e.g. "reports/*.sarif") — sufficient for
// scanner-output globbing without a dependency; shells typically expand real glob syntax
// before it reaches argv, so this only matters for quoted patterns or auto-discovery.
// Returns [] (rather than throwing) when a wildcard pattern matches nothing.
export function expandIngestPattern(pattern: string, maxMatches = Number.POSITIVE_INFINITY): string[] {
  if (!pattern.includes('*')) return [pattern];

  const lastSlash = pattern.lastIndexOf('/');
  const dir = lastSlash === -1 ? '.' : pattern.slice(0, lastSlash);
  const filePattern = lastSlash === -1 ? pattern : pattern.slice(lastSlash + 1);
  const regexSource = filePattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexSource}$`);

  const entries: string[] = [];
  try {
    const directoryStat = lstatSync(resolve(dir));
    if (directoryStat.isSymbolicLink()) {
      throw new Error(`Cejel: refusing symlinked ingest directory: ${dir}`);
    }
    if (!directoryStat.isDirectory()) return [];
    const directory = opendirSync(dir);
    try {
      for (;;) {
        const entry = directory.readSync();
        if (!entry) break;
        if (!regex.test(entry.name)) continue;
        entries.push(entry.name);
        if (entries.length >= maxMatches) break;
      }
    } finally {
      directory.closeSync();
    }
  } catch (error) {
    if (!isMissingIngestPath(error)) throw error;
    return [];
  }

  return entries
    .sort()
    .map((name) => {
      const candidate = join(dir, name);
      resolveIngestFilePath(candidate, dir);
      return candidate;
    });
}

// Auto-discover .cejel/inputs/*.{sarif,json} under a repo root, layered on top of any
// explicit --ingest paths. Returns [] when the directory does not exist.
export function discoverIngestInputs(
  repoPath: string,
  maxMatches = Number.POSITIVE_INFINITY,
): string[] {
  const resolvedRoot = realpathSync(repoPath);
  const cejelDir = join(repoPath, '.cejel');
  const inputsDir = join(repoPath, '.cejel', 'inputs');
  const entries: string[] = [];
  try {
    const cejelStat = lstatSync(cejelDir);
    if (cejelStat.isSymbolicLink()) {
      throw new Error(`Cejel: refusing symlinked ingest path component: ${cejelDir}`);
    }
    if (!cejelStat.isDirectory()) {
      throw new Error(`Cejel: refusing non-directory ingest path component: ${cejelDir}`);
    }
    const inputsStat = lstatSync(inputsDir);
    if (inputsStat.isSymbolicLink()) {
      throw new Error(`Cejel: refusing symlinked ingest path component: ${inputsDir}`);
    }
    if (!inputsStat.isDirectory()) {
      throw new Error(`Cejel: refusing non-directory ingest path component: ${inputsDir}`);
    }
    const resolvedInputs = realpathSync(inputsDir);
    if (!isResolvedIngestPathContained(resolvedInputs, resolvedRoot)) {
      throw new Error(`Cejel: refusing auto-discovery directory outside the repository root.`);
    }
    const directory = opendirSync(inputsDir);
    try {
      for (;;) {
        const entry = directory.readSync();
        if (!entry) break;
        if (!/\.(sarif|json)$/i.test(entry.name)) continue;
        entries.push(entry.name);
        if (entries.length >= maxMatches) break;
      }
    } finally {
      directory.closeSync();
    }
  } catch (error) {
    if (!isMissingIngestPath(error)) throw error;
    return [];
  }

  return entries
    .sort()
    .map((name) => resolveIngestFilePath(join(inputsDir, name), inputsDir));
}
