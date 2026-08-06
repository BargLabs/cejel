# Addendum — v17 source reachability and public-artifact provenance

**Date:** 2026-08-06 UTC  
**Status:** evidence addendum; not part of the sealed v50 artifact closure

This addendum records a post-decision source-reachability and npm-artifact
provenance check. It does not amend, relabel, rescore, or replace
[`terminal-go.md`](./terminal-go.md). That file remains an immutable, hash-bound
record: its digest in [`VERIFY.md`](./VERIFY.md) continues to bind its exact
published bytes.

## Question

The frozen free-core v17 detector source is
`BargLabs/alfred@8eff810a44014d06e257faa06cc2286e8ce639ae`. The nearest public
Cejel source release is tag `v0.1.10` at
`BargLabs/cejel@e51dac201b68a09ff7145c9e75284e5ac5bf776d`.

The question is not whether every source difference has a classification label.
It is whether the differences are reachable from the free-core scoring path that
produced the terminal-GO figures, and whether npm independently binds the public
`@cejel/cejel@0.1.10` artifact to that public source revision.

## Static source reachability

The public execution path is:

```text
src/index.ts → runCejelScan → scoreRepoWithPublicCejel
             → buildWitanInputFromRepo → createWitanReport
```

On that path, `buildWitanInputFromRepo` calls the pre-existing internal
`buildReviewableSourceProof` helper directly. The public-only
`buildV17ReviewableSourceProof` wrapper in `src/witan/repo-signals.ts` has no
non-test caller and is not re-exported from `src/witan/index.ts`; the package
declares CLI binaries only, not a source-subpath export.

The differing `dispatch_log` and `maeve_trace` enum members likewise have no
non-test Witan production references in the public source. The quant-integrity
and healthcare-integrity criterion-ID constants have no non-test references
anywhere in the public Witan source, and are not reachable from the public
free-core route above. Both frozen and public
`createWitanReport` calls default to `WITAN_RUBRIC`.

**Static conclusion:** the identified source differences are not reachable from
the sealed free-core v17 scoring path. This supports the narrower statement that
those differences do not, by themselves, show that the terminal-GO figures were
computed differently from the public source route.

This is a source-level result only. It does not prove runtime equivalence,
exclude unsupported external imports, or establish bundler/tree-shaking behavior.

## npm artifact provenance

The npm registry record for `@cejel/cejel@0.1.10` names the package and version,
and publishes the following tarball integrity values:

| Value | Published / verified value |
|---|---|
| SHA-1 | `a62562a4a063c4011525f319bf55fb2a14f310a7` |
| SHA-512 (base64) | `m46JuAxZYw4pexM2fWXRGL6bcyRHvDkJUYgdvo0e4eje/wAGr07tbn899XS+UalX6GsLSXlTYsb10VMmQgoq+w==` |

The downloaded public tarball matched both values. Its embedded `package.json`,
and the npm version metadata, contain no `gitHead`. The npm attestation endpoint
returned no provenance statement for this version.

**Artifact conclusion:** these checks bind the downloaded bytes to npm's
published `0.1.10` tarball, but they do **not** cryptographically bind that
tarball to `e51dac201b68a09ff7145c9e75284e5ac5bf776d`. A source-commit claim for
the npm artifact remains unproven by the available registry evidence.

## Communication boundary

The terminal-GO figures remain bound to their recorded frozen detector revision,
protocol, and sealed result. The static reachability result supports describing
the public source route as free-core-equivalent with respect to the identified
differences. Until an independently verifiable build provenance statement binds
the npm tarball to the public source revision, this addendum does not authorize
describing the terminal-GO figures as measurements of the published npm artifact
itself.

## Scope and limits

- Both source comparisons used the named Git revisions, not a rerun of the frozen
  cohort or an execution-equivalence test.
- The npm checks were made on 2026-08-06 UTC against the public registry record
  and tarball for version `0.1.10`.
- This file is an after-the-fact provenance disclosure. It is outside the sealed
  artifact tree and does not change any pre-registered gate, metric, or digest.
