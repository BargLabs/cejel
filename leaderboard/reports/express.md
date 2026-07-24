# Cejel Trust Report - express

- Product: express
- Rubric: witan-rubric-v9-2026-07-22
- Generated: 2026-07-22T20:52:22.603Z
- Repository: https://github.com/expressjs/express @ ba006766fb964571723138708eacaba0f55759cd

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.3 | verified | Test-to-source file ratio: 7 ratio (capped; 95 raw); Static coverage percentage: 0/100 percent; Verification script ratio: 2/4 ratio; Non-hollow test share: 89/89 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | N/A | not_applicable | N/A |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 3.4 | verified | Declared version range ratio: 44/44 ratio; Dependency automation ratio: 1/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | N/A | not_applicable | N/A |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | warning | PR trace primitive coverage: 2 signals (capped; 4 raw); Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 3.6 | verified | CI verification depth: 3/4 signals; PR-gate CI workflow count: 4/4 workflows |
| B4 | Audit trail and report-up completeness | Process trust | 1.9 | warning | Audit artifact depth: 1/3 files; Audit freshness depth: 1/1 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 2.8/4.0
- Process trust: 3.2/4.0
- Overall: 3.0/4.0
- Measured coverage: code trust 2/5, process trust 3/6, overall 5/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Low confidence: fewer than half of the dimensions behind at least one score above were measured. Low coverage — scored on few signals, less certain than the same score measured across more dimensions.
- Not applicable: A2, A3, A5, B1, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (test/Route.js:1, sha256:4607c2b70f5b)
- A1: Detected test file (test/Router.js:1, sha256:721ffc840d1c)
- A1: Detected test file (test/acceptance/auth.js:1, sha256:788ee64833f7)
- A1: Detected test file (test/acceptance/content-negotiation.js:2, sha256:aeb415791ce1)
- A1: Detected test file (test/acceptance/cookie-sessions.js:2, sha256:65f79320983c)
- A1: Detected test file (test/acceptance/cookies.js:2, sha256:02525d857252)
- A1: Detected test file (test/acceptance/downloads.js:2, sha256:404320d52882)
- A1: Detected test file (test/acceptance/ejs.js:2, sha256:3babd4b53917)
- A1: Configured test runner (package.json:1, sha256:01f5d42cf38c)
- A1: CI workflow runs the test suite (.github/workflows/ci.yml:1, sha256:f50b3232db78)
- A1: Detected test file (test/Route.js:1, sha256:4607c2b70f5b) (info)
- A2: N/A — No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). A Dockerfile without an explicit runtime start/service command is ambiguous and does not qualify.
- A4: Dependency manifest (package.json:1, sha256:01f5d42cf38c)
- A4: Dependency update config (.github/dependabot.yml:1, sha256:af4647d37cf7)
- A5: N/A — No README or docs found — nothing is claimed about this repo, so there is nothing for A5 to reconcile against.
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:f50b3232db78)
- B2: Pull-request CI workflow (.github/workflows/codeql.yml:1, sha256:de0a7a113e14)
- B2: Pull-request CI workflow (.github/workflows/legacy.yml:1, sha256:1d537259a4e6)
- B2: Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:f50b3232db78) (warning)
- B3: Test script (package.json:1, sha256:01f5d42cf38c)
- B3: Lint script (package.json:1, sha256:01f5d42cf38c)
- B3: CI workflow (.github/workflows/ci.yml:1, sha256:f50b3232db78)
- B4: Audit or changelog artifact (History.md:1, sha256:bd9f9bf85316)
- B4: Audit or changelog artifact (History.md:1, sha256:bd9f9bf85316) (warning)
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A1 info: Test suite files are present, but no coverage configuration was detected. (Detected test file (test/Route.js:1, sha256:4607c2b70f5b))
- B2 warning: B2 metric-derived score is 4.0/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:f50b3232db78))
- B4 warning: B4 metric-derived score is 1.9/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Audit or changelog artifact (History.md:1, sha256:bd9f9bf85316))
