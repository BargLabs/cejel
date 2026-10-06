# ADR-0021: Signature mechanism for evidence bindings

**Status:** Accepted 2026-10-06 (operator) as implemented by signed issuance v1 (#331); the differences are recorded in the acceptance amendment below. Anchor selection remains governed by proposed ADR-0023.
**Date:** 2026-08-13
**Extends:** ADR-0019 (certificate is a relying-party artifact); subordinate to proposed
ADR-0023 (trust anchor and signing model)

## Context

Proposed ADR-0023 establishes the binding-only evidence model: a trust anchor signs or records
the binding among repository revision, scanner artifact, rubric/configuration, report digest,
and decision — never a verdict — and defers *which* anchor signs to per-workflow selection
(customer CI, independent reviewer, or vendor), explicitly deferring any Barg Labs signing
authority. What ADR-0023 leaves open is the mechanism: when an anchor does sign, what exactly
is signed, with what primitive, and how a relying party verifies it offline.

A matching digest proves the report reproduces; only a verifiable signature over the binding
proves who stood behind it. External review of the certificate's plain-English surface (2026-08)
showed relying parties probing provenance unprompted; "who bound this" is the same question one
layer up.

## Proposed decision

Whichever anchor a workflow names under ADR-0023, the signature mechanism is uniform:

1. **Payload.** A canonical encoding of the ADR-0023 binding fields: repository revision/tree,
   scanner artifact digest, rubric/configuration identifiers, report digest, decision
   identifier, limitations reference, and issuance timestamp. The binding, nothing else.
2. **Primitive.** SSH signatures (`ssh-keygen -Y sign`, dedicated namespace `cejel-binding`).
   `ssh-keygen` is ubiquitous on relying-party machines and verification works fully offline.
   Sigstore keyless is the considered alternative, deferred: it binds to OIDC identities and
   requires network trust roots, in tension with the offline-boundary guarantee.
3. **Key discovery.** An allowed-signers file published at an anchor-controlled HTTPS location
   named in the artifact; relying parties may pin a local copy. Verification never requires
   the network when a local signers file is supplied.
4. **Verification.** `cejel verify` checks the signature when present and reports the signer
   identity; `--require-authorization` makes absence or failure fatal for relying parties that
   demand it. Unsigned artifacts remain valid and verify exactly as today.
5. **Claim semantics — stated in the artifact.** The signature attests that the named identity
   bound these artifacts at this time, per ADR-0023's binding-only rule. It does not attest
   correctness of findings, endorsement of the subject, or safety, compliance, completeness,
   or fitness for purpose.

## Consequences

- Anchor-agnostic: the same verification path serves customer-CI, independent-reviewer, and
  vendor anchors, so ADR-0023's per-workflow selection carries no per-anchor tooling cost.
- The anchor operating the keys carries rotation, revocation, and publication burden —
  ADR-0023's deferral of a Barg Labs authority is unchanged by this ADR.
- Schema gains one optional field; backward-compatible; ships in a minor release (0.5.x),
  never a patch.
- The plain-English surface must explain the signature in relying-party language; the 2026-08
  external review's lessons apply from day one.

## Evidence gates

Implementation begins only when an ADR-0023 anchor selection is made for a named workflow with
a relying party who requests binding verification, or a paid-pilot success criterion names it.
Until implemented, no cejel surface may imply bindings are identity-attested.

## Open questions

Canonical payload encoding; revocation semantics; multiple signers per anchor; rotation without
invalidating previously issued artifacts.

## Acceptance — 2026-10-06: implemented as signed issuance v1

Accepted by the operator, 2026-10-06, as already implemented by signed issuance v1 (#331,
`680dd02`, 2026-09-17; `docs/issuance.md`, `src/issuance/`). The text above is unchanged apart from
the title marker and the Status line. Where the shipped mechanism differs from the decision above,
the shipped mechanism is recorded here; neither is edited to match the other.

| Decision above | As shipped |
| --- | --- |
| SSH signatures under namespace `cejel-binding` | SSH signatures (`ssh-keygen -Y sign`), detached in `issuance.json.sig`, under namespace `cejel-issuance`, distinct from the calibration-authority namespace |
| Allowed-signers file at an anchor-controlled HTTPS location, optionally pinned locally | `docs/security/issuer-signers`, shipped inside the npm package and every release tarball; verification needs no network |
| `cejel verify` reports the signer; `--require-authorization` makes absence fatal | `cejel verify` prints three lines (signature, binding, revocation) and exits zero only when all three are good; there is no `--require-authorization` flag. Only `ssh-ed25519` keys verify in-tool; other key types report `NOT VERIFIED` |
| Payload: the ADR-0023 binding fields | An issuance names the source revision, `@cejel/cejel` version, rubric version and behaviour fingerprint, `reportByteIdentical: true`, the time, an `engagementRef` and the limitations, and binds the exact `report.json` and `attestation.json` |
| Anchor-agnostic | One anchor in use: Barg Labs as issuer, the shape of ADR-0023's option 2 (an independent Barg Labs signature for a paid Evidence Review). ADR-0023 itself stays proposed and is not decided by this acceptance |

`docs/issuance.md` carries a counsel-review notice: no issuance may be delivered to a counterparty
until the operator's lawyers have reviewed what it asserts. That notice stands, and only the
operator removes it.
