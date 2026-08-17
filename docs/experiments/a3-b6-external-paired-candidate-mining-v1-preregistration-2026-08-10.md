# A3/B6 external paired candidate mining v1 — preregistration (2026-08-10)

Status: **preregistered before any candidate query, external source read, or Cejel scan**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Purpose and boundary

The existing prospective A3/B6 evidence is synthetic, single-author, and construction-bound.
The completed v2 result found 4/6 A3 and 6/6 B6 paired successes; the later v22 package-start
result closed one narrow A3 construction at 6/6. Neither result estimates performance on
naturally authored source.

This protocol authorizes a discovery phase for a later external paired evaluation. It freezes
how public merged pull requests will be queried, excluded, mechanically qualified, and selected
before any query is issued or candidate source is read. It does **not** authorize a Cejel scan,
detector change, rubric promotion, score, leaderboard rescore, release, or performance claim.

The discovery output is a fixed private corpus of six A3 and six B6 naturally authored
before/after source slices, or an explicit insufficient/error terminal record. A separate
preregistration is required before Cejel may read or scan a selected slice.

## Immutable public bindings

| Artifact | Frozen binding |
|---|---|
| Cejel exposure-registry merge | `855df9531ebe6d2bfafa2f34823fded87c027124` |
| Exposure-registry path | `docs/experiments/external-repository-exposure-registry-2026-08-10.json` |
| Exposure-registry blob / SHA-256 | `81ca47cfa37d44b93d3adc90d9d9be1eedc92a8a` / `47b21966dc1cf376364dd209a04039b90375ba77654c171178918d337f423b25` |
| Exposure identities | 8,757 normalized GitHub `owner/repo` names |
| Frozen detector merge | `8a289ea09b4cb91354e64610181a1ae79af4b5ec` |
| Frozen detector tree | `10960a032b784f7c11068a1b4a030bf76029eea0` |
| Source-tree package version | `0.4.0`; prospective v22 is unreleased |
| Prospective rubric | `witan-rubric-v22-prospective-2026-08-10` |
| Public default | `witan-rubric-v17-2026-07-24` |
| Detector source blob | `src/witan/repo-signals.ts` / `c55e9c8a82e2398672486183fd436f3ef82c64c8` |
| Rubric-version blob | `src/witan/rubric-version.ts` / `65a734bb71ef18b14d63ce57e71488e476f7c337` |
| Scoring blob | `src/witan/scoring.ts` / `d61dc75ccdf84c13129f642353e03cf996e0bdb9` |

The detector binding is recorded now so discovery cannot be followed by an outcome-responsive
detector repair. The three bound detector, rubric-version, and scoring source objects may not
change between the selected-corpus merge and its later evaluation preregistration. A change to
one of those objects before corpus completion makes this protocol terminal and requires a
successor protocol that treats the completed corpus as exposed.

## Fixed GitHub search frame

Candidate PRs must have been created no later than `2026-08-09` and be public and merged when
the acquisition harness runs. The harness makes these exact GitHub Issues Search API queries:

### A3 queries

1. `is:pr is:merged created:<=2026-08-09 healthcheck node`
2. `is:pr is:merged created:<=2026-08-09 readiness node`
3. `is:pr is:merged created:<=2026-08-09 "health endpoint" node`
4. `is:pr is:merged created:<=2026-08-09 "ready endpoint" node`

### B6 queries

1. `is:pr is:merged created:<=2026-08-09 SUPERUSER NOSUPERUSER`
2. `is:pr is:merged created:<=2026-08-09 "ALTER ROLE" SUPERUSER`
3. `is:pr is:merged created:<=2026-08-09 "CREATE ROLE" SUPERUSER`
4. `is:pr is:merged created:<=2026-08-09 "GRANT ALL PRIVILEGES" schema`
5. `is:pr is:merged created:<=2026-08-09 GRANT "admin role"`

For each query, request `sort=created`, `order=asc`, `per_page=100`, and pages 1 through 10 or
until GitHub returns an empty page. The 1,000-result GitHub search cap is part of the frozen
frame, not a population census. Every raw response page, request URL, response timestamp, and
SHA-256 is retained privately. A page may receive at most three transport attempts with fixed
delays of 0, 10, and 30 seconds. A non-success response, missing page, rate-limit exhaustion, or
schema error after those attempts makes the run `ACQUISITION_ERROR`; partial pages cannot be
used for selection.

No additional query, synonym, sort, date, page, repository, issue, commit, or search engine may
be substituted under this protocol.

## Candidate normalization and exposure exclusion

Search items are normalized to lowercase `owner/repo`, PR number, API URL, HTML URL, creation
time, merge time, and merge commit. Duplicate `owner/repo#number` items within or across queries
collapse to one class-labelled candidate.

Raw search pages may necessarily contain title or body fields, but the acquisition harness must
not deserialize, inspect, rank on, or report those fields before the candidate passes the frozen
exposure exclusions. Pre-exclusion normalization may use only repository identity, PR number,
URLs, timestamps, and merge state.

Before reading a PR body, diff, commit, or repository source, reject any candidate whose
normalized identity appears in the frozen 8,757-entry exposure registry. Also reject:

- the publisher's owned repositories or a fork whose parent is excluded;
- a deleted, private, disabled, archived, or unavailable repository;
- a PR without an authenticated merge commit and at least one parent;
- a PR whose authenticated `merged_at` is after `2026-08-09T23:59:59.999Z`;
- a PR with more than 3,000 changed files or an incomplete changed-file listing; or
- a repository already selected for either class.

An exclusion is final and is recorded with its mechanical reason. It cannot be overridden by
manual judgment.

## Deterministic inspection order and bound

After exposure exclusion, rank each class independently by ascending lowercase hexadecimal:

`SHA-256("cejel-a3-b6-external-v1\\0" + class + "\\0" + ownerRepo + "\\0" + prNumber + "\\0" + mergeCommit)`

Inspect at most the first 200 ranked candidates for A3, then at most the first 200 for B6.
Selection stops for a class after six candidates qualify. At most one PR from a repository may
be selected across both classes; because A3 is processed first, a repository selected for A3 is
mechanically skipped during B6 processing. Rejected candidates do not cause a replacement query;
the next candidate in the precomputed rank order is inspected.

If either class has fewer than six qualifying candidates within its 200-candidate inspection
bound, the state is `INSUFFICIENT_CANDIDATE_POOL`. Publish only query, exclusion, inspected, and
qualified counts plus artifact hashes. Do not create a smaller evaluation cohort and do not run
Cejel.

## Independent source and ancestry acquisition

For an inspected PR, authenticate its repository identity, PR number, merge commit, and commit
parents through the GitHub API. The `before` revision is the merge commit's first parent; the
`after` revision is the merge commit itself. Both commits and every retained blob must be
retrievable by immutable object ID. The harness records repository visibility, fork/parent
identity, PR metadata, commit SHAs, parent order, changed-file pagination, relevant blob IDs, and
byte SHA-256 values.

The acquisition harness may read only the PR body/title, changed-file metadata, root
`package.json` where required by A3, and changed authored files needed by the class oracle. It
may not run package managers, hooks, scripts, builds, tests, binaries, notebooks, generated
programs, or Cejel. It must never log credentials or raw authorization headers.

## A3 mechanical qualification oracle

An A3 candidate qualifies only when all conditions hold:

1. the same root `package.json` exists before and after and has the same simple
   `node <relative-path>` or `tsx <relative-path>` start command;
2. that command resolves to the same tracked authored `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`,
   `.tsx`, `.mts`, or `.cts` entrypoint before and after;
3. the entrypoint is changed by the PR and is not generated, vendored, minified, a fixture, or
   test-only source;
4. the before entrypoint directly creates an HTTP server or directly registers request handling;
5. the before entrypoint has no route or branch for `/health`, `/healthz`, `/ready`,
   `/readiness`, `/live`, or `/liveness`;
6. the after entrypoint adds at least one of those exact paths while retaining the same direct
   server/request-handling construction; and
7. the before/after construction oracle independently returns false/true for readiness presence.

The frozen natural source slice contains only root `package.json` and that exact entrypoint at
each revision, with original bytes and relative paths unchanged. Qualification does not inspect
or emulate Cejel's finding output.

## B6 mechanical qualification oracle

A B6 candidate qualifies only when one changed authored `.sql`, `.js`, `.jsx`, `.mjs`, `.cjs`,
`.ts`, `.tsx`, `.mts`, or `.cts` file has the same path before and after and all conditions hold:

1. the file is not generated, vendored, minified, a fixture, generated migration snapshot, or
   test-only source;
2. the before file contains an executed or executable administrative role-membership grant,
   `CREATE ROLE ... SUPERUSER`, `ALTER ROLE|USER ... SUPERUSER`, or
   `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ...` construction;
3. the after file removes that construction or narrows it to `NOSUPERUSER`, ordinary named-object
   privileges, or an explicitly documented human-gated non-executing example;
4. the before/after construction oracle independently returns false/true for executed escalation
   absence; and
5. no comment-only, documentation-only, string-fixture-only, or dead-code-only change can satisfy
   the oracle.

The frozen natural source slice contains only that exact file at each revision, with original
bytes and relative path unchanged. Qualification does not inspect or emulate Cejel findings.

## Frozen private cohort and publication boundary

For each selected pair, private Alfred stores a deterministic opaque ID (`EXT-A3-01` through
`EXT-A3-06` or `EXT-B6-01` through `EXT-B6-06`) assigned in class/rank order, class, source
repository and PR bindings, before/after commits, retained paths, original bytes, Git blob IDs,
byte hashes, construction-oracle output, and the complete mechanical inclusion trace. The corpus
is sorted by class and deterministic rank. Its detector-independent oracle is stored separately.

Before any selected source is evaluated, the acquisition harness, raw response ledger, corpus,
and oracle must be committed and pushed, then merged into Alfred with a merge commit preserving
the pushed harness as an ancestor. The public Cejel closeout may disclose only aggregate mining
counts, corpus/oracle hashes, and terminal status. Repository identities, PR numbers, paths,
source bytes, per-candidate reasons, and private absolute paths remain private unless separately
authorized.

The user has authorized public disclosure of Alfred-derived scores and hashes, not wholesale
publication of third-party source. Copyrighted source must remain private and minimal.

## Fixed order and terminal states

1. Merge this preregistration in Cejel.
2. Implement a fresh Alfred acquisition harness using only synthetic self-tests.
3. Bind the merged preregistration commit/blob and every public object above.
4. Commit and push the harness; authenticate local, remote-tracking, and independent remote refs.
5. Execute the search/acquisition harness once, with resumable transport only as specified.
6. Commit and push the raw response ledger, terminal record, and—only if complete—the selected
   corpus and separate oracle.
7. Review and merge the private result with ancestry preserved.
8. Publish an additive public Cejel closeout with bindings, counts, status, and hashes.
9. If and only if the state is `COHORT_FROZEN` with six A3 and six B6 pairs, draft a separate
   evaluation preregistration. No selected source may be scanned before that merge.

Terminal states are `COHORT_FROZEN`, `INSUFFICIENT_CANDIDATE_POOL`, `ACQUISITION_ERROR`, and
`PROTOCOL_FAILURE`. There is no manual substitution, query repair, detector run, or candidate
replacement after execution begins. Any detector invocation during discovery makes the protocol
`PROTOCOL_FAILURE` and permanently exposes the inspected candidate set for future evaluation.

No outcome under this protocol changes a detector, rubric, public default, score, certificate,
leaderboard, release, historical result, or customer-facing claim.
