# Decision-contract prospective held-out evaluation v1 — result (2026-08-09)

Status: **REFUSED_AGGREGATE_EXTREME — non-claim-bearing**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Disposition

The sole run authorized by
`decision-contract-heldout-v1-preregistration-2026-08-09.md` completed without a retry. All three
seeded calibration controls were detected, all three paired control repairs were clean, and the
precommitted gate opened. All twelve prospective synthetic pairs then completed with no oracle,
detector, materialization, binding, or instrument error.

The frozen descriptive result is **12/12 seeded cases detected**, **0/12 paired repairs flagged**,
and **0 abstentions**. Because seeded detection was exactly `12/12`, the preregistered
zero-or-perfect guard set the result state to `REFUSED_AGGREGATE_EXTREME`. The run is therefore
non-claim-bearing and licenses no aggregate statement. There was no retry.

This refusal is not a detector failure. It is the precommitted protection against interpreting an
extreme result from a synthetic, single-author/home-field corpus as stronger evidence than the
construction supports.

## Instrument-control gate

| Control | Seeded outcome | Paired-repair outcome |
|---|---|---|
| `DC-01` | detected | clean |
| `DC-11` | detected | clean |
| `DC-14` | detected | clean |

These six rows are outside every held-out count.

## Redacted held-out outcomes

| Pair | Seeded outcome | Paired-repair outcome |
|---|---|---|
| `HC-01` | detected | clean |
| `HC-02` | detected | clean |
| `HC-03` | detected | clean |
| `HC-04` | detected | clean |
| `HC-05` | detected | clean |
| `HC-06` | detected | clean |
| `HC-07` | detected | clean |
| `HC-08` | detected | clean |
| `HC-09` | detected | clean |
| `HC-10` | detected | clean |
| `HC-11` | detected | clean |
| `HC-12` | detected | clean |

The exact predicate required a missing-premise finding for the exact contract and exact
`src/subject.mjs` path, with no abstention. A paired repair counted as clean only when the
detector-independent oracle satisfied its fixed expectation and the pack emitted no finding or
abstention.

## Immutable bindings and ancestry

| Artifact | Binding |
|---|---|
| Cejel detector commit | `ba226c8edc68d96bb69354895e9b7ccf4b397dd1` |
| Cejel detector Git tree | `19a605671cedfc2df351148b3fd0e56d9f6b72e7` |
| Package version in that source tree | `0.4.0` — not a claim that this post-release pack shipped in tag `v0.4.0` |
| Pack entry point | `dist/packs/decision-contracts/index.js` |
| Preregistration merge | `BargLabs/cejel@b402ee9c2eebbbbdad85418f2ccfa1d00bc217f5` |
| Preregistration Git blob | `53da74758a5781de552b799cc3c23097cda80559` |
| Preregistration SHA-256 | `2e17788fc6caabd6a107cadebcda105acd1b8db6dbc1a6573fe6ee753bb22b7b` |
| Alfred calibration merge | `BargLabs/alfred@a4c5012da7dd058ca7aa2d372d0d906141afe647` |
| Alfred held-out corpus merge | `BargLabs/alfred@7230ac20d10b556dc76738c7f58eba66d0736c2b` |
| Held-out corpus Git blob / SHA-256 | `5178050f51aad26d43c69ba9cb5ab336f4241ddc` / `5da3d25940d9ae688618294a6d1c720012fee46297c49e8895b031bc5a238afd` |
| Detector-independent oracle blob / SHA-256 | `89f8003a7160531e0b2212121902d80ca2f31bec` / `88313014ac3f7e5707efa96da951682675dd0b162b45e35c80ff1b5b5f53ede5` |
| Pushed private harness | `BargLabs/alfred@a637c3346947edf49f1b0f958ef994f3f6b6018d` |
| Private result commit | `BargLabs/alfred@79ea9a6c610392e8051a7a3012e231b0772862a2` |
| Private result merge | `BargLabs/alfred@106876fa01ac8ec2b74afe96e69b827d277b1d09` |

Within Alfred, the calibration merge and held-out corpus merge are strict ancestors of the
pushed harness, and the harness is a strict ancestor of the result commit. Alfred PR
[#872](https://github.com/BargLabs/alfred/pull/872) was merged with a merge commit, preserving
that ancestry. The Cejel preregistration commit and document blob are cross-repository immutable
content bindings, not Alfred ancestors. Commit timestamps were not used as ancestry evidence.

## Run integrity and private evidence hashes

- Run count: **1**
- Run window: `2026-08-09T23:53:17.464Z` to `2026-08-09T23:53:17.514Z`
- Control rows: **6**
- Evaluation rows: **24**
- Oracle, detector, materialization, binding, and instrument errors: **0**
- Seeded abstentions: **0**
- Paired-repair abstentions: **0**
- Committed private result JSON SHA-256:
  `0e67f3ef426d3752cf08980548d9fad0f6bfef9df7aff427fc0de3b1b6469f60`
- Committed private result Markdown SHA-256:
  `b853c7635917311212f8bb436589f75793ddbce174305aecdf221336f1eb8964`
- Canonical JSON semantic hash:
  `83649809e29bd2ca6d3269ad88f4e768ccae8d4bbae8220b92a3e4cb85d9ced6`

Repository formatting changed JSON whitespace after emission but did not change the canonical
JSON semantic hash. The exact detector worktree installed lockfile-pinned dependencies offline
and built successfully with its pinned local `tsup 8.5.1`; no detector source or dependency was
changed for the run.

## Claim and privacy boundary

The pack remains experimental, opt-in, non-scoring, and outside the default scan, A1–B6 rubric,
certificate score, leaderboard, and every published release. This result does not estimate
real-world recall or precision, defect prevalence, repository-wide semantic recall, automatic
semantic-defect detection, release quality, rubric performance, leaderboard performance, or
customer performance. It must not be presented as a `v0.4.0` release result.

This public closeout deliberately omits private fixture source, complete raw detector evidence,
private absolute paths, credentials, and unrelated Alfred material. The raw result remains in
private Alfred. The frozen preregistration, detector, corpus, calibration artifacts, historical
results, and release artifacts remain unchanged.
