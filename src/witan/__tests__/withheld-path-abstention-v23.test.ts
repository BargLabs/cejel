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
import { createWitanReport } from '../scoring.js';

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
  const report = () => createWitanReport(input);
  const scored = (criterionId: WitanCriterionId) =>
    report().criteria.find((candidate) => candidate.id === criterionId);
  return { input, signal, report, scored };
}

// The A5 claim-reality fixture pair, in the shape the defect was demonstrated on: two authored
// implementation files and one claim source, identical in every byte except how much comment
// padding sits inside the second implementation file. `claim_match_rate` is implementation files
// over implementation-plus-claim-source files, so withholding one implementation file removes it
// from BOTH sides of the ratio and the ratio itself falls. Public-documentation idioms only.
const CLAIM_SOURCE_README =
  '# fixture service\n\nA small HTTP service used as a scan fixture.\n\n' +
  '## Install\n\n```sh\nnpm install\n```\n\n## Usage\n\n```sh\nnpm start\n```\n';

function claimRealityRepo(serverPadBytes: number): Readonly<Record<string, string>> {
  const body =
    "import pino from 'pino';\n" +
    'const logger = pino();\n' +
    "export function start() { logger.info('ready'); }\n";
  return {
    'package.json':
      '{"name":"fixture","version":"1.0.0","scripts":{"test":"vitest","build":"tsc"}}\n',
    'README.md': CLAIM_SOURCE_README,
    'src/app.ts': 'export const x = 1;\n',
    'src/server.ts': body + '// '.padEnd(Math.max(serverPadBytes - body.length, 3), 'x') + '\n',
  };
}

const OVERSIZED_CLAIM_REPO = claimRealityRepo(OVERSIZED_BYTES);
const CONTROL_CLAIM_REPO = claimRealityRepo(200_000);

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
    // prod_readiness_primitives is now ALSO legitimately abstained here: #308 wired the same
    // withheld-path check for its content-based error-middleware scan, which reads the identical
    // "any authored implementation file" predicate as health_readiness_route above, so this
    // fixture's one oversized file abstains both signals, not just the one this test names.
    expect(a3?.metrics?.some((metric) => metric.name === 'prod_readiness_primitives')).toBe(false);
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
    // Tightened when A5's own signals were wired (this card): the guard above passed while A5 had
    // no withheld-path check at all, so it could not distinguish "the predicate is correctly
    // narrow" from "nothing is wired yet". Name the signal the oversized .txt files map to by
    // extension and would abstain if the predicate were an extension map rather than A5's own
    // file-selection test.
    expect(a5?.metrics?.some((metric) => metric.name === 'claim_match_rate')).toBe(true);
    expect(a5?.notes ?? '').not.toContain('claim_match_rate');
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

  // goal_cejel_a3_runtime_pattern_coverage_0_4_9_2026-09-14: the content-based Express
  // error-middleware scan #308 added reads repoFiles exactly like health_readiness_route and
  // observability_depth above, but shipped without a call into abstainSignalOnWithheldPaths — an
  // oversized error-handler file was silently uncredited rather than abstained, the same false
  // "no error boundary" absence the withheld-path mechanism exists to prevent everywhere else.
  it('abstains prod_readiness_primitives when the only error-handler-shaped file is withheld, instead of asserting absence', () => {
    const handler =
      'module.exports = function errorHandler(err, req, res, next) {\n' +
      '  res.status(500).json({ message: err.message });\n' +
      '};\n';
    const files: Readonly<Record<string, string>> = {
      'package.json': '{"scripts":{"start":"node src/main.js","typecheck":"tsc --noEmit"}}\n',
      'src/main.js': "import http from 'node:http';\nhttp.createServer((request, response) => response.end(request.method)).listen(5300);\n",
      // Not named error-boundary.* or *.error.js, so the filename check finds nothing and this
      // fixture isolates to the new content-based scan, same as #308's own positive tests.
      'src/errorHandler.js': handler + '// '.padEnd(OVERSIZED_BYTES - handler.length, 'x') + '\n',
    };

    const { input, signal } = scan(files, WITAN_RUBRIC_VERSION_V23);
    const a3 = signal('A3');

    expect(input.contentReadSummary?.byReason.tooLarge).toBe(1);
    expect(input.contentReadSummary?.affectedCriteria).toContain('A3');
    // The defect: the metric silently omitted 1 of 6 real components (the withheld file WOULD
    // have earned the error-boundary credit) with no attribution — indistinguishable from a
    // repository that genuinely has no error handling. Abstained instead: the composite metric
    // is dropped, not silently under-counted, matching health_readiness_route/observability_depth's
    // own wiring immediately above in this file.
    expect(a3?.insufficientData).toBeUndefined();
    expect(a3?.metrics?.find((m) => m.name === 'prod_readiness_primitives')).toBeUndefined();
    expect(a3?.notes).toContain('prod_readiness_primitives');
  });
});

// goal_cejel_withheld_path_a5_and_v17_decision_0_4_9_2026-09-15. #304 wired the withheld-path
// mechanism to A3, but the instance it was demonstrated on is A5's claim_match_rate: a file-count
// proxy, not a content pattern. Nothing reads the withheld file — the walk simply deletes its PATH
// from repoFiles, and a count over the shortened list comes back one lower, indistinguishable from
// a repository that does not have the file. That is a false assertion about the repository's own
// contents, which this repository's doctrine ranks worse than a recall gap.
describe('v23 withheld-path abstention — A5 claim-reality file-count proxies', () => {
  it('abstains claim_match_rate when an authored implementation file is withheld, instead of counting it absent', () => {
    const { input, signal } = scan(OVERSIZED_CLAIM_REPO, WITAN_RUBRIC_VERSION_V23);
    const a5 = signal('A5');

    // One skip in the fixture, so the abstention below is attributable to nothing else.
    expect(input.contentReadSummary?.byReason.tooLarge).toBe(1);
    expect(input.contentReadSummary?.byReason.unreadable).toBe(0);
    expect(input.contentReadSummary?.byReason.deniedPath).toBe(0);
    expect(input.contentReadSummary?.affectedCriteria).toContain('A5');

    // The defect: a ratio published from a file list the withheld file was deleted from. The
    // metric is dropped, not silently recomputed one lower.
    expect(a5?.metrics?.find((metric) => metric.name === 'claim_match_rate')).toBeUndefined();
    expect(a5?.notes).toContain('claim_match_rate');
    expect(a5?.notes).toContain('repository content size limit');
    expect(a5?.notes).not.toContain('could not be read');
    expect(
      input.scanLimitations?.some(
        (line) =>
          line.includes('A5.claim_match_rate') &&
          line.includes('disclosed coverage limit, not a read failure'),
      ),
    ).toBe(true);

    // The withheld path is an implementation file, not a claim source and not a reconciliation
    // artifact, so only the signal whose own test admits it abstains. The other two still measure.
    expect(a5?.metrics?.some((metric) => metric.name === 'claim_source_depth')).toBe(true);
    expect(a5?.metrics?.some((metric) => metric.name === 'reconciliation_artifact_depth')).toBe(
      true,
    );
  });

  it('keeps claim_match_rate measured, at its full count, when nothing was withheld', () => {
    // The guard that matters most: the fix must abstain on an EARNED match, never convert an
    // ordinary scan into an abstention. Byte-identical fixture below the size ceiling.
    const { input, signal } = scan(CONTROL_CLAIM_REPO, WITAN_RUBRIC_VERSION_V23);
    const a5 = signal('A5');

    expect(input.contentReadSummary?.byReason.tooLarge).toBe(0);
    expect(input.contentReadSummary?.affectedCriteria ?? []).not.toContain('A5');
    expect(a5?.insufficientData).toBeUndefined();
    expect(a5?.notes ?? '').not.toContain('claim_match_rate');
    const claimMatchRate = a5?.metrics?.find((metric) => metric.name === 'claim_match_rate');
    // Two authored implementation files over those two plus one claim source.
    expect(claimMatchRate?.value).toBe(2);
    expect(claimMatchRate?.max).toBe(3);
  });

  it('abstains A5 outright when the only claim source is withheld, instead of asserting nothing is claimed', () => {
    // A5's not-applicable branch reads "No README or docs found — nothing is claimed about this
    // repo". Said of a repository whose README Cejel declined to read under its own size ceiling,
    // that is a false assertion, not a low score. The withheld-path check runs before that branch,
    // so the criterion abstains with the self-imposed reason and leaves the composite alone.
    const files = {
      'package.json':
        '{"name":"fixture","version":"1.0.0","scripts":{"test":"vitest","build":"tsc"}}\n',
      'README.md':
        CLAIM_SOURCE_README +
        '// '.padEnd(OVERSIZED_BYTES - CLAIM_SOURCE_README.length, 'x') +
        '\n',
      'src/app.ts': 'export const x = 1;\n',
    };
    const { input, signal } = scan(files, WITAN_RUBRIC_VERSION_V23);
    const a5 = signal('A5');

    expect(input.contentReadSummary?.byReason.tooLarge).toBe(1);
    expect(a5?.notApplicable).toBeUndefined();
    expect(a5?.insufficientData).toBe(true);
    expect(a5?.insufficientDataReason).toBe('too_large');
  });

  it('does not abstain A5 on a withheld path no A5 signal would have counted', () => {
    // An oversized file outside every A5 file-selection test. The size cap still applies and is
    // still disclosed; A5 loses nothing it was going to count, so it still measures.
    const files = {
      ...CONTROL_CLAIM_REPO,
      'fixtures/corpus.bin': 'x'.repeat(OVERSIZED_BYTES),
    };
    const { input, signal } = scan(files, WITAN_RUBRIC_VERSION_V23);
    const a5 = signal('A5');

    expect(input.contentReadSummary?.byReason.tooLarge).toBe(1);
    expect(input.contentReadSummary?.affectedCriteria ?? []).not.toContain('A5');
    expect(a5?.insufficientData).toBeUndefined();
    expect(a5?.metrics?.some((metric) => metric.name === 'claim_match_rate')).toBe(true);
  });

  it('leaves the calibrated public default and v22 byte-stable on the same A5 fixture', () => {
    for (const rubricVersion of [WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V22]) {
      const { input, signal } = scan(OVERSIZED_CLAIM_REPO, rubricVersion);
      const a5 = signal('A5');
      expect(input.contentReadSummary?.byReason.tooLarge).toBe(1);
      expect(input.contentReadSummary?.affectedCriteria ?? []).not.toContain('A5');
      expect(a5?.insufficientData).toBeUndefined();
      // Still the pre-fix count — one implementation file over one implementation file plus one
      // claim source — which is the unchanged default behaviour this release must not alter.
      const claimMatchRate = a5?.metrics?.find((metric) => metric.name === 'claim_match_rate');
      expect(claimMatchRate?.value).toBe(1);
      expect(claimMatchRate?.max).toBe(2);
    }
  });

  // MEASURED CONSEQUENCE, pinned deliberately rather than left to be discovered.
  //
  // scoreMetrics renormalizes over the metrics a criterion still has, so dropping an abstained
  // metric redistributes its weight onto the survivors. When the dropped metric scored ABOVE the
  // survivors' weighted average — claim_match_rate carries 0.5 of A5's 1.0 and was the strongest
  // of the three here — the criterion's score falls. A disclosed coverage limit therefore
  // discounts a criterion score, which ADR-0001 ("coverage is disclosed, never discounts a
  // score") says it must not. The same property already applies to A3's merged wiring, where
  // prod_readiness_primitives carries 0.55.
  //
  // This is pinned, not fixed: the alternative — withholding the criterion's number outright
  // (ADR-0001 Option B, wholesale self-imposed abstention) — is a scoring-semantics decision
  // across every wired signal, not something this card's author gets to choose. See
  // docs/adr/proposed/0024-withheld-path-abstention-and-the-v17-default.md. Whoever changes the
  // behaviour updates this guard and says so in that record.
  it('records that abstaining a heavily weighted metric lowers the criterion score (ADR-0001 tension)', () => {
    const oversized = scan(OVERSIZED_CLAIM_REPO, WITAN_RUBRIC_VERSION_V23).scored('A5');
    const control = scan(CONTROL_CLAIM_REPO, WITAN_RUBRIC_VERSION_V23).scored('A5');

    expect(control?.status).toBe('warning');
    expect(oversized?.status).toBe('warning');
    expect(control?.score).toBeGreaterThan(oversized?.score ?? 0);
  });
});
