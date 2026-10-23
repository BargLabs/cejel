# Preregistration — #586: a time budget for A2's batched history re-read, public before-and-after

**CONSTRAINTS-VERSION: 2026-08-01.5**

This preregistration is committed and pushed before any run under it is scored. It names the baseline and the candidate by exact commit, and states its expected values in advance.

- **Written:** 2026-10-23, by an AI agent (Claude Opus 5.5, Claude Code), at the coordinator's direction, with the user's go.
- **Change under test:** #586, the item in its title. A whole-history read that stops at Cejel's own output limit or timeout is re-read in rev-list pages and 1,000-commit batches (#567).
  - Each such re-read now has a time budget, `HISTORY_FALLBACK_TIME_BUDGET_MS` = 120,000 ms, checked before each git call of the re-read.
  - When the budget is spent, the re-read stops. It is declared once, through the existing path for a read stopped at Cejel's own limit: a scan limitation under every rubric, and A2's recorder notes the limit, so v27's A2 treats it as a failed read (ADR-0001).
  - A read that hits no limit never starts a re-read, so the budget does not apply to it.
- **Baseline:** `d175e210a41081bd41420b8109b9535540f6e01c` (`main` at this writing).
- **Candidate:** `62924091ca05fdf90b4fa2b54928132aa5c3867a`, on `fix/586-history-fallback-time-budget`. It differs from the baseline only in `src/witan/repo-signals.ts` and one new test file, `src/witan/__tests__/a2-history-fallback-budget-586.test.ts`.
- **Harness:** `../public-delta-harness/` (v2), unchanged. `norise.mjs` and `norise.node-test.mjs` are byte-identical to those of #572's experiments.
- **Corpus:** `leaderboard/corpus.json`, sha256 `dc723f53a201542e0febb98964093ba4a3e7173221e746ba56aab6f726400d00`, the 23 public rows.

## Why no public row should change

**Only two public rows take the re-read at all: biomejs and react.** #572's preregistered result recorded that only those two rows hit Cejel's output limit on a history read (`../public-delta-567-paging-merged-2026-10-23/result.md`).

**Measured before this preregistration.** I replayed the re-read's own git calls through Cejel's `execGit`, in the same pages and batches, on the verified full-history clones of those two rows (biomejs at `01bba129a`, react at `c0c39a6b3`). This was done on the machine that will run this experiment, three rounds each. The slowest re-read of any one read, including its rev-list paging:

| Row | Commits | Tree enumeration | `.env`-path log | Deleted-path log |
|---|---|---|---|---|
| react | 21,577 | ≤ 1.3 s | ≤ 1.4 s (≤ 0.8 s with its early stop) | ≤ 1.2 s |
| biomejs | 10,426 | ≤ 1.5 s | ≤ 2.5 s | ≤ 2.5 s |

No batch was halved. So each re-read finishes within about 2.5 s, roughly 50 times inside the 120 s budget, and the budget changes nothing on either row. The other 21 rows never start a re-read.

**The behaviour fingerprint does not change.** `rubric-behaviour-fingerprint.test.ts` passes at the candidate with the pinned fingerprints, because no fingerprint corpus shape reaches a re-read. This is by design: the change alters output only when a re-read runs out of time.

## Runs and pairs

There are four runs: `base-v17` and `base-v27` at the baseline, `cand-v17` and `cand-v27` at the candidate. There are three pairs (`plan.json`):
- **`budget-v17`** (`base-v17` → `cand-v17`): no criterion may move (`allowedCriteria` is empty), and no field is declared presentation-only. Every changed field is therefore counted.
- **`budget-v27`** (`base-v27` → `cand-v27`): the same, under v27.
- **`v27-shadow`** (`cand-v17` → `cand-v27`): the no-rise check at the candidate, as in #572's experiments.

## Expected values

- **E0:** 23 of 23 public rows complete in each of the four runs, with zero errors. Target identity is unchanged across runs. Each source checkout is at its run's commit. An existing run output is refused.
- **E1, `budget-v17`:** scoringRowsMoved 0, placementsMoved 0, fingerprintsChanged 0, unexpectedCriteria empty, undeclaredFieldChanges empty. All 23 reports are byte-identical.
- **E2, `budget-v27`:** the same as E1.
- **E3, `v27-shadow`**, carried over word for word from `../public-delta-567-paging-2026-10-22/` (`09f017229`), by `norise.mjs`: no row has a composite (overall, code, process) or a criterion score higher under v27 than under v17, and no composite or criterion is scored under v27 where v17 left it null or absent.

**Recorded, not forecast:** the number of rows that differ, the placement moves, and the A2 and B2 abstentions v27 adds. #572's experiments recorded four `v27-shadow` movers (flask, fastapi, pydantic, requests). #588's erratum shows those predate #567.

A result that misses any expected value is reported as a miss, with its rows. Nothing is re-run to make it hold.

## Disclosure

**The forecasts are not blind.** They rest on the measurement above and on #572's recorded results.

**Host-dependence.** Whether a read reaches the budget depends on the host. A run on a much slower or heavily loaded host than the one measured could reach it on biomejs or react. This run uses the measured host. A budget hit here would show as a changed `scanLimitations` on those rows, and would be reported as a miss.

## Procedure

`../public-delta-harness/RUN.md`, harness v2:
- a fresh scratch root, outside every checkout;
- one detached clean source checkout per commit;
- fresh APFS copies of the same verified full-history target clones used by #572's experiments.

Each run is scored once. This commit stays a strict ancestor of the result commit, and the branch is merged with a merge commit, never squashed.

## What this does not show

It shows that the budget leaves the 23 public rows unchanged on one host. It does not exercise the budget itself; the tests do that, with a test clock. It makes no precision, recall or calibration claim, and v27 stays prospective and opt-in.
