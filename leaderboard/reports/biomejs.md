# Cejel Trust Report - biomejs

- Product: biomejs
- Rubric: witan-rubric-v3-2026-07-13
- Generated: 2026-07-16T03:09:48.024Z
- Repository: https://github.com/biomejs/biome @ 01bba129afefced1c04aa69592b1b7f337a7b609

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.7 | info | Test-to-source file ratio: 4877 ratio (cap 4100); Static coverage percentage: 0/100 percent; Verification script ratio: 7 ratio (cap 4); Non-hollow test share: 239/265 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | 3.2 | info | Secret cleanliness: 1/1 clean; Environment handling depth: 1/3 practices |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 3.2 | info | Declared version range ratio: 145/173 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 1/2 ratio; Dependency count sanity: 0.78/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.0 | warning | Claim match rate: 12/12 ratio; Claim source depth: 0 docs (cap 4); Reconciliation artifact depth: 0/3 artifacts |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | verified | PR trace primitive coverage: 27 signals (cap 2); Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 3.1 | info | CI verification depth: 2 signals (cap 4); PR-gate CI workflow count: 13 workflows (cap 4) |
| B4 | Audit trail and report-up completeness | Process trust | 3.3 | info | Audit artifact depth: 15 files (cap 3); Audit freshness depth: 1/15 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | 1.7 | warning | Human gate documented: 0/1 present; Fail-closed privilege check present: 0/1 present; Privilege-escalation cleanliness: 1/1 clean; Protected-path review gate: 1/1 present |

## Summary Scores

- Code trust: 2.8/4.0
- Process trust: 3.0/4.0
- Overall: 2.9/4.0
- Measured coverage: code trust 4/5, process trust 4/6, overall 8/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: A3, B1, B5 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (crates/biome_cli/tests/cases/assist.rs:1, sha256:573b5be1cc14)
- A1: Detected test file (crates/biome_cli/tests/cases/biome_json_support.rs:1, sha256:d50764af1869)
- A1: Detected test file (crates/biome_cli/tests/cases/config_extends.rs:1, sha256:47327dbcb347)
- A1: Detected test file (crates/biome_cli/tests/cases/config_path.rs:1, sha256:7b1c3cab9926)
- A1: Detected test file (crates/biome_cli/tests/cases/configuration.rs:1, sha256:f4593b405a90)
- A1: Detected test file (crates/biome_cli/tests/cases/css_parsing.rs:1, sha256:22f310515e03)
- A1: Detected test file (crates/biome_cli/tests/cases/cts_files.rs:1, sha256:118b92335981)
- A1: Detected test file (crates/biome_cli/tests/cases/diagnostics.rs:1, sha256:6c6865b26143)
- A1: Configured test runner (Cargo.toml:1, sha256:747223eee56f)
- A1: Configured test runner (crates/biome_analyze/Cargo.toml:1, sha256:0a40e4bb203e)
- A1: Configured test runner (crates/biome_analyze_macros/Cargo.toml:1, sha256:5e22e66c97ee)
- A1: Configured test runner (crates/biome_aria/Cargo.toml:1, sha256:4b745e00c023)
- A1: Configured test runner (crates/biome_aria_metadata/Cargo.toml:1, sha256:1c1e39b1ac92)
- A1: Configured test runner (crates/biome_cli/Cargo.toml:1, sha256:62a93dc18cc2)
- A1: Coverage configuration (packages/@biomejs/js-api/vitest.config.ts:1, sha256:f828699f2e60)
- A1: CI workflow runs the test suite (.github/workflows/main.yml:1, sha256:bba10c59142a)
- A2: Data layer migration (crates/biome_migrate/tests/specs/migrations/all/group_level.json:1, sha256:ebc9a6301ba7)
- A2: Committed secret-shaped value (crates/biome_js_analyze/tests/specs/security/noSecrets/invalid.js:1, sha256:42ddda9e8f62) (info)
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). Dockerfile alone is ambiguous and does not qualify.
- A4: Dependency manifest (packages/@biomejs/backend-jsonrpc/package.json:1, sha256:b39f81f670f2)
- A4: Dependency lockfile (Cargo.lock:1, sha256:125c812c4ab9)
- A4: Dependency update config (.github/renovate.json5:1, sha256:a2ac41dcfccc)
- A5: Repository claim source (.claude/skills/README.md:1, sha256:925ba2986d47)
- A5: Code presence for claim reconciliation (crates/biome_analyze/src/analyzer_plugin.rs:1, sha256:5592b04fc66d)
- A5: Repository claim source (.claude/skills/README.md:1, sha256:925ba2986d47) (warning)
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/actions_linter.yml:1, sha256:517c943a21f6)
- B2: Pull-request CI workflow (.github/workflows/agent_scan.yml:1, sha256:a56db26d82be)
- B2: Pull-request CI workflow (.github/workflows/autofix.yml:1, sha256:60a60574b234)
- B2: Pull request template (.github/PULL_REQUEST_TEMPLATE.md:1, sha256:543aeb946a86)
- B2: Review gate configuration (.github/CODEOWNERS:1, sha256:a56979cfb10c)
- B3: CI workflow (.github/workflows/actions_linter.yml:1, sha256:517c943a21f6)
- B4: Audit or changelog artifact (RELEASES.md:1, sha256:866544ca7756)
- B4: Audit or changelog artifact (crates/biome_deserialize/CHANGELOG.md:1, sha256:5601252ef960)
- B4: Audit or changelog artifact (packages/@biomejs/backend-jsonrpc/CHANGELOG.md:1, sha256:9f04dd92dcb3)
- B4: Audit or changelog artifact (packages/@biomejs/cli-darwin-arm64/CHANGELOG.md:1, sha256:86d0667e6a39)
- B4: Audit or changelog artifact (packages/@biomejs/cli-darwin-x64/CHANGELOG.md:1, sha256:551e91efcac5)
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: CODEOWNERS/required-review gate on protected paths (.github/CODEOWNERS:1, sha256:a56979cfb10c)
- B6: CODEOWNERS/required-review gate on protected paths (.github/CODEOWNERS:1, sha256:a56979cfb10c) (warning)

## Findings

- A2 info: Secret-shaped value in a test/fixture file (crates/biome_js_analyze/tests/specs/security/noSecrets/invalid.js) — likely fixture data, not a production leak; verify. (Committed secret-shaped value (crates/biome_js_analyze/tests/specs/security/noSecrets/invalid.js:1, sha256:42ddda9e8f62))
- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (.claude/skills/README.md:1, sha256:925ba2986d47))
- B6 warning: B6 metric-derived score is 1.7/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (CODEOWNERS/required-review gate on protected paths (.github/CODEOWNERS:1, sha256:a56979cfb10c))
