# ADR-0002: The Free LLM Pack gets an isolated CLI and artifact contract

**Status:** Accepted; implementation blocked on a fresh release-gate GO
**Date:** 2026-08-08
**Deciders:** Houman Azimi
**Supersedes:** no shipped interface. It replaces the unimplemented `--pack llm` proposal.

---

## Context

The repository contains an experimental Free LLM detector, strict result and attestation schemas,
renderers, and calibration tooling. None of those modules is a supported surface of the published
package. The public CLI rejects `--pack`, and the package exports only `./d-series`.

An earlier usage page nevertheless showed `cejel scan ... --pack llm` and described files the
released CLI could not write. PR #98 removed that runnable documentation and opened issue #97 for
the missing interface decision. Separately, the frozen v1.9 golden gate is an immutable NO-GO at
0/34 finding recall. The interface therefore needs a contract, but publishing an executable pack
now would turn an implementation detail into an unsupported product claim.

This decision answers four questions before implementation: how the pack will be invoked, which
artifacts are stable, what verification proves, and how the ordinary Cejel score remains isolated.

## Decision

**Reserve a dedicated `cejel llm` command family for the first public Free LLM Pack. Do not expose
it until a fresh preregistered release gate reaches GO and the release language is authorized.**

The current release continues to reject `--pack llm`, `llm scan`, and `llm verify`. Internal and
historical calibration argv are evidence-protocol details, not public compatibility promises.
The public usage page must not contain a copy-paste invocation until the implementation ships.

### Invocation contract

The reserved command grammar is:

| Operation | Reserved form | Meaning |
|---|---|---|
| Scan | `cejel llm scan [path] [scan-options]` | Run the ordinary scan and the opt-in Free LLM scan over one frozen input snapshot. |
| Verify | `cejel llm verify <report.json> <llm-report.json> <llm-attestation.json>` | Verify schemas and byte-level bindings without rescanning source. |

`path` defaults to the current directory. The scan operation will accept the ordinary scan options
`--out`, `--name`, `--ingest`, `--min-score`, and `--quiet` with their existing meanings. The
default output directory remains `.cejel`. `--min-score` applies only to the ordinary base score;
Free LLM findings never alter that threshold or create an implicit pack gate. `--ingest` likewise
affects only the ordinary report. Subject to the existing base-score threshold behavior, a
completed scan returns zero even when the pack emits findings. Invalid input, failed verification,
or an operational failure returns nonzero.

The initial public interface is CLI-only. No `@cejel/cejel/free-llm` JavaScript export is promised
by this ADR. A future programmatic API needs its own typed entry-point contract and semver review;
the existing source modules remain internal even though they are present in the repository.

### Scan output contract

One `llm scan` invocation writes the existing ordinary artifacts unchanged:

- `report.json`
- `attestation.json`
- `certificate.html`
- `badge.json`
- `badge.svg`
- `summary.json`

It additionally writes exactly these pack-owned artifacts:

- `llm-report.json` — the strict Free LLM result, coverage, limitations, findings, evidence,
  input-source digest, base-report digest, and exact detector/rule lineage;
- `llm-attestation.json` — an in-toto statement whose subject is the exact serialized
  `llm-report.json` and whose predicate repeats its pack, detector, rule-contract, input-source,
  base-report, generation-time, and assurance bindings; and
- `llm-certificate.html` — a self-contained rendering of `llm-report.json`, not a separately
  attested claim surface.

All nine files are written to the one selected output directory. Implementations must use one
repository snapshot for both scans and fail closed if supported source changes between collection
and artifact creation. Partial pack output must not be presented as a completed scan.

### Verification contract

`llm verify` is local and offline. It must:

1. strictly parse the base report, pack report, and in-toto statement using their declared schema
   versions;
2. hash the exact `llm-report.json` bytes and require the in-toto subject digest to match;
3. require every duplicated predicate field to equal the corresponding pack-report field;
4. hash the exact `report.json` bytes and require `baseReportSha256` in both pack artifacts to
   match; and
5. return nonzero with a specific error for any missing file, schema error, or binding mismatch.

Successful verification proves only internal byte binding among the three supplied files. The v1
attestation remains `assurance.status: "unsigned"` and `issuer: "self-generated"`. Verification
does not prove a signer identity, trusted execution, source-repository identity, current source
bytes, completeness, correctness, safety, or a release-gate result. A signed provenance mode would
be a new assurance contract, not a silent extension of `verify`.

### Versioning and compatibility

Four versions remain explicit and independent:

| Version | Governs | Compatibility rule |
|---|---|---|
| Package semver | CLI grammar, flags, exit behavior, and filenames | Removing or repurposing a shipped command/flag or file is package-semver breaking. |
| Artifact schema version | JSON field shape and validation | Readers reject unknown major/schema identifiers. A shape change gets a new schema identifier; it is never inferred from package version. |
| Rule-contract version | Stable rule IDs and their operational meaning | Removing a rule or materially changing what its ID asserts requires a new rule-contract version. |
| Detector version/source revision | Concrete recognition behavior | Any semantic detector change records new lineage; calibration and measured claims do not transfer automatically. |

Within one artifact-schema identifier, writers produce the exact strict shape and readers reject
unknown fields. Additive evolution therefore also uses a new identifier unless the schema was
explicitly designed with an extension point. A future CLI may read older artifacts, but it must
report their recorded lineage and must not relabel them as current output.

### Score-isolation guarantees

The Free LLM Pack is not a twelfth base criterion and has no composite score or verdict. Its
findings never enter `WitanFindingSchema`, A1–B6 criterion calculations, the base badge, the base
certificate verdict, or `--min-score`.

For the same package version, repository snapshot, invocation timestamp, path, and ordinary scan
options:

- the exact `report.json` bytes from `cejel llm scan` must equal those from `cejel scan`;
- the other five ordinary artifact bytes must also remain equal;
- selecting the pack may only add the three `llm-*` files and an additional terminal section; and
- failure in the pack path must not rewrite a successful base result into a different score.

Implementation is gated on byte-equality tests through the installed npm artifact, not just unit
tests against source. The structural offline-boundary guard must continue to cover every public
scan path. No network or model dependency may enter the command.

## Release gate

This ADR is permission to implement the interface after evidence exists; it is not permission to
ship it now. Public implementation requires all of the following in one release decision:

1. a fresh preregistration that is a strict ancestor of every result commit;
2. a dated GO on the named golden and untouched cohorts under the detector version being shipped;
3. closed correction records and the required artifact/attestation verification tests;
4. installed-package parity proving the base artifacts remain byte-identical;
5. an updated authorized-claims register and public wording within the measured boundary; and
6. usage documentation changed in the implementation PR, not before it.

Until then, the correct public statement remains that the pack is experimental, has no public CLI
or package export, and that `--pack llm` is unsupported.

## Options considered

### Add `--pack llm` to the ordinary scan

Rejected. It visually places the pack inside the scoring command, encourages consumers to treat
its findings as part of the base verdict, and overloads the current `verify` grammar. It also risks
turning a historical calibration command into an accidental compatibility promise.

### Publish a JavaScript export first

Rejected for v1. A library API would expose inventory, snapshot, artifact-construction, and error
semantics simultaneously, while the immediate product need is a stable end-to-end command. The
strict internal modules remain free to change until a separate programmatic contract is accepted.

### Expose the existing alpha immediately with warnings

Rejected. The release gate is NO-GO, and warning text does not make an unmeasured interface a
supported product. The cost of waiting is smaller than creating artifacts users can reasonably
mistake for calibrated assurance.

## Consequences

**Easier.** Base scoring and pack evidence have separate namespaces, verification inputs, and
compatibility rules. The artifact can evolve without pretending that detector semantics follow
package semver, and consumers can mechanically distinguish byte binding from signer assurance.

**Harder.** Implementation cannot reuse the shortest `--pack` parser change. It must add a command
namespace, a three-input verifier, atomic output behavior, installed-package parity tests, and a
release-gate check before public documentation changes.

**Intentionally unchanged.** This ADR changes no detector, rule, score, report, calibration result,
claim, package export, or public CLI behavior. It does not edit the frozen public-surface documents
bound by the v1.9 preregistration.

## Action items

1. [ ] Complete and publish the fresh file-local calibration cycle required after v1.9.
2. [ ] If and only if that cycle reaches GO, implement the reserved command family and verifier.
3. [ ] Add installed-package byte-parity, offline-boundary, atomic-output, and verification-failure
       tests in the implementation PR.
4. [ ] Update the claims register and usage page in that implementation/release sequence.
