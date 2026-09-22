import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildRelyingPartySummary } from '../certificate-presentation.js';
import { buildWitanInputFromRepo } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V23 } from '../rubric-version.js';
import { createWitanReport } from '../scoring.js';

// A withheld file that touched no signal is indistinguishable, from the certificate alone, from a
// disclosure that simply failed to print. This suite pins the fix: withheld-path state is a
// statement present on EVERY certificate, one of exactly four sentences, never silence
// (goal_cejel_withheld_paths_always_disclosed_2026-09-22).

const OVERSIZED_BYTES = 512_001;

function makeRepo(files: Readonly<Record<string, string>>): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-withheld-disclosed-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(repo, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
    execFileSync('git', ['add', path], { cwd: repo });
  }
  return repo;
}

function scan(files: Readonly<Record<string, string>>, rubricVersion: string) {
  const input = buildWitanInputFromRepo({
    productSlug: 'withheld-disclosed-fixture',
    productDisplayName: 'Withheld disclosed fixture',
    repoPath: makeRepo(files),
    generatedAt: '2026-09-22T00:00:00.000Z',
    rubricVersion,
  });
  const report = createWitanReport(input);
  const notEstablished = buildRelyingPartySummary(report).notEstablished;
  return { report, notEstablished };
}

const PLAIN_SERVICE: Readonly<Record<string, string>> = {
  'package.json': '{"scripts":{"start":"node src/main.js","typecheck":"tsc --noEmit"}}\n',
  'src/main.js':
    "import http from 'node:http';\n" +
    'http.createServer((request, response) => response.end(request.method)).listen(5300);\n',
  'README.md': '# fixture\n\nA small service used as a scan fixture.\n',
};

describe('withheld-path state is a statement on every certificate, never silence', () => {
  it('sentence 1: no withheld paths at all', () => {
    const { report, notEstablished } = scan(PLAIN_SERVICE, WITAN_RUBRIC_VERSION_V17);

    expect(report.withheldPaths).toEqual([]);
    expect(notEstablished).toContain('No content was withheld from any signal.');
  });

  it('sentence 2: withheld, but no signal\'s own file-selection test would have read them', () => {
    // .txt fixtures under fixtures/ match no signal's file-selection predicate: not an
    // implementation-file extension (A3, A5.claim_match_rate) and not a README/docs/security/
    // reconciliation doc name (A5's other three signals). Same shape as the "keeps A5 scored"
    // regression guard in withheld-path-abstention-v23.test.ts.
    const files = {
      ...PLAIN_SERVICE,
      'fixtures/corpus-a.txt': 'x'.repeat(OVERSIZED_BYTES),
      'fixtures/corpus-b.txt': 'y'.repeat(OVERSIZED_BYTES),
    };
    const { report, notEstablished } = scan(files, WITAN_RUBRIC_VERSION_V23);

    expect(report.withheldPaths).toHaveLength(2);
    for (const entry of report.withheldPaths ?? []) {
      expect(entry.reason).toBe('too_large');
      expect(entry.signalsAdmitting).toEqual([]);
      expect(entry.actedOn).toBe(false);
    }
    expect(notEstablished).toContain(
      '2 content entries were withheld (too large); no signal that would have read them ' +
        'selected them, so no result depends on them.',
    );
  });

  // SECURITY.md and THREAT-MODEL.md at the repository root match isNegativeSpaceDocCandidate
  // (A5.negative_space_documentation's own file-selection test) and nothing else: neither is
  // README.md or docs/*.md (isClaimSourceFile, which would also pull in claim_match_rate and
  // claim_source_depth), and neither is claim-reality-reconciliation.md
  // (isClaimRealityReconciliationPath). This isolates the intersection to exactly one named
  // signal, so the certificate line is pinned exactly rather than by substring.
  const NEGATIVE_SPACE_DOC_FILES: Readonly<Record<string, string>> = {
    ...PLAIN_SERVICE,
    'SECURITY.md': '# Security\n\n' + '// '.padEnd(OVERSIZED_BYTES - 13, 'x') + '\n',
    'THREAT-MODEL.md': '# Threat model\n\n' + '// '.padEnd(OVERSIZED_BYTES - 17, 'x') + '\n',
  };

  it('sentence 3: withheld, an earned intersection, and the rubric\'s mechanism acted on it', () => {
    const { report, notEstablished } = scan(NEGATIVE_SPACE_DOC_FILES, WITAN_RUBRIC_VERSION_V23);

    expect(report.withheldPaths).toHaveLength(2);
    for (const entry of report.withheldPaths ?? []) {
      expect(entry.reason).toBe('too_large');
      expect(entry.signalsAdmitting).toEqual(['A5.negative_space_documentation']);
      expect(entry.actedOn).toBe(true);
    }
    expect(notEstablished).toContain(
      '2 content entries were withheld (too large); A5.negative_space_documentation abstained ' +
        'on them rather than assert an absence — a disclosed coverage limit, not a read failure.',
    );
  });

  it('sentence 4: withheld, the same earned intersection, but this rubric\'s mechanism is off', () => {
    // Same two files, same signal, same predicate result — only the rubric differs. v17 is the
    // calibrated public default, where useV23WithheldPathAbstention is false: the intersection is
    // still computed and disclosed, but never acted on, so A5.negative_space_documentation still
    // reports on what it read (nothing) rather than abstaining.
    const { report, notEstablished } = scan(NEGATIVE_SPACE_DOC_FILES, WITAN_RUBRIC_VERSION_V17);

    expect(report.withheldPaths).toHaveLength(2);
    for (const entry of report.withheldPaths ?? []) {
      expect(entry.reason).toBe('too_large');
      expect(entry.signalsAdmitting).toEqual(['A5.negative_space_documentation']);
      expect(entry.actedOn).toBe(false);
    }
    expect(notEstablished).toContain(
      '2 content entries were withheld (too large); A5.negative_space_documentation would have ' +
        'read them. Under this rubric that signal reports on what it read; the prospective v23 ' +
        'rubric abstains instead.',
    );
  });
});
