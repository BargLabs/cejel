# Recognized CI systems

Process-trust signals that refer to continuous integration mean, precisely: **a recognized CI
configuration was observed in the repository**. The recognizer (`isCiWorkflow`) currently
matches exactly these files:

| System | Matched configuration |
| --- | --- |
| GitHub Actions | `.github/workflows/*.yml` / `*.yaml` |
| GitLab CI | `.gitlab-ci.yml` / `.yaml` |
| CircleCI | `.circleci/config.yml` / `.yaml` |
| Azure Pipelines | `azure-pipelines.yml` / `.yaml` |
| Jenkins | `Jenkinsfile` |

## The boundary, stated plainly

A repository whose CI runs on a system outside this list — for example Google Kokoro,
Travis CI, or AppVeyor — will be scored as having **no recognized CI configuration**, which
the rubric treats as a real negative rather than as "not applicable." That is a stated
limitation, not a judgment about the repository: a well-governed project using an
unrecognized CI dialect can lose process-trust credit it arguably deserves. If your score
looks wrong here, this boundary is the first thing to check.

## Why this list doesn't change casually

Recognition rules are part of the scoring instrument. Adding a CI system changes scores, and
score-affecting changes enter only through a new, fully calibrated rubric version — never as
a hotfix to the currently published one. Known gaps are tracked for future rubric versions;
this document changes when the recognizer does, in the release that ships it.
