# Redaction ledger — what this publication changed in each file, and what it withheld

Every republished file in this directory was read end to end against the disclosure boundary
(`CLAUDE.md` / `AGENTS.md`, IP boundary of 2026-08-18) before publication. This file records the
result for each one. **A file with nothing withheld says so explicitly.** A silent omission would
be a false record, and so would a silent absence of omissions.

Source: the operator's private calibration records at private commit
`15adb0506d5e6693193c959257fa2c44c47b7cd9`. The result record is the version added by `315964e4d`.

## The three changes this publication makes

1. **Republication line.** Every Markdown file opens with the line "Republished from the operator's
   private calibration records, signed there; this copy is the public record." The estimator spec,
   being JSON, carries the same sentence as a new first member, `"republication"`. Nothing else in
   the JSON changes except the substitutions below, and it still parses.
2. **"(private record)".** Replaces each reference a public reader cannot open: a pull-request
   number in the private repository, a path in it (including source paths of the private engine
   copy), a branch name in it, and a record in it that is not republished here. Where the reference
   was the whole of a parenthetical, the parentheses are kept once. Commit ids and hashes are kept
   as written. These are **kept**, because a reader can open them: paths of records republished in
   this directory; cycle-12 records and `untouched-estimator-spec-v3.json`, published in
   `docs/calibration/v22-detection-recall/`; BargLabs/cejel issue and pull-request numbers; cejel
   source paths. Bare custody artifact names (`draw.json`, `units.jsonl`, `labels/…`,
   `estimate/…`) are kept so that each published hash is bound to a named artifact. Their contents
   are closed.
3. **Redaction in place**, marked with "withheld under the disclosure boundary" and the reason.
   Erratum 2 is the only file that needed one.

## The closed classes, as applied here

- **Adjudication labels**, individually or as any table from which a label for a unit could be
  recovered, including per-label counts, arm totals and rule-level counts. None of the 18 source
  files carries one. The result record carries only design-weighted aggregates and the
  within-rater agreement, both published by commitment (amendment 4 §4).
- **Evidence packets, excerpts, the sealed key, reviewer notes and custody outputs.** None is in
  any source file. Their hashes are, and stay.
- **Frame membership.** No source file names a cohort member, and membership is not revealed
  (operator ruling, 2026-10-13): with the drawn unit ids (`repo-NNN:RULE`, protocol §8) public, a
  reveal would let a reader recover partial label classes. `repo-NNN` is a custody draw index.
- **Counterparty specifics.** Withheld from erratum 2, below.

## Per file

| File | Withheld | Changed |
|---|---|---|
| `cycle-13-estimation-protocol.md` | Nothing withheld. | Republication line; private-repository preregistration path, PR numbers and scan-record path. |
| `cycle-13-estimation-protocol-amendment-1-2026-09-29.md` | Nothing withheld. | Republication line; PR numbers and the draft directory path. |
| `cycle-13-estimation-protocol-amendment-2-2026-10-01.md` | Nothing withheld. | Republication line; PR numbers and the scan-record path. cejel #378 and #381 kept. |
| `cycle-13-estimation-protocol-amendment-3-2026-10-01.md` | Nothing withheld. | Republication line; PR numbers and the carried-requirements register path (not republished). |
| `cycle-13-estimation-protocol-amendment-4-2026-10-02.md` | Nothing withheld. | Republication line; the packet-acceptance record (not republished) and a PR number. |
| `cycle-13-estimation-protocol-amendment-5-2026-10-12.md` | Nothing withheld. | Republication line; private engine source paths and the scan-record path. |
| `cycle-13-instrument-boundary-amendment-2026-09-28.md` | Nothing withheld. | Republication line; preregistration path, PR numbers, and a file in the private site repository. cejel #336, #348–#353 kept. |
| `cycle-13-draw-acceptance-2026-09-28.md` | Nothing withheld. | Republication line; preregistration path, draw directory, exclusion-ledger path, PR and issue numbers, and the draw record. |
| `cycle-13-draw-addendum.md` | Nothing withheld. The 177 drawn unit ids stay (protocol §8). | Republication line; draft path, PR numbers, the unit-table script path, the branch name and the draw-record paths. cejel #384 and #387 kept. |
| `cycle-13-promotion-policy.md` | Nothing withheld. | Republication line only. |
| `untouched-estimator-spec-v4.json` | Nothing withheld. | `"republication"` member; draft paths, PR numbers and private engine source paths in `status`, `implementation`, `implementationSeal`, `declaredLimitations` and `draftPointsConfirmed`. |
| `cycle-13-operator-label-seal-2026-10-05.md` | Nothing withheld. | Republication line; the packet-acceptance record. |
| `cycle-13-operator-relabel-seal-2026-10-12.md` | Nothing withheld. | Republication line only. |
| `cycle-13-washout-exposures-and-known-limitations-2026-10-12.md` | Nothing withheld. | Republication line; one private PR number and private engine source paths. Line numbers and commit `8ceb0f385` kept. |
| `cycle-13-washout-exposures-erratum-1-2026-10-12.md` | Nothing withheld. | Republication line; PR numbers, the paired-scan script path, and the quoted engine path. |
| `cycle-13-washout-exposures-erratum-2-2026-10-12.md` | **The "What the operator was shown" cell**, under counterparty specifics. | Republication line; one PR number. The cell now reads: "a design partner's unverified account of what the scanner reads, and product requests; withheld under the disclosure boundary (counterparty specifics)". Withheld: the partner's account of how the scanner read its repositories, and every one of its requests. Kept: the erratum's existence, its date, the record column (which names no partner) and the criteria column. |
| `cycle-13-estimate-pre-run-2026-10-13.md` | Nothing withheld. | Republication line; two private PR numbers and the private runner path. |
| `cycle-13-result-2026-10-13.md` | Nothing withheld. | Republication line; the run's PR number. |

`README.md` and this file were written for this publication, not republished.

**To check a file against its source,** in a checkout of the private repository:
`git show 15adb0506d5e6693193c959257fa2c44c47b7cd9:docs/calibration/<file>` against this directory's copy.
