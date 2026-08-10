# Dual-control downstream-labelling retraction — 2026-08-10

Status: **retraction of the August 5 PR #789/action-item interpretation; frozen results unchanged**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Retraction

The August 5
[`dual-control-downstream-labelling-erratum-2026-08-05.md`](dual-control-downstream-labelling-erratum-2026-08-05.md)
correctly says that the original 2026-07-31 dual-control baseline required and measured
`static_rubric` and `quant_integrity_pack`. It then makes a false downstream inference: it applies
that baseline's instrumentation to Alfred PR #789's later D-series successor rerun and says the
ADR-0013 action item remained unsupported because the D-series pack was not exercised.

PR #789 did exercise the pinned D1, D2, and D5 pack rules. Its positive-control phase correctly
records only `static_rubric` and `quant_integrity_pack`; that A2 wiring control is outside every
evaluation denominator. The immutable raw artifact separately records this exact tuple on all 16
seeded and all 16 paired-clean evaluation phases:

`static_rubric, quant_integrity_pack, d_series_pack`

At the frozen harness commit, the evaluation runner invokes the pinned adapter before recording
that tuple. The adapter imports the frozen Cejel D-series entrypoint and calls the D1, D2, and D5
scanners. The raw result preserves empty finding arrays for each pinned rule on every evaluation
phase. Therefore the August 5 claim that PR #789 was only a two-surface measurement, and its
conclusion that the ADR-0013 rerun action item remained open, are retracted.

## Immutable evidence

| Artifact | Binding |
| --- | --- |
| Retracted Cejel erratum merge | `30d8fe206eed37dc4a0362e63ea0cbd586cfc01b` |
| Retracted Cejel erratum blob | `cda0d2761b01a7bab2870aeab1b2b2b88f1fecb0` |
| Alfred correction PR | [#878](https://github.com/BargLabs/alfred/pull/878) |
| Alfred correction merge | `9e9ee083d8703ef5e8dd53259ae25c161aabccc9` |
| Alfred correction document blob | `6d47c5af4f701d53e06ec6b3265f1360d09ab66c` |
| Alfred correction document SHA-256 | `16a716d71c8cd5c12327407a9e07dc34b7ed017f8c4cf1a609004c1b2fc99fd2` |
| Alfred PR #789 merge | `5e051310103bf6a171a9e09d0c396efcc0c235e4` |
| Frozen harness | `aff2c28446fea9d31946e2d490cf54104206ac0a` |
| Raw result commit | `c1cd701fd7ebe9a52cbcca58701c024f2f8bc540` |
| Raw result JSON blob | `08a9ded537f2b0244babc6f0e82460648eb92f76` |
| Raw result JSON SHA-256 | `d13c6b4c5fd6861bfb42de865ca8539fbd3e8d5354207905f9d9081ddf308b8e` |
| Frozen runner blob | `b14646ba22a4f9dccf6ee5ca44ea9f97f08b28ee` |
| Frozen adapter blob | `ad35af47f65cec8a3fed12eb0af30911f3e78807` |
| Frozen Cejel target | `e072bd7fe7f9b3bc705a2c56c86f62c35f0e42cc` |

The Alfred correction merge is a descendant of the PR #789 merge. The raw result commit is a
descendant of the frozen harness, and its JSON blob and byte hash match the bindings above. These
are cross-repository content bindings; this document does not claim Git ancestry between Alfred
and Cejel.

## Result disposition

No experiment was rerun, and no numerator or denominator changes. PR #789's targeted result
remains:

- held-out exact-path citations: **0 / 8**;
- full-subset exact-path citations: **0 / 16**;
- paired-clean exact-path citations: **0 / 16**; and
- public-cohort findings: **0 / 23** for each pinned rule, with a byte-identical board tree.

This is a targeted zero against the pinned D1/D2/D5 exact signatures. It is not evidence that the
rules failed and is not a semantic-class recall claim: the D1 and D5 fixtures do not instantiate
their narrow signatures, and D2 has no seed. D3 and D4 were excluded by the immutable Cejel
target. The result remains non-claim-bearing, and the standing retirement of D-series detection
remains unchanged.

This retraction does not edit either preregistration, frozen harness, raw result, historical
rendering, corpus, oracle, detector, rubric, rubric version, score, leaderboard artifact,
numerator, or denominator.
