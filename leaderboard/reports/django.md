# Cejel Trust Report - django

- Product: django
- Rubric: witan-rubric-v3-2026-07-13
- Generated: 2026-07-16T03:09:48.024Z
- Repository: https://github.com/django/django @ 65a9f14196c338d70889bd54753370606b3fb4eb

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.8 | info | Test-to-source file ratio: 2036 ratio (cap 1); Static coverage percentage: 0/100 percent; Verification script ratio: 4 ratio (cap 4); Non-hollow test share: 858/875 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | 2.8 | info | Secret cleanliness: 1/1 clean; Environment handling depth: 0/3 practices |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 2.1 | warning | Declared version range ratio: 9/13 ratio; Dependency automation ratio: 0/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | no data | insufficient_data | Insufficient data — no measurable signal for this criterion |
| B1 | Alfred-internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 4.0 | verified | PR trace primitive coverage: 20 signals (cap 2); Recent PR merge ratio: 1/1 ratio |
| B3 | CI and QA discipline | Process trust | 3.6 | verified | CI verification depth: 3 signals (cap 4); PR-gate CI workflow count: 15 workflows (cap 4) |
| B4 | Audit trail and report-up completeness | Process trust | N/A | not_applicable | N/A |
| B5 | Alfred-internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 2.6/4.0
- Process trust: 3.8/4.0
- Overall: 3.2/4.0
- Measured coverage: code trust 3/5, process trust 2/6, overall 5/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Low confidence: fewer than half of the dimensions behind at least one score above were measured. Low coverage — scored on few signals, less certain than the same score measured across more dimensions.
- Not applicable: A3, B1, B4, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).
- Insufficient data: A5 — no measurable signal for the scorer to read; excluded from composite. Unmeasured, not inapplicable, and not a measured zero.

## Evidence

- A1: Detected test file (django/test/__init__.py:1, sha256:5f5d82f7c94a)
- A1: Detected test file (django/test/client.py:1, sha256:04fab2a961cd)
- A1: Detected test file (django/test/html.py:1, sha256:5bdec1f2401e)
- A1: Detected test file (django/test/runner.py:1, sha256:a43abfb53b08)
- A1: Detected test file (django/test/selenium.py:1, sha256:a665939110f6)
- A1: Detected test file (django/test/signals.py:1, sha256:40a6de190da6)
- A1: Detected test file (django/test/testcases.py:1, sha256:1b360268bc91)
- A1: Detected test file (django/test/utils.py:1, sha256:93071067bbf1)
- A1: Configured test runner (docs/Makefile:1, sha256:072b14b4d497)
- A1: Configured test runner (tox.ini:1, sha256:47d70986367b)
- A1: Coverage configuration (pyproject.toml:1, sha256:9442fea5438e)
- A1: Coverage configuration (tests/.coveragerc:1, sha256:7cf47b14a2b7)
- A1: CI workflow runs the test suite (.github/workflows/schedule_tests.yml:1, sha256:f2ab5bab19a1)
- A2: Data layer migration (django/conf/app_template/migrations/__init__.py-tpl)
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). Dockerfile alone is ambiguous and does not qualify.
- A4: Dependency manifest (docs/requirements.txt:1, sha256:aa58469ea781)
- A4: Dependency manifest (docs/requirements.txt:1, sha256:aa58469ea781) (warning)
- A5: Insufficient data — no measurable signal supplied or collected; excluded from composite (unmeasured, not inapplicable).
- B1: N/A — Substrate-specific: an Alfred-internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/benchmark.yml:1, sha256:0458e12b829d)
- B2: Pull-request CI workflow (.github/workflows/check-migrations.yml:1, sha256:2647a7fcd299)
- B2: Pull-request CI workflow (.github/workflows/check_commit_messages.yml:1, sha256:2fe53834db82)
- B2: Pull request template (.github/pull_request_template.md:1, sha256:3c3cc0e20540)
- B3: Test script (package.json:1, sha256:19afbf089af1)
- B3: CI workflow (.github/workflows/benchmark.yml:1, sha256:0458e12b829d)
- B4: N/A — Only a static security-policy artifact (e.g. SECURITY.md) was detected — no committed CHANGELOG/CHANGES/HISTORY/NEWS/AUDIT/STATUS/release-notes/runbook/provenance file to rate for an audit trail. The project may publish release history outside the repository (e.g. GitHub Releases). B4 has no ratable surface here; it is excluded rather than scored.
- B5: N/A — Substrate-specific: an Alfred-internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A4 warning: A4 metric-derived score is 2.1/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Dependency manifest (docs/requirements.txt:1, sha256:aa58469ea781))
