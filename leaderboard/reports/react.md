# Cejel Trust Report - react

- Product: react
- Rubric: witan-rubric-v9-2026-07-22
- Generated: 2026-07-22T20:52:22.603Z
- Repository: https://github.com/facebook/react @ c0c39a6b3907eaab35f43074949e2957a2a734c1

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.3 | warning | Test-to-source file ratio: 1873 ratio (capped; 2410 raw); Static coverage percentage: 0/100 percent; Verification script ratio: 4 ratio (capped; 7 raw); Non-hollow test share: 389/2409 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | 3.2 | warning | Secret cleanliness: 1/1 clean; Environment handling depth: 1/3 practices |
| A3 | Production readiness | Code trust | 2.3 | warning | Production-readiness primitive coverage: 3/6 primitives; Production workflow depth: 6 signals (capped; 23 raw); Observability depth: 4 signals (capped; 68 raw); Rollback and migration-safety depth: 0/4 signals |
| A4 | Dependency hygiene | Code trust | 2.4 | verified | Pinned dependency ratio: 77/883 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 1/2 ratio |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.2 | warning | Claim match rate: 12/13 ratio; Claim source depth: 1/4 docs; Reconciliation artifact depth: 0/3 artifacts |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | warning | PR trace primitive coverage: 2 signals (capped; 23 raw); Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 4.0 | verified | CI verification depth: 4 signals (capped; 6 raw); PR-gate CI workflow count: 4 workflows (capped; 14 raw) |
| B4 | Audit trail and report-up completeness | Process trust | 3.8 | verified | Audit artifact depth: 3 files (capped; 5 raw); Audit freshness depth: 4/5 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 2.5/4.0
- Process trust: 3.9/4.0
- Overall: 3.2/4.0
- Measured coverage: code trust 5/5, process trust 3/6, overall 8/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: B1, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (compiler/apps/playground/__tests__/e2e/page.spec.ts:1, sha256:fd6799d3b88d)
- A1: Detected test file (compiler/apps/playground/__tests__/parseConfigOverrides.test.mjs:1, sha256:ea734820a147)
- A1: Detected test file (compiler/crates/react_compiler_ast/tests/deep_nesting.rs:1, sha256:4dc974785462)
- A1: Detected test file (compiler/crates/react_compiler_ast/tests/round_trip.rs:1, sha256:381027a818ba)
- A1: Detected test file (compiler/crates/react_compiler_ast/tests/scope_resolution.rs:1, sha256:0d8a34fba5fb)
- A1: Detected test file (compiler/crates/react_compiler_lowering/tests/unknown_statement_lowering.rs:1, sha256:3f730b1507ca)
- A1: Detected test file (compiler/packages/babel-plugin-react-compiler/src/__tests__/DisjointSet-test.ts:1, sha256:f0bd8a61947c)
- A1: Detected test file (compiler/packages/babel-plugin-react-compiler/src/__tests__/Logger-test.ts:1, sha256:17e296648fe3)
- A1: Configured test runner (compiler/apps/playground/playwright.config.js:1, sha256:d47c8779631f)
- A1: Configured test runner (compiler/packages/babel-plugin-react-compiler/jest.config.js:1, sha256:ce0807228781)
- A1: Configured test runner (compiler/packages/make-read-only-util/jest.config.js:1, sha256:3127744e0ed2)
- A1: Configured test runner (packages/eslint-plugin-react-hooks/jest.config.js:1, sha256:a1152dcd39be)
- A1: Configured test runner (packages/react-devtools-inline/playwright.config.js:1, sha256:f3f77d7ff100)
- A1: Configured test runner (package.json:1, sha256:5cc1364afcac)
- A1: CI workflow runs the test suite (.github/workflows/compiler_playground.yml:1, sha256:99f32e363cdf)
- A1: Scheduled product-health workflow (.github/workflows/devtools_regression_tests.yml:1, sha256:e81037c21b41) (warning)
- A1: Detected test file (compiler/apps/playground/__tests__/e2e/page.spec.ts:1, sha256:fd6799d3b88d) (info)
- A2: Committed .env file in repository tree (fixtures/fiber-debugger/.env:1, sha256:5da7ad963fe4)
- A2: Committed .env file (no confirmed secret value found) (fixtures/fiber-debugger/.env:1, sha256:5da7ad963fe4) (info)
- A2: Committed .env file in repository tree (fixtures/fiber-debugger/.env:1, sha256:5da7ad963fe4) (warning)
- A3: Build or typecheck script (package.json:1, sha256:5cc1364afcac)
- A3: CI workflow (.github/workflows/compiler_discord_notify.yml:1, sha256:e934619a5e08)
- A3: Release deploy configuration (compiler/apps/playground/vercel.json:1, sha256:e22d332ab69c)
- A3: Build or typecheck script (package.json:1, sha256:5cc1364afcac) (warning)
- A4: Dependency manifest (package.json:1, sha256:5cc1364afcac)
- A4: Dependency lockfile (compiler/Cargo.lock:1, sha256:023853d4df57)
- A4: Dependency update config (.github/dependabot.yml:1, sha256:46e17f9d7ab8)
- A5: Repository claim source (README.md:1, sha256:4d20edc8d043)
- A5: Code presence for claim reconciliation (compiler/apps/playground/app/layout.tsx:1, sha256:80ab85b722a3)
- A5: Repository claim source (README.md:1, sha256:4d20edc8d043) (warning)
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/compiler_discord_notify.yml:1, sha256:e934619a5e08)
- B2: Pull-request CI workflow (.github/workflows/compiler_playground.yml:1, sha256:99f32e363cdf)
- B2: Pull-request CI workflow (.github/workflows/compiler_prereleases.yml:1, sha256:85fc08a7cb0c)
- B2: Pull request template (.github/PULL_REQUEST_TEMPLATE.md:1, sha256:3b66d9d79de5)
- B2: Pull-request CI workflow (.github/workflows/compiler_discord_notify.yml:1, sha256:e934619a5e08) (warning)
- B3: Test script (package.json:1, sha256:5cc1364afcac)
- B3: Lint script (package.json:1, sha256:5cc1364afcac)
- B3: CI workflow (.github/workflows/compiler_discord_notify.yml:1, sha256:e934619a5e08)
- B4: Audit or changelog artifact (CHANGELOG.md:1, sha256:b5d0e23a1079)
- B4: Audit or changelog artifact (SECURITY.md:1, sha256:c0754b9a4971)
- B4: Audit or changelog artifact (compiler/CHANGELOG.md:1, sha256:225938e5aa42)
- B4: Audit or changelog artifact (packages/eslint-plugin-react-hooks/CHANGELOG.md:1, sha256:46ff96b6f31c)
- B4: Audit or changelog artifact (packages/react-devtools/CHANGELOG.md:1, sha256:3e643e9aceb2)
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A1 warning: A scheduled product-health workflow exists, but its results are handed only to an ephemeral, access-gated CI artifact — not a durable, checkable record. (Scheduled product-health workflow (.github/workflows/devtools_regression_tests.yml:1, sha256:e81037c21b41))
- A1 info: Test suite files are present, but no coverage configuration was detected. (Detected test file (compiler/apps/playground/__tests__/e2e/page.spec.ts:1, sha256:fd6799d3b88d))
- A2 info: A non-template .env file is committed in the current repository tree; no secret-shaped value was detected. (Committed .env file (no confirmed secret value found) (fixtures/fiber-debugger/.env:1, sha256:5da7ad963fe4))
- A2 warning: A2 metric-derived score is 3.2/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Committed .env file in repository tree (fixtures/fiber-debugger/.env:1, sha256:5da7ad963fe4))
- A3 warning: A3 metric-derived score is 2.3/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Build or typecheck script (package.json:1, sha256:5cc1364afcac))
- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (README.md:1, sha256:4d20edc8d043))
- B2 warning: B2 metric-derived score is 4.0/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Pull-request CI workflow (.github/workflows/compiler_discord_notify.yml:1, sha256:e934619a5e08))
