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
   refuses either cohort without this commitment.
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

Calibration uses the committed `no-egress-wrapper.sh` and `no-egress-hook.cjs`. The wrapper injects
a Node runtime policy that denies `net`, HTTP/HTTPS/HTTP2, DNS, `fetch`, and child-process escape
paths. The runner executes the committed probe before any clone or scan and requires all five
independent probe paths to be denied:

```bash
calibration/llm/scripts/no-egress-wrapper.sh \
  calibration/llm/scripts/no-egress-probe.mjs
```

This is application-runtime isolation for the Node detector, not a claim of host or kernel
isolation. The detector-freeze record binds the exact wrapper, hook, probe, and probe-output hashes.

```bash
node calibration/llm/scripts/run-frozen-cohort.mjs \
  --manifest calibration/llm/cohorts/golden-manifest-v1.2.json \
  --cejel /absolute/path/to/local/built/cejel \
  --work-root /absolute/path/to/golden-checkouts \
  --output-root /absolute/path/to/golden-results \
  --network-isolation-mode node-runtime-deny-hook-v1 \
  --network-isolation-command /absolute/path/to/calibration/llm/scripts/no-egress-wrapper.sh \
  --pre-result-commitment /absolute/path/to/pre-result-commitment.json \
  --commitment-git-repo /absolute/path/to/cejel \
  --commitment-git-commit <full-40-character-commit> \
  --commitment-git-path calibration/llm/pre-result-commitment.json \
  --confirm-network-isolation
```

The checkout and output roots must be separate and non-nested. The runner refuses existing
per-repository source or output destinations. It clones without checkout, checks out only the
manifest's full 40-character commit in detached mode, verifies both `HEAD` and `HEAD^{tree}`, and
then invokes the local build with:

```text
cejel scan <source> --out <separate-output> --pack llm --quiet
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
  --build-output dist/index.js \
  --golden-correction-ledger /absolute/path/to/golden-corrections.json \
  --golden-manifest calibration/llm/cohorts/golden-manifest-v1.2.json \
  --opportunity-manifest /absolute/path/to/opportunity-manifest.json \
  --golden-execution-evidence /absolute/path/to/golden-execution-evidence.json \
  --golden-label-record /absolute/path/to/golden-primary-label.json \
  --golden-label-record /absolute/path/to/golden-finding-review.json \
  --network-isolation-mode node-runtime-deny-hook-v1 \
  --network-isolation-command /absolute/path/to/calibration/llm/scripts/no-egress-wrapper.sh \
  --network-isolation-evidence internal-witness:isolation-proof-id \
  --confirm-network-isolation \
  --output /absolute/path/to/detector-freeze.json
```

The record uses canonical sorted-key JSON hashing for `record_sha256`. It stores the no-egress
wrapper and probe as fixed repository-relative paths so the same freeze can be verified on a
different machine. The untouched runner derives the detector root from the frozen build-output
path, re-hashes the workflow, wrapper, hook, and probe there, and requires the exact frozen Node
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
