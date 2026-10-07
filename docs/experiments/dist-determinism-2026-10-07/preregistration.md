# Preregistration: is the Docker build's `dist/` byte-reproducible across fresh runners?

Written 2026-10-07, before any run of the workflow below. Results go in `result.md` in a later
commit; this file is not edited after the first run (corrections go in an erratum).

## Why

Issue #418. On v0.6.1, publish-distribution run 37547490469 failed `verify-image-dist.sh`: the
pushed linux/amd64 image's `dist/` differed from the build stage the bundle SBOM was computed
from, in three files, by import-statement order only. Run 37549391038, the same tag and the same
workflow, passed.

CI's `oci-sbom-binding` cannot observe this. It builds the amd64 build stage and the full image
in one buildx builder, so the second amd64 build is a cache hit. Only the release compares two
independent builds, because `bundle-sbom` and `publish-oci` run on separate runners. The record so
far is one independent comparison failed and one passed. That is not a rate.

## Design

- **Source:** tag `v0.6.1` (`3bffd2d`), the commit that produced the observed failure.
- **Unit:** one GitHub-hosted `ubuntu-24.04` runner, fresh, building from scratch (no cache
  import). Each run hashes every file under `dist/` (sorted, SHA-256) and hashes that list.
- **Condition M (release shape):** `docker buildx build --platform linux/amd64,linux/arm64
  --sbom=true --provenance=mode=max` of the full image under QEMU, as `publish-oci` does. Record
  the amd64 and arm64 `dist/` hashes.
- **Condition S (SBOM shape):** `docker buildx build --platform linux/amd64 --target build`, as
  `image-bundle-sbom.sh` does. Record the amd64 `dist/` hash.
- **N:** 20 runs per condition, 40 runs in total, launched together from one workflow run.
  The number is fixed now and not extended after the results are seen.
- **Also recorded:** the three per-file hashes named in #418 (`calibration/llm-detector.js`,
  `packs/d-series/index.js`, `packs/decision-contracts/index.js`) for every run, and any run that
  fails or times out (a 30-minute bound per job), reported as such and not dropped.

## Outcome and decision rule

- **Primary:** the number of distinct amd64 `dist/` hashes across all 40 runs, and how many runs
  fall outside the most common hash, per condition.
- If every amd64 hash in both conditions is identical, the observed failure is not reproduced at
  N=40. That bounds the per-build rate (zero in 40 gives a 95% upper bound of about 7%). It does
  not prove reproducibility, and #418 stays open with that bound stated.
- If any two amd64 hashes differ, nondeterminism on fresh runners is confirmed at the observed
  rate. Any fix is then judged by re-running this same workflow at the same N and must show one
  amd64 hash across all 40 runs.
- Condition M versus S is reported descriptively. With N=20 each, a difference is not claimed as
  a cause unless it is stark (for example, no mismatches in one condition and several in the other).

## Not in scope

No fix is attempted in this experiment. Nothing is published: the workflow builds locally on
each runner and uploads only hash lists.
