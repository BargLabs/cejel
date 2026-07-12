import { readFileSync } from 'node:fs';

import type { WitanCriterionId, WitanInputSignal, WitanInputSignalFinding } from './schemas.js';

import { stripBom } from './json-safe.js';

// SARIF 2.1.0 structural types — local, no vendor SDK, offline-clean.
interface SarifLocation {
  physicalLocation?: {
    artifactLocation?: { uri?: string };
    region?: { startLine?: number };
  };
}

interface SarifResult {
  ruleId?: string;
  level?: 'error' | 'warning' | 'note' | 'none';
  message?: { text?: string };
  locations?: SarifLocation[];
}

interface SarifReportingDescriptor {
  id?: string;
  defaultConfiguration?: { level?: 'error' | 'warning' | 'note' | 'none' };
}

interface SarifToolDriver {
  name?: string;
  rules?: SarifReportingDescriptor[];
}

interface SarifRun {
  tool?: { driver?: SarifToolDriver };
  results?: SarifResult[];
}

interface SarifDocument {
  version?: string;
  runs?: SarifRun[];
}

// ---- Dimension mapping -------------------------------------------------------
// Maps SARIF rule patterns to Witan dimensions and weights.
// Ordered from most specific to least; first match wins.

// Exported so a domain rule pack can extend the mapping via parseSarifJson/parseSarifFile's
// extraDimensionRules parameter instead of being baked into this general adapter
// (goal_cejel_public_extraction_ip_scrub_2026-07-10).
export interface SarifDimensionRule {
  pattern: RegExp;
  dimension: WitanCriterionId;
  weight: number;
}

const DIMENSION_RULES: readonly SarifDimensionRule[] = [
  // A2 — injection / secrets / auth (high weight)
  {
    pattern:
      /sql[- _]?inject|cwe-89|sqli|command[- _]?inject|cwe-78|os[- _]?cmd|rce|remote[- _]?code/i,
    dimension: 'A2',
    weight: 0.9,
  },
  {
    pattern:
      /secret|credential|api[- _]?key|password[- _]?leak|hardcoded[- _]?(token|key|secret)|cwe-259|cwe-798/i,
    dimension: 'A2',
    weight: 0.9,
  },
  {
    pattern: /path[- _]?traversal|directory[- _]?traversal|cwe-22|lfi|rfi/i,
    dimension: 'A2',
    weight: 0.8,
  },
  {
    pattern: /ssrf|server[- _]?side[- _]?request[- _]?forg|cwe-918/i,
    dimension: 'A2',
    weight: 0.8,
  },
  {
    pattern: /xxe|xml[- _]?external[- _]?entity|cwe-611/i,
    dimension: 'A2',
    weight: 0.8,
  },
  {
    pattern: /auth[- _]?bypass|broken[- _]?auth|missing[- _]?auth|cwe-287|cwe-306|cwe-863|cwe-862/i,
    dimension: 'A2',
    weight: 0.7,
  },
  {
    pattern: /xss|cross[- _]?site[- _]?script|cwe-79/i,
    dimension: 'A2',
    weight: 0.6,
  },
  // A4 — dependency vulnerabilities
  {
    pattern:
      /cve-\d{4}-\d+|supply[- _]?chain|depend[a-z]*[- _]?vulner|outdated[- _]?depend|deprecated[- _]?package/i,
    dimension: 'A4',
    weight: 0.8,
  },
  {
    pattern: /npm[- _]?audit|yarn[- _]?audit|pnpm[- _]?audit|pip[- _]?audit|cargo[- _]?audit/i,
    dimension: 'A4',
    weight: 0.7,
  },
  // A3 — production readiness / insecure config
  {
    pattern:
      /insecure[- _]?tls|weak[- _]?cipher|tls[- _]?version|http[- _]?strict|hsts|csp[- _]?missing|cwe-326|cwe-327/i,
    dimension: 'A3',
    weight: 0.5,
  },
  {
    pattern: /error[- _]?handl|unhandled[- _]?exception|crash|uncaught|stacktrace[- _]?leak/i,
    dimension: 'A3',
    weight: 0.4,
  },
  {
    pattern: /debug[- _]?mode|dev[- _]?endpoint|staging[- _]?secret/i,
    dimension: 'A3',
    weight: 0.4,
  },
  // A1 — test integrity (low weight; SARIF rarely surfaces this)
  {
    pattern: /skipped[- _]?test|hollow[- _]?test|empty[- _]?assert|no[- _]?assertion/i,
    dimension: 'A1',
    weight: 0.2,
  },
];

// Default for unmatched security-scanner findings: land on A2 with low weight.
const DEFAULT_DIMENSION: WitanCriterionId = 'A2';
const DEFAULT_WEIGHT = 0.3;

// Severity level at which note/none findings are discarded rather than ingested.
// info findings from notes are included; pure 'none' level findings are dropped.
const DROP_LEVEL = new Set<string>(['none']);

function mapLevel(level: string | undefined): WitanInputSignalFinding['severity'] | null {
  if (!level || DROP_LEVEL.has(level)) return null;
  if (level === 'error') return 'critical';
  if (level === 'warning') return 'warning';
  return 'info'; // note → info
}

function mapRuleToDimension(
  ruleId: string,
  rules: readonly SarifDimensionRule[],
): { dimension: WitanCriterionId; weight: number } {
  for (const rule of rules) {
    if (rule.pattern.test(ruleId)) {
      return { dimension: rule.dimension, weight: rule.weight };
    }
  }
  return { dimension: DEFAULT_DIMENSION, weight: DEFAULT_WEIGHT };
}

function renderLocation(result: SarifResult): string | undefined {
  const loc = result.locations?.[0]?.physicalLocation;
  if (!loc) return undefined;
  const uri = loc.artifactLocation?.uri;
  const line = loc.region?.startLine;
  if (!uri) return undefined;
  return line != null ? `${uri}:${line}` : uri;
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

// Parse a SARIF 2.1.0 JSON document (already loaded) into WitanInputSignal[].
// Groups findings by (source × dimension) so each (source, dimension) pair
// produces exactly one WitanInputSignal.
//
// extraDimensionRules lets a caller append a domain rule pack to the built-in generic
// mapping (built-ins keep precedence; extras are checked after, before the A2 default).
// Without it, only the generic security/dependency/config/test rules above apply.
export function parseSarifJson(
  raw: unknown,
  extraDimensionRules?: readonly SarifDimensionRule[],
): WitanInputSignal[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const dimensionRules = extraDimensionRules
    ? [...DIMENSION_RULES, ...extraDimensionRules]
    : DIMENSION_RULES;
  const doc = raw as SarifDocument;
  if (!Array.isArray(doc.runs)) return [];

  const buckets = new Map<
    string,
    {
      source: string;
      dimension: WitanCriterionId;
      weight: number;
      findings: WitanInputSignalFinding[];
    }
  >();

  for (const run of doc.runs) {
    const driverName = run.tool?.driver?.name ?? 'unknown';
    const source = `sarif:${driverName}`;

    // Scanners like Semgrep set severity on the rule's defaultConfiguration.level and
    // omit result.level entirely — SARIF 2.1.0 explicitly allows this. Falling back only
    // to `null` here is what silently dropped every Semgrep finding.
    const ruleDefaultLevels = new Map<string, string>();
    for (const rule of run.tool?.driver?.rules ?? []) {
      if (rule.id && rule.defaultConfiguration?.level) {
        ruleDefaultLevels.set(rule.id, rule.defaultConfiguration.level);
      }
    }

    for (const result of run.results ?? []) {
      const ruleId = result.ruleId ?? 'unknown';
      // SARIF's own default when neither the result nor its rule specify a level is 'warning'.
      const effectiveLevel = result.level ?? ruleDefaultLevels.get(ruleId) ?? 'warning';
      const severity = mapLevel(effectiveLevel);
      if (!severity) continue;

      const message = result.message?.text ?? ruleId;
      const location = renderLocation(result);
      const { dimension, weight } = mapRuleToDimension(ruleId, dimensionRules);
      const bucketKey = `${source}|${dimension}`;

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, { source, dimension, weight, findings: [] });
      }
      buckets
        .get(bucketKey)
        ?.findings.push({ ruleId, severity, message, ...(location ? { location } : {}) });
    }
  }

  return Array.from(buckets.values()).map(({ source, dimension, weight, findings }) => ({
    source,
    dimension,
    weight,
    findings: dedupeFindings(findings),
  }));
}

// Parse a SARIF 2.1.0 file at the given path. No network — reads local file only.
export function parseSarifFile(
  sarifPath: string,
  extraDimensionRules?: readonly SarifDimensionRule[],
): WitanInputSignal[] {
  const raw: unknown = JSON.parse(stripBom(readFileSync(sarifPath, 'utf8')));
  return parseSarifJson(raw, extraDimensionRules);
}
