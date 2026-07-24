# Cejel Trust Report - sinatra

- Product: sinatra
- Rubric: witan-rubric-v9-2026-07-22
- Generated: 2026-07-22T20:52:22.603Z
- Repository: https://github.com/sinatra/sinatra @ 946812bdec8faf6598fed154a8d611ead612b6fd

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 1.8 | warning | Test-to-source file ratio: 53 ratio (capped; 163 raw); Static coverage percentage: 0/100 percent; Verification script ratio: 0/4 ratio; Non-hollow test share: 77/78 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | N/A | not_applicable | N/A |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | no data | insufficient_data | Insufficient data — no measurable signal for this criterion |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.2 | warning | Claim match rate: 12/13 ratio; Claim source depth: 1/4 docs; Reconciliation artifact depth: 0/3 artifacts |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | warning | PR trace primitive coverage: 2 signals (capped; 3 raw); Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 0.6 | warning | CI verification depth: 0/4 signals; PR-gate CI workflow count: 1/4 workflows |
| B4 | Audit trail and report-up completeness | Process trust | 2.5 | verified | Audit artifact depth: 2/3 files; Audit freshness depth: 1/2 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | 4.0 | warning | Privilege-escalation cleanliness: 1/1 clean; Protected-path review gate: 1/1 present |

## Summary Scores

- Code trust: 2.0/4.0
- Process trust: 2.8/4.0
- Overall: 2.4/4.0
- Measured coverage: code trust 2/5, process trust 4/6, overall 6/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Low confidence: fewer than half of the dimensions behind at least one score above were measured. Low coverage — scored on few signals, less certain than the same score measured across more dimensions.
- Not applicable: A2, A3, B1, B5 — substrate-specific criteria excluded from composite (N/A for external code).
- Insufficient data: A4 — no measurable signal for the scorer to read; excluded from composite. Unmeasured, not inapplicable, and not a measured zero.

## Evidence

- A1: Detected test file (rack-protection/spec/lib/rack/protection/authenticity_token_spec.rb:1, sha256:eee1d74a3ff0)
- A1: Detected test file (rack-protection/spec/lib/rack/protection/base_spec.rb:1, sha256:0f86f660571f)
- A1: Detected test file (rack-protection/spec/lib/rack/protection/content_security_policy_spec.rb:1, sha256:a6836f158b55)
- A1: Detected test file (rack-protection/spec/lib/rack/protection/cookie_tossing_spec.rb:1, sha256:27c39fd3a46f)
- A1: Detected test file (rack-protection/spec/lib/rack/protection/escaped_params_spec.rb:1, sha256:ee75320b93ad)
- A1: Detected test file (rack-protection/spec/lib/rack/protection/form_token_spec.rb:1, sha256:b89f75a7d0c1)
- A1: Detected test file (rack-protection/spec/lib/rack/protection/frame_options_spec.rb:1, sha256:55698f06865a)
- A1: Detected test file (rack-protection/spec/lib/rack/protection/host_authorization_spec.rb:1, sha256:3aea586a6342)
- A1: Detected test file (rack-protection/spec/lib/rack/protection/authenticity_token_spec.rb:1, sha256:eee1d74a3ff0) (warning)
- A2: N/A — No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). A Dockerfile without an explicit runtime start/service command is ambiguous and does not qualify.
- A4: Insufficient data — no measurable signal supplied or collected; excluded from composite (unmeasured, not inapplicable).
- A5: Repository claim source (README.md:1, sha256:7c8cdf9819db)
- A5: Code presence for claim reconciliation (lib/sinatra.rb:1, sha256:7c3157fd3ea7)
- A5: Repository claim source (README.md:1, sha256:7c8cdf9819db) (warning)
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/release.yml:1, sha256:cc493a1c4dc2)
- B2: Pull-request CI workflow (.github/workflows/test.yml:1, sha256:99756d90f358)
- B2: Review gate configuration (.github/workflows/CODEOWNERS:1, sha256:682a996b6856)
- B2: Pull-request CI workflow (.github/workflows/release.yml:1, sha256:cc493a1c4dc2) (warning)
- B3: CI workflow (.github/workflows/release.yml:1, sha256:cc493a1c4dc2)
- B3: CI workflow (.github/workflows/release.yml:1, sha256:cc493a1c4dc2) (warning)
- B4: Audit or changelog artifact (CHANGELOG.md:1, sha256:21e2a2928d51)
- B4: Audit or changelog artifact (SECURITY.md:1, sha256:0a317e90d1c1)
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: CODEOWNERS/required-review gate on protected paths (.github/workflows/CODEOWNERS:1, sha256:682a996b6856)
- B6: CODEOWNERS/required-review gate on protected paths (.github/workflows/CODEOWNERS:1, sha256:682a996b6856) (warning)

## Findings

- A1 warning: A1 metric-derived score is 1.8/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Detected test file (rack-protection/spec/lib/rack/protection/authenticity_token_spec.rb:1, sha256:eee1d74a3ff0))
- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (README.md:1, sha256:7c8cdf9819db))
- B2 warning: B2 metric-derived score is 4.0/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Pull-request CI workflow (.github/workflows/release.yml:1, sha256:cc493a1c4dc2))
- B3 warning: B3 metric-derived score is 0.6/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (CI workflow (.github/workflows/release.yml:1, sha256:cc493a1c4dc2))
- B6 warning: B6 metric-derived score is 4.0/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (CODEOWNERS/required-review gate on protected paths (.github/workflows/CODEOWNERS:1, sha256:682a996b6856))
