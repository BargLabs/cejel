# Golden-run correction round 2 — 2026-07-23

## Trigger

Trusted golden workflow run `29987115210` completed successfully on detector commit
`62501d8e07deed338bd4f3f6b631a5a056b854e0`. Both downloaded artifact archives matched the
SHA-256 digests and sizes recorded by GitHub, and all 24 receipts and reports passed their frozen
manifest, commitment, Git-proof, report, and finding-ID bindings.

Post-run adjudication failed closed:

- emitted findings: 18;
- findings assignable to exactly one frozen opportunity: 0;
- same-path findings outside the frozen span: 14;
- findings on a different path or reference: 4;
- duplicate or ambiguously assignable findings: 0; and
- previously missed present opportunities validly detected: 0 of 6.

The failure was genuine evidence-pointer placement, not path normalization, hashing, or adjudicator
error. The untouched cohort was not run.

## Bounded correction

The correction changed detector behavior only. It did not change frozen manifests, opportunities,
blind labels, release thresholds, workflow logic, rule identifiers, or the public claim boundary.

The implementation:

- anchors findings at the conceptual defect locus used by the frozen rule contract;
- fails closed for ambiguous helper-backed authority surfaces;
- recognizes a bounded exported active-preview execution surface;
- restricts the affected Python action-validation path to unconstrained code execution;
- recognizes bounded discrete and per-case provenance records; and
- requires invoked producer/judge attributes and a retained verdict for the affected self-judge
  path.

Synthetic regressions were added without copying calibration source or private identifiers.

## Pre-rerun result

The isolated golden-only replay for the corrected implementation produced six findings:

- `LLM-IOH-001`: 1;
- `LLM-VAL-001`: 1;
- `LLM-AGY-001`: 1;
- `LLM-PRV-001`: 2; and
- `LLM-EVL-002`: 1.

All six were assignable to exactly one frozen opportunity. There were no extra or unassignable
findings. This replay is a correction check, not release measurement. A new trusted golden workflow,
artifact verification, post-run adjudication, closed correction ledger, and detector freeze remain
required before the one-way untouched run.
