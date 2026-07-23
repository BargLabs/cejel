# PR 23 post-approval orchestration audit — correction

- Audited commit: `0446669095755e0005dfd4f48c37a3dc91c236c7`
- Reviewer: `codex-master-orchestrator`
- Cohort scans performed: no
- Result: `REQUEST_CHANGES` (supersedes the two approvals for merge readiness)

Dry-running the real chronology exposed a circular constraint not exercised by the code tests:
the golden run must occur before the detector-freeze record exists, while the untouched run needs
a later commit containing that record. Requiring both workflow `head_sha` values to equal the
detector source commit therefore makes a legitimate sequence impossible.

The correction must freeze the exact workflow-file hash with the detector, authenticate those
bytes independently at each run head through GitHub, retain commitment ancestry, and continue to
require every receipt's binary hash to equal the frozen detector build. This preserves protection
against a modified descendant workflow without requiring an impossible identical repository head.
