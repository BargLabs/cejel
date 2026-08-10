# Prospective A3/B6 paired evaluation v1 — result (2026-08-10)

Status: **VOID_CONTROL_FAILURE — non-claim-bearing**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Disposition

The sole run authorized by
`a3-b6-prospective-paired-evaluation-v1-preregistration-2026-08-10.md` stopped at its
precommitted paired-control gate. The three B6 seeded controls were detected and their three
repairs were clean. The three A3 seeded controls were missed and their three repairs were clean.
There were no oracle, detector, materialization, binding, or instrument errors and no retry.

The state is therefore `VOID_CONTROL_FAILURE`. The target corpus module was never imported,
decoded, materialized, or scanned; evaluation rows are **0**. This document publishes no target
outcome, aggregate, licensed statement, A3/B6 prospective performance result, or claim
correction.

## Instrument-control outcomes

| Control | Seeded outcome | Paired-repair outcome |
|---|---|---|
| `CTRL-A3-MANIFEST` | missed | clean |
| `CTRL-A3-HTTP` | missed | clean |
| `CTRL-A3-CONTAINER` | missed | clean |
| `CTRL-B6-ROLE` | detected | clean |
| `CTRL-B6-SUPERUSER` | detected | clean |
| `CTRL-B6-SCHEMA` | detected | clean |

The A3 failures diagnose an instrument-design mismatch. The v20 detector deliberately bounds
its A3 evidence to qualified production entrypoint and container paths. The v1 control file maps
used `src/daemon.js`, `src/edge.js`, and `ops/Dockerfile`, while the already-public v20 regression
proofs use `src/main.js` and `deploy/Dockerfile`. Because the gate failed before target import,
this observation comes only from control outcomes and the public detector/test surface. It says
nothing about any `PA3-*` target case.

## Immutable bindings and ancestry

| Artifact | Binding |
|---|---|
| Cejel detector commit | `ef392882f8b70646800b7fb6d92c454ec2230f07` |
| Cejel detector Git tree | `1b031ecfe2f3563f5e57f79770e46ec10d482169` |
| Package version in that source tree | `0.4.0` — not a claim that this post-release v21 detector shipped in tag `v0.4.0` |
| Explicit rubric | `witan-rubric-v21-prospective-2026-08-10` |
| Public default | `witan-rubric-v17-2026-07-24` |
| Preregistration merge | `BargLabs/cejel@da0089f75ed73845e6d867836c36e2772d1ef6a6` |
| Preregistration Git blob / SHA-256 | `d028abe0a3fe1793aded7d028a90aeea3d1d6a2b` / `8217f8ef24a9ba3fb5acaea54a2d15d121fb5310f568c773a47ec95c2ab58477` |
| Alfred corpus merge | `BargLabs/alfred@748cd81959ac10780cc2747116ef8bc3fa9038e5` |
| Corpus Git blob / SHA-256 | `9ee5474b953a4d6409e5e2da76a5ebe8218596c0` / `c7b295b3517d23700303f31dda61cd071b98c460dedcff5d7ebb73d1bc463dc2` |
| Oracle Git blob / SHA-256 | `81f08c6fb6ded8e2b6b0f31b461f0d311d84129e` / `b5fed4e69c4b0ae4f8a415e92dd2a2a029e6032c93bb2d0a2e89089356ad684e` |
| Pushed private harness | `BargLabs/alfred@2872dfe11eb35101a8305cbd623a90cf21a67fd5` |
| Private result commit | `BargLabs/alfred@50d29383054a554cc1cc80378816deab2389ed6d` |
| Private result merge | `BargLabs/alfred@0d8414f037418119ba843750e56b3f7d4914ff24` |

Within Alfred, the corpus merge is a strict ancestor of the pushed harness and both are strict
ancestors of the result commit. Alfred PR
[#874](https://github.com/BargLabs/alfred/pull/874) merged as
`0d8414f037418119ba843750e56b3f7d4914ff24`, with the corpus base and result head as its two
parents, preserving those relations. The Cejel preregistration commit and document blob are
cross-repository immutable content bindings, not Alfred ancestors. Commit timestamps are not
ancestry evidence.

## Run integrity and private evidence hashes

- Run count: **1**
- Run window: `2026-08-10T01:51:32.167Z` to `2026-08-10T01:51:35.135Z`
- Control rows: **12**
- Evaluation rows: **0**
- Oracle, detector, materialization, binding, and instrument errors: **0**
- Committed private result JSON SHA-256:
  `3e060cb3b529b4177083cbcfb9b66c08d2267aae563a77ca595f4a0cf8497fd0`
- Committed private result Markdown SHA-256:
  `1cdb8487ae66ce1e0aa300059a52184661e1a4b683e69c74e27aad325173200d`
- Raw emitted JSON SHA-256 before repository formatting:
  `55e86ac395b0137f8dccb90d9f0b3445fa9d301203f3e8615a41048b7fe8ef34`
- Canonical JSON semantic hash:
  `8286e3259715f7564b935864227779ea9507e26b5e56cdf1cc78ddcb2d403279`

Repository formatting changed JSON whitespace after emission but did not change the canonical
JSON semantic hash.

## Claim and privacy boundary

This terminal record is an instrument-pilot closeout only. It does not revise the historical
dual-control `0 / 16`, v3 native in-scope recall, the decision-contract held-out result, any
release, default rubric, score, certificate, leaderboard, or customer-facing statement. A new
run is authorized only by a new successor preregistration with a freshly frozen and remotely
authenticated harness.

This public closeout omits private fixture source, complete raw scan evidence, private absolute
paths, credentials, and unrelated Alfred material. The frozen v1 preregistration, detector,
corpus, oracle, harness, raw result, and historical artifacts remain unchanged.
