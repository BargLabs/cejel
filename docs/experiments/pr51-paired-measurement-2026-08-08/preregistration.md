# PR #51 paired golden-cohort diagnostic — preregistration

Status: preregistered before either detector arm is executed.

**CONSTRAINTS-VERSION: 2026-08-01.3**

## Question and claim boundary

This experiment decides the disposition of draft PR #51, `llm: bind self-judge evidence to one
local chain`. It compares the current detector on `origin/main` with the same detector plus #51's
rebased patch. It is a paired diagnostic on the already-spent, retired v1.9 golden cohort. It is
not a new calibration, release gate, correction to the published v1.9 result, estimate on fresh
repositories, or authorization for an external claim.

The historical 0/34 result is context only and is not the baseline. Both arms must be measured now,
under the same committed harness, frozen inputs, invocation, runtime, and network-denial wrapper.
No untouched cohort may be accessed.

## Frozen population and outcome

The exact input bindings are in `preregistration-bindings.json`. The population is the existing
v1.9 golden manifest: 24 repositories at exact commits and Git trees. Ground truth is the existing
v1.9 golden opportunity manifest: 4,199 scored opportunities, of which 34 are labelled `present`
and 4,165 are labelled `absent`. Its label-count record additionally identifies 317 reviewed
candidates as `not_applicable`, outside the scored opportunity array. Labels, source spans,
repositories, rubric, rules, thresholds, and manifests are immutable for this diagnostic.

For each arm the five locked measurements are:

1. `findings`: every emitted finding;
2. `true_positives`: distinct `present` opportunities matched by exactly one finding;
3. `false_positives`: every finding that does not uniquely match an as-yet-unmatched `present`
   opportunity;
4. `abstentions`: repositories whose pack result contains at least one `insufficient_data` rule
   state, matching the calibration protocol's aggregate scan-level definition; and
5. `recall`: true positives divided by 34.

A finding matches only when repository id and rule id are equal, its evidence path equals the
opportunity path, and its evidence line is within the opportunity's inclusive frozen source span.
Ambiguous matches, unmatched findings, and duplicate findings after the first match are false
positives. This deliberately precision-favouring rule cannot turn a new unmatched finding into a
true positive by interpretation after results are visible.

## Arms and chronology

The preregistration anchor is the commit produced when this PR lands on `origin/main`. Immediately
before execution, a separate pre-result commitment, created from
`pre-result-commitment.template.json`, must be committed. It must state that no arm result has been
seen and bind:

- the full preregistration commit SHA;
- the then-current `origin/main` full SHA as `baseline_commit`;
- the full SHA produced by rebasing #51 unchanged onto that baseline as `candidate_commit`;
- SHA-256 of `git diff --binary <baseline> <candidate>`;
- SHA-256 of the baseline and candidate execution bundles built by the command below;
- execution order `["baseline", "candidate"]`; and
- the raw SHA-256 of `preregistration-bindings.json`.

The baseline must contain the preregistration commit. The candidate must be a clean rebase of #51
onto the baseline. If the rebase conflicts in an evaluation fixture, rubric, frozen input, or
measurement file, abort without resolving the conflict. If any other conflict would require a
semantic change to #51, supersede this protocol before measuring. The harness rejects dirty tracked
files, wrong revisions, a missing preregistration ancestor, changed input bytes, a changed harness,
or a candidate diff different from the commitment.

The baseline arm runs first and the candidate arm second. Candidate execution requires the baseline
arm artifact. Running the scorer requires both artifacts to share the same pre-result commitment
and frozen inputs. Raw arm artifacts contain third-party-derived paths and findings: they must be
created outside the repository, retained privately, and never committed or pasted into a public PR.

## Execution procedure after this preregistration merges

Prepare frozen checkouts once with the existing detector-independent checkout utility. Checkout may
use the network; detector execution may not. Use fresh, non-nested directories outside the Cejel
repository for the checkout matrix and both arm outputs.

Before creating the pre-result commitment, build one self-contained runner per exact clean arm
worktree, outside the repository. This compiles the detector but does not read or scan the cohort:

```bash
pnpm exec tsup calibration/llm/scripts/pr51-paired-measurement.ts \
  --format esm --platform node --target node18 --out-dir /private/path/baseline-bundle
```

Repeat from the candidate worktree into a separate directory. Record the raw SHA-256 of both
generated `pr51-paired-measurement.js` files in the pre-result commitment, then commit that document.
Do not rebuild either bundle afterward. `tsx` must not be used inside the no-egress wrapper because
its compiler starts a subprocess that the wrapper correctly denies.

Run each arm from its exact clean Cejel worktree with plain `node` and its bound bundle:

```bash
calibration/llm/scripts/no-egress-wrapper.sh \
  node /private/path/baseline-bundle/pr51-paired-measurement.js \
  --mode run-arm --arm baseline \
  --detector-root /private/path/baseline-cejel-worktree \
  --manifest calibration/llm/cohorts/golden-manifest-v1.9.json \
  --opportunities calibration/llm/results/v1.9-golden-opportunity-manifest.json \
  --bindings docs/experiments/pr51-paired-measurement-2026-08-08/preregistration-bindings.json \
  --matrix /private/path/checkout-matrix.json \
  --commitment /private/path/pre-result-commitment.json \
  --commitment-git-repo /private/path/cejel-result-worktree \
  --commitment-git-commit FULL_COMMITMENT_COMMIT_SHA \
  --commitment-git-path docs/experiments/pr51-paired-measurement-2026-08-08/pre-result-commitment.json \
  --output /private/path/baseline-arm.json \
  --confirm-network-isolation
```

Use the same command for `candidate`, add
`--prior-arm /private/path/baseline-arm.json`, use the candidate bundle and detector root, and write
a new candidate output. Then run the committed source harness outside the wrapper with
`node --import tsx ... --mode score-pair`, passing `--baseline`, `--candidate`, `--opportunities`,
and `--bindings`. The scorer writes only the aggregate comparison to standard output.

If the current environment cannot execute this exact procedure, record the incompatibility and
stop. Do not change the harness, inputs, detector, fixtures, matching rule, or invocation after an
arm result exists. Any correction requires an erratum; any semantic change requires a new
preregistration that cites this one as a pilot.

## Locked disposition rule

- If candidate recall is greater than baseline recall: **merge #51**.
- Otherwise, if recall is equal and candidate false positives are fewer: **merge #51**.
- Otherwise, including any recall loss, unchanged five-number result, or false-positive increase:
  **close #51 without merge**.

The aggregate five-number comparison, rebase result, and the disposition selected by this rule may
be reported on #51. Do not update a published figure, calibration table, release claim, sealed
artifact, leaderboard field, or site copy. Nothing in #51 depends on marketplace/Smithery listing
issue #4; that item is not part of this experiment.

## Stop conditions

Stop without interpreting a result if any of the following occurs:

- either frozen checkout differs from its committed SHA or tree;
- the two arms do not share identical input source digests;
- the no-egress wrapper or its probe is not active;
- an input, label, harness byte, or committed arm SHA differs from its binding;
- an arm is executed before the pre-result commitment is committed;
- a raw third-party-derived result is staged for commit; or
- any golden or untouched input is modified.

Tests for this PR may use synthetic temporary repositories only. They are not an experiment arm and
must not read or scan a frozen golden repository.

The preregistration PR itself verifies the non-executing bindings with `--mode
validate-preregistration`; that mode reads only the two already-public manifest documents and the
harness source. It does not open a frozen repository checkout or invoke the detector.
