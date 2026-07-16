# Cejel Trust Report - svelte

- Product: svelte
- Rubric: witan-rubric-v3-2026-07-13
- Generated: 2026-07-16T03:09:48.024Z
- Repository: https://github.com/sveltejs/svelte @ b4d1583ae20f3869a88a731d9a265c546c099f66

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.6 | info | Test-to-source file ratio: 3011 ratio (cap 422); Static coverage percentage: 0/100 percent; Verification script ratio: 3 ratio (cap 4); Non-hollow test share: 1949/1949 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | 3.6 | verified | Secret cleanliness: 1/1 clean; Environment handling depth: 2/3 practices |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 3.1 | info | Declared version range ratio: 60/60 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 0/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.2 | warning | Claim match rate: 12/13 ratio; Claim source depth: 1 docs (cap 4); Reconciliation artifact depth: 0/3 artifacts |
| B1 | Alfred-internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | verified | PR trace primitive coverage: 6 signals (cap 2); Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 4.0 | verified | CI verification depth: 4 signals (cap 4); PR-gate CI workflow count: 5 workflows (cap 4) |
| B4 | Audit trail and report-up completeness | Process trust | 1.9 | warning | Audit artifact depth: 1 files (cap 3); Audit freshness depth: 1/1 ratio |
| B5 | Alfred-internal process dimension | Process trust | N/A | not_applicable | N/A |
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
- A1: CI workflow runs the test suite (.github/workflows/ci.yml:1, sha256:1bccd24d65cb)
- A1: Detected test file (benchmarking/benchmarks/reactivity/tests/clean_effects.bench.js:1, sha256:1937606d3d19) (info)
- A2: .env files are gitignored (.gitignore:1, sha256:74cbf833f6cd)
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). Dockerfile alone is ambiguous and does not qualify.
- A4: Dependency manifest (packages/svelte/package.json:1, sha256:1b17c4f21e75)
- A4: Dependency lockfile (pnpm-lock.yaml:1, sha256:18d46c38bd3f)
- A5: Repository claim source (.changeset/README.md:1, sha256:bf33c79d7e04)
- A5: Code presence for claim reconciliation (packages/svelte/elements.d.ts:1, sha256:180ce9a33f1f)
- A5: Repository claim source (.changeset/README.md:1, sha256:bf33c79d7e04) (warning)
- B1: N/A — Substrate-specific: an Alfred-internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/autofix.yml:1, sha256:02f5a1442676)
- B2: Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:1bccd24d65cb)
- B2: Pull-request CI workflow (.github/workflows/ecosystem-ci-trigger.yml:1, sha256:ce15fb9dd3c8)
- B2: Pull request template (.github/PULL_REQUEST_TEMPLATE.md:1, sha256:5637321f410f)
- B3: Test script (package.json:1, sha256:cc47e94e6601)
- B3: Lint script (package.json:1, sha256:cc47e94e6601)
- B3: CI workflow (.github/workflows/autofix.yml:1, sha256:02f5a1442676)
- B4: Audit or changelog artifact (packages/svelte/CHANGELOG.md:1, sha256:34ca5aff9916)
- B4: Audit or changelog artifact (packages/svelte/CHANGELOG.md:1, sha256:34ca5aff9916) (warning)
- B5: N/A — Substrate-specific: an Alfred-internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A1 info: Test suite files are present, but no coverage configuration was detected. (Detected test file (benchmarking/benchmarks/reactivity/tests/clean_effects.bench.js:1, sha256:1937606d3d19))
- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (.changeset/README.md:1, sha256:bf33c79d7e04))
- B4 warning: B4 metric-derived score is 1.9/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Audit or changelog artifact (packages/svelte/CHANGELOG.md:1, sha256:34ca5aff9916))
