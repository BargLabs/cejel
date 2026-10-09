// cejel #433 — a control credited from text that is not the control.
//
// Every credit below names a file as evidence that a control exists. Before this change each one
// could be satisfied by text that only DESCRIBES the control: a test file's fixture strings, a
// code comment quoting a handler, a changelog line describing the detector, a calibration review
// note, an experiment record, a generated report (including a Cejel certificate of another
// repository, whose evidence labels contain the human-gate phrase), a CODEOWNERS file in a
// directory GitHub never reads, and an unanchored filename rule that read `swallowed-error.ts` as
// an error boundary. A certificate that cites one of those asserts a control nobody built.
//
// Not version-gated: every case runs under the calibrated default and under the newest
// prospective rubric. Every fixture is synthetic, and the product name is arbitrary on purpose —
// nothing here keys on a repository name, a product, or a path prefix unique to one repository.
//
// "Before" in each title is what the unchanged detector did on that exact fixture (recorded by
// running this file against the unmodified tree before repo-signals.ts was touched).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V24 } from '../rubric-version.js';
import type { WitanCriterionSignalPayload } from '../schemas.js';

const RUBRICS = [WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V24] as const;

type Files = Readonly<Record<string, string>>;

function makeRepo(files: Files): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-false-evidence-'));
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

function signal(
  files: Files,
  rubricVersion: string,
  criterionId: string,
  productSlug = 'harbor-ledger',
): WitanCriterionSignalPayload | null {
  const input = buildWitanInputFromRepo({
    productSlug,
    productDisplayName: productSlug,
    repoPath: makeRepo(files),
    generatedAt: '2026-10-09T00:00:00.000Z',
    rubricVersion,
  });
  return (input.signals ?? []).find((candidate) => candidate.criterionId === criterionId) ?? null;
}

function metricValue(s: WitanCriterionSignalPayload | null, name: string): number | undefined {
  return s?.metrics?.find((candidate) => candidate.name === name)?.value;
}

function evidencePaths(s: WitanCriterionSignalPayload | null, label: string): string[] {
  return (s?.positiveEvidence ?? [])
    .filter((pointer) => pointer.label === label)
    .map((pointer) => pointer.path ?? '');
}

const HUMAN_GATE_LABEL = 'Documents privileged operations as human-executed/gated';
const FAIL_CLOSED_LABEL = 'Fail-closed privilege-membership check before role elevation';
const KILL_SWITCH_LABEL = 'Un-overridable kill-switch / fail-safe governance toggle';
const CODEOWNERS_LABEL = 'CODEOWNERS file in a location GitHub reads (protected-path review gate)';
const REVIEW_POLICY_LABEL = 'Documented required-review/branch-protection policy';
const B2_REVIEW_GATE_LABEL = 'Review gate configuration';
const ERROR_BOUNDARY_LABEL = 'Error boundary';

// ---------------------------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------------------------

const FAIL_CLOSED_SOURCE =
  'export async function elevate(db: { query(sql: string): Promise<{ rows: { ok: boolean }[] }> }) {\n' +
  "  const { rows } = await db.query(\"SELECT pg_has_role(current_user, 'app_admin', 'MEMBER') AS ok\");\n" +
  "  if (!rows[0]?.ok) throw new Error('current_user is not a member of app_admin');\n" +
  "  await db.query('SET ROLE app_admin');\n" +
  '}\n';

const FAIL_CLOSED_TEST_STRINGS =
  "import { expect, it } from 'vitest';\n\n" +
  "it('detects a fail-closed check', () => {\n" +
  "  const fixture = \"SELECT pg_has_role(current_user, 'admin', 'MEMBER'); SET ROLE admin;\";\n" +
  '  expect(fixture.length).toBeGreaterThan(0);\n' +
  '});\n';

const FAIL_CLOSED_IN_COMMENTS =
  '// Before elevating, a real implementation would call pg_has_role(current_user, ...)\n' +
  '// and only then SET ROLE app_admin. Not implemented yet.\n' +
  'export const elevate = (): void => undefined;\n';

const KILL_SWITCH_SOURCE =
  'export function runJob(config: { killSwitch: boolean }): string {\n' +
  "  if (!config.killSwitch) return 'halted';\n" +
  "  return 'ran';\n" +
  '}\n';

const KILL_SWITCH_IN_COMMENTS =
  '/*\n' +
  ' * Planned: if (!config.killSwitch) return; before any job runs.\n' +
  ' */\n' +
  'export function runJob(): string {\n' +
  "  return 'ran';\n" +
  '}\n';

const HUMAN_GATE_PHRASE =
  'Privileged operations are human-executed; agents never hold prod admin credentials.\n';

const CEJEL_CERTIFICATE =
  '# Cejel Trust Report - some-other-service\n\n' +
  '- Product: some-other-service\n' +
  '- CLI: Cejel 0.6.2\n' +
  '- Rubric: witan-rubric-v17-2026-07-24\n\n' +
  '## B6\n\n' +
  '- docs/ops.md:1 — Documents privileged operations as human-executed/gated\n' +
  '- docs/ops.md:1 — Documented required-review/branch-protection policy (branch protection)\n';

const REVIEW_POLICY_DOC =
  '# Review policy\n\n' +
  'Every change to `main` needs a required review from a maintainer. Branch protection is ' +
  'enforced on `main` and on release branches.\n';

const CALIBRATION_REVIEW_NOTE =
  '# Reviewer B notes\n\nThe required review setup was interrupted, so the second pass was ' +
  'completed the following day.\n';

// A3 needs a service shape to be applicable at all; every A3 case is diffed against this base.
const SERVICE: Files = {
  'src/server.js':
    "const express = require('express');\nconst app = express();\napp.listen(3000);\n",
  'package.json': JSON.stringify({ name: 'svc', version: '1.0.0', scripts: { build: 'tsc' } }),
};

const REGISTERED_HANDLER =
  "const express = require('express');\n" +
  'const app = express();\n' +
  'app.use((err, req, res, next) => {\n' +
  '  res.status(500).json({ message: err.message });\n' +
  '});\n' +
  'app.listen(3000);\n';

const HANDLER_IN_LINE_COMMENT =
  "const express = require('express');\n" +
  'const app = express();\n' +
  '// Express recognises error middleware like app.use((err, req, res, next) => res.status(500).end());\n' +
  'app.listen(3000);\n' +
  'module.exports = app;\n';

const HANDLER_IN_BLOCK_COMMENT =
  "const express = require('express');\n" +
  'const app = express();\n' +
  '/**\n' +
  ' * Example only:\n' +
  ' *   app.use((err, req, res, next) => res.status(500).end());\n' +
  ' */\n' +
  'app.listen(3000);\n' +
  'module.exports = app;\n';

function primitives(files: Files, rubricVersion: string): number {
  return metricValue(signal(files, rubricVersion, 'A3'), 'prod_readiness_primitives') ?? 0;
}

function errorBoundaryCredited(files: Files, rubricVersion: string): boolean {
  return primitives(files, rubricVersion) === primitives(SERVICE, rubricVersion) + 1;
}

for (const rubric of RUBRICS) {
  describe(`#433 implementation evidence — ${rubric}`, () => {
    it('B6 fail-closed check: strings only in src/__tests__/x.test.ts earn no credit (before: credited)', () => {
      const b6 = signal({ 'src/__tests__/x.test.ts': FAIL_CLOSED_TEST_STRINGS }, rubric, 'B6');
      expect(evidencePaths(b6, FAIL_CLOSED_LABEL)).toEqual([]);
      expect(metricValue(b6, 'fail_closed_privilege_check') ?? 0).toBe(0);
    });

    it('B6 fail-closed check: strings only in a fixtures directory earn no credit', () => {
      const b6 = signal({ 'src/fixtures/roles.ts': FAIL_CLOSED_SOURCE }, rubric, 'B6');
      expect(evidencePaths(b6, FAIL_CLOSED_LABEL)).toEqual([]);
    });

    it('B6 fail-closed check: implementation-shaped code under calibration/ earns no credit (before: credited)', () => {
      const b6 = signal({ 'calibration/specimens/src/roles.ts': FAIL_CLOSED_SOURCE }, rubric, 'B6');
      expect(evidencePaths(b6, FAIL_CLOSED_LABEL)).toEqual([]);
    });

    it('B6 fail-closed check: both strings only inside comments earn no credit (before: credited)', () => {
      const b6 = signal({ 'src/roles.ts': FAIL_CLOSED_IN_COMMENTS }, rubric, 'B6');
      expect(evidencePaths(b6, FAIL_CLOSED_LABEL)).toEqual([]);
    });

    it('B6 fail-closed check: both strings only in Python # comments earn no credit (before: credited)', () => {
      const b6 = signal(
        {
          'app/roles.py':
            '# Elevate only after pg_has_role(current_user, ...) passes,\n' +
            '# then SET ROLE app_admin.\n' +
            'def elevate():\n' +
            '    return None\n',
        },
        rubric,
        'B6',
      );
      expect(evidencePaths(b6, FAIL_CLOSED_LABEL)).toEqual([]);
    });

    it('B6 fail-closed check (positive control): the same check in Python code is credited', () => {
      const b6 = signal(
        {
          'app/roles.py':
            'def elevate(cursor):\n' +
            "    cursor.execute(\"SELECT pg_has_role(current_user, 'app_admin', 'MEMBER')\")\n" +
            '    if not cursor.fetchone()[0]:\n' +
            "        raise PermissionError('current_user is not a member of app_admin')\n" +
            "    cursor.execute('SET ROLE app_admin')\n",
        },
        rubric,
        'B6',
      );
      expect(evidencePaths(b6, FAIL_CLOSED_LABEL)).toEqual(['app/roles.py']);
    });

    it('B6 fail-closed check (positive control): the same check in src/x.ts is credited', () => {
      const b6 = signal({ 'src/x.ts': FAIL_CLOSED_SOURCE }, rubric, 'B6');
      expect(evidencePaths(b6, FAIL_CLOSED_LABEL)).toEqual(['src/x.ts']);
      expect(metricValue(b6, 'fail_closed_privilege_check')).toBe(1);
    });

    it('B6 kill switch: a guard clause only in a test file earns no credit (before: credited)', () => {
      const b6 = signal({ 'src/__tests__/job.test.ts': KILL_SWITCH_SOURCE }, rubric, 'B6');
      expect(evidencePaths(b6, KILL_SWITCH_LABEL)).toEqual([]);
    });

    it('B6 kill switch: a guard clause only inside a block comment earns no credit (before: credited)', () => {
      const b6 = signal({ 'src/job.ts': KILL_SWITCH_IN_COMMENTS }, rubric, 'B6');
      expect(evidencePaths(b6, KILL_SWITCH_LABEL)).toEqual([]);
    });

    it('B6 kill switch (positive control): the guard clause in src/job.ts is credited', () => {
      const b6 = signal({ 'src/job.ts': KILL_SWITCH_SOURCE }, rubric, 'B6');
      expect(evidencePaths(b6, KILL_SWITCH_LABEL)).toEqual(['src/job.ts']);
      expect(metricValue(b6, 'kill_switch_fail_safe_present')).toBe(1);
    });

    it('A3 control: the bare service has no error boundary', () => {
      expect(errorBoundaryCredited(SERVICE, rubric)).toBe(false);
    });

    it('A3 filename: src/packs/swallowed-error.ts is not an error boundary (before: credited)', () => {
      const files = { ...SERVICE, 'src/packs/swallowed-error.ts': 'export const swallow = 1;\n' };
      expect(errorBoundaryCredited(files, rubric)).toBe(false);
    });

    it.each(['src/error.ts', 'src/error-boundary.tsx', 'error.js', 'app/dashboard/error.tsx'])(
      'A3 filename (positive control): %s is an error boundary',
      (path) => {
        const files = { ...SERVICE, [path]: 'export default function Fallback() { return null; }\n' };
        expect(errorBoundaryCredited(files, rubric)).toBe(true);
        expect(evidencePaths(signal(files, rubric, 'A3'), ERROR_BOUNDARY_LABEL)).toEqual([path]);
      },
    );

    // A3 already applied the authored-production path gate under every selectable rubric (it
    // receives the v8+ detector flag), so the two test-path cases were uncredited before #433 as
    // well. Kept as regression guards: the class rule must not depend on that older gate staying.
    it('A3 filename: an error.ts under a test directory is not an error boundary (before: already uncredited)', () => {
      const files = { ...SERVICE, 'src/__tests__/error.ts': 'export const thrown = new Error();\n' };
      expect(errorBoundaryCredited(files, rubric)).toBe(false);
    });

    it('A3 filename: an error.ts under calibration/ is not an error boundary (before: credited)', () => {
      const files = {
        ...SERVICE,
        'calibration/specimens/src/error.ts': 'export default function Fallback() { return null; }\n',
      };
      expect(errorBoundaryCredited(files, rubric)).toBe(false);
    });

    it('A3 content: the four-parameter handler only inside a // comment earns no credit (before: credited)', () => {
      expect(errorBoundaryCredited({ ...SERVICE, 'src/server.js': HANDLER_IN_LINE_COMMENT }, rubric)).toBe(
        false,
      );
    });

    it('A3 content: the four-parameter handler only inside a /** */ comment earns no credit (before: credited)', () => {
      expect(
        errorBoundaryCredited({ ...SERVICE, 'src/server.js': HANDLER_IN_BLOCK_COMMENT }, rubric),
      ).toBe(false);
    });

    it('A3 content: a registered handler only in a test file earns no credit (before: already uncredited)', () => {
      const files = { ...SERVICE, 'src/__tests__/server.test.js': REGISTERED_HANDLER };
      expect(errorBoundaryCredited(files, rubric)).toBe(false);
    });

    it('A3 content (positive control): the registered handler is credited at its real line', () => {
      const files = { ...SERVICE, 'src/server.js': REGISTERED_HANDLER };
      expect(errorBoundaryCredited(files, rubric)).toBe(true);
      const pointer = signal(files, rubric, 'A3')?.positiveEvidence?.find(
        (candidate) => candidate.label === ERROR_BOUNDARY_LABEL,
      );
      expect(pointer?.path).toBe('src/server.js');
      expect(pointer?.line).toBe(3);
    });

    it('A3 content (positive control): a comment quoting the shape above the real handler cites the handler line, not the comment', () => {
      const files = {
        ...SERVICE,
        'src/server.js':
          '// app.use((err, req, res, next) => ...) is registered below.\n' + REGISTERED_HANDLER,
      };
      const pointer = signal(files, rubric, 'A3')?.positiveEvidence?.find(
        (candidate) => candidate.label === ERROR_BOUNDARY_LABEL,
      );
      expect(pointer?.line).toBe(4);
    });
  });

  describe(`#433 documentary evidence — ${rubric}`, () => {
    it.each([
      ['CHANGELOG.md', '# Changelog\n\n- B6 now credits docs stating that ' + HUMAN_GATE_PHRASE],
      ['docs/experiments/x.md', '# Experiment\n\n' + HUMAN_GATE_PHRASE],
      ['calibration/round-1/notes.md', '# Notes\n\n' + HUMAN_GATE_PHRASE],
      ['docs/reviews/x.md', '# Review note\n\n' + HUMAN_GATE_PHRASE],
      ['leaderboard/reports/x.md', '# Report\n\n' + HUMAN_GATE_PHRASE],
      ['docs/trust/certificate.md', CEJEL_CERTIFICATE],
      ['test/fixtures/sample-repo/README.md', '# Sample\n\n' + HUMAN_GATE_PHRASE],
    ])('B6 human gate: the phrase in %s earns no credit (before: credited)', (path, contents) => {
      const b6 = signal({ [path]: contents }, rubric, 'B6');
      expect(evidencePaths(b6, HUMAN_GATE_LABEL)).toEqual([]);
    });

    it.each(['docs/operations/prod-admin.md', 'README.md', 'SECURITY.md', 'docs/adr/0003-admin.md'])(
      'B6 human gate (positive control): the phrase in %s is credited',
      (path) => {
        const b6 = signal({ [path]: '# Admin\n\n' + HUMAN_GATE_PHRASE }, rubric, 'B6');
        expect(evidencePaths(b6, HUMAN_GATE_LABEL)).toEqual([path]);
      },
    );

    it('B6 human gate: a changelog listed before a legitimate doc does not take the credit from it', () => {
      const b6 = signal(
        {
          'CHANGELOG.md': '# Changelog\n\n- ' + HUMAN_GATE_PHRASE,
          'docs/operations/prod-admin.md': '# Admin\n\n' + HUMAN_GATE_PHRASE,
        },
        rubric,
        'B6',
      );
      expect(evidencePaths(b6, HUMAN_GATE_LABEL)).toEqual(['docs/operations/prod-admin.md']);
    });

    it('B6 required review: a calibration review note with no CODEOWNERS earns no protected-path credit (before: credited)', () => {
      const b6 = signal(
        { 'calibration/round-2/reviews/x.md': CALIBRATION_REVIEW_NOTE },
        rubric,
        'B6',
      );
      expect(evidencePaths(b6, REVIEW_POLICY_LABEL)).toEqual([]);
      expect(metricValue(b6, 'protected_path_review_gate') ?? 0).toBe(0);
    });

    it.each([
      ['CHANGES.md', '# Changes\n\n- Turned on branch protection for main.\n'],
      ['docs/reviews/2026-q3.md', CALIBRATION_REVIEW_NOTE],
      ['reports/weekly.md', '# Weekly\n\nBranch protection enabled.\n'],
      ['docs/trust/certificate.md', CEJEL_CERTIFICATE],
    ])('B6 required review: the phrase in %s earns no protected-path credit (before: credited)', (path, contents) => {
      const b6 = signal({ [path]: contents }, rubric, 'B6');
      expect(evidencePaths(b6, REVIEW_POLICY_LABEL)).toEqual([]);
      expect(metricValue(b6, 'protected_path_review_gate') ?? 0).toBe(0);
    });

    it('B6 required review (positive control): a policy-shaped doc stating required review is credited', () => {
      const b6 = signal({ 'docs/review-policy.md': REVIEW_POLICY_DOC }, rubric, 'B6');
      expect(evidencePaths(b6, REVIEW_POLICY_LABEL)).toEqual(['docs/review-policy.md']);
      expect(metricValue(b6, 'protected_path_review_gate')).toBe(1);
    });
  });

  describe(`#433 CODEOWNERS location and labels — ${rubric}`, () => {
    it.each(['.github/workflows/CODEOWNERS', 'packages/api/CODEOWNERS'])(
      'CODEOWNERS at %s, which GitHub never reads, earns no B6 or B2 credit (before: credited)',
      (path) => {
        const files = { [path]: '* @example-org/maintainers\n' };
        const b6 = signal(files, rubric, 'B6');
        expect(evidencePaths(b6, CODEOWNERS_LABEL)).toEqual([]);
        expect(metricValue(b6, 'protected_path_review_gate') ?? 0).toBe(0);
        expect(evidencePaths(signal(files, rubric, 'B2'), B2_REVIEW_GATE_LABEL)).toEqual([]);
      },
    );

    it.each(['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS'])(
      'CODEOWNERS (positive control) at %s is credited in B6 and B2',
      (path) => {
        const files = { [path]: '* @example-org/maintainers\n' };
        const b6 = signal(files, rubric, 'B6');
        expect(evidencePaths(b6, CODEOWNERS_LABEL)).toEqual([path]);
        expect(metricValue(b6, 'protected_path_review_gate')).toBe(1);
        expect(evidencePaths(signal(files, rubric, 'B2'), B2_REVIEW_GATE_LABEL)).toEqual([path]);
      },
    );

    it('the label states the branch that fired: CODEOWNERS and a documented review policy differ', () => {
      const viaCodeowners = signal({ '.github/CODEOWNERS': '* @example-org/maintainers\n' }, rubric, 'B6');
      const viaPolicy = signal({ 'docs/review-policy.md': REVIEW_POLICY_DOC }, rubric, 'B6');
      const labelOf = (s: WitanCriterionSignalPayload | null, path: string) =>
        s?.positiveEvidence?.find((pointer) => pointer.path === path)?.label;
      expect(labelOf(viaCodeowners, '.github/CODEOWNERS')).toBe(CODEOWNERS_LABEL);
      expect(labelOf(viaPolicy, 'docs/review-policy.md')).toBe(REVIEW_POLICY_LABEL);
      expect(CODEOWNERS_LABEL).not.toBe(REVIEW_POLICY_LABEL);
    });
  });
}

describe('#433 no special case by repository or product name', () => {
  // The whole false-evidence shape set, scored twice under two unrelated arbitrary names. The
  // outcome must be identical and must credit none of it.
  const SHAPES: Files = {
    ...SERVICE,
    'src/server.js': HANDLER_IN_LINE_COMMENT,
    'src/packs/swallowed-error.ts': 'export const swallow = 1;\n',
    'src/__tests__/roles.test.ts': FAIL_CLOSED_TEST_STRINGS,
    'CHANGELOG.md': '# Changelog\n\n- ' + HUMAN_GATE_PHRASE,
    'calibration/round-3/reviews/a.md': CALIBRATION_REVIEW_NOTE,
    '.github/workflows/CODEOWNERS': '* @example-org/maintainers\n',
  };

  it.each(['qx7-tern-0042', 'cejel'])('product %s: nothing in the shape set is credited', (name) => {
    for (const rubric of RUBRICS) {
      const b6 = signal(SHAPES, rubric, 'B6', name);
      expect(b6?.positiveEvidence ?? []).toEqual([]);
      const a3 = signal(SHAPES, rubric, 'A3', name);
      expect(evidencePaths(a3, ERROR_BOUNDARY_LABEL)).toEqual([]);
    }
  });
});
