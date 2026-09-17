# Issuance — a Barg Labs countersignature over a reproduced certificate

> **This document requires counsel review before the first issuance ships to a customer.**
> The wording of what an issuance asserts is a liability surface. Nothing in this file has been
> reviewed by the operator's lawyers yet, and no issuance may be delivered to a counterparty
> until it has been. This notice is removed by the operator, not by an agent.

`cejel scan` writes `report.json` and `attestation.json`. That attestation is self-generated: it
says so, in its own words, and it stays that way. An **issuance** is a third file, `issuance.json`,
written beside them and signed by Barg Labs. It says one thing: an independent party re-ran the
named `@cejel/cejel` version at the named source revision and got the same `report.json` bytes.

The vendor's artifacts are never modified. `report.json` and `attestation.json` are byte-identical
before and after an issuance, which is what keeps them reproducible and lets a reader see exactly
which bytes were countersigned.

## What an issuance asserts

- **Who.** Barg Labs Inc., and the fingerprint of the key that signed.
- **What was reproduced.** The source revision, the `@cejel/cejel` version, the rubric version and
  its behaviour fingerprint, and `reportByteIdentical: true`.
- **When**, and an opaque `engagementRef` the issuer chooses.
- **The limitations**, carried verbatim on every issuance.

`reportByteIdentical` has no `false` value. If the re-run does not reproduce the supplied
`report.json` byte for byte, `cejel issue` refuses, prints both digests, and writes nothing. A
failed reproduction is a refusal to issue, never an issuance that records the failure.

## What an issuance does NOT assert

- It does **not** say the measurement is correct. A signature attests authority, not correctness;
  the two are different properties, and the certificate still owes its own guards.
- It does **not** say the software is safe, secure, or fit for any purpose, and it carries no
  warranty.
- It does **not** cover anything outside the pinned source tree. Evidence absent from that tree was
  neither seen nor found to be absent.
- It is **not** a coverage claim. Cejel reports a criterion it cannot measure as unmeasured; an
  issuance does not convert that into a pass.

## Verifying with OpenSSH alone

A relying party needs no Cejel, no network, and no trust in us to run this:

```sh
ssh-keygen -Y verify \
  -f docs/security/issuer-signers \
  -I issuance@barglabs.ai \
  -n cejel-issuance \
  -s issuance.json.sig < issuance.json
```

`docs/security/issuer-signers` ships inside the npm package and in every release tarball, so the
allowed-signers list is already on the reader's disk. The namespace `cejel-issuance` is distinct
from the namespace used for calibration authority records, so a calibration signature cannot be
replayed as an issuance and vice versa.

`ssh-keygen -Y verify` checks the signature and the signer. It does **not** check that the issuance
is bound to the `report.json` and `attestation.json` in front of you, and it does not check
revocations. For those, use `cejel verify`.

## Verifying with Cejel

```sh
npx @cejel/cejel@latest verify report.json attestation.json issuance.json issuance.json.sig
```

Three lines, and the exit code is zero only when all three are good:

```
signature:  valid — signed by issuance@barglabs.ai (ssh-ed25519, SHA256:…) under namespace cejel-issuance
binding:    valid — the issuance names the exact report.json and attestation.json supplied, and asserts reportByteIdentical: true
revocation: not revoked — this report digest is absent from …/issuer-revocations
```

Every other outcome is reported as an outcome, never as silence:

| Line reads | Meaning |
| --- | --- |
| `signature:  INVALID` | The bytes do not verify under the signature, or the signature is malformed, or it was made under a different namespace. |
| `signature:  SIGNED BY AN UNLISTED KEY` | The signature is cryptographically sound, but the key is not listed for `issuance@barglabs.ai`. This is **never** reported as valid. An empty `issuer-signers` file produces this too: "nobody may sign" must not read the same as "anybody may". |
| `signature:  NOT VERIFIED` | This build cannot verify this key type, or no signers file was found. Not a pass. |
| `binding:    INVALID` | The issuance countersigned different bytes than the ones you hold. |
| `revocation: REVOKED` | The report digest has been withdrawn; the date and reason are printed. |

`cejel verify` spawns nothing and opens no socket. Verification is pure Node `crypto`, so it works
on a disconnected machine with no OpenSSH installed.

**Supported key types.** `cejel verify` verifies `ssh-ed25519`. Any other key type — including the
FIDO/hardware-backed `sk-ssh-ed25519@openssh.com` — is reported as `NOT VERIFIED` rather than valid,
and must be checked with the OpenSSH command above. Confirm the issuer key's type before enrolling
it in `issuer-signers`: enrolling one Cejel cannot verify ships a certificate whose signature most
readers cannot check with the tool they were handed.

## Producing an issuance

```sh
npx @cejel/cejel@latest issue <repo-path> \
  --report  path/to/report.json \
  --attestation path/to/attestation.json \
  --key     path/to/issuer-key.pub \
  --engagement-ref ER-2026-0001
```

Pass exactly the `--product-name` / `--name` / `--rubric-pin` / `--ingest` arguments the original
scan used; anything else changes the bytes and the reproduction check refuses.

`cejel issue` writes `issuance.json` and stops. **Cejel never signs and never reads private key
material.** The issuer private key is generated by the operator on a hardware token, exists as no
file anywhere, and signs only through `ssh-agent`:

```sh
ssh-keygen -Y sign -n cejel-issuance -f path/to/issuer-key.pub -U issuance.json
```

`--key` names the **public** key. A file containing private key material is refused outright, with
a message saying why. `cejel issue` prints the exact command above after a successful reproduction.

`engagementRef` is an opaque identifier the issuer chooses, and it is **never** a counterparty name.
The schema constrains its character set; that it is genuinely opaque is a policy rule the tool
cannot check, and it is the issuer's obligation.

## Reading the revocations file

`docs/security/issuer-revocations` lists withdrawn issuances, one per line:

```
<report-sha256> <YYYY-MM-DD> <one sentence saying why>
```

The digest is the sha256 of the exact `report.json` bytes that issuance countersigned. The file is
**append-only**: an entry is never removed, edited, or reordered, because a withdrawal that could be
quietly reversed is not a withdrawal. Correcting a mistaken entry means appending a second line
saying so. `src/__tests__/issuance-revocations-append-only.test.ts` fails if a line ever disappears.

The file ships with no entries, on purpose. The absence of revocations is a statement a reader can
check, not an omission they have to infer.

## Key listing and rotation

The issuer key fingerprint is published in `docs/security/issuer-signers`. Rotation is recorded
there, in place, with dates: a retired key keeps its line with a comment giving the date it stopped
being used, so an issuance made while it was current stays checkable. A line is never silently
deleted.

Listing a signer is an authority decision and belongs to the operator. An agent must not write a key
into that file.

## Format and stability

`issuance.json` carries `issuanceFormatVersion`, currently `1.0`, versioned separately from the
report format. See [format stability](format-stability.md#issuancejson) for the additive-optional
rules and for the guarantee that issuance never modifies `report.json` or `attestation.json`.
