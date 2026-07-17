import type { WitanReport } from './schemas.js';

import { renderReportVerdict } from './html.js';

// The free-CLI / GitHub Action growth-loop artifact (goal: witan_free_cli_badge). Both
// output shapes are static and self-contained — no network calls, no external fonts or
// images — so they stay honest about what "offline" means for the free path.

/** shields.io "endpoint" schema — https://shields.io/badges/endpoint-badge */
export interface WitanBadgeEndpoint {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
  cacheSeconds?: number;
}

const VERDICT_COLOR: Record<string, string> = {
  Verified: 'brightgreen',
  Conditional: 'yellow',
  'At risk': 'orange',
  Unverified: 'red',
  'Insufficient source': 'lightgrey',
};

// Hex fills for the static SVG, keyed the same way as VERDICT_COLOR's named shields.io colors.
const VERDICT_SVG_FILL: Record<string, string> = {
  Verified: '#2fc86a',
  Conditional: '#dfb92f',
  'At risk': '#e08a3c',
  Unverified: '#d64545',
  'Insufficient source': '#8c8c8c',
};

// Insufficient-source repos (docs/binary-only/unrecognised-language/empty — see
// classifyRepoArchetype) get a
// distinct "unrated" badge message instead of a confident-looking "N.N/4.0 <verdict>" —
// a bare low number reads as a judgment even when it's really "there was nothing to rate"
// (goal_cejel_repo_archetype_detection_2026-07-06).
function badgeMessage(report: WitanReport, verdict: string): string {
  if (report.verdict === 'insufficient_source') return 'unrated: no source';
  return `${formatScore(report.overallScore)}/4.0 ${verdict.toLowerCase()}`;
}

export function renderWitanBadgeEndpoint(report: WitanReport): WitanBadgeEndpoint {
  const verdict = renderReportVerdict(report);
  return {
    schemaVersion: 1,
    label: 'cejel trust',
    message: badgeMessage(report, verdict),
    color: VERDICT_COLOR[verdict] ?? 'lightgrey',
  };
}

// Minimal flat-style badge SVG (shields.io "flat" look-alike), rendered without any
// network fetch, remote font, or external reference — every dimension is computed from
// the label/message strings themselves so the output is deterministic for a given report.
export function renderWitanBadgeSvg(report: WitanReport): string {
  const verdict = renderReportVerdict(report);
  const label = 'cejel trust';
  const message = badgeMessage(report, verdict);
  const fill = VERDICT_SVG_FILL[verdict] ?? '#8c8c8c';

  const charWidth = 6.5;
  const padding = 10;
  const labelWidth = Math.round(label.length * charWidth + padding);
  const messageWidth = Math.round(message.length * charWidth + padding);
  const totalWidth = labelWidth + messageWidth;
  const height = 20;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" role="img" aria-label="${escapeXml(label)}: ${escapeXml(message)}">
  <title>${escapeXml(label)}: ${escapeXml(message)}</title>
  <linearGradient id="witan-badge-smooth" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="witan-badge-round">
    <rect width="${totalWidth}" height="${height}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#witan-badge-round)">
    <rect width="${labelWidth}" height="${height}" fill="#555"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="${height}" fill="${fill}"/>
    <rect width="${totalWidth}" height="${height}" fill="url(#witan-badge-smooth)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${escapeXml(label)}</text>
    <text x="${labelWidth + messageWidth / 2}" y="14">${escapeXml(message)}</text>
  </g>
</svg>
`;
}

function formatScore(score: number): string {
  return score.toFixed(1);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
