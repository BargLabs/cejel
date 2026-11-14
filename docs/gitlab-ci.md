# Cejel on GitLab CI

A GitLab CI job template, a GitLab Code Quality export and a GitLab metrics export. Scoring is
unchanged: the job runs the same offline scan as every other Cejel entry point, and the exports
only re-present the findings and scores already in `report.json`. Code Quality says which problems
exist and where; the metrics report says how the scores moved; `CEJEL_MIN_SCORE` stays the gate.

## Component (recommended)

Cejel is published in the GitLab CI/CD Catalog as
[`barglabs/cejel`](https://gitlab.com/explore/catalog/barglabs/cejel). Component versions match
`@cejel/cejel` releases. Pin a version, never a branch:

```yaml
include:
  - component: gitlab.com/barglabs/cejel/cejel@0.6.11
```

| Input | Default | Meaning |
| --- | --- | --- |
| `version` | `0.6.11` | The `@cejel/cejel` version `npx` runs. Keep it equal to the component version. |
| `min_score` | empty | Same as `CEJEL_MIN_SCORE` below. |
| `stage` | `test` | The stage the `cejel` job runs in. |
| `git_depth` | `"0"` | Same as `GIT_DEPTH` below. |

The job is the same as the template's: same name, image, script and artifacts. The component's
source is [gitlab.com/barglabs/cejel](https://gitlab.com/barglabs/cejel) (`templates/cejel.yml`).

## Include (remote template, fallback)

Where the Catalog is not available, include the template from this repository. Pin the include
to a release tag, never a branch:

```yaml
include:
  - remote: 'https://raw.githubusercontent.com/BargLabs/cejel/v0.7.0-rc.3/ci/gitlab/cejel.gitlab-ci.yml'
```

The job is named `cejel`, runs in the `test` stage on `node:22`, and:

1. runs `npx @cejel/cejel@$CEJEL_VERSION scan . --out .cejel`;
2. runs `npx @cejel/cejel@$CEJEL_VERSION export gitlab-codequality .cejel/report.json -o gl-code-quality-report.json`;
3. runs `npx @cejel/cejel@$CEJEL_VERSION export gitlab-metrics .cejel/report.json -o metrics.txt`.
   If this step fails, the job prints a line saying so and still exits with the scan's status;
4. publishes `gl-code-quality-report.json` as `artifacts:reports:codequality` and `metrics.txt`
   as `artifacts:reports:metrics`, and keeps `.cejel/` as a job artifact (`when: always`, so all
   three survive a failed score gate).

The component on gitlab.com gains step 3 and the metrics report in the component release that
follows the `@cejel/cejel` release carrying `export gitlab-metrics`. Until then, only the remote
include runs it.

The scan and the exports make no network calls. The only network use is the `npx` fetch of the
pinned package. The template is not itself a lint-checked file in CI here: see Limits.

### Variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `CEJEL_VERSION` | the release the include tag names | `@cejel/cejel` version `npx` runs. Keep it equal to the tag in the include URL. |
| `CEJEL_MIN_SCORE` | empty | When set (0-4), the job fails below that overall score, when Cejel abstains, or when measurement coverage is too thin. This is the CLI's `--min-score`, as with the GitHub Action's `min-score`. Both exports still run before the job exits. |
| `GIT_DEPTH` | `"0"` | Full history: A2 and B2 read commit history. See Full history below. |

These are job variables. Override one under the `variables:` of your own `cejel:` job, which
GitLab merges with the included job, or as a project, group or pipeline CI/CD variable. A
top-level `variables:` entry in the including file does not override them: GitLab ranks job
variables above default ones. This precedence is from GitLab's CI/CD variable documentation; it
has not been run on a GitLab runner here (see Limits).

### Full history

Fetch with `GIT_DEPTH: "0"`: GitLab's default shallow clone truncates the history A2 and B2 read,
and the certificate then lists a history limitation.

- **Included:** the template sets `GIT_DEPTH: "0"` on the `cejel` job, so you need do nothing.
  It applies to that job only; the rest of your pipeline keeps its depth.
- **Copied:** if you copy the job into your own `.gitlab-ci.yml` rather than including it, keep
  `GIT_DEPTH: "0"` in its `variables:`. Without it the job inherits the project's shallow depth.

```yaml
cejel:
  variables:
    GIT_DEPTH: "0" # full history: A2 and B2 read commit history
```

## Export command

```
cejel export gitlab-codequality <report.json> [-o gl-code-quality-report.json]
```

Reads a validated `report.json` and writes a JSON array of Code Quality entries
(`description`, `check_name`, `fingerprint`, `location.path`, `location.lines.begin`,
`severity`). A footer on stderr says how many findings were exported and how many were not.

- `check_name` is the Cejel criterion identifier the finding belongs to.
- `fingerprint` is the SHA-256 of rule, path, line and the finding's identity. A metric-derived
  finding's identity is fixed, so its score and band are left out; any other finding's identity is
  its summary with every number replaced by one placeholder, so a count or ratio is left out. A score
  or count change at the same file and line therefore keeps the fingerprint. Two different findings
  at one place that would share an identity each get their ordinal there, in report order, so
  neither is dropped. GitLab's merge request widget lists only new and resolved findings, so a score
  change on the same line does not appear there; the score is in the entry's `description` and in
  Cejel's report. A score change is shown by the metrics report (see Metrics report below), not by
  the Code Quality widget.
- Only findings with both a file and a measured line are exported. A finding scoped to a file or
  to the repository, with no measured line, is counted in the footer and left out. Cejel does not
  put a stand-in line such as `1` on a position it did not measure.
- Paths are repository-relative, forward-slash, with no leading `./`. A path that cannot be
  repository-relative (absolute, drive-lettered, containing `..`) is treated as unlocated.
- Findings ingested from other scanners via `--ingest` are not exported; the footer counts them.
- An abstained report (`verdict: "insufficient_source"`) exports an empty array, and the footer
  states the abstention reason.

### Severity table

Fixed, not inferred per run.

| Cejel severity | GitLab `severity` |
| --- | --- |
| `critical` | `critical` |
| `warning` | `major` |
| `info` | `info` |

Cejel has no tier that maps to `minor` or `blocker`, so neither is emitted.

## Metrics report

```
cejel export gitlab-metrics <report.json> [-o metrics.txt]
```

Reads a validated `report.json`, with the same validation and refusal as the Code Quality export,
and writes a GitLab metrics report: a text file with one `<name> <value>` line per score, in this
order:

| Line | Value |
| --- | --- |
| `cejel_overall_score` | the overall score |
| `cejel_process_trust_score` | process trust |
| `cejel_code_trust_score` | code trust |
| `cejel_criterion_<id>_score` | one per criterion, in report order; the id lower-cased, with `-` written as `_` (for example `cejel_criterion_a4_score`) |

- Each value is printed to one decimal, as the terminal certificate prints it, so a difference
  below that precision never reads as a change.
- A value Cejel did not measure is left out, never written as 0: a criterion that is
  `insufficient_data` or `not_applicable`, a trust score whose category has no measured criterion,
  and the overall score when no criterion was measured. A criterion scored 0 (for example
  `unverified`) is written, because 0 is its score. A rubric with no code-trust or process-trust
  criteria writes no line under that name.
- An abstained report (`verdict: "insufficient_source"`) writes an empty file, and the footer
  states the abstention reason.
- A footer on stderr says how many metrics were written and how many values were left out because
  Cejel did not measure them, naming each one.

In a merge request, GitLab compares the file with the one from the target branch's baseline pipeline and lists the
scores that were added, removed or changed. A value left out on one side therefore shows as added or
removed, not as a change to or from 0. Metrics reports need GitLab Premium or Ultimate; on Free,
GitLab ignores the file. This was written from the goal's summary of GitLab's metrics reports page
(docs.gitlab.com/ci/testing/metrics_reports/), not re-read against it, and has not been run on a
GitLab runner here.

## What appears in merge requests

As described in GitLab's Code Quality documentation (docs.gitlab.com/ci/testing/code_quality/).
This was written from the goal's summary of that page and not re-read against it, and GitLab can
change it:

- **All tiers, including Free:** the merge request widget compares the report against the target
  branch and lists new and resolved findings, and the changes view marks degradations inline.
- **Ultimate:** the project-level Code Quality report and dashboards.

Confirm the current tier split against GitLab's page before relying on it.

## Limits

- Recall is bounded by what Cejel locates. Many Cejel findings are repository-level and have no
  line; they appear in `.cejel/certificate.html` and `report.json`, not in the merge request.
- The footer count is the only signal of what was left out. A report with zero exported entries is
  not a clean bill of health.
- Both routes were run on a GitLab.com instance runner on 2026-11-10, in
  [barglabs/cejel-gitlab-demo](https://gitlab.com/barglabs/cejel-gitlab-demo): the remote
  include at `v0.6.10` ([pipeline 3048076526](https://gitlab.com/barglabs/cejel-gitlab-demo/-/pipelines/3048076526)) and the component at `0.6.10`
  ([pipeline 3048107004](https://gitlab.com/barglabs/cejel-gitlab-demo/-/pipelines/3048107004)). In both, the `cejel` job fetched full history while
  the pipeline's other job fetched at GitLab's default depth and uploaded its Code Quality report;
  with the remote include, the report showed on a merge request
  ([!1](https://gitlab.com/barglabs/cejel-gitlab-demo/-/merge_requests/1)). The
  variable-precedence rules under Variables were not exercised there. In this repository the YAML
  is still checked only by structural assertions, not a YAML parser or GitLab's CI lint.
- `npx` needs the npm registry once per job unless the package is cached or mirrored.

## CI/CD Catalog component

The component lives in its own GitLab project,
[gitlab.com/barglabs/cejel](https://gitlab.com/barglabs/cejel), as `templates/cejel.yml`
with the inputs listed under Component above. Its `version` input defaults to the release this
page documents:

```yaml
spec:
  inputs:
    version:
      default: '0.6.11'
```

Its pipeline runs the component on itself and publishes a release for each semantic-version tag
that matches an `@cejel/cejel` release.

The component's version follows the npm release. A scheduled job in the GitLab project tags each
new `@cejel/cejel` release; until it has, the newest component version is the previous release.
This repository's release-currency check (`scripts/verify-release-currency.mjs`, every 6 hours)
reads the Catalog's newest version: it reports pending while the Catalog is less than 3 hours
behind npm and fails once it is 3 hours or more behind. Release candidates are never tagged here.
