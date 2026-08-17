# A3/B6 external paired candidate mining v2 — terminal closeout (2026-08-10)

Status: **PROTOCOL_FAILURE; no cohort frozen; no Cejel scan performed**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Bound protocol and execution

| Artifact | Immutable binding |
|---|---|
| Cejel successor preregistration merge | `64ffcf5e299565a3f01c3e2af3931bfaceaf3f7c` |
| Cejel preregistration blob / SHA-256 | `4e08d0a8f1bf6d009d69397ad40a80f86fe8b40f` / `bedb4b6aec0ea03bdb7999f6245902a20cd8852eb26de238df3a90f4565de641` |
| Alfred v1 evidence merge | `02ce173775d1ab66d136c1fe4a3abbbe380809e0` |
| Evidence manifest / ciphertext blobs | `34b13c3136268f5913cfb622216e3bdef4a54369` / `1bc214bdd40fb37b3527d6af4d664fd16b9c6aab` |
| Exposure-registry merge / identities | `855df9531ebe6d2bfafa2f34823fded87c027124` / 8,757 |
| Frozen detector commit / tree | `8a289ea09b4cb91354e64610181a1ae79af4b5ec` / `10960a032b784f7c11068a1b4a030bf76029eea0` |
| Alfred final frozen harness | `c71b88fc18e41724a42ab8c6156fe17e0d59a4a4` |
| Alfred terminal result | `5eb864315637207f8cb321be1eaf4b5e6f6262c8` |
| Alfred merge | `47811f767366550ba97d04e8c9bec3fd586b292c` |
| Terminal result JSON blob / SHA-256 | `4bbb305b6290acd2b7537d6089264997002acee5` / `b2ac388cb7fb42f544ffdec3a74b6d2d37106ecf12152e49c31f4bc8034624f0` |
| Terminal result Markdown blob / SHA-256 | `f3d7086fbea95ee3f851b703d8c3386d87a84ac0` / `bc25070018138e995954cb0e261122ec5ee046e2e8e68c885e523f990d441838` |

The Alfred v1 evidence merge is a strict ancestor of the final frozen harness; the harness is a
strict ancestor of the terminal result; and the result is a strict ancestor of the Alfred merge.
Immediately before the sole invocation, local HEAD, the origin remote-tracking ref, and an
independent `ls-remote` lookup all resolved exactly to the final frozen harness. Cejel
`origin/main` and an independent remote lookup both resolved to the merged successor
preregistration, and the bound detector blobs remained unchanged.

## Terminal result

The sole invocation completed with `PROTOCOL_FAILURE` at the archive-authentication gate:
`archive_mismatch:encrypted_sha256`. The committed ciphertext blob and byte count were the bound
values, but its observed SHA-256 was:

`b62fb0a08b886a1bb2bfa9a8149dea4f3e684e69ec5233af628915d7c5c5c0e6`

The evidence manifest and frozen v2 harness instead bound this 62-character value:

`b62fb0a08b886a1bb2bfa9a8149dea4f3e684e69ec5233af628915d7c5c0e6`

The comparison mechanically locates the mismatch: the frozen value omits `5c` near its end. The
protocol did not authorize substituting the observed value or retrying, so neither occurred.
Archive decryption, normalization, and acquisition all remained behind the failed gate.

GitHub's aggregate rate-limit state immediately before the invocation was 4,908 core requests and
30 search requests remaining, above the fixed thresholds. No live candidate request was issued.

| Measure | A3 | B6 |
|---|---:|---:|
| Archive/search candidates normalized or discovered | 0 | 0 |
| Candidates considered | 0 | 0 |
| Mechanically eligible | 0 | 0 |
| Source candidates inspected | 0 | 0 |
| Pairs qualified | 0 | 0 |

No repository identity, PR number, URL, path, source byte, per-candidate reason, or private absolute
path is published here.

## Claim boundary and next legitimate action

This closeout licenses only the statement that the v2 archive-authentication gate correctly stopped
on a frozen hash mismatch before acquisition. It provides no external A3 or B6 recall evidence and
does not revise the preregistered yield prediction. It cannot change a detector, rubric, public
default, score, certificate, leaderboard, release, historical result, or customer-facing claim.

There is therefore no external evaluation preregistration or promotion decision from v2. Any
successor must be additive: retain this terminal record, record the 62-character binding as an
erratum rather than editing the v2 preregistration, independently bind and verify the actual
ciphertext bytes and full 64-character SHA-256, freeze and push a new harness, and only then begin a
new acquisition invocation. Because v2 issued no candidate request and normalized no archive item,
such a successor may reuse the same archived A3 discovery frame and unchanged B6 queries if it says
so explicitly; it is a new protocol, not a retry of v2.
