# Stratum B workflow and configuration defect yield — 2026-08-01

Status: **preregistered; no Stratum B history query or candidate classification run yet**

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
| 1 | `BargLabs/alfred` | `/Users/bargs/projects/alfred` | `76a631be63cf1be2cd4d9c6b303626a7124864c4` | primary |
| 2 | `BargLabs/cejel` | `/Users/bargs/projects/cejel` | `97564ad17ddde4c64d213f78c98d316c01b0c12a` | primary |
| 3 | `BargStudio/egbert` | `/Users/bargs/projects/egbert` | `b8346c235a9607c0efff31af6bb44a25ee4d16bb` | expansion |
| 4 | `houman44/site-machine` | `/Users/bargs/projects/site-machine` | `1e4106f131f9af27a9a314a0dbb2ecc35c09b441` | expansion |
| 5 | `houman44/edwin` | `/Users/bargs/projects/edwin` | `8a9e006d1bae6653f253608ddc11eb93570fc5a1` | expansion |
| 6 | `BargStudio/therasyn` | `/Users/bargs/projects/therasyn` | `39f228590c2b2ecb47ddb420709d15c9271ad65a` | expansion |
| 7 | `BargLabs/edwy` | `/Users/bargs/projects/edwy` | `99c1139ba187d7181ff9923edd782f66cc599aec` | expansion |
| 8 | `houman44/knut` | `/Users/bargs/projects/knut` | `4609f13c43f8b772db2aee7020bd9dad8ffeca16` | expansion |
| 9 | `BargLabs/wilfrid` | `/Users/bargs/projects/wilfrid` | `da0a474d361dd472c92e59c07b63b6139c390e42` | expansion |
| 10 | `houman44/barglabs-site` | `/Users/bargs/projects/barglabs-site` | `1e164da9400b0c7b8f073f2df5bafad3af48d643` | expansion |
| 11 | `BargLabs/cejel-site` | `/Users/bargs/projects/cejel-site` | `5ed796e3dc9926ae69e0b2b018026c099d211a2e` | expansion |

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
