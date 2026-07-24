# Cejel Trust Report - scorecard

- Product: scorecard
- Rubric: witan-rubric-v9-2026-07-22
- Generated: 2026-07-22T20:52:22.603Z
- Repository: https://github.com/ossf/scorecard @ 916bfc57fa7431467a33a5a013cba3f8a0c1ec50

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 1.9 | verified | Test-to-source file ratio: 16 ratio (capped; 270 raw); Static coverage percentage: 0/100 percent; Verification script ratio: 1/4 ratio; Non-hollow test share: 186/270 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | N/A | not_applicable | N/A |
| A3 | Production readiness | Code trust | 1.8 | warning | Production-readiness primitive coverage: 2/6 primitives; Production workflow depth: 6 signals (capped; 34 raw); Observability depth: 3/4 signals; Rollback and migration-safety depth: 0/4 signals |
| A4 | Dependency hygiene | Code trust | 2.3 | verified | Pinned dependency ratio: 0/822 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 1/2 ratio |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.6 | info | Claim match rate: 12/20 ratio; Claim source depth: 4 docs (capped; 8 raw); Reconciliation artifact depth: 0/3 artifacts |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | warning | PR trace primitive coverage: 2 signals (capped; 16 raw); Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 2.7 | warning | CI verification depth: 1/4 signals; PR-gate CI workflow count: 4 workflows (capped; 10 raw) |
| B4 | Audit trail and report-up completeness | Process trust | N/A | not_applicable | N/A |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | 4.0 | warning | Privilege-escalation cleanliness: 1/1 clean; Protected-path review gate: 1/1 present |

## Summary Scores

- Code trust: 2.2/4.0
- Process trust: 3.6/4.0
- Overall: 2.9/4.0
- Measured coverage: code trust 4/5, process trust 3/6, overall 7/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: A2, B1, B4, B5 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (attestor/command/cli_test.go:1, sha256:8e75726c5f60)
- A1: Detected test file (attestor/policy/attestation_policy_test.go:1, sha256:19eaa945cbbf)
- A1: Detected test file (checker/check_request_test.go:1, sha256:a10638fb8687)
- A1: Detected test file (checker/check_result_test.go:1, sha256:63b3271d70f1)
- A1: Detected test file (checker/client_test.go:1, sha256:aae06114bff9)
- A1: Detected test file (checker/detail_logger_impl_test.go:1, sha256:241c41f2e7b1)
- A1: Detected test file (checker/raw_result_test.go:1, sha256:5631de1e13f8)
- A1: Detected test file (checks/all_checks_test.go:1, sha256:5f18978bddad)
- A1: Configured test runner (Makefile:1, sha256:de7ddc3cf5c3)
- A1: Detected test file (attestor/command/cli_test.go:1, sha256:8e75726c5f60) (info)
- A2: N/A — No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.
- A3: CI workflow (.github/workflows/codeql-analysis.yml:1, sha256:491d592bcf1e)
- A3: Release deploy configuration (cron/k8s/auth.yaml:1, sha256:17c8371d0cd0)
- A3: Container build configuration (Dockerfile:1, sha256:e12b8b4c85f4)
- A3: CI workflow (.github/workflows/codeql-analysis.yml:1, sha256:491d592bcf1e) (warning)
- A4: Dependency manifest (tools/go.mod:1, sha256:64cc61a2ee08)
- A4: Dependency lockfile (go.sum:1, sha256:52c2296d72dd)
- A4: Dependency update config (.github/dependabot.yml:1, sha256:6dedf4004d9a)
- A5: Repository claim source (README.md:1, sha256:8fed8241afd3)
- A5: Code presence for claim reconciliation (cmd/internal/nuget/client.go:1, sha256:04a66196afee)
- A5: Documented limitations / threat model / "not covered" section (docs/osps-baseline-coverage.md:1, sha256:4a6356f1184a)
- A5: Repository claim source (README.md:1, sha256:8fed8241afd3) (info)
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/codeql-analysis.yml:1, sha256:491d592bcf1e)
- B2: Pull-request CI workflow (.github/workflows/depsreview.yml:1, sha256:b5f2fd32e61b)
- B2: Pull-request CI workflow (.github/workflows/docker.yml:1, sha256:83df290e4d6e)
- B2: Pull request template (.github/PULL_REQUEST_TEMPLATE.md:1, sha256:97111f8601a6)
- B2: Review gate configuration (.github/CODEOWNERS:1, sha256:32bebdd16341)
- B2: Pull-request CI workflow (.github/workflows/codeql-analysis.yml:1, sha256:491d592bcf1e) (warning)
- B3: CI workflow (.github/workflows/codeql-analysis.yml:1, sha256:491d592bcf1e)
- B3: CI workflow (.github/workflows/codeql-analysis.yml:1, sha256:491d592bcf1e) (warning)
- B4: N/A — Only a static security-policy artifact (e.g. SECURITY.md) was detected — no committed CHANGELOG/CHANGES/HISTORY/NEWS/AUDIT/STATUS/release-notes/runbook/provenance file to rate for an audit trail. The project may publish release history outside the repository (e.g. GitHub Releases). B4 has no ratable surface here; it is excluded rather than scored.
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: CODEOWNERS/required-review gate on protected paths (.github/CODEOWNERS:1, sha256:32bebdd16341)
- B6: CODEOWNERS/required-review gate on protected paths (.github/CODEOWNERS:1, sha256:32bebdd16341) (warning)

## Findings

- A1 info: Test suite files are present, but no coverage configuration was detected. (Detected test file (attestor/command/cli_test.go:1, sha256:8e75726c5f60))
- A3 warning: A3 metric-derived score is 1.8/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (CI workflow (.github/workflows/codeql-analysis.yml:1, sha256:491d592bcf1e))
- A5 info: Claim source and implementation files are present; no dedicated claim-reality report artifact was supplied, but the repo explicitly documents what it does NOT cover/protect against — honest scoping, not overclaiming. (Repository claim source (README.md:1, sha256:8fed8241afd3))
- B2 warning: B2 metric-derived score is 4.0/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Pull-request CI workflow (.github/workflows/codeql-analysis.yml:1, sha256:491d592bcf1e))
- B3 warning: B3 metric-derived score is 2.7/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (CI workflow (.github/workflows/codeql-analysis.yml:1, sha256:491d592bcf1e))
- B6 warning: B6 metric-derived score is 4.0/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (CODEOWNERS/required-review gate on protected paths (.github/CODEOWNERS:1, sha256:32bebdd16341))
