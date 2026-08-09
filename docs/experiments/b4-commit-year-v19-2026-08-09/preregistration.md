# B4 commit-year rubric v19 paired rescore — preregistration

Status: **preregistered before the v19 implementation and before any paired corpus rescore**

Date: 2026-08-09

Issue: `BargLabs/cejel#95`

## Question

Does replacing B4's wall-clock audit-freshness year with the scanned `HEAD` commit's committer
year remove time-dependent scoring without moving any non-B4 criterion or producing an
unreported public-board delta?

This is a prospective rubric experiment. It does not reinterpret any v17 or v18 report and does
not promote a new public default. The calibrated public default remains
`witan-rubric-v17-2026-07-24` throughout this protocol.

## Frozen baseline

The protocol was authored from Cejel commit
`42085acd6b598fb69a33059b9bb7ed00d949b6d4` with these exact Git objects:

| Artifact | Git object / digest |
|---|---|
| `leaderboard/corpus.json` | blob `d563653c6f1d7ee733693c0e9612fa52c323b162`; SHA-256 `dc723f53a201542e0febb98964093ba4a3e7173221e746ba56aab6f726400d00` |
| `leaderboard/reports/` | tree `2658da4382b8219d3208902c050878890975ff85` |
| `src/witan/repo-signals.ts` | blob `eba23a74f8993428fecf605632f4f7b2c18ab415` |
| `src/witan/rubric-version.ts` | blob `48655b0ec46e814729f06601ec08484ace4732d9` |
| `src/witan/schemas.ts` | blob `76aeb46ab2cb3ed3050a55ba19b4e2f3562f713a` |

The corpus has exactly 24 rows: 23 public rows pinned by `leaderboard/corpus.json` and the private
Alfred transparency row. For this rescore only, that private row is frozen to Alfred commit
`be2b4325a317fdfaafb68abf9c920a7d6242a830`. Its paths remain redacted from every public output.
The private row remains outside the public ranking and calibration population.

No repository may be substituted, advanced, dropped, or silently retried at another commit.
A clone, archive, inventory, or scoring failure is an error row and makes the paired run a
NO-GO for promotion.

## Prospective rubric contract

The candidate identifier is `witan-rubric-v19-prospective-2026-08-09`. It inherits prospective
v18 exactly, including v18's native-RLS behavior, and changes only B4 audit freshness:

1. For a usable Git work tree, run the existing hardened, offline Git subprocess boundary with
   `show -s --format=%cI HEAD` and take the leading four-digit committer year.
2. The freshness pattern is that exact year plus the existing static markers
   `recent|latest|current`.
3. For an expected non-Git input (`git_absent` or `not_a_repo`), use only those three static
   markers. Do not consult wall clock, file timestamps, environment variables, or network state.
4. For any other Git failure, add the existing bounded scan-limitation evidence and likewise use
   only the three static markers. Do not manufacture a year.
5. V17 and V18 retain their exact existing `generatedAt`-year behavior. The default rubric
   identifier remains v17. No historical report is rewritten.

The implementation must add focused tests proving:

- identical repository bytes and `HEAD` produce identical v19 B4 evidence across different
  `generatedAt` years;
- changing only the `HEAD` committer year changes the recognized numeric year deterministically;
- v17 and v18 remain byte-compatible across the same fixtures;
- non-Git and unexpected-Git-failure paths never fall back to wall clock;
- no repository-controlled Git hook, pager, signature verifier, transport, or executable-valued
  configuration is enabled.

## Paired measurement

The first measurement implementation must hard-code the merged preregistration commit and, before
reading any corpus source, prove it is a strict ancestor of the execution `HEAD`. The canonical
result records that execution commit; the later result commit must prove both the preregistration
and execution commits are its strict ancestors. Any correction after the preregistration merge is
an erratum or a new preregistration, never an edit to this document.

For every frozen row, one harness invocation will produce two reports from the same immutable
snapshot and the same candidate implementation:

- baseline: `witan-rubric-v18-prospective-2026-07-25`;
- candidate: `witan-rubric-v19-prospective-2026-08-09`;
- fixed `generatedAt`: `2026-08-09T00:00:00.000Z`;
- public sealed scoring entry point only;
- no explicit or auto-discovered ingest;
- no repository code execution;
- no source-path publication for the private Alfred row.

The harness must emit a canonical JSON result and a Markdown rendering that bind:

- preregistration and result commits;
- candidate implementation source hashes;
- corpus blob/digest and every resolved source commit;
- per-row B4 metrics, B4 score/status, overall/code/process scores, verdict, measured coverage,
  and comparative-board placement under both rubrics;
- all scan limitations and errors;
- an assertion that every non-B4 criterion is byte-identical after excluding the report-level
  rubric identifier and generation timestamp.

The complete 24-row before/after table is published in `leaderboard/RUBRIC_CHANGELOG.md`, including
explicit unchanged rows. Generated reports are measurement evidence; the existing committed board
is not overwritten in place by this protocol.

## Prediction and decision rule

Before any v19 implementation or rescore, the prediction is:

- **0 of 24** rows change overall, code-trust, process-trust, verdict, measured coverage, or board
  placement;
- **0 of 24** rows change B4 score or status;
- at most **3 of 24** rows change only the raw `audit_freshness_depth` numerator because a pinned
  committer year differs from the fixed 2026 baseline year;
- no non-B4 criterion changes.

Rationale: almost every pinned repository tip and both publisher-owned snapshots are contemporary
with the 2026 board, while the deliberately old/atypical CardDemo row is already insufficient
source. The wider `0..3` raw-metric allowance is declared before resolving commit timestamps or
examining candidate output.

The result is a protocol GO only if all 24 rows complete, every non-B4 criterion is identical, no
verdict or placement moves, and no more than three raw freshness numerators change. A headline,
verdict, coverage, or placement move is published as a NO-GO and stops default promotion; it is
not tuned away. Any observed change outside B4 is an implementation failure, not a rubric result.

Even a GO authorizes only the prospective v19 implementation and the published paired delta.
Promoting v19 as the ordinary public default requires a separately preregistered authenticated
untouched holdout; this public corpus is not a substitute for one.

## Ordering and immutability

1. Commit, push, review, and merge this preregistration by itself.
2. Record its merged commit as the immutable ancestor in the implementation/harness.
3. Implement v19 and its tests without running the frozen corpus.
4. Commit the implementation before the first paired run.
5. Run the paired corpus once. Preserve errors; do not repair and rerun under this protocol.
6. Commit the canonical result and complete changelog delta separately from the preregistration.

This document must not be amended after merge. Corrections require a later erratum or a new
preregistration that names this protocol and explains the supersession.
