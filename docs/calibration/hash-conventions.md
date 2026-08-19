# Calibration hash conventions

This repository's calibration machinery (`calibration/llm/scripts/freeze-cohorts.mjs`,
`freeze-detector.mjs`, `pre-result-commitment.mjs`) has used one canonicalization and
digest convention since it was first written. This document names it explicitly — until
2026-08-18, the convention existed only as a string constant in code
(`freeze-cohorts.mjs`'s `HASH_CONTRACT`), with no standalone reference doc, despite being
cited elsewhere as if one existed.

## The convention: `rfc8785-sha256-v1`

1. **Canonicalize** the JSON value being committed to:
   - `null`, booleans, strings, and finite numbers serialize via `JSON.stringify`.
   - Arrays serialize element-by-element, in their existing order (arrays are ordered
     data — canonicalization does not sort array elements).
   - Objects serialize with their keys sorted lexicographically (`Object.keys(value).sort()`),
     recursively, with no whitespace.
   - Non-finite numbers and any other JS type throw rather than silently coerce.

   Reference implementation: `canonicalize()` in
   `calibration/llm/scripts/freeze-cohorts.mjs`. This is a practical subset of RFC 8785
   (JSON Canonicalization Scheme) sufficient for this repository's data shapes — full
   RFC 8785 number-formatting edge cases (e.g. `-0`, exponent normalization) are not
   separately handled because they don't arise in this repository's schemas.

2. **Digest** the canonicalized UTF-8 bytes with SHA-256, hex-encoded:
   `sha256Canonical(value) = createHash('sha256').update(canonicalize(value), 'utf8').digest('hex')`.

3. **Self-exclusion.** When an object carries its own digest as a field (e.g. a manifest's
   `manifest_sha256`, a record's `record_sha256`, an entry's `entry_sha256`), that field is
   excluded from the value being canonicalized before hashing — the digest never covers
   itself. State which field is excluded whenever you name a digest (e.g. "manifest excludes
   `manifest_sha256`").

Use the actual functions (`canonicalize`, `sha256Canonical`, `hashManifest`,
`hashRepositoryEntry` in `freeze-cohorts.mjs`) rather than reimplementing this scheme —
a second, subtly different canonicalizer would make digests non-reproducible between
tools, which defeats the point of publishing one.

**Array order is part of the commitment, and locale-dependent sorts break it.**
`canonicalize()` preserves array element order rather than re-sorting it — arrays are
ordered data. So when a document publishes a *sorted* array (e.g. a member list sorted by
name for readability), the sort itself must be specified and locale-independent, or two
honest reproducers computing "the same" sorted list can get different orders and therefore
different digests. Use plain code-unit/codepoint comparison (JS's default `<`/`>` on
strings) — never `localeCompare`, which is ICU-version- and locale-dependent and is not
guaranteed to agree across machines. (Caught during the v17 reveal: an initial draft sorted
with `localeCompare`, and a Python cross-check of the same list under Python's default
`sorted()` disagreed on order — codepoint order was the fix, verified to agree across both
languages before publishing.)

## Field naming and the algorithm-prefix question

The studio-wide convention (`lab_notes/_studio/hash_algorithm_conventions_2026-08-16.md`,
2026-08-16) asks new digest fields to carry an algorithm-prefixed value (`sha256:<hex>`)
rather than bare hex, so a future algorithm migration doesn't require guessing what an old
bare-hex value was hashed with.

This repository's calibration digests (`manifest_sha256`, `record_sha256`,
`entry_sha256`, and the `member_list_commitment_sha256` workflow input added alongside
this document) intentionally keep **bare hex**, for a narrower reason than "predates the
convention": the algorithm is already unambiguous from the field name itself
(`_sha256` suffix), the `hashContract`/`HASH_CONTRACT` string is carried alongside every
digest that matters for verification, and rewriting the existing family of `*_sha256`
fields across `calibration/llm/` to a prefixed form would be a change to pinned artifacts,
which the 2026-08-16 doc itself says not to do retroactively. New digest fields in *other*
parts of this studio (new Maeve registry entries, new receipt records, non-calibration
cejel certificate fields) should still follow the `sha256:<hex>` prefix convention — this
repository's `*_sha256` family is the one documented exception, and this is that
documentation.

## Where this is used

- `calibration/llm/scripts/freeze-cohorts.mjs`, `freeze-detector.mjs` — cohort and detector
  freeze records.
- `calibration/llm/scripts/pre-result-commitment.mjs`, `create-pre-result-commitment.mjs` —
  commit-then-reveal for scan **results**.
- `.github/workflows/llm-calibration.yml`'s `member_list_commitment_sha256` input (see
  the freeze-workflow PR that added it) — commit-then-reveal for frame **membership**,
  the design this document was written to support.
- `docs/calibration/free-core-v50/holdout-reveal-2026-08-18.md` — the v17 frame's
  retroactive reveal; its `manifest_sha256` is computed by exactly the scheme above.
