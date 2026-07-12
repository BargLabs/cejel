# Cejel OSS trust leaderboard

- Run date: 2026-07-12T18:21:45.694Z
- Cejel version: cejel@0.1.1 (06b227a4670e)
- Rubric version: witan-rubric-v2-2026-07-12
- Run environment: regenerated for goal_cejel_generalize_homefield_rule_and_rescore_protocol_2026-07-12 (rubric v2 bump)

## How to read this board

- Scores run 0.0-4.0 and come from a deterministic rubric over observable repository signals: tests and CI discipline, secret handling, dependency hygiene, audit trail, and governance.
- Verdict bands: Verified (3.5 and above), Conditional (2.5-3.4), At risk (1.5-2.4), Unverified (below 1.5). Conditional is not bad — many healthy, actively developed repositories land there.
- A score reflects observable engineering signals only. It is not a security guarantee, not an audit, and not a judgment of a project's value or its maintainers.
- A score reflects only its MEASURED dimensions. The Coverage column shows how many dimensions were actually measured per category (e.g. "code 4/5 · process 1/6"): a dimension that is not applicable to the repository, or that had insufficient data to measure, produced no score and is excluded from the composite rather than counted against the repository. Unmeasured is not good — it is unknown. Coverage counts every dimension of the rubric, including the substrate-only ones the comparative ranking excludes.
- Rows where fewer than half of the dimensions behind a score were measured are marked "low confidence": low coverage — scored on few signals, less certain. A 4.0 measured from one dimension is weaker evidence than a 3.5 measured from five. A score measured on few dimensions is weaker evidence than a score measured on many, so low-confidence rows are published under "Unranked — insufficient coverage" below rather than ranked against better-evidenced rows. This rule is coverage-based only and applies identically to internal and external repositories — it never adjusts, bands, or discounts the score itself.
- A repository that scores low on a dimension shows its specific findings in the linked evidence report — the findings are the substance, not the verdict.
- The ranking is apples-to-apples: the Overall and Process trust columns are computed on the common externally-applicable dimension set. Two Alfred-internal process dimensions are excluded for EVERY repository — including the internal ones — so internal repositories are never credited in the ranking for dimensions external repositories cannot have. Each linked evidence report still shows every dimension that applies to that repository.
- The whole corpus is published, sorted by score, including this repository itself. A repository that fails to clone or score appears as a loud ERROR row with the reason — it is never silently dropped, and it is retried on the next run.
- The generator is incremental: a repository with an up-to-date committed evidence report is not re-cloned, so the corpus can grow while every run stays synchronous. Re-scoring everything is a --force flag away.
- Repositories are shallow-cloned read-only to be scored; none of their code is executed.

## Ranking

_Ranked on the common externally-applicable dimension set: substrate-only dimensions are excluded for every repository, internal ones included — see "How to read this board". Rows below the coverage floor are excluded from this table; see "Unranked — insufficient coverage" below — nothing is hidden, only left unordered._

| Rank | Repository | Category | License | Overall | Code trust | Process trust | Coverage | Findings | Verdict | Badge | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | [axios](https://github.com/axios/axios) | library-js | MIT | 3.3 | 2.6 | 3.9 | code 5/5 · process 4/6 | 3 | Conditional | ![cejel badge](reports/axios-badge.svg) | [certificate](reports/axios.html) · [report](reports/axios.md) · [json (machine-readable)](reports/axios.json) |
| 2 | [vite](https://github.com/vitejs/vite) | tooling-build | MIT | 3.3 | 2.6 | 4.0 | code 5/5 · process 3/6 | 2 | Conditional | ![cejel badge](reports/vite-badge.svg) | [certificate](reports/vite.html) · [report](reports/vite.md) · [json (machine-readable)](reports/vite.json) |
| 3 | [pydantic](https://github.com/pydantic/pydantic) | library-python | MIT | 3.2 | 2.9 | 3.5 | code 3/5 · process 3/6 | 1 | Conditional | ![cejel badge](reports/pydantic-badge.svg) | [certificate](reports/pydantic.html) · [report](reports/pydantic.md) · [json (machine-readable)](reports/pydantic.json) |
| 4 | [react](https://github.com/facebook/react) | framework-web | MIT | 3.2 | 2.5 | 3.9 | code 4/5 · process 3/6 | 3 | Conditional | ![cejel badge](reports/react-badge.svg) | [certificate](reports/react.html) · [report](reports/react.md) · [json (machine-readable)](reports/react.json) |
| 5 | [alfred](reports/alfred.md) | internal-substrate | AGPL-3.0-only | 3.1 | 2.5 | 3.7 | code 5/5 · process 6/6 | 4 | Conditional | ![cejel badge](reports/alfred-badge.svg) | [certificate](reports/alfred.html) · [report](reports/alfred.md) · [json (machine-readable)](reports/alfred.json) |
| 6 | [svelte](https://github.com/sveltejs/svelte) | framework-web | MIT | 3.1 | 2.9 | 3.3 | code 4/5 · process 3/6 | 3 | Conditional | ![cejel badge](reports/svelte-badge.svg) | [certificate](reports/svelte.html) · [report](reports/svelte.md) · [json (machine-readable)](reports/svelte.json) |
| 7 | [zod](https://github.com/colinhacks/zod) | library-js | MIT | 3.0 | 2.8 | 3.2 | code 4/5 · process 3/6 | 1 | Conditional | ![cejel badge](reports/zod-badge.svg) | [certificate](reports/zod.html) · [report](reports/zod.md) · [json (machine-readable)](reports/zod.json) |
| 8 | [biomejs](https://github.com/biomejs/biome) | tooling-build | MIT OR Apache-2.0 | 2.9 | 2.8 | 3.0 | code 4/5 · process 4/6 | 3 | Conditional | ![cejel badge](reports/biomejs-badge.svg) | [certificate](reports/biomejs.html) · [report](reports/biomejs.md) · [json (machine-readable)](reports/biomejs.json) |
| 9 | [requests](https://github.com/psf/requests) | library-python | Apache-2.0 | 2.9 | 2.4 | 3.4 | code 3/5 · process 4/6 | 1 | Conditional | ![cejel badge](reports/requests-badge.svg) | [certificate](reports/requests.html) · [report](reports/requests.md) · [json (machine-readable)](reports/requests.json) |
| 10 | [scorecard](https://github.com/ossf/scorecard) | supply-chain-governance | Apache-2.0 | 2.9 | 2.3 | 3.6 | code 4/5 · process 3/6 | 4 | Conditional | ![cejel badge](reports/scorecard-badge.svg) | [certificate](reports/scorecard.html) · [report](reports/scorecard.md) · [json (machine-readable)](reports/scorecard.json) |
| 11 | [vue](https://github.com/vuejs/core) | framework-web | MIT | 2.9 | 2.4 | 3.4 | code 4/5 · process 3/6 | 2 | Conditional | ![cejel badge](reports/vue-badge.svg) | [certificate](reports/vue.html) · [report](reports/vue.md) · [json (machine-readable)](reports/vue.json) |
| 12 | [express](https://github.com/expressjs/express) | framework-node | MIT | 2.8 | 2.6 | 3.0 | code 3/5 · process 3/6 | 3 | Conditional | ![cejel badge](reports/express-badge.svg) | [certificate](reports/express.html) · [report](reports/express.md) · [json (machine-readable)](reports/express.json) |
| 13 | [fastapi](https://github.com/fastapi/fastapi) | framework-python | MIT | 2.8 | 2.5 | 3.2 | code 3/5 · process 3/6 | 2 | Conditional | ![cejel badge](reports/fastapi-badge.svg) | [certificate](reports/fastapi.html) · [report](reports/fastapi.md) · [json (machine-readable)](reports/fastapi.json) |
| 14 | [flask](https://github.com/pallets/flask) | framework-python | BSD-3-Clause | 2.7 | 2.5 | 3.0 | code 4/5 · process 3/6 | 4 | Conditional | ![cejel badge](reports/flask-badge.svg) | [certificate](reports/flask.html) · [report](reports/flask.md) · [json (machine-readable)](reports/flask.json) |
| 15 | [esbuild](https://github.com/evanw/esbuild) | tooling-build | MIT | 2.5 | 2.7 | 2.4 | code 3/5 · process 3/6 | 4 | Conditional | ![cejel badge](reports/esbuild-badge.svg) | [certificate](reports/esbuild.html) · [report](reports/esbuild.md) · [json (machine-readable)](reports/esbuild.json) |

## Unranked — insufficient coverage

_Below the coverage floor: scored on fewer than half of the applicable dimensions, so the score is weaker evidence than a well-covered row. Published in full — same rubric, same numbers — simply not ordered against better-evidenced rows above. See "How to read this board"._

| Repository | Category | License | Overall | Code trust | Process trust | Coverage | Findings | Verdict | Badge | Evidence | Reason |
|---|---|---|---|---|---|---|---|---|---|---|---|
| [cejel](reports/cejel.md) | internal-tool | AGPL-3.0-only | 3.4 | 2.7 | 4.0 | code 4/5 · process 1/6 · **low confidence** | 2 | Conditional | ![cejel badge](reports/cejel-badge.svg) | [certificate](reports/cejel.html) · [report](reports/cejel.md) · [json (machine-readable)](reports/cejel.json) | scored on 5 of 11 dimensions — too few to rank |
| [django](https://github.com/django/django) | framework-python | BSD-3-Clause | 3.2 | 2.6 | 3.8 | code 3/5 · process 2/6 · **low confidence** | 1 | Conditional | ![cejel badge](reports/django-badge.svg) | [certificate](reports/django.html) · [report](reports/django.md) · [json (machine-readable)](reports/django.json) | scored on 5 of 11 dimensions — too few to rank |

## By category

### framework-node

- express — 2.8 (Conditional)

### framework-python

- django — 3.2 (Conditional) — low confidence
- fastapi — 2.8 (Conditional)
- flask — 2.7 (Conditional)

### framework-web

- react — 3.2 (Conditional)
- svelte — 3.1 (Conditional)
- vue — 2.9 (Conditional)

### internal-substrate

- alfred — 3.1 (Conditional)

### internal-tool

- cejel — 3.4 (Conditional) — low confidence

### library-js

- axios — 3.3 (Conditional)
- zod — 3.0 (Conditional)

### library-python

- pydantic — 3.2 (Conditional)
- requests — 2.9 (Conditional)

### supply-chain-governance

- scorecard — 2.9 (Conditional)

### tooling-build

- vite — 3.3 (Conditional)
- biomejs — 2.9 (Conditional)
- esbuild — 2.5 (Conditional)

---

Regenerated in the source monorepo by the leaderboard runner and re-staged here on each public extraction (cloning is the only network step, scoring is deterministic).
