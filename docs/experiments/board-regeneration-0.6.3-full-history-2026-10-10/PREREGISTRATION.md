# Preregistration — 0.6.3 board regeneration on full-history clones (#431)

**CONSTRAINTS-VERSION: 2026-08-01.5**

This file was written and committed **before any row was scored**. It is pushed as its own commit,
ahead of the harness, so the ordering can be checked in git history. The result commit must have
this commit as a strict ancestor (`docs/standing-constraints.md`, Guard 5). This file is not edited
after the run; corrections go in an erratum beside it.

Every expected value below was composed from committed records and the published board reports.
No corpus repository was cloned, fetched, checked out or scanned to write it, and `@cejel/cejel`
was not run on anything, not even one row.

## Operator ruling

#431, 2026-10-09: the published board is regenerated once, for 0.6.3, on full-history clones of
every public row, disclosed with the clone-depth record (#448). The #433 before-and-after stayed on
depth-1 for comparability; this run is the board's own change.

## The run

- **Tool:** the published `@cejel/cejel@0.6.3` from npm. Its `gitHead` is
  `8ad26b496e32a5bc3b2350f2b0f8a5f940ea74ac`, the commit tag `v0.6.3` points at. Calibrated default
  `witan-rubric-v17-2026-07-24`, no rubric flag, each row under its declared product name
  (`--product-name <row name>`), as the 0.4.9 board run did (`docs/releases/0.4.9-finish-line.md`,
  "Board preparation and validation").
- **Invocation directory:** a neutral directory outside any cejel checkout. #436 recorded that
  inside a cejel checkout `npx @cejel/cejel@<version>` can run the wrong binary. `harness/run-row.sh`
  refuses to run when its working directory or its scoring directory, or any parent of either, is a
  cejel checkout or holds an installed `@cejel/cejel`. It also refuses unless
  `npx -y @cejel/cejel@0.6.3 --version` prints `0.6.3` from that directory.
- **Public rows (23):** `git clone --no-checkout <url>`, `fetch --no-tags origin <pin>`,
  `checkout --detach <pin>`, with no depth limit and no blob filter. This is the full arm of
  `../board-clone-depth-2026-10-08/run-row.sh`. Recorded per row: `HEAD`,
  `rev-parse --is-shallow-repository` (must be `false`) and `rev-list --count HEAD`. A row whose
  `HEAD` is not its pin, or whose clone is shallow, is recorded as an error and not scored.
- **The private row:** scored by the operator from their local full-history checkout, exactly as
  the published board scored it, and as #448's control arm did. `leaderboard/corpus.json` carries
  no pin for this row (its entry has no `commit` field), so "its corpus pin" in the goal card means
  the commit the operator holds for it. That commit is not named here. Its report stays local.
- **Corpus:** all 24 rows of `leaderboard/corpus.json`. The file is blob
  `d563653c6f1d7ee733693c0e9612fa52c323b162` at this commit, at `v0.6.3` and at `v0.4.9`. That blob
  is the one the #449 preregistration and earlier records list with SHA-256
  `dc723f53a201542e0febb98964093ba4a3e7173221e746ba56aab6f726400d00`. The SHA-256 was not recomputed
  here: no digest tool is available on the runner that wrote this file. `harness/RUN.md` has the
  operator recompute it before scoring.
- **Scored once.** Each row is scored once. Errors are kept, not repaired.

## Inputs, all read, none re-measured

1. **The published board.** cejel-site `leaderboard/reports/*.json`, read from the local checkout
   at `~/projects/cejel-site`, whose `main` ref reads `d38303dfeec0b256fb78b0f837b31fbe6b9d87c5`.
   That id was read from the checkout's `.git/refs/heads/main`: this runner may not run `git` in
   another repository, so it could not fetch the site or diff its history. The #449 preregistration
   recorded that the report JSON was last changed in `BargLabs/cejel-site@026774b` (2026-09-16, `toolVersion`
   `0.4.9`) and was unchanged through `7676f75`. Read here:
   - The 23 public reports. Each carries `toolVersion` `0.4.9` and rubric
     `witan-rubric-v17-2026-07-24`, and each `repo.headSha` equals its corpus pin.
   - The site's `leaderboard/leaderboard.md`, for the published placements and comparable scores.
   - The private row's report was not read.

   **Arithmetic check.** Recomputing every public row's code, process, overall, verdict and
   comparable score from its published criteria reproduces the published figures on 23 of 23 rows.
   The rules: a category is the rounded mean of its measured criteria
   (`src/witan/scoring.ts`, `averageScore`), overall is the rounded mean of the two rounded
   categories, and the comparable score is the rounded mean of measured criteria excluding B1 and
   B5. Recomputing the board's order (comparable score descending, then name; publisher-owned rows
   never ranked; a row is unranked when either category or the whole is under half measured)
   reproduces all 14 published ranks. `harness/RUN.md` step 3 has the operator confirm the site
   checkout holds the published reports before comparing.
2. **The clone-depth record (#448).** `docs/experiments/board-clone-depth-2026-10-08/results.tsv`
   (blob `ce64a6a0`) and `results.md` (blob `ac7495d8`), committed at `7aa4ca7`. For each public
   row, depth-1 against full history under `@cejel/cejel@0.4.9`. Its depth-1 arm reproduced the
   published board on 23 of 23 public rows.
3. **The #433 result (#449).** `docs/experiments/v17-behaviour-delta-433-2026-10-09/result.md`
   (blob `4a55f5fe`) and `paired-result.json` (blob `fbb0d7d3`), committed at `5b20184`. #433 at
   depth-1, `v0.6.2` against #441's merge `3c6d161`: cejel and sinatra moved, nothing else.
4. **Every score-capable v17 change between `v0.4.9` and `v0.6.3`.** Read from
   `git log v0.4.9..v0.6.3 -- src` and `leaderboard/RUBRIC_CHANGELOG.md` (blob `7c23cc18`):
   - **0.4.11** (`5ae73b2`, recorded in `../v17-behaviour-delta-post-0.4.10-2026-09-23/`):
     #336 (A2 `DATABASE_URL` userinfo, down), #352 (A3 idioms, up) and #352/#358 (commented-out
     `.use(`, down). That record measured 0 rows moving, **at depth-1 only**.
   - **`5ae73b2` to `v0.6.2`:** none score-capable under v17. The #449 preregistration read each
     diff (v24-gated A2 content context with every new parameter defaulting off, v24 allowlists and
     fingerprint pins, `appliedWeightShare`, certificate text, `historyLimitations` attached after
     scoring, and changes outside the scan path).
   - **`v0.6.2` to #441's merge:** #433, six parts, measured by #449.
   - **#441's merge to `v0.6.3`:** `git log 3c6d161..v0.6.3 -- src` lists one commit, `d338414`.
     It changes `src/__tests__/index.test.ts` only.

   So the score-capable v17 changes are exactly 0.4.11's three and #433, as the goal card expects.

## Which criteria read history

The composition rests on this. `src/witan/history-depth.ts` names the history-reading criteria:
`HISTORY_READING_CRITERIA = ['A2', 'B2']`. The git calls in `src/witan` (non-test) agree:

- **A2** reads history in its credential-history pass (`rev-list HEAD`, `diff-tree`, `git show`
  per blob) and in its `.env`-path check (`git log HEAD --diff-filter=AM --name-only`).
- **B2** reads `git log --max-count=12` for `pr_merge_ratio`.
- **B4** reads only `HEAD`'s committer date, which is the same at any depth.
- **Every other read is the checked-out tree:** `git ls-files --cached` and file contents.

**The history-side code did not change between `v0.4.9` and `v0.6.3` except for #336.** These
functions in `repo-signals.ts` are byte-identical at the two tags: `readRecentCommits`,
`isPrMergeCommit`, `readCredentialHistoryEntries`, `readDeletedCredentialHistoryEntries`,
`hasEnvPathInGitHistory`, `isEnvHistoryPath`, `isCredentialHistoryPath`, `readGitBlob`,
`findRealSecretAssignment`, `findWeakExplicitEnvCredential` and
`stripCommentAndDocumentationExamples`. Three others differ:

- `collectHistorySecretEvidence` differs by exactly #336's block.
- `prepareCredentialScanContents` differs by a v24 parameter that defaults to off. The history pass
  does not pass it.
- `collectB2PrTraceEvidence` differs by #433 part 5 (the CODEOWNERS location), which is a tree read.

Consequences:

- **#433 is depth-independent.** All six parts read the tree: CODEOWNERS location, policy
  documents, B6 implementation files and A3 filenames. #449's depth-1 outcome therefore carries to
  full history for each criterion. Only where a #433 criterion shares a composite or a metric with a
  history change can the two interact: on cejel and sinatra (below).
- **#352/#358 (A3) are depth-independent.** A3 reads `ls-files` and file contents only, and a
  full clone and a depth-1 fetch at the same pin check out the same tree. #448 corroborates this: A3
  did not change between depths on any public row under 0.4.9. So 0.4.11's depth-1 result for A3
  (0 rows moved) carries to full history. This is reasoned from the code, not assumed.
- **#336 is the one change whose history half the depth-1 record cannot speak to.** At depth 1 the
  history pass sees one commit. Under v17 (`usesV39Detectors` is true), the full-history pass now
  checks each `.env`-path blob for a populated `postgres(ql)://user:password@…` `DATABASE_URL` with
  a non-placeholder password. The check runs before the weak-credential check, and its path set is
  unchanged. A match on a non-test path is a **critical** A2 finding. That sets `secret_cleanliness`
  to 0, and the critical cap makes A2 **1.4 critical** (`capScoreForFindings`). Its current-tree
  half is inert on this corpus: the 0.4.11 record found no non-template `.env` file in any row's
  current tree, and the tree does not depend on depth.

## Composition rule

A row's expected value is its #448 full-history value, adjusted by #433 where #449 measured a move.
Every criterion not named below keeps its published value: #448 measured no change in A1, A3–A5,
B1 or B3–B6 on any public row, and #449 moved nothing outside cejel and sinatra. Headline figures
are recomputed from the composed criteria with the scorer's own rounding. Applied to #448's inputs,
that arithmetic reproduces #448's full-history headline on every public row.

**Metric values:**

- B2 `pr_merge_ratio`: #448's full-history `k/12` on every row.
- sinatra B2 `pr_trace_primitives`: 2 (#449).
- cejel and sinatra: no B6 metrics, because B6 is not applicable.
- A2 metrics on fastapi, requests, svelte and vite: **not predicted**. #448 did not record A2
  metric values, and A2 moved or gained a history finding on those rows.
- **Every other metric value:** its published value.

## Conditionals: two changes on one criterion, or a gap in the depth-1 record

- **C1. #336 under full history (A2): fastapi, requests, svelte, vite.** #448 measured `.env` files
  in the history of exactly these four rows (`results.tsv`, "A2 history findings S/F" column:
  fastapi `env+env`, requests, svelte and vite `env`). On fastapi and requests A2 became applicable
  through them. svelte's A2 went from 3.6 to 3.4, and vite gained the finding at an unchanged 3.2.
  All of that was under 0.4.9, which predates #336.
  - **No other row is conditional on #336.** On the other A2-applicable rows (axios, biomejs,
    cejel, django, flask, zod), #448 found no history `.env` path. On every row where A2 stayed
    not applicable, a history `.env` path would itself have made A2 applicable. #336 reads only
    `.env`-path blobs. react's A2 is already 1.4 critical, and a further critical finding leaves it
    at 1.4.
  - **Expected:** no populated non-placeholder postgres `DATABASE_URL` in those blobs, so each row
    takes its #448 value.
  - **Alternative, per row:** A2 → 1.4 critical, with headline and placement as tabulated below
    (each computed with only that row in the alternative).
  - **A third outcome is not predicted numerically:** a match only on a test or fixture path. That
    gives an info finding, `secret_cleanliness` stays 1, and the effect on A2's score is not
    derivable from the records. If it happens, it is reported in full.
- **C2. sinatra: B2 under full history (#448) and B2's review-gate credit removed by #433.**
  - **How B2 is scored** (`scoreMetrics`): B2 = 4 × (0.8 × min(trace/2, 1) + 0.2 × ratio). The
    trace count reads the tree only (CI workflows, PR template, review-gate record). The ratio
    reads history only.
  - **Why the saturation holds.** The saturation is inside the trace term: min(3/2, 1) =
    min(2/2, 1) = 1. The ratio is a separate weighted metric, so a ratio below 1/1 cannot undo it.
  - **Expected:** trace 2/2, ratio 10/12, B2 = 3.2 + 0.8 × 10/12 = 3.87 → **3.9 verified**, as #448
    measured.
  - **B6 → not applicable** (#449, tree only). Process = mean(3.9, 0.6, 2.5) = 2.33 → **2.3**.
    Overall = (2.0 + 2.3) / 2 = 2.15 → **2.2** under the scorer's floating-point rounding. Neither
    record alone gives this process figure: #448 gives 2.8 and #449 gives 2.4.
  - Conditional on the two reads staying independent, which the code above shows they are.
- **C3. cejel: B2 under full history (#448: 4.0 → 3.8) and B6 → not applicable (#449).**
  - Process = mean(3.8, 2.4) = **3.1**. Overall = (2.3 + 3.1) / 2 = **2.7**. Verdict
    conditional, placement `transparency`.
  - **Neither change moves cejel's overall alone** (2.8 in #448's full arm, 2.8 in #449). Together
    they move it 2.8 → 2.7. B6 at 3.3 was holding the process mean up against the lower full-history
    B2.
  - Process coverage falls to 2/6, so the row is low confidence on its own transparency line.
  - Conditional on the same independence. #449's B6 conditions (no replacement human-gate or
    fail-closed credit) resolved at depth-1 on a tree read, so they do not depend on depth.
- **C4. #352/#358 (A3).** Expected: no A3 change on any row, for the depth-independence reason
  above. This is stated as reasoning, not as a measurement at full depth.

## Expected values per public row

Columns are published → expected. "Source" names the input behind each moved figure:
**P** published board, **448** clone-depth full arm, **449** #433 result, **comp** recomputed from
the composed criteria. Comparable is the board's ordering figure.

| row | B2 (ratio) | A2 | B6 | overall | code | process | verdict | comparable | placement | flag |
|---|---|---|---|---|---|---|---|---|---|---|
| react | 4.0 (12/12) 448 | 1.4 critical P | n/a P | 3.0 | 2.1 | 3.9 | conditional | 2.8 | 9 → **12** | |
| vue | 3.2 w → 3.9 v (11/12) 448 | n/a P | n/a P | 2.9 → **3.0** comp | 2.4 | 3.4 → **3.6** comp | conditional | 2.8 → **2.9** | 11 → **9** | |
| svelte | 4.0 (12/12) 448 | 3.6 → 3.4 448 | n/a P | 3.1 | 2.9 → **2.8** comp | 3.3 | conditional | 3.1 → **3.0** | 4 → **7** | C1 |
| django | 4.0 → 3.9 (10/12) 448 | 2.8 w P | n/a P | 3.1 | 2.6 | 3.6 → **3.5** comp | conditional | 3.0 → **2.9** | unranked | |
| flask | 3.2 w → 3.3 v (1/12) 448 | 3.2 P | n/a P | 2.9 | 2.7 | 3.0 | conditional | 2.8 | 8 → **10** | |
| fastapi | 3.2 w → 3.6 v (6/12) 448 | n/a → 2.8 w 448 | n/a P | 3.0 → **3.1** comp | 2.8 | 3.2 → **3.3** comp | conditional | 3.0 → **3.1** | unranked → **5** | C1 |
| express | 4.0 (12/12) 448 | n/a P | n/a P | 3.0 | 2.8 | 3.2 | conditional | 3.0 | unranked | |
| vite | 4.0 → 3.9 (10/12) 448 | 3.2 448 | n/a P | 3.4 | 2.8 | 4.0 | conditional | 3.3 → **3.2** | 1 → **3** | C1 |
| esbuild | 3.2 w → 3.5 v (5/12) 448 | n/a P | n/a P | 2.5 → **2.6** comp | 2.6 | 2.4 → **2.5** comp | conditional | 2.5 | 13 → **14** | |
| biomejs | 4.0 → 3.9 (10/12) 448 | 3.2 P | 1.7 P | 3.0 | 2.9 | 3.0 | conditional | 3.0 → **2.9** | 6 → **8** | |
| requests | 4.0 (12/12) 448 | n/a → 3.2 v 448 | 4.0 P (449: no move) | 2.9 → **3.0** comp | 2.4 → **2.6** comp | 3.4 | conditional | 3.0 | 7 → **6** | C1 |
| pydantic | 4.0 (12/12) 448 | n/a P | n/a P | 3.2 | 2.9 | 3.5 | conditional | 3.2 | 3 → **2** | |
| axios | 4.0 (12/12) 448 | 3.6 P | 4.0 P (449: no move) | 3.3 | 2.6 | 3.9 | conditional | 3.2 | 2 → **1** | |
| zod | 3.2 w → 3.4 v (3/12) 448 | 3.6 P | n/a P | 3.2 | 3.1 | 3.2 → **3.3** comp | conditional | 3.1 → **3.2** | 5 → **4** | |
| scorecard | 4.0 (12/12) 448 | n/a P | 4.0 P (449: no move) | 2.9 | 2.2 | 3.6 | conditional | 2.8 | 10 → **13** | |
| ripgrep | 3.2 w (0/12) 448 | n/a P | n/a P | 2.1 | 2.1 | 2.0 | at_risk | 2.1 | 14 → **15** | |
| guava | 3.2 w (0/12) 448 | n/a P | n/a P | 1.9 | 1.6 | 2.2 | at_risk | 1.8 | unranked | |
| cobra | 4.0 (12/12) 448 | n/a P | n/a P | 2.5 | 2.6 | 2.3 | conditional | 2.4 | unranked | |
| sinatra | 4.0 → 3.9 (10/12) 448; trace 3 → 2 449 | n/a P | 4.0 → n/a 449 | 2.4 → **2.2** comp | 2.0 | 2.8 → **2.3** comp | at_risk | 2.5 → **2.2** | unranked | C2 |
| automapper | 4.0 → 3.5 (5/12) 448 | n/a P | n/a P | 2.2 → **2.1** comp | 2.0 | 2.3 → **2.1** comp | at_risk | 2.1 → **2.0** | unranked | |
| fmt | 3.2 w → 3.6 v (6/12) 448 | n/a P | 4.0 P (449: no move) | 2.6 → **2.7** comp | 2.0 | 3.2 → **3.3** comp | conditional | 2.7 → **2.8** | 12 → **11** | |
| carddemo | insufficient data P | n/a P | n/a P | abstains | – | – | insufficient_source | – | unrated | |
| cejel | 4.0 → 3.8 (9/12) 448 | 3.3 P | 3.3 → n/a 449 | 2.8 → **2.7** comp | 2.3 | 3.2 → **3.1** comp | conditional | 2.7 → **2.5** | transparency | C3 |

Bold marks an expected change against the published board. In the B2 column, "w" is warning and
"v" is verified. vite's B2 falls (#448) while its process score still rounds to 4.0
(mean(3.9, 4.0, 4.0) = 3.97), so no headline figure moves. Its comparable score does move, from
3.3 (26.0 / 8 = 3.25) to 3.2 (25.9 / 8 = 3.24). That alone moves it from 1 to 3, in a four-way
tie at 3.2 that the board breaks by name.

**C1 alternatives** (A2 → 1.4 critical, one row at a time; every other row as expected):

| row | overall | code | process | verdict | comparable | placement |
|---|---|---|---|---|---|---|
| fastapi | 2.8 | 2.4 | 3.3 | conditional | 2.8 | 9 |
| requests | 2.8 | 2.2 | 3.4 | conditional | 2.8 | 12 |
| svelte | 2.8 | 2.3 | 3.3 | conditional | 2.7 | 13 |
| vite | 3.2 | 2.4 | 4.0 | conditional | 3.0 | 7 |

**The private row: not predicted.** `harness/compare.mjs` reports it only as `private-row`, with
its completion status and nothing else.

## Expected headline, rank and counts

- **Headline (overall, code, process or verdict) changes on 11 of 23 public rows:** vue, svelte,
  django, fastapi, esbuild, requests, zod, sinatra, automapper, fmt and cejel.
  - **Overall moves on 8:**
    - up: vue, fastapi, esbuild, requests, fmt (each +0.1);
    - down: automapper (−0.1), cejel (−0.1), sinatra (−0.2).
  - **Verdicts: 0 of 23 change.**
  - **Two of the 11 change at headline level from the combination alone:**
    - cejel's overall: neither record moves it, and the two together do.
    - sinatra's process: the composed value, 2.3, is in neither record.
- **Comparable score moves on 11 rows:** vue, svelte, django, fastapi, vite, biomejs, zod,
  sinatra, automapper, fmt and cejel.
- **Coverage moves on 4 rows:** fastapi code 2/5 → 3/5, requests code 3/5 → 4/5, sinatra process
  4/6 → 3/6 and cejel process 3/6 → 2/6.
- **Expected rank order, 15 ranked rows** (published: 14):
  1. axios (3.2)
  2. pydantic (3.2)
  3. vite (3.2)
  4. zod (3.2)
  5. fastapi (3.1)
  6. requests (3.0)
  7. svelte (3.0)
  8. biomejs (2.9)
  9. vue (2.9)
  10. flask (2.8)
  11. fmt (2.8)
  12. react (2.8)
  13. scorecard (2.8)
  14. esbuild (2.5)
  15. ripgrep (2.1)
- **Placement changes against the published board: all 15 ranked rows.**
  - axios 2 → 1;
  - pydantic 3 → 2;
  - **vite 1 → 3**: B2 3.9 lowers its comparable score from 3.3 to 3.2, into a four-way tie;
  - zod 5 → 4;
  - **fastapi unranked → 5**: A2 becomes applicable, so code coverage reaches 3/5;
  - requests 7 → 6;
  - svelte 4 → 7;
  - biomejs 6 → 8;
  - vue 11 → 9;
  - flask 8 → 10;
  - fmt 12 → 11;
  - react 9 → 12;
  - scorecard 10 → 13;
  - esbuild 13 → 14;
  - ripgrep 14 → 15.

  No ranked row keeps its published placement. Unranked: django, express, sinatra, cobra,
  automapper and guava (6; published 7). Unrated: carddemo. Transparency: cejel and the private
  row.
- **How fragile the order is.** Placement is a function of rounded comparable scores with a name
  tie-break. Four rows tie at 3.2 (axios, pydantic, vite, zod) and four at 2.8 (flask, fmt, react,
  scorecard). So any comparable-score miss
  implies placement misses. `compare.mjs` lists the two kinds of miss separately, so a score miss
  is not counted twice as an independent failure.

## Run-level expected values

- **R0:** 24 of 24 rows complete, 0 errors.
- **R1:** on all 23 public rows:
  - `HEAD` equals the corpus pin;
  - `is-shallow-repository` is `false`;
  - the commit count equals #448's full arm (the history of a fixed commit is fixed).
- **R2:** every report carries:
  - `toolVersion` `0.6.3`;
  - `rubricVersion` `witan-rubric-v17-2026-07-24`;
  - `rubricBehaviourFingerprint`
    `sha256:2da86acf64c39d2edb7824df46250ea23c396264266a2cd925953e9c6ad25858` (the v17 pin since
    #441, unchanged at `v0.6.3`).
- **R3:** no public report carries `historyLimitations`, because none is shallow (#428 attaches it
  only to shallow clones).

## Protocol

- Score each row once. Errors are kept, not repaired, and not re-run.
- If an expected value fails, the result records the failure as measured, and nothing is adjusted
  to close the gap.
- If more rows move than predicted, each is reported in full, with the criterion and metric that
  moved it.
- **Raw reports stay local** until the publishing card's redaction backstop has run. The committed
  record is `harness/compare.mjs`'s two outputs:
  - published board → new;
  - new → this preregistration.

  Neither output carries a path. The private row appears in them only as `private-row`, with its
  completion status.
- **Publishing the board is a separate card:** staging, the redaction backstop and the cejel-site
  change. Nothing here changes `leaderboard/` or the site.

## Machine-readable expected values

`harness/compare.mjs` reads the block between the two markers below, from this file, so the
comparison runs against the preregistered text and not against a copy. Criterion values are
`score/status`. `metrics` lists the metric values that differ from the published report; every
metric not listed is expected to equal its published value, except:

- `metricsNotPredicted` names criteria whose metrics are not predicted;
- `metricsAbsent` names criteria expected to carry no metrics.

`alternatives` holds the C1 outcomes.

<!-- expected-values:begin -->
```json
{
"toolVersion": "0.6.3",
"rubricVersion": "witan-rubric-v17-2026-07-24",
"rubricBehaviourFingerprint": "sha256:2da86acf64c39d2edb7824df46250ea23c396264266a2cd925953e9c6ad25858",
"commits": {"react":21577,"vue":7102,"svelte":11268,"django":34772,"flask":5539,"fastapi":7473,"express":6156,"vite":9441,"esbuild":4444,"biomejs":10426,"requests":6484,"pydantic":5585,"axios":2126,"zod":2927,"scorecard":3091,"ripgrep":2252,"guava":7428,"cobra":1106,"sinatra":4682,"automapper":4382,"fmt":7921,"carddemo":32,"cejel":23},
"rankOrder": ["axios","pydantic","vite","zod","fastapi","requests","svelte","biomejs","vue","flask","fmt","react","scorecard","esbuild","ripgrep"],
"rows": {
"react":{"overall":3,"code":2.1,"process":3.9,"verdict":"conditional","comparable":2.8,"coverage":"code_trust 5/5; process_trust 3/6","placement":"12","criteria":{"A1":"2.3/verified","A2":"1.4/critical","A3":"2.3/warning","A4":"2.4/verified","A5":"2.2/warning","B1":"0/not_applicable","B2":"4/verified","B3":"4/verified","B4":"3.8/verified","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{"B2.pr_merge_ratio":{"value":12,"max":12}}},
"vue":{"overall":3,"code":2.4,"process":3.6,"verdict":"conditional","comparable":2.9,"coverage":"code_trust 4/5; process_trust 3/6","placement":"9","criteria":{"A1":"2.5/verified","A2":"0/not_applicable","A3":"2.2/warning","A4":"2.7/verified","A5":"2.2/warning","B1":"0/not_applicable","B2":"3.9/verified","B3":"4/verified","B4":"2.9/verified","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{"B2.pr_merge_ratio":{"value":11,"max":12}}},
"svelte":{"overall":3.1,"code":2.8,"process":3.3,"verdict":"conditional","comparable":3,"coverage":"code_trust 4/5; process_trust 3/6","placement":"7","criteria":{"A1":"2.6/verified","A2":"3.4/verified","A3":"0/not_applicable","A4":"3.1/warning","A5":"2.2/warning","B1":"0/not_applicable","B2":"4/verified","B3":"4/verified","B4":"1.9/verified","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{"B2.pr_merge_ratio":{"value":12,"max":12}},
"metricsNotPredicted":["A2"],"alternatives":{"A2-history-database-url-critical":{"overall":2.8,"code":2.3,"process":3.3,"verdict":"conditional","comparable":2.7,"coverage":"code_trust 4/5; process_trust 3/6","placement":"13","criteria":{"A2":"1.4/critical"}}}},
"django":{"overall":3.1,"code":2.6,"process":3.5,"verdict":"conditional","comparable":2.9,"coverage":"code_trust 3/5; process_trust 2/6","placement":"unranked","criteria":{"A1":"2.8/verified","A2":"2.8/warning","A3":"0/not_applicable","A4":"2.1/warning","A5":"0/not_applicable","B1":"0/not_applicable","B2":"3.9/verified","B3":"3.1/verified","B4":"0/not_applicable","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{"B2.pr_merge_ratio":{"value":10,"max":12}}},
"flask":{"overall":2.9,"code":2.7,"process":3,"verdict":"conditional","comparable":2.8,"coverage":"code_trust 4/5; process_trust 3/6","placement":"10","criteria":{"A1":"2.3/verified","A2":"3.2/verified","A3":"0/not_applicable","A4":"2.9/warning","A5":"2.2/warning","B1":"0/not_applicable","B2":"3.3/verified","B3":"2.1/verified","B4":"3.7/verified","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{"B2.pr_merge_ratio":{"value":1,"max":12}}},
"fastapi":{"overall":3.1,"code":2.8,"process":3.3,"verdict":"conditional","comparable":3.1,"coverage":"code_trust 3/5; process_trust 3/6","placement":"5","criteria":{"A1":"2.3/verified","A2":"2.8/warning","A3":"0/not_applicable","A4":"3.4/verified","A5":"0/insufficient_data","B1":"0/not_applicable","B2":"3.6/verified","B3":"2.7/verified","B4":"3.6/verified","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{"B2.pr_merge_ratio":{"value":6,"max":12}},
"metricsNotPredicted":["A2"],"alternatives":{"A2-history-database-url-critical":{"overall":2.8,"code":2.4,"process":3.3,"verdict":"conditional","comparable":2.8,"coverage":"code_trust 3/5; process_trust 3/6","placement":"9","criteria":{"A2":"1.4/critical"}}}},
"express":{"overall":3,"code":2.8,"process":3.2,"verdict":"conditional","comparable":3,"coverage":"code_trust 2/5; process_trust 3/6","placement":"unranked","criteria":{"A1":"2.3/verified","A2":"0/not_applicable","A3":"0/not_applicable","A4":"3.4/verified","A5":"0/not_applicable","B1":"0/not_applicable","B2":"4/verified","B3":"3.6/verified","B4":"1.9/verified","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{"B2.pr_merge_ratio":{"value":12,"max":12}}},
"vite":{"overall":3.4,"code":2.8,"process":4,"verdict":"conditional","comparable":3.2,"coverage":"code_trust 5/5; process_trust 3/6","placement":"3","criteria":{"A1":"2.5/verified","A2":"3.2/verified","A3":"2.8/verified","A4":"2.8/verified","A5":"2.7/info","B1":"0/not_applicable","B2":"3.9/verified","B3":"4/verified","B4":"4/verified","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{"B2.pr_merge_ratio":{"value":10,"max":12}},
"metricsNotPredicted":["A2"],"alternatives":{"A2-history-database-url-critical":{"overall":3.2,"code":2.4,"process":4,"verdict":"conditional","comparable":3,"coverage":"code_trust 5/5; process_trust 3/6","placement":"7","criteria":{"A2":"1.4/critical"}}}},
"esbuild":{"overall":2.6,"code":2.6,"process":2.5,"verdict":"conditional","comparable":2.5,"coverage":"code_trust 3/5; process_trust 3/6","placement":"14","criteria":{"A1":"2.2/verified","A2":"0/not_applicable","A3":"0/not_applicable","A4":"3.1/warning","A5":"2.4/warning","B1":"0/not_applicable","B2":"3.5/verified","B3":"2/verified","B4":"1.9/verified","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{"B2.pr_merge_ratio":{"value":5,"max":12}}},
"biomejs":{"overall":3,"code":2.9,"process":3,"verdict":"conditional","comparable":2.9,"coverage":"code_trust 3/5; process_trust 4/6","placement":"8","criteria":{"A1":"2.2/verified","A2":"3.2/verified","A3":"0/not_applicable","A4":"3.2/verified","A5":"0/not_applicable","B1":"0/not_applicable","B2":"3.9/verified","B3":"3.1/verified","B4":"3.3/verified","B5":"0/not_applicable","B6":"1.7/verified"},
"metrics":{"B2.pr_merge_ratio":{"value":10,"max":12}}},
"requests":{"overall":3,"code":2.6,"process":3.4,"verdict":"conditional","comparable":3,"coverage":"code_trust 4/5; process_trust 4/6","placement":"6","criteria":{"A1":"2.5/verified","A2":"3.2/verified","A3":"0/not_applicable","A4":"2.6/verified","A5":"2.2/warning","B1":"0/not_applicable","B2":"4/verified","B3":"2.7/verified","B4":"2.9/verified","B5":"0/not_applicable","B6":"4/verified"},
"metrics":{"B2.pr_merge_ratio":{"value":12,"max":12}},
"metricsNotPredicted":["A2"],"alternatives":{"A2-history-database-url-critical":{"overall":2.8,"code":2.2,"process":3.4,"verdict":"conditional","comparable":2.8,"coverage":"code_trust 4/5; process_trust 4/6","placement":"12","criteria":{"A2":"1.4/critical"}}}},
"pydantic":{"overall":3.2,"code":2.9,"process":3.5,"verdict":"conditional","comparable":3.2,"coverage":"code_trust 3/5; process_trust 3/6","placement":"2","criteria":{"A1":"2.8/verified","A2":"0/not_applicable","A3":"0/not_applicable","A4":"3.6/verified","A5":"2.4/warning","B1":"0/not_applicable","B2":"4/verified","B3":"3.6/verified","B4":"2.9/verified","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{"B2.pr_merge_ratio":{"value":12,"max":12}}},
"axios":{"overall":3.3,"code":2.6,"process":3.9,"verdict":"conditional","comparable":3.2,"coverage":"code_trust 5/5; process_trust 4/6","placement":"1","criteria":{"A1":"2.5/verified","A2":"3.6/verified","A3":"1.8/warning","A4":"2.5/verified","A5":"2.4/warning","B1":"0/not_applicable","B2":"4/verified","B3":"4/verified","B4":"3.6/verified","B5":"0/not_applicable","B6":"4/verified"},
"metrics":{"B2.pr_merge_ratio":{"value":12,"max":12}}},
"zod":{"overall":3.2,"code":3.1,"process":3.3,"verdict":"conditional","comparable":3.2,"coverage":"code_trust 3/5; process_trust 3/6","placement":"4","criteria":{"A1":"2.5/verified","A2":"3.6/verified","A3":"0/not_applicable","A4":"3.1/warning","A5":"0/not_applicable","B1":"0/not_applicable","B2":"3.4/verified","B3":"3.5/verified","B4":"2.9/verified","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{"B2.pr_merge_ratio":{"value":3,"max":12}}},
"scorecard":{"overall":2.9,"code":2.2,"process":3.6,"verdict":"conditional","comparable":2.8,"coverage":"code_trust 4/5; process_trust 3/6","placement":"13","criteria":{"A1":"1.9/verified","A2":"0/not_applicable","A3":"1.8/warning","A4":"2.3/verified","A5":"2.6/info","B1":"0/not_applicable","B2":"4/verified","B3":"2.7/verified","B4":"0/not_applicable","B5":"0/not_applicable","B6":"4/verified"},
"metrics":{"B2.pr_merge_ratio":{"value":12,"max":12}}},
"ripgrep":{"overall":2.1,"code":2.1,"process":2,"verdict":"at_risk","comparable":2.1,"coverage":"code_trust 3/5; process_trust 3/6","placement":"15","criteria":{"A1":"0.9/warning","A2":"0/not_applicable","A3":"0/not_applicable","A4":"3.1/warning","A5":"2.2/warning","B1":"0/not_applicable","B2":"3.2/warning","B3":"1/verified","B4":"1.9/verified","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{"B2.pr_merge_ratio":{"value":0,"max":12}}},
"guava":{"overall":1.9,"code":1.6,"process":2.2,"verdict":"at_risk","comparable":1.8,"coverage":"code_trust 3/5; process_trust 2/6","placement":"unranked","criteria":{"A1":"1.4/warning","A2":"0/not_applicable","A3":"0/not_applicable","A4":"1.1/warning","A5":"2.2/warning","B1":"0/not_applicable","B2":"3.2/warning","B3":"1.1/warning","B4":"0/not_applicable","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{"B2.pr_merge_ratio":{"value":0,"max":12}}},
"cobra":{"overall":2.5,"code":2.6,"process":2.3,"verdict":"conditional","comparable":2.4,"coverage":"code_trust 2/5; process_trust 2/6","placement":"unranked","criteria":{"A1":"2/verified","A2":"0/not_applicable","A3":"0/not_applicable","A4":"3.2/verified","A5":"0/insufficient_data","B1":"0/not_applicable","B2":"4/verified","B3":"0.6/warning","B4":"0/not_applicable","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{"B2.pr_merge_ratio":{"value":12,"max":12}}},
"sinatra":{"overall":2.2,"code":2,"process":2.3,"verdict":"at_risk","comparable":2.2,"coverage":"code_trust 2/5; process_trust 3/6","placement":"unranked","criteria":{"A1":"1.8/warning","A2":"0/not_applicable","A3":"0/not_applicable","A4":"0/insufficient_data","A5":"2.2/warning","B1":"0/not_applicable","B2":"3.9/verified","B3":"0.6/warning","B4":"2.5/verified","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{"B2.pr_merge_ratio":{"value":10,"max":12},"B2.pr_trace_primitives":{"value":2,"max":2}},
"metricsAbsent":["B6"]},
"automapper":{"overall":2.1,"code":2,"process":2.1,"verdict":"at_risk","comparable":2,"coverage":"code_trust 3/5; process_trust 2/6","placement":"unranked","criteria":{"A1":"1.8/warning","A2":"0/not_applicable","A3":"0/not_applicable","A4":"2.8/warning","A5":"1.4/warning","B1":"0/not_applicable","B2":"3.5/verified","B3":"0.6/warning","B4":"0/not_applicable","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{"B2.pr_merge_ratio":{"value":5,"max":12}}},
"fmt":{"overall":2.7,"code":2,"process":3.3,"verdict":"conditional","comparable":2.8,"coverage":"code_trust 3/5; process_trust 4/6","placement":"11","criteria":{"A1":"2.3/verified","A2":"0/not_applicable","A3":"0/not_applicable","A4":"1.6/verified","A5":"2.2/warning","B1":"0/not_applicable","B2":"3.6/verified","B3":"3.1/verified","B4":"2.5/verified","B5":"0/not_applicable","B6":"4/verified"},
"metrics":{"B2.pr_merge_ratio":{"value":6,"max":12}}},
"carddemo":{"overall":null,"code":null,"process":null,"verdict":"insufficient_source","comparable":null,"coverage":"code_trust 0/5; process_trust 0/6","placement":"unrated","criteria":{"A1":"0/insufficient_data","A2":"0/not_applicable","A3":"0/not_applicable","A4":"0/insufficient_data","A5":"0/insufficient_data","B1":"0/not_applicable","B2":"0/insufficient_data","B3":"0/insufficient_data","B4":"0/not_applicable","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{}},
"cejel":{"overall":2.7,"code":2.3,"process":3.1,"verdict":"conditional","comparable":2.5,"coverage":"code_trust 5/5; process_trust 2/6","placement":"transparency","criteria":{"A1":"2/verified","A2":"3.3/verified","A3":"2.3/warning","A4":"1.8/warning","A5":"2.2/warning","B1":"0/not_applicable","B2":"3.8/verified","B3":"2.4/verified","B4":"0/not_applicable","B5":"0/not_applicable","B6":"0/not_applicable"},
"metrics":{"B2.pr_merge_ratio":{"value":9,"max":12}},
"metricsAbsent":["B6"]}
}
}
```
<!-- expected-values:end -->
