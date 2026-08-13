# B6 external paired candidate mining v5 — preregistration (2026-08-10)

Status: **PREREGISTERED; acquisition not yet run**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Purpose and non-claim

V4 ended in `ACQUISITION_ERROR` after A3 completed and before any B6 candidate was discovered or
inspected. Its terminal error was `github_api_request_failed:search-b6-3-2:403`. The record supports
no inference about why that response occurred. V4 authorized no retry after its sole invocation,
and none occurred.

V5 is a new B6-only acquisition protocol. It begins the five-query B6 search frame again from query
1, page 1; it does not resume v4, reuse a v4 search response, decrypt the v4 response archive, or
read a v4 candidate identity. Its only substantive transport changes are a minimum ten-second
search-request interval and a fixed search-only retry policy that includes the observable HTTP 403
response class. The cutoff, five queries, sort, page bounds, exposure closure, deterministic rank,
candidate endpoints, resource bounds, B6 qualification oracle, detector bindings, prediction,
privacy boundary, and prohibition on Cejel execution remain unchanged.

This protocol is discovery only. It does **not** authorize a Cejel scan, detector or rubric change,
score, recall or precision estimate, certificate, leaderboard update, release, or customer-facing
claim. Only a complete private cohort of six naturally authored B6 before/after pairs plus a
separate mechanical oracle may authorize drafting a later B6 evaluation preregistration.

## Immutable predecessor bindings

The v5 harness must bind and verify all of the following before any live request:

| Artifact | Immutable binding |
|---|---|
| Cejel v4 preregistration merge / blob / SHA-256 | `4c2bf43ecaa6bdd87f5ae19b24009b0ddc02b790` / `a39476ab981b6f802b0d707fbb296fcbc45ae3a1` / `67e8c12e4ccc1613313ee3a2832a27f1702878ea91564da5ebf0c63473a39e19` |
| Cejel v4 closeout merge / blob / SHA-256 | `bb8b67569138e5584d0d857b96996285016edb45` / `663afd1df73d1e3fd1c1d69527471472a8647796` / `3ebe1fc0949235dbe03919e9506df9905488be76eae7e9eeda71201c3dde1e9e` |
| Alfred v4 harness / terminal result / merge | `44323006f6591aaa6706a2e4b5bb4e9a979b422b` / `fb24d42318a700652d4dbb414faadb76dd18d519` / `f4cc6df9f6f204e474ba0f5419a15cdc058569b4` |
| V4 result JSON blob / SHA-256 | `c1492dffb5f11bf18065333fa18442db0c2d023c` / `4ad610b2bce07a4df1432cf348568a2cb510c8701f8894d68ba6fdecd5920d4c` |
| V4 result Markdown blob / SHA-256 | `88408425fb2f728256f69148c86dc785338021f5` / `926cbe7f08c1c9132f80ce6d09226bd3ce30668373e9d1a07af36fe9af9097a5` |
| V4 safe-ledger blob / SHA-256 | `b105a900c659b43aa297243bbcaf5fc5ffc65f4f` / `693079203e95efce535261448120e1565c29fd5b61502b44bc2587c4fc13b8a6` |
| V4 encrypted live-response blob / bytes / SHA-256 | `d7ed15c749369fc74203d4b0eac47b6ed2e57810` / 40,143,124 / `578dd5cb4c9d772b4d10134e1bdd919e6ed51bab3f60ffc7cfc76354884838af` |
| Age version / recipient fingerprint | `v1.3.1` / `SHA256:j4H5gR9qB/hKcGNUqsj0i3bdQjySv2v4fhL3QPfq6Dw` |
| Tar version | `bsdtar 3.5.3 - libarchive 3.7.4 zlib/1.2.12 liblzma/5.4.3 bz2lib/1.0.8` |

The eventual Cejel merge containing this v5 preregistration and its document blob are additional
cross-repository content bindings. The Alfred v5 harness may not be committed before those values
exist.

## Frozen detector and exposure closure

The acquisition cutoff remains `2026-08-09T23:59:59.999Z`. Exclude the exact 8,757 lowercase
identities in the exposure registry at Cejel commit
`855df9531ebe6d2bfafa2f34823fded87c027124`, path
`docs/experiments/external-repository-exposure-registry-2026-08-10.json`, blob
`81ca47cfa37d44b93d3adc90d9d9be1eedc92a8a`, SHA-256
`47b21966dc1cf376364dd209a04039b90375ba77654c171178918d337f423b25`. Also exclude publisher-owned
owners `barglabs` and `houman44` before any candidate-specific request. A fork whose parent is
excluded or publisher-owned is excluded mechanically.

V5 does not access the v4 encrypted archive or any private v4 identity. V4 produced no B6 candidate,
selected pair, corpus, or oracle, so there is no v4 B6 identity to carry forward as a selected-source
exclusion.

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
must contain v4 merge `f4cc6df9f6f204e474ba0f5419a15cdc058569b4`. Implement v5 in a new
`b6-external-candidate-mining-v5/` directory. V1-v4 sources and results remain immutable.

Before the harness commit, separately authored synthetic tests with an injected fake clock and
transport must demonstrate all of the following without making a live request or reading a v4 raw
response:

1. a search request starts immediately and retries only HTTP 403, 429, 500, 502, 503, 504, or a
   transport failure, with at most four total attempts and fixed pre-attempt delays of 0, 60, 180,
   and 300 seconds;
2. search HTTP 403 succeeds if a later fixed attempt returns 200 and becomes terminal
   `ACQUISITION_ERROR` after the fourth failed attempt;
3. search HTTP 400, 401, 404, 405, 409, 410, 422, and every other non-enumerated status are terminal
   on the first attempt;
4. candidate-specific HTTP 403 is terminal on the first attempt, while only transport failure and
   HTTP 429, 500, 502, 503, or 504 retain the three-attempt 0/10/30-second policy;
5. every search attempt begins at least 10,000 milliseconds after the preceding search attempt,
   with the longer fixed retry delay taking precedence;
6. a terminal search error discards every partial search page and cannot emit a selected pair,
   corpus, or oracle;
7. the harness issues no A3 query, archive read, A3 candidate request, A3 source read, or A3 result
   field;
8. six B6 pairs are required for `COHORT_FROZEN`; zero through five yield
   `INSUFFICIENT_CANDIDATE_POOL`; and
9. missing/mismatched remote refs, predecessor bindings, detector blobs, age version/recipient,
   tar version, rate thresholds, unsafe schemas, privacy fields, resource limits, or ancestry fail
   closed before acquisition.

Commit and push the complete harness before the first live request. Immediately before the sole
invocation, verify: the v4 merge is a strict ancestor of the v5 harness; local HEAD, origin tracking,
and independent remote refs all equal the exact harness commit; the Alfred worktree is clean; the
merged Cejel v5 preregistration and all predecessor bindings match; Cejel tracking and independent
main match and retain every detector blob; and GitHub has at least 4,800 core and 30 search requests
remaining. The pushed harness must be a strict ancestor of the first and only v5 result commit.

## Fixed B6 discovery frame

Issue exactly these five GitHub search queries unless an earlier terminal error occurs:

1. `is:pr is:merged created:<=2026-08-09 SUPERUSER NOSUPERUSER`
2. `is:pr is:merged created:<=2026-08-09 "ALTER ROLE" SUPERUSER`
3. `is:pr is:merged created:<=2026-08-09 "CREATE ROLE" SUPERUSER`
4. `is:pr is:merged created:<=2026-08-09 "GRANT ALL PRIVILEGES" schema`
5. `is:pr is:merged created:<=2026-08-09 GRANT "admin role"`

For each query request `sort=created`, `order=asc`, `per_page=100`, and pages 1 through 10 or until
an empty page. A partial non-empty page does not stop pagination. Use GitHub API version
`2022-11-28`. Every search attempt, including a retry, must start at least 10 seconds after the prior
search attempt. The 60/180/300-second retry waits are measured from completion of the preceding
failed attempt and therefore take precedence over the minimum interval.

Structurally replace title, body, text, HTML, patch, and commit-message fields with `null` in raw
bytes before JSON parsing. Decode only repository API URL, HTML URL, PR number, creation time, and
query membership. Collapse by lowercase `owner/repo#number`; union query membership is metadata
only. No v4 page is reused. No additional query, synonym, sort, date, page, repository, issue,
commit, or search engine may be substituted.

Every search page may receive at most four attempts with fixed pre-attempt delays of 0, 60, 180,
and 300 seconds. Only transport failures and HTTP 403, 429, 500, 502, 503, or 504 are retryable for a
search request. The policy is keyed only to the numeric response class and does not inspect, retain,
publish, or infer from an error body or response header. Exhaustion is terminal
`ACQUISITION_ERROR`. Partial pages cannot be used for ranking, selection, a corpus, or an oracle.
The fixed retries are part of the sole invocation, not a rerun.

## Candidate endpoints, exclusions, and bounds

After local exposure exclusion and deterministic ranking, the only candidate-specific endpoints
are:

- `GET /repos/{owner}/{repo}`;
- `GET /repos/{owner}/{repo}/pulls/{number}`;
- `GET /repos/{owner}/{repo}/git/commits/{sha}`;
- `GET /repos/{owner}/{repo}/pulls/{number}/files?per_page=100&page=1`; and
- `GET /repos/{owner}/{repo}/contents/{path}?ref={immutable-sha}`.

Candidate requests retain at most three attempts at fixed delays of 0, 10, and 30 seconds. Only
transport failures and HTTP 429, 500, 502, 503, or 504 are retryable. Repository, pull,
changed-file, or content HTTP 404 is the corresponding documented unavailable or incomplete
exclusion; Git commit-object HTTP 404 or 409 is `merge_commit_unavailable`. Candidate HTTP 403 and
every other unenumerated status are terminal `ACQUISITION_ERROR`. A failed request record retains
only request kind, attempt number, timestamp, and numeric status; it never retains or logs stderr,
headers, authorization data, response bodies, request URLs, repository identities, or credential
material.

Prequalify only public, enabled, non-archived repositories and PRs merged no later than the cutoff,
with a 40-hex merge commit and one to 100 changed files. Repository identity, PR number, merge time,
merge commit, and first parent must agree across authenticated responses. `before` is the first
parent and `after` is the merge commit. Both commits and every retained blob must be retrievable by
immutable object ID.

After exposure exclusion, rank candidates by ascending lowercase hexadecimal:

`SHA-256("cejel-a3-b6-external-v2\\0B6\\0" + ownerRepo + "\\0" + prNumber)`

Walk at most the first 400 ranked candidates. Each walked candidate consumes the bound whether
rejected by metadata or source qualification. At most 200 may reach changed-file/source
qualification. Stop after six qualify. Select at most one PR per repository.

Order same-path authored candidates by ascending:

`SHA-256("cejel-a3-b6-external-v2-path\\0" + ownerRepo + "\\0" + prNumber + "\\0" + path)`

Consider at most 12 paths per PR and 200 before/after B6 file pairs total. Every attempted pair
consumes the bound even if content is unavailable or rejected. The invocation may make at most
4,500 live API attempts total, including failed attempts and retries but excluding the pre-run
rate-limit check. The harness refuses before an attempt that would exceed the ceiling.

## Frozen B6 qualification oracle

A candidate qualifies only when one changed authored `.sql`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`,
`.tsx`, `.mts`, or `.cts` file has the same path before and after and all conditions hold:

1. the file is not generated, vendored, minified, a fixture, generated migration snapshot, or
   test-only source;
2. the before file contains an executed or executable administrative role-membership grant,
   `CREATE ROLE ... SUPERUSER`, `ALTER ROLE|USER ... SUPERUSER`, or
   `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ...` construction;
3. the after file removes that construction or narrows it to `NOSUPERUSER`, ordinary named-object
   privileges, or an explicitly documented human-gated non-executing example;
4. the detector-independent construction oracle returns false/true for executed-escalation
   absence; and
5. no comment-only, documentation-only, string-fixture-only, or dead-code-only change can satisfy
   the oracle.

Retain only that exact file at both revisions, with original bytes and relative path unchanged.
Qualification does not inspect or emulate Cejel output. The harness may not read PR prose after
exposure exclusion or run package managers, hooks, scripts, builds, tests, binaries, notebooks,
generated programs, or Cejel against candidate source.

## Yield prediction, private outputs, and publication boundary

V4 discovered and inspected no B6 candidate before its transport error, so it supplied no evidence
with which to revise the frozen B6 yield prediction. V5 therefore predicts two to six qualifying B6
pairs within the fixed bounds. The modal outcome remains `INSUFFICIENT_CANDIDATE_POOL`, not
`COHORT_FROZEN`, because the search expressions identify relevant prose while qualification
requires a same-path authored false/true construction. This prediction cannot be revised after the
first request begins.

For each selected pair, private Alfred stores opaque IDs `EXT-B6-01` through `EXT-B6-06`, immutable
repository/PR/commit/path/blob bindings, original before/after bytes, byte hashes, construction-
oracle output, and the complete mechanical inclusion trace. The corpus and detector-independent
oracle are separate canonical artifacts. Raw successful responses and the private inclusion trace
are archived with the bound tar executable, encrypted to the bound age recipient, round-trip
verified, and committed only as ciphertext. Public safe artifacts contain only aggregate counts,
opaque artifact hashes, terminal state, request kind, attempt number, timestamps, numeric request
statuses, and immutable protocol bindings. Plaintext private temporary storage is deleted only
after the result commit is pushed and independently authenticated on the remote.

Repository identities, PR numbers, URLs, paths, source bytes, candidate-specific reasons, raw
request URLs, response bodies, headers, private absolute paths, and credential material remain
private. Public Cejel may disclose only permitted aggregates, state, and hashes. The existing user
authorization to publish Alfred-derived scores and hashes does not authorize third-party source or
identity disclosure.

## Fixed execution order and terminal states

1. Merge this v5 preregistration in Cejel.
2. Implement and synthetically test a fresh Alfred v5 harness.
3. Commit, push, and independently authenticate the complete harness.
4. Only then invoke the full five-query B6 acquisition once from query 1, page 1.
5. Commit and push the terminal record, safe ledger, encrypted raw responses, and—only if six pairs
   qualify—the private corpus and separate oracle.
6. Review and merge the private Alfred result with ancestry preserved.
7. Publish an additive public Cejel closeout with bindings, permitted aggregates, state, and hashes.
8. Only if `COHORT_FROZEN` contains exactly six B6 pairs may a separate B6 evaluation
   preregistration be drafted and merged before any selected source is scanned.

Terminal states are `COHORT_FROZEN`, `INSUFFICIENT_CANDIDATE_POOL`, `ACQUISITION_ERROR`, and
`PROTOCOL_FAILURE`. There is one v5 invocation and no rerun, resume, manual substitution, query
repair, response reuse, detector run, or candidate replacement after it begins. Fixed per-request
retries are part of that invocation. Any detector invocation during discovery is terminal
`PROTOCOL_FAILURE` and exposes the inspected candidate set for future evaluation.

No v5 outcome changes a detector, rubric, public default, score, certificate, leaderboard, release,
historical result, or customer-facing claim.
