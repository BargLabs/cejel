# Changelog

All notable changes to `cejel` are recorded here.

Cejel has two version tracks. This file covers **CLI releases** — changes to the binary,
npm package, GitHub Action, Docker image, and MCP server. Changes to the **scoring rubric**
are tracked separately in
[`leaderboard/RUBRIC_CHANGELOG.md`](./leaderboard/RUBRIC_CHANGELOG.md),
which publishes a full before/after corpus delta for every repository on the board whenever
scoring behavior changes.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [0.4.3] — 2026-08-17

### Added

- States the recognized-CI boundary: which five systems Cejel treats as real CI signal, why
  absence is scored as a true negative rather than an abstention, and how that recognized set
  evolves only through a version-gated rubric change.

### Fixed

- Every documented CLI invocation across the README, leaderboard site copy, and the calibration
  issue template now pins `@latest`, so `npx @cejel/cejel` can no longer silently resolve a stale
  cached package; a guard test fails the build if an unversioned invocation is reintroduced.
- The Markdown certificate now carries the CLI version, matching the HTML and JSON (attestation)
  certificates — previously only those two recorded it.
- Two metric labels still said "primitive coverage" after the 0.4.2 glossary revision; they now
  read "Production-readiness basic checks" and "PR trace basic checks" everywhere, consistent with
  the rest of the glossary.
- "Lowest contributing measurements" could list a metric already at full marks when its criterion
  had few measured metrics; it now only lists metrics with an actual shortfall.
- A metric's displayed unit no longer repeats the trailing word of its own label (e.g. "Recent PR
  merge ratio 0/1 ratio" now reads "Recent PR merge ratio 0/1").
- Certificate tooltips now sit clearly above the page — a higher stacking order and an elevation
  shadow — instead of blending into the content behind them.

## [0.4.2] — 2026-08-13

### Added

- A read-only currency verifier independently checks every supported release surface and fails
  closed on stale, unreachable, or inconsistent state.

### Changed

- Human-readable terminal, HTML, and Markdown certificates now include relying-party summaries,
  consistent measurements, and a plain-English glossary informed by external reviewer feedback.

### Fixed

- OCI distribution readback now authenticates GitHub CLI before verifying the published image's
  attestation and tagged source.
- Public-distribution validation now rejects location fields and private-path-shaped text in
  public transparency artifacts.
- Coverage displays now distinguish an absent published measurement from a measured zero without
  changing report bytes or scoring.
- Capped test-to-source counts now render consistently across every human-readable certificate.
- Certificate labels now distinguish basic checks from automated workflow pipelines and avoid
  internal terminology.

## [0.4.1] — 2026-08-12

### Fixed

- `report.json` no longer embeds the absolute checkout path, so identical repository content and
  revision scanned in different directories can produce byte-identical report artifacts. Reports
  emitted by v0.4.0 and earlier include that run-environment path and therefore do not have this
  cross-path reproducibility property; those existing report/attestation pairs remain verifiable.

## [0.4.0] — 2026-08-09

### Added

- Carries the prospective rubric `witan-rubric-v19-prospective-2026-08-09` for explicit
  evaluation harnesses. It inherits v18 and changes only B4 numeric freshness: the scanned HEAD
  commit's committer year replaces scan wall clock. Expected Git absence or a bounded Git-read
  failure omits the numeric year and retains only static freshness markers. No public CLI flag or
  package export selects it; the public default remains `witan-rubric-v17-2026-07-24`, and
  historical rubrics and reports are unchanged.
- Adds a separate resource-bounded v2 discovery collector for future Free LLM calibration. It
  enforces per-file regex time limits and deterministic continuation without changing the
  SHA-pinned v1.9 collector, its historical contracts, the public CLI, or the release claim.

### Changed

- After MCP Registry publication, the distribution workflow now reads the exact version back,
  requires its OCI identifier to equal the workflow-derived immutable digest, cryptographically
  verifies that digest's GitHub SLSA attestation against the exact release tag and source commit,
  and reports the signed tagged-source commit. The MCP-only retry path still reuses the published
  digest without rebuilding or overwriting the OCI version tag.

### Evidence boundary

- The preregistered v19 paired rescore completed 24/24 rows after the separately preregistered
  Alfred recovery: 0 raw freshness, B4 score/status, headline/coverage, placement, or non-B4
  changes. That GO authorizes the prospective implementation and published delta only; it does
  not promote v19 to the public default.
- The reserved Free LLM command family remains unshipped. `--pack llm` and `cejel llm` continue
  to fail until the accepted release gate reaches GO.

## [0.3.2] — 2026-08-07

### Changed

- MCP Registry publication now writes an immutable `ghcr.io/barglabs/cejel@sha256:…` image
  reference, bound to the OCI image attestation. A later tag movement cannot change the artifact
  named by the MCP record; the workflow can also republish that record from an existing image tag
  without rebuilding it.
- OCI publication now refuses to overwrite an already-published release tag, and the OCI and MCP
  jobs independently assert the dispatched tag, commit, checkout, required-object availability,
  and commit containment before acting.

No scoring, rubric, detector, criterion, threshold, or certificate behaviour changed in this
distribution-only release.

## [0.3.1] — 2026-08-06

### Fixed

- The npm trusted-publishing workflow removes the `_authToken` placeholder written by
  `actions/setup-node` from both user and project `.npmrc` files, then fails if it remains.
  That leaves npm's GitHub OIDC exchange available for trusted publishing.

### Release provenance

- `0.3.0` was tagged and built but was never published: the registry rejected its upload after
  a detached transparency-log provenance entry was created for that real build. The `v0.3.0`
  tag remains in place; `0.3.1` is the successor release rather than a retagged retry.

## [0.3.0] — 2026-08-06

### Breaking

- `report.json` and `summary.json` no longer include `generatedAt`. The machine-readable scan
  time is provenance for the run, not a repository finding, and now lives in
  `attestation.json`; the certificate retains its existing human-readable date. Re-running the
  same input now produces byte-identical report and summary artifacts; consumers that read
  `generatedAt` from either artifact must instead read `attestation.json`.

### Added

- A separate opt-in D-series pack entrypoint adds the high-confidence D1
  declared-but-unread-config rule. It uses Cejel's resolved TypeScript module graph, cites the
  exact declaration path, and abstains on dynamic config access. It does not feed A1-B6 scoring;
  the frozen three-seed D1 baseline remains unchanged and exact-signature acceptance is reported
  separately.
- The opt-in D-series pack adds a narrow D2 swallowed-error rule for an awaited operation whose
  catch discards its bound error while returning a static failure result. Exact acceptance and the
  23-repository precision gate are reported separately because the frozen 16-case suite contains
  no D2 seed. The rule does not feed A1-B6 scoring or change the published leaderboard.
- The opt-in D-series pack adds a narrow D3 unasserted-set-transform rule for a filter that reports
  literal success while pairing retained output with a statically empty explanation ledger. Exact
  acceptance and the 23-repository precision gate are reported separately; the frozen five-seed D3
  baseline remains unchanged. The rule does not feed A1-B6 scoring or change the leaderboard.
- The opt-in D-series pack adds a narrowly bounded D4 rule for an exact caller/callee shape where a
  statically signalled failure is converted to an empty collection and then returned as literal
  success. It does not infer that emptiness is itself defective, feed A1-B6 scoring, or claim any
  of the four frozen semantic D4 seeds as caught.
- The opt-in D-series pack adds the high-confidence D5 self-referential-verification rule for
  equality assertions whose visibly named expected value and exercised code are imported from the
  same first-party module. It cites the assertion path and remains outside A1-B6 scoring; the frozen
  four-seed D5 baseline remains unchanged and exact-signature acceptance is reported separately.

### Changed

- The public product claim now states explicitly that Cejel scores engineering-trust signals; it
  does not claim to detect software defects or prove that code is safe. A regression guard covers
  the README opening, package metadata, Action metadata, registry metadata, and MCP tool copy. This
  is a documentation boundary only; scoring, findings, detector behavior, and board scores are
  unchanged.
- The Free LLM detector-development candidate recognizes file-local JavaScript/TypeScript and
  Python evaluation aggregates assigned through local result-object attributes or subscripts.
  Fixture-backed controls retain the eligible denominator, and lookalike names do not activate the
  rule. This does not change the immutable v1.9 NO-GO or authorize a performance or release claim.
- Python evaluation rules now attribute official OpenAI and Anthropic call shapes only when the
  receiver resolves to a live same-file SDK import/client binding. Unrelated and parameter-shadowed
  lookalikes abstain; local custom judge wrappers remain within the file-local contract.

### Fixed

- The offline architecture guard now parses every first-party `src` and deployed `api` scoring
  module and its resolved first-party dependencies with the TypeScript compiler instead of matching
  raw source text. Bare built-ins, unapproved package entrypoints, aliases, re-exports, computed
  loaders, and indirect global network primitives can no longer bypass the single hardened Git
  subprocess boundary.

---

## [0.2.2] — 2026-07-28

### Added

- Adds the final standalone platform gap: `cejel-Windows-x86_64.exe`. The Windows SEA build
  injects into `node.exe`, smoke-tests `--version`, `--help`, and a real scan, compares the
  binary with the source build, and runs a second scan with outbound networking denied by a
  program-scoped Windows Firewall rule.
- Every standalone binary now carries an SPDX SBOM alongside its own-platform verification
  receipt, SHA-256 checksum, and GitHub-signed build-provenance bundle.
- Documents installation as an OpenClaw-managed MCP server through the shipped `cejel-mcp`
  stdio bin, with the published OCI image as an alternative. The documentation states the
  product boundary plainly: free Cejel scans code selected by the caller; it does not govern
  an agent's runtime actions.

### Fixed

- Certificates now show both the producing Cejel CLI version and the exact rubric version,
  so reports created by different installed versions explain their scoring identity.
- A calibrated dimension band that differs from the weighted numeric score now carries an
  inline explanation instead of presenting, for example, `1.9` beside `verified` with no
  reconciliation. Reported by an external user.
- A certificate produced from a source tarball now warns on B2 that Git history was
  unavailable and that a zero recent-PR proxy may undercount the criterion. Reported by
  an external user.
- The npm instructions force `@latest`, explain the stale `npx` cache footgun, and show how
  to print the version before comparing certificates. Rubric/CLI drift was reported by
  an external enterprise security engineer.

### Included from main

- Patch-distribution documentation from #39.
- D8 Git transport hardening from #40 and #42.
- Free-core v50 multiple-comparisons disclosure from #41.
- Cross-repository preflight script from #43.

### Signing

- The Windows executable is intentionally **not Authenticode-signed** in 0.2.2. The build
  removes Node's inherited signature, asserts that the final executable is `NotSigned`, and
  the README warns that SmartScreen may intervene. Human review must decide whether this
  verification-first release is acceptable or whether Windows publication waits for Azure
  Trusted Signing or another approved Authenticode path.

### Rubric

- No detector, rubric, score, criterion status, or verdict behavior changes in this patch.
  The tester reports' already-fixed scoring items are not reimplemented, and detector-level
  follow-ups remain deferred to a future rubric release.

---

## [0.2.1] — 2026-07-26

### Fixed

- Zero-measurement v17/v18 abstentions now explain the reviewable-source arithmetic instead
  of stopping at a generic message. The terminal, report, summary, attestation, and HTML
  certificate state that AWS CardDemo has 9 criterion-ratable files among 250 source-shaped
  files (3.6%), below the 20% threshold, across 329 tracked files.
- The change is presentation-only: calibrated v17 scoring, findings, rubric identity, and the
  v50 finding-level GO are unchanged.

### Distribution

- This is an npm-only patch. OCI and MCP Registry remain at the actually published `0.2.0`;
  Cejel does not advertise nonexistent `0.2.1` container or registry artifacts.
- The next patch release will supersede `0.2.1` on npm and `0.2.0` on the other supported
  distribution channels.

---

## [0.2.0] — 2026-07-24

### Added

- Ships the public v0.2.0 CLI, MCP server, GitHub Action, Homebrew formula, OCI image, and
  Smithery integration from one authenticated distribution surface.
- Publishes the v17 OSS leaderboard and its complete rubric changelog; the board records the
  exact scorer commit, immutable corpus pins, and the scoreless CardDemo abstention.

### Changed

- The npm package remains scoped as `@cejel/cejel`; the unscoped `cejel` name is not claimed.
- Release metadata and download references now point at the v0.2.0 assets and checksums.

### Rubric

The public board carries **witan-rubric-v17-2026-07-24**. Its full v9 → v17 corpus delta and
calibration notes are in [`leaderboard/RUBRIC_CHANGELOG.md`](./leaderboard/RUBRIC_CHANGELOG.md).

---

## [0.1.10] — 2026-07-22

### Fixed

- **Express coverage false negative.** The coverage detector looked only for standalone
  coverage configuration files and framework config blocks. `nyc`, `c8`, and Istanbul
  commands appearing inside `package.json` scripts were not recognized. Express (which
  configures coverage through npm scripts rather than a dedicated file) was therefore
  reported as having no coverage configuration even though it does. The detector now
  recognizes actual commands in script entries; an unused dependency listed in
  `devDependencies` does not count as coverage evidence.

- **Opaque metric-only findings.** When a dimension band was driven entirely by weighted
  metric scores and no single finding dominated, the terminal output said "combined metric
  weighting" and stopped. The two lowest-contributing metrics, their measured values,
  `finding severity`, and `dimension band` are now printed explicitly, along with concrete
  next actions.

- **Gitignored scan target presented as empty repository.** When the path passed to `cejel`
  was inside `.gitignore`, the scanner reported a generic empty-repository result. The
  output now names the gitignored target and explains why the scan was refused rather than
  presenting a structureless result.

### Rubric

Ships **rubric v9** (`witan-rubric-v9`). A1 now requires the same configured-runner
premise as its no-coverage proposition and never infers a missing-test finding from a
coverage artifact alone. A2 excludes generated, vendored, test, fixture, and example paths
from current and historical production-secret claims; qualified environment templates are
treated as templates. Headline scoring requires at least 80 % of source-shaped files to
belong to a published Cejel source family when a competing unread-language mass exists. See
[`leaderboard/RUBRIC_CHANGELOG.md`](./leaderboard/RUBRIC_CHANGELOG.md) for the full v8 →
v9 corpus delta across all 24 board rows.

---

## [0.1.9] — 2026-07-21

### Rubric

Ships **rubric v7** and **v8**.

v7 corrects the evidence-boundary errors surfaced by the v25 calibration failure. Secret
findings now point to the exact matched line and expose only redacted value shape. Finding
and control packets for no-tests, no-coverage, no-CI/release-deploy, and no-lockfile
propositions carry exact tracked-inventory proof and applicability premises. A5 limits
claims to root/product documentation or dedicated claim-reconciliation artifacts.
Cohesive Fortran, CUDA/HIP, and web-template/style trees are recognized at explicitly
unmodelled depth.

v8 activates the v26 failure-derived detector and evidence-boundary corrections. A1
recognizes lean tests in nested workspaces while excluding generated, vendored, fixture,
and example manifests from the production toolchain. A2 reports current and historical
credential evidence independently. A3 evaluates each multi-stage Dockerfile's effective
final stage and requires a runtime command rather than a generic entrypoint name. A4 applies
app-runtime expectations only to strongly evidenced packaged Electron/Tauri software.

See [`leaderboard/RUBRIC_CHANGELOG.md`](./leaderboard/RUBRIC_CHANGELOG.md) for the full
v6 → v7 and v7 → v8 corpus deltas.

---

## [0.1.8] — 2026-07-18

### Fixed

- **Symlink escape from the immutable source snapshot.** Repository evidence discovery used
  a regular-file check that followed tracked symlinks; a symlink target could resolve to a
  file outside the checkout and make scores depend on host-specific ambient files. Discovery
  now accepts only tracked regular files. The pinned Zod snapshot carries a root
  `README.md` symlink that previously counted one claim source twice; the fix removes that
  duplicate.

### Rubric

Ships **rubric v4** and **v5**.

v4 corrects the symlink issue above (Zod A5 falls 2.2 → 2.0; no other external score
moves). v5 binds git-history evidence to commits reachable from the checked-out `HEAD`
only; unrelated local branches and remote-tracking refs can no longer alter A2 evidence
or measured coverage for the same pinned commit. A regression test adds credential history
on a non-HEAD branch and proves it cannot affect A2. See
[`leaderboard/RUBRIC_CHANGELOG.md`](./leaderboard/RUBRIC_CHANGELOG.md) for the full
v3 → v4 and v4 → v5 corpus deltas.

---

## [0.1.7] — 2026-07-13

### Fixed

- **Home-field bias in A1 scheduled-health-workflow detection.** A1's sub-signal for a
  scheduled product-health workflow was previously implemented as a literal filename match
  against an internal workflow name — inert for every external repository and an obvious
  credibility hole for a public rubric. Detection is now shape-based: any CI workflow with
  a `schedule:`/`cron:` trigger that runs the verification suite qualifies. A workflow
  sharing only the filename without the shape no longer fires. Results are additionally
  classified on whether they are durably published (pages deploy, commit-back, PR/issue
  comment) or handed only to an ephemeral `actions/upload-artifact`.

- **Leaderboard home-field scoring path removed.** The board generator previously had a
  private code path that could append internal-only collectors to a scan after the public
  scorer ran. That path is gone. Every row on the board — including the Alfred and Cejel
  transparency rows — is now produced by the same sealed public scorer that npm consumers
  and the GitHub Action use. A required board guard re-scores every corpus row through that
  function and compares score, criterion status, verdict, measured coverage, and the
  complete evidence-pointer set with the published report.

- **Corpus pins are now 40-character source commits.** Every external corpus entry now pins
  a specific source commit. Re-scoring at the same pins is a rubric change and publishes a
  corpus delta. Moving a pin is a separate corpus act; upstream default-branch drift can no
  longer masquerade as a rubric effect.

- **B1 and B5 status made explicit.** The repository scanner now states clearly that it
  evaluates neither B1 (dispatch trace completeness) nor B5 (verified learning trace) for
  any repository scan. Both are always `not_applicable` for this input type. The leaderboard
  excludes them fail-closed.

### Rubric

Ships **rubric v2** and **v3**. See
[`leaderboard/RUBRIC_CHANGELOG.md`](./leaderboard/RUBRIC_CHANGELOG.md) for the full corpus
deltas, including the five-ecosystem language-calibration corpus expansion (22 → 23 rows)
and the COBOL dominance-threshold correction that ships alongside v3.

---

## [0.1.6] — 2026-06-24

### Added

- **Sigstore build-provenance attestation.** Each binary release (macOS arm64/x86\_64,
  Linux aarch64/x86\_64) now carries a Sigstore bundle with a GitHub-signed SLSA
  build-provenance attestation. The attestation binds the binary to its source commit and
  the workflow run that produced it.

### Rubric

Ships **rubric v1** (`witan-rubric-v1`). Introduced metric-based scoring — continuous,
weighted per-criterion metrics replacing the v0 presence/absence model. No corpus-wide delta
was recorded at the time this version shipped; the leaderboard did not yet exist.

---

## [0.1.5] — 2026-06-24

### Fixed

- **COBOL false verdict — second attempt.** The v0.1.4 fix proved that the fixture used to
  verify it was cleaner than any real COBOL repository. A codebase with 99 % COBOL and nine
  incidental shell deploy scripts classified as `source`, was scored on those nine files, and
  received a confident **0.0 / Unverified**. Every real legacy repository has a deploy
  script, so the abstention path was unreachable for essentially all of them while every test
  passed. Recognised source must now be *dominant* — reaching a measured ratio threshold of
  the total tracked file count — not merely present. The threshold was calibrated against a
  ratio golden set of eight cases spanning the ratio space, with expected outcomes committed
  before the threshold number was chosen.

---

## [0.1.4] — 2026-06-24

### Fixed

- **First COBOL false verdict fix.** A repository written in a language Cejel cannot model
  (COBOL) was scored anyway. The fixture for this fix contained COBOL and nothing else and
  passed; see v0.1.5 for why it was still broken.

---

## [0.1.3] — 2026-06-24

### Fixed

- **False positive secret detection in own test fixtures.** Pointed at its own repository,
  Cejel's A2 (data-layer isolation and secrets posture) dimension flagged a
  "non-constant-time secret comparison" — in string literals inside a test file written to
  prove the detector fires. Two sub-rules of the same dimension held independent definitions
  of "production code"; the sub-rule whose definition included test files was the louder.
  Every rule now derives its production-code boundary from a single shared function, and
  findings report the real matched line from a real file or nothing at all.

---

## [0.1.2] — 2026-06-24

### Fixed

- **`--help`, `--version`, and `-h` rejected as unknown flags.** Version 0.1.1 parsed
  positional arguments before named flags, so `-h`, `--help`, and `--version` were
  interpreted as directory paths. All three are now handled before positional-path parsing.
  The printed version is derived from the package manifest rather than hardcoded.

---

## [0.1.1] — 2026-06-24

Initial public release.

- Offline trust certificate for any Git repository — no network, no model call, no signup.
- 11-criterion free-core rubric across `code_trust` (A1–A5) and `process_trust` (B1–B6).
- 0.0–4.0 scoring scale with `verified` / `conditional` / `at_risk` / `unverified` /
  `insufficient_source` verdict bands.
- Abstention when the target has no measurable signal rather than publishing a numeric zero.
- SARIF 2.1.0 and OpenSSF Scorecard JSON ingest for external scanner findings.
- CLI binary (`cejel`), MCP server (`cejel-mcp`), npm package, and GitHub Action.
- Single-file SEA binaries for macOS (arm64, x86\_64) and Linux (aarch64, x86\_64).
- Self-scoring: `cejel` scores its own public repository and publishes the result.
- OSS trust leaderboard: 15 well-known repositories scored from pinned source commits.
- In-toto attestation: `attestation.json` binds the report hash, repo revision, and rubric
  version; `cejel verify` checks the binding offline.
