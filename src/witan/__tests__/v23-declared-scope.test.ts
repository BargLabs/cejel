import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// docs/orchestration/goal_cejel_v23_declared_scope_is_false_2026-09-11.md: the V23 declaration
// comment in rubric-version.ts is the one authoritative sentence describing what v23 adds over
// v22. It previously claimed v23 adds "only" A1 command-flag coverage, when in fact three
// v23-specific mechanisms are gated on WITAN_RUBRIC_VERSION_V23 in repo-signals.ts.
//
// A fully automatic "does this identifier belong to v23 alone, or is it part of a v18-v22
// inheritance chain" derivation was considered and rejected as brittle: this file's inheritance
// chains (e.g. usesV18NativeRls, usesV19CommitYear) span multiple source lines, with the
// deciding WITAN_RUBRIC_VERSION_V22 reference frequently on a *different* line than the
// WITAN_RUBRIC_VERSION_V23 reference that would need to be checked against it. A same-line regex
// misses those chains entirely; a heuristic that is actually correct would need to parse
// statement/expression boundaries, which is disproportionate machinery for a comment-accuracy
// guard and risks the "wrong manifest is worse than honest prose" failure mode. Instead this
// pins two things that DO fail loud on drift:
//
// 1. The three known v23-specific markers still exist verbatim in repo-signals.ts.
// 2. The *total* count of WITAN_RUBRIC_VERSION_V23 references in repo-signals.ts is unchanged.
//    Any change to that count — a fourth v23-specific mechanism, an extended inheritance chain,
//    a removed gate — trips this test and forces a human to re-check whether the V23 comment in
//    rubric-version.ts is still accurate before updating the pinned count here.

const REPO_SIGNALS_SOURCE_PATH = fileURLToPath(new URL('../repo-signals.ts', import.meta.url));

function readRepoSignalsSource(): string {
  return readFileSync(REPO_SIGNALS_SOURCE_PATH, 'utf8');
}

// Mechanism 1 (A1 command-flag coverage, #284) and mechanism 2 (A2 PEM private-key grammar,
// #289) are both a bare `rubricVersion === WITAN_RUBRIC_VERSION_V23` equality with no other
// rubric-version reference on the same statement — the shape every v18-v22 inheritance chain
// does NOT have, since every one of those chains also references WITAN_RUBRIC_VERSION_V22.
// Mechanism 3 (per-signal abstention, #278/#284) is not a boolean flag at all: it is the
// top-level branch that decides whether an unreadable-content abstention wipes a whole criterion
// (v17, v22, every other rubric) or only the specific signal(s) it affects (v23 only) — a
// semantics change to what a non-finding means, and the one of the three least visible in a
// plain read of the file.
const KNOWN_V23_SPECIFIC_MARKERS = [
  'const usesV23CommandCoverage = rubricVersion === WITAN_RUBRIC_VERSION_V23;',
  'const usesV23PemPrivateKeyGrammar = rubricVersion === WITAN_RUBRIC_VERSION_V23;',
  'if (rubricVersion !== WITAN_RUBRIC_VERSION_V23) {',
] as const;

// Total occurrences of WITAN_RUBRIC_VERSION_V23 in repo-signals.ts today: 1 import + 6
// inherited-chain references (usesV17DetectorClosure, usesV18NativeRls, usesV19CommitYear,
// usesV20A3ExplicitGaps, usesV21ExecutedEscalations, usesV22PackageStartEntrypoint) + the 3
// v23-specific markers above = 10.
const EXPECTED_TOTAL_V23_REFERENCES = 10;

describe('v23 declared-scope manifest (docs/orchestration/goal_cejel_v23_declared_scope_is_false_2026-09-11.md)', () => {
  it('the three known v23-specific gates are still present verbatim in repo-signals.ts', () => {
    const source = readRepoSignalsSource();
    for (const marker of KNOWN_V23_SPECIFIC_MARKERS) {
      expect(source.includes(marker), `expected marker not found: ${marker}`).toBe(true);
    }
  });

  it('total WITAN_RUBRIC_VERSION_V23 references in repo-signals.ts is pinned', () => {
    const source = readRepoSignalsSource();
    const matches = source.match(/WITAN_RUBRIC_VERSION_V23/g) ?? [];
    expect(
      matches.length,
      'WITAN_RUBRIC_VERSION_V23 reference count changed — check whether this is a new ' +
        'v23-specific mechanism (update the V23 comment in rubric-version.ts and the marker ' +
        'list above) or an extended inheritance chain, then update EXPECTED_TOTAL_V23_REFERENCES.',
    ).toBe(EXPECTED_TOTAL_V23_REFERENCES);
  });
});
