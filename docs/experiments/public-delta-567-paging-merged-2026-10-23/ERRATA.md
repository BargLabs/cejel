# Erratum — the four `v27-shadow` movers predate #567

**CONSTRAINTS-VERSION: 2026-08-01.5**

`result.md` in this directory, committed at `2df444c35`, is unchanged. This note adds context the result leaves out. It changes no expected value, observed value or verdict.

Under "Recorded, not forecast", `result.md` lists four rows that move in `v27-shadow` (`cand-v17` → `cand-v27`):
- flask, fastapi and pydantic move in A1 metrics at the same score;
- requests' A1 goes from 2.5 to 2.4.

It does not say that these movers predate #567. They are v27's own A1 difference from v17 at one commit, not an effect of the paged history reads.

The same four rows, with the same A1 scores and the same metric values, move in `v27-shadow` in two earlier results.

| Result | `v27-shadow` candidate | Paging code (#567) present | Movers |
|---|---|---|---|
| this result, `2df444c35` | `ef08a9770` | yes | flask, fastapi, pydantic (A1 metrics, same score); requests A1 2.5 → 2.4 |
| `../public-delta-567-paging-successor-2026-10-22/`, `6adf3a398` | `5b154064a` | yes | the same four, with identical values |
| `../public-delta-0-6-8-successor-2026-10-21/`, `a8d88cbc5` | `4016f659e` | **no** | the same four, with identical values |

**The metric values** in all three `paired-result.json` files (v17 → v27, under A1):

| Row | `test_to_source_ratio` | `non_hollow_test_share` | A1 score |
|---|---|---|---|
| flask | 59 → 56 | 28 → 27 | 2.3 → 2.3 |
| fastapi | 604 → 603 | 491 → 491 | 2.3 → 2.3 |
| pydantic | 292 → 290 | 213 → 212 | 2.8 → 2.8 |
| requests | 15 → 14 | 8 → 8 | 2.5 → 2.4 |

In every case `coverage_percent` and `verification_script_ratio` do not change.

**How "predates" was checked.** `src/witan/repo-signals.ts` at `4016f659e` does not contain `HISTORY_COMMIT_PAGE`, the page constant #567 introduced. At `ef08a9770` it does.

Written on 2026-10-23 by an AI agent (Claude Opus 5.5, Claude Code), from #572's round-4 review (pass 2) and #586.
