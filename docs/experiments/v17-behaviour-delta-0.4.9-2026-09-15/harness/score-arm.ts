// Runs from inside a cejel worktree (base or candidate) via `pnpm exec tsx`, so it
// scores with THAT worktree's src/witan. Same corpus, same checkouts, same
// generatedAt, rubric = calibrated public default (v17). Writes one report per row.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { scoreRepoWithPublicCejel } from './src/witan/public-scan.ts';

const ARM = process.env.ARM;
if (!ARM) throw new Error('ARM env required');
const ROOT = resolve(process.env.HOME ?? '', 'tmp/cejel-049-delta');
const OUT = join(ROOT, 'out', ARM);
mkdirSync(OUT, { recursive: true });
const corpus = JSON.parse(readFileSync(join(ROOT, 'corpus.json'), 'utf8'));
const GENERATED_AT = '2026-09-15T00:00:00.000Z';
const RUBRIC = 'witan-rubric-v17-2026-07-24';
const srcHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
console.log(`arm=${ARM} src=${srcHead.slice(0, 8)} package.version=${pkg.version} rubric=${RUBRIC}`);

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
