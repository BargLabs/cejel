# Cejel Trust Report - requests

- Product: requests
- Rubric: witan-rubric-v5-2026-07-18
- Generated: 2026-07-20T04:45:38.019Z
- Repository: https://github.com/psf/requests @ f361ead047be5cb873174218582f7d8b9fcd9f49

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.5 | info | Test-to-source file ratio: 15 ratio (cap 19); Static coverage percentage: 0/100 percent; Verification script ratio: 7 ratio (cap 4); Non-hollow test share: 8/9 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | N/A | not_applicable | N/A |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 2.6 | info | Declared version range ratio: 8/12 ratio; Dependency automation ratio: 1/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.2 | warning | Claim match rate: 12/13 ratio; Claim source depth: 1 docs (cap 4); Reconciliation artifact depth: 0/3 artifacts |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | verified | PR trace primitive coverage: 9 signals (cap 2); Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 2.7 | info | CI verification depth: 1 signals (cap 4); PR-gate CI workflow count: 5 workflows (cap 4) |
| B4 | Audit trail and report-up completeness | Process trust | 2.9 | info | Audit artifact depth: 2 files (cap 3); Audit freshness depth: 2/2 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | 4.0 | verified | Privilege-escalation cleanliness: 1/1 clean; Protected-path review gate: 1/1 present |

## Summary Scores

- Code trust: 2.4/4.0
- Process trust: 3.4/4.0
- Overall: 2.9/4.0
- Measured coverage: code trust 3/5, process trust 4/6, overall 7/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: A2, A3, B1, B5 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (tests/__init__.py:1, sha256:ac7f253daae0)
- A1: Detected test file (tests/compat.py:1, sha256:d58ff5e3167d)
- A1: Detected test file (tests/conftest.py:1, sha256:6d65ffb58251)
- A1: Detected test file (tests/test_adapters.py:1, sha256:102494aa704f)
- A1: Detected test file (tests/test_help.py:1, sha256:1c2ac8ca9f49)
- A1: Detected test file (tests/test_hooks.py:1, sha256:a9e5163f5385)
- A1: Detected test file (tests/test_lowlevel.py:1, sha256:db5fac7340c4)
- A1: Detected test file (tests/test_packages.py:1, sha256:90875423db05)
- A1: Configured test runner (Makefile:1, sha256:c31f5628de71)
- A1: Configured test runner (docs/Makefile:1, sha256:b7a917ab8a0f)
- A1: Configured test runner (tests/certs/expired/Makefile:1, sha256:a33636d6474f)
- A1: Configured test runner (tests/certs/expired/ca/Makefile:1, sha256:09ab0ff83129)
- A1: Configured test runner (tests/certs/expired/server/Makefile:1, sha256:1c8cf9d72554)
- A1: Configured test runner (tests/certs/mtls/Makefile:1, sha256:aa1f5be6bde4)
- A1: Coverage configuration (.coveragerc:1, sha256:8ac66b930282)
- A1: Coverage configuration (pyproject.toml:1, sha256:345f26b9f691)
- A2: N/A — No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). Dockerfile alone is ambiguous and does not qualify.
- A4: Dependency manifest (requirements-dev.txt:1, sha256:aed8622c9a3d)
- A4: Dependency update config (.github/dependabot.yml:1, sha256:d2c9890d77ab)
- A5: Repository claim source (README.md:1, sha256:2a9268c9be5f)
- A5: Code presence for claim reconciliation (src/requests/__init__.py:1, sha256:80534322a1a3)
- A5: Repository claim source (README.md:1, sha256:2a9268c9be5f) (warning)
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/close-issues.yml:1, sha256:3f9ea1ad83af)
- B2: Pull-request CI workflow (.github/workflows/codeql-analysis.yml:1, sha256:50b45a295fad)
- B2: Pull-request CI workflow (.github/workflows/lint.yml:1, sha256:0cb480c5b85a)
- B2: Review gate configuration (.github/CODEOWNERS:1, sha256:1231f289a3ee)
- B3: CI workflow (.github/workflows/close-issues.yml:1, sha256:3f9ea1ad83af)
- B4: Audit or changelog artifact (.github/SECURITY.md:1, sha256:4d8f1a61f94c)
- B4: Audit or changelog artifact (HISTORY.md:1, sha256:f779ef32bdb0)
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: CODEOWNERS/required-review gate on protected paths (.github/CODEOWNERS:1, sha256:1231f289a3ee)

## Findings

- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (README.md:1, sha256:2a9268c9be5f))
