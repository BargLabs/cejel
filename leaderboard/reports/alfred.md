# Cejel Trust Report - alfred

- Product: alfred
- Rubric: witan-rubric-v2-2026-07-12
- Generated: 2026-07-12T18:21:45.694Z
- Repository: . @ 06b227a4670e8ce985fe24e03362eaeff4813452

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.3 | warning | Test-to-source file ratio: 330 ratio (cap 601); Static coverage percentage: 0/100 percent; Verification script ratio: 4 ratio (cap 4); Non-hollow test share: 327/330 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | 2.4 | warning | Secret cleanliness: 1/1 clean; Environment handling depth: 3/3 practices; RLS policy count: 12 policies (cap 111); Tenant-scoped schema ratio: 37/46 ratio |
| A3 | Production readiness | Code trust | 2.9 | info | Production-readiness primitive coverage: 3/6 primitives; Production workflow depth: 25 signals (cap 6); Observability depth: 81 signals (cap 4); Rollback and migration-safety depth: 75 signals (cap 4) |
| A4 | Dependency hygiene | Code trust | 2.2 | warning | Pinned dependency ratio: 61/208 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 0/2 ratio |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.9 | info | Claim match rate: 0.56/1 ratio; Claim registry depth: 9/9 claims; Reconciliation artifact depth: 3/3 artifacts |
| B1 | Alfred-internal process dimension | Process trust | 4.0 | verified | Alfred-internal process signal depth: 2/2 signals |
| B2 | PR outcome traceability | Process trust | 3.5 | verified | PR trace primitive coverage: 26 signals (cap 2); Recent PR merge ratio: 5/12 ratio |
| B3 | CI and QA discipline | Process trust | 4.0 | verified | CI verification depth: 5 signals (cap 4); PR-gate CI workflow count: 13 workflows (cap 4) |
| B4 | Audit trail and report-up completeness | Process trust | 3.9 | verified | Audit artifact depth: 64 files (cap 3); Audit freshness depth: 56/64 ratio |
| B5 | Alfred-internal process dimension | Process trust | 3.0 | info | Alfred-internal process signal depth: 1/1 traces; Regression fix test-added rate: 0/1 ratio; Learning artifact depth: 3 files (cap 6) |
| B6 | Privileged-operation human gating | Process trust | 3.4 | info | Human gate documented: 1/1 present; Fail-closed privilege check present: 1/1 present; Privilege-escalation cleanliness: 1/1 clean; Protected-path review gate: 1/1 present; Un-overridable kill-switch present: 1/1 present |

## Summary Scores

- Code trust: 2.5/4.0
- Process trust: 3.6/4.0
- Overall: 3.1/4.0
- Measured coverage: code trust 5/5, process trust 6/6, overall 11/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.

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
- A2: Schema-per-studio isolation module and provisioning (path withheld — private repository, sha256:7607894e6224)
- A2: Forced RLS migration and studio policies (path withheld — private repository, sha256:eafff306bfd6)
- A2: Non-owner application role RLS proof (path withheld — private repository, sha256:8740f576e78d)
- A2: Adversarial cross-studio RLS denial proof (path withheld — private repository, sha256:8740f576e78d)
- A2: Adversarial studio data routing denial test (path withheld — private repository, sha256:65c1b7d6dd1f)
- A2: .env files are gitignored (path withheld — private repository, sha256:172e11a7d91f)
- A2: Environment template (path withheld — private repository, sha256:17b9221cd6f9)
- A2: Environment template (path withheld — private repository, sha256:60cae38769ab)
- A2: RLS or tenant migration (path withheld — private repository, sha256:d7e19c638f2e)
- A2: Tenant scoping signal (path withheld — private repository, sha256:d7e19c638f2e)
- A2: Committed secret-shaped value (path withheld — private repository, sha256:d1c23e6f5de5) (info)
- A3: Build or typecheck script (path withheld — private repository, sha256:bf8dd8e2b289)
- A3: CI workflow (path withheld — private repository, sha256:d90a520a3cf7)
- A3: Environment template (path withheld — private repository, sha256:17b9221cd6f9)
- A4: Dependency manifest (path withheld — private repository, sha256:a927e01eac32)
- A4: Dependency lockfile (path withheld — private repository, sha256:6324f0e9d81a)
- A4: Dependency manifest (path withheld — private repository, sha256:a927e01eac32) (warning)
- A5: Claim reality reconciler implementation (path withheld — private repository, sha256:be4a4221eca8)
- A5: Claim reality reconciliation Markdown report (path withheld — private repository, sha256:e23d16fb7574)
- A5: Claim reality reconciliation structured report (path withheld — private repository, sha256:f28bdbe5970d)
- B1: Alfred dispatch log (path withheld — private repository, sha256:c2e08412e501)
- B1: Recent repository commit (sha256:06b227a4670e)
- B2: Pull-request CI workflow (path withheld — private repository, sha256:d90a520a3cf7)
- B2: Pull-request CI workflow (path withheld — private repository, sha256:9ef686a0c67c)
- B2: Pull-request CI workflow (path withheld — private repository, sha256:2c7e83376f38)
- B2: Review gate configuration (path withheld — private repository, sha256:016304abf410)
- B3: Test script (path withheld — private repository, sha256:bf8dd8e2b289)
- B3: Lint script (path withheld — private repository, sha256:bf8dd8e2b289)
- B3: CI workflow (path withheld — private repository, sha256:d90a520a3cf7)
- B4: Audit or changelog artifact (path withheld — private repository, sha256:b71d90871d8b)
- B4: Audit or changelog artifact (path withheld — private repository, sha256:147a234327d2)
- B4: Audit or changelog artifact (path withheld — private repository, sha256:d14484199d1a)
- B4: Audit or changelog artifact (path withheld — private repository, sha256:ef234e3bb333)
- B4: Audit or changelog artifact (path withheld — private repository, sha256:160074df8986)
- B5: Verified internal live proof trace (path withheld — private repository, sha256:aa152abf7d3f)
- B6: Documents privileged operations as human-executed/gated (path withheld — private repository, sha256:ccf577afb9b5)
- B6: Fail-closed privilege-membership check before role elevation (path withheld — private repository, sha256:cd87a11058cc)
- B6: Un-overridable kill-switch / fail-safe governance toggle (path withheld — private repository, sha256:95ea60e45d8d)
- B6: CODEOWNERS/required-review gate on protected paths (path withheld — private repository, sha256:147a234327d2)
- B6: Ungated privilege-escalation statement (path withheld — private repository, sha256:cd87a11058cc) (info)

## Findings

- A1 warning: A scheduled product-health workflow exists, but its results are handed only to an ephemeral, access-gated CI artifact — not a durable, checkable record. (Scheduled product-health workflow (path withheld — private repository, sha256:d94131fc2de3))
- A2 info: Secret-shaped value in a test/fixture file (path withheld — private repository) — likely fixture data, not a production leak; verify. (Committed secret-shaped value (path withheld — private repository, sha256:d1c23e6f5de5))
- A4 warning: A4 metric-derived score is 2.2/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Dependency manifest (path withheld — private repository, sha256:a927e01eac32))
- B6 info: Role-membership GRANT or SUPERUSER escalation statement in a test/fixture file (path withheld — private repository) — likely a test assertion, not a production escalation; verify. (Ungated privilege-escalation statement (path withheld — private repository, sha256:cd87a11058cc))
