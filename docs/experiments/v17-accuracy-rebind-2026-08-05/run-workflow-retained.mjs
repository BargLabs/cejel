import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import { basename, join, resolve } from 'node:path';

const expectedHead = process.env.EXPECTED_REVISION;
const expectedManifest = process.env.EXPECTED_MANIFEST_SHA256;
const detectorRoot = process.env.DETECTOR_ROOT;
const manifestPath = process.env.MANIFEST_PATH;
const artifact = process.env.OUTPUT_ROOT;
if (!expectedHead || !expectedManifest || !detectorRoot || !manifestPath || !artifact) throw new Error('missing required workflow environment');
const run = (cmd, args, options = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...options });
const hash = (value) => createHash('sha256').update(value).digest('hex');
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const manifestRaw = readFileSync(manifestPath, 'utf8');
if (hash(manifestRaw) !== expectedManifest) throw new Error('manifest SHA-256 mismatch');
if (run('git', ['-C', detectorRoot, 'rev-parse', 'HEAD']).trim() !== expectedHead) throw new Error('detector HEAD mismatch');
const manifest = JSON.parse(manifestRaw);
if (!Array.isArray(manifest.selected) || manifest.selected.length !== 200) throw new Error('expected 200 manifest entries');
const sourceRoot = join(artifact, 'source-checkouts');
mkdirSync(join(artifact, 'raw-reports'), { recursive: true });
mkdirSync(sourceRoot, { recursive: true });
writeFileSync(join(artifact, 'manifest-wave-1.json'), manifestRaw);
const metadata = { resolvedHead: expectedHead, manifestSha256: expectedManifest, generatedAt: '2026-07-24T21:39:19.000Z', command: process.argv.join(' '), node: process.version, os: `${platform()} ${release()}`, arch: arch(), retention: 'Detached pinned checkouts are retained for frozen packet generation; no repository code is executed.' };
write(join(artifact, 'run-metadata.json'), metadata);
const rows = []; let failure = null;
for (const [offset, entry] of manifest.selected.entries()) {
  const index = offset + 1; const checkout = join(sourceRoot, `${String(index).padStart(3, '0')}-${basename(entry.fullName)}`);
  try {
    run('git', ['init', '--quiet', checkout]); run('git', ['-C', checkout, 'remote', 'add', 'origin', entry.url]);
    run('git', ['-C', checkout, 'fetch', '--no-tags', 'origin', entry.revision]); run('git', ['-C', checkout, 'checkout', '--quiet', '--detach', entry.revision]);
    if (run('git', ['-C', checkout, 'rev-parse', 'HEAD']).trim() !== entry.revision) throw new Error('checkout mismatch');
    run('git', ['-C', checkout, 'remote', 'remove', 'origin']);
    const child = spawnSync('node', ['--import', 'tsx', resolve(import.meta.dirname, 'scan-one-workflow-retained.mjs'), checkout, metadata.generatedAt], { cwd: detectorRoot, env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (child.status !== 0) throw new Error(String(child.stderr).trim());
    const reportPath = join('raw-reports', `${String(index).padStart(3, '0')}-${hash(entry.fullName).slice(0, 12)}.json`);
    write(join(artifact, reportPath), JSON.parse(child.stdout)); rows.push({ index, repository: entry.fullName, revision: entry.revision, status: 'scanned', reportPath, checkoutPath: `source-checkouts/${basename(checkout)}` });
  } catch (error) { failure = { index, repository: entry.fullName, revision: entry.revision, error: String(error.message ?? error) }; rows.push({ ...failure, status: 'error' }); break; }
}
const skipTotals = { unreadable: 0, tooLarge: 0, excludedByExtension: 0, deniedPath: 0, nonRegularFile: 0 };
for (const row of rows.filter((row) => row.status === 'scanned')) for (const [kind, count] of Object.entries(JSON.parse(readFileSync(join(artifact, row.reportPath), 'utf8')).contentReadSummary?.byReason ?? {})) if (kind in skipTotals) skipTotals[kind] += count;
write(join(artifact, 'raw-index.json'), { ...metadata, endedAt: new Date().toISOString(), completed: rows.filter((row) => row.status === 'scanned').length, total: 200, failure, rows, skipTotals });
if (failure) process.exitCode = 1;
