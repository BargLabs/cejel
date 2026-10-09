# Board clone-depth measurement: results

**CONSTRAINTS-VERSION: 2026-08-01.5**

Status: propose-only record, published 2026-10-09. The prediction was committed at `b3a5083`, a
strict ancestor of this commit, before any full clone existed. The run finished at 2026-10-08
01:28 +01:00. It was first recorded in a local commit that is not published, because it carries
new data about the private board row. At the operator's instruction, this record names that row
only as "the private row" and reports only its full-history arm, the control.

Tool: `@cejel/cejel@0.4.9`, default rubric `witan-rubric-v17-2026-07-24`. Each row was scored at
the commit in its published report (`repo.headSha`), under its published product name. The
harness is `run-row.sh` and the table builder is `analyze.sh`; the full per-row table is
`results.tsv`.

**Row count:** the board has **24** rows: 23 public rows and the private row. The live page, the
24 published reports and the corpus all agree on 24. All 24 were measured. The tables and totals
below cover the 23 public rows.

## Reproduction gate: all 24 pass

- 23 depth-1 arms, fetched exactly as the board fetches public rows, reproduce their published
  report on every criterion score, status and metric (value/max), and on code, process, overall
  and verdict.
- **Control:** the private row's full-history arm reproduced its published row exactly. Its
  published row was itself scored from full history.
- So the published numbers came from this method, and each full-minus-shallow difference below is
  the clone depth alone.

## Per public row: depth 1 (= published) → full history

| row | commits (depth 1 / full) | B2 ratio | B2 score | process | overall | verdict | A2 |
|---|---|---|---|---|---|---|---|
| automapper | 1 / 4382 | 1/1 → 5/12 | 4.0 → 3.5 | 2.3 → **2.1** | 2.2 → **2.1** | at_risk, = | n/a |
| axios | 1 / 2126 | 1/1 → 12/12 | 4.0 → 4.0 | 3.9 → 3.9 | 3.3 → 3.3 | conditional, = | 3.6 → 3.6 |
| biomejs | 1 / 10426 | 1/1 → 10/12 | 4.0 → 3.9 | 3.0 → 3.0 | 3.0 → 3.0 | conditional, = | 3.2 → 3.2 |
| carddemo | 1 / 32 | – | abstains | – | abstains | insufficient_source, = | n/a |
| cejel | 1 / 23 | 1/1 → 9/12 | 4.0 → 3.8 | 3.2 → 3.2 | 2.8 → 2.8 | conditional, = | 3.3 → 3.3 |
| cobra | 1 / 1106 | 1/1 → 12/12 | 4.0 → 4.0 | 2.3 → 2.3 | 2.5 → 2.5 | conditional, = | n/a |
| django | 1 / 34772 | 1/1 → 10/12 | 4.0 → 3.9 | 3.6 → **3.5** | 3.1 → 3.1 | conditional, = | 2.8 → 2.8 |
| esbuild | 1 / 4444 | 0/1 → 5/12 | 3.2 warning → 3.5 verified | 2.4 → **2.5** | 2.5 → **2.6** | conditional, = | n/a |
| express | 1 / 6156 | 1/1 → 12/12 | 4.0 → 4.0 | 3.2 → 3.2 | 3.0 → 3.0 | conditional, = | n/a |
| fastapi | 1 / 7473 | 0/1 → 6/12 | 3.2 warning → 3.6 verified | 3.2 → **3.3** | 3.0 → **3.1** | conditional, = | **n/a → 2.8 warning** |
| flask | 1 / 5539 | 0/1 → 1/12 | 3.2 warning → 3.3 verified | 3.0 → 3.0 | 2.9 → 2.9 | conditional, = | 3.2 → 3.2 |
| fmt | 1 / 7921 | 0/1 → 6/12 | 3.2 warning → 3.6 verified | 3.2 → **3.3** | 2.6 → **2.7** | conditional, = | n/a |
| guava | 1 / 7428 | 0/1 → 0/12 | 3.2 → 3.2 | 2.2 → 2.2 | 1.9 → 1.9 | at_risk, = | n/a |
| pydantic | 1 / 5585 | 1/1 → 12/12 | 4.0 → 4.0 | 3.5 → 3.5 | 3.2 → 3.2 | conditional, = | n/a |
| react | 1 / 21577 | 1/1 → 12/12 | 4.0 → 4.0 | 3.9 → 3.9 | 3.0 → 3.0 | conditional, = | 1.4 → 1.4 |
| requests | 1 / 6484 | 1/1 → 12/12 | 4.0 → 4.0 | 3.4 → 3.4 | 2.9 → **3.0** | conditional, = | **n/a → 3.2 verified** |
| ripgrep | 1 / 2252 | 0/1 → 0/12 | 3.2 → 3.2 | 2.0 → 2.0 | 2.1 → 2.1 | at_risk, = | n/a |
| scorecard | 1 / 3091 | 1/1 → 12/12 | 4.0 → 4.0 | 3.6 → 3.6 | 2.9 → 2.9 | conditional, = | n/a |
| sinatra | 1 / 4682 | 1/1 → 10/12 | 4.0 → 3.9 | 2.8 → 2.8 | 2.4 → 2.4 | at_risk, = | n/a |
| svelte | 1 / 11268 | 1/1 → 12/12 | 4.0 → 4.0 | 3.3 → 3.3 | 3.1 → 3.1 | conditional, = | **3.6 → 3.4** |
| vite | 1 / 9441 | 1/1 → 10/12 | 4.0 → 3.9 | 4.0 → 4.0 | 3.4 → 3.4 | conditional, = | 3.2 → 3.2 |
| vue | 1 / 7102 | 0/1 → 11/12 | 3.2 warning → 3.9 verified | 3.4 → **3.6** | 2.9 → **3.0** | conditional, = | n/a |
| zod | 1 / 2927 | 0/1 → 3/12 | 3.2 warning → 3.4 verified | 3.2 → **3.3** | 3.2 → 3.2 | conditional, = | 3.6 → 3.6 |


### Code score changes

Code scores moved on only two rows, and B2 caused neither:
- requests 2.4 → 2.6, because A2 entered the average;
- svelte 2.9 → 2.8, because A2 dropped.

## Totals

- **Verdicts: 0 of 23 changed.** Cobra, the only row whose B2 bound reached a verdict edge, reads
  12/12 in full and does not move.
- **Overall: 6 of 23 moved, each by 0.1.**
  - down: automapper;
  - up: esbuild, fastapi, fmt, requests, vue.
  - No row moved more than 0.1.
- **Process: 7 of 23 moved.** Ranges: −0.2 (automapper) to +0.2 (vue).
- **B2 score: 12 of 23 moved.** (The unpublished first version of this record said 14; recounting
  `results.tsv` gives 12: automapper, biomejs, cejel, django, esbuild, fastapi, flask, fmt,
  sinatra, vite, vue and zod.)
  - Status flipped from warning to verified on 6 rows: esbuild, fastapi, flask, fmt, vue, zod.
- **A2: 3 of 23 moved**, all from history `.env` evidence and none from a credential value:
  - fastapi: not applicable → 2.8 warning (two `.env` history findings);
  - requests: not applicable → 3.2 verified (one);
  - svelte: 3.6 → 3.4 (one).
  - vite gained a history `.env` finding at an unchanged 3.2.
- **Every other criterion (A1, A3–A5, B1, B3–B6): no change on any public row.**

## How much history A2 reads

- **Depth 1:** A2's history pass enumerates 1 commit on every row.
- **Full history:** it enumerates every commit (the commits column above), reading only
  credential-path blobs, up to its 5,000-blob limit.
- **Where the pass applies:**
  - It ran on the 10 public rows where A2 is applicable in the full arm: axios, biomejs,
    cejel, django, fastapi, flask, requests, svelte, vite, zod.
  - It was skipped on react in both arms: under v17 a committed secret in the current tree skips
    the history pass.
  - On the other rows A2 is not applicable, so the history pass has no visible effect.
- **The 5,000-blob limit was not reached on any row.** No "History secret scan coverage bound"
  finding appeared in either arm.

## Predictions (`b3a5083`) against outcome

**Held:**
- B2 went down or stayed equal on every 1/1 row, and up or equal on every 0/1 row.
- No criterion other than A2 and B2 changed.
- The private row's full arm reproduced its published row.
- Every public row's depth-1 arm passed the gate.
- No verdict changed; cobra was the only candidate.
- A2 went down or stayed equal on every row where it was already applicable (svelte down 0.2).
- Every overall change stayed within its B2-only bound, except requests (below).

**Failed:**
- "A2 rows that are not applicable stay not applicable." Fastapi and requests became applicable
  through `.env` files in history. On requests the newly applicable A2 (3.2) sat above the code
  average and raised code and overall trust (+0.2 and +0.1). So deeper history can raise a
  composite score, which the prediction's "A2 never up" framing did not cover.
- Lower-confidence point expectations:
  - esbuild (5/12) and fmt (6/12) were expected near 0/12;
  - automapper (5/12) was expected at 10–12/12.
  - Guava and ripgrep (0/12) were as expected.
