# Untouched-cohort blinding incident — 2026-07-22

Status: open recovery; original untouched cohort retired from release measurement

## What happened

During blind cross-review, an isolated AI reviewer returned source opportunity identities and
first-pass labels from the frozen untouched cohort in an orchestration status message. The message
was delivered to the rule-authoring orchestrator after commit `fcbec17` had been pushed, but before
the detector artifact and formal detector-freeze record existed.

No Cejel detector had been run against either cohort. No detector output existed or was disclosed.
The orchestrator did not modify detector rules in response. Nevertheless, the protocol prohibits a
rule author from seeing untouched ground truth before detector freeze, and the disclosed information
cannot be unseen. Treating the original cohort as untouched would therefore be misleading.

## Containment

- Do not use `cohorts/untouched-manifest.json` or its labels for release measurement.
- Preserve the original immutable manifest and internal label artifacts as audit evidence; do not
  rewrite or delete them.
- Do not run the detector against the retired cohort during ADR-0011 release calibration.
- Make no detector-rule change based on the disclosed information.
- Status and final messages for replacement-cohort work may contain counts, hashes, and artifact
  paths only; source opportunities and labels remain inside isolated work directories.

## Recovery

1. Relock the metadata-only selection policy before any detector execution.
2. Select and independently review a fresh 24-repository untouched cohort disjoint from the golden,
   retired untouched, and reserve lists.
3. Resolve and freeze exact commits and root trees with two recorded AI reviews.
4. Blind-label and cross-review the replacement cohort in isolation.
5. Bind only the replacement manifest and labels into the pre-result commitment.
6. Preserve this incident record in the public correction history.

This incident is a process failure, not a detector finding. The recovery must not be described as
continuous untouched blinding; it is a disclosed retirement and clean restart before execution.
