import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  WITAN_LAST_CALIBRATED_RUBRIC_VERSION,
  WITAN_PROSPECTIVE_RUBRIC_VERSIONS,
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V27,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
  assertSelectableRubricVersion,
  isProspectiveRubricVersion,
} from '../rubric-version.js';
import { WITAN_RUBRIC_VERSION } from '../schemas.js';

// The declared-scope guard v23-v26 carry, applied to v27 from its first commit
// (PENDING_cejel_v23_declared_scope_is_false_2026-09-11, #302). v27 is declared as v17's closure
// plus one gate of its own, so the rule is: every rubric-version comparison in src/witan that names
// WITAN_RUBRIC_VERSION_V17 also names WITAN_RUBRIC_VERSION_V27, no comparison naming any of
// V18-V26 names V27, and the only comparison naming V27 without V17 is `usesV27FalseAssuranceClosure`.
// false-assurance-v27.test.ts is the measured half.

const REPO_SIGNALS_SOURCE_PATH = fileURLToPath(new URL('../repo-signals.ts', import.meta.url));
const RUBRIC_VERSION_SOURCE_PATH = fileURLToPath(new URL('../rubric-version.ts', import.meta.url));
const WITAN_SOURCE_DIR = fileURLToPath(new URL('..', import.meta.url));

const V27_GATE =
  'export function usesV27FalseAssuranceClosure(rubricVersion: string): boolean {\n' +
  '  return rubricVersion === WITAN_RUBRIC_VERSION_V27;\n' +
  '}';

const V17_COMPARISON = /rubricVersion [!=]== WITAN_RUBRIC_VERSION_V17\b/g;
const V27_COMPARISON = /rubricVersion [!=]== WITAN_RUBRIC_VERSION_V27\b/g;

function witanSourceFiles(): string[] {
  return readdirSync(WITAN_SOURCE_DIR, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts') && !path.split(sep).includes('__tests__'))
    .map((path) => join(WITAN_SOURCE_DIR, path))
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

describe('v27 declared scope', () => {
  it('names the 2026-10-19 prospective identifier', () => {
    expect(WITAN_RUBRIC_VERSION_V27).toBe('witan-rubric-v27-prospective-2026-10-19');
  });

  it('is selectable, so --rubric-pin accepts it', () => {
    expect(WITAN_SELECTABLE_RUBRIC_VERSIONS).toContain(WITAN_RUBRIC_VERSION_V27);
    expect(() => assertSelectableRubricVersion(WITAN_RUBRIC_VERSION_V27)).not.toThrow();
  });

  it('is prospective, inherits no calibration claim, and does not move the public default', () => {
    expect(isProspectiveRubricVersion(WITAN_RUBRIC_VERSION_V27)).toBe(true);
    expect(WITAN_PROSPECTIVE_RUBRIC_VERSIONS).toContain(WITAN_RUBRIC_VERSION_V27);
    expect(WITAN_LAST_CALIBRATED_RUBRIC_VERSION).toBe(WITAN_RUBRIC_VERSION_V17);
    expect(WITAN_RUBRIC_VERSION).toBe(WITAN_RUBRIC_VERSION_V17);
  });

  it('every src/witan file compares against V27 wherever it compares against V17, plus the one gate', () => {
    const mismatched: string[] = [];
    let v17Sites = 0;
    for (const path of witanSourceFiles()) {
      const source = readFileSync(path, 'utf8');
      const v17 = (source.match(V17_COMPARISON) ?? []).length;
      const v27 = (source.match(V27_COMPARISON) ?? []).length;
      const gate = source.split(V27_GATE).length - 1;
      v17Sites += v17;
      if (v17 !== v27 - gate) {
        mismatched.push(`${relative(WITAN_SOURCE_DIR, path)}: ${v17} v17 vs ${v27} v27 (${gate} gate)`);
      }
    }
    expect(
      readFileSync(REPO_SIGNALS_SOURCE_PATH, 'utf8').split(V27_GATE).length - 1,
      'the v27 gate is defined exactly once, in repo-signals.ts',
    ).toBe(1);
    expect(
      mismatched,
      'a rubric-version comparison names WITAN_RUBRIC_VERSION_V17 without a matching ' +
        "WITAN_RUBRIC_VERSION_V27 comparison (or the reverse). v27 is declared as v17's closure, " +
        'so an allowlist that omits V27 sends v27 down a different path.',
    ).toEqual([]);
    // usesV17DetectorClosure in repo-signals.ts + 4 in scoring.ts (usesV17DetectorClosure, the
    // signal-adjustment status gate, usesMetricScoring, the synthesized-finding gate).
    expect(v17Sites).toBe(5);
  });

  it('no comparison that names V27 and V17 together leaves out an ancestor v17 itself inherits', () => {
    // A chain naming V27 must name V17 too (or be the gate). It may name V18-V26 as well, because
    // those chains are v17-inclusive allowlists; what v27 must never do is appear in a chain that
    // omits V17, which would be inheriting from a descendant of v17 instead of v17.
    const offending: string[] = [];
    for (const path of witanSourceFiles()) {
      for (const chain of comparisonChains(readFileSync(path, 'utf8'))) {
        if (!chain.includes('V27')) continue;
        if (chain.length === 1) continue; // the gate itself
        if (!chain.includes('V17')) {
          offending.push(`${relative(WITAN_SOURCE_DIR, path)}: ${chain.join(', ')}`);
        }
      }
    }
    expect(offending).toEqual([]);
  });

  it('declares the v17 parent, what it does not inherit, explicit-only, and no claim', () => {
    const declaration = readFileSync(RUBRIC_VERSION_SOURCE_PATH, 'utf8');
    const block = declaration.slice(
      declaration.indexOf('// Prospective false-assurance closure.'),
      declaration.indexOf('export const WITAN_RUBRIC_VERSION_V27'),
    );
    expect(block).not.toBe('');
    expect(block).toContain('V27 inherits v17');
    expect(block).toContain('NOT v18-v26');
    expect(block).toContain('usesV27FalseAssuranceClosure');
    for (const issue of ['#517', '#518', '#519', '#520', '#442']) expect(block).toContain(issue);
    expect(block).toContain('The public default remains v17');
    expect(block).toContain('no precision or recall claim');
  });
});
