# Verify the free-core v50 calibration record

This directory is a deliberately redacted public view of an immutable
calibration record. The hashes below were recomputed from the authoritative
source bytes. Only the digests and their meanings are published here; source
material containing identities, selection records, review material, or
sealed payloads is not included.

## Recomputed SHA-256 digests

| Record | SHA-256 | What it proves |
|---|---|---|
| Source preregistration | `ae7c77f7f2d2c40292507f8792298afec253c8716cfa43e4d79bcf8ee6eb4611` | Binds the exact prospective contract that existed before selection and scanning. |
| Frozen manifest | `b277944058f558066f762ebcbe45dc69f6e043ee3fc4f8dceae211c07164a7a3` | Binds the exact private holdout manifest without disclosing its contents. |
| Hash trust root | `a215d59b11d2d58ce697bff671ec63103968a731f728946d6717fe577f498a32` | Binds the content-addressed specification, implementation, selection, and scoring closure authenticated by the experiment. |
| Sealed result | `249284f7093e5e3c6cc48f9ed82c62f5cdc2a31c069b5e7ce7ebc443862d1037` | Binds the exact frozen estimator output from which the published gate table was transcribed. |
| Freeze record | `0a800ae75e7e453508f09376dc96d5cf3f9133fc15abe67d0e581a30b515ef75` | Binds the record that selection and revision freezing completed before scanning. |
| Final sealed artifact tree | `567fa34cb2c3e2f40a6fd363da6827352c653662b469589073c14f8813c10bae` | Binds the complete sealed pre-terminal artifact tree under its documented filename-and-file-hash closure procedure. |
| `terminal-go.md` | `bcc763ecec030a8ec4babcb4cd0f0d743dc97d4a144d3189a68de7b45c25eeaa` | Binds the exact bytes of the redacted public terminal GO record. |
| `v17-public-artifact-provenance-addendum-2026-08-06.md` | `43aeab6fcf108b8a7fdbd3441c199c7d20a378aa94319a1bbe89a2e426ca7a04` | Binds the exact bytes of the separate source-reachability and npm-artifact-provenance addendum. |

## Verification meaning

An authorized holder of the source record can recompute the first five file
digests directly from their bytes and recompute the final tree closure using
the frozen closure procedure. Exact matches establish byte identity; any
change produces a different digest.

The source history records the prospective contract before the freeze, the
freeze before scanning, and sealed review completion before the single
scoring run. Together, that ordering and the matching digests establish:

1. the methodology and gates were fixed before the holdout was examined;
2. the private holdout manifest did not change between freeze and scoring;
3. the published measurements came from the sealed result; and
4. the terminal decision refers to the same authenticated artifact closure.

These hashes prove integrity and ordering of the recorded experiment. They do
not disclose the private holdout, expand the calibrated claim, or turn this
record into a security audit.
