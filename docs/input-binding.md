# Input binding

`cejel --ingest` folds other scanners' output into a certificate. An ingested document is
evidence about some repository, at some commit, observed at some time, by some producer. Before
report format 1.7 Cejel read none of that. A Scorecard result for another repository, for an older
commit, or from a run made long before the scanned revision existed was scored exactly like a
matching one, and the certificate attributed it only by tool name and `operator_supplied`.

From report format 1.7, every ingested document is recorded in `report.json` under
`inputBinding`, with what its own format says about its subject and producer and whether that
subject is the revision the certificate is about.

This page is the specification. The conformance suite at the end is checked mechanically by
`src/witan/__tests__/input-binding-conformance.test.ts`, which reads the table on this page.

## What each format carries

| Format | Subject repository | Subject commit | Observed at | Producer |
|---|---|---|---|---|
| OpenSSF Scorecard JSON | `repo.name` | `repo.commit` | `date` | `scorecard`, `scorecard.version`, `scorecard.commit` |
| SARIF 2.1.0 | `runs[].versionControlProvenance[].repositoryUri` | `runs[].versionControlProvenance[].revisionId` | earliest `runs[].invocations[].startTimeUtc` / `endTimeUtc` | `runs[].tool.driver.name`, `.semanticVersion` or `.version` |
| Generic contract 1.1 | `subject.repository` | `subject.commit` | `observedAt` | `producer.name` (default `tool`), `producer.version` |
| Generic contract 1.0 | none | none | none | `tool` |

A date-only Scorecard `date` (`2026-10-01`) is read as the last second of that UTC day, so day
granularity never makes an input look older than it is. A time whose UTC form falls outside years
0000-9999 (`9999-12-31T23:00:00-02:00` is year 10000 in UTC) is treated as not declared. The
earliest of several SARIF times is chosen by instant, not by text.

A SARIF document with several runs, or several provenance entries, is checked against every subject
it declares, however many there are; the worst result wins. `report.json` records at most eight
distinct subjects per input. When a document declares more, `subjectsOmitted` counts the rest, and
the recorded eight start with the subjects that on their own disagree with the scanned subject, so
the record shows what decided the status. The cap applies to the record, never to the comparison.

A SARIF document is `matched` only when every declared subject declares a commit and every declared
commit is the scanned HEAD. A run with no version-control provenance, beside runs that have it, is
recorded as an empty subject (`{}`); it and a provenance entry with no `revisionId` leave the
document `unbound`, because the findings of that run are bound to no revision. A document in which
no run declares a subject records `subjects: []` and is `unbound` as before.

## What the scan compares against

- **Commit:** the scanned HEAD. A 40- or 64-character input commit is compared exactly; a 7- to
  39-character one as a prefix, the way Git resolves an abbreviated id.
- **Repository:** only what the operator names with `--subject-repository`. Cejel never infers a
  repository identity from clone state (a remote URL describes the clone, not the revision). Both
  sides are normalized to `host/path`, lowercase, without scheme, credentials, port, `.git` or a
  trailing slash; normalizing a normalized identity returns it unchanged. Without
  `--subject-repository`, an input's repository is recorded as `unverifiable`, and binding rests on
  the commit.
- **A repository Cejel cannot normalize** (an IP address or single-label host, a host with a
  trailing dot, a URL with no path) is never recorded: the declared text is where URL credentials
  live. The subject records `repositoryWithheld: true` instead. With `--subject-repository`, a
  withheld repository counts as `mismatched` (it is not demonstrably the named repository) and is
  refused under `--strict-ingest`; without it, the repository check is `unverifiable`, as for any
  declared repository. A `--subject-repository` value that does not normalize is refused without
  echoing it.
- **Freshness:** the HEAD commit's committer time, read offline with
  `git show -s --format=%ct HEAD`. An input observed more than `freshnessWindowSeconds` (86,400,
  one day, to absorb clock skew between a scanner host and a committer) before that time was
  produced before the scanned code existed. The comparison is never against the wall clock, so a
  re-run on another day produces the same bytes. Committer time is set by whoever made the
  commit; this is a consistency check between two declared times, not a proof of either.

## Binding status

Each record carries three checks and one status derived from them, worst first:

| Status | Meaning |
|---|---|
| `mismatched-repository` | The input declares a repository, and it is not the one named with `--subject-repository`. |
| `mismatched-commit` | The input declares a commit, and it is not the scanned HEAD. |
| `stale` | The input was observed more than the declared window before the scanned HEAD's commit time. |
| `matched` | The input declares a commit, and it is the scanned HEAD; nothing above applies. |
| `unverifiable` | The input declares a commit, but the scanned directory has no git HEAD to compare it with. |
| `unbound` | The input declares no commit. It may name a repository, but a repository alone does not bind it to a revision. |

`checks.repository` and `checks.commit` are each `matched`, `mismatched`, `absent` (the input
declares none) or `unverifiable` (the scan has nothing to compare with). `checks.freshness` is
`within-window`, `stale`, `absent` or `unverifiable`.

## Duplicates

Deduplication is unchanged, and each duplicate is recorded:

- **`same-path`:** a path supplied twice, or both with `--ingest` and through `.cejel/inputs`, is
  read and scored once, as it always was. The first repeat is recorded with `scored: false`; later
  repeats of the same path add no further record.
- **`same-content`:** identical bytes at two paths are both scored, as they always were. The second
  is recorded as a `same-content` duplicate with `scored: true`. Scoring it twice counts the same
  findings twice; `--strict-ingest` refuses it.

## Policy

- **Default, `record-only`.** The binding record is attached after scoring. It moves no score,
  status, abstention, badge or `--min-score` outcome. A certificate scored with a mismatched input
  has exactly the scores it had before report format 1.7.
- **`--strict-ingest`.** Before scoring, Cejel refuses every input whose status is
  `mismatched-repository`, `mismatched-commit` or `stale`, and every duplicate, and writes no
  certificate. The error names each refused file, why, and what it was compared against. `unbound`
  and `unverifiable` inputs are accepted and recorded: refusing them would refuse every 1.0 generic
  document and every SARIF file without version-control provenance. The certificate records
  `policy: "strict"`.

## Reproduction and verification

- `inputBinding.inputs` is ordered by digest, not by command-line order, and records no file path,
  so a reproduction that supplies the same files from another directory, in another order, produces
  the same bytes.
- `cejel issue` re-runs the scan and refuses to issue unless `report.json` reproduces byte for byte.
  It reads `--strict-ingest` and `--subject-repository` from the supplied report's `inputBinding`,
  so the reproduction uses the invocation the report records. A swapped input changes the recorded
  digest and therefore the bytes, and is refused.
- `cejel verify <report.json> <attestation.json> --input <file> ...` checks a set of input files
  against the recorded digests. The comparison is between sets of distinct sha256 digests: every
  supplied file's digest must be a recorded, scored input's, and every recorded, scored input's
  digest must be supplied. Supplying one file twice, or two files with identical bytes, counts once,
  so a `same-content` duplicate is satisfied by either copy. A file swapped for another, even with
  the same name, tool and finding count, fails. Each `--input` is read under the same checks ingest
  applies: a regular file, not a symlink, in a directory that is not a symlink, within the 8 MiB
  ingest budget. Anything else is refused before it is read.
- `inputBinding.inputs` holds at most 256 records: one per document (the ingest budget is 128
  documents) and at most one `same-path` repeat per document, however many times, or through
  however many routes, the path was supplied.
- The assembled report is validated against the schema `cejel verify` applies before anything is
  written. A scan that would produce a report its own verifier rejects fails instead.

## Conformance suite

Every row is run under the default policy and under `--strict-ingest`, with
`--subject-repository github.com/example/conformance`, against a fixture repository whose HEAD was
committed at `2026-10-01T12:00:00Z`. The inputs are constructed in the test, not vendored:

- **matching:** the scanned repository and HEAD commit, observed one hour after the commit.
- **wrong-repository:** `github.com/other/project` at another commit.
- **wrong-commit:** the scanned repository at another commit.
- **stale:** the scanned repository, no commit, observed one year before the commit.
- **duplicate:** the matching document supplied again at a second path. The table shows the second
  record; the first is `matched`.
- **unbound:** no subject at all (a SARIF run without `versionControlProvenance`, a Scorecard
  document without `repo`, a generic 1.0 document).

| Format | Case | Binding status | Duplicate | Default | Strict |
|---|---|---|---|---|---|
| sarif | matching | matched | - | scored, recorded | accepted |
| sarif | wrong-repository | mismatched-repository | - | scored, recorded | refused |
| sarif | wrong-commit | mismatched-commit | - | scored, recorded | refused |
| sarif | stale | stale | - | scored, recorded | refused |
| sarif | duplicate | matched | same-content | scored, recorded | refused |
| sarif | unbound | unbound | - | scored, recorded | accepted |
| scorecard | matching | matched | - | scored, recorded | accepted |
| scorecard | wrong-repository | mismatched-repository | - | scored, recorded | refused |
| scorecard | wrong-commit | mismatched-commit | - | scored, recorded | refused |
| scorecard | stale | stale | - | scored, recorded | refused |
| scorecard | duplicate | matched | same-content | scored, recorded | refused |
| scorecard | unbound | unbound | - | scored, recorded | accepted |
| generic | matching | matched | - | scored, recorded | accepted |
| generic | wrong-repository | mismatched-repository | - | scored, recorded | refused |
| generic | wrong-commit | mismatched-commit | - | scored, recorded | refused |
| generic | stale | stale | - | scored, recorded | refused |
| generic | duplicate | matched | same-content | scored, recorded | refused |
| generic | unbound | unbound | - | scored, recorded | accepted |

Two more properties are checked for every format:

- **Scoring is independent of binding under the default policy.** The scoring surface
  (`projectWitanScoringSurface`, the projection the rubric behaviour fingerprint digests) of a
  report with a mismatched input equals that of a report with the matching input carrying the same
  findings.
- **Without `--subject-repository`**, a wrong-repository input that also declares a commit is
  recorded as `mismatched-commit`, with `checks.repository: "unverifiable"`, and is still refused
  under `--strict-ingest`.
