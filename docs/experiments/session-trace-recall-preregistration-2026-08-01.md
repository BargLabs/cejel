# Archived execution-trace recall preregistration — 2026-08-01

Status: preregistered before candidate-level transcript extraction

This experiment measures a new discovery channel for real, mechanically replayable defects:
archived Codex, Claude Code, and Claude Cowork execution traces. It does not revise the measured
GitHub A1–A3 queries. It tests whether development-session evidence can discover additional fix
commits that meet the same independent reverse-patch oracle used by the GitHub structural strata.

The session trace is a **discovery channel only**. A transcript's account of its own red-to-green
work is not accepted as the final oracle. Every qualifying candidate must still reproduce
green → reverse-source red → restore-full-fix green mechanically at the frozen repository tip.

## Estimand and reporting boundary

The primary estimand is the conversion rate from a deduplicated, structurally selected archived
session trace to a new qualifying anchored defect. Results will be reported separately for:

1. GitHub A1 reverts;
2. GitHub A2 CI/deployment red-to-green transitions;
3. GitHub A3 review-comment line-touch transitions; and
4. archived execution traces, split by provider and product.

The execution-trace stratum will not be pooled with A1–A3 for a headline recall or scoping result.
A secondary all-source count may be shown only with an explicit warning that the strata have
different selection effects. Session traces select defects caught inside an authoring session and
are expected to skew toward shallower, immediately test-detectable failures.

The existing `13` is the GitHub A1–A3 ceiling, not the overall anchored-defect ceiling.

## Frozen source boundary

The source inventory was frozen before candidate-level transcript parsing. Each JSONL file was
recorded by source-relative path, byte size, modification time, and SHA-256. The canonical sorted
manifest has:

- generation time: `2026-08-01T14:54:06.165Z`;
- files: `8,551`;
- bytes: `22,120,164,311`;
- root SHA-256: `8ede95d65f64710cd92c9f33cde7330f5b84099ee5ccba68885be2e1c68bddd2`.

| Source label | Frozen root | JSONL files | Bytes | Unique raw content hashes within source |
|---|---|---:|---:|---:|
| `codex-archived` | `/Users/bargs/.codex/archived_sessions` | 1,675 | 10,577,874,876 | 1,675 |
| `codex-active` | `/Users/bargs/.codex/sessions` | 854 | 740,634,850 | 854 |
| `claude-code` | `/Users/bargs/.claude/projects` | 919 | 563,139,831 | 919 |
| `alfred-trace` | `/Users/bargs/.alfred/trace/archive` | 4,165 | 7,795,195,993 | 3,188 |
| `cowork-archive` | `/Users/bargs/.alfred/trace/cowork-archive` | 181 | 349,010,023 | 181 |
| `cowork-live` | `/Users/bargs/Library/Application Support/Claude/local-agent-mode-sessions` | 643 | 1,756,910,269 | 642 |
| `cowork-partial-141248` | `/Users/bargs/Library/Application Support/Claude.partial.20260611-141248/local-agent-mode-sessions` | 114 | 337,398,469 | 114 |

The second partial Claude root contained no JSONL and contributes zero. Any file whose current
bytes do not reproduce its frozen hash is excluded. Files created after the manifest are outside
the experiment. The full manifest is held at `/tmp/session-trace-source-manifest.json`; the root
digest above is the committed freeze commitment.

## Pre-funnel deduplication

Deduplication occurs before any funnel count.

1. Parse only provider-structured session metadata to obtain provider and session ID.
2. Group records by `(provider, session ID)` across all source roots and migrated paths.
3. When the same session ID has multiple copies, select the copy with the greatest valid JSONL
   event count; break an equal-count tie by lexicographically smallest raw SHA-256.
4. Sessions without a stable provider session ID are grouped by raw content SHA-256.
5. After session-level extraction, deduplicate candidate defects by `(repository, full fix SHA)`.
6. A candidate already present in GitHub A1–A3 is reported as overlap and does not increase the
   new-seed numerator.

Raw path count, unique content count, unique session count, provider count, product count, and
cross-source duplicate count will all be reported. Migrated `/Users/houman/...`,
`/Users/bargs/...`, machine-labelled Air, MacBook, and any other copies receive no special-case
credit; the identity rules above control them uniformly.

## Product scope and frozen replay tips

The product scope matches the GitHub A1–A3 measurement. Worktree paths are normalized to these
canonical repositories without reading session titles or natural-language prompts.

| Repository | Frozen `main` replay tip |
|---|---|
| `BargLabs/cejel` | `97564ad17ddde4c64d213f78c98d316c01b0c12a` |
| `BargStudio/egbert` | `b8346c235a9607c0efff31af6bb44a25ee4d16bb` |
| `houman44/site-machine` | `1e4106f131f9af27a9a314a0dbb2ecc35c09b441` |
| `BargLabs/alfred` | `76a631be63cf1be2cd4d9c6b303626a7124864c4` |
| `houman44/edwin` | `8a9e006d1bae6653f253608ddc11eb93570fc5a1` |
| `BargStudio/therasyn` | `39f228590c2b2ecb47ddb420709d15c9271ad65a` |
| `houman44/knut` | `4609f13c43f8b772db2aee7020bd9dad8ffeca16` |
| `BargLabs/edwy` | `99c1139ba187d7181ff9923edd782f66cc599aec` |
| `BargLabs/wilfrid` | `da0a474d361dd472c92e59c07b63b6139c390e42` |
| `houman44/barglabs-site` | `1e164da9400b0c7b8f073f2df5bafad3af48d643` |
| `BargLabs/cejel-site` | `5ed796e3dc9926ae69e0b2b018026c099d211a2e` |

A fix commit must be an ancestor of the corresponding frozen tip. Later commits are outside this
experiment rather than silently moving the replay boundary.

## Primary structural discovery rule

Only structured tool calls, structured tool results, timestamps, working directories, edit paths,
commit/PR records, and test-runner output are eligible. User prompts, assistant prose, session
titles, commit messages, PR titles, and PR bodies are not selectors.

A unique session emits a primary discovery candidate only when all events below occur in order:

1. **Named red test.** A structured shell tool invokes a recognized test runner and its structured
   result is non-zero or contains a runner-native failing-test record. The output must expose at
   least one named test or node ID. A bare compilation error, suite-setup failure with all tests
   skipped, timeout, or agent statement that tests failed does not qualify.
2. **Source edit.** A later structured edit changes at least one non-test source path. Eligible
   edits are provider-native edit/write/patch tools or a structurally parsed patch command. Merely
   discussing a file or reading it is not an edit.
3. **Same named test green.** A later structured test invocation exits zero and covers the named
   failing test. Coverage is established when the command selects the exact node ID, the same test
   file, or a containing suite/package whose path selection necessarily includes that file.
4. **Anchor action.** A later structured Git operation or provider PR-link record identifies a
   commit or merged PR. The resulting full 40-hex commit must resolve in the canonical repository
   and its patch must contain the intervening source edit.

If multiple red tests precede the same fix anchor, the candidate is one fix with multiple oracle
tests. If a session contains multiple independently anchored fix commits, each may be a candidate.

Recognized runner families are pytest, Vitest, Jest, Mocha, Playwright, Node test, Bun test, Cargo
test, Go test, and package-manager test invocations. Parser support for additional runner syntax may
be added only when a repository's checked-in test configuration proves it is a test command; yield
or candidate content may not justify adding a syntax.

## Conservative sensitivity rule

The exact-command analysis is a sensitivity check, not the primary selector. It requires the green
test command, after normalization of whitespace and ephemeral temporary paths, to equal the red
test command byte-for-byte. Primary and exact-command yields will be reported side by side.

No candidate is rejected from the primary result merely because the agent narrowed or broadened
the later command while still necessarily covering the same named test.

## Commit resolution and defect qualification

Discovery candidates then face the same four qualification conditions as A1–A3:

1. The anchored commit/merged PR fixes a defect, not a feature, refactor, documentation-only change,
   or test-only repair. This is judged from the patch and repository state, not message text.
2. The anchored change touches both non-test source and test files.
3. Reversing only the fix's source hunks at the frozen tip makes at least one test changed by the
   anchored change fail. The session-named test is run first; all changed tests are the fallback.
4. Restoring the full fixed source makes the same test set pass.

Patch application may use direct `git apply --reverse` and then `--3way`. Conflicts are not repaired
by hand. A candidate that cannot reproduce both red and restored-green is excluded even if its
transcript contains an apparently perfect red-to-green sequence.

All changed tests must first pass on the fully fixed frozen tip. Existing unrelated failures do not
count as an oracle. Test runner environment accommodations may disable caches or optional plugins,
but may not alter product code, tests, assertions, fixtures, or expected values.

## Credential and privacy boundary

Raw transcripts, prompts, shell commands, tool output, diffs, environment variables, and history
lines will not be copied into the repository or result document. Candidate extraction emits only:
provider, hashed session identity, canonical repository, event timestamps, normalized non-secret
file paths, named tests, PR number, and full commit anchors.

Before any retained output is written, values are scrubbed for GitHub tokens, API keys, AWS keys,
JWTs, bearer credentials, URLs with embedded credentials, `.env` assignments, and common
`token`/`secret`/`password`/`api_key` shapes. A redaction hit records only its category and count.

Shell history is recovery metadata only. It may locate repository timestamps, test invocations, or
commit commands, but it cannot establish red or green and cannot be the oracle. It must be scrubbed
in memory before any index or corpus artifact is emitted. Raw shell-history lines are never stored.

## Pre-observed aggregate facts

Before this preregistration, a format-probing inventory inspected metadata/key shapes and emitted
aggregate counts only. It did not emit session text or candidate identities. Those observations are
disclosed because they informed the yield prediction:

- 933 unique product-relevant Codex/Claude sessions contained recognizable test invocations;
- 599 contained an explicit failing-test signal;
- a provisional Claude parser found 147 red → edit → later-green sequences;
- 28 of those reran the exact normalized command;
- 139 of the 147 and 27 of the 28 carried a commit or PR action;
- the provisional Codex parser recognized its red events but not its nested edit formats, so its
  sequence count is known to be a parser lower bound and is not used as a result.

These are discovery-pipeline observations, not qualifying defects and not denominator entries.

## Preregistered yield prediction

The complete frozen scan is predicted to produce:

| Stage | Primary named-test rule | Exact-command sensitivity |
|---|---:|---:|
| Deduplicated trace candidates before commit resolution | 70–140 | 20–45 |
| Unique resolvable fix anchors after session and A1–A3 deduplication | 45–100 | 15–35 |
| New defects passing independent reverse-patch qualification | **20–45** | **8–22** |

The primary point prediction is **32 new qualifying defects**, for a GitHub-plus-session inventory
of 45 unique mechanically replayable defects before any other discovery channel. This is a
prediction, not a target or stopping rule. The scan processes every frozen session regardless of
whether the observed yield is below, inside, or above the interval.

No n=200 forecast is preregistered from the provisional Claude counts. A future arrival forecast
requires measured, deduplicated yields from every included stratum and must preserve their separate
selection functions.

## Required result artifact

The result must report:

1. raw files, unique content hashes, unique session IDs, and duplicate removals by source;
2. funnel counts by provider and product for named red, source edit, same-test green, anchor
   resolution, A1–A3 overlap, and all four qualification conditions;
3. primary named-test and exact-command sensitivity yields separately;
4. every qualifying repository, PR, full fix SHA, parent SHA, touched files, and named failing test;
5. independent green → reverse-source red → restore-green evidence;
6. exclusions and parser coverage gaps, including unsupported session formats;
7. ADR-0013 D-series distribution by discovery stratum;
8. shell-history redaction categories/counts if shell recovery is used; and
9. prediction-versus-observation reconciliation without post-hoc widening of the interval.

No existing dual-control preregistration, result, or erratum may be modified by this experiment.
