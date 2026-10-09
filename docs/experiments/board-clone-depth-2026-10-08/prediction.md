# Board clone-depth measurement: prediction (written before any full clone was made)

**CONSTRAINTS-VERSION: 2026-08-01.5**

Status: committed before the run (`b3a5083`), a strict ancestor of the results commit. Published
2026-10-09 as a propose-only record. At the operator's instruction, the commit that adds the
results also edits this file: the private board row is named only as "the private row", and
its depth-1 prediction is removed, because its depth-1 arm is new data about a private
repository. No other prediction changed; `b3a5083` holds the original text.

## Question

How much do the 25 published board rows move when the only change is the clone depth? Every
row is rescored from a full-history clone with the published tool (`@cejel/cejel@0.4.9`, default
rubric `witan-rubric-v17-2026-07-24`) at the commit its published report names
(`repo.headSha`), with its published product name.

## Method (the same for every row)

- **Reproduction arm (depth 1).** This is the board's public-row fetch:
  `git init`, `remote add`, `fetch --depth 1 --filter=blob:none origin <sha>`,
  `checkout --detach FETCH_HEAD`, then `npx -y @cejel/cejel@0.4.9 <dir> --product-name <name>`.
  - **Gate:** every row's criteria (score, status, metrics value/max), code score, process score,
    overall score and verdict must equal the published report. A row that fails the gate is
    reported as not reproduced, and its full-arm delta is not attributed to depth.
  - **The private row:** its published row was scored from full history, so only its full arm
    is reported.
- **Full arm.** All 25 rows: `git clone --no-checkout <url>`,
  `fetch --no-tags origin <sha>`, `checkout --detach <sha>`. There is no blob filter, so every
  historical blob is present for A2's history pass, which runs with network transports disabled.
  Same CLI and product name.
  - **Control:** the private row's full arm must reproduce its published row exactly. A difference there
    means the method differs from the board's, not that depth matters.
- **Recorded per arm:**
  - commits present (`git rev-list --count HEAD`);
  - B2 `pr_merge_ratio` value/max and B2 score/status;
  - process, code and overall scores and the verdict;
  - A2 score/status and findings;
  - whether A2's history pass could have run: under v17 it is skipped when the current tree already
    yields a committed-secret finding.

## Arithmetic the predictions rest on (v17)

- **B2.** B2 = 4 × (0.8 × min(trace/2, 1) + 0.2 × ratio). Every published row has trace ≥ 2/2, so
  B2 = 3.2 + 0.8 × ratio, rounded to 0.1. Its range is 3.2 to 4.0.
- **B2's history read.** It reads `git log --max-count=12`, so a full clone gives max =
  min(12, commits). A subject counts as a PR merge if it matches
  `/merge pull request|pull request|#\d+/i`.
- **Process.** Process = the mean of the applicable process criteria (n_p = 2 to 4 per row, below),
  so ΔProcess ≈ ΔB2 / n_p.
- **Overall.** Overall = (code + process) / 2, so ΔOverall ≈ ΔB2 / (2·n_p).
- **Rounding.** Each level rounds to 0.1, so any predicted delta carries ±0.1.
- **Verdict bands.** ≥3.5 verified, ≥2.5 conditional, ≥1.5 at_risk, else unverified.

## Direction predictions

- **Rows published at 1/1** (the depth-1 HEAD subject carried `#N`): the full ratio is k/12 ≤ 1,
  so **B2 down or equal, never up** (ΔB2 ∈ [−0.8, 0]). Overall down or equal by at most
  0.4/n_p (+0.1 rounding).
  - Expected size: these repos mostly squash-merge, so `(#N)` subjects should dominate. Most should
    land at 10–12/12, a B2 drop of 0–0.1 and no overall change. This is a lower-confidence point
    expectation; the direction is the firm prediction.
- **Rows published at 0/1** (the HEAD subject lacked `#N`): **B2 up or equal, never down**
  (ΔB2 ∈ [0, +0.8]). Overall up or equal by at most 0.4/n_p (+0.1).
  - Expected size: repos whose maintainers commit directly (esbuild, ripgrep, fmt, and guava's
    exported commits) stay near 0/12, with no change. Mixed repos (fastapi, flask, vue, zod) rise
    partway. This is lower confidence.
- **The private row (published 12/12 from full history):** full arm, no change (control).
- **carddemo:** abstains (insufficient_source) on both arms. No change.
- **A2:** the full arm hands A2's history pass every commit instead of one. **A2 down or equal,
  never up** on rows where A2 is applicable: history can only add deleted or rotated credential
  findings. Expected: unchanged on most rows (low confidence). A2 rows that are not applicable
  should stay not applicable.
- **Everything else** (A1, A3–A5, B3, B4, B6): unchanged. They read the checked-out tree. B4's
  audit freshness reads only HEAD's committer date.

## Verdict-change predictions (from the bounds above, B2 only)

| row | published overall / verdict | n_p | B2 ratio | overall bound (full) | can the verdict change? |
|---|---|---|---|---|---|
| the private row | 3.2 conditional | 4 | 12/12 | unchanged (control) | no |
| automapper | 2.2 at_risk | 2 | 1/1 | 2.0–2.2 | no |
| axios | 3.3 conditional | 4 | 1/1 | 3.2–3.3 | no |
| biomejs | 3.0 conditional | 4 | 1/1 | 2.9–3.0 | no |
| carddemo | abstains | – | – | abstains | no |
| cejel | 2.8 conditional | 3 | 1/1 | 2.7–2.8 | no |
| cobra | 2.5 conditional | 2 | 1/1 | 2.3–2.5 | **yes: to at_risk if cobra's ratio falls far enough** |
| django | 3.1 conditional | 2 | 1/1 | 2.9–3.1 | no |
| esbuild | 2.5 conditional | 3 | 0/1 | 2.5–2.6 | no |
| express | 3.0 conditional | 3 | 1/1 | 2.9–3.0 | no |
| fastapi | 3.0 conditional | 3 | 0/1 | 3.0–3.1 | no |
| flask | 2.9 conditional | 3 | 0/1 | 2.9–3.0 | no |
| fmt | 2.6 conditional | 4 | 0/1 | 2.6–2.7 | no |
| guava | 1.9 at_risk | 2 | 0/1 | 1.9–2.1 | no |
| pydantic | 3.2 conditional | 3 | 1/1 | 3.1–3.2 | no |
| react | 3.0 conditional | 3 | 1/1 | 2.9–3.0 | no |
| requests | 2.9 conditional | 4 | 1/1 | 2.8–2.9 | no |
| ripgrep | 2.1 at_risk | 3 | 0/1 | 2.1–2.2 | no |
| scorecard | 2.9 conditional | 3 | 1/1 | 2.8–2.9 | no |
| sinatra | 2.4 at_risk | 4 | 1/1 | 2.3–2.4 | no |
| svelte | 3.1 conditional | 3 | 1/1 | 3.0–3.1 | no |
| vite | 3.4 conditional | 3 | 1/1 | 3.3–3.4 | no |
| vue | 2.9 conditional | 3 | 0/1 | 2.9–3.0 | no |
| zod | 3.2 conditional | 3 | 0/1 | 3.2–3.3 | no |

Bounds are before ±0.1 rounding. The only row whose B2 bound alone reaches a verdict edge is
**cobra** (2.5, two process criteria). An A2 history finding on an A2-applicable row could move
code trust independently of B2. That is not bounded above, and if it happens it will be reported
separately.

Falsifiers:
- a 1/1 row whose B2 rises, or a 0/1 row whose B2 falls;
- any change in a criterion other than A2 or B2;
- the private row's full arm not reproducing its published row;
- any depth-1 row failing the reproduction gate.
