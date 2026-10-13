# Result — #459/#427/#430 three-arm public delta

**CONSTRAINTS-VERSION: 2026-08-01.5**

Preregistration commit c7af18f22572a20f04db5adcc3e43a253a5b6558 was pushed before all successor
arms ran. It is a strict ancestor of this result commit. The source arms are pinned in plan.json:
pre-#459 988721e, post-#459 b673493, corrected fixes be8ce62. All three report package version
0.6.3, but the full source commits are the identities; the last two are unreleased scorers.

One macOS host, Node 26.7.0, calibrated default v17, fixed generatedAt 2026-10-13T00:00:00.000Z.
All 23 public corpus entries were scanned once per successor arm, at unchanged manifest commits
with full history. Every target was clean, non-shallow, and had the same commit count before and
after; the three manifest identity vectors are identical. Non-public implementation, pins,
reports, scores and labels were excluded and are not claimed evaluated. No raw report or
source evidence is committed.

## Measured versus preregistered

| Comparison | Completed | Errors | Scoring rows moved | Placement rows moved | Fingerprints changed | Raw reports identical after fingerprint removal |
| --- | --- | --- | --- | --- | --- | --- |
| pre-#459 → post-#459 | 23/23 | 0 | 0 | 0 | 23 | 23/23 |
| post-#459 → corrected fixes | 23/23 | 0 | 0 | 0 | 23 | 23/23 |
| pre-#459 → corrected fixes | 23/23 | 0 | 0 | 0 | 23 | 23/23 |

E0–E5 held. There are no unexpected criterion changes or errors. Both zero-movement point
forecasts held. Complete raw report bytes differ on all 23 rows in each pair, exclusively on
the fingerprint line: byte-identity.json independently compares the actual serialized files
without canonicalizing their other keys. paired-result.json is the unchanged scalar output
of the committed harness, including every public row, scores, coverage, verdict and modeled
placement. Removing a fingerprint field is a comparison operation, never a change to a report.

This discharges #460's owed public before-and-after for #459 and supplies the public scoring
delta for #427/#430. Zero public movement does not mean the changes cannot move repositories:
the invented AVA and digest specimens do move, and the two issue diagnostics reproduce the
fixes. It supplies no precision, recall or v25 calibration claim and does not publish a board.

## Original partial protocol — disclosed, not erased

The original preregistration dd9e16a completed its pre-#459 and post-#459 arms (23 rows each).
Before executing its fixes arm, a new quoted-import negative control exposed a false AVA
binding. That candidate was corrected and the original protocol was stopped, with its separate
ERRATA.md committed. Its plan and preregistration were never amended. No per-row comparison
was read to choose this successor's expected values, which carry the original forecasts unchanged.

The successor therefore repeats the two unchanged baselines. Original local outputs remain
untouched; no row error was repaired or retried, and no target pin, threshold or forecast was
adjusted to obtain these results. The fixes arm first ran under this successor protocol.

Merge with a merge commit, preserving preregistration/result ancestry. Do not squash this branch.
