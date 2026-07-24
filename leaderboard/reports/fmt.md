# Cejel Trust Report - fmt

- Product: fmt
- Rubric: witan-rubric-v9-2026-07-22
- Generated: 2026-07-22T20:52:22.603Z
- Repository: https://github.com/fmtlib/fmt @ a79df4504cd4e42ed004b1113fb82171e62ed822

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.3 | verified | Test-to-source file ratio: 4 ratio (capped; 55 raw); Static coverage percentage: 0/100 percent; Verification script ratio: 2/4 ratio; Non-hollow test share: 29/29 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | N/A | not_applicable | N/A |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 1.6 | verified | Declared version range ratio: 1/4 ratio; Dependency automation ratio: 1/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.2 | warning | Claim match rate: 12/13 ratio; Claim source depth: 1/4 docs; Reconciliation artifact depth: 0/3 artifacts |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 3.2 | warning | PR trace primitive coverage: 2 signals (capped; 11 raw); Recent PR merge ratio: 0/1 ratio |
| B3 | CI and QA discipline | Process trust | 3.1 | verified | CI verification depth: 2/4 signals; PR-gate CI workflow count: 4 workflows (capped; 8 raw) |
| B4 | Audit trail and report-up completeness | Process trust | 2.5 | verified | Audit artifact depth: 2/3 files; Audit freshness depth: 1/2 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | 4.0 | warning | Privilege-escalation cleanliness: 1/1 clean; Protected-path review gate: 1/1 present |

## Summary Scores

- Code trust: 2.0/4.0
- Process trust: 3.2/4.0
- Overall: 2.6/4.0
- Measured coverage: code trust 3/5, process trust 4/6, overall 7/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: A2, A3, B1, B5 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (test/add-subdirectory-test/main.cc:1, sha256:400f01bbe88c)
- A1: Detected test file (test/args-test.cc:1, sha256:7f66f365eab1)
- A1: Detected test file (test/assert-test.cc:1, sha256:b5c1ce1f68a2)
- A1: Detected test file (test/base-test.cc:1, sha256:78f726cc38f5)
- A1: Detected test file (test/c-test.c:1, sha256:1da68512e63d)
- A1: Detected test file (test/chrono-test.cc:1, sha256:64b8408d67a5)
- A1: Detected test file (test/color-test.cc:1, sha256:978d8c89099f)
- A1: Detected test file (test/compile-test.cc:1, sha256:d561506df50a)
- A1: Configured test runner (CMakeLists.txt:1, sha256:a5f0dc122b68)
- A1: CI workflow runs the test suite (.github/workflows/linux.yml:1, sha256:a9f998199231)
- A1: Detected test file (test/add-subdirectory-test/main.cc:1, sha256:400f01bbe88c) (info)
- A2: N/A — No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). A Dockerfile without an explicit runtime start/service command is ambiguous and does not qualify.
- A4: Dependency manifest (test/cuda-test/CMakeLists.txt:1, sha256:ab9624b5a25e)
- A4: Dependency update config (.github/dependabot.yml:1, sha256:496e2016d5fc)
- A5: Repository claim source (README.md:1, sha256:26b23c0cda15)
- A5: Code presence for claim reconciliation (include/fmt/args.h:1, sha256:ce9705a22f68)
- A5: Repository claim source (README.md:1, sha256:26b23c0cda15) (warning)
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/codeql.yml:1, sha256:252ba92b5c3e)
- B2: Pull-request CI workflow (.github/workflows/doc.yml:1, sha256:1ec8a39044dc)
- B2: Pull-request CI workflow (.github/workflows/fuzz.yml:1, sha256:1962b83eb499)
- B2: Pull request template (.github/pull_request_template.md:1, sha256:4547e593fddf)
- B2: Review gate configuration (.github/CODEOWNERS:1, sha256:524103c7d5ec)
- B2: Pull-request CI workflow (.github/workflows/codeql.yml:1, sha256:252ba92b5c3e) (warning)
- B3: CI workflow (.github/workflows/codeql.yml:1, sha256:252ba92b5c3e)
- B4: Audit or changelog artifact (.github/SECURITY.md:1, sha256:d0a63d810fe7)
- B4: Audit or changelog artifact (ChangeLog.md:1, sha256:01791cf67050)
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: CODEOWNERS/required-review gate on protected paths (.github/CODEOWNERS:1, sha256:524103c7d5ec)
- B6: CODEOWNERS/required-review gate on protected paths (.github/CODEOWNERS:1, sha256:524103c7d5ec) (warning)

## Findings

- A1 info: Test suite files are present, but no coverage configuration was detected. (Detected test file (test/add-subdirectory-test/main.cc:1, sha256:400f01bbe88c))
- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (README.md:1, sha256:26b23c0cda15))
- B2 warning: B2 metric-derived score is 3.2/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Pull-request CI workflow (.github/workflows/codeql.yml:1, sha256:252ba92b5c3e))
- B6 warning: B6 metric-derived score is 4.0/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (CODEOWNERS/required-review gate on protected paths (.github/CODEOWNERS:1, sha256:524103c7d5ec))
