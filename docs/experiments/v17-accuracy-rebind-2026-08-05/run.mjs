import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import { basename, join, resolve } from 'node:path';

const expectedHead = 'd53066e0073de66d32b7e4aa58286c7c7354fedb';
const expectedManifest = 'b277944058f558066f762ebcbe45dc69f6e043ee3fc4f8dceae211c07164a7a3';
const alfred = '/Users/bargs/projects/alfred';
const target = '/private/tmp/cejel-v17-rebind-run';
const root = resolve(import.meta.dirname);
const artifact = join(root, 'run');
const checkoutRoot = '/private/tmp/cejel-v17-rebind-corpus';
const manifestSpec = '7354b40:docs/calibration/free-core-untouched-holdout-v50-2026-07-24/manifest-wave-1.json';
const generatedAt = '2026-07-24T21:39:19.000Z';
const command = 'node docs/experiments/v17-accuracy-rebind-2026-08-05/run.mjs';
const noNetworkProfile = '(version 1) (deny network*) (allow default)';

function run(commandName, args, options = {}) {
  return execFileSync(commandName, args, { encoding: 'utf8', ...options });
}
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
function write(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
function append(line) {
  writeFileSync(join(artifact, 'run.log'), `${line}\n`, { flag: 'a' });
}

if (existsSync(artifact)) throw new Error(`refusing to reuse run directory: ${artifact}`);
const resolvedHead = run('git', ['-C', target, 'rev-parse', 'HEAD']).trim();
if (resolvedHead !== expectedHead) throw new Error(`HEAD mismatch: ${resolvedHead}`);
const manifestRaw = run('git', ['-C', alfred, 'show', manifestSpec]);
const manifestHash = sha256(manifestRaw);
if (manifestHash !== expectedManifest) throw new Error(`manifest mismatch: ${manifestHash}`);
const manifest = JSON.parse(manifestRaw);
if (!Array.isArray(manifest.selected) || manifest.selected.length !== 200) {
  throw new Error('expected exactly 200 manifest entries');
}

mkdirSync(join(artifact, 'raw-reports'), { recursive: true });
mkdirSync(checkoutRoot, { recursive: true });
writeFileSync(join(artifact, 'manifest-wave-1.json'), manifestRaw);
append(`resolvedHead=${resolvedHead}`);
append(`manifestSha256=${manifestHash}`);
append(`command=${command}`);
append(`scanSandbox=${noNetworkProfile}`);
const metadata = {
  resolvedHead,
  manifestSha256: manifestHash,
  command,
  scannerCommand: `sandbox-exec -p ${JSON.stringify(noNetworkProfile)} node --import tsx docs/experiments/v17-accuracy-rebind-2026-08-05/scan-one.mjs <checkout> ${generatedAt}`,
  generatedAt,
  node: process.version,
  os: `${platform()} ${release()}`,
  arch: arch(),
  offlineBoundary: 'Each scoring child runs under sandbox-exec deny network* after its Git remote is removed.',
  startedAt: new Date().toISOString(),
};
write(join(artifact, 'run-metadata.json'), metadata);

const rows = [];
let failure = null;
for (const [index, entry] of manifest.selected.entries()) {
  const directory = join(checkoutRoot, `${String(index + 1).padStart(3, '0')}-${basename(entry.fullName)}`);
  try {
    run('git', ['init', '--quiet', directory]);
    run('git', ['-C', directory, 'remote', 'add', 'origin', entry.url]);
    run('git', ['-C', directory, 'fetch', '--no-tags', 'origin', entry.revision]);
    run('git', ['-C', directory, 'checkout', '--quiet', '--detach', entry.revision]);
    const actual = run('git', ['-C', directory, 'rev-parse', 'HEAD']).trim();
    if (actual !== entry.revision) throw new Error(`checkout mismatch: ${actual}`);
    run('git', ['-C', directory, 'remote', 'remove', 'origin']);
    const child = spawnSync(
      'sandbox-exec',
      ['-p', noNetworkProfile, 'node', '--import', 'tsx', join(root, 'scan-one.mjs'), directory, generatedAt],
      { cwd: target, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    if (child.status !== 0) throw new Error(`scanner failed: ${String(child.stderr).trim()}`);
    const report = JSON.parse(child.stdout);
    const reportPath = join('raw-reports', `${String(index + 1).padStart(3, '0')}-${sha256(entry.fullName).slice(0, 12)}.json`);
    write(join(artifact, reportPath), report);
    rows.push({ index: index + 1, repository: entry.fullName, revision: entry.revision, status: 'scanned', reportPath });
    append(`scanned index=${index + 1} repository=${entry.fullName} revision=${entry.revision}`);
  } catch (error) {
    failure = { index: index + 1, repository: entry.fullName, revision: entry.revision, error: String(error.message ?? error) };
    rows.push({ ...failure, status: 'error' });
    append(`error index=${failure.index} repository=${failure.repository} error=${failure.error}`);
    break;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
const skipTotals = { unreadable: 0, tooLarge: 0, excludedByExtension: 0, deniedPath: 0, nonRegularFile: 0 };
for (const row of rows.filter((row) => row.status === 'scanned')) {
  const report = JSON.parse(readFileSync(join(artifact, row.reportPath), 'utf8'));
  const reasons = report.contentReadSummary?.byReason ?? {};
  for (const key of Object.keys(skipTotals)) skipTotals[key] += reasons[key] ?? 0;
}
const result = { ...metadata, endedAt: new Date().toISOString(), completed: rows.filter((row) => row.status === 'scanned').length, total: manifest.selected.length, failure, rows, skipTotals };
write(join(artifact, 'raw-index.json'), result);
append(`completed=${result.completed} total=${result.total}`);
append(`endedAt=${result.endedAt}`);
if (failure) process.exitCode = 1;
