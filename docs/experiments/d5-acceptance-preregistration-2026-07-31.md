# D5 exact-signature acceptance preregistration — 2026-07-31

This record fixes the exact acceptance case for ADR-0013 D5 before detector implementation. D5 is
limited to an equality assertion in a JavaScript or TypeScript test file whose direct expected-value
identifier is imported from the same first-party module as the separately imported code exercised
by the actual expression. The detector must cite the assertion file.

The machine-readable commitment is `calibration/d-series/d5/acceptance/manifest.json`. It fixes one
defective specimen, its paired repaired control, and an independent behavioral oracle. In the
defective specimen, both the wrong implementation and `EXPECTED_REVIEW_REQUIRED` say that review is
not required, so a self-referential assertion passes. The repair removes the exported expected value,
restores the required behavior, and asserts the independently specified literal `true`.

This is an additional exact-signature acceptance case. It is **outside** the historical frozen
dual-control denominator. It does not change D5 `n = 4`, does not relabel DC-04/DC-05/DC-07/DC-10,
and does not claim that any of those four semantic D5 fixtures contains this narrower signature. The
historical D5 result remains cited `0 / 4`, paired-clean findings `0 / 4`.

The rule may ship only if it cites the defective assertion path, emits no finding for the paired
repair, and emits zero findings across all 23 public entries in `leaderboard/corpus.json` at their
pinned revisions. A precision failure is a no-ship result; detector behavior must be frozen before
the first public-cohort observation and must not be tuned afterward. Published leaderboard artifacts
and scores must remain byte-identical.
