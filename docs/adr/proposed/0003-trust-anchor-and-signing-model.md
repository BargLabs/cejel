# ADR-0003 (proposed): Establish a relying-party-verifiable trust anchor for evidence bindings

**Status:** Proposed — no customer reliance claim until implemented  
**Date:** 2026-08-11  
**Proposed deciders:** Barg Labs founders, with a design partner and legal review

## Context

Cejel can deterministically reproduce a report locally, but a report digest alone is a
self-reported hash. A relying party needs to verify the binding among the immutable repository
revision, Cejel artifact, rubric/configuration, report digest, and named decision. The binding must
be signed or recorded by an independently verifiable authority. It must never be presented as a
signature that the code is safe, compliant, complete, or fit for purpose.

## Proposed decision

Adopt a **binding-only evidence model**. Each reliance-capable package identifies the repository
revision/tree, scanner artifact digest, rubric/configuration identifiers, report digest, decision
identifier, and limitations. A trust anchor signs or records that binding, not a verdict.

Candidate models, to be selected per named workflow:

1. customer-controlled CI/provenance record as the default;
2. independent Barg Labs reviewer signature for a paid Evidence Review; or
3. vendor/publisher signature for a vendor-release workflow.

No unsigned local attestation may be described as an Arista-style publisher anchor or as a
relying-party-verifiable certificate.

## Deferred: operating a Barg Labs signing authority

Barg Labs will not operate a general signing authority at this stage. Determinism and local
reproduction are the current integrity story. Operating a signing authority introduces key custody,
rotation, revocation, identity publication, verification support, and a different liability posture:
the artifact risks being read as an attestation issued about someone else's software.

Reconsider this only when one of the following is observed and documented:

1. A relying party must use the record but cannot practically or contractually re-run it against the
   subject repository.
2. A contract requires third-party attestation or issuer authentication.
3. A regulated recipient requires authenticated artifacts in its evidence chain.
4. There is an observed or credible alteration/substitution incident that local reproduction cannot
   resolve for the relevant relying party.

Signatures are not a presentation feature. Until a selected model is implemented and independently
verifiable, customer material must not call Cejel outputs certified, independently signed, or verified
by Barg Labs.

## Evidence gates

- Define the relying party, verification steps, key custody, rotation/revocation, and retention.
- Demonstrate independent verification from a clean checkout on a named pilot repository.
- Obtain legal review of wording, liability boundary, and the difference between evidence and a
  safety/compliance opinion.
- Publish a machine-readable verification procedure and failure/abstention behavior.

## Consequences

**Easier:** a recipient can distinguish reproducibility from self-assertion.  
**Harder:** key management, support, revocation, and legal wording become real product obligations.

Until accepted and implemented, Cejel remains an offline, reproducible evidence record without a
universal external trust anchor.

**CONSTRAINTS-VERSION: 2026-08-01.3**
