# ADR-0024 (proposed): The withheld-path abstention is gated to a prospective rubric, so the default every user runs is unchanged

**Scope:** Cejel free-core scoring semantics. Records two open decisions and recommends one option
for each. It decides nothing.
**Status:** Proposed — awaiting an explicit operator decision
**ADR number:** 0024
**Date:** 2026-09-16.

**CONSTRAINTS-VERSION: 2026-08-01.5**

---

## Context

Cejel deletes a file from the scanned file list when that file exceeds its own content-read
ceiling (`MAX_REPOSITORY_CONTENT_BYTES`, 512,000 bytes), when it is not a regular file, when it
cannot be read, or when it is hard-excluded by policy. The skip is counted in
`contentReadSummary`. Until 0.4.9 nothing told a collector that a file had been withheld from it:
a filter or a count over the shortened list returns exactly what it would return for a repository
that genuinely does not have the file.

Two changes in 0.4.9 close that seam, both gated on the prospective `witan-rubric-v23` rubric:

- A3's `health_readiness_route`, `observability_depth` and `prod_readiness_primitives` abstain on
  a withheld path their own file-selection test admits.
- A5's `claim_match_rate`, `claim_source_depth`, `reconciliation_artifact_depth` and
  `negative_space_documentation` do the same. A5 is where the behaviour was demonstrated:
  `claim_match_rate` is implementation files over implementation-plus-claim-source files, so
  withholding one authored implementation file removes it from both sides of the ratio and the
  ratio falls. Measured on a fixture pair identical in every byte except the length of a
  comment-padding block inside one implementation file: A5 1.4 against a control's 1.7, composite
  0.8 against 0.9, with `affectedCriteria` empty and no abstention recorded anywhere.

`WITAN_LAST_CALIBRATED_RUBRIC_VERSION` is `witan-rubric-v17-2026-07-24`, and v17 is the public
default. The mechanism is therefore not reachable by any scan that does not pass an explicit
`--rubric-pin`. **Every default scan still moves a score on a withheld path.**

This record exists because a changelog entry describing the fix without that sentence would be a
false assertion in the document a customer reads to decide whether to upgrade — the category this
repository's own doctrine ranks worse than a recall gap.

---

## Decision 1 — what to do about v17

The mechanism cannot simply be un-gated. It depends on per-signal abstention, which is itself
v23-only; on any other rubric the same attributed skip routes through the wholesale-wipe branch
and abstains a whole criterion over one oversized file, which is the criterion-wide
over-abstention `goal_cejel_0_4_8_abstention_scoring_fix_2026-09-08` removed. Bringing a scoring
semantics change into the calibrated default is also a recalibration decision, and the v17
calibration frame is retired.

### Option A — leave v17 as it is, silently

No code change; no disclosure beyond the changelog line already shipped.

**Pros:** zero risk to the calibrated default; zero cost.
**Cons:** a v17 certificate can still assert a file count derived from a list a file was deleted
from, and a reader has no way to tell. The defect stays live for every user indefinitely, and the
only record of it is a changelog entry about a rubric almost nobody runs.

### Option B — recalibrate against a new frame and promote

Build a fresh authenticated untouched holdout, run the preregistered gates against a rubric that
includes per-signal abstention and the withheld-path mechanism, and promote it to default.

**Pros:** the only option that actually fixes the defect for the people who have it.
**Cons:** a new calibration frame is a programme of work, not a card. It also cannot start until
Decision 2 below is settled, because it would calibrate a scoring behaviour that is currently in
tension with ADR-0001.

### Option C — disclose the behaviour as a stated limitation on v17 scans

Leave v17 scoring byte-stable and add a disclosure to the v17 scan path: when a file is withheld
and some signal's own selection test would have admitted it, say so on the certificate, without
changing any number. The `contentReadSummary` counts and the scan-limitations machinery already
exist; this is the same "coverage is disclosed" move ADR-0001 Phase 1 made, applied one level
down, from "we skipped N files" to "one of the files we skipped is one a signal would have
counted".

**Pros:** closes the false-assertion half of the defect — the part this repository treats as the
serious half — without touching a calibrated number, so it needs no recalibration. It also makes
the gap visible to the people affected by it, which Option A does not.
**Cons:** the score is still wrong; the certificate merely says so. It adds a disclosure line that
invites the question "then why didn't you fix the number?", which is correct and will generate
support load.

### Recommendation

**Option C, with Option B as the eventual destination.** Option A is not acceptable: it leaves a
false assertion on the default path with no disclosure. Option B is right but cannot be scheduled
from here and is blocked behind Decision 2. Option C is the only move available now that changes
what a v17 certificate *asserts* without changing what it *scores*, which is exactly the boundary
ADR-0001 draws. The choice is the operator's.

---

## Decision 2 — abstaining a metric can discount the criterion

`scoreMetrics` renormalizes over the metrics a criterion still has. Dropping an abstained metric
redistributes its weight onto the survivors, so when the dropped metric scored above the
survivors' weighted average, **the criterion's score falls**.

Measured, v23-pinned, on the same fixture pair:

| | oversized | control |
|---|---|---|
| `A5.claim_match_rate` | abstained, metric absent | 2 of max 3 |
| A5 score | 0.7 | 1.7 |
| A5 status | warning | warning |
| composite | 0.7 | 0.9 |

Before this card, the same fixture scored A5 at 1.4. So the abstention removed a false assertion
and, in the same move, lowered the number further. ADR-0001 says coverage is disclosed and **never
discounts a score**. On this fixture it discounts one.

This is not specific to A5. A3's already-merged wiring has the same property: dropping
`prod_readiness_primitives` removes 0.55 of A3's 1.0 declared metric weight.

### Option A — accept it as the honest score of what remains

The surviving metrics are measured; their weighted score is what Cejel can stand behind.

**Pros:** no new machinery; consistent with the merged A3 behaviour; nothing asserted is false.
**Cons:** a criterion verdict computed from a minority of its declared weight, presented in the
same band language as a full measurement, is a verdict Cejel cannot really support. It is the
"guess rather than abstain" shape, arrived at arithmetically rather than deliberately.

### Option B — withhold the criterion's number instead

When a self-imposed coverage limit abstains a signal and the survivors cannot represent the
criterion, abstain the criterion outright with the self-imposed reason. A self-imposed wholesale
abstention is already excluded from the composite denominator, so it withholds rather than
penalises — ADR-0001 Option B, applied per criterion.

**Pros:** satisfies ADR-0001 exactly: withholding is not discounting. It is also the behaviour a
reader would expect from the word "abstained".
**Cons:** needs a rule for "cannot represent the criterion". A declared-weight threshold does not
work: A5's surviving weight here is 0.50 and A3's is 0.45, so any threshold that catches A5
catches A3 too, and an existing guard states in terms that a self-imposed coverage limit must not
wipe A3. Changing that is a scoring-semantics decision across every wired signal.

### Option C — do not renormalize; keep the criterion's full declared weight in the denominator

**Rejected on sight, recorded so nobody re-proposes it.** It charges the repository for Cejel's
own skip, which is Option A of ADR-0001 — explicitly rejected there.

### Recommendation

**Option B, but not from this card.** Option A is what ships in 0.4.9 because it is what the
existing mechanism does and because v23 is opt-in and carries no calibration claim. Option B is
the doctrinally correct end state and needs a rule the operator picks, plus a revision of the A3
guard that currently forbids it. Until then the behaviour is pinned by a test
(`src/witan/__tests__/withheld-path-abstention-v23.test.ts`, "records that abstaining a heavily
weighted metric lowers the criterion score") so it is visible rather than discovered.

---

## Advancement test

This record advances when the operator records a decision on each of the two questions above,
naming the option chosen. Decision 2 must be settled before any recalibration contemplated by
Decision 1 Option B begins: calibrating the current behaviour and then changing it wastes the
frame.

---

## Consequences

**Easier.** The gap between "the mechanism exists" and "a user is fixed" is written down in one
place, so a future reader cannot infer from the changelog that a default scan was repaired.

**Harder.** Two open decisions now block a clean story about withheld-path handling, and one of
them (Decision 2) implicates code already merged for A3, not just the A5 work this record
accompanies.
