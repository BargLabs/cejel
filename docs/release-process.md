# Release process

## Release driver (2026-09-25)

A release is run with `scripts/release.sh <version>`. It walks the release in order, reads the
state of the world before and after every stage (never an action's exit code), skips any stage
whose state already shows it done, and so can be re-run after an interruption. `--dry-run` runs
every read and prints every action without performing one.

The driver stops for a typed `yes` before each of the five irreversible steps (stages 2, 5, 7, 9
and 12), and accepts only the literal `yes`: the tag push, publishing the GitHub release, `npm publish`, the distribution publish
(OCI image and MCP Registry), and moving the `v1` Action tag. Each prompt prints the exact command
and the state just verified.

Operator rules the driver encodes, stated here because the first of them was previously found only
inside the 0.4.6 post-mortem below:

- **Every release workflow is dispatched with `--ref <tag>`, not `--ref main`.** `publish-npm.yml`
  refuses any other ref at its first check. `release-binaries.yml` also needs both of its inputs
  (`release_tag` and `attach_to_release`) or the dispatch fails with HTTP 422.
- **`release-binaries.yml` requires a human-created draft release on the tag** before it runs
  (`gh release create <tag> --draft --verify-tag`).
- Every `gh` call carries `--repo BargLabs/cejel`; the registry is read as JSON with `curl`, not
  `npm view`, and a version missing a minute after publish is lag, not failure, until the poll
  window closes.

`--dry-run` shows all five prompts, including stage 5's when no release exists yet. The currency
check reads the MCP Registry with a 45-second timeout and retries once, after a short delay, on a
timeout or HTTP 5xx (a wrong version or digest fails on the first read, and `observed` reports
`attempts=2; last=...`). The stage-10 hint gives the four native-binary URLs with their `SHA256SUMS`
digests, plus the consumer-routes `expected_version` and `BargLabs/cejel@v<version>` pin, and no
source-tarball digest. The handback's MCP registry state is one of `serves X`, `LAG: serves Y
(expected X)` (the only state that is a claim of lag) or `NOT READ: <error>` (a read error is not a
lag; re-read before writing `current-release.mjs`).

The site record (`current-release.mjs` in cejel-site, under that repository's `DEPLOY.md`) is
outside the script, as is the Homebrew tap bump: the script prints the values and stops.

Currency is read twice. Stage 11 reads the newest `verify-release-currency.yml` run of any trigger
(not only `workflow_run`) created after the last publish run, and prints its id, event and creation
time. Before stage 12 moves `v1` and before the tap and site are updated, the Action, tap and
cejel.dev surfaces cannot pass, so stage 11 passes when every surface passes or when every failing
surface is one of those (matched by the label on each `[FAIL]` line); any other failure refuses and
prints every `[FAIL]` line. **Stage 13** runs after stage 12: it dispatches a fresh currency run for
the version and requires 14 of 14. **A release is complete only when stage 13 passes.** If it
refuses because the tap bump or the site record is not done yet, finish them and re-run with
`--from 13`.

The sections below stay authoritative; the script references them and does not restate them.

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

### A bypassable control is not a control — npm publish, 0.4.9

*Added 17 September 2026, incident: `@cejel/cejel@0.4.9`, published 16 September 2026.*

npm publish runs only through [`publish-npm.yml`](../.github/workflows/publish-npm.yml). A version
on the registry without attestations is a failed release regardless of whether it installs: 0.4.9
installs, runs, and produced report output matching the native binaries on the test fixture, and it
still carries publisher `cejel` rather than GitHub Actions, no `gitHead`, and no attestation, so
nothing binds the published artifact to the tagged build. npm versions are immutable, so a release
published outside the workflow cannot be repaired — only superseded. Before every release, check
three things and record what was observed rather than what was assumed: the exact trusted-publisher
identity on the package (owner, repository, and workflow filename, not "trusted publishing is on"),
the account's token inventory, and the saved publishing-access setting that disallows bypass-2FA
tokens.

Those controls close the bypass-token path. They do not make workflow publishing exclusive: npm
still permits a maintainer holding the account's second factor to publish a version manually. See
<https://docs.npmjs.com/trusted-publishers/> — trusted publishing authorizes a workflow to publish
without a long-lived token; it does not revoke any other principal's authority to publish.
Workflow-only publication is therefore operator policy enforced by discipline and detected after the
fact, not an exclusivity guarantee enforced by the registry. Write it down that way, and do not let
a currency verifier's pass be read as prevention: the release-currency verifier reported 12 of 13 on
0.4.9 and caught the missing provenance after publication, which is exactly what a detective control
does and exactly what a preventive control would have made unnecessary.

## What the SBOMs inventory (2026-10-03)

The 0.6.0 per-binary SBOMs, produced by scanning the binary with syft, listed one package (the
scanned directory) and one file with an all-zero SHA1, and passed. Syft cannot see inside a Node
single-executable blob, and `package.json` declares no runtime dependencies because `tsup` bundles
everything, so no scanner sees the bundled packages. From the release after 0.6.0:

- `pnpm run sbom:generate` writes SPDX 2.3 from the bundler metafile
  (`.build/metafiles/{package,sea}.json`, written by the two tsup configs): one package per distinct
  `node_modules` package that was bundled, with its exact version and integrity from `pnpm-lock.yaml`.
  A binary's SBOM also lists the Node.js runtime it embeds and the binary as a file with its real
  SHA-1 and SHA-256, related to the packages by `CONTAINS`. It is an inventory of what was bundled,
  not a scan of the artefact, and it does not list the host operating system, files outside the
  bundle, or anything the bundler tree-shook out.
- Each bundled package's `licenseDeclared` is read from the manifest of the copy that was bundled (its
  pnpm store path in the metafile), and only when that manifest's version matches; otherwise
  `NOASSERTION`.
- `pnpm run sbom:check` refuses an SBOM that names no root (no `DESCRIBES` to a listed element), lists no
  npm package besides the root, or has an npm package without a `versionInfo`, a version-pinning purl or
  a checksum; any checksum that is not hex of its algorithm's length, or is all zeros; a duplicated
  SPDXID or `name@version`; a missing required package (`zod` for binaries; `zod` and
  `@modelcontextprotocol/sdk` for the image); or a binary digest that no file entry carries. A
  `--binary` or `--require` with no value is an error, not a skipped check.
- Order. Binaries: SBOMs are checked before upload, and again before any attestation, provenance
  included. Image: the read-only `bundle-sbom` job runs `scripts/sbom/image-bundle-sbom.sh`, which builds
  the Dockerfile's own `build` stage with buildx (no push), generates the bundle SBOM from that stage's
  metafile, lockfile and `node_modules`, checks it, and records the stage's `dist/` hashes.
  `publish-oci` needs that job and then, in order: re-checks the downloaded SBOM; pushes the image **by
  digest only, with no tags**; runs `scripts/sbom/verify-image-dist.sh`, which compares both platforms'
  `dist/` in the pushed image (each pulled by its own manifest digest) with those hashes; signs
  provenance; attests the SBOM; and only then runs `scripts/sbom/tag-verified-image.sh`, which applies the
  version and `latest` tags and confirms each resolves to the attested digest. A failure before tagging
  leaves an untagged digest in GHCR and nothing tagged, so the release can be re-run. No job holding
  registry credentials or an OIDC token installs dependencies.
- `.github/workflows/oci-sbom-binding.yml` runs those same three scripts on every pull request that
  touches the image or SBOM path, on a real GitHub runner against a throwaway local registry, including
  a negative control that must be refused. That job is the proof the release path works.
- `scripts/validate-distribution-metadata.mjs` checks that structure as a tripwire for accidental
  regressions: the step order, exact commands with no `if:`, `shell:` or `continue-on-error` on them,
  read-only `bundle-sbom`, no install in `publish-oci`, and `inputs.release_tag` reaching release shell
  steps only through `env`. It is not a security boundary (a pull request can edit it too); review the
  workflow diff. `pnpm run test:sbom` covers the checker, including the 0.6.0 shapes.
- `release-binaries.yml` attests each SBOM to its binary's digest (`actions/attest` with `sbom-path`;
  predicate type `https://spdx.dev/Document/v2.3`). `publish-distribution.yml` keeps BuildKit's `sbom: true`
  (the base image's packages) and adds the bundle SBOM as a second attestation on the image digest.
- Not yet done: the npm package does not carry the SBOM, and no published artefact has an attested
  bundle SBOM until the next release is cut. Verify that release with
  `gh attestation verify <binary> -R BargLabs/cejel --predicate-type https://spdx.dev/Document/v2.3`.

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

1. Bump `package.json`, `server.json` (`version` field), `published-versions.json`, the
   `Dockerfile`'s default `VERSION` build-arg, and the Claude plugin's
   `plugins/cejel/.claude-plugin/plugin.json` version and `plugins/cejel/.mcp.json` npx pin in
   the same commit — never as a follow-up. `node scripts/bump-release-version.mjs <version>`
   moves all of these together (it refuses and writes nothing if any field is not where it
   expects) and lists the prose mentions that remain a reviewed manual edit. The release
   driver's preflight refuses a release whose plugin manifest or npx pin disagrees, and the
   currency check's `Claude plugin` surface re-reads all three at the tag.
2. Run `pnpm run validate:distribution` against that commit **before** tagging it. A clean run
   after the tag exists is too late to fix anything the tag itself carries.
3. If a metadata omission is discovered only after a tag is already cut, do not attempt to
   retroactively "fix" the tag. Disclose the gap plainly (this repository's disclosed-lag
   pattern on the site is the reference shape) and let the next release, cut correctly, be the
   one that actually reaches the affected distribution surface.
