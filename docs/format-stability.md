# Output format stability

Cejel emits evidence artifacts. They are not decisions, and consumers must preserve abstention.
In particular, `insufficient_data`, `insufficient_source`, and attestation outcome `abstained` must
never be converted into a default pass or fail.

## Version routing

| Artifact | Version identifier | Consumer rule |
| --- | --- | --- |
| Generic ingest JSON | root `version`, currently `1.1` | Read major first; reject unknown majors. |
| `report.json` | paired `attestation.json` field `predicate.reportFormatVersion`, currently `1.8` | Verify the digest binding, then route by report-format major. Legacy scan/v1 attestations without this additive field are report format 1.0. |
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
  present; and
- history disclosures: `historyLimitations` (report format 1.5) when the scanned repository is a
  shallow clone. It names the criteria that read commit history. It is display-only: unlike
  `scanLimitations` it does not make the badge unrated or `--min-score` refuse, and a gate must not
  treat its absence as proof of complete history on reports older than 1.5. The field stays
  display-only under every rubric. Under `witan-rubric-v27-prospective-2026-10-19` the A2 and B2
  collectors themselves abstain on a shallow clone, and the sentence says so; under v17 and v18-v26
  the sentence and the scoring are unchanged. Since #556, A2's v27 abstention also covers a shallow
  clone where A2 would otherwise be marked not applicable, and the v27 sentence says so.
- Git LFS pointers: `contentReadSummary.byReason.lfsPointer` (report format 1.6), present only
  when the checkout held at least one Git LFS pointer in place of a file's content, and summed
  into `skipped`. Under every rubric it is a count: it names content Cejel did not read. Under
  `witan-rubric-v17-2026-07-24` and the other rubrics before v27 it records no abstention, so the
  criterion that read the pointer scored the pointer's text. The report does not say which
  criterion read it (`affectedCriteria` stays empty), so a gate that needs to know should treat any
  criterion as possibly affected, or require a scan with the LFS content present. Under `witan-rubric-v27-prospective-2026-10-19` the read is
  attributed, the criterion abstains as a read failure, and it appears in `affectedCriteria`,
  except where its collector made a critical finding: then it scores as under v17 and is not
  listed.
  Absent on reports older than 1.6, and absent (not 0) when no pointer was read.

- input binding: `inputBinding` (report format 1.7), present only when at least one document was
  ingested. Per document it records the sha256 of the exact input bytes, the format, the producer
  and declared subject the format carries, the observation time, a binding `status` (`matched`,
  `mismatched-repository`, `mismatched-commit`, `stale`, `unbound`, or `unverifiable`), the three
  checks behind it, and whether it duplicates another input. Under the default `record-only`
  policy it is attached after scoring and moves no score, status, abstention, badge or
  `--min-score` outcome; under `strict` the scan refused every mismatched, stale or duplicate input
  before scoring. A verifier holding the inputs can compare their digests with these
  (`cejel verify --input`). See [input binding](input-binding.md). Its absence on a 1.7 report means
  nothing was ingested; on an older report it means the field did not exist.
  Two optional fields within a record, added before 1.7 was released: `subjects[].repositoryWithheld`
  (`true` when the input declared a repository Cejel could not normalize to `host/path`; the
  declared text is never recorded, because it may carry URL credentials, and the input is never
  treated as the named subject repository) and `subjectsOmitted` (the number of distinct declared
  subjects beyond the eight recorded, at most 8,388,608, the ingest byte budget; every declared
  subject is checked, only the record is capped). Each is absent when it does not apply. `inputs` holds at most 256 records: one per
  document (at most 128) and at most one same-path repeat per document.
- imported status moves: `criteria[].nativeStatus` (report format 1.7), set beside `nativeScore`
  whenever ingested signals adjusted a criterion. When it differs from `status`, imported evidence
  moved the status; consumers must not present that status as a native finding.
- criterion disclosures: `criteria[].disclosures` (report format 1.8), up to four sentences, each
  naming something the criterion's collector read and set aside, or counted without seeing it do
  what it is counted for. A2 names credential-shaped values it set aside as documentation
  placeholders (by count and path, never the value); B3 names counted PR-gate workflows it did not
  see run a check. A2 also states when it was marked not applicable on a shallow clone (#556):
  that decision rests in part on its scans of earlier commits, which read only the commits the
  clone holds. The certificate lists them under "What was not established". They are kept
  apart from `notes` so that an abstention or a merge that rewrites the notes cannot drop them. They
  move no score, status or metric under any rubric. Absent when there is nothing to disclose; the
  `report.json` of a scan with no disclosure is byte-identical to a 1.7 one (its paired
  `attestation.json` records `1.8`). On an older report, A2 and B3 may
  have set values aside or counted such workflows without saying so. The A2 shallow-clone
  applicability sentence was added after 0.6.8 within format 1.8, without a new field: a 1.8 report
  whose `toolVersion` is 0.6.8 never carries it, so there its absence says nothing about how A2's
  applicability was decided. Under `witan-rubric-v27-prospective-2026-10-19` A2 abstains in that
  case instead and the sentence is not written.

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

#### Applied metric weights

`criteria[].metrics[].appliedWeightShare` (report format 1.4 and later) is an additive-optional
number in `[0, 1]` on a metric-scored criterion. It records the exact normalized share that the
scorer applied to that metric: the metric's configured weight divided by the sum of the weights in
the metrics actually scored for that criterion. The shares in a non-empty metric-scored criterion
sum to 1 before certificate display rounding.

For consumers:

- **Present** means this is the precise share used for the recorded score. Certificate displays may
  round the values to whole percentages, but must derive that display from these shares.
- **Absent** means the report predates format 1.4. It is not a scoring error and must not be
  treated as a zero share; a consumer may derive a display-only value from the report's weights.
- This field records a scoring input's normalized contribution. It does not alter a metric value,
  criterion score, rubric version, or eligibility threshold.

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
