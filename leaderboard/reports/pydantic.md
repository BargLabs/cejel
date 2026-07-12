# Cejel Trust Report - pydantic

- Product: pydantic
- Rubric: witan-rubric-v2-2026-07-12
- Generated: 2026-07-12T18:11:15.466Z
- Repository: https://github.com/pydantic/pydantic @ f59e929c999e8b2efc7b12fd0bc1685c1a186be3

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.8 | info | Test-to-source file ratio: 290 ratio (cap 125); Static coverage percentage: 0/100 percent; Verification script ratio: 5 ratio (cap 4); Non-hollow test share: 213/225 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | N/A | not_applicable | N/A |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 3.6 | verified | Declared version range ratio: 28/28 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 1/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.4 | warning | Claim match rate: 12/20 ratio; Claim source depth: 9 docs (cap 4); Reconciliation artifact depth: 0/3 artifacts |
| B1 | Alfred-internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | verified | PR trace primitive coverage: 11 signals (cap 2); Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 3.6 | verified | CI verification depth: 3 signals (cap 4); PR-gate CI workflow count: 6 workflows (cap 4) |
| B4 | Audit trail and report-up completeness | Process trust | 2.9 | info | Audit artifact depth: 2 files (cap 3); Audit freshness depth: 2/2 ratio |
| B5 | Alfred-internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 2.9/4.0
- Process trust: 3.5/4.0
- Overall: 3.2/4.0
- Measured coverage: code trust 3/5, process trust 3/6, overall 6/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: A2, A3, B1, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (pydantic-core/tests/__init__.py)
- A1: Detected test file (pydantic-core/tests/benchmarks/__init__.py)
- A1: Detected test file (pydantic-core/tests/benchmarks/complete_schema.py:1, sha256:67fbb9f86ee1)
- A1: Detected test file (pydantic-core/tests/benchmarks/nested_schema.py:1, sha256:5dd7f39830db)
- A1: Detected test file (pydantic-core/tests/benchmarks/test_complete_benchmark.py:1, sha256:93af73fdd79c)
- A1: Detected test file (pydantic-core/tests/benchmarks/test_micro_benchmarks.py:1, sha256:4a88116cb64c)
- A1: Detected test file (pydantic-core/tests/benchmarks/test_nested_benchmark.py:1, sha256:b257d008f043)
- A1: Detected test file (pydantic-core/tests/benchmarks/test_serialization_micro.py:1, sha256:52fce052ee06)
- A1: Configured test runner (Makefile:1, sha256:0e9d9400ee80)
- A1: Configured test runner (pydantic-core/Cargo.toml:1, sha256:e0dfda4bea74)
- A1: Configured test runner (pydantic-core/Makefile:1, sha256:4ac502de0f82)
- A1: Coverage configuration (.github/workflows/coverage.yml:1, sha256:778ab27e94bf)
- A1: Coverage configuration (pydantic-core/pyproject.toml:1, sha256:99dd772c656a)
- A1: Coverage configuration (pyproject.toml:1, sha256:8375abce73bf)
- A1: Coverage configuration (tests/plugin/pyproject.toml:1, sha256:0e61aa9ab890)
- A1: CI workflow runs the test suite (.github/workflows/ci.yml:1, sha256:b84e54ec0671)
- A2: N/A — No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). Dockerfile alone is ambiguous and does not qualify.
- A4: Dependency manifest (pydantic-core/Cargo.toml:1, sha256:e0dfda4bea74)
- A4: Dependency lockfile (pydantic-core/Cargo.lock:1, sha256:79e859286a1b)
- A4: Dependency update config (.github/dependabot.yml:1, sha256:62040a26dfec)
- A5: Repository claim source (README.md:1, sha256:b5e7970366d9)
- A5: Code presence for claim reconciliation (pydantic-core/src/argument_markers.rs:1, sha256:71fe74ddc7fe)
- A5: Repository claim source (README.md:1, sha256:b5e7970366d9) (warning)
- B1: N/A — Substrate-specific: an Alfred-internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:b84e54ec0671)
- B2: Pull-request CI workflow (.github/workflows/codspeed.yml:1, sha256:b2580cad48fe)
- B2: Pull-request CI workflow (.github/workflows/coverage.yml:1, sha256:778ab27e94bf)
- B2: Pull request template (.github/PULL_REQUEST_TEMPLATE.md:1, sha256:1fd33fa8826b)
- B3: CI workflow (.github/workflows/ci.yml:1, sha256:b84e54ec0671)
- B4: Audit or changelog artifact (CITATION.cff:1, sha256:943d40f1504a)
- B4: Audit or changelog artifact (HISTORY.md:1, sha256:4ac933062dfd)
- B5: N/A — Substrate-specific: an Alfred-internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (README.md:1, sha256:b5e7970366d9))
