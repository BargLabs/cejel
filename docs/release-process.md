# Release process

## Required claim-retirement step

*Added 12 August 2026.*

**A release that fixes a published limitation does not retire the limitation. The documents that
carry the caveat do, and only if someone edits them.**

When a release ships a fix for a defect that is currently disclosed in outbound material, the
release is not complete until every document carrying that caveat has been revisited. Half-doing
this is worse than not starting: a caveat retired in one document and left in another produces two
statements that contradict each other in front of the same reader.

Checklist, to run **after** the release is published and verified:

1. Identify every document class carrying the caveat. At minimum: the claim register; any
   counterparty call sheet or account record; any sent-package follow-up; and the paid-pilot
   one-pager, whose reproducibility **success criterion** is contractual rather than descriptive.
2. Confirm the fix is in the **published** artifact, not merely merged. Check the release tag is an
   ancestor of nothing more recent than what shipped, and read the version back from the
   distribution surface rather than from the repository.
3. Update the claim register **first**. It governs on conflict, so a stale register reintroduces the
   retired caveat into the next document written.
4. Update each remaining document, and record the date the caveat was retired alongside the
   statement that replaced it.
5. State the boundary explicitly wherever the new claim appears: artifacts produced by the shipping
   version and later behave the new way; artifacts produced earlier do not, and their existing
   attestations remain valid.

**The named list of affected documents lives in the claim register in the private repository, not
here.** This repository is public; the register carries the counterparty specifics.

Known standing instance as of 12 August 2026: the report checkout-path caveat. The fix is merged
and unreleased, and four documents currently carry the qualifier.

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
