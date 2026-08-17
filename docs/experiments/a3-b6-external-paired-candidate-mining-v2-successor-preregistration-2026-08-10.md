# A3/B6 external paired candidate mining v2 — successor preregistration (2026-08-10)

Status: **preregistered before any successor candidate query, archive-derived candidate normalization,
external source read, or Cejel scan**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Purpose and v1 relationship

V1 ended in `ACQUISITION_ERROR` while authenticating a merge-commit object. It discovered 3,805
deduplicated A3 search candidates, reached no B6 search, inspected no candidate source, qualified no
pair, and ran no Cejel scan. This document defines an additive successor, not a retry or amendment of
v1.

V2 reuses only v1's byte-exact A3 search pages as its fixed A3 discovery frame. It does not issue a
new A3 search. Candidate-specific repository, pull, and commit responses acquired during v1 are
preserved as evidence but do not determine v2 eligibility. V2 acquires B6 through the unchanged five
preregistered queries, reauthenticates candidate metadata, and replaces the broad commit endpoint
with GitHub's Git commit-object endpoint before any source qualification.

This remains a discovery protocol only. It does **not** authorize a Cejel scan, detector change,
rubric promotion, score, leaderboard rescore, release, or performance claim. A complete output is a
fixed private corpus of six A3 and six B6 naturally authored before/after source slices, or an
explicit insufficient/error terminal record. A separate preregistration is required before Cejel
may read or scan any selected slice.

## Pre-registration diagnostic disclosure

After the v1 terminal result and before this successor was frozen, the operator:

- decrypted the evidence archive solely to verify the plaintext tar hash, file count, and all 55
  ledger hashes;
- inspected the JSON key set and only `merge_commit_sha` presence/length, `merged_at` presence,
  `changed_files`, base/head SHA lengths, state, and merged flag in v1 response 55; and
- inspected v1 harness control flow and aggregate response-kind counts.

No repository identity, PR number, title, body, path, source byte, candidate-specific reason, or
Cejel output was displayed or manually inspected during that diagnosis. The failed response's HTTP
status was not retained, so v2 does not claim which status caused v1. GitHub's
[pull-request documentation](https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28#get-a-pull-request)
states that a merged PR's `merge_commit_sha` identifies the resulting merge, squash, or rebased base
commit. Its
[Git commit-object documentation](https://docs.github.com/en/rest/git/commits?apiVersion=2022-11-28#get-a-commit-object)
states that `GET /repos/{owner}/{repo}/git/commits/{commit_sha}` returns 200, 404, or 409. V2 freezes
that narrower endpoint and status treatment prospectively.

## Immutable public bindings

| Artifact | Frozen binding |
|---|---|
| V1 preregistration merge | `b2baf7cf8317680914abebf368385144399927fb` |
| V1 preregistration blob / SHA-256 | `78fa3660116017f3c9810a0e4c34df8b223c3c9a` / `5082b62f405e4383866d6e93c715e1e0a7721d5f649b1afe44482118bd933be3` |
| V1 closeout merge | `28e559e244a5e9292e3e8c2f02d1102564bb0097` |
| V1 closeout path | `docs/experiments/a3-b6-external-paired-candidate-mining-v1-closeout-2026-08-10.md` |
| V1 closeout blob / SHA-256 | `220bf8fa884f806a1f9879cced2a4708b6145554` / `8c3e65c659462d26d3bcec8a5ec265237628193a190db7c25db059b980983193` |
| Exposure-registry merge / identities | `855df9531ebe6d2bfafa2f34823fded87c027124` / 8,757 |
| Exposure-registry blob / SHA-256 | `81ca47cfa37d44b93d3adc90d9d9be1eedc92a8a` / `47b21966dc1cf376364dd209a04039b90375ba77654c171178918d337f423b25` |
| Frozen detector commit / tree | `8a289ea09b4cb91354e64610181a1ae79af4b5ec` / `10960a032b784f7c11068a1b4a030bf76029eea0` |
| Detector source blob | `src/witan/repo-signals.ts` / `c55e9c8a82e2398672486183fd436f3ef82c64c8` |
| Rubric-version blob | `src/witan/rubric-version.ts` / `65a734bb71ef18b14d63ce57e71488e476f7c337` |
| Scoring blob | `src/witan/scoring.ts` / `d61dc75ccdf84c13129f642353e03cf996e0bdb9` |
| Prospective / public-default rubrics | `witan-rubric-v22-prospective-2026-08-10` / `witan-rubric-v17-2026-07-24` |

## Immutable private Alfred bindings

| Artifact | Frozen binding |
|---|---|
| V1 harness | `390b134d562c25e0564bfe01b4160aba3c205290` |
| V1 terminal result / merge | `bbbdf06c8c11b91035c9be356c9c38d895896015` / `f8e48ff8e5003574d482e8a88ac24096aebe30ae` |
| V1 result JSON blob / SHA-256 | `f6340185ff25d3521bdc223240d25e3e49ccdd43` / `9f72b411854de30c8d75089ef0db058f055e04929e9034c12b21688980ff6b50` |
| V1 raw ledger blob / SHA-256 | `e5e94a38127d4ef23501e0c1d2318a8f2da10058` / `69cf6bafc9fbbf6c4b90b8a74af4f46ae5a4f19cb29e3ed9d6164e0aa297bdc2` |
| Evidence-archive merge | `02ce173775d1ab66d136c1fe4a3abbbe380809e0` |
| Evidence manifest blob | `34b13c3136268f5913cfb622216e3bdef4a54369` |
| Encrypted archive blob | `1bc214bdd40fb37b3527d6af4d664fd16b9c6aab` |
| Encrypted archive SHA-256 / bytes | `b62fb0a08b886a1bb2bfa9a8149dea4f3e684e69ec5233af628915d7c5c0e6` / 37,376,116 |
| Plaintext tar SHA-256 / bytes | `43b4b4d93157888b299ddd76d328ac44d7f3b95ffbf5de832b2f8f9a3ae1f0b0` / 37,366,784 |
| Archive recipient fingerprint | `SHA256:j4H5gR9qB/hKcGNUqsj0i3bdQjySv2v4fhL3QPfq6Dw` |

The evidence-archive merge must be a strict ancestor of the frozen v2 harness. The v2 harness must
be committed and pushed before archive derivation or a candidate request, and must be a strict
ancestor of the first v2 result commit. Local HEAD, the origin remote-tracking ref, and an independent
`git ls-remote` lookup must resolve exactly to the harness commit immediately before execution.

The three detector/rubric/scoring objects above may not change before corpus completion. A change to
one makes v2 terminal `PROTOCOL_FAILURE`; no successor may silently substitute a new detector
binding.

## Fixed archive import and A3 discovery frame

The v2 harness must first verify the encrypted archive bytes, `age` recipient fingerprint, manifest,
v1 ledger bytes, and all Git ancestry bindings without decrypting the archive. It then decrypts with
the bound SSH identity into ignored private temporary storage and requires:

1. plaintext tar SHA-256 and byte length exactly match the table above;
2. exactly 55 JSON members exist with no additional file;
3. every member basename and byte SHA-256 matches the 55-entry v1 ledger; and
4. exactly 40 members are the ten pages for each of the four frozen A3 queries.

Any mismatch is terminal `PROTOCOL_FAILURE`. The harness may not fall back to local ignored v1 files,
a different archive, or GitHub search.

Before JSON decoding, the harness structurally replaces every value whose key is `title`, `body`,
`body_text`, or `body_html` with literal `null`. It decodes only repository identity, PR number, API
URL, HTML URL, creation timestamp, and query membership from the 40 A3 search pages. It must reproduce
exactly 3,805 deduplicated lowercase `owner/repo#number` candidates; otherwise the run is
`PROTOCOL_FAILURE`.

The other 15 archived repository/pull/commit responses are not decoded for v2 eligibility and are
not used as a response cache. They remain preservation evidence only. V2 must make zero A3 search
requests.

## Fixed live B6 discovery frame

The harness issues these exact GitHub Issues Search API queries:

1. `is:pr is:merged created:<=2026-08-09 SUPERUSER NOSUPERUSER`
2. `is:pr is:merged created:<=2026-08-09 "ALTER ROLE" SUPERUSER`
3. `is:pr is:merged created:<=2026-08-09 "CREATE ROLE" SUPERUSER`
4. `is:pr is:merged created:<=2026-08-09 "GRANT ALL PRIVILEGES" schema`
5. `is:pr is:merged created:<=2026-08-09 GRANT "admin role"`

For each query request `sort=created`, `order=asc`, `per_page=100`, and pages 1 through 10 or until
GitHub returns an empty page. The 1,000-result cap is part of the frame, not a population census.
Every request sends `Accept: application/vnd.github+json` and
`X-GitHub-Api-Version: 2022-11-28`. Live search requests begin at least 2.1 seconds apart so the
fixed 50-page maximum cannot intentionally exceed 30 search requests per minute.

Raw live responses, request kinds, response timestamps, status codes, and byte SHA-256 values are
retained privately. Request URLs containing candidate identities remain private. Before decoding a
search page, the same structural title/body-field stripping used for A3 is mandatory.

No additional query, synonym, sort, date, page, repository, issue, commit, or search engine may be
substituted.

## Fixed transport and safe failure semantics

Each search page and candidate metadata/object request may receive at most three attempts with fixed
delays of 0, 10, and 30 seconds. Only transport failures and HTTP 429, 500, 502, 503, or 504 are
retryable. Exhaustion is terminal `ACQUISITION_ERROR`.

Immediately before the sole invocation, the authenticated GitHub rate-limit response must report at
least 4,800 remaining core requests and 30 remaining search requests. That rate-limit check is not a
candidate request. The invocation has a global ceiling of 4,500 live request attempts, including
failed attempts and retries but excluding the rate-limit check. The harness must refuse before an
attempt that would exceed the ceiling and record `ACQUISITION_ERROR`; it may not wait for a reset and
continue as a second run.

Mechanical non-error exclusions are endpoint-specific:

- repository, pull, changed-file, or content lookup HTTP 404: the corresponding documented
  unavailable/incomplete exclusion;
- `GET /repos/{owner}/{repo}/git/commits/{commit_sha}` HTTP 404 or 409:
  `merge_commit_unavailable`; and
- all successful responses: schema and immutable-identity checks still apply.

Any other non-2xx status, missing page, rate-limit exhaustion, unsafe schema, malformed response, or
identity mismatch not assigned an explicit exclusion is terminal `ACQUISITION_ERROR`. A failed
request record may retain only request kind, attempt number, timestamp, and numeric HTTP status; it
must not retain or log stderr, headers, authorization data, response bodies, repository identities,
or credential prefixes/suffixes/hashes.

The Git commit-object endpoint returns only commit metadata needed to authenticate SHA and ordered
parents. V2 must not use the broader `/commits/{ref}` endpoint during prequalification.

## Candidate normalization and exposure exclusion

A3 archive items and live B6 items are independently collapsed by lowercase `owner/repo#number`.
Within each class, duplicate query hits contribute query membership but not another candidate.

Before reading PR prose, changed-file metadata, commit content, or repository source, reject any
candidate whose normalized repository identity appears in the frozen 8,757-entry exposure registry.
Also reject:

- the publisher's owned repositories or a fork whose parent is excluded;
- a deleted, private, disabled, archived, or unavailable repository;
- a PR not authenticated as merged, without a valid 40-hex merge commit, or merged after
  `2026-08-09T23:59:59.999Z`;
- a merge commit unavailable through the frozen Git commit-object endpoint or without a first
  parent;
- a PR with more than 100 changed files or an incomplete changed-file listing; or
- a repository already selected for either class.

An exclusion is final, mechanically counted, and cannot be overridden by manual judgment.

## Deterministic order and resource bounds

Apply registry and publisher-owned repository exclusions locally to the entire normalized class,
without a network request. Rank the remaining class independently by ascending lowercase
hexadecimal using only fields present in the frozen A3 archive or live B6 search pages:

`SHA-256("cejel-a3-b6-external-v2\\0" + class + "\\0" + ownerRepo + "\\0" + prNumber)`

Do not authenticate or prequalify the rest of a class before ranking. Walk at most the first 400
ranked candidates for A3, then at most the first 400 for B6. Each walked candidate counts toward the
400-candidate consideration bound whether it is excluded by live metadata or reaches source
qualification. At most 200 candidates per class may reach changed-file/source qualification.
Selection stops for a class after six candidates qualify. At most one PR from a repository may be
selected across both classes; A3 is processed first. Rejected candidates advance to the next
precomputed rank; there is no manual replacement or replacement query.

For B6, same-path authored candidates are ordered by ascending
`SHA-256("cejel-a3-b6-external-v2-path\\0" + ownerRepo + "\\0" + prNumber + "\\0" + path)`.
At most 12 such paths may be considered from one PR, and at most 200 before/after B6 file pairs may
be read across the class. Each attempted pair consumes the global pair bound even when content is
unavailable or the oracle rejects it. A3 retains at most two paths at two revisions and therefore
needs no additional per-candidate path bound.

If either class has fewer than six qualifying candidates within its bound, the terminal state is
`INSUFFICIENT_CANDIDATE_POOL`. Publish only archive/query, exclusion, inspected, and qualified counts
plus artifact hashes. Do not create a smaller evaluation cohort and do not run Cejel.

## Independent source and ancestry acquisition

For an inspected PR, authenticate repository identity, PR number, merge timestamp, merge commit, and
ordered parents through the frozen API endpoints. `before` is the merge commit's first parent;
`after` is the merge commit. Both commits and every retained blob must be retrievable by immutable
object ID.

The harness may read only changed-file metadata, root `package.json` where A3 requires it, and changed
authored files needed by the class oracle. It may not read PR title/body after exposure exclusion
because neither qualification oracle uses prose. It may not run package managers, hooks, scripts,
builds, tests, binaries, notebooks, generated programs, or Cejel against candidate source.

## Frozen qualification oracles

The v1 A3 and B6 mechanical qualification clauses are incorporated unchanged:

### A3

1. The same root `package.json` exists before and after with the same simple
   `node <relative-path>` or `tsx <relative-path>` start command.
2. That command resolves to the same tracked authored `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`,
   `.mts`, or `.cts` entrypoint before and after.
3. The entrypoint is changed and is not generated, vendored, minified, fixture, or test-only source.
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

Retain only that exact file at both revisions.

Qualification does not inspect or emulate Cejel output.

## Preregistered yield prediction

Before acquisition, the prediction is three to six A3 pairs and two to six B6 pairs within the fixed
bounds. The modal joint outcome is `INSUFFICIENT_CANDIDATE_POOL`, not `COHORT_FROZEN`, because the
search expressions identify relevant prose while the qualification bar requires same-path authored
before/after constructions and a detector-independent false/true oracle. This prediction is fixed
before the archive-derived pool is normalized or any B6 query is issued; it cannot be revised after
counts are observed.

## Private outputs and publication boundary

For each selected pair, private Alfred stores opaque IDs `EXT-A3-01` through `EXT-A3-06` and
`EXT-B6-01` through `EXT-B6-06`, class, repository/PR bindings, before/after commits, retained paths
and original bytes, Git blob IDs, byte hashes, construction-oracle output, and complete mechanical
inclusion trace. Corpus order is class then deterministic rank; the oracle is separate.

Before evaluation, the v2 harness, encrypted raw-response archive, safe ledger, terminal record,
corpus, and oracle must be committed, pushed, reviewed, and merged into private Alfred with ancestry
preserved. Plaintext API responses and third-party source do not enter Git history. Raw v2 responses
must be encrypted to the same bound recipient, round-trip verified, and bound by ciphertext and
plaintext hashes.

Public Cejel may disclose only aggregate counts, corpus/oracle hashes, terminal state, and immutable
bindings. Repository identities, PR numbers, URLs, paths, source bytes, per-candidate reasons, raw
request URLs, and private absolute paths remain private unless separately authorized. Public-score
authorization does not authorize wholesale third-party source publication.

## Fixed execution order and terminal states

1. Merge the v1 encrypted-evidence archive in Alfred.
2. Merge this successor preregistration in Cejel with exact archive commit/blob bindings.
3. Implement a fresh v2 Alfred harness using only separately authored synthetic tests.
4. Commit and push the harness; authenticate all bindings, strict ancestry, clean worktree, local
   HEAD, remote-tracking ref, and independent remote ref.
5. Only then decrypt/verify the archive and invoke the acquisition once.
6. Commit and push an encrypted raw-response archive, safe ledger, terminal record, and—only when
   complete—the selected corpus and separate oracle.
7. Review and merge the private Alfred result with ancestry preserved.
8. Publish an additive public Cejel closeout with bindings, counts, state, and hashes.
9. Only if `COHORT_FROZEN` contains six A3 and six B6 pairs may a separate evaluation
   preregistration be drafted. No selected source may be scanned before that merge.

Terminal states are `COHORT_FROZEN`, `INSUFFICIENT_CANDIDATE_POOL`, `ACQUISITION_ERROR`, and
`PROTOCOL_FAILURE`. There is one acquisition invocation and no rerun, manual substitution, query
repair, detector run, or candidate replacement after it begins. Fixed per-request attempts are part
of the sole invocation, not reruns.

No outcome under this protocol changes a detector, rubric, public default, score, certificate,
leaderboard, release, historical result, or customer-facing claim.
