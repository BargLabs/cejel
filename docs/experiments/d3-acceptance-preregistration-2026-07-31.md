# D3 exact-signature acceptance preregistration — 2026-07-31

The fixture-only commit `5f4217f` fixed the exact acceptance case for ADR-0013 D3 before detector
implementation. D3 is limited here to a high-confidence false-success subset of unasserted set
transforms in JavaScript and TypeScript: a function directly filters a parameter into a const-bound
output, initializes a distinct const-bound explanation ledger to an empty array, then returns
literal `ok: true` with shorthand properties for both collections. A detector finding must cite the
filter call's source file and line.

The machine-readable commitment is
`calibration/d-series/d3/acceptance/manifest.json`. It fixes one defective specimen, its paired
repair, and an independent behavioral oracle. The defective specimen reports success after dropping
one input row while explaining none. The repair records the excluded row and fails loud unless
`input.length === output.length + explained.length`. The oracle demonstrates the difference without
consulting a detector.

This is an additional exact-signature acceptance case. It is **outside** the historical frozen
dual-control denominator. The semantic D3 seeds are DC-08, DC-09, DC-13, DC-14, and DC-15; their
frozen result remains cited `0 / 5` and paired-clean findings `0 / 5`. They have no pre-registered
seed-to-rule acceptance mapping, are not relabeled, and are not claimed as caught. No pooled
`0 / 16` claim applies to this rule.

The attempt may ship only if it cites the defective path, emits no finding for the paired repair,
and the first frozen detector observation emits zero findings across all 23 public entries in
`leaderboard/corpus.json` at their pinned revisions. Detector behavior was frozen in commit
`2bf342f` before that observation; the matcher file's SHA-256 is
`12cfa7550b549456b0f2c5e0db95dc2101ca2a8770b2c5978bca43555f224896`. A precision failure is a
no-ship result; the matcher is not edited after observing the public cohort. Published leaderboard
artifacts and scores remain byte-identical.
