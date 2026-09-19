# A2 secret-posture content-context rubric v24 paired rescore — preregistration

Status: **preregistered before any paired corpus rescore and before any candidate output has been
resolved against the corpus.** The prediction and decision rule below were written from the
implementation's fixture suite alone.

Date: 2026-09-15

Supersedes: `docs/experiments/a2-secret-posture-content-context-v23-2026-09-04/preregistration.md`.
That protocol is treated as a **pilot**, per this repository's standing constraint that a
superseded protocol gets a new preregistration citing the old one rather than an amendment. It is
not edited, retracted, or re-run; the supersession is explained in full below.

Authority: the operator's ruling of 2026-09-04 in `lab_notes/cejel/notes/0.4.7_scope_2026-09-04.md`
— "scope accepted as written, including Track B's rubric-versioned treatment of the secret-posture
fix, prospective, explicit-only, paired rescore; v17 stays the calibrated default". Nothing here
extends that authority; in particular nothing here authorises a default promotion.

## Why the 2026-09-04 protocol cannot be executed as written

The pilot protocol names its candidate as `witan-rubric-v23-prospective-2026-09-04`
(`WITAN_RUBRIC_VERSION_V23`), and binds that identifier to a declared scope: "inherits v22 exactly
… and changes only A2 … secret-shaped-value classification. No other criterion, and no other part
of A2 … changes."

Three facts about the current tree make that unsatisfiable:

1. **The shipped v23 is a different rubric.** `WITAN_RUBRIC_VERSION_V23` is
   `witan-rubric-v23-prospective-2026-09-06`, not the `-2026-09-04` identifier the pilot names, and
   it carries four mechanisms, none of them the A2 secret classification: A1 command-flag coverage
   recognition, a PEM private-key grammar, per-signal (rather than whole-criterion) abstention, and
   withheld-path abstention. Its declared scope was itself corrected once, in #302 at `fc44756`,
   for a false "adds only" claim, and is now pinned by
   `src/witan/__tests__/v23-declared-scope.test.ts`.
2. **A v22→v23 paired delta could therefore never isolate this change.** The pilot's decision rule
   requires "0 of 24 rows change any criterion other than A2". Adding the classifier to v23 would
   violate that by construction, independently of anything the classifier does, because v23 already
   moves A1 and already changes what a non-finding means.
3. **The pilot's frozen baseline no longer resolves.** It freezes the tree
   `leaderboard/reports/` at `2658da4382b8219d3208902c050878890975ff85`; that path does not exist
   in the current `main` (removed by "docs: make the site the sole current scored board"). A
   protocol whose frozen baseline cannot be resolved cannot be run against it.

The pilot's substance survives intact and is carried forward below — the path-invariance rule, the
three-outcome contract, the paired-direction fixture requirement and the "the corpus proves it
broke nothing else, the fixtures prove it fixed the thing" division of labour are all reproduced.
What changes is the candidate identifier, the frozen baseline, and the numeric prediction, which
has to account for a scan surface the pilot did not anticipate (see "Prediction").

## Question

Does replacing A2's path-based non-production credential exemption with a content-context
classification of the matched value itself remove the false-positive class — example, placeholder
and dummy credentials written into documentation, tutorials and learning pages scoring as real
secrets — without weakening detection of an actual secret that happens to live under a
documentation path, and without moving any non-A2 criterion?

This is a prospective rubric experiment. It does not reinterpret any v17–v23 report and does not
promote a new public default. The calibrated public default remains `witan-rubric-v17-2026-07-24`
throughout.

## Why a new rubric version, and why v24 rather than a fifth v23 mechanism

`WITAN_LAST_CALIBRATED_RUBRIC_VERSION` is v17 and v17 is holdout-calibrated. This change alters
scoring and cannot land under it. It also cannot land as a fifth v23 mechanism: v23 is the named
candidate of a merged, immutable preregistration, so its declared scope is fixed — and fixed to a
description the shipped v23 already does not match. Reopening it would compound that, and would
confound the paired delta this protocol depends on.

v24 inherits **v22**, not v23. v23's own declaration records its four mechanisms as gated on
`WITAN_RUBRIC_VERSION_V23` alone, and mechanism 4 (withheld-path abstention) as not inheritable at
all. A v22 parent keeps that declaration true, keeps the #302 guard intact, isolates the paired
delta to exactly one change, and lets a caller who wants only the secrets-posture classification
opt into it without also opting into four unrelated uncalibrated mechanisms.

## Frozen baseline

Authored from Cejel commit `fe4210af8039b93277ec5e30c8119a9cb3a74dfc` (`origin/main`, 2026-09-15)
with these exact Git objects:

| Artifact | Git object |
|---|---|
| `leaderboard/corpus.json` | blob `d563653c6f1d7ee733693c0e9612fa52c323b162` |
| `src/witan/repo-signals.ts` (pre-implementation) | blob `5f5c901f417d24b2fc53deeee944f1c53168fee1` |
| `src/witan/rubric-version.ts` (pre-implementation) | blob `952e555b110d8d3577ea9e39c96ffefbfaa564d7` |
| `src/witan/rubric.ts` | blob `a03b85e00ccb7215b6410a5360209cf1dfdf3f41` |
| `src/witan/schemas.ts` | blob `6c3f2d9e3e56238b13530c0b10ccaa435533ad7e` |

`leaderboard/corpus.json` is byte-identical to the corpus frozen for the v19 protocol
(`docs/experiments/b4-commit-year-v19-2026-08-09/preregistration.md`) and for the 2026-09-04 pilot
— same blob, same 24 entries: 23 public rows (`react`, `vue`, `svelte`, `django`, `flask`,
`fastapi`, `express`, `vite`, `esbuild`, `biomejs`, `requests`, `pydantic`, `axios`, `zod`,
`scorecard`, `ripgrep`, `guava`, `cobra`, `sinatra`, `automapper`, `fmt`, `carddemo`, `cejel`) and
the private Alfred transparency row, each pinned to the immutable commit recorded in the corpus
file. The private row's paths remain redacted from every public output and it remains outside the
public ranking and the calibration population.

No repository may be substituted, advanced, dropped, or silently retried at another commit. A
clone, archive, inventory, or scoring failure is an error row and makes the paired run a NO-GO for
promotion.

## Prospective rubric contract

The candidate identifier is `witan-rubric-v24-prospective-2026-09-15`
(`WITAN_RUBRIC_VERSION_V24`, appended to `WITAN_PROSPECTIVE_RUBRIC_VERSIONS` in
`src/witan/rubric-version.ts`). It inherits v22 exactly and changes only A2's current-tree
secret-shaped-value classification:

1. A secret-shaped match is classified from the content of the matched value and a bounded window
   of its immediate surrounding text in the same file — never from the file's path, directory, or
   extension. Whatever verdict a value/context pair produces under a production source path, it
   must produce the identical verdict under a documentation, tutorial or learning path, and the
   reverse.
2. A closed, explicit, version-controlled placeholder vocabulary and a small set of structural
   placeholder signals — reviewable in the pull request, never inferred at runtime — qualify a
   match as example/placeholder content. The committed set is: the pre-existing
   `isPlaceholderSecretValue` vocabulary; an instructional-phrase test requiring **every**
   alphabetic word of the value (split on separators, camelCase and letter/digit boundaries, at
   least three of them) to appear in a committed gazetteer; unfilled template interpolation
   (`{{…}}`, `${…}`, `%(…)s`, `<…>`, `$UPPER_SNAKE`); and a documented vendor test-mode prefix
   (`sk_test_`, `pk_test_`, `rk_test_`, `whsec_test_`) **combined with** a body that is itself
   placeholder-shaped — never the prefix alone, since a real key is routinely pasted into a
   variable whose name says `test`.
3. A match satisfying none of the intrinsic placeholder signals in (2) is evaluated against the
   existing high-confidence real-secret bar exactly as v17–v22 already do, and flags at full,
   unchanged severity and evidence regardless of path. A real secret in `docs/` is not hedged,
   softened, or path-exempted.
4. A match that clears neither the placeholder bar in (2) nor the high-confidence bar in (3) does
   not silently disappear and does not silently flag: it **abstains**. The `secret_cleanliness`
   metric is withheld — not scored 0, not scored 1 — and a distinct, explicitly labelled `info`
   finding states the reason. The same abstention applies to a value that clears the
   high-confidence bar but sits within three lines of a committed instructional marker: content
   cannot separate a documented example from a pasted live credential, so Cejel declines to answer
   rather than guess in either direction. An abstention never removes a zero that a confirmed
   critical finding already earned.
5. v17 through v23 retain their exact existing A2 behaviour, including the existing
   `V39_NON_PRODUCTION_CREDENTIAL_PATH_PATTERN` and `V47_NON_PRODUCTION_CREDENTIAL_PATH_PATTERN`
   path exemptions for whichever rubric versions already use them. The new classification exists
   only under v24 and only when explicitly selected via
   `cejel scan --rubric-pin witan-rubric-v24-prospective-2026-09-15`.
   `WITAN_LAST_CALIBRATED_RUBRIC_VERSION` remains `WITAN_RUBRIC_VERSION_V17`.
6. Git history secret scanning is deliberately **out of scope**, as it was in the pilot. So is the
   shared non-production/generated/vendor inventory rule (`isAuthoredProductionPath`), which
   continues to exclude `test/`, `fixtures/`, `examples/`, `samples/`, `demos/`, `vendor/` and
   generated trees from A2's secret scan under every rubric including v24. Both are named here as
   remaining path rules rather than left implicit; changing either is separate work.

### Committed fixture requirements

These are a pass/fail correctness requirement of the implementation, not part of the numeric
prediction below, and they run under `pnpm test` rather than under the rescore harness. Each is
demonstrated failing on the pre-implementation tree before it passes:

- a real-shaped credential committed to a documentation path flags at full critical severity under
  v24 — the guard that matters most, since a path-based exemption would convert this false positive
  into a false negative in the one place an attacker would most like one;
- identical repository bytes differing only in directory (`src/`-shaped vs. `docs/`-shaped) produce
  identical v24 A2 evidence apart from the `path` field itself — path-invariance asserted directly,
  not inferred from the absence of a path read;
- an instructional placeholder in a documentation page produces no secrets finding under v24, while
  v17 and v22 keep their existing (wrong) behaviour byte-for-byte;
- the same placeholder under a production `src/` path also produces no finding, proving the fix is
  content-based and not a path rule relocated or inverted;
- an ambiguous value abstains with a stated reason, under both a production path and a
  documentation path, rather than passing silently;
- a value that clears the real-secret bar next to an instructional marker abstains rather than being
  silently cleared;
- an abstention does not withhold `secret_cleanliness` when a confirmed critical finding is also
  present;
- every non-A2 criterion is byte-identical between v22 and v24 on the same repository.

## Paired measurement

The measurement implementation must hard-code the merged preregistration commit and, before
reading any corpus source, prove it is a strict ancestor of the execution `HEAD` — the property
`scripts/b4-commit-year-v19-paired-rescore.mjs` enforces via `git merge-base --is-ancestor`, with
its own `node --test` coverage. The canonical result records that execution commit; the later
result commit must prove both the preregistration and execution commits are its strict ancestors.
Any correction after the preregistration merge is an erratum or a new preregistration, never an
edit to this document.

For every frozen row, one harness invocation produces two reports from the same immutable snapshot
and the same candidate implementation:

- baseline: `witan-rubric-v22-prospective-2026-08-10`;
- candidate: `witan-rubric-v24-prospective-2026-09-15`;
- fixed `generatedAt`: the date this protocol's execution commit is authored;
- public sealed scoring entry point only;
- no explicit or auto-discovered ingest;
- no repository code execution;
- no source-path publication for the private Alfred row.

The harness emits a canonical JSON result and a Markdown rendering binding: preregistration and
result commits; candidate implementation source hashes; the corpus blob and every resolved source
commit; per-row A2 metrics, A2 score/status, secret_scan finding count and kind (flag / abstain /
no-finding), overall/code/process scores, verdict, measured coverage, and comparative board
placement under both rubrics; all scan limitations and errors; and an assertion that every non-A2
criterion is byte-identical after excluding the report-level rubric identifier and generation
timestamp.

The complete 24-row before/after table is published in `leaderboard/RUBRIC_CHANGELOG.md`, including
explicit unchanged rows. Generated reports are measurement evidence; the committed board is not
overwritten in place by this protocol.

**A failed run is preserved, never replaced.** This reproduces the v19 protocol's load-bearing
property: the first paired run was published as a NO-GO with its failure intact
(`docs/experiments/b4-commit-year-v19-2026-08-09/`), and recovery required a separately merged
preregistration and a new one-shot harness
(`docs/experiments/b4-commit-year-v19-recovery-2026-08-09/`). Under this protocol likewise: run the
paired corpus once, preserve errors, do not repair and rerun. Any recovery is a new preregistration
citing this one.

## Prediction and decision rule

Written before any v24 corpus output has been resolved. The prediction is deliberately wider than
the pilot's, and the reason is a consequence of the fix that the pilot did not state: removing the
credential path exemptions means documentation trees and Markdown files enter A2's current-tree
secret scan **for the first time**. Several corpus rows (`django`, `flask`, `fastapi`, `requests`,
`express`, `vue`, `svelte`, `react`) ship substantial documentation that embeds credential-shaped
example values in prose by design. A narrow band here would not be a stronger claim; it would be a
prediction made by someone who had not thought about what the change does.

- **0 of 24** rows change any criterion other than A2.
- **0 of 24** rows gain a new critical committed-secret finding that is not a genuine committed
  credential. This is the false-assertion bar and it has no tolerance band: a certificate that
  asserts something false is a category worse than one that misses something. Every new critical
  is reviewed by hand against its cited file and line and the outcome recorded in the result
  document; for the private Alfred row the review is recorded without publishing the path.
- **at most 8 of 24** rows change A2 score, status, or secret_scan finding count/kind — including
  rows that move from a scored `secret_cleanliness` to an abstention.
- **at most 4 of 24** rows change overall, code-trust or process-trust score.
- **at most 2 of 24** rows change comparative board placement.
- **at most 1 of 24** rows changes verdict.
- **0 of 24** rows lose a committed-secret finding that v22 reported and that hand review confirms
  is a genuine credential. A recall loss on a true positive is a NO-GO regardless of every other
  number.

The result is a protocol **GO** only if all 24 rows complete, every non-A2 criterion is identical,
every observed change falls inside the bands above, no new critical is a false assertion, and no
confirmed true positive is lost. A move outside any band is published as a **NO-GO** and stops
default promotion; it is not tuned away. Any observed change outside A2 is an implementation
failure, not a rubric result.

Even a GO authorises only the prospective v24 implementation and the published paired delta.
Promoting v24 (or any successor) as the ordinary public default requires a separately preregistered
authenticated untouched holdout; this public corpus is not a substitute for one, and nothing in this
protocol changes `WITAN_LAST_CALIBRATED_RUBRIC_VERSION`.

## Ordering and immutability

1. This preregistration is committed together with the v24 implementation and its fixture suite, in
   one reviewed pull request, **before any corpus run**. The constraint that binds is Guard 5 — the
   preregistration commit must be a strict ancestor of the first result commit — and it is
   satisfied: this card writes no result. The prediction above was written from fixtures only.
2. Record the merged commit as the immutable ancestor in the measurement harness.
3. Build the one-shot harness and prove the ancestry before reading any corpus source.
4. Run the paired corpus once. Preserve errors; do not repair and rerun under this protocol.
5. Commit the canonical result and the complete `RUBRIC_CHANGELOG.md` delta separately from this
   preregistration.

This document must not be amended after merge. Corrections require a later erratum or a new
preregistration that names this protocol and explains the supersession.
