# A3/B6 external paired candidate mining v3 — preregistration (2026-08-10)

Status: **PREREGISTERED; acquisition not yet run**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Purpose and non-claim

V1 ended in `ACQUISITION_ERROR` before source inspection. V2 corrected the endpoint and resource
model but ended in `PROTOCOL_FAILURE` at its first archive-authentication gate because a frozen
ciphertext SHA-256 transcription contained only 62 hexadecimal characters. V2 decrypted no archive,
normalized no candidate, issued no live candidate request, inspected no source, and ran no Cejel
scan.

The separate v2 erratum records the exact correction. V3 is a new prospective acquisition protocol
that changes only that archive binding and the immutable predecessor bindings needed to establish
its own chronology. Its search frames, deterministic rank, qualification oracles, resource bounds,
privacy boundary, and terminal rules are deliberately inherited from v2. This is not a retry of v2.

This protocol is discovery only. It does **not** authorize a Cejel scan, detector change, rubric
change, score, recall estimate, precision estimate, certificate, leaderboard update, release, or
customer-facing claim. Its only possible successful output is a fixed private corpus of six A3 and
six B6 naturally authored before/after source slices plus a separate mechanical oracle. A separate
evaluation preregistration must merge before any selected source may be scanned.

## Immutable predecessor bindings

The v3 harness must bind and verify all of the following before archive access:

| Artifact | Immutable binding |
|---|---|
| V1 encrypted-evidence Alfred merge | `02ce173775d1ab66d136c1fe4a3abbbe380809e0` |
| Evidence manifest path / blob | `packages/bede/src/a3-b6-external-candidate-mining-v1/evidence/manifest.json` / `34b13c3136268f5913cfb622216e3bdef4a54369` |
| Ciphertext path / blob / bytes | `packages/bede/src/a3-b6-external-candidate-mining-v1/evidence/raw-responses.tar.age` / `1bc214bdd40fb37b3527d6af4d664fd16b9c6aab` / 37,376,116 |
| Corrected ciphertext SHA-256 | `b62fb0a08b886a1bb2bfa9a8149dea4f3e684e69ec5233af628915d7c5c5c0e6` |
| Plaintext tar bytes / SHA-256 | 37,366,784 / `43b4b4d93157888b299ddd76d328ac44d7f3b95ffbf5de832b2f8f9a3ae1f0b0` |
| Age version / recipient fingerprint | `v1.3.1` / `SHA256:j4H5gR9qB/hKcGNUqsj0i3bdQjySv2v4fhL3QPfq6Dw` |
| V1 harness / terminal result / merge | `390b134d562c25e0564bfe01b4160aba3c205290` / `bbbdf06c8c11b91035c9be356c9c38d895896015` / `f8e48ff8e5003574d482e8a88ac24096aebe30ae` |
| V1 safe-ledger path | `packages/bede/src/a3-b6-external-candidate-mining-v1/results/run-2026-08-10/raw-ledger.json` |
| V1 safe-ledger blob / SHA-256 | `e5e94a38127d4ef23501e0c1d2318a8f2da10058` / `69cf6bafc9fbbf6c4b90b8a74af4f46ae5a4f19cb29e3ed9d6164e0aa297bdc2` |
| V2 Cejel preregistration merge / blob | `64ffcf5e299565a3f01c3e2af3931bfaceaf3f7c` / `4e08d0a8f1bf6d009d69397ad40a80f86fe8b40f` |
| V2 Alfred final harness / terminal result | `c71b88fc18e41724a42ab8c6156fe17e0d59a4a4` / `5eb864315637207f8cb321be1eaf4b5e6f6262c8` |
| V2 Alfred merge | `47811f767366550ba97d04e8c9bec3fd586b292c` |
| V2 result JSON blob / SHA-256 | `4bbb305b6290acd2b7537d6089264997002acee5` / `b2ac388cb7fb42f544ffdec3a74b6d2d37106ecf12152e49c31f4bc8034624f0` |
| V2 public closeout merge | `feac2428928a79e95d6d7e519a37b96d83a25d0e` |
| V2 erratum path / blob / SHA-256 | `docs/experiments/a3-b6-external-paired-candidate-mining-v2-errata-2026-08-10.md` / `3d0391d7704cd6f5fb2eaf487944e8332dc52560` / `4469bf0848d9d6dfdcc18f51425beb7b77dc1e9d0f14111cfe2bd52606e51620` |

The eventual Cejel merge commit containing this preregistration and erratum, plus both document blob
IDs, are additional cross-repository content bindings to be frozen into the Alfred v3 harness after
this PR merges. The v3 harness may not be committed before those values exist.

## Detector and exposure closure

The acquisition cutoff remains `2026-08-09T23:59:59.999Z`. Exclude all identities in the exposure
registry at Cejel commit `855df9531ebe6d2bfafa2f34823fded87c027124`, path
`docs/experiments/external-repository-exposure-registry-2026-08-10.json`, blob
`81ca47cfa37d44b93d3adc90d9d9be1eedc92a8a`, SHA-256
`47b21966dc1cf376364dd209a04039b90375ba77654c171178918d337f423b25`, exactly 8,757 lowercase
identities. Also exclude publisher-owned owners `barglabs` and `houman44` before a candidate-specific
network request.

The frozen detector commit is `8a289ea09b4cb91354e64610181a1ae79af4b5ec`, tree
`10960a032b784f7c11068a1b4a030bf76029eea0`. The harness must verify that these blobs remain unchanged
on Cejel `origin/main` and an independent remote lookup immediately before acquisition:

| Path | Frozen blob |
|---|---|
| `src/witan/repo-signals.ts` | `c55e9c8a82e2398672486183fd436f3ef82c64c8` |
| `src/witan/rubric-version.ts` | `65a734bb71ef18b14d63ce57e71488e476f7c337` |
| `src/witan/scoring.ts` | `d61dc75ccdf84c13129f642353e03cf996e0bdb9` |

The prospective rubric remains `witan-rubric-v22-prospective-2026-08-10`; public default remains
`witan-rubric-v17-2026-07-24`. Neither is executed by this protocol.

## Fresh harness and ancestry order

After this preregistration merges, create a fresh Alfred branch from current `origin/main`, which
must contain Alfred merge `47811f767366550ba97d04e8c9bec3fd586b292c`. Implement v3 in a new
`a3-b6-external-candidate-mining-v3/` directory using only separately authored synthetic tests.
V1/v2 source and results remain immutable historical records.

Commit and push the complete v3 harness before decrypting the archive. Immediately before archive
access, verify all of the following:

1. the Alfred v1 evidence merge and v2 merge are strict ancestors of the v3 harness;
2. local HEAD, the origin remote-tracking ref, and an independent `git ls-remote` lookup all equal
   the exact v3 harness commit;
3. the Alfred worktree is clean;
4. the merged Cejel v3 preregistration and erratum commit/blob bindings match;
5. current Cejel tracking and independent main refs match, contain the v3 preregistration merge, and
   retain every frozen detector blob; and
6. GitHub rate limits are at least 4,800 core requests and 30 search requests remaining.

The pushed v3 harness is a strict ancestor of the first and only v3 result commit. The Cejel
preregistration is cross-repository evidence and is therefore authenticated by immutable merge/blob
bindings rather than impossible cross-repository Git ancestry.

## Archive authentication and fixed A3 discovery frame

Only after every pre-run binding passes may the v3 harness decrypt the bound ciphertext in private
temporary storage. Before parsing a member, verify:

1. `age --version`, recipient fingerprint, ciphertext blob, byte count, and corrected ciphertext
   SHA-256 exactly match the bindings above;
2. the decrypted tar byte count and SHA-256 exactly match the bindings above;
3. a private verification copy encrypted to the same recipient decrypts back to byte-identical
   plaintext tar bytes (ciphertext equality is not expected because `age` encryption is randomized);
4. the tar contains exactly the 55 response members named by the bound v1 safe ledger;
5. all 55 raw response hashes match that ledger with zero missing or extra members; and
6. exactly 40 members are the ten pages for each of the four frozen A3 queries.

Any mismatch is terminal `PROTOCOL_FAILURE` before candidate normalization or live search. There is
no substitution, archive repair, or retry.

For the 40 authenticated A3 search pages, structurally replace title, body, text, HTML, patch, and
commit-message fields with `null` in raw bytes before JSON parsing. Decode only repository API URL,
HTML URL, PR number, creation time, and query membership. Collapse by lowercase
`owner/repo#number`; the expected deduplicated A3 count remains exactly 3,805. A different count is
terminal `PROTOCOL_FAILURE`. The 15 archived candidate-specific v1 responses remain preservation
evidence only and are never used as a v3 response cache or eligibility input. V3 issues zero A3
search requests.

## Fixed live B6 discovery frame

Issue exactly these five GitHub search queries unless an earlier terminal error occurs:

1. `is:pr is:merged created:<=2026-08-09 SUPERUSER NOSUPERUSER`
2. `is:pr is:merged created:<=2026-08-09 "ALTER ROLE" SUPERUSER`
3. `is:pr is:merged created:<=2026-08-09 "CREATE ROLE" SUPERUSER`
4. `is:pr is:merged created:<=2026-08-09 "GRANT ALL PRIVILEGES" schema`
5. `is:pr is:merged created:<=2026-08-09 GRANT "admin role"`

For each query request `sort=created`, `order=asc`, `per_page=100`, and pages 1 through 10 or until
an empty page. A partial non-empty page does not stop pagination. Use GitHub API version
`2022-11-28` and wait at least 2.1 seconds between search requests. Structurally strip the same unsafe
prose fields before parsing. Collapse independently by lowercase `owner/repo#number`; union query
membership is metadata only. No additional query, synonym, sort, date, page, repository, issue,
commit, or search engine may be substituted.

## Fixed live endpoints and exclusions

After local exposure exclusion and deterministic ranking, the only candidate-specific endpoints are:

- `GET /repos/{owner}/{repo}`;
- `GET /repos/{owner}/{repo}/pulls/{number}`;
- `GET /repos/{owner}/{repo}/git/commits/{sha}`;
- `GET /repos/{owner}/{repo}/pulls/{number}/files?per_page=100&page=1`; and
- `GET /repos/{owner}/{repo}/contents/{path}?ref={immutable-sha}`.

Each search page and candidate metadata/object request may receive at most three attempts with fixed
delays of 0, 10, and 30 seconds. Only transport failures and HTTP 429, 500, 502, 503, or 504 are
retryable. Exhaustion is terminal `ACQUISITION_ERROR`. The global 4,500-attempt ceiling includes
failed attempts and retries but excludes the pre-run rate-limit check. The harness refuses before an
attempt that would exceed the ceiling; it may not wait for a reset and resume as another run.

Mechanical non-error exclusions are endpoint-specific:

- repository, pull, changed-file, or content lookup HTTP 404: the corresponding documented
  unavailable or incomplete exclusion; and
- Git commit-object lookup HTTP 404 or 409: `merge_commit_unavailable`.

The Git commit-object endpoint must return the requested 40-hex object and ordered parents. Any other
non-2xx status, missing page, rate-limit exhaustion, unsafe schema, malformed response, or immutable
identity mismatch is terminal `ACQUISITION_ERROR`. A failed request record may retain only request
kind, attempt number, timestamp, and numeric HTTP status; it must not retain or log stderr, headers,
authorization data, response bodies, repository identities, or credential material. Do not silently
replace an endpoint or candidate.

Prequalify only public, enabled, non-archived, non-fork repositories and PRs merged no later than the
cutoff, with a 40-hex merge commit and one to 100 changed files. Repository identity, PR number,
merge time, merge commit, and first parent must agree across authenticated responses. `before` is the
first parent and `after` is the merge commit. Both commits and every retained blob must be retrievable
by immutable object ID.

## Deterministic order and resource bounds

V3 deliberately reuses v2's unexecuted rank domain byte-for-byte. After applying local exclusions,
rank each class independently by ascending lowercase hexadecimal:

`SHA-256("cejel-a3-b6-external-v2\\0" + class + "\\0" + ownerRepo + "\\0" + prNumber)`

Walk at most the first 400 ranked A3 candidates, then at most the first 400 ranked B6 candidates.
A3 must complete its walk before the first B6 search request. Each walked candidate counts toward
the 400-candidate limit whether rejected by metadata or source qualification. At most 200 candidates
per class may reach changed-file/source qualification. Stop a class after six candidates qualify.
Select at most one PR from a repository across both classes. There is no manual replacement or
replacement query.

For B6, order same-path authored candidates by ascending:

`SHA-256("cejel-a3-b6-external-v2-path\\0" + ownerRepo + "\\0" + prNumber + "\\0" + path)`

Consider at most 12 paths per PR and 200 before/after B6 file pairs across the class. Every attempted
pair consumes the bound even if content is unavailable or rejected. A3 retains at most root
`package.json` and one entrypoint at two revisions.

The invocation may make at most 4,500 live API attempts total. The worst-case no-retry envelope is
2,200 A3 core requests, 1,800 B6 core requests, and 50 B6 search requests. The transport records only
request kind, numeric status, attempt, time, and raw-byte hash in the safe ledger; request URLs and
identities remain private. Raw responses are encrypted to the bound age recipient, round-trip
verified, and committed only as ciphertext.

## Frozen qualification oracles

The harness may read only changed-file metadata, root `package.json` when A3 requires it, and changed
authored files needed by the class oracle. It may not read PR prose after exposure exclusion, run
package managers, hooks, scripts, builds, tests, binaries, notebooks, generated programs, or Cejel
against candidate source.

### A3

1. The same root `package.json` exists before and after with the same simple
   `node <relative-path>` or `tsx <relative-path>` start command.
2. The command resolves to the same tracked authored `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`,
   `.mts`, or `.cts` entrypoint before and after.
3. The entrypoint is changed and not generated, vendored, minified, fixture, or test-only source.
4. Before directly creates an HTTP server or directly registers request handling.
5. Before has no exact `/health`, `/healthz`, `/ready`, `/readiness`, `/live`, or `/liveness` route.
6. After adds at least one exact path while retaining the same direct construction.
7. The independent construction oracle returns false/true.

Retain only root `package.json` and the exact entrypoint at both revisions.

### B6

One same-path changed authored `.sql`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, or
`.cts` file must:

1. not be generated, vendored, minified, fixture, generated migration snapshot, or test-only source;
2. before contain an executable administrative membership grant, `CREATE ROLE ... SUPERUSER`,
   `ALTER ROLE|USER ... SUPERUSER`, or `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ...`;
3. after remove it or narrow it to `NOSUPERUSER`, ordinary named-object privileges, or an explicitly
   human-gated non-executing example;
4. independently return false/true for executed-escalation absence; and
5. not qualify through comment-only, documentation-only, string-fixture-only, or dead-code-only text.

Retain only that exact file at both revisions. Neither oracle inspects or emulates Cejel output.

## Preregistered yield prediction

V2 observed no archive-derived candidate count and made no B6 query, so it supplied no new evidence
with which to revise the earlier prediction. V3 therefore freezes the same prediction before archive
normalization: three to six A3 pairs and two to six B6 pairs within the fixed bounds. The modal joint
outcome remains `INSUFFICIENT_CANDIDATE_POOL`, not `COHORT_FROZEN`, because search expressions identify
relevant prose while qualification requires same-path authored before/after constructions and a
detector-independent false/true oracle. This prediction cannot be revised after acquisition begins.

## Private outputs and publication boundary

For each selected pair, private Alfred stores opaque IDs `EXT-A3-01` through `EXT-A3-06` and
`EXT-B6-01` through `EXT-B6-06`, class, repository/PR bindings, before/after commits, retained paths
and bytes, Git blob IDs, byte hashes, construction-oracle output, and complete mechanical inclusion
trace. Corpus order is class then deterministic rank; the oracle is separate.

Before evaluation, the v3 harness, encrypted live raw-response archive, safe ledger, terminal record,
and—only if complete—corpus and oracle must be committed, pushed, reviewed, and merged into private
Alfred with ancestry preserved. Plaintext API responses and third-party source do not enter Git
history.

Public Cejel may disclose only aggregate counts, corpus/oracle hashes, terminal state, and immutable
bindings. Repository identities, PR numbers, URLs, paths, source bytes, per-candidate reasons, raw
request URLs, and private absolute paths remain private unless separately authorized. Existing
authorization to publish Alfred-derived scores does not authorize wholesale third-party source
publication.

## Fixed execution order and terminal states

1. Merge this erratum and v3 preregistration in Cejel.
2. Implement a fresh Alfred v3 harness using only separately authored synthetic tests.
3. Commit and push the complete harness; authenticate all bindings, clean worktree, ancestry, local
   HEAD, remote-tracking ref, and independent remote ref.
4. Only then decrypt and authenticate the archive, normalize A3, and invoke acquisition once.
5. Commit and push the terminal record, safe ledger, encrypted live responses, and—only if
   complete—the selected corpus and separate oracle.
6. Review and merge the private Alfred result with ancestry preserved.
7. Publish an additive public Cejel closeout with bindings, aggregate counts, state, and hashes.
8. Only if `COHORT_FROZEN` contains six A3 and six B6 pairs may a separate evaluation
   preregistration be drafted and merged before any selected source is scanned.

Terminal states are `COHORT_FROZEN`, `INSUFFICIENT_CANDIDATE_POOL`, `ACQUISITION_ERROR`, and
`PROTOCOL_FAILURE`. There is one v3 acquisition invocation and no rerun, manual substitution, query
repair, detector run, or candidate replacement after it begins. Fixed per-request attempts are part
of the sole invocation, not reruns.

No outcome under this protocol changes a detector, rubric, public default, score, certificate,
leaderboard, release, historical result, or customer-facing claim.
