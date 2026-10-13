> Republished from the operator's private calibration records, signed there; this copy is the public record.

# Cycle 13 — exposures during the washout, and known instrument limitations, recorded before the re-label

**CONSTRAINTS-VERSION: 2026-08-01.5**

**Status: SIGNED by the operator commit that adds this file.** Written before the re-label case
list is opened (amendment 4 §2; earliest re-label start `2026-10-12T16:55:17Z`, recorded in
`cycle-13-operator-label-seal-2026-10-05.md`) and before any estimate is computed. It carries no
label, case, packet content, frame member or cycle-13 output.

## Why this exists

The re-label measures whether the operator labels the same 40 units the same way twice. Anything
the operator learned between the passes about how the instrument decides could move a second-pass
label, so it is listed here before the second pass, not explained after it. The instrument
limitations below are declared before the estimate for the same reason: a limitation named after a
result reads as an explanation of that result.

## Exposures between the first-pass seal (`2026-10-05T16:55:17Z`) and the re-label

All of these reached the operator in review sessions about Cejel's public scanner and board, not
about cycle 13. None showed a cycle-13 label, case, packet or output.

| When (2026) | What the operator was shown | Record | Criteria touched |
|---|---|---|---|
| 7 Oct | The D-series anchored-defect run: D1–D6 rule behaviour on 12 real defects | (private record) | none of the v17/v23 rubric criteria; listed for completeness |
| 8 Oct | How A1 `non_hollow_test_share` counts a test file as non-hollow: three assertion-idiom patterns, a file matching none counts as hollow; frameworks the patterns miss (AVA, tape/tap, Swift XCTest, ScalaTest/Kotest, NUnit/xUnit) | cejel #427, #406 | A1 |
| 8–11 Oct | How A2 and B2 read commit history: B2 `pr_merge_ratio` reads the last 12 commits; A2's history pass and its `.env`-path check read history; the 0.4.11 check for a populated `DATABASE_URL` password in `.env` history blobs; per-row results of single-commit against full-history scoring on the 24 board repositories | cejel #428, #431, #448, #452 | A2 (history), B2 |
| 9 Oct | Which files B6 (human gate, required review, fail-closed check, kill switch) and A3 (error boundary) accept as evidence, the patterns involved, and where CODEOWNERS is read | cejel #433, #441 | A3, B6 |
| 9–11 Oct | Per-row before-and-after scores on the 24 board repositories for the #433 change and for the full-history regeneration | cejel #449, #455 | headline and A2, B2, B6 |

**Bearing on the frame.** The A2-history exposure (row 3) concerns the same signal as the 8
`CORE-A2-HISTORY-ENV` packets, whose R7 exposure was already recorded at acceptance; it adds to that
exposure and does not replace it. Whether any board repository is a cycle-13 frame member is not
stated here: frame membership is closed while the cycle is live.

The 4 October exposure (CI test, lint and type-check command matching, cejel #409) is recorded in
the seal record and stands.

## Known instrument limitations, declared before the estimate

Both cycle-13 arms (v17 and v23) are produced by alfred's engine copy under (private record).

1. **A1 reads unrecognised test frameworks as hollow.** (private record)
   (alfred `origin/main` at `8ceb0f385`, line 3858 and the two companion patterns after it) counts
   a test file non-hollow only when one of three assertion-idiom patterns matches, so test suites
   in AVA, tape/tap, Swift XCTest, ScalaTest/Kotest matchers and NUnit/xUnit read as hollow. Cejel
   tracks the class as #427 and #406; it is not fixed in either repository.
2. **B6 and A3 credit text that only describes a control.** The same file credits a required-review
   policy from any Markdown file matching `required review|branch protection|protected branch`
   (line 3445), a CODEOWNERS file in any directory (line 3091), an error boundary from any file whose
   name ends in `error.ts`/`.js`/`.tsx`/`.jsx` (line 2284), and implementation evidence from test
   files. Cejel 0.6.3 fixed this class (#433, #441) in the public scanner; alfred's engine copy
   carries it unchanged.
3. **Not a limitation here: clone depth.** The cycle-13 paired scan clones every member with full
   history and asserts the clone is not shallow
   ((private record), header item 4), so the single-commit history
   defect of the public board (cejel #431) does not apply to cycle 13.

Items 1 and 2 are read from `origin/main`. Before the estimate is computed they are to be confirmed
at the two arms' pinned producer commits; if either differs there, an erratum beside this file says
so.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Recorded at: `2026-10-12T11:25:58Z`
- Signature: Houman Azimi-Nejadi — washout exposures and known limitations recorded before the re-label list is opened
