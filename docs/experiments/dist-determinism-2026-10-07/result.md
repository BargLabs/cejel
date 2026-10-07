# Result: dist/ determinism across fresh runners

Preregistration: `preregistration.md` in this directory, commit `2b37361`, written and pushed before
the run. This file reports that run as preregistered; nothing was extended or re-run.

- **Run:** workflow run 37630045104, `Measure dist determinism`, source tag `v0.6.1` (`3bffd2d`),
  2026-10-07, 40 jobs on fresh `ubuntu-24.04` runners.
- **Records:** 38 of 40. The two missing are condition M runs 6 and 17, reported below and not
  dropped.

## Primary outcome

| | runs with a record | distinct amd64 `dist/` hashes | outside the common hash |
|---|---|---|---|
| Condition M (release shape, two platforms, QEMU) | 18 of 20 | 1 | 0 |
| Condition S (SBOM shape, amd64 build stage) | 20 of 20 | 1 | 0 |
| All | 38 of 40 | **1** | **0** |

The single tree hash, in every run, is `0573cfa0a324358456b9e3aa9231ef0bdda1df5ff5355a15b21ab9e7a29add90`.
All 18 condition M arm64 trees have the same hash as the amd64 trees.

The three files named in #418 have the **known-good** hashes in all 56 records (38 amd64 + 18
arm64): `calibration/llm-detector.js` `2c8bfe93…`, `packs/d-series/index.js` `dd153c89…`,
`packs/decision-contracts/index.js` `6683f3d8…`. The bad import order seen in run 37547490469
(`77bdaf19…`, `54eed14a…`, `8753cc4f…`) did not occur.

**Reading under the preregistered rule:** the observed failure is not reproduced at N=38. Zero in 38
bounds the per-build mismatch rate at roughly 7.6% (95%, one-sided, rule of three: 3/38). That is a
bound, not proof of reproducibility. #418 stays open with this bound stated.

## The two missing runs: the QEMU hang, reproduced

Condition M runs 6 and 17 both logged
`qemu: uncaught target signal 4 (Illegal instruction) - core dumped` during `pnpm install` in the
emulated arm64 stage. Neither job failed; both sat with no further output until the 30-minute job
timeout cancelled them ("The job has exceeded the maximum execution time of 30m0s"). This is the
same failure as v0.6.1's first publish run (37542139689), which hung 53 minutes before it was
cancelled by hand.

Condition S, which never runs QEMU, had 0 hangs in 20.

- **Release-shape hang rate:** 2 in 20 builds here, plus 1 in the 3 v0.6.1 publish runs. Two in 20
  is a 10% point estimate, with a wide interval at this N (roughly 1% to 32%, 95% exact binomial).
- **Not preregistered as an outcome.** The preregistration only required failed or timed-out runs
  to be reported; the rate above is descriptive.

## What this changes

1. **The QEMU hang is now the measured problem; the import-order mismatch is not.** At this N, a
   release-shape build hangs far more often than it produces different bytes. The 30-minute timeouts
   from #417 turn a hang into a loud failure that can be retried. They do not prevent it.
2. **Fixing the hang** means not emulating arm64 for the `pnpm install` and build stages. Options:
   build arm64 on a native `ubuntu-24.04-arm` runner and merge the two images by digest; or, because
   `dist/` is identical across platforms (shown above), build `dist/` once natively and copy it into
   both platform images. The second also makes the SBOM binding exact by construction. Either needs
   its own change and should be judged by re-running this workflow at the same N: zero hangs and one
   hash across all 40.
3. **The import-order mismatch in run 37547490469 is still unexplained.** It stays a real observed
   event with a rate below about 8% per build. `verify-image-dist.sh` remains the control that
   catches it, and must not be relaxed.
