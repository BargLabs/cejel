# B6 external paired candidate mining v5 — terminal closeout (2026-08-10)

Status: **INSUFFICIENT_CANDIDATE_POOL; no cohort frozen; no Cejel scan performed**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Bound protocol and execution

| Artifact | Immutable binding |
|---|---|
| Cejel v5 preregistration merge | `28e2ab6d7bd214c28481715d5995ab26844b9431` |
| V5 preregistration blob / SHA-256 | `c931e641dcf08ca13bfa6c0e54069485b32ff03c` / `0dbbce94874cf5f3ac4b80fdb46359b49eb7e3028b64a7d2bcafe296df21c61e` |
| Cejel v5 erratum merge | `ca52139580b2a498561de986a8411d9b5f1ba76e` |
| V5 erratum blob / SHA-256 | `8c1f311479427e19bcab0b3489508c9df109c0a4` / `50dd83bd817dc64b4105b299fedc1be67390fe270cfd86828a9ed83d6c3a0dec` |
| Alfred final frozen v5 harness | `484330bc9d856ef6536f0796cd1ff39c0a20e141` |
| Alfred v5 terminal result | `5e6b1d72e8c1bc05e1c4d34f71e7794ffffa7462` |
| Alfred v5 merge | `8ee3ee024861f2d53c5d8ed5c235294b3a1a62a2` |
| Terminal result JSON blob / SHA-256 | `c23a34abbca3c7eab119f65df508b929633d86a0` / `6a7c35cb7e07420b8d1f678fca5689e71525702907e01353462412d6dd33260f` |
| Terminal result Markdown blob / SHA-256 | `bbcd17334279bd16077144078ca24529a89b6e0f` / `c04523f51bf20652ae16c6a1eb9b4e30f0a4925028828289eeae4eaaa0d05ead` |
| Safe ledger blob / SHA-256 | `7e6daeac0decbb87f649e666433624637c7a00a6` / `87c4f965c5d59f4f7277093e1e42dec02c9d15e21bacb40b335d9e716a3f37fd` |
| Encrypted live-response archive blob / SHA-256 | `2fc63e7ce0b368d442213a5aca2be698f50f769d` / `f5da67b03ed54ba1ebf5a1ef64293bdca280e98cff74917296dde878812393e6` |

The Alfred v4 merge is a strict ancestor of the final frozen v5 harness; the harness is a strict
ancestor of the terminal result; and the result is a strict ancestor of the Alfred v5 merge.
Immediately before the sole invocation, local HEAD, the origin remote-tracking ref, and an
independent `ls-remote` lookup all resolved exactly to the frozen harness. Cejel tracking and
independently queried main both resolved to the merged erratum, every predecessor binding and
frozen detector blob matched, the exposure registry contained exactly 8,757 identities, and the
Alfred worktree was clean.

The v4 ciphertext was read only as opaque bytes to verify its bound Git blob, 40,143,124-byte size,
and SHA-256. It was not decrypted, parsed, reused, or used to derive an identity. The v5 encrypted
live-response archive contains 1,052 successful responses. Its plaintext tar was 59,289,600 bytes
with SHA-256 `45ac85249770b24757f5c73b2c5deea53d6b94b03a2b5a4324e35f62279e98e8`;
its ciphertext is 59,304,276 bytes, and the encryption/decryption round trip was verified before
publication. The safe ledger records 1,062 total attempts: 1,052 successes and 10 documented HTTP
404 unavailable responses. Plaintext temporary storage was deleted only after the result commit
was pushed and independently authenticated.

## Terminal result

The sole invocation completed with `INSUFFICIENT_CANDIDATE_POOL`. All five frozen B6 discovery
queries started. GitHub's aggregate rate-limit state immediately before the invocation was 4,999
core requests and 30 search requests remaining, meeting the fixed thresholds. Fixed in-invocation
retry and search-spacing rules were part of this one run; no rerun, resume, query repair, response
reuse, or manual substitution occurred.

| Measure | B6 |
|---|---:|
| Discovery queries started | 5 |
| Collapsed candidates discovered | 4,316 |
| Candidates considered | 167 |
| Mechanically eligible | 143 |
| Source candidates inspected | 143 |
| Before/after file pairs inspected | 200 |
| Pairs qualified | 1 |

The aggregate exclusions recorded in the terminal result were: 12 for the changed-file limit, 3
because a merge commit was unavailable, 1 because the merge was after the frozen cutoff, 152 for
prior exposure, and 8 because a repository was unavailable. The run exhausted the fixed 200-file-
pair bound before reaching the required six pairs. One pair qualified, but the protocol requires
exactly six to freeze a cohort, so no corpus or qualification oracle was emitted.

No repository identity, PR number, URL, path, source byte, per-candidate reason, raw request URL,
response body, header, private absolute path, or credential is published here.

## Claim boundary and next legitimate action

This closeout licenses only a bounded discovery-process statement: under the frozen v5 B6 frame,
one qualifying pair was found after 143 source candidates and the full 200 before/after file-pair
budget were inspected. This is not a B6 detector recall, precision, prevalence, or base-rate
measurement and supplies no evidence about detector performance.

V5 froze no external evaluation cohort and licenses no detector, rubric, public-default, score,
certificate, leaderboard, release, historical-result correction, or customer-facing performance
claim. No Cejel scan ran. Because fewer than six pairs qualified, v5 does not authorize a B6
evaluation preregistration.

An unchanged rerun would repeat an exhausted frozen frame and is not justified. Any further B6
candidate work must first preregister a materially different discovery frame and its reason,
preserve this terminal record, avoid reusing or decrypting v5 responses unless prospectively
authorized, and remain discovery-only until a complete cohort is frozen. The legitimate immediate
engineering work is independent of this experiment and must not reinterpret the one-pair yield as
a detector result.
