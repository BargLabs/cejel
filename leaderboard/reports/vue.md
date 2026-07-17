# Cejel Trust Report - vue

- Product: vue
- Rubric: witan-rubric-v3-2026-07-13
- Generated: 2026-07-16T03:09:48.024Z
- Repository: https://github.com/vuejs/core @ c0606e91798c8dca4f33d101e1dd836d672592c1

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.5 | info | Test-to-source file ratio: 205 ratio (cap 272); Static coverage percentage: 0/100 percent; Verification script ratio: 4 ratio (cap 4); Non-hollow test share: 198/205 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | N/A | not_applicable | N/A |
| A3 | Production readiness | Code trust | 2.3 | warning | Production-readiness primitive coverage: 3/6 primitives; Production workflow depth: 10 signals (cap 6); Observability depth: 4 signals (cap 4); Rollback and migration-safety depth: 0 signals (cap 4) |
| A4 | Dependency hygiene | Code trust | 2.7 | info | Pinned dependency ratio: 38/123 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 1/2 ratio |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.2 | warning | Claim match rate: 12/13 ratio; Claim source depth: 1 docs (cap 4); Reconciliation artifact depth: 0/3 artifacts |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 3.2 | info | PR trace primitive coverage: 9 signals (cap 2); Recent PR merge ratio: 0/1 ratio |
| B3 | CI and QA discipline | Process trust | 4.0 | verified | CI verification depth: 5 signals (cap 4); PR-gate CI workflow count: 5 workflows (cap 4) |
| B4 | Audit trail and report-up completeness | Process trust | 2.9 | info | Audit artifact depth: 2 files (cap 3); Audit freshness depth: 2/2 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 2.4/4.0
- Process trust: 3.4/4.0
- Overall: 2.9/4.0
- Measured coverage: code trust 4/5, process trust 3/6, overall 7/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: A2, B1, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (packages/compiler-core/__tests__/codegen.spec.ts:1, sha256:63ba48da7ac9)
- A1: Detected test file (packages/compiler-core/__tests__/compile.spec.ts:1, sha256:be962453bd41)
- A1: Detected test file (packages/compiler-core/__tests__/parse.spec.ts:1, sha256:937d3edeeae4)
- A1: Detected test file (packages/compiler-core/__tests__/scopeId.spec.ts:1, sha256:5bc4e857bccb)
- A1: Detected test file (packages/compiler-core/__tests__/testUtils.ts:1, sha256:201483f1165d)
- A1: Detected test file (packages/compiler-core/__tests__/transform.spec.ts:1, sha256:f47ac739de25)
- A1: Detected test file (packages/compiler-core/__tests__/transforms/cacheStatic.spec.ts:1, sha256:e636d1021703)
- A1: Detected test file (packages/compiler-core/__tests__/transforms/noopDirectiveTransform.spec.ts:1, sha256:0257911e5bfb)
- A1: Configured test runner (vitest.config.ts:1, sha256:53a16c86c515)
- A1: Configured test runner (package.json:1, sha256:0e9687aefbca)
- A1: Coverage configuration (vitest.config.ts:1, sha256:53a16c86c515)
- A2: N/A — No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.
- A3: Build or typecheck script (package.json:1, sha256:0e9687aefbca)
- A3: CI workflow (.github/workflows/autofix.yml:1, sha256:b07d87251343)
- A3: Deploy configuration (netlify.toml:1, sha256:dcb6042928c9)
- A3: Build or typecheck script (package.json:1, sha256:0e9687aefbca) (warning)
- A4: Dependency manifest (package.json:1, sha256:0e9687aefbca)
- A4: Dependency lockfile (pnpm-lock.yaml:1, sha256:a9947be31928)
- A4: Dependency update config (.github/renovate.json5:1, sha256:4f3867861c7f)
- A5: Repository claim source (README.md:1, sha256:1d5ea6d8b418)
- A5: Code presence for claim reconciliation (packages-private/dts-built-test/src/index.ts:1, sha256:5d44f16d7982)
- A5: Repository claim source (README.md:1, sha256:1d5ea6d8b418) (warning)
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/autofix.yml:1, sha256:b07d87251343)
- B2: Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:ede571131c6d)
- B2: Pull-request CI workflow (.github/workflows/close-cant-reproduce-issues.yml:1, sha256:8f37190a64d8)
- B3: Test script (package.json:1, sha256:0e9687aefbca)
- B3: Lint script (package.json:1, sha256:0e9687aefbca)
- B3: CI workflow (.github/workflows/autofix.yml:1, sha256:b07d87251343)
- B4: Audit or changelog artifact (CHANGELOG.md:1, sha256:4f9499f794a5)
- B4: Audit or changelog artifact (SECURITY.md:1, sha256:f744b4da60a2)
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A3 warning: A3 metric-derived score is 2.3/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Build or typecheck script (package.json:1, sha256:0e9687aefbca))
- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (README.md:1, sha256:1d5ea6d8b418))
