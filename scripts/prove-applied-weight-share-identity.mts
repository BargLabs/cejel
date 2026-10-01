#!/usr/bin/env -S pnpm exec tsx
// Identity proof for report format 1.4 (issue #272, rebased from PR 370): recording
// `criteria[].metrics[].appliedWeightShare` must not move any score or any behaviour fingerprint.
//
// Usage:
//   pnpm exec tsx scripts/prove-applied-weight-share-identity.mts            # base = 68c3992
//   pnpm exec tsx scripts/prove-applied-weight-share-identity.mts --base <commit>
//
// BEFORE is the base commit's `src/` (extracted with `git archive`, never a checkout of this tree);
// AFTER is this working tree. Both score the same behaviour-fingerprint corpus, built once from
// this tree's corpus file, under each rubric below. Exits 1 if any of these is non-zero:
//   1. scoring differences: verdict, overall, code, process, category scores, and every criterion's
//      score, native score, status and metric values;
//   2. behaviour-fingerprint components that differ from the committed pins, plus a pins file that
//      differs from the base's;
//   3. report JSON differences other than an added `criteria[i].metrics[j].appliedWeightShare`;
//   4. recorded shares that disagree with scoreMetrics(): a share other than weight / sum(weights),
//      or a criterion whose score, rescored with the shares as weights, differs from its score
//      under the configured weights.
// The format version is not in report.json (it lives in attestation.json's predicate), so it is
// compared as the exported constant: expected 1.3 -> 1.4.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  BEHAVIOUR_CORPUS,
  BEHAVIOUR_CORPUS_HEAD_SHAS,
  buildBehaviourFixture,
  fixtureHeadSha,
} from '../src/witan/__tests__/fixtures/behaviour-corpus.ts';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const PINS_REL = 'src/witan/__tests__/fixtures/behaviour-fingerprint-pins.json';
const RUBRICS = [
  'witan-rubric-v17-2026-07-24',
  'witan-rubric-v22-prospective-2026-08-10',
  'witan-rubric-v23-prospective-2026-09-06',
] as const;
const SCAN_GENERATED_AT = '2026-09-15T00:00:00.000Z';
const APPLIED_SHARE_PATH = /^criteria\[\d+\]\.metrics\[\d+\]\.appliedWeightShare$/;

const baseIndex = process.argv.indexOf('--base');
const base = baseIndex >= 0 ? (process.argv[baseIndex + 1] as string) : '68c3992';

type Report = Record<string, unknown> & {
  criteria: Array<Record<string, unknown> & { id: string; metrics?: Metric[] }>;
};
type Metric = Record<string, unknown> & { name: string; value: number; weight: number; appliedWeightShare?: number };

function extractBase(commit: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cejel-applied-share-base-'));
  const archive = execFileSync('git', ['archive', commit, 'src', 'package.json', 'tsconfig.json'], {
    cwd: REPO_ROOT,
    maxBuffer: 512 * 1024 * 1024,
  });
  execFileSync('tar', ['-x', '-C', dir], { input: archive });
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}

async function load(root: string) {
  const at = (rel: string) => import(pathToFileURL(join(root, rel)).href);
  return {
    scan: (await at('src/witan/public-scan.ts')) as {
      scoreRepoWithPublicCejel: (input: Record<string, unknown>) => Report;
    },
    fingerprint: (await at('src/witan/rubric-fingerprint.ts')) as {
      projectWitanScoringSurface: (report: Report) => unknown;
      computeWitanRubricBehaviourComponents: (entries: { name: string; surface: unknown }[]) => {
        criteria: Record<string, string>;
        reports: Record<string, string>;
      };
    },
    schemas: (await at('src/witan/schemas.ts')) as { WITAN_REPORT_FORMAT_VERSION: string },
    scoring: (await at('src/witan/scoring.ts')) as { scoreMetrics: (metrics: Metric[]) => number },
  };
}

/** Every leaf path where `before` and `after` differ, with the two values. */
function jsonDiff(before: unknown, after: unknown, path = ''): { path: string; before: unknown; after: unknown }[] {
  if (Object.is(before, after)) return [];
  const bothObjects =
    typeof before === 'object' && before !== null && typeof after === 'object' && after !== null;
  if (!bothObjects || Array.isArray(before) !== Array.isArray(after)) return [{ path, before, after }];
  const keys = Array.isArray(before)
    ? [...Array(Math.max(before.length, (after as unknown[]).length)).keys()].map(String)
    : [...new Set([...Object.keys(before as object), ...Object.keys(after as object)])];
  return keys.flatMap((key) =>
    jsonDiff(
      (before as Record<string, unknown>)[key],
      (after as Record<string, unknown>)[key],
      Array.isArray(before) ? `${path}[${key}]` : path ? `${path}.${key}` : key,
    ),
  );
}

function scoringFields(report: Report): unknown {
  return {
    verdict: report.verdict,
    overallScore: report.overallScore,
    codeTrustScore: report.codeTrustScore,
    processTrustScore: report.processTrustScore,
    categoryScores: report.categoryScores,
    criteria: report.criteria.map((criterion) => ({
      id: criterion.id,
      score: criterion.score,
      nativeScore: criterion.nativeScore,
      status: criterion.status,
      metrics: (criterion.metrics ?? []).map((metric) => [metric.name, metric.value]),
    })),
  };
}

const baseDir = extractBase(base);
let failed = false;
try {
  const before = await load(baseDir);
  const after = await load(REPO_ROOT);
  const pins = JSON.parse(readFileSync(join(REPO_ROOT, PINS_REL), 'utf8')) as Record<
    string,
    { criteria: Record<string, string>; reports: Record<string, string> }
  >;
  const pinsFileChanged = readFileSync(join(baseDir, PINS_REL), 'utf8') !== readFileSync(join(REPO_ROOT, PINS_REL), 'utf8');

  const dirs = new Map<string, string>();
  for (const fixture of BEHAVIOUR_CORPUS) {
    const dir = buildBehaviourFixture(fixture);
    if (fixtureHeadSha(dir) !== BEHAVIOUR_CORPUS_HEAD_SHAS[fixture.name]) {
      throw new Error(`${fixture.name}: fixture does not reproduce on this machine; nothing below is interpretable`);
    }
    dirs.set(fixture.name, dir);
  }

  console.log(`base ${base} (git archive of src/) vs working tree; corpus: ${BEHAVIOUR_CORPUS.length} fixtures`);
  console.log(
    `format version: ${before.schemas.WITAN_REPORT_FORMAT_VERSION} -> ${after.schemas.WITAN_REPORT_FORMAT_VERSION} (expected 1.3 -> 1.4)`,
  );
  if (before.schemas.WITAN_REPORT_FORMAT_VERSION !== '1.3' || after.schemas.WITAN_REPORT_FORMAT_VERSION !== '1.4') failed = true;
  console.log(`pins file changed vs base: ${pinsFileChanged ? 'YES' : 'no'} (expected no)`);
  if (pinsFileChanged) failed = true;

  for (const rubricVersion of RUBRICS) {
    let scoreDiffs = 0;
    let addedShares = 0;
    let otherDiffs = 0;
    let shareDisagreements = 0;
    const examples: string[] = [];
    const entries: { name: string; surface: unknown }[] = [];
    for (const fixture of BEHAVIOUR_CORPUS) {
      const input = {
        repoPath: dirs.get(fixture.name),
        productSlug: fixture.name,
        productDisplayName: fixture.name,
        generatedAt: SCAN_GENERATED_AT,
        rubricVersion,
        ingestPatterns: [],
        autoDiscoverIngest: false,
      };
      const b = JSON.parse(JSON.stringify(before.scan.scoreRepoWithPublicCejel(input))) as Report;
      const a = JSON.parse(JSON.stringify(after.scan.scoreRepoWithPublicCejel(input))) as Report;
      entries.push({ name: fixture.name, surface: after.fingerprint.projectWitanScoringSurface(a) });

      for (const diff of jsonDiff(scoringFields(b), scoringFields(a))) {
        scoreDiffs += 1;
        examples.push(`  score ${fixture.name} ${diff.path}: ${JSON.stringify(diff.before)} -> ${JSON.stringify(diff.after)}`);
      }
      for (const diff of jsonDiff(b, a)) {
        if (APPLIED_SHARE_PATH.test(diff.path) && diff.before === undefined && typeof diff.after === 'number') {
          addedShares += 1;
        } else {
          otherDiffs += 1;
          examples.push(`  report ${fixture.name} ${diff.path}: ${JSON.stringify(diff.before)} -> ${JSON.stringify(diff.after)}`);
        }
      }
      for (const criterion of a.criteria) {
        const metrics = criterion.metrics ?? [];
        if (metrics.length === 0) continue;
        const total = metrics.reduce((sum, metric) => sum + metric.weight, 0);
        const sharesAsWeights = metrics.map((metric) => ({ ...metric, weight: metric.appliedWeightShare ?? Number.NaN }));
        const disagrees =
          metrics.some((metric) => metric.appliedWeightShare !== metric.weight / total) ||
          after.scoring.scoreMetrics(sharesAsWeights) !== after.scoring.scoreMetrics(metrics);
        if (disagrees) {
          shareDisagreements += 1;
          examples.push(`  share ${fixture.name} ${criterion.id}: ${JSON.stringify(metrics.map((m) => [m.name, m.weight, m.appliedWeightShare]))}`);
        }
      }
    }
    const components = after.fingerprint.computeWitanRubricBehaviourComponents(entries);
    const pinned = pins[rubricVersion] as { criteria: Record<string, string>; reports: Record<string, string> };
    const movedPins = [
      ...Object.keys({ ...pinned.criteria, ...components.criteria }).filter((id) => components.criteria[id] !== pinned.criteria[id]),
      ...Object.keys({ ...pinned.reports, ...components.reports }).filter((name) => components.reports[name] !== pinned.reports[name]),
    ];
    console.log(
      `${rubricVersion}: score differences ${scoreDiffs}; fingerprint pins changed ${movedPins.length}` +
        `${movedPins.length ? ` [${movedPins.join(', ')}]` : ''}; report diffs: added appliedWeightShare ${addedShares}, other ${otherDiffs}; ` +
        `shares disagreeing with scoreMetrics ${shareDisagreements}`,
    );
    for (const line of examples.slice(0, 10)) console.log(line);
    if (examples.length > 10) console.log(`  ... ${examples.length - 10} more`);
    if (scoreDiffs || movedPins.length || otherDiffs || shareDisagreements || addedShares === 0) failed = true;
  }
} finally {
  rmSync(baseDir, { recursive: true, force: true });
}

console.log(failed ? 'IDENTITY PROOF: FAIL' : 'IDENTITY PROOF: PASS');
process.exit(failed ? 1 : 0);
