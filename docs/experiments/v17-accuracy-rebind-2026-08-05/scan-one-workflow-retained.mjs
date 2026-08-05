import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [repoPath, generatedAt] = process.argv.slice(2);
const detectorRoot = process.env.DETECTOR_ROOT;
if (!repoPath || !generatedAt || !detectorRoot) throw new Error('missing repoPath, generatedAt, or DETECTOR_ROOT');
const { scoreRepoWithPublicCejel } = await import(
  pathToFileURL(resolve(detectorRoot, 'src/witan/public-scan.ts')).href,
);
const report = scoreRepoWithPublicCejel({
  repoPath,
  productSlug: 'cejel',
  productDisplayName: 'Cejel',
  generatedAt,
  autoDiscoverIngest: false,
});
process.stdout.write(`${JSON.stringify(report)}\n`);
