# Cejel Trust Report - fastapi

- Product: fastapi
- Rubric: witan-rubric-v9-2026-07-22
- Generated: 2026-07-22T20:52:22.603Z
- Repository: https://github.com/fastapi/fastapi @ 7cb06f360dd44efac059848df1a9beee7643b018

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.3 | verified | Test-to-source file ratio: 1 ratio (capped; 601 raw); Static coverage percentage: 0/100 percent; Verification script ratio: 2/4 ratio; Non-hollow test share: 491/501 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | N/A | not_applicable | N/A |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 3.6 | verified | Declared version range ratio: 5/5 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 1/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | no data | insufficient_data | Insufficient data — no measurable signal for this criterion |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 3.2 | warning | PR trace primitive coverage: 2 signals (capped; 23 raw); Recent PR merge ratio: 0/1 ratio |
| B3 | CI and QA discipline | Process trust | 2.7 | warning | CI verification depth: 1/4 signals; PR-gate CI workflow count: 4 workflows (capped; 9 raw) |
| B4 | Audit trail and report-up completeness | Process trust | 3.6 | verified | Audit artifact depth: 3 files (capped; 99 raw); Audit freshness depth: 48/99 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 3.0/4.0
- Process trust: 3.2/4.0
- Overall: 3.1/4.0
- Measured coverage: code trust 2/5, process trust 3/6, overall 5/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Low confidence: fewer than half of the dimensions behind at least one score above were measured. Low coverage — scored on few signals, less certain than the same score measured across more dimensions.
- Not applicable: A2, A3, B1, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).
- Insufficient data: A5 — no measurable signal for the scorer to read; excluded from composite. Unmeasured, not inapplicable, and not a measured zero.

## Evidence

- A1: Detected test file (docs_src/app_testing/app_a_py310/test_main.py:1, sha256:e7206e066c05)
- A1: Detected test file (docs_src/app_testing/app_b_an_py310/test_main.py:1, sha256:0983f6ade01f)
- A1: Detected test file (docs_src/app_testing/app_b_py310/test_main.py:1, sha256:0983f6ade01f)
- A1: Detected test file (docs_src/async_tests/app_a_py310/test_main.py:1, sha256:a129755184f1)
- A1: Detected test file (docs_src/settings/app02_an_py310/test_main.py:1, sha256:cc6f4b806f7f)
- A1: Detected test file (docs_src/settings/app02_py310/test_main.py:1, sha256:cc6f4b806f7f)
- A1: Detected test file (scripts/tests/test_translation_fixer/conftest.py:1, sha256:0a8707cb9d97)
- A1: Detected test file (scripts/tests/test_translation_fixer/test_code_blocks/test_code_blocks_lines_number_mismatch.py:1, sha256:94ffac1f3a8a)
- A1: Configured test runner (pyproject.toml:1, sha256:b4181f59f23f)
- A1: Coverage configuration (pyproject.toml:1, sha256:b4181f59f23f)
- A1: CI workflow runs the test suite (.github/workflows/test.yml:1, sha256:5e24f8017646)
- A2: N/A — No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). A Dockerfile without an explicit runtime start/service command is ambiguous and does not qualify.
- A4: Dependency manifest (pyproject.toml:1, sha256:b4181f59f23f)
- A4: Dependency lockfile (uv.lock:1, sha256:04e02a427144)
- A4: Dependency update config (.github/dependabot.yml:1, sha256:92725ac5b657)
- A5: Insufficient data — no measurable signal supplied or collected; excluded from composite (unmeasured, not inapplicable).
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/add-to-project.yml:1, sha256:74f130b855a5)
- B2: Pull-request CI workflow (.github/workflows/build-docs.yml:1, sha256:388a7d1eb471)
- B2: Pull-request CI workflow (.github/workflows/contributors.yml:1, sha256:7d91c15909bf)
- B2: Pull-request CI workflow (.github/workflows/add-to-project.yml:1, sha256:74f130b855a5) (warning)
- B3: CI workflow (.github/workflows/add-to-project.yml:1, sha256:74f130b855a5)
- B3: CI workflow (.github/workflows/add-to-project.yml:1, sha256:74f130b855a5) (warning)
- B4: Audit or changelog artifact (CITATION.cff:1, sha256:8feb5e554875)
- B4: Audit or changelog artifact (docs/de/docs/advanced/security/http-basic-auth.md:1, sha256:a1c453720a1d)
- B4: Audit or changelog artifact (docs/de/docs/advanced/security/index.md:1, sha256:f86483015af3)
- B4: Audit or changelog artifact (docs/de/docs/advanced/security/oauth2-scopes.md:1, sha256:304c2794044f)
- B4: Audit or changelog artifact (docs/de/docs/tutorial/security/first-steps.md:1, sha256:d88a5eb95f14)
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- B2 warning: B2 metric-derived score is 3.2/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Pull-request CI workflow (.github/workflows/add-to-project.yml:1, sha256:74f130b855a5))
- B3 warning: B3 metric-derived score is 2.7/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (CI workflow (.github/workflows/add-to-project.yml:1, sha256:74f130b855a5))
