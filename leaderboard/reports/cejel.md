# Cejel Trust Report - cejel

- Product: cejel
- Rubric: witan-rubric-v9-2026-07-22
- Generated: 2026-07-22T20:52:22.603Z
- Repository: https://github.com/BargLabs/cejel @ 0be03171c810023c65806d87f25ee4873a377cea

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.0 | verified | Test-to-source file ratio: 20/27 ratio; Static coverage percentage: 0/100 percent; Verification script ratio: 2/4 ratio; Non-hollow test share: 20/20 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | 3.3 | warning | Secret cleanliness: 1/1 clean; Environment handling depth: 1/3 practices; Crypto comparison hygiene: 1/1 clean |
| A3 | Production readiness | Code trust | 2.3 | warning | Production-readiness primitive coverage: 3/6 primitives; Production workflow depth: 6/6 signals; Observability depth: 4 signals (capped; 7 raw); Rollback and migration-safety depth: 0/4 signals |
| A4 | Dependency hygiene | Code trust | 1.8 | warning | Pinned dependency ratio: 0/8 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 0/2 ratio |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.2 | warning | Claim match rate: 12/13 ratio; Claim source depth: 1/4 docs; Reconciliation artifact depth: 0/3 artifacts |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | warning | PR trace primitive coverage: 2 signals (capped; 4 raw); Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 2.4 | verified | CI verification depth: 4/4 signals; PR-gate CI workflow count: 1/4 workflows |
| B4 | Audit trail and report-up completeness | Process trust | N/A | not_applicable | N/A |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | 3.3 | verified | Human gate documented: 1/1 present; Fail-closed privilege check present: 1/1 present; Privilege-escalation cleanliness: 1/1 clean; Protected-path review gate: 0/1 present |

## Summary Scores

- Code trust: 2.3/4.0
- Process trust: 3.2/4.0
- Overall: 2.8/4.0
- Measured coverage: code trust 5/5, process trust 3/6, overall 8/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: B1, B4, B5 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (src/__tests__/index.test.ts:1, sha256:32fc957d514d)
- A1: Detected test file (src/__tests__/mcp-scan-parity.test.ts:1, sha256:34b3efdfe7b2)
- A1: Detected test file (src/__tests__/offline-guarantee.test.ts:1, sha256:803f3b84f346)
- A1: Detected test file (src/__tests__/product-identity.test.ts:1, sha256:8a8ce5c1aada)
- A1: Detected test file (src/__tests__/publish-installable.test.ts:1, sha256:8379557a0d39)
- A1: Detected test file (src/__tests__/summary.test.ts:1, sha256:de47e2cae9da)
- A1: Detected test file (src/__tests__/terminal.test.ts:1, sha256:d16d09ff7e09)
- A1: Detected test file (src/witan/__tests__/attestation.test.ts:1, sha256:4e18dabfae27)
- A1: Configured test runner (package.json:1, sha256:c1c359ec5669)
- A1: CI workflow runs the test suite (.github/workflows/ci.yml:1, sha256:f9d89e4c65a1)
- A1: Detected test file (src/__tests__/index.test.ts:1, sha256:32fc957d514d) (info)
- A2: DB client import (src/witan/__tests__/repo-signals.test.ts:1, sha256:213989426f8b)
- A2: Constant-time secret/HMAC comparison (src/witan/repo-signals.ts:1, sha256:383f202763dd)
- A2: Non-constant-time secret comparison (src/witan/__tests__/lua-rubric-refinements.test.ts:272, sha256:c5ab7388c834) (info)
- A2: DB client import (src/witan/__tests__/repo-signals.test.ts:1, sha256:213989426f8b) (warning)
- A3: Build or typecheck script (package.json:1, sha256:c1c359ec5669)
- A3: CI workflow (.github/workflows/ci.yml:1, sha256:f9d89e4c65a1)
- A3: Release deploy configuration (vercel.json:1, sha256:1a7f3230d16c)
- A3: Container build configuration (Dockerfile:1, sha256:219ff891874d)
- A3: Build or typecheck script (package.json:1, sha256:c1c359ec5669) (warning)
- A4: Dependency manifest (package.json:1, sha256:c1c359ec5669)
- A4: Dependency lockfile (pnpm-lock.yaml:1, sha256:d0ca1e84d71e)
- A4: Dependency manifest (package.json:1, sha256:c1c359ec5669) (warning)
- A5: Repository claim source (README.md:1, sha256:56ddeb464198)
- A5: Code presence for claim reconciliation (src/http/server.ts:1, sha256:f68a25887561)
- A5: Repository claim source (README.md:1, sha256:56ddeb464198) (warning)
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:f9d89e4c65a1)
- B2: Pull-request CI workflow (.github/workflows/cla.yml:1, sha256:3501cf464dbc)
- B2: Pull-request CI workflow (.github/workflows/publish-distribution.yml:1, sha256:b16f13592b84)
- B2: Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:f9d89e4c65a1) (warning)
- B3: Test script (package.json:1, sha256:c1c359ec5669)
- B3: CI workflow (.github/workflows/ci.yml:1, sha256:f9d89e4c65a1)
- B4: N/A — No audit-trail artifact detected (CHANGELOG/CHANGES/HISTORY/NEWS/SECURITY/AUDIT/STATUS/ release-notes/runbook/provenance file) — B4 not applicable to this repo.
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: Documents privileged operations as human-executed/gated (leaderboard/reports/alfred.md:1, sha256:4f6e2d964969)
- B6: Fail-closed privilege-membership check before role elevation (src/witan/__tests__/repo-signals.test.ts:1, sha256:213989426f8b)

## Findings

- A1 info: Test suite files are present, but no coverage configuration was detected. (Detected test file (src/__tests__/index.test.ts:1, sha256:32fc957d514d))
- A2 info: A secret/HMAC/signature comparison via plain equality appears in a test/fixture file (src/witan/__tests__/lua-rubric-refinements.test.ts) — likely a test assertion, not a production timing leak; verify. (Non-constant-time secret comparison (src/witan/__tests__/lua-rubric-refinements.test.ts:272, sha256:c5ab7388c834))
- A2 warning: A2 metric-derived score is 3.3/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (DB client import (src/witan/__tests__/repo-signals.test.ts:1, sha256:213989426f8b))
- A3 warning: A3 metric-derived score is 2.3/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Build or typecheck script (package.json:1, sha256:c1c359ec5669))
- A4 warning: A4 metric-derived score is 1.8/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Dependency manifest (package.json:1, sha256:c1c359ec5669))
- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (README.md:1, sha256:56ddeb464198))
- B2 warning: B2 metric-derived score is 4.0/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Pull-request CI workflow (.github/workflows/ci.yml:1, sha256:f9d89e4c65a1))
