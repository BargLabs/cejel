# Cejel Trust Report - automapper

- Product: automapper
- Rubric: witan-rubric-v9-2026-07-22
- Generated: 2026-07-22T20:52:22.603Z
- Repository: https://github.com/AutoMapper/AutoMapper @ dfa6dd587c5854b4beee5934beb39ba6e9569b84

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 1.8 | warning | Test-to-source file ratio: 1 ratio (capped; 420 raw); Static coverage percentage: 0/100 percent; Verification script ratio: 0/4 ratio; Non-hollow test share: 8/8 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | N/A | not_applicable | N/A |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 2.8 | warning | Declared version range ratio: 3/3 ratio; Dependency automation ratio: 0/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | 1.4 | warning | Claim match rate: 1/2 ratio; Claim source depth: 1/4 docs; Reconciliation artifact depth: 0/3 artifacts |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | warning | PR trace primitive coverage: 2 signals (capped; 4 raw); Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 0.6 | warning | CI verification depth: 0/4 signals; PR-gate CI workflow count: 1/4 workflows |
| B4 | Audit trail and report-up completeness | Process trust | N/A | not_applicable | N/A |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 2.0/4.0
- Process trust: 2.3/4.0
- Overall: 2.2/4.0
- Measured coverage: code trust 3/5, process trust 2/6, overall 5/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Low confidence: fewer than half of the dimensions behind at least one score above were measured. Low coverage — scored on few signals, less certain than the same score measured across more dimensions.
- Not applicable: A2, A3, B1, B4, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (src/AutoMapper.DI.Tests/AppDomainResolutionTests.cs:1, sha256:12807653e9cc)
- A1: Detected test file (src/AutoMapper.DI.Tests/AssemblyResolutionTests.cs:1, sha256:3e663e84481c)
- A1: Detected test file (src/AutoMapper.DI.Tests/AttributeTests.cs:1, sha256:e57b467dc1ff)
- A1: Detected test file (src/AutoMapper.DI.Tests/DependencyTests.cs:1, sha256:f2bec804f03e)
- A1: Detected test file (src/AutoMapper.DI.Tests/Integrations/ServiceLifetimeTests.cs:1, sha256:4256a89b3a2a)
- A1: Detected test file (src/AutoMapper.DI.Tests/MultipleRegistrationTests.cs:1, sha256:b9426a4d9d1e)
- A1: Detected test file (src/AutoMapper.DI.Tests/Profiles.cs:1, sha256:9580307a2f49)
- A1: Detected test file (src/AutoMapper.DI.Tests/Properties/AssemblyInfo.cs:1, sha256:ed76d76f0cc0)
- A1: Detected test file (src/AutoMapper.DI.Tests/AppDomainResolutionTests.cs:1, sha256:12807653e9cc) (warning)
- A2: N/A — No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). A Dockerfile without an explicit runtime start/service command is ambiguous and does not qualify.
- A4: Dependency manifest (docs/requirements.txt:1, sha256:ad06f98eae2c)
- A4: Dependency manifest (docs/requirements.txt:1, sha256:ad06f98eae2c) (warning)
- A5: Repository claim source (README.md:1, sha256:f0be14ab178e)
- A5: Code presence for claim reconciliation (docs/source/conf.py:1, sha256:0f5c3ce50fd9)
- A5: Repository claim source (README.md:1, sha256:f0be14ab178e) (warning)
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:2da4ee81ab4d)
- B2: Pull-request CI workflow (.github/workflows/lock.yml:1, sha256:eb25785fd7d3)
- B2: Pull-request CI workflow (.github/workflows/release.yml:1, sha256:527f44911edd)
- B2: Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:2da4ee81ab4d) (warning)
- B3: CI workflow (.github/workflows/ci.yml:1, sha256:2da4ee81ab4d)
- B3: CI workflow (.github/workflows/ci.yml:1, sha256:2da4ee81ab4d) (warning)
- B4: N/A — Only a static security-policy artifact (e.g. SECURITY.md) was detected — no committed CHANGELOG/CHANGES/HISTORY/NEWS/AUDIT/STATUS/release-notes/runbook/provenance file to rate for an audit trail. The project may publish release history outside the repository (e.g. GitHub Releases). B4 has no ratable surface here; it is excluded rather than scored.
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A1 warning: A1 metric-derived score is 1.8/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Detected test file (src/AutoMapper.DI.Tests/AppDomainResolutionTests.cs:1, sha256:12807653e9cc))
- A4 warning: A4 metric-derived score is 2.8/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Dependency manifest (docs/requirements.txt:1, sha256:ad06f98eae2c))
- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (README.md:1, sha256:f0be14ab178e))
- B2 warning: B2 metric-derived score is 4.0/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:2da4ee81ab4d))
- B3 warning: B3 metric-derived score is 0.6/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (CI workflow (.github/workflows/ci.yml:1, sha256:2da4ee81ab4d))
