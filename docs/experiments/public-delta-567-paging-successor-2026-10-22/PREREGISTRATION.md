# Successor preregistration — #567 paged A2 history reads, public before-and-after, at the moved `main`

**CONSTRAINTS-VERSION: 2026-08-01.5**

This is a new preregistration. It is committed and pushed before any run under it is scored.

- **Written:** 2026-10-22, by an AI agent (Claude Opus 5.5, Claude Code), at the coordinator's direction, after the operator approved running #572's experiment.
- **Why a successor:** the original, `../public-delta-567-paging-2026-10-22/PREREGISTRATION.md` at `09f017229bf0782cc291056962496a3b03e49607`, says that if `main` has moved when it is run, a successor preregistration names the new baseline and candidate. `main` moved from `c9d341d5f` to `75c951e40` (#579 merged). **The original is not edited.**
- **Baseline:** `75c951e400893cf23b004f85ecf4d1543baf63ef` (`main` at this writing).
- **Candidate:** `5b154064adb200c56bd2e9d66ac07a60ef5a6208`, on branch `exp/572-candidate-on-75c951e40`. It is the baseline plus #572's three change commits (`f45b9440a`, `10870d60b`, `da7d2d4f3`), cherry-picked without conflict. Its diff against the baseline has the same added and removed lines as the original candidate's diff against the original baseline (`git diff c9d341d5f da7d2d4f3` against `git diff 75c951e40 5b154064a`, compared line by line). #572's own branch history is not rewritten.

## What moved between the two baselines

`git diff --name-only c9d341d5f9dd577b44276e255f8657984fdce2bb 75c951e400893cf23b004f85ecf4d1543baf63ef`:

```
docs/orchestration/maeve-unanchored-lessons/PENDING_cejel_empty_filtered_list_is_not_absence_2026-10-22.json
docs/orchestration/maeve-unanchored-lessons/PENDING_cejel_key_a_fault_to_its_call_site_2026-10-22.json
docs/release-process.md
scripts/release.sh
scripts/release_tests.sh
```

None of these is on the scan path: #579 changes only the release driver, its tests, its documentation and two lesson seeds. Nothing under `src/`, no package manifest or lockfile, and `leaderboard/corpus.json` is unchanged.

## Plan and expected values

`plan.json` is the original's with only the four run commits changed: `base-v17` and `base-v27` at the new baseline, `cand-v17` and `cand-v27` at the new candidate. The corpus digest, `generatedAt`, the pairs and the expected values are unchanged.

The expected values E0-E3 are carried over word for word from the original (`09f017229`). They still hold for the same reason the original gave: they forecast only the change's own effect, which is the same change on a baseline whose scan path is unchanged.

The original's disclosure carries over too. The forecasts come from an informal measurement, not blind.

## Pre-plan deviation, disclosed

Before this successor was written, the four runs of the original plan were scored once, at the original pins (`c9d341d5f` and `da7d2d4f3`, prereg `09f017229`), in a separate scratch root. The coordinator then held the run because `main` had moved. Those outputs are not part of this experiment's result. `result.md` names the deviation, and they are not presented as the result. Their per-row outcomes were not read or compared before this successor was committed.

## Procedure

As the original: harness v2 (`../public-delta-harness/`, unchanged), a fresh scratch root, detached clean source checkouts at the two commits, and the same verified full-history target clones. Each run is scored once.

## What this does not show

The same limits as the original. It makes no precision, recall or calibration claim, and v27 stays prospective and opt-in.
