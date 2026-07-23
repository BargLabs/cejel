# Free LLM Pack calibration assets

This directory freezes the calibration design for the Free LLM Pack before any detector output is
used to tune rules. It contains no copied repository source and no private data.

## State

- Selection policy: `selection-policy.json` is re-locked at version `llm-selection-v1.2` before
  detector results. It truthfully records both the earlier reserve extension and the disclosed
  untouched-cohort blinding incident and recovery.
- Release decision thresholds: `release-thresholds.json` is locked before detector results.
- Candidate cohorts: `cohorts/golden-candidates.json` and
  `cohorts/untouched-candidates-v1.2.json` are the current disjoint, pre-result candidate lists.
  The unversioned untouched candidate and manifest files are retained v1.1 audit evidence and are
  never accepted as fallback measurement inputs.
- Metadata-only canonical renames, archived-candidate replacements, reserve ineligibility, and the
  pre-result policy re-lock are recorded in `cohorts/selection-amendments.json`.
- Immutable manifests: the original v1.1 manifests were frozen at `2026-07-23T04:08:14Z`, but the
  untouched manifest was retired after a cross-review status message exposed first-pass labels to
  the rule-authoring orchestrator. Neither cohort had been passed to the detector. Current
  `golden-manifest-v1.2.json` and `untouched-manifest-v1.2.json` must be independently re-frozen
  before execution; no v1.1 manifest can satisfy the v1.2 gate.
- Opportunity inventory: after both cohort manifests are frozen and before any detector result,
  create the internal source-evidence index from the exact blobs used by every `source_span` using
  `templates/source-evidence-index.template.json`. Each entry embeds whole-file bytes plus the raw
  Git tree objects needed to prove `path -> blob` from the manifest's frozen root tree. Freeze its
  canonical digest and validate it against `schemas/source-evidence-index.schema.json`. Then
  enumerate every predefined golden and untouched opportunity using
  `templates/opportunity-manifest.template.json`. Bind it to both cohort-manifest digests, compute
  every blind ground-truth label ID, role, and document digest into the same pre-result manifest,
  compute its canonical digest excluding only `manifest_sha256` (the internal attestation is
  hash-bound), and validate it against
  `schemas/opportunity-manifest.schema.json`.
- Labels: use `templates/label.template.json` for blind ground truth and
  `templates/finding-review.template.json` for post-run finding matches. Validate each record
  against `schemas/label.schema.json`.

## Commands

```bash
node calibration/llm/scripts/validate-calibration.mjs
node --test calibration/llm/scripts/freeze-cohorts.node-test.mjs
node --test calibration/llm/scripts/compute-metrics.node-test.mjs
node --test calibration/llm/scripts/detector-execution.node-test.mjs
node calibration/llm/scripts/freeze-cohorts.mjs --cohort golden --resolve-only
node calibration/llm/scripts/freeze-cohorts.mjs --cohort untouched --resolve-only
# After two blind labelers have independently reviewed every repository/rule cell and reconciled
# the opportunity union, assemble private pre-result evidence outside every Git working tree:
node calibration/llm/scripts/assemble-blind-evidence.mjs \
  --golden-manifest calibration/llm/cohorts/golden-manifest-v1.2.json \
  --untouched-manifest calibration/llm/cohorts/untouched-manifest-v1.2.json \
  --golden-root /absolute/path/to/golden-checkouts \
  --untouched-root /absolute/path/to/untouched-checkouts \
  --primary-golden /absolute/path/to/golden-primary.json \
  --primary-untouched /absolute/path/to/untouched-primary.json \
  --independent-golden /absolute/path/to/golden-independent.json \
  --independent-untouched /absolute/path/to/untouched-independent.json \
  --frozen-at <actual-pre-result-evidence-freeze-UTC> \
  --attestation-reference internal-witness:<record-id> \
  --private-output-root /absolute/private/path/llm-pre-result
# Assemble content-addressed evidence from the actual artifact paths, then evaluate it:
node calibration/llm/scripts/assemble-measurement-input.mjs \
  /absolute/path/to/measurement-evidence-paths.json /absolute/path/to/measurement-input.json
node calibration/llm/scripts/compute-metrics.mjs /absolute/path/to/measurement-input.json \
  --artifact <golden-run-id>=/absolute/path/to/golden-evidence.zip \
  --artifact <untouched-run-id>=/absolute/path/to/untouched-evidence.zip
```

The measurement input contains content-addressed evidence, not manually entered counts: both frozen
cohort manifests, the internal frozen source-evidence index, the frozen opportunity inventory, the detector-freeze record, every execution
receipt and LLM report, and every independent label/adjudication record. The metrics command
also requires a live-verified public GitHub commitment comment, the two successful
`workflow_dispatch` runs from `.github/workflows/llm-calibration.yml`, and their exact downloaded
evidence archives. Each archive may contain only `evidence-bundle.json`; its server-recorded digest
and its receipt/report bindings must match the measurement input.

The blind-evidence assembler requires all 48 frozen repositories and all 384 repository/rule
coverage cells from each reviewer, verifies exact local commits, root trees, Git blob/tree proofs,
UTF-8 line bounds, and whole-file SHA-256 values, and requires the two reviewers to cross-review the
final opportunity union. It emits source bytes and labels with owner-only permissions and refuses an
output directory inside a Git working tree. Keep the complete output private. Only hashes and the
specifically reviewed pre-result public records may be copied into the repository. If first-pass
labels disagree, supply a distinct blind adjudication fragment with `--adjudication`; the assembler
records both originals as `pending` and binds the superseding adjudication instead of erasing the
disagreement.
The detector freeze binds the exact workflow bytes. Each run may use the later calibration-data
commit appropriate to its chronology, but GitHub must return workflow bytes with the frozen digest;
a descendant that changes executable workflow logic is rejected. Every receipt independently binds
the detector binary hash.
The golden bundle also binds the canonical free-core parity record generated in that public run.
The parity baseline commit is frozen in the pre-result commitment and must be an ancestor of the
commitment commit. Immediately before calculation, the release gate fetches every external URL in
`public-surface-policy.json` and rejects a live prohibited claim; supplied URL snapshots alone are
not accepted as evidence of current listing content.
The metrics command
requires exactly one blind primary label for every predefined opportunity, validates blind
independent labels and adjudication lifecycle states, verifies every source-span whole-file SHA-256
and line range through its manifest-rooted Git tree/blob proof, and rejects a finding unless its
path and line overlap the exact frozen opportunity (or its non-source reference matches exactly),
derives aggregate and per-rule release counts from the untouched inventory only, reports zero
denominators as `not_estimable`, and evaluates the locked thresholds in order:
`automatic_no_go`, `public_v1`, `limited_experimental`, then `no_go`. Its output is a calculation;
it is not a substitute for the recorded adjudication and owner release decision.
Every matched detector finding must have a binary `present` or `absent` finding review. Matched
`not_applicable` or `insufficient_source` reviews are published under
`gate_blocking_matched_findings` and force automatic NO-GO.

Automatic NO-GO inputs are content-addressed records conforming to
`schemas/automatic-no-go-evidence.schema.json`, not operator-entered booleans. Network isolation,
untouched chronology, and finding-path validity are derived and checked against those records;
free-core parity and public-claim hygiene require embedded test-run and claim-audit artifacts bound
to the exact detector build and source commit. Each check-specific assertion embeds its evidence
content and SHA-256; opaque or generic “passed” assertions are rejected.
Free-core parity records the baseline and candidate Git commits, executable hashes, identical
pack-free argv, fixture-tree hash, exit codes, stdout, and stderr. The candidate executable must be
the frozen detector build and `--pack` is forbidden in both parity invocations.

Both first-pass roles must set `detector_output_visible: false` and carry a null finding ID.
Disagreements set both originals to `pending`; the distinct adjudicator also remains blind, uses
`adjudicated`, and supersedes exactly the two originals. Agreement and single-label records use
`not_required`. After execution, a separate `finding_reviewer` may see detector output and links
exactly one finding to the frozen opportunity without changing its final ground-truth label. A
same-rule finding from another path or line span is not interchangeable.
Double-label coverage and the minimum of two double-labeled opportunities per enabled rule are
required for both public and limited-experimental GO.

`--resolve-only` (or `--dry-run`) uses `gh api` and `git ls-remote` to resolve each candidate's
observed default branch, full commit, Git tree, and SPDX licence identifier. It prints technical
metadata without creating a frozen manifest and does not require reviewers. This is the safe way
to identify unavailable or renamed candidates before applying the preregistered reserve rule.
Canonical renames preserve repository identity. Metadata resolution found four archived selected
repositories. After existing `agent_tools` reserves were exhausted, the policy was first versioned
to `llm-selection-v1.1`. A later label-disclosure incident retired the original untouched cohort
before detector execution. Version `llm-selection-v1.2` uses a completely disjoint replacement
selected from two metadata-only searches by the content-bound selector in
`scripts/select-replacement-cohort.mjs`; two disclosed AI reviews replayed and approved its exact
bytes. The complete truth-preserving history is in `cohorts/selection-amendments.json`.

A real freeze requires exactly two distinct review passes and a reference to the internal review
record. Human review remains supported. When two people are unavailable, the owner may authorize
two sequential passes by the same AI task. That is disclosed separately from independent AI review
and must not be presented as human review:

```bash
node calibration/llm/scripts/freeze-cohorts.mjs --cohort golden \
  --review-mode ai-two-pass \
  --reviewer "codex-owner-review-pass-1:record-id" \
  --reviewer "codex-owner-review-pass-2:record-id" \
  --review-record /absolute/path/to/review-a.md \
  --review-record /absolute/path/to/review-b.md \
  --confirm-ai-two-pass \
  --attestation-reference "internal-witness:review-record-id"
```

The script never invents or infers reviewer identities. Human and AI identities are validated under
different modes, and the manifest records `two_human`, `two_independent_ai`, or
`two_sequential_ai_passes`. A dry run with the freeze arguments previews the complete manifest
without writing it. The final write uses exclusive creation and refuses to overwrite an existing
manifest.

Use `templates/cohort-freeze-witness.template.md` to collect both review records. The completed
records stay internal; immutable manifests contain their byte-level SHA-256 values plus an opaque
`internal-witness:` reference.

Repository entries are hashed from RFC 8785-style canonical JSON with recursively sorted object
keys, excluding `entry_sha256`. The manifest hash uses the same canonical representation and
excludes only `manifest_sha256`, as declared by `hash_contract`. The attestation and strict hashes
for the selection policy, golden and untouched candidate files, reserve list, amendment log, and
both review records are therefore hash-bound. Array order remains
the preregistered candidate order. The candidate file's byte-level SHA-256 is included in
resolve-only output so a technical resolution can be tied back to its exact input.

Cryptographic signatures, when used, belong in a separate external envelope naming the
hash-bound manifest digest; they are not embedded inside the document they sign.

The validator intentionally rejects an immutable manifest containing a branch name, tag, missing
commit, duplicate repository, or overlap between cohorts. It also verifies that the candidate
lists match the locked selection policy.

Do not run a Free LLM detector against either cohort until both immutable manifests have been
created and independently reviewed. The golden set may then be used for development. The untouched
cohort must remain unread by rule authors until the detector version is frozen.

After the manifests are frozen, follow [Frozen detector execution](./detector-execution.md). The
untouched runner refuses execution without a canonical detector-freeze record, the exact closed
golden correction ledger, the matching local executable, and the explicit
`--confirm-untouched-after-freeze` flag. No cohort execution has been performed by adding this
tooling.
