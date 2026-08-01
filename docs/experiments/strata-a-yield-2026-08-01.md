# GitHub structural strata ceiling (A1–A3) — 2026-08-01

Status: measured; extraction only; no corpus or harness changes

## Result first

The frozen histories produced **326 structurally anchored candidates and 13 qualifying
defects: 4.0% pooled conversion**. By stratum, A1 produced `0 / 0`, A2 produced
`12 / 325` (3.7%), and A3 produced `1 / 1` (100%, but with only one candidate). The 13
qualifiers are the honest current ceiling in these repositories.

**No: n >= 200 is not reachable from the existing corpus.** Another 187 qualifiers are
needed. At A2's observed 3.69% conversion that means about **5,065 additional A2
red-to-green anchors**. Using the portfolio's 2026-02-21 through 2026-08-01 observation
window, the empirical qualifying arrival rate is about 2.5 per month. A purely mechanical
unchanged-rate extrapolation reaches 200 only around late 2032, with sensitivity into early
2033. This is a six-to-seven-year extrapolation, not a delivery forecast, and it assumes no
saturation. A1 is absent; A3 is metadata-limited; A2's low conversion is therefore the
binding limit.

No selection rule read commit or PR message text. In particular, no rule matched `fix`,
`bug`, `patch`, `revert`, or any other natural-language token.

## Scope and frozen revisions

All queries targeted each repository's default `main` branch. The branch tips below were
frozen before classification or oracle execution.

| Product | Repository | Frozen `main` tip | First-parent commits | Merged main PRs | Inline review comments | Deployments |
|---|---|---|---:|---:|---:|---:|
| Cejel | `BargLabs/cejel` | `97564ad17ddde4c64d213f78c98d316c01b0c12a` | 60 | 53 | 0 | 196 |
| Egbert | `BargStudio/egbert` | `b8346c235a9607c0efff31af6bb44a25ee4d16bb` | 2,352 | 823 | 0 | 1 |
| Site Machine | `houman44/site-machine` | `1e4106f131f9af27a9a314a0dbb2ecc35c09b441` | 175 | 96 | 0 | 1,774 |
| Alfred | `BargLabs/alfred` | `76a631be63cf1be2cd4d9c6b303626a7124864c4` | 963 | 664 | 24 | 1,909 |
| Edwin | `houman44/edwin` | `8a9e006d1bae6653f253608ddc11eb93570fc5a1` | 2,418 | 417 | 0 | 0 |
| Therasyn | `BargStudio/therasyn` | `39f228590c2b2ecb47ddb420709d15c9271ad65a` | 195 | 56 | 0 | 362 |
| Knut | `houman44/knut` | `4609f13c43f8b772db2aee7020bd9dad8ffeca16` | 21 | 0 | 0 | 0 |
| Edwy | `BargLabs/edwy` | `99c1139ba187d7181ff9923edd782f66cc599aec` | 244 | 157 | 0 | 52 |
| Wilfrid | `BargLabs/wilfrid` | `da0a474d361dd472c92e59c07b63b6139c390e42` | 6 | 5 | 0 | 0 |
| Barg Labs site | `houman44/barglabs-site` | `1e164da9400b0c7b8f073f2df5bafad3af48d643` | 35 | 9 | 0 | 44 |
| Cejel site | `BargLabs/cejel-site` | `5ed796e3dc9926ae69e0b2b018026c099d211a2e` | 33 | 26 | 0 | 0 |
| **Total** | 11 repositories | — | **6,502** | **2,306** | **24** | **4,338** |

## Yield by product and stratum

“Pass” means all four acceptance conditions, not merely that the structural anchor was
found. Zero-candidate cells have no meaningful conversion rate.

| Product | A1 candidates | A1 pass | A1 conversion | A2 candidates | A2 pass | A2 conversion | A3 candidates | A3 pass | A3 conversion |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Cejel | 0 | 0 | — | 1 | 0 | 0.00% | 0 | 0 | — |
| Egbert | 0 | 0 | — | 163 | 2 | 1.23% | 0 | 0 | — |
| Site Machine | 0 | 0 | — | 13 | 0 | 0.00% | 0 | 0 | — |
| Alfred | 0 | 0 | — | 87 | 6 | 6.90% | 1 | 1 | 100.00% |
| Edwin | 0 | 0 | — | 55 | 4 | 7.27% | 0 | 0 | — |
| Therasyn | 0 | 0 | — | 6 | 0 | 0.00% | 0 | 0 | — |
| Knut | 0 | 0 | — | 0 | 0 | — | 0 | 0 | — |
| Edwy | 0 | 0 | — | 0 | 0 | — | 0 | 0 | — |
| Wilfrid | 0 | 0 | — | 0 | 0 | — | 0 | 0 | — |
| Barg Labs site | 0 | 0 | — | 0 | 0 | — | 0 | 0 | — |
| Cejel site | 0 | 0 | — | 0 | 0 | — | 0 | 0 | — |
| **Stratum total** | **0** | **0** | **—** | **325** | **12** | **3.69%** | **1** | **1** | **100.00%** |

The pooled `13 / 326 = 3.99%` is included only as a portfolio summary. It must not replace
the separate stratum rates; in particular, A3's `1 / 1` cannot be treated as a stable
100% population rate.

## Structural extraction rules and the verbatim queries

The same repository manifest was used for every query. `GH_TOKEN` was supplied from the
operator's existing credential helper and was never written to a result file.

```bash
repos=(
  'BargLabs/cejel|/Users/bargs/projects/cejel'
  'BargStudio/egbert|/Users/bargs/projects/egbert'
  'houman44/site-machine|/Users/bargs/projects/site-machine'
  'BargLabs/alfred|/Users/bargs/projects/alfred'
  'houman44/edwin|/Users/bargs/projects/edwin'
  'BargStudio/therasyn|/Users/bargs/projects/therasyn'
  'houman44/knut|/Users/bargs/projects/knut'
  'BargLabs/edwy|/Users/bargs/projects/edwy'
  'BargLabs/wilfrid|/Users/bargs/projects/wilfrid'
  'houman44/barglabs-site|/Users/bargs/projects/barglabs-site'
  'BargLabs/cejel-site|/Users/bargs/projects/cejel-site'
)
```

### A1 — exact inverse patches

These commands were run for every manifest row. `git patch-id --stable` was applied to
the original first-parent patch stream and to the same stream with every patch reversed.
An A1 relationship required the same stable patch ID in opposite directions and required
the reverted commit to precede the reverting commit. Commit subjects and bodies were not
loaded.

```bash
for entry in "${repos[@]}"; do
  slug=${entry%%|*}
  repo=${entry#*|}
  git -C "$repo" log --first-parent --diff-merges=first-parent -p \
    --full-index --binary --format='commit %H' origin/main |
    git patch-id --stable
  git -C "$repo" log --first-parent --diff-merges=first-parent -p \
    --full-index --binary --format='commit %H' -R origin/main |
    git patch-id --stable
done
```

No equal forward/reverse pair was found: A1 yielded zero in all 11 repositories.

### A2 — PR check red-to-green transitions

The following GraphQL document was executed repeatedly with `after: null`, then with the
returned cursor until `hasNextPage` was false, for every `owner`/`name` in the manifest.
Each PR page contained 50 merged PRs and each PR contained its first 100 commits.

```bash
gh api graphql \
  -f owner="$owner" -f name="$name" -f after="$after" \
  -f query='query($owner:String!,$name:String!,$after:String) {
    repository(owner:$owner,name:$name) {
      defaultBranchRef { name target { ... on Commit { oid } } }
      pullRequests(first:50,after:$after,states:MERGED,
        orderBy:{field:CREATED_AT,direction:ASC}) {
        pageInfo { hasNextPage endCursor }
        totalCount
        nodes {
          number baseRefName mergedAt mergeCommit { oid }
          commits(first:100) {
            totalCount
            nodes { commit { oid committedDate statusCheckRollup { state } } }
          }
        }
      }
    }
  }'
```

On the first page the `-f after="$after"` argument was omitted, which supplies GraphQL
`null`; on later pages `after` was the preceding `endCursor`.

Two PRs exceeded 100 commits. Their last 100 commits were queried verbatim to close the
middle-page gap; the first/last windows overlap because their totals were 107 and 192.

```bash
gh api graphql \
  -f owner="$owner" -f name="$name" -F number="$number" \
  -f query='query($owner:String!,$name:String!,$number:Int!) {
    repository(owner:$owner,name:$name) {
      pullRequest(number:$number) {
        commits(last:100) {
          totalCount
          nodes { commit { oid committedDate statusCheckRollup { state } } }
        }
      }
    }
  }'
```

Within each merged PR targeting `main`, commits were ordered chronologically. A candidate
was emitted when `statusCheckRollup.state` was `FAILURE` or `ERROR` and the next later
distinct commit with a terminal green state was `SUCCESS`; the green commit SHA was the
fix anchor. Repeated transitions to the same fix SHA were deduplicated. `EXPECTED`,
`PENDING`, and missing rollups neither emitted a candidate nor counted as green.

### A2 — failed-deploy to successful-deploy transitions

Deployments were paged 100 at a time with this query for every repository:

```bash
gh api graphql \
  -f owner="$owner" -f name="$name" -f after="$after" \
  -f query='query($owner:String!,$name:String!,$after:String) {
    repository(owner:$owner,name:$name) {
      deployments(first:100,after:$after) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          databaseId commitOid createdAt environment
          latestStatus { state createdAt }
        }
      }
    }
  }'
```

As in the PR query, the first deployment page omitted the `after` field and subsequent
pages supplied the returned cursor.

Records were grouped by exact environment and sorted by status time. A `FAILURE` or
`ERROR` followed by a later distinct `SUCCESS` emitted a transition. The successful
deployment SHA was retained only when this REST query linked it to exactly one merged PR
whose base was the default branch:

```bash
gh api --method GET \
  -H 'Accept: application/vnd.github+json' \
  "/repos/$owner/$name/commits/$success_sha/pulls?per_page=100"
```

There were 30 raw failed-to-successful deployment transitions. Sixteen had no unique
merged-default-branch PR and were excluded before the candidate denominator. Check and
deployment anchors sharing a repository and fix SHA were deduplicated.

### A3 — inline review comment to later line-touch

All inline review comments were paged with the exact REST request below for every
repository:

```bash
page=1
while :; do
  response=$(gh api --method GET \
    -H 'Accept: application/vnd.github+json' \
    "/repos/$owner/$name/pulls/comments?sort=created&direction=asc&per_page=100&page=$page")
  printf '%s\n' "$response"
  [ "$(printf '%s\n' "$response" | jq 'length')" -lt 100 ] && break
  page=$((page + 1))
done
```

The merged-main PR and ordered commit list came from the A2 GraphQL result. For comments
with an original/comment commit, path, and original/current line, the referenced line was
tracked through later commits by reading zero-context hunks only:

```bash
git -C "$repo" diff --unified=0 "$sha^" "$sha" -- "$comment_path"
```

The first later commit whose old-side hunk interval intersected the tracked line was the
fix anchor. Added/deleted line counts shifted the tracked line for non-intersecting earlier
hunks. The selector used only PR membership, commit order, path, line, and diff hunks; it
did not inspect comment bodies. Two Alfred comments linked to the same later commit and
were deduplicated into one candidate.

## Qualification and mechanical oracle

For every structural anchor, the file list came from the anchored commit object. Source
and test files were separated by path/type rules. A candidate advanced only if the same
change touched at least one non-test source file and at least one test file. For a merge
anchor, the PR change was used; otherwise the commit's first-parent change was used.

Each applicable candidate was checked in an ephemeral local clone at the frozen tip:

```bash
git -C "$source_repo" diff --binary "$fix_sha^" "$fix_sha" -- "${source_files[@]}" |
  git -C "$ephemeral_clone" apply --reverse -
# If the direct apply failed, the only fallback attempted was:
git -C "$source_repo" diff --binary "$fix_sha^" "$fix_sha" -- "${source_files[@]}" |
  git -C "$ephemeral_clone" apply --reverse --3way -
```

Only source hunks were reversed; tests stayed at the frozen repaired state. Changed test
files were run before reversal, after reversal, and—for the deterministic 10-item audit
sample—after restoring the full fixed source. No patch was edited, no test was edited, and
no candidate was repaired by hand. Vitest used `--cache=false` because dependencies were
read-only symlinks. Pytest used `-p no:rerunfailures` because that optional plugin opens a
socket blocked by the sandbox. Neither setting changes product behavior or assertions.

The funnel reconciles exactly:

| Stage | A2 | A3 | Total |
|---|---:|---:|---:|
| Structural anchors | 325 | 1 | 326 |
| Failed condition 2 (not both source and test) | 280 | 0 | 280 |
| Source reverse patch did not apply at frozen tip | 3 | 0 | 3 |
| Changed tests not green with full fix (condition 4) | 6 | 0 | 6 |
| Reverse source patch did not fail a changed test (condition 3) | 21 | 0 | 21 |
| Red result rejected by strict defect/oracle adjudication | 3 | 0 | 3 |
| **Passed all four conditions** | **12** | **1** | **13** |

## Random mechanical audit of conditions 3 and 4

All 13 qualifiers were mechanically exercised. To satisfy the random-audit criterion
without hand-picking convenient examples, the reporting sample was fixed by sorting all
13 IDs on `SHA-256(seed + repo#pr@fixSHA)` and taking the first 10. The seed was
`strata-a-oracle-audit-2026-08-01-v1`; it was set before reading the ranks.

The exact selection command was:

```bash
node -e 'const fs=require("fs"),crypto=require("crypto"); const seed="strata-a-oracle-audit-2026-08-01-v1"; const excluded=new Set(["houman44/site-machine#304","houman44/site-machine#399","BargLabs/alfred#739"]); const xs=JSON.parse(fs.readFileSync("/tmp/strata-a-oracle.json","utf8")).candidates.filter(x=>x.condition3&&x.condition4&&!excluded.has(`${x.repo}#${x.pr}`)).map(x=>({id:`${x.repo}#${x.pr}@${x.fixSha}`,rank:crypto.createHash("sha256").update(seed+`${x.repo}#${x.pr}@${x.fixSha}`).digest("hex")})).sort((a,b)=>a.rank.localeCompare(b.rank)).slice(0,10); console.log(JSON.stringify({seed,sample:xs},null,2));'
```

Every sampled row completed this sequence mechanically: initial green; reverse source
hunks; named test red; restore full source fix; green again.

| Rank | Candidate | Named failing test after source reversal | C3 red | C4 green after full restore |
|---:|---|---|---:|---:|
| 1 | `BargLabs/alfred#628@904c2ad2e8dd313860b359775ea02b208cdf1461` | `does not treat SARIF scanner output as an unread source language` | yes | yes |
| 2 | `houman44/edwin#289@6974e35c9bd168a81e360d85b12d36b2c68dacc8` | `test_quant_hold_allocation_returns_policy_universe_and_drift` | yes | yes |
| 3 | `BargLabs/alfred#571@8a381574355fe58aad7ed7e4a6e60ad203d3dc54` | `persists the completed-action candidate in the studio schema under FORCE RLS` | yes | yes |
| 4 | `BargStudio/egbert#1407@aa20b4acfb4fac17577274bf2f612d0626500e72` | `test_reset_rejects_read_only_tenant_link` | yes | yes |
| 5 | `houman44/edwin#437@f88aba3ccbf182707225b35f00fcb33e1de71786` | `test_gross_adds_paid_financing_without_netting_financing_credits` | yes | yes |
| 6 | `houman44/edwin#410@b78a5d2cc54b75c794817b11765b84db205f2377` | `test_run_weekly_review_with_source_returns_real_proposal_count`; `test_run_weekly_review_trial_accounting_is_honest_when_no_pair_has_evidence` | yes | yes |
| 7 | `BargLabs/alfred#702@3acc157a722974c340ba4f30f510eb36b9361247` | `keeps a backend Algolia credential claim-bearing outside documentation search config` | yes | yes |
| 8 | `BargLabs/alfred#710@57475927ec5289e33c1fef0d2d6b49c8fa3177ac` | `keeps certificate coverage and capped-count semantics through public staging`; `keeps legacy numeric subscores when a custom rubric has no code/process buckets` | yes | yes |
| 9 | `BargLabs/alfred#591@5da4234ed184a667135228db4450577e593c1629` | `bounds diagnostics for overlong unknown keys and returns a complete invalid-input vector` | yes | yes |
| 10 | `BargLabs/alfred#460@2e2e2362675b3ab8d3a106438aef8e7736b02147` | `detects the scheduled-health-workflow shape under an unrelated filename (no vendor name defines the dimension)` | yes | yes |

## Qualifying catalog

Every fix anchor below is lowercase 40-hex. A final integrity pass ran
`git cat-file -e "$sha^{commit}"` in the corresponding repository for all 326 structural
anchors, not only these qualifiers: **326 / 326 resolved**. File lists are the complete
anchored-change file lists, including generated and documentation artifacts when the same
change touched them.

### 1. Egbert PR 1407 — A2, outside D1–D6

- Repository/PR: `BargStudio/egbert#1407`
- Fix: `aa20b4acfb4fac17577274bf2f612d0626500e72`
- Failed transition SHA: `eecf1134917c4b1eb5a3bdd20a5fa73255425bb5`
- Parent: `eb52a5ebc1539838a761ed5911168c61def8bb05`
- Defect: a read-only tenant link could reset a paper; authorization-scope defect.
- Oracle: `test_reset_rejects_read_only_tenant_link`
- Files: `egbert_core/api/routes/paper.py`; `egbert_core/tests/unit/test_paper_api_scope.py`.

### 2. Egbert PR 1456 — A2, D1

- Repository/PR: `BargStudio/egbert#1456`
- Fix: `34e1dcdde0c53aa2b147533bc735c5912c658d5f`
- Failed transition SHA and parent: `d6ec64936a60dc98320ebf8ac828ebfac1582e39`
- Defect: nested promotion/calibration configuration was declared but its nested fields
  were not read into the promotion gate.
- Oracle: `test_promoted_calibrated_nested_metrics_remain_active[CFDMLScorer]` (and the
  corresponding Crypto and Equities parameterizations).
- Files: `egbert_core/notes/ml_gate_failclosed_port_2026-07-12.md`;
  `egbert_core/strategies/cfd_ml_scorer.py`;
  `egbert_core/strategies/crypto_ml_scorer.py`;
  `egbert_core/strategies/equities_ml_scorer.py`;
  `egbert_core/tests/unit/test_ml_scorer_promotion_gate_failclosed.py`.

### 3. Alfred PR 460 — A2, outside D1–D6

- Repository/PR: `BargLabs/alfred#460`
- Fix: `2e2e2362675b3ab8d3a106438aef8e7736b02147`
- Failed transition SHA and parent: `bf6107dfe2d74df5af5a1d100fe08f6853f0fcf8`
- Defect: a vendor-specific evidence kind prevented structurally equivalent scheduled
  health workflow evidence from being recognized.
- Oracle: `detects the scheduled-health-workflow shape under an unrelated filename (no vendor name defines the dimension)`
- Files: `docs/leaderboard/reports/alfred.json`;
  `docs/leaderboard/reports/react.json`; `packages/api/src/storage/postgres-store.ts`;
  `packages/shared/src/schemas/witan.ts`;
  `packages/witan/src/__tests__/repo-signals.test.ts`;
  `packages/witan/src/__tests__/witan-report.test.ts`;
  `packages/witan/src/repo-signals.ts`.

### 4. Alfred PR 591 — A2, D1

- Repository/PR: `BargLabs/alfred#591`
- Fix: `5da4234ed184a667135228db4450577e593c1629`
- Failed transition SHA and parent: `e0bf0e599e57de71b832f20062d5116c04b5ad44`
- Defect: a declared schema maximum was not read/enforced before parsing diagnostic keys.
- Oracle: `bounds diagnostics for overlong unknown keys and returns a complete invalid-input vector`
- Files: `docs/CHANGELOG.md`; `packages/shared/src/schemas/index.ts`;
  `packages/shared/src/schemas/quant-evidence-contract-v1.ts`;
  `packages/witan/src/__tests__/quant-evidence-contract-v1-evaluator.test.ts`;
  `packages/witan/src/quant-evidence-contract-v1-evaluator.ts`.

### 5. Alfred PR 628 — A2, D6

- Repository/PR: `BargLabs/alfred#628`
- Fix: `904c2ad2e8dd313860b359775ea02b208cdf1461`
- Failed transition SHA and parent: `0be659b6d302fc7f1f69276d1a5ed2ee531fc85d`
- Defect: a SARIF scanner artifact was inferred to be unread source from a partial file view.
- Oracle: `does not treat SARIF scanner output as an unread source language`
- Files: `docs/CHANGELOG.md`;
  `docs/calibration/free-core-v33-remediation-2026-07-22.md`;
  `packages/witan/src/__tests__/free-core-v33-remediation.test.ts`;
  `packages/witan/src/repo-signals.ts`; `packages/witan/src/rubric-version.ts`;
  `scripts/build-public-cejel.mjs`.

### 6. Alfred PR 679 — A2, D6

- Repository/PR: `BargLabs/alfred#679`
- Fix: `1a9051f699368e5c52be4665c529c5af7fb6c18e`
- Failed transition SHA and parent: `4e8878314e6e545e50f58e8372bc698acb8e9111`
- Defect: explicit artifact families were inferred as source-shaped from a partial view.
- Oracle: `does not classify explicit artifact family database.sqlcipher3 as source-shaped`
  (10 artifact-family cases failed).
- Files: `docs/calibration/free-core-v43-representativeness-remediation-2026-07-23.md`;
  `packages/witan/src/__tests__/free-core-v43-representativeness-red.test.ts`;
  `packages/witan/src/repo-signals.ts`.

### 7. Alfred PR 702 — A2, D6

- Repository/PR: `BargLabs/alfred#702`
- Fix: `3acc157a722974c340ba4f30f510eb36b9361247`
- Failed transition SHA and parent: `853c70553cdd64438e90f2661cb4d926cd04f3dc`
- Defect: nearby documentation-search context was overgeneralized to suppress a backend
  credential claim.
- Oracle: `keeps a backend Algolia credential claim-bearing outside documentation search config`
- Files: `packages/witan/src/__tests__/free-core-v47-finding-integrity-red.test.ts`;
  `packages/witan/src/repo-signals.ts`.

### 8. Alfred PR 710 — A2, D4

- Repository/PR: `BargLabs/alfred#710`
- Fix: `57475927ec5289e33c1fef0d2d6b49c8fa3177ac`
- Failed transition SHA and parent: `2a6077355dea45ead65033007474ab77770347d1`
- Defect: absent category coverage was treated as measured zero, erasing legacy numeric
  subscores during public staging.
- Oracles: `keeps certificate coverage and capped-count semantics through public staging`;
  `keeps legacy numeric subscores when a custom rubric has no code/process buckets`.
- Files:
  `docs/CHANGELOG.md`; `docs/leaderboard/leaderboard.html`;
  `docs/leaderboard/leaderboard.md`;
  `docs/leaderboard/reports/alfred.html`; `docs/leaderboard/reports/alfred.json`;
  `docs/leaderboard/reports/alfred.md`;
  `docs/leaderboard/reports/automapper.html`; `docs/leaderboard/reports/automapper.md`;
  `docs/leaderboard/reports/axios.html`; `docs/leaderboard/reports/axios.md`;
  `docs/leaderboard/reports/biomejs.html`; `docs/leaderboard/reports/biomejs.md`;
  `docs/leaderboard/reports/carddemo.html`;
  `docs/leaderboard/reports/cejel.html`; `docs/leaderboard/reports/cejel.md`;
  `docs/leaderboard/reports/cobra.html`; `docs/leaderboard/reports/cobra.md`;
  `docs/leaderboard/reports/django.html`; `docs/leaderboard/reports/django.md`;
  `docs/leaderboard/reports/esbuild.html`; `docs/leaderboard/reports/esbuild.md`;
  `docs/leaderboard/reports/express.html`; `docs/leaderboard/reports/express.md`;
  `docs/leaderboard/reports/fastapi.html`; `docs/leaderboard/reports/fastapi.md`;
  `docs/leaderboard/reports/flask.html`; `docs/leaderboard/reports/flask.md`;
  `docs/leaderboard/reports/fmt.html`; `docs/leaderboard/reports/fmt.md`;
  `docs/leaderboard/reports/guava.html`; `docs/leaderboard/reports/guava.md`;
  `docs/leaderboard/reports/pydantic.html`; `docs/leaderboard/reports/pydantic.md`;
  `docs/leaderboard/reports/react.html`; `docs/leaderboard/reports/react.md`;
  `docs/leaderboard/reports/requests.html`; `docs/leaderboard/reports/requests.md`;
  `docs/leaderboard/reports/ripgrep.html`; `docs/leaderboard/reports/ripgrep.md`;
  `docs/leaderboard/reports/scorecard.html`; `docs/leaderboard/reports/scorecard.md`;
  `docs/leaderboard/reports/sinatra.html`; `docs/leaderboard/reports/sinatra.md`;
  `docs/leaderboard/reports/svelte.html`; `docs/leaderboard/reports/svelte.md`;
  `docs/leaderboard/reports/vite.html`; `docs/leaderboard/reports/vite.md`;
  `docs/leaderboard/reports/vue.html`; `docs/leaderboard/reports/vue.md`;
  `docs/leaderboard/reports/zod.html`; `docs/leaderboard/reports/zod.md`;
  `packages/witan-cli/src/__tests__/public-repo-extraction.test.ts`;
  `packages/witan/src/__tests__/html.test.ts`; `packages/witan/src/html.ts`;
  `scripts/lib/stage-public-leaderboard.mjs`.

### 9. Alfred PR 571 — A3, D2

- Repository/PR: `BargLabs/alfred#571`
- Fix: `8a381574355fe58aad7ed7e4a6e60ad203d3dc54`
- Review/comment commit: `606674b1051cd97e3eb8497e6ed9075663cac55f`
- Review comment IDs: `3626693095`, `3626827928`
- Defect: a caught database error silently discarded a completed-action candidate under
  schema isolation and FORCE RLS.
- Oracle: `persists the completed-action candidate in the studio schema under FORCE RLS`
- Files: `packages/api/src/mcp/tools/attempt-tactical-action.test.ts`;
  `packages/api/src/mcp/tools/attempt-tactical-action.ts`.

### 10. Edwin PR 217 — A2, outside D1–D6

- Repository/PR: `houman44/edwin#217`
- Fix: `c3c43cd47ae9f82a581f6f06ebf4aac8c36320ed`
- Failed transition SHA and parent: `4f2e51b79d560da1eed3bd2522b79bb129590bf9`
- Defect: the preflight classified a touched non-unit backend test into the wrong CI lane.
- Oracle: `test_backend_nonunit_test_file_diff_defers_to_full_ci`
- Files: `egbert_core/tests/unit/scripts/test_edwin_coord_preflight.py`;
  `scripts/edwin_coord_preflight.sh`.

### 11. Edwin PR 289 — A2, D4

- Repository/PR: `houman44/edwin#289`
- Fix: `6974e35c9bd168a81e360d85b12d36b2c68dacc8`
- Failed transition SHA and parent: `412bb51d65f951bbaadb287ede5db407afe7d1a9`
- Defect: absent drift (`None`) was conflated with a real measured value.
- Oracle: `test_quant_hold_allocation_returns_policy_universe_and_drift`
- Files: `egbert_core/api/routes/quant.py`;
  `egbert_core/tests/unit/test_quant_contracts.py`.

### 12. Edwin PR 410 — A2, outside D1–D6

- Repository/PR: `houman44/edwin#410`
- Fix: `b78a5d2cc54b75c794817b11765b84db205f2377`
- Failed transition SHA and parent: `f8a9ce3e5899272a4eee5755809accb3bc30e7dd`
- Defect: trial accounting presented a least-favorable-null bound as an estimate and did
  not preserve honest no-evidence framing.
- Oracles: `test_run_weekly_review_with_source_returns_real_proposal_count`;
  `test_run_weekly_review_trial_accounting_is_honest_when_no_pair_has_evidence`.
- Files: `egbert_core/edred/strategy_arm.py`; `egbert_core/edred/trial_ledger.py`;
  `egbert_core/tests/unit/test_edred_proposal_gen.py`;
  `egbert_core/tests/unit/test_edred_v3_hypothesis_engine.py`.

### 13. Edwin PR 437 — A2, D3

- Repository/PR: `houman44/edwin#437`
- Fix: `f88aba3ccbf182707225b35f00fcb33e1de71786`
- Failed transition SHA and parent: `d2274cea077786ae0019a446a0fc55fec7970eb0`
- Defect: financing credits were netted into paid financing before aggregation, so the
  set transform did not preserve the asserted gross-paid invariant.
- Oracle: `test_gross_adds_paid_financing_without_netting_financing_credits`
- Files: `egbert_core/scripts/report_ledger_gross_alpha_decomposition.py`;
  `egbert_core/tests/unit/scripts/test_report_ledger_gross_alpha_decomposition.py`.

## ADR-0013 D-series distribution

Classification used the ADR-0013 semantic taxonomy, not filename or language heuristics.
Qualifiers that do not honestly fit D1–D6 remain outside the taxonomy rather than being
forced into a class.

| Class | Meaning | Qualifiers | n | Can carry its own n >= 10 denominator? |
|---|---|---|---:|---:|
| D1 | Declared-but-unread config | Egbert 1456; Alfred 591 | 2 | **No** |
| D2 | Swallowed error | Alfred 571 | 1 | **No** |
| D3 | Unasserted set transform | Edwin 437 | 1 | **No** |
| D4 | Pass-by-absence | Alfred 710; Edwin 289 | 2 | **No** |
| D5 | Self-referential verification | — | 0 | **No** |
| D6 | Partial-view inference | Alfred 628, 679, 702 | 3 | **No** |
| Outside D1–D6 | Other real defects | Egbert 1407; Alfred 460; Edwin 217, 410 | 4 | **No** |
| **Total** | — | — | **13** | **No class reaches 10** |

The largest in-taxonomy class is D6 at n=3. Consequently, this extraction cannot support
an honest per-class result denominator for any D-series class, even though the pooled set
can support exploratory work.

## Exclusions and coverage limits

Nothing was silently truncated. The major exclusions were:

1. **A1:** no exact stable inverse-patch pairs existed on any frozen first-parent main
   history. This is a zero result, not a skipped query.
2. **A2 deployments:** 16 of 30 raw failure-to-success transitions did not link to exactly
   one merged default-branch PR. They were excluded before the candidate denominator.
3. **A2 long PRs:** Egbert PR 854 (107 commits) and Site Machine PR 212 (192 commits) were
   closed with overlapping `first:100`/`last:100` queries. This added anchors
   `3de56717556470b4f9933f525d4944c86d3e18dc`,
   `5f4ca4f3a4f91db77948a658299cf28b755b2a79`, and
   `613d40a622b1146f56555b3defc475fb96d4fd73`. The first did not touch both source and
   tests; the second's source reverse patch did not apply to the frozen tip; the third did
   not touch a test. None qualified.
4. **A3:** Alfred supplied all 24 inline comments in the portfolio. Eight comments could
   not be placed on the final ordered/rebased PR commit history, 14 had no later intersecting
   line touch, and two linked to the same qualifying commit. Other repositories returned
   zero inline comments. This makes A3 metadata capture, not oracle precision, its binding
   limitation.
5. **Condition 2:** 280 A2 anchors did not touch both non-test source and tests in the same
   anchored change.
6. **Patch applicability:** three A2 source reversals did not apply to the frozen `main`
   tip, even with `--3way`. They were dropped; no manual conflict resolution was allowed.
7. **Clean controls:** six applicable A2 candidates' changed tests did not pass on the
   frozen fully fixed tip, so condition 4 failed before seeding.
8. **No red oracle:** 21 A2 candidates had green clean controls but reversing source hunks
   did not make a changed test fail.
9. **Strict defect/oracle adjudication:** Site Machine PR 304
   (`5d4785208162e44bf529b1c7e30844686eefcd54`) and PR 399
   (`1e4106f131f9af27a9a314a0dbb2ecc35c09b441`) were features/release guards, not defect
   fixes, so condition 1 failed. Alfred PR 739
   (`f376cf64d560faf5a970cff1bf5c836e1d4fee40`) produced only a suite-setup failure with
   all 41 tests skipped after reversal; no named test failed, so strict condition 3 failed.

Squash/rebase commit objects missing from local clones were fetched by exact SHA before
file classification. This recovered 153 unique commit objects (131 Egbert, 2 Alfred, 19
Edwin, 1 Therasyn). No candidate was discarded merely because its PR commit was not
reachable from the current local branch.

Extracted diffs were processed in memory and were not included in this report. Test output
was passed through credential-shape redaction for GitHub tokens, API keys, AWS access keys,
JWTs, bearer tokens, and common `token`/`secret`/`password` assignments. This task did not
seed the existing harness and did not modify the dual-control preregistration, result, or
errata.

## Reachability conclusion

The existing-history ceiling is **13**, not 200. A1 contributes no supply. A3 contributes
one example and cannot scale without substantially denser inline-review metadata. A2 is
the only material source, but converts at `12 / 325 = 3.69%`. Holding that rate fixed,
`187 / (12 / 325) = 5,064.6`, rounded up to **5,065**, additional A2 anchors are required
to reach a pooled 200.

Across the approximately 5.3-month portfolio window from the earliest frozen history
(2026-02-21) to this measurement (2026-08-01), 13 qualifiers arrived, about 2.5 per month.
That implies roughly 76 more months for 187 additional qualifiers: late 2032, plausibly
slipping into early 2033 under the A2-only calculation. The uncertainty is much larger
than the calendar precision suggests. The decision-relevant conclusion is simpler:
**n >= 200 is not a near-term reachable denominator under the current structural strata.**
