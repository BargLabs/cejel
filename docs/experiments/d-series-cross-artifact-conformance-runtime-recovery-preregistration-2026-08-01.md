# D-series cross-artifact conformance pilot — runtime-recovery preregistration

Status: **frozen before recovery implementation or execution**

The first pilot result at commit `051a269e897ecc18aad889a40e2acbe67a140f1c` failed before
subject observation because the project-level pnpm launcher attempted registry-signature
verification while offline. That result remains adverse and is not replaced or reclassified here.

This document preregisters a second execution with one change only: invoke the already installed,
lockfile-selected `tsx` CLI directly instead of invoking it through pnpm. The detector contract,
subject revisions, artifact blobs, boundary probes, expected outcomes, and claim limits remain
byte-for-byte those in the v1 manifest.

## Frozen runtime

All three isolated Alfred worktrees were installed with `pnpm install --offline` before the first
execution. Each contains the same runtime:

| Runtime component | Frozen value |
|---|---|
| `tsx` version | `4.22.3` |
| `node_modules/tsx/dist/cli.mjs` SHA-256 | `5c916fa6ecad44aedbb01ca5815536d00ea07de6b73eeb9443d317326b0218d8` |
| `pnpm-lock.yaml` Git blob | `f265bc459610b22a7844e019e4d1fc9bf307dfd3` |
| root `package.json` Git blob | `8b7e8adace9696090761aa95adfc9be7f2b8470d` |

The recovery checker must verify all four values in every subject worktree before launch. It must
then invoke the pinned CLI as:

```text
node <subject>/node_modules/tsx/dist/cli.mjs <frozen-adapter> --alfred-root <subject>
```

It may not use `pnpm exec`, `npx`, Corepack, a globally resolved `tsx`, network access, or a
different installed package. A missing or mismatched runtime is a failed second pilot, not an
invitation to select another launcher.

## Unchanged subject and acceptance contract

The v1 machine manifest remains authoritative:

`docs/experiments/d-series-cross-artifact-conformance-pilot-manifest-2026-08-01.json`

In particular:

- defective Alfred revision: `76a631be63cf1be2cd4d9c6b303626a7124864c4`;
- original repair: `21495c14bbd1caa1669d507ea374a1c4ac6940b2`;
- merged repair: `800983fb06c36641ad25b34b82b6465df638c756`;
- defective zero boundary: `claimBearing: true`, no refusal reasons;
- both repair zero boundaries: `claimBearing: false`, exactly five zero-side reasons;
- every perfect boundary: `claimBearing: false`, exactly five perfect/no-miss reasons; and
- exactly one cross-artifact D1 finding only if both declaration and implementation pins match.

The second execution must produce a new result artifact that cites the first failed result. It may
claim only one non-fixture existence case if the entire frozen gate passes. No result may erase or
reinterpret the first launcher failure.

## Commit and run order

1. Commit and merge this recovery preregistration.
2. In a later commit, replace only the launch path and add fail-closed runtime-pin verification.
3. Freeze and push that checker commit.
4. Execute it once against the same three isolated worktrees.
5. Publish the second result in a later commit whether it passes or fails.
