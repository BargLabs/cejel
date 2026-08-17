# Decision-contract prospective held-out evaluation v1 — preregistration (2026-08-09)

Status: **preregistered before any decision-contract evaluation of the held-out corpus**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Prior evidence and scope

Cejel merge `ba226c8edc68d96bb69354895e9b7ccf4b397dd1` added an experimental,
opt-in, non-scoring decision-contract conformance pack. The pack checks one deliberately narrow
assertion supplied by a repository: for a supported direct local-function shape, every named
premise in an authored contract must have a dependency path to the named returned decision.

Before that merge, three already exposed `decorative_predicate` calibration fixtures were used
for development. The final candidate found the missing edge in all three seeded fixtures, emitted
no finding on their three paired repairs, and did not abstain. That result is non-claim-bearing,
is outside every denominator below, and is reused here only as an out-of-denominator instrument
control.

The later Alfred corpus merge `7230ac20d10b556dc76738c7f58eba66d0736c2b` freezes twelve
new `HC-01` through `HC-12` prospective synthetic pairs. They were authored after the detector
merge and were not used to implement or calibrate it. A detector-independent oracle established
before this preregistration that every seeded source fails its fixed expected observation and
every paired repair satisfies it. No decision-contract detector has been run on those twelve
pairs.

This is not a blinded or naturally sampled corpus. It is synthetic, single-author/home-field, and
construction-bound to explicit authored contracts in the pack's declared direct-function domain.
"Held out" means only that these cases were created after the detector and development calibration
were frozen; it does not mean that their contents were hidden from the author or evaluator.

## Question

On these twelve fixed prospective synthetic authored-contract pairs:

1. in how many seeded sources does the frozen pack report at least one exact-file missing-premise
   edge without abstaining; and
2. on how many paired repairs does the frozen pack emit any finding or abstention?

The primary descriptive records are seeded detection `k/12`, paired-repair findings `f/12`, and
seeded/repair abstentions. The pairs are the unit of construction. They do not estimate defect
prevalence, repository-wide semantic recall, automatic defect-class recall, or population
precision.

## Immutable bindings

Every binding must be authenticated before the first control source is materialized:

| Artifact | Frozen binding |
|---|---|
| Cejel detector commit | `ba226c8edc68d96bb69354895e9b7ccf4b397dd1` |
| Cejel detector Git tree | `19a605671cedfc2df351148b3fd0e56d9f6b72e7` |
| Cejel package version at that commit | `0.4.0` — source-tree version, not a claim that this post-release pack shipped in tag `v0.4.0` |
| Pack entry point after the frozen build | `dist/packs/decision-contracts/index.js` |
| Pack API | `evaluateDecisionContracts(repoRoot, manifest)` |
| Manifest schema | `cejel-decision-contracts-v1` |
| Alfred calibration merge | `a4c5012da7dd058ca7aa2d372d0d906141afe647` |
| Calibration selector path | `packages/bede/src/decision-contract-calibration/corpus.ts` |
| Calibration selector blob / SHA-256 | `09b0e6012e7a5052c6327de48dc18ac45e3922b0` / `f141f81135dd2e833a7709121f3cb010c816cb173bab5544e183ca6017b5b3cc` |
| Calibration constants path | `packages/bede/src/decision-contract-calibration/constants.ts` |
| Calibration constants blob / SHA-256 | `cb6f3a1373d18e55a46c59a6bf7dbb44efef41ac` / `44290905ffcafb8ef027e88bd04a6adf7b22de7cf9921fda1b99e0ae798b32fb` |
| Calibration source-corpus path | `packages/bede/src/dual-control/corpus.ts` |
| Calibration source-corpus blob / SHA-256 | `e5c1be6205c7e0b4525df106a7af9c7689df7833` / `f18bc3bc2d6bf7f5608ee29337c3c4c6014135bdc2245a1cbf4100448c904bc3` |
| Alfred held-out corpus merge | `7230ac20d10b556dc76738c7f58eba66d0736c2b` |
| Held-out corpus path | `packages/bede/src/decision-contract-heldout-v1/corpus.ts` |
| Held-out corpus blob / SHA-256 | `5178050f51aad26d43c69ba9cb5ab336f4241ddc` / `5da3d25940d9ae688618294a6d1c720012fee46297c49e8895b031bc5a238afd` |
| Detector-independent oracle path | `packages/bede/src/dual-control/oracle.ts` |
| Oracle blob / SHA-256 | `89f8003a7160531e0b2212121902d80ca2f31bec` / `88313014ac3f7e5707efa96da951682675dd0b162b45e35c80ff1b5b5f53ede5` |

The frozen Cejel commit is after tag `v0.4.0`; the unchanged package version must not be rendered as
a release claim. The pack remains opt-in and outside the default scan, A1–B6 rubric, certificate
score, and leaderboard.

Any commit, tree, blob, content-hash, path, schema, package-version, or entry-point mismatch is a
pre-run protocol failure. Running another detector tree, changing a contract, or substituting a
case voids the experiment.

## Harness and ancestry ordering

The order is fixed:

1. merge this preregistration in Cejel;
2. create a fresh Alfred harness from Alfred merge `7230ac20d10b556dc76738c7f58eba66d0736c2b`;
3. bind the merged Cejel preregistration commit and exact document blob in that harness;
4. test harness mechanics with separately authored synthetic self-tests and run Alfred's required
   checks without invoking the decision-contract pack on any `HC-*` source;
5. commit and push the harness;
6. authenticate local `HEAD`, the Alfred remote-tracking ref, and independent `git ls-remote` as
   the same harness commit;
7. build the exact frozen Cejel detector commit and re-authenticate every binding above;
8. invoke the harness exactly once: the six calibration-control rows first, followed only after
   their gate passes by all 24 held-out seeded/repair rows; and
9. commit and push the raw JSON and human rendering separately after the harness commit.

The existing corpus oracle tests may decode and execute fixture sources without the detector;
that is already part of corpus construction and is not a detector outcome. Before the pushed
harness is authenticated, no command may call `evaluateDecisionContracts` or
`scanDecisionContracts` on an `HC-*` source.

Git ancestry does not cross repository boundaries. The merged Cejel preregistration commit and
its document blob are immutable cross-repository content bindings in the Alfred harness and
result. Within Alfred, calibration merge `a4c5012da7dd058ca7aa2d372d0d906141afe647`, corpus merge
`7230ac20d10b556dc76738c7f58eba66d0736c2b`, and the pushed harness commit must all be strict
ancestors of the result commit. Commit timestamps are not ancestry evidence.

The harness may authenticate, materialize, invoke the frozen pack, run the detector-independent
oracle, classify exact results, and render evidence. It may not contain a second detector,
case-specific catch exception, marker-string outcome path, changed contract, or alternate finding
source.

## Materialization and execution

Each source is written to a new temporary repository as `src/subject.mjs`; its fixed expectation
is written as `expected.json`. The authored manifest is passed directly to
`evaluateDecisionContracts`. The pack receives no network, LLM, rubric, ingest, default-scan, or
leaderboard input.

The independent oracle executes only the authored `observe` and `finalMessage` exports to compare
the observable state with `expected.json`. The harness does not run a fixture package manager,
repository script, test suite, build, hook, child process, or unrelated source. Temporary paths
must not appear in the public rendering.

The sole harness invocation has no per-row retry. An exception, materialization failure, schema
failure, missing result, or binding failure is preserved. After the first calibration-control row
begins, neither the harness nor any fixture may be repaired and the experiment may not be rerun.

## Exact predicates

A seeded row is `detected` only when all of these are true:

- its independent oracle reports `satisfied: false`;
- the pack emits no abstention for the contract;
- at least one finding has `ruleId: DECISION-CONTRACT-EDGE`;
- that finding names the exact contract ID; and
- its `evidence.path` is exactly `src/subject.mjs` and its `missingPremise` is one of the contract's
  frozen `requiredPremises`.

A seeded row with no matching finding and no error is `missed`; one with an abstention is
`abstained` and does not count as detected.

A paired repair is `clean` only when its oracle reports `satisfied: true` and the pack emits zero
findings and zero abstentions. Any finding makes it `flagged`; any abstention makes it `abstained`.

The raw result records all findings and abstentions for every executed row, not only values used
by the predicates.

## Instrument-control gate

The three exposed development cases `DC-01`, `DC-11`, and `DC-14` supply six
out-of-denominator rows. Each seeded control must satisfy the seeded `detected` predicate, and each
paired repair must satisfy the repair `clean` predicate.

If any control misses, flags, abstains, or errors, the run is `VOID_CONTROL_FAILURE`. The harness
must not import, decode, materialize, or evaluate the `HC-*` corpus, and the result may report only
control outcomes and instrument diagnostics. No control may be redesigned, replaced, or rerun.

## Frozen reporting rule

If all controls pass and all 24 held-out rows complete, the raw result reports:

- seeded detection `k/12`;
- paired-repair findings `f/12`;
- seeded and repair abstention counts; and
- every case-level seeded and repair outcome before any aggregate rendering.

The result is claim-bearing only if `1 <= k <= 11`, `f = 0`, every oracle has its frozen expected
state, and there are no abstentions or errors. In that state, the only licensed statement is:

> On twelve fixed prospective synthetic fixtures with explicit authored decision contracts,
> Cejel source commit `ba226c8` found at least one exact-file missing-premise edge in `k` seeded
> functions and emitted no finding on their twelve paired repairs. This construction-bound result
> does not estimate real-world recall or precision and does not show automatic semantic-defect
> detection without an authored contract.

Seeded detection `0/12` or `12/12`, any paired-repair finding, any abstention, or any error refuses
claim-bearing output. Fixed row outcomes and descriptive integrity diagnostics remain preserved,
but there is no licensed aggregate statement and no retry.

No outcome receives a pass/fail label or threshold interpretation. The result must not be used to
change a release, default scan, rubric, score, certificate, leaderboard, or customer-facing claim.

## Publication boundary

Raw fixtures and complete raw detector evidence remain in private Alfred. The user has authorized
public disclosure of Alfred-derived scores and hashes. After the private result is reviewed and
merged, Cejel may publish an additive redacted result containing immutable bindings, run
integrity, case IDs and categorical outcomes, descriptive counts, refusal state, and hashes.

The public result must not contain raw fixture sources, private absolute paths, credentials, or
unrelated Alfred material. Neither result may edit this preregistration, the frozen corpus,
calibration artifacts, historical results, the detector commit, or any release artifact.
