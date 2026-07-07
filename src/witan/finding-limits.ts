import type { WitanInputSignalFinding } from './schemas.js';

// Mirror WitanInputSignalFindingSchema's max() caps (packages/shared/src/schemas/witan.ts) —
// keep these three in sync with that schema. An ingested finding from a third-party scanner
// is untrusted input: a single over-long field must degrade to a truncated string, never
// abort the whole certificate (goal_cejel_scan_robustness_ingest_and_bom_2026-07-06).
const RULE_ID_MAX = 200;
const MESSAGE_MAX = 500;
const LOCATION_MAX = 700;

function clamp(value: string, max: number): string {
  if (value.length <= max) return value;
  const ellipsis = '...';
  return `${value.slice(0, Math.max(max - ellipsis.length, 0))}${ellipsis}`;
}

// Truncate an ingested finding's variable-length fields to the schema's caps so
// WitanReportSchema.parse() never throws on one over-long scanner message.
export function clampFinding(finding: WitanInputSignalFinding): WitanInputSignalFinding {
  return {
    ...finding,
    ruleId: clamp(finding.ruleId, RULE_ID_MAX),
    message: clamp(finding.message, MESSAGE_MAX),
    ...(finding.location ? { location: clamp(finding.location, LOCATION_MAX) } : {}),
  };
}
