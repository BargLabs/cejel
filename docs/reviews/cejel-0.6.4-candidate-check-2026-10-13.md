# Cejel 0.6.4 candidate and release-evidence check — 2026-10-13

**CONSTRAINTS-VERSION: 2026-08-01.5**

Current remote main is b673493ee1a640026530f7cc65ac94aff8139bf1 (#459's merge). The latest GitHub release is v0.6.3, published 2026-10-10 at 00:31:04 UTC; its commit is 8ad26b496e32a5bc3b2350f2b0f8a5f940ea74ac. No release or scoring change was performed in this check.

## Candidates

- **#436: mitigation available in open PR #462, not yet on main or released.** Head 8f8ec8a3faed22de9d5c9d6d653efaf9e397cff4 has all current GitHub checks passing and contains the contributor note and warning, including the command-mode correction. Older Cejel binaries on PATH cannot emit a warning they do not contain. Treat this as a mitigation, and retain the caveat instead of claiming #436 completely fixed.
- **#430: still reproduces.** Issue is open and no dedicated fix PR is open. At dunstan's reported commit e0ec7ed05272e09fee21f0f29d70395f846547ac, A2 is 2.4/warning and the certificate emits the non-constant-time comparison warning at src/advisory/precision.ts:108. The source compares a published extractor grammar digest against the lookup key; this is the reported public-digest false assertion. A fix needs to distinguish public identifiers from authentication values, retain secret-comparison controls, and measure the scoring delta.
- **#427: still reproduces.** Issue is open and no dedicated fix PR is open. At slugify's reported commit 3b17b2e84b97624a683aafaa38184bf2746fab22, non_hollow_test_share is 0/1 and A1 is 1.5/critical despite the AVA assertions. AVA root-file discovery is already present, but the assertion-recognition pattern still excludes AVA's t.is/t.deepEqual/etc. A fix needs positive assertion controls and negative controls for skipped/placeholder tests, followed by a scoring-delta record.

Both diagnostic targets were full-history clones, pinned to the issue's exact target commit. Scans used the built #462 artifact at the head above, reporting toolVersion 0.6.3 and calibrated default witan-rubric-v17-2026-07-24. A git diff confirms src/witan is byte-identical between that head and current main b673493. This therefore checks the current main scorer, including unreleased #459, rather than asserting that the installed artifact was the published v0.6.3 package. Raw reports remain local; these two diagnostic scans are not a corpus evaluation or a precision/recall estimate.

## #459: outstanding before release

The obligation is already tracked by open issue #460, "later: preregistered public-corpus delta for the #459 v17 error-handler widening, before the next release". #459's PR body and the 2026-10-12 RUBRIC_CHANGELOG entry explicitly say the public-corpus before-and-after has not run. Current main contains no #459/#460 preregistration or result directory. Passing fixture and fingerprint tests do not discharge this obligation.

The isolated before arm can be #459's first parent 988721e957dedd6c7649a1fb8cb4475459c573a8; its src/witan tree is identical to the released v0.6.3 scorer. The after arm is b673493ee1a640026530f7cc65ac94aff8139bf1. Run both at the calibrated default v17 on identical target commits and history depth. A new preregistration must pin both arms, corpus manifest, acquisition/history protocol, timestamp and expected outcomes, and be committed and pushed before running either arm. Its commit must remain a strict ancestor of the result commit. Record all per-row scoring changes, non-scoring report differences and placement effects, including unexpected results; do not move corpus pins to make the comparison pass.

The v25 health-route proposal remains prospective and uncalibrated. The v17 delta for #459 does not by itself calibrate v25. Existing publication boundaries still apply: no adjudication labels, reviewer notes, evidence corpora, private implementation, keys or counterparty specifics belong in a public artifact. Historical public protocols are precedents, not authorization to disclose closed-class material.

If #430/#427 enter 0.6.4, their scoring changes also need frozen regression specimens, fingerprints, rubric records and paired corpus evidence. Preserve an arm isolating #459 so a combined release comparison does not obscure which change moved a row.

## Measurement-freeze status

The issue descriptions' historical instruction to wait for the freeze should not be treated as current status. The current mechanical full-tree guard passes a verified closed cycle-13 window, closed 2026-09-17T16:52:25.427Z. This does not waive scoring evidence or preregistration requirements.

## Release decision

0.6.4 is not ready for release: #436's mitigation is unmerged, #430 and #427 remain unfixed candidates, and the mandatory #459 corpus delta is outstanding under #460. The latter is a release blocker even if the two new scoring candidates are deferred. No new issue is required for that debt; #460 already owns it.

Lesson staged: specimen tests and artifact version strings do not establish release readiness. Check the scorer commit, reproduce candidate defects at their reported pins, and keep an outstanding paired corpus obligation visible separately from fixture results.

Report-branch verification: pnpm build passed; the full pnpm test suite passed all 113 files and 1,886 tests, including the offline-boundary guard. The staged lesson passed the canonical validator. These checks validate the report branch; they are not the outstanding #459 paired corpus run.
