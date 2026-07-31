# D2 exact-signature acceptance preregistration — 2026-07-31

The fixture-only commit `282468d` fixed the exact acceptance case for ADR-0013 D2 before detector
implementation. D2 is limited here to an awaited operation that returns a static successful result
and whose catch binds but never uses the error while returning a static failed result. A detector
finding must cite the catch's source file and binding line.

The machine-readable commitment is
`calibration/d-series/d2/acceptance/manifest.json`. It fixes one defective specimen, its paired
repair, and an independent behavioral oracle. The defective specimen discards the upstream error
detail from its surfaced message. The repair incorporates that detail. The oracle demonstrates the
difference without consulting the detector.

This is an additional exact-signature acceptance case. It is **outside** the historical frozen
dual-control denominator. That suite contains D2 `n = 0`, so D2 was not measured there; no frozen
seed is claimed as caught and no pooled `0 / 16` claim applies to this rule.

The rule may ship only if it cites the defective path, emits no finding for the paired repair, and
emits zero findings across all 23 public entries in `leaderboard/corpus.json` at their pinned
revisions. Detector behavior was frozen in commit `7d2c196` before the first public-cohort
observation. A precision failure is a no-ship result; the matcher is not tuned after observing the
public cohort. Published leaderboard artifacts and scores must remain byte-identical.
