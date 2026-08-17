# A3/B6 external paired candidate mining v3 — terminal closeout (2026-08-10)

Status: **PROTOCOL_FAILURE; no cohort frozen; no Cejel scan performed**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Bound protocol and execution

| Artifact | Immutable binding |
|---|---|
| Cejel v3 preregistration and v2 erratum merge | `db6002a0a864d6d89b87b40a8552ab7be5e4754c` |
| V3 preregistration blob / SHA-256 | `cabddbd00a4239e79de088a1d1071fa293418595` / `07b22f94bf3308026d4de8d4c719636a01bac565ea6e9c25fec3a536d7f1ce14` |
| V2 erratum blob / SHA-256 | `3d0391d7704cd6f5fb2eaf487944e8332dc52560` / `4469bf0848d9d6dfdcc18f51425beb7b77dc1e9d0f14111cfe2bd52606e51620` |
| Alfred v1 evidence merge | `02ce173775d1ab66d136c1fe4a3abbbe380809e0` |
| Alfred v2 result merge | `47811f767366550ba97d04e8c9bec3fd586b292c` |
| Evidence manifest / ciphertext blobs | `34b13c3136268f5913cfb622216e3bdef4a54369` / `1bc214bdd40fb37b3527d6af4d664fd16b9c6aab` |
| Exposure-registry merge / identities | `855df9531ebe6d2bfafa2f34823fded87c027124` / 8,757 |
| Frozen detector commit / tree | `8a289ea09b4cb91354e64610181a1ae79af4b5ec` / `10960a032b784f7c11068a1b4a030bf76029eea0` |
| Alfred final frozen v3 harness | `6d756f965e56fbda147e4cb9d3cbe683118af6b4` |
| Alfred v3 terminal result | `f7a5b18cb0b102f6155ea4fda061397c8010f4ca` |
| Alfred v3 merge | `e82d118e04de2db47f4d08762d1966e80067a432` |
| Terminal result JSON blob / SHA-256 | `37c483474650fd88ace8384b84ce941f9aa87954` / `07e7b70f1a8556e47bd0f40e7402bb9b674b045e2091e8dd72d8e731da3dca85` |
| Terminal result Markdown blob / SHA-256 | `e51e04dead21eb95b078fd0c537e03e04f026be4` / `a4486d206d0331d28042a94c0d8a61c66800e858c9bf79728b5b5a0d3ba5d2a4` |

The Alfred v1 evidence merge and v2 result merge are strict ancestors of the final frozen v3
harness; the harness is a strict ancestor of the terminal result; and the result is a strict
ancestor of the Alfred v3 merge. Immediately before the sole invocation, local HEAD, the origin
remote-tracking ref, and an independent `ls-remote` lookup all resolved exactly to the final frozen
harness. The Cejel tracking and independently queried main refs both resolved to the merged v3
preregistration, and every frozen detector blob remained unchanged.

## Terminal result

The sole invocation completed with `PROTOCOL_FAILURE` at the archive member-shape gate:
`archive_unsafe_tar_member`. The immutable archive bindings and pre-run gates had passed, but the
member-shape check stopped execution before candidate normalization or live acquisition. The safe
terminal artifact does not identify a particular archive member, so this closeout does not infer or
publish one. The protocol did not authorize archive repair, substitution, or a rerun, and none
occurred.

GitHub's aggregate rate-limit state immediately before the invocation was 5,000 core requests and
30 search requests remaining, above the fixed thresholds. No live candidate request was issued.

| Measure | A3 | B6 |
|---|---:|---:|
| Live discovery queries issued | 0 | 0 |
| Archive/search candidates normalized or discovered | 0 | 0 |
| Candidates considered | 0 | 0 |
| Mechanically eligible | 0 | 0 |
| Source candidates inspected | 0 | 0 |
| Pairs qualified | 0 | 0 |

No repository identity, PR number, URL, path, source byte, per-candidate reason, raw request URL, or
private absolute path is published here. No corpus or qualification oracle was produced.

## Claim boundary and next legitimate action

This closeout licenses only the statement that the v3 archive member-shape gate stopped the sole
invocation before candidate normalization or acquisition. It provides no external A3 or B6 recall
evidence and does not revise the preregistered yield prediction. It cannot change a detector,
rubric, public default, score, certificate, leaderboard, release, historical result, or
customer-facing claim.

There is therefore no external evaluation preregistration or promotion decision from v3. Any
successor must be additive and prospective: retain this terminal record, publish an erratum or new
protocol rather than edit the v3 preregistration, freeze the accepted tar member-name semantics,
cover those semantics with separately authored synthetic tar fixtures, push a new harness, and only
then begin one new acquisition invocation. Because the safe v3 record does not identify the
offending member, a successor may not claim a particular member form as the observed cause without
new independently recorded evidence.
