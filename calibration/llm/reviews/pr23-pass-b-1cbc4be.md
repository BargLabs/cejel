# PR 23 AI review pass B — reproducibility and measurement

- Reviewer: `codex-ai-review-b`
- Reviewed commit: `1cbc4be17f1f045c217e4374abf5e2cade6337ef`
- Review type: separate AI reasoning pass; not human review
- Cohort scans performed: no
- Result: `REQUEST_CHANGES`

## Finding

1. **P1 — Evidence-producing third-party Actions use floating major tags.** `actions/checkout@v4`,
   `actions/setup-node@v4`, `pnpm/action-setup@v4`, and `actions/upload-artifact@v4` can change
   without changing the reviewed Cejel commit. Because these steps create and publish release-gate
   evidence, pin every Action to an immutable commit SHA and retain the readable version in a
   comment.

The denominators, baseline binding, live external claim check, and artifact parity binding otherwise
re-derived correctly. This revision is not approved.
