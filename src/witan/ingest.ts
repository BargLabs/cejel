import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { WitanInputSignal } from './schemas.js';

import { clampFinding } from './finding-limits.js';
import { isGenericSignalDocument, parseGenericJson } from './generic-adapter.js';
import { stripBom } from './json-safe.js';
import { type SarifDimensionRule, parseSarifJson } from './sarif-adapter.js';
import { parseScorecardJson } from './scorecard-adapter.js';

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
}

export function parseIngestFile(
  filePath: string,
  options: ParseIngestFileOptions = {},
): WitanInputSignal[] {
  let raw: unknown;
  try {
    raw = JSON.parse(stripBom(readFileSync(filePath, 'utf8')));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cejel: could not parse ingest file as JSON: ${filePath} (${message})`);
  }

  let signals: WitanInputSignal[] | undefined;
  if (looksLikeSarif(raw)) signals = parseSarifJson(raw, options.extraSarifDimensionRules);
  else if (looksLikeScorecard(raw)) signals = parseScorecardJson(raw);
  else if (isGenericSignalDocument(raw)) signals = parseGenericJson(raw);

  if (!signals) {
    throw new Error(
      `Cejel: unrecognized ingest file format: ${filePath} — expected SARIF (a "runs" array), OpenSSF Scorecard JSON (a "checks" array), or the generic Cejel external-signal shape (a "tool" string + "signals" array). See the cejel README "Aggregate your scanners".`,
    );
  }

  // A source that parses but maps to nothing must say so — the silent zero is exactly what
  // hid 488 dropped Semgrep findings (rule-default severity, not per-result) in production.
  const rawCount = countRawEntries(raw);
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
    findings: signal.findings.map(clampFinding),
  }));
}

// Expand a glob-ish --ingest argument into concrete file paths. Supports a bare file path or
// a single `*` wildcard against one directory level (e.g. "reports/*.sarif") — sufficient for
// scanner-output globbing without a dependency; shells typically expand real glob syntax
// before it reaches argv, so this only matters for quoted patterns or auto-discovery.
// Returns [] (rather than throwing) when a wildcard pattern matches nothing.
export function expandIngestPattern(pattern: string): string[] {
  if (!pattern.includes('*')) return [pattern];

  const lastSlash = pattern.lastIndexOf('/');
  const dir = lastSlash === -1 ? '.' : pattern.slice(0, lastSlash);
  const filePattern = lastSlash === -1 ? pattern : pattern.slice(lastSlash + 1);
  const regexSource = filePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexSource}$`);

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  return entries
    .filter((name) => regex.test(name))
    .sort()
    .map((name) => join(dir, name));
}

// Auto-discover .cejel/inputs/*.{sarif,json} under a repo root, layered on top of any
// explicit --ingest paths. Returns [] when the directory does not exist.
export function discoverIngestInputs(repoPath: string): string[] {
  const inputsDir = join(repoPath, '.cejel', 'inputs');
  let entries: string[];
  try {
    entries = readdirSync(inputsDir);
  } catch {
    return [];
  }

  return entries
    .filter((name) => /\.(sarif|json)$/i.test(name))
    .sort()
    .map((name) => join(inputsDir, name));
}
