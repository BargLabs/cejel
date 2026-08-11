# In-scope native detection-recall experiment v4 — result (2026-08-11)

Status: **CLAIM_BEARING on the fixed fixture set**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Disposition

The single run authorized by
`in-scope-detection-recall-v4-preregistration-2026-08-11.md` completed without a retry. All six
out-of-denominator positive controls cited their exact named defect paths, so the precommitted gate
opened. All 60 evaluation entries then completed with no control, evaluation, or instrument error.

The primary held-out result is **24/30**. Its two-sided 95% Wilson interval is
**[62.69%, 90.49%]** (unrounded `[0.6269430358685175, 0.9049489282271013]`). The descriptive
full-cohort result is **48/60**.

The only licensed claim-bearing statement is:

> On this fixed, isolated, in-scope held-out fixture set, Cejel source commit `8a289ea` using
> explicit prospective v22 cited 24 of 30 named defect files; the two-sided 95% Wilson interval
> for that fixture-set proportion is [62.69%, 90.49%].

V22 is prospective and unreleased. This result does not promote a release, change the public
default rubric (which remains v17), alter a certificate, score, leaderboard, or make a
customer-facing population claim.

## Positive-control gate

| Control | Criterion | Outcome |
|---|---|---|
| `PC-A1` | A1 | caught |
| `PC-A2` | A2 | caught |
| `PC-A3` | A3 | caught |
| `PC-A4` | A4 | caught |
| `PC-A5` | A5 | caught |
| `PC-B6` | B6 | caught |

The superseded v2 `positiveControls` value was not decoded, materialized, scanned, or used. The
v3 controls remained outside every recall denominator.

## Frozen summaries

| Criterion | Held-out cited |
|---|---|
| A1 | 4/5 |
| A2 | 2/5 |
| A3 | 3/5 |
| A4 | 5/5 |
| A5 | 5/5 |
| B6 | 5/5 |

These per-criterion counts are descriptive. They have no per-class pass/fail threshold.

## Immutable bindings and ancestry

| Artifact | Binding |
|---|---|
| V4 preregistration merge | `BargLabs/cejel@c893e20e06254cc29e71135d311f78c11e645027` |
| V4 preregistration Git blob | `93d3446d806761759bcc4a68abc0d8d77a8ac334` |
| V4 preregistration SHA-256 | `1699eba3d972d9f068048bfd056bcf241e5586305b511d198d5747aa397e6b7d` |
| Cejel detector source commit | `8a289ea09b4cb91354e64610181a1ae79af4b5ec` |
| Cejel Git tree | `10960a032b784f7c11068a1b4a030bf76029eea0` |
| Source-tree package version | `0.4.0` only; not a claim that v22 shipped in tag `v0.4.0` |
| Explicit rubric | `witan-rubric-v22-prospective-2026-08-10` |
| Public default rubric | `witan-rubric-v17-2026-07-24` |
| Scan boundary | `scoreRepoWithPublicCejel`, explicit v22, no ingest and auto-discovered ingest disabled |
| Fixed `generatedAt` | `2026-08-11T00:00:00.000Z` |
| Private evaluation-corpus merge | `BargLabs/alfred@d4f6f0dfa0721d2e35b40b14f43f227e5ec79dbc` |
| Private evaluation-corpus Git blob | `84e1d7d55d73b0c0895809d40e9946758636c777` |
| Private evaluation-corpus SHA-256 | `331349ecd5be409f0800e396863d3a7869f330b7603baf0e484636733f878220` |
| Private v3-control merge | `BargLabs/alfred@11284d9ca97c5d6b216014cc3315df07d4e02549` |
| Private v3-control Git blob | `c705a2491d695b0f15028bd1d4fa55eb402edc2f` |
| Private v3-control SHA-256 | `0955e77b47e5da5d8010da29359cc9aa1e27b3fa85969405cdff199fc39e07d4` |
| Pushed private harness | `BargLabs/alfred@39d0a8e0f50136896dc1f4f0200e30dc5850ca95` |
| Private result commit | `BargLabs/alfred@2c5bf2daaffe1d5ad11f620d04147f9a49778384` |

The private evaluation-corpus merge, v3-control merge, and pushed harness are strict ancestors of
the private result commit. Cejel objects are content bindings across repositories, not described as
Alfred ancestors. Commit timestamps were not used as ancestry evidence.

## Run integrity and private evidence hashes

- Run count: **1**
- Run window: `2026-08-11T17:02:52.118Z` to `2026-08-11T17:03:08.630Z`
- Control rows: **6**
- Evaluation rows: **60**
- Control, evaluation, and instrument errors: **0**
- Committed private result JSON SHA-256:
  `4b24efdaae28e8b812af98be40acdc9bd3624b1e1e38674e492600c5a147edc2`
- Committed private result Markdown SHA-256:
  `20ee676970e91e85159a7e9a5c6b1956676516a0a745a43ded64c8a217a9fd08`
- Canonical JSON semantic hash:
  `76ef7f3557e36361910841f2766a569581b001f837ad60fd9eb4dbd8bd118c42`

Repository formatting changed JSON whitespace after emission but did not change the canonical JSON
semantic hash. The frozen source tree's installed, lockfile-pinned `tsup 8.5.1` build succeeded
directly after the outer pnpm wrapper could not perform its registry-signature version lookup in the
offline environment. No source or dependency changed.

## Claim and privacy boundary

This is a fixed-fixture proportion, not repository-wide, ecosystem-wide, customer, vulnerability,
pack, or future-version recall. It is not precision. It must not be combined, averaged, or
described as confirming the seeded dual-control result, the v17 calibration, the v2 A3/B6 paired
census, or any LLM-pack measurement. The per-criterion counts are diagnostic, not acceptance
decisions.

This public closeout deliberately omits private fixture contents, named defect paths, raw finding
paths, fixture commits, private absolute paths, credentials, and unrelated Alfred material. Those
artifacts remain private in Alfred.
