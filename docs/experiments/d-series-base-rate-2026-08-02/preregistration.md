# D-series unconstructed-code base-rate scan preregistration — 2026-08-02

Status: preregistered before any acceptance-control or corpus scan.

**CONSTRAINTS-VERSION: 2026-08-01.3**

This is a measurement of the five frozen exact-signature D-series rules. It is not a detection
push. Rule edits, widening, reconfiguration, and outcome-responsive rescans are prohibited.

## Rule and harness provenance

The rule repository is `BargLabs/cejel` at
`05d5d9fca79ea9cb1d34e64fa795f9713b6d1bf1`. The five source hashes are frozen in
`control-anchors.json`. The final report must re-hash each file and affirm that all five match.
The acceptance controls and all corpus scans use the same `scanRules` invocation in
`scripts/d-series-base-rate-scan.ts`, calling the unchanged exported detector functions with the
tracked-first file inventory. No repository code, tests, hooks, builds, imports, or binaries are
executed.

All finding text that enters a log or artifact is passed through the one existing Alfred redactor
at `packages/operator-trace/src/redactor.ts`, pinned in `control-anchors.json`. No source snippet is
persisted. Adjudication evidence may be viewed only through that redactor; artifacts record paths,
lines, decisions, and reasoning, not raw snippets.

## Frozen corpus and selection

Tier 1 is the seven-entry `owned-corpus.json`: the six named Barg programme repositories plus
Knut, each at the exact local Git HEAD observed before this commit. Because several ambient
worktrees contain unrelated tracked edits, the harness scans local `git archive` snapshots of the
pinned commits. It performs no clone and no network request.

Tier 2 comprises two marked components that are never pooled with Tier 1:

1. 2,000 fresh repositories selected with the pinned v17 `stratified-hash` machinery: the same 34
   ordered structural searches, first-match stratum assignment, size bound, fork/archive filters,
   and hash ranking. The v50 allocations start at ten times their original values. A metadata-only
   feasibility check found that the no-primary-language stratum had 282 eligible identities for
   400 positions after prior-exposure exclusions. Before any source scan, that stratum was capped
   at 282 and the 118-position shortfall was redistributed by the frozen iterative
   largest-remainder rule in `tier2-selection-spec.json`; no exclusion was relaxed. The prior
   calibration population is reconstructed from pinned Alfred Git objects and excluded before
   ranking. No search uses commit-message text.
2. The exact 23 public repositories and commits in `leaderboard/corpus.json`, marked `legacy-23`.
   They reproduce the earlier 0/23 result as a harness-consistency check and are not fresh evidence.

Before Tier 2, Stage 0 selects 50 repositories by the same searches and ranking, with allocations
set by prospective largest-remainder scaling of the v50 strata from 200 to 50. Its distinct seed is
fixed in `stage0-selection-spec.json`. Those 50 identities are added to the Tier 2 exclusion set
before its order is frozen. Stage 0 therefore cannot enter the result corpus. The exact names,
commits, selection strata, query frame, and selection source hashes are frozen in the committed
selection manifests and order artifacts. Repository additions after this freeze are a separate
dated result.

The exact corpus artifact pins at preregistration are:

| Artifact | Repositories | SHA-256 |
|---|---:|---|
| `owned-corpus.json` | 7 | `47bdbd664746c691134c7225279d7fc7858ed12b2a436a9410a3dad6cc596b51` |
| `stage0-manifest.json` | 50 | `2865d453daed2332730661bf5be37591804af4f21e64b65bc562bc27f9784dcc` |
| `tier2-fresh-manifest.json` | 2,000 | `4ed7c8381de3b7a55e3d84eebdce4d04b379ca193ea079141285603145a36d48` |
| `tier2-corpus.json` | 2,023 | `2b01b4ba74b27de9e3946bde6fff0da1a2be67646874a4507141311c1a4636ff` |

The Stage 0/final intersection is mechanically zero. All 2,000 fresh entries have a frozen
revision, are unique, and do not overlap the 23 marked legacy entries.

## Yield prediction

Predictions are adjudicated-genuine instances, not raw matcher emissions. They cover the 2,023
Tier 2 repositories; Tier 1 is predicted separately because it is a correlated sensitivity check.

| Rule | Tier 2 point | Tier 2 preregistered range | Reasoning |
|---|---:|---:|---|
| D1 | 1 | 0–8 | Multiple binding-boolean surfaces exist, but graph escape abstention is deliberately broad. |
| D2 | 2 | 0–12 | Static returned messages and unused catch bindings are common separately; the exact combined shape is rare. |
| D3 | 1 | 0–6 | Filter calls are common, but the exact empty explanation ledger and three-field success return are highly specific. |
| D4 | 0 | 0–3 | The exact three-return callee plus exact three-statement caller is the narrowest signature. |
| D5 | 1 | 0–8 | Imported expected constants occur in tests, but same-module sibling-use resolution removes most candidates. |
| **Overall** | **5** | **0–37** | The earlier 0/23 is compatible with a very low nonzero base rate; the range deliberately includes a full null. |

Tier 1 prediction: 0 genuine instances, range 0–3 overall; per rule point 0 and range 0–1. These
ranges are wide because the previous owned-code observation covered only 50 Alfred files rather
than all pinned trees. Raw findings may exceed these predictions because every firing still needs
adjudication.

## Positive control and file accounting

Before Stage 0, every positive and paired negative in
`calibration/d-series/d{1..5}/acceptance/` is passed through the same detector invocation. Every
positive must fire and every negative must remain clean. Failure voids the run.

The scanner starts from the complete tracked path inventory. It reports, per repository and rule:

- analyzed files (`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`; D1 additionally
  reads `.md` and `.mdx` for frontmatter);
- excluded extensions;
- paths excluded by the production deny-list, without reading or classifying their bytes;
- non-regular or missing/stat-error paths;
- too-large files skipped, unparseable files skipped, and rule errors.

The frozen detector does not impose a size skip on tracked eligible files and TypeScript parses
with error recovery, so `tooLargeSkipped` and `unparseableSkipped` are expected to be zero. Files
over 512,000 bytes that were nevertheless analyzed are counted separately. A rule error is not a
zero: the affected repository and eligible-file count remain an explicit error row.

## Stage sequence and stopping rule

There is one run over each frozen corpus and no second pass after a disappointing outcome.

1. Stage 0 scans only the 50 burned calibration repositories, persists counts but no finding
   details, and reports clone time, transfer bytes, peak disk, scan CPU, and raw findings per 1,000
   analyzed files. Its report is posted before Stage 1 begins.
2. Stage 1 scans the seven owned snapshots without network, is reported and adjudicated before
   Stage 2 begins.
3. Stage 2 scans the 2,023 frozen public entries. Each repository is depth-one fetched at its exact
   commit, scanned, checkpointed, and deleted before the next. At most one checkout is retained.

A checkpoint resume continues the same ordered run and never rescans a completed entry. Clone
failure after three prospectively fixed attempts is an error row, not a replacement. A write or
disk-space failure stops the run and is reported; it never narrows the corpus silently.

## Adjudication

A firing is genuine only when the cited code satisfies the exact class definition in the
corresponding committed `docs/packs/d-series-d*-rule-contract.md`, and the apparent defect is not
neutralized by repository semantics outside the matcher's bounded proof. Interest, severity, or
novelty is irrelevant. True instances and false positives are reported separately. Acceptance
specimens are controls and can never count as real instances.

Adjudication is blind to rule ID where practical. For each rule with at most 200 raw findings,
every finding is adjudicated. Above 200, a uniform deterministic sample of 200 is selected with the
seed and hash-ranking method in `control-anchors.json`; population count, sample count, seed, true
count, false-positive count, and a Wilson interval for the sample true-instance share are reported
side by side. Raw population findings are never presented as all genuine. Mechanical oracles are
recorded where an independent oracle exists.

## Estimands and intervals

Tier 1 and Tier 2 are reported separately and never pooled. For each rule and tier, report:

- adjudicated genuine findings per 1,000 analyzed rule-eligible files;
- finding-positive files over analyzed rule-eligible files, with a two-sided 95% Wilson interval
  scaled per 1,000 (this is the preregistered binomial interval paired with the finding density);
- repositories with at least one adjudicated-genuine finding over successfully analyzed
  repositories, with a two-sided 95% Wilson interval; and
- raw findings, false positives, errors, and all skip counts separately.

When multiple genuine findings occupy one file, the finding-density numerator counts all findings
while the Wilson file interval uses the binary finding-positive-file numerator. On a null, both
Wilson upper bounds are still reported. The legacy 23 consistency result is shown inside Tier 2
but marked and also broken out; population language is based only on the fresh 2,000.

Prediction versus outcome is reported per rule and overall, including miss direction and factor
when the point prediction is nonzero. Any proposal to widen a rule after a null is a later,
separately preregistered experiment and is outside this run.
