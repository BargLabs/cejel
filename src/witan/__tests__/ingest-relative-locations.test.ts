import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { serializeWitanReport } from '../attestation.js';
import { readIngestDocument } from '../ingest.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { HERMETIC_GIT_ENV } from './fixtures/behaviour-corpus.js';

// #767. A scanner may write a result's location as an absolute path or a file:// URI (OSV-Scanner
// 2.7.1's SARIF does, for every result). The location must reach report.json and the certificate
// relative to the scanned repository, or not at all: a certificate made on one machine and then
// published must not carry that machine's directory path.

let workspace: string;
let repoPath: string;

beforeEach(() => {
  workspace = realpathSync(mkdtempSync(join(tmpdir(), 'cejel-ingest-location-')));
  repoPath = join(workspace, 'repo with space');
  mkdirSync(join(repoPath, 'src'), { recursive: true });
  writeFileSync(join(repoPath, 'package-lock.json'), '{}\n', 'utf8');
  writeFileSync(join(repoPath, 'src/db.ts'), 'export const db = 1;\n', 'utf8');
  writeFileSync(join(repoPath, 'README.md'), '# fixture\n', 'utf8');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repoPath, env: HERMETIC_GIT_ENV, stdio: 'pipe' });
  git('init', '--quiet');
  git('add', '--all');
  git('commit', '--quiet', '--no-gpg-sign', '-m', 'fixture');
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function sarifWith(uris: readonly string[]): string {
  const path = join(workspace, 'scanner.sarif');
  writeFileSync(
    path,
    JSON.stringify({
      version: '2.1.0',
      runs: [
        {
          tool: { driver: { name: 'osv-scanner', version: '2.7.1' } },
          results: uris.map((uri, index) => ({
            ruleId: `CVE-2026-${1000 + index}`,
            level: 'warning',
            message: { text: `Package 'left-pad@0.0.${index}' is vulnerable.` },
            locations: [{ physicalLocation: { artifactLocation: { uri }, ...(index === 1 ? { region: { startLine: 7 } } : {}) } }],
          })),
        },
      ],
    }),
    'utf8',
  );
  return path;
}

describe('ingested locations in the report (#767)', () => {
  it('readIngestDocument rewrites each finding location against the repository root', () => {
    const file = sarifWith([
      pathToFileURL(join(repoPath, 'package-lock.json')).href,
      join(repoPath, 'src/db.ts'),
      pathToFileURL(join(workspace, 'outside.lock')).href,
      'src/db.ts',
    ]);
    const findings = readIngestDocument(file, { repoRoot: repoPath }).signals.flatMap((signal) => signal.findings);
    expect(findings.map((finding) => finding.location)).toEqual(['package-lock.json', 'src/db.ts:7', undefined, 'src/db.ts']);
    expect(findings.every((finding) => !('location' in finding) || finding.location !== undefined)).toBe(true);
  });

  it('a scan that ingests absolute locations writes no path of the scanning machine into report.json', () => {
    const file = sarifWith([
      pathToFileURL(join(repoPath, 'package-lock.json')).href,
      join(repoPath, 'src/db.ts'),
      pathToFileURL(join(workspace, 'outside.lock')).href,
    ]);
    const report = scoreRepoWithPublicCejel({
      repoPath,
      productSlug: 'ingest-location',
      productDisplayName: 'Ingest location',
      generatedAt: '2026-11-24T00:00:00.000Z',
      ingestPatterns: [file],
      autoDiscoverIngest: false,
    });
    const text = serializeWitanReport(report);
    expect(text).not.toContain(workspace);
    expect(text).not.toContain(encodeURI(workspace));
    const locations = (report.consumedSignals ?? []).flatMap((signal) => signal.findings.map((finding) => finding.location));
    expect(locations).toEqual(expect.arrayContaining(['package-lock.json', 'src/db.ts:7']));
    expect(locations).toHaveLength(3);
  });
});
