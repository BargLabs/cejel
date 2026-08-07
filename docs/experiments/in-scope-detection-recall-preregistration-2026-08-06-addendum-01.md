# Addendum 01 — aggregate publication guard and cross-repository binding

Status: preregistered before any run; this is an additive correction to the unrun
`in-scope-detection-recall-preregistration-2026-08-06.md` protocol. It changes no seed,
criterion, detector, rubric, `cited` predicate, or held-out assignment.

## Why this addendum is necessary

The original per-class publication guard was inherited without calibrating it to the five
held-out seeds per class. At that denominator, both zero catches and no miss are ordinary
sampling outcomes for a weak or a strong scanner. Treating either as an automatic refusal
would make a valid run non-claim-bearing for a property of the sample size rather than a
demonstrated degeneracy in the fixture population.

## Superseded publication-guard scope

This addendum supersedes only the **per-class** zero-catch/no-miss refusal in the original
protocol. The following guards remain unchanged:

- Every positive control must be `cited` by its named criterion; any control miss is an
  instrument failure and **VOID**, with no numerator, denominator, interval, or claim.
- The held-out set remains the fixed 30 seeds `A1-06` through `B6-10`, five per criterion.
- `cited` remains exact equality between the seed's named defect file and
  `criterion.findings[].evidence.path`.
- No criterion, detector, rubric, rubric version, seed, fixture, mapping, or held-out
  assignment may change before the run.

Claim-bearing output is refused only when **aggregate held-out recall** is zero catches out
of 30 or perfect 30 catches out of 30. Per-class results are reported descriptively as
`k/5` with no thresholding and do not independently trigger refusal. This preserves the
guard's purpose—rejecting an aggregate test population that is implausibly invisible or
implausibly tuned—without treating ordinary class-level binomial variation as a failure.

## Positive-result inference fixed in advance

For any non-refused aggregate held-out outcome, report the count, `k/30` estimate, and its
two-sided 95% Wilson interval; do not select a qualitative threshold after observing the
outcome. The predeclared positive anchor is **20/30**: it is **66.67%** cited recall with a
95% Wilson interval of **48.78%–80.77%**.

At 20/30, the only licensed external statement is: *on this fixed, isolated, in-scope
held-out fixture set, Cejel cited 20 of 30 named defect files; the 95% Wilson interval for
that fixture-set proportion is 48.78%–80.77%.* It does not establish repository-wide,
ecosystem-wide, or future-version recall, and it does not convert class-level descriptive
counts into claims of per-class recall.

## Cross-repository ordering evidence

The private Alfred seed corpus was committed only after this protocol existed. Its seed
manifest embeds the exact public Cejel preregistration object ID:

```text
preregistrationCommit: 6420b98e9a633f134f556cf287f76262cac3f1de
```

That reference is content in Alfred commit
`d696f20f7be4ff56579e32a2022b1a7ac97a7723`, not an assertion derived from commit timestamps.
Because the manifest names this immutable Git object, the seed commit cannot contain that
reference before the preregistration object exists. A future evaluator must verify both
object IDs and retain this addendum with the result.

No scan, fixture materialization, evaluation, or recall calculation is authorized by this
addendum.
