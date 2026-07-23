# Dual-review policy

Every Cejel pull request requires two recorded review passes before it is merged. The passes should
be isolated from one another until both initial verdicts are recorded, then reconciled in the PR.

Each pass must:

1. inspect the complete base-to-head diff and relevant generated or runtime artifacts;
2. report `APPROVE` or `REQUEST_CHANGES`;
3. identify the reviewer with a stable identity and disclose whether it is human or AI;
4. list findings with severity and resolvable file, line, command, or external-check evidence;
5. avoid editing during the review pass; and
6. be rerun after material fixes when its verdict was `REQUEST_CHANGES`.

AI review is permitted when independent people are unavailable, but it is never described as human
review. Two prompts in one context are not enough: the passes must run in isolated reviewer contexts
without seeing each other's conclusions. Disagreements are explicitly adjudicated and recorded.

Passing CI is supporting evidence, not either review pass. A release or calibration gate may impose
additional evidence requirements beyond this repository-wide minimum.
