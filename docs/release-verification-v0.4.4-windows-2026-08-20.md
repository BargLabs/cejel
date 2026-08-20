# Cejel v0.4.4 Windows binary verification

- **Checked:** 2026-08-20 UTC
- **Release:** [`v0.4.4`](https://github.com/BargLabs/cejel/releases/tag/v0.4.4)
- **Release commit:**
  [`21ae64ca80dce8ca6dd9ec6c0687204fc8578599`](https://github.com/BargLabs/cejel/commit/21ae64ca80dce8ca6dd9ec6c0687204fc8578599)
- **CONSTRAINTS-VERSION: 2026-08-01.4**

## Distribution row for cejel-site

| Route | Artifact | Version | Result | Evidence | Checked |
| --- | --- | --- | --- | --- | --- |
| Windows x86_64 standalone binary | [`cejel-Windows-x86_64.exe`](https://github.com/BargLabs/cejel/releases/download/v0.4.4/cejel-Windows-x86_64.exe) | 0.4.4 | **Verified.** Published checksum matched; native Windows execution exited 0 and wrote `report.json`; report bytes matched the pinned npm package on the identical fixture. Intentionally unsigned. | [`SHA256SUMS`](https://github.com/BargLabs/cejel/releases/download/v0.4.4/SHA256SUMS); [fresh run 32339428593](https://github.com/BargLabs/cejel/actions/runs/32339428593); [prior run 32189555617](https://github.com/BargLabs/cejel/actions/runs/32189555617) | 2026-08-20 UTC |

## Published artifact readback

GitHub's public release record reported `v0.4.4` as published at `2026-08-18T21:46:52Z`, not a
draft or prerelease, with target commit
`21ae64ca80dce8ca6dd9ec6c0687204fc8578599`.

| Item | Observed value |
| --- | --- |
| Windows asset | [`cejel-Windows-x86_64.exe`](https://github.com/BargLabs/cejel/releases/download/v0.4.4/cejel-Windows-x86_64.exe) |
| Asset size | 87,564,800 bytes |
| Asset SHA-256 | `06574c4cb04a8c8fda8379cff687d8db9c4c27fe755c584beafe7f4e16edd464` |
| Checksum file | [`SHA256SUMS`](https://github.com/BargLabs/cejel/releases/download/v0.4.4/SHA256SUMS) |
| Checksum-file SHA-256 | `d99bb37f1fb707910412e46b09e9c1f3b248333e9a395b82aba88071f9d24135` |

The Windows asset digest in GitHub's release record, the computed digest in the fresh hosted run,
and the Windows line read from the published `SHA256SUMS` were all
`06574c4cb04a8c8fda8379cff687d8db9c4c27fe755c584beafe7f4e16edd464`.

## Native stranger-check

[Fresh run 32339428593](https://github.com/BargLabs/cejel/actions/runs/32339428593) dispatched the
already-merged verifier from `7489d0f34acd77eefb45632667607d0e429c75e4` with input `v0.4.4`.
It downloaded the already-published `.exe` and `SHA256SUMS`; it did not rebuild the binary.

The [Windows job](https://github.com/BargLabs/cejel/actions/runs/32339428593/job/96335401535)
ran on the resolved GitHub-hosted Windows image, extracted deterministic fixture commit
`80632888786570dc6510533cce50d84910a9c050`, observed the checksum match above, executed the
published binary with exit code 0, and required `report.json` to exist before uploading evidence.

The [comparison job](https://github.com/BargLabs/cejel/actions/runs/32339428593/job/96335463380)
reported the same `report.json` SHA-256 for Windows, Linux aarch64, and the published
`@cejel/cejel@0.4.4` npm package:
`15ed49255d68661e4e7b7c30cec45da44548a8789bb236547e3c93df5f4f00fd`.
The Windows-versus-npm result was `MATCH`.

[Prior run 32189555617](https://github.com/BargLabs/cejel/actions/runs/32189555617) independently
observed the same Windows asset digest, exit code, report digest, and Windows-versus-npm match on
2026-08-18. It is corroboration, not a substitute for the fresh run.

## Workflow, action, and tool pins

The verifier file at the `v0.4.4` release tag and at run commit
`7489d0f34acd77eefb45632667607d0e429c75e4` is byte-identical, with SHA-256
`d65f563f1994ece21f28ee4d820fdcb8332d1f09a3d83c795781cd22a6ddb7a7`.

| Component | Exact version or identity used |
| --- | --- |
| Workflow | `.github/workflows/verify-published-windows-binary.yml` at `7489d0f34acd77eefb45632667607d0e429c75e4`; file SHA-256 `d65f563f1994ece21f28ee4d820fdcb8332d1f09a3d83c795781cd22a6ddb7a7` |
| `actions/checkout` | `d23441a48e516b6c34aea4fa41551a30e30af803` (`v6`) |
| `actions/upload-artifact` | `ea165f8d65b6e75b540449e92b4886f43607fa02` (`v4`) |
| `actions/download-artifact` | `d3f86a106a0bac45b974a628896c90dbdf5c8093` (`v4`) |
| `actions/setup-node` | `249970729cb0ef3589644e2896645e5dc5ba9c38` (`v6`) |
| Actions runner | `2.336.0` |
| Windows runner image | `windows-2025-vs2026`, image `20260810.198.2`; [immutable image manifest](https://github.com/actions/runner-images/blob/win25-vs2026/20260810.198/images/windows/Windows2025-VS2026-Readme.md) |
| Windows image tools used by the download/shell path | GitHub CLI `2.97.0`; Git for Windows `2.55.0.windows.3` (Git Bash and bundled Unix utilities are bounded to the exact image above) |
| npm comparison runtime | Node.js `22.23.2`; npm `10.9.8`; package `@cejel/cejel@0.4.4` |

Every third-party action reference is pinned by full commit SHA. The workflow's runner label is
floating in source, so this record does not describe it as a source-level pin: the exact image
above is the resolved execution environment observed in the run. The workflow did not print
standalone package versions for the Git-for-Windows-bundled `tar`, `awk`, or `sha256sum`; their
provenance is bounded to that immutable image manifest, not claimed more narrowly. This document
adds no copy-paste verification command with a floating tool or package version.

## Signing and claim boundary

The 0.4.4 Windows executable is intentionally unsigned. The successful
[release-build Windows job](https://github.com/BargLabs/cejel/actions/runs/32187891718/job/95875636396)
gated its output on PowerShell `Get-AuthenticodeSignature` returning `NotSigned`; the README warns
that Microsoft SmartScreen may therefore appear. This is not an Authenticode-signing claim.

This result verifies the public 0.4.4 Windows x86_64 download path, checksum binding, and execution
on the cited runner. Report-byte equality is limited to the deterministic fixture and published
revisions exercised by the cited runs; it is not a cross-platform equivalence claim for all
possible repositories.
