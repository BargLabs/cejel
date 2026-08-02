# Therasyn and site-machine shape-diversity preregistration — 2026-08-01

Status: frozen before remote-branch enumeration, candidate extraction, or shape measurement

## Post-run scope erratum — 2026-08-01

The pre-run scope statement below records the worktree-scoped search and remains unchanged as part
of the frozen record. It must not be read as a global absence claim. The standing-constraints file
exists at `/Users/bargs/projects/lab_notes/_studio/Standing_Constraints_2026-08-01.md`; it was
outside the Cejel repository boundary and therefore unreachable from that worktree-scoped search.
This erratum narrows the claim's scope without changing any frozen method, prediction, or outcome.

## Question and reporting priority

This additive study asks whether the frozen inventory of 18 replayable defects represents
repositories whose engineering shape differs from Alfred. It measures all remote-reachable history
in `BargStudio/therasyn` and `houman44/site-machine`, including commits outside the default branch.
The primary result is repository shape and the share of candidates whose honest replay needs live
external state (B2 shape). Qualifying-defect yield is secondary and a zero is a valid result.

The requested `lab_notes/_studio/Standing_Constraints_2026-08-01.md` was not present in the Cejel
checkout, any Cejel ref, or the accessible project tree before this preregistration. The supplied
goal brief's constraints therefore control this run. This absence will not be silently treated as
evidence about the repositories.

## Frozen pre-existing boundary

The prior default-branch measurements ended at:

| Repository | Prior frozen default tip |
|---|---|
| `BargStudio/therasyn` | `39f228590c2b2ecb47ddb420709d15c9271ad65a` |
| `houman44/site-machine` | `1e4106f131f9af27a9a314a0dbb2ecc35c09b441` |

The frozen inventory remains 18 and will not be edited. A defect is new only when its canonical
repository and full fix SHA do not match an existing inventory member. This run will not modify a
prior strata artifact or preregistration.

Before candidate extraction, a preservation-only check found local commits not reachable from any
then-fetched remote ref. The brief required them to be pushed before anything else. Exact local refs
were pushed without rewriting any remote history; the final report will identify them and distinguish
this preservation action from the corpus measurement. No diff or message text informed that action.

## Branch census rule

For each repository, fetch and prune `origin`, query `git ls-remote --heads origin`, and record every
remote branch name and tip. Resolve the default branch from the remote symbolic `HEAD`. For each
remote branch, report:

- full tip SHA and tip committer date;
- `git rev-list --count <default>..<branch>` (commits absent from the current default branch);
- newest committer date among those absent commits, or not applicable when the count is zero; and
- whether the branch's absent commits were already reachable before the preservation push.

Counts are per branch and are not summed as unique history. A separate union count deduplicates full
commit SHAs across branches. Local branches and every registered worktree are inspected read-only.
Tracked, untracked, and staged changes are reported as local-only work but are not committed, moved,
or used as corpus candidates. Recent work is classified as (a) remote unmerged history, (b) local
commits preserved by this run, (c) uncommitted local work, or (d) absent.

“Newly reachable history” is the union of commits reachable from any post-preservation remote branch
and absent from the prior frozen default tip, deduplicated by repository and SHA. Current-default
commits after the prior frozen tip are included. Merge commits may establish reachability but do not
double-count commits already seen on another branch.

## Unchanged structural selection and qualification bar

No selector may inspect commit subjects, bodies, PR titles, PR bodies, labels, review prose, or other
natural-language text. Paths, parentage, patch identity, PR membership, changed-file classes, check
metadata, deployment metadata, and test outcomes are allowed. Diffs are processed only in memory;
credential-shaped complete values are replaced before any derived content is retained or printed.
Raw diffs and raw command output will not enter an artifact or log.

The existing strata rules are applied to the newly reachable history as follows:

1. **A1:** stable patch IDs identify exact opposite-direction patches, with the reverted commit
   preceding the inverse. Subjects and bodies are not loaded.
2. **A2 checks:** within an ordered branch or PR commit sequence, `FAILURE` or `ERROR` followed by a
   later distinct `SUCCESS` emits one candidate per fix SHA. Pending, expected, or missing rollups do
   not emit and do not count green.
3. **A2 deployments:** within an exact environment, a failed/error deployment followed by a later
   distinct success emits a candidate only when the success SHA resolves uniquely to the relevant
   branch/PR history.
4. **A3:** an inline review comment's structured path and line are tracked through later zero-context
   hunks; the first later line-touch is the anchor. Comment text is never loaded.
5. **B:** the existing eligible workflow/configuration path surface, same-normalized-named-job
   red-to-green transition, credential boundary, redacted-content deduplication, defect adjudication,
   and B1/B2 split from the 2026-08-01 Stratum B preregistration are reused unchanged.

Branch membership expands reachability but does not lower qualification. An A/code candidate must
touch both non-test source and tests in the same anchored change. At a branch tip containing the fix,
the fixed test control must pass; reversing only source hunks must make the repaired test fail; and
restoring the full fixed source must make it pass again. A B1 candidate analogously requires the
named checked-in job or a necessarily covering checked-in validation command to be fixed-green,
reversed-red, and restored-green without production credentials. Direct reverse apply is attempted
first, then `--3way`; conflicts are never hand-repaired. Tests, fixtures, assertions, commands,
thresholds, and product files are never edited to manufacture a replay.

B2 is not a qualifier and is never pooled with mechanically replayed cases. It requires a real
structural defect and named transition whose binding oracle dependency is a production secret, live
platform state, market/data feed, hosted database, deployment provider, paid API, or other external
service. Patch conflict, missing local setup, a red fixed control, or a reversal that stays green is
an exclusion, not B2.

## Shape metrics

The comparison population is the five repositories in the supplied baseline table—Alfred, Edwin,
Egbert, Therasyn, and Knut—plus site-machine and Cejel as the seventh previously measured repository
available in the Strata A manifest. For each repository the report will give:

- primary language by non-vendored tracked source bytes at the measured default tip, and checked-in
  test framework(s) from configuration/import evidence;
- merged PRs targeting the default branch and the fraction whose complete changed-file set contains
  both non-test source and test paths;
- median commit count per merged PR, using GitHub's complete PR commit count;
- atomic-fix proxy: among structurally selected red-to-green candidates, the fraction for which the
  fix anchor is one commit touching both source and test (reported as not estimable at `n = 0`);
- whether CI defines a stable named test job whose result can serve as an oracle; and
- B2-shaped share: B2 defects divided by all real-defect candidates surviving structural selection
  and causal adjudication (`B1 + B2 + mechanically replayable A defects`). The numerator and
  denominator are shown; zero denominators are not rendered as 0%.

Baseline values are recomputed from the same structured queries where possible. If historical API
metadata is incomplete, the affected denominator and limitation are reported rather than imputed.

## Yield prediction, frozen before extraction

Recent branch work increases reachable commits but not necessarily independently replayable defects.
Therasyn is expected to be service/data-state dependent; site-machine is expected to be deployment,
provider, and generated-output dependent. The unchanged bar should therefore convert poorly.

| Outcome across the two repositories | Range | Point prediction |
|---|---:|---:|
| New A or B1 mechanical qualifiers | 0–2 | **1** |
| New B2 catalog defects | 0–3 | **1** |
| Therasyn B2-shaped share | 35–75% | **55%** |
| site-machine B2-shaped share | 45–85% | **65%** |

The predicted mechanically qualified yield is deliberately one, not an inventory target. The main
ways it can miss low are branch work that is feature-only, missing historical check metadata, patch
decay, or fixed controls that no longer run. It can miss high if a recent branch contains several
atomic source-plus-test repairs with deterministic local oracles. These ranges will not be revised
after branch enumeration begins.

## Planned report

The later result commit will add
`docs/experiments/shape-diversity-therasyn-sitemachine-2026-08-01.md`, containing the full branch
census, preservation finding, safe candidate ledger/provenance, all mechanical outcomes, dedupe
against the 18, the seven-repository shape table, and an explicit statement of what population the
frozen 18 do and do not represent.
