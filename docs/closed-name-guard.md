# Closed-name guard

`scripts/check-closed-names.mjs`, run on every pull request as the `closed-name-guard` check
(`.github/workflows/closed-name-guard.yml`), fails a change that adds a closed name to this public
repository. It exists because nothing scanned what is committed here for closed names: an
agent-written record put two private repository names on public `main` (alfred #2453, removed in
#411).

The pull request being judged never supplies the judge: the workflow, the checker, its tests and
the list all come from the base branch. See [Who judges](#who-judges).

## What it reads

- Only what the change **adds**: added lines of `git diff -U0 <base>...<head>`, and added, renamed
  or copied file paths. Removed and context lines are never read, so closed names already present in
  the August experiment files, which stay by operator ruling, do not fail every later change.
- Candidates per added line: every maximal run of `[A-Za-z0-9._/-]`, lowercased, trailing `.git`
  removed; that run split on `/`, `.` and `_` with hyphenated compounds kept whole; those parts split
  again on `-`; each pair of adjacent `/`-segments joined by `/`. A word that merely contains a name
  with other letters attached is not a candidate.
- **One exemption.** A run that is exactly the path of a file tracked at the base commit (with or
  without a leading `./`, and ignoring trailing full stops so a citation can end a sentence) is not
  checked, and nor is anything derived from it. A new file whose own path holds a closed name is not
  tracked at the base, so it is still caught.
- The deny list is `scripts/closed-name-hashes.json`: sha256 of each lowercased name. The
  repository never spells the names.

**Unsalted hashes of short names can be recovered by guessing, so the list prevents accidental
disclosure, not a determined reader.**

## What it prints

A hit is `closed_name_hit: <file>:<line> sha256:<12-hex prefix>`, or `<file> (added path)`. The
matched text is never printed. A file path that itself holds a closed name is printed as
`[path withheld, diff file #N]`. The summary line states the counts examined, so "checked nothing"
and "checked everything" never print alike.

## Refusals (exit 2, never a pass)

| code | condition |
|---|---|
| `closed_name_guard_refused_empty_diff` | the diff is empty |
| `closed_name_guard_refused_unreadable_list` | the list file is missing or not JSON |
| `closed_name_guard_refused_empty_list` | the list holds no hash |
| `closed_name_guard_refused_malformed_list` | no `sha256` array, or an entry is not 64 lowercase hex |
| `closed_name_guard_refused_bad_revision` | a base or head argument does not name a commit |
| `closed_name_guard_refused_usage` | wrong arguments |

## Measured 2026-10-06 (local, `pnpm exec node`, Node v22.15.0; CI pins 22.23.1)

Expected values were stated in the goal card before measuring.

| run | expected | observed |
|---|---|---|
| tests before the checker existed (`0f8babe`) | all red | 16 tests, 0 pass, 16 fail |
| tests with the checker (`e9a115f`) | all green | 16 pass, 0 fail |
| `a08b235^1...129e7c3` (parent of #390's merge to #411's merge) | 0 hits; August citations exempt | ok, 0 hits; files=53 addedLines=4983 addedPaths=31 exemptRuns=90 |
| `a08b235^1...a08b235` (#390 alone) | hits | 22 hits in 3 files: `docs/cited-commits-inventory-2026-10-02.md` (lines 92, 144), `docs/experiments/CITATION-ERRATA.json` (lines 85–115), `scripts/check-cited-commits.mjs` (lines 39, 78) |
| #390 per commit: `936bf1b`, `577338a`, `88f04b4` | — | ok, 0 hits each |
| #390 per commit: `d15a894` | — | 2 hits, `scripts/check-cited-commits.mjs` 37, 57 (`ca762fe6450b`) |
| #390 per commit: `2b4f063` | — | 7 hits, `docs/cited-commits-inventory-2026-10-02.md` 92, 140; `scripts/check-cited-commits.mjs` 39 |
| #390 per commit: `edbed82` | — | 14 hits, `docs/experiments/CITATION-ERRATA.json` 85–115 |
| #397 alone, #411 alone | 0 hits (both remove names) | ok, 0 hits each |
| each of the last 80 first-parent commits on `main` (#304 … #411) | hits only in #390 | 79 ok, 1 hit (#390); no false positive |
| this change's own diff against `origin/main` | 0 hits | ok, 0 hits |

The #390 result is wider than the errata: the same pull request added list names to two other
files, both since removed (net 0 over the range). A net diff over a range cannot see exposure that
was added and removed inside it, and git history keeps that exposure public regardless.

## Mutation table

Each mutation was applied to `scripts/check-closed-names.mjs`, the suite run, and the file
restored (`git checkout -- scripts/check-closed-names.mjs`; suite back to 16/16 after).

| mutation | tests that went red |
|---|---|
| delete the empty-diff refusal | 11 (empty diff), 15 (commit mode) |
| delete the unreadable-list refusal | 12 (missing list) |
| delete the empty-list refusal | 13 (empty list) |
| delete the malformed-list refusal (entry shape) | 14 (malformed entry) |
| disable the tracked-path exemption | 5 (citation exemption), 15 (commit mode) |
| always print the file path | 10 (output never holds the token) |
| skip the added-path check | 7 (new file), 8 (rename), 10 |
| drop owner/repo pair candidates | 1 (every shape) |

Not mutated: the `no sha256 array` branch of the malformed-list refusal, and the bad-revision and
usage refusals; no test names them.

## Who judges

A list anyone can shorten protects nothing. As first written (`267c258`), the workflow ran on
`pull_request`, so the workflow, the checker and the list all came from the pull request's own
head: a pull request that removed a hash and added that name passed, and so did one that edited the
checker or the workflow's steps. A head checkout also applies the head's own `.gitattributes`, so a
pull request could mark its files `-diff` and the checker would read no added lines.

Now the base copy judges:

- The trigger is `pull_request_target`, so GitHub runs the workflow file as it stands on the base
  branch. Permissions are `contents: read`; no secret is referenced.
- The job checks out `github.sha`, the base-branch commit the workflow file was read from, with
  `persist-credentials: false`. The workflow, the checker, its tests and the list are one revision.
- The head is fetched by SHA (`github.event.pull_request.head.sha`) as git objects only. It is never
  checked out, and nothing from it is installed, tested or run. The job asserts the working tree is
  still the base, then runs the base's checker with the base's list on `<base-sha>...<head-sha>`.
- `scripts/check-closed-names.node-test.mjs` pins this. Three tests build a temporary repository
  whose head shortens the list, replaces the checker with an always-pass stub, or marks its files
  binary; each shows the head's own copy passing, then requires the copy the workflow selects to
  fail. A static test requires `pull_request_target`, `contents: read` alone, one checkout at the
  base ref, no head-side checkout, install or script, and the head SHA only in the fetch and the
  checker's head argument.

**Bootstrap.** A base without this workflow and checker cannot judge. The pull request that adds
them (#412) gets no `closed-name-guard` run at all, since `pull_request_target` reads the workflow
from `main`; it is judged on review. From the next pull request on, the base copy judges.

**Required check.** After #412 merges, make `closed-name-guard` a required status check on `main`.
A pull request that deletes or renames the workflow is still judged by the base's copy, but once it
merges, later pull requests get no `closed-name-guard` run, which reads like no failure. As a
required check, a missing run blocks the merge instead.

### Measured 2026-10-06 (local, `pnpm exec node`, Node v22.15.0; shellcheck 0.11.0)

Expected values were stated in the goal card before measuring. Execution mode for every row: a
local run of the suite or checker in this worktree, not CI.

| run | expected | observed |
|---|---|---|
| suite at `31cc4a1` (new tests, `267c258`'s workflow and checker) | new behavioural and static tests red; the 16 earlier tests green | 21 tests, 17 pass, 4 fail (17, 18, 19, 20); each behavioural failure is "judged by the head's copy: expected exit 1, got 0" |
| suite at `2d661c3` (base-copy workflow) | all green | 21 tests, 21 pass, 0 fail |
| `shellcheck -s bash` on the workflow's three `run:` blocks | clean | exit 0, no findings |
| the branch's own diff, `origin/main...HEAD` (`129e7c3...2d661c3`) | 0 hits | ok, 0 hits; files=6 addedLines=1025 addedPaths=6 exemptRuns=17 list=11 |

Workflow mutations, each applied to `.github/workflows/closed-name-guard.yml`, the suite run, and
the original bytes restored:

| mutation | tests that went red |
|---|---|
| trigger back to `pull_request` | 17, 18, 19, 20 |
| `pull_request` added beside `pull_request_target` | 17, 18, 19, 20 |
| check out `github.event.pull_request.head.sha` | 17, 18, 19, 20 |
| drop the checkout `ref` (GitHub's default is still the base) | 20 |
| `contents: write` | 20 |
| add `pull-requests: write` | 20 |
| `persist-credentials: true` | 20 |
| `git checkout "$HEAD_SHA"` after the fetch | 20 |
| `pnpm install` before the tests | 20 |
| `--list` override on the checker | 20 |
| head SHA inlined as `${{ }}` in a `run:` block | 20 |
| drop the base-checkout assertion | 20 |
| reference `secrets.GITHUB_TOKEN` | 20 |
| `cache: pnpm` on setup-node | 20 |

Not verified here: how GitHub runs the job. `pull_request_target` reads the workflow from `main`, so
#412 gets no run, and the first observed run is the next pull request after #412 merges.

Remaining limits:

- A file git treats as binary (one holding a NUL byte) shows no added lines, so a closed name inside
  it is not read. The checker counts it as a file but not its content.
- The tests and the workflow are judged by the base's copies too, so a weakening of either is
  visible only to review of the pull request that makes it, and takes effect from the next one.

## Signature route (not taken)

The repository has one mechanism that requires the operator's signature on a file:
`scripts/check-calibration-signatures.mjs` (`calibration-signature` check,
`.github/workflows/calibration-signature-guard.yml`). Every commit in a pull request that touches a
path in its `GUARDED_PATHS` (`FREEZE.md`) or `GUARDED_PATH_PREFIXES` (`docs/calibration/`) must
carry an SSH signature from a key in `docs/security/allowed-signers`, or the check fails. It runs on
every pull request to `main`, with no path filter.

How `scripts/closed-name-hashes.json` could be put under it (not done here; the mechanism is
unchanged):

1. Add `scripts/closed-name-hashes.json` to `GUARDED_PATHS` in
   `scripts/check-calibration-signatures.mjs`, and list it in `docs/security/README.md`.
2. Merge such pull requests with `--merge`; a squash merge substitutes GitHub's web-flow key and
   reads `E`.
3. `calibration-signature` must be a required status check on `main`. Not verified here: branch
   protection is not readable with this runner's commands.

Limits of that route, which the operator should weigh:

- `calibration-signature` reads its configuration from the pull request's own checkout, so a change
  that shortens the list could, in the same pull request, remove the path from `GUARDED_PATHS`.
  The closed-name guard no longer has that gap (see [Who judges](#who-judges)), so the signature
  route would add operator sign-off on list changes, not close a bypass.
- The measurement-freeze transition takes the same base-side approach for its allowlist, reading
  `docs/security/allowed-signers` from the transition's parent commit
  (`scripts/check-measurement-freeze.mjs`).
