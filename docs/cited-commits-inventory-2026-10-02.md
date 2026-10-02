# Cited-commit inventory — 2026-10-02 (cejel #368)

CONSTRAINTS-VERSION: 2026-08-01.5 (read from `origin/main`).

Scope: every hexadecimal token of 7 to 40 characters (bounded by non-hex characters on both
sides) in `docs/experiments/**` and `leaderboard/RUBRIC_CHANGELOG.md` on `origin/main`
`e2651ccad95f91bd042473388b4675ac454442b1`, after `git fetch origin --tags`. Execution mode:
local macOS worktree, `git` against this repository only, no network beyond the fetch.

This file deliberately lives outside the scanned paths, so its own citations are not checked.

## Predictions (written and committed before measuring)

Counted over distinct tokens (one token, many occurrences, counts once).

| Class | Predicted |
|---|---|
| commit reachable from `main` | ~150 |
| commit reachable only from an `evidence/*` tag | ~4 (the 0.4.9 preregistrations `0f80959`, `680b9d3`, plus the #307 mutation) |
| commit present, reachable from neither | ~10 |
| blob or tree | ~20 |
| nothing | ~600, dominated by pure-decimal runs (dates, counts) and alfred/lab_notes SHAs |

Current `main` failures under the commit rule: predicted a handful (1–10); 0 is not assumed.

The predictions above were committed at `936bf1b` before any measurement ran.

## Step 1 — measured

Measured with `scripts/check-cited-commits.mjs` itself (`inventory()`), so the inventory and the
check classify identically. Token rule as implemented: lowercase `[0-9a-f]{7,40}` bounded by
non-alphanumerics (so `v0a1b2c3` and 64-hex SHA-256 values never match). 27,271 occurrences,
9,872 distinct tokens, 154 files.

Distinct tokens (occurrences in parentheses), in four object-store views:

| Class | Predicted | A. operator worktree, branches + tags | B. A + `refs/pull/*/head` | C. CI clone, branches + tags | D. C + `refs/pull/*/head` (proposed workflow) |
|---|---:|---:|---:|---:|---:|
| commit reachable from `main` | ~150 | 104 (252) | 104 (252) | 104 (252) | 104 (252) |
| commit reachable only from `evidence/*` | ~4 | 4 (21) | 4 (21) | 4 (21) | 4 (21) |
| commit present, reachable from neither | ~10 | 8 (10) | 15 (22) | **0 (0)** | 14 (20) |
| blob or tree | ~20 | 82 (184) | 83 (187) | 83 (187)\* | 83 (187)\* |
| nothing | ~600 | 9,674 (26,804) | 9,666 (26,789) | 9,681 (26,811) | 9,667 (26,791) |

\* Views C and D are computed, not run in a fresh clone (a clone was not permitted in this
session): a commit counts as present only if reachable from `refs/remotes/origin/*`, a tag, or
(D) a pull-request head. Blob/tree presence was not re-derived for C and D.

The `evidence/*` class is exactly `0f80959`, `680b9d3`, `1bc56cd`, `2242959` — all
`evidence/v17-delta-0.4.9-preregistrations`.

**Prediction misses.** `main`-reachable was overestimated (104 vs ~150). Blob/tree was 4× the
prediction: preregistrations pin file blobs by git id. "Nothing" was 16× the prediction, and not
for the predicted reason: pure-decimal runs are only 9 distinct tokens; 9,374 of the 9,674 come
from JSON/JSONL data files pinning external-repository revisions.

**View C is the finding that shaped the design.** In a stock `actions/checkout` clone the
"present but unreachable" class is empty: a squash-merged, deleted branch takes its commits with
it, so every lost preregistration commit becomes a token that resolves to nothing — the same
class as an alfred SHA. A check built only on "a commit must be reachable" would pass on `main`
today and would not have caught #306. GitHub keeps `refs/pull/<n>/head` for every PR, so the
workflow fetches those: 14 distinct lost commits move from "nothing" back to "commit, unreachable"
(view D) and are caught on object evidence, with no grammar.

### Nothing-class contexts (view A; first matching pattern wins)

| Pattern | Occurrences | Distinct | Files | Up to three examples |
|---|---:|---:|---:|---|
| JSON/JSONL/TSV/CSV data value | 26,267 | 9,374 | 39 | `d-series-base-rate-2026-08-02/owned-corpus.json` key `revision` (21,914 occurrences across files); `stage0-manifest.order.jsonl` key `revisionAtOrderFreeze` (2,050); `a2-…-v24-…/result.json:55` key `privateAlfredCommit` |
| Code file inside an experiment | 1 | 1 | 1 | `v17-behaviour-delta-0.4.9-…/harness/prepare-checkouts.sh:5` `ALFRED_COMMIT=95e05c3…` |
| Pure decimal run | 13 | 9 | 8 | `z = 1.959963984540054`; `[0.36142299619873297, 0.6976761109230025]` |
| SHA-256/digest/hash named on the line | 54 | 30 | 26 | `a3-b6-…-v1-closeout:18` "result JSON blob / SHA-256 \| `f6340185…`"; truncated `dc723f53…` corpus digests |
| Another repository named on the line | 113 | 69 | 40 | "Alfred commit `07ac55d2…`"; "\| Alfred merge \| `f8e48ff8…` \|"; "`BargLabs/alfred@748cd819…`" |
| Commit/merge/preregistration label, no repository on the line | 77 | 64 | 44 | "The fixture-only commit `282468d`" (cejel, lost in squash #64); "\| V1 encrypted-evidence merge \| `02ce1737…` \|" (alfred, named elsewhere); "`git range-diff`… stable patch ID `ef784f23…`" (a patch id) |
| Other | 279 | 208 | 60 | "\| Evidence manifest / ciphertext blobs \| `34b13c31…` \|" (alfred blobs); "`748cd819…`. It contains twelve new synthetic…" (alfred) |

## Step 2 — the rule for tokens that resolve to nothing

Prose only. JSON and other data files are excluded from this rule (they still face rule 1),
because 26,267 of their 26,364 tokens (99.6%) resolve to nothing — overwhelmingly
external-repository revisions keyed as data — and their commit-named keys are split
between cejel and alfred (`preregistrationCommit` vs `privateAlfredCommit`).

A token that resolves to nothing, in a Markdown file, is a **cejel commit citation** — and must
resolve — when:

1. it contains a letter a–f;
2. its sentence, with backticked code spans removed, carries a commit label: commit(s/ted),
   merge(s/d), squash(ed), or a preregistration/preregistered word. A Markdown table row is one
   sentence;
3. neither its sentence nor the prose sentence before it names another repository: alfred,
   lab_notes, maeve, bede, "private", upstream, an `owner/repo@sha` other than `BargLabs/cejel`,
   or a non-cejel `github.com/` URL;
4. it is not immediately preceded by sha256/sha512/digest/patch id, nor followed by `…`;
5. no occurrence of the token (or a longer/shorter form of it) anywhere in the scanned record is
   attributed to another repository by (3), or sits under a JSON key naming alfred/private/
   upstream/lab_notes.

`BargLabs/cejel@<sha>` and `cejel <sha>` count as citations regardless of (2).

Alternatives measured and rejected: a paragraph-wide window for (3) lost `a34da1a`, a real 0.4.9
squash victim, because the attribution in (5) then inherited the wide window; a sentence-only
window flagged "At Alfred harness commit X. … Recorded result commit Y" and still does when two
sentences intervene.

## Current `main` failures

Observed in CI on PR #390's first run (GitHub Actions run `36945351019`, merge ref of
`2b4f063` into `e2651cc`): `27271 tokens scanned against origin/main and 2 evidence/* tag(s);
36 failure(s), 0 pending`. That matches computed view D exactly.

View D (the proposed workflow): **36 failing occurrences, 28 distinct tokens** — rule 1: 20
occurrences / 14 distinct; rule 2: 16 occurrences / 14 distinct. The operator worktree reports
37, because a local loose object turns `a34da1a`'s second citation into a rule-1 failure.

### Rule 1 — commit exists under `refs/pull/*/head`; remedy: an `evidence/*` tag

Each cited commit is an ancestor of the PR head shown, so one tag per PR head covers every
citation in its row. Proposed (operator, after review):

| Cited | Where | PR head (`refs/pull/<n>/head`) | Proposed tag |
|---|---|---|---|
| `607a9531…` | `d1-precision-gate-2026-07-31.json:4` | #62 `49e7f193331dfe30e9bcf0c978b016efcfda204a` | `evidence/62-d1-detector` |
| `e6d33c42…` | `d5-precision-gate-2026-07-31.json:4` | #63 `17cf521c475549b675dd85266fa3d69e1215d50a` | `evidence/63-d5-detector` |
| `4b35f2b`, `7af6118` (×2) | `d4-acceptance-preregistration-2026-07-31.md:3,30`; `d4-precision-gate-2026-07-31.json:4` | #65 `08f39a844135d93ffc0783f9d68bef8e1390e407` | `evidence/65-d4-acceptance` |
| `5c92625e…` (×4) | `llm-v1-9-v3-cross-policy-audit-2026-08-10/{bindings.json:13,preregistration.md:24,result.json:10,result.md:14}` | #25 `c67503387b83509bf4d7000012c006e0a0a3a697` | `evidence/25-llm-detector-source` |
| `025f1016…` (×3) | `pr51-paired-measurement-2026-08-08/preregistration-bindings.json:11`; `pr51-paired-measurement-v2-2026-08-08/{preregistration-bindings.json:12,preregistration.md:33}` | #51 `025f1016d121a13545ad557e3e2843d808f2c7f4` | `evidence/51-original-head` |
| `88ede856…` | `v17-accuracy-rebind-2026-08-05/evidence-partition-preregistration.md:13` | #91 `105d2f0f4609fa629e116cf37766672e9872fc34` | `evidence/91-v17-partition-preregistration` |
| `bded8cac…` | `session-derived-recall-scoring-result-2026-08-06.md:9` | #100 `f9c82eb3c0d9581cc5bd1841e96344fa456b2a81` | `evidence/100-session-recall-preregistration` |
| `6420b98e…` (×2) | `in-scope-detection-recall-preregistration-2026-08-06-addendum-01.md:53`; `in-scope-detection-recall-v2-preregistration-2026-08-09.md:11` | #103 `bed62b556a2f5fccf6c9766e7cae5c04d88ec67e` | `evidence/103-in-scope-recall-preregistration` |
| `aa57822b`, `6aec928` | `v17-behaviour-delta-0.4.9-2026-09-15/PREREGISTRATION.md:14`, `PREREGISTRATION-2.md:16` | #308 `6aec9286d517af4658eab7cea6eb13459d6481c5` | `evidence/308-v17-delta-0.4.9-candidate` |
| `afb82ff3`, `153218d` | `v17-behaviour-delta-0.4.9-2026-09-15/PREREGISTRATION.md:15`, `PREREGISTRATION-2.md:19` | #309 `153218d1a3d1f69de992ae7faaf7677e1ad204e1` | `evidence/309-v17-delta-0.4.9-candidate` |

### Rule 2 — resolves to nothing under the grammar

| Cited | Where | Assessment | Proposed remedy |
|---|---|---|---|
| `282468d`, `7d2c196` | `d2-acceptance-preregistration-2026-07-31.md:3,20` | cejel; lost when #64 was squash-merged (`e072bd7` is single-parent and its body lists "preregister D2 acceptance case"); not an ancestor of `refs/pull/64/head` | erratum: the cited commits are not recoverable from origin; name the squash `e072bd7` as the commit that carries the bytes |
| `5f4217f`, `2bf342f` | `d3-acceptance-preregistration-2026-07-31.md:3,26` | cejel; lost in the #66 squash (`97564ad`); not an ancestor of `refs/pull/66/head` | erratum, as above, naming `97564ad` |
| `a34da1a` | `v17-behaviour-delta-0.4.9-2026-09-15/PREREGISTRATION-2.md:4` | cejel; a merge commit `a34da1ad06550f7626ee2134551641de487afd62` that exists only as a loose object in the operator's clone | evidence tag pushed from that clone: `git tag evidence/v17-delta-0.4.9-first-candidate a34da1ad06550f7626ee2134551641de487afd62 && git push origin evidence/v17-delta-0.4.9-first-candidate` |
| `d6248edd47f6`, `25627e00c6eb`, `75fa69511494` | `RUBRIC_CHANGELOG.md:1050,1051,1097` | ambiguous: "the self snapshot" of the leaderboard's Cejel/Alfred self rows; the paragraph names both | operator to identify the repository; erratum naming it (or an evidence tag, if cejel and still recoverable) |
| `a506a5e8…` | `criterion-path-emission-audit-2026-07-31.md:84` | alfred: "At Alfred harness commit … Recorded result commit" — two sentences after the name | erratum: "Recorded Alfred result commit" |
| `c1cd701f…` | `dual-control-downstream-labelling-retraction-2026-08-10.md:41` | alfred: a table of Alfred bindings; row "Raw result commit" | erratum: "Alfred raw result commit" |
| `b0d2212d…`, `8e73ffa4…`, `9f497be7…`, `25e711d1…` (×3) | `shape-diversity-therasyn-sitemachine-2026-08-01.md:184,197,198,200,217,236` | external: `BargStudio/therasyn` and `houman44/site-machine` | erratum: cite as `owner/repo@sha` |

Grammar precision on current `main`, by this assessment: of 14 distinct flagged tokens, 5 are
lost cejel commits, 3 are undetermined, 6 are other repositories' commits (false positives).
These are not allowlisted.

## Remedy applied (2026-10-02)

The operator pushed the eleven `evidence/*` tags above (ten rule-1 rows plus
`evidence/v17-delta-0.4.9-first-candidate` for `a34da1a`) and resolved the three undetermined
`RUBRIC_CHANGELOG` tokens as alfred commits. The other 13 rule-2 tokens (15 occurrences) are
corrected in `docs/experiments/CITATION-ERRATA.json`, which the check reads. Each entry names one
exact token, file and line. Lost-in-squash carriers are verified against main, other-repository
attributions are printed in the run log, and an entry that no longer matches anything fails.

| Measurement (local macOS worktree, view D: branches + 13 `evidence/*` tags + `refs/pull/*/head`) | Expected | Observed |
|---|---:|---:|
| `577338a` (before the register), failures | 15 (13 distinct, all rule 2) | 15 (13 distinct, all rule 2) |
| With the register, failures | 0 | 0 |
| With the register, corrected by errata | 15 | 15 |
| Register entries | 13 | 13 |
