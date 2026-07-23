# Golden-correction evidence-boundary incident — 2026-07-23

## What happened

An isolated AI task was authorized to inspect golden-cohort evidence while implementing a bounded
detector correction. Its first broad file-listing command targeted the mixed private pre-result
evidence root instead of a mechanically separated golden-only view. The listing exposed the
existence and filenames of untouched-prefixed label records to that task.

The task reported the access immediately. It did not open or read any untouched source, label
contents, result, or repository checkout, and it made no code change.

## Response

1. The task was interrupted before implementation.
2. Its worktree and any prospective output were excluded from the correction.
3. A separate evidence task constructed an owner-only golden view containing only golden source,
   opportunities, labels, receipts, reports, and adjudication records.
4. The separated view was content-checked for non-golden records and forbidden mixed-cohort
   references, hash-inventoried, and permission-locked before handoff.
5. A fresh AI task, with no access to the mixed evidence root, was assigned the correction from
   that golden-only view.

## Effect on the untouched boundary

No detector was run against the untouched cohort. No untouched source, label contents, findings, or
results were exposed to a detector or rule author. The incident is nevertheless recorded because
filename metadata exceeded the task's golden-only authorization.

The untouched run remains blocked until the corrected detector passes golden adjudication, the
correction ledger is closed, the detector is frozen, and the explicit one-way execution gate is
satisfied.
