# D1 exact-signature acceptance preregistration — 2026-07-31

This record fixes the exact acceptance cases for ADR-0013 D1 before detector implementation.
D1 is limited to a key declared in a JavaScript/TypeScript config object, schema object, or Markdown
frontmatter block that has no read site in the resolved first-party JavaScript/TypeScript module
graph. A detector finding must cite the declaration file and key.

The machine-readable commitment is
`calibration/d-series/d1/acceptance/manifest.json`. It fixes three defective specimens, their
paired repaired controls, and independent behavioral oracles. Every defective specimen reads one
sibling declaration while ignoring `requireNamedApprover`; every repair reads and enforces that
key. The oracles demonstrate the resulting false approval or false validation without consulting
the future detector.

These are additional exact-signature acceptance cases. They are **outside** the historical frozen
dual-control denominator. They do not change D1 `n = 3`, do not relabel DC-01/DC-03/DC-11, and do
not claim that any of those three semantic D1 fixtures contains this narrower signature. The
historical D1 result remains cited `0 / 3`, clean-control findings `0 / 3`.

The rule may ship only if it cites all three defective paths, emits no finding for all three paired
repairs, and emits zero findings across all 23 public entries in `leaderboard/corpus.json` at their
pinned revisions. A precision failure is a no-ship result; the matcher must not be tuned after
observing the public cohort. Published leaderboard artifacts and scores must remain byte-identical.
