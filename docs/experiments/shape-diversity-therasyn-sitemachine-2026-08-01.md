# Shape diversity: Therasyn and site-machine — 2026-08-01

Status: complete; additive measurement; frozen inventory unchanged at 18

Preregistration: `0cf9170` (`docs: preregister repository shape-diversity study`)

## Result first: yield is defect density × replayability

**Therasyn's B2-shaped share `1 / 2 = 50%` is the leading result.** The denominator is the two real
defect subcommits exposed by its off-default history: one needed the live Vercel build environment
and one had a credential-free local k6 oracle. Both subcommits belong to merged PR #243, whose whole-PR
anchor was already measured, so they are shape evidence and **not new inventory members**.
Site-machine has no honest B2 percentage: its newly reachable candidates contain zero real defects
after causal adjudication (`0 / 0`, not 0%).

For any fixed structural-candidate channel, the replacement model is:

`qualifying-defect yield rate = defect density × replayability`

The terms are operational rather than labels:

- `defect density = causally adjudicated real defects / structural candidates`; and
- `replayability = mechanically replayable real defects / causally adjudicated real defects`.

Their product is the mechanically qualifying defects divided by structural candidates. It is
reported within a selection channel, not pooled across unlike A and B candidate denominators. When
the real-defect denominator is zero, replayability is not estimable even though the yield rate is
zero.

The original hypothesis attributed Alfred's yield to co-located tests and atomic fixes. Site-machine
falsifies that account: `87 / 96 = 90.6%` of its merged PRs touch source and tests together and
`87 / 96 = 90.6%` are single-commit PRs—the ideal shape under that hypothesis—yet it produced zero
new qualifying defects. The preregistered candidate-level atomic-fix proxy points the same way:
site-machine is `5 / 13 = 38.5%`, above Alfred's `19 / 87 = 21.8%`. Layout and atomicity measures do
not predict yield by themselves. Site-machine's observed defect density is zero in the measured
candidate population: the selected changes are small features, cross-PR artifacts, or noncausal
workflow changes rather than real fixes. Its co-located tests, single-commit changes, and local named
CI job make strong replayability plausible, but with zero real defects its replayability rate is not
estimable; “excellent replayability” is a repository-shape inference, not a measured result.

The portfolio is coherent under the replacement model, with repository assignments stated as the
interpretation rather than as separately identified coefficients. Egbert is the high-defect-density,
poor-replayability case because market data, time, and external state make failures hard to
reconstruct. Alfred has both terms and therefore yields. Therasyn's 50% B2-shaped rate—one locally
replayable defect and one external-state-bound defect—directly supports treating replayability as a
separate term, but the `n = 2` result does not establish statistical independence from defect
density. Co-located tests, atomic commits, and similar shape measures were only ever proxies for
replayability, the second term; they cannot supply the first.

**The frozen 18 are therefore not representative of customer repositories in general. They are
representative of a narrower population: merged, patch-applicable defects with structured red-to-
green metadata, causally coupled tests, and an oracle that runs without live external state.** That
population is common in Alfred/Edwin-style code paths. It is not the same thing as “TypeScript
monorepo,” “tests beside source,” or “mostly atomic PRs.”

**New qualifying defects: 0.** The prediction was one mechanical qualifier (range 0–2) and one B2
catalog defect (range 0–3). Both point predictions missed low after enforcing prior-PR provenance.
The Therasyn B2-shape prediction (point 55%, range 35–75%) contained the observed 50%; site-machine's
predicted percentage was not estimable because the real-defect denominator was zero.

The preservation finding is larger than the yield: **14 commits existed only in local branch
history and now have remote copies.** Additional uncommitted work remains in both repositories and
was deliberately left untouched.

## Frozen boundary and scope

Remote symbolic `HEAD` still resolves to `main` at the exact prior frozen tips:

| Repository | Remote `HEAD` / prior frozen tip | Tip date |
|---|---|---|
| `BargStudio/therasyn` | `39f228590c2b2ecb47ddb420709d15c9271ad65a` | 2026-07-04 16:53:50 -07:00 |
| `houman44/site-machine` | `1e4106f131f9af27a9a314a0dbb2ecc35c09b441` | 2026-07-04 16:42:10 -07:00 |

The standing-constraints file was not missing or unavailable. It exists at
`/Users/bargs/projects/lab_notes/_studio/Standing_Constraints_2026-08-01.md`; it was outside the
Cejel repository boundary and therefore unreachable from the worktree-scoped search. The supplied
goal brief controlled the run, as recorded before extraction in the preregistration. “Unreachable
from the Cejel worktree” is the scoped result; the earlier description of the file as absent is
retracted.

“Absent” below means `git rev-list --count origin/main..<remote branch>` after fetching and pruning
all heads. Per-branch counts overlap; the union counts later in this section deduplicate full SHAs.
“Newest absent” is the newest committer timestamp among commits absent from default, not branch-ref
creation time.

## Complete remote branch census

### `BargStudio/therasyn`

Twelve remote branches were enumerated. Eight carry commits absent from `main`; their union contains
36 unique commits. No absent commit is newer than 2026-06-22.

| Remote branch | Tip | Absent | Newest absent |
|---|---|---:|---|
| `codex/exe-002-multitenancy-hardening` | `105aef93eb180f07ffc0f63f0e89e655fb33c6b0` | 6 | 2026-05-21 16:36:43 -07:00 |
| `codex/maintenance-mode-prep-2026-07-04` | `0771eda2f0490f5ad7555a7aa4f7c75b25116d8d` | 0 | — |
| `codex/observability-config-monitoring` | `a053b5ecf9408f3d7bf8d6fd2429a57b41bf00db` | 1 | 2026-03-02 09:52:53 -08:00 |
| `codex/org-canonical-refs-2026-06-14` | `fdfa927d00f304ff3d5f67e1574e4838125dd48e` | 1 | 2026-06-14 00:15:17 -07:00 |
| `codex/terraform-gate-before-deploy` | `6b4db94b55aa5490c738f15a95186c8c74e168b7` | 1 | 2026-03-02 11:41:00 -08:00 |
| `ecs-auth-cookie-domain` | `8212dbd7156118081ea11cbfdbea97fba0d3daf4` | 1 | 2026-06-22 01:55:07 -07:00 |
| `feat/agent-platform-pivot` | `bf4b799bd4b05a4e9bef8c3cc6ab3533ba2ae246` | 0 | — |
| `feat/phase-0-engineering` | `9f497be779405b027148bc318e6df1ca6ee86d80` | 21 | 2026-06-02 19:31:35 -07:00 |
| `feat/signoff-approval-surface` | `1e2094f01eb717d988d92395eef348b9f51b9bd8` | 4 | 2026-06-02 22:30:28 +00:00 |
| `feat/vercel-preview-deployments` | `ad8d1b612a046da1a9e0745f80ee815a498e6695` | 0 | — |
| `main` | `39f228590c2b2ecb47ddb420709d15c9271ad65a` | 0 | — |
| `pre-homecare-delta` | `640a790eb7c6d26a6f58982afc982cf482dcd711` | 1 | 2026-05-18 19:29:30 -07:00 |

### `houman44/site-machine`

Fifteen remote branches were enumerated. Eleven carry commits absent from `main`; their union
contains 32 unique commits. The newest is the already-remote technical-ownership handoff from
2026-07-18.

| Remote branch | Tip | Absent | Newest absent |
|---|---|---:|---|
| `codex/fix-staging-proof-smoke-env` | `6410cb2866b40e21e8a5c7d40f4500bf63973226` | 2 | 2026-06-16 12:47:36 -07:00 |
| `codex/maintenance-mode-prep` | `016e70a038c610324211722417eb3eda858bec97` | 0 | — |
| `codex/mvp-closeout-runbook` | `aaceb13e92da4b7189ab6046f1fa4f09f0790db8` | 1 | 2026-06-16 12:24:21 -07:00 |
| `codex/replicate-auth-header` | `39d6f08e3aee76fd562b1faefb178cd84384e051` | 4 | 2026-05-20 16:07:48 -07:00 |
| `codex/schema-drift-audit` | `a25070c7cdfe9cdbfd6dcd26fd7a66509943632d` | 1 | 2026-06-18 07:36:23 -07:00 |
| `codex/staging-reanchor-refresh` | `38934a56b4a75395f485e9b50289a90a4bca4eac` | 1 | 2026-06-16 12:15:00 -07:00 |
| `codex/technical-ownership-handoff` | `6f443d1a8d55e476a2d5290e448e543e9b6dbcc7` | 1 | 2026-07-18 09:29:54 -07:00 |
| `feat/cross-language-brief` | `0c88ff7f7ded918ff741f61b3356ef70ef036c31` | 0 | — |
| `main` | `1e4106f131f9af27a9a314a0dbb2ecc35c09b441` | 0 | — |
| `preservation/sprint-26-training-data-local-2026-08-01` | `872bf0221be5190310402cc100d332886258c0f8` | 9 | 2026-05-25 14:02:11 -07:00 |
| `snapshot/2026-06-15-mvp-m8-drift` | `9d850f3e8ec6ea19af94a2d21a2d542dca77e865` | 1 | 2026-06-16 10:53:00 -07:00 |
| `snapshot/2026-06-16-post-pr3-m8-score-skeleton` | `86a8c6a1f0a29264e63222f47189e1677d7eaee6` | 2 | 2026-06-16 11:37:39 -07:00 |
| `snapshot/2026-06-18-m8-rtl` | `0096ea96b99ec91f8ed4d204d53615e6310c818a` | 1 | 2026-06-19 18:27:52 -07:00 |
| `sprint-26-training-data` | `a22ff6e240a7f85f8aa710d7a1ff8114d3d3d867` | 9 | 2026-05-25 14:02:11 -07:00 |
| `staging` | `84e79593271e0758bd19ef8b348f05f0bfbb170a` | 0 | — |

## Recent-work and preservation finding

The operator's report was correct, but “recent work” spans three different states:

1. **Already-remote, unmerged history.** Therasyn has 35 unique commits that were already on a
   remote off-default branch before preservation; site-machine has 19. The newest site-machine
   item is 2026-07-18. Therasyn's newest already-remote item is 2026-06-14; its newer 2026-06-22
   commit was the local-only branch preserved in the next item.
2. **Previously local-only commits, now preserved remotely.** Before candidate extraction, the
   required preservation check found 14 unique commits:
   - Therasyn `ecs-auth-cookie-domain`: one commit, pushed under the same remote ref.
   - site-machine's three `snapshot/...` branches: four commits total, pushed under the same refs.
   - site-machine local `sprint-26-training-data`: nine commits. A same-named remote branch already
     existed with a divergent 9/9 history, so a non-fast-forward overwrite was refused. The local
     history was pushed without rewriting the existing branch as
     `preservation/sprint-26-training-data-local-2026-08-01`.
3. **Uncommitted local-only work, untouched.** Therasyn's main checkout has modified README and
   deployment docs, generated TypeScript build info, two deleted competitor-watch files, three
   staged documentation renames, and an untracked design/architecture roadmap. Surviving file mtimes
   run through 2026-06-23. Site-machine's `codex/deploy-dream-canvas` worktree has staged uncommitted
   `.audit-architecture.md` (mtime 2026-06-15). Uncommitted content did not enter the corpus and was
   neither changed nor committed.

After preservation, no local commit in either repository remained unreachable from every remote
ref. The uncommitted work remains a preservation risk outside Git history.

## Structural funnel on newly reachable history

The union contained 68 commits: 36 Therasyn and 32 site-machine. Selection used no message, title,
body, label, comment text, or other natural-language token. Configuration diffs were scrubbed in
memory before inspection; raw diffs and credential-shaped values were not retained.

| Stage | Therasyn | site-machine | Disposition |
|---|---:|---:|---|
| Unique commits absent from default | 36 | 32 | measured |
| A1 exact inverse-patch anchors | 0 | 0 | none |
| A2 check red→green anchors | 2 | 3 | Therasyn: neither passes source+test; site: two pass file gate |
| A2 deployment transitions | 8 / 4 fix SHAs | 0 | one Therasyn fix passes source+test |
| Atomic-fix proxy within off-default A2 | 1 / 6 (16.7%) | 2 / 3 (66.7%) | one-commit source+test anchor / deduplicated A2 fix anchors |
| A3 structured comments on new history | 0 | 0 | none |
| Exact per-commit B named transitions | 3 | 1 | causal/provenance adjudication below |
| New mechanical qualifier | **0** | **0** | frozen 18 unchanged |
| New B2 catalog entry | **0** | **0** | frozen 18 unchanged |

The target-only off-default atomic-fix proxy uses exactly the preregistered structural denominator.
Therasyn has two check anchors plus four unique deployment fix SHAs; one is a non-merge anchor touching
source and tests, so the result is `1 / 6 = 16.7%`. Site-machine has three check anchors, two of which
are non-merge source-plus-test anchors, so the result is `2 / 3 = 66.7%`. These rates are reported
separately from the common frozen-default baseline below rather than silently mixing populations.

### Why the candidates did not qualify

- Site-machine `b0d2212dd1524a595a44252cbf957f2d3bbdffcf` touches source and tests, but it is a feature bundle
  from already-measured merged PR #25. The off-default branch scan paired statuses across a PR
  boundary; the unchanged A2 rule does not.
- Site-machine `a22ff6e240a7f85f8aa710d7a1ff8114d3d3d867` touches source and tests but adds a training-data
  feature. It is not a defect fix.
- Site-machine `39d6f08e3aee76fd562b1faefb178cd84384e051` has no changed test.
- Site-machine `934a122672be60bb9918b9e8f7c3443dfc59e87f` changes dependency installation in the staging
  workflow, while its selected `Typecheck, Lint, Test, Build` transition belongs to a different job;
  the patch is not causally responsible for the selected transition.
- Therasyn's two A2 check anchors fail the source-plus-test gate.
- Therasyn `1fa3346d3504b057f66633071f23bc5a6d4d847b` passes the source-plus-test file gate for a
  deployment transition, but it introduces a large product-engineering-plane feature and its test
  suite. Reversing a feature under its newly added tests is not a defect replay.
- Therasyn `8e73ffa41f8610dba866f2cdc29da811426b3c20` and
  `9f497be779405b027148bc318e6df1ca6ee86d80` are real configuration defects, but both are commits in
  merged PR #243. The prior B run already represented that PR as merge anchor
  `25e711d1b5400f22e3d7b4ed0243609681bc5a5d` and recorded a frozen-tip patch conflict. Re-anchoring
  individual PR commits would change the preregistered unit and relax the bar.

Direct repository/fix-SHA comparison found no overlap between a valid new qualifier and the frozen
18 because there is no valid new qualifier. The stricter prior-PR provenance check prevented two
already-measured PR subcommits from being presented as novel.

## Shape-only defect evidence from PR #243 — not inventory additions

These two subcommits explain Therasyn's 50% B2-shaped share. They do not change the corpus.

### B1-shaped: paced rate-limit smoke test

| Field | Evidence |
|---|---|
| Repository / fix | `BargStudio/therasyn` / `9f497be779405b027148bc318e6df1ca6ee86d80` |
| Parent | `9142c2dd9badf32fab072d8b25caf7c4aa977058` |
| Prior unit | PR #243, merge anchor `25e711d1b5400f22e3d7b4ed0243609681bc5a5d` |
| Named job | `Perf Smoke (k6)` |
| Safe oracle | workflow-pinned k6 0.49.0 against disposable localhost Postgres, Redis, and API; 60 seconds |
| Fixed | exit 0 at 1 VU with pacing |
| Reversed | exit 99 at the restored 10 VUs with no pacing |
| Restored | exit 0 at 1 VU with pacing |
| Primary class | D7 — load was hand-set above the guarded API's checked-in rate limit |

Only `.github/workflows/ci.yml` and its directly referenced `scripts/perf/smoke-test.js` were
reversed. Redis state was flushed between controls. No production credential or live service was
used, and no file was hand-edited: the command/threshold changes came only from exact reversal and
restoration of the candidate. The oracle clone was clean after restoration.

### B2-shaped: Vercel workspace filter

| Field | Evidence |
|---|---|
| Repository / fix | `BargStudio/therasyn` / `8e73ffa41f8610dba866f2cdc29da811426b3c20` |
| Parent | `054464151fabf8523a467be64a4d041bc64566b8` |
| Prior unit | PR #243, merge anchor `25e711d1b5400f22e3d7b4ed0243609681bc5a5d` |
| Named jobs | `Vercel – therasyn`; `Vercel – therasyn-web-dashboard` |
| Defect | build scripts and `vercel.json` select stale/nonexistent workspace names instead of `therasyn-web-dashboard` |
| Reverse applicability | the scrubbed eligible configuration patch reverses cleanly at the branch tip |
| Binding oracle dependency | Vercel's build/output validation and project environment |
| Primary class | D7 — workspace scope is hand-typed rather than derived from the package graph |

The checked-in local commands contain no fail-on-no-match/output assertion that reproduces the
provider's red status. Adding one would alter command semantics. The honest existing oracle is
therefore B2, not a failed B1 setup.

## Seven-repository shape table

The supplied brief asks for seven rows while its five-row baseline already includes Therasyn. The
preregistration resolved the set as the five non-target comparison repositories in the prior Strata
manifest—Cejel, Egbert, Alfred, Edwin, and Knut—plus the two targets.

PR metrics use the original Strata extraction population cutoff
`2026-08-01T08:00:44.894Z`. Complete paginated file lists were used. Primary language is the largest
non-vendored tracked source-byte total at the frozen tip. “Single-commit PRs” is the all-merged-PR
shape measure; it is not called fix atomicity.

“Atomic-fix proxy” restores the preregistered denominator from the frozen-default Strata A A2
population: the numerator is a non-merge fix anchor touching both source and tests in that one
commit, and the denominator is all structurally selected red-to-green A2 candidates after the same
fix-SHA deduplication. The target-only off-default form of the same proxy is reported in the funnel
above. B2 share uses the preregistered real-defect denominator: B2 divided by replayable A + B1 + B2.

| Repository | Primary language | Test framework(s) | Source+test PRs | Median commits / PR | Single-commit PRs | Atomic-fix proxy | Named CI oracle | B2-shaped real defects |
|---|---|---|---:|---:|---:|---:|---|---:|
| Cejel | TypeScript | Vitest | 25 / 53 (47.2%) | 1 | 31 / 53 (58.5%) | 0 / 1 (0%) | `build-test` | 1 / 1 (100%)* |
| Egbert | Python (mixed TS) | pytest; Playwright | 490 / 823 (59.5%) | 1 | 479 / 823 (58.2%) | 12 / 163 (7.4%) | `CI Fast passed`; `CI Full passed` | 2 / 5 (40.0%)* |
| **site-machine** | TypeScript | Vitest | **87 / 96 (90.6%)** | **1** | **87 / 96 (90.6%)** | **5 / 13 (38.5%)** | `Typecheck, Test & Build` | **0 / 0 (not estimable)** |
| Alfred | TypeScript | Vitest | 375 / 664 (56.5%) | 1 | 448 / 664 (67.5%) | 19 / 87 (21.8%) | `Test (affected)` | 0 / 8 (0%) |
| Edwin | Python (mixed TS) | pytest; Playwright | 285 / 417 (68.3%) | 1 | 248 / 417 (59.5%) | 6 / 55 (10.9%) | `Test evidence` | 2 / 6 (33.3%)* |
| **Therasyn** | Python / TypeScript | pytest; Jest; Playwright; Vitest | **40 / 56 (71.4%)** | **1** | **49 / 56 (87.5%)** | **2 / 6 (33.3%)** | `Test (Backend)`; `Perf Smoke (k6)` | **1 / 2 (50.0%)*†** |
| Knut | Python | pytest | 0 / 0 (—) | — | 0 / 0 (—) | 0 / 0 (not estimable) | `lint-and-test` | 0 / 0 (not estimable) |

`*` Denominator below ten; descriptive only. `†` The two Therasyn defects are shape-only subcommit
evidence from already-measured PR #243, not additions to the frozen inventory.

All seven repositories define a named CI test/check job. Named-job existence therefore does not
separate high-yield from low-yield repositories. Nor do source/test co-location, primary language,
single-commit PR share, or the preregistered atomic-fix proxy: site-machine exceeds Alfred on all
three change-shape measures and still yields zero real branch-only defects. Replayability remains the
second required term, but it is estimable only after a real defect exists: reversing the fix at the
admissible unit must make the repaired test/job fail without depending on a provider, market/data
feed, production secret, hosted database, or rewritten historical state.

## Representativeness conclusion

The frozen 18 support claims about the catchable fraction only for **Alfred/Edwin-shaped defect
events**, not for an arbitrary customer repository:

- the fix is retained on the measured default/PR unit;
- the patch still applies at the evaluation tip;
- source and a causal test move together;
- structured CI/deployment metadata exposes the transition; and
- the oracle runs locally without live external state.

Therasyn demonstrates the commercial risk directly: half of its two real off-default defect
subcommits are B2-shaped, and rewritten PR topology makes both look branch-new even though the prior
study already measured their enclosing PR. Site-machine demonstrates a different failure mode:
extremely high source/test co-location and atomicity still produce zero real branch-only defects at
the qualification bar because the selected transitions are features, cross-PR artifacts, or
noncausal workflow changes.

Therefore the 18 should not be described as a representative studio or customer sample. They are a
useful but selection-conditioned corpus of locally replayable, repo-anchored defects. Customer
transfer should be reported with repository-shape strata—especially B2-shaped share, patch-history
topology, and causal-test availability—rather than one pooled interval.

## Reproduction notes

Branch enumeration used the remote refs directly after preservation:

```sh
git fetch --prune origin '+refs/heads/*:refs/remotes/origin/*'
git ls-remote --symref origin HEAD
git ls-remote --heads origin
git rev-list --count origin/main..origin/<branch>
```

Merged PR shape was queried through GitHub's structured API with commit totals and complete changed-
file pagination, then bounded to the original extraction timestamp. Off-default checks used
`statusCheckRollup` plus named check contexts. A1 used stable forward/reverse patch IDs; deployments
were grouped by exact environment; A3 loaded only structured comment path/line metadata and found no
comments on the new history.

The atomic-fix numerators were recomputed from the frozen Strata A A2 candidate records after the
same fix-SHA deduplication, counting records with `isMerge = false`, `hasSource = true`, and
`hasTest = true`. Their denominators are the per-repository A2 structural-anchor counts in
`strata-a-yield-2026-08-01.md`. The off-default target-only proxy applies the identical predicate to
the two check-anchor sets and the deduplicated deployment fix SHAs reported in the structural funnel.
No result-stage prose or defect adjudication enters either proxy.

All diff inspection passed through the prior Stratum B complete-value scrubber before output.
Credential helper material stayed in memory and was never printed or written. Raw diffs and raw job
output are not part of this artifact.
