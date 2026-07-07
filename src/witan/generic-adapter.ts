import { readFileSync } from 'node:fs';

import type { WitanCriterionId, WitanInputSignal, WitanInputSignalFinding } from './schemas.js';

import { stripBom } from './json-safe.js';

// Generic external-tool JSON — the documented minimal mapping any scanner that doesn't emit
// SARIF or OpenSSF Scorecard JSON can produce to be ingested by Cejel:
//
//   {
//     "tool": "my-scanner",
//     "signals": [
//       {
//         "dimension": "A2",
//         "weight": 0.7,
//         "findings": [
//           { "ruleId": "hardcoded-secret", "severity": "critical", "message": "...", "location": "src/config.ts:10" }
//         ]
//       }
//     ]
//   }
//
// `dimension` must be one of the Witan rubric criterion ids (A1-A5, B1-B6). `weight` is
// optional (0-1, default 0.5). `location` is optional. See README "Aggregate your scanners"
// for the full walkthrough. Adding a scanner that already emits this shape needs no code —
// point --ingest at its output; a proprietary format needs a small transform into this shape
// (mirror this file or scorecard-adapter.ts).
const VALID_DIMENSIONS = new Set<string>([
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'B1',
  'B2',
  'B3',
  'B4',
  'B5',
  'B6',
]);
const VALID_SEVERITIES = new Set(['critical', 'warning', 'info']);

interface GenericSignalFinding {
  ruleId?: string;
  severity?: string;
  message?: string;
  location?: string;
}

interface GenericSignal {
  dimension?: string;
  weight?: number;
  findings?: GenericSignalFinding[];
}

interface GenericDocument {
  tool?: string;
  signals?: GenericSignal[];
}

export function isGenericSignalDocument(raw: unknown): raw is GenericDocument {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const doc = raw as GenericDocument;
  return typeof doc.tool === 'string' && doc.tool.length > 0 && Array.isArray(doc.signals);
}

// Parse the generic Cejel external-signal JSON document (already loaded) into
// WitanInputSignal[]. Unrecognized dimensions/severities are dropped rather than defaulted —
// a malformed entry must not silently manufacture a penalty.
export function parseGenericJson(raw: unknown): WitanInputSignal[] {
  if (!isGenericSignalDocument(raw)) return [];
  const source = raw.tool ?? 'unknown';
  const signals: WitanInputSignal[] = [];

  for (const signal of raw.signals ?? []) {
    const dimension = signal.dimension;
    if (!dimension || !VALID_DIMENSIONS.has(dimension)) continue;

    const weight =
      typeof signal.weight === 'number' && Number.isFinite(signal.weight)
        ? Math.min(Math.max(signal.weight, 0), 1)
        : 0.5;

    const findings: WitanInputSignalFinding[] = [];
    for (const finding of signal.findings ?? []) {
      const severity = finding.severity;
      if (!severity || !VALID_SEVERITIES.has(severity)) continue;
      const ruleId = finding.ruleId ?? 'unknown';
      findings.push({
        ruleId,
        severity: severity as WitanInputSignalFinding['severity'],
        message: finding.message ?? ruleId,
        ...(finding.location ? { location: finding.location } : {}),
      });
    }
    if (findings.length === 0) continue;

    signals.push({ source, dimension: dimension as WitanCriterionId, weight, findings });
  }

  return signals;
}

// Parse a generic Cejel external-signal JSON file at the given path. No network — local
// file only.
export function parseGenericFile(genericPath: string): WitanInputSignal[] {
  const raw: unknown = JSON.parse(stripBom(readFileSync(genericPath, 'utf8')));
  return parseGenericJson(raw);
}
