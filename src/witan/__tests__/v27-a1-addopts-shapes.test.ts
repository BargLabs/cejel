import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { serializeWitanReport } from '../attestation.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { readPytestInvocations } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27, WITAN_SELECTABLE_RUBRIC_VERSIONS } from '../rubric-version.js';
import { buildFalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { ADDOPTS_SHAPE_FIXTURES, CI, addoptsShapeFixture } from './fixtures/v27-a1-addopts-shapes-fixtures.js';

// goal_cejel_v27_a1_addopts_shapes_2026-11-17 (#705 option B, ruling of 17 Nov; #713 and #661 folded
// in by the ruling of 19 Nov).
//
// Item A: a Makefile export is read as GNU make reads it. `export` followed by names and no
// assignment operator exports each name; `export NAME <op> value` exports NAME only. A name list
// holding `$`, names before an operator, an `unexport` naming PYTEST_ADDOPTS, a bare `unexport`, and
// an export or unexport that may reach PYTEST_ADDOPTS inside a conditional or a `define` leave the
// reading not known: the runs are named with the line and pointed at it.
// Item B: a file the readers do not read (a script, a configuration, a Python module) naming
// PYTEST_ADDOPTS is a mention not read; the runs it may reach are not read, named with its line.
// Item C: a tox setenv of PYTEST_ADDOPTS reaches the make commands of its environment; the runs
// those targets reach are not read, named with the setenv entry.
// Item D: a Makefile with an include, -include or sinclude directive: the runs its targets reach are
// not read, named with the first directive. A value on make's command line is still named first.
// Item F (#713): a step that provably cannot run make or pytest (shell builtins, a package install
// naming only packages) no longer makes a mention not read.
// Item G (#661): the nox empty-posargs set is shown to matter: the fixture's only run with
// `-p no:skipping` over tests/test_cache.py is the noxfile call read with no posargs.
//
// The pins in fixtures/v27-a1-addopts-shapes-main-pins.json were captured from main's scoring code
// (6d5ed83b3) with this change's fixtures, before any code change: every rubric but v27's report
// hash on every fixture, and v27's report hash on each fixture that must not move.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const OTHER_RUBRICS = WITAN_SELECTABLE_RUBRIC_VERSIONS.filter((version) => version !== V27);

const PINS_PATH = new URL('./fixtures/v27-a1-addopts-shapes-main-pins.json', import.meta.url);
const CAPTURE = process.env.V27_A1_ADDOPTS_SHAPES_PINS;

const MAKEFILE_VALUE = 'every-test-skipped rule not applied: -p no:skipping in PYTEST_ADDOPTS in Makefile';
const HOLLOW = 'rated hollow here';

/** The fixtures whose v27 report must be byte-identical to main's. */
const V27_UNMOVED = [
  'a1shape-a-export-assignment-value-holds-the-name',
  'a1shape-d-include-command-line-value-first',
  'a1shape-f-requirements-install-stays-not-read',
  'a1shape-f-editable-install-stays-not-read',
  'a1shape-f-script-call-stays-not-read',
  'a1shape-f-print-to-github-env-stays-not-read',
  'a1shape-f-print-substitution-stays-not-read',
  'a1shape-g-nox-empty-posargs-only-run-over-file',
  ...ADDOPTS_SHAPE_FIXTURES.filter(({ item }) => item === 'pin').map(({ name }) => name),
];

const repos = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function report(name: string, rubricVersion: string): WitanReport {
  const key = `${rubricVersion}/${name}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(name);
  if (!repo) {
    const fixture = ADDOPTS_SHAPE_FIXTURES.find((entry) => entry.name === name);
    if (!fixture) throw new Error(`unknown fixture: ${name}`);
    repo = buildFalseAssuranceFixture(addoptsShapeFixture(fixture));
    repos.set(name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'false-assurance-fixture',
    productDisplayName: 'False-assurance fixture',
    generatedAt: '2026-11-20T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, scored);
  return scored;
}

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

function a1(name: string, rubricVersion: string): WitanCriterionScore {
  const found = report(name, rubricVersion).criteria.find(({ id }) => id === 'A1');
  if (!found) throw new Error('no A1');
  return found;
}

/** The rule is withheld, the note holds `clause`, and v27's A1 keeps v17's score. */
function expectWithheld(name: string, clause: string): WitanCriterionScore {
  const v27 = a1(name, V27);
  // A1's note opens each clause with a capital letter.
  const notes = (v27.notes ?? '').toLowerCase();
  expect(notes, name).not.toContain(HOLLOW);
  expect(notes, name).toContain(clause.toLowerCase());
  expect(v27.score, name).toBe(a1(name, V17).score);
  return v27;
}

/** No setting is in force for the run: the every-test-skipped rule rates tests/test_cache.py hollow. */
function expectHollow(name: string): void {
  const v27 = a1(name, V27);
  expect((v27.notes ?? '').toLowerCase(), name).toContain(HOLLOW);
  expect(v27.notes ?? '', name).toContain('tests/test_cache.py');
}

/** Not read, named "pytest run not read: `<text>` in <path>" and pointed at `line` (1-based) of `path`. */
function expectNotRead(name: string, text: string, path: string, line: number): void {
  const v27 = expectWithheld(name, `pytest run not read: \`${text}\` in ${path}`);
  expect(
    v27.evidence.some((entry) => entry.path === path && entry.line === line && (entry.label ?? '').startsWith('pytest run not read')),
    `${name}: a pointer at ${path} line ${line}`,
  ).toBe(true);
}

describe('v27 A1 addopts shapes: the fixtures against main', () => {
  it('names each fixture once, and every unmoved fixture is one', () => {
    const names = ADDOPTS_SHAPE_FIXTURES.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of V27_UNMOVED) expect(names, name).toContain(name);
  });

  it.runIf(CAPTURE !== undefined)('writes the pins', () => {
    const pins: Record<string, string> = {};
    for (const { name } of ADDOPTS_SHAPE_FIXTURES) {
      for (const rubricVersion of OTHER_RUBRICS) pins[`${rubricVersion}/${name}`] = sha256(serializeWitanReport(report(name, rubricVersion)));
    }
    for (const name of V27_UNMOVED) pins[`${V27}/${name}`] = sha256(serializeWitanReport(report(name, V27)));
    writeFileSync(CAPTURE ?? '', `${JSON.stringify(pins, null, 2)}\n`);
  }, 600_000);

  describe.runIf(CAPTURE === undefined)('checks', () => {
    const pins = (): Record<string, string> => JSON.parse(readFileSync(PINS_PATH, 'utf8')) as Record<string, string>;

    it('pins every rubric but v27 on every fixture, and v27 on the unmoved ones', () => {
      expect(Object.keys(pins())).toHaveLength(ADDOPTS_SHAPE_FIXTURES.length * OTHER_RUBRICS.length + V27_UNMOVED.length);
    });

    it('v17 to v26: every report is byte-identical to main', () => {
      const pinned = pins();
      for (const { name } of ADDOPTS_SHAPE_FIXTURES) {
        for (const rubricVersion of OTHER_RUBRICS) {
          const key = `${rubricVersion}/${name}`;
          expect(sha256(serializeWitanReport(report(name, rubricVersion))), key).toBe(pinned[key]);
        }
      }
    }, 600_000);

    it('v27: no move where nothing changed', () => {
      const pinned = pins();
      for (const name of V27_UNMOVED) expect(sha256(serializeWitanReport(report(name, V27))), name).toBe(pinned[`${V27}/${name}`]);
    }, 120_000);

    it('v27 is never above v17, on any fixture', () => {
      for (const { name } of ADDOPTS_SHAPE_FIXTURES) {
        const v17 = report(name, V17);
        const v27 = report(name, V27);
        expect(a1(name, V27).score, name).toBeLessThanOrEqual(a1(name, V17).score ?? 0);
        expect(v27.codeTrustScore ?? 0, name).toBeLessThanOrEqual(v17.codeTrustScore ?? 0);
      }
    }, 120_000);
  });
});

describe('v27 A1, item A: a Makefile export read as GNU make reads it', () => {
  it('export FOO PYTEST_ADDOPTS with an = assignment and no CI mention: the value reaches the recipe (was: hollow)', () => {
    expectWithheld('a1shape-a-multi-name-export-no-mention', MAKEFILE_VALUE);
  });

  it('the same line with a CI mention not read: the value is read, not withheld (was: not read)', () => {
    const v27 = expectWithheld('a1shape-a-multi-name-export-mention-not-read', MAKEFILE_VALUE);
    expect(v27.notes ?? '').not.toContain('Pytest run not read');
  });

  it('export FOO = bar PYTEST_ADDOPTS exports FOO only: hollow, as on main', () => {
    expectHollow('a1shape-a-export-assignment-value-holds-the-name');
  });

  it('export $(NAMES): not known, named and pointed at its line', () => {
    expectNotRead('a1shape-a-export-variable-name-list', 'export $(NAMES)', 'Makefile', 3);
  });

  it('unexport PYTEST_ADDOPTS: not known', () => {
    expectNotRead('a1shape-a-unexport-names-it', 'unexport PYTEST_ADDOPTS', 'Makefile', 2);
  });

  it('a bare unexport: not known', () => {
    expectNotRead('a1shape-a-bare-unexport', 'unexport', 'Makefile', 2);
  });

  it('an export inside ifdef CI: not known', () => {
    expectNotRead('a1shape-a-export-inside-ifdef', 'export PYTEST_ADDOPTS', 'Makefile', 3);
  });

  it('an export inside a define: not known', () => {
    expectNotRead('a1shape-a-export-inside-define', 'export PYTEST_ADDOPTS', 'Makefile', 3);
  });

  it('names before an assignment operator (export FOO PYTEST_ADDOPTS = -q): not known', () => {
    expectNotRead('a1shape-a-names-before-an-operator', 'export FOO PYTEST_ADDOPTS = -q', 'Makefile', 2);
  });

  it('pins: an export PYTEST_ADDOPTS line and a bare export keep the Makefile value; an export of another name in ifdef stays hollow', () => {
    expectWithheld('a1shape-pin-export-line', MAKEFILE_VALUE);
    expectWithheld('a1shape-pin-bare-export', MAKEFILE_VALUE);
    expectHollow('a1shape-pin-export-other-name-in-ifdef');
    expectHollow('a1shape-pin-plain-makefile');
  });
});

describe('v27 A1, item B: a PYTEST_ADDOPTS mention in a file the readers do not read', () => {
  it('a script that sets PYTEST_ADDOPTS and runs make, with no CI file naming it: not read, named with the script line', () => {
    expectNotRead('a1shape-b-script-sets-and-runs-make', 'export PYTEST_ADDOPTS="-p no:skipping"', 'scripts/test.sh', 2);
  });

  it('a script that sets PYTEST_ADDOPTS and runs pytest: not read, named with the script line', () => {
    expectNotRead('a1shape-b-script-sets-and-runs-pytest', 'PYTEST_ADDOPTS="-p no:skipping" pytest', 'scripts/test.sh', 2);
  });

  it('a Makefile ?= default beside such a script: not known, named with the script line', () => {
    expectNotRead('a1shape-b-script-and-a-makefile-default', 'export PYTEST_ADDOPTS="-p no:skipping"', 'scripts/test.sh', 2);
  });

  it('a CI mention not read keeps precedence: the first CI mention is named as on main', () => {
    expectNotRead('a1shape-b-ci-mention-keeps-precedence', '- run: PYTEST_ADDOPTS=-q ./ci/test.sh', CI, 10);
  });

  it('pin: a README naming PYTEST_ADDOPTS is not such a file: hollow, as on main', () => {
    expectHollow('a1shape-pin-readme-names-it');
  });
});

describe('v27 A1, item C: a tox setenv of PYTEST_ADDOPTS before make', () => {
  it('setenv on its own line, commands = make test: not read, named with the setenv entry', () => {
    expectNotRead('a1shape-c-tox-setenv-then-make', 'PYTEST_ADDOPTS=-p no:skipping', 'tox.ini', 6);
  });

  it('setenv on the key line, make in commands_pre: not read', () => {
    expectNotRead('a1shape-c-tox-setenv-one-line-commands-pre', 'PYTEST_ADDOPTS=-q', 'tox.ini', 5);
  });

  it("a named environment that takes [testenv]'s setenv: not read", () => {
    expectNotRead('a1shape-c-tox-named-environment-inherits-setenv', 'PYTEST_ADDOPTS=-p no:skipping', 'tox.ini', 6);
  });

  it('pin: a tox environment with no setenv running make test: hollow, as on main', () => {
    expectHollow('a1shape-pin-tox-no-setenv-make');
  });
});

describe('v27 A1, item D: an included makefile', () => {
  for (const [directive, slug] of [
    ['include ci.mk', 'include'],
    ['-include ci.mk', 'dash-include'],
    ['sinclude ci.mk', 'sinclude'],
  ] as const) {
    it(`${directive}, where ci.mk exports PYTEST_ADDOPTS: not read, named with the directive`, () => {
      expectNotRead(`a1shape-d-${slug}`, directive, 'Makefile', 1);
    });
  }

  it("a value on make's command line is still named first", () => {
    expectNotRead('a1shape-d-include-command-line-value-first', 'PYTEST_ADDOPTS', 'Makefile', 4);
  });

  it('pin: a recipe line holding the word include is not a directive: hollow, as on main', () => {
    expectHollow('a1shape-pin-include-word-in-recipe');
  });
});

describe('v27 A1, item F (#713): a step that cannot run make does not make a mention not read', () => {
  it("a step env: over a set -e line, then make test: make passes the Makefile's -q (was: not read)", () => {
    expectHollow('a1shape-f-step-env-set-e-then-make');
  });

  it("a job env: over a package install, then make test: the Makefile's -q (was: not read)", () => {
    expectHollow('a1shape-f-job-env-package-install-then-make');
  });

  it("a job env: over set, true and echo, then make test: the Makefile's -q (was: not read)", () => {
    expectHollow('a1shape-f-job-env-builtins-then-make');
  });

  for (const [slug, text] of [
    ['requirements-install', 'a requirements-file install'],
    ['editable-install', 'an editable install'],
    ['script-call', 'a script call'],
    ['print-substitution', 'a print with a command substitution'],
  ] as const) {
    it(`${text} stays not read, as on main`, () => {
      expectNotRead(`a1shape-f-${slug}-stays-not-read`, 'PYTEST_ADDOPTS: "-p no:skipping"', CI, 8);
    });
  }

  it('a print that writes $GITHUB_ENV stays not read, as on main', () => {
    expectWithheld('a1shape-f-print-to-github-env-stays-not-read', 'pytest run not read: `PYTEST_ADDOPTS written to $GITHUB_ENV`');
  });
});

describe('v27 A1, item G (#661): the nox empty-posargs set', () => {
  const fixture = ADDOPTS_SHAPE_FIXTURES.find(({ name }) => name === 'a1shape-g-nox-empty-posargs-only-run-over-file');

  it("the noxfile call read with no posargs is the only run with -p no:skipping over tests/test_cache.py, and A1 says so", () => {
    expectWithheld('a1shape-g-nox-empty-posargs-only-run-over-file', 'every-test-skipped rule not applied: -p no:skipping on a pytest command line in noxfile.py');
  });

  it('the reader reads the call once with the CI posargs and once with none', () => {
    const files = new Map(Object.entries(fixture?.files ?? {}));
    const runs = readPytestInvocations([...files.keys()], (file) => files.get(file)).filter(({ file }) => file === 'noxfile.py');
    expect(runs.map(({ args }) => args.join(' '))).toEqual(['-p no:skipping', '-p no:skipping tests/test_lru.py']);
  });
});
