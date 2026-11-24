// The whole-v28 measurement: every synthetic fixture exported by a `*-fixtures.ts` file of
// src/witan/__tests__/fixtures/, and the behaviour corpus, scored under every selectable rubric of
// the tree this runs in. Run it once at the commit being measured and once at a baseline commit
// (with the measured commit's fixture files copied in), then compare the two outputs with
// `--compare`. Each per-card RUBRIC_CHANGELOG entry measured its own card before the next one
// merged; this measures all of v28 at one commit.
//
//   node --import tsx scripts/measure-v28-whole.mts --out <file.json>
//   node --import tsx scripts/measure-v28-whole.mts --compare <baseline.json> <measured.json>
//   node --import tsx scripts/measure-v28-whole.mts --out <file.json> --only <fixture> [...]
//
// A report is hashed as serializeWitanReport writes it, with the scan directory's path (and its
// real path) written as <scan>. Under v28, each fixture's report is also compared with v27's: the
// same bytes with the rubric identifier swapped, the scoring surface only, or a score up or down,
// and every rise is listed with the v28 readings that apply to the fixture.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WITAN = join(ROOT, 'src/witan');
const FIXTURES_DIR = join(WITAN, '__tests__/fixtures');
const imp = (path: string) => import(pathToFileURL(join(WITAN, path)).href);

type Report = {
  overallScore: number | null;
  codeTrustScore: number | null;
  processTrustScore: number | null;
  criteria: { id: string; score: number | null; status: string }[];
};

interface Measured {
  readonly commit: string;
  readonly rubrics: readonly string[];
  readonly synthetic: Record<string, Record<string, string>>;
  readonly corpus: Record<string, Record<string, string>>;
  readonly symlinkFixtures: readonly string[];
  readonly shapes: Record<string, number>;
  readonly duplicateNames: readonly string[];
  readonly v28AgainstV27?: Record<string, Comparison>;
  /** For each fixture whose scoring surface moved under v28: which surface fields, v27 -> v28. */
  readonly surfaceDiffs?: Record<string, string[]>;
  readonly errors: readonly string[];
}

interface Comparison {
  readonly set: 'synthetic' | 'corpus';
  readonly kind: 'identical' | 'evidence-only' | 'surface-moved' | 'higher' | 'lower' | 'higher-and-lower';
  readonly up?: readonly string[];
  readonly down?: readonly string[];
  readonly readings?: readonly string[];
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

function rises(before: Report, after: Report): string[] {
  const moved: string[] = [];
  const above = (a: number | null | undefined, b: number | null | undefined) =>
    typeof a === 'number' && typeof b === 'number' && a > b;
  for (const key of ['overallScore', 'codeTrustScore', 'processTrustScore'] as const) {
    if (above(after[key], before[key])) moved.push(key);
  }
  if (after.overallScore !== null && before.overallScore === null) moved.push('overallScore (abstained before)');
  for (const criterion of after.criteria) {
    const prior = before.criteria.find(({ id }) => id === criterion.id);
    if (above(criterion.score, prior?.score)) moved.push(criterion.id);
    if (prior?.status === 'not_applicable' && criterion.status !== 'not_applicable') {
      moved.push(`${criterion.id} (not applicable before)`);
    }
  }
  return moved;
}

async function measure(out: string, only?: ReadonlySet<string>): Promise<void> {
  const { scoreRepoWithPublicCejel } = await imp('public-scan.ts');
  const { serializeWitanReport } = await imp('attestation.ts');
  const versions = await imp('rubric-version.ts');
  const { projectWitanScoringSurface } = await imp('rubric-fingerprint.ts');
  const { buildFalseAssuranceFixture } = await imp('__tests__/fixtures/false-assurance-fixtures.ts');
  const { BEHAVIOUR_CORPUS, buildBehaviourFixture, HERMETIC_GIT_ENV } = await imp('__tests__/fixtures/behaviour-corpus.ts');
  const rubrics: string[] = [...versions.WITAN_SELECTABLE_RUBRIC_VERSIONS];
  const V27: string = versions.WITAN_RUBRIC_VERSION_V27;
  const V28: string | undefined = versions.WITAN_RUBRIC_VERSION_V28;
  const withV28 = V28 !== undefined && rubrics.includes(V28);
  const signals = withV28 ? await imp('repo-signals.ts') : undefined;
  const { v28A3A2ItemsReaching } = withV28 ? await imp('__tests__/v28-rises.ts') : { v28A3A2ItemsReaching: undefined };

  // Three fixture shapes are exported: `commits` (one entry per commit), `files` (one commit) and
  // `build` (a function that makes the repository). A `files` fixture is built as one commit by
  // the same builder as a `commits` one; a `build` fixture by its own function.
  type Shaped = { name: string; commits?: unknown[]; files?: object; build?: () => string; symlinksToHostDirectory?: object };
  const byName = new Map<string, Shaped>();
  const duplicateNames: string[] = [];
  const shapes = { commits: 0, files: 0, build: 0 };
  for (const file of readdirSync(FIXTURES_DIR).filter((name) => name.endsWith('-fixtures.ts')).sort()) {
    const mod = await imp(`__tests__/fixtures/${file}`);
    for (const value of Object.values(mod)) {
      if (!Array.isArray(value)) continue;
      for (const item of value as Shaped[]) {
        if (!item || typeof item !== 'object' || typeof item.name !== 'string') continue;
        if (!Array.isArray(item.commits) && !(item.files && typeof item.files === 'object') && typeof item.build !== 'function') {
          continue;
        }
        const seen = byName.get(item.name);
        if (seen && seen !== item && JSON.stringify(seen) !== JSON.stringify(item)) duplicateNames.push(`${file}: ${item.name}`);
        if (seen) continue;
        byName.set(item.name, item);
        shapes[Array.isArray(item.commits) ? 'commits' : typeof item.build === 'function' ? 'build' : 'files'] += 1;
      }
    }
  }
  const buildSynthetic = (fixture: Shaped): string =>
    Array.isArray(fixture.commits)
      ? buildFalseAssuranceFixture(fixture)
      : typeof fixture.build === 'function'
        ? fixture.build()
        : buildFalseAssuranceFixture({ name: fixture.name, commits: [fixture.files] });

  const errors: string[] = [];
  const synthetic: Record<string, Record<string, string>> = {};
  const corpus: Record<string, Record<string, string>> = {};
  const v28AgainstV27: Record<string, Comparison> = {};
  const symlinkFixtures = [...byName.values()]
    .filter((fixture) => Object.keys(fixture.symlinksToHostDirectory ?? {}).length > 0)
    .map((fixture) => (fixture as unknown as { name: string }).name)
    .sort();
  const tracked = (dir: string): string[] =>
    execFileSync('git', ['ls-files', '-z'], { cwd: dir, env: HERMETIC_GIT_ENV, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);

  const scoreAll = (
    set: 'synthetic' | 'corpus',
    name: string,
    dir: string,
    options: Record<string, unknown>,
    into: Record<string, Record<string, string>>,
  ) => {
    const real = realpathSync(dir);
    const reports = new Map<string, Report>();
    const texts = new Map<string, string>();
    into[name] = {};
    for (const rubricVersion of rubrics) {
      try {
        const report = scoreRepoWithPublicCejel({ ...options, repoPath: dir, rubricVersion });
        const text: string = serializeWitanReport(report).split(real).join('<scan>').split(dir).join('<scan>');
        reports.set(rubricVersion, report);
        texts.set(rubricVersion, text);
        into[name][rubricVersion] = sha(text);
      } catch (error) {
        errors.push(`${set}/${name}/${rubricVersion}: ${(error as Error).message.split('\n')[0]}`);
      }
    }
    if (!withV28 || !V28) return;
    const v27 = reports.get(V27);
    const v28 = reports.get(V28);
    if (!v27 || !v28) return;
    const readings: string[] = [];
    try {
      const files = tracked(dir);
      for (const item of signals.readV28A1Readings(dir, files).items as string[]) readings.push(`A1 item ${item}`);
      for (const item of v28A3A2ItemsReaching(v28) as string[]) readings.push(item === 'C' ? 'A2 item C' : `A3 item ${item}`);
      if (signals.readV28A5ClaimStatus(dir, files).length > 0) readings.push('A5 claim status');
    } catch (error) {
      errors.push(`${set}/${name}/readings: ${(error as Error).message.split('\n')[0]}`);
    }
    const sameBytes = (texts.get(V28) as string).split(V28).join(V27) === texts.get(V27);
    const up = rises(v27, v28);
    const down = rises(v28, v27);
    const sameSurface =
      JSON.stringify(projectWitanScoringSurface(v28)).split(V28).join(V27) === JSON.stringify(projectWitanScoringSurface(v27));
    if (!sameSurface) {
      const a = projectWitanScoringSurface(v27) as Record<string, unknown> & { criteria: Record<string, unknown>[] };
      const b = projectWitanScoringSurface(v28) as Record<string, unknown> & { criteria: Record<string, unknown>[] };
      const moved: string[] = [];
      for (const key of Object.keys(b)) {
        if (key === 'criteria') continue;
        if (JSON.stringify(a[key]).split(V28).join(V27) !== JSON.stringify(b[key]).split(V28).join(V27)) moved.push(key);
      }
      for (const criterion of b.criteria) {
        const prior = a.criteria.find(({ id }) => id === criterion.id) ?? {};
        for (const key of Object.keys(criterion)) {
          if (JSON.stringify(prior[key]) !== JSON.stringify(criterion[key])) {
            moved.push(`${criterion.id}.${key} ${JSON.stringify(prior[key])} -> ${JSON.stringify(criterion[key])}`);
          }
        }
      }
      surfaceDiffs[`${set}/${name}`] = moved;
    }
    const kind: Comparison['kind'] = sameBytes
      ? 'identical'
      : up.length > 0 && down.length > 0
        ? 'higher-and-lower'
        : up.length > 0
          ? 'higher'
          : down.length > 0
            ? 'lower'
            : sameSurface
              ? 'evidence-only'
              : 'surface-moved';
    v28AgainstV27[`${set}/${name}`] = {
      set,
      kind,
      ...(up.length > 0 ? { up } : {}),
      ...(down.length > 0 ? { down } : {}),
      ...(readings.length > 0 ? { readings } : {}),
    };
  };

  // MEASURE_LIMIT (a smoke run only): score the first N synthetic fixtures and N corpus fixtures.
  const limit = Number(process.env.MEASURE_LIMIT ?? Number.POSITIVE_INFINITY);
  let done = 0;
  const surfaceDiffs: Record<string, string[]> = {};
  for (const [name, fixture] of [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([name]) => !only || only.has(name))
    .slice(0, limit)) {
    let dir: string | undefined;
    try {
      dir = buildSynthetic(fixture);
      scoreAll('synthetic', name, dir as string, {
        productSlug: 'synthetic-v28-whole',
        productDisplayName: 'Synthetic v28 whole',
        generatedAt: '2026-11-24T00:00:00.000Z',
        ingestPatterns: [],
        autoDiscoverIngest: false,
      }, synthetic);
    } catch (error) {
      errors.push(`synthetic/${name}/build: ${(error as Error).message.split('\n')[0]}`);
    } finally {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
    if (++done % 100 === 0) process.stderr.write(`synthetic ${done}/${byName.size}\n`);
  }
  for (const fixture of (BEHAVIOUR_CORPUS as { name: string }[]).filter(({ name }) => !only || only.has(name)).slice(0, limit)) {
    let dir: string | undefined;
    try {
      dir = buildBehaviourFixture(fixture);
      scoreAll('corpus', fixture.name, dir as string, {
        productSlug: fixture.name,
        productDisplayName: fixture.name,
        generatedAt: '2026-11-24T00:00:00.000Z',
        ingestPatterns: [],
        autoDiscoverIngest: false,
      }, corpus);
    } catch (error) {
      errors.push(`corpus/${fixture.name}/build: ${(error as Error).message.split('\n')[0]}`);
    } finally {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  }

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const result: Measured = {
    commit,
    rubrics,
    synthetic,
    corpus,
    symlinkFixtures,
    shapes,
    duplicateNames,
    ...(withV28 ? { v28AgainstV27, surfaceDiffs } : {}),
    errors,
  };
  writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
  process.stderr.write(
    `${commit}: ${Object.keys(synthetic).length} synthetic (${JSON.stringify(shapes)}), ${Object.keys(corpus).length} corpus, ${rubrics.length} rubrics, ${errors.length} errors\n`,
  );
}

function compare(baselinePath: string, measuredPath: string): void {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Measured;
  const measured = JSON.parse(readFileSync(measuredPath, 'utf8')) as Measured;
  const shared = baseline.rubrics.filter((rubric) => measured.rubrics.includes(rubric));
  const lines: string[] = [`baseline ${baseline.commit}, measured ${measured.commit}`];
  lines.push(`rubrics compared for byte identity: ${shared.length} (${shared[0]} to ${shared[shared.length - 1]})`);
  for (const set of ['synthetic', 'corpus'] as const) {
    let same = 0;
    let differ = 0;
    const differing: string[] = [];
    let skipped = 0;
    for (const [name, byRubric] of Object.entries(measured[set])) {
      if (set === 'synthetic' && measured.symlinkFixtures.includes(name)) {
        skipped += 1;
        continue;
      }
      const before = baseline[set][name];
      if (!before) {
        skipped += 1;
        continue;
      }
      for (const rubric of shared) {
        if (before[rubric] === undefined || byRubric[rubric] === undefined) continue;
        if (before[rubric] === byRubric[rubric]) same += 1;
        else {
          differ += 1;
          differing.push(`${name} ${rubric}`);
        }
      }
    }
    lines.push(`${set}: ${same} of ${same + differ} reports byte-identical; ${skipped} fixtures not compared`);
    for (const entry of differing.slice(0, 50)) lines.push(`  differs: ${entry}`);
  }
  const notInBaseline = Object.keys(measured.synthetic).filter((name) => !baseline.synthetic[name]);
  lines.push(`synthetic fixtures new since the baseline (not compared for identity): ${notInBaseline.length}`);
  lines.push(`symlink fixtures (not compared for identity): ${measured.symlinkFixtures.join(', ') || 'none'}`);
  lines.push(`fixture shapes: ${JSON.stringify(measured.shapes)}`);
  lines.push(`duplicate names with different content: ${measured.duplicateNames.length}`);
  for (const name of measured.duplicateNames) lines.push(`  ${name}`);
  lines.push(`errors: baseline ${baseline.errors.length}, measured ${measured.errors.length}`);
  for (const error of [...baseline.errors, ...measured.errors].slice(0, 20)) lines.push(`  ${error}`);
  const comparisons = measured.v28AgainstV27 ?? {};
  for (const set of ['synthetic', 'corpus'] as const) {
    const counts: Record<string, number> = {};
    for (const comparison of Object.values(comparisons).filter((c) => c.set === set)) {
      counts[comparison.kind] = (counts[comparison.kind] ?? 0) + 1;
    }
    lines.push(`v28 against v27, ${set}: ${JSON.stringify(counts)}`);
  }
  for (const [name, comparison] of Object.entries(comparisons)) {
    if (comparison.kind === 'identical' || comparison.kind === 'evidence-only') continue;
    lines.push(
      `  ${comparison.kind} ${name}: up [${(comparison.up ?? []).join(', ')}] down [${(comparison.down ?? []).join(', ')}] readings [${(comparison.readings ?? []).join(', ')}]`,
    );
  }
  const unexplained = Object.entries(comparisons).filter(
    ([, comparison]) => (comparison.up ?? []).length > 0 && (comparison.readings ?? []).length === 0,
  );
  lines.push(`v28 above v27 where no v28 reading applies: ${unexplained.length}`);
  for (const [name] of unexplained) lines.push(`  ${name}`);
  const evidenceOnly = Object.entries(comparisons).filter(([, c]) => c.kind === 'evidence-only');
  lines.push(`evidence-only, by reading:`);
  const byReading: Record<string, string[]> = {};
  for (const [name, comparison] of evidenceOnly) {
    const key = (comparison.readings ?? ['no v28 reading']).join(' + ');
    (byReading[key] ??= []).push(name);
  }
  for (const [key, names] of Object.entries(byReading).sort()) lines.push(`  ${key} (${names.length}): ${names.join(', ')}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

const args = process.argv.slice(2);
// Re-measure named fixtures only (synthetic or corpus names), e.g. to read which surface fields
// moved: --out <file.json> --only <name> [<name> ...]
if (args[0] === '--out' && args[1] && args[2] === '--only') await measure(args[1], new Set(args.slice(3)));
else if (args[0] === '--out' && args[1]) await measure(args[1]);
else if (args[0] === '--compare' && args[1] && args[2]) compare(args[1], args[2]);
else {
  process.stderr.write('usage: --out <file.json> | --compare <baseline.json> <measured.json>\n');
  process.exit(2);
}
