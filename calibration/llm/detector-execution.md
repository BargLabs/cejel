# Frozen detector execution

This procedure separates development on the golden cohort from the one-way untouched-cohort run.
It records the exact detector before untouched source is checked out or scanned. The scripts do not
select repositories, alter manifests, adjudicate findings, or tune rules.

## Required order

1. Freeze and independently review both immutable cohort manifests with `freeze-cohorts.mjs`.
2. Create and freeze the internal source-evidence index for every source span. The index must bind
   whole-file bytes to the exact commit/root tree in the cohort manifests through Git tree-object
   and blob proofs. Then freeze the complete golden and untouched opportunity inventory, bound to
   both cohort-manifest digests and the verified source-file SHA-256 values, before producing any
   detector output. Write `pre-result-commitment.json` from
   `templates/pre-result-commitment.template.json`, including the exact path and byte SHA-256 of
   every public document covered by the prohibited-claims check. Commit that exact file to Git and record the
   immutable commit and repository-relative path. The runner embeds and verifies the commit object,
   every raw tree object from the root to the path, and the committed blob bytes, and
   refuses either cohort without this commitment. Publish the exact machine-readable body produced
   by `expectedCommitmentCommentBody()` as a GitHub issue or pull-request comment, leave it unedited,
   and record its numeric comment ID. Before any cohort clone or detector invocation, the runner
   fetches that public comment live and requires its server timestamp, commit, and canonical
   commitment digest to match.
3. Keep the detector revision clean. The freeze tool builds it twice from the exact committed
   source tree and accepts only byte-identical repository-contained outputs.
4. Run the golden manifest with `run-frozen-cohort.mjs`, using an operating-system or container
   wrapper that prevents egress from the detector process.
5. Complete golden blind labels and finding reviews, then derive the exact missed-defect set.
   If detector code changes, rebuild and rerun the golden cohort. Freeze a correction ledger only
   after it is bound to those committed labels, the final executable SHA-256, and has zero open
   corrections.
6. Create `detector-freeze.json`. This binds the clean Git commit, executable SHA-256, runtime,
   exact scan command, no-egress argv prefix, eight rule IDs, support matrix, and correction-ledger
   digest before any untouched result is seen.
7. Run the untouched manifest once, with the frozen executable and the explicit
   `--confirm-untouched-after-freeze` acknowledgement.

Detector and rule authors must not open, search, or manually inspect untouched repositories before
step 7. Designated blind labelers may inspect the pinned source only to freeze and label the
opportunity inventory; they must not expose that work or detector output to rule authors before the
one-way untouched evaluation is complete.

## Golden execution

Calibration uses the committed host wrapper, runtime wrapper, policy manifest, hook, and probe. The
host wrapper runs each detector invocation in a prepared, local Docker image with `--network none`,
read-only detector/source mounts, no ambient image pull, dropped capabilities, and no-new-privileges.
Inside that container, the runtime wrapper injects a Node policy that denies the declared Node network, DNS, worker, and process-escape surface,
including module-level DNS APIs, callback and promise Resolver prototypes, and the direct
`node:dns/promises` specifier. The only subprocess exception is Cejel's exact hardened, read-only
local Git boundary. The runner derives the declared surface and count from the policy manifest and
requires every declared path to be denied before any clone or scan:

```bash
calibration/llm/scripts/no-egress-wrapper.sh \
  calibration/llm/scripts/no-egress-probe.mjs
```

The trusted workflow builds `calibration/llm/Dockerfile.no-egress` before cohort access and passes
its local tag through `CEJEL_CALIBRATION_NO_EGRESS_IMAGE`. Direct execution must do the same. The
wrapper requires that image to be present locally and invokes Docker with `--pull=never`; it refuses
instead of downloading an image while a cohort is being evaluated.

The Docker namespace is a host-level egress boundary for the detector process; it is not a claim of
complete host or kernel isolation. The runtime probe additionally proves that the container has no
default route. A passing probe count is a lower bound on tested coverage, never a completeness proof.
Before a golden probe runs, the runner requires the canonical wrapper path in its own detector
repository and verifies the host wrapper, runtime wrapper, policy, hook, and probe bytes against their exact Git blobs
at the preregistration commit. The later detector-freeze record also binds those assets and the
probe-output hash for untouched execution.

Historical detector-freeze records remain valid as archival statements about what their recorded
v1, v2, or v3 probes actually tested. That is a reasoned evidence-retention decision, not a validator
branch that authorizes old isolation for a new run: execution eligibility is checked separately
and requires the current v4 policy. Strengthening a control does not make an accurate historical
probe observation false, but no count supports an inference of comprehensive no-egress. A historical detector may be studied under v4 only through a separately preregistered,
cross-policy experiment with a new result record; it is never presented as a literal rerun of the
old freeze.

```bash
node calibration/llm/scripts/run-frozen-cohort.mjs \
  --manifest calibration/llm/cohorts/golden-manifest-v1.2.json \
  --cejel /absolute/path/to/dist/calibration/llm-detector.js \
  --work-root /absolute/path/to/golden-checkouts \
  --output-root /absolute/path/to/golden-results \
  --network-isolation-mode container-network-none-plus-node-runtime-deny-hook-v4 \
  --network-isolation-command /absolute/path/to/calibration/llm/scripts/no-egress-wrapper.sh \
  --pre-result-commitment /absolute/path/to/pre-result-commitment.json \
  --commitment-git-repo /absolute/path/to/cejel \
  --commitment-git-commit <full-40-character-commit> \
  --commitment-git-path calibration/llm/pre-result-commitment.json \
  --commitment-github-comment-id <numeric-public-comment-id> \
  --confirm-network-isolation
```

The checkout and output roots must be separate and non-nested. The runner refuses existing
per-repository source or output destinations. It clones without checkout, checks out only the
manifest's full 40-character commit in detached mode, verifies both `HEAD` and `HEAD^{tree}`, and
then invokes the local build with:

```text
llm-detector scan <source> --out <separate-output> --quiet
```

The detector invocation occurs behind the no-egress argv prefix. Clone and checkout happen first;
submodules are not initialized and Git LFS smudging is disabled. Each output directory receives a
`calibration-execution.json` receipt alongside Cejel's pack artifacts. Each clone, checkout, and
scan subprocess uses the selection policy's 30-minute wall-clock ceiling.

Each receipt binds the cohort manifest SHA-256, detector build and (for untouched runs) detector-
freeze SHA-256, exact commit/tree, canonical and byte-level LLM-report digests, deterministic
finding IDs, per-rule states, and the exact Git-committed pre-result record. The receipt's Git proof
is self-contained: measurement recomputes the commit, every tree, and blob object ID and follows the
complete path offline. The prohibited-claims audit must embed exactly the public-document inventory
frozen in that record, with matching paths and content hashes and no omissions or extras. The measurement gate verifies these receipts against the embedded
reports, the manifest-rooted source evidence, and final label/adjudication records before deriving
any count. A finding-review binding is accepted only when the finding path and line overlap the
assigned frozen source span; non-source references use exact reference matching. A finding that
overlaps no frozen opportunity may receive an independent binary-absent review with
`opportunity_id: null`; that review must bind `llm-report:<finding-id>` and the exact canonical
finding digest. It counts as an FP without adding a post-result opportunity or recall-denominator
item, and is rejected if any frozen opportunity overlaps it.

## Golden correction ledger

Start from `templates/golden-correction-ledger.template.json`. Before changing its status to
`frozen`, validate it against `schemas/golden-correction-ledger.schema.json` and fill in:

- the SHA-256 of the final built executable used for the final golden run;
- the frozen golden manifest SHA-256;
- the canonical digest of every committed golden blind label and finding review, including exact
  null-opportunity false-positive reviews where a finding has no frozen match;
- the exact derived set of `present` opportunities with no matching golden finding;
- the UTC freeze time;
- exactly two distinct reviewers;
- every correction outcome, using a finding binding for detector outcomes or a frozen opportunity
  binding for every and only the derived missed defects; and
- `open_corrections: 0`.

The detector-freeze script rejects a template, an open ledger, a ledger for another executable, or
a ledger without two reviewers. It requires the actual frozen golden manifest and rejects a ledger
whose `golden_manifest_sha256` does not match it. Detector-result corrections bind an actual
finding; missed defects carry a null finding ID and bind an actual frozen golden opportunity.
The validator rejects an omitted or extra missed-defect entry.
Every entry also binds its rule, repository commit, final outcome, rationale, evidence digest, and
resolution timestamp.
The required golden execution index follows `schemas/golden-execution-evidence.schema.json`; it
contains content-addressed receipts and LLM reports for every frozen golden repository. Each ledger
entry must include `llm-report:<finding-id>` evidence whose digest is the canonical finding digest.

## Freeze the detector

The detector repository must have an empty `git status --porcelain`. The output file is created
exclusively and cannot overwrite an existing freeze.

```bash
node calibration/llm/scripts/freeze-detector.mjs \
  --detector-repo /absolute/path/to/cejel \
  --build-command npm \
  --build-arg run \
  --build-arg build \
  --build-output dist/calibration/llm-detector.js \
  --golden-correction-ledger /absolute/path/to/golden-corrections.json \
  --golden-manifest calibration/llm/cohorts/golden-manifest-v1.2.json \
  --opportunity-manifest /absolute/path/to/opportunity-manifest.json \
  --golden-execution-evidence /absolute/path/to/golden-execution-evidence.json \
  --golden-label-record /absolute/path/to/golden-primary-label.json \
  --golden-label-record /absolute/path/to/golden-finding-review.json \
  --network-isolation-mode container-network-none-plus-node-runtime-deny-hook-v4 \
  --network-isolation-command /absolute/path/to/calibration/llm/scripts/no-egress-wrapper.sh \
  --network-isolation-evidence internal-witness:isolation-proof-id \
  --confirm-network-isolation \
  --output /absolute/path/to/detector-freeze.json
```

The record uses canonical sorted-key JSON hashing for `record_sha256`. It stores the host no-egress
wrapper, runtime wrapper, policy manifest, hook, and probe as fixed repository-relative paths so the same freeze can be verified on a
different machine. The untouched runner derives the detector root from the frozen build-output
path, re-hashes the workflow, host wrapper, runtime wrapper, policy, hook, and probe there, and requires the exact frozen Node
version, platform, and architecture. The current trusted workflow pins Node `22.23.1` on Linux
`x64`; produce its detector freeze under that same runtime identity. Before reading golden
evidence, the tool verifies a clean `HEAD`, records `HEAD^{tree}`, runs the declared build argv
twice in that repository, and requires both the declared repository-relative entry point and its
complete output-directory tree to have the same byte hashes both times. That output becomes the detector executable; an unrelated `--cejel` path is
not accepted. Rebuilding, editing the record, changing the source tree, build argv/output, support
matrix, scan command, or correction ledger invalidates the binding.

## Untouched execution

```bash
node calibration/llm/scripts/run-frozen-cohort.mjs \
  --manifest calibration/llm/cohorts/untouched-manifest-v1.2.json \
  --detector-freeze /absolute/path/to/detector-freeze.json \
  --golden-correction-ledger /absolute/path/to/golden-corrections.json \
  --golden-manifest calibration/llm/cohorts/golden-manifest-v1.2.json \
  --golden-execution-evidence /absolute/path/to/golden-execution-evidence.json \
  --cejel /absolute/path/to/the-same-built-cejel \
  --work-root /absolute/path/to/untouched-checkouts \
  --output-root /absolute/path/to/untouched-results \
  --pre-result-commitment /absolute/path/to/pre-result-commitment.json \
  --commitment-git-repo /absolute/path/to/cejel \
  --commitment-git-commit <full-40-character-commit> \
  --commitment-git-path calibration/llm/pre-result-commitment.json \
  --commitment-github-comment-id <numeric-public-comment-id> \
  --confirm-untouched-after-freeze
```

For untouched runs the runner refuses command-line isolation overrides. It uses the exact argv
prefix in the valid detector-freeze record and verifies all of these conditions before cloning:

- the detector-freeze canonical hash is valid;
- its rule catalogue, support matrix, and command template are unchanged;
- the local executable SHA-256 matches the frozen build;
- the closed correction-ledger bytes match the digest in the freeze record;
- the golden execution-index bytes match the digest in the freeze record and still validate every
  ledger entry against the frozen golden reports;
- the immutable manifest and every repository-entry hash are valid; and
- `--confirm-untouched-after-freeze` is present.

The confirmation flag records procedural intent; it is not evidence that a person followed the
protocol. Preserve internal witness records and access logs separately.

## Tooling tests

```bash
node --test calibration/llm/scripts/detector-execution.node-test.mjs
```

The tests use synthetic repository identities and mocked commands. They do not clone, inspect, or
run either calibration cohort.
