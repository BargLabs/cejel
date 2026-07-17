# Cejel Trust Report - fastapi

- Product: fastapi
- Rubric: witan-rubric-v3-2026-07-13
- Generated: 2026-07-16T03:09:48.024Z
- Repository: https://github.com/fastapi/fastapi @ 7cb06f360dd44efac059848df1a9beee7643b018

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.0 | warning | Test-to-source file ratio: 601 ratio (cap 1); Static coverage percentage: 0/100 percent; Verification script ratio: 1 ratio (cap 4); Non-hollow test share: 491/501 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | N/A | not_applicable | N/A |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 3.6 | verified | Declared version range ratio: 5/5 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 1/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.0 | warning | Claim match rate: 4/6 ratio; Claim source depth: 2 docs (cap 4); Reconciliation artifact depth: 0/3 artifacts |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 3.2 | info | PR trace primitive coverage: 23 signals (cap 2); Recent PR merge ratio: 0/1 ratio |
| B3 | CI and QA discipline | Process trust | 2.7 | info | CI verification depth: 1 signals (cap 4); PR-gate CI workflow count: 9 workflows (cap 4) |
| B4 | Audit trail and report-up completeness | Process trust | 3.6 | verified | Audit artifact depth: 99 files (cap 3); Audit freshness depth: 48/99 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 2.5/4.0
- Process trust: 3.2/4.0
- Overall: 2.9/4.0
- Measured coverage: code trust 3/5, process trust 3/6, overall 6/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: A2, A3, B1, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (docs_src/app_testing/app_a_py310/test_main.py:1, sha256:e7206e066c05)
- A1: Detected test file (docs_src/app_testing/app_b_an_py310/test_main.py:1, sha256:0983f6ade01f)
- A1: Detected test file (docs_src/app_testing/app_b_py310/test_main.py:1, sha256:0983f6ade01f)
- A1: Detected test file (docs_src/async_tests/app_a_py310/test_main.py:1, sha256:a129755184f1)
- A1: Detected test file (docs_src/settings/app02_an_py310/test_main.py:1, sha256:cc6f4b806f7f)
- A1: Detected test file (docs_src/settings/app02_py310/test_main.py:1, sha256:cc6f4b806f7f)
- A1: Detected test file (scripts/tests/test_translation_fixer/conftest.py:1, sha256:0a8707cb9d97)
- A1: Detected test file (scripts/tests/test_translation_fixer/test_code_blocks/test_code_blocks_lines_number_mismatch.py:1, sha256:94ffac1f3a8a)
- A1: Coverage configuration (pyproject.toml:1, sha256:b4181f59f23f)
- A1: CI workflow runs the test suite (.github/workflows/test.yml:1, sha256:5e24f8017646)
- A1: Detected test file (docs_src/app_testing/app_a_py310/test_main.py:1, sha256:e7206e066c05) (warning)
- A2: N/A — No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). Dockerfile alone is ambiguous and does not qualify.
- A4: Dependency manifest (pyproject.toml:1, sha256:b4181f59f23f)
- A4: Dependency lockfile (uv.lock:1, sha256:04e02a427144)
- A4: Dependency update config (.github/dependabot.yml:1, sha256:92725ac5b657)
- A5: Repository claim source (README.md:1, sha256:6ed06ac06d4f)
- A5: Code presence for claim reconciliation (tests/test_modules_same_name_body/app/__init__.py)
- A5: Repository claim source (README.md:1, sha256:6ed06ac06d4f) (warning)
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/add-to-project.yml:1, sha256:74f130b855a5)
- B2: Pull-request CI workflow (.github/workflows/build-docs.yml:1, sha256:388a7d1eb471)
- B2: Pull-request CI workflow (.github/workflows/contributors.yml:1, sha256:7d91c15909bf)
- B3: CI workflow (.github/workflows/add-to-project.yml:1, sha256:74f130b855a5)
- B4: Audit or changelog artifact (CITATION.cff:1, sha256:8feb5e554875)
- B4: Audit or changelog artifact (docs/de/docs/advanced/security/http-basic-auth.md:1, sha256:a1c453720a1d)
- B4: Audit or changelog artifact (docs/de/docs/advanced/security/index.md:1, sha256:f86483015af3)
- B4: Audit or changelog artifact (docs/de/docs/advanced/security/oauth2-scopes.md:1, sha256:304c2794044f)
- B4: Audit or changelog artifact (docs/de/docs/tutorial/security/first-steps.md:1, sha256:d88a5eb95f14)
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A1 warning: A1 metric-derived score is 2.0/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Detected test file (docs_src/app_testing/app_a_py310/test_main.py:1, sha256:e7206e066c05))
- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (README.md:1, sha256:6ed06ac06d4f))
