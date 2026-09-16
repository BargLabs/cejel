# Output format stability

Cejel emits evidence artifacts. They are not decisions, and consumers must preserve abstention.
In particular, `insufficient_data`, `insufficient_source`, and attestation outcome `abstained` must
never be converted into a default pass or fail.

## Version routing

| Artifact | Version identifier | Consumer rule |
| --- | --- | --- |
| Generic ingest JSON | root `version`, currently `1.0` | Read major first; reject unknown majors. |
| `report.json` | paired `attestation.json` field `predicate.reportFormatVersion`, currently `1.2` | Verify the digest binding, then route by report-format major. Legacy scan/v1 attestations without this additive field are report format 1.0. |
| `attestation.json` | `_type` and `predicateType`; Cejel currently emits `https://in-toto.io/Statement/v1` and `https://cejel.dev/attestations/scan/v1` | Require exact supported identifiers. An unknown predicate major is unsupported. |
| `certificate.html` | `<meta name="cejel-certificate-format" content="1.0">` | The meta value identifies the human format. Gates should consume the bound JSON pair, not scrape HTML. |

`rubricVersion` versions the evidence and scoring rubric, not the JSON container. The attestation's
`predicate.tool.version` identifies the producing Cejel build, not a format. Consumers should retain
all three distinctions.

`rubricBehaviourFingerprint` (report format 1.2 and later) is a fourth, different thing again:
`rubricVersion` is a *name*, and the fingerprint is a *measurement* of how the rubric under that
name actually scores. The two are emitted side by side deliberately. Two reports naming the same
`rubricVersion` and carrying different fingerprints were produced by tools that score differently —
which is exactly the case a version string cannot report, and the case a gate comparing two
certificates should treat as material. See `leaderboard/RUBRIC_CHANGELOG.md`, "Rubric behaviour
fingerprints", for what the digest covers, what it deliberately excludes, and the current pinned
values.

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
- disclosed limitations: `scanLimitations` and `contentReadSummary` when present.

Additive-optional since report format 1.2: `rubricBehaviourFingerprint`, a 64-character lowercase
hex sha256 beside `rubricVersion`. Its **boundary**: reports produced by Cejel versions before this
field existed do not carry it, and their attestations remain valid unchanged — absence means "this
build did not emit a fingerprint", never "the fingerprint did not match". It is also absent, never
fabricated, for a caller-supplied rubric outside the free-core criterion set and for any rubric with
no pinned fingerprint. A consumer comparing two certificates may treat *differing present*
fingerprints under an identical `rubricVersion` as a scoring difference; it must not infer anything
from an absent one.

Experimental within report format v1: metric presentation hints under
`criteria[].metrics[].presentation`, optional multi-category `categoryScores`, and the exact ordering
of arrays where the schema does not say order carries meaning. Consumers may display these fields
but must not make a gate depend on their presence or layout.

Fields documented as optional remain optional. A minor v1 change may add optional fields; consumers
must ignore fields they do not understand. Removing, renaming, requiring, or changing the meaning of
a stable field requires report format v2.

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
