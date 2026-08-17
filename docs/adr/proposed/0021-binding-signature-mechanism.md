# ADR-0021 (proposed): Signature mechanism for evidence bindings

**Status:** Proposed — mechanism only; anchor selection is governed by proposed ADR-0003
**Date:** 2026-08-13
**Extends:** ADR-0019 (certificate is a relying-party artifact); subordinate to proposed
ADR-0003 (trust anchor and signing model)

## Context

Proposed ADR-0003 establishes the binding-only evidence model: a trust anchor signs or records
the binding among repository revision, scanner artifact, rubric/configuration, report digest,
and decision — never a verdict — and defers *which* anchor signs to per-workflow selection
(customer CI, independent reviewer, or vendor), explicitly deferring any Barg Labs signing
authority. What ADR-0003 leaves open is the mechanism: when an anchor does sign, what exactly
is signed, with what primitive, and how a relying party verifies it offline.

A matching digest proves the report reproduces; only a verifiable signature over the binding
proves who stood behind it. External review of the certificate's plain-English surface (2026-08)
showed relying parties probing provenance unprompted; "who bound this" is the same question one
layer up.

## Proposed decision

Whichever anchor a workflow names under ADR-0003, the signature mechanism is uniform:

1. **Payload.** A canonical encoding of the ADR-0003 binding fields: repository revision/tree,
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
   bound these artifacts at this time, per ADR-0003's binding-only rule. It does not attest
   correctness of findings, endorsement of the subject, or safety, compliance, completeness,
   or fitness for purpose.

## Consequences

- Anchor-agnostic: the same verification path serves customer-CI, independent-reviewer, and
  vendor anchors, so ADR-0003's per-workflow selection carries no per-anchor tooling cost.
- The anchor operating the keys carries rotation, revocation, and publication burden —
  ADR-0003's deferral of a Barg Labs authority is unchanged by this ADR.
- Schema gains one optional field; backward-compatible; ships in a minor release (0.5.x),
  never a patch.
- The plain-English surface must explain the signature in relying-party language; the 2026-08
  external review's lessons apply from day one.

## Evidence gates

Implementation begins only when an ADR-0003 anchor selection is made for a named workflow with
a relying party who requests binding verification, or a paid-pilot success criterion names it.
Until implemented, no cejel surface may imply bindings are identity-attested.

## Open questions

Canonical payload encoding; revocation semantics; multiple signers per anchor; rotation without
invalidating previously issued artifacts.
