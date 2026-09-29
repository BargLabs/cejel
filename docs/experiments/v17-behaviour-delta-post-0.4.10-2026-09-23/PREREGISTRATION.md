# Preregistration — v17 behaviour delta after 0.4.10 (#336, #352, #358)

Written and committed **before** either arm was scored, so the ordering can be checked in git
history instead of taken on trust. The result commit must have this commit as a strict ancestor
(`docs/standing-constraints.md`, Guard 5). This file is not edited after the run. Corrections go
in an erratum beside it.

## What is being measured

**Baseline arm:** `d2a8018`, the `v0.4.10` commit, which is the current release. No scorer
source changed between `v0.4.9` and `v0.4.10` (`git log v0.4.9..v0.4.10 -- src/witan`, excluding
tests, is empty), so this arm should score exactly as 0.4.9 did.

**Candidate arm:** `origin/main` at `5ae73b2`. That tree is what the next release will ship if
nothing else lands.

**Corpus:** all 24 rows of `leaderboard/corpus.json` at their pinned commits (sha256
`dc723f53…`, byte-identical to the corpus the 0.4.9 delta measured). The checkouts are
filesystem clones of the depth-1 checkouts the 0.4.9 delta fetched. Each was re-verified on
2026-09-23 as clean and at its pin before this file was written. Both arms are scored from source
with the calibrated default `witan-rubric-v17-2026-07-24`, a fixed `generatedAt`, on one machine.
The harness in `harness/` is the 0.4.9 harness. The only change is that the scratch root is read
from `DELTA_ROOT`, defaulting to `~/tmp/cejel-0411-delta`.

## Changes in the candidate arm that can move a v17 score

None of these is gated on rubric version, so each applies to the calibrated default.

1. **#336: A2 database-URL userinfo credentials. Direction: down.** A populated
   `DATABASE_URL=postgres(ql)://user:password@…` in a non-template `.env`/`.env.*` file is now a
   committed-secret finding, in both the current tree and the history scan. Its own tests run
   under `WITAN_RUBRIC_VERSION_V17`. It is not mentioned in the Unreleased section of
   `CHANGELOG.md`.
2. **#352: A3 `prod_readiness_primitives` error-boundary idioms. Direction: up.** The content
   scan now also credits `_err`/`_next` parameter names, `export class`, and a `server/` handler
   file with a `.mjs`/`.cjs` extension.
3. **#352: the commented-out `.use(` fix. Direction: down.** Reachability is tested with `//`
   comments stripped, so a commented-out registration no longer credits a stub that is never
   registered.
4. **#358: stripper refinement. Direction: up, relative to #352.** A `//` directly after `:` (a
   URL scheme) is no longer treated as a comment. A trailing comment after code still is.

**Not capable of moving a v17 score. Predicted to move nothing, and measured anyway:**
- #353: the health-route idioms feed only the info-severity absence finding, which is
  emitted only under prospective v20 and later.
- #351: adds the always-present `withheldPaths` array to the report and a disclosure sentence.
  Its only `scoring.ts` edit copies that array into the report.
- #331: signed issuance. It touches `src/index.ts` and `src/issuance/` only, never the scan path.
- The remaining merges since `v0.4.10` touch only tests, fixtures or records.

## Expected values

**E1: completion.** 24 of 24 rows complete in both arms.

**E2: scoring level. 0 rows move.** No headline, no criterion score or status, no metric value,
no verdict, no placement. Reasoning, per change, checked against the checkouts before this file
was written:

- **Changes 2 to 4 (A3):** A3 is `not_applicable` on 17 of 24 rows in the shipped 0.4.9 reports.
  Of the other seven, two (vite and the private row) already have a filename-matched error
  boundary, so the content scan never runs for them. On the remaining five (axios, cejel, react,
  scorecard, vue), no tracked JS/TS file matches either the old or the new four-parameter handler
  shape. Across all 24 rows, the old and new shape-plus-reachability predicates disagree on
  **zero** files. The only files with the handler shape anywhere in the corpus are 18 express
  test files, and express's A3 is not applicable. The same probe that found them reports the
  zeros above, so they are measured, not an absence of evidence.
- **Change 1 (A2):** exactly one tracked env-shaped file exists in the whole corpus. It is in the
  private row, and it is a template path that the detector excludes by construction. No row has
  a non-template `.env` file, so there is nothing for the detector to read. The checkouts are
  depth-1, so the history scan sees the same single commit.

A zero here is **not** evidence that these changes move nothing in general. Their own fixture
suites (`database-url-userinfo.test.ts`, `a3-error-boundary-idioms.test.ts`) show each one moving
on the shapes it was written for. The corpus doesn't contain those shapes.

**E3: board check.** As in the 0.4.9 delta, the baseline arm reproduces the published board at
scoring level on 20 of 24 rows. The four that differ are fastapi, biomejs, fmt and the private
row, for the reasons that entry already recorded. Nothing between 0.4.9 and 0.4.10 changes that.

**E4: byte level. 0 of 24 reports byte-identical.** Every candidate report carries
`withheldPaths`, and it is non-empty on every row, because every row skips at least one file
(between 5 and 12,451 in the shipped 0.4.9 reports). **With `withheldPaths` deleted, every
candidate report is byte-identical to its baseline report, on 24 of 24 rows.**
`rubricBehaviourFingerprint` is identical across the arms.

**E5: a known blind spot, stated before the run.** The behaviour fingerprint is a fixed constant
per rubric, and `src/witan/rubric-fingerprint.ts` did not change between the arms. The candidate
therefore reports the same fingerprint as the baseline, even though v17 behaviour did change on
the shapes above. That is expected. It is also a limitation, and the changelog entry says so.

## Protocol

The corpus is scored once per arm. Errors are preserved, not repaired. If any expected value
fails, the result records the failure as measured, and nothing is adjusted to close the gap. If
E2 fails, the rows that moved are reported in full with the metric that moved them. Raw per-row
reports are kept locally and not committed, because the private row's report is not public. The
committed record is the output of `harness/compare.mjs`, plus a byte-level comparison written
beside it.
