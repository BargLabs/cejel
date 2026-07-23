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

1. Two people review cohort disjointness and eligibility without running Cejel.
2. Resolve each URL to a 40-character commit SHA. Branches and tags are insufficient.
3. Record the default branch only as metadata; the SHA is normative.
4. Record the repository tree hash obtained from the pinned commit. Compute `entry_sha256` over
   RFC 8785-canonical JSON for that repository entry with `entry_sha256` omitted.
5. Record license identifier when observable; otherwise use `NOASSERTION`.
6. Write one immutable manifest per cohort using the template and schema.
7. Compute `manifest_sha256` over RFC 8785-canonical JSON for the complete manifest with
   `manifest_sha256` and `attestation` omitted. Sign or otherwise witness that digest and put the
   resulting reference in `attestation`. These omissions avoid self-referential hashes.
8. Run `validate-calibration.mjs` and preserve its output with the release evidence.

No repository source is copied into public calibration artifacts. Evidence pointers use paths,
line spans tied to the immutable commit, manifest keys, or stable external-result references.

## 6. Labeling

Two roles are required:

- **Primary labeler:** may be a rule author for the golden set, but not for the untouched cohort.
- **Independent reviewer:** must not have authored the reviewed detector rule and must label without
  seeing detector output on first pass.

For the untouched cohort, both reviewers independently label every detector finding and every
predefined defect opportunity in the reviewed sample. They use `present`, `absent`, `ambiguous`,
`not_applicable`, or `insufficient_source`. `ambiguous` and `insufficient_source` are never silently
converted to passes or failures. Disagreements go to a named adjudicator who records a rationale and
final label. A reviewer may be identified by a stable pseudonymous ID; the private identity mapping
must be retained by Barg Labs.

Each label must include the immutable repository commit, rule ID, evidence pointers, labeler role,
timestamp, and whether detector output was visible. Labels that lack resolvable evidence are invalid.

## 7. Detector freeze

Before untouched evaluation, record:

- detector package/version and Git commit;
- rule-catalogue ID and enabled rule IDs;
- pack configuration and supported-language/SDK matrix;
- build artifact SHA-256;
- runtime version and command line;
- network-isolation result; and
- the golden-set correction ledger.

Any code, rule, threshold, exclusion, parser, or configuration change after untouched results are
seen creates a new detector version. The original result remains in the correction ledger. The
untouched cohort cannot be reused as untouched evidence for that new version.

## 8. Matching and denominators

A detector finding matches a labeled defect only when repository SHA, rule ID, and the rule's
declared evidence-overlap criterion match. One finding cannot satisfy two defects unless the rule
catalogue explicitly permits a one-to-many relationship.

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
raw reviewer agreement         = agreements / double-labeled items
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
- At least 20% of untouched items and at least two items per enabled rule are double-labeled. If a
  rule has fewer than two supported items, publish that limitation and do not make a strong rule-
  level performance claim.
- The final report names roles, independence constraints, conflicts, exclusions, repository
  failures, and missing evidence.

## 10. Release decision

ADR-0011 controls the GO/NO-GO decision. Numeric thresholds were preregistered before any cohort
detector run in `release-thresholds.json`. Apply its automatic-NO-GO conditions first, followed by
the public-v1 and limited-experimental gates in the declared order. A limited experimental release
must say `experimental` on every public surface and publish the complete denominated record. In all
cases, findings require evidence and no general hallucination-rate claim is allowed.
