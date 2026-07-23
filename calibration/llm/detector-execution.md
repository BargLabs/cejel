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
   `templates/pre-result-commitment.template.json`, commit that exact file to Git, and record the
   immutable commit and repository-relative path. The runner verifies the committed blob bytes and
   refuses either cohort without this commitment.
3. Build Cejel from a clean, committed detector revision.
4. Run the golden manifest with `run-frozen-cohort.mjs`, using an operating-system or container
   wrapper that prevents egress from the detector process.
5. Complete golden adjudication and corrections. If detector code changes, rebuild and rerun the
   golden cohort. Freeze a correction ledger only after it is bound to the final executable
   SHA-256 and has zero open corrections.
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

The isolation command must be an executable wrapper that launches the remaining argv with network
egress denied. Arguments beginning with `-` or `--` can be passed with the equals form shown below.
Use environment-specific, independently verified isolation; naming a wrapper does not prove that it
works.

On macOS, this repository includes `scripts/macos-no-egress.sh`, which invokes the target through
`/usr/bin/sandbox-exec` with `deny network*`. Verify it in the execution environment before use:

```bash
calibration/llm/scripts/macos-no-egress.sh node -e "process.stdout.write('offline-ok')"
calibration/llm/scripts/macos-no-egress.sh /usr/bin/curl -I --max-time 3 https://example.com
```

The first command must succeed and the second must fail. Preserve the command output as the
internal isolation evidence referenced by the detector freeze.

```bash
node calibration/llm/scripts/run-frozen-cohort.mjs \
  --manifest calibration/llm/cohorts/golden-manifest.json \
  --cejel /absolute/path/to/local/built/cejel \
  --work-root /absolute/path/to/golden-checkouts \
  --output-root /absolute/path/to/golden-results \
  --network-isolation-mode verified-no-egress-wrapper \
  --network-isolation-command /absolute/path/to/no-egress-wrapper \
  --network-isolation-arg=-- \
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
finding IDs, per-rule states, and the exact Git-committed pre-result record. The measurement gate verifies these receipts against the embedded
reports, the manifest-rooted source evidence, and final label/adjudication records before deriving
any count. A finding-review binding is accepted only when the finding path and line overlap the
assigned frozen source span; non-source references use exact reference matching.

## Golden correction ledger

Start from `templates/golden-correction-ledger.template.json`. Before changing its status to
`frozen`, validate it against `schemas/golden-correction-ledger.schema.json` and fill in:

- the SHA-256 of the final built executable used for the final golden run;
- the frozen golden manifest SHA-256;
- the UTC freeze time;
- exactly two distinct reviewers;
- every correction outcome, using a finding binding for detector outcomes or a frozen opportunity
  binding for a missed defect; and
- `open_corrections: 0`.

The detector-freeze script rejects a template, an open ledger, a ledger for another executable, or
a ledger without two reviewers. It requires the actual frozen golden manifest and rejects a ledger
whose `golden_manifest_sha256` does not match it. Detector-result corrections bind an actual
finding; missed defects carry a null finding ID and bind an actual frozen golden opportunity.
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
  --cejel /absolute/path/to/local/built/cejel \
  --golden-correction-ledger /absolute/path/to/golden-corrections.json \
  --golden-manifest calibration/llm/cohorts/golden-manifest.json \
  --opportunity-manifest /absolute/path/to/opportunity-manifest.json \
  --golden-execution-evidence /absolute/path/to/golden-execution-evidence.json \
  --opportunity-manifest /absolute/path/to/opportunity-manifest.json \
  --pre-result-commitment /absolute/path/to/pre-result-commitment.json \
  --commitment-git-repo /absolute/path/to/cejel \
  --commitment-git-commit <full-40-character-commit> \
  --commitment-git-path calibration/llm/pre-result-commitment.json \
  --network-isolation-mode verified-no-egress-wrapper \
  --network-isolation-command /absolute/path/to/no-egress-wrapper \
  --network-isolation-arg=-- \
  --network-isolation-evidence internal-witness:isolation-proof-id \
  --confirm-network-isolation \
  --output /absolute/path/to/detector-freeze.json
```

The record uses canonical sorted-key JSON hashing for `record_sha256`. The executable itself is
hashed byte-for-byte. Rebuilding, editing the record, changing the support matrix, changing the
command, or changing the correction ledger invalidates the binding.

## Untouched execution

```bash
node calibration/llm/scripts/run-frozen-cohort.mjs \
  --manifest calibration/llm/cohorts/untouched-manifest.json \
  --detector-freeze /absolute/path/to/detector-freeze.json \
  --golden-correction-ledger /absolute/path/to/golden-corrections.json \
  --golden-manifest calibration/llm/cohorts/golden-manifest.json \
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
