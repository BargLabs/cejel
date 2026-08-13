# Next calibrated default candidate v22 — public pre-execution instrument NO-GO

Status: **terminal NO-GO before controls, candidate source acquisition, scans, review, labels, or estimation**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Decision

The v22 execution authorization is terminal **NO-GO — instrument incompatibility before
source execution**. This is not a calibration result and supplies no evidence for or against
v22 quality, precision, recall, false-positive rate, rubric agreement, or default promotion.

The private terminal record merged in Alfred at
`748dc214b96119cb24479ae9c4ead928fbd61c9b` (PR #903). Its normative document is:

| Private artifact | Git blob |
| --- | --- |
| `docs/calibration/next-default-v22-2026-08-11-recovery/execution-instrument-no-go.md` | `96ee378338f9d832ee0fe4ce4af8f9f465665405` |

## Why no execution occurred

The public execution preregistration bound the frozen Cejel candidate to an explicit v22
selection. Before any candidate repository source was acquired, mechanical inspection showed
that the frozen scorer could accept that selection only through a programmatic API; neither the
committed CLI nor the v4 no-egress wrapper had a committed v22-selecting scan driver. The default
CLI would therefore measure retained v17, not candidate v22.

Adding a selector now would change the frozen candidate. Running the default CLI would violate the
preregistration. The correct action was to stop before source execution.

| Activity | Count |
| --- | ---: |
| v22 controls invoked | 0 |
| candidate sources acquired or decoded | 0 |
| candidate scans | 0 |
| packets, labels, or estimates | 0 |

## Effect on public claims

The completed metadata-only order freeze and both execution preregistrations remain accurate
records of their respective actions and constraints. Their frozen order is retired under the
terminal rule and cannot be reused.

`witan-rubric-v17-2026-07-24` remains the sole calibrated public default. Its published figures
are unchanged. `witan-rubric-v22-prospective-2026-08-10` remains unmeasured and inherits none of
the v17 calibration claims. No default-rubric promotion is authorized.

## Any successor

If v22 remains a candidate, a successor must first freeze a new Cejel candidate revision that
contains a committed, tested v22-selecting driver callable under the no-egress wrapper. It then
requires a fresh preregistration, fresh metadata-only order freeze, independently verified
receipt, synthetic end-to-end validation, and new public counterpart before any candidate source
is read. This terminal NO-GO is not a v22 result and cannot be converted into one.
