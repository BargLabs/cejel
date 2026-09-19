# G6 — parser scope and specimen denominator

**CONSTRAINTS-VERSION: 2026-08-01.5**

Execution mode: read-only source inspection of parser commit `3bfad83840a368a25b13f8607b5ff0d03da24888`; isolated test correction on the specimen PR, whose original record commit is `bc0ee453b272ea47e04e70273d4713e6beccb060`.

## Card 2

“Bounded” means scoped to PostgreSQL URL userinfo in a `DATABASE_URL` assignment, not input-length-bounded. `findDatabaseUrlUserinfoCredential` accepts `postgres:` and `postgresql:`, requires nonempty user and password, decodes the password and applies the placeholder filter. The function has no explicit input-length ceiling. Other schemes, connection keys, credentials in query/path fields, malformed URLs or percent encoding, and surrounding syntaxes outside the assignment matcher remain residual classes. No broader nested-credential coverage is claimed; expansion needs its own diagnosis and precision controls. This clarification changes no detector behavior and does not introduce a new limit that could suppress findings.

## Card 9

The former expected set was hardcoded in the test, not derived from a specimen directory. There is no committed canonical directory containing all three reconstructed specimens. The existing directory holds only a synthetic guard fixture. Treating its presence as a denominator for real specimen completeness would be false.

The corrected record guard derives IDs from the immutable public registration at `bc0ee453b272ea47e04e70273d4713e6beccb060`, independently of the mutable record being checked. Removing, adding, duplicating, or renaming an entry cannot shrink that denominator. Missing Git history is a failure, not an empty passing selection; the CI workflow already requests `fetch-depth: 0`. The pin is a record-registration pin, not a Maeve fix anchor or a specimen revision.

This proves completeness **against that registration only**. It does not establish that all real specimens are registered, that the three canonical specimens exist, or that any reconstruction is faithful. Operator reconstruction remains open. Once canonical specimens exist, derive the actual specimen inventory from their separately pinned committed tree and compare it with this record; do not invent placeholders and call them reconstructed specimens.

Qualification selection (expected nonzero): the real record plus five focused tests, including a removed-entry mutation, an identity replacement with all entries present, a missing synthetic artifact, and a wrong asserted synthetic property. These are bookkeeping and guard proofs, never recall or fidelity measurements.

Results: five focused tests passed. Removing the inventory equality check while leaving the record and immutable inventory present failed both missing-entry and identity-replacement controls; restored tests passed. Build and the complete 1,413-test suite (92 files, including the offline guarantee) passed in the isolated macOS worktree. The qualifying execution uses full Git history; a shallow checkout missing the registration is not a supported passing mode.
