# Output format stability

Cejel emits evidence artifacts. They are not decisions, and consumers must preserve abstention.
In particular, `insufficient_data`, `insufficient_source`, and attestation outcome `abstained` must
never be converted into a default pass or fail.

## Version routing

| Artifact | Version identifier | Consumer rule |
| --- | --- | --- |
| Generic ingest JSON | root `version`, currently `1.0` | Read major first; reject unknown majors. |
| `report.json` | paired `attestation.json` field `predicate.reportFormatVersion`, currently `1.3` | Verify the digest binding, then route by report-format major. Legacy scan/v1 attestations without this additive field are report format 1.0. |
| `attestation.json` | `_type` and `predicateType`; Cejel currently emits `https://in-toto.io/Statement/v1` and `https://cejel.dev/attestations/scan/v1` | Require exact supported identifiers. An unknown predicate major is unsupported. |
| `issuance.json` | `predicate.issuanceFormatVersion`, currently `1.0` | Optional artifact. Verify the signature and the subject digests, then route by issuance-format major. Absent for every certificate that has no issuance, which is most of them. |
| `certificate.html` | `<meta name="cejel-certificate-format" content="1.0">` | The meta value identifies the human format. Gates should consume the bound JSON pair, not scrape HTML. |

`rubricVersion` versions the evidence and scoring rubric, not the JSON container. The attestation's
`predicate.tool.version` identifies the producing Cejel build, not a format. Consumers should retain
all three distinctions.

`rubricVersion` is a NAME. It says which rubric the producing build believed it ran; it cannot say
how that rubric behaved, and scoring has changed under an unchanged rubric identifier before (see
`leaderboard/RUBRIC_CHANGELOG.md`). `report.json`'s `rubricBehaviourFingerprint` is the companion
BEHAVIOURAL identity — see "the rubric behaviour fingerprint" below. Two certificates naming the
same rubric and carrying the same fingerprint were scored by rubric logic that agrees on a fixed
committed fixture corpus; two naming the same rubric with different fingerprints were not, and the
difference is recorded in the rubric changelog.

The report version lives in the paired attestation so existing no-ingest `report.json` artifacts
remain byte-identical. A gate must already retain the pair to verify that the report digest matches
the attestation subject and predicate.

## Stability by artifact

### `report.json`

Stable in report format v1:

- identity and revision: `productSlug`, `productDisplayName`, `repo.url`, `repo.headSha`;
- evidence semantics: `rubricVersion`, `verdict`, `criteria[].id`, `criteria[].status`, scores,
  evidence pointers, and findings;
- explicit abstention: null report scores for `insufficient_source` and criterion status
  `insufficient_data`;
- external attribution: `consumedSignals`, including source, provenance, dimension, counts, score
  adjustment, and itemized findings; and
- disclosed limitations: `scanLimitations`, `contentReadSummary`, and `withheldPaths` when
  present.

Experimental within report format v1: metric presentation hints under
`criteria[].metrics[].presentation`, optional multi-category `categoryScores`, and the exact ordering
of arrays where the schema does not say order carries meaning. Consumers may display these fields
but must not make a gate depend on their presence or layout.

Fields documented as optional remain optional. A minor v1 change may add optional fields; consumers
must ignore fields they do not understand. Removing, renaming, requiring, or changing the meaning of
a stable field requires report format v2.

#### The rubric behaviour fingerprint

`rubricBehaviourFingerprint` (report format 1.2 and later) is an additive-optional field beside
`rubricVersion`, of the form `sha256:<64 hex>`. It is the digest of the scoring-relevant output of
a fixed committed corpus of synthetic repositories scored under the named rubric by the build that
produced this report. It covers criterion scores and statuses, metric values, per-severity finding
counts, the archetype, `contentReadSummary`, the verdict, the composite scores, and the
insufficient-source reason; it excludes everything per-invocation and all prose. The exact
projection is `projectWitanScoringSurface` in `src/witan/rubric-fingerprint.ts`.

For consumers:

- **Equal fingerprints** on two reports naming the same `rubricVersion` mean the two builds' rubric
  logic agrees on that corpus. **Different fingerprints** mean scoring behaviour moved between the
  builds, and the change is recorded in `leaderboard/RUBRIC_CHANGELOG.md`.
- It is **not a coverage claim**. Agreement on the corpus is not proof of agreement on a repository
  shape the corpus does not contain. Do not read it as "these two scans are equivalent".
- **Absence is not a defect.** Reports from before report format 1.2 do not carry the field, and
  their attestations remain valid and verifiable exactly as before; absence means "produced before
  this field existed", never "behaviour unknown". A build also emits no fingerprint for a rubric it
  carries no measurement for, rather than fabricating one. A gate must not require the field.
- It does **not** affect report reproducibility. The value is a property of the (build, rubric)
  pair — derived from `rubricVersion` alone, with no timestamp, path, or per-run state — so
  `report.json` stays byte-identical across runs of one version at one revision. Like
  `toolVersion`, it differs across versions, which is what it is for.
- Up to and including `witan-rubric-v18-prospective-2026-07-25`, B4's audit-freshness metric rates
  freshness against the scan year. The fingerprints for those rubrics are measured at a pinned scan
  date, so for them the fingerprint is an identity for scoring at that scan year.
  `witan-rubric-v19` and later bind freshness to the scanned revision instead.

#### Withheld paths

`withheldPaths` (report format 1.3 and later) is an additive-optional array, one entry per
repository path the file walk withheld from every collector before any of them ran (too_large,
non_regular_file, unreadable, or denied_path — never excluded_by_extension, which stays visible to
collectors and is not withheld). Each entry is
`{ path, reason, signalsAdmitting: string[], actedOn: boolean }`: `signalsAdmitting` names every
`${criterionId}.${signalId}` whose own file-selection test would have read that path, computed the
same way regardless of rubric; `actedOn` is true only when the running rubric's abstention
mechanism actually acted on that intersection.

For consumers:

- **Present and empty (`[]`)** means the scan withheld nothing. **Absent** means the report was
  produced before this field existed and makes no claim either way — never read absence as "nothing
  withheld".
- **A non-empty `signalsAdmitting` with `actedOn: false`** means a signal would have read the
  withheld path but the running rubric's mechanism did not abstain on it — the result the signal
  reports may be affected by content it never saw. This is the case a certificate is otherwise
  unable to distinguish from a genuine, complete absence.
- **An empty `signalsAdmitting`** means no signal's own file-selection test would have read the
  withheld path — the skip is disclosed in `contentReadSummary` but no result depends on it.

### `attestation.json`

Stable under the scan/v1 predicate: statement and predicate identifiers, the single report subject
digest, `tool`, `generatedAt`, `reportFormatVersion`, `rubricVersion`, repository identity,
`report.sha256`, `externalSignalProvenance`, `outcome`, and the explicit unsigned `assurance` status.

Human wording in `assurance.signingHint` and `limitations[]` is experimental prose. Consumers may
display it but should gate on the structured status fields. Absence of `reportFormatVersion` is
accepted only for legacy scan/v1 attestations and means report format 1.0; an unknown present major
must not be guessed.

`predicate.githubRunAttempt` is an additive-optional field (`--run-attempt`, forwarded by the
GitHub Action from `GITHUB_RUN_ATTEMPT`): present only for a scan run under the GitHub Action,
absent — never fabricated or defaulted — for a local CLI or any other CI. It is not part of the
stable set above; consumers that don't recognize it ignore it per the report-format v1 rule.

### `issuance.json`

An issuance is a Barg Labs countersignature over a certificate that an independent party
reproduced byte for byte. See [issuance](issuance.md) for what it asserts, what it does not, and
how to verify it with OpenSSH alone.

Four rules govern it, and they are the reason issuance is versioned separately from the report:

- **Issuance is additive and optional.** It is a separate artifact written beside `report.json` and
  `attestation.json`, never a field inside either. A consumer that knows nothing about issuance is
  unaffected by its existence, and a certificate without one is not deficient — most have none.
- **Earlier certificates never gain one retrospectively.** An issuance records a reproduction that
  happened; it is produced at issuance time or not at all.
- **Report and attestation bytes are never modified by issuance.** `report.json` and
  `attestation.json` are byte-identical before and after. This is what keeps the report
  reproducible and lets a reader see exactly which bytes were countersigned; it is asserted by
  test in `src/__tests__/issuance-cli.test.ts`.
- **`reportFormatVersion` does not move when issuance moves.** `issuanceFormatVersion` versions the
  issuance container alone, under the same v1 rule as the report: a minor change may add optional
  fields, and removing, renaming, requiring, or changing the meaning of a stable field requires
  issuance format v2.

Stable under the issuance/v1 predicate: the statement and predicate identifiers, both subject
digests and their `artifact` discriminators, `issuer.name`, `issuer.keyFingerprint`, the
`reproduction` block including `reportByteIdentical`, `issuedAt`, and `engagementRef`.
`reportByteIdentical` is the literal `true` and has no false value: a reproduction that did not
reproduce is a refusal to issue.

Human wording in `limitations[]` is experimental prose, exactly as it is for the attestation.
Consumers may display it but should gate on the structured fields.

The signature is detached, in `issuance.json.sig`, made with `ssh-keygen -Y sign` under namespace
`cejel-issuance`. The namespace is part of the contract: a signature made under any other namespace
is reported as invalid, never as valid.

### `certificate.html`

Stable in certificate format v1: the format meta element and the semantic presence of product
identity, revision when observed, CLI version, rubric version, verdict/abstention, criterion results,
limitations, and attributed external findings when supplied.

DOM nesting, CSS classes, styling, prose, ordering, and truncation for display are experimental.
Machine consumers must use `report.json` plus `attestation.json`; HTML is a human rendering and is
not the gate API.

The "How to read this certificate" section (HTML, Markdown, and terminal) carries a standing scope
line, present on every certificate regardless of verdict: the certificate is a statement about the
repository tree at the pinned revision, not about the system that tree belongs to, and evidence
outside that tree is neither seen nor claimed to be absent. Its exact wording is experimental prose
(see the DOM-nesting/prose note above) — a gate consumes `scanLimitations` and `contentReadSummary`
from `report.json`, never this sentence.

`summary.json`, `badge.json`, `badge.svg`, and terminal text are convenience presentations unless a
separate schema explicitly says otherwise. `badge.json.schemaVersion` versions only the badge
endpoint shape.
