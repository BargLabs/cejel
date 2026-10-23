# ADR-0001: Coverage is disclosed, never discounted — and may later withhold a score

**Status:** Accepted (four operator rulings recorded at the end: three of 2026-10-22, on v27 shallow-clone abstentions, #556's abstention, and its two further causes from #560's review; and one of 2026-10-23, on a `.git` that git cannot open)
**Date:** 2026-08-02
**Deciders:** Houman Azimi
**Supersedes:** nothing. First ADR in this repository.

---

## Context

Cejel scores a repository across eleven criteria and publishes a composite. It does not read every
file. Files are excluded from analysis by extension, by a size gate, by the deny-list, by being
non-regular, and — since the content-read hardening of 2026-08-02 — by failing to read at all.

**None of these exclusions is currently visible to the reader of a certificate.**

The gap surfaced accidentally. While narrowing that hardening change, a pinned-leaderboard
comparison moved two rows, and the diagnosis found that a pre-existing size gate returns `null`
*before* reading, and that the new code was routing that `null` into an `insufficient_data`
abstention. The files involved:

| Repository | File | Size |
|---|---|---:|
| esbuild | `internal/js_parser/js_parser.go` | 657,509 B |
| esbuild | `internal/linker/linker.go` | 269,567 B |
| fmt | `test/gtest/gmock-gtest-all.cc` | 532,839 B |

For esbuild, the parser and the linker *are* the product. Cejel scored that repository, published
the result on a public leaderboard, and never read its two most substantial source files — and the
certificate said nothing about it.

Two properties of this gap matter:

- It is **systematic, not incidental.** A read failure is rare and accidental. A size gate fires
  predictably, on the largest files, in every repository that has them, indefinitely. The file most
  likely to exceed the gate is often the one carrying the most logic.
- It is the same shape as the defects this programme exists to name: **a boundary that exists and
  is not disclosed.**

The question this ADR answers is whether the proportion of a repository Cejel actually reads should
affect the score it publishes.

### Forces

- The free-core calibration — 96.43% finding precision, 95.64% worst-case recall, 0.66%
  false-positive rate on a preregistered 200-repository holdout — **was measured with the current
  gates active.** Any change that alters what is read, or withholds a score previously published,
  means those figures no longer describe the shipped product.
- The public leaderboard is a comparative artifact; readers diff rows against each other.
- Cejel already withholds scores at the extreme: a repository with zero recognised files receives
  `insufficient_source`, null scores, and an explicit machine verdict rather than a number.
- The coverage distribution across real repositories is **unmeasured**.

---

## Decision

**Coverage is disclosed. Coverage never discounts a score. Coverage may, later and only on measured
evidence, withhold one.**

Implemented in three phases, in order, with a gate between each.

**Phase 1 — disclose (now).** Every certificate states its coverage: files analysed, files
excluded, and the reason bucket for each exclusion. Counts and totals, never paths. No score
changes. The leaderboard stays byte-identical.

**Phase 2 — measure (dated result).** Compute the coverage distribution over the existing
2,000-repository corpus (`docs/experiments/d-series-base-rate-2026-08-02/tier2-corpus.json`,
pinned revisions, clone policy already defined). Publish it. Note that the base-rate run recorded
`tooLargeSkipped: 0` on every row because it did not apply the production size gate, so this
requires a recompute pass rather than a lookup.

**Phase 3 — decide (preregistered).** With the distribution in hand, preregister a coverage floor
below which Cejel withholds a numeric composite and returns an explicit insufficient-coverage
verdict. **Landing Phase 3 requires re-running the 200-repository holdout**, because it changes
what the published accuracy figures describe. Budget that when deciding, not after.

Already shipped alongside this decision, and load-bearing for it: **an abstention can never raise a
composite.** Read-failure abstentions retain the full denominator with a conservative zero
contribution, proven by a property test over 128 generated profiles × 11 criteria.

---

## Options considered

### Option A — coverage discounts the score

Scale or penalise the composite in proportion to unread material.

| Dimension | Assessment |
|---|---|
| Complexity | Low to implement, high to defend |
| Effect on published numbers | Immediate and large |
| Calibration cost | Full holdout re-run |
| Gameability | High |

**Pros:** a single number carries everything; no consumer can ignore coverage.

**Cons:** it merges a point estimate with its confidence and destroys both — a 4.0 measured at 60%
becomes indistinguishable from a 2.4 measured at 100%. It makes the score partly a measure of
Cejel's limitations rather than of the repository: esbuild is not less trustworthy because we have
a size gate. It is trivially gameable in the least useful direction, since splitting one large file
into four raises the score while changing nothing real. And it breaks comparability across a
leaderboard whose entire purpose is comparison.

**Rejected.**

### Option B — coverage gates the score

Below a threshold, refuse to publish a composite; return an explicit insufficient-coverage verdict.

| Dimension | Assessment |
|---|---|
| Complexity | Moderate; the machinery exists |
| Effect on published numbers | Withholds some, alters none |
| Calibration cost | Full holdout re-run |
| Gameability | Low |

**Pros:** preserves the score's meaning while refusing to publish one we cannot stand behind. It is
not a new principle — `insufficient_source` is already this mechanism at the 0% end of the same
continuum; the product simply never handled the middle. It errs in the direction that costs us:
fewer published numbers rather than flattering ones.

**Cons:** the threshold is unknown, and choosing one without the distribution repeats the D-series
error of fixing a contract before measuring a base rate. Also incurs the calibration cost.

**Accepted in principle, deferred to Phase 3 pending measurement.**

### Option C — disclose only, permanently

State coverage; never let it affect the score or the verdict.

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Effect on published numbers | None |
| Calibration cost | None |
| Gameability | None |

**Pros:** free, honest, immediately shippable, leaves calibration intact, and gives a consumer the
two figures side by side so they can combine them themselves.

**Cons:** a reader who ignores the coverage line still over-trusts a thin certificate.

**Accepted as Phase 1.** Not accepted as the permanent end state, because at sufficiently low
coverage a composite is not merely uncertain — it is unsupported, and publishing it anyway would be
the same false-currency failure this decision exists to close.

---

## Trade-off analysis

The decisive distinction is between **an estimate** and **confidence in that estimate**. The
composite answers *is this codebase in a trustworthy state?* Coverage answers *how much of it did
we look at?* Option A multiplies them and loses both. Options B and C keep them separate, which is
what every measurement discipline does — and what Cejel already does when it publishes 96.43%
alongside a 94.16% lower bound rather than quoting a haircut.

The secondary trade-off is **cost of being wrong about the threshold.** Under Option A, a badly
chosen coefficient silently mis-scores every repository. Under Option B, a badly chosen floor
withholds scores that should have been published — visible, complainable, and correctable. Failing
loudly is worth more than failing accurately here.

---

## Consequences

**Easier.** A zero becomes legible: *no rule matched, and here is what was not read.* The
customer-facing claim that a zero never means "clean" becomes a property of the artifact rather
than a statement of intent. Low-coverage certificates become identifiable rather than
indistinguishable from thorough ones.

**Harder.** Every certificate grows a section that invites the question *why didn't you read that?*
— which is correct, and will generate support load. Some of the answers will be embarrassing; the
256 KiB gate is one.

**To revisit.** The size gate's value is now an open question in its own right. It exists for
performance, and the cost it was avoiding has never been measured against the coverage it destroys.
That is a separate ADR.

**Coupled and non-negotiable.** Phase 3 invalidates the published free-core accuracy figures until
the holdout is re-run. This is the same coupling that invalidated a completed independent
attestation when an unrelated artifact changed — do not discover it late.

---

## Action items

1. [ ] Phase 1 — coverage disclosure in the certificate and machine output; counts and reason
       buckets, never paths; leaderboard verified byte-identical.
2. [ ] Update the customer-facing one-pager and `cejel.dev` to state the coverage property once it
       ships.
3. [ ] Phase 2 — recompute the coverage distribution over the pinned 2,000-repository corpus under
       the production gate; publish as a dated result.
4. [ ] Phase 3 — preregister the withholding threshold from the measured distribution; schedule the
       holdout re-run in the same plan, not after it.
5. [ ] Separate ADR — measure what the size gate actually saves, and whether it should exist.

---

## Operator ruling (2026-10-22): a shallow-clone abstention is a read failure

Recorded by an AI agent (Claude Opus 5.5, Claude Code) at the operator's instruction. This answers
condition 6 of the 2026-10-21 ruling on #526 (`docs/reviews/v27-false-assurance-closure-2026-10-19.md`,
accepted 2026-10-22). The text above is unchanged apart from the Status line.

**The operator's decision.** The agent offered three options: treat the abstention as a read failure
under this ADR, treat it as a coverage limit, or write a new ADR. The operator's reply was "a,",
choosing the first: "Rule that a shallow clone is a read failure under ADR-0001. Behaviour stays as
it is. I'd also add fetch-depth: 0 guidance to the README and the Action docs." The third sentence
was the agent's proposed follow-up, not part of the ruling. The operator gave no reasons.

**What that means.** When `witan-rubric-v27-prospective-2026-10-19` abstains on A2 or B2 because the
repository is a shallow clone (`shallowHistoryAbstention` in `src/witan/repo-signals.ts`), the
abstention is a **read failure** under this ADR, not a coverage discount. The abstaining criterion
keeps its place in the denominator with a zero contribution, so the abstention itself cannot raise
a composite.

That is narrower than "a shallow clone never scores higher than the full clone", which does not
hold. A criterion whose applicability depends on history can become not applicable on a shallow
clone and leave the composite. For example, A2 on a repository whose only A2 surface is a `.env`
committed and later deleted (no data layer and no other A2 surface). This ruling does not cover that case (#556).

**The recording agent's explanation (not the operator's words).** The Context above calls a read
failure "rare and accidental", and a depth-1 checkout is neither: it is the `actions/checkout`
default. The points below are the agent's reasoning; the operator neither adopted nor rejected them:
- the history Cejel needs is absent from the checkout, not present and skipped;
- the scanning user can remove the limit, and the certificate says how (`fetch-depth: 0`);
- treating the abstention as coverage would drop A2 and B2 from the denominator instead, which can
  raise a composite.

**What it does not change.** No code, rubric, policy text or default changes. v17 and v18-v26 do not
abstain on a shallow clone; they disclose it as a history limitation, as before. The ruling covers
only the v27 shallow-clone abstentions. It decides nothing about any other systematic limit.

## Operator ruling (2026-10-22, second): the read-failure ruling extends to #556's abstention

Recorded by an AI agent (Claude Opus 5.5, Claude Code) in #560, at the operator's instruction. The
operator made two decisions that day, both recorded on #526
([comment 6336750983](https://github.com/BargLabs/cejel/issues/526#issuecomment-6336750983),
"Operator decisions (2026-10-22)", and
[comment 6337508926](https://github.com/BargLabs/cejel/issues/526#issuecomment-6337508926),
"Operator decision (2026-10-22)"). The text above is unchanged apart from the Status line.

**The operator's decision.** The agent recommended that the read-failure ruling above also cover
the v27 A2 abstention #560 adds. The operator's words were "yes to both recommendations". The
second recommendation in that reply concerns #535 and condition 3 of the #526 ruling, not this ADR.
The operator gave no reasons.

**The operator's second decision: Cejel's own limits.** #560's review then showed that Cejel's own
size and time limits fire on complete clones. The agent asked: "What should v27 do when an A2 history
read hits one of Cejel's own size or time limits on a complete clone?" Option 1 (recommended): keep
counting a limit hit as a failed read, so A2 abstains at 0; for consistency, also count the 5,000-blob
cap on the history secret scan as an incomplete read (until then it was silently "nothing found");
fix the cause by streaming those reads (#567). Option 2: treat a limit hit as a coverage limit, which
takes A2 out of the composite and can raise a score. The operator's reply was "1". The operator gave
no reasons.

**What is covered.** Under `witan-rubric-v27-prospective-2026-10-19`, A2 abstains where it would
otherwise have been marked not applicable, or scored, on commit history Cejel could not fully read:
- the clone is shallow;
- one of A2's history reads failed (for example on a partial clone, or a git error); or
- one of A2's history reads stopped at one of Cejel's own limits: the 8 MiB output limit, the 500 KiB
  limit on one historical blob, the 30-second timeout, or the history secret scan's cap of 5,000
  historical files. These fire on complete clones too.

That abstention is a **read failure** under this ADR. A2 abstains at 0 and keeps its place in the
composite. A confirmed critical finding still stands and is scored.

**What it supersedes.** Once #560 lands, this supersedes, for v27, the earlier section's sentence
"This ruling does not cover that case (#556)": v27 then abstains in that case, and the abstention is
covered.

**What it does not change.** v17 and v18-v26 do not abstain on such a clone. They only disclose it:
a shallow clone in "History limitations", a failed git read in the scan limitations, a capped history
secret scan in that scan's own finding where A2 scores, and, where A2 is marked not applicable on
such history, a sentence among A2's disclosures. The rulings decide nothing about any other
systematic limit.

**The recording agent's explanation (not the operator's words).** The failed reads are of two kinds.
A partial clone, or a git error, leaves out objects that history reads need, and Cejel's git
boundary denies every transport, so it never fetches them; the scanning user can remove that by
re-scanning a full, unfiltered clone. A read that stops at one of Cejel's own output limits is
different: it is not rare or accidental but systematic on large histories, and fires on complete
clones too (in an informal re-score of the 0.6.8 confirmation's full-history clones, biomejs and
react each hit the 8 MiB output limit), and a re-scan of the same repository does not lift it;
streaming those reads is #567. The 5,000-file cap is of the same kind. The 30-second timeout sits
between the two: it depends on the machine and its load, so a re-scan may or may not lift it. The operator's
decisions cover both kinds: "a timeout or an output limit" is named in the first recommendation they
accepted, and the second decision names the limits and the cap. Treating either kind as a coverage limit
would let A2 leave the composite, or score on a read that did not complete, which can raise a
composite.

## Operator ruling (2026-10-22, third): two further causes from #560's review are covered

Recorded by an AI agent (Claude Opus 5.5, Claude Code) on `fix/560-review-findings`, at the
operator's instruction. The operator's decision is recorded on #526
([comment 6341266476](https://github.com/BargLabs/cejel/issues/526#issuecomment-6341266476)). The
text above is unchanged apart from the Status line.

**The question.** Review round 4 of #560 added two causes of an incomplete read of the commit history
that the rulings above do not name:
- a credential- or `.env`-shaped path in history that A2 leaves unread because its name contains
  control characters (a fixed rule of Cejel's, applied to every clone alike, with its own scan
  limitation); and
- git itself cannot be run (no git binary) while a `.git` entry is visible from the scanned path, so
  A2 reads none of the history (#568; no scan limitation).

The agent's record left open whether the read-failure ruling covers them. The operator's reply was
"for adr-0001 add them". The operator gave no reasons.

**What is covered.** Under `witan-rubric-v27-prospective-2026-10-19`, A2's abstention for either
cause is a **read failure** under this ADR, exactly as for the causes in the second ruling: A2
abstains at 0 and keeps its place in the composite, and a confirmed critical finding still stands
and is scored.

**What it does not change.** v17 and v18-v26 do not abstain for either cause. Where A2 is marked not
applicable, a sentence among A2's disclosures names the cause. A control-character path keeps its
existing scan limitation (whose wording is #569); git being unavailable adds none. The ruling
decides nothing about any other systematic limit.

## Operator ruling (2026-10-23, fourth): a `.git` that git cannot open is covered

Recorded by an AI agent (Claude Opus 5.5, Claude Code) on `records/adr0001-unopenable-git-ruling`,
at the operator's instruction. The operator's decision is recorded on #526
([comment 6353979958](https://github.com/BargLabs/cejel/issues/526#issuecomment-6353979958)). The
text above is unchanged apart from the Status line.

**The question.** Review round 6 of #560 added a cause of an incomplete read of the commit history
that the rulings above do not name: a `.git` entry is visible from the scanned path, but git cannot
open it as a repository (`git rev-parse --git-dir` fails). Examples are a dangling `.git` symbolic
link, an unreadable `.git`, or a copied worktree or submodule whose gitdir is gone. A2 reads none of
the history, and no scan limitation is added. A repository git can open whose branch has no commits
yet is not this cause. The records flagged the cause as awaiting the operator's confirmation. The
question put to the operator was "ADR-0001: should a .git that git can't open count as a failed
read?" The operator's reply was "Both yes (Recommended)". That option read: "Add a dated ADR-0001
line in a PR for dual review, comment on #526, and drop the caveat from #558's records." The other
half of "both" concerned a separate matter, not this ADR. The operator gave no reasons.

**What is covered.** Under `witan-rubric-v27-prospective-2026-10-19`, A2's abstention for this cause
is a **read failure** under this ADR, exactly as git being unavailable is (third ruling): A2
abstains at 0 and keeps its place in the composite, and a confirmed critical finding still stands
and is scored.

**What it does not change.** No code, rubric, policy text or default changes: v27 already abstained
for this cause. v17 and v18-v26 do not abstain for it. Where A2 is marked not applicable, a sentence
among A2's disclosures names the cause. The cause adds no scan limitation. The ruling decides nothing
about any other systematic limit.
