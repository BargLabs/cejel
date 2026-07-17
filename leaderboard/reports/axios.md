# Cejel Trust Report - axios

- Product: axios
- Rubric: witan-rubric-v3-2026-07-13
- Generated: 2026-07-16T03:09:48.024Z
- Repository: https://github.com/axios/axios @ 7a6615e421578081743161eab032d009dc6583a4

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.8 | info | Test-to-source file ratio: 142 ratio (cap 66); Static coverage percentage: 0/100 percent; Verification script ratio: 5 ratio (cap 4); Non-hollow test share: 124/129 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | 3.6 | verified | Secret cleanliness: 1/1 clean; Environment handling depth: 2/3 practices |
| A3 | Production readiness | Code trust | 1.8 | warning | Production-readiness primitive coverage: 2/6 primitives; Production workflow depth: 8 signals (cap 6); Observability depth: 3 signals (cap 4); Rollback and migration-safety depth: 0 signals (cap 4) |
| A4 | Dependency hygiene | Code trust | 2.5 | info | Pinned dependency ratio: 10/62 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 1/2 ratio |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.4 | warning | Claim match rate: 12/14 ratio; Claim source depth: 2 docs (cap 4); Reconciliation artifact depth: 0/3 artifacts |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | verified | PR trace primitive coverage: 10 signals (cap 2); Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 4.0 | verified | CI verification depth: 4 signals (cap 4); PR-gate CI workflow count: 5 workflows (cap 4) |
| B4 | Audit trail and report-up completeness | Process trust | 3.6 | verified | Audit artifact depth: 6 files (cap 3); Audit freshness depth: 3/6 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | 4.0 | verified | Privilege-escalation cleanliness: 1/1 clean; Protected-path review gate: 1/1 present |

## Summary Scores

- Code trust: 2.6/4.0
- Process trust: 3.9/4.0
- Overall: 3.3/4.0
- Measured coverage: code trust 5/5, process trust 4/6, overall 9/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: B1, B5 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (tests/browser/adapter.browser.test.js:1, sha256:11b993b6139f)
- A1: Detected test file (tests/browser/basicAuth.browser.test.js:1, sha256:089fec76e3cb)
- A1: Detected test file (tests/browser/cancel.browser.test.js:1, sha256:a14bfc6844f9)
- A1: Detected test file (tests/browser/cancelToken.browser.test.js:1, sha256:f4f816dfb109)
- A1: Detected test file (tests/browser/cookies.browser.test.js:1, sha256:cbfa4456f9d4)
- A1: Detected test file (tests/browser/defaults.browser.test.js:1, sha256:17efcc0afffd)
- A1: Detected test file (tests/browser/formdata.browser.test.js:1, sha256:703b1c9463f4)
- A1: Detected test file (tests/browser/headers.browser.test.js:1, sha256:c54d00b1e16c)
- A1: Configured test runner (tests/module/esm/vitest.config.js:1, sha256:9afd1ffd5a61)
- A1: Configured test runner (tests/smoke/esm/vitest.config.js:1, sha256:08427802701a)
- A1: Configured test runner (vitest.config.js:1, sha256:80edd21efbbb)
- A1: Configured test runner (package.json:1, sha256:b942f4a02b5a)
- A1: CI workflow runs the test suite (.github/workflows/release-branch.yml:1, sha256:c899b2ce5855)
- A1: Detected test file (tests/browser/adapter.browser.test.js:1, sha256:11b993b6139f) (info)
- A2: .env files are gitignored (.gitignore:1, sha256:be03ac88088c)
- A3: Build or typecheck script (package.json:1, sha256:b942f4a02b5a)
- A3: CI workflow (.github/workflows/bundle-size.yml:1, sha256:80cf311e8c1f)
- A3: Build or typecheck script (package.json:1, sha256:b942f4a02b5a) (warning)
- A4: Dependency manifest (package.json:1, sha256:b942f4a02b5a)
- A4: Dependency lockfile (docs/package-lock.json:1, sha256:84bfabe293bc)
- A4: Dependency update config (.github/dependabot.yml:1, sha256:98ca74a41ffe)
- A5: Repository claim source (README.md:1, sha256:383efd90571f)
- A5: Code presence for claim reconciliation (lib/adapters/adapters.js:1, sha256:2d3df4993726)
- A5: Documented limitations / threat model / "not covered" section (SECURITY.md:1, sha256:f5b7cdb1fe81)
- A5: Repository claim source (README.md:1, sha256:383efd90571f) (info)
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/bundle-size.yml:1, sha256:80cf311e8c1f)
- B2: Pull-request CI workflow (.github/workflows/lockfile-lint.yml:1, sha256:e4cb9d0ee2bf)
- B2: Pull-request CI workflow (.github/workflows/moderator.yml:1, sha256:341dacba05b6)
- B2: Pull request template (.github/PULL_REQUEST_TEMPLATE.md:1, sha256:e313b5da52c6)
- B2: Review gate configuration (.github/CODEOWNERS:1, sha256:c899dce56703)
- B3: Test script (package.json:1, sha256:b942f4a02b5a)
- B3: Lint script (package.json:1, sha256:b942f4a02b5a)
- B3: CI workflow (.github/workflows/bundle-size.yml:1, sha256:80cf311e8c1f)
- B4: Audit or changelog artifact (CHANGELOG.md:1, sha256:0012d63016b8)
- B4: Audit or changelog artifact (SECURITY.md:1, sha256:f5b7cdb1fe81)
- B4: Audit or changelog artifact (docs/es/pages/misc/security.md:1, sha256:92459ca06ce7)
- B4: Audit or changelog artifact (docs/fr/pages/misc/security.md:1, sha256:0e5e849be7d3)
- B4: Audit or changelog artifact (docs/pages/misc/security.md:1, sha256:156a85ca8b6b)
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: CODEOWNERS/required-review gate on protected paths (.github/CODEOWNERS:1, sha256:c899dce56703)

## Findings

- A1 info: Test suite files are present, but no coverage configuration was detected. (Detected test file (tests/browser/adapter.browser.test.js:1, sha256:11b993b6139f))
- A3 warning: A3 metric-derived score is 1.8/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Build or typecheck script (package.json:1, sha256:b942f4a02b5a))
- A5 info: Claim source and implementation files are present; no dedicated claim-reality report artifact was supplied, but the repo explicitly documents what it does NOT cover/protect against — honest scoping, not overclaiming. (Repository claim source (README.md:1, sha256:383efd90571f))
