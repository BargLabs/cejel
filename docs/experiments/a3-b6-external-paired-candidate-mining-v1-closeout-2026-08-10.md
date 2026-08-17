# A3/B6 external paired candidate mining v1 — terminal closeout (2026-08-10)

Status: **ACQUISITION_ERROR; no cohort frozen; no Cejel scan performed**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Bound protocol and execution

| Artifact | Immutable binding |
|---|---|
| Cejel preregistration merge | `b2baf7cf8317680914abebf368385144399927fb` |
| Cejel preregistration blob / SHA-256 | `78fa3660116017f3c9810a0e4c34df8b223c3c9a` / `5082b62f405e4383866d6e93c715e1e0a7721d5f649b1afe44482118bd933be3` |
| Exposure-registry merge / identities | `855df9531ebe6d2bfafa2f34823fded87c027124` / 8,757 |
| Frozen detector commit / tree | `8a289ea09b4cb91354e64610181a1ae79af4b5ec` / `10960a032b784f7c11068a1b4a030bf76029eea0` |
| Alfred frozen harness | `390b134d562c25e0564bfe01b4160aba3c205290` |
| Alfred terminal result | `bbbdf06c8c11b91035c9be356c9c38d895896015` |
| Alfred merge | `f8e48ff8e5003574d482e8a88ac24096aebe30ae` |
| Terminal result JSON blob / SHA-256 | `f6340185ff25d3521bdc223240d25e3e49ccdd43` / `9f72b411854de30c8d75089ef0db058f055e04929e9034c12b21688980ff6b50` |
| Raw-response ledger blob / SHA-256 | `e5e94a38127d4ef23501e0c1d2318a8f2da10058` / `69cf6bafc9fbbf6c4b90b8a74af4f46ae5a4f19cb29e3ed9d6164e0aa297bdc2` |

The Alfred base is a strict ancestor of the harness; the harness is a strict ancestor of the
terminal result; and the terminal result is a strict ancestor of the Alfred merge. Before the
sole invocation, local HEAD, the origin remote-tracking ref, and an independent `ls-remote`
lookup all resolved exactly to the frozen harness commit.

## Terminal result

The sole invocation completed with `ACQUISITION_ERROR` while authenticating a candidate merge
commit. GitHub's aggregate rate-limit state remained healthy after the run, so rate-limit
exhaustion is not supported as the cause. The protocol forbids a retry or manual substitution;
none occurred.

| Measure | A3 | B6 |
|---|---:|---:|
| Deduplicated search candidates discovered | 3,805 | 0 (not reached) |
| Mechanically eligible before terminal error | 0 | 0 |
| Source candidates inspected | 0 | 0 |
| Pairs qualified | 0 | 0 |

Before failure, one candidate was excluded for prior exposure and one for repository
unavailability. No repository identity, PR number, path, source byte, or per-candidate record is
published here.

The private ledger contains 55 response records. Their original raw-byte hashes were checked
after the run with zero mismatches. Unscreened raw API responses were deliberately not committed
because public PR prose and commit payloads can contain credential-shaped material; they remain
in Alfred's ignored private local-state. The committed corpus and oracle are both empty JSON
arrays with SHA-256 `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570`.

## Claim boundary and next legitimate action

This closeout licenses only the statement that the preregistered acquisition did not complete.
It provides no external A3 or B6 recall evidence. It cannot change the detector, prospective or
public rubric, public default, score, certificate, leaderboard, release, historical result, or
customer-facing claim.

There is therefore no evaluation preregistration and no promotion decision from v1. A successor
mining protocol must be additive, explain and mechanically correct the merge-commit
authentication failure before execution, bind this terminal record and raw-response ledger, and
state how the already-discovered A3 search pool is treated. It may not call itself a retry of v1
or silently replace the failed acquisition.
