# Cejel Trust Report - requests

- Product: requests
- Rubric: witan-rubric-v9-2026-07-22
- Generated: 2026-07-22T20:52:22.603Z
- Repository: https://github.com/psf/requests @ f361ead047be5cb873174218582f7d8b9fcd9f49

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.5 | verified | Test-to-source file ratio: 15/19 ratio; Static coverage percentage: 0/100 percent; Verification script ratio: 4/4 ratio; Non-hollow test share: 8/9 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | N/A | not_applicable | N/A |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 2.6 | verified | Declared version range ratio: 8/12 ratio; Dependency automation ratio: 1/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.2 | warning | Claim match rate: 12/13 ratio; Claim source depth: 1/4 docs; Reconciliation artifact depth: 0/3 artifacts |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | warning | PR trace primitive coverage: 2 signals (capped; 9 raw); Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 2.7 | warning | CI verification depth: 1/4 signals; PR-gate CI workflow count: 4 workflows (capped; 5 raw) |
| B4 | Audit trail and report-up completeness | Process trust | 2.9 | verified | Audit artifact depth: 2/3 files; Audit freshness depth: 2/2 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | 4.0 | warning | Privilege-escalation cleanliness: 1/1 clean; Protected-path review gate: 1/1 present |

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
- A1: Configured test runner (pyproject.toml:1, sha256:345f26b9f691)
- A1: Configured test runner (tox.ini:1, sha256:65aeb46c94fc)
- A1: Coverage configuration (.coveragerc:1, sha256:8ac66b930282)
- A2: N/A — No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). A Dockerfile without an explicit runtime start/service command is ambiguous and does not qualify.
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
- B2: Pull-request CI workflow (.github/workflows/close-issues.yml:1, sha256:3f9ea1ad83af) (warning)
- B3: CI workflow (.github/workflows/close-issues.yml:1, sha256:3f9ea1ad83af)
- B3: CI workflow (.github/workflows/close-issues.yml:1, sha256:3f9ea1ad83af) (warning)
- B4: Audit or changelog artifact (.github/SECURITY.md:1, sha256:4d8f1a61f94c)
- B4: Audit or changelog artifact (HISTORY.md:1, sha256:f779ef32bdb0)
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: CODEOWNERS/required-review gate on protected paths (.github/CODEOWNERS:1, sha256:1231f289a3ee)
- B6: CODEOWNERS/required-review gate on protected paths (.github/CODEOWNERS:1, sha256:1231f289a3ee) (warning)

## Findings

- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (README.md:1, sha256:2a9268c9be5f))
- B2 warning: B2 metric-derived score is 4.0/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Pull-request CI workflow (.github/workflows/close-issues.yml:1, sha256:3f9ea1ad83af))
- B3 warning: B3 metric-derived score is 2.7/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (CI workflow (.github/workflows/close-issues.yml:1, sha256:3f9ea1ad83af))
- B6 warning: B6 metric-derived score is 4.0/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (CODEOWNERS/required-review gate on protected paths (.github/CODEOWNERS:1, sha256:1231f289a3ee))
