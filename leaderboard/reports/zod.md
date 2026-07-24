# Cejel Trust Report - zod

- Product: zod
- Rubric: witan-rubric-v9-2026-07-22
- Generated: 2026-07-22T20:52:22.603Z
- Repository: https://github.com/colinhacks/zod @ 912f0f51b0ced654d0069741e7160834dca742ee

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.5 | verified | Test-to-source file ratio: 172/224 ratio; Static coverage percentage: 0/100 percent; Verification script ratio: 4 ratio (capped; 6 raw); Non-hollow test share: 160/170 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | 3.6 | verified | Secret cleanliness: 1/1 clean; Environment handling depth: 2/3 practices |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 3.1 | warning | Declared version range ratio: 94/96 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 0/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | N/A | not_applicable | N/A |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 3.2 | warning | PR trace primitive coverage: 2 signals (capped; 6 raw); Recent PR merge ratio: 0/1 ratio |
| B3 | CI and QA discipline | Process trust | 3.5 | verified | CI verification depth: 4/4 signals; PR-gate CI workflow count: 3/4 workflows |
| B4 | Audit trail and report-up completeness | Process trust | 2.9 | verified | Audit artifact depth: 2/3 files; Audit freshness depth: 2/2 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 3.1/4.0
- Process trust: 3.2/4.0
- Overall: 3.2/4.0
- Measured coverage: code trust 3/5, process trust 3/6, overall 6/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: A3, A5, B1, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (packages/docs/content/api.test.ts:1, sha256:e8a097b1503a)
- A1: Detected test file (packages/resolution/attw.test.ts:1, sha256:b57403796b44)
- A1: Detected test file (packages/zod/src/v3/tests/Mocker.ts:1, sha256:b7732bb15ed6)
- A1: Detected test file (packages/zod/src/v3/tests/all-errors.test.ts:1, sha256:ac1e032526bd)
- A1: Detected test file (packages/zod/src/v3/tests/anyunknown.test.ts:1, sha256:fac8ebb9d300)
- A1: Detected test file (packages/zod/src/v3/tests/array.test.ts:1, sha256:e7d3813182c5)
- A1: Detected test file (packages/zod/src/v3/tests/async-parsing.test.ts:1, sha256:45f829362cc9)
- A1: Detected test file (packages/zod/src/v3/tests/async-refinements.test.ts:1, sha256:cfd675222367)
- A1: Configured test runner (packages/docs/vitest.config.ts:1, sha256:8fc5dec98e5e)
- A1: Configured test runner (packages/resolution/vitest.config.ts:1, sha256:6469722039db)
- A1: Configured test runner (packages/zod/vitest.config.ts:1, sha256:49c9e26afb17)
- A1: Configured test runner (vitest.config.ts:1, sha256:04a55003ffaa)
- A1: Configured test runner (package.json:1, sha256:8b65378dc0f7)
- A1: CI workflow runs the test suite (.github/workflows/release.yml:1, sha256:f2da754e222e)
- A1: Detected test file (packages/docs/content/api.test.ts:1, sha256:e8a097b1503a) (info)
- A2: .env files are gitignored (.gitignore:1, sha256:adc6897846fd)
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). A Dockerfile without an explicit runtime start/service command is ambiguous and does not qualify.
- A4: Dependency manifest (package.json:1, sha256:8b65378dc0f7)
- A4: Dependency lockfile (packages/docs/pnpm-lock.yaml:1, sha256:819481715eef)
- A4: Dependency manifest (package.json:1, sha256:8b65378dc0f7) (warning)
- A5: N/A — No README or docs found — nothing is claimed about this repo, so there is nothing for A5 to reconcile against.
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/claude-code-review.yml:1, sha256:4c568b40f09b)
- B2: Pull-request CI workflow (.github/workflows/claude.yml:1, sha256:887e633ee5cb)
- B2: Pull-request CI workflow (.github/workflows/pullfrog.yml:1, sha256:238dd53690ea)
- B2: Pull-request CI workflow (.github/workflows/claude-code-review.yml:1, sha256:4c568b40f09b) (warning)
- B3: Test script (package.json:1, sha256:8b65378dc0f7)
- B3: Lint script (package.json:1, sha256:8b65378dc0f7)
- B3: CI workflow (.github/workflows/claude-code-review.yml:1, sha256:4c568b40f09b)
- B4: Audit or changelog artifact (SECURITY.md:1, sha256:246450874a5d)
- B4: Audit or changelog artifact (packages/docs-v3/CHANGELOG.md:1, sha256:491c8ddc14fc)
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A1 info: Test suite files are present, but no coverage configuration was detected. (Detected test file (packages/docs/content/api.test.ts:1, sha256:e8a097b1503a))
- A4 warning: A4 metric-derived score is 3.1/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Dependency manifest (package.json:1, sha256:8b65378dc0f7))
- B2 warning: B2 metric-derived score is 3.2/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Pull-request CI workflow (.github/workflows/claude-code-review.yml:1, sha256:4c568b40f09b))
