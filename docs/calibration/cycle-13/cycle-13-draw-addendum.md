> Republished from the operator's private calibration records, signed there; this copy is the public record.

# Cycle-13 draw addendum — D, allocation, exhausted strata and drawn unit ids, fixed and recorded

**CONSTRAINTS-VERSION: 2026-08-01.5**

Status: **IN FORCE — operator-signed** by the commit that adds this file. All 177 unit ids
below are spent on signing, whether or not labelling completes, per the standing rule. Made from
the agent-authored draft (private record) at
`f1ecf2b7` (private record), changed only in this status paragraph and the signature block. The
draft's points for the operator below were read before signing.

This fulfils `cycle-13-estimation-protocol.md` §7.2 as a companion record. Authority, in order:

1. `docs/calibration/cycle-13-estimation-protocol.md` (signed `a72bf4f8`, (private record)).
2. `docs/calibration/cycle-13-estimation-protocol-amendment-1-2026-09-29.md` (signed `9c562e99`,
   (private record)).
3. `docs/calibration/cycle-13-estimation-protocol-amendment-2-2026-10-01.md` (signed `8b534a4d`,
   (private record)), **§2 fallback**: "If the paired rescore is a NO-GO … the boundary of (private record) stands, the
   0.4.11 scan is the scan, and the census and draw are rebuilt from the two existing arms under
   amendment 1 alone."
4. `docs/calibration/cycle-13-promotion-policy.md` (signed `c1369206`, (private record)).

None of these files is modified. Method, population, unit classes, estimator and validity rules
are those of the signed protocol and amendment 1. This record adds only what §7.2 lists: `D`, the
concordant allocation, the exhausted strata and the drawn unit ids, all computed mechanically from
the unit table, and the ruling below on single-arm `not_applicable` units.

## The fallback applies

The v24 public paired rescore is a **NO-GO**. The result was merged by cejel #384 (merge commit
`5bf0d07744dcdd6485305bf5368428a288b18fc1`) with the decision pending; the operator's decision,
`Protocol decision: **NO-GO** (operator, 2026-10-01)`, placement changed on 8 of 24 rows against a
preregistered limit of 2, was recorded in cejel signed commit `4750788f` and merged by cejel #387
(merge commit `68c39924`). Under amendment 2 §2, v24 is not an arm and cycle 13 proceeds with v17
and v23 only. The promotion policy's v24-only condition is therefore not met, and v23 is the only
candidate.

This draw is the rebuild §2 requires. It reproduces (private record)'s draft draw byte for byte (same 386
reports, same script, same seed), so the draw signed here is the one the protocol defines. (private record)'s
draft is superseded and is not itself signed (amendment 2 §4).

## Single-arm `not_applicable` units

> **Single-arm `not_applicable` units** (operator, 2026-10-01). A unit whose criterion is
> `not_applicable` in one arm and measured in the other is discordant and is in the census,
> weight 1. Each arm's precision and recall count a unit only where that arm's own class is in
> population: v17 does not count the 12 units on the two members where v17's A2 is
> `not_applicable`; v23 counts them. The paired difference is taken from those per-arm figures
> inside each bootstrap replicate, as the protocol §5 states.

## Inputs

- Unit table: 386 custody reports (193 members × v17/v23), 15 rules (§2 plus amendment 1's eight
  rows), **2,895 units**: 1,502 in population and 1,393 `NA/NA` out of population.
  **0 unclassifiable findings**, 0 class anomalies.
- `units.jsonl` sha256 `1179dbba8a557e09c6a1666a5c4cb64d91c854abf2df9717a204f2460c3eaadf`.
- Script: (private record), blob `674db4e4`, unchanged from (private record)'s
  head `c17432d6`; committed alone as `80225714` on branch
  (private record) and run there.
- Counts per rule × paired class, hashes and the byte-identity comparison with (private record):
  (private record).

## Budget, census and shares

- Budget **B = 180** (Ruling 2).
- Discordant census **D = 33**, each at case weight 1. This differs from amendment 1 §5's
  estimate of about 28 to 29; that estimate was not a gate. Decomposition (from (private record)'s record,
  reproduced here unchanged): A1 coverage swaps 4; v23-only A3 `N/C` units 16 (Dockerfile 8,
  build/typecheck 7, HTTP health route 1); single-arm `not_applicable` A2 units 12 (2 members × 6
  A2 rules: 10 `NA/N`, 2 `NA/C`); `CORE-A2-HISTORY-SECRET` `N/C` 1. 4 + 16 + 12 + 1 = 33. §5 omits
  that the two single-arm `not_applicable` members yield a discordant unit for every A2 rule, and
  amendment 1 took A2 from three rules to six (+6).
- `R = B − D = 147`. Candidate side (`C/C`) `floor(R / 3) = 49`. Non-emitting side (`N/N` and
  `X/X`) `R − floor(R / 3) = 98` (amendment 1 §3.1).
- Within each side (amendment 1 §3.2): a non-empty stratum whose proportional share is below 2
  receives exactly 2, the side's remaining budget is re-split proportionally over the other
  strata, and leftover places go by largest remainder, with ties broken by rule id then class.
  The floors did not exceed either side's budget. 0 places unallocated.

## Allocation

| rule | C/C size | C/C drawn | N/N size | N/N drawn | X/X size | X/X drawn |
|---|---:|---:|---:|---:|---:|---:|
| `CORE-A1-AUTHENTICATED-TEST-ABSENCE` | 51 | 8 | 114 | 9 | 28 | 2 |
| `CORE-A1-NO-COVERAGE-CONFIG` | 47 | 7 | 114 | 9 | 28 | 2 |
| `CORE-A1-NO-TEST-FILES` | 1 | **1 of 2 — exhausted** | 164 | 13 | 28 | 2 |
| `CORE-A2-COMMITTED-SECRET` | 6 | 2 | 54 | 4 | 0 | 0 |
| `CORE-A2-CURRENT-ENV` | 5 | 2 | 55 | 5 | 0 | 0 |
| `CORE-A2-HISTORY-ENV` | 6 | 2 | 54 | 4 | 0 | 0 |
| `CORE-A2-HISTORY-SECRET` | 1 | **1 of 2 — exhausted** | 58 | 5 | 0 | 0 |
| `CORE-A2-NONCONSTANT-SECRET-COMPARE` | 2 | 2 | 58 | 5 | 0 | 0 |
| `CORE-A2-TENANT-WITHOUT-RLS` | 1 | **1 of 2 — exhausted** | 59 | 5 | 0 | 0 |
| `CORE-A3-DOCKERFILE-NO-HEALTHCHECK` | 0 | 0 | 34 | 3 | 0 | 0 |
| `CORE-A3-HTTP-NO-HEALTH-ROUTE` | 0 | 0 | 41 | 3 | 0 | 0 |
| `CORE-A3-NO-BUILD-TYPECHECK-SCRIPT` | 0 | 0 | 35 | 3 | 0 | 0 |
| `CORE-A3-NO-CI-DEPLOY` | 5 | 2 | 37 | 3 | 0 | 0 |
| `CORE-A4-NO-LOCKFILE` | 12 | 2 | 102 | 8 | 79 | 6 |
| `CORE-A5-NO-RECONCILIATION` | 101 | 16 | 0 | 0 | 89 | 7 |
| **total drawn** | 238 | **46** (49 allocated) | 979 | **79** | 252 | **19** |

Non-emitting side: 79 + 19 = 98 allocated and drawn.

Case weight in a concordant stratum is `N_s / taken`; every discordant unit has weight 1.

**Exhausted strata (3), each taken whole and not backfilled (§4):**
`CORE-A1-NO-TEST-FILES|C/C`, `CORE-A2-HISTORY-SECRET|C/C` and `CORE-A2-TENANT-WITHOUT-RLS|C/C`,
each of size 1 and allocated 2 by the floor. Budget 180 is realized as **177** = 33 discordant +
144 concordant.

## The draw

**Seed:** `cycle-13-case-draw-2026-09-28` (fixed in protocol §4).
Method: §4's. Within each (rule, concordant class) stratum, unit ids are ordered by
`sha256(seed + NUL + unitId)` ascending and the first `n_s` are taken.

`drawn.jsonl` sha256 `4a7ff2896ce1d8ba06a73a08d4b06598773a4e2f3cac9dd155ce1e5510582810`
(177 lines, all distinct). `units.jsonl`, `drawn.jsonl` and `draw.json` (`a794603e…f2d010`) are
byte-identical to (private record)'s.

**Drawn unit ids (177; `repo-NNN` is the custody draw index, never a repository name):**

Discordant census (33, weight 1):

```
N/C   repo-037:CORE-A3-DOCKERFILE-NO-HEALTHCHECK repo-061:CORE-A3-DOCKERFILE-NO-HEALTHCHECK
      repo-074:CORE-A3-DOCKERFILE-NO-HEALTHCHECK repo-079:CORE-A3-NO-BUILD-TYPECHECK-SCRIPT
      repo-083:CORE-A3-DOCKERFILE-NO-HEALTHCHECK repo-091:CORE-A1-NO-COVERAGE-CONFIG
      repo-093:CORE-A3-NO-BUILD-TYPECHECK-SCRIPT repo-108:CORE-A3-DOCKERFILE-NO-HEALTHCHECK
      repo-109:CORE-A1-NO-COVERAGE-CONFIG repo-111:CORE-A3-NO-BUILD-TYPECHECK-SCRIPT
      repo-113:CORE-A3-NO-BUILD-TYPECHECK-SCRIPT repo-114:CORE-A3-HTTP-NO-HEALTH-ROUTE
      repo-115:CORE-A3-NO-BUILD-TYPECHECK-SCRIPT repo-121:CORE-A3-NO-BUILD-TYPECHECK-SCRIPT
      repo-125:CORE-A3-DOCKERFILE-NO-HEALTHCHECK repo-131:CORE-A2-HISTORY-SECRET
      repo-138:CORE-A3-DOCKERFILE-NO-HEALTHCHECK repo-148:CORE-A3-DOCKERFILE-NO-HEALTHCHECK
      repo-151:CORE-A3-NO-BUILD-TYPECHECK-SCRIPT
C/N   repo-061:CORE-A1-NO-COVERAGE-CONFIG repo-106:CORE-A1-NO-COVERAGE-CONFIG
NA/N  repo-146:CORE-A2-COMMITTED-SECRET repo-146:CORE-A2-CURRENT-ENV repo-146:CORE-A2-HISTORY-ENV
      repo-146:CORE-A2-NONCONSTANT-SECRET-COMPARE repo-146:CORE-A2-TENANT-WITHOUT-RLS
      repo-180:CORE-A2-CURRENT-ENV repo-180:CORE-A2-HISTORY-ENV repo-180:CORE-A2-HISTORY-SECRET
      repo-180:CORE-A2-NONCONSTANT-SECRET-COMPARE repo-180:CORE-A2-TENANT-WITHOUT-RLS
NA/C  repo-146:CORE-A2-HISTORY-SECRET repo-180:CORE-A2-COMMITTED-SECRET
```

Concordant strata (144; members listed in seeded order, unit id = `member:rule`):

```
CORE-A1-AUTHENTICATED-TEST-ABSENCE  C/C  51/8    repo-069 repo-111 repo-040 repo-036 repo-108 repo-103 repo-030 repo-059
CORE-A1-AUTHENTICATED-TEST-ABSENCE  N/N  114/9   repo-152 repo-037 repo-155 repo-149 repo-116 repo-145 repo-142 repo-086 repo-089
CORE-A1-AUTHENTICATED-TEST-ABSENCE  X/X  28/2    repo-007 repo-004
CORE-A1-NO-COVERAGE-CONFIG          C/C  47/7    repo-064 repo-143 repo-092 repo-171 repo-087 repo-083 repo-060
CORE-A1-NO-COVERAGE-CONFIG          N/N  114/9   repo-043 repo-133 repo-044 repo-027 repo-137 repo-162 repo-111 repo-003 repo-169
CORE-A1-NO-COVERAGE-CONFIG          X/X  28/2    repo-016 repo-015
CORE-A1-NO-TEST-FILES               C/C  1/1     repo-190
CORE-A1-NO-TEST-FILES               N/N  164/13  repo-150 repo-172 repo-108 repo-079 repo-127 repo-161 repo-051 repo-043 repo-094 repo-069 repo-163 repo-027 repo-165
CORE-A1-NO-TEST-FILES               X/X  28/2    repo-009 repo-007
CORE-A2-COMMITTED-SECRET            C/C  6/2     repo-131 repo-145
CORE-A2-COMMITTED-SECRET            N/N  54/4    repo-142 repo-116 repo-134 repo-130
CORE-A2-CURRENT-ENV                 C/C  5/2     repo-147 repo-091
CORE-A2-CURRENT-ENV                 N/N  55/5    repo-074 repo-061 repo-138 repo-114 repo-099
CORE-A2-HISTORY-ENV                 C/C  6/2     repo-122 repo-147
CORE-A2-HISTORY-ENV                 N/N  54/4    repo-125 repo-066 repo-074 repo-154
CORE-A2-HISTORY-SECRET              C/C  1/1     repo-137
CORE-A2-HISTORY-SECRET              N/N  58/5    repo-092 repo-144 repo-138 repo-142 repo-111
CORE-A2-NONCONSTANT-SECRET-COMPARE  C/C  2/2     repo-099 repo-078
CORE-A2-NONCONSTANT-SECRET-COMPARE  N/N  58/5    repo-092 repo-160 repo-133 repo-154 repo-089
CORE-A2-TENANT-WITHOUT-RLS          C/C  1/1     repo-151
CORE-A2-TENANT-WITHOUT-RLS          N/N  59/5    repo-065 repo-111 repo-075 repo-170 repo-083
CORE-A3-DOCKERFILE-NO-HEALTHCHECK   N/N  34/3    repo-131 repo-121 repo-106
CORE-A3-HTTP-NO-HEALTH-ROUTE        N/N  41/3    repo-145 repo-065 repo-037
CORE-A3-NO-BUILD-TYPECHECK-SCRIPT   N/N  35/3    repo-106 repo-108 repo-082
CORE-A3-NO-CI-DEPLOY                C/C  5/2     repo-037 repo-138
CORE-A3-NO-CI-DEPLOY                N/N  37/3    repo-065 repo-074 repo-093
CORE-A4-NO-LOCKFILE                 C/C  12/2    repo-037 repo-084
CORE-A4-NO-LOCKFILE                 N/N  102/8   repo-094 repo-118 repo-137 repo-173 repo-155 repo-175 repo-112 repo-106
CORE-A4-NO-LOCKFILE                 X/X  79/6    repo-040 repo-011 repo-021 repo-180 repo-191 repo-187
CORE-A5-NO-RECONCILIATION           C/C  101/16  repo-140 repo-093 repo-106 repo-119 repo-181 repo-117 repo-159 repo-184 repo-154 repo-068 repo-101 repo-096 repo-065 repo-163 repo-122 repo-112
CORE-A5-NO-RECONCILIATION           X/X  89/7    repo-017 repo-023 repo-175 repo-046 repo-166 repo-056 repo-167
```

## Execution

Per protocol §7: the estimator v4 and its falsifiability fixture come next (agent), then packets
and the sealed key for the drawn units only (agent), then labels (operator only, blinded to arm and
to class), then the estimate (agent, once). No agent authors, suggests, pre-fills or edits a label.
Per §8, the drawn unit ids become open only after retirement.

## Points for the operator before signing

1. `D` is 33 against amendment 1 §5's "about 28 to 29". The mechanism is single-arm
   `not_applicable` A2 status replicating across the three new A2 rules. It follows from §3 as
   signed. It is not a classification failure.
2. Three `C/C` strata of size 1 are exhausted. The budget is realized as 177, not 180.
3. Protocol §3 says an out-of-population unit "is never drawn and never counted". It defines
   classes per arm, and the ruling above reads it per arm: the 12 single-arm units are drawn (as
   discordant) and counted for v23 only. The ruling settles this; it is noted so the signature
   covers it knowingly.
4. The card that produced this draft named cejel #384 as carrying the NO-GO. #384 merged the
   result with the decision pending; the decision line arrived with #387. Both are cited above.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Signed at: 2026-10-01T13:47:21Z
- Ruling recorded: single-arm `not_applicable` units, as above (operator, 2026-10-01)
- Signature: Houman Azimi-Nejadi — cycle-13 two-arm draw under amendment 2 §2, D = 33,
  177 unit ids drawn and spent, byte-identical to (private record)'s unsigned draft
