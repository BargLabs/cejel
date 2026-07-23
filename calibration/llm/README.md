# Free LLM Pack calibration assets

This directory freezes the calibration design for the Free LLM Pack before any detector output is
used to tune rules. It contains no copied repository source and no private data.

## State

- Selection policy: `selection-policy.json` is locked at version `llm-selection-v1`.
- Release decision thresholds: `release-thresholds.json` is locked before detector results.
- Candidate cohorts: `cohorts/golden-candidates.json` and
  `cohorts/untouched-candidates.json` are disjoint, pre-result candidate lists.
- Metadata-only canonical renames and the single preregistered reserve substitution are recorded
  in `cohorts/selection-amendments.json`; its record explicitly precedes detector execution.
- Immutable manifests: not frozen yet. Resolve every candidate to a full 40-character Git commit,
  record the source-tree hash, and create manifests from `templates/immutable-manifest.template.json`
  before the first detector run.
- Labels: use one JSON document per repository and validate it against
  `schemas/label.schema.json`.

## Commands

```bash
node calibration/llm/scripts/validate-calibration.mjs
node --test calibration/llm/scripts/freeze-cohorts.node-test.mjs
node --test calibration/llm/scripts/compute-metrics.node-test.mjs
node --test calibration/llm/scripts/detector-execution.node-test.mjs
node calibration/llm/scripts/freeze-cohorts.mjs --cohort golden --resolve-only
node calibration/llm/scripts/freeze-cohorts.mjs --cohort untouched --resolve-only
node calibration/llm/scripts/compute-metrics.mjs \
  calibration/llm/templates/measurement-input.template.json
```

The measurement input must include aggregate counts, the same finding and defect counts broken out
for every enabled rule, double-label support, unresolved critical false positives, and the five
predeclared automatic-NO-GO checks. The metrics command validates subset and per-rule sums, reports
zero denominators as `not_estimable`, and evaluates the locked thresholds in order:
`automatic_no_go`, `public_v1`, `limited_experimental`, then `no_go`. Its output is a calculation;
it is not a substitute for the signed adjudication record or human release decision.

`--resolve-only` (or `--dry-run`) uses `gh api` and `git ls-remote` to resolve each candidate's
observed default branch, full commit, Git tree, and SPDX licence identifier. It prints technical
metadata without creating a frozen manifest and does not require reviewers. This is the safe way
to identify unavailable or renamed candidates before applying the preregistered reserve rule.
Canonical renames preserve the originally selected repository. The archived gpt-engineer
candidate was replaced by the first eligible `agent_tools` reserve under the locked policy.

A real freeze requires exactly two distinct, explicitly named human reviewers, an explicit
confirmation that they are people, and a reference to the internal witness record:

```bash
node calibration/llm/scripts/freeze-cohorts.mjs --cohort golden \
  --reviewer "First Human Name" \
  --reviewer "Second Human Name" \
  --confirm-human-reviewers \
  --attestation-reference "internal-witness:review-record-id"
```

The script never invents or infers reviewer identities. Model, bot, CI, or automation identities
must not be supplied as reviewers. A dry run with the freeze arguments previews the complete
manifest without writing it. The final write uses exclusive creation and refuses to overwrite an
existing manifest.

Use `templates/cohort-freeze-witness.template.md` to collect the two confirmations. The completed
record stays internal; immutable manifests contain only its opaque `internal-witness:` reference.

Repository entries are hashed from RFC 8785-style canonical JSON with recursively sorted object
keys, excluding `entry_sha256`. The manifest hash uses the same canonical representation and
excludes `manifest_sha256` and `attestation`, as declared by `hash_contract`. Array order remains
the preregistered candidate order. The candidate file's byte-level SHA-256 is included in
resolve-only output so a technical resolution can be tied back to its exact input.

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
