import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { platform } from 'node:process';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import type { WitanCriterionId } from '../schemas.js';
import { WITAN_RUBRIC_VERSION_V22, WITAN_RUBRIC_VERSION_V23 } from '../rubric-version.js';

// chmod-based unreadable-file fixtures do not deny access when the test runs as root (root
// bypasses the permission bits this fixture relies on) or on Windows (no POSIX permission bits).
const canDenyReadAccess = platform !== 'win32' && process.getuid?.() !== 0;

function makeTmpRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'witan-per-signal-abstention-all-'));
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.invalid'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Synthetic Test'], { cwd: dir });
  return dir;
}

function writeFile(dir: string, relativePath: string, contents: string): void {
  const path = join(dir, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
  execFileSync('git', ['add', relativePath], { cwd: dir });
}

function makeUnreadable(dir: string, relativePath: string): void {
  chmodSync(join(dir, relativePath), 0o000);
}

function signalAt(dir: string, rubricVersion: string, criterionId: WitanCriterionId) {
  const input = buildWitanInputFromRepo({
    productSlug: 'per-signal-abstention-fixture',
    productDisplayName: 'Per-signal abstention fixture',
    repoPath: dir,
    generatedAt: '2026-09-06T00:00:00.000Z',
    rubricVersion,
  });
  return {
    input,
    signal: (input.signals ?? []).find((candidate) => candidate.criterionId === criterionId),
  };
}

describe.skipIf(!canDenyReadAccess)('v23 per-signal abstention — A2 through B6', () => {
  it('A2: an unreadable candidate-secret file abstains only secret_cleanliness; env_handling_depth survives', () => {
    function build(): string {
      const dir = makeTmpRepo();
      // Ratable-secrets-surface gate: an env template alone qualifies and feeds
      // env_handling_depth without any content read (existence-only).
      writeFile(dir, '.env.example', 'API_KEY=replace-me\n');
      writeFile(dir, 'src/index.ts', 'export const implementation = true;\n');
      // A real production file the secret scanner must visit; unreadable at scan time. Given a
      // non-implementation extension (.json, not .ts) so it is invisible to the OTHER
      // implementation-file-scoped A2 passes (DB-client detection, crypto hygiene, the
      // env-read half of env_handling_depth) and isolates this fixture to secret_cleanliness.
      writeFile(dir, 'config.json', '{"apiKey": "sk_live_unreadable_placeholder"}\n');
      makeUnreadable(dir, 'config.json');
      return dir;
    }

    const v22 = signalAt(build(), WITAN_RUBRIC_VERSION_V22, 'A2');
    expect(v22.signal).toMatchObject({ insufficientData: true, metrics: [] });

    const { input, signal: a2 } = signalAt(build(), WITAN_RUBRIC_VERSION_V23, 'A2');
    expect(input.contentReadSummary?.affectedCriteria).toContain('A2');
    expect(a2?.insufficientData).toBeUndefined();
    const envDepth = a2?.metrics?.find((m) => m.name === 'env_handling_depth');
    expect(envDepth?.value).toBeGreaterThan(0);
    expect(a2?.metrics?.find((m) => m.name === 'secret_cleanliness')).toBeUndefined();
    expect(a2?.notes).toContain('secret_cleanliness');
    expect(
      input.scanLimitations?.some((line) => /signal/i.test(line) && line.includes('secret_cleanliness')),
    ).toBe(true);
  });

  it('A3: an unreadable observability-shaped file abstains only observability_depth; prod_workflow_depth survives', () => {
    function build(): string {
      const dir = makeTmpRepo();
      // Explicit deploy target AND deploy-config match (no content read) — passes the
      // deployable-service N/A gate and feeds prod_workflow_depth from filenames alone.
      writeFile(dir, 'vercel.json', '{}\n');
      writeFile(dir, 'src/index.ts', 'export const implementation = true;\n');
      writeFile(dir, 'src/monitoring.ts', 'import * as Sentry from "sentry";\n');
      makeUnreadable(dir, 'src/monitoring.ts');
      return dir;
    }

    const v22 = signalAt(build(), WITAN_RUBRIC_VERSION_V22, 'A3');
    expect(v22.signal).toMatchObject({ insufficientData: true, metrics: [] });

    const { input, signal: a3 } = signalAt(build(), WITAN_RUBRIC_VERSION_V23, 'A3');
    expect(input.contentReadSummary?.affectedCriteria).toContain('A3');
    expect(a3?.insufficientData).toBeUndefined();
    const workflowDepth = a3?.metrics?.find((m) => m.name === 'prod_workflow_depth');
    expect(workflowDepth?.value).toBeGreaterThan(0);
    expect(a3?.metrics?.find((m) => m.name === 'observability_depth')).toBeUndefined();
    expect(a3?.notes).toContain('observability_depth');
    expect(
      input.scanLimitations?.some(
        (line) => /signal/i.test(line) && line.includes('observability_depth'),
      ),
    ).toBe(true);
  });

  it('A4: an unreadable manifest abstains the pinned/range/sanity trio; lockfile_coverage survives', () => {
    function build(): string {
      const dir = makeTmpRepo();
      // vercel.json is a path-only explicit deploy target — it decides the app/service metric
      // set (appMetrics, which includes lockfile_coverage) without reading any manifest, so it
      // stays outside the blast radius of the unreadable manifest below. (A content-based app/
      // service determination — e.g. inspecting package.json for a "bin" field — would itself
      // be an unwrapped read of the very file this fixture makes unreadable, which correctly
      // forces the conservative wholesale fallback; that is a DIFFERENT, real defect surface
      // this fixture deliberately avoids exercising.)
      writeFile(dir, 'vercel.json', '{}\n');
      writeFile(dir, 'package.json', JSON.stringify({ name: 'a4-fixture', dependencies: { left: '1.0.0' } }));
      writeFile(dir, 'package-lock.json', '{}\n');
      // A second, unreadable manifest — readDependencySpecs aggregates across every manifest in
      // one call, so this alone is enough to abstain the whole trio without touching package.json.
      writeFile(dir, 'requirements.txt', 'right==2.0.0\n');
      makeUnreadable(dir, 'requirements.txt');
      return dir;
    }

    const v22 = signalAt(build(), WITAN_RUBRIC_VERSION_V22, 'A4');
    expect(v22.signal).toMatchObject({ insufficientData: true, metrics: [] });

    const { input, signal: a4 } = signalAt(build(), WITAN_RUBRIC_VERSION_V23, 'A4');
    expect(input.contentReadSummary?.affectedCriteria).toContain('A4');
    expect(a4?.insufficientData).toBeUndefined();
    const lockfileCoverage = a4?.metrics?.find((m) => m.name === 'lockfile_coverage');
    expect(lockfileCoverage?.value).toBe(1);
    for (const name of [
      'pinned_dependency_ratio',
      'declared_version_range_ratio',
      'dependency_count_sanity',
    ]) {
      expect(a4?.metrics?.find((m) => m.name === name)).toBeUndefined();
    }
    // Any one of the trio's names is enough to confirm the abstention was signal-scoped, not
    // criterion-wide, since the whole-criterion fallback never names a metric in prose.
    expect(a4?.notes).toContain('pinned_dependency_ratio');
  });

  it('A5: an unreadable negative-space candidate abstains no metric (none are content-derived) but is still recorded', () => {
    function build(): string {
      const dir = makeTmpRepo();
      writeFile(dir, 'README.md', '# a5-fixture\nDoes a thing.\n');
      writeFile(dir, 'src/index.ts', 'export const implementation = true;\n');
      writeFile(dir, 'SECURITY.md', 'We do not cover X.\n');
      makeUnreadable(dir, 'SECURITY.md');
      return dir;
    }

    const { input, signal: a5 } = signalAt(build(), WITAN_RUBRIC_VERSION_V23, 'A5');
    expect(input.contentReadSummary?.affectedCriteria).toContain('A5');
    // A5's three metrics are file-count proxies, never content-derived — none are removed.
    expect(a5?.insufficientData).toBeUndefined();
    expect(a5?.metrics?.length).toBeGreaterThan(0);
    expect(
      input.scanLimitations?.some(
        (line) => /signal/i.test(line) && line.includes('negative_space_documentation'),
      ),
    ).toBe(true);
  });

  it('B3: an unreadable CI workflow abstains both of B3\'s metrics (they share the same workflow file) but keeps positiveEvidence, unlike the v22 wholesale wipe', () => {
    // B3 has exactly two metrics, and a single workflow file feeds both ci_script_depth (its
    // embedded commands) and default_branch_ci_depth (its trigger config) — there is no fixture
    // where one survives and the other doesn't when only one workflow file exists. The
    // meaningful v23 improvement here is narrower: positiveEvidence (computed from readable
    // package.json + the workflow's own path, not its unreadable content) survives, where v22
    // wipes it along with everything else.
    function build(): string {
      const dir = makeTmpRepo();
      writeFile(dir, 'package.json', JSON.stringify({ name: 'b3-fixture', scripts: { test: 'x' } }));
      writeFile(dir, '.github/workflows/ci.yml', 'on: push\njobs: {}\n');
      makeUnreadable(dir, '.github/workflows/ci.yml');
      return dir;
    }

    const v22 = signalAt(build(), WITAN_RUBRIC_VERSION_V22, 'B3');
    expect(v22.signal).toMatchObject({
      insufficientData: true,
      metrics: [],
      positiveEvidence: [],
    });

    const { input, signal: b3 } = signalAt(build(), WITAN_RUBRIC_VERSION_V23, 'B3');
    expect(input.contentReadSummary?.affectedCriteria).toContain('B3');
    expect(b3?.insufficientData).toBeUndefined();
    expect(b3?.metrics).toEqual([]);
    expect(b3?.positiveEvidence?.length).toBeGreaterThan(0);
    expect(b3?.notes).toContain('ci_script_depth');
    expect(b3?.notes).toContain('default_branch_ci_depth');
  });

  it('B4: an unreadable audit artifact abstains only audit_freshness_depth; audit_artifact_depth survives', () => {
    function build(): string {
      const dir = makeTmpRepo();
      writeFile(dir, 'CHANGELOG.md', '## 2020-01-01\nInitial release.\n');
      makeUnreadable(dir, 'CHANGELOG.md');
      return dir;
    }

    const v22 = signalAt(build(), WITAN_RUBRIC_VERSION_V22, 'B4');
    expect(v22.signal).toMatchObject({ insufficientData: true, metrics: [] });

    const { input, signal: b4 } = signalAt(build(), WITAN_RUBRIC_VERSION_V23, 'B4');
    expect(input.contentReadSummary?.affectedCriteria).toContain('B4');
    expect(b4?.insufficientData).toBeUndefined();
    const artifactDepth = b4?.metrics?.find((m) => m.name === 'audit_artifact_depth');
    expect(artifactDepth?.value).toBeGreaterThan(0);
    expect(b4?.metrics?.find((m) => m.name === 'audit_freshness_depth')).toBeUndefined();
    expect(b4?.notes).toContain('audit_freshness_depth');
  });

  it('B6: an unreadable doc abstains human_gate_documented and protected_path_review_gate together (both scan every .md file); privilege_escalation_cleanliness survives', () => {
    function build(): string {
      const dir = makeTmpRepo();
      // CODEOWNERS alone would satisfy protected_path_review_gate, but reviewGateDoc's scan
      // still runs over every doc file regardless — the unreadable doc below abstains both
      // human_gate_documented and protected_path_review_gate, since both scan the identical
      // docFiles list. Deliberately NOT matching B4's isAuditFile pattern (no "runbook"/
      // "audit"/"incident" in a docs/ path) so this fixture does not also touch B4.
      writeFile(dir, 'CODEOWNERS', '* @org/reviewers\n');
      writeFile(
        dir,
        'docs/governance-notes.md',
        'Privileged database GRANTs are human-executed only, never automated.\n',
      );
      makeUnreadable(dir, 'docs/governance-notes.md');
      return dir;
    }

    const v22 = signalAt(build(), WITAN_RUBRIC_VERSION_V22, 'B6');
    expect(v22.signal).toMatchObject({ insufficientData: true, metrics: [] });

    const { input, signal: b6 } = signalAt(build(), WITAN_RUBRIC_VERSION_V23, 'B6');
    expect(input.contentReadSummary?.affectedCriteria).toContain('B6');
    expect(b6?.insufficientData).toBeUndefined();
    const cleanliness = b6?.metrics?.find((m) => m.name === 'privilege_escalation_cleanliness');
    expect(cleanliness?.value).toBe(1);
    expect(b6?.metrics?.find((m) => m.name === 'human_gate_documented')).toBeUndefined();
    expect(b6?.metrics?.find((m) => m.name === 'protected_path_review_gate')).toBeUndefined();
    expect(b6?.notes).toContain('human_gate_documented');
    expect(b6?.notes).toContain('protected_path_review_gate');
  });

  it('B6: an unreadable file that could hide an ungated privilege escalation abstains privilege_escalation_cleanliness rather than reporting clean', () => {
    function build(): string {
      const dir = makeTmpRepo();
      writeFile(dir, 'CODEOWNERS', '* @org/reviewers\n');
      writeFile(
        dir,
        'migrations/0007_grant.sql',
        "GRANT rds_superuser TO app_role; -- no human-gate marker\n",
      );
      makeUnreadable(dir, 'migrations/0007_grant.sql');
      return dir;
    }

    const { input, signal: b6 } = signalAt(build(), WITAN_RUBRIC_VERSION_V23, 'B6');
    expect(input.contentReadSummary?.affectedCriteria).toContain('B6');
    // The unreadable file must never be silently treated as clean: either the whole criterion
    // abstains (no surviving evidence besides CODEOWNERS) or the cleanliness metric is dropped.
    // Both are safe; a metric of 1 ("clean") built from an unread file would not be.
    const cleanliness = b6?.metrics?.find((m) => m.name === 'privilege_escalation_cleanliness');
    if (cleanliness) {
      expect(b6?.insufficientData).toBeUndefined();
      // If present at all, it must not silently assert cleanliness from the unread file.
      throw new Error(
        'privilege_escalation_cleanliness must abstain (be absent) when its input file is unreadable, not report a value',
      );
    }
    expect(b6?.notes).toContain('privilege_escalation_cleanliness');
  });

  it('a too-large lockfile at inventory time no longer force-abstains A4 by path shape (goal_cejel_0_4_8_abstention_scoring_fix_2026-09-08, defect 1)', () => {
    // Before that fix, this oversized lockfile never entering repoFiles meant no collector could
    // ever attribute the skip to a specific signal, so affectedCriteriaForUnavailablePath's
    // path-shape guess force-wiped A4 wholesale regardless of how many of A4's signals this goal
    // has since instrumented — even though A4 had a perfectly readable manifest to measure from.
    // The size cap still applies (still skipped and disclosed as 'too_large'); it just no longer
    // pre-empts the collector that would otherwise measure from readable content.
    const dir = makeTmpRepo();
    writeFile(dir, 'package.json', JSON.stringify({ name: 'unattributed-fixture' }));
    writeFile(dir, 'src/index.ts', 'export const implementation = true;\n');
    writeFile(dir, 'package-lock.json', 'x'.repeat(512_001));

    const { input } = signalAt(dir, WITAN_RUBRIC_VERSION_V23, 'A4');
    const a4 = (input.signals ?? []).find((signal) => signal.criterionId === 'A4');

    expect(input.contentReadSummary?.byReason.tooLarge).toBe(1);
    expect(input.contentReadSummary?.affectedCriteria ?? []).not.toContain('A4');
    expect(a4?.insufficientData).toBeUndefined();
    expect(a4?.metrics?.length ?? 0).toBeGreaterThan(0);
  });
});
