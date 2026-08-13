# ADR-0014 (proposed): A gate is not in force until it has rejected a known-bad input

**Scope:** Barg Labs control practice; applies to future Cejel gate and rule proposals. Historical Alfred examples are context, not a claim about Cejel's current implementation.
**Status:** Proposed — awaiting an explicit acceptance decision
**ADR number:** 0014
**Date:** 2026-08-12.


> **Current Cejel status note:** Historical D-series references in this record are examples of the general failure mode only. D-series detection is retired and is not a production capability or customer-facing claim.

---

## Context

Controls are currently treated as effective from the moment they merge. Three examples from a single
week, each of which passed review and none of which was ever shown to reject anything:

- `vault-check.yml` was added to `lab_notes` on 2026-08-05 and thereafter cited as the standing gate on
  lesson-batch conformance and seed staleness. As at 2026-08-12 nobody has established that it has ever
  executed, and a seed carrying the literal string `PENDING_REPLACE_WITH_40_HEX_FIX_COMMIT` in place of a
  40-hex anchor is committed in the directory it governs.
- The historic D6 rule proposal in PR #174 reported zero findings across its calibration corpus and abstained on both
  of its ambiguous fixtures. Investigation showed both abstentions are produced by a file-extension filter
  and a command-name regex respectively, not by the judgment the fixtures were named for, and that the
  rule cannot match the exemplar that motivated it.
- A dispatch precondition added to the goal stream was accompanied by a documented phase that carried no
  acceptance line, so the implementing agent correctly skipped it and the guard shipped without the part
  that mattered.

The common shape: a control's existence was taken as evidence of its operation. Nothing in the process
distinguishes *merged* from *working*.

This resembles the defect family for which D-series labels were previously used. D-series detection is
retired; the point here is the general governance standard, not a claim about a current customer-facing
detector. Applying a weaker standard to our own controls than we sell is not sustainable, and would not
survive a design partner asking how we validate our own gates.

## Decision

**No control may be cited as evidence until a run exists in which it failed on a deliberately bad input.**

Concretely, a PR that adds or modifies a gate — CI job, validator, precondition check, pack rule — must
include:

1. **A known-bad input**, committed as a fixture or identified in the existing tree.
2. **The failing run**, pasted: the gate rejecting that input.
3. **The passing run**, pasted: the gate accepting the corrected input.
4. **For CI gates specifically, evidence the workflow executes** — a run URL or `gh run list` output.
   Presence of a workflow file is not evidence of a workflow running; path filters, schedule-only
   triggers, and jobs that exit zero on an empty glob all produce a green history from a gate that has
   never evaluated anything.

**Red-before-green is the acceptance criterion, not a suggestion.** A gate whose failing run cannot be
produced is not merged; it is reported as unable to demonstrate rejection, which is a finding in itself.

**Existing gates are grandfathered only until first cited.** The moment a gate is relied on in an
argument — "the validator would have caught that" — it must be demonstrated or the argument withdrawn.

## Consequences

**Accepted costs.** Every gate PR grows a fixture and two pasted runs. Some gates are awkward to trigger
deliberately, and that awkwardness is itself information: a control that cannot be made to fire on demand
cannot be trusted to fire on its own.

**What this buys.** It closes the gap between a control that exists and a control that operates — which
is the single most repeated defect in this codebase's history, and the one the product is built to sell
against.

**Interaction with the three-outcome decision.** A rule that abstains on everything will now be visible
as abstaining rather than passing, and this ADR requires it to demonstrate a rejection before it counts.
The two together make "the rule found nothing" an unusable claim on its own.

**Immediate application.** `vault-check` acquires a 40-hex anchor assertion and demonstrates it by
failing on the `PENDING_` seed already committed. That seed is a free known-bad input and should be used
before it is corrected.

**CONSTRAINTS-VERSION: 2026-08-01.3**
