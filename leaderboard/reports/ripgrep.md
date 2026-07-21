# Cejel Trust Report - ripgrep

- Product: ripgrep
- Rubric: witan-rubric-v6-2026-07-21
- Generated: 2026-07-21T15:56:38.161Z
- Repository: https://github.com/BurntSushi/ripgrep @ d5b85d44057ff729a89be9c6549958c45d95aa99

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 1.9 | warning | Test-to-source file ratio: 15 ratio (cap 59); Static coverage percentage: 0/100 percent; Verification script ratio: 6 ratio (cap 4); Non-hollow test share: 10/10 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | N/A | not_applicable | N/A |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 3.1 | info | Declared version range ratio: 67/67 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 0/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.2 | warning | Claim match rate: 12/13 ratio; Claim source depth: 1 docs (cap 4); Reconciliation artifact depth: 0/3 artifacts |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 3.2 | info | PR trace primitive coverage: 2 signals (cap 2); Recent PR merge ratio: 0/1 ratio |
| B3 | CI and QA discipline | Process trust | 1.0 | critical | CI verification depth: 1 signals (cap 4); PR-gate CI workflow count: 1 workflows (cap 4) |
| B4 | Audit trail and report-up completeness | Process trust | 1.9 | warning | Audit artifact depth: 1 files (cap 3); Audit freshness depth: 1/1 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 2.4/4.0
- Process trust: 2.0/4.0
- Overall: 2.2/4.0
- Measured coverage: code trust 3/5, process trust 3/6, overall 6/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: A2, A3, B1, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (crates/ignore/tests/gitignore_matched_path_or_any_parents_tests.rs:1, sha256:1a38fdb4ba4b)
- A1: Detected test file (crates/ignore/tests/gitignore_skip_bom.rs:1, sha256:93b70f641a87)
- A1: Detected test file (crates/matcher/tests/test_matcher.rs:1, sha256:daaff26c1359)
- A1: Detected test file (crates/matcher/tests/tests.rs:1, sha256:a6a20ad15557)
- A1: Detected test file (crates/matcher/tests/util.rs:1, sha256:a7dcad0b540d)
- A1: Detected test file (tests/binary.rs:1, sha256:683714aaf5bb)
- A1: Detected test file (tests/feature.rs:1, sha256:fbc6455c5d2c)
- A1: Detected test file (tests/hay.rs:1, sha256:ee8d21ddd6f0)
- A1: Configured test runner (Cargo.toml:1, sha256:90d447c5a856)
- A1: Configured test runner (crates/cli/Cargo.toml:1, sha256:b24e07295063)
- A1: Configured test runner (crates/globset/Cargo.toml:1, sha256:f547f7255d0c)
- A1: Configured test runner (crates/grep/Cargo.toml:1, sha256:6c23af13f11a)
- A1: Configured test runner (crates/ignore/Cargo.toml:1, sha256:41f63736841a)
- A1: Configured test runner (crates/matcher/Cargo.toml:1, sha256:366590fa8257)
- A1: Detected test file (crates/ignore/tests/gitignore_matched_path_or_any_parents_tests.rs:1, sha256:1a38fdb4ba4b) (info)
- A2: N/A — No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). Dockerfile alone is ambiguous and does not qualify.
- A4: Dependency manifest (Cargo.toml:1, sha256:90d447c5a856)
- A4: Dependency lockfile (Cargo.lock:1, sha256:7d0fc6b67466)
- A5: Repository claim source (README.md:1, sha256:a69c389a49ae)
- A5: Code presence for claim reconciliation (crates/cli/src/decompress.rs:1, sha256:eaceb58ab4c6)
- A5: Repository claim source (README.md:1, sha256:a69c389a49ae) (warning)
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:1c75224e8d94)
- B2: Pull-request CI workflow (.github/workflows/release.yml:1, sha256:190aea818537)
- B3: CI workflow (.github/workflows/ci.yml:1, sha256:1c75224e8d94)
- B3: CI workflow (.github/workflows/ci.yml:1, sha256:1c75224e8d94) (critical)
- B4: Audit or changelog artifact (CHANGELOG.md:1, sha256:ec63f4787167)
- B4: Audit or changelog artifact (CHANGELOG.md:1, sha256:ec63f4787167) (warning)
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A1 info: Test suite files are present, but no coverage configuration was detected. (Detected test file (crates/ignore/tests/gitignore_matched_path_or_any_parents_tests.rs:1, sha256:1a38fdb4ba4b))
- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (README.md:1, sha256:a69c389a49ae))
- B3 critical: B3 metric-derived score is 1.0/4.0, in the critical band — no single finding drove this; it reflects the combined metric weighting below. (CI workflow (.github/workflows/ci.yml:1, sha256:1c75224e8d94))
- B4 warning: B4 metric-derived score is 1.9/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Audit or changelog artifact (CHANGELOG.md:1, sha256:ec63f4787167))
