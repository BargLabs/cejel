# Cejel rubric changelog

Every change to how Cejel scores a repository is recorded here, with a full before/after
delta across the published corpus — score, verdict, and rank for every repository,
"no repository moved" stated explicitly when that is the result. A rubric version bump
that ships without an entry here is a bug, not a release: see the rubric-rescore-protocol
regression guard in the source monorepo's test suite, which fails the build if
`WITAN_RUBRIC_VERSION` changes without a matching entry below.

This changelog exists because a public leaderboard that can silently re-score another
repository is not a standard, it is a rumor with a number attached — see this repository's
README, "The public leaderboard: what we redact, what we exclude, and where we were wrong"
section, which this changelog continues.

## witan-rubric-v3-2026-07-13

**What changed.** The leaderboard no longer has a privileged scoring route for internal
rows. The public CLI, batch scanner, and board generator now call one sealed public scorer;
the required board guard re-scores **every** corpus row through that function and compares
score, criterion status, verdict, measured coverage, and the complete evidence-pointer set
with the published report. This is a structural equivalence check, not a blacklist of known
collector names: adding any differently named board-only input changes the claims and makes
the required check RED.

Every external corpus entry now pins a 40-character source commit. Re-scoring at the same
pins is a rubric change and publishes the delta below. Moving a pin is a separate corpus
change that must be declared as such; upstream default-branch movement can no longer masquerade
as a rubric effect. Alfred and Cejel are likewise reproduced from the exact local commit
recorded in their published reports.

The repository scanner also states its B1/B5 behavior precisely: it evaluates neither
dimension for any repository, including Alfred. Both are always `not_applicable` for this
input type. They remain part of the wider rubric for
structured substrate evidence, and the board excludes them fail-closed if it encounters a
legacy or separately produced structured report.

**Why.** The previous board generator could append private, internal-only collectors after
the public scan. A collector-name blacklist asserted that known private inputs were absent,
but could not prove the published row was obtainable from the public product. Removing that
second path exposes the honest Alfred result: Code trust falls from **2.5 to 2.4**, driven by
A5 falling from **2.9 to 2.4**. The headline remains 3.1 because process evidence moves from
3.6 to 3.7 when B1/B5 stop contributing internal-only scores. The lower Code number is the
point of this release, not an artifact to explain away.

**Corpus-wide v2→v3 delta (all 17 repositories, same pinned source snapshots):**

| Repository | Overall | Code trust | Process trust | A5 | Verdict | Rank |
|---|---:|---:|---:|---:|---|---:|
| react | 3.2 → 3.2 | 2.5 → 2.5 | 3.9 → 3.9 | 2.2 → 2.2 | Conditional → Conditional | 4 → 4 |
| vue | 2.9 → 2.9 | 2.4 → 2.4 | 3.4 → 3.4 | 2.2 → 2.2 | Conditional → Conditional | 11 → 11 |
| svelte | 3.1 → 3.1 | 2.9 → 2.9 | 3.3 → 3.3 | 2.2 → 2.2 | Conditional → Conditional | 6 → 6 |
| django | 3.2 → 3.2 | 2.6 → 2.6 | 3.8 → 3.8 | 0.0 → 0.0 | Conditional → Conditional | unranked → unranked |
| flask | 2.8 → 2.8 | 2.5 → 2.5 | 3.0 → 3.0 | 2.2 → 2.2 | Conditional → Conditional | 14 → 14 |
| fastapi | 2.9 → 2.9 | 2.5 → 2.5 | 3.2 → 3.2 | 2.0 → 2.0 | Conditional → Conditional | 13 → 13 |
| express | 2.8 → 2.8 | 2.6 → 2.6 | 3.0 → 3.0 | 2.0 → 2.0 | Conditional → Conditional | 12 → 12 |
| vite | 3.3 → 3.3 | 2.6 → 2.6 | 4.0 → 4.0 | 2.7 → 2.7 | Conditional → Conditional | 2 → 2 |
| esbuild | 2.6 → 2.6 | 2.7 → 2.7 | 2.4 → 2.4 | 2.4 → 2.4 | Conditional → Conditional | 15 → 15 |
| biomejs | 2.9 → 2.9 | 2.8 → 2.8 | 3.0 → 3.0 | 2.0 → 2.0 | Conditional → Conditional | 8 → 8 |
| requests | 2.9 → 2.9 | 2.4 → 2.4 | 3.4 → 3.4 | 2.2 → 2.2 | Conditional → Conditional | 9 → 9 |
| pydantic | 3.2 → 3.2 | 2.9 → 2.9 | 3.5 → 3.5 | 2.4 → 2.4 | Conditional → Conditional | 3 → 3 |
| axios | 3.3 → 3.3 | 2.6 → 2.6 | 3.9 → 3.9 | 2.4 → 2.4 | Conditional → Conditional | 1 → 1 |
| zod | 3.0 → 3.0 | 2.8 → 2.8 | 3.2 → 3.2 | 2.2 → 2.2 | Conditional → Conditional | 7 → 7 |
| scorecard | 3.0 → 3.0 | 2.3 → 2.3 | 3.6 → 3.6 | 2.6 → 2.6 | Conditional → Conditional | 10 → 10 |
| alfred (private) | 3.1 → 3.1 | **2.5 → 2.4** | 3.6 → 3.7 | **2.9 → 2.4** | Conditional → Conditional | 5 → 5 |
| cejel (private) | 3.4 → 3.4 | 2.7 → 2.7 | 4.0 → 4.0 | 2.2 → 2.2 | Conditional → Conditional | unranked → unranked |

**No external repository's score, verdict, evidence-derived rank, or A5 result moved.**
The only score changes are Alfred's disclosed correction above. The corpus pins are the
source commits already recorded by the v2 reports, so this table isolates the rubric/public-
path change from upstream repository movement.

**Separate corpus act composed in the same release (17 → 22 repositories).** The language-
calibration work adds one pinned, healthy repository in each of five ecosystems. These rows
did not exist in the v2 corpus, so `new` is the honest before-state; their low results expose
documented B3 CI-depth and Maven A4 calibration gaps rather than being hidden or normalized.

| Repository | Overall | Code trust | Process trust | A5 | Verdict | Rank |
|---|---:|---:|---:|---:|---|---:|
| ripgrep | new → 2.2 | new → 2.4 | new → 2.0 | new → 2.2 | new → At risk | new → 16 |
| guava | new → 1.9 | new → 1.5 | new → 2.2 | new → 2.2 | new → At risk | new → unranked |
| cobra | new → 2.6 | new → 2.8 | new → 2.3 | new → 0.0 | new → Conditional | new → unranked |
| sinatra | new → 2.4 | new → 2.0 | new → 2.8 | new → 2.2 | new → At risk | new → unranked |
| automapper | new → 1.9 | new → 1.5 | new → 2.3 | new → 1.4 | new → At risk | new → unranked |

**Further corpus-only addition (22 → 23 repositories, 2026-07-15, #488).** One dedicated
C++ reference row, the same "widen ecosystem coverage" act as the five rows above, composed
later in the same v3 release rather than in the original batch. No rubric behavior changed;
`new` is the honest before-state for this row alone.

| Repository | Overall | Code trust | Process trust | A5 | Verdict | Rank |
|---|---:|---:|---:|---:|---|---:|
| fmt | new → 2.7 | new → 2.2 | new → 3.2 | new → 2.2 | new → Conditional | new → 15 |

**No repository's score, verdict, or A5 result moved. Two ranks did**, mechanically and only
because a new row sorted above them: **esbuild 15 → 16, ripgrep 16 → 17.** A rank is a position
in a list, not a property of a repository — adding a row necessarily moves the rows beneath it.
Nothing was re-scored to produce that shift.

**Archetype classification: dominance, not presence (2026-07-15).** A behavior change, published
here because it changes which repositories Cejel is willing to score at all. `classifyRepoArchetype`
previously short-circuited to `source` when **any** recognised-extension file existed
(`sourceFileCount > 0`). One recognised file in a thousand was enough. The rule is now a ratio:
recognised source must reach `SOURCE_DOMINANCE_RATIO_THRESHOLD` (0.2) of tracked files, or the
repository is `unrecognised_ecosystem` and gets no score, no rank, and no verdict.

**Why.** The previous rule was correct at the ratios it was tested at and catastrophic below them.
A 99%-COBOL mainframe repository carrying nine incidental `.sh` deploy scripts — 2.7% of its
tracked files, 3.6% of its source-shaped ones — classified as `source`, was scored on those nine
files, and drew a confident **0.0 / Unverified** on a healthy codebase. Every real legacy
repository has a deploy script, so the abstention path was unreachable for essentially all of them
while every test passed. The threshold was calibrated against a ratio golden set — eight cases
spanning the ratio space, each with an expected outcome recorded and committed **before** the
threshold number was chosen — and the choice is insensitive within a wide band: 15%, 20% or 25%
all abstain this repository and all preserve a 50/50 mixed-language tree as `source`. The number
was not reverse-engineered from the repository that exposed the bug.

**No existing corpus row changed archetype, score, verdict, or rank.** Every scored repository's
recognised source is dominant by a wide margin; the 0.2 threshold is nowhere near any of them. The
change is visible only in what Cejel now declines to score.

**Corpus addition composed with it (23 → 24 repositories).** The first repository on this board
that Cejel refuses to rate. It is published, not omitted.

| Repository | Overall | Code trust | Process trust | A5 | Verdict | Rank |
|---|---:|---:|---:|---:|---|---:|
| carddemo | new → unrated | new → unrated | new → unrated | new → unrated | new → Insufficient source | new → unranked |

`unrated` is the honest before/after state: there is no score to report, and a `0.0` here would be
a claim about AWS's COBOL that we have not earned. The row's published reason names the extensions
found (`.cpy`, `.jcl`, `.cbl`, `.bms`, `.ps`, `.ctl`) and the measured ratio (9 of 329 tracked
files, 2.7%) rather than a bare verdict.

## Board presentation correction — 2026-07-12

No rubric version changed and no repository was re-scored. The board's public
"Overall" column now prints the same own-certificate overall score shown in each
repository's certificate/report, instead of a comparative-ranking-only value with the
same label. Four repositories' displayed headline numbers moved by 0.1; the underlying
reports, verdicts, and ranking basis did not change.

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
metrics replacing v0's presence/absence scoring) — see this package's `src/witan/scoring.ts`'s
`usesMetricScoring` and the golden-set calibration work done in the source monorepo at the
time. No corpus-wide delta was recorded for this version; the leaderboard did not yet exist
at the time of this bump.
