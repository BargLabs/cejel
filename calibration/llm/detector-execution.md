# Frozen detector execution

This procedure separates development on the golden cohort from the one-way untouched-cohort run.
It records the exact detector before untouched source is checked out or scanned. The scripts do not
select repositories, alter manifests, adjudicate findings, or tune rules.

## Required order

1. Freeze and independently review both immutable cohort manifests with `freeze-cohorts.mjs`.
2. Build Cejel from a clean, committed detector revision.
3. Run the golden manifest with `run-frozen-cohort.mjs`, using an operating-system or container
   wrapper that prevents egress from the detector process.
4. Complete golden adjudication and corrections. If detector code changes, rebuild and rerun the
   golden cohort. Freeze a correction ledger only after it is bound to the final executable
   SHA-256 and has zero open corrections.
5. Create `detector-freeze.json`. This binds the clean Git commit, executable SHA-256, runtime,
   exact scan command, no-egress argv prefix, eight rule IDs, support matrix, and correction-ledger
   digest before any untouched result is seen.
6. Run the untouched manifest once, with the frozen executable and the explicit
   `--confirm-untouched-after-freeze` acknowledgement.

Do not open, search, or manually inspect untouched repositories before step 6.

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
`calibration-execution.json` receipt alongside Cejel's pack artifacts.

## Golden correction ledger

Start from `templates/golden-correction-ledger.template.json`. Before changing its status to
`frozen`, fill in:

- the SHA-256 of the final built executable used for the final golden run;
- the frozen golden manifest SHA-256;
- the UTC freeze time;
- exactly two distinct reviewers;
- every correction outcome; and
- `open_corrections: 0`.

The detector-freeze script rejects a template, an open ledger, a ledger for another executable, or
a ledger without two reviewers.

## Freeze the detector

The detector repository must have an empty `git status --porcelain`. The output file is created
exclusively and cannot overwrite an existing freeze.

```bash
node calibration/llm/scripts/freeze-detector.mjs \
  --detector-repo /absolute/path/to/cejel \
  --cejel /absolute/path/to/local/built/cejel \
  --golden-correction-ledger /absolute/path/to/golden-corrections.json \
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
