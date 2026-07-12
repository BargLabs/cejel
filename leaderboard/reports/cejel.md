# Cejel Trust Report - cejel

- Product: cejel
- Rubric: witan-rubric-v2-2026-07-12
- Generated: 2026-07-12T18:21:45.694Z
- Repository: packages/witan-cli @ 06b227a4670e8ce985fe24e03362eaeff4813452

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.3 | warning | Test-to-source file ratio: 9 ratio (cap 7); Static coverage percentage: 0/100 percent; Verification script ratio: 2 ratio (cap 4); Non-hollow test share: 9/9 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | 3.2 | info | Secret cleanliness: 1/1 clean; Environment handling depth: 1/3 practices |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 3.1 | info | Declared version range ratio: 9/9 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 0/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.2 | warning | Claim match rate: 12/13 ratio; Claim source depth: 1 docs (cap 4); Reconciliation artifact depth: 0/3 artifacts |
| B1 | Alfred-internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | no data | insufficient_data | Insufficient data — no measurable signal for this criterion |
| B3 | CI and QA discipline | Process trust | 4.0 | verified | CI verification depth: 4 signals (cap 4); PR-gate CI workflow count: 13 workflows (cap 4) |
| B4 | Audit trail and report-up completeness | Process trust | N/A | not_applicable | N/A |
| B5 | Alfred-internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 2.7/4.0
- Process trust: 4.0/4.0
- Overall: 3.4/4.0
- Measured coverage: code trust 4/5, process trust 1/6, overall 5/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Low confidence: fewer than half of the dimensions behind at least one score above were measured. Low coverage — scored on few signals, less certain than the same score measured across more dimensions.
- Not applicable: A3, B1, B4, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).
- Insufficient data: B2 — no measurable signal for the scorer to read; excluded from composite. Unmeasured, not inapplicable, and not a measured zero.

## Evidence

- A1: Detected test file (path withheld — private repository, sha256:01be4bf80443)
- A1: Detected test file (path withheld — private repository, sha256:34b3efdfe7b2)
- A1: Detected test file (path withheld — private repository, sha256:803f3b84f346)
- A1: Detected test file (path withheld — private repository, sha256:8a8ce5c1aada)
- A1: Detected test file (path withheld — private repository, sha256:06dc4a1a6765)
- A1: Detected test file (path withheld — private repository, sha256:e1d3bf9be5af)
- A1: Detected test file (path withheld — private repository, sha256:b693b44e18a6)
- A1: Detected test file (path withheld — private repository, sha256:bb53c8337437)
- A1: Configured test runner (path withheld — private repository, sha256:105cb317161b)
- A1: Detected test file (path withheld — private repository, sha256:01be4bf80443) (info)
- A2: .env path detected in git history (path withheld — private repository, sha256:06b227a4670e)
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). Dockerfile alone is ambiguous and does not qualify.
- A4: Dependency manifest (path withheld — private repository, sha256:105cb317161b)
- A4: Dependency lockfile (monorepo root) (path withheld — private repository, sha256:6324f0e9d81a)
- A5: Repository claim source (path withheld — private repository, sha256:9c8eec56bc57)
- A5: Code presence for claim reconciliation (path withheld — private repository, sha256:01be4bf80443)
- A5: Repository claim source (path withheld — private repository, sha256:9c8eec56bc57) (warning)
- B1: N/A — Substrate-specific: an Alfred-internal process dimension is not applicable to external code.
- B2: Insufficient data — no measurable signal supplied or collected; excluded from composite (unmeasured, not inapplicable).
- B3: Test script (path withheld — private repository, sha256:105cb317161b)
- B3: CI workflow (monorepo root) (path withheld — private repository, sha256:d90a520a3cf7)
- B4: N/A — No audit-trail artifact detected (CHANGELOG/CHANGES/HISTORY/NEWS/SECURITY/AUDIT/STATUS/ release-notes/runbook/provenance file) — B4 not applicable to this repo.
- B5: N/A — Substrate-specific: an Alfred-internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A1 info: Test suite files are present, but no coverage configuration was detected. (Detected test file (path withheld — private repository, sha256:01be4bf80443))
- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (path withheld — private repository, sha256:9c8eec56bc57))
