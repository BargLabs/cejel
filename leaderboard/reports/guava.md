# Cejel Trust Report - guava

- Product: guava
- Rubric: witan-rubric-v3-2026-07-13
- Generated: 2026-07-16T03:09:48.024Z
- Repository: https://github.com/google/guava @ 486837d756e6d48864620e91b0761467e2abe744

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 1.3 | critical | Test-to-source file ratio: 1242 ratio (cap 1805); Static coverage percentage: 0/100 percent; Verification script ratio: 0 ratio (cap 4); Non-hollow test share: 842/1112 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | N/A | not_applicable | N/A |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 1.1 | critical | Declared version range ratio: 0/1 ratio; Dependency automation ratio: 1/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.2 | warning | Claim match rate: 12/13 ratio; Claim source depth: 1 docs (cap 4); Reconciliation artifact depth: 0/3 artifacts |
| B1 | Alfred-internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 3.2 | info | PR trace primitive coverage: 3 signals (cap 2); Recent PR merge ratio: 0/1 ratio |
| B3 | CI and QA discipline | Process trust | 1.1 | critical | CI verification depth: 0 signals (cap 4); PR-gate CI workflow count: 2 workflows (cap 4) |
| B4 | Audit trail and report-up completeness | Process trust | N/A | not_applicable | N/A |
| B5 | Alfred-internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 1.5/4.0
- Process trust: 2.2/4.0
- Overall: 1.9/4.0
- Measured coverage: code trust 3/5, process trust 2/6, overall 5/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Low confidence: fewer than half of the dimensions behind at least one score above were measured. Low coverage — scored on few signals, less certain than the same score measured across more dimensions.
- Not applicable: A2, A3, B1, B4, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (android/guava-testlib/src/com/google/common/collect/testing/MapInterfaceTest.java:1, sha256:d5d43f647dc0)
- A1: Detected test file (android/guava-testlib/src/com/google/common/collect/testing/SortedMapInterfaceTest.java:1, sha256:cfa013c51b72)
- A1: Detected test file (android/guava-testlib/src/com/google/common/collect/testing/google/UnmodifiableCollectionTests.java:1, sha256:2b63c408d81c)
- A1: Detected test file (android/guava-testlib/src/com/google/common/testing/AbstractPackageSanityTests.java:1, sha256:ffcf88f95a11)
- A1: Detected test file (android/guava-testlib/src/com/google/common/util/concurrent/testing/AbstractListenableFutureTest.java:1, sha256:ca10571a864d)
- A1: Detected test file (android/guava-testlib/test/com/google/common/collect/testing/AndroidIncompatible.java:1, sha256:821fc20d378d)
- A1: Detected test file (android/guava-testlib/test/com/google/common/collect/testing/FeatureSpecificTestSuiteBuilderTest.java:1, sha256:182905e8d6a9)
- A1: Detected test file (android/guava-testlib/test/com/google/common/collect/testing/HelpersTest.java:1, sha256:81efd950abb2)
- A1: Detected test file (android/guava-testlib/src/com/google/common/collect/testing/MapInterfaceTest.java:1, sha256:d5d43f647dc0) (info)
- A2: N/A — No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). Dockerfile alone is ambiguous and does not qualify.
- A4: Dependency manifest (android/guava-bom/pom.xml:1, sha256:e636a4e3c748)
- A4: Dependency update config (.github/dependabot.yml:1, sha256:3a90b5dfd045)
- A4: Dependency manifest (android/guava-bom/pom.xml:1, sha256:e636a4e3c748) (critical)
- A5: Repository claim source (README.md:1, sha256:20dc329487f3)
- A5: Code presence for claim reconciliation (android/guava-testlib/src/com/google/common/collect/testing/AbstractCollectionTestSuiteBuilder.java:1, sha256:2e783096169f)
- A5: Repository claim source (README.md:1, sha256:20dc329487f3) (warning)
- B1: N/A — Substrate-specific: an Alfred-internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:0f74c7922fda)
- B2: Pull-request CI workflow (.github/workflows/scorecard.yml:1, sha256:265a949adbc0)
- B2: Pull request template (.github/pull_request_template.md:1, sha256:def6a98ca1c6)
- B3: CI workflow (.github/workflows/ci.yml:1, sha256:0f74c7922fda)
- B3: CI workflow (.github/workflows/ci.yml:1, sha256:0f74c7922fda) (critical)
- B4: N/A — No audit-trail artifact detected (CHANGELOG/CHANGES/HISTORY/NEWS/SECURITY/AUDIT/STATUS/ release-notes/runbook/provenance file) — B4 not applicable to this repo.
- B5: N/A — Substrate-specific: an Alfred-internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A1 info: Test suite files are present, but no coverage configuration was detected. (Detected test file (android/guava-testlib/src/com/google/common/collect/testing/MapInterfaceTest.java:1, sha256:d5d43f647dc0))
- A4 critical: A4 metric-derived score is 1.1/4.0, in the critical band — no single finding drove this; it reflects the combined metric weighting below. (Dependency manifest (android/guava-bom/pom.xml:1, sha256:e636a4e3c748))
- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (README.md:1, sha256:20dc329487f3))
- B3 critical: B3 metric-derived score is 1.1/4.0, in the critical band — no single finding drove this; it reflects the combined metric weighting below. (CI workflow (.github/workflows/ci.yml:1, sha256:0f74c7922fda))
