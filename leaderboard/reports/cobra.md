# Cejel Trust Report - cobra

- Product: cobra
- Rubric: witan-rubric-v9-2026-07-22
- Generated: 2026-07-22T20:52:22.603Z
- Repository: https://github.com/spf13/cobra @ adbc8813901bba65827259daa8e22ff94ec1f30e

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.0 | verified | Test-to-source file ratio: 1 ratio (capped; 17 raw); Static coverage percentage: 0/100 percent; Verification script ratio: 1/4 ratio; Non-hollow test share: 16/17 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | N/A | not_applicable | N/A |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 3.2 | verified | Declared version range ratio: 4/5 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 1/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | no data | insufficient_data | Insufficient data — no measurable signal for this criterion |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | warning | PR trace primitive coverage: 2/2 signals; Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 0.6 | warning | CI verification depth: 0/4 signals; PR-gate CI workflow count: 1/4 workflows |
| B4 | Audit trail and report-up completeness | Process trust | N/A | not_applicable | N/A |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 2.6/4.0
- Process trust: 2.3/4.0
- Overall: 2.5/4.0
- Measured coverage: code trust 2/5, process trust 2/6, overall 4/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Low confidence: fewer than half of the dimensions behind at least one score above were measured. Low coverage — scored on few signals, less certain than the same score measured across more dimensions.
- Not applicable: A2, A3, B1, B4, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).
- Insufficient data: A5 — no measurable signal for the scorer to read; excluded from composite. Unmeasured, not inapplicable, and not a measured zero.

## Evidence

- A1: Detected test file (active_help_test.go:1, sha256:7ae9d42bd41c)
- A1: Detected test file (args_test.go:1, sha256:37058f718eb5)
- A1: Detected test file (bash_completionsV2_test.go:1, sha256:3cf7c192417f)
- A1: Detected test file (bash_completions_test.go:1, sha256:7bb8b9de6c45)
- A1: Detected test file (cobra_test.go:1, sha256:bb9a5a989701)
- A1: Detected test file (command_test.go:1, sha256:710a689a1512)
- A1: Detected test file (completions_test.go:1, sha256:3f8a8aabe2d2)
- A1: Detected test file (doc/cmd_test.go:1, sha256:c016acceee91)
- A1: Configured test runner (Makefile:1, sha256:880eb1cbfbfd)
- A1: Detected test file (active_help_test.go:1, sha256:7ae9d42bd41c) (info)
- A2: N/A — No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). A Dockerfile without an explicit runtime start/service command is ambiguous and does not qualify.
- A4: Dependency manifest (go.mod:1, sha256:cc6098fd1118)
- A4: Dependency lockfile (go.sum:1, sha256:e557d41a00d6)
- A4: Dependency update config (.github/dependabot.yml:1, sha256:fce71f1c82f8)
- A5: Insufficient data — no measurable signal supplied or collected; excluded from composite (unmeasured, not inapplicable).
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/labeler.yml:1, sha256:c2ec854c684d)
- B2: Pull-request CI workflow (.github/workflows/test.yml:1, sha256:22b2338c231c)
- B2: Pull-request CI workflow (.github/workflows/labeler.yml:1, sha256:c2ec854c684d) (warning)
- B3: CI workflow (.github/workflows/labeler.yml:1, sha256:c2ec854c684d)
- B3: CI workflow (.github/workflows/labeler.yml:1, sha256:c2ec854c684d) (warning)
- B4: N/A — Only a static security-policy artifact (e.g. SECURITY.md) was detected — no committed CHANGELOG/CHANGES/HISTORY/NEWS/AUDIT/STATUS/release-notes/runbook/provenance file to rate for an audit trail. The project may publish release history outside the repository (e.g. GitHub Releases). B4 has no ratable surface here; it is excluded rather than scored.
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A1 info: Test suite files are present, but no coverage configuration was detected. (Detected test file (active_help_test.go:1, sha256:7ae9d42bd41c))
- B2 warning: B2 metric-derived score is 4.0/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Pull-request CI workflow (.github/workflows/labeler.yml:1, sha256:c2ec854c684d))
- B3 warning: B3 metric-derived score is 0.6/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (CI workflow (.github/workflows/labeler.yml:1, sha256:c2ec854c684d))
