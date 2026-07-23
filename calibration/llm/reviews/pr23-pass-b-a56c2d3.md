# PR 23 AI review pass B — measurement and claims

- Reviewer: `codex-ai-review-b`
- Reviewed commit: `a56c2d305752726f1e21f552dbcfb62a5e89f79d`
- Review type: separate AI reasoning pass; not human review
- Cohort scans performed: no
- Result: `REQUEST_CHANGES`

## Finding

1. **P1 — A denial in an earlier clause suppresses a later prohibited claim.** `isNegated` searches
   from the start of the sentence. Text such as “Cejel does not measure a hallucination rate, but
   detects hallucinations” therefore treats the later detection claim as negated. A semicolon or
   contrastive conjunction must start a new claim clause, and the regression needs a test. Also
   cover direct “hallucination-free” language as an implied prevention claim.

The untouched-only denominators, opportunity coverage, label lifecycle, baseline binding, and live
surface authentication otherwise re-derived correctly. This revision is not fully approved.
