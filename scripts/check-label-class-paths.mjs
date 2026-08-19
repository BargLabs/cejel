#!/usr/bin/env node
// Mechanical guard for the disclosure boundary's closed categories, built from PATH
// patterns only -- never from reading payloads (per the IP-boundary rule: "read-only on
// all label/evidence content"). Fails a PR that adds a file matching a label-class or
// live-frame-manifest pattern; the sanctioned retirement-reveal format is explicitly
// exempt. See CLAUDE.md's "IP boundary" section and the 2026-08-18 leak-audit report for
// why this exists: prose rules alone did not stop the v17 holdout exposure.
//
// Deliberately does NOT deny calibration/llm/cohorts/**, calibration/llm/schemas/**, or
// calibration/llm/templates/** -- those are the calibration/llm track's intentionally-public
// golden/untouched cohorts and shape-only schema/template files (confirmed during the
// 2026-08-18 audit), not the secret free-core-vNN holdout this guard protects.

const DENY_PATTERNS = [
  { label: 'evidence payload (private)', re: /^calibration\/llm\/private\// },
  { label: 'adjudication review record', re: /^calibration\/llm\/reviews\// },
  { label: 'execution evidence record', re: /^calibration\/llm\/results\/.*evidence.*\.json$/ },
  { label: 'adjudication stage record', re: /^docs\/experiments\/.*\/stage\d+-adjudication\.json$/ },
  { label: 'live frame selection-run manifest', re: /^docs\/experiments\/.*\/run\/manifest-wave-.*\.json$/ },
  { label: 'live frame stage0 manifest', re: /^docs\/experiments\/.*\.stage0-manifest.*$/ },
  { label: 'live frame tier2-fresh manifest', re: /^docs\/experiments\/.*\.tier2-fresh-manifest.*$/ },
];

// The one sanctioned publication format for frame membership: a retirement-reveal doc,
// containing members + pinned commits only, per docs/calibration/hash-conventions.md and
// the IP-boundary rule. Raw manifest-wave/stage0/tier2-fresh JSON is never exempt, even for
// a retired frame -- membership gets republished through this format, not the raw file.
const REVEAL_DOC_EXEMPTION = /^docs\/calibration\/[^/]+\/[^/]*reveal[^/]*\.md$/;

/**
 * @param {string} path repository-relative path, forward-slash separated
 * @returns {{denied: boolean, label?: string}}
 */
export function checkPath(path) {
  if (REVEAL_DOC_EXEMPTION.test(path)) return { denied: false };
  for (const { label, re } of DENY_PATTERNS) {
    if (re.test(path)) return { denied: true, label };
  }
  return { denied: false };
}

/**
 * @param {string[]} paths
 * @returns {{path: string, label: string}[]} violations, empty if clean
 */
export function checkPaths(paths) {
  const violations = [];
  for (const path of paths) {
    const result = checkPath(path);
    if (result.denied) violations.push({ path, label: result.label });
  }
  return violations;
}

export function formatFailureMessage(violations) {
  const lines = [
    'Disclosure-boundary guard failed: this PR adds a path in a closed category.',
    '',
    ...violations.map((v) => `  - ${v.path}  (${v.label})`),
    '',
    'Per the IP boundary (CLAUDE.md, citing the operator\'s disclosure boundary decision):',
    'adjudication labels, reviewer notes, evidence corpora, and live frame membership are',
    'never published, quoted, summarized, or decrypted into anything public, under any',
    'framing. A retirement-reveal contains members + pinned commits ONLY, published as',
    'docs/calibration/<frame>/<name>reveal<name>.md -- not a raw manifest file.',
    '',
    'Hand this back to the operator rather than trying to route around it.',
  ];
  return lines.join('\n');
}

async function main(argv) {
  const paths = argv.length > 0 ? argv : (await (async () => {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  })());
  const violations = checkPaths(paths);
  if (violations.length > 0) {
    console.error(formatFailureMessage(violations));
    process.exitCode = 1;
    return;
  }
  console.log(`Disclosure-boundary guard: ${paths.length} path(s) checked, none denied.`);
}

if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
