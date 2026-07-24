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

## witan-rubric-v9-2026-07-22

**What changed.** V9 is the failure-derived remediation from the immutable free-core v32
NO-GO. A1 now requires the same configured-runner premise its no-coverage proposition claims,
and it never infers a missing-test finding from a coverage artifact alone. Scheduled-health
recognition covers common non-npm test commands, while claim packets carry a bounded excerpt for
each conjunct from the finding's own file. A2 excludes generated, vendored, test, fixture, and
example paths from current and historical production-secret claims; qualified environment
templates such as `.env.production.example` are templates; and non-secret environment-file
hygiene remains visible without forcing the whole criterion into warning.

Headline scoring now requires at least 80% of source-shaped files to belong to a published Cejel
source family when a competing unread language exists. Native web component/template formats and
non-source translations, certificates, snapshots, and data artifacts are classified explicitly so
the stricter boundary does not turn mature public projects into false abstentions. Blind abstention
packets sample authored production source across extension families and start excerpts at
substantive code rather than repeated license headers. Criterion states use evidence-derived
materiality floors for non-hollow tests, production readiness, PR outcomes, CI depth, audit depth,
dependency sanity, and explicit human/fail-closed privilege gates.

**Why.** The sealed v32 result passed recall but failed precision, FPR, criterion state-exactness,
and inappropriate-scoring gates. All 17 false positives for `CORE-A1-NO-COVERAGE-CONFIG` had zero
configured runner surfaces, while all 25 supported candidates had at least one. Five of six
committed-secret candidates were generated or fixture evidence. The criterion errors clustered at
repeatable materiality boundaries, and 16 repositories were scored when the blind packet did not
materially represent their source—principally because excerpts stopped in license headers or an
unread source family was substantial. These corrections are prospective; they do not reinterpret
v32 or claim calibration GO. V33 still requires fresh seeds, a fresh untouched cohort, blind
review, sealing, and the frozen GO estimator.

All 24 pinned corpus rows rescored with zero scan errors. No verdict band or rank changed.
CardDemo remains scoreless `insufficient_source`. React, Flask, Express, Vite, and Alfred gain small
score corrections from the evidence/state changes; every other headline score is unchanged.

**Full v8 to v9 delta (all 24 rows):**

| Repository | Overall | Code trust | Process trust | Verdict | Rank |
|---|---:|---:|---:|---|---:|
| react | 3.1 to 3.2 | 2.3 to 2.5 | 3.9 to 3.9 | Conditional to Conditional | 5 to 5 |
| vue | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | 11 to 11 |
| svelte | 3.1 to 3.1 | 2.9 to 2.9 | 3.3 to 3.3 | Conditional to Conditional | 6 to 6 |
| django | 3.2 to 3.2 | 2.6 to 2.6 | 3.8 to 3.8 | Conditional to Conditional | unranked to unranked |
| flask | 2.8 to 2.9 | 2.5 to 2.7 | 3.0 to 3.0 | Conditional to Conditional | 13 to 13 |
| fastapi | 3.1 to 3.1 | 3.0 to 3.0 | 3.2 to 3.2 | Conditional to Conditional | unranked to unranked |
| express | 2.9 to 3.0 | 2.8 to 2.8 | 3.0 to 3.2 | Conditional to Conditional | unranked to unranked |
| vite | 3.3 to 3.4 | 2.6 to 2.8 | 4.0 to 4.0 | Conditional to Conditional | 1 to 1 |
| esbuild | 2.5 to 2.5 | 2.6 to 2.6 | 2.4 to 2.4 | Conditional to Conditional | 15 to 15 |
| biomejs | 3.0 to 3.0 | 2.9 to 2.9 | 3.0 to 3.0 | Conditional to Conditional | 8 to 8 |
| requests | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | 9 to 9 |
| pydantic | 3.2 to 3.2 | 2.9 to 2.9 | 3.5 to 3.5 | Conditional to Conditional | 4 to 4 |
| axios | 3.3 to 3.3 | 2.6 to 2.6 | 3.9 to 3.9 | Conditional to Conditional | 3 to 3 |
| zod | 3.2 to 3.2 | 3.1 to 3.1 | 3.2 to 3.2 | Conditional to Conditional | 7 to 7 |
| scorecard | 2.9 to 2.9 | 2.2 to 2.2 | 3.6 to 3.6 | Conditional to Conditional | 10 to 10 |
| ripgrep | 2.1 to 2.1 | 2.1 to 2.1 | 2.0 to 2.0 | At risk to At risk | 16 to 16 |
| guava | 1.9 to 1.9 | 1.5 to 1.5 | 2.2 to 2.2 | At risk to At risk | unranked to unranked |
| cobra | 2.5 to 2.5 | 2.6 to 2.6 | 2.3 to 2.3 | Conditional to Conditional | unranked to unranked |
| sinatra | 2.4 to 2.4 | 2.0 to 2.0 | 2.8 to 2.8 | At risk to At risk | unranked to unranked |
| automapper | 2.2 to 2.2 | 2.0 to 2.0 | 2.3 to 2.3 | At risk to At risk | unranked to unranked |
| fmt | 2.6 to 2.6 | 2.0 to 2.0 | 3.2 to 3.2 | Conditional to Conditional | 14 to 14 |
| carddemo | scoreless to scoreless | scoreless to scoreless | scoreless to scoreless | Insufficient source to Insufficient source | insufficient to insufficient |
| alfred | 3.2 to 3.2 | 2.4 to 2.4 | 3.9 to 4.0 | Conditional to Conditional | 2 to 2 |
| cejel | 2.8 to 2.8 | 2.3 to 2.3 | 3.2 to 3.2 | Conditional to Conditional | 12 to 12 |

## witan-rubric-v8-2026-07-21

**What changed.** V8 activates the failure-derived detector and evidence-boundary corrections
staged after the immutable free-core v26 NO-GO. A1 recognizes lean tests in nested workspaces while
excluding generated, vendored, fixture, and example manifests from the production toolchain. A2
reports current and historical credential evidence independently, including a current-tree hygiene
warning for a committed non-template `.env` without a confirmed secret. A3 evaluates each multi-stage
Dockerfile's effective final stage, recognizes bounded Rack services, and requires a runtime command
rather than a generic entrypoint name. A4 applies app-runtime expectations only to strongly evidenced
packaged Electron/Tauri software. A5 accepts only content-authenticated reconciliation artifacts and
rejects generated-source claims. The same authored-production boundary governs the V8 control and
applicability premises used by blind calibration packets.

**Why.** Free-core v26 failed because decisive controls and criterion labels showed that the prior
detectors conflated workspace metadata with production evidence, collapsed current and historical
credential states, treated container build stages as deployed services, under-modeled packaged apps,
and accepted generic reconciliation filenames without authenticating their content. V8 corrects
those observed failure families before any v27 cohort is selected or scanned. It does not reinterpret
v26, weaken any GO gate, or claim calibration GO.

All 24 pinned corpus rows rescored with zero scan errors. No verdict band changed, and CardDemo
remains scoreless `insufficient_source`. FastAPI gains corrected A1 evidence but becomes unranked
because A5 now abstains instead of scoring an unauthenticated claim artifact, leaving only five of
eleven dimensions measured. The remaining rank movement follows the score corrections, FastAPI
leaving the ranked table, and Alfred's refreshed private transparency snapshot. That Alfred
snapshot advances from `b608b99` to the main-reachable V8 activation commit `fecc4d3`; its source
remains explicitly non-public. The published row was corrected from the activation branch's
pre-squash source commit to that merge commit. The table below therefore reports V7 directly to
the current V8 board. Alfred's headline Overall (3.2), Code trust (2.4), Process trust (3.9), and
verdict are unchanged by the correction; its common-dimension ranked score rises from 3.1 to 3.2
and B2 rises from 3.5 to 3.7 as the recent-PR merge ratio moves from 5/12 to 8/12 at the reachable
merge snapshot.

**Full v7 to v8 delta (all 24 rows):**

| Repository | Overall | Code trust | Process trust | Verdict | Rank |
|---|---:|---:|---:|---|---:|
| react | 3.2 to 3.1 | 2.4 to 2.3 | 3.9 to 3.9 | Conditional to Conditional | 4 to 5 |
| vue | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | 12 to 11 |
| svelte | 3.1 to 3.1 | 2.9 to 2.9 | 3.3 to 3.3 | Conditional to Conditional | 6 to 6 |
| django | 3.2 to 3.2 | 2.6 to 2.6 | 3.8 to 3.8 | Conditional to Conditional | unranked to unranked |
| flask | 2.8 to 2.8 | 2.6 to 2.5 | 3.0 to 3.0 | Conditional to Conditional | 14 to 13 |
| fastapi | 2.9 to 3.1 | 2.6 to 3.0 | 3.2 to 3.2 | Conditional to Conditional | 9 to unranked |
| express | 2.9 to 2.9 | 2.8 to 2.8 | 3.0 to 3.0 | Conditional to Conditional | unranked to unranked |
| vite | 3.3 to 3.3 | 2.6 to 2.6 | 4.0 to 4.0 | Conditional to Conditional | 2 to 1 |
| esbuild | 2.5 to 2.5 | 2.6 to 2.6 | 2.4 to 2.4 | Conditional to Conditional | 16 to 15 |
| biomejs | 3.0 to 3.0 | 2.9 to 2.9 | 3.0 to 3.0 | Conditional to Conditional | 8 to 8 |
| requests | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | 10 to 9 |
| pydantic | 3.2 to 3.2 | 2.9 to 2.9 | 3.5 to 3.5 | Conditional to Conditional | 3 to 4 |
| axios | 3.3 to 3.3 | 2.6 to 2.6 | 3.9 to 3.9 | Conditional to Conditional | 1 to 3 |
| zod | 3.2 to 3.2 | 3.1 to 3.1 | 3.2 to 3.2 | Conditional to Conditional | 7 to 7 |
| scorecard | 2.9 to 2.9 | 2.2 to 2.2 | 3.6 to 3.6 | Conditional to Conditional | 11 to 10 |
| ripgrep | 2.1 to 2.1 | 2.1 to 2.1 | 2.0 to 2.0 | At risk to At risk | 17 to 16 |
| guava | 1.9 to 1.9 | 1.5 to 1.5 | 2.2 to 2.2 | At risk to At risk | unranked to unranked |
| cobra | 2.5 to 2.5 | 2.6 to 2.6 | 2.3 to 2.3 | Conditional to Conditional | unranked to unranked |
| sinatra | 2.4 to 2.4 | 2.0 to 2.0 | 2.8 to 2.8 | At risk to At risk | unranked to unranked |
| automapper | 2.2 to 2.2 | 2.0 to 2.0 | 2.3 to 2.3 | At risk to At risk | unranked to unranked |
| fmt | 2.7 to 2.6 | 2.1 to 2.0 | 3.2 to 3.2 | Conditional to Conditional | 15 to 14 |
| carddemo | scoreless to scoreless | scoreless to scoreless | scoreless to scoreless | Insufficient source to Insufficient source | insufficient to insufficient |
| alfred | 3.1 to 3.2 | 2.3 to 2.4 | 3.9 to 3.9 | Conditional to Conditional | 5 to 2 |
| cejel | 2.8 to 2.8 | 2.3 to 2.3 | 3.2 to 3.2 | Conditional to Conditional | 13 to 12 |

## witan-rubric-v7-2026-07-21

**What changed.** V7 is the failure-derived free-core v26 implementation. Secret findings now
point to the exact matched line and expose only redacted value shape. Finding and control packets
for no-tests, no-coverage, no-CI/release-deploy, and no-lockfile propositions carry the same exact
tracked-inventory proof and applicability premises. Criterion packets publish unweighted raw
metric facts plus frozen label definitions without exposing scores, states, score thresholds, or
weights.

Repository evidence discovery also changes. Coverage files must contain coverage configuration;
Makefiles and CMake files must contain actual test targets before counting as runner configuration;
recognized source files under ecosystem-specific test directories count as tests. Nested deploy
targets count only outside tests, fixtures, examples, samples, and demos; a Dockerfile remains a
container-build signal, not release automation. B6 excludes test/fixture SQL rather than emitting a
logging-only finding, and A5 limits claims to root/product documentation or dedicated
claim-reconciliation artifacts. Cohesive Fortran, CUDA/HIP, and web-template/style trees are
recognized at explicitly unmodeled depth, while prospectively frozen size/ratio/remainder rules
abstain from generated/vendor-dominated and independent solution-catalog trees. CardDemo remains
scoreless and `insufficient_source`.

**Why.** Free-core v25 closed NO-GO. Its decisive error families and packet missingness showed that
reviewers could not verify absence propositions from positive excerpts, criterion labels lacked
the measured denominators, secret evidence could point at the wrong line, test and fixture paths
crossed production applicability boundaries, and structural source eligibility was incomplete.
These are detector and review-protocol corrections, not a retroactive v25 reinterpretation. Both
v25 waves are excluded from the future v26 cohort; v25 Wave 2 remains unreviewed and unlabeled.

All 24 sealed corpus rows rescored with zero scan errors. No verdict band changed. CardDemo remains
scoreless and unranked. Express becomes unranked because the corrected A5 scope removes an
unsupported measured dimension, leaving five of eleven dimensions measured; this is a coverage
classification change, not a score penalty. The other rank changes below follow the published
score/evidence corrections and Express leaving the ranked table. The Alfred transparency row also
advances from self snapshot `707b7b5` to the reachable v7 implementation snapshot `b608b99`.

**Full v6 to v7 delta (all 24 rows):**

| Repository | Overall | Code trust | Process trust | Verdict | Rank |
|---|---:|---:|---:|---|---:|
| react | 3.2 to 3.2 | 2.5 to 2.4 | 3.9 to 3.9 | Conditional to Conditional | 4 to 4 |
| vue | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | 11 to 12 |
| svelte | 3.1 to 3.1 | 2.9 to 2.9 | 3.3 to 3.3 | Conditional to Conditional | 5 to 6 |
| django | 3.2 to 3.2 | 2.6 to 2.6 | 3.8 to 3.8 | Conditional to Conditional | unranked to unranked |
| flask | 2.8 to 2.8 | 2.5 to 2.6 | 3.0 to 3.0 | Conditional to Conditional | 15 to 14 |
| fastapi | 2.9 to 2.9 | 2.5 to 2.6 | 3.2 to 3.2 | Conditional to Conditional | 14 to 9 |
| express | 2.8 to 2.9 | 2.6 to 2.8 | 3.0 to 3.0 | Conditional to Conditional | 13 to unranked |
| vite | 3.3 to 3.3 | 2.6 to 2.6 | 4.0 to 4.0 | Conditional to Conditional | 2 to 2 |
| esbuild | 2.6 to 2.5 | 2.7 to 2.6 | 2.4 to 2.4 | Conditional to Conditional | 17 to 16 |
| biomejs | 2.9 to 3.0 | 2.8 to 2.9 | 3.0 to 3.0 | Conditional to Conditional | 8 to 8 |
| requests | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | 9 to 10 |
| pydantic | 3.2 to 3.2 | 2.9 to 2.9 | 3.5 to 3.5 | Conditional to Conditional | 3 to 3 |
| axios | 3.3 to 3.3 | 2.6 to 2.6 | 3.9 to 3.9 | Conditional to Conditional | 1 to 1 |
| zod | 3.0 to 3.2 | 2.8 to 3.1 | 3.2 to 3.2 | Conditional to Conditional | 7 to 7 |
| scorecard | 3.0 to 2.9 | 2.3 to 2.2 | 3.6 to 3.6 | Conditional to Conditional | 10 to 11 |
| ripgrep | 2.2 to 2.1 | 2.4 to 2.1 | 2.0 to 2.0 | At risk to At risk | 18 to 17 |
| guava | 1.9 to 1.9 | 1.5 to 1.5 | 2.2 to 2.2 | At risk to At risk | unranked to unranked |
| cobra | 2.6 to 2.5 | 2.8 to 2.6 | 2.3 to 2.3 | Conditional to Conditional | unranked to unranked |
| sinatra | 2.4 to 2.4 | 2.0 to 2.0 | 2.8 to 2.8 | At risk to At risk | unranked to unranked |
| automapper | 1.9 to 2.2 | 1.5 to 2.0 | 2.3 to 2.3 | At risk to At risk | unranked to unranked |
| fmt | 2.7 to 2.7 | 2.2 to 2.1 | 3.2 to 3.2 | Conditional to Conditional | 16 to 15 |
| carddemo | scoreless to scoreless | scoreless to scoreless | scoreless to scoreless | Insufficient source to Insufficient source | insufficient to insufficient |
| alfred | 3.0 to 3.1 | 2.2 to 2.3 | 3.8 to 3.9 | Conditional to Conditional | 6 to 5 |
| cejel | 2.8 to 2.8 | 2.3 to 2.3 | 3.2 to 3.2 | Conditional to Conditional | 12 to 13 |

## witan-rubric-v6-2026-07-21

**What changed.** Cejel now recognizes AVA's root-level `test.js` and `test-*.js`
conventions as concrete JavaScript test files. Version 0.1.7 recognized AVA as a configured
runner but missed those filenames, producing a false missing-tests finding on
`sindresorhus/slugify` even though its root `test.js` was present.

**Why.** This was a detection gap in Cejel, not evidence about the repository. The correction
adds the convention to both A1 test-file discovery and the non-hollow-test classifier, with a
regression fixture that reproduces the real repository shape. The fix does not execute tests
or broaden the scanner beyond tracked source evidence.

No externally pinned corpus score, verdict, or rank moved. None of the 22 external pinned
entries uses the newly recognized filename shape as previously missing evidence, and the two
rubric-protocol golden fixtures are unchanged. The Alfred transparency row advanced from the
previous self snapshot to implementation commit `707b7b5`: unrelated intervening source changes
move its Overall **3.1 to 3.0**, Code trust **2.4 to 2.2**, and rank **5 to 6**. Svelte moves rank
**6 to 5** only because Alfred moves below it; Svelte's score and evidence are unchanged. The
public Cejel row remains pinned to the same public commit and is unchanged.

**Full v5 to v6 delta (all 24 rows):**

| Repository | Overall | Code trust | Process trust | A1 | Verdict | Rank |
|---|---:|---:|---:|---:|---|---:|
| react | 3.2 to 3.2 | 2.5 to 2.5 | 3.9 to 3.9 | 2.3 to 2.3 | Conditional to Conditional | 4 to 4 |
| vue | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | 2.5 to 2.5 | Conditional to Conditional | 11 to 11 |
| svelte | 3.1 to 3.1 | 2.9 to 2.9 | 3.3 to 3.3 | 2.6 to 2.6 | Conditional to Conditional | 6 to 5 |
| django | 3.2 to 3.2 | 2.6 to 2.6 | 3.8 to 3.8 | 2.8 to 2.8 | Conditional to Conditional | unranked to unranked |
| flask | 2.8 to 2.8 | 2.5 to 2.5 | 3.0 to 3.0 | 2.3 to 2.3 | Conditional to Conditional | 15 to 15 |
| fastapi | 2.9 to 2.9 | 2.5 to 2.5 | 3.2 to 3.2 | 2.0 to 2.0 | Conditional to Conditional | 14 to 14 |
| express | 2.8 to 2.8 | 2.6 to 2.6 | 3.0 to 3.0 | 2.3 to 2.3 | Conditional to Conditional | 13 to 13 |
| vite | 3.3 to 3.3 | 2.6 to 2.6 | 4.0 to 4.0 | 2.5 to 2.5 | Conditional to Conditional | 2 to 2 |
| esbuild | 2.6 to 2.6 | 2.7 to 2.7 | 2.4 to 2.4 | 2.5 to 2.5 | Conditional to Conditional | 17 to 17 |
| biomejs | 2.9 to 2.9 | 2.8 to 2.8 | 3.0 to 3.0 | 2.7 to 2.7 | Conditional to Conditional | 8 to 8 |
| requests | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | 2.5 to 2.5 | Conditional to Conditional | 9 to 9 |
| pydantic | 3.2 to 3.2 | 2.9 to 2.9 | 3.5 to 3.5 | 2.8 to 2.8 | Conditional to Conditional | 3 to 3 |
| axios | 3.3 to 3.3 | 2.6 to 2.6 | 3.9 to 3.9 | 2.8 to 2.8 | Conditional to Conditional | 1 to 1 |
| zod | 3.0 to 3.0 | 2.8 to 2.8 | 3.2 to 3.2 | 2.5 to 2.5 | Conditional to Conditional | 7 to 7 |
| scorecard | 3.0 to 3.0 | 2.3 to 2.3 | 3.6 to 3.6 | 2.4 to 2.4 | Conditional to Conditional | 10 to 10 |
| ripgrep | 2.2 to 2.2 | 2.4 to 2.4 | 2.0 to 2.0 | 1.9 to 1.9 | At risk to At risk | 18 to 18 |
| guava | 1.9 to 1.9 | 1.5 to 1.5 | 2.2 to 2.2 | 1.3 to 1.3 | At risk to At risk | unranked to unranked |
| cobra | 2.6 to 2.6 | 2.8 to 2.8 | 2.3 to 2.3 | 2.3 to 2.3 | Conditional to Conditional | unranked to unranked |
| sinatra | 2.4 to 2.4 | 2.0 to 2.0 | 2.8 to 2.8 | 1.8 to 1.8 | At risk to At risk | unranked to unranked |
| automapper | 1.9 to 1.9 | 1.5 to 1.5 | 2.3 to 2.3 | 0.3 to 0.3 | At risk to At risk | unranked to unranked |
| fmt | 2.7 to 2.7 | 2.2 to 2.2 | 3.2 to 3.2 | 2.8 to 2.8 | Conditional to Conditional | 16 to 16 |
| carddemo | scoreless to scoreless | scoreless to scoreless | scoreless to scoreless | 0.0 to 0.0 | Insufficient source to Insufficient source | insufficient to insufficient |
| alfred | **3.1 to 3.0** | **2.4 to 2.2** | 3.8 to 3.8 | 2.3 to 2.3 | Conditional to Conditional | **5 to 6** |
| cejel | 2.8 to 2.8 | 2.3 to 2.3 | 3.2 to 3.2 | 2.0 to 2.0 | Conditional to Conditional | 12 to 12 |

## witan-rubric-v5-2026-07-18

**What changed.** Git-history evidence is now read only from commits reachable from the
checked-out `HEAD`. Previous versions used `--all`, so unrelated local branches and
remote-tracking refs could alter A2 evidence, measured coverage, and the score of the same
pinned source commit. V5 binds the history scan to the immutable revision being certified.

**Why.** The required public-path reproduction job caught the same pinned Alfred/Cejel
snapshots producing different evidence in a developer worktree and a clean CI clone. The
clone's extra refs exposed a historical `.env` path that the generation environment did not
see. That was ambient clone state, not evidence for a different source snapshot. A regression
test now adds credential history on a non-HEAD branch and proves it cannot affect A2.

All 21 externally pinned rows are unchanged. Alfred's score is also unchanged, although its
complete evidence set is now reproducible. The Cejel self row gains the HEAD-ancestor history
signal that clean-clone reproduction had already exposed: A2 moves **0.0 to 3.2**, Code trust
**2.5 to 2.7**, and Overall **3.3 to 3.4**. It remains low-coverage and unranked; no ranked
position, verdict, or external score moves. The self snapshot moves from `d6248edd47f6` to
`25627e00c6eb`, the clean v5 implementation commit; external source pins do not move.

**Full v4 to v5 delta (all 24 rows):**

| Repository | Overall | Code trust | Process trust | A2 | Verdict | Rank |
|---|---:|---:|---:|---:|---|---:|
| react | 3.2 to 3.2 | 2.5 to 2.5 | 3.9 to 3.9 | 2.4 to 2.4 | Conditional to Conditional | 4 to 4 |
| vue | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | 0.0 to 0.0 | Conditional to Conditional | 11 to 11 |
| svelte | 3.1 to 3.1 | 2.9 to 2.9 | 3.3 to 3.3 | 3.6 to 3.6 | Conditional to Conditional | 5 to 5 |
| django | 3.2 to 3.2 | 2.6 to 2.6 | 3.8 to 3.8 | 2.8 to 2.8 | Conditional to Conditional | unranked to unranked |
| flask | 2.8 to 2.8 | 2.5 to 2.5 | 3.0 to 3.0 | 2.4 to 2.4 | Conditional to Conditional | 14 to 14 |
| fastapi | 2.9 to 2.9 | 2.5 to 2.5 | 3.2 to 3.2 | 0.0 to 0.0 | Conditional to Conditional | 13 to 13 |
| express | 2.8 to 2.8 | 2.6 to 2.6 | 3.0 to 3.0 | 0.0 to 0.0 | Conditional to Conditional | 12 to 12 |
| vite | 3.3 to 3.3 | 2.6 to 2.6 | 4.0 to 4.0 | 2.4 to 2.4 | Conditional to Conditional | 2 to 2 |
| esbuild | 2.6 to 2.6 | 2.7 to 2.7 | 2.4 to 2.4 | 0.0 to 0.0 | Conditional to Conditional | 16 to 16 |
| biomejs | 2.9 to 2.9 | 2.8 to 2.8 | 3.0 to 3.0 | 3.2 to 3.2 | Conditional to Conditional | 8 to 8 |
| requests | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | 0.0 to 0.0 | Conditional to Conditional | 9 to 9 |
| pydantic | 3.2 to 3.2 | 2.9 to 2.9 | 3.5 to 3.5 | 0.0 to 0.0 | Conditional to Conditional | 3 to 3 |
| axios | 3.3 to 3.3 | 2.6 to 2.6 | 3.9 to 3.9 | 3.6 to 3.6 | Conditional to Conditional | 1 to 1 |
| zod | 3.0 to 3.0 | 2.8 to 2.8 | 3.2 to 3.2 | 3.6 to 3.6 | Conditional to Conditional | 7 to 7 |
| scorecard | 3.0 to 3.0 | 2.3 to 2.3 | 3.6 to 3.6 | 0.0 to 0.0 | Conditional to Conditional | 10 to 10 |
| ripgrep | 2.2 to 2.2 | 2.4 to 2.4 | 2.0 to 2.0 | 0.0 to 0.0 | At risk to At risk | 17 to 17 |
| guava | 1.9 to 1.9 | 1.5 to 1.5 | 2.2 to 2.2 | 0.0 to 0.0 | At risk to At risk | unranked to unranked |
| cobra | 2.6 to 2.6 | 2.8 to 2.8 | 2.3 to 2.3 | 0.0 to 0.0 | Conditional to Conditional | unranked to unranked |
| sinatra | 2.4 to 2.4 | 2.0 to 2.0 | 2.8 to 2.8 | 0.0 to 0.0 | At risk to At risk | unranked to unranked |
| automapper | 1.9 to 1.9 | 1.5 to 1.5 | 2.3 to 2.3 | 0.0 to 0.0 | At risk to At risk | unranked to unranked |
| fmt | 2.7 to 2.7 | 2.2 to 2.2 | 3.2 to 3.2 | 0.0 to 0.0 | Conditional to Conditional | 15 to 15 |
| carddemo | scoreless to scoreless | scoreless to scoreless | scoreless to scoreless | 0.0 to 0.0 | Insufficient source to Insufficient source | insufficient to insufficient |
| alfred | 3.0 to 3.0 | 2.4 to 2.4 | 3.6 to 3.6 | 2.4 to 2.4 | Conditional to Conditional | 6 to 6 |
| cejel | **3.3 to 3.4** | **2.5 to 2.7** | 4.0 to 4.0 | **0.0 to 3.2** | Conditional to Conditional | unranked to unranked |

No external score, verdict, evidence-derived rank, or source pin moved. No ranked row moved.

## witan-rubric-v4-2026-07-18

**What changed.** Repository evidence discovery now accepts only tracked regular files. It
does not follow tracked symlinks, because a symlink target can escape the immutable checkout
and make both evidence and scores depend on ambient host files. The scorer still records the
symlink in Git history, but never reads its target as repository evidence.

**Why.** The pinned Zod snapshot has a root `README.md` symlink. V3 followed that link while
also discovering the target `packages/docs/README.md`, which counted one claim source twice
and credited depth that did not exist. V4 reads only the regular target file. Zod A5 falls
from **2.2 to 2.0**; its rounded Code trust, Overall, verdict, and rank do not move. No other
externally pinned repository changes score, verdict, or rank.

The same regeneration moved the two self rows from source snapshot `75fa69511494` to the
clean v4 prerequisite commit recorded in their reports. Those are disclosed as a separate
corpus-pin act, not attributed to the symlink rubric change: Alfred falls **3.1 to 3.0** and
rank 5 to 6; Cejel falls **3.4 to 3.3** and remains unranked for low coverage. Svelte moves
rank 6 to 5 only because Alfred moves below it. CardDemo remains scoreless with
`insufficient_source`.

**Full v3→v4 delta (all 24 rows; external source pins unchanged):**

| Repository | Overall | Code trust | Process trust | A5 | Verdict | Rank |
|---|---:|---:|---:|---:|---|---:|
| react | 3.2 → 3.2 | 2.5 → 2.5 | 3.9 → 3.9 | 2.2 → 2.2 | Conditional → Conditional | 4 → 4 |
| vue | 2.9 → 2.9 | 2.4 → 2.4 | 3.4 → 3.4 | 2.2 → 2.2 | Conditional → Conditional | 11 → 11 |
| svelte | 3.1 → 3.1 | 2.9 → 2.9 | 3.3 → 3.3 | 2.2 → 2.2 | Conditional → Conditional | 6 → 5 |
| django | 3.2 → 3.2 | 2.6 → 2.6 | 3.8 → 3.8 | 0.0 → 0.0 | Conditional → Conditional | unranked → unranked |
| flask | 2.8 → 2.8 | 2.5 → 2.5 | 3.0 → 3.0 | 2.2 → 2.2 | Conditional → Conditional | 14 → 14 |
| fastapi | 2.9 → 2.9 | 2.5 → 2.5 | 3.2 → 3.2 | 2.0 → 2.0 | Conditional → Conditional | 13 → 13 |
| express | 2.8 → 2.8 | 2.6 → 2.6 | 3.0 → 3.0 | 2.0 → 2.0 | Conditional → Conditional | 12 → 12 |
| vite | 3.3 → 3.3 | 2.6 → 2.6 | 4.0 → 4.0 | 2.7 → 2.7 | Conditional → Conditional | 2 → 2 |
| esbuild | 2.6 → 2.6 | 2.7 → 2.7 | 2.4 → 2.4 | 2.4 → 2.4 | Conditional → Conditional | 16 → 16 |
| biomejs | 2.9 → 2.9 | 2.8 → 2.8 | 3.0 → 3.0 | 2.0 → 2.0 | Conditional → Conditional | 8 → 8 |
| requests | 2.9 → 2.9 | 2.4 → 2.4 | 3.4 → 3.4 | 2.2 → 2.2 | Conditional → Conditional | 9 → 9 |
| pydantic | 3.2 → 3.2 | 2.9 → 2.9 | 3.5 → 3.5 | 2.4 → 2.4 | Conditional → Conditional | 3 → 3 |
| axios | 3.3 → 3.3 | 2.6 → 2.6 | 3.9 → 3.9 | 2.4 → 2.4 | Conditional → Conditional | 1 → 1 |
| zod | 3.0 → 3.0 | 2.8 → 2.8 | 3.2 → 3.2 | **2.2 → 2.0** | Conditional → Conditional | 7 → 7 |
| scorecard | 3.0 → 3.0 | 2.3 → 2.3 | 3.6 → 3.6 | 2.6 → 2.6 | Conditional → Conditional | 10 → 10 |
| ripgrep | 2.2 → 2.2 | 2.4 → 2.4 | 2.0 → 2.0 | 2.2 → 2.2 | At risk → At risk | 17 → 17 |
| guava | 1.9 → 1.9 | 1.5 → 1.5 | 2.2 → 2.2 | 2.2 → 2.2 | At risk → At risk | unranked → unranked |
| cobra | 2.6 → 2.6 | 2.8 → 2.8 | 2.3 → 2.3 | 0.0 → 0.0 | Conditional → Conditional | unranked → unranked |
| sinatra | 2.4 → 2.4 | 2.0 → 2.0 | 2.8 → 2.8 | 2.2 → 2.2 | At risk → At risk | unranked → unranked |
| automapper | 1.9 → 1.9 | 1.5 → 1.5 | 2.3 → 2.3 | 1.4 → 1.4 | At risk → At risk | unranked → unranked |
| fmt | 2.7 → 2.7 | 2.2 → 2.2 | 3.2 → 3.2 | 2.2 → 2.2 | Conditional → Conditional | 15 → 15 |
| carddemo | scoreless → scoreless | scoreless → scoreless | scoreless → scoreless | 0.0 → 0.0 | Insufficient source → Insufficient source | insufficient → insufficient |
| alfred | **3.1 → 3.0** | 2.4 → 2.4 | **3.8 → 3.6** | 2.4 → 2.4 | Conditional → Conditional | **5 → 6** |
| cejel | **3.4 → 3.3** | **2.7 → 2.5** | 4.0 → 4.0 | 2.2 → 2.2 | Conditional → Conditional | unranked → unranked |

No external source pin moved. Apart from Zod's A5 correction, no externally pinned score,
verdict, or rank moved. The self-source movement and its induced Svelte rank change are
identified separately above.

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
