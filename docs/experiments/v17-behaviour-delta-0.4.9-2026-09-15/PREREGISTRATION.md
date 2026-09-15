# Preregistration — v17 behaviour delta for 0.4.9 with #308 and #309 included

Written and committed **before** the comparison was run, so that the ordering is verifiable
from git history rather than asserted in prose. The 0.4.9 entry and the earlier draft of a
0.4.10 entry both had to disclose that they were measured post hoc; this one does not.

## What is being measured

Baseline arm: `7606392`, the `v0.4.8` commit — what a customer on the previous release has.

Candidate arm: `origin/main` (`fe4210a`) with the two open scoring PRs merged in, which is the
tree 0.4.9 will ship if both land before the tag:

- #308 `stream/yellow/20260915-141422-goal_cejel_a3_runtime_pattern_coverage_0` (`aa57822b`)
- #309 `stream/yellow/20260915-141447-goal_cejel_certificate_scope_disclosure_` (`afb82ff3`)

Both merge into `origin/main` with no conflicts. All 24 corpus rows at their pinned commits
(`leaderboard/corpus.json`, sha256 `dc723f53…`), scored from source with the calibrated default
`witan-rubric-v17-2026-07-24`, `generatedAt` fixed, one machine.

## Changes in the candidate arm that can move a v17 score

1. `test`-script content check (already on main) — direction down.
2. A1 authenticated-absence credits (already on main) — direction up.
3. Pull-request-template directory form (already on main) — direction up.
4. #308 observability-depth pattern widening — direction up, not rubric-gated.
5. #308 `prod_readiness_primitives` error-middleware content check — direction up, not rubric-gated.

Not capable of moving a v17 score, and predicted to move nothing: #308's health/readiness route
widening (gated on `useV20ExplicitGaps`, feeds an info-severity finding only) and all of #309
(presentational, plus a `too_large` disclosure split gated to prospective v23).

## Expected values

Derived from the checkouts and the shipped patterns before running the comparison.

- **Change 1 — 3 rows, all down.** django (`grunt test --verbose`), vite (`pnpm test-unit && …`)
  and the private alfred row are the only corpus rows whose `test` script names no runner the
  content check recognises. django: `B3.ci_script_depth` 3 → 2, B3 3.6 → 3.1, process trust
  3.8 → 3.6, overall 3.2 → 3.1. vite and alfred: `ci_script_depth` 5 → 4 with no score change
  (the metric saturates).
- **Change 2 — 0 rows.** carddemo is the only row on A1's authenticated-absence path and has no
  `package.json`.
- **Change 3 — 0 rows.** No corpus checkout contains a `.github/PULL_REQUEST_TEMPLATE/` directory.
- **Change 4 — 2 rows, both up.** A3 is `not_applicable` on 17 of 24 rows, leaving react, vue,
  vite, axios, scorecard, alfred and cejel as the only rows that can move on any A3 signal. Of
  those, the widened pattern selects a file the old one did not on **react and alfred only**:
  `A3.observability_depth` react 68 → 108 and alfred 64 → 73, with no criterion score or status
  change on either. vue's only candidate file matches `requestIdleCallback`, which the shipped
  word-bounded `\b(?:correlation|request|trace)[-_]?id\b` rejects; axios's three candidates
  already matched existing terms and two are test files the implementation-file filter excludes;
  vite, scorecard and cejel contain none. svelte contains two matching files but its A3 is
  `not_applicable`.
- **Change 5 — 0 rows.** No file in any of the seven A3-applicable rows matches the four-argument
  `(err, req, res, next)` pattern. Checked against the checkouts, not assumed.
- **#309 — 0 rows.**

## Predicted result, stated as a falsifiable whole

**4 distinct rows move: django, vite, react, alfred. 20 of 24 reports byte-identical. Exactly one
headline changes (django 3.2 → 3.1 overall, 3.8 → 3.6 process). No verdict changes. No board
placement changes. No coverage figure changes. Movement is confined to `B3.ci_script_depth`
(3 rows, down) and `A3.observability_depth` (2 rows, up), with alfred appearing in both.**

The four pinned shapes in `src/witan/__tests__/v17-scoring-surface-golden.test.ts` are predicted
to stay 4/4 green: none of them exercises an A3 signal.

If the measured result differs from the above in any row, the difference is reported as written
and nothing is adjusted to close the gap — not a score, not a fixture, not a threshold.
