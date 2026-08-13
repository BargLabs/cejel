# Historical ADR import — Cejel source-of-truth dependency direction

**Original record:** `lab_notes/_studio/adr_cejel_dependency_inversion_2026-07-08.md`.
**Original decision date:** 2026-07-08.
**Import date:** 2026-08-11.
**Status:** Historical import. The architectural core is retained; legacy implementation and
commercial detail is not current policy.

## Retained decision

Cejel is authored and published from its own repository as the public source of truth. Other Barg
Labs systems consume Cejel as a dependency rather than extracting a public subset from an internal
codebase.

This direction reduces drift and the risk of internal incident context entering a public release.
Public rules and documentation should describe generic, inspectable patterns rather than private
project names, identifiers, credentials, or operational history.

## Current interpretation

This import does **not** adopt the original record's old package tiers, quant-specific functionality,
closed-service descriptions, signing claims, pricing, licensing assumptions, or implementation
checklist. Current commercial and evidence boundaries are governed by `docs/standing-constraints.md`,
ADR-0001, and the active proposed ADR register.

In particular, a hash or signature binds a report to stated inputs; it does not establish that the
repository is safe. A Barg Labs signing authority remains deferred under proposed ADR-0003.

**CONSTRAINTS-VERSION: 2026-08-01.3**
