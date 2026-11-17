# Preregistration — v17 against v27 on the 23 public rows, at the 0.7.0-rc.3 commit

**CONSTRAINTS-VERSION: 2026-08-01.5**

This preregistration is committed and pushed before any run under it is scored. It names the commit and both rubrics exactly, and states its expected values in advance.

- **Written:** 2026-11-15, by an AI agent (Claude Opus 5.5, Cowork), at the operator's direction.
- **Commit under test:** `3b68ba2b0f5901f0def6d16a881550d0106235c1`, the version bump published as `@cejel/cejel@0.7.0-rc.3` (npm gitHead). It is on `release/0.7.0-rc.3`.
- **Runs:** `rc3-v17` (the default, `witan-rubric-v17-2026-07-24`) and `rc3-v27` (`witan-rubric-v27-prospective-2026-10-19`), both at that commit. Their behaviour fingerprints there are `sha256:1017cbaa…` and `sha256:8fa9d87e…`.
- **Pair:** `v27-shadow` (`rc3-v17` → `rc3-v27`). Every criterion may move; `rubricVersion`, `rubricBehaviourFingerprint` and `contentReadSummary` are declared presentation-only, as in the earlier `v27-shadow` pairs (`../public-delta-586-fallback-budget-2026-10-23/`, `../public-delta-v27-rc2-2026-11-13/`).
- **Harness:** `../public-delta-harness/` (v2), unchanged. `norise.mjs` and `norise.node-test.mjs` are byte-identical to those of #572's, #586's and the 0.7.0-rc.2 experiment.
- **Corpus:** `leaderboard/corpus.json`, sha256 `dc723f53a201542e0febb98964093ba4a3e7173221e746ba56aab6f726400d00`, the 23 public rows.

## Why

The last `v27-shadow` pair was scored at `0f85660ed` (`../public-delta-v27-rc2-2026-11-13/`). Since then two merges changed `src/` outside tests, #723 and #724, both under v27 and both in B3. Their `leaderboard/RUBRIC_CHANGELOG.md` entries of 2026-11-13 read:

- #723: "under v27 a publishing workflow whose every publishing job declares an `environment:` has a deployment gate and is counted, and every workflow B3 does not count is cited at the line that decided it (refs #517, #600); v17-v26 byte-identical; v27 never above v17; no fingerprint moved; no published score moved".
- #724: "under v27, where the publishing rule leaves B3 no counted workflow that targets pull requests or the default branch, B3's note names each CI configuration Cejel does not read, by path (refs #517); note text only; v17-v26 byte-identical; v27 never above v17; no score, status, finding, composite or verdict moved; no published score moved".

This run re-reads the pair at the published release candidate, on full-history clones.

## Expected values

- **E0:** 23 of 23 public rows complete in each run, with zero errors. Target identity is unchanged across runs. The source checkout is at `3b68ba2b0`. An existing run output is refused.
- **E1, `v27-shadow`**, by `norise.mjs`, word for word as in #586's E3: no row has a composite (overall, code, process) or a criterion score higher under v27 than under v17, and no composite or criterion is scored under v27 where v17 left it null or absent.
- **E2, `v27-shadow`:** no row's verdict is better under v27 than under v17, in the order unverified < at_risk < conditional < verified. A verdict v27 sets where v17 had none (`insufficient_source` or absent) is a rise. It is read from `paired-result.json` with:

  ```
  jq -r '.pairs["v27-shadow"].rows[] | select(.error == null) | [.name, .before.verdict, .after.verdict] | @tsv' paired-result.json
  ```

- **E3:** every scoring row, placement move, verdict move, unexpected criterion and undeclared field change of `v27-shadow` is listed in `result.md`, row by row, with the criteria that moved and their scores. Their number is recorded, not forecast.

A result that misses an expected value is reported as a miss, with its rows. Nothing is re-run to make it hold.

## Disclosure

**The forecasts are not blind.** E1 and E2 rest on v27's design (it closes false assurance and does not widen credit) and on the earlier `v27-shadow` results, which recorded no rise. The 0.7.0-rc.2 run's result is known to the author; its title reads "no rise; one scoring row, no score moved".

**Host.** This run uses a Linux x86_64 host, as the 0.7.0-rc.2 run did. The 23 target clones are fresh full clones made on that host from each row's `url` and `commit`, as `../public-delta-harness/RUN.md` step 2 allows when no verified copies are at hand.

## Procedure

`../public-delta-harness/RUN.md`, harness v2:
- a fresh scratch root, outside every checkout;
- one detached clean source checkout at `3b68ba2b0`, shared by both runs;
- fresh full clones of the 23 public rows: no `--depth`, no `--filter`, the pinned commit checked out detached, then the identity checks.

Each run is scored once. This commit stays a strict ancestor of the result commit, and the branch is merged with a merge commit, never squashed.

## What this does not show

It shows how v27 reads the 23 public rows against v17 at one commit, on one host. It makes no precision, recall or calibration claim. It does not change the default rubric, the board or any target pin.
