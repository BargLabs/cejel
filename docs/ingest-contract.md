# Generic ingest contract

`cejel --ingest` accepts SARIF, OpenSSF Scorecard JSON, and the generic Cejel
external-signal contract. This page specifies the generic contract. It is an offline evidence
input: the certificate records supplied evidence and attribution; it does not turn Cejel into the
source tool or a decision engine.

The current version is `1.1`. Version `1.1` adds three optional identity fields (see
"v1.1 identity fields" below); a `1.0` document is unchanged and still accepted. The published
JSON Schema is
[`schemas/cejel-ingest-v1.schema.json`](schemas/cejel-ingest-v1.schema.json).

## De-facto contract before v1

This baseline was read from `src/witan/generic-adapter.ts` at Cejel commit `b4892d0`, before the v1
implementation. It is stated first so the new documentation does not rewrite history.

The old format had no version field. A root object was treated as generic when it had a non-empty
string `tool` and an array `signals`. Each signal could contain `dimension`, `weight`, and
`findings`; each finding could contain `ruleId`, `severity`, `message`, and `location`.

The actual acceptance behavior was wider and less explicit than the README example:

| Input condition | De-facto behavior |
| --- | --- |
| Missing contract version | Accepted; there was no version field. |
| Missing or non-finite `weight` | Defaulted to `0.5`. |
| `weight` below 0 or above 1 | Silently clamped into the 0–1 range. |
| Unknown `dimension` | The whole signal was silently dropped. |
| Unknown or missing `severity` | The finding was silently dropped. |
| Missing `ruleId` | Replaced with `unknown`. |
| Missing `message` | Replaced with the effective `ruleId`. |
| No surviving findings | The signal was silently dropped. |
| Unknown object fields | Ignored. |

That undocumented coercion-and-drop surface is a finding: a producer could believe it supplied
evidence while the certificate recorded less, and no version distinguished the behaviors.

## v1 document

```json
{
  "version": "1.0",
  "tool": "my-scanner",
  "signals": [
    {
      "dimension": "A2",
      "weight": 0.7,
      "findings": [
        {
          "ruleId": "hardcoded-secret",
          "severity": "critical",
          "message": "Hardcoded API key detected.",
          "location": "src/config.ts:10"
        }
      ]
    }
  ]
}
```

The stable v1 fields are:

- root: required `version`, `tool`, and `signals`;
- signal: required `dimension` and non-empty `findings`; optional `weight` defaults to `0.5`;
- finding: required `ruleId`, `severity`, and `message`; optional `location`;
- `dimension`: one of `A1`–`A5` or `B1`–`B6`;
- `severity`: `critical`, `warning`, or `info`; and
- `weight`: a number from 0 through 1. `0` records the signal without adjusting a score.

Unlike the de-facto format, invalid stable fields fail the ingest loudly. Cejel does not clamp,
invent, or silently drop semantic values under v1. At the shared ingest funnel, untrusted source
labels are stripped of control characters and bounded to 120 characters, while `ruleId`, `message`,
and `location` are bounded to the report schema's 200, 500, and 700 character limits. That
presentation-safety normalization preserves the supplied prefix and appends an ellipsis; it is not
semantic guessing.

## v1.1 identity fields

Version `1.1` adds three optional root fields. They let a certificate say what the findings are
about, who produced them and when, so Cejel can record whether the input is bound to the scanned
revision (see [input binding](input-binding.md)). Adding optional fields is exactly what a minor
version may do; nothing in `1.0` changed.

```json
{
  "version": "1.1",
  "tool": "my-scanner",
  "subject": { "repository": "github.com/owner/repo", "commit": "3f9c2a7e5b1d4c6a8e0f2b4d6c8a0e2f4b6d8c0a" },
  "producer": { "name": "my-scanner", "version": "2.4.1" },
  "observedAt": "2026-10-19T08:00:00Z",
  "signals": []
}
```

- `subject.repository`: optional string, the repository the producer read. Compared after
  normalization to `host/path`, lowercase, without scheme, credentials, port or `.git`.
- `subject.commit`: optional, 7 to 64 hexadecimal characters. A 40- or 64-character id is compared
  exactly with the scanned HEAD; a shorter one is compared as a prefix.
- `producer.name` and `producer.version`: optional strings. `producer.name` defaults to `tool`.
- `observedAt`: optional RFC 3339 date-time with an offset, the time the producer observed the
  subject.

These fields are read only from a document that declares minor `1` or later. Under `1.0` they were
unknown fields a consumer had to ignore, so a `1.0` document carrying a field of the same name in
another shape keeps parsing exactly as before. Under `1.1` they are stable optional fields, and an
invalid value fails the ingest loudly like any other stable field. They never change a score: the
default policy only records the binding status, and `--strict-ingest` refuses an input rather than
rescoring it.

## Compatibility policy

The `version` value is `<major>.<minor>`.

- A minor release may only add optional fields. It may not remove or rename a field, make an
  optional field required, narrow an accepted value, or change a stable field's meaning.
- A v1 consumer must ignore unknown fields at the root, signal, and finding levels. This is why the
  published v1 schema permits additional properties.
- Any removal, rename, new requirement, range narrowing, or semantic change requires a new major.
- Cejel rejects an unknown major with an explicit unsupported-major error. It never guesses that
  an unknown major means the current shape.
- An unversioned generic document is not v1 and is rejected. Producers must add `"version":
  "1.0"` (or `"1.1"` with the identity fields) and satisfy the v1 stable fields.

`rubricVersion` in a report is not the ingest-contract version. See
[`format-stability.md`](format-stability.md) for the output format identifiers.

## Abstention and evidence meaning

Generic ingest augments the native repository evidence and never replaces native measurement.
An ingested signal cannot convert a native `insufficient_data` status into a pass or fail. A
record-only mapping uses `weight: 0`, which produces an attributed `consumedSignals` record with
zero score adjustment.

Passing schema validation means only that the input has the declared shape. It does not establish
that the producer observed the event, that an action was correct, or that an outcome is trustworthy.
Consumers must retain that distinction.
