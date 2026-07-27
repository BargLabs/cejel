# Cejel Trust Report - ripgrep

- Product: ripgrep
- Rubric: witan-rubric-v18-prospective-2026-07-25
- Generated: 2026-07-27T01:44:27.501Z
- Repository: https://github.com/BurntSushi/ripgrep @ d5b85d44057ff729a89be9c6549958c45d95aa99

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 0.9 | warning | Test-to-source file ratio: 15/59 ratio; Static coverage percentage: 0/100 percent; Verification script ratio: 0/4 ratio; Non-hollow test share: 10/10 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | N/A | not_applicable | N/A |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 3.1 | warning | Declared version range ratio: 67/67 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 0/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.2 | warning | Claim match rate: 12/13 ratio; Claim source depth: 1/4 docs; Reconciliation artifact depth: 0/3 artifacts |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 3.2 | warning | PR trace primitive coverage: 2/2 signals; Recent PR merge ratio: 0/1 ratio |
| B3 | CI and QA discipline | Process trust | 1.0 | verified | CI verification depth: 1/4 signals; PR-gate CI workflow count: 1/4 workflows |
| B4 | Audit trail and report-up completeness | Process trust | 1.9 | verified | Audit artifact depth: 1/3 files; Audit freshness depth: 1/1 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 2.1/4.0
- Process trust: 2.0/4.0
- Overall: 2.1/4.0
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
- A1: Detected test file (crates/ignore/tests/gitignore_matched_path_or_any_parents_tests.rs:1, sha256:1a38fdb4ba4b) (warning)
- A2: N/A — No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). A Dockerfile without an explicit runtime start/service command is ambiguous and does not qualify.
- A4: Dependency manifest (Cargo.toml:1, sha256:90d447c5a856)
- A4: Dependency lockfile (Cargo.lock:1, sha256:7d0fc6b67466)
- A4: Dependency manifest (Cargo.toml:1, sha256:90d447c5a856) (warning)
- A5: Repository claim source (README.md:1, sha256:a69c389a49ae)
- A5: Code presence for claim reconciliation (crates/cli/src/decompress.rs:1, sha256:eaceb58ab4c6)
- A5: Repository claim source (README.md:1, sha256:a69c389a49ae) (warning)
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:1c75224e8d94)
- B2: Pull-request CI workflow (.github/workflows/release.yml:1, sha256:190aea818537)
- B2: Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:1c75224e8d94) (warning)
- B3: CI workflow (.github/workflows/ci.yml:1, sha256:1c75224e8d94)
- B4: Audit or changelog artifact (CHANGELOG.md:1, sha256:ec63f4787167)
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A1 finding severity warning (dimension band warning): A1 dimension band is warning at 0.9/4.0. Lowest contributing measurements: Static coverage percentage 0/100 percent; Verification script ratio 0/4 ratio. To improve: configure coverage and publish a measured threshold or report; add explicit test, lint, and typecheck verification commands. (Detected test file (crates/ignore/tests/gitignore_matched_path_or_any_parents_tests.rs:1, sha256:1a38fdb4ba4b))
- A4 finding severity warning (dimension band warning): A4 dimension band is warning at 3.1/4.0. Lowest contributing measurements: Dependency automation ratio 0/2 ratio; Declared version range ratio 67/67 ratio. To improve: enable automated dependency updates and an audit command; declare an explicit compatible version for every dependency. (Dependency manifest (Cargo.toml:1, sha256:90d447c5a856))
- A5 finding severity warning (dimension band warning): Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (README.md:1, sha256:a69c389a49ae))
- B2 finding severity warning (dimension band warning): B2 dimension band is warning at 3.2/4.0. Lowest contributing measurements: Recent PR merge ratio 0/1 ratio; PR trace primitive coverage 2/2 signals. To improve: preserve merged pull-request history in the scanned clone; add pull-request templates and outcome-trace records. (Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:1c75224e8d94))
