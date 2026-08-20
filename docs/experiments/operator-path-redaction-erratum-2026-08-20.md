# Operator-path redaction erratum — 2026-08-20

## Scope

Eight public experiment artifacts previously rendered workstation-specific absolute home paths.
Those path prefixes are operational metadata, not experimental inputs or evidence, and were not
needed to interpret or reproduce the published records.

On 2026-08-20, the rendered paths were replaced as follows:

- the active workstation home prefix became `<operator-home>`; and
- the distinct legacy workstation home prefix became `<legacy-operator-home>`.

The redaction changed no repository identity, revision, corpus count, source label, method,
prediction, measurement, adjudication, or outcome. In particular, edits within frozen
preregistration documents are presentation-only redactions; this erratum is the record of that
post-run change and does not amend their experimental commitments.

The derived source hash for `owned-corpus.json` in
`external-repository-exposure-registry-2026-08-10.json` was updated to bind the redacted bytes.
Its normalized identity set and record count are unchanged.

## Affected artifacts

- `docs/experiments/d-series-base-rate-2026-08-02/owned-corpus.json`
- `docs/experiments/session-archive-census-2026-08-01.md`
- `docs/experiments/session-trace-recall-preregistration-2026-08-01.md`
- `docs/experiments/session-trace-recall-result-2026-08-01.md`
- `docs/experiments/shape-diversity-preregistration-2026-08-01.md`
- `docs/experiments/shape-diversity-therasyn-sitemachine-2026-08-01.md`
- `docs/experiments/strata-a-yield-2026-08-01.md`
- `docs/experiments/stratum-b-yield-2026-08-01.md`
