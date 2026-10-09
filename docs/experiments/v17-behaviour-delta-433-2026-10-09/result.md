# Result — v17 behaviour delta for #433 (v0.6.2 → #441's merge commit)

**CONSTRAINTS-VERSION: 2026-08-01.5**

Run by the operator on 2026-10-09, one macOS host, following `harness/RUN.md` steps 1 to 5 as
merged in #446. The preregistration is `PREREGISTRATION.md`: first committed at `aab5647`, final
wording at `cef7d30` (citation attribution only, before any arm ran); the harness command fix
`6601380` touched `RUN.md` only. All three are strict ancestors of this commit.

## Arms and corpus

- Baseline `v0.6.2`, `7c9170f653fc5a2cd3e3f06d45b9fa3fe6e013a8`. Candidate #441's merge, `3c6d16137b48e9a9c4a78bd65dc4005d4276bd95`. Both from source, calibrated
  default `witan-rubric-v17-2026-07-24`, `generatedAt` `2026-09-15T00:00:00.000Z`.
- Corpus: the 24 rows of `leaderboard/corpus.json` (sha256 `dc723f53…`, recomputed in step 1).
  Public rows were the 0.4.11 depth-1 checkouts, reused as APFS clones and re-verified clean,
  shallow and at their pins before scoring. The private row was at its 0.4.11 commit.
- Each arm scored once. 24 of 24 rows completed in each arm.

## Expected values against outcome

| | Preregistered | Measured | Held |
|---|---|---|---|
| E0 | 24 of 24 rows complete, 0 errors | 24/24, 0 errors | yes |
| E1 | baseline reproduces the published board on 24 of 24 rows | 24/24 | yes |
| E2 | two public rows move at scoring level, cejel (B6) and sinatra (B6, B2 metric); headline moves on sinatra only, 2.4 → 2.2; cejel 2.8 unchanged | exactly that; 2 rows with criterion movement, 1 headline | yes |
| E3 | no ranked placement changes | none (sinatra unranked, cejel transparency, in both arms) | yes |
| E4 | fingerprint differs on 24 of 24 rows | 24 | yes |
| E5 | 0 byte-identical; 21 public rows identical after removing the predicted fields in their predicted direction; residual only within the moved rows' scope; 0 withheld-path signal changes | 0; 21; none outside; 0 | yes |

**Every expected value held.** The conditional predictions resolved to the expected case:

- **cejel:** both false B6 credits were removed and no replacement was found. B6 3.3 verified →
  not applicable; process coverage 3/6 → 2/6; process 3.2, overall 2.8 and verdict unchanged
  (the removed 3.3 sat near the mean of the remaining process criteria).
- **sinatra:** `.github/workflows/CODEOWNERS` no longer counts. B2 `pr_trace_primitives` 3 → 2,
  B2 score unchanged (the metric saturates); B6 4.0 verified → not applicable; process 2.8 → 2.4,
  overall 2.4 → 2.2, verdict at risk unchanged, placement unranked.
- **The private row**, not predicted: no headline, criterion score or status, or metric value
  moved. Its report differs from the baseline in the B6 criterion entry at byte level only.

## Full delta under witan-rubric-v17-2026-07-24 (all 24 rows; private row anonymised)

| Repository | Overall | Code trust | Process trust | Verdict | Coverage | Board placement | Criteria that moved (score/status) | Metrics that moved |
|---|---:|---:|---:|---|---|---|---|---|
| react | 3 | 2.1 | 3.9 | Conditional | code_trust 5/5; process_trust 3/6 | 9 | none (report differs elsewhere) | none |
| vue | 2.9 | 2.4 | 3.4 | Conditional | code_trust 4/5; process_trust 3/6 | 11 | none (report differs elsewhere) | none |
| svelte | 3.1 | 2.9 | 3.3 | Conditional | code_trust 4/5; process_trust 3/6 | 4 | none (report differs elsewhere) | none |
| django | 3.1 | 2.6 | 3.6 | Conditional | code_trust 3/5; process_trust 2/6 | unranked | none (report differs elsewhere) | none |
| flask | 2.9 | 2.7 | 3 | Conditional | code_trust 4/5; process_trust 3/6 | 8 | none (report differs elsewhere) | none |
| fastapi | 3 | 2.8 | 3.2 | Conditional | code_trust 2/5; process_trust 3/6 | unranked | none (report differs elsewhere) | none |
| express | 3 | 2.8 | 3.2 | Conditional | code_trust 2/5; process_trust 3/6 | unranked | none (report differs elsewhere) | none |
| vite | 3.4 | 2.8 | 4 | Conditional | code_trust 5/5; process_trust 3/6 | 1 | none (report differs elsewhere) | none |
| esbuild | 2.5 | 2.6 | 2.4 | Conditional | code_trust 3/5; process_trust 3/6 | 13 | none (report differs elsewhere) | none |
| biomejs | 3 | 2.9 | 3 | Conditional | code_trust 3/5; process_trust 4/6 | 6 | none (report differs elsewhere) | none |
| requests | 2.9 | 2.4 | 3.4 | Conditional | code_trust 3/5; process_trust 4/6 | 7 | none (report differs elsewhere) | none |
| pydantic | 3.2 | 2.9 | 3.5 | Conditional | code_trust 3/5; process_trust 3/6 | 3 | none (report differs elsewhere) | none |
| axios | 3.3 | 2.6 | 3.9 | Conditional | code_trust 5/5; process_trust 4/6 | 2 | none (report differs elsewhere) | none |
| zod | 3.2 | 3.1 | 3.2 | Conditional | code_trust 3/5; process_trust 3/6 | 5 | none (report differs elsewhere) | none |
| scorecard | 2.9 | 2.2 | 3.6 | Conditional | code_trust 4/5; process_trust 3/6 | 10 | none (report differs elsewhere) | none |
| ripgrep | 2.1 | 2.1 | 2 | At risk | code_trust 3/5; process_trust 3/6 | 14 | none (report differs elsewhere) | none |
| guava | 1.9 | 1.6 | 2.2 | At risk | code_trust 3/5; process_trust 2/6 | unranked | none (report differs elsewhere) | none |
| cobra | 2.5 | 2.6 | 2.3 | Conditional | code_trust 2/5; process_trust 2/6 | unranked | none (report differs elsewhere) | none |
| sinatra | 2.4 to 2.2 | 2 | 2.8 to 2.4 | At risk | code_trust 2/5; process_trust 4/6 to code_trust 2/5; process_trust 3/6 | unranked | B6 4/verified to 0/not_applicable | B2.pr_trace_primitives 3 to 2; B6.privilege_escalation_cleanliness only in left; B6.protected_path_review_gate only in left |
| automapper | 2.2 | 2 | 2.3 | At risk | code_trust 3/5; process_trust 2/6 | unranked | none (report differs elsewhere) | none |
| fmt | 2.6 | 2 | 3.2 | Conditional | code_trust 3/5; process_trust 4/6 | 12 | none (report differs elsewhere) | none |
| carddemo | scoreless | scoreless | scoreless | Insufficient source | code_trust 0/5; process_trust 0/6 | unrated | none (report differs elsewhere) | none |
| private-row | 3.2 | 3.1 | 3.3 | Conditional | code_trust 5/5; process_trust 4/6 | transparency | none (report differs elsewhere) | none |
| cejel | 2.8 | 2.3 | 3.2 | Conditional | code_trust 5/5; process_trust 3/6 to code_trust 5/5; process_trust 2/6 | transparency | B6 3.3/verified to 0/not_applicable | B6.fail_closed_privilege_check only in left; B6.human_gate_documented only in left; B6.privilege_escalation_cleanliness only in left; B6.protected_path_review_gate only in left |

## Measurement limits

- Public rows are depth-1 checkouts, as on the published board, so history-reading signals see
  one commit in both arms. The board's move to full-history clones is a separate, ruled change
  (#431), measured in `../board-clone-depth-2026-10-08/` and applied with 0.6.3.
- The published `@cejel/cejel@0.6.2` npm artifact was not executed; both arms ran from source.
- Raw per-row reports stay with the operator; the private row's report is not public.

## Outputs

`paired-result.json` (`harness/compare.mjs`) and `bytes-result.json` (`harness/compare-bytes.mjs`),
copied unchanged from the run's scratch root.
