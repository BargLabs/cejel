# Cejel Trust Report - vite

- Product: vite
- Rubric: witan-rubric-v3-2026-07-13
- Generated: 2026-07-13T18:03:01.549Z
- Repository: https://github.com/vitejs/vite @ 5d95f1631bfde08ee2613a53517dd5ea5d388cda

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.5 | info | Test-to-source file ratio: 367 ratio (cap 318); Static coverage percentage: 0/100 percent; Verification script ratio: 4 ratio (cap 4); Non-hollow test share: 168/366 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | 2.4 | warning | Secret cleanliness: 1/1 clean; Environment handling depth: 1/3 practices |
| A3 | Production readiness | Code trust | 2.8 | info | Production-readiness primitive coverage: 4/6 primitives; Production workflow depth: 14 signals (cap 6); Observability depth: 72 signals (cap 4); Rollback and migration-safety depth: 1 signals (cap 4) |
| A4 | Dependency hygiene | Code trust | 2.8 | info | Pinned dependency ratio: 177/470 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 1/2 ratio |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.7 | info | Claim match rate: 12/19 ratio; Claim source depth: 7 docs (cap 4); Reconciliation artifact depth: 0/3 artifacts |
| B1 | Alfred-internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | verified | PR trace primitive coverage: 14 signals (cap 2); Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 4.0 | verified | CI verification depth: 5 signals (cap 4); PR-gate CI workflow count: 7 workflows (cap 4) |
| B4 | Audit trail and report-up completeness | Process trust | 4.0 | verified | Audit artifact depth: 5 files (cap 3); Audit freshness depth: 5/5 ratio |
| B5 | Alfred-internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 2.6/4.0
- Process trust: 4.0/4.0
- Overall: 3.3/4.0
- Measured coverage: code trust 5/5, process trust 3/6, overall 8/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: B1, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (packages/create-vite/__tests__/cli.spec.ts:1, sha256:32713f162d0d)
- A1: Detected test file (packages/plugin-legacy/src/__tests__/index.spec.ts:1, sha256:c0f8ee1b60c5)
- A1: Detected test file (packages/plugin-legacy/src/__tests__/readme.spec.ts:1, sha256:ab7e7df2117e)
- A1: Detected test file (packages/plugin-legacy/src/__tests__/snippets.spec.ts:1, sha256:1cff4e960452)
- A1: Detected test file (packages/vite/src/node/__tests__/assetSource.spec.ts:1, sha256:bea16fff4bae)
- A1: Detected test file (packages/vite/src/node/__tests__/build.spec.ts:1, sha256:54721ae21f61)
- A1: Detected test file (packages/vite/src/node/__tests__/config.spec.ts:1, sha256:5407eae6cf20)
- A1: Detected test file (packages/vite/src/node/__tests__/constants.spec.ts:1, sha256:d634c8ecf058)
- A1: Configured test runner (vitest.config.ts:1, sha256:ca84ddb6a6ea)
- A1: Configured test runner (package.json:1, sha256:65b15bd911af)
- A1: Coverage configuration (vitest.config.ts:1, sha256:ca84ddb6a6ea)
- A1: CI workflow runs the test suite (.github/workflows/ci.yml:1, sha256:48ba7a33148b)
- A2: Committed .env file in repository tree (packages/vite/src/node/__tests__/env/.env:1, sha256:54001638a31b)
- A2: .env file (not a template) tracked in git history; no confirmed secret value found (packages/vite/src/node/__tests__/env/.env, sha256:5d95f1631bfd) (warning)
- A3: Build or typecheck script (package.json:1, sha256:65b15bd911af)
- A3: CI workflow (.github/workflows/ci.yml:1, sha256:48ba7a33148b)
- A3: Deploy configuration (netlify.toml:1, sha256:03ae0d222957)
- A3: Error boundary (packages/vite/src/node/server/middlewares/error.ts:1, sha256:659f1a1980f9)
- A4: Dependency manifest (packages/vite/package.json:1, sha256:6ff1b098fb8b)
- A4: Dependency lockfile (pnpm-lock.yaml:1, sha256:e478a9a87cb9)
- A4: Dependency update config (.github/renovate.json5:1, sha256:1321e59dd9d9)
- A5: Repository claim source (README.md:1, sha256:d41584fcf5e6)
- A5: Code presence for claim reconciliation (packages/create-vite/__tests__/cli.spec.ts:1, sha256:32713f162d0d)
- A5: Documented limitations / threat model / "not covered" section (.github/SECURITY.md:1, sha256:91350d5b5c5b)
- A5: Repository claim source (README.md:1, sha256:d41584fcf5e6) (info)
- B1: N/A — Substrate-specific: an Alfred-internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:48ba7a33148b)
- B2: Pull-request CI workflow (.github/workflows/copilot-setup-steps.yml:1, sha256:1e0e5d8e0dd4)
- B2: Pull-request CI workflow (.github/workflows/ecosystem-ci-trigger.yml:1, sha256:1385479a72ff)
- B2: Pull request template (.github/PULL_REQUEST_TEMPLATE.md:1, sha256:8de7596292eb)
- B3: Test script (package.json:1, sha256:65b15bd911af)
- B3: Lint script (package.json:1, sha256:65b15bd911af)
- B3: CI workflow (.github/workflows/ci.yml:1, sha256:48ba7a33148b)
- B4: Audit or changelog artifact (.github/SECURITY.md:1, sha256:91350d5b5c5b)
- B4: Audit or changelog artifact (docs/releases.md:1, sha256:f7ef667a1354)
- B4: Audit or changelog artifact (packages/create-vite/CHANGELOG.md:1, sha256:52e51ad6de85)
- B4: Audit or changelog artifact (packages/plugin-legacy/CHANGELOG.md:1, sha256:167d69282784)
- B4: Audit or changelog artifact (packages/vite/CHANGELOG.md:1, sha256:850589f92e3e)
- B5: N/A — Substrate-specific: an Alfred-internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A2 warning: A non-template .env file was tracked in git history; no secret-shaped value was detected. (.env file (not a template) tracked in git history; no confirmed secret value found (packages/vite/src/node/__tests__/env/.env, sha256:5d95f1631bfd))
- A5 info: Claim source and implementation files are present; no dedicated claim-reality report artifact was supplied, but the repo explicitly documents what it does NOT cover/protect against — honest scoping, not overclaiming. (Repository claim source (README.md:1, sha256:d41584fcf5e6))
