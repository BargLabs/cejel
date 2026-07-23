# PR 23 AI review pass A — execution and security

- Reviewer: `codex-ai-review-a`
- Reviewed commit: `1cbc4be17f1f045c217e4374abf5e2cade6337ef`
- Review type: isolated AI code review; not human review
- Cohort scans performed: no
- Result: `REQUEST_CHANGES`

## Finding

1. **P1 — A trusted workflow head can differ from the frozen detector commit.** The verifier proves
   that each run descends from the public pre-result commitment, but the measurement does not
   require `run.head_sha === detector_freeze.detector.git_commit`. A descendant can therefore
   modify the workflow or bundle generator and still satisfy ancestry. Require both cohort runs to
   execute the exact detector commit and test a substituted descendant head.

The earlier parity, live-surface, and UDP/TLS findings are corrected. This revision is not approved.
