import { scoreRepoWithPublicCejel } from '/private/tmp/cejel-v17-rebind-run/src/witan/public-scan.ts';

const [repoPath, generatedAt] = process.argv.slice(2);
if (!repoPath || !generatedAt) throw new Error('usage: scan-one.mjs <repo-path> <generated-at>');

const report = scoreRepoWithPublicCejel({
  repoPath,
  productSlug: 'cejel',
  productDisplayName: 'Cejel',
  generatedAt,
  autoDiscoverIngest: false,
});
process.stdout.write(`${JSON.stringify(report)}\n`);
