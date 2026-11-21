import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  WITAN_LAST_CALIBRATED_RUBRIC_VERSION,
  WITAN_PROSPECTIVE_RUBRIC_VERSIONS,
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V27,
  WITAN_RUBRIC_VERSION_V28,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
  assertSelectableRubricVersion,
  isProspectiveRubricVersion,
} from '../rubric-version.js';
import { WITAN_RUBRIC_VERSION } from '../schemas.js';
import { usesV27FalseAssuranceGate, usesV28OwnReadings } from '../repo-signals.js';

// The declared-scope guard v27 carries (v27-declared-scope.test.ts, which this change leaves as it
// is), applied to v28 from its first commit (cejel_v23_declared_scope_is_false_2026-09-11). v28 is
// declared as v27 plus its own readings, so: every rubric-version comparison chain in src/witan that
// names WITAN_RUBRIC_VERSION_V27 also names WITAN_RUBRIC_VERSION_V28; no chain naming any of V18 to
// V26 names V28; and the only comparisons naming V28 without V27 are v28's own reading functions,
// listed here by name. v28 reaches v27's one gate through `usesV27FalseAssuranceGate`, and no file
// calls `usesV27FalseAssuranceClosure` anywhere else, so no v27 site can leave v28 out.
// v28-a1-readings.test.ts is the measured half.

const REPO_SIGNALS_SOURCE_PATH = fileURLToPath(new URL('../repo-signals.ts', import.meta.url));
const RUBRIC_VERSION_SOURCE_PATH = fileURLToPath(new URL('../rubric-version.ts', import.meta.url));
const SRC_DIR = fileURLToPath(new URL('../..', import.meta.url));
const WITAN_SOURCE_DIR = fileURLToPath(new URL('..', import.meta.url));

/** v28's own reading functions: the only comparisons that name V28 without V27. */
const V28_OWN_READING_FUNCTIONS: Readonly<Record<string, string>> = {
  usesV28OwnReadings:
    'export function usesV28OwnReadings(rubricVersion: string): boolean {\n' +
    '  return rubricVersion === WITAN_RUBRIC_VERSION_V28;\n' +
    '}',
};

const V27_INHERITED_GATE =
  'export function usesV27FalseAssuranceGate(rubricVersion: string): boolean {\n' +
  '  return usesV27FalseAssuranceClosure(rubricVersion) || usesV28OwnReadings(rubricVersion);\n' +
  '}';

const V27_COMPARISON = /rubricVersion [!=]== WITAN_RUBRIC_VERSION_V27\b/g;
const V28_COMPARISON = /rubricVersion [!=]== WITAN_RUBRIC_VERSION_V28\b/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts') && !path.split(sep).includes('__tests__'))
    .map((path) => join(dir, path))
    .sort();
}

/** Each `rubricVersion === ... ||` / `!== ... &&` chain, as the list of identifiers it names. */
function comparisonChains(source: string): string[][] {
  const chains: string[][] = [];
  const pattern = /(?:rubricVersion [!=]== WITAN_RUBRIC_VERSION_V\d+\b(?:\s*(?:\|\||&&)\s*)?)+/g;
  for (const match of source.matchAll(pattern)) {
    chains.push([...match[0].matchAll(/WITAN_RUBRIC_VERSION_(V\d+)\b/g)].map((m) => m[1] ?? ''));
  }
  return chains;
}

describe('v28 declared scope', () => {
  it('names the 2026-11-20 prospective identifier', () => {
    expect(WITAN_RUBRIC_VERSION_V28).toBe('witan-rubric-v28-prospective-2026-11-20');
  });

  it('is selectable, so --rubric-pin accepts it', () => {
    expect(WITAN_SELECTABLE_RUBRIC_VERSIONS).toContain(WITAN_RUBRIC_VERSION_V28);
    expect(() => assertSelectableRubricVersion(WITAN_RUBRIC_VERSION_V28)).not.toThrow();
  });

  it('is prospective, inherits no calibration claim, and does not move the public default', () => {
    expect(isProspectiveRubricVersion(WITAN_RUBRIC_VERSION_V28)).toBe(true);
    expect(WITAN_PROSPECTIVE_RUBRIC_VERSIONS).toContain(WITAN_RUBRIC_VERSION_V28);
    expect(WITAN_LAST_CALIBRATED_RUBRIC_VERSION).toBe(WITAN_RUBRIC_VERSION_V17);
    expect(WITAN_RUBRIC_VERSION).toBe(WITAN_RUBRIC_VERSION_V17);
  });

  it("carries v27's gate, and its own readings apply to v28 alone", () => {
    expect(usesV27FalseAssuranceGate(WITAN_RUBRIC_VERSION_V27)).toBe(true);
    expect(usesV27FalseAssuranceGate(WITAN_RUBRIC_VERSION_V28)).toBe(true);
    expect(usesV28OwnReadings(WITAN_RUBRIC_VERSION_V28)).toBe(true);
    for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
      if (rubricVersion === WITAN_RUBRIC_VERSION_V28) continue;
      expect(usesV28OwnReadings(rubricVersion), rubricVersion).toBe(false);
      if (rubricVersion !== WITAN_RUBRIC_VERSION_V27) {
        expect(usesV27FalseAssuranceGate(rubricVersion), rubricVersion).toBe(false);
      }
    }
  });

  it('the inherited gate and each own reading function are defined exactly once, in repo-signals.ts', () => {
    const repoSignals = readFileSync(REPO_SIGNALS_SOURCE_PATH, 'utf8');
    expect(repoSignals.split(V27_INHERITED_GATE).length - 1).toBe(1);
    for (const [name, text] of Object.entries(V28_OWN_READING_FUNCTIONS)) {
      expect(repoSignals.split(text).length - 1, name).toBe(1);
    }
  });

  it('no src file calls usesV27FalseAssuranceClosure except through the inherited gate', () => {
    const offending: string[] = [];
    for (const path of sourceFiles(SRC_DIR)) {
      const source = readFileSync(path, 'utf8').split(V27_INHERITED_GATE).join('');
      const calls = [...source.matchAll(/\busesV27FalseAssuranceClosure\(/g)].length;
      const definitions = [...source.matchAll(/function usesV27FalseAssuranceClosure\(/g)].length;
      if (calls - definitions > 0) offending.push(`${relative(SRC_DIR, path)}: ${calls - definitions}`);
    }
    expect(
      offending,
      "a v27 site that calls usesV27FalseAssuranceClosure directly leaves v28 out of v27's gate",
    ).toEqual([]);
  });

  it('every src/witan file compares against V28 wherever it compares against V27, plus its own readings', () => {
    const ownTexts = Object.values(V28_OWN_READING_FUNCTIONS);
    const mismatched: string[] = [];
    for (const path of sourceFiles(WITAN_SOURCE_DIR)) {
      const source = readFileSync(path, 'utf8');
      const v27 = (source.match(V27_COMPARISON) ?? []).length;
      const v28 = (source.match(V28_COMPARISON) ?? []).length;
      const own = ownTexts.reduce((total, text) => total + source.split(text).length - 1, 0);
      if (v27 !== v28 - own) {
        mismatched.push(`${relative(WITAN_SOURCE_DIR, path)}: ${v27} v27 vs ${v28} v28 (${own} own)`);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it('every chain naming V27 names V28; none naming V18-V26 names V28; V28 alone only in its own readings', () => {
    const offending: string[] = [];
    let alone = 0;
    for (const path of sourceFiles(WITAN_SOURCE_DIR)) {
      for (const chain of comparisonChains(readFileSync(path, 'utf8'))) {
        const where = `${relative(WITAN_SOURCE_DIR, path)}: ${chain.join(', ')}`;
        if (chain.includes('V27') && !chain.includes('V28')) offending.push(`V27 without V28 — ${where}`);
        if (chain.includes('V28') && chain.some((id) => /^V(1[89]|2[0-6])$/.test(id))) {
          offending.push(`V28 beside V18-V26 — ${where}`);
        }
        if (chain.includes('V28') && !chain.includes('V27')) {
          if (chain.length === 1) alone += 1;
          else offending.push(`V28 without V27 — ${where}`);
        }
      }
    }
    expect(offending).toEqual([]);
    expect(alone, 'only the own reading functions name V28 alone').toBe(Object.keys(V28_OWN_READING_FUNCTIONS).length);
  });

  it('declares the v27 parent, what it changes, the rise rule, explicit-only, and no claim', () => {
    const declaration = readFileSync(RUBRIC_VERSION_SOURCE_PATH, 'utf8');
    const block = declaration.slice(
      declaration.indexOf('// Prospective successor to v27.'),
      declaration.indexOf('export const WITAN_RUBRIC_VERSION_V28'),
    );
    expect(block).not.toBe('');
    expect(block).toContain('V28 inherits v27');
    expect(block).toContain('usesV27FalseAssuranceGate');
    expect(block).toContain('usesV28OwnReadings');
    for (const item of ['Item B', 'Item C', 'Item D']) expect(block).toContain(item);
    expect(block).toContain('may score above v27 only by items B to D');
    expect(block).toContain('leaderboard/RUBRIC_CHANGELOG.md');
    expect(block).toContain('The public default remains v17');
    expect(block).toContain('no precision or recall claim');
  });
});
