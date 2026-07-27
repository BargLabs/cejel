# Cejel Trust Report - carddemo

- Product: carddemo
- Rubric: witan-rubric-v18-prospective-2026-07-25
- Generated: 2026-07-27T01:44:27.501Z
- Repository: https://github.com/aws-samples/aws-mainframe-modernization-carddemo @ 59cc6c2fd7ebd7ef7925cad552a01a4b8b6e4d5e
- Verdict: Insufficient evidence to certify — No free-core rubric criterion produced a measurable signal. Cejel abstains rather than publish a numeric zero for an entirely unmeasured repository. Source coverage: 9 of 250 source-shaped files (3.6%) are criterion-ratable, below the 20% reviewable-source threshold (329 tracked files in total).

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | no data | insufficient_data | Insufficient data — no measurable signal for this criterion |
| A2 | Data-layer isolation and secrets posture | Code trust | N/A | not_applicable | N/A |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | no data | insufficient_data | Insufficient data — no measurable signal for this criterion |
| A5 | Claim-vs-reality reconciliation | Code trust | no data | insufficient_data | Insufficient data — no measurable signal for this criterion |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | no data | insufficient_data | Insufficient data — no measurable signal for this criterion |
| B3 | CI and QA discipline | Process trust | no data | insufficient_data | Insufficient data — no measurable signal for this criterion |
| B4 | Audit trail and report-up completeness | Process trust | N/A | not_applicable | N/A |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Headline scores: not issued (insufficient evidence).
- Measured coverage: code trust 0/5, process trust 0/6, overall 0/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Low confidence: fewer than half of the dimensions behind at least one score above were measured. Low coverage — scored on few signals, less certain than the same score measured across more dimensions.
- Not applicable: A2, A3, B1, B4, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).
- Insufficient data: A1, A4, A5, B2, B3 — no measurable signal for the scorer to read; excluded from composite. Unmeasured, not inapplicable, and not a measured zero.

_This repo has insufficient measurable evidence to certify. Per-criterion gaps below are not a headline score or verdict on the product._

## Evidence

- A1: Insufficient data — no measurable signal supplied or collected; excluded from composite (unmeasured, not inapplicable).
- A2: N/A — No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). A Dockerfile without an explicit runtime start/service command is ambiguous and does not qualify.
- A4: Insufficient data — no measurable signal supplied or collected; excluded from composite (unmeasured, not inapplicable).
- A5: Insufficient data — no measurable signal supplied or collected; excluded from composite (unmeasured, not inapplicable).
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Insufficient data — no measurable signal supplied or collected; excluded from composite (unmeasured, not inapplicable).
- B3: Insufficient data — no measurable signal supplied or collected; excluded from composite (unmeasured, not inapplicable).
- B4: N/A — No audit-trail artifact detected (CHANGELOG/CHANGES/HISTORY/NEWS/SECURITY/AUDIT/STATUS/ release-notes/runbook/provenance file) — B4 not applicable to this repo.
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- No evidence-backed findings supplied.
