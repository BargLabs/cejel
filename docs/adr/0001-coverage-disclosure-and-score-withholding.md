# ADR-0001: Coverage is disclosed, never discounted — and may later withhold a score

**Status:** Accepted
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
