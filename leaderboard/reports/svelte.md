# Cejel Trust Report - svelte

- Product: svelte
- Rubric: witan-rubric-v9-2026-07-22
- Generated: 2026-07-22T20:52:22.603Z
- Repository: https://github.com/sveltejs/svelte @ b4d1583ae20f3869a88a731d9a265c546c099f66

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.6 | verified | Test-to-source file ratio: 422 ratio (capped; 7886 raw); Static coverage percentage: 0/100 percent; Verification script ratio: 3/4 ratio; Non-hollow test share: 1951/1951 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | 3.6 | verified | Secret cleanliness: 1/1 clean; Environment handling depth: 2/3 practices |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 3.1 | warning | Declared version range ratio: 60/60 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 0/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.2 | warning | Claim match rate: 12/13 ratio; Claim source depth: 1/4 docs; Reconciliation artifact depth: 0/3 artifacts |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | warning | PR trace primitive coverage: 2 signals (capped; 6 raw); Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 4.0 | verified | CI verification depth: 4/4 signals; PR-gate CI workflow count: 4 workflows (capped; 5 raw) |
| B4 | Audit trail and report-up completeness | Process trust | 1.9 | warning | Audit artifact depth: 1/3 files; Audit freshness depth: 1/1 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 2.9/4.0
- Process trust: 3.3/4.0
- Overall: 3.1/4.0
- Measured coverage: code trust 4/5, process trust 3/6, overall 7/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: A3, B1, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (benchmarking/benchmarks/reactivity/tests/clean_effects.bench.js:1, sha256:1937606d3d19)
- A1: Detected test file (benchmarking/benchmarks/reactivity/tests/kairo_avoidable.bench.js:1, sha256:a0818f51c0eb)
- A1: Detected test file (benchmarking/benchmarks/reactivity/tests/kairo_broad.bench.js:1, sha256:83269ad958a3)
- A1: Detected test file (benchmarking/benchmarks/reactivity/tests/kairo_broad_block.bench.js:1, sha256:ab417b65763d)
- A1: Detected test file (benchmarking/benchmarks/reactivity/tests/kairo_deep.bench.js:1, sha256:58c2b17b2114)
- A1: Detected test file (benchmarking/benchmarks/reactivity/tests/kairo_deep_block.bench.js:1, sha256:e5c2117aa045)
- A1: Detected test file (benchmarking/benchmarks/reactivity/tests/kairo_diamond.bench.js:1, sha256:ed75fe4a855e)
- A1: Detected test file (benchmarking/benchmarks/reactivity/tests/kairo_mux.bench.js:1, sha256:21944e547bdb)
- A1: Configured test runner (vitest.config.js:1, sha256:301bf5f184b8)
- A1: Configured test runner (package.json:1, sha256:cc47e94e6601)
- A1: Coverage configuration (vitest.config.js:1, sha256:301bf5f184b8)
- A1: CI workflow runs the test suite (.github/workflows/ci.yml:1, sha256:1bccd24d65cb)
- A2: .env files are gitignored (.gitignore:1, sha256:74cbf833f6cd)
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). A Dockerfile without an explicit runtime start/service command is ambiguous and does not qualify.
- A4: Dependency manifest (packages/svelte/package.json:1, sha256:1b17c4f21e75)
- A4: Dependency lockfile (pnpm-lock.yaml:1, sha256:18d46c38bd3f)
- A4: Dependency manifest (packages/svelte/package.json:1, sha256:1b17c4f21e75) (warning)
- A5: Repository claim source (README.md:1, sha256:f58cdd71cf9d)
- A5: Code presence for claim reconciliation (packages/svelte/elements.d.ts:1, sha256:180ce9a33f1f)
- A5: Repository claim source (README.md:1, sha256:f58cdd71cf9d) (warning)
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/autofix.yml:1, sha256:02f5a1442676)
- B2: Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:1bccd24d65cb)
- B2: Pull-request CI workflow (.github/workflows/ecosystem-ci-trigger.yml:1, sha256:ce15fb9dd3c8)
- B2: Pull request template (.github/PULL_REQUEST_TEMPLATE.md:1, sha256:5637321f410f)
- B2: Pull-request CI workflow (.github/workflows/autofix.yml:1, sha256:02f5a1442676) (warning)
- B3: Test script (package.json:1, sha256:cc47e94e6601)
- B3: Lint script (package.json:1, sha256:cc47e94e6601)
- B3: CI workflow (.github/workflows/autofix.yml:1, sha256:02f5a1442676)
- B4: Audit or changelog artifact (packages/svelte/CHANGELOG.md:1, sha256:34ca5aff9916)
- B4: Audit or changelog artifact (packages/svelte/CHANGELOG.md:1, sha256:34ca5aff9916) (warning)
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A4 warning: A4 metric-derived score is 3.1/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Dependency manifest (packages/svelte/package.json:1, sha256:1b17c4f21e75))
- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (README.md:1, sha256:f58cdd71cf9d))
- B2 warning: B2 metric-derived score is 4.0/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Pull-request CI workflow (.github/workflows/autofix.yml:1, sha256:02f5a1442676))
- B4 warning: B4 metric-derived score is 1.9/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Audit or changelog artifact (packages/svelte/CHANGELOG.md:1, sha256:34ca5aff9916))
