# Free LLM Pack calibration protocol v1

Status: v1.9 golden gate **NO-GO**; golden retired; untouched withdrawn unexecuted and unspent
Current decision record:
[`results/v1.9-golden-gate-no-go.json`](results/v1.9-golden-gate-no-go.json)
Protocol ID: `cejel-llm-calibration-v1`
Claim boundary: static application-integrity and evaluation-hygiene findings only

The versioned references below preserve the protocol's historical evolution. They do not supersede
the current v1.9 decision record or authorize execution of its withdrawn untouched cohort.

## 1. Preregistration boundary

The protocol, selection policy, cohort assignment, label taxonomy, denominator formulas, and
exclusion rules are fixed before detector results are inspected. Candidate repositories may be
replaced only for a predeclared eligibility failure. Every replacement must be logged with the
reason, timestamp, and replacement selected by the deterministic rule in section 4. Repositories
must never move between golden and untouched cohorts for detector version 1.

This protocol does not measure a model's hallucination rate and does not certify an application as
safe. It measures how accurately a frozen static detector identifies the defects covered by its
versioned rule catalogue in the declared corpus.

## 2. Unit of analysis

- Primary: one independently labeled defect opportunity identified by repository, immutable
  commit, rule ID, and evidence pointer.
- Secondary: one detector finding identified by repository, immutable commit, rule ID, and finding
  ID.
- Repository summaries must not replace finding-level denominators.
- Multiple files demonstrating the same defect are one label only when the rule catalogue defines
  them as the same defect instance. Otherwise they are separate instances.

## 3. Cohorts

1. **Synthetic fixtures** cover at least one positive and one negative case per enabled rule and
   each structural SDK/call syntax signature claimed in the versioned fixture-coverage manifest.
   They are implementation tests, not calibration evidence, and do not establish support for a
   package or SDK version.
2. **Golden set** contains 24 public LLM applications/framework examples. Rule authors may inspect
   and use its adjudicated labels after its immutable manifest is frozen.
3. **Untouched cohort** contains 24 disjoint public LLM applications/framework examples. Rule
   authors must not inspect detector results or adjudicated labels until the detector artifact,
   configuration, and rule catalogue are frozen.

The cohorts intentionally include TypeScript/JavaScript and Python, direct-provider integrations,
RAG, agent/tool systems, local-model applications, chat applications, and evaluation or orchestration
frameworks. Repository popularity is not an eligibility condition and must not be treated as a
quality label.

## 4. Selection and replacement

`selection-policy.json` is normative. Apply its eligibility rules without looking at Cejel output.
At freeze time, resolve the default branch to a full commit SHA and archive only identity, metadata,
labels, cryptographic hashes, and evidence pointers.

A candidate may be replaced only if it is unavailable, lacks a resolvable public commit, contains no
in-scope LLM application surface at the pinned commit, is a duplicate/fork of another selected
repository, cannot be legally inspected under its published terms, or exceeds the declared resource
ceiling. Choose the first eligible repository from the predeclared reserve list with the same
primary stratum. Do not replace a repository because a detector performs poorly or well on it.

## 5. Freeze procedure

Before any detector run:

1. Two review passes examine cohort disjointness and eligibility without running Cejel. The
   manifest discloses whether these were `two_human`, `two_independent_ai`, or
   `two_sequential_ai_passes`. Sequential passes by the same AI task are not represented as
   independent reviewers, and AI review is never represented as human review.
2. Resolve each URL to a 40-character commit SHA. Branches and tags are insufficient.
3. Record the default branch only as metadata; the SHA is normative.
4. Record the repository tree hash obtained from the pinned commit. Compute `entry_sha256` over
   RFC 8785-canonical JSON for that repository entry with `entry_sha256` omitted.
5. Record license identifier when observable; otherwise use `NOASSERTION`.
6. Write one immutable manifest per cohort using the template and schema.
7. Compute `manifest_sha256` over RFC 8785-canonical JSON for the complete manifest with only
   `manifest_sha256` omitted. The internal attestation reference is hash-bound. Any cryptographic
   signature belongs in a separate external envelope that names this digest; embedding the
   signature inside the signed document would be circular.
8. Before any detector output is generated, enumerate every golden and untouched defect/negative
   opportunity. For every source span, first create an internal source-evidence entry containing
   the whole-file bytes, their SHA-256, Git blob ID, and the raw Git tree-object chain that proves
   the path from the repository root tree frozen in the cohort manifest. Freeze the complete index
   using `schemas/source-evidence-index.schema.json`.
9. Freeze the opportunity inventory bound to both cohort manifests. Its source-span digest must be
   the verified whole-file digest in the source-evidence index. Freeze its canonical digest using
   `schemas/opportunity-manifest.schema.json` and retain the attestation reference.
10. Independently freeze opportunity-discovery coverage with one row for every repository ×
    enabled rule, two distinct blind reviewers, and the exact declared opportunity IDs, including
    explicit empty lists. Each row binds both reviewers' complete private discovery rows and the
    locked `llm-opportunity-discovery-v1.4` search methodology by canonical SHA-256. The methodology
    covers dependencies/imports, direct calls/configuration, aliases/wrappers/helpers,
    registrations/decorators/schemas, dataflow sinks/persistence/logs, and negative
    boundaries/abstention. Bind the aggregate record to both manifests, the source index, and
    opportunity manifest.
11. Run `validate-calibration.mjs` and preserve its output with the release evidence.

No repository source is copied into public calibration artifacts. The self-contained source index
is retained with restricted internal measurement evidence; public evidence pointers use paths,
line spans tied to the immutable commit, manifest keys, or stable external-result references.

## 6. Labeling

Ground-truth labeling uses these roles:

- **Primary labeler:** may be a rule author for the golden set, but not for the untouched cohort.
- **Independent reviewer:** must not have authored the reviewed detector rule.

Both the primary labeler and independent reviewer must complete their first-pass labels without
seeing detector output. Every frozen opportunity must receive exactly one primary label. A second
blind label is added according to the coverage rule below. Labels may reference only opportunities
in the frozen inventory; detector findings must be matched to one of those opportunities and cannot
create a post-result opportunity that changes the recall denominator. The opportunity-manifest
hash binds every blind ground-truth label's ID, role, and canonical document digest before detector
execution; a later `detector_output_visible: false` assertion alone is not accepted as proof.
The pre-result commitment also binds the opportunity-discovery coverage digest and the exact byte
and canonical SHA-256 digests of `release-thresholds.json`.
It also freezes the approved free-core baseline commit. The public golden workflow proves that
the frozen detector's pack-free output matches that ancestor build on the fixed compatibility
fixture. The parity runner binds the fixture tree, embeds and hashes a fixed-clock hook, requires
zero exits and identical argv/stdout/stderr, and compares the complete generated artifact-tree
hash. The golden evidence bundle binds the resulting parity record.

For the untouched cohort, the primary labeler labels every frozen opportunity. The independent
reviewer labels the preregistered review sample required by section 9. They use `present`, `absent`, `ambiguous`,
`not_applicable`, or `insufficient_source`. `ambiguous` and `insufficient_source` are never silently
converted to passes or failures. Disagreements go to a named adjudicator who records a rationale
and final label while remaining blind to detector output. After detector execution, a separate
`finding_reviewer` may see detector output and normally binds each finding to exactly one frozen
opportunity; that record must preserve the blind final ground-truth label and cannot create a new
opportunity. If a finding overlaps no frozen opportunity, an independent `finding_reviewer` may
instead record `opportunity_id: null` and the binary label `absent`. That exception must bind the
exact actual finding with an `external_result` evidence reference of
`llm-report:<finding-id>` and the canonical finding digest. It counts as a false positive without
creating an opportunity or entering the recall or adjudicated-opportunity denominator. The gate
rejects a null-opportunity review if the finding overlaps any frozen opportunity.
A reviewer may be identified by a stable pseudonymous ID; the private identity
mapping must be retained by Barg Labs.

Each label must include the immutable repository commit, rule ID, evidence pointers, labeler role,
timestamp, and whether detector output was visible. Labels that lack resolvable evidence are invalid.

## 7. Detector freeze

Before untouched evaluation, record:

- detector package/version and Git commit;
- rule-catalogue ID and enabled rule IDs;
- pack configuration and supported-language/SDK matrix;
- build artifact SHA-256;
- runtime version and command line;
- the exact no-egress wrapper, policy manifest, hook, probe, and passing probe-output hashes (the
  declared probe count is a lower bound on tested coverage, never a completeness claim); and
- the exact GitHub calibration workflow path and byte hash; and
- the golden-set correction ledger.

The trusted untouched GitHub workflow transports its private detector-freeze, closed golden
correction ledger, frozen golden manifest, golden execution evidence, and complete opportunity
manifest in one authenticated encrypted bundle. The bundle format is
`cejel-llm-private-evidence-bundle-v1`: a fixed-name, fixed-order JSON document with per-file
SHA-256 digests, sealed by AES-256-GCM with a fresh 96-bit nonce and format/cipher associated data.
The 32-byte key is supplied only through the GitHub Actions secret
`CEJEL_LLM_CALIBRATION_BUNDLE_KEY`. The workflow rejects plaintext per-file untouched inputs and a
missing key before checkout, then decrypts the bundle only under `runner.temp` and passes only those
temporary paths to the frozen cohort runner. The golden workflow path does not consume this
transport. Encryption changes transport confidentiality only; it does not change any evidence
bytes, frozen digest, detector semantics, threshold, or pre-result binding.

The detector freeze stores the wrapper and probe as fixed repository-relative paths, not
machine-specific absolute paths. Before an untouched clone, the runner derives the repository root
from the frozen build-output path and verifies the exact workflow, wrapper, hook, probe, Node
version, platform, and architecture bound by the freeze record.

Any code, rule, threshold, exclusion, parser, or configuration change after untouched results are
seen creates a new detector version. The original result remains in the correction ledger. The
untouched cohort cannot be reused as untouched evidence for that new version.

## 8. Matching and denominators

A detector finding matches a labeled defect only when repository SHA and rule ID match and its
evidence path and line fall inside the frozen source span. For non-source opportunities, the
finding evidence reference must exactly equal the frozen manifest-key, configuration, or external-
result reference (and fall inside its line range when one is declared). One finding cannot satisfy
two defects unless the rule catalogue explicitly permits a one-to-many relationship.

For eligible, adjudicated labels:

- `TP`: labeled `present` defects matched by a detector finding.
- `FN`: labeled `present` defects with no matching finding.
- `FP`: detector findings independently adjudicated `absent` (incorrect findings), including exact
  null-opportunity reviews for findings omitted by the frozen inventory.
- `TN`: predefined negative opportunities labeled `absent` with no detector finding.
- `A`: scans where the pack abstains because source is insufficient.
- `N`: scans classified `not_applicable` under a declared rule.
- `E`: scans eligible for the pack before abstention.
- `R`: all detector findings independently reviewed (`TP + FP` only when every finding was reviewed).

Publish exact counts and use:

```text
finding recall                 = TP / (TP + FN)
incorrect-finding rate (FDR)   = FP / (TP + FP) = FP / R when all findings are reviewed
negative false-positive rate   = FP / (FP + TN)  [FP includes exact unmatched-finding reviews]
precision                      = TP / (TP + FP)
abstention rate                = A / E
not-applicable rate            = N / all scanned repositories
raw reviewer agreement         = agreements / double-labeled adjudicated items
double-label coverage          = double-labeled items / all eligible adjudicated items
Cohen's kappa                  = (observed agreement - expected agreement) /
                                 (1 - expected agreement)
```

If a denominator is zero, report the metric as `not_estimable`, never zero. If only a sample of
findings is reviewed, publish `incorrect reviewed findings / total reviewed findings`, the sampling
method, and a confidence interval; do not label it the corpus-wide false-positive rate. Report
per-rule support counts alongside aggregate values. Confidence intervals use Wilson 95% intervals
for binomial proportions unless the final report preregisters another method before results.

## 9. Sample and independence requirements

- All 24 untouched repositories are scanned once with the frozen artifact.
- Every detector finding in the untouched cohort is reviewed where feasible; otherwise use a
  preregistered stratified random sample by rule ID and severity.
- Every labeled positive defect in the untouched cohort contributes to recall.
- At least 20% of eligible adjudicated untouched opportunities (not repository scans) and at least
  two adjudicated opportunities per enabled rule are double-labeled. If a
  rule has fewer than two supported items, publish that limitation and do not make a strong rule-
  level performance claim.
- The final report names roles, independence constraints, conflicts, exclusions, repository
  failures, and missing evidence.

## 10. Release decision

ADR-0011 controls the GO/NO-GO decision. Numeric thresholds were preregistered before any cohort
detector run in `release-thresholds.json`. Its exact byte SHA-256 and canonical-document SHA-256
are bound into the pre-result commitment, detector freeze, and measurement input; either changing
invalidates measurement. Apply its automatic-NO-GO conditions first, followed by
the public-v1 and limited-experimental gates in the declared order. A limited experimental release
must say `experimental` on every public surface and publish the complete denominated record. In all
cases, findings require evidence and no general hallucination-rate claim is allowed.

The gate does not accept manually entered confusion-matrix counts. `compute-metrics.mjs` derives
release metrics only from the untouched cohort while validating the complete golden and untouched
evidence chain: content-addressed frozen cohort manifests, the manifest-rooted source-evidence
index, the opportunity manifest, the detector-freeze
record, per-repository execution receipts and LLM reports, and independent label/adjudication
records. It rejects missing receipts, incomplete primary-label coverage, visible first-pass
detector output, unreviewed finding IDs, source/blob/tree proof or line-bound mismatches, findings
that do not overlap their assigned opportunity, labels outside the frozen opportunity
inventory (except exact binary-absent null-opportunity finding reviews), and untouched receipts
that are not bound to the frozen detector. A null-opportunity review must be independent,
detector-visible, postdate execution, bind the actual finding digest, and prove the finding
overlaps no frozen opportunity. A disagreement
requires two `pending` originals and one distinct final adjudicator; an agreement or single label
must remain `not_required`. Blind ground-truth records carry no detector finding ID; only the
post-run `finding_reviewer` record may bind one. The double-label fraction and per-rule minimum apply to every GO tier,
including limited experimental. Raw agreement and Cohen's kappa are derived from the full paired-
label contingency table; single-category pairs are reported as `not_estimable`, not as perfect
kappa.

Automatic NO-GO checks are evidence records, never bare booleans. Each record is canonically
content-addressed. The gate derives and cross-checks network isolation, untouched-run chronology,
and cryptographically resolved finding paths from frozen records. Free-core parity requires an
embedded `test_run`; prohibited-claim absence requires an embedded `claim_audit`. Their exact JSON
bytes, check-specific assertions, assertion evidence content, detector build, and source commit are
verified. A missing, opaque, generic, tampered, wrong-kind, or contradictory record prevents evaluation.

## 11. Publication boundary (2026-08-19 amendment)

This section implements the 2026-08-19 maximum-moat operator ruling.

**Effective cycle: v2.0, the first Free LLM Pack calibration cycle after v1.9.** This amendment is
forward-looking. It does not alter any v1.2-v1.9 preregistration, result, or decision record.

Beginning with v2.0, raw adjudication records, labels, review records, reviewer notes or rationales,
and evidence payloads or corpora must never be published to a public repository, release artifact,
workflow artifact, website, paper supplement, or other public surface, whether plaintext or
encrypted. They remain in restricted private storage. Public output is limited to:

- the aggregate denominated counts, metrics, uncertainty, exclusions, support counts, and
  limitations required by sections 8-10;
- the cycle's GO, NO-GO, withdrawal, failure, and correction summaries;
- frozen-artifact and private-record-set digests and commitments; and
- retired frame membership, limited to repository identity and pinned commit, after the frame's
  single use has ended.

Public output must not contain per-item labels, opportunity IDs joined to outcomes, evidence
pointers or excerpts, reviewer prose, raw record filenames, per-record digests, or ciphertext of
any closed record. Publishing an honest NO-GO or correction remains mandatory, but it uses the
aggregate-and-commitment surface above rather than publishing the underlying records.

### Public digest replacement

For each closed record class, the public cycle summary replaces raw publication with one set-level
commitment having exactly these fields:

```json
{
  "record_class": "adjudication_and_review_records",
  "record_count": 0,
  "hash_contract": "rfc8785-sha256-v1",
  "private_record_set_sha256": "<64 lowercase hex characters>",
  "committed_at": "<RFC 3339 timestamp>"
}
```

The other permitted `record_class` value is `evidence_payloads`. To compute
`private_record_set_sha256`, form a private JSON object with `schema_version`, `cycle_id`,
`record_class`, and `records`; sort `records` by stable internal record ID using code-point order;
and hash the complete object with `sha256Canonical`. The digest is separate from the private object,
so no field is self-excluded. `record_count` must equal the private array length. Follow
[`docs/calibration/hash-conventions.md`](../../docs/calibration/hash-conventions.md), including its
bare-hex exception for fields whose names end in `_sha256`, and commit the public summary before
any result-dependent disclosure. Later public records cite the full Git commit SHA that first
contained the summary; the summary does not embed its own commit SHA. The set-level digest binds the
retained private record set; it does not make that set public or promise a later reveal.

Live frame membership follows the same document's commit-then-reveal convention: publish the member
list commitment at freeze, keep membership closed while live, and reveal only repository identity
and pinned commit when the single-use frame retires. Adjudication, review, and evidence records stay
closed after retirement.

### Historical sanction and baseline

The v1.2-v1.9 material already published under this track's earlier procedural-blinding practice,
including `calibration/llm/reviews/**`, `calibration/llm/results/**`, historical experiment-stage
records, and the historical encrypted evidence bundle, remains sanctioned as published. Alfred PR
[#1055](https://github.com/BargLabs/alfred/pull/1055) enumerates those paths and blobs in the
content-addressed scanner baseline. Nothing is deleted or retracted by this amendment. That baseline
is an inventory of unretractable history, not permission to add a new label-class path or a precedent
for v2.0 and later cycles; no successor to any historical raw or encrypted publication is permitted.
