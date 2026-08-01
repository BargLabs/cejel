# D-series cross-artifact conformance pilot — first result

Status: **failed before subject observation; no conformance verdict**

The frozen first run did not establish the planned non-fixture D1 existence proof. All three Alfred
worktrees matched the preregistered revisions and Git blobs, but the adapter failed to start on the
first, defective subject. The project-level pnpm launcher could not complete registry-signature
verification while offline.

This is an execution failure under the preregistered stop rule. It is not a zero finding, an
abstention, or evidence that the historical defect is undetectable.

## Frozen sequence

| Artifact | Commit |
|---|---|
| Preregistration | `e61be2079b467ce92eb007334af948ea55726705` |
| Frozen checker | `03871339c3df74eadfe8437f85825ee2b6aa6e9a` |
| First execution | `2026-08-01T18:14:53Z` |

The preregistration is a strict ancestor of the checker. The checker was pushed before execution.
It was not edited after the failure, and the failed run was not retried with a different launcher.

## Outcome

| Measure | Result |
|---|---:|
| Planned real-defect denominator | 1 |
| Subjects evaluated | **0** |
| Findings | **not defined** |
| Conformance verdict | **none** |
| Claim-bearing | **no** |

Failure stage: `defective_adapter_launch`.

Failure code: `pnpm_signature_verification_fetch_failed`.

The exact registry error is intentionally not promoted into the evidence artifact; it is an
environment diagnostic, not subject evidence. No subject summary was produced and no partial
observation was retained.

## Interpretation

The D1–D5 pack still has exact-signature fixture acceptance and frozen public-cohort precision
results, but it still has no non-fixture conformance existence proof. Any follow-up must be a new,
separately preregistered execution contract with its runtime frozen before launch. It must retain
this failed result rather than replacing it.
