import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  WITAN_LAST_CALIBRATED_RUBRIC_VERSION,
  WITAN_PROSPECTIVE_RUBRIC_VERSIONS,
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V23,
  WITAN_RUBRIC_VERSION_V24,
  isProspectiveRubricVersion,
} from '../rubric-version.js';

// The same guard v23-declared-scope.test.ts installs, applied to v24 before v24 has a chance to
// drift (PENDING_cejel_v23_declared_scope_is_false_2026-09-11, #302): a rubric constant's
// "adds only X" comment is hand-maintained while the gates on that constant are code-maintained
// elsewhere, and nothing forces them to agree. V23's declaration was wrong for a month for exactly
// that reason. This pins the one v24-specific gate verbatim and pins the total
// WITAN_RUBRIC_VERSION_V24 reference count, so adding a second v24 mechanism — or quietly
// extending an inheritance chain — fails loud and forces a human to re-read the declaration.

const REPO_SIGNALS_SOURCE_PATH = fileURLToPath(new URL('../repo-signals.ts', import.meta.url));
const RUBRIC_VERSION_SOURCE_PATH = fileURLToPath(new URL('../rubric-version.ts', import.meta.url));

// The single v24-specific gate. Like v23's markers this is a bare equality with no other
// rubric-version reference on the same statement — the shape none of the v18-v22 inheritance
// chains has, since every one of those also references WITAN_RUBRIC_VERSION_V22.
const KNOWN_V24_SPECIFIC_MARKERS = [
  'const usesV24SecretContentContext = rubricVersion === WITAN_RUBRIC_VERSION_V24;',
] as const;

// Total occurrences of WITAN_RUBRIC_VERSION_V24 in repo-signals.ts today: 1 import + 6
// inherited-chain references (usesV17DetectorClosure, usesV18NativeRls, usesV19CommitYear,
// usesV20A3ExplicitGaps, usesV21ExecutedEscalations, usesV22PackageStartEntrypoint) + 1 prose
// reference in the gate's own comment + the 1 v24-specific marker above = 9.
const EXPECTED_TOTAL_V24_REFERENCES = 9;

describe('v24 declared scope', () => {
  it('the known v24-specific gate is present verbatim in repo-signals.ts', () => {
    const source = readFileSync(REPO_SIGNALS_SOURCE_PATH, 'utf8');
    for (const marker of KNOWN_V24_SPECIFIC_MARKERS) {
      expect(source.includes(marker), `expected marker not found: ${marker}`).toBe(true);
    }
  });

  it('total WITAN_RUBRIC_VERSION_V24 references in repo-signals.ts is pinned', () => {
    const source = readFileSync(REPO_SIGNALS_SOURCE_PATH, 'utf8');
    const matches = source.match(/WITAN_RUBRIC_VERSION_V24/g) ?? [];
    expect(
      matches.length,
      'WITAN_RUBRIC_VERSION_V24 reference count changed — check whether this is a new ' +
        'v24-specific mechanism (update the V24 comment in rubric-version.ts and the marker ' +
        'list above) or an extended inheritance chain, then update EXPECTED_TOTAL_V24_REFERENCES.',
    ).toBe(EXPECTED_TOTAL_V24_REFERENCES);
  });

  it('does not extend any v23-specific gate to v24', () => {
    const source = readFileSync(REPO_SIGNALS_SOURCE_PATH, 'utf8');
    // V23's declaration states that its four mechanisms are gated on WITAN_RUBRIC_VERSION_V23
    // ALONE and that mechanism 4 is not inheritable. v24 is a v22 descendant precisely so that
    // statement stays true; if a future change makes v24 inherit them, that declaration has to be
    // rewritten in the same commit rather than silently falsified.
    for (const marker of [
      'const usesV23CommandCoverage = rubricVersion === WITAN_RUBRIC_VERSION_V23;',
      'const usesV23PemPrivateKeyGrammar = rubricVersion === WITAN_RUBRIC_VERSION_V23;',
      'if (rubricVersion !== WITAN_RUBRIC_VERSION_V23) {',
      'const usesV23WithheldPathAbstention = rubricVersion === WITAN_RUBRIC_VERSION_V23;',
    ]) {
      expect(source.includes(marker), `v23-only gate changed shape: ${marker}`).toBe(true);
    }
    expect(WITAN_RUBRIC_VERSION_V24).not.toBe(WITAN_RUBRIC_VERSION_V23);
  });

  it('inherits no calibration claim and does not move the public default', () => {
    expect(isProspectiveRubricVersion(WITAN_RUBRIC_VERSION_V24)).toBe(true);
    expect(WITAN_PROSPECTIVE_RUBRIC_VERSIONS).toContain(WITAN_RUBRIC_VERSION_V24);
    expect(WITAN_LAST_CALIBRATED_RUBRIC_VERSION).toBe(WITAN_RUBRIC_VERSION_V17);
  });

  it('declares the v22 parent and the path signals it does not read', () => {
    const declaration = readFileSync(RUBRIC_VERSION_SOURCE_PATH, 'utf8');
    const v24Block = declaration.slice(
      declaration.indexOf('// Prospective A2 secret-posture content-context rubric.'),
      declaration.indexOf('export const WITAN_RUBRIC_VERSION_V24'),
    );
    expect(v24Block).not.toBe('');
    expect(v24Block).toContain('inherits the complete v22');
    expect(v24Block).toContain('V24 deliberately inherits v22, NOT v23');
    expect(v24Block).toContain('V39_NON_PRODUCTION_CREDENTIAL_PATH_PATTERN');
    expect(v24Block).toContain('The public default remains v17');
  });
});
