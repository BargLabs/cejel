# Prospective A3/B6 paired evaluation v2 — result (2026-08-10)

Status: **CLAIM_BEARING — fixed-corpus descriptive result**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Result

The sole run authorized by
`a3-b6-prospective-paired-evaluation-v2-successor-preregistration-2026-08-10.md` completed with
no retry. All six seeded controls were detected, all six paired control repairs were clean, and
the precommitted gate opened. All 24 target rows then completed with valid construction oracles
and no binding, detector, materialization, oracle, or instrument error.

Across the twelve fixed prospective pairs, Cejel detected **10/12 seeded cases**, flagged
**0/12 paired repairs**, and produced **10/12 paired successes**. A3 contributed **4/6 seeded
detections**, **0/6 repair flags**, and **4/6 paired successes**. B6 contributed **6/6 seeded
detections**, **0/6 repair flags**, and **6/6 paired successes**.

This is the complete aggregate descriptive census authorized by the protocol. It is not a
sample-based estimate, carries no confidence interval or pass/fail grade, and does not establish
real-world recall or precision. Case IDs, per-case outcomes, raw sources, paths, and complete
scan evidence remain private.

## Instrument-control aggregate

- Seeded controls detected: **6/6**
- Paired control repairs clean: **6/6**
- Control errors: **0**

These twelve control rows are outside every target count. V2 corrected only the three A3 control
file maps after v1's terminal instrument failure; the detector, target corpus, oracle,
predicates, denominator, and reporting rule remained unchanged.

## Licensed statement

> On twelve fixed synthetic seeded/repair pairs authored and merged before the prospective
> detector changes, Cejel source commit `ef39288` using explicit v21 emitted the pair-specific
> prospective exact-path finding in 10 of 12 seeded repositories and in 0 of 12 paired repairs;
> 10 of 12 pairs combined seeded detection with a clean repair. A3 contributed 4/6 paired
> successes and B6 contributed 6/6. This construction-bound result is a descriptive census of
> these fixtures, not an estimate of real-world recall or precision; v21 remains unreleased and
> the public default remains v17.

## Immutable hashes

| Artifact | Hash |
|---|---|
| Cejel detector commit | `ef392882f8b70646800b7fb6d92c454ec2230f07` |
| Cejel detector tree | `1b031ecfe2f3563f5e57f79770e46ec10d482169` |
| Successor preregistration merge | `90931bc96c6d4f3596549e85830c83151eeb8335` |
| Successor preregistration blob | `6862ad25d6881e4a798c43c0c37fd73a2effc421` |
| Successor preregistration SHA-256 | `be2087f9ef020e367c51e45bbca72548a6c0165702e6facc80e09e538b6a3725` |
| Private corpus merge | `748cd81959ac10780cc2747116ef8bc3fa9038e5` |
| Private corpus blob / SHA-256 | `9ee5474b953a4d6409e5e2da76a5ebe8218596c0` / `c7b295b3517d23700303f31dda61cd071b98c460dedcff5d7ebb73d1bc463dc2` |
| Private oracle blob / SHA-256 | `81f08c6fb6ded8e2b6b0f31b461f0d311d84129e` / `b5fed4e69c4b0ae4f8a415e92dd2a2a029e6032c93bb2d0a2e89089356ad684e` |
| Terminal v1 private merge | `0d8414f037418119ba843750e56b3f7d4914ff24` |
| Pushed v2 harness | `a96d9083930de6396e1da2fa6a193d24beddf973` |
| Private v2 result commit | `a315b7e77e5cd882cf4335b9036a0c20cd3abe20` |
| Private v2 result merge | `e6f6f5994b8ac945e3c2ef45ead38311bf8ba8e3` |
| Private result JSON blob | `47ca13fc891e472b87adeea62ac00f6293b66715` |
| Private result Markdown blob | `12f31f8c76027d0c5b23258b2748fe5e0197580c` |

Within private Alfred, the corpus merge and terminal v1 merge are strict ancestors of the pushed
v2 harness, and the harness is a strict ancestor of the v2 result. The private result merged with
a merge commit, preserving those relations. The Cejel preregistration commit and blob are
immutable cross-repository content bindings, not Alfred ancestors.

## Run integrity and evidence hashes

- Run count: **1**
- Run window: `2026-08-10T02:25:39.648Z` to `2026-08-10T02:25:48.353Z`
- Control rows: **12**
- Target rows: **24**
- Binding, detector, materialization, oracle, and instrument errors: **0**
- Frozen Cejel `dist/index.js` SHA-256:
  `aaec5152f58ae56d2d23bcbca17b161c372fc3e2dbf48a2c31434da20b0a2f63`
- Private result JSON SHA-256:
  `52bf746f614d6e79af1c4e1f2e2e80c4e0dc0426188f836b236ffd5daaed2436`
- Private result Markdown SHA-256:
  `dfebcc650880f1353f4e0a0cb34ad66785431ae7a1c94775db963b75a5873d54`
- Canonical JSON semantic hash:
  `d8405b82e457cfbf28fa76fda1b953d0ff9236cca512fa8207e8c674d5cdc0ad`

Repository formatting accepted both emitted artifacts without modification, so raw and committed
byte hashes are identical.

## Claim and privacy boundary

The A3 aggregate includes two misses; it is not a mandate to broaden path inference or weaken the
detector. Any follow-up change requires new prospective evidence and clean paired controls. The
perfect B6 aggregate is likewise confined to this fixed synthetic corpus and is not a general B6
recall claim.

Explicit v21 remains unreleased and opt-in. This result does not change the public default,
`v0.4.0`, any score, certificate, leaderboard, historical experiment, or customer-facing claim.

This public rendering contains only authorized aggregate scores and hashes. It omits private
case identifiers, case-level outcomes, fixture source, paths, complete scan evidence, absolute
paths, credentials, and unrelated Alfred material.
