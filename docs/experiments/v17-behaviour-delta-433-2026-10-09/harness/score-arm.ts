// Scores every corpus row with ONE cejel source tree's scanner. Run it once per arm, each time
// from inside the worktree whose scanner should be measured (see RUN.md beside this file):
//
//   cd <cejel worktree at the arm's commit> && ARM=base pnpm exec tsx <path to this file>
//
// The scanner is resolved from CEJEL_SRC, defaulting to the current working directory, and
// the resolved path plus its git HEAD are printed before any number — so a mis-pointed run is
// visible in its first line, never inferred from its output. (The first committed version of
// this file imported `./src/witan/public-scan.ts` relative to itself, which resolves only when
// the file is copied to a worktree root — how it was actually run — and throws
// ERR_MODULE_NOT_FOUND from where it is committed. Review finding on cejel #306.)
//
// #433 run: the source tree must also be at the arm's preregistered commit with no tracked
// changes, or nothing is scored. The 0.4.11 confirmation run's RUN.md named the wrong baseline
// and an unpinned candidate; this makes that mistake stop the run instead of reaching the record.
//
// Same corpus, same checkouts, same generatedAt, rubric = calibrated public default (v17).
// Writes one report per row plus _manifest.json.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The two arms named in ../PREREGISTRATION.md: v0.6.2 and #441's merge commit.
const ARM_COMMITS: Readonly<Record<string, string>> = {
  base: '7c9170f653fc5a2cd3e3f06d45b9fa3fe6e013a8',
  cand: '3c6d16137b48e9a9c4a78bd65dc4005d4276bd95',
};
const ARM = process.env.ARM;
if (!ARM || !(ARM in ARM_COMMITS)) throw new Error(`ARM env required (${Object.keys(ARM_COMMITS).join(' | ')})`);
const CEJEL_SRC = resolve(process.env.CEJEL_SRC ?? process.cwd());
const scannerPath = join(CEJEL_SRC, 'src/witan/public-scan.ts');
if (!existsSync(scannerPath)) {
  throw new Error(`no scanner at ${scannerPath} — run from a cejel worktree or set CEJEL_SRC to one`);
}
const srcHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: CEJEL_SRC, encoding: 'utf8' }).trim();
if (srcHead !== ARM_COMMITS[ARM]) {
  throw new Error(`arm ${ARM} must be scored at ${ARM_COMMITS[ARM]}, but ${CEJEL_SRC} is at ${srcHead}`);
}
const srcChanges = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: CEJEL_SRC, encoding: 'utf8' }).trim();
if (srcChanges !== '') throw new Error(`${CEJEL_SRC} has tracked changes; score only a clean tree:\n${srcChanges}`);
const { scoreRepoWithPublicCejel } = (await import(pathToFileURL(scannerPath).href)) as typeof import('../../../../src/witan/public-scan.ts');
const ROOT = resolve(process.env.DELTA_ROOT ?? resolve(process.env.HOME ?? '', 'tmp/cejel-433-delta'));
const OUT = join(ROOT, 'out', ARM);
mkdirSync(OUT, { recursive: true });
const corpus = JSON.parse(readFileSync(join(ROOT, 'corpus.json'), 'utf8'));
const GENERATED_AT = '2026-09-15T00:00:00.000Z';
const RUBRIC = 'witan-rubric-v17-2026-07-24';
const pkg = JSON.parse(readFileSync(join(CEJEL_SRC, 'package.json'), 'utf8'));
console.log(`arm=${ARM} scanner=${scannerPath} src=${srcHead.slice(0, 8)} package.version=${pkg.version} rubric=${RUBRIC} generatedAt=${GENERATED_AT}`);

const manifest: Record<string, unknown>[] = [];
for (const entry of corpus.entries) {
  const repoPath = join(ROOT, 'checkouts', entry.name);
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoPath, encoding: 'utf8' }).trim();
  const started = Date.now();
  try {
    const report = scoreRepoWithPublicCejel({
      repoPath,
      productSlug: entry.name,
      productDisplayName: entry.name,
      generatedAt: GENERATED_AT,
      rubricVersion: RUBRIC,
      ingestPatterns: [],
      autoDiscoverIngest: false,
    });
    writeFileSync(join(OUT, `${entry.name}.json`), JSON.stringify(report, null, 2));
    manifest.push({ name: entry.name, headSha, ok: true, ms: Date.now() - started, overall: report.overallScore, verdict: report.verdict });
    console.log(`ok ${entry.name} ${headSha.slice(0, 8)} overall=${report.overallScore} verdict=${report.verdict} ${Date.now() - started}ms`);
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).replaceAll(ROOT, '[root]');
    manifest.push({ name: entry.name, headSha, ok: false, error: message });
    console.log(`ERROR ${entry.name}: ${message}`);
  }
}
writeFileSync(join(OUT, '_manifest.json'), JSON.stringify({ arm: ARM, srcHead, packageVersion: pkg.version, rubric: RUBRIC, generatedAt: GENERATED_AT, rows: manifest }, null, 2));
console.log(`ARM_DONE ${ARM} ok=${manifest.filter((r) => r.ok).length}/${manifest.length}`);
