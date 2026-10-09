# Cejel on GitLab CI

A GitLab CI job template and a GitLab Code Quality export. Scoring is unchanged: the job runs
the same offline scan as every other Cejel entry point, and the export only re-presents the
findings already in `report.json`.

## Include

Pin the include to a release tag, never a branch:

```yaml
include:
  - remote: 'https://raw.githubusercontent.com/BargLabs/cejel/v0.6.3/ci/gitlab/cejel.gitlab-ci.yml'
```

The job is named `cejel`, runs in the `test` stage on `node:22`, and:

1. runs `npx @cejel/cejel@$CEJEL_VERSION scan . --out .cejel`;
2. runs `npx @cejel/cejel@$CEJEL_VERSION export gitlab-codequality .cejel/report.json -o gl-code-quality-report.json`;
3. publishes `gl-code-quality-report.json` as `artifacts:reports:codequality` and keeps `.cejel/`
   as a job artifact (`when: always`, so both survive a failed score gate).

The scan and the export make no network calls. The only network use is the `npx` fetch of the
pinned package. The template is not itself a lint-checked file in CI here: see Limits.

### Variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `CEJEL_VERSION` | the release the include tag names | `@cejel/cejel` version `npx` runs. Keep it equal to the tag in the include URL. |
| `CEJEL_MIN_SCORE` | empty | When set (0-4), the job fails below that overall score, when Cejel abstains, or when measurement coverage is too thin. This is the CLI's `--min-score`, as with the GitHub Action's `min-score`. The export still runs before the job exits. |

Override either in the including project's `variables:` or as a CI/CD variable.

## Export command

```
cejel export gitlab-codequality <report.json> [-o gl-code-quality-report.json]
```

Reads a validated `report.json` and writes a JSON array of Code Quality entries
(`description`, `check_name`, `fingerprint`, `location.path`, `location.lines.begin`,
`severity`). A footer on stderr says how many findings were exported and how many were not.

- `check_name` is the Cejel criterion identifier the finding belongs to.
- `fingerprint` is the SHA-256 of rule, path, line and the finding summary, so the same finding
  keeps the same fingerprint across runs.
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
- The template has not been run on a GitLab runner, and its YAML is checked in this repository only
  by structural assertions, not a YAML parser or GitLab's CI lint. Run GitLab's CI lint on the
  including project before first use.
- `npx` needs the npm registry once per job unless the package is cached or mirrored.

## Next step: CI/CD Catalog component (not published)

Catalog components must live in a GitLab project, so nothing is published from here. The layout
for a later move:

```
templates/cejel.yml      # a `spec:` header, then the job below
```

```yaml
spec:
  inputs:
    version:
      default: '0.6.3'
    min_score:
      default: ''
---
cejel:
  stage: test
  image: node:22
  script:
    # same script as ci/gitlab/cejel.gitlab-ci.yml, reading $[[ inputs.version ]]
    # and $[[ inputs.min_score ]] in place of CEJEL_VERSION and CEJEL_MIN_SCORE
  artifacts:
    when: always
    paths: [.cejel/]
    reports:
      codequality: gl-code-quality-report.json
```

Creating the gitlab.com namespace and project is the operator's step.
