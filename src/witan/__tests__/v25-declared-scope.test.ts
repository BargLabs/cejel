import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  WITAN_LAST_CALIBRATED_RUBRIC_VERSION,
  WITAN_PROSPECTIVE_RUBRIC_VERSIONS,
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V23,
  WITAN_RUBRIC_VERSION_V24,
  WITAN_RUBRIC_VERSION_V25,
  isProspectiveRubricVersion,
} from '../rubric-version.js';

// The guard v23-declared-scope.test.ts and v24-declared-scope.test.ts install, applied to v25 from
// its first commit (PENDING_cejel_v23_declared_scope_is_false_2026-09-11, #302): a rubric
// constant's "adds only X" comment is hand-maintained while the gates on that constant are
// code-maintained elsewhere, and nothing forces them to agree. This pins the one v25-specific gate
// verbatim and the total WITAN_RUBRIC_VERSION_V25 reference count in repo-signals.ts and
// scoring.ts, so a second v25 mechanism, or a quietly extended inheritance chain, fails loud and
// forces a human to re-read the declaration. v25-v22-non-a3-parity.test.ts is the measured half.

const REPO_SIGNALS_SOURCE_PATH = fileURLToPath(new URL('../repo-signals.ts', import.meta.url));
const SCORING_SOURCE_PATH = fileURLToPath(new URL('../scoring.ts', import.meta.url));
const RUBRIC_VERSION_SOURCE_PATH = fileURLToPath(new URL('../rubric-version.ts', import.meta.url));
const WITAN_SOURCE_DIR = fileURLToPath(new URL('..', import.meta.url));

// The single v25-specific gate. Since 2026-10-14 it also names V26, which is declared as v25's
// complete closure (goal_cejel_v26_rubric_scaffold_2026-10-14) and no other rubric; it names
// neither V22 nor any v18-v22 chain member, the shape none of the inheritance chains has.
const KNOWN_V25_SPECIFIC_MARKERS = [
  'const usesV25InlineHealthRoute =\n' +
    '    rubricVersion === WITAN_RUBRIC_VERSION_V25 || rubricVersion === WITAN_RUBRIC_VERSION_V26;',
] as const;

// Total occurrences of WITAN_RUBRIC_VERSION_V25 in repo-signals.ts today: 1 import + 6
// inherited-chain references (usesV17DetectorClosure, usesV18NativeRls, usesV19CommitYear,
// usesV20A3ExplicitGaps, usesV21ExecutedEscalations, usesV22PackageStartEntrypoint) + 1 prose
// reference in the gate's own comment + the 1 v25-specific marker above = 9.
const EXPECTED_TOTAL_V25_REFERENCES = 9;

// scoring.ts has no v25-specific gate: 1 import + the 4 v22 allowlists (usesV17DetectorClosure,
// the signal-adjustment status gate, usesMetricScoring, the synthesized-finding gate) = 5.
const EXPECTED_SCORING_V25_REFERENCES = 5;

const V22_COMPARISON = /rubricVersion [!=]== WITAN_RUBRIC_VERSION_V22\b/g;
const V25_COMPARISON = /rubricVersion [!=]== WITAN_RUBRIC_VERSION_V25\b/g;

function witanSourceFiles(): string[] {
  return readdirSync(WITAN_SOURCE_DIR, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts') && !path.split(sep).includes('__tests__'))
    .map((path) => join(WITAN_SOURCE_DIR, path))
    .sort();
}

describe('v25 declared scope', () => {
  it('the known v25-specific gate is present verbatim in repo-signals.ts', () => {
    const source = readFileSync(REPO_SIGNALS_SOURCE_PATH, 'utf8');
    for (const marker of KNOWN_V25_SPECIFIC_MARKERS) {
      expect(source.includes(marker), `expected marker not found: ${marker}`).toBe(true);
    }
  });

  it('total WITAN_RUBRIC_VERSION_V25 references in repo-signals.ts is pinned', () => {
    const source = readFileSync(REPO_SIGNALS_SOURCE_PATH, 'utf8');
    const matches = source.match(/WITAN_RUBRIC_VERSION_V25/g) ?? [];
    expect(
      matches.length,
      'WITAN_RUBRIC_VERSION_V25 reference count changed — check whether this is a new ' +
        'v25-specific mechanism (update the V25 comment in rubric-version.ts and the marker ' +
        'list above) or an extended inheritance chain, then update EXPECTED_TOTAL_V25_REFERENCES.',
    ).toBe(EXPECTED_TOTAL_V25_REFERENCES);
  });

  it('total WITAN_RUBRIC_VERSION_V25 references in scoring.ts is pinned', () => {
    const source = readFileSync(SCORING_SOURCE_PATH, 'utf8');
    const matches = source.match(/WITAN_RUBRIC_VERSION_V25/g) ?? [];
    expect(
      matches.length,
      'WITAN_RUBRIC_VERSION_V25 reference count in scoring.ts changed — v25 is declared as v22 ' +
        'outside A3, so scoring.ts should name V25 exactly where it names V22. Re-read the V25 ' +
        'declaration in rubric-version.ts, then update EXPECTED_SCORING_V25_REFERENCES.',
    ).toBe(EXPECTED_SCORING_V25_REFERENCES);
  });

  it('every src/witan file compares against V25 wherever it compares against V22', () => {
    const mismatched: string[] = [];
    for (const path of witanSourceFiles()) {
      const source = readFileSync(path, 'utf8');
      const v22 = (source.match(V22_COMPARISON) ?? []).length;
      const v25Specific = KNOWN_V25_SPECIFIC_MARKERS.filter((marker) =>
        source.includes(marker),
      ).length;
      const v25Inherited = (source.match(V25_COMPARISON) ?? []).length - v25Specific;
      if (v22 !== v25Inherited) {
        mismatched.push(`${relative(WITAN_SOURCE_DIR, path)}: ${v22} v22 vs ${v25Inherited} v25`);
      }
    }
    expect(
      mismatched,
      'a rubric-version comparison names WITAN_RUBRIC_VERSION_V22 without a matching ' +
        'WITAN_RUBRIC_VERSION_V25 comparison (or the reverse). v25 inherits v22 on every ' +
        'criterion except A3, so a v22 allowlist that omits V25 sends v25 down a different path.',
    ).toEqual([]);
  });

  it('does not extend any v23-specific or v24-specific gate to v25', () => {
    const source = readFileSync(REPO_SIGNALS_SOURCE_PATH, 'utf8');
    for (const marker of [
      'const usesV23CommandCoverage = rubricVersion === WITAN_RUBRIC_VERSION_V23;',
      'const usesV23PemPrivateKeyGrammar = rubricVersion === WITAN_RUBRIC_VERSION_V23;',
      'if (rubricVersion !== WITAN_RUBRIC_VERSION_V23) {',
      'const usesV23WithheldPathAbstention = rubricVersion === WITAN_RUBRIC_VERSION_V23;',
      'const usesV24SecretContentContext = rubricVersion === WITAN_RUBRIC_VERSION_V24;',
    ]) {
      expect(source.includes(marker), `v23/v24-only gate changed shape: ${marker}`).toBe(true);
    }
    expect(WITAN_RUBRIC_VERSION_V25).not.toBe(WITAN_RUBRIC_VERSION_V23);
    expect(WITAN_RUBRIC_VERSION_V25).not.toBe(WITAN_RUBRIC_VERSION_V24);
  });

  it('inherits no calibration claim and does not move the public default', () => {
    expect(isProspectiveRubricVersion(WITAN_RUBRIC_VERSION_V25)).toBe(true);
    expect(WITAN_PROSPECTIVE_RUBRIC_VERSIONS).toContain(WITAN_RUBRIC_VERSION_V25);
    expect(WITAN_LAST_CALIBRATED_RUBRIC_VERSION).toBe(WITAN_RUBRIC_VERSION_V17);
  });

  it('declares the v22 parent, the batching reason, and that no rescore has run', () => {
    const declaration = readFileSync(RUBRIC_VERSION_SOURCE_PATH, 'utf8');
    const v25Block = declaration.slice(
      declaration.indexOf('// Prospective A3 inline health-route rubric.'),
      declaration.indexOf('export const WITAN_RUBRIC_VERSION_V25'),
    );
    expect(v25Block).not.toBe('');
    expect(v25Block).toContain('inherits the complete v22');
    expect(v25Block).toContain('V25 deliberately inherits v22, NOT v23 or v24');
    expect(v25Block).toContain('healthReadinessRouteReads');
    expect(v25Block).toContain('calibrated once');
    expect(v25Block).toContain('public paired');
    expect(v25Block).toContain('The public default remains v17');
  });
});
