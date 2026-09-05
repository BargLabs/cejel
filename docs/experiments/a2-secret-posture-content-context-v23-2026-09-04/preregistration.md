# A2 secret-posture content-context rubric v23 paired rescore — preregistration

Status: **preregistered before the v23 implementation and before any paired corpus rescore.**
Requires the operator's SIGNED commit to merge — an unsigned (agent-authored) commit does not
authorize execution of the rescore under this protocol; drafting authored this document, the
operator's signature authorizes it.

Date: 2026-09-04

Issue: [#260](https://github.com/BargLabs/cejel/issues/260). This protocol is authorized instead by the operator's ruling in
`0.4.7_scope_2026-09-04.md` (RULED 2026-09-04: "scope accepted as written, including Track B's
rubric-versioned treatment of the secret-posture fix — prospective, explicit-only, paired
rescore; v17 stays the calibrated default"). File the issue before or alongside merge and record
its number in an erratum; do not block the preregistration commit on it.

## Question

Does replacing A2's path-based non-production credential exemption with a content-context
classification of the matched value itself remove the false-positive class Daniel (Latchkey CEO)
reported — example/dummy credentials in docs/learning pages scoring as real secrets — without
weakening detection of an actual secret that happens to live under a docs/ path, and without
moving any non-A2 criterion or producing an unreported public-board delta?

This is a prospective rubric experiment. It does not reinterpret any v17–v22 report and does not
promote a new public default. The calibrated public default remains `witan-rubric-v17-2026-07-24`
throughout this protocol, exactly as ruled in the 0.4.7 scope document.

Non-goal, stated up front: this protocol does not rescore Latchkey's or Gusset's repositories.
Those are private design-partner repositories outside the frozen public corpus and outside the
calibration population. Daniel's own re-run on latchkey + gusset remains the separate 0.4.7
acceptance test named in the scope document; this protocol only proves no-regression and
classifier correctness against fixtures every reviewer can see.

## Why the existing path-based mechanism does not satisfy the fix

`repo-signals.ts` already contains a path-based non-production credential exemption
(`V39_NON_PRODUCTION_CREDENTIAL_PATH_PATTERN`, gated behind `useV39Detectors`) whose pattern
includes a bare `docs?` directory match. That mechanism is disqualified by design, not by defect:
a path rule that exempts `docs/` cannot distinguish Daniel's actual complaint (a placeholder value
in a docs page) from a real credential accidentally committed to a docs page, and the scope
document is explicit that "a real secret in docs/ must still flag." V23 must not extend, relax, or
generalize that path pattern. The new classification reads the matched value and its immediate
surrounding content; it does not read the file's path or extension as a signal at all for this
determination. This is a fixture requirement below (fourth bullet, "regression fixtures"), not
only a design preference.

## Frozen baseline

The protocol was authored from Cejel commit `013beaad759d7c39a3665ae853902c77369cc591` with these
exact Git objects:

| Artifact | Git object / digest |
|---|---|
| `leaderboard/corpus.json` | blob `d563653c6f1d7ee733693c0e9612fa52c323b162`; SHA-256 `dc723f53a201542e0febb98964093ba4a3e7173221e746ba56aab6f726400d00` |
| `leaderboard/reports/` | tree `2658da4382b8219d3208902c050878890975ff85` |
| `src/witan/repo-signals.ts` | blob `36e74a198e074b76578c3ce70f9975e0d6709b8e` |
| `src/witan/rubric-version.ts` | blob `8e0f2663befc0949235a5bd894ac1842504de95a` |
| `src/witan/rubric.ts` | blob `a03b85e00ccb7215b6410a5360209cf1dfdf3f41` |
| `src/witan/schemas.ts` | blob `fa387e6eea0fbc2d8b39e35be03450e486900428` |

`leaderboard/corpus.json` is byte-identical to the corpus frozen for the v19 protocol
(`docs/experiments/b4-commit-year-v19-2026-08-09/preregistration.md`) — same blob, same digest,
same 24 entries. The corpus has exactly 24 rows: 23 public rows (`react`, `vue`, `svelte`,
`django`, `flask`, `fastapi`, `express`, `vite`, `esbuild`, `biomejs`, `requests`, `pydantic`,
`axios`, `zod`, `scorecard`, `ripgrep`, `guava`, `cobra`, `sinatra`, `automapper`, `fmt`,
`carddemo`, `cejel`) and the private Alfred transparency row. For this rescore only, that private
row is frozen to Alfred commit `07ac55d2d70c0c71d93e7fcde4c843d08377a0e1` (`origin/main`, Alfred
repository, 2026-09-04). Its paths remain redacted from every public output. The private row
remains outside the public ranking and calibration population.

No repository may be substituted, advanced, dropped, or silently retried at another commit. A
clone, archive, inventory, or scoring failure is an error row and makes the paired run a NO-GO for
promotion.

## Prospective rubric contract

The candidate identifier is `witan-rubric-v23-prospective-2026-09-04`
(`WITAN_RUBRIC_VERSION_V23`, appended to `WITAN_PROSPECTIVE_RUBRIC_VERSIONS` in
`src/witan/rubric-version.ts`). It inherits v22 exactly, including v22's package-start-entrypoint
closure, and changes only A2 ("Data-layer isolation and secrets posture") secret-shaped-value
classification. No other criterion, and no other part of A2 (data-layer/RLS detection,
`.env`-file presence evidence, history scanning) changes:

1. A secret-shaped match is classified by the content of the matched value and a bounded window
   of its immediate surrounding text (the assignment's key/identifier name, and same-file prose
   within a fixed line radius) — never by the file's path, directory, or extension. Whatever
   verdict a given value/context pair produces in a production source path, it must produce the
   identical verdict when the same value/context pair appears under a docs/learning/example path,
   and vice versa.
2. A closed, explicit, version-controlled placeholder gazetteer and a small set of structural
   placeholder signals — reviewable in the PR, not inferred at runtime — qualify a match as
   example/placeholder content-context. Candidates for the set (finalize during implementation,
   each backed by a fixture): literal placeholder tokens case-insensitively (`your-api-key`,
   `insert-secret-here`, `changeme`, `example`, `replace-me`, `xxx`/`XXX` runs, templated
   angle-bracket or curly-brace placeholders like `<your-key>` / `{{API_KEY}}`); known vendor
   test-mode prefixes documented as non-live by the vendor (e.g. Stripe's publicly documented
   `sk_test_`/`pk_test_` prefixes) — but only the prefix plus a value that is itself
   placeholder-shaped, never the prefix alone, since a real key can be copy-pasted into a
   `sk_test_` variable name; and near-zero-entropy values (a single repeated character, or a
   monotonic/keyboard-walk digit or letter sequence) using the existing `characterClasses`
   evidence rather than a new entropy engine.
3. A match satisfying none of the placeholder signals in (2) is evaluated against the existing
   high-confidence real-secret bar exactly as v17–v22 already do. It flags at full, unchanged
   severity regardless of path — a real secret in `docs/` is not hedged, softened, or
   path-exempted.
4. A match that clears neither the placeholder bar in (2) nor the existing high-confidence
   real-secret bar does not silently disappear and does not silently flag: it abstains, emitting a
   distinct, explicitly labeled "ambiguous secret-shaped value" finding separate from both the
   confident-flag and the no-finding outcomes. This is a new, narrow third outcome; it must never
   downgrade a value that (3) already confidently classifies as real.
5. v17 through v22 retain their exact existing A2/secret-scan behavior byte-for-byte, including
   the existing `V39_NON_PRODUCTION_CREDENTIAL_PATH_PATTERN` path-based hedging for whichever
   rubric versions already use it. The new content-context classification exists only under v23
   and only when explicitly selected via `cejel scan --rubric-pin
   witan-rubric-v23-prospective-2026-09-04`. `WITAN_LAST_CALIBRATED_RUBRIC_VERSION` remains
   `WITAN_RUBRIC_VERSION_V17`.

The implementation must add focused tests proving:

- identical repository bytes and matched value, differing only in which directory (production
  `src/`-shaped vs. `docs/`-shaped) the file lives in, produce identical v23 A2 evidence in both
  locations — the path-invariance property in rule 1, tested directly rather than inferred from
  the absence of a path check;
- a real, high-confidence secret-shaped value placed under a docs/ or learning-page path still
  flags at full severity under v23, byte-identical to its production-path evidence apart from the
  `path` field itself;
- a placeholder-gazetteer value placed under a production `src/` path does **not** flag under
  v23, exactly as it would not flag under docs/ — proving the fix is genuinely content-based, not
  a path rule relocated or inverted;
- an ambiguous value (neither gazetteer-matched nor high-confidence-real) abstains under v23,
  distinctly from both the confident-flag and no-finding paths, in at least one production-path
  and one docs-path fixture;
- v17 through v22 remain byte-compatible across the same fixtures — the new classification touches
  no other rubric version and no other criterion;
- no repository-controlled Git hook, pager, signature verifier, transport, or executable-valued
  configuration is enabled (carried forward from the existing A2 test discipline).

This regression-fixture set is a project artifact independent of the 24-row corpus — the corpus
proves no unreported public-board delta; it does not by itself prove the classifier's
precision, since none of its 24 entries is a documentation-heavy tutorial product known to embed
example credentials. The paired-direction fixtures above are what the scope document's
"regression fixtures both directions (dummy-in-docs passes; real-in-docs flags)" requirement
binds to.

## Paired measurement

The first measurement implementation must hard-code the merged preregistration commit and, before
reading any corpus source, prove it is a strict ancestor of the execution `HEAD`. The canonical
result records that execution commit; the later result commit must prove both the preregistration
and execution commits are its strict ancestors. Any correction after the preregistration merge is
an erratum or a new preregistration, never an edit to this document.

For every frozen row, one harness invocation will produce two reports from the same immutable
snapshot and the same candidate implementation:

- baseline: `witan-rubric-v22-prospective-2026-08-10`;
- candidate: `witan-rubric-v23-prospective-2026-09-04`;
- fixed `generatedAt`: the date this protocol's execution commit is authored;
- public sealed scoring entry point only;
- no explicit or auto-discovered ingest;
- no repository code execution;
- no source-path publication for the private Alfred row.

The harness must emit a canonical JSON result and a Markdown rendering that bind:

- preregistration and result commits;
- candidate implementation source hashes;
- corpus blob/digest and every resolved source commit;
- per-row A2 metrics, A2 score/status, secret_scan finding count and kind (flag / abstain /
  no-finding), overall/code/process scores, verdict, measured coverage, and comparative-board
  placement under both rubrics;
- all scan limitations and errors;
- an assertion that every non-A2 criterion is byte-identical after excluding the report-level
  rubric identifier and generation timestamp.

The complete 24-row before/after table is published in `leaderboard/RUBRIC_CHANGELOG.md`, including
explicit unchanged rows. Generated reports are measurement evidence; the existing committed board
is not overwritten in place by this protocol. Separately, the dedicated paired-direction fixture
suite (dummy-in-docs / real-in-docs / dummy-in-src / real-in-src / ambiguous) runs as part of the
implementation's own test command and is not part of the corpus rescore — its results are quoted
in the result document but drawn from `vitest`, not the harness.

## Prediction and decision rule

Before any v23 implementation or rescore, the prediction is:

- **0 of 24** rows change overall, code-trust, process-trust, verdict, measured coverage, or board
  placement;
- **0 of 24** rows change any criterion other than A2;
- **at most 2 of 24** rows change A2 score, status, or secret_scan finding count/kind. The corpus
  is dominated by production frameworks and libraries (react, vue, svelte, django, flask,
  fastapi, express, vite, esbuild, biomejs, requests, pydantic, axios, zod, scorecard, ripgrep,
  guava, cobra, sinatra, automapper, fmt) plus one deliberately legacy/atypical row (carddemo) and
  the two publisher-owned rows (cejel, alfred); none is a tutorial or documentation-generation
  product of the kind that embeds example credentials in prose by design, so the allowance is
  small and exists only in case an incidental placeholder or a genuine test-fixture credential
  currently caught by the existing detector gets reclassified.
- the dedicated paired-direction fixture suite is not covered by this numeric prediction — it is
  a pass/fail correctness requirement (every fixture in every direction must classify as designed;
  there is no tolerance band for it).

Rationale stated before resolving any candidate output, matching the corpus census above.

The result is a protocol GO only if all 24 rows complete, every non-A2 criterion is identical, no
verdict or placement moves, no more than two rows change A2 outcome, and every paired-direction
fixture classifies as specified in the rubric contract. A headline, verdict, coverage, or
placement move is published as a NO-GO and stops default promotion; it is not tuned away. Any
observed change outside A2 is an implementation failure, not a rubric result. A failing
paired-direction fixture is a protocol NO-GO regardless of the corpus outcome — the corpus proves
"did not break anything else"; the fixtures prove "actually fixed the thing," and both are
required.

Even a GO authorizes only the prospective v23 implementation and the published paired delta.
Promoting v23 (or any successor) as the ordinary public default requires a separately
preregistered authenticated untouched holdout; this public corpus is not a substitute for one, and
nothing in this protocol changes `WITAN_LAST_CALIBRATED_RUBRIC_VERSION`.

## Ordering and immutability

1. Commit, review, and merge this preregistration by itself, with the operator's SIGNED commit —
   not an agent-authored unsigned commit. File the GitHub issue referenced above at or before this
   step.
2. Record the merged commit as the immutable ancestor in the implementation/harness.
3. Implement v23 (content-context classification, placeholder gazetteer, abstention path) and its
   focused tests, and build the dedicated paired-direction fixture suite, without running the
   frozen corpus.
4. Commit the implementation and fixture suite before the first paired corpus run.
5. Run the paired corpus once. Preserve errors; do not repair and rerun under this protocol.
6. Commit the canonical result and complete `RUBRIC_CHANGELOG.md` delta separately from the
   preregistration.

This document must not be amended after merge. Corrections require a later erratum or a new
preregistration that names this protocol and explains the supersession.
