# Calibration record authority in this repository

`docs/calibration/**` is treated as an authority path: B10, the cycle-13 freeze and the
disclosure boundary all rest on records kept there. Until 2026-09-16 nothing in this repository
could establish that authority. This page says what changed, and what did not.

## What was measured, 2026-09-16

Every commit that has ever touched `docs/calibration/` in this repository, with its git signature
status (`%G?`: `G` good signature from a listed key, `E` signed by a key this repository does not
list, `N` unsigned):

| commit | `%G?` | subject |
|---|---|---|
| `209a058` | E | calibration: publish the v22 detection-recall measurement record (#315) |
| `ebf4a33` | E | docs(calibration): v17 holdout reveal + hash-conventions doc (#222) |
| `787b218` | N | docs: record orphaned v0.3.0 provenance |
| `5afebfe` | N | docs: clarify v0.3.0 tag fast-forward |
| `bce29c1` | N | docs: record v0.3.0 tag correction |
| `307330e` | N | docs: preserve terminal GO binding |
| `f085908` | N | docs: disclose npm provenance gap |
| `2515814` | E | docs(evidence): free-core v50 multiple-comparisons disclosure (#41) |

**Five unsigned, three signed by an unlisted key, none verifiable.** The repository shipped no
allowed-signers file and no check read a signature, so the `--merge`-not-`--squash` discipline
that protects a calibration signature preserved something no reader could confirm: `209a058`,
merged carefully to keep its signature, reads exactly as `ebf4a33`, which was squashed.

This is not degradation from a working state. cejel has never produced a verifiable calibration
signature. Stating it plainly matters because "signed" and "unverifiable" look identical to anyone
who does not run `%G?` by hand, and a record whose authority cannot be checked is a record, not an
attestation.

## What the gate does

`scripts/check-calibration-signatures.mjs`, run on every pull request that touches a guarded path,
requires each commit touching `docs/calibration/**` or root `FREEZE.md` to carry a signature from a key in
`docs/security/allowed-signers`. It fails closed: a missing or key-less allowed-signers file is a
failure rather than a skip, because "nobody may sign" must never read the same as "anybody may".
`E` fails exactly as `N` does — accepting `E` would have passed the whole history above and
reported success.

A squash merge substitutes GitHub's web-flow key and produces `E`. Merge calibration pull requests
with `--merge`.

## What the gate does not do

It does not reach backwards, and no amount of later signing can make the eight commits above
verifiable. Records that predate the gate carry the authority of the process that produced them
and of this disclosure — not of a signature anyone can check. A document citing one of them as an
attestation is overstating it, and should cite this page alongside.

The gate also says nothing about *content*. It establishes that a listed key signed the commit, and
nothing about whether the measurement in it is sound. Provenance is not correctness.

Marker supersession uses the same verifier; see [measurement freeze](../measurement-freeze.md) for the chain, parent-pinned allowlist, and operator transition commands.

## Allowlist bootstrap provenance — reverified 2026-09-16

The initial `docs/security/allowed-signers` file was introduced by
`77fd3d27850fa928bcea70ba5fae622e8bda4465`, the squash merge of #318. With the
repository's SSH allowlist explicitly configured, local Git reports `%G?=E` and
key id `B5690EEEBB952194` (GitHub web-flow). This is not an operator SSH signature
verifiable under that allowlist. `E` describes this verification environment;
it does not claim that no one can cryptographically verify GitHub's signature.

The forward transition check trusts the parent commit's allowlist. That blocks a
transition from adding its own key in the same commit, but it does not independently
establish the identity or authorization of the initial enrolled key. Initial key
admission remains a bootstrap trust decision, separate from the eight historical
calibration records listed above.

The operator may re-establish that decision with an explicitly reviewed enrollment
acknowledgement, recording how the key was independently authenticated and preserving
an operator-signed commit without squashing. A later signature proves possession
of the signing key; it does not by itself establish the signer's identity or
retroactively turn `77fd3d2` into an operator-signed admission. This proposal only
discloses the boundary. It neither changes the allowlist nor signs an acknowledgement.
