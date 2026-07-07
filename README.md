# cejel

[![npm version](https://img.shields.io/npm/v/cejel.svg)](https://www.npmjs.com/package/cejel)
[![license: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](./LICENSE)

Cejel (*"SEH-jel"*) — a trust certificate for your codebase.

Free, offline, no-signup CLI that scores the engineering signals that tell you whether to
trust a repo — tests, secrets, isolation, claim-vs-reality, CI/audit discipline — and prints
a trust certificate + badge. Especially valuable when AI wrote a lot of the code: that's
exactly when you can't eyeball trust. Built on a deterministic, no-LLM
scoring core — the free path makes zero network calls and requires no account.

Cejel is not another point scanner competing with the one you already run — it's the open,
portable, offline trust certificate that aggregates them. Pipe in SARIF-compatible output
(MunaTrust, Snyk, Semgrep, CodeQL, Codex) plus OpenSSF Scorecard, and get one shareable
certificate + badge over all of them. See "Aggregate your scanners" below.

> Dogfooded in production. Cejel is run continuously on Barg Labs' own multi-product
> monorepo — the ten-product studio it was built inside — which it currently scores
> 3.1/4.0 ("Conditional"). We score ourselves before asking you to score yourself.

## Usage

Run it with whichever package manager you already have — no install, no signup. All of
these pull the same `cejel` package from the npm registry:

```bash
npx cejel .          # npm
pnpm dlx cejel .     # pnpm
yarn dlx cejel .     # yarn
bunx cejel .         # bun
deno run -A npm:cejel .   # deno
```

Scores the current directory with sensible defaults: no flags, no signup, fully offline.
Prints a concise terminal certificate and writes to `.cejel/`:

- `report.json` — the full structured report
- `certificate.html` — a self-contained HTML certificate (no external assets)
- `badge.json` — a [shields.io endpoint](https://shields.io/badges/endpoint-badge) payload
- `badge.svg` — a static, self-contained trust-score badge
- `summary.json` — a compact digest (score, verdict, top findings)

### Flags

- `<path>` — repo to score (default: current directory)
- `--out-dir <dir>` — where to write report/certificate/badge files (default: `.cejel`)
- `--min-score <n>` — exit non-zero if the overall score is below `n` (0–4); used by the
  GitHub Action's optional threshold gate
- `--ingest <file|glob>` — fold another scanner's output into the score (repeatable). Accepts
  SARIF, OpenSSF Scorecard JSON, or the generic Cejel external-signal shape — format is
  auto-detected. See "Aggregate your scanners" below.
- `--quiet` — suppress the terminal certificate (files are still written)

## Aggregate your scanners

Cejel doesn't compete with your AI-code scanner (MunaTrust, Snyk, Semgrep, CodeQL, Codex,
whatever runs in CI) — it sits on top of it. Feed a scanner's output in with `--ingest` and
Cejel folds those findings into the same rubric-scored, offline trust certificate, with the
contributing tools shown in the certificate and report as provenance:

```bash
npx cejel . --ingest munatrust.sarif --ingest scorecard.json
```

Or drop files in `.cejel/inputs/` and they're picked up automatically, no flag needed:

```bash
mkdir -p .cejel/inputs
cp munatrust-results.sarif .cejel/inputs/
npx cejel .
```

External findings only ever adjust a dimension score *downward*, and by a bounded amount —
they augment the native repo scan, they never replace it. Every ingested file is attributed
by name in `certificate.html`, `report.json` (`consumedSignals`), and the terminal output
("Incorporates findings from: ..."), so the certificate reads as a visible aggregation, not a
black box.

Three ways a scanner's output gets ingested:

1. **SARIF** — any SARIF 2.1.0-emitting tool (Semgrep, CodeQL, most commercial SAST/AI-code
   scanners) works with zero configuration; `--ingest` auto-detects the `runs` array.
2. **OpenSSF Scorecard** — `scorecard --repo=... --format=json > scorecard.json`, then
   `--ingest scorecard.json`; auto-detected by its `checks` array.
3. **Generic JSON** — for a tool that emits neither, map its output into the minimal shape
   below (or write a small adapter mirroring
   [`scorecard-adapter.ts`](../witan/src/scorecard-adapter.ts) if the format needs real
   parsing):

   ```json
   {
     "tool": "my-scanner",
     "signals": [
       {
         "dimension": "A2",
         "weight": 0.7,
         "findings": [
           {
             "ruleId": "hardcoded-secret",
             "severity": "critical",
             "message": "Hardcoded API key detected.",
             "location": "src/config.ts:10"
           }
         ]
       }
     ]
   }
   ```

   `dimension` is one of the Witan rubric criterion ids (`A1`-`A5`, `B1`-`B6`); `weight`
   (0–1, default `0.5`) bounds how much this signal can move that dimension; `severity` is
   `critical` | `warning` | `info`; `location` is optional.

## Displaying the trust badge

Endpoint JSON (host `badge.json` anywhere static — a repo file, a gist, GitHub Pages — and
point shields.io at it):

```markdown
![Cejel trust score](https://img.shields.io/endpoint?url=<url-to-your-hosted-badge.json>)
```

Or commit/link the static SVG directly:

```markdown
![Cejel trust score](./.cejel/badge.svg)
```

## GitHub Action

See [`action/action.yml`](./action/action.yml) — runs Cejel on `push`/`pull_request`,
posts the score + top findings to the job summary, and can optionally fail the check below
a configurable `min-score` threshold. The scoring step makes no network calls and needs no
secrets.

```yaml
- uses: BargLabs/cejel/action@main
  with:
    min-score: '2.5' # optional; omit to never fail the check
```

## What "offline" means here

Scoring a repo — `npx cejel .` itself, and the Action's scoring step — makes zero network
calls: no telemetry, no signup, no model call. Fetching the `cejel` package the first time
(like any npm-distributed CLI, including this Action's own dependency install) does need
network; that's a one-time install cost, not part of the scoring guarantee.

## License

`cejel` is free and licensed under [AGPL-3.0-only](./LICENSE), copyleft: any modified
version you distribute or run as a network service must also make its source available
under the same terms. A commercial license is available for teams that need to use or
modify `cejel` without those copyleft obligations.
