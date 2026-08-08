# PR #51 paired golden-cohort diagnostic v1 — pre-measurement erratum

Status: superseded before measurement.

**CONSTRAINTS-VERSION: 2026-08-01.3**

The v1 preregistration merged in #112 at `97e3edc132391db756f69749e3cbb3bc2398bbfa`.
No execution bundle had been built, no arm had run, and no frozen golden checkout had been opened
when its candidate-identity preflight stopped the procedure.

The original #51 patch has stable patch ID `3c9f05a6a704ed54ab1338f20a75f07bfedc256f`.
Applying that exact one-commit change without conflict to the v1 baseline produced the same eight
changed files and the same 384 insertions and 59 deletions, but stable patch ID
`ef784f23c031e3f2d080312956429bf9546bce85`. `git range-diff` localized the difference to unchanged
context following #51's four added `CHANGELOG.md` lines: the original context was `---`; current
main's context is `### Fixed`. The added lines themselves were unchanged.

Consequently, v1's stable-patch-ID equality check cannot accept Git's unmodified, conflict-free
application of #51 to current main. This is a preregistration execution defect, not an experiment
result or a correction to any published claim. V1 must not be executed or interpreted.

The superseding v2 protocol replaces only that context-sensitive identity check. It requires Git's
tree-only merge of the bound baseline and original #51 head to complete without conflict, then
requires the candidate commit's tree to equal that mechanically derived tree exactly. All frozen
inputs, outcomes, execution order, claim boundaries, and disposition rules remain unchanged.
