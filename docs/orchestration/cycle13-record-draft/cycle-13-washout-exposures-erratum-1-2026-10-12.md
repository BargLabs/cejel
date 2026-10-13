> Republished from the operator's private calibration records, signed there; this copy is the public record.

# Cycle 13 — washout record, erratum 1: the instrument, and one exposure after signing

**CONSTRAINTS-VERSION: 2026-08-01.5**

**Status: SIGNED by the operator commit that adds this file.** Written before the re-label case
list is opened and before any estimate is computed. It corrects and extends
`docs/calibration/cycle-13-washout-exposures-and-known-limitations-2026-10-12.md` (signed `67cd1c5f6`, merged in (private record)). It carries no label, case, packet content,
frame member or cycle-13 output.

## 1. Correction: which code produces the arms

The record says both arms are produced by alfred's engine copy under (private record). They are
not. Both arms are scored by the published `@cejel/cejel@0.4.11`, gitHead `d30ac4ba`
(`docs/calibration/cycle-13-instrument-boundary-amendment-2026-09-28.md`, (private record);
(private record), header item 1: "THE INSTRUMENT IS THE PUBLISHED PACKAGE"). The record's line numbers
point into alfred's copy, which is not the instrument.

The limitations were re-read at the instrument, cejel `d30ac4ba`,
`src/witan/repo-signals.ts`. Both arms run at that one commit, so this is also the confirmation
at the arms' pinned producer that the record asks for before the estimate.

- **Item 1 (A1 hollow) holds.** Lines 5428–5458 (`JS_TEST_ASSERTION_PATTERN`,
  `CPP_TEST_ASSERTION_PATTERN`, `MULTI_ECOSYSTEM_TEST_ASSERTION_PATTERN` and the suite-skip rule)
  are byte-identical to the alfred lines the record cited (`8ceb0f385`, 3858–3888).
- **Item 2 (B6 and A3 credit description) holds, at different lines.** CODEOWNERS in any
  directory (4385); any documentation file matching `REQUIRED_REVIEW_PATTERN` (4388, pattern at
  4843); error boundary by file name alone (3146); `isImplementationFile` (8021–8026) has no test
  exclusion.
- **Replaced sentence.** "Cejel 0.6.3 fixed this class (#433, #441) in the public scanner;
  alfred's engine copy carries it unchanged" is replaced by: 0.4.11 predates the 0.6.3 fix, so
  the class is present in the instrument under both arms.
- **Item 3 (clone depth) stands.** The full-history, non-shallow acquisition is enforced by the
  paired-scan script itself, which the record cited correctly.

## 2. Exposure after the record was signed

| When (2026) | What the operator was shown | Record | Criteria touched |
|---|---|---|---|
| 12 Oct, after 11:25:58Z | Review of a change to A3: which Express error-handler signatures count as an error-handling layer (underscore-prefixed request and response parameters, a trailing comma); which files are read for a health or readiness route (repository-root `server`/`index`/`app`/`main` entry files, and `server/`, `backend/`, `api/` trees); and inline health-route credit under a prospective v25 | cejel #459, merged `b673493` | A3 (error boundary; health and readiness route) |

This adds to row 4 of the record (9 Oct, A3 error-boundary evidence), which it does not replace.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Recorded at: `2026-10-12T12:50:10Z`
- Signature: Houman Azimi-Nejadi — erratum 1 to the cycle-13 washout record, signed before the re-label list is opened
