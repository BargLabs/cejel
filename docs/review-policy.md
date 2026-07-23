# Dual-review policy

Every Cejel pull request requires two recorded review passes before it is merged. Independent
reviewers are preferred. When the owner is working alone, the same AI task may perform two
sequential passes with distinct audit lenses; the records must disclose that these are sequential
self-review passes, not independent reviewers.

Each pass must:

1. inspect the complete base-to-head diff and relevant generated or runtime artifacts;
2. report `APPROVE` or `REQUEST_CHANGES`;
3. identify the reviewer with a stable identity and disclose whether it is human or AI;
4. list findings with severity and resolvable file, line, command, or external-check evidence;
5. avoid editing during the review pass; and
6. be rerun after material fixes when its verdict was `REQUEST_CHANGES`.

AI review is permitted when independent people are unavailable, but it is never described as human
review. Sequential passes by the same AI task must be recorded separately, must re-read the exact
base-to-head diff, and must use materially different review lenses (for example, behavioral
correctness first and security/reproducibility second). A material fix invalidates earlier
approvals and requires both passes again on the corrected exact commit. Disagreements are explicitly
adjudicated and recorded.

Passing CI is supporting evidence, not either review pass. A release or calibration gate may impose
additional evidence requirements beyond this repository-wide minimum.
