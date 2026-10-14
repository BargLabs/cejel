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
  WITAN_RUBRIC_VERSION_V26,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
  assertSelectableRubricVersion,
  isProspectiveRubricVersion,
} from '../rubric-version.js';
import { WITAN_RUBRIC_VERSION } from '../schemas.js';

// The declared-scope guard v23, v24 and v25 carry, applied to v26 from its first commit
// (PENDING_cejel_v23_declared_scope_is_false_2026-09-11, #302). v26 is declared as v25's complete
// closure — the v22 chain plus v25's inline health route — with nothing of its own yet. So the
// rule here is stronger than v25's "wherever V22": every rubric-version comparison that names
// WITAN_RUBRIC_VERSION_V25 must also name WITAN_RUBRIC_VERSION_V26, including v25's own gate.
// A v26 item card that adds a v26-specific gate updates this file and the declaration together.
// v26-v25-parity.test.ts is the measured half.

const REPO_SIGNALS_SOURCE_PATH = fileURLToPath(new URL('../repo-signals.ts', import.meta.url));
const SCORING_SOURCE_PATH = fileURLToPath(new URL('../scoring.ts', import.meta.url));
const RUBRIC_VERSION_SOURCE_PATH = fileURLToPath(new URL('../rubric-version.ts', import.meta.url));
const WITAN_SOURCE_DIR = fileURLToPath(new URL('..', import.meta.url));

// Total occurrences of WITAN_RUBRIC_VERSION_V26 in repo-signals.ts: 1 import + 6 v22-chain
// references (usesV17DetectorClosure, usesV18NativeRls, usesV19CommitYear, usesV20A3ExplicitGaps,
// usesV21ExecutedEscalations, usesV22PackageStartEntrypoint) + 1 in usesV25InlineHealthRoute
// + 1 prose reference in that gate's comment = 9.
const EXPECTED_REPO_SIGNALS_V26_REFERENCES = 9;

// scoring.ts: 1 import + the 4 v22 allowlists (usesV17DetectorClosure, the signal-adjustment
// status gate, usesMetricScoring, the synthesized-finding gate) = 5. No v26-specific gate.
const EXPECTED_SCORING_V26_REFERENCES = 5;

const V25_COMPARISON = /rubricVersion [!=]== WITAN_RUBRIC_VERSION_V25\b/g;
const V26_COMPARISON = /rubricVersion [!=]== WITAN_RUBRIC_VERSION_V26\b/g;

function witanSourceFiles(): string[] {
  return readdirSync(WITAN_SOURCE_DIR, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts') && !path.split(sep).includes('__tests__'))
    .map((path) => join(WITAN_SOURCE_DIR, path))
    .sort();
}

describe('v26 declared scope', () => {
  it('names the 2026-10-14 prospective identifier', () => {
    expect(WITAN_RUBRIC_VERSION_V26).toBe('witan-rubric-v26-prospective-2026-10-14');
  });

  it('is selectable, so --rubric-pin accepts it', () => {
    expect(WITAN_SELECTABLE_RUBRIC_VERSIONS).toContain(WITAN_RUBRIC_VERSION_V26);
    expect(() => assertSelectableRubricVersion(WITAN_RUBRIC_VERSION_V26)).not.toThrow();
  });

  it('is prospective, inherits no calibration claim, and does not move the public default', () => {
    expect(isProspectiveRubricVersion(WITAN_RUBRIC_VERSION_V26)).toBe(true);
    expect(WITAN_PROSPECTIVE_RUBRIC_VERSIONS).toContain(WITAN_RUBRIC_VERSION_V26);
    expect(WITAN_LAST_CALIBRATED_RUBRIC_VERSION).toBe(WITAN_RUBRIC_VERSION_V17);
    expect(WITAN_RUBRIC_VERSION).toBe(WITAN_RUBRIC_VERSION_V17);
    expect(WITAN_RUBRIC_VERSION).not.toBe(WITAN_RUBRIC_VERSION_V26);
  });

  it('every src/witan file compares against V26 wherever it compares against V25', () => {
    const mismatched: string[] = [];
    let v25Sites = 0;
    for (const path of witanSourceFiles()) {
      const source = readFileSync(path, 'utf8');
      const v25 = (source.match(V25_COMPARISON) ?? []).length;
      const v26 = (source.match(V26_COMPARISON) ?? []).length;
      v25Sites += v25;
      if (v25 !== v26) {
        mismatched.push(`${relative(WITAN_SOURCE_DIR, path)}: ${v25} v25 vs ${v26} v26`);
      }
    }
    expect(
      mismatched,
      'a rubric-version comparison names WITAN_RUBRIC_VERSION_V25 without a matching ' +
        "WITAN_RUBRIC_VERSION_V26 comparison (or the reverse). v26 is declared as v25's complete " +
        'closure, so an allowlist that omits V26 sends v26 down a different path.',
    ).toEqual([]);
    // 7 in repo-signals.ts (six v22-chain gates + usesV25InlineHealthRoute) + 4 in scoring.ts.
    expect(v25Sites).toBe(11);
  });

  it('total WITAN_RUBRIC_VERSION_V26 references in repo-signals.ts is pinned', () => {
    const source = readFileSync(REPO_SIGNALS_SOURCE_PATH, 'utf8');
    const matches = source.match(/WITAN_RUBRIC_VERSION_V26/g) ?? [];
    expect(
      matches.length,
      'WITAN_RUBRIC_VERSION_V26 reference count changed — check whether this is a new ' +
        'v26-specific mechanism (update the V26 comment in rubric-version.ts) or an extended ' +
        'inheritance chain, then update EXPECTED_REPO_SIGNALS_V26_REFERENCES.',
    ).toBe(EXPECTED_REPO_SIGNALS_V26_REFERENCES);
  });

  it('total WITAN_RUBRIC_VERSION_V26 references in scoring.ts is pinned', () => {
    const source = readFileSync(SCORING_SOURCE_PATH, 'utf8');
    const matches = source.match(/WITAN_RUBRIC_VERSION_V26/g) ?? [];
    expect(
      matches.length,
      'WITAN_RUBRIC_VERSION_V26 reference count in scoring.ts changed — v26 is declared as v25, ' +
        'so scoring.ts should name V26 exactly where it names V25. Re-read the V26 declaration in ' +
        'rubric-version.ts, then update EXPECTED_SCORING_V26_REFERENCES.',
    ).toBe(EXPECTED_SCORING_V26_REFERENCES);
  });

  it("extends v25's inline health route to v26, and no v23-specific or v24-specific gate", () => {
    const source = readFileSync(REPO_SIGNALS_SOURCE_PATH, 'utf8');
    expect(source).toContain(
      'const usesV25InlineHealthRoute =\n' +
        '    rubricVersion === WITAN_RUBRIC_VERSION_V25 || rubricVersion === WITAN_RUBRIC_VERSION_V26;',
    );
    for (const marker of [
      'const usesV23CommandCoverage = rubricVersion === WITAN_RUBRIC_VERSION_V23;',
      'const usesV23PemPrivateKeyGrammar = rubricVersion === WITAN_RUBRIC_VERSION_V23;',
      'if (rubricVersion !== WITAN_RUBRIC_VERSION_V23) {',
      'const usesV23WithheldPathAbstention = rubricVersion === WITAN_RUBRIC_VERSION_V23;',
      'const usesV24SecretContentContext = rubricVersion === WITAN_RUBRIC_VERSION_V24;',
    ]) {
      expect(source.includes(marker), `v23/v24-only gate changed shape: ${marker}`).toBe(true);
    }
    expect(WITAN_RUBRIC_VERSION_V26).not.toBe(WITAN_RUBRIC_VERSION_V23);
    expect(WITAN_RUBRIC_VERSION_V26).not.toBe(WITAN_RUBRIC_VERSION_V24);
    expect(WITAN_RUBRIC_VERSION_V26).not.toBe(WITAN_RUBRIC_VERSION_V25);
  });

  it('declares the v25 parent, what it does not inherit, explicit-only, and no claim', () => {
    const declaration = readFileSync(RUBRIC_VERSION_SOURCE_PATH, 'utf8');
    const v26Block = declaration.slice(
      declaration.indexOf('// Prospective v26 calibration-candidate rubric.'),
      declaration.indexOf('export const WITAN_RUBRIC_VERSION_V26'),
    );
    expect(v26Block).not.toBe('');
    expect(v26Block).toContain("inherits v25's complete closure");
    expect(v26Block).toContain('V26 does NOT inherit v23 or v24');
    expect(v26Block).toContain('next calibration');
    expect(v26Block).toContain('The public default remains v17');
    expect(v26Block).toContain('no precision or recall claim');
  });
});
