#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const FULL_TREE_BASELINE = 'scripts/label-class-full-tree-baseline.json';
// Mechanical guard for the disclosure boundary's closed categories. PR-diff mode is
// path-only and fails a PR that adds a matching label-class or live-frame-manifest path.
// Scheduled full-tree mode applies the same patterns to every tracked path and adds one
// structural JSON check whose matched values are never returned or printed. Its existing
// finding set is represented only by an aggregate count+digest binding in this public repo.
// See CLAUDE.md's "IP boundary" section and the 2026-08-18 leak-audit report for why this
// exists: prose rules alone did not stop the v17 holdout exposure.
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

/**
 * Content-shape backstop for an adjudication payload moved under an innocent
 * filename. It reports field presence and entry position only; values are
 * never returned or printed.
 *
 * @param {string} path
 * @param {string} content
 * @returns {{path: string, label: string, detail: string}|null}
 */
export function checkAdjudicationShape(path, content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  if (!Array.isArray(parsed.entries)) return null;
  for (const [index, entry] of parsed.entries.entries()) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      !Array.isArray(entry) &&
      Object.hasOwn(entry, 'classification') &&
      Object.hasOwn(entry, 'rationale')
    ) {
      return {
        path,
        label: 'adjudication label shape (content-based)',
        detail: `entries[${index}] carries the guarded field pair`,
      };
    }
  }
  return null;
}

/**
 * @param {{path: string, content: string}[]} entries
 * @returns {{path: string, label: string, detail: string}[]}
 */
export function checkContentShapes(entries) {
  return entries.flatMap(({ path, content }) => {
    const violation = checkAdjudicationShape(path, content);
    return violation === null ? [] : [violation];
  });
}

/**
 * @typedef {{path: string, blobSha: string}} FullTreeEntry
 * @typedef {{version: string, date: string, findingCount: number, digest: string}} FullTreeBaseline
 */

/**
 * Evaluate a complete tracked tree against both the path rules and the known
 * content shape. The baseline is exact (path, blob SHA), so editing a
 * grandfathered file or moving its bytes to a new path is a fresh finding.
 *
 * @param {FullTreeEntry[]} trackedEntries
 * @param {{path: string, content: string}[]} contentEntries
 * @param {FullTreeBaseline} baseline
 * @param {string[]} gaps
 */
export function evaluateFullTree(trackedEntries, contentEntries, baseline, gaps = []) {
  const byPath = new Map(trackedEntries.map((entry) => [entry.path, entry]));
  const findingsByPath = new Map();
  for (const violation of checkPaths(trackedEntries.map((entry) => entry.path))) {
    findingsByPath.set(violation.path, {
      path: violation.path,
      blobSha: byPath.get(violation.path)?.blobSha ?? '',
      labels: [violation.label],
    });
  }
  for (const violation of checkContentShapes(contentEntries)) {
    const existing = findingsByPath.get(violation.path);
    if (existing) {
      existing.labels.push(violation.label);
    } else {
      findingsByPath.set(violation.path, {
        path: violation.path,
        blobSha: byPath.get(violation.path)?.blobSha ?? '',
        labels: [violation.label],
      });
    }
  }

  const findings = [...findingsByPath.values()];
  const digest = createHash('sha256')
    .update(findings.map(fullTreeKey).sort().join('\n'))
    .digest('hex');
  const bindingMatches = findings.length === baseline.findingCount && digest === baseline.digest;

  return {
    filesExamined: trackedEntries.length,
    shapeFilesExamined: contentEntries.length,
    findings,
    findingCount: findings.length,
    digest,
    bindingMatches,
    gaps: trackedEntries.length === 0 ? [...gaps, 'tracked tree contained zero files'] : gaps,
    baseline: {
      version: baseline.version,
      date: baseline.date,
      findingCount: baseline.findingCount,
      digest: baseline.digest,
    },
  };
}

function fullTreeKey(entry) {
  return `${entry.path}\0${entry.blobSha}`;
}

export function fullTreeExitCode(result) {
  if (!result.bindingMatches) return 1;
  if (result.gaps.length > 0) return 2;
  return 0;
}

export function formatFullTreeReport(result) {
  const lines = [
    `Disclosure-boundary guard: mode=full-tree; ${result.filesExamined} tracked file(s) examined; ${result.shapeFilesExamined} blob(s) shape-checked.`,
    `Baseline: ${result.baseline.version} (${result.baseline.date}); expected ${result.baseline.findingCount} bound finding(s); observed ${result.findingCount}.`,
  ];
  if (!result.bindingMatches) {
    lines.push(
      'FULL-TREE BINDING MISMATCH: the closed-category path/blob set changed. Paths and content are intentionally omitted; hand the mismatch to the operator.',
    );
  }
  for (const gap of result.gaps) lines.push(`SCAN INCOMPLETE: ${gap}`);
  if (result.bindingMatches && result.gaps.length === 0) {
    lines.push('Full-tree binding matches; no closed-category path/blob drift observed.');
  }
  return lines.join('\n');
}

async function listTrackedEntries(cwd) {
  const { stdout } = await execFileAsync('git', ['ls-files', '-s', '-z'], {
    cwd,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const match = /^(\d+) ([0-9a-f]+) 0\t([\s\S]+)$/.exec(record);
      if (!match) throw new Error('git ls-files returned an unparseable or unmerged entry');
      return { path: match[3], blobSha: match[2] };
    });
}

async function readTrackedBlob(cwd, path) {
  const { stdout } = await execFileAsync('git', ['show', `HEAD:${path}`], {
    cwd,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.toString('utf8');
}

async function loadFullTreeBaseline(cwd) {
  const baselinePath = join(cwd, FULL_TREE_BASELINE);
  const parsed = JSON.parse(await readFile(baselinePath, 'utf8'));
  if (
    typeof parsed?.version !== 'string' ||
    typeof parsed?.date !== 'string' ||
    !Number.isInteger(parsed?.findingCount) ||
    parsed.findingCount < 0 ||
    typeof parsed?.digest !== 'string' ||
    !/^[0-9a-f]{64}$/.test(parsed.digest)
  ) {
    throw new Error(`${FULL_TREE_BASELINE} is malformed`);
  }
  return parsed;
}

async function runFullTree(cwd) {
  const baseline = await loadFullTreeBaseline(cwd);
  const trackedEntries = await listTrackedEntries(cwd);
  const contentEntries = [];
  const gaps = [];
  for (const entry of trackedEntries) {
    try {
      contentEntries.push({ path: entry.path, content: await readTrackedBlob(cwd, entry.path) });
    } catch (error) {
      gaps.push(`${entry.path} could not be read from HEAD (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  return evaluateFullTree(trackedEntries, contentEntries, baseline, gaps);
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
  if (argv[0] === '--full-tree') {
    if (argv.length !== 1) throw new Error('--full-tree does not accept path arguments');
    const result = await runFullTree(process.cwd());
    const exitCode = fullTreeExitCode(result);
    const output = formatFullTreeReport(result);
    (exitCode === 0 ? console.log : console.error)(output);
    process.exitCode = exitCode;
    return;
  }

  const diffArgs = argv[0] === '--diff' ? argv.slice(1) : argv;
  const paths = diffArgs.length > 0 ? diffArgs : (await (async () => {
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
  console.log(`Disclosure-boundary guard: mode=diff; ${paths.length} path(s) checked, none denied.`);
}

if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
