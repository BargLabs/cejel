# A3/B6 external paired candidate mining v2 — errata (2026-08-10)

**CONSTRAINTS-VERSION: 2026-08-01.4**

This erratum is additive. It does not edit or revive the v2 preregistration, rerun v2, or change
v2's terminal `PROTOCOL_FAILURE` state.

## Affected immutable records

| Record | Binding |
|---|---|
| V1 encrypted-evidence merge | `02ce173775d1ab66d136c1fe4a3abbbe380809e0` |
| V1 evidence manifest blob | `34b13c3136268f5913cfb622216e3bdef4a54369` |
| V1 ciphertext blob / bytes | `1bc214bdd40fb37b3527d6af4d664fd16b9c6aab` / 37,376,116 |
| V2 preregistration merge / blob | `64ffcf5e299565a3f01c3e2af3931bfaceaf3f7c` / `4e08d0a8f1bf6d009d69397ad40a80f86fe8b40f` |
| V2 final harness | `c71b88fc18e41724a42ab8c6156fe17e0d59a4a4` |
| V2 terminal result / Alfred merge | `5eb864315637207f8cb321be1eaf4b5e6f6262c8` / `47811f767366550ba97d04e8c9bec3fd586b292c` |
| V2 public closeout merge | `feac2428928a79e95d6d7e519a37b96d83a25d0e` |

## Correction

The v1 evidence manifest and v2 harness froze this value as the ciphertext SHA-256:

`b62fb0a08b886a1bb2bfa9a8149dea4f3e684e69ec5233af628915d7c5c0e6`

It is 62 hexadecimal characters and therefore cannot be a SHA-256 rendering. Hashing the exact
committed ciphertext blob produces this 64-character value:

`b62fb0a08b886a1bb2bfa9a8149dea4f3e684e69ec5233af628915d7c5c5c0e6`

The frozen value omits `5c` near its end. The blob identity and byte count were correct. The v1
evidence-preservation verification also recorded a successful encryption/decryption round trip, a
37,366,784-byte plaintext tar with SHA-256
`43b4b4d93157888b299ddd76d328ac44d7f3b95ffbf5de832b2f8f9a3ae1f0b0`, 55 JSON members, and zero
ledger hash mismatches. This erratum corrects only the ciphertext hash transcription; it does not
change those historical observations.

## Effect on v2 and successor use

V2 correctly refused to substitute an observed value for a frozen binding. It stopped before
archive decryption, candidate normalization, live search, candidate inspection, or Cejel scanning.
Its all-zero counts and non-claim-bearing closeout remain final.

A successor may bind the exact ciphertext blob, byte count, and corrected 64-character hash above,
then independently repeat all archive-authentication and round-trip checks before acquisition. That
is new prospective work under a new preregistration, not a repair or retry of v2. This erratum alone
does not authorize archive access, acquisition, evaluation, detector change, or any performance
claim.
