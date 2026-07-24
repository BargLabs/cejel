# Cejel Trust Report - biomejs

- Product: biomejs
- Rubric: witan-rubric-v9-2026-07-22
- Generated: 2026-07-22T20:52:22.603Z
- Repository: https://github.com/biomejs/biome @ 01bba129afefced1c04aa69592b1b7f337a7b609

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.2 | verified | Test-to-source file ratio: 4100 ratio (capped; 7389 raw); Static coverage percentage: 0/100 percent; Verification script ratio: 2/4 ratio; Non-hollow test share: 242/268 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | 3.2 | warning | Secret cleanliness: 1/1 clean; Environment handling depth: 1/3 practices |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 3.2 | verified | Declared version range ratio: 145/173 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 1/2 ratio; Dependency count sanity: 0.78/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | N/A | not_applicable | N/A |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | warning | PR trace primitive coverage: 2 signals (capped; 27 raw); Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 3.1 | verified | CI verification depth: 2/4 signals; PR-gate CI workflow count: 4 workflows (capped; 13 raw) |
| B4 | Audit trail and report-up completeness | Process trust | 3.3 | verified | Audit artifact depth: 3 files (capped; 15 raw); Audit freshness depth: 1/15 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | 1.7 | warning | Human gate documented: 0/1 present; Fail-closed privilege check present: 0/1 present; Privilege-escalation cleanliness: 1/1 clean; Protected-path review gate: 1/1 present |

## Summary Scores

- Code trust: 2.9/4.0
- Process trust: 3.0/4.0
- Overall: 3.0/4.0
- Measured coverage: code trust 3/5, process trust 4/6, overall 7/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: A3, A5, B1, B5 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (crates/biome_cli/tests/cases/assist.rs:1, sha256:573b5be1cc14)
- A1: Detected test file (crates/biome_cli/tests/cases/biome_json_support.rs:1, sha256:d50764af1869)
- A1: Detected test file (crates/biome_cli/tests/cases/config_extends.rs:1, sha256:47327dbcb347)
- A1: Detected test file (crates/biome_cli/tests/cases/config_path.rs:1, sha256:7b1c3cab9926)
- A1: Detected test file (crates/biome_cli/tests/cases/configuration.rs:1, sha256:f4593b405a90)
- A1: Detected test file (crates/biome_cli/tests/cases/css_parsing.rs:1, sha256:22f310515e03)
- A1: Detected test file (crates/biome_cli/tests/cases/cts_files.rs:1, sha256:118b92335981)
- A1: Detected test file (crates/biome_cli/tests/cases/diagnostics.rs:1, sha256:6c6865b26143)
- A1: Configured test runner (packages/@biomejs/js-api/vitest.config.ts:1, sha256:f828699f2e60)
- A1: CI workflow runs the test suite (.github/workflows/main.yml:1, sha256:bba10c59142a)
- A1: Detected test file (crates/biome_cli/tests/cases/assist.rs:1, sha256:573b5be1cc14) (info)
- A2: Data layer migration (crates/biome_migrate/tests/specs/migrations/all/group_level.json:1, sha256:ebc9a6301ba7)
- A2: Data layer migration (crates/biome_migrate/tests/specs/migrations/all/group_level.json:1, sha256:ebc9a6301ba7) (warning)
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). A Dockerfile without an explicit runtime start/service command is ambiguous and does not qualify.
- A4: Dependency manifest (packages/@biomejs/backend-jsonrpc/package.json:1, sha256:b39f81f670f2)
- A4: Dependency lockfile (Cargo.lock:1, sha256:125c812c4ab9)
- A4: Dependency update config (.github/renovate.json5:1, sha256:a2ac41dcfccc)
- A5: N/A — No README or docs found — nothing is claimed about this repo, so there is nothing for A5 to reconcile against.
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/actions_linter.yml:1, sha256:517c943a21f6)
- B2: Pull-request CI workflow (.github/workflows/agent_scan.yml:1, sha256:a56db26d82be)
- B2: Pull-request CI workflow (.github/workflows/autofix.yml:1, sha256:60a60574b234)
- B2: Pull request template (.github/PULL_REQUEST_TEMPLATE.md:1, sha256:543aeb946a86)
- B2: Review gate configuration (.github/CODEOWNERS:1, sha256:a56979cfb10c)
- B2: Pull-request CI workflow (.github/workflows/actions_linter.yml:1, sha256:517c943a21f6) (warning)
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

- A1 info: Test suite files are present, but no coverage configuration was detected. (Detected test file (crates/biome_cli/tests/cases/assist.rs:1, sha256:573b5be1cc14))
- A2 warning: A2 metric-derived score is 3.2/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Data layer migration (crates/biome_migrate/tests/specs/migrations/all/group_level.json:1, sha256:ebc9a6301ba7))
- B2 warning: B2 metric-derived score is 4.0/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Pull-request CI workflow (.github/workflows/actions_linter.yml:1, sha256:517c943a21f6))
- B6 warning: B6 metric-derived score is 1.7/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (CODEOWNERS/required-review gate on protected paths (.github/CODEOWNERS:1, sha256:a56979cfb10c))
