# Archived execution-trace anchored-defect yield — 2026-08-01

Status: measured against preregistration commit `4113562`

## Result first

The frozen session archives produced **123 primary named-test trace candidates and 3 new
qualifying defects: 2.44% conversion**. The conservative exact-command sensitivity produced
`0 / 10`. All three qualifiers came from Claude-authored Edwin sessions; Codex produced 28 trace
candidates and one mechanically replayable change, but that change was a feature rather than a
defect.

The GitHub A1–A3 population remains 13 and the session channel adds three non-overlapping anchors.
The current frozen real-anchor inventory is therefore **16**, not the provisional 40. The session
archive improves provenance and external validity, but it does not yet improve the numerical upper
bound: if a future Cejel run remains `0 / 16`, the Wilson 95% upper bound is still 19.4%.

No recall result is claimed here. This task measures and qualifies the available population before
building it into the existing harness. The three session-derived defects have not yet been scored by
Cejel.

## Prediction reconciliation

The preregistration predicted 70–140 primary traces, 45–100 unique resolved anchors, and 20–45 new
qualifying defects. The first two predictions held; the qualification prediction failed materially.

| Stage | Primary prediction | Primary observed | Exact-command prediction | Exact-command observed |
|---|---:|---:|---:|---:|
| Deduplicated trace candidates | 70–140 | **123** | 20–45 | **10** |
| Unique resolvable new fix anchors | 45–100 | **72** | 15–35 | **2** |
| New independently qualified defects | 20–45 | **3** | 8–22 | **0** |

The miss is not hidden by widening the interval. Of 72 resolved anchors, 27 source reversals did not
apply at the frozen tip, two clean controls were red, 36 reversals did not create a named failing
changed test, and four of the seven perfect red/restored-green cycles were features. Transcript
red-to-green evidence was therefore a much weaker predictor of independent replay than forecast.

## Frozen sources and pre-funnel deduplication

The committed source boundary was the 8,551-file, 22.1 GB manifest rooted at
`8ede95d65f64710cd92c9f33cde7330f5b84099ee5ccba68885be2e1c68bddd2`.

| Deduplication stage | Count | Removed at stage |
|---|---:|---:|
| Frozen source paths | 8,551 | — |
| Unique raw byte streams | 4,559 | 3,992 path-level copies |
| Byte streams unchanged when re-hashed during parsing | 4,551 | 8 post-freeze changes |
| Unique provider/session IDs | **3,517** | 1,034 additional same-session copies |

Deduplication preceded every funnel count. Exact byte duplicates across Alfred trace, active/archive,
Cowork, and migrated machine paths were removed first. Remaining copies sharing provider/session ID
were reduced to the valid JSONL copy with the greatest event count, with raw SHA-256 as the tie
breaker. No path under `/Users/houman`, `/Users/bargs`, Air, MacBook, active, partial, or archive
received independent credit merely because it was copied.

The eight files that changed after the freeze were excluded rather than silently reading their new
content.

## Primary structural funnel

“Source edit” below means a unique session containing a named red test and a structurally parsed
non-test source edit. “Same-test green sessions” means unique sessions that yielded at least one
primary trace. A session can emit more than one independently anchored candidate.

| Product | Unique sessions | Named-red sessions | Named-red + source-edit sessions | Same-test-green sessions | Primary candidates | Exact-command candidates | Resolved unique anchors | Mechanical red/restored-green | Qualifying defects |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Alfred | 1,134 | 192 | 100 | 59 | 63 | 4 | 39 | 2 | 0 |
| Edwin | 551 | 112 | 79 | 39 | 47 | 1 | 30 | 5 | **3** |
| Egbert | 1,374 | 123 | 18 | 6 | 8 | 2 | 1 | 0 | 0 |
| Site Machine | 29 | 10 | 2 | 2 | 2 | 2 | 0 | 0 | 0 |
| Edwy | 30 | 9 | 1 | 1 | 2 | 0 | 2 | 0 | 0 |
| Cejel | 57 | 2 | 1 | 1 | 1 | 1 | 0 | 0 | 0 |
| Therasyn | 18 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Barg Labs site | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Unmapped/non-product | 323 | 7 | 7 | 0 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **3,517** | **457** | **208** | **108** | **123** | **10** | **72** | **7** | **3** |

Knut, Wilfrid, and Cejel site had no unique mapped session in the frozen archive and are omitted
from the body rows rather than represented as productive zeroes.

### Yield by provider

| Provider | Primary candidates | Resolved unique-anchor participations | Mechanical red/restored-green | Qualifying defects | Candidate conversion |
|---|---:|---:|---:|---:|---:|
| Claude Code | 95 | 66 | 6 | 3 | 3.16% |
| Codex | 28 | 6 | 1 | 0 | 0.00% |
| Cowork | 0 | 0 | 0 | 0 | — |

Resolved participations can exceed unique fixes if more than one provider discovers the same fix;
no such overlap affected the three qualifiers. Cowork contributed 212 deduplicated but unmapped
sessions and no named-red event, so its zero is an observed format/content result, not an omitted
directory.

## Anchor resolution

The 123 trace candidates carried 102 commit hints and 21 PR hints. Branch commits were first
resolved locally. Off-main commits were canonicalized only through GitHub's structural
commit-to-merged-PR association; the merged-main SHA then had to be an ancestor of the preregistered
tip. PR hints likewise had to identify a merged `main` PR. Every retained canonical patch had to
contain a session-edited source path and touch both source and tests.

| Resolution outcome | Trace rows |
|---|---:|
| Resolved before defect-SHA deduplication | 75 |
| Unique canonical repository + fix SHA | **72** |
| Short commit hint absent from local object database | 17 |
| Branch commit mapped to zero merged-main PRs | 15 |
| Canonical patch did not contain a session-edited source path | 8 |
| Off-main branch commit whose GitHub PR lookup failed | 6 |
| PR hint was not a merged-main PR | 2 |

All 72 retained anchors are full 40-hex commits, resolve locally, are ancestors of their frozen tips,
contain a linked edit, and satisfy the source-plus-test file condition. None overlaps the 13 GitHub
A1–A3 qualifying anchors.

## Independent oracle funnel

The transcript's own test result was not used as the final oracle. Each canonical fix was replayed in
an ephemeral shared clone at the preregistered tip. The session-named changed test was selected when
it mapped to the canonical patch (67/72); all runnable changed tests were the fallback for five.

The exact cycle was:

1. run the selected changed tests with the full fix and require green;
2. reverse only non-test source hunks, directly or with `git apply --reverse --3way`;
3. require a runner-native named test failure;
4. restore the full fixed source; and
5. rerun the same selected tests and require green.

| Oracle stage | Anchors surviving | Lost at stage |
|---|---:|---:|
| Unique resolved fix anchors | 72 | — |
| Source reverse patch applicable | 45 | 27 |
| Selected changed tests green with full fix | 43 | 2 |
| Named test red after source reversal | 7 | 36 |
| Same test set green after restoring fix | **7** | 0 |
| Defect rather than feature | **3** | 4 |

No patch conflict was repaired by hand. Vitest used `--cache=false` for read-only linked dependencies;
pytest disabled only the optional socket-opening rerun plugin. No product source, test, assertion,
fixture, or expected value was changed.

## Qualifying catalog

### 1. Edwin PR 391 — D4 pass-by-absence

- Repository/PR: `houman44/edwin#391`
- Fix SHA: `5b374072679c3d0d5537a8317af9480dffb37fe7`
- Parent SHA: `45a43456e7e69df15cac2ebce2361955827c4cca`
- Discovery provider: Claude Code
- Hashed session identity:
  `fa1931bcf79e36d848f768fd163f7369683df479ae0c90e4e28f0999c0ed847d`
- Defect: unknown or mixed position attribution fell through an allow path, permitting an increase or
  side-flip instead of failing closed. Absence of a provable owner acted as permission.
- Named failures after independent source reversal:
  `test_ownership_guard_blocks_increase_on_unattributed_inventory`;
  `test_ownership_guard_blocks_side_flip_through_unattributed_inventory`;
  `test_ownership_guard_blocks_ambiguous_mixed_origin_inventory`.
- Files: `egbert_core/execution/fx_strategy_ownership_guard.py`;
  `egbert_core/notes/ownership_guard_failtoflat_carveout_map_2026-07-08.md`;
  `egbert_core/tests/unit/test_fx_strategy_ownership_guard.py`.

### 2. Edwin PR 376 — D1 declared-but-unread contract field

- Repository/PR: `houman44/edwin#376`
- Fix SHA: `bb50d595d5015aa498c5732824fb40610b2df95f`
- Parent SHA: `639095941cb3ccbd2ae21873d8f6a9564745bf58`
- Discovery provider: Claude Code
- Hashed session identity:
  `bf2405f0827aabe0833056b296af4f3aef7b79dfc1ef76de3515dbc6529750a4`
- Defect: the producer query omitted `signal_ts` even though the Brier-trend consumer required it,
  leaving the calibration trend permanently absent without an error.
- Named failure after independent source reversal:
  `test_load_joined_signal_rows_projects_signal_ts_for_brier_trend`.
- Files: `egbert_core/alpha/model_risk.py`;
  `egbert_core/monitoring/catboost_h1_report.py`;
  `egbert_core/scripts/polymarket_calibration_report.py`;
  `egbert_core/tests/fixtures/schema_contract.py`;
  `egbert_core/tests/unit/scripts/test_polymarket_calibration_report.py`;
  `egbert_core/tests/unit/test_catboost_h1_report.py`;
  `egbert_core/tests/unit/test_model_risk.py`;
  `egbert_core/tests/unit/test_schema_contract_helper.py`;
  `egbert_core/tests/unit/test_walkforward_oanda_fx_h1.py`;
  `notes/projection_consumer_seam_audit_2026-07-08.md`.

### 3. Edwin PR 365 — D4 pass-by-absence

- Repository/PR: `houman44/edwin#365`
- Fix SHA: `ff1b46f385951c6e0db9d34de92c14e7a3edfe05`
- Parent SHA: `16502580919b9d335e20674d3b376093c61cd423`
- Discovery provider: Claude Code
- Hashed session identity:
  `14d15f05c983fa7a74ad9ac2beeb2807947a4ef6c536fec05d6663ef32f3828c`
- Defect: an unrecognized `agent_bearer` authorization mode produced no tenant scope, and the
  explanations endpoint interpreted that absence as permission to list all tenants.
- Named failure after independent source reversal:
  `TestAgentBearerCannotReadCrossTenantData::test_explanations_scoping_rejects_agent_bearer`.
- Files: `egbert_core/api/routes/explanations.py`;
  `egbert_core/authoring/ai_seed_service.py`;
  `egbert_core/tests/unit/test_agent_bearer_cross_tenant_scoping.py`;
  `egbert_core/tests/unit/test_ai_seed_service.py`;
  `notes/security_qd_surface_reaudit_2026-07-07.md`.

## Mechanically valid changes excluded by condition 1

Four changes completed the full independent red/restored-green cycle but were not defect fixes:

| Repository | Fix SHA | PR | Reason excluded |
|---|---|---:|---|
| `BargLabs/alfred` | `36235a61c3bec1834486e53fad47c180c84b238c` | 231 | Introduced per-studio envelope encryption and its migration; a new security architecture, not a repair of a bounded defective behavior. |
| `BargLabs/alfred` | `438094989b8595cf0ee1d56ba072f556efe71bfa` | 408 | Added the console goal-dispatch UI and proxy route; feature introduction. |
| `houman44/edwin` | `2726301cedc42f930d91b9214f94378001df0aeb` | — | Added a distinct CFD paper configuration lane and its artifacts; feature/configuration introduction. |
| `houman44/edwin` | `78eb83f809c169534ca31ff2a888232ce1d7adb3` | 366 | Added the unified broker-accounts page, API, and cancellation surface; feature introduction. |

This classification used patch behavior and pre/post repository state. Commit messages, PR titles,
session titles, prompts, and assistant prose were not selection inputs.

## D-series distribution

| ADR-0013 class | Session qualifiers | n | Can carry n >= 10 alone? |
|---|---|---:|---:|
| D1 — declared-but-unread config/contract | Edwin 376 | 1 | **No** |
| D2 — swallowed error | — | 0 | **No** |
| D3 — unasserted set transform | — | 0 | **No** |
| D4 — pass-by-absence | Edwin 391, 365 | 2 | **No** |
| D5 — self-referential verification | — | 0 | **No** |
| D6 — partial-view inference | — | 0 | **No** |
| Outside D1–D6 | — | 0 | **No** |
| **Total** | — | **3** | **No** |

The session stratum is small and class-concentrated. It cannot carry any per-class denominator and
must not be pooled with the differently selected GitHub strata to conceal that fact.

## Exact-command sensitivity

The intended same-named-test rule found 123 trace candidates, 72 resolved anchors, seven mechanical
cycles, and three defects. Requiring byte-equivalent normalized red/green commands found 10 trace
candidates, two resolved anchors, and **zero** mechanical cycles. Thus the exact-command rule would
have eliminated every session-derived qualifier. It remains a useful conservative sensitivity check,
not a defensible headline selector.

## Parser and coverage limitations

- The parser recognizes provider-native edit tools and structural shell writes (`apply_patch`,
  redirection, `tee`, in-place editors, explicit Python writes, and copies). An edit hidden inside an
  unsupported arbitrary program is not credited.
- Codex yielded 28 primary candidates after its nested/legacy shell formats were supported; six
  unique anchors resolved and one replayed mechanically, but it was a feature. The earlier “one
  recognized sequence” aggregate was a parser lower bound and is superseded.
- Cowork directories were scanned and deduplicated. Their 212 unique sessions did not expose a
  qualifying named-red tool result mapped to a product repository.
- Seven named-red/source-edit sessions remained unmapped to a product, but none reached same-test
  green, so repository mapping did not suppress a candidate.
- Shell history was **not ingested or used**. It produced no oracle evidence, retained index, or
  redaction count. Any future use remains subject to scrub-before-ingestion.
- The 27 non-applicable patches show temporal decay: a historical fix can be valid in its original
  worktree yet no longer be reversible on the frozen modern tip. No manual porting was allowed.

## Reproduction

The exact scripts committed with this result emit only aggregate or scrubbed provenance. Raw
transcript text, prompts, commands, tool output, environment variables, and diffs are not written.

```bash
node scripts/session-trace-source-manifest.mjs /tmp/session-trace-source-manifest.json
node --test scripts/session-trace-extract.node-test.mjs
node scripts/session-trace-extract.mjs \
  /tmp/session-trace-source-manifest.json /tmp/session-trace-extraction.json

credential_blob=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null)
credential_token=$(printf '%s\n' "$credential_blob" | sed -n 's/^password=//p')
GH_TOKEN="$credential_token" node scripts/session-trace-resolve.mjs \
  /tmp/session-trace-extraction.json /tmp/session-trace-resolved.json

node scripts/session-trace-oracle.mjs \
  /tmp/session-trace-resolved.json /tmp/session-trace-oracle.json
```

The source manifest is expected to differ if rerun after the freeze; the committed root is the
measurement boundary. Reproduction of this exact result requires the frozen files matching that
root, not newly appended sessions.

## Consequence for recall planning

Session archives are a real discovery channel, but the independent replay bar converts them at
`3 / 123 = 2.44%`, close to the GitHub A2 conversion rather than the provisional transcript funnel.
The frozen corpus now supports 16 real anchored defects across GitHub and session discovery. That is
valuable because it can replace synthetic examples with real development history, but it does not
yet produce a tighter zero-detection interval.

The next step, if authorized separately from this measurement, is to build these three plus the 13
GitHub qualifiers into a real-anchor harness and run Cejel. The per-stratum results must remain
visible even if a secondary combined count is also reported.
