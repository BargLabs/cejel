# ADR-0003 — An unobserved control is absent

**Status:** Proposed
**Date:** 2026-08-11
**Related:** ADR-0001 (coverage is disclosed, never discounted); D-series exact-signature taxonomy D1–D5; proposed rule D6.

---

## Context

Cejel abstains. Where the evidence does not support a conclusion, it says so rather than guessing —
that restraint is the product.

This creates an apparent conflict with a principle the codebase has been converging on all week:
**a control that cannot be observed to have run provides no assurance.** Stated carelessly, that reads
as inferring a negative from missing evidence, which is exactly what abstention forbids.

The conflict is apparent, not real, and this record exists to state why — because an implementer who
resolves it the wrong way will either weaken abstention or refuse to report a whole class of real
defect.

The week's evidence, from Barg Labs' own repositories:

- A worktree reaper printed *"reaped worktree … verified pushed+clean before removal"* for a directory
  that remained on disk. The success line did not depend on the removal's outcome.
- A goal runner reported *"PRs opened: #846"* for a run that created nothing, having pattern-matched a
  PR number out of an agent's refusal text.
- A byte-pin audit reported a changed batch as unexplained because its search space was pull requests
  and the change had arrived by an admin merge carrying no PR number.
- A triage classified a pull request as documentation on the strength of a summary that stated the
  file list was unavailable. It added 218,786 lines.

In each case a control existed, ran, and reported. In none of them did the report depend on the thing
it described.

## Decision

**For evidentiary purposes, a control whose execution and outcome cannot be observed from the evidence
available to the relying party is treated as absent.**

Cejel will report such a control as providing no assurance, and will do so with certainty rather than
abstention.

## Why this is not a violation of abstention

The two rules govern different objects, and the distinction is the whole of this record.

**Abstention governs claims about the world.** *Is this code correct? Is this test meaningful? Does
this configuration hold in production?* Where the evidence does not settle such a question, Cejel
abstains, because the answer exists and Cejel does not know it.

**This decision governs claims about the evidence.** *Can a third party verify that this control ran
and that its result mattered?* That question is settled entirely by what is present. If the outcome
cannot be observed, the answer is no — not unknown, no — and it is answerable with certainty because
the evidence is the entire subject.

Cejel therefore asserts: **not** "this control did not run", **but** "the running of this control is
not evidenced, and it therefore provides no assurance to anyone who was not present."

That is a statement Cejel can make from the bytes in front of it, which is the only kind it makes.

## Consequences

**Accepted.**

- A declared control whose failure cannot change an outcome is reportable as a finding, not as an
  abstention. The D6 proposal mechanises only two exact shell signatures of this broader principle;
  silence from those signatures is not evidence that unobserved controls are absent.
- The reporting is *about the evidentiary state*, never about intent, competence, or whether the
  checked property in fact holds. It may hold; something else may guarantee it. Cejel does not say.
- Subjects will occasionally receive findings on controls that are deliberately advisory. The rule's
  abstention conditions exist to keep this rare, and where purpose is genuinely unclear the rule
  abstains rather than reporting.
- Any future expansion will first be applied to Cejel and Alfred before any broader claim is made.
  Candidate conditions in those repositories must be verified rather than assumed.

**Rejected as consequences.**

- This does **not** license inferring that any checked property is false.
- It does **not** license scoring a subject down for absent evidence generally. ADR-0001 stands:
  coverage is disclosed, never discounted. Undetectable is not the same as unevidenced-and-declared.
- It does **not** extend to controls outside the scanned repository. A control enforced by a system
  Cejel cannot see is unobserved *by Cejel*, which is a limit of the scan, not a property of the
  subject. Those cases abstain, and the abstention is disclosed.

That third boundary is the one most likely to be eroded. The decision applies to a control **declared
within the subject** whose outcome is provably inert **within the subject**. It does not apply to
silence.

## Alternatives considered

**Abstain on inert controls.** Consistent with the existing posture and wrong: an inert control is not
an unanswered question, it is an answered one. Abstaining would suppress the single most reliably
detectable class of defect this codebase has encountered.

**Score inert controls as failures of the property they check.** Rejected. A CI gate that cannot fail
does not mean the build is broken. Conflating the control with its subject is the error that makes
security tooling untrustworthy, and Cejel's position depends on not making it.

**State it only as a rule, with no recorded basis.** Rejected. A detector whose principle is unwritten
gets argued with case by case, and the argument is always about the instance rather than the rule.
Writing the basis down is what makes a finding discussable without being relitigated.

## Notes

This decision is the general form of the defect family recorded across the 2026-08-08 lesson seeds. It
is stated here as a position rather than only as a detector because the position is prior. The D6
proposal implements two bounded examples of the position; it is not enforcement of the general claim.
