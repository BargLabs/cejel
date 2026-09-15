import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V22,
  WITAN_RUBRIC_VERSION_V23,
} from '../rubric-version.js';
import type { WitanCriterionId } from '../schemas.js';

// A file Cejel withholds from the repository file list under its own 512,000-byte content
// ceiling is deleted before any collector walks that list. A signal whose pattern would have
// matched it therefore reports a plain finding of absence, indistinguishable from a repository
// that genuinely lacks the thing. These guards cover the fix and — more importantly — the
// boundaries it must not cross.
const HEALTH_ROUTE_ABSENCE_SUMMARY =
  'A production HTTP entrypoint handles requests directly but declares no health or readiness route.';

const OVERSIZED_BYTES = 512_001;

function makeRepo(files: Readonly<Record<string, string>>): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-withheld-path-'));
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
    productSlug: 'withheld-path-fixture',
    productDisplayName: 'Withheld path fixture',
    repoPath: makeRepo(files),
    generatedAt: '2026-09-14T00:00:00.000Z',
    rubricVersion,
  });
  const signal = (criterionId: WitanCriterionId) =>
    (input.signals ?? []).find((candidate) => candidate.criterionId === criterionId);
  return { input, signal };
}

// A deployable service whose production HTTP entrypoint handles requests directly and declares
// no health route of its own. On its own this is a true absence: A3 says so, correctly.
const SERVICE_WITHOUT_HEALTH_ROUTE: Readonly<Record<string, string>> = {
  'package.json': '{"scripts":{"start":"node src/main.js","typecheck":"tsc --noEmit"}}\n',
  'src/main.js':
    "import http from 'node:http';\n" +
    'http.createServer((request, response) => response.end(request.method)).listen(5300);\n',
};

// The same service, plus one authored implementation file that DOES declare a health route and
// that Cejel declines to read because it exceeds the content ceiling. The absence the fixture
// above reports truthfully is, here, a false assertion.
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

describe('v23 withheld-path abstention — a file Cejel withheld can abstain the signal it would have fed', () => {
  it('abstains the A3 health-route signal under the size ceiling instead of asserting absence', () => {
    const files = serviceWithOversizedHealthRouteFile();
    const { input, signal } = scan(files, WITAN_RUBRIC_VERSION_V23);
    const a3 = signal('A3');

    // The oversized file is the only skip in this fixture, so tooLarge === 1 pins the reason
    // mechanically: the abstention below is attributable to nothing else.
    expect(input.contentReadSummary?.byReason.tooLarge).toBe(1);
    expect(input.contentReadSummary?.byReason.unreadable).toBe(0);
    expect(input.contentReadSummary?.byReason.deniedPath).toBe(0);
    expect(input.contentReadSummary?.affectedCriteria).toContain('A3');

    // The defect: an absence finding derived from a list the matching file was deleted from.
    expect((a3?.findings ?? []).map(({ summary }) => summary)).not.toContain(
      HEALTH_ROUTE_ABSENCE_SUMMARY,
    );

    // The abstention is recorded against the signal that would have read the file, and is
    // described as the disclosed coverage limit it is — never as a read failure.
    expect(a3?.notes).toContain('health_readiness_route');
    expect(a3?.notes).toContain('repository content size limit');
    expect(a3?.notes).not.toContain('could not be read');
    expect(
      input.scanLimitations?.some(
        (line) =>
          line.includes('A3.health_readiness_route') &&
          line.includes('disclosed coverage limit, not a read failure'),
      ),
    ).toBe(true);

    // ...and the criterion still scores. A self-imposed coverage limit must not wipe A3, and it
    // must not put A3 in the composite denominator at zero.
    expect(a3?.insufficientData).toBeUndefined();
    expect(a3?.metrics?.some((metric) => metric.name === 'prod_readiness_primitives')).toBe(true);
    expect(a3?.metrics?.some((metric) => metric.name === 'prod_workflow_depth')).toBe(true);
  });

  it('still reports a plain absence finding when nothing was withheld', () => {
    // The guard that matters most: the fix must abstain on an EARNED match, not convert every
    // absence into an abstention. Same service, no oversized file, no health route anywhere.
    const { input, signal } = scan(SERVICE_WITHOUT_HEALTH_ROUTE, WITAN_RUBRIC_VERSION_V23);
    const a3 = signal('A3');

    expect(input.contentReadSummary?.skipped).toBe(0);
    expect(input.contentReadSummary?.affectedCriteria ?? []).not.toContain('A3');
    expect((a3?.findings ?? []).map(({ summary }) => summary)).toContain(
      HEALTH_ROUTE_ABSENCE_SUMMARY,
    );
    expect(a3?.insufficientData).toBeUndefined();
    expect(a3?.notes ?? '').not.toContain('health_readiness_route');
  });

  it('does not abstain on a withheld path the signal would never have read', () => {
    // An oversized file outside every A3 content signal's own file-selection test. The size cap
    // still applies and is still disclosed, but no A3 signal loses anything it was going to read,
    // so the true absence is still reported as an absence.
    const files = {
      ...SERVICE_WITHOUT_HEALTH_ROUTE,
      'docs/transcript.txt': 'x'.repeat(OVERSIZED_BYTES),
    };
    const { input, signal } = scan(files, WITAN_RUBRIC_VERSION_V23);
    const a3 = signal('A3');

    expect(input.contentReadSummary?.byReason.tooLarge).toBe(1);
    expect(input.contentReadSummary?.affectedCriteria ?? []).not.toContain('A3');
    expect((a3?.findings ?? []).map(({ summary }) => summary)).toContain(
      HEALTH_ROUTE_ABSENCE_SUMMARY,
    );
  });

  it('keeps A5 scored when an unrelated oversized file merely maps to it by extension', () => {
    // Regression guard on goal_cejel_0_4_8_abstention_scoring_fix_2026-09-08 defect 1, which this
    // card must not reverse: a repository whose small README fully answers A5 was abstaining A5
    // because unrelated oversized .txt fixtures mapped to A5 by extension. An abstention has to
    // be earned by a signal's own test against the withheld path — extension mapping is not one.
    const files = {
      ...SERVICE_WITHOUT_HEALTH_ROUTE,
      'README.md':
        '# Withheld path fixture\n\n' +
        'A small HTTP service used as a scan fixture.\n\n' +
        '## Install\n\n```sh\nnpm install\n```\n\n' +
        '## Usage\n\n```sh\nnpm start\n```\n\n' +
        'Requires Node.js 22 or newer. Not published; no support is offered.\n',
      'fixtures/corpus-a.txt': 'x'.repeat(OVERSIZED_BYTES),
      'fixtures/corpus-b.txt': 'y'.repeat(OVERSIZED_BYTES),
    };
    const { input, signal } = scan(files, WITAN_RUBRIC_VERSION_V23);
    const a5 = signal('A5');

    expect(input.contentReadSummary?.byReason.tooLarge).toBe(2);
    expect(input.contentReadSummary?.affectedCriteria ?? []).not.toContain('A5');
    expect(a5?.insufficientData).toBeUndefined();
    expect((a5?.metrics?.length ?? 0) > 0 || (a5?.notApplicable ?? false)).toBe(true);
  });

  it('leaves v17 and v22 byte-stable: the withheld-path mechanism is v23-only', () => {
    // v17 is the calibrated public default and v22 has no per-signal abstention, so an attributed
    // skip there routes through the wholesale-wipe branch and would abstain all of A3 over one
    // oversized file — the criterion-wide over-abstention the 0.4.8 fix removed. The mechanism is
    // therefore gated to the rubric that can keep it narrow.
    for (const rubricVersion of [WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V22]) {
      const { input, signal } = scan(serviceWithOversizedHealthRouteFile(), rubricVersion);
      const a3 = signal('A3');
      expect(input.contentReadSummary?.affectedCriteria ?? []).not.toContain('A3');
      expect(a3?.insufficientData).toBeUndefined();
      if (rubricVersion === WITAN_RUBRIC_VERSION_V22) {
        expect((a3?.findings ?? []).map(({ summary }) => summary)).toContain(
          HEALTH_ROUTE_ABSENCE_SUMMARY,
        );
      }
    }
  });
});
