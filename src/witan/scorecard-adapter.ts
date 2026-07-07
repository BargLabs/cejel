import { readFileSync } from 'node:fs';

import type { WitanCriterionId, WitanInputSignal, WitanInputSignalFinding } from './schemas.js';

import { stripBom } from './json-safe.js';

// OpenSSF Scorecard JSON output — local structural types, no vendor SDK, offline-clean.
// Produced by `scorecard --repo=... --format=json`. Each check carries a 0-10 score
// (or -1 when inconclusive). Scorecard itself needs the network + a GitHub token to
// RUN; this adapter only PARSES its already-produced JSON, so Witan stays air-gap-clean.
interface ScorecardCheck {
  name?: string;
  score?: number;
  reason?: string;
  documentation?: { url?: string };
}

interface ScorecardDocument {
  repo?: { name?: string; commit?: string };
  scorecard?: { version?: string };
  score?: number;
  checks?: ScorecardCheck[];
}

// ---- Check → dimension mapping ----------------------------------------------
// Only trust-relevant checks are mapped; process/supply-chain checks land on the
// B-side and A2/A4. Checks with no clear trust meaning (License, Contributors,
// CII-Best-Practices, Webhooks) are intentionally UNMAPPED and dropped — Witan does
// not manufacture a penalty for a check that is not a trust criterion.
// B1/B5 are Alfred-substrate-specific (N/A for external code) so nothing maps there.
interface CheckRule {
  dimension: WitanCriterionId;
  weight: number;
}

const CHECK_RULES: Readonly<Record<string, CheckRule>> = {
  // B2 — PR outcome traceability
  'Branch-Protection': { dimension: 'B2', weight: 0.8 },
  'Code-Review': { dimension: 'B2', weight: 0.7 },
  // B3 — CI and QA discipline
  'Dangerous-Workflow': { dimension: 'B3', weight: 0.9 },
  'Token-Permissions': { dimension: 'B3', weight: 0.8 },
  'CI-Tests': { dimension: 'B3', weight: 0.7 },
  Maintained: { dimension: 'B3', weight: 0.3 },
  // B4 — audit trail / release integrity
  'Signed-Releases': { dimension: 'B4', weight: 0.7 },
  Packaging: { dimension: 'B4', weight: 0.4 },
  'Security-Policy': { dimension: 'B4', weight: 0.4 },
  // A4 — dependency hygiene
  Vulnerabilities: { dimension: 'A4', weight: 0.9 },
  'Pinned-Dependencies': { dimension: 'A4', weight: 0.8 },
  'Dependency-Update-Tool': { dimension: 'A4', weight: 0.6 },
  // A2 — data-layer / static analysis
  SAST: { dimension: 'A2', weight: 0.7 },
  'Binary-Artifacts': { dimension: 'A2', weight: 0.6 },
  // A1 — test integrity
  Fuzzing: { dimension: 'A1', weight: 0.3 },
};

// Scorecard score (0-10) → finding severity. A perfect check (10) and an
// inconclusive check (<0) produce NO finding. Only real weaknesses penalize.
function mapScoreToSeverity(score: number | undefined): WitanInputSignalFinding['severity'] | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score < 0) return null; // inconclusive (-1) → not ingested
  if (score >= 10) return null; // perfect → no penalty
  if (score <= 3) return 'critical';
  if (score <= 6) return 'warning';
  return 'info'; // 7-9 → minor
}

function dedupeFindings(findings: WitanInputSignalFinding[]): WitanInputSignalFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.ruleId}|${f.severity}|${f.location ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Parse an OpenSSF Scorecard JSON document (already loaded) into WitanInputSignal[].
// Groups findings by dimension so each dimension yields exactly one WitanInputSignal;
// the bucket weight is the max weight among its contributing checks (the most
// important weakness governs the bounded adjustment).
export function parseScorecardJson(raw: unknown): WitanInputSignal[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const doc = raw as ScorecardDocument;
  if (!Array.isArray(doc.checks)) return [];

  const buckets = new Map<
    WitanCriterionId,
    { weight: number; findings: WitanInputSignalFinding[] }
  >();

  for (const check of doc.checks) {
    const name = check.name;
    if (!name) continue;
    const rule = CHECK_RULES[name];
    if (!rule) continue; // unmapped check → dropped, never a default penalty
    const severity = mapScoreToSeverity(check.score);
    if (!severity) continue;

    const scoreText = typeof check.score === 'number' ? `${check.score}/10` : 'n/a';
    const message =
      `${name} (Scorecard ${scoreText}): ${check.reason ?? 'weakness detected'}`.slice(0, 500);
    const location = check.documentation?.url;

    const bucket = buckets.get(rule.dimension) ?? { weight: 0, findings: [] };
    bucket.weight = Math.max(bucket.weight, rule.weight);
    bucket.findings.push({
      ruleId: `scorecard:${name}`,
      severity,
      message,
      ...(location ? { location } : {}),
    });
    buckets.set(rule.dimension, bucket);
  }

  return Array.from(buckets.entries()).map(([dimension, { weight, findings }]) => ({
    source: 'scorecard',
    dimension,
    weight,
    findings: dedupeFindings(findings),
  }));
}

// Parse an OpenSSF Scorecard JSON file at the given path. No network — local file only.
export function parseScorecardFile(scorecardPath: string): WitanInputSignal[] {
  const raw: unknown = JSON.parse(stripBom(readFileSync(scorecardPath, 'utf8')));
  return parseScorecardJson(raw);
}
