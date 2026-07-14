# Cejel Trust Report - esbuild

- Product: esbuild
- Rubric: witan-rubric-v3-2026-07-13
- Generated: 2026-07-13T18:03:01.549Z
- Repository: https://github.com/evanw/esbuild @ 6ff1d8b0d8c134e867a397eef39702a223ebef9e

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.5 | info | Test-to-source file ratio: 35 ratio (cap 26); Static coverage percentage: 0/100 percent; Verification script ratio: 4 ratio (cap 4); Non-hollow test share: 15/34 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | N/A | not_applicable | N/A |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 3.1 | info | Declared version range ratio: 59/59 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 0/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.4 | warning | Claim match rate: 12/15 ratio; Claim source depth: 3 docs (cap 4); Reconciliation artifact depth: 0/3 artifacts |
| B1 | Alfred-internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 3.2 | info | PR trace primitive coverage: 4 signals (cap 2); Recent PR merge ratio: 0/1 ratio |
| B3 | CI and QA discipline | Process trust | 2.0 | warning | CI verification depth: 2 signals (cap 4); PR-gate CI workflow count: 2 workflows (cap 4) |
| B4 | Audit trail and report-up completeness | Process trust | 1.9 | warning | Audit artifact depth: 1 files (cap 3); Audit freshness depth: 1/1 ratio |
| B5 | Alfred-internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 2.7/4.0
- Process trust: 2.4/4.0
- Overall: 2.6/4.0
- Measured coverage: code trust 3/5, process trust 3/6, overall 6/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: A2, A3, B1, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (internal/bundler_tests/bundler_css_test.go:1, sha256:4ca59971537d)
- A1: Detected test file (internal/bundler_tests/bundler_dce_test.go:1, sha256:077703d5e650)
- A1: Detected test file (internal/bundler_tests/bundler_default_test.go:1, sha256:d249d68924f0)
- A1: Detected test file (internal/bundler_tests/bundler_glob_test.go:1, sha256:b1a0fcbc38d7)
- A1: Detected test file (internal/bundler_tests/bundler_importphase_test.go:1, sha256:d56b260cfafc)
- A1: Detected test file (internal/bundler_tests/bundler_importstar_test.go:1, sha256:9c5f3aa40964)
- A1: Detected test file (internal/bundler_tests/bundler_importstar_ts_test.go:1, sha256:5fd6a59f12f6)
- A1: Detected test file (internal/bundler_tests/bundler_loader_test.go:1, sha256:07a896abcd49)
- A1: Configured test runner (Makefile:1, sha256:ca1b97d21eef)
- A1: Configured test runner (go.mod:1, sha256:2d48dbed6151)
- A1: CI workflow runs the test suite (.github/workflows/ci.yml:1, sha256:a028444642bb)
- A1: Detected test file (internal/bundler_tests/bundler_css_test.go:1, sha256:4ca59971537d) (info)
- A2: N/A — No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). Dockerfile alone is ambiguous and does not qualify.
- A4: Dependency manifest (npm/esbuild/package.json:1, sha256:d55d1d19fcc5)
- A4: Dependency lockfile (compat-table/package-lock.json:1, sha256:b9b3bf165f6d)
- A5: Repository claim source (README.md:1, sha256:d9233b2fb0eb)
- A5: Code presence for claim reconciliation (cmd/esbuild/main.go:1, sha256:3e56d13cfa3b)
- A5: Repository claim source (README.md:1, sha256:d9233b2fb0eb) (warning)
- B1: N/A — Substrate-specific: an Alfred-internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:a028444642bb)
- B2: Pull-request CI workflow (.github/workflows/e2e.yml:1, sha256:ea4c80bd05ea)
- B2: Pull-request CI workflow (.github/workflows/publish.yml:1, sha256:8475659bb5fb)
- B3: CI workflow (.github/workflows/ci.yml:1, sha256:a028444642bb)
- B3: CI workflow (.github/workflows/ci.yml:1, sha256:a028444642bb) (warning)
- B4: Audit or changelog artifact (CHANGELOG.md:1, sha256:994fc1638806)
- B4: Audit or changelog artifact (CHANGELOG.md:1, sha256:994fc1638806) (warning)
- B5: N/A — Substrate-specific: an Alfred-internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A1 info: Test suite files are present, but no coverage configuration was detected. (Detected test file (internal/bundler_tests/bundler_css_test.go:1, sha256:4ca59971537d))
- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (README.md:1, sha256:d9233b2fb0eb))
- B3 warning: B3 metric-derived score is 2.0/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (CI workflow (.github/workflows/ci.yml:1, sha256:a028444642bb))
- B4 warning: B4 metric-derived score is 1.9/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Audit or changelog artifact (CHANGELOG.md:1, sha256:994fc1638806))
