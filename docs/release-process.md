# Release process

## Required Action major-tag step

After every immutable `v<major>.<minor>.<patch>` release tag has passed its release
verification, move the floating Action major tag (`v1`) to that release commit and prove what a
consumer receives in a GitHub Actions runner.

`v1` is deliberately floating: consumers use `BargLabs/cejel/action@v1` to opt into the latest
compatible v1.x release. Moving it is expected. It is the sole movable release tag; versioned
release tags such as `v0.3.0`, `v0.3.1`, and `v0.3.2` are immutable identity anchors and must
never be moved or reused.

Checklist:

1. Confirm the release attestation identifies the new immutable release tag and commit.
2. Diff `v1:action/action.yml` against the new release's `action/action.yml`, and record any
   consumer-visible composite-action change.
3. Confirm no release attestation, transparency entry, or prior publication binds `v1`.
4. Move `v1` to the immutable release commit.
5. Run a consumer workflow using `BargLabs/cejel/action@v1` and record the version it executes.

If the runner does not report the new release version, revert the `v1` move and investigate; a
Git ref update alone is not evidence of what consumers receive.

## Required site binary-link step

After the GitHub Release is published, update the single current-release record in the site source
and run its release-state check. The site derives its current download links, currency table, source
verification record, checksums, and provenance link from that record, and must link to canonical
GitHub Release assets rather than host copied binaries. Run the published download-and-checksum
snippet end to end against those release URLs before the site change is merged.
