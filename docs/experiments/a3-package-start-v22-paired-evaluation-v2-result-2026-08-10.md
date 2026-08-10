# A3 package-start prospective paired evaluation v2 — result (2026-08-10)

Status: **CLAIM_BEARING — GREEN bounded engineering closure**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Result and disposition

The sole run authorized by
`a3-package-start-v22-paired-evaluation-v2-preregistration-2026-08-10.md` completed without a
retry. All six seeded controls were detected, all six paired control repairs were clean, and the
precommitted gate opened. All twelve evaluation rows then completed with valid construction
oracles and no binding, detector, materialization, oracle, or instrument error.

Across the six fixed prospective pairs, Cejel detected **6/6 seeded cases**, flagged **0/6 paired
repairs**, and produced **6/6 paired successes**. This is the complete aggregate descriptive
census authorized by the protocol. It is not a sample-based estimate, carries no confidence
interval, and does not establish real-world recall or precision.

The exact frozen detector tree subsequently passed the complete preregistered validation matrix.
The narrow package-start closure is therefore **GREEN**. Engineering attention should now return
to the higher-value dual-control problem. Explicit v22 is technically eligible for a separately
approved future release, but this result does not publish a package, promote v22 to the public
default, change a rubric selection, rescore a leaderboard, or authorize a broader claim.

## Instrument-control aggregate

- Seeded controls detected: **6/6**
- Paired control repairs clean: **6/6**
- Control errors: **0**

These twelve control rows are outside every evaluation count.

## Licensed statement

> On six fixed synthetic A3 package-start seeded/repair pairs authored and merged before the v22
> detector, Cejel source commit `8a289ea` using explicit v22 emitted the exact-path readiness
> finding in 6 of six seeded repositories and in 0 of six paired repairs; 6 of six pairs combined
> seeded detection with a clean repair. This construction-bound census does not estimate
> real-world recall or precision. Public default v17 is unchanged.

## Immutable bindings

| Artifact | Binding |
|---|---|
| Cejel detector merge | `8a289ea09b4cb91354e64610181a1ae79af4b5ec` |
| Cejel detector tree | `10960a032b784f7c11068a1b4a030bf76029eea0` |
| Cejel source-tree package version | `0.4.0` — v22 did not ship in tag `v0.4.0` |
| Explicit rubric | `witan-rubric-v22-prospective-2026-08-10` |
| Public default | `witan-rubric-v17-2026-07-24` |
| Preregistration merge | `fd02259cb06b666d531a03b2e0ef12c6525cf190` |
| Preregistration blob | `d4a86e63acb8a5f9d5868be1cfd46def073a77ce` |
| Preregistration SHA-256 | `9ac7b3b26065074bdaf01e68142ca708188b7e0ff621c8464e7bc64aa712e4a1` |
| Private corpus merge | `f1b02fbdbc253fcbfeed590c1e3318bdade600d0` |
| Private corpus blob / SHA-256 | `71f4e0d4995995d04eb1945893616e12643fe656` / `ef3bd665099a0a684e96ec4136d881c3dfbcb825e3d7445c007b52f9a1f9fa9e` |
| Private oracle blob / SHA-256 | `99f3c1147569b3ffcae11e7c76f9cd5bbc6ad2e7` / `c6f9cddc82775540b285bf0b4cdd98431d1998e85268da01d665d3a31825af2c` |
| Pushed private harness | `27fae8d8e6a3dae786e36bea53f64454aed16b00` |
| Private result commit | `30a2e067bf9857b113460fbac3ead53699d27208` |
| Private result merge | `e2a4a595203bf97a5d7febeb74a65c1db06a7f60` |
| Private result JSON blob | `224605ad9382cc14f8bb5f5afff7908fee951d08` |
| Private result Markdown blob | `6d756ff5163575bc9ff5df94b5a652b64a37c97d` |

Within private Alfred, the corpus merge is a strict ancestor of the pushed harness, and the
harness is a strict ancestor of the result commit. The private result is merged with a merge
commit so those relations remain in the mainline history. The Cejel preregistration commit and
blob are immutable cross-repository content bindings, not Alfred ancestors.

## Run integrity and evidence hashes

- Run count: **1**
- Run window: `2026-08-10T04:08:53.939Z` to `2026-08-10T04:09:00.540Z`
- Control rows: **12**
- Evaluation rows: **12**
- Binding, detector, materialization, oracle, and instrument errors: **0**
- Frozen Cejel `dist/index.js` SHA-256:
  `11109fe263592cefd89a0ecd405aff937cc515d4318d0163b2de6b63df652f37`
- Private result JSON SHA-256:
  `4168b75a611b0ae07efef6d8caa826a3ee1345ae21fc24961b91764a8eb44194`
- Private result Markdown SHA-256:
  `734d7b05add230f9b841031cdb054b373b1fb9c1262316f7fbfd17f5808ea078`
- Canonical JSON semantic hash:
  `209dcd9adede66f0f3fe2a1961e1a00d61f6343c937c96f21379b2bb26fb1d0d`

Repository formatting accepted both emitted artifacts without modification, so their raw and
committed byte hashes are identical.

## Post-run validation matrix

The exact frozen Cejel detector tree was clean before and after validation.

| Gate | Result |
|---|---|
| Build with lockfile-pinned `tsup 8.5.1` | **PASS** |
| Full test suite | **PASS — 55 files, 860 tests** |
| Offline-boundary guard, standalone | **PASS — 41/41 tests** |
| Publish/installability validation | **PASS — 12/12 tests** |
| Public default remains v17; explicit v21 does not gain the v22 finding | **PASS** |

The first post-run build command did not invoke Cejel because its deliberately restricted
`PATH` omitted Node. Restoring the existing system path while retaining the pinned pnpm wrapper
made the build run and pass. No source, dependency, artifact, experiment input, or result changed,
and no evaluation was rerun.

## Claim and privacy boundary

The perfect fixed-corpus aggregate establishes only that the narrow root package-start
construction behaved as designed on these six prospective synthetic pairs while preserving clean
paired repairs. It does not support a general A3 recall or precision claim, independent-fixture
claim, customer claim, or default-promotion decision.

This public rendering contains only the authorized aggregate scores and hashes. It omits private
target identifiers, target paths, per-case outcomes, fixture source, raw scan evidence, private
absolute paths, credentials, and unrelated Alfred material.
