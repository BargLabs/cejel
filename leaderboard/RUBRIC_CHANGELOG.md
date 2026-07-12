# Cejel rubric changelog

Every change to how Cejel scores a repository is recorded here, with a full before/after
delta across the published corpus — score, verdict, and rank for every repository,
"no repository moved" stated explicitly when that is the result. A rubric version bump
that ships without an entry here is a bug, not a release: see Guard 1 in
`packages/witan/src/__tests__/rubric-rescore-protocol.test.ts`, which fails the build if
`WITAN_RUBRIC_VERSION` changes without a matching entry below.

This changelog exists because a public leaderboard that can silently re-score another
repository is not a standard, it is a rumor with a number attached — see
`packages/witan-cli/README.md`'s "where we were wrong" section, which this changelog
continues.

## witan-rubric-v2-2026-07-12

**What changed.** A1's scheduled-product-health-workflow sub-signal — previously a literal
check for the filename of this repository's own internal QA workflow (a private-repo path,
withheld here per the redaction policy below) — is now detected by **shape**: a CI workflow
with a `schedule:`/`cron:` trigger that runs the verification suite. Our own internal nightly
QA workflow is one recognized instance of that shape, not its definition; a differently-named
nightly workflow with the same shape is detected identically, and a workflow merely sharing
the same filename without the shape (no schedule trigger, no test-run command) is no longer
flagged at all.

A workflow matching the shape is then classified on whether its results are durably
published (a public pages deploy, a commit back to the repo, a PR/issue comment) or handed
only to an ephemeral, access-gated CI artifact (`actions/upload-artifact` with no other
publish step). Only the latter earns a warning; a repository with no scheduled health
workflow is `not_applicable` (nothing to rate), and a repository whose workflow's
publication status cannot be determined from a static file-tree read is `insufficient_data`
— never a warning.

**Why.** The public OSS rubric hardcoding our own internal agent's filename as a detector
constant was a home-field bias: inert for every external repository by construction, and a
free shot to hand a critic in week one (see `cejel-process-rubric-homefield-bias` in
project memory). Generalizing it to the concept it actually measures is the fix; this
changelog — and the Guard 1 regression test that enforces it going forward — is what makes
future rubric edits on a public board a public, versioned, delta-reported act instead of a
silent re-score of someone else's reputation.

**Corpus-wide before/after delta (all 17 repositories, regenerated 2026-07-12 in
goal_cejel_generalize_homefield_rule_and_rescore_protocol_2026-07-12):**

| Repository | Overall before | Overall after | Verdict before | Verdict after | Rank change | A1 finding |
|---|---|---|---|---|---|---|
| react | 3.2 | 3.2 | Conditional | Conditional | none | Same score/status (2.3 warning); the pre-existing synthetic "no single finding drove this" placeholder is replaced by a real, specific finding — react's `.github/workflows/devtools_regression_tests.yml` (schedule-triggered, `actions/upload-artifact`-only) is now the named cause. |
| vue | 2.9 | 2.9 | Conditional | Conditional | none | unchanged |
| svelte | 3.1 | 3.1 | Conditional | Conditional | none | unchanged |
| django | 3.2 | 3.2 | Conditional | Conditional | none | unchanged |
| flask | 2.8 | 2.8 | Conditional | Conditional | none | unchanged |
| fastapi | 2.9 | 2.9 | Conditional | Conditional | none | unchanged |
| express | 2.8 | 2.8 | Conditional | Conditional | none | unchanged |
| vite | 3.3 | 3.3 | Conditional | Conditional | none | unchanged |
| esbuild | 2.6 | 2.6 | Conditional | Conditional | none | unchanged |
| biomejs | 2.9 | 2.9 | Conditional | Conditional | none | unchanged |
| requests | 2.9 | 2.9 | Conditional | Conditional | none | unchanged |
| pydantic | 3.2 | 3.2 | Conditional | Conditional | none | unchanged |
| axios | 3.3 | 3.3 | Conditional | Conditional | none | unchanged |
| zod | 3.0 | 3.0 | Conditional | Conditional | none | unchanged |
| scorecard | 3.0 | 3.0 | Conditional | Conditional | none | unchanged |
| alfred (private) | 3.1 | 3.1 | Conditional | Conditional | none | Same warning, now worded generically: "results are handed only to an ephemeral, access-gated CI artifact" instead of naming Bede by product. A1's sub-score moved 2.2 -> 2.3 from ordinary repo growth between the two scan commits (more test files at HEAD), not from the rubric change — see A1's `test_to_source_ratio`/`non_hollow_test_share` metric inputs in the evidence report. |
| cejel (private) | 3.4 | 3.4 | Conditional | Conditional | none | unchanged |

**No external repository's score, verdict, or rank moved.** One external repository
(react) gained a more specific, correct finding for an already-existing warning at an
unchanged score and status — not a new penalty. No repository gained a new warning or
critical finding it did not already have. Alfred (internal) kept its own honest warning
(Guard 4), reworded to the generalized concept.

## witan-rubric-v1-2026-06-24

Predates this changelog. Introduced metric-based scoring (continuous, weighted per-criterion
metrics replacing v0's presence/absence scoring) — see `packages/witan/src/scoring.ts`'s
`usesMetricScoring` and the golden-set calibration work in
`docs/orchestration/goal_witan_v1_real_discrimination_then_default_2026_06_25.md`. No
corpus-wide delta was recorded for this version; the leaderboard did not yet exist at the
time of this bump.
