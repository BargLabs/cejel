import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V22, WITAN_RUBRIC_VERSION_V23 } from '../rubric-version.js';

// goal_cejel_certificate_scope_disclosure_0_4_9_2026-09-14: a large implementation file that
// exceeds the repository content size limit is exactly the "large implementation files" case
// named in the goal — the tree's own conclusion (no evidence found for this signal) is
// defensible about what was read and misleading about the file that was not. This is a matched
// pair, as the guard requirement asks for: one fixture that triggers the large-file disclosure
// line, one that does not. The fixture reuses the exact scenario already proven, in
// withheld-path-abstention-v23.test.ts, to attribute a too-large skip to a named signal
// (A3.health_readiness_route) — that is currently the ONLY reachable path to a 'too_large'
// scanLimitations attribution: every too-large skip is recorded at file-inventory time,
// unattributed, unless a signal explicitly re-claims its withheld path via
// abstainSignalOnWithheldPaths (repo-signals.ts), which today only A3's two signals do, and only
// under WITAN_RUBRIC_VERSION_V23 (useV23WithheldPathAbstention). A wholesale (whole-criterion)
// 'too_large' abstention is consequently unreachable today; this suite does not claim one.

const OVERSIZED_BYTES = 512_001;

function makeRepo(files: Readonly<Record<string, string>>): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-large-file-scope-'));
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

const SERVICE_WITHOUT_HEALTH_ROUTE: Readonly<Record<string, string>> = {
  'package.json': '{"scripts":{"start":"node src/main.js","typecheck":"tsc --noEmit"}}\n',
  'src/main.js':
    "import http from 'node:http';\n" +
    'http.createServer((request, response) => response.end(request.method)).listen(5300);\n',
};

// The same service, plus one authored implementation file that DOES declare a health route and
// that Cejel declines to read because it exceeds the content ceiling.
function serviceWithOversizedHealthRouteFile(): Readonly<Record<string, string>> {
  const healthRoute =
    "export function health(request, response) {\n" +
    "  if (request.url === '/healthz') return response.end('ok');\n" +
    "  if (request.url === '/readyz') return response.end('ready');\n" +
    '}\n';
  return {
    ...SERVICE_WITHOUT_HEALTH_ROUTE,
    'src/health.js': healthRoute + '// '.padEnd(OVERSIZED_BYTES - healthRoute.length, 'x') + '\n',
  };
}

function scan(files: Readonly<Record<string, string>>, rubricVersion: string) {
  const input = buildWitanInputFromRepo({
    productSlug: 'large-file-scope-fixture',
    productDisplayName: 'Large file scope fixture',
    repoPath: makeRepo(files),
    generatedAt: '2026-09-14T00:00:00.000Z',
    rubricVersion,
  });
  const a3 = (input.signals ?? []).find((signal) => signal.criterionId === 'A3');
  return { input, a3 };
}

describe('large-implementation-file scan-limitation disclosure', () => {
  it('v23: names the large file specifically, distinct from the extension/non-regular-file bucket', () => {
    const { input, a3 } = scan(serviceWithOversizedHealthRouteFile(), WITAN_RUBRIC_VERSION_V23);

    expect(input.contentReadSummary?.byReason.tooLarge).toBe(1);
    expect(a3?.insufficientData).toBeUndefined();
    expect(input.scanLimitations ?? []).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /declined a large implementation file that exceeded the repository content size limit.*A3\.health_readiness_route/s,
        ),
      ]),
    );
    // Never worded as a read failure — this is a disclosed coverage limit, not evidence loss.
    for (const line of input.scanLimitations ?? []) {
      expect(line).not.toMatch(/could not be read/i);
    }
  });

  it('v23: the same service without an oversized file triggers no large-file disclosure', () => {
    const { input, a3 } = scan(SERVICE_WITHOUT_HEALTH_ROUTE, WITAN_RUBRIC_VERSION_V23);

    expect(input.contentReadSummary?.byReason.tooLarge ?? 0).toBe(0);
    expect(a3?.insufficientData).toBeUndefined();
    expect(input.scanLimitations ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining('large implementation file')]),
    );
  });

  it('v22: the mechanism is v23-only — the same oversized fixture produces no large-file disclosure', () => {
    const { input, a3 } = scan(serviceWithOversizedHealthRouteFile(), WITAN_RUBRIC_VERSION_V22);

    expect(input.contentReadSummary?.byReason.tooLarge).toBe(1);
    expect(a3?.insufficientData).toBeUndefined();
    expect(input.scanLimitations ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining('large implementation file')]),
    );
  });
});
