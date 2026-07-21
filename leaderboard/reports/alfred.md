# Cejel Trust Report - alfred

- Product: alfred
- Rubric: witan-rubric-v6-2026-07-21
- Generated: 2026-07-21T15:56:38.161Z
- Repository: . @ 707b7b5f322464081836f7aff7aa8da069913281

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.3 | warning | Test-to-source file ratio: 363 ratio (cap 628); Static coverage percentage: 0/100 percent; Verification script ratio: 4 ratio (cap 4); Non-hollow test share: 360/363 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | 1.4 | critical | Secret cleanliness: 0/1 clean; Environment handling depth: 3/3 practices; RLS policy count: 12 policies (cap 111); Tenant-scoped schema ratio: 37/48 ratio |
| A3 | Production readiness | Code trust | 2.9 | info | Production-readiness primitive coverage: 3/6 primitives; Production workflow depth: 26 signals (cap 6); Observability depth: 97 signals (cap 4); Rollback and migration-safety depth: 143 signals (cap 4) |
| A4 | Dependency hygiene | Code trust | 2.2 | warning | Pinned dependency ratio: 61/209 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 0/2 ratio |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.4 | warning | Claim match rate: 12/20 ratio; Claim source depth: 14 docs (cap 4); Reconciliation artifact depth: 0/3 artifacts |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 3.9 | verified | PR trace primitive coverage: 27 signals (cap 2); Recent PR merge ratio: 11/12 ratio |
| B3 | CI and QA discipline | Process trust | 4.0 | verified | CI verification depth: 5 signals (cap 4); PR-gate CI workflow count: 13 workflows (cap 4) |
| B4 | Audit trail and report-up completeness | Process trust | 3.9 | verified | Audit artifact depth: 71 files (cap 3); Audit freshness depth: 63/71 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | 3.4 | info | Human gate documented: 1/1 present; Fail-closed privilege check present: 1/1 present; Privilege-escalation cleanliness: 1/1 clean; Protected-path review gate: 1/1 present; Un-overridable kill-switch present: 1/1 present |

## Summary Scores

- Code trust: 2.2/4.0
- Process trust: 3.8/4.0
- Overall: 3.0/4.0
- Measured coverage: code trust 5/5, process trust 4/6, overall 9/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: B1, B5 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (path withheld — private repository, sha256:4089241dc743)
- A1: Detected test file (path withheld — private repository, sha256:c69ab62efd1c)
- A1: Detected test file (path withheld — private repository, sha256:923de0fe9f61)
- A1: Detected test file (path withheld — private repository, sha256:8155ae18fdad)
- A1: Detected test file (path withheld — private repository, sha256:a2f2a4b5c7d5)
- A1: Detected test file (path withheld — private repository, sha256:8a44073a93d5)
- A1: Detected test file (path withheld — private repository, sha256:bf838e8a54ac)
- A1: Detected test file (path withheld — private repository, sha256:5423edb4ca38)
- A1: Configured test runner (path withheld — private repository, sha256:bb3758e12fb9)
- A1: Coverage configuration (path withheld — private repository, sha256:bb3758e12fb9)
- A1: CI workflow runs the test suite (path withheld — private repository, sha256:d94131fc2de3)
- A1: Scheduled product-health workflow (path withheld — private repository, sha256:d94131fc2de3) (warning)
- A2: .env path detected in git history (path withheld — private repository, sha256:707b7b5f3224)
- A2: .env files are gitignored (path withheld — private repository, sha256:d4879d8a5ea4)
- A2: Environment template (path withheld — private repository, sha256:17b9221cd6f9)
- A2: Environment template (path withheld — private repository, sha256:60cae38769ab)
- A2: RLS or tenant migration (path withheld — private repository, sha256:d7e19c638f2e)
- A2: Tenant scoping signal (path withheld — private repository, sha256:d7e19c638f2e)
- A2: Committed secret-shaped value (path withheld — private repository, sha256:d22617948633) (critical)
- A3: Build or typecheck script (path withheld — private repository, sha256:dbffd60fc946)
- A3: CI workflow (path withheld — private repository, sha256:d90a520a3cf7)
- A3: Environment template (path withheld — private repository, sha256:17b9221cd6f9)
- A4: Dependency manifest (path withheld — private repository, sha256:a927e01eac32)
- A4: Dependency lockfile (path withheld — private repository, sha256:94fe1c37ae24)
- A4: Dependency manifest (path withheld — private repository, sha256:a927e01eac32) (warning)
- A5: Repository claim source (path withheld — private repository, sha256:e2bf98bc4697)
- A5: Code presence for claim reconciliation (path withheld — private repository, sha256:c69ab62efd1c)
- A5: Repository claim source (path withheld — private repository, sha256:e2bf98bc4697) (warning)
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (path withheld — private repository, sha256:d90a520a3cf7)
- B2: Pull-request CI workflow (path withheld — private repository, sha256:93839ac0380b)
- B2: Pull-request CI workflow (path withheld — private repository, sha256:2c7e83376f38)
- B2: Review gate configuration (path withheld — private repository, sha256:016304abf410)
- B3: Test script (path withheld — private repository, sha256:dbffd60fc946)
- B3: Lint script (path withheld — private repository, sha256:dbffd60fc946)
- B3: CI workflow (path withheld — private repository, sha256:d90a520a3cf7)
- B4: Audit or changelog artifact (path withheld — private repository, sha256:b71d90871d8b)
- B4: Audit or changelog artifact (path withheld — private repository, sha256:404aff8bc475)
- B4: Audit or changelog artifact (path withheld — private repository, sha256:d14484199d1a)
- B4: Audit or changelog artifact (path withheld — private repository, sha256:ef234e3bb333)
- B4: Audit or changelog artifact (path withheld — private repository, sha256:160074df8986)
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: Documents privileged operations as human-executed/gated (path withheld — private repository, sha256:430ee9c26d48)
- B6: Fail-closed privilege-membership check before role elevation (path withheld — private repository, sha256:cd87a11058cc)
- B6: Un-overridable kill-switch / fail-safe governance toggle (path withheld — private repository, sha256:95ea60e45d8d)
- B6: CODEOWNERS/required-review gate on protected paths (path withheld — private repository, sha256:404aff8bc475)
- B6: Ungated privilege-escalation statement (path withheld — private repository, sha256:cd87a11058cc) (info)

## Findings

- A1 warning: A scheduled product-health workflow exists, but its results are handed only to an ephemeral, access-gated CI artifact — not a durable, checkable record. (Scheduled product-health workflow (path withheld — private repository, sha256:d94131fc2de3))
- A2 critical: Secret-shaped value appears committed in the scanned repository. (Committed secret-shaped value (path withheld — private repository, sha256:d22617948633))
- A4 warning: A4 metric-derived score is 2.2/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Dependency manifest (path withheld — private repository, sha256:a927e01eac32))
- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (path withheld — private repository, sha256:e2bf98bc4697))
- B6 info: Role-membership GRANT or SUPERUSER escalation statement in a test/fixture file (path withheld — private repository) — likely a test assertion, not a production escalation; verify. (Ungated privilege-escalation statement (path withheld — private repository, sha256:cd87a11058cc))
