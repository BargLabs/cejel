# A3/B6 external paired candidate mining v4 — terminal closeout (2026-08-10)

Status: **ACQUISITION_ERROR; no cohort frozen; no Cejel scan performed**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Bound protocol and execution

| Artifact | Immutable binding |
|---|---|
| Cejel v4 preregistration merge | `4c2bf43ecaa6bdd87f5ae19b24009b0ddc02b790` |
| V4 preregistration blob / SHA-256 | `a39476ab981b6f802b0d707fbb296fcbc45ae3a1` / `67e8c12e4ccc1613313ee3a2832a27f1702878ea91564da5ebf0c63473a39e19` |
| Alfred v1 evidence merge | `02ce173775d1ab66d136c1fe4a3abbbe380809e0` |
| Alfred v2 result merge | `47811f767366550ba97d04e8c9bec3fd586b292c` |
| Alfred v3 result merge | `e82d118e04de2db47f4d08762d1966e80067a432` |
| Alfred final frozen v4 harness | `44323006f6591aaa6706a2e4b5bb4e9a979b422b` |
| Alfred v4 terminal result | `fb24d42318a700652d4dbb414faadb76dd18d519` |
| Alfred v4 merge | `f4cc6df9f6f204e474ba0f5419a15cdc058569b4` |
| Terminal result JSON blob / SHA-256 | `c1492dffb5f11bf18065333fa18442db0c2d023c` / `4ad610b2bce07a4df1432cf348568a2cb510c8701f8894d68ba6fdecd5920d4c` |
| Terminal result Markdown blob / SHA-256 | `88408425fb2f728256f69148c86dc785338021f5` / `926cbe7f08c1c9132f80ce6d09226bd3ce30668373e9d1a07af36fe9af9097a5` |
| Safe ledger blob / SHA-256 | `b105a900c659b43aa297243bbcaf5fc5ffc65f4f` / `693079203e95efce535261448120e1565c29fd5b61502b44bc2587c4fc13b8a6` |
| Encrypted live-response archive blob / SHA-256 | `d7ed15c749369fc74203d4b0eac47b6ed2e57810` / `578dd5cb4c9d772b4d10134e1bdd919e6ed51bab3f60ffc7cfc76354884838af` |

The Alfred v1 evidence, v2 result, and v3 result merges are strict ancestors of the final frozen v4
harness; the harness is a strict ancestor of the terminal result; and the result is a strict
ancestor of the Alfred v4 merge. Immediately before the sole invocation, local HEAD, the origin
remote-tracking ref, and an independent `ls-remote` lookup all resolved exactly to the final frozen
harness. The Cejel tracking and independently queried main refs both resolved to the merged v4
preregistration, every frozen detector blob matched, and the Alfred worktree was clean.

The encrypted live-response archive contains 991 successful responses. Its plaintext tar was
40,133,120 bytes with SHA-256
`df25cc186fbe765d7693e668f22a761b6493c99a79665b00413db9ba5caa15bf`; its ciphertext is
40,143,124 bytes, and the encryption/decryption round trip was verified before publication. The
safe ledger records 1,318 total attempts: 991 successes and 327 failures.

## Terminal result

The sole invocation completed with `ACQUISITION_ERROR`. The authenticated archive passed the v4
member-shape gate: all 55 expected regular JSON members matched the ledger, all 40 archived A3
search pages were authenticated, and 3,805 deduplicated A3 candidates were normalized. This shows
that the prospective v4 archive grammar admitted this archive; it does not identify which member,
if any, caused v3's earlier rejection.

GitHub's aggregate rate-limit state immediately before the invocation was 4,999 core requests and
30 search requests remaining, above the fixed thresholds. A3 completed under its frozen acquisition
frame. B6 then issued three live queries and stopped on the terminal observed error
`github_api_request_failed:search-b6-3-2:403`. The record supports no inference about why that 403
occurred, and the protocol authorized neither a retry outside its fixed per-request policy nor a
replacement query. None occurred.

| Measure | A3 | B6 |
|---|---:|---:|
| Live discovery queries issued | 0 | 3 |
| Archive/search candidates normalized or discovered | 3,805 | 0 |
| Candidates considered | 281 | 0 |
| Mechanically eligible | 200 | 0 |
| Source candidates inspected | 200 | 0 |
| Pairs qualified | 0 | 0 |

The aggregate exclusions recorded in the terminal result were: 6 for the changed-file limit, 2
for an incomplete changed-file listing, 8 because a merge commit was unavailable, 206 for prior
exposure, and 67 because a repository was unavailable. B6 inspected no file pair. No corpus or
qualification oracle was produced.

No repository identity, PR number, URL, path, source byte, per-candidate reason, raw request URL, or
private absolute path is published here.

## Claim boundary and next legitimate action

This closeout licenses only a discovery-process statement: under the frozen v4 frame, A3 produced
zero qualifying pairs from 200 inspected mechanically eligible candidates, while B6 acquisition
stopped at the recorded 403 before any B6 candidate was discovered or inspected. The A3 result is a
bounded yield result, not an A3 detector recall or precision measurement. The incomplete B6 result
is not evidence about B6 detector performance or external prevalence.

V4 therefore froze no external evaluation cohort and licenses no detector, rubric, public-default,
score, certificate, leaderboard, release, historical-result, or customer-facing performance claim.
No Cejel scan ran.

An unchanged A3 rerun would only repeat an exhausted frozen frame and is not justified by this
record. Any further A3 work should first preregister a materially different discovery frame and its
reason, without treating this zero yield as a detector failure. B6 remains incomplete. A B6-only
successor may be legitimate if it is separately preregistered before acquisition, preserves this
terminal record, binds its source frame and resource limits prospectively, and freezes how the
observed 403 response class is handled without asserting its cause. No successor may resume the v4
invocation, silently replace a query, or claim that v4 measured recall.
