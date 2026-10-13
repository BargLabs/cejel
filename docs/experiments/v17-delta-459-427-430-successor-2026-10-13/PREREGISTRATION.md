# Successor preregistration — corrected AVA binding, #459/#427/#430 public delta

**CONSTRAINTS-VERSION: 2026-08-01.5**

This is a new preregistration, committed and pushed before any successor arm is scored. The
original protocol at dd9e16a92d8b1dc46dd85635607e1210fc800d44 is not edited. Its ERRATA.md
records that it completed before459 and after459 (23 public rows each), but withdrew the fixes
arm before executing it after a quoted-import negative control exposed a source defect. No
per-row corpus score comparison was read to choose this successor's source or expected values.
The original outputs remain local, unchanged. Two baseline arms will therefore have been
scored twice across the two declared protocols; no original row error is repaired or retried.

## Bindings and protocol

- before459: 988721e957dedd6c7649a1fb8cb4475459c573a8 (same v17 scorer as v0.6.3).
- after459: b673493ee1a640026530f7cc65ac94aff8139bf1 (#459's merge).
- fixes: be8ce629ba2bf1df6eb6af8487508fda838ae578 (quoted-import correction included).

Use plan.json and the unchanged tested harness in
../v17-delta-459-427-430-2026-10-13/harness/. Its source checks bind every arm to these full
commits and clean tracked source before importing the scanner. Use a fresh scratch output root
and the unchanged verified copies of all 23 public manifest entries. Each target must be clean,
non-shallow, at its complete manifest commit, with the same commit count before and after.
Package version is 0.6.3; source identity is the full arm commit, not the version string.

The corpus file digest, public-only scope, full-history/no-filter protocol, one host,
generatedAt 2026-10-13T00:00:00.000Z, v17 rubric, explicit disabled ingest, once-per-arm rule,
raw-report locality, scalar-only publication and placement formula are unchanged from the
original protocol. Non-public implementation, pins, reports and values remain excluded and
are not claimed evaluated. No label-class material is required. No v25 calibration, recall,
precision, external-recall corpus, board publication, or default promotion is performed.

## Expected values — carried unchanged, not revised from outcomes

E0: 23/23 public rows complete per arm; zero errors, target identity/history changes or dirty
checkouts. Each source arm and the plan digest match its manifest. Existing outputs are refused.

E1: before459 to after459 changes scoring only through A3 prod_readiness_primitives. Other
criteria are unchanged at scoring level. Fingerprint metadata changes on every row.

E2: after459 to fixes changes scoring only in A1 non_hollow_test_share and A2's digest comparison
warning/hygiene surface, including not-applicable transitions. Composite scores/verdicts may
move through those criteria. All weights and thresholds remain unchanged.

E3: point forecast: zero public scoring rows move in each pair; zero placements move. This
uncertain forecast is identical to the original preregistration. Preserve and explain every
miss, rather than moving a target, widening an exclusion or replacing the expected value.

E4: all 23 fingerprints change in each pair; zero complete reports are byte-identical. Report
byte differences independently after removing only that field. Record every public row, with
scalar scoring/coverage/status/placement values, changed criterion ids and changed top-level
field names. Evidence text, paths, private material and adjudication data are not exported.

E5: retain unexpected criterion changes and errors; score each arm once in this fresh protocol.
Do not repair a row and rerun it. A later source/protocol defect requires another erratum and
successor. Results must preserve this preregistration as a strict ancestor. Merge with a merge
commit; do not squash the preregistration and result into one commit.
