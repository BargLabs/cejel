# Result — #567 paged A2 history reads: every expected value held

**CONSTRAINTS-VERSION: 2026-08-01.5**

Run on 2026-10-22 by an AI agent (Claude Opus 5.5, Claude Code), after the operator approved the run.
- **Preregistration:** `PREREGISTRATION.md` at `5450b687fdb9eb5ff9b490348bdc741600370251`, a strict ancestor of this result. It is the successor of `../public-delta-567-paging-2026-10-22/` at `09f017229`, whose expected values it carries over unchanged.
- **Baseline:** `75c951e400893cf23b004f85ecf4d1543baf63ef`.
- **Candidate:** `5b154064adb200c56bd2e9d66ac07a60ef5a6208`.
- **Harness:** v2, unchanged (`../public-delta-harness/`). Its self-test passed (27 of 27) before scoring.
- **`paired-result.json`:** copied unchanged from the scratch root. Raw reports stay local.

## Expected values

| | Expected | Observed | |
|---|---|---|---|
| E0 | 23 of 23 rows complete in each of the four runs, zero errors; target identity unchanged; each source checkout at its run's commit; an existing run output refused | 23 of 23 in each run, 0 errors. Every manifest binds its run, commit, rubric, plan digest and prereg commit (checked by `compare.mjs`). Both source checkouts were clean at their commits. The 23 target clones were clean and at their corpus commits after the runs. A second `base-v17` invocation was refused: "run output already exists; never overwrite a run" | held |
| E1, `paging-v17` | scoringRowsMoved exactly 1 (react: A2 info-finding count +1; status, score and composites unchanged); placements 0; fingerprints 0; unexpectedCriteria empty; undeclaredFieldChanges exactly biomejs and react, `scanLimitations` only; the other 21 byte-identical | scoringRowsMoved 1: react, A2 critical 1.4 with findings critical 1 / info 0 → critical 1 / info 1, composites unchanged. Placements 0, fingerprints 0, unexpectedCriteria []. undeclaredFieldChanges: react `scanLimitations`, biomejs `scanLimitations`. 21 reports identical | held |
| E2, `paging-v27` | scoringRowsMoved exactly 2 (biomejs: A2 `insufficient_data` 0 → verified 3.2, overall and code_trust rise; react as E1); fingerprints 0; unexpectedCriteria empty; undeclaredFieldChanges exactly biomejs and react, `scanLimitations` only; the other 21 byte-identical; placements recorded | scoringRowsMoved 2. biomejs: A2 `insufficient_data` 0 → verified 3.2, overall 2.5 → 3.0, code_trust 1.8 → 2.9, process_trust 3.1 unchanged, coverage code_trust 2/5 → 3/5. react as in E1. Fingerprints 0, unexpectedCriteria [], undeclaredFieldChanges react and biomejs `scanLimitations`, 21 reports identical | held |
| E3, `v27-shadow` | no row has a composite or criterion score higher under v27 than v17; nothing scored under v27 that v17 left null or absent | `norise.mjs`: "v27-shadow: 23 rows, 0 with a rise; insufficient_data under v27: A2 0, B2 0" | held |

**What changed in `scanLimitations`.** On biomejs (v17 and v27), "Cejel: local git history tree enumeration exceeded the 8 MiB output limit…" and "…environment-file history scan exceeded the 8 MiB output limit…" are both gone. On react (v17 and v27), the tree-enumeration line is gone. Neither row has a scan limitation left. Their v17 badges are therefore rated rather than "unrated: limited evidence", and `--min-score` applies to them. This is a v17 gating change on two public rows. No v17 score, status, metric value or verdict moves.

**Recorded, not forecast.**
- **`paging-v27` placements:** 10 moves. biomejs goes from unranked to 6, because a row with an abstaining A2 is not comparable. Nine rows shift down one place: react, vue, svelte, flask, esbuild, requests, scorecard, ripgrep and fmt.
- **`v27-shadow` at the candidate:** 4 rows move. flask, fastapi and pydantic move in A1 metrics with the same score. requests' A1 goes 2.5 → 2.4. No placement moves, and v27 adds no A2 or B2 abstention.

## Pre-plan deviation

Before this successor was written, the original plan's four runs were scored once at its pins (`c9d341d5f`, `da7d2d4f3`, prereg `09f017229`), in a separate scratch root. `main` had moved, and the original plan requires a successor in that case, so the coordinator held the run and those outputs were set aside.
- Only their completion lines were read: 23 of 23 per run.
- They are not this result and are not in `paired-result.json`.
- This result comes from a fresh scratch root with fresh copies of the target clones.

## What this does not show

It measures this change's effect on the 23 public rows at one baseline. It makes no precision, recall or calibration claim. v27 stays prospective and opt-in. biomejs's v27 rise is the change working as intended: a read that no longer stops at Cejel's own output limit. It is not a no-rise violation; that property is E3's comparison of v27 with v17 at one commit.
