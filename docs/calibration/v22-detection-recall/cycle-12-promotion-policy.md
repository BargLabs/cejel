# Cycle-12 promotion policy

> **Published transcription.** Operator-signed source record, held in the private measurement
> repository. **Nothing is redacted from this file** — see [`REDACTIONS.md`](REDACTIONS.md).
> Path, pull-request and commit references below are that repository's and do not resolve here;
> they are code spans, not links.
>
> **Transcription note, not a correction.** As with
> [`cycle-12-estimation-protocol.md`](cycle-12-estimation-protocol.md), the status line below
> reads `DRAFT — pending operator signature` while the signature block at the end is complete
> (2026-09-05T12:35:06Z). By the document's own rule it is in force; the stale line is
> reproduced unchanged rather than tidied.

Status: **DRAFT — pending operator signature.** Must be signed before
`cycle-12-estimation-protocol.md`'s scan or draw runs — or the same day, but never after any
measurement output from that protocol exists. A promotion-policy record drafted after seeing
the estimate is not a pre-registration; it is a post-hoc rationalization wearing
pre-registration's clothes, which is precisely the failure this split document exists to rule
out (see the estimation protocol's §5).

CONSTRAINTS-VERSION echoed from `docs/standing-constraints.md` at origin/main as of drafting:
**CONSTRAINTS-VERSION: 2026-08-01.5**

## 0. Scope

This document governs one question only: does cycle-12's eventual figure + CI + validity
verdict (produced by `cycle-12-estimation-protocol.md`) meet the bar for promoting the
pin-truth-calibrated v22 rubric over `witan-rubric-v17-2026-07-24` as the released default.

**This document does not govern, and must never absorb, the estimation protocol's own
validity machinery** — the §3 insufficient-context ceilings, the small-stratum floor, the
`missingRulePolicy` resolution, minimum-label counts, stopping rules. Those live exclusively
in the estimation protocol. Keeping them there means a promotion threshold can never be
hand-tuned by also loosening the measurement's own validity gate — the two documents cannot
trade slack with each other.

**Ordering constraint, restated because it is the whole point of splitting these two
documents:** this record must exist, complete and signed, before cycle-12's scan or draw runs.

## 1. Promotion criteria — operator-proposed 2026-09-04, verified below, all items resolved (P3 ratified 2026-09-04)

**P0 — validity precondition.** The cycle-12 estimate must be VALID under its own
pre-registered rules (the estimation protocol's §3 ceilings and small-stratum floor,
§5's `missingRulePolicy` resolution). Invalid means no promotion, automatically, with no
override clause — a validity failure is not something this document weighs against the other
criteria; it ends the evaluation before P1–P4 are even consulted.

**P1 — precision.** Design-weighted candidate precision point estimate ≥ 0.90, and its 95%
lower bound ≥ 0.80. Rationale as given: precision is the flagship claim family, and Cycle-11's
40/40 (Wilson lower bound **0.9124**, independently recomputed here and matching the cited
"≈0.912") shows this bar is passable but not free — a default wrong more than one time in five
at the interval floor should not ship.

**P2 — recall.** Design-weighted in-scope detection recall point estimate ≥ 0.55, and its 95%
lower bound ≥ 0.40. Rationale as given: no cohort detection-recall number has ever existed for
this lineage; the closest anchor, 24/30 "prospective v22" from the bounded-recall publication
track, is a 0.80 point estimate with Wilson interval **[62.7%, 90.5%]** (independently
recomputed here, matching the cited figures exactly) — and real cohorts are expected to be
harder than that fixture-adjacent sample. These floors are deliberately modest because the
published claim is the measured figure itself, not the threshold.

**P3 — claims-consistency gate against v17's published record. Decided.** The CHANGELOG states
v17's figures precisely as *finding precision 96.43% (95% lower bound 94.16%), worst-case
**recall** 95.64% (lower bound 92.23%), and worst-case FPR 0.66% (upper bound 1.10%)* —
recorded here with one correction carried forward: the 95.64% figure is v17's published
**recall**, not "rubric-agreement"; no metric by that name appears in the CHANGELOG entry.

**P3 is satisfied by either branch, not both:**
1. Re-running the *same* rubric-agreement holdout instrument that produced v17's published
   figures — same methodology, its own fresh untouched cohort per that instrument's own rules
   — with v22 meeting or exceeding v17's published values; **or**
2. The promotion act updating or retiring those published figures, on every surface that
   currently cites them, in the same coupled change that promotes v22.

**Cycle-12's estimator cannot satisfy P3 even in principle, by design, not by oversight.** It
measures human-adjudicated detection precision/recall — a different quantity from
rubric-agreement — and holding one to the other's numbers would be exactly the category error
the site's own "this is not detection recall" disclosures exist to prevent. P3 is a
claims-consistency gate, not a second use of the cycle-12 estimator; nothing about running
cycle-12 to a clean result substitutes for either branch above.

Branch 1 is real, separate work — a full harness re-run, not a byproduct of cycle-12. That is
exactly why branch 2 exists: if nobody chooses to re-run the instrument, the old instrument's
published claims come down, on every surface, in the same act that promotes v22. What is
forbidden under either branch is a new default shipping while any surface still carries the
old default's numbers as if they described the new one.

**P4 — claims hygiene.** Promotion executes as coupled changes across every claim surface (the
publication-card precedent already in use), and no surface may cite Cycle-11's 40/40 as
evidence for anything beyond what it is — a diagnostic result on already-seen candidate data,
ineligible as population evidence by construction (this is the same non-population-claim
constraint the Cycle-11 result itself states about its own 40/40).

## 2. What happens on each outcome — fixed now, not decided when the number arrives

- **Criteria met (P0–P4 all clear):** The promotion act is executed solely by the operator
  (Houman Azimi-Nejadi, per `docs/security/allowed-signers`): a single signed record applying
  this policy's criteria to the cycle-12 figure, landing in the same coupled change-set as
  every claim-surface update (P4). No agent authors, pre-fills, or stages any part of the
  promotion record's signature block.
- **Criteria not met:** `witan-rubric-v17-2026-07-24` remains the released default; cycle-12's
  figure is recorded as informational, not acted on further. Nothing in this policy
  pre-authorizes a remeasurement. On any outcome — GO, NO-GO, or invalid — a further
  measurement cycle requires its own operator-signed protocol, with the spent-identity ledger
  carried forward and this policy's criteria unchanged unless a successor policy is signed
  before that cycle's first scan. A NO-GO is a recorded outcome, not a retry ticket.
- **P0 fails** (a ceiling tripped in the estimation protocol): promotion is not evaluated at
  all — this document has nothing further to decide, and the estimation protocol's own
  inconclusive resolution governs, exactly as cycle-10's did.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Signed at: 2026-09-05T12:35:06Z (strengthened form; original signing 2026-09-05, same operator, same content)
- Signature: Houman Azimi-Nejadi — cycle-12 promotion policy in force: P0 validity precondition with no override, P1 precision and P2 recall floors as ratified, P3 same-instrument-or-surface-update, P4 coupled claim surfaces, promotion act operator-executed only, no remeasurement pre-authorized, a NO-GO is a recorded outcome and not a retry ticket

This document is not in force until this block is complete, and `cycle-12-estimation-protocol.md`'s
scan or draw must not run until it is.
