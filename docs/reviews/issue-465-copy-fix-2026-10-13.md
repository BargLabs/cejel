# Issue 465: qualify negative protected-path review gate copy

**CONSTRAINTS-VERSION: 2026-08-01.5**

The certificate's negative binary outcome previously asserted no CODEOWNERS was detected. A CODEOWNERS file outside GitHub's recognized locations does not qualify for the metric, so that assertion overstated the result. The copy now states that no CODEOWNERS file in a location GitHub reads, and no documented required-review or branch-protection policy, was detected. Scoring and the metric's evidence rules are unchanged.

The existing HTML/Markdown rendering test now requires the qualified copy and rejects the old wording. Against the unchanged source, the revised suite failed exactly one test (30 passed); with the fix, all 31 tests passed.

Verification on this branch: typecheck and pnpm build passed; pnpm test passed all 113 files and 1,884 tests, including the 41 offline-boundary tests. Fixture commits used process-local commit.gpgsign=false because this host's signing configuration is unavailable to test subprocesses. No repository guard was changed.

Lesson staged in PENDING_cejel_absence_copy_names_eligible_evidence_2026-10-13.json: negative outcome copy must name the qualifying evidence whose absence was measured. No score change, merge, release or publish.
