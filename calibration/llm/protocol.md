# Free LLM Pack calibration protocol v1

Status: selection policy frozen; candidate repositories selected; immutable commit freeze pending
Protocol ID: `cejel-llm-calibration-v1`
Claim boundary: static application-integrity and evaluation-hygiene findings only

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
    explicit empty lists. Bind it to both manifests, the source index, and opportunity manifest.
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

For the untouched cohort, the primary labeler labels every frozen opportunity and every detector
finding is assigned to exactly one of those opportunities. The independent reviewer labels the
preregistered review sample required by section 9. They use `present`, `absent`, `ambiguous`,
`not_applicable`, or `insufficient_source`. `ambiguous` and `insufficient_source` are never silently
converted to passes or failures. Disagreements go to a named adjudicator who records a rationale
and final label while remaining blind to detector output. After detector execution, a separate
`finding_reviewer` may see detector output and binds each finding to exactly one frozen opportunity;
that record must preserve the blind final ground-truth label and cannot create a new opportunity.
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
- the exact no-egress wrapper, hook, probe, and passing probe-output hashes; and
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
- `FP`: detector findings adjudicated `absent` (incorrect findings).
- `TN`: predefined negative opportunities labeled `absent` with no detector finding.
- `A`: scans where the pack abstains because source is insufficient.
- `N`: scans classified `not_applicable` under a declared rule.
- `E`: scans eligible for the pack before abstention.
- `R`: all detector findings independently reviewed (`TP + FP` only when every finding was reviewed).

Publish exact counts and use:

```text
finding recall                 = TP / (TP + FN)
incorrect-finding rate (FDR)   = FP / (TP + FP) = FP / R when all findings are reviewed
negative false-positive rate   = FP / (FP + TN)  [only for predefined negative opportunities]
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
inventory, and untouched receipts that are not bound to the frozen detector. A disagreement
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
