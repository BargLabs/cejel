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

## Release-control lesson

**Anchor:** `7ae5935f6f65eff61763d363489eb7d2b2bc6a94` on `origin/main` (the first independent
MCP Registry and OCI release-chain readback).

A control that runs at the moment of an operation reports on the operation, not on its effect.
A claim about state requires reading the state back from something that did not produce it. Release
currency therefore belongs to an independent, read-only verifier: publisher outputs and the
publisher's own record may be subjects of comparison, but never the verifier's source of truth.

## Required site binary-link step

After the GitHub Release is published, update the single current-release record in the site source
and run its release-state check. The site derives its current download links, currency table, source
verification record, checksums, and provenance link from that record, and must link to canonical
GitHub Release assets rather than host copied binaries. Run the published download-and-checksum
snippet end to end against those release URLs before the site change is merged.

## Reference pattern: verifying a published artifact as a stranger would

*Added 18 August 2026.*

A reproducibility or trust check that re-invokes the tool it is checking must go through the same
sealed, published entry point an outside caller would use — not an internal import of the function
that produces the thing being checked. Calling the internal function is not a smaller version of the
same check; it is a different, weaker check that happens to share a name, because it can no longer
catch a defect in the packaging, distribution, or artifact-integrity layer, and it silently keeps
passing if that layer breaks.

[`.github/workflows/verify-published-windows-binary.yml`](../.github/workflows/verify-published-windows-binary.yml)
is the reference shape for this: it downloads the actual release asset the way a user downloads it
(`gh release download`, not a rebuild), checks it against the published `SHA256SUMS`, executes it
against a fixture on a real runner for that platform, and diffs its `report.json` against the same
fixture run through the published npm package — reporting the comparison rather than assuming it.
See run [32164964141](https://github.com/BargLabs/cejel/actions/runs/32164964141) for a worked
example (Windows and Linux aarch64 assets from the v0.4.3 release, both matching).

Any checker elsewhere — in this repository or another — that claims to verify "the published
package" or "the published binary" but is implemented as an internal import of the scoring/build
function should be re-pointed at this pattern rather than redesigned from scratch.

## Required ordering: bump release-identity metadata BEFORE cutting the tag

*Added 6 September 2026, incident: [registry #1615](https://github.com/modelcontextprotocol/registry/issues/1615).*

**A release tag is immutable. A follow-up commit that fixes a metadata file the tag already
carries can never reach that tag.** Every release from 0.4.0 through 0.4.5 bumped
`server.json`, `published-versions.json`, and the `Dockerfile`'s default `VERSION` build-arg
together, inside the same "prepare release" commit that got tagged. The 0.4.6 cut missed
`server.json` (and the other two) in that commit; the omission was fixed 52 minutes later on
`main` (`fa00874`) — a commit that is not an ancestor of `refs/tags/v0.4.6` and never can be.
The consequence: `publish-distribution.yml`'s `assert-release-identity.sh` hard-requires
`GITHUB_REF`/`GITHUB_SHA`/checked-out `HEAD` to literally equal the dispatched release tag's
commit (by design — this is the guard against provenance forking), so **every future dispatch
of the MCP Registry publish job against `v0.4.6` will submit the same stale `server.json`
forever, no matter how many times it is retried.** `0.4.6` cannot be published to the MCP
Registry short of retargeting the tag itself (rejected — the site and other public records
already cite the tag's original commit) or relaxing the identity guard (a separate, larger
change with its own review, not a same-day fix).

The proximate cause looked, for a day, like an upstream registry defect (a stale or
soft-deleted row blocking republish). It was not: the maintainers checked their database and
logs directly and found no `0.4.6` row of any kind — both failed publish attempts had
literally submitted `0.4.5`, which already existed. `validate-distribution-metadata.mjs`
should have caught this and did not, because its check compared `server.json`'s version
against `published-versions.json`'s independently maintained `mcpRegistry` release-channel
target instead of against `package.json`'s version, the canonical intended release. Historical
release prep advances that channel target ahead of the live publish; it is not a live-registry
observation ledger. Both stale files agreed with each other while both disagreed with the
actual release, so the check passed when it should have failed. Fixed to compare against the
intended release version instead; the site's separate current-release record owns any
disclosed live-registry lag.

**Checklist, before cutting any release tag:**

1. Bump `package.json`, `server.json` (`version` field), `published-versions.json`, and the
   `Dockerfile`'s default `VERSION` build-arg in the same commit — never as a follow-up.
2. Run `pnpm run validate:distribution` against that commit **before** tagging it. A clean run
   after the tag exists is too late to fix anything the tag itself carries.
3. If a metadata omission is discovered only after a tag is already cut, do not attempt to
   retroactively "fix" the tag. Disclose the gap plainly (this repository's disclosed-lag
   pattern on the site is the reference shape) and let the next release, cut correctly, be the
   one that actually reaches the affected distribution surface.
