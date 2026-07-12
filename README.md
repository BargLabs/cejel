# cejel

[![release](https://img.shields.io/github/v/release/BargLabs/cejel)](https://github.com/BargLabs/cejel/releases/latest)
[![license: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](./LICENSE)

Cejel (*"SEH-jel"*) — a trust certificate for your codebase.

Free, offline, no-signup CLI that scores the engineering signals that tell you whether to
trust a repo — tests, secrets, isolation, claim-vs-reality, CI/audit discipline — and prints
a trust certificate + badge. Especially valuable when AI wrote a lot of the code: that's
exactly when you can't eyeball trust. Built on a deterministic, no-LLM scoring core — the
free path makes zero network calls and requires no account.

Cejel is not another point scanner competing with the one you already run — it's the open,
portable, offline trust certificate that aggregates them. Pipe in SARIF-compatible output
(MunaTrust, Snyk, Semgrep, CodeQL, Codex) plus OpenSSF Scorecard, and get one shareable
certificate + badge over all of them. See "Aggregate your scanners" below.

> Dogfooded in production. Cejel is run continuously on Barg Labs' own multi-product
> monorepo — the ten-product studio it was built inside — which it currently scores
> 3.1/4.0 ("Conditional"). We score ourselves before asking you to score yourself.

## Install

No account, no key, no signup.

**Single-file binary.** One file. No Node, no npm, no `node_modules`, nothing installed.

```bash
curl -fsSL https://github.com/BargLabs/cejel/releases/latest/download/cejel-$(uname -s)-$(uname -m) -o cejel
chmod +x cejel
./cejel .
```

**Don't take the offline claim on trust — check it.** Turn your network off, then run the
binary. It will score your repository and write you a certificate anyway. That is the whole
product, and you can falsify it in ten seconds:

```bash
# with Wi-Fi off, or:
docker run --rm --network=none -v "$PWD:/w" -w /w -v "$PWD/cejel:/cejel:ro" debian:stable-slim /cejel .
```

**npm.**

```bash
# Coming after the scoped npm package is published:
npx @barglabs/cejel .
```

> **On the name.** The unscoped `cejel` package name is held by the registry and the scoped
> package is prepared as `@barglabs/cejel`. Until that package is published, use the release
> binary above or build from source; we would rather say this than have you copy a command
> that 404s.

**GitHub Action** — score every PR and publish the badge:

```yaml
- uses: BargLabs/cejel/action@v1
  with:
    min-score: "2.5"   # optional: fail the build below this
```

**From source** — it is AGPL and it runs offline, so reading it is rather the point:

```bash
git clone https://github.com/BargLabs/cejel && cd cejel
pnpm install && pnpm build
node dist/index.js .
```

Released binaries: `cejel-Darwin-arm64`, `cejel-Linux-x86_64`. A Homebrew tap and the
remaining architectures are in progress; they are not listed here because they do not exist
yet.

## Usage

```bash
./cejel .
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
./cejel . --ingest munatrust.sarif --ingest scorecard.json
```

Or drop files in `.cejel/inputs/` and they're picked up automatically, no flag needed:

```bash
mkdir -p .cejel/inputs
cp munatrust-results.sarif .cejel/inputs/
./cejel .
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
   [`scorecard-adapter.ts`](./src/witan/scorecard-adapter.ts) if the format needs real
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
- uses: BargLabs/cejel/action@v1
  with:
    min-score: '2.5' # optional; omit to never fail the check
```

## MCP server (for agents)

The same package ships a second bin, `cejel-mcp` — a thin MCP (Model Context Protocol)
server over stdio, so any MCP client (Claude Code, Cowork, Cursor, Codex) can request a
trust certificate as a tool call. It wraps the exact same scan the CLI runs — same scores,
same verdict — and is listed on Smithery via the repo's `smithery.yaml`.

After the npm package is published, add it to an MCP client config:

```json
{
  "mcpServers": {
    "cejel": {
      "command": "npx",
      "args": ["-y", "--package=@barglabs/cejel", "cejel-mcp"]
    }
  }
}
```

The server exposes one tool and two resources:

- `scan` — input `{ path, format? }`; scores the repository at `path` and returns the trust
  cert as JSON (`format: "summary"`, the default, is the compact digest; `format: "json"` is
  the full report, identical to the CLI's `report.json`).
- `cejel://last-scan/certificate.html` and `cejel://last-scan/badge.svg` — the HTML
  certificate and SVG badge for the most recent scan.

Like the CLI, scoring over MCP is fully offline: no network calls, no telemetry, no signup,
and the server writes no files.

## What "offline" means here

Scoring a repo — `cejel .` itself, and the Action's scoring step — makes zero network
calls: no telemetry, no signup, no model call. Fetching the `@barglabs/cejel` package the
first time (like any npm-distributed CLI, including this Action's own dependency install)
does need network; that's a one-time install cost, not part of the scoring guarantee.

## The public leaderboard: what we redact, what we exclude, and where we were wrong

We publish a trust board scoring a corpus of well-known open-source repositories alongside
our own. Running a leaderboard on other people's code obliges us to be exact about how it
works, so here is all of it.

**What we redact, and on what basis.** One rule: *a path is published exactly when you can
check it.* For a public repository, every evidence path and line number is cited in full — a
certificate whose evidence you cannot open is not evidence. For a private repository (ours),
**no source path is cited anywhere, in any field or format**; an unverifiable path tells you
nothing you can check while disclosing our file tree for free. Redaction removes a
**location**, never a **fact**: the finding, its dimension, its status, its score, and its
content hash all survive. Where a path is withheld you will see it said plainly. This is
enforced structurally — the public artifacts are built from filtered data rather than
rendered and then scrubbed — and a build that would emit a private path fails rather than
publishes.

**What we exclude from ranking.** Two of the eleven dimensions — B1 (dispatch trace
completeness) and B5 (verified learning trace) — measure signals that only exist inside the
agent substrate Cejel was built in. No external repository can produce them. They are
therefore **excluded from the ranking for every repository, including ours**: we do not
score you on something you cannot have, and we do not award ourselves points for something
you cannot contest. You will still see them defined in the rubric source, because the rubric
is the published standard and hiding two of its dimensions would make it incomplete. Where a
dimension does not apply to a repository, the certificate says *not applicable* rather than
quietly scoring it zero.

**Where we were wrong.** Calibrating this rubric against real repositories surfaced four
errors in our own tool, all found before publication and all fixed. We list them because a
scoring tool that has never been wrong is a scoring tool that has not been checked:

- **Django, scored a false critical on dependency hygiene.** We applied application-shaped
  expectations to a library. Archetype now gates the dimension.
- **OpenSSF Scorecard, scored a false critical on audit trail.** We flagged Google's own
  auditing tool for insufficient auditing. The dimension lacked a "is there anything here to
  rate?" gate before "how good is it?"; it has one now.
- **Twelve of seventeen repositories were silently dropped** from an early build of the
  board, which nonetheless reported success. The generator could always lose rows without
  saying so. It now asserts that every repository in the corpus is accounted for — ranked,
  unranked, or errored — and fails loudly otherwise.
- **Low-coverage repositories were ranked as though fully measured.** A confidence floor now
  publishes them without ranking them, rather than implying a precision we did not have.
- **A1's scheduled-workflow check hardcoded our own internal QA agent's filename** as its
  definition, instead of the concept it actually measures. It was inert for every external
  repository by construction — a home-field rule dressed up as a general one. It now detects
  the *shape* (a cron-scheduled workflow that runs the verification suite, and whether its
  results are durably published or only handed to an ephemeral CI artifact); our own internal
  nightly QA workflow is one recognized instance of that shape, not its definition.

Every one of these was a false alarm produced by *us*, about *other people's code*, and we
would rather you knew that than discovered it. If you believe the board scores your
repository wrongly, open an issue — a rubric that cannot be corrected in public has no
business being published in public.

**No rubric change re-scores you silently.** Every change to scoring behavior requires a
`WITAN_RUBRIC_VERSION` bump and a corpus-wide before/after delta published in
[`docs/leaderboard/RUBRIC_CHANGELOG.md`](../../docs/leaderboard/RUBRIC_CHANGELOG.md) — score,
verdict, and rank for every repository, "no repository moved" stated explicitly when that is
the result. A build that changes scoring without both fails; see that file's `v2` entry for
the home-field fix above as the first rubric change recorded this way.

## License

`cejel` is free and licensed under [AGPL-3.0-only](./LICENSE), copyleft: any modified
version you distribute or run as a network service must also make its source available
under the same terms. A commercial license is available for teams that need to use or
modify `cejel` without those copyleft obligations.
