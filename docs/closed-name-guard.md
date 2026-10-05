# Closed-name guard

`scripts/check-closed-names.mjs`, run on every pull request as the `closed-name-guard` check
(`.github/workflows/closed-name-guard.yml`), fails a change that adds a closed name to this public
repository. It exists because nothing scanned what is committed here for closed names: an
agent-written record put two private repository names on public `main` (alfred #2453, removed in
#411).

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

## Who can shorten the list

A list anyone can shorten protects nothing, and today anyone opening a pull request can: the
workflow runs the head checkout's script against the head checkout's list.

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

- Both guards read their configuration from the pull request's own checkout. A change that shortens
  the list can, in the same pull request, remove the path from `GUARDED_PATHS`, and both checks
  pass. Neither `scripts/check-calibration-signatures.mjs` nor `scripts/check-closed-names.mjs` is
  itself guarded.
- The measurement-freeze transition already avoids this for its allowlist by reading
  `docs/security/allowed-signers` from the transition's parent commit
  (`scripts/check-measurement-freeze.mjs`). The same move here — read the hash list, and the
  guarded-path list, from the base commit — would stop a pull request from shortening the list that
  judges it. It needs a bootstrap: this change adds the list, so its base has none.
