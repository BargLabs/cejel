# Cejel Trust Report - flask

- Product: flask
- Rubric: witan-rubric-v6-2026-07-21
- Generated: 2026-07-21T15:56:38.161Z
- Repository: https://github.com/pallets/flask @ 36e4a824f340fdee7ed50937ba8e7f6bc7d17f81

## Criterion Profile

| ID | Criterion | Category | Score | Status | Measurement signals |
|---|---|---|---:|---|---|
| A1 | Test integrity and regression signal | Code trust | 2.3 | warning | Test-to-source file ratio: 48 ratio (cap 27); Static coverage percentage: 0/100 percent; Verification script ratio: 2 ratio (cap 4); Non-hollow test share: 28/28 ratio |
| A2 | Data-layer isolation and secrets posture | Code trust | 2.4 | warning | Secret cleanliness: 1/1 clean; Environment handling depth: 1/3 practices |
| A3 | Production readiness | Code trust | N/A | not_applicable | N/A |
| A4 | Dependency hygiene | Code trust | 2.9 | info | Declared version range ratio: 27/31 ratio; Lockfile coverage: 1/1 present; Dependency automation ratio: 0/2 ratio; Dependency count sanity: 1/1 sane |
| A5 | Claim-vs-reality reconciliation | Code trust | 2.2 | warning | Claim match rate: 12/13 ratio; Claim source depth: 1 docs (cap 4); Reconciliation artifact depth: 0/3 artifacts |
| B1 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B2 | PR outcome traceability | Process trust | 3.2 | info | PR trace primitive coverage: 6 signals (cap 2); Recent PR merge ratio: 0/1 ratio |
| B3 | CI and QA discipline | Process trust | 2.1 | warning | CI verification depth: 1 signals (cap 4); PR-gate CI workflow count: 3 workflows (cap 4) |
| B4 | Audit trail and report-up completeness | Process trust | 3.7 | verified | Audit artifact depth: 3 files (cap 3); Audit freshness depth: 2/3 ratio |
| B5 | Internal process dimension | Process trust | N/A | not_applicable | N/A |
| B6 | Privileged-operation human gating | Process trust | N/A | not_applicable | N/A |

## Summary Scores

- Code trust: 2.5/4.0
- Process trust: 3.0/4.0
- Overall: 2.8/4.0
- Measured coverage: code trust 4/5, process trust 3/6, overall 7/11 dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.
- Not applicable: A3, B1, B5, B6 — substrate-specific criteria excluded from composite (N/A for external code).

## Evidence

- A1: Detected test file (examples/javascript/tests/conftest.py:1, sha256:aff1ac8ea5b7)
- A1: Detected test file (examples/javascript/tests/test_js_example.py:1, sha256:52a0ce22402b)
- A1: Detected test file (examples/tutorial/tests/conftest.py:1, sha256:2778b7c035d9)
- A1: Detected test file (examples/tutorial/tests/test_auth.py:1, sha256:cbbe178c9980)
- A1: Detected test file (examples/tutorial/tests/test_blog.py:1, sha256:a4c01c486e86)
- A1: Detected test file (examples/tutorial/tests/test_db.py:1, sha256:324baea21b98)
- A1: Detected test file (examples/tutorial/tests/test_factory.py:1, sha256:1906cfed379a)
- A1: Detected test file (tests/conftest.py:1, sha256:f8b008561723)
- A1: Configured test runner (docs/Makefile:1, sha256:8b6587b85960)
- A1: Coverage configuration (examples/celery/pyproject.toml:1, sha256:00d27458e466)
- A1: Coverage configuration (examples/javascript/pyproject.toml:1, sha256:2efeb4bc2175)
- A1: Coverage configuration (examples/tutorial/pyproject.toml:1, sha256:8ea666f85481)
- A1: Coverage configuration (pyproject.toml:1, sha256:b006962b5906)
- A1: Detected test file (examples/javascript/tests/conftest.py:1, sha256:aff1ac8ea5b7) (warning)
- A2: Committed .env file in repository tree (tests/test_apps/.env:1, sha256:3739562018bb)
- A2: .env file (not a template) tracked in git history; no confirmed secret value found (tests/test_apps/.env, sha256:36e4a824f340) (warning)
- A3: N/A — No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). Dockerfile alone is ambiguous and does not qualify.
- A4: Dependency manifest (examples/celery/requirements.txt:1, sha256:96eaefbbd532)
- A4: Dependency lockfile (uv.lock:1, sha256:2c98e34b7d92)
- A5: Repository claim source (README.md:1, sha256:1f2de14735b1)
- A5: Code presence for claim reconciliation (examples/celery/src/task_app/__init__.py:1, sha256:172de995eb07)
- A5: Repository claim source (README.md:1, sha256:1f2de14735b1) (warning)
- B1: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B2: Pull-request CI workflow (.github/workflows/lock.yaml:1, sha256:a1beaa8eb392)
- B2: Pull-request CI workflow (.github/workflows/pre-commit.yaml:1, sha256:6ceaadd5d41f)
- B2: Pull-request CI workflow (.github/workflows/publish.yaml:1, sha256:d6ebee41546c)
- B2: Pull request template (.github/pull_request_template.md:1, sha256:f92d7fa6366d)
- B3: CI workflow (.github/workflows/lock.yaml:1, sha256:a1beaa8eb392)
- B3: CI workflow (.github/workflows/lock.yaml:1, sha256:a1beaa8eb392) (warning)
- B4: Audit or changelog artifact (CHANGES.rst:1, sha256:c850d97d088d)
- B4: Audit or changelog artifact (docs/changes.rst:1, sha256:94c7e3657f87)
- B4: Audit or changelog artifact (docs/web-security.rst:1, sha256:75044a9c1f60)
- B5: N/A — Substrate-specific: an internal process dimension is not applicable to external code.
- B6: N/A — No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or documented human-gate governance) detected in this repo.

## Findings

- A1 warning: A1 metric-derived score is 2.3/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (Detected test file (examples/javascript/tests/conftest.py:1, sha256:aff1ac8ea5b7))
- A2 warning: A non-template .env file was tracked in git history; no secret-shaped value was detected. (.env file (not a template) tracked in git history; no confirmed secret value found (tests/test_apps/.env, sha256:36e4a824f340))
- A5 warning: Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied. (Repository claim source (README.md:1, sha256:1f2de14735b1))
- B3 warning: B3 metric-derived score is 2.1/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below. (CI workflow (.github/workflows/lock.yaml:1, sha256:a1beaa8eb392))
