# Stratum B workflow and configuration defect yield — 2026-08-01

Status: **complete; population-limited at 2 B1 qualifiers after exhausting all preregistered repositories**

This is a population measurement, not a corpus build and not a Cejel recall result. It asks how
many real workflow and configuration defects can satisfy an independently replayable CI-job oracle
without production credentials. The predecessor inventory is 13 GitHub structural qualifiers plus
three execution-trace qualifiers: 16 code defects in total.

The rule and prediction in this section are frozen before querying product history. Results will be
appended in a later commit; this preregistration commit must be a strict ancestor of that commit.

## Estimand and non-pooling rule

The primary estimand is the conversion from a structurally selected, content-deduplicated workflow
or configuration fix with a named check transition to a B1 defect: a real defect whose named job can
be made red by reversing only the configuration fix and green again by restoring it.

B2 is a separate count of real, anchored workflow/configuration defects whose oracle requires
production secrets, live platform state, or an external service. B2 is not a mechanical denominator
and will never be pooled with B1. Structural candidates, B1 qualifiers, B2 catalog entries, and
exclusions will be reported separately per repository.

The current 16 code defects will not be pooled with B1 as though they were exchangeable samples. A
secondary inventory total, `16 + B1`, will be reported solely to state the available real-anchor
count and its zero-catch Wilson interval.

## Frozen repositories and deterministic expansion

The primary repositories are Alfred and Cejel. Their frozen tips and all optional expansion tips are
the same commits used by the predecessor measurements; a later branch movement cannot enter the
experiment.

| Expansion order | Repository | Local repository | Frozen `main` tip | Scope |
|---:|---|---|---|---|
| 1 | `BargLabs/alfred` | `<operator-home>/projects/alfred` | `76a631be63cf1be2cd4d9c6b303626a7124864c4` | primary |
| 2 | `BargLabs/cejel` | `<operator-home>/projects/cejel` | `97564ad17ddde4c64d213f78c98d316c01b0c12a` | primary |
| 3 | `BargStudio/egbert` | `<operator-home>/projects/egbert` | `b8346c235a9607c0efff31af6bb44a25ee4d16bb` | expansion |
| 4 | `houman44/site-machine` | `<operator-home>/projects/site-machine` | `1e4106f131f9af27a9a314a0dbb2ecc35c09b441` | expansion |
| 5 | `houman44/edwin` | `<operator-home>/projects/edwin` | `8a9e006d1bae6653f253608ddc11eb93570fc5a1` | expansion |
| 6 | `BargStudio/therasyn` | `<operator-home>/projects/therasyn` | `39f228590c2b2ecb47ddb420709d15c9271ad65a` | expansion |
| 7 | `BargLabs/edwy` | `<operator-home>/projects/edwy` | `99c1139ba187d7181ff9923edd782f66cc599aec` | expansion |
| 8 | `houman44/knut` | `<operator-home>/projects/knut` | `4609f13c43f8b772db2aee7020bd9dad8ffeca16` | expansion |
| 9 | `BargLabs/wilfrid` | `<operator-home>/projects/wilfrid` | `da0a474d361dd472c92e59c07b63b6139c390e42` | expansion |
| 10 | `houman44/barglabs-site` | `<operator-home>/projects/barglabs-site` | `1e164da9400b0c7b8f073f2df5bafad3af48d643` | expansion |
| 11 | `BargLabs/cejel-site` | `<operator-home>/projects/cejel-site` | `5ed796e3dc9926ae69e0b2b018026c099d211a2e` | expansion |

Alfred and Cejel are always measured completely. If they contain fewer than ten B1 qualifiers, add
expansion repositories in the table order, measuring each repository completely. Stop after the
first completed repository that brings cumulative B1 to at least ten. If all eleven repositories
still contain fewer than ten, exhaust the list and report that the acceptance sample is population-
limited rather than fabricating or weakening qualifiers.

## Structural configuration surface

A commit or merged PR enters structural discovery only when its patch changes at least one eligible
path. Path selection is mechanical and does not inspect commit messages, PR titles, bodies, labels,
review prose, or session text.

Eligible paths are:

- `.github/workflows/**`, `.github/actions/**`, `.github/dependabot.yml`, and workflow-owned scripts
  under `.github/**`;
- root or package-scoped CI/build/lint/test/package-manager configuration named `package.json`,
  `pnpm-workspace.yaml`, `pyproject.toml`, `tox.ini`, `pytest.ini`, `setup.cfg`, `Makefile`,
  `Dockerfile*`, `compose*.yml`, or `compose*.yaml`;
- `tsconfig*.json`, `eslint.config.*`, `prettier.config.*`, `vite.config.*`, `vitest.config.*`,
  `jest.config.*`, `playwright.config.*`, `turbo.json`, `vercel.json`, `Procfile`, and files matching
  `*.config.{js,cjs,mjs,ts,json,yml,yaml}`; and
- scripts referenced directly by an eligible workflow job, but only after the workflow path itself
  made the commit a structural candidate.

Lockfiles alone do not enter the funnel. A lockfile may remain in a candidate patch when another
eligible file changed, but a dependency/version-only update is excluded during defect adjudication.

## Named-check transition rule

For every eligible merged-main PR or first-parent commit, enumerate check runs using GitHub's
structured commit/check APIs. A structural candidate requires the same normalized named job to have
a completed non-success conclusion at an earlier relevant commit and a completed success conclusion
at a later relevant commit.

Relevant commits are, in order:

1. the first parent of a non-PR first-parent fix commit and the fix commit itself; or
2. all commits in a merged PR in commit order, followed by its full 40-hex merge commit.

The later successful commit must be at or after the last commit in that sequence that changes an
eligible configuration path. Normalization removes only GitHub's matrix suffix in parentheses and
surrounding whitespace; it does not merge distinct job names by substring. Neutral, skipped,
cancelled, stale, startup-failure, timed-out, and action-required are non-success, but a transition
from absent to success is not a red-to-green transition.

Every retained candidate carries a locally resolvable full 40-hex merged-main or first-parent anchor
that is an ancestor of the frozen tip. PR-number-only and short-SHA records are excluded and counted.

## Credential boundary and content deduplication

Diffs are processed in memory. Before any value is fingerprinted, retained, or printed, the
extractor replaces complete values—not just token substrings—for credential-shaped keys and common
secret formats, including passwords, tokens, API keys, private keys, bearer values, JWTs, cloud
credentials, embedded URL credentials, `.env` assignments, and workflow `secrets.*` expressions.
Only redaction categories and counts may leave memory. Raw diffs, raw check output, environment
variables, and credential values, prefixes, substrings, or hashes are never written.

Candidate content identity is computed only after redaction. File headers, paths, blob IDs, mode
lines, hunk coordinates, and unchanged context are removed; the ordered added/deleted line bodies
remain. Exact duplicates of that scrubbed canonical content are one candidate regardless of path,
PR, repository copy, or migrated checkout. The earliest anchored occurrence is canonical; later
occurrences are reported as duplicate anchors and do not increase the numerator or denominator.

The 16 predecessor defects are deduplicated by canonical repository plus full fix SHA before the
Stratum B funnel. Any overlap is reported and contributes no new anchor.

## Defect adjudication

Commit messages and PR prose are never used. A candidate is judged from its patch, its parent/frozen
repository state, and structured check evidence.

A candidate is a defect only if the prior configuration caused an existing intended job or gate to
misbehave. Features, new jobs with no previously intended behavior, refactors, formatting,
dependency/version bumps, generated-file refreshes, and performance-only tuning are excluded. A
threshold change qualifies only when an independently measured runtime, count, or other repository
artifact existing by the fix anchor proves the old threshold invalid; the replacement number cannot
serve as its own oracle.

## B1 mechanical oracle

A B1 candidate must satisfy all four conditions; replay is not optional:

1. the anchored change fixes a workflow, CI, build, lint, tooling, or packaging configuration
   defect;
2. structured GitHub evidence supplies the named red-to-green job transition above;
3. in an ephemeral clone checked out at the repository's frozen tip, reversing only the eligible
   configuration hunks makes the named job fail without production credentials; and
4. restoring the fixed configuration makes the same named job pass.

The fixed control runs first and must pass. Reverse application may use direct `git apply --reverse`
and then `git apply --reverse --3way`; conflicts are never repaired by hand. The replay invokes the
job's checked-in command or a checked-in validation command that necessarily covers the same job.
`actions/checkout` and runtime setup may be reproduced by the scratch environment; no product file,
workflow, assertion, fixture, expected value, command argument, or threshold may be edited. A job
that cannot be executed locally without changing its meaning is not B1.

Network access used solely to install dependencies from a frozen lockfile is an environment
accommodation. Access to deployments, production databases, cloud consoles, paid APIs, or live
service state is not. Existing local production credentials are removed from the replay environment.

## B2 classification

B2 requires conditions 1 and 2 plus a real full anchor, but condition 3 cannot be attempted honestly
without a production secret, live platform state, or external service. The missing dependency and
the named job are recorded. An ordinary local setup failure, missing parser support, patch conflict,
or red fixed control is an exclusion—not B2. A candidate cannot move from a failed B1 replay into B2
unless the replay record demonstrates that production state is the binding oracle dependency.

## Demonstration sample

All B1 candidates are replayed. For the detailed acceptance demonstration, rank B1 identities by
SHA-256 of the ASCII string
`stratum-b-2026-08-01-v1\0<canonical-repository>\0<full-fix-sha>` and take the ten lexicographically
smallest ranks. This fixes a deterministic pseudo-random sample without inspecting outcomes. If the
exhausted population contains fewer than ten B1 candidates, demonstrate all and report that the
preregistered minimum was unattainable.

The report will name each sampled repository, full anchor, named job, exact safe replay command,
fixed-control outcome, reversed outcome, and restored outcome. Raw job output is not retained.

## D-series classification

Each B1 and B2 defect receives exactly one primary class, with secondary classes noted only in prose:

| Class | Meaning used here |
|---|---|
| D1 | declared-but-unread configuration or contract |
| D2 | swallowed or information-losing error |
| D3 | unasserted set transform |
| D4 | pass-by-absence or fail-open empty state |
| D5 | self-referential verification |
| D6 | inference from a partial operational view |
| D7 | scope, denominator, or value hand-typed instead of derived from the guarded system |
| D8 | a computed or consulted guard that binds no relevant control-flow decision |
| Outside D1–D8 | real workflow/configuration defect that fits none honestly |

Every class below `n = 10` will be marked unable to carry its own denominator. D9 composed-guard
failure is excluded from this classification because its definition is an emergent system property,
not a single reversible configuration defect.

## Preregistered yield prediction

The prediction is made at the qualification bar, not by extrapolating raw configuration commits.
Configuration changes are common, but most are features, version churn, lack a same-job transition,
have temporally decayed at the frozen tip, or depend on production state.

| Scope | Structural candidates | B1 qualifiers | B2 catalog entries |
|---|---:|---:|---:|
| Alfred + Cejel | 25–60 (point 40) | 6–14 (point **9**) | 2–7 (point **4**) |
| All repositories if expansion is exhausted | 60–150 (point 95) | 12–30 (point **18**) | 4–12 (point **7**) |

The prediction therefore expects Alfred/Cejel alone to fall just short of the ten-case demonstration
minimum and expects deterministic expansion to be required. The main ways it can fail low are absent
historical per-job check data, non-applicable historical patches, and CI jobs that cannot be run
without platform state. The main way it can fail high is repeated workflow-hardening work in Alfred
that carries both local guard scripts and complete historical check runs.

No prediction will be revised after candidate extraction begins.

## Planned reporting and interval

The later result commit will append:

1. the exact commands and GraphQL/REST documents actually run for every measured repository;
2. per-repository structural, duplicate, excluded, B1, and B2 counts;
3. the full B1/B2 catalog with full anchors and named jobs;
4. all replay outcomes plus the detailed deterministic sample;
5. D1–D8 distribution and sub-ten warning;
6. every exclusion category, including truncation and API incompleteness; and
7. `16 + B1 = N` with the Wilson 95% upper bound for zero catches.

Wilson intervals use `z = 1.959963984540054`; for zero catches in `n`, the upper endpoint is
`z^2 / (n + z^2)`. B2 never enters that calculation.

## Result

**B1 = 2. Combined real-anchor inventory: `16 + 2 = 18`; zero catches in 18 has Wilson 95%
interval `[0.00%, 17.59%]`.** B2 contains five additional defects but remains separate and does not
enter that interval.

**Scope qualification:** this result covers **repo-anchored workflow and configuration defects**
selected from committed repository history. It did not measure archived sessions, shell history,
local-machine configuration, cloud-console settings, or uncommitted operational state. Those
surfaces require separately defined discovery channels and cannot be inferred from this yield.

### Cross-stratum yield finding

Three independently selected repo-anchored strata now show monotonically declining conversion at
the qualification bar:

| Stratum | Qualified / structural candidates | Conversion |
|---|---:|---:|
| A2 CI/deployment transitions | 12 / 325 | 3.69% |
| Archived session traces | 3 / 123 | 2.44% |
| B workflow/configuration transitions | 2 / 191 | 1.05% |

The inventory moved from 16 to 18, improving the zero-catch Wilson 95% upper bound from 19.36% to
17.59%: **1.77 percentage points for a full eleven-repository measurement cycle**. The same
single-digit outcome across three independent selection mechanisms establishes a population fact,
not an extraction-method problem. Further repo-anchored extraction under comparable qualification
bars is not expected to be worthwhile; it should not be the programme's next denominator strategy.

The preregistered ten-case demonstration was unattainable. All eleven repositories were exhausted;
only the two B1 cases below survived structural selection, defect adjudication, frozen-tip reverse
application, a green fixed control, a red reversed control, and a green restored control. This is a
single-digit result and the study is population-limited under the frozen rule.

The miss was not caused by too few configuration changes. Discovery found 854 eligible anchors and
191 content-unique named-transition candidates. The binding facts were temporal applicability and
causal qualification: 132/191 candidate patches no longer reversed cleanly at the frozen tips, and
48 of the 59 applicable patches were features, policy/version changes, or configuration edits not
causally responsible for the selected named transition. Of the six applicable candidates advanced
to a credential-free replay, one had a red fixed control, three stayed green when reversed, and two
qualified B1.

## Per-repository yield

`Excluded` is every content-unique candidate that is neither B1 nor B2; `patch conflict` is a subset
of that column. The one Alfred within-run content duplicate is removed between transition rows and
content-unique candidates. There were no cross-repository content duplicates.

| Repository | Eligible anchors | Named-transition rows | Content-unique candidates | Patch conflict | Excluded | B1 | B2 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `BargLabs/alfred` | 181 | 81 | 80 | 56 | 79 | **1** | 0 |
| `BargLabs/cejel` | 35 | 2 | 2 | 1 | 1 | 0 | **1** |
| `BargStudio/egbert` | 271 | 65 | 65 | 46 | 62 | **1** | **2** |
| `houman44/site-machine` | 37 | 2 | 2 | 1 | 2 | 0 | 0 |
| `houman44/edwin` | 239 | 24 | 24 | 19 | 22 | 0 | **2** |
| `BargStudio/therasyn` | 61 | 17 | 17 | 9 | 17 | 0 | 0 |
| `BargLabs/edwy` | 11 | 1 | 1 | 0 | 1 | 0 | 0 |
| `houman44/knut` | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| `BargLabs/wilfrid` | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| `houman44/barglabs-site` | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| `BargLabs/cejel-site` | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **854** | **192** | **191** | **132** | **184** | **2** | **5** |

The full 191-row catalog is
[`stratum-b-candidate-ledger-2026-08-01.csv`](stratum-b-candidate-ledger-2026-08-01.csv). It records
repository, full fix and parent anchors, PR when present, every selected named transition, eligible
paths, redacted-content identity, reverse-patch mode, disposition, and D class. It is generated by
`scripts/stratum-b-ledger.mjs`; it contains no diff bodies or credential values.

## B1 mechanical catalog and complete demonstration

The exhausted B1 population has only two members, so the deterministic ten-case sample is the full
population. Both ranks would therefore be selected regardless of their relative order.

| Repository | Fix anchor | Parent anchor | Named job | Safe replay | Fixed | Reversed | Restored | Class |
|---|---|---|---|---|---|---|---|---|
| `BargLabs/alfred` | `5978eeddafb247b8f81238331fd8ae1adb55fc30` | `c51e04deefd1eb8af5fd9f0cdc5711e1007b50ce` | `ci-full` | `pnpm --filter @alfred/web test` | exit 0, 5,808 ms | exit 1, 3,447 ms | exit 0, 3,627 ms | Outside D1–D8 |
| `BargStudio/egbert` | `8e6e7951eed2a088c24bbb614b1900448773c15d` | `e66b8b6b6d7c39254ae60652f3d66a6c7d65d788` | `Check changed paths` | checked-in `Detect relevant changes` shell step with a 20,000-path fixture | exit 0, 410 ms | exit 141, 231 ms | exit 0, 233 ms | Outside D1–D8 |

The Alfred reversal removes the Vitest alias that resolves the web app's `@` imports. The Egbert
reversal restores `echo "$CHANGED" | head -50 | sed ...` under `set -o pipefail`; a sufficiently
large changed-path set makes the producer receive SIGPIPE. The fixed form uses `sed -n` for bounded
display while preserving the full set for the deployment decision. Neither replay inherited a
production credential.

Re-runnable oracle commands:

```sh
node scripts/stratum-b-oracle.mjs /tmp/stratum-b-primary.json /tmp/stratum-b-oracle.json 5978eeddafb247b8f81238331fd8ae1adb55fc30
node scripts/stratum-b-egbert-oracle.mjs /tmp/stratum-b-egbert.json /tmp/stratum-b-egbert-oracle.json
```

The first command installs Alfred from the frozen lockfile using the public registry. The second
uses only local Git objects and a generated non-secret path-list fixture. Raw command output is not
retained; the mode-0600 JSON records only exit status, signal, duration, patch mode, and the safe
step label.

## B2 catalog and detection targets — not pooled

Replayability is a requirement of this measurement, not a requirement of detection. Each B2 entry
is therefore retained as a detection target with a static signature even though its production-
state oracle keeps it outside the B1 mechanical denominator.

| ID | Repository | Fix anchor | Parent anchor | Named job | Detection target | Static signature | Binding external dependency | Class |
|---|---|---|---|---|---|---|---|---|
| B2-DT1 | `BargLabs/cejel` | `520011e12e75468de423b453621298e28df359e1` | `12bf95c72ab6511aa0cafcd8329021d303ceb47d` | `publish-oci` | Missing permission for registry-backed provenance attestation | A workflow invokes artifact/provenance attestation for a registry publication while the job's effective `permissions` omit `artifact-metadata: write` | GitHub release identity/OIDC and OCI registry write | Outside D1–D8 |
| B2-DT2 | `BargStudio/egbert` | `e308972796473778c46eed1e160fed983e785197` | `43438c55a400159454d94dbcbdfbcae31ab65ab5` | `Build & Deploy Cockpit` | Loaded SSH deployment identity made ineligible by client options | A job loads a key into an SSH agent and later invokes `ssh`/`scp` with `IdentitiesOnly yes` but without a matching explicit `-i`/`IdentityFile` | loaded deployment SSH identity and live host | Outside D1–D8 |
| B2-DT3 | `BargStudio/egbert` | `13d9d0e400340c72793b9e5e21d2919ab39f0630` | `1e520d00d0207e8722f5d3bf8cab316ef57fd0b6` | `Deploy core to Vultr` | Drift gate rejects a known deployment-owned tracked mutation | A deploy step fails on non-empty `git status --porcelain` before reset-to-tested-SHA while an earlier deployment path intentionally mutates a tracked configuration file that the gate does not exempt | tracked-file drift in the live server checkout | D7 |
| B2-DT4 | `houman44/edwin` | `eb8cc619dbe08e1b27282f2a082f923c7aa26698` | `8569a2b88b266d2b3404b38e7900c26a7d62ccb8` | `Edwin coordinator preflight` | Dependency interval excludes the job-required version family | A dependency range in the job-installed project has an empty intersection with a checked-in constraint, audit policy, or locked resolution required by that job | private package checkout and its deploy key during the exact job install | Outside D1–D8 |
| B2-DT5 | `houman44/edwin` | `3cd9bd41de35301c7ea5f6b2674aa0646657f2eb` | `97d16d935503218c351742ce24ca475cf33757f8` | `edwin-ci-fast` | Stale or uninstallable immutable private VCS dependency pin | A PEP 508 `git+ssh` dependency carries a full revision and subdirectory; the revision must resolve and the subdirectory must expose installable matching package metadata | pinned private package revision over authenticated SSH | Outside D1–D8 |

All five B2 patches apply at their frozen tips. No production token, key, host, registry, or live
repository state was invoked to turn them into synthetic B1 demonstrations.

## D-series distribution

The distribution covers the seven accepted defects, B1 and B2 shown separately. No class has ten
members, so none can carry its own denominator or support a class-level rate.

| Class | B1 | B2 | Total | Denominator warning |
|---|---:|---:|---:|---|
| D1 | 0 | 0 | 0 | `n < 10` |
| D2 | 0 | 0 | 0 | `n < 10` |
| D3 | 0 | 0 | 0 | `n < 10` |
| D4 | 0 | 0 | 0 | `n < 10` |
| D5 | 0 | 0 | 0 | `n < 10` |
| D6 | 0 | 0 | 0 | `n < 10` |
| D7 | 0 | 1 | 1 | `n < 10` |
| D8 | 0 | 0 | 0 | `n < 10` |
| Outside D1–D8 | 2 | 4 | 6 | `n < 10` |

## Complete exclusion ledger

| Stage or exclusion | Count |
|---|---:|
| Eligible anchors with no same-name non-success-to-success transition | 662 |
| Named-transition rows removed by scrubbed-content deduplication | 1 |
| Cross-repository scrubbed-content duplicates | 0 |
| Predecessor-inventory overlaps | 0 |
| Content-unique candidates whose reverse patch conflicts at the frozen tip | 132 |
| Applicable candidate rejected because its fixed control was red | 1 |
| Applicable candidate rejected because the reversed control stayed green | 3 |
| Applicable candidate rejected by patch review as feature, policy/version churn, threshold change without an independent oracle, or non-causal named transition | 48 |
| API/resolution failures | 0 |
| Truncated histories, truncated check pages, short/non-resolving anchors | 0 |
| **Excluded content-unique candidates** | **184** |

The three reversed-green candidates were Alfred `26f235ab0f4c3f7003228601931e509a29f9fea4`
and `bf53ee8ad45a3e0e17f41c93950e4d678fe304f4`, plus Egbert
`d52b82777311501f20a9cafc253825ed78bffc87`. Alfred
`f644be09bc0e49cb99199b7534b36e5fd2733917` had a red fixed control. These outcomes are exclusions,
not evidence for B2.

## Prediction check

| Scope | Predicted structural | Observed structural | Predicted B1 | Observed B1 | Predicted B2 | Observed B2 |
|---|---:|---:|---:|---:|---:|---:|
| Alfred + Cejel | 25–60 | **82** | 6–14 | **1** | 2–7 | **1** |
| Exhausted repository list | 60–150 | **191** | 12–30 | **2** | 4–12 | **5** |

The structural prediction failed high and the B1 prediction failed decisively low. The B2 range
held. Extrapolating configuration-change volume to replayable defects was wrong: the named-check
filter admitted many incidental transitions, and the frozen-tip rule removed 69.1% of unique
candidates before causal replay. This report does not revise the prediction post hoc.

## Exact extraction commands and API documents

The extraction commands actually run were:

```sh
env GH_TOKEN="$(gh auth token)" node scripts/stratum-b-extract.mjs /tmp/stratum-b-primary.json
env GH_TOKEN="$(gh auth token)" node scripts/stratum-b-extract.mjs /tmp/stratum-b-egbert.json BargStudio/egbert
env GH_TOKEN="$(gh auth token)" node scripts/stratum-b-extract.mjs /tmp/stratum-b-site-machine.json houman44/site-machine
env GH_TOKEN="$(gh auth token)" node scripts/stratum-b-extract.mjs /tmp/stratum-b-edwin.json houman44/edwin
env GH_TOKEN="$(gh auth token)" node scripts/stratum-b-extract.mjs /tmp/stratum-b-therasyn.json BargStudio/therasyn
env GH_TOKEN="$(gh auth token)" node scripts/stratum-b-extract.mjs /tmp/stratum-b-edwy.json BargLabs/edwy
env GH_TOKEN="$(gh auth token)" node scripts/stratum-b-extract.mjs /tmp/stratum-b-knut.json houman44/knut
env GH_TOKEN="$(gh auth token)" node scripts/stratum-b-extract.mjs /tmp/stratum-b-wilfrid.json BargLabs/wilfrid
env GH_TOKEN="$(gh auth token)" node scripts/stratum-b-extract.mjs /tmp/stratum-b-barglabs-site.json houman44/barglabs-site
env GH_TOKEN="$(gh auth token)" node scripts/stratum-b-extract.mjs /tmp/stratum-b-cejel-site.json BargLabs/cejel-site
node scripts/stratum-b-ledger.mjs docs/experiments/stratum-b-candidate-ledger-2026-08-01.csv
```

The extractor made 6,242 authenticated REST requests. It issued no GraphQL query. These are the
verbatim REST path templates, with `{slug}`, `{commit}`, `{number}`, and `{page}` replaced by the
repository-specific values:

```text
GET /repos/{slug}/commits/{commit}/pulls?per_page=100&page={page}
GET /repos/{slug}/pulls/{number}/commits?per_page=100&page={page}
GET /repos/{slug}/commits/{commit}
GET /repos/{slug}/commits/{commit}/check-runs?filter=all&per_page=100&page={page}
GET /repos/{slug}/commits/{commit}/status?per_page=100
```

Every request used `Accept: application/vnd.github+json`, API version `2022-11-28`, and user agent
`cejel-stratum-b-measurement`. Pagination stopped only after a page contained fewer than 100 rows.
Local selection used the frozen tips in the preregistration table with `git rev-list
--first-parent --reverse`, `git diff --name-only`, and `git diff` as implemented verbatim in
`scripts/stratum-b-extract.mjs`.

The extraction JSON files were mode 0600. Before content identity or output, the in-memory scrubber
replaced 192 workflow secret expressions and 92 credential-shaped assignments. The committed ledger
contains only scrubbed content IDs, safe path/job labels, anchors, and dispositions. No credential
value, prefix, substring, or hash and no raw diff or job log is present.

## Integrity checks

- Preregistration commit: `238cc9a`; it is a strict ancestor of this result commit.
- All 191 fix anchors and 191 parent anchors in the ledger are full lowercase 40-hex values.
- All fix anchors resolve locally and are ancestors of their repository's frozen tip.
- All 16 predecessor anchors were parsed before extraction; overlap count is zero.
- Extraction and oracle parser tests pass; both B1 replays repeat the full green → reversed-red →
  restored-green cycle.
