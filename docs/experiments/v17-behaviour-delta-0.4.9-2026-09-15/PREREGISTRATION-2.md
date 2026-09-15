# Preregistration 2 — re-measure after the review fixes on #308 and #309

Written and committed **before** the second comparison was run. Preregistration 1 covered the
first candidate tree (`a34da1a`); both PRs have since taken review-fix commits, so the tree the
release ships has changed and the record has to be re-measured against it rather than assumed to
carry over.

## What is being measured

Baseline arm: `7606392`, the `v0.4.8` commit — unchanged from preregistration 1, and its scored
output is reused rather than re-run.

Candidate arm: `origin/main` (`fe4210a`) with both branches at their new heads merged in, which
merges with no conflicts:

- #308 at `6aec928` — fixes for the abstention wiring, the generic-type-argument regex gap, the
  case-insensitive package-name matches, the dead-stub reachability gap, the duplicated predicate,
  the redundant boolean and the evidence-line helper.
- #309 at `153218d` — candidate-list-first truncation disclosure, per-name abstention
  classification, and the per-signal notes wording.

## Expected values, derived from the committed patterns and the checkouts

A3 is `not_applicable` on 17 of the 24 rows, so only react, vue, vite, axios, scorecard, alfred
and cejel can move on any A3 signal at all. Each fix was evaluated against those seven checkouts
using the patterns exactly as committed:

- **Observability case-sensitivity split.** Splitting `\b(?:pino|winston|bunyan|morgan)\b` out of
  the case-insensitive half can only *remove* a match, and only from a file whose sole match was a
  capitalised occurrence. Counted across all seven rows: **0 files lose their match** (react
  183→183, alfred 150→150, vite 83→83, cejel 13→13, axios 9→9, vue 4→4, scorecard 0→0, on the
  approximate implementation-file set). **0 rows move.**
- **Error-middleware regex widening plus the reachability requirement.** The committed shape
  pattern admits commas only inside `<...>`; combined with
  `EXPRESS_MIDDLEWARE_REACHABLE_PATTERN`, it credits **0 files on all seven rows** — the widened
  shape alone matches 0 files, so the reachability check has nothing to narrow. **0 rows move.**
  (An earlier, looser approximation of this widening matched one file in vite and was the basis
  for expecting vite to move; the committed pattern does not match it. That expectation is
  withdrawn here, before the run, rather than after it.)
- **Abstention wiring for `prod_readiness_primitives`.** Gated on `useV23WithheldPathAbstention`,
  prospective v23. Cannot fire under the calibrated default. **0 rows move.**
- **#309's truncation disclosure, per-name classification and notes wording.** All three act on
  `scanLimitations` and per-signal abstention notes. Every one of the 24 rows has an empty
  `scanLimitations` array under the calibrated default, so none of the three has anything to act
  on. **0 rows move, and no report text changes.**
- **Predicate consolidation, redundant-boolean removal, evidence-line helper.** The first two are
  refactors with no logic change. The third changes which line is cited as evidence for an
  error-middleware match, and no row has one. **0 rows move.**

## Predicted result, stated as a falsifiable whole

**All 24 rows identical to the `a34da1a` candidate arm at scoring level, and byte-identical once
`toolVersion` is excluded. The v0.4.8 → 0.4.9 delta is therefore unchanged from the committed
record: 4 rows move — django, vite and alfred on `B3.ci_script_depth` (3→2, 5→4, 5→4) and react
and alfred on `A3.observability_depth` (68→108, 64→73) — 20 of 24 reports byte-identical against
the baseline, one headline moved (django 3.2 → 3.1, process 3.8 → 3.6), no verdict, placement or
coverage change. No figure in `leaderboard/RUBRIC_CHANGELOG.md` needs to change.**

The four pinned shapes in `src/witan/__tests__/v17-scoring-surface-golden.test.ts` are predicted
to stay 4/4 green.

If the measured result differs from the above on any row, the difference is reported as written
and the entry is corrected to match the measurement. Nothing is adjusted to preserve this
prediction — not a score, not a fixture, not a threshold.
