# ADR-0016: Pack rules are lexical by default; semantic analysis is a gated capability

**Scope:** Future Cejel pack-rule proposals only. It does not revive or describe D-series detection as a shipped capability.
**Status:** Accepted 2026-10-06 (operator), with the scoping ruling in the acceptance amendment below.
**ADR number:** 0016
**Date:** 2026-08-12.


> **Current Cejel status note:** The D-series is retired. Any D6 references below are historical examples of scope mismatch, not a claim that D6 is implemented, calibrated, or available to customers.

---

## Context

Historic D-series rule proposals were described in terms of what they were intended to detect — a control whose result is discarded, a
dual-control requirement not enforced, an artifact with no recorded author. Those descriptions are
semantic: they name a property of a program's behaviour.

The historic implementations were lexical. The D6 unobserved-control rule proposed in PR #174 identified a control
by testing whether the basename of the first token on a line matches a word list
(`guard|check|verify|validat|audit|integrity|test`), and identifies an operation the same way. It reads
`git -C "$root" branch -D "$branch" || true` as an invocation of `git`, and therefore as neither. It
examines only `.sh` and `.bash` files.

This was not necessarily a defect in the rule. Lexical rules are cheap, fast, deterministic, trivially explainable to
a customer, and impossible to disagree with once the match is shown. Those are the properties that make a
finding defensible. But a lexical rule described in semantic language will be evaluated against the
semantic claim, and will lose — including by us, internally, which is exactly what happened when a
validation subject was nominated on the strength of what its code *meant* rather than what the rule
*matched*.

## Decision

**Pack rules are lexical by default, and their stated scope must be lexical.**

A rule's specification, its calibration manifest and any customer-facing description state the pattern
class it matches, not the property it is imagined to capture. "An invocation whose command basename
contains a control-word, whose exit status is discarded before a success report, in a shell script with
no errexit" is the claim. "Unobserved controls are absent" is not.

**Every rule declares its analysis tier:**

- **`lexical`** — line and token patterns. No cross-line state beyond a fixed window, no name resolution,
  no control-flow graph.
- **`structural`** — parses the file; can reason about blocks, functions and call sites within it.
- **`semantic`** — resolves names across files, follows data or control flow, reasons about reachability.

**Only `lexical` is in scope today.** No rule ships claiming a tier it does not implement.

**A rule proposal must demonstrate a true positive on its own motivating example.** If the case that
prompted the rule is outside its matcher, that is the finding, and it belongs in the proposal rather than
being discovered after adoption.

**Reverse the semantic deferral when either is observed:**

1. **A design partner or customer requires coverage in a language whose idioms defeat lexical matching** —
   most likely wherever controls are invoked through a runner or a client library rather than as a named
   command.
2. **A false-negative class is demonstrated to matter commercially** — a defect missed in a real
   engagement, traceable to the lexical boundary, where the customer's expectation was reasonable.

**Not triggers:** internal aesthetic preference, a competitor claiming deeper analysis, or the belief that
a rule "should" catch a case it visibly does not.

## Consequences

**Accepted costs.** Some rules will read as narrower than their motivating insight. The D-series loses
its most quotable framings — the honest version of D6 is a mouthful. Rule names may need to change so
that the name does not overclaim the matcher.

**What this buys.** Every finding stays defensible under challenge, because the claim and the mechanism
are the same statement. It also removes an entire class of internal error: a reviewer cannot form
expectations from the rule's prose that its code was never going to meet.

**Interaction with the three-outcome decision.** The two are complementary. Tiering says what a rule can
see; three-outcome reporting says what happened everywhere it could not. Neither alone prevents a report
from implying coverage it did not have.

**Immediate application.** PR #174's spec, manifest and any ADR text describing D6 are rewritten to the
lexical claim, and the rule declares `tier: lexical`. If the reaper case is to be detected, that is a
separate structural rule with its own proposal — not a widening of this one.

**CONSTRAINTS-VERSION: 2026-08-01.3**

## Acceptance — 2026-10-06, with the operator's scoping ruling

Accepted by the operator, 2026-10-06. The text above is unchanged apart from the title marker and
the Status line.

**What the shipped rules are, measured at acceptance.** The tier declarations carded for this
acceptance (cejel #414) classified every shipped pack rule by what its matcher does:

| Tier | Rules |
| --- | --- |
| `lexical` | D6 |
| `structural` | D2, D3, LLM-AGY-002, LLM-DAT-001, LLM-EVL-002 |
| `semantic` | D1, D4, D5, DECISION-CONTRACT-EDGE, LLM-IOH-001, LLM-VAL-001, LLM-AGY-001, LLM-PRV-001, LLM-EVL-001 |

So "only `lexical` is in scope today" did not describe what had already shipped. Where those rules
are reachable: none is reachable from the default scan (`src/index.ts`, `src/scan.ts`,
`src/witan/public-scan.ts`); the D-series and decision-contracts packs are opt-in package
subpaths with no calibration; the LLM pack is reachable only from the calibration entry
`src/calibration/llm-detector.ts`, not from the CLI or a package export.

**Operator ruling, 2026-10-06.** "Only `lexical`" governs **new** rules and anything wired into
the default scan. The rules that already shipped keep their honest declared tiers; the nine
`semantic` rules above are frozen at that list. Concretely, enforced by
`src/packs/__tests__/rule-tiers.test.ts`:

- every shipped rule declares exactly one tier, read from its matcher, never from this policy;
- a rule whose source imports a parser is never declared `lexical`;
- every rule reachable from the default scan is `lexical`, and the walk must reach the default-scan
  entry points, so the check cannot pass on an empty graph;
- the set of `semantic` rules equals the frozen list. Adding a semantic rule, or moving any rule to
  or from `semantic`, fails until the operator rules and the list is edited in a reviewed change.

Wiring an opt-in pack or the LLM pack into the CLI therefore fails the default-scan check unless
every rule it brings is `lexical`. A customer-facing description of any of these rules states
its tier. `semantic` remains out of scope for new rules until one of the two triggers above is
observed.
