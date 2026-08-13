# In-scope native detection-recall experiment v2 — terminal control void (2026-08-09)

Status: **VOID_CONTROL_FAILURE; non-claim-bearing**

**CONSTRAINTS-VERSION: 2026-08-01.3**

## Disposition

The one run authorized by
`in-scope-detection-recall-v2-preregistration-2026-08-09.md` executed the six frozen positive
controls in preregistered order. Three controls were cited by their named criterion and three were
not:

| Control | Named criterion | Outcome |
|---|---|---|
| `PC-A1` | A1 | cited |
| `PC-A2` | A2 | missed |
| `PC-A3` | A3 | missed |
| `PC-A4` | A4 | cited |
| `PC-A5` | A5 | cited |
| `PC-B6` | B6 | missed |

No control ended in a process error. The precommitted gate stopped execution after the controls,
so no evaluation fixture was materialized or scanned. Evaluation rows executed: **0**.

The run is therefore terminally void. It reports no recall numerator, denominator, rate, Wilson
interval, full-cohort value, held-out value, per-criterion value, pass/fail label, qualitative
threshold, or licensed claim. In particular, this result is not evidence of zero recall: it is
evidence that the frozen positive-control instrument did not validate all six named criteria.

## Immutable bindings

| Artifact | Binding |
|---|---|
| Successor preregistration merge | `BargLabs/cejel@8da5940c3ebc0ff96a4fc4ea34147bc9832df7b1` |
| Successor preregistration Git blob | `3e37cba286affe16d2b1b88dfa41af9687b91d7b` |
| Cejel release | tag `v0.4.0` |
| Cejel commit | `03ef74bd05274ff079c8dcd09dcdfaa8a6f1e3ff` |
| Cejel Git tree | `a857f0b3df0cd38d69393b7a90383156ae2fdb82` |
| Rubric | `witan-rubric-v17-2026-07-24`, selected explicitly |
| Scan boundary | `scoreRepoWithPublicCejel`, no ingest and no auto-discovered ingest |
| Fixed `generatedAt` | `2026-08-09T00:00:00.000Z` |
| Private corpus merge | `BargLabs/alfred@d4f6f0dfa0721d2e35b40b14f43f227e5ec79dbc` |
| Private corpus Git blob | `84e1d7d55d73b0c0895809d40e9946758636c777` |
| Private corpus SHA-256 | `331349ecd5be409f0800e396863d3a7869f330b7603baf0e484636733f878220` |
| Pushed private harness | `BargLabs/alfred@207292969e86a660062515491805aadcb72433fa` |
| Private result commit | `BargLabs/alfred@42efba923433e045f17a28f41224ba0d3d3ca00c` |
| Private result merge | `BargLabs/alfred@931e3d45c24dfd5a1bb120331cc38583000c65ea` |

The corpus merge and pushed harness are strict ancestors of the private result commit. Alfred PR
[#866](https://github.com/BargLabs/alfred/pull/866) was merged with a merge commit, preserving the
harness and result commits as ancestors of Alfred `main`.

## Private evidence hashes

| Evidence | SHA-256 |
|---|---|
| Committed private result JSON | `6e36ea5067e5f0e674c146adc5ac189619e44988139b1325b881dbb411e03f4a` |
| Committed private result Markdown | `4c2e8d56c5c178da48e1a884733bed2831625ee7b7b4bc7bb9e087854a1acdca` |
| Canonical JSON semantics | `ff6f9cd36b3fc847a0f71fa7901e08a471b458b38f57b42114bc8ebaeaf050f6` |

Repository formatting changed JSON whitespace after emission but did not change the canonical JSON
semantic hash. The committed Markdown regenerates byte-for-byte from the committed JSON.

## Publication boundary

This public closure deliberately omits private fixture contents, private evidence paths, private
absolute paths, and unrelated Alfred material. The private corpus and raw scan evidence remain in
Alfred. The v1 and v2 preregistrations, v1 addenda, corpus, and private result are immutable.

No rerun is authorized. Any successor must preregister new controls and a new execution before
reading or materializing an evaluation fixture; it may cite this run only as a void instrument
pilot, never as a recall outcome.
