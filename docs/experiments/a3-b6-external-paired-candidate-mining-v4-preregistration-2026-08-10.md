# A3/B6 external paired candidate mining v4 — preregistration (2026-08-10)

Status: **PREREGISTERED; acquisition not yet run**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Purpose and non-claim

V3 ended in `PROTOCOL_FAILURE` at `archive_unsafe_tar_member` after its immutable archive and
pre-run bindings passed but before candidate normalization, live acquisition, source inspection, or
a Cejel scan. Its safe terminal artifact deliberately did not retain the rejected member name, so
neither the v3 closeout nor this successor claims which member form caused the failure.

V4 is a new prospective acquisition protocol. It changes only the accepted tar listing grammar to
permit one optional literal root-directory marker, `./`, while retaining the exact ledger-bound set
of 55 JSON response files. It also adds synthetic tar tests that freeze acceptance and rejection at
that boundary. Every discovery frame, query, rank, qualification oracle, resource bound, privacy
rule, prediction, detector binding, and terminal rule is inherited unchanged from the immutable v3
preregistration. This is not a rerun or repair of v3.

This protocol is discovery only. It does **not** authorize a Cejel scan, detector or rubric change,
score, recall or precision estimate, certificate, leaderboard update, release, or customer-facing
claim. Only a complete fixed private corpus of six A3 and six B6 naturally authored before/after
pairs plus a separate mechanical oracle can authorize drafting a later evaluation preregistration.

## Immutable predecessor bindings

The v4 harness must bind and verify all of the following before archive access:

| Artifact | Immutable binding |
|---|---|
| V3 Cejel preregistration merge / blob / SHA-256 | `db6002a0a864d6d89b87b40a8552ab7be5e4754c` / `cabddbd00a4239e79de088a1d1071fa293418595` / `07b22f94bf3308026d4de8d4c719636a01bac565ea6e9c25fec3a536d7f1ce14` |
| V3 Cejel closeout merge / blob / SHA-256 | `1e522e2af0d3e991c36199a0f3f75d2f8e35f581` / `4086d377b66e0e4fe261e80990d53641a002581e` / `e2dbd91d88c82f44543be8851816d96e50b41ece3b1670a3c27108dd1b2d2a21` |
| V3 Alfred harness / terminal result / merge | `6d756f965e56fbda147e4cb9d3cbe683118af6b4` / `f7a5b18cb0b102f6155ea4fda061397c8010f4ca` / `e82d118e04de2db47f4d08762d1966e80067a432` |
| V3 result JSON blob / SHA-256 | `37c483474650fd88ace8384b84ce941f9aa87954` / `07e7b70f1a8556e47bd0f40e7402bb9b674b045e2091e8dd72d8e731da3dca85` |
| V1 encrypted-evidence Alfred merge | `02ce173775d1ab66d136c1fe4a3abbbe380809e0` |
| Evidence manifest path / blob | `packages/bede/src/a3-b6-external-candidate-mining-v1/evidence/manifest.json` / `34b13c3136268f5913cfb622216e3bdef4a54369` |
| Ciphertext path / blob / bytes | `packages/bede/src/a3-b6-external-candidate-mining-v1/evidence/raw-responses.tar.age` / `1bc214bdd40fb37b3527d6af4d664fd16b9c6aab` / 37,376,116 |
| Corrected ciphertext SHA-256 | `b62fb0a08b886a1bb2bfa9a8149dea4f3e684e69ec5233af628915d7c5c5c0e6` |
| Plaintext tar bytes / SHA-256 | 37,366,784 / `43b4b4d93157888b299ddd76d328ac44d7f3b95ffbf5de832b2f8f9a3ae1f0b0` |
| Age version / recipient fingerprint | `v1.3.1` / `SHA256:j4H5gR9qB/hKcGNUqsj0i3bdQjySv2v4fhL3QPfq6Dw` |
| V1 safe-ledger path / blob / SHA-256 | `packages/bede/src/a3-b6-external-candidate-mining-v1/results/run-2026-08-10/raw-ledger.json` / `e5e94a38127d4ef23501e0c1d2318a8f2da10058` / `69cf6bafc9fbbf6c4b90b8a74af4f46ae5a4f19cb29e3ed9d6164e0aa297bdc2` |

The eventual Cejel merge containing this v4 preregistration and its document blob are additional
cross-repository content bindings. The Alfred v4 harness may not be committed before those values
exist.

## Frozen detector and exposure closure

The cutoff remains `2026-08-09T23:59:59.999Z`. Exclude the exact 8,757 lowercase identities in the
exposure registry at Cejel commit `855df9531ebe6d2bfafa2f34823fded87c027124`, path
`docs/experiments/external-repository-exposure-registry-2026-08-10.json`, blob
`81ca47cfa37d44b93d3adc90d9d9be1eedc92a8a`, SHA-256
`47b21966dc1cf376364dd209a04039b90375ba77654c171178918d337f423b25`. Also exclude publisher-owned
owners `barglabs` and `houman44` before any candidate-specific request.

The detector remains frozen at commit `8a289ea09b4cb91354e64610181a1ae79af4b5ec`, tree
`10960a032b784f7c11068a1b4a030bf76029eea0`. Current Cejel tracking and independently queried main
must retain these exact blobs immediately before acquisition:

| Path | Frozen blob |
|---|---|
| `src/witan/repo-signals.ts` | `c55e9c8a82e2398672486183fd436f3ef82c64c8` |
| `src/witan/rubric-version.ts` | `65a734bb71ef18b14d63ce57e71488e476f7c337` |
| `src/witan/scoring.ts` | `d61dc75ccdf84c13129f642353e03cf996e0bdb9` |

The prospective rubric remains `witan-rubric-v22-prospective-2026-08-10`; the public default remains
`witan-rubric-v17-2026-07-24`. Neither is executed by this protocol.

## Fresh harness, synthetic gate, and ancestry

After this preregistration merges, create a fresh Alfred branch from current `origin/main`, which
must contain v3 merge `e82d118e04de2db47f4d08762d1966e80067a432`. Implement v4 in a new
`a3-b6-external-candidate-mining-v4/` directory. V1–v3 sources and results remain immutable.

Before the harness commit, separately authored synthetic tests must demonstrate all of the
following without reading or decrypting the bound archive:

1. a tar containing one literal `./` root marker and 55 root JSON members is accepted when its
   normalized member set exactly equals a synthetic 55-entry ledger;
2. the same 55 members without a root marker are accepted;
3. a second root marker, any other directory marker, nested path, absolute path, `..` traversal,
   symlink, hard link, special file, non-JSON member, malformed filename, duplicate JSON member,
   missing ledger member, or extra member is rejected before extraction; and
4. accepted extraction reads files only by their normalized ledger basename beneath a fresh private
   extraction directory.

Commit and push the complete harness before archive access. Immediately before the sole invocation,
verify: the v1 evidence, v2 result, and v3 result merges are strict ancestors of the v4 harness;
local HEAD, origin tracking, and independent remote refs all equal its exact commit; the worktree is
clean; the merged Cejel v4 preregistration and all predecessor bindings match; Cejel tracking and
independent main match and retain every detector blob; and GitHub has at least 4,800 core and 30
search requests remaining. The pushed harness must be a strict ancestor of the first and only v4
result commit.

## Frozen archive member grammar

Only after every pre-run gate passes may the harness decrypt and authenticate the bound archive in
private temporary storage. Age version, recipient fingerprint, ciphertext blob/bytes/SHA-256,
manifest fields, plaintext tar bytes/SHA-256, encryption/decryption round trip, safe-ledger
bytes/SHA-256, member hashes, 40 A3 search-page count, and expected 3,805 deduplicated A3 candidates
remain exactly as frozen by v3.

Use the same frozen `bsdtar 3.5.3 - libarchive 3.7.4 zlib/1.2.12 liblzma/5.4.3
bz2lib/1.0.8` executable for the synthetic gate and sole invocation. Parse both its name-only and
verbose type listings before extraction. The only accepted archive entries are:

- zero or one directory entry whose name is exactly `./`; and
- exactly 55 unique regular-file entries whose names match
  `^(?:\./)?\d{5}-[a-z0-9-]+\.json$`.

Normalize only the optional leading `./` on file rows. After removing the optional root marker, the
55 normalized file names must be unique and byte-for-byte equal as a set to the 55 ledger response
basenames. The name-only and verbose listings must agree entry-for-entry after parsing. Reject
before extraction on any other entry, type, or count, including blank embedded names, absolute or
nested paths, traversal components, symbolic or hard links, devices, another directory,
duplicates, missing members, or extras. A mismatch is terminal `PROTOCOL_FAILURE`; there is no
substitution, archive repair, or retry. Extract only after this gate, into a new private directory,
and then verify all 55 extracted byte hashes against the ledger before parsing any response.

This grammar is prospective. Allowing `./` does not assert that v3 observed that row.

## Discovery frame, order, and resource bounds

The v4 harness inherits the following v3 fields byte-for-byte:

- A3 uses the 40 authenticated archived search pages, structurally strips unsafe prose fields
  before JSON parsing, expects exactly 3,805 deduplicated candidates, and issues zero A3 search
  requests.
- B6 issues exactly the five queries below with API version `2022-11-28`, `sort=created`,
  `order=asc`, `per_page=100`, pages 1–10 or until an empty page, and at least 2.1 seconds between
  requests:
  1. `is:pr is:merged created:<=2026-08-09 SUPERUSER NOSUPERUSER`
  2. `is:pr is:merged created:<=2026-08-09 "ALTER ROLE" SUPERUSER`
  3. `is:pr is:merged created:<=2026-08-09 "CREATE ROLE" SUPERUSER`
  4. `is:pr is:merged created:<=2026-08-09 "GRANT ALL PRIVILEGES" schema`
  5. `is:pr is:merged created:<=2026-08-09 GRANT "admin role"`
- Candidate endpoints remain only repository, pull, Git commit object, pull files page 1, and
  immutable-ref contents as enumerated in v3. Retryable statuses remain transport failures and HTTP
  429/500/502/503/504, with at most three attempts at 0/10/30 seconds. Documented 404/409 exclusions
  remain unchanged; every other unsafe or inconsistent response is terminal.
- Rank domains remain exactly `cejel-a3-b6-external-v2` and
  `cejel-a3-b6-external-v2-path`. A3 completes before B6. Walk at most 400 candidates and qualify at
  most 200 source candidates per class; stop after six pairs; select at most one PR per repository
  across classes. B6 considers at most 12 paths per PR and 200 file pairs. The global live-attempt
  ceiling remains 4,500.
- The frozen A3 and B6 qualification oracles, authored-source exclusions, retained file limits,
  immutable before/after definitions, private safe-ledger schema, encryption boundary, and
  no-package/no-hook/no-build/no-test/no-binary/no-Cejel rule are inherited without change from the
  v3 preregistration.

No query, endpoint, date, sort, synonym, page, repository, candidate, path, retry, oracle, or manual
replacement may be added after acquisition begins.

## Yield prediction and publication boundary

V3 normalized no archive candidate and made no live query, so it supplied no evidence with which to
revise the frozen prediction. V4 therefore retains the predicted range of three to six A3 pairs and
two to six B6 pairs. The modal joint outcome remains `INSUFFICIENT_CANDIDATE_POOL`, not
`COHORT_FROZEN`, because search expressions identify relevant prose while qualification requires
same-path authored before/after constructions and an independent false/true oracle.

Private Alfred may retain opaque pair IDs, immutable repository/PR/commit/path/blob bindings,
selected source bytes, oracle output, encrypted raw responses, and the complete mechanical trace.
Public Cejel may disclose only aggregate counts, corpus/oracle hashes, terminal state, and immutable
artifact bindings. Repository identities, PR numbers, URLs, paths, source bytes, candidate-specific
reasons, raw request URLs, and private absolute paths remain private.

## Fixed execution order and terminal states

1. Merge this v4 preregistration in Cejel.
2. Implement and synthetically test a fresh Alfred v4 harness.
3. Commit, push, and independently authenticate the complete harness.
4. Only then decrypt/authenticate the archive, apply the frozen member grammar, normalize A3, and
   invoke acquisition once.
5. Commit and push the terminal record, safe ledger, encrypted live responses, and—only if
   complete—the selected corpus and separate oracle.
6. Review and merge the private Alfred result with ancestry preserved.
7. Publish an additive public Cejel closeout with bindings, permitted aggregates, state, and hashes.
8. Only if `COHORT_FROZEN` contains six A3 and six B6 pairs may a separate evaluation
   preregistration be drafted and merged before any selected source is scanned.

Terminal states remain `COHORT_FROZEN`, `INSUFFICIENT_CANDIDATE_POOL`, `ACQUISITION_ERROR`, and
`PROTOCOL_FAILURE`. There is one v4 invocation and no rerun, manual substitution, query repair,
archive repair, detector run, or candidate replacement after it begins. Fixed per-request retries
are part of that sole invocation, not reruns.

No v4 outcome changes a detector, rubric, public default, score, certificate, leaderboard, release,
historical result, or customer-facing claim.
