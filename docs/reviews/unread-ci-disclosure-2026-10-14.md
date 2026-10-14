# Delegated CI that was not read — 2026-10-14

**CONSTRAINTS-VERSION: 2026-08-01.5**

Presentation only, under every selectable rubric, shaped as 0.6.4's #467 was. No score, weight,
detector, file-selection or finding change. Rubric behaviour fingerprints are unmoved, so
`leaderboard/RUBRIC_CHANGELOG.md` has no entry.

## The gap

B3 `ci_script_depth` credits test, lint, type-check and build commands it finds in every recognised
workflow file. A GitHub Actions workflow can hand that work to code Cejel does not read:

- `jobs.<id>.uses: owner/repo/.github/workflows/x.yml@ref`, a reusable workflow in another
  repository;
- a step `uses: ./path`, a local action defined by that directory's `action.yml` or `action.yaml`.

A command inside delegated code is unseen, and the certificate read as if it were absent. #467 states
how many workflow files B3 read, not what they delegate to.

## The change

`collectB3CiDisciplineEvidence` counts the delegations in the workflows it already reads
(`countDelegatedCiSteps`) and passes the count to `ciWorkflowCitationLabel`. The B3 citation becomes,
for example:

`CI workflow (2 workflow files read; 1 cited; 2 delegated steps not read (1 reusable workflow in another repository, 1 local action))`

- **Counted as another repository:** a `uses:` value of the form
  `{owner}/{repo}/.github/workflows/{file}.y(a)ml@{ref}`. A same-repository call written that way
  names content at a ref Cejel does not read, so it is counted with them.
- **Counted as a local action:** a `./path` (not `./.github/workflows/…`) whose directory holds
  `action.yml` or `action.yaml`. The directory must have no `..` segment.
- **Not counted:** a local reusable workflow (`./.github/workflows/x.yml`), which is one of the
  workflows already read; a marketplace action (`actions/checkout@v4`); a `./path` with no action
  file.
- **Zero:** nothing is added. A single workflow that delegates now renders the #467 parts
  (`1 workflow file read; 1 cited`) so the clause has a place.
- **Label cap:** the evidence label schema caps at 180 characters. If the full label would exceed it,
  only the per-kind breakdown is dropped and the count stays. Withheld workflows carry at most four
  skip reasons, so the short form fits for any count below 10,000. A unit test covers both forms.
- **A3 and B2:** these count workflow paths and read no step, so their labels pass no delegation and
  are unchanged.

### Parsing

The reader is line-based, like `extractCiRunCommands`. It reads each `uses:` key's scalar value,
strips quotes and a trailing ` # comment`, and skips lines inside a `|` or `>` block scalar. So a
commented-out `# uses:` line and a heredoc line inside a `run: |` script are not counted. No
dependency is added.

### Why the new read cannot move a status

The workflows are re-read inside `withContentReadSignal('B3', 'default_branch_ci_depth', …)`, with
the same `isRegularFile` guard and the same `readRepoText` path as `workflowTargetsDefaultBranch`.
That function already read every one of them under that signal. Skip attribution is set-based and
skip counts are deduplicated per path and reason. So a read failure here can only restate a skip
already recorded. It cannot abstain a signal that did not already abstain. The `action.yml`
existence check is `isRegularFile`, which records nothing.

## Open for the reviewer

- **Reviewer change: "composite action" became "local action".** The check cannot tell a composite action from a local JavaScript or Docker action, so the label names what it can establish. Each has an `action.yml`.
  Cejel decides from the file's presence and does not open it, as the goal specified. Telling them
  apart needs a content read of `action.yml`, which would be a new read in a scored collector. The
  CHANGELOG states this. If the wording should be "local action", it is a one-word change in
  `ciWorkflowCitationLabel` and the tests.

## Verification

All runs are on this branch, in this worktree, on 2026-10-14.

### Red first

At `cf8fc9e8` (tests only, on `902ae662`), the four disclosure tests failed under all 10 selectable
rubrics, and so did the two label unit tests (`ciWorkflowCitationLabel` was not exported). The five
"must not disclose" tests passed, as they should on unchanged code. The `U5b` fixture later gained a
heredoc `uses:` line. The identity digests were then recaptured with `src/witan/repo-signals.ts`
checked out from `902ae662` over the branch tree, and they matched the implementation's digests
exactly before they were pinned.

### Identity

- **Standing test.** `the disclosure moves nothing but evidence labels` pins, per rubric, one SHA-256
  over every new fixture's full report. Only evidence labels and the behaviour fingerprint are
  removed. The digests were captured on base code and pass unchanged on the implementation.
- **One-off full diff.** These were dumped under all 10 selectable rubrics as `report.json`, Markdown
  certificate and HTML certificate: the 30 behaviour-corpus specimens, the 6 #467 fixtures and the 8
  new fixtures. The dumps came from base code and from the implementation, and were compared with
  `diff -r`.
  - **1,320 files compared, 120 differ.** The 120 are the 4 delegating fixtures (U1, U2, U2b, U6) ×
    10 rubrics × 3 formats.
  - **320 changed lines.** Every removed line (160) is a `CI workflow` label. Every added line (160)
    is that label with the delegated clause.
  - **No other byte moved.** Every corpus specimen, every #467 fixture, and U3, U4, U5 and U5b are
    byte-identical.
- **Fingerprints.** `rubric-behaviour-fingerprint.test.ts` and `v17-scoring-surface-golden.test.ts`
  pass with no re-pin.

### Guard deletions

| Deleted | Turned red | Count |
| --- | --- | --- |
| The `action.yml` / `action.yaml` existence check (always count a `./` step) | `a step using ./.github/actions/x whose directory holds no action.yml or action.yaml is not counted: …` | 10 (one per rubric), nothing else |
| The zero-count suppression (`if (delegatedTotal === 0) return …`) | `zero delegated steps add nothing to the #467 count, …`, plus the local-reusable and A3/B2 tests, whose labels gained `0 delegated steps not read ()` | 30 |

Each deletion was restored from `HEAD` before the next.

### Suite

- `pnpm run typecheck`: clean.
- `pnpm run build`: success.
- `pnpm test`: 124 files and 2,830 tests passed. This includes `offline-guarantee.test.ts` (the
  offline-boundary guard), the fingerprint and v17 golden tests, and #467's
  `certificate-reads-disclosure.test.ts`.
- `src/witan/__tests__/unread-ci-disclosure.test.ts`: 102 tests passed.
