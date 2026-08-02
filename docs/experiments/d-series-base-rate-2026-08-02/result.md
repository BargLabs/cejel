No D-series rule fired on unconstructed code that survived adjudication: **no** (0 genuine findings; Stage 2 had 0 raw findings).
Total scanned: **2,080 preregistered corpus entries attempted at least once** (50 burned Stage 0 + 7 owned + 2,023 Stage 2), covering **715,368 D1**, **522,096 D2-D4**, and **568,628 D5** successful file evaluations; these totals are descriptive only and are not pooled for inference.
Primary fresh-public base rate: **0 findings per 1,000 eligible files**; 95% Wilson upper bounds are **0.005814/1,000 (D1)**, **0.007838/1,000 (D2-D4)**, and **0.007158/1,000 (D5)**.

**CONSTRAINTS-VERSION: 2026-08-01.3**

# D-series base-rate scan result

## Conclusion

The positive-control harness fired on every constructed positive and stayed clean on every repaired negative. The same frozen rules then produced no raw finding in the fresh public cohort or the legacy-23 consistency cohort. The five owned raw findings were all preregistered Cejel acceptance controls and were adjudicated as constructed controls, leaving zero genuine unconstructed findings and zero false positives.

Stage 2 attempted every frozen corpus entry. Three fresh repositories had explicit execution errors affecting some or all rules; those results are errors, not clean zeros, and their files are excluded from the affected rule denominators. The fresh cohort still has 1,997 successful repositories for D1-D4 and 1,998 for D5, satisfying the preregistered minimum of 2,000 attempted public repositories while keeping errors visible.

## Primary fresh-public result

Population claims use only the 2,000 freshly selected public repositories. Owned repositories and the legacy-23 cohort are not pooled into these estimates.

| Rule | Successful repos | Error repos | Eligible files | Raw / genuine | Rate per 1,000 | 95% Wilson upper per 1,000 | Repo prevalence (95% upper) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| D1 | 1,997 | 3 | 660,676 | 0 / 0 | 0 | 0.005814 | 0/1,997 (0.191992%) |
| D2 | 1,997 | 3 | 490,103 | 0 / 0 | 0 | 0.007838 | 0/1,997 (0.191992%) |
| D3 | 1,997 | 3 | 490,103 | 0 / 0 | 0 | 0.007838 | 0/1,997 (0.191992%) |
| D4 | 1,997 | 3 | 490,103 | 0 / 0 | 0 | 0.007838 | 0/1,997 (0.191992%) |
| D5 | 1,998 | 2 | 536,635 | 0 / 0 | 0 | 0.007158 | 0/1,998 (0.191896%) |

The Wilson file interval uses positive files as the binary numerator. With zero raw findings, positive files and genuine findings are both zero. The preregistered 200-finding per-rule adjudication cap and fixed seed were not invoked.

## Separate cohorts

### Stage 1 owned repositories

All seven pinned local archives were scanned without network access: 5,731 D1-eligible files and 2,875 D2-D5-eligible files. Cejel produced one raw finding per rule; all five mapped exactly to constructed acceptance controls. The other six repositories produced no raw findings.

After excluding constructed controls, each rule has 0 genuine findings. D1's 95% Wilson upper bound is 0.669846 per 1,000 files (0/5,731); D2-D5's is 1.334377 per 1,000 (0/2,875). Repository prevalence is 0/7 with a 35.433044% upper bound. The Tier 1 point prediction of zero genuine findings was exact.

### Legacy-23 consistency cohort

All 23 pinned legacy repositories completed with no errors and no findings, matching the prior 0/23 result.

| Rule | Eligible files | Rate per 1,000 | 95% Wilson upper per 1,000 | Repo prevalence (95% upper) |
| --- | ---: | ---: | ---: | ---: |
| D1 | 21,183 | 0 | 0.181313 | 0/23 (14.311662%) |
| D2-D5 (each) | 15,608 | 0 | 0.246061 | 0/23 (14.311662%) |

### Stage 0 burned cost sample

The 50 preregistered Stage 0 repositories were scanned blind for cost only, produced zero raw findings, and were burned before Stage 1. No finding details were inspected. None is present in the Stage 2 corpus. The measured run took 139.6 seconds and supported the preregistered decision to proceed without narrowing.

## Controls and adjudication

- Positive controls: 7/7 cases passed; every constructed positive fired and every repaired negative stayed clean.
- Stage 1: 5 raw findings, 0 genuine unconstructed, 0 false positive, 5 constructed controls.
- Stage 2 fresh plus legacy: 0 raw findings, 0 genuine unconstructed, 0 false positive, 0 constructed controls.
- No raw source snippets were retained in result artifacts. Finding metadata was scrubbed through the pinned Alfred redactor.

## Coverage, skips, and errors

| Cohort | Tracked paths | Regular files | Denied | Non-regular | Missing/stat | D1 analyzed | D1 ext-excluded | D2-D5 analyzed | D2-D5 ext-excluded | >512 KB analyzed | Size skipped | Unparseable skipped |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Stage 0 burned 50 | 72,762 | 71,889 | 645 | 228 | 0 | 27,778 | 44,111 | 13,510 | 58,379 | 8 | 0 | 0 |
| Stage 1 owned 7 | 15,010 | 15,009 | 1 | 0 | 0 | 5,731 | 9,278 | 2,875 | 12,134 | 0 | 0 | 0 |
| Stage 2 fresh 2,000 | 1,824,947 | 1,774,850 | 45,399 | 4,697 | 1 | 713,645 | 1,061,205 | 542,770 | 1,232,080 | 812 | 0 | 0 |
| Stage 2 legacy 23 | 65,040 | 64,800 | 208 | 32 | 0 | 21,183 | 43,617 | 15,608 | 49,192 | 4 | 0 | 0 |

Inventory counts include files in repositories whose rule evaluation later errored; inferential denominators exclude the affected repository separately for each rule. Denied paths were never read. The single missing/stat entry was an illegal-byte-sequence checkout path in `faridani/MatlabNLP`; it is explicit rather than silently counted as analyzed.

Fresh-public execution errors:

- `polyfillpolyfill/polyfill-service` at frozen index 928: whole-repository D1 evaluation exhausted 4 GiB, 12 GiB, and 48 GiB V8 heaps before a result. D2-D5 were not attempted. Its profiled 150,560 eligible files (1,975,278,356 bytes) are excluded from every rule denominator.
- `facebook/hermes` at index 968: D1-D5 each returned `Maximum call stack size exceeded`; its 6,286 D1 and 6,135 D2-D5 eligible files are excluded for all rules.
- `swc-project/swc` at index 1,810: D1-D4 returned `Maximum call stack size exceeded`; its 46,683 D1 and 46,532 D2-D4 eligible files are excluded for those rules. D5 completed cleanly over 46,532 files and remains in the D5 denominator.

## Resume canonicalization and cost

The raw Stage 2 audit artifact contains 2,092 recorded rows because sanitized repository names did not equal manifest names during checkpoint resume, causing 18 sanitized indexes to be re-attempted for 69 excess rows. All duplicate outcome signatures were identical. `result-summary.json` preserves the raw artifact hash and canonically selects the first recorded outcome for each frozen manifest index plus revision, yielding exactly 2,023 rows. Duplicate attempts are excluded from every denominator.

- Stage 2 wall time: 2 hours 11 minutes 2 seconds, including retries.
- Peak streamed worktree disk: 2,291,644 KiB (2.19 GiB).
- Recorded raw-attempt transfer: 12,875,181,761 bytes across known rows, with 689 rows lacking transfer telemetry; three hard OOM attempts are additionally unmetered.
- Canonical recorded transfer: 12,546,135,784 bytes across known rows, with 665 unknown-transfer rows.
- Streamed checkout deletion: confirmed; the final work root was empty.

## Preregistered predictions

| Rule | Fresh-public point (range) | Observed genuine | Outcome |
| --- | ---: | ---: | --- |
| D1 | 1 (0-8) | 0 | Point missed downward by 1; inside range |
| D2 | 2 (0-12) | 0 | Point missed downward by 2; inside range |
| D3 | 1 (0-6) | 0 | Point missed downward by 1; inside range |
| D4 | 0 (0-3) | 0 | Point exact; inside range |
| D5 | 1 (0-8) | 0 | Point missed downward by 1; inside range |
| Overall | 5 (0-37) | 0 | Point missed downward by 5 (0x predicted); inside range |

## Integrity and provenance

- Canonical constraints source: `origin/main` at `05d5d9fca79ea9cb1d34e64fa795f9713b6d1bf1`.
- Preregistration commit: `57c21c2` (`docs: preregister D-series base-rate scan`), committed and pushed before any corpus scan.
- Owned corpus SHA-256: `47bdbd664746c691134c7225279d7fc7858ed12b2a436a9410a3dad6cc596b51`.
- Stage 0 manifest SHA-256: `2865d453daed2332730661bf5be37591804af4f21e64b65bc562bc27f9784dcc`.
- Fresh 2,000 manifest SHA-256: `4ed7c8381de3b7a55e3d84eebdce4d04b379ca193ea079141285603145a36d48`.
- Stage 2 2,023-entry corpus SHA-256: `2b01b4ba74b27de9e3946bde6fff0da1a2be67646874a4507141311c1a4636ff`.
- Original scan harness SHA-256: `edc070f74dbd4758994b02cbedf1b8efbd9211cfa8c378285a797c91ee250c18`.
- Stage 2 raw result SHA-256: `d73d21915a48ab1c97cded7271da44fb28783b2c7e05a01dd2b64bfc1ad167d6`.
- Canonical result summary SHA-256: `2d37f0002c6d6fac8354b75b78c5e7cc1b359fcba0a72c9a1c8b3e5e4cd12f4f`.

Frozen rule source hashes reasserted after all scans:

| Rule | SHA-256 |
| --- | --- |
| D1 | `efae630dcbab4ffe4ed997f80c5ac50bf7fead59b94c4e3f47d85bdb1c229192` |
| D2 | `10f9edd7507a57b19365dde4095ff2069f4ff0364583941d38aba1660b5ce244` |
| D3 | `12cfa7550b549456b0f2c5e0db95dc2101ca2a8770b2c5978bca43555f224896` |
| D4 | `418393eb1fcf7b9cffaeb24b9ce86e97b87e61770faf83d1b9c22459ec38f4ae` |
| D5 | `5059b890768d45b4c0cbc20a9b1a6c17b81055670e3d152ba51427f6be8c6b23` |

`git diff 57c21c2 -- src/packs/d-series` is empty: no D1-D5 rule code changed during measurement.

## Result artifacts

- `positive-control-result.json`
- `stage0-result.json`
- `stage1-result.json`
- `stage1-adjudication.json`
- `stage2-result.json` (raw audit log, including duplicate attempts)
- `result-summary.json` (canonical frozen-index aggregation)
- `stage2-adjudication.json`
