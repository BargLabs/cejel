# Result — 0.6.3 board regeneration on full-history clones (#431)

**CONSTRAINTS-VERSION: 2026-08-01.5**

Run by the operator on 2026-10-10/11 following `harness/RUN.md`. Preregistration:
`PREREGISTRATION.md`, first committed at `8b4465a`, final wording at `a7d40d1` (a citation
attribution, before any row was scored). Both are strict ancestors of this commit.

## What ran

The published `@cejel/cejel@0.6.3` (gitHead `8ad26b4`), calibrated default
`witan-rubric-v17-2026-07-24`, from a neutral directory outside any cejel checkout, on full-history
clones (no depth limit, no blob filter) of the 23 public rows at their corpus pins, and on the
private row from the operator's local full-history checkout at the commit its published row was
scored at. 24 of 24 rows completed, 0 errors. Every public clone was at its pin, not shallow, and
had the commit count #448's full arm recorded (R1: 0 issues). Every report carried `toolVersion`
0.6.3, rubric v17 and the v17 behaviour fingerprint `2da86acf…` (R2: 24 of 24). No report carried
`historyLimitations` (R3: 0).

## Disclosure: the public rows were scored twice; the first outputs were never read

The first public pass completed 23 of 23 rows. Before any comparison ran, the private-row step was
started in a shell where the row name was unset. `harness/run-row.sh` built `$root/out/$name` and
`$root/work/$name` from the empty name and removed them, deleting every row's output. Only the
`DONE` lines (row name, commit count, scan exit code) had been seen; no score was read. The harness
gained a refusal of empty arguments (`e646d53`), and all 24 rows were then scored once each. Tool,
pins and history are fixed, so the second pass measures what the first would have.

## Against the preregistration

| | Preregistered | Measured |
|---|---|---|
| Rows matching their expected values | 23 of 23 public rows | 23/23 |
| C1 (A2 under full history with #336) | expected case on fastapi, requests, svelte, vite | expected case on all four; no alternative matched |
| Scoring mismatches | none | none |
| Placement mismatches | none | none |
| Rank order | 15 ranked rows, as listed | held |
| Headline changes | 11 rows | the same 11 |
| Overall changes | 8 rows | the same 8 |
| R0–R3 | 24/24, pins, fingerprint, no history limitation | all held |

**Every preregistered expected value held.** Among them: sinatra 2.4 → 2.2 (process 2.3, a value in
neither input record alone); cejel 2.8 → 2.7 (a move neither input record makes alone); fastapi enters the
ranking at 5; vite moves from 1 to 3 on a comparable-score change of 3.25 → 3.24 inside a four-way
tie at 3.2 that the board breaks by name; every ranked placement changes; no verdict changes.

## Outputs

`board-to-new.json` (published board → new) and `new-vs-prereg.json` (new → preregistration), from
`harness/compare.mjs`, copied unchanged. Neither carries a path; the private row appears only as
`private-row`. Raw reports stay with the operator until the publishing card's redaction backstop
runs.

## Not done here

The board is not published by this record. Publishing (staging through the redaction backstop,
the cejel-site board, its disclosure of the method change with the clone-depth record #448, and
the tie-rank decision) is a separate change.
