# D4 exact-signature acceptance preregistration — 2026-07-31

The fixture-only commit `4b35f2b` fixes the exact acceptance case for ADR-0013 D4 before detector
implementation. D4 is limited here to a three-statement call site that binds a direct call to a
first-party function, maps the function's explicit failure result to an empty array, and then
returns literal success unconditionally. The resolved callee must itself contain static returns for
failure, successful emptiness, and successful populated data under the same collection property.

The machine-readable commitment is
`calibration/d-series/d4/acceptance/manifest.json`. It fixes one defective specimen, its paired
repair, and an independent behavioral oracle. The oracle proves that the defective call site makes
the callee's failure indistinguishable from successful emptiness, while the repair preserves the
failure signal. It does not consult detector output.

This is an additional exact-signature acceptance case **outside** the historical frozen
dual-control denominator. DC-02, DC-06, DC-12, and DC-14 remain semantic D4 examples, not exact
acceptance proof for this narrower matcher. They are not relabelled or modified, and no one is
claimed as caught. The frozen D4 result remains cited `0 / 4` and paired-clean findings `0 / 4`.

The rule may ship only if it cites the defective path, emits no finding for the paired repair, and
emits zero findings across all 23 public entries in `leaderboard/corpus.json` at their pinned
revisions. Detector behavior must be frozen in a commit before the first public-cohort observation.
A precision failure is a no-ship result: the matcher is not tuned after observation. Published
leaderboard artifacts and scores must remain byte-identical.

The focused regression guard was observed RED before implementation: Vitest could not resolve the
then-absent `empty-failure-conflation.js` detector module. After implementation, the same focused
guard passed all 10 tests.

Detector behavior was frozen in commit `7af6118` before its first public-cohort observation. That
observation passed with findings `0 / 23`; every checkout matched its pinned revision. The matcher
source SHA-256 was
`418393eb1fcf7b9cffaeb24b9ce86e97b87e61770faf83d1b9c22459ec38f4ae`, and no matcher edit was
made after observation. The leaderboard tree SHA-256 remained
`54e066650b27563022d4bd6f7c43c3276021a5dc0adb3b72725125c21237cce6` before and after the run.
