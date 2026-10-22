# Preregistration — 0.6.8: v17 scoring unchanged on the public corpus, and v27 never higher than v17 on full history

**CONSTRAINTS-VERSION: 2026-08-01.5**

- **Written:** 2026-10-21, before any run. Nothing in this directory has been scored.
- **Harness:** `docs/experiments/public-delta-harness/` (#495), unchanged. E2 uses `norise.mjs`
  beside this file. It was written with this preregistration and tested by `norise.node-test.mjs`
  (10 cases) before any run.
- **Plan:** `plan.json` beside this file. Its expected values E0–E2 are this preregistration's
  forecasts. They are copied here and will not be revised after any run.
- **Author:** an AI agent (Claude Opus 5.5, Claude Code). The same session wrote several of the
  changes measured here. That is disclosed in "What this does not show".

## What changed between the two commits

`v0.6.7` (`c5d05c7e6febd2e52ec007d15869c6fbf74ab2fa`) and the candidate
(`224f605aec3e0a938c192e066d3c7bd6d256a36c`, the head of `release/0.6.8` before any version change)
differ in source by these merged or integrated changes:

| Change | What it does to scoring |
|---|---|
| #521 | v17: presentation fixes only (LFS pointer count and label, A4 lockfile note and citation). Prospective `witan-rubric-v27-prospective-2026-10-19` added. |
| #525 | Ingest binding record (report format 1.7), attached after scoring. Ingest is disabled in this harness. |
| #533, #548 | v17: A4 note and citation corrections. v27: corrections to `lockfile_coverage` and A1. |
| #540 | Every rubric, presentation only: A2, B2 and B3 disclosures (report format 1.8). |
| #547 | Ingest binding fixes. Ingest is disabled in this harness. |
| #549, `224f605ae` | Fourteen regex sites replaced by linear scans with identical results. |
| #542, #544 | Documentation and records only. |

`package.json`, `pnpm-lock.yaml` and `leaderboard/corpus.json` are identical at both commits. This
was checked before this file was committed.

Recorded so far, all on depth-1 checkouts or synthetic sets, never on the board's full-history
method:
- every v17 change above moves no score, status, metric value, finding count or fingerprint;
- v27 abstains A2 and B2 on depth-1 clones (`leaderboard/RUBRIC_CHANGELOG.md`, 2026-10-19, with
  its 2026-10-21 correction).

This run measures both on full-history clones for the first time.

## Runs and pairs

| Run | Commit | Rubric |
|---|---|---|
| `v067-v17` | `c5d05c7e…` (tag v0.6.7) | `witan-rubric-v17-2026-07-24` |
| `cand-v17` | `224f605a…` | `witan-rubric-v17-2026-07-24` |
| `cand-v27` | `224f605a…` | `witan-rubric-v27-prospective-2026-10-19` |

- **`release-v17`** (`v067-v17` → `cand-v17`): no criterion may move. Presentation only: the
  behaviour fingerprint and `contentReadSummary`. The second can gain an LFS pointer count under
  #521.
- **`v27-shadow`** (`cand-v17` → `cand-v27`): any criterion may move. Presentation only: the rubric
  identifier, the behaviour fingerprint and `contentReadSummary`. The direction of every move is
  checked by `norise.mjs`.

## Expected values

- **E0:**
  - 23 of 23 public rows complete in each of the three runs, with zero errors;
  - target identity unchanged across runs;
  - each source checkout at its run's commit;
  - an existing run output refused.
- **E1, `release-v17`:**
  - `scoringRowsMoved` 0, `placementsMoved` 0, `fingerprintsChanged` 0;
  - `unexpectedCriteria` empty and `undeclaredFieldChanges` empty;
  - the number of byte-different reports is not forecast. B2 labels and A4 notes are expected to
    differ on some rows.
- **E2, `v27-shadow`, by `norise.mjs`:**
  - no row has a composite (overall, code, process) or a criterion score higher under v27 than
    under v17;
  - no composite or criterion is scored under v27 where v17 left it null or absent;
  - recorded, not forecast: the number of rows that differ, the placement moves, and the A2 and B2
    `insufficient_data` counts under v27.

## Procedure

Follow `docs/experiments/public-delta-harness/RUN.md`, with:
- this directory's plan;
- this commit as the preregistration commit;
- a fresh scratch root outside every checkout;
- full-history target clones of the 23 public rows, made from `leaderboard/corpus.json` (`url` and
  `commit` only, no depth limit, no filter, pinned commit checked out detached), and verified before
  and after every run.

Then run `node norise.mjs plan.json <scratch>` for E2. Each run is scored once; an existing output
is refused and never overwritten. The result records every miss as it fell.

## What this does not show

- **E1** shows that the release's v17 changes move no public score, status, metric, finding count,
  placement or fingerprint. It does not show that the new disclosure sentences are true on these
  rows. Their tests and reviews are in #540, #548 and #521.
- **E2** compares v27 with v17 on 23 public repositories. It is a no-rise check on one corpus, not
  the shadow board the #526 ruling requires (condition 5), and not evidence that any v27 abstention
  is correct.
- **No precision or recall claim.** v27 stays prospective and opt-in, the public default stays
  v17, and no calibration claim follows.
- **Conflict of interest.** The session that preregisters and runs this also wrote #540, #542, #544
  and #549 and the fixes in `224f605ae`. The forecasts are fixed here, before any run, so that the
  result cannot be shaped to them.
