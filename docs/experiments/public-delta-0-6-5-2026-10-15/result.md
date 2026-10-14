# Result — preregistered public before-and-after for 0.6.5 (v17) and v26 item 6

**CONSTRAINTS-VERSION: 2026-08-01.5**

- **Preregistration:** `9b37aa48e922cfbaebf037d964e0fd3458037bb8`, a strict ancestor of this
  result. `plan.json` and the expected values E0–E5 are unchanged since that commit.
- **Harness:** `docs/experiments/public-delta-harness/` as merged in #495.
- **Runs:** on the operator's host, once each, per `OPERATOR-RUN.md`. The preregistering session
  stopped after step 1 because it could not create a scratch root outside its worktree or read the
  target copies; no run was split between hosts.
- **Corpus:** `leaderboard/corpus.json`, digest
  `dc723f53a201542e0febb98964093ba4a3e7173221e746ba56aab6f726400d00`, 23 public rows. Private rows
  were not copied or scanned.
- **Records:** `paired-result.json` and `byte-identity.json` as written by the harness, unedited.
  `attribution.mjs` was written by the reviewer after the runs. It reads the local raw reports and
  prints row names, criterion ids, metric names and values, directions and rule summaries; no
  evidence text or path. Raw reports stay local.

## Summary

All six expected values held. Two qualifications are stated with E0 and E4 below: the overwrite
check printed two matching lines per run instead of the one the run sheet stated, and the public
corpus does not exercise the v26 A2 tenant rule at all.

| | Expected | Measured | |
|---|---|---|---|
| E0 | 23/23 complete per run; zero errors; targets unchanged; source at the run commit; existing output refused | 23/23 and 0 errors in all four runs; `targetIdentityIdenticalAcrossRuns: true`; every manifest's `sourceHead` equals its run commit; the overwrite was refused in all four runs | held |
| E1 | `release-v17` moves only A1, A2, B3; A3 does not move | `unexpectedCriteria: []`; moves in A1 and B3 only | held |
| E2 | A1 and B3 up or unchanged; A2 either way only through the HMAC rule; no other downward move | every moved criterion and metric moved up; A2 moved on no row | held |
| E3 | at least one row moves through B3 on a row declaring workspaces; no row moves down | 5 rows moved at scoring level, 2 of them through B3 on rows declaring workspaces; no row moved down | held |
| E4 | A5 finding gone and A5 up or unchanged where no artifact is named; A2 tenant finding only where T-1 to T-3 hold; nothing else changes | the finding is gone on all 16 rows that carried it under v25, A5 rose on each; no row carries an A2 tenant finding under either rubric; `unexpectedCriteria: []` | held |
| E5 | fingerprint changes on every `release-v17` row; byte identity reported after removing only that field | 23/23 fingerprints changed; 7/23 reports byte-identical after removing only the fingerprint | held |

## E0 — completeness and integrity

- `v064-v17` (`093de2a1`, v17), `main-v17`, `main-v25` and `main-v26` (all `98dbf250`): 23
  completed, 0 errors each.
- Target identity (pin, clean tree, full history, no partial-clone filter, commit count) was
  checked before and after every scan and was identical across all four runs.
- **The overwrite check printed `2`, not the `1` the run sheet stated.** On inspection, one
  refusal produces two matching lines: Node's echo of the throwing source line, which contains the
  message, and the `Error:` line itself. The output directory still held its 24 files (23 reports
  and the manifest) afterwards. The sheet's expected count was wrong; the refusal held.

## E1–E3 — `release-v17` (v17 at v0.6.4 against v17 at the #490 merge)

Scalars: 5 rows moved at scoring level, 3 placements moved, 23 fingerprints changed, 7 reports
byte-identical after removing only the fingerprint, no unexpected criteria, no undeclared field
changes.

Moved rows:

| Row | Criterion | Metric | Criterion score | Declares workspaces |
|---|---|---|---|---|
| biomejs | B3 | `ci_script_depth` 2 → 3 | up | yes (`pnpm-workspace.yaml`) |
| react | B3 | `ci_script_depth` 6 → 7 | unchanged, already at its maximum | yes (`package.json`) |
| express | A1 | `verification_script_ratio` 2 → 3 | up | — |
| scorecard | A1 | `verification_script_ratio` 1 → 2; the "no coverage configuration" finding no longer fires | up | — |
| automapper | A1 | `non_hollow_test_share` 8 → 22 | unchanged | — |

- **Attribution.** The B3 moves are #479 (declared workspace package scripts). Scorecard's A1 move
  is #484 (coverage configuration). Automapper's is #487 (test-framework recognition). Express's
  A1 move is a verification-script recognition; this measurement does not separate #484 from #487
  for that row.
- **A2 did not move on any row.** The #489 HMAC digest rule changed no public row.
- **Placements:** biomejs 8 → 6, svelte 7 → 8, requests 6 → 7. Svelte and requests did not move
  at scoring level; they were displaced.
- **The other 11 rows** differ only in fields the comparison does not score: A1 finding evidence
  with unchanged finding summaries and counts, B3 metric components and conditions (the #479
  disclosure), and A1 or B3 evidence entries (the B3 ones are consistent with the #490 citation
  label; this measurement does not attribute them row by row). None changed a score, status,
  metric value or finding count.

## E4 — `item6-v26` (v25 against v26, both at the #490 merge)

Scalars: 16 rows moved at scoring level, 9 placements moved, no unexpected criteria, no undeclared
field changes. After removing `rubricVersion` and the fingerprint, 7 reports are byte-identical.

- **A5.** 16 rows carried the no-reconciliation finding under v25. Under v26 it fires on none of
  them, each carries the ruling's disclosure sentence, and `reconciliation_artifact_depth` is
  omitted, as amendment 1 rules. A5 rose on all 16. A5 status went from warning to info on 13, stayed
  info on 2, and stayed warning on 1 (automapper), where the remaining metrics still place A5 in
  the warning band and the scorer reports that band, as amendment 1 states. One row (axios) also
  lost a metric-derived warning. No row names a claim-reconciliation artifact, so the v26 finding
  fires on none. The other 7 rows are A5 not applicable or insufficient data under both rubrics and
  are unchanged.
- **A2.** No row carries a tenant-without-RLS finding under v25 or v26. **The public corpus does not
  exercise this rule in either direction**, so E4's A2 clause held without being tested here.
- **Everything else unchanged:** no criterion other than A5 moved. One verdict changed as a result
  of A5 (vite, conditional → verified).
- **Placements:** pydantic 2 → 1, vite 3 → 2, axios 1 → 3, react 12 → 11, svelte 8 → 7,
  scorecard 13 → 12, requests 7 → 6, biomejs 6 → 8, fmt 11 → 13. v26 is explicit-only; these
  placements describe these two runs, not the published board.

## E5 — identity

`release-v17`: the behaviour fingerprint changed on 23 of 23 rows. With only that field removed,
7 of 23 reports are byte-identical (`byte-identity.json`, raw files, not a parse).

## What this does not show

- Nothing here measures precision or recall, on this corpus or any other. These are movements of a
  scanner on 23 public repositories, not judgements of whether a finding is correct.
- v26 remains prospective and explicit-only. The public default stays v17.
- The A2 tenant rule under v26 is untested by this corpus.
