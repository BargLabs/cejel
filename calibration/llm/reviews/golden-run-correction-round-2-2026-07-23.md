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
- restricts the affected Python action-validation path to unconstrained code execution;
- recognizes bounded discrete and per-case provenance records only when a supported local model
  invocation precedes the result; and
- requires invoked producer/judge attributes and a retained verdict for the affected self-judge
  path.

Synthetic regressions were added without copying calibration source or private identifiers.

## Pre-rerun result

The correction implementer's initial isolated golden-only replay produced six findings:

- `LLM-IOH-001`: 1;
- `LLM-VAL-001`: 1;
- `LLM-AGY-001`: 1;
- `LLM-PRV-001`: 2; and
- `LLM-EVL-002`: 1.

All six were assignable to exactly one frozen opportunity and there were no extras. During the
owner's first behavioral review, however, the `LLM-IOH-001` correction was rejected: it activated
an exported active-preview builder from semantic names and repository-level model presence, while
the actual model-to-sink path spans multiple unsupported wrappers. That inference does not satisfy
the frozen rule contract's requirement for a deterministically resolved inter-procedural path.

The same owner review rejected both candidate `LLM-PRV-001` findings because neither repository has
a resolved recognized model invocation or deterministic invocation-to-result path. Evaluation-shaped
names and properties do not satisfy the frozen provenance rule's required-evidence contract. The
detector was narrowed to require a supported local model invocation before the result.

The corrected pre-rerun expectation is therefore three assignable findings and three explicit
missed defects: one `LLM-IOH-001` unsupported multi-hop path and two `LLM-PRV-001` unresolved
producer-to-result paths. Each must remain a false negative and may be closed only as an accepted
limitation. This is a correction check, not release measurement. A new trusted golden workflow,
artifact verification, post-run adjudication, closed correction ledger, and detector freeze remain
required before the one-way untouched run.
