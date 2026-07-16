# Cejel Trust Report - react

- Product: react
- Rubric: witan-rubric-v3-2026-07-13
- Generated: 2026-07-16T03:09:48.024Z
- Repository: https://github.com/facebook/react @ c0c39a6b3907eaab35f43074949e2957a2a734c1

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.3 | warning | Test-to-source file ratio: 2410 ratio (cap 1873); Static coverage percentage: 0/100 percent; Verification script ratio: 8 ratio (cap 4); Non-hollow test share: 389/2409 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | 2.4 | warning | Secret cleanliness: 1/1 clean; Environment handling depth: 1/3 practices |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 3.2 | info | Declared version range ratio: 862/883 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 1/2 ratio; Dependency count sanity: 0/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.2 | warning | Claim match rate: 12/13 ratio; Claim source depth: 1 docs (cap 4); Reconciliation artifact depth: 0/3 artifacts |
| B1 | Alfred-internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | verified | PR trace primitive coverage: 23 signals (cap 2); Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 4.0 | verified | CI verification depth: 6 signals (cap 4); PR-gate CI workflow count: 14 workflows (cap 4) |
| B4 | Audit trail and report-up completeness | Process trust | 3.8 | verified | Audit artifact depth: 5 files (cap 3); Audit freshness depth: 4/5 ratio |
| B5 | Alfred-internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 2.5/4.0
- Process trust: 3.9/4.0
- Overall: 3.2/4.0
- Measured coverage: code trust 4/5, process trust 3/6, overall 7/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: A3, B1, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (compiler/apps/playground/__tests__/e2e/page.spec.ts:1, sha256:fd6799d3b88d)
- A1: Detected test file (compiler/apps/playground/__tests__/parseConfigOverrides.test.mjs:1, sha256:ea734820a147)
- A1: Detected test file (compiler/crates/react_compiler_ast/tests/deep_nesting.rs:1, sha256:4dc974785462)
- A1: Detected test file (compiler/crates/react_compiler_ast/tests/round_trip.rs:1, sha256:381027a818ba)
- A1: Detected test file (compiler/crates/react_compiler_ast/tests/scope_resolution.rs:1, sha256:0d8a34fba5fb)
- A1: Detected test file (compiler/crates/react_compiler_lowering/tests/unknown_statement_lowering.rs:1, sha256:3f730b1507ca)
- A1: Detected test file (compiler/packages/babel-plugin-react-compiler/src/__tests__/DisjointSet-test.ts:1, sha256:f0bd8a61947c)
- A1: Detected test file (compiler/packages/babel-plugin-react-compiler/src/__tests__/Logger-test.ts:1, sha256:17e296648fe3)
- A1: Configured test runner (compiler/Cargo.toml:1, sha256:ad2b6ee54ee2)
- A1: Configured test runner (compiler/apps/playground/playwright.config.js:1, sha256:d47c8779631f)
- A1: Configured test runner (compiler/crates/react_compiler/Cargo.toml:1, sha256:a89fb6ea54c8)
- A1: Configured test runner (compiler/crates/react_compiler_ast/Cargo.toml:1, sha256:711da725f649)
- A1: Configured test runner (compiler/crates/react_compiler_diagnostics/Cargo.toml:1, sha256:1aad315e4a63)
- A1: Configured test runner (compiler/crates/react_compiler_hir/Cargo.toml:1, sha256:768d8f8c2398)
- A1: Configured test runner (package.json:1, sha256:5cc1364afcac)
- A1: Coverage configuration (compiler/packages/babel-plugin-react-compiler/jest.config.js:1, sha256:ce0807228781)
- A1: Coverage configuration (compiler/packages/make-read-only-util/jest.config.js:1, sha256:3127744e0ed2)
- A1: Coverage configuration (packages/eslint-plugin-react-hooks/jest.config.js:1, sha256:a1152dcd39be)
- A1: CI workflow runs the test suite (.github/workflows/compiler_playground.yml:1, sha256:99f32e363cdf)
- A1: Scheduled product-health workflow (.github/workflows/devtools_regression_tests.yml:1, sha256:e81037c21b41) (warning)
- A2: Committed .env file in repository tree (fixtures/fiber-debugger/.env:1, sha256:5da7ad963fe4)
- A2: .env file (not a template) tracked in git history; no confirmed secret value found (fixtures/fiber-debugger/.env, sha256:c0c39a6b3907) (warning)
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). Dockerfile alone is ambiguous and does not qualify.
- A4: Dependency manifest (package.json:1, sha256:5cc1364afcac)
- A4: Dependency lockfile (compiler/Cargo.lock:1, sha256:023853d4df57)
- A4: Dependency update config (.github/dependabot.yml:1, sha256:46e17f9d7ab8)
- A5: Repository claim source (README.md:1, sha256:4d20edc8d043)
- A5: Code presence for claim reconciliation (compiler/apps/playground/app/layout.tsx:1, sha256:80ab85b722a3)
- A5: Repository claim source (README.md:1, sha256:4d20edc8d043) (warning)
- B1: N/A — Substrate-specific: an Alfred-internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/compiler_discord_notify.yml:1, sha256:e934619a5e08)
- B2: Pull-request CI workflow (.github/workflows/compiler_playground.yml:1, sha256:99f32e363cdf)
- B2: Pull-request CI workflow (.github/workflows/compiler_prereleases.yml:1, sha256:85fc08a7cb0c)
- B2: Pull request template (.github/PULL_REQUEST_TEMPLATE.md:1, sha256:3b66d9d79de5)
- B3: Test script (package.json:1, sha256:5cc1364afcac)
- B3: Lint script (package.json:1, sha256:5cc1364afcac)
- B3: CI workflow (.github/workflows/compiler_discord_notify.yml:1, sha256:e934619a5e08)
- B4: Audit or changelog artifact (CHANGELOG.md:1, sha256:b5d0e23a1079)
- B4: Audit or changelog artifact (SECURITY.md:1, sha256:c0754b9a4971)
- B4: Audit or changelog artifact (compiler/CHANGELOG.md:1, sha256:225938e5aa42)
- B4: Audit or changelog artifact (packages/eslint-plugin-react-hooks/CHANGELOG.md:1, sha256:46ff96b6f31c)
- B4: Audit or changelog artifact (packages/react-devtools/CHANGELOG.md:1, sha256:3e643e9aceb2)
- B5: N/A — Substrate-specific: an Alfred-internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A1 warning: A scheduled product-health workflow exists, but its results are handed only to an ephemeral, access-gated CI artifact — not a durable, checkable record. (Scheduled product-health workflow (.github/workflows/devtools_regression_tests.yml:1, sha256:e81037c21b41))
- A2 warning: A non-template .env file was tracked in git history; no secret-shaped value was detected. (.env file (not a template) tracked in git history; no confirmed secret value found (fixtures/fiber-debugger/.env, sha256:c0c39a6b3907))
- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (README.md:1, sha256:4d20edc8d043))
