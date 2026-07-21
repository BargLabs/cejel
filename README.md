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

The reusable Barg Labs listing mark is kept at [`brand/barg-icon.png`](./brand/barg-icon.png)
for directories and registries that accept a custom image. GitHub Actions Marketplace uses
GitHub's predefined `action.yml` branding icons instead.

## Install

No account, no key, no signup.

**Single-file binary.** One file. No Node, no npm, no `node_modules`, nothing installed.

```bash
set -eu
asset="cejel-$(uname -s)-$(uname -m)"
curl -fsSL "https://github.com/BargLabs/cejel/releases/latest/download/$asset" -o "$asset"
curl -fsSL https://github.com/BargLabs/cejel/releases/latest/download/SHA256SUMS -o SHA256SUMS
checksum_entry_count="$(awk -v asset="$asset" '$2 == asset { count++ } END { print count + 0 }' SHA256SUMS)"
if [ "$checksum_entry_count" -ne 1 ]; then
  echo "Expected exactly one SHA256SUMS entry for $asset; found $checksum_entry_count" >&2
  exit 1
fi
if command -v sha256sum >/dev/null; then
  grep "  $asset$" SHA256SUMS | sha256sum -c -
else
  grep "  $asset$" SHA256SUMS | shasum -a 256 -c -
fi
mv "$asset" cejel
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
npx @cejel/cejel .
```

The npm package is scoped as `@cejel/cejel`; its executable remains the short command `cejel`.

**GitHub Action** — score every PR and publish the badge:

```yaml
- uses: BargLabs/cejel/action@v0.1.8
  with:
    min-score: "2.5"   # optional: fail the build below this
```

**From source** — it is AGPL and it runs offline, so reading it is rather the point:

```bash
git clone https://github.com/BargLabs/cejel && cd cejel
pnpm install && pnpm build
node dist/index.js .
```

Released binaries: `cejel-Darwin-arm64`, `cejel-Darwin-x86_64`, `cejel-Linux-aarch64`, and
`cejel-Linux-x86_64`. The release also carries `SHA256SUMS`; each binary is executed against
the source build and with networking denied before attachment. Releases from v0.1.6 also
carry a Sigstore bundle containing GitHub's signed build-provenance attestation for all four
binaries. Verify a downloaded binary with:

```bash
gh attestation verify ./cejel-Darwin-arm64 -R BargLabs/cejel
```

This is cryptographically signed provenance. It is distinct from Apple Developer ID or
Microsoft Authenticode code-signing.

**Docker / OCI.** The same MCP server is published as a non-root, multi-platform image:

```bash
docker run --rm -i -v "$PWD:/workspace:ro" ghcr.io/barglabs/cejel:0.1.8
```

The image defaults to `cejel-mcp` over stdio. To use the CLI instead:

```bash
docker run --rm -v "$PWD:/workspace:ro" --entrypoint cejel ghcr.io/barglabs/cejel:0.1.8 .
```

Beginning with v0.1.7, the standard CLI identity flags are also available directly, while an
invocation without arguments continues to start the MCP server:

```bash
docker run --rm ghcr.io/barglabs/cejel:0.1.8 --version
docker run --rm ghcr.io/barglabs/cejel:0.1.8 --help
```

The OCI image carries an SBOM, maximum-mode build provenance, and a signed registry
attestation. It is also the package referenced by [`server.json`](./server.json) for the
Official MCP Registry.

## Leaderboard

This repo ships the [Cejel OSS trust leaderboard](./leaderboard/leaderboard.md): elite OSS
projects, the public Cejel repository itself, and one explicitly labeled transparency
snapshot from the private studio monorepo where Cejel was built, with a per-repository
evidence report for every row under [`leaderboard/reports/`](./leaderboard/reports/). The
board is also hosted at [cejel.dev](https://cejel.dev). Every score is produced by the same
sealed public scorer used by `npx @cejel/cejel .`; no private domain collector contributes.
For each public-repository row, check out the immutable source commit printed in its report
and run the public scorer to reproduce the score, verdict, measured coverage, and evidence.
The private Alfred snapshot discloses its limitation instead: its source commit and withheld
locations are not publicly available, so that row is not independently reproducible and is
not presented as a public-repository self-score.

### Redaction policy

A path is published exactly when the reader can check it. Every public repository on the
board cites full evidence paths and line numbers, everywhere, in every artifact — a
certificate whose evidence you cannot open is not evidence. The private-repository entry
(the studio monorepo's transparency snapshot) never cites a source path, anywhere, in any
field or format — but the finding itself, its
dimension, status, score, and content hash always survive; only the location is withheld,
marked uniformly as "path withheld — private repository". Redaction removes a location, never
a fact: a private repository failing its own check still shows up on its certificate, by
name. The v3 repository scanner marks B1 and B5 not applicable for every repository,
including ours; it does not accept structured substrate evidence for them. They remain
defined for other rubric inputs, while the repository ranking excludes them fail-closed.
Nobody is scored on evidence the public scanner cannot collect.

### Known false positives (fixed before publishing)

Calibrating a rubric against real, elite repositories surfaces mistakes; the record is part
of the trust claim, not something to bury. Two dimensions produced a punitive score for the
*absence* of a ratable surface rather than a real weakness, and both are fixed:
Django was flagged critical on dependency hygiene for using version ranges instead of exact
pins — normal, deliberate practice for a library, not an app; the rubric now scores
dependency hygiene against archetype-appropriate norms. OSSF Scorecard — Google's own
supply-chain security auditing tool — was flagged critical on audit-trail completeness for
publishing release notes via GitHub Releases instead of a committed `CHANGELOG.md`; a
repository with no ratable audit surface now returns "insufficient data" (excluded from the
composite) instead of a punitive score. The board also publishes a measured-coverage
indicator per row: a score reflects only its *measured* dimensions, and a row scored on fewer
than half of its applicable dimensions is shown as unranked rather than ordered against
better-evidenced rows.

## Usage

```bash
./cejel scan .
```

`scan` scores the current directory with sensible defaults: no signup, fully offline. The
original `./cejel .` form remains supported as a compatibility shorthand.
Prints a concise terminal certificate and writes to `.cejel/`:

- `report.json` — the full structured report; scored runs carry numeric headline scores and a
  score-band `verdict`, while abstained runs carry `null` scores and `verdict: "insufficient_source"`
- `attestation.json` — an unsigned in-toto statement binding the report digest, repository
  revision, rubric, and scored-or-abstained outcome; ready for an external signer
- `certificate.html` — a self-contained HTML certificate (no external assets)
- `badge.json` — a [shields.io endpoint](https://shields.io/badges/endpoint-badge) payload
- `badge.svg` — a static, self-contained trust-score badge
- `summary.json` — a compact digest (score, verdict, top findings)

The attestation is deliberately explicit about its assurance level: Cejel creates the
statement, but it does not pretend to be an independent signer. Until a customer, reviewer,
or provenance system signs it, `assurance.status` is `unsigned` and `issuer` is
`self-generated`. An abstained scan carries only the refusal reason, never a numeric score.

Verify that an emitted report still matches its attestation:

```bash
./cejel verify .cejel/report.json .cejel/attestation.json
```

This verifies the report schema and the report-to-attestation digest, repository, rubric,
timestamp, and outcome binding. It does not verify a signature or signer identity; the command
prints that boundary on every successful verification.

### Flags

- `<path>` — repo to score (default: current directory)
- `--out <dir>` — where to write report/certificate/badge files (default: `.cejel`;
  `--out-dir` remains available as a compatibility alias)
- `--min-score <n>` — exit non-zero if the overall score is below `n` (0–4), or if Cejel
  abstains and therefore cannot evaluate the threshold; used by the GitHub Action's optional
  threshold gate
- `--ingest <file|glob>` — fold another scanner's output into the score (repeatable). Accepts
  SARIF, OpenSSF Scorecard JSON, or the generic Cejel external-signal shape — format is
  auto-detected. See "Aggregate your scanners" below.
- `--quiet` — suppress the terminal certificate (files are still written)
- `-h`, `--help` — print usage and exit successfully
- `-v`, `--version` — print the version derived from the package manifest and exit successfully

## Supported languages

Cejel reads a repository's file tree, not its bytecode — it needs to recognise a file's
source extension to say anything about it. It does not support every language, and it says so
honestly rather than guessing:

- **Deeply modelled** — JS/TS, Python: test detection, coverage, and claim-vs-reality checks
  are tuned specifically for these ecosystems.
- **Partially modelled** — Go, Rust, Java, Ruby, PHP, C#, C/C++, Swift, Kotlin, Dart, Elixir,
  Scala: recognised as source and scored on the language-agnostic dimensions (CI discipline,
  dependency hygiene, audit trail, secrets), but without ecosystem-specific test-framework
  tuning.
- **Recognised but unmodelled** — shell, R, Lua, Julia, Haskell, Terraform, SQL, Perl, OCaml,
  Clojure, Erlang, Nim, Zig, F#, Groovy: counted as source so a repo isn't misread as empty,
  but with the least ecosystem-specific tuning of the three tiers.
- **Not yet recognised** — other ecosystems, including COBOL, Fortran, and MATLAB. Cejel does
  not score these as "source" at all: a repository with zero
  recognised-extension files gets the `unrecognised_ecosystem` archetype, an explicit
  `insufficient_data` criterion status, `null` headline scores, and an explicit machine verdict
  of `insufficient_source` — never a numeric score-band verdict, and never the word
  "Unverified" for the sole reason that cejel cannot read the language. The certificate states
  plainly which of the 11 dimensions were and were not measured.

This list will grow. It will never be "any codebase" — that claim is a promise the parser
cannot keep, and an honest support matrix is worth more than a marketing line the code
contradicts on the first unsupported repository someone runs it against.

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
- uses: BargLabs/cejel/action@v0.1.8
  with:
    min-score: '2.5' # optional; omit to never fail the check
```

## MCP server (for agents)

The same package ships a second bin, `cejel-mcp` — a thin MCP (Model Context Protocol)
server over stdio, so any MCP client (Claude Code, Cowork, Cursor, Codex) can request a
trust certificate as a tool call. It wraps the exact same scan the CLI runs — same scores,
same verdict — and is listed on Smithery via the repo's `smithery.yaml`.

The canonical discovery manifest is [`server.json`](./server.json), published under
`io.github.BargLabs/cejel` in the Official MCP Registry. Its npm ownership metadata,
OCI ownership label, image version, and registry version are checked together before release.

Add it to an MCP client config:

```json
{
  "mcpServers": {
    "cejel": {
      "command": "npx",
      "args": ["-y", "--package=@cejel/cejel", "cejel-mcp"]
    }
  }
}
```

The server exposes one tool and two resources:

- `scan` — input `{ path, format? }`; scores the repository at `path` and returns the trust
  cert as JSON (`format: "summary"`, the default, is the compact digest; `format: "json"` is
  the full report, identical to the CLI's `report.json`).
- `cejel://last-scan/certificate.html` and `cejel://last-scan/badge.svg` — the
  HTML certificate and SVG badge for the most recent scan (the URI scheme derives from the
  npm package name).

Like the CLI, scoring over MCP is fully offline: no network calls, no telemetry, no signup,
and the server writes no files.

## What "offline" means here

Scoring a repo — `cejel scan .` itself, and the Action's scoring step — makes zero network
calls: no telemetry, no signup, no model call. Fetching the `@cejel/cejel` package the
first time (like any npm-distributed CLI, including this Action's own dependency install)
does need network; that's a one-time install cost, not part of the scoring guarantee.

## Help validate Cejel

Cejel does not collect telemetry. External validation is therefore opt-in and inspectable:

- [Report a calibration result](https://github.com/BargLabs/cejel/issues/new?template=calibration.yml)
  when a score, finding, evidence pointer, or refusal is wrong. The form asks permission before
  a correction is added to the public error ledger.
- [Join a pack design-partner pilot](https://github.com/BargLabs/cejel/issues/new?template=pack-interest.yml)
  for the Quant or Healthcare Pack. Both remain pilot surfaces until their domain-specific
  calibration gates pass.

Submit only public or redacted evidence. Never put credentials, proprietary strategy code,
patient data, or protected health information in a GitHub issue.

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

**What we exclude from ranking.** The v6 repository scanner does not evaluate B1 (dispatch
trace completeness) or B5 (verified learning trace) for repository inputs, including ours:
both are always *not applicable* in a repository certificate. They remain defined in the
rubric for structured substrate evidence, but that evidence is not accepted by this scanner.
The ranking excludes both dimensions fail-closed, including when it reads a legacy or
separately produced structured report. We neither score you on evidence the public scanner
cannot collect nor award ourselves points for evidence you cannot contest.

**Where we were wrong.** Calibrating this rubric against real repositories — and running the
board itself like a stranger would — surfaced the errors below in our own tool, every one found
by us and every one fixed. The list is its own count; we do not keep a tally in this sentence,
because a number typed by hand beside a list that grows is exactly the kind of unchecked claim
this tool exists to catch. We publish them because a scoring tool that has never been wrong is a
scoring tool that has not been checked:

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
- **Our board and our own certificates disagreed on four repositories' headline scores by
  0.1** — two coherent bases (the board's fair cross-repo ranking basis, and each
  certificate's own-dimension basis), one word, "Overall", printed on both. We found it on
  launch day and fixed it: "Overall" is now byte-identical everywhere it appears — board,
  certificate, badge, report, and JSON — and the ranking basis, where it genuinely differs,
  has its own separate, explicitly labeled column instead of borrowing the same name.
- **Our own row used a scoring path nobody else could run.** The board generator could add
  internal collectors after the public scan, so its reassuring collector blacklist was not
  the invariant it claimed to be. Rubric v3 removes that second path: every corpus row now
  passes through the same sealed public scorer, every external source is pinned to a commit,
  and a required guard re-scores every row and compares score, verdict, coverage, and
  evidence. The honest correction moved Alfred's Code score from 2.5 to 2.4 and A5 from 2.9
  to 2.4. It is less flattering and more trustworthy.
- **A tracked symlink could make evidence depend on files outside the checkout.** Repository
  discovery used a regular-file check that followed symlinks, so a tracked link could escape
  the immutable source snapshot. Rubric v4 accepts only tracked regular files. On the pinned
  corpus this removes a duplicate claim source from Zod: A5 moves from 2.2 to 2.0 while its
  rounded Code score, Overall, verdict, and rank stay unchanged. The full 24-row delta is in
  the rubric changelog.
- **A pinned commit could score differently depending on unrelated Git refs in the clone.**
  History evidence traversed every local and remote-tracking ref, including branches that were
  not ancestors of the revision being certified. The required clean-clone reproduction job
  caught the mismatch. Rubric v5 scans only `HEAD` ancestry, so ambient branch state can no
  longer add evidence or change coverage. The complete v4-to-v5 delta is published in the
  rubric changelog.
- **Version 0.1.1 rejected `--help` and `--version` as unknown flags, and read `-h` as a
  directory path.** Version 0.1.2 handles both aliases before positional-path parsing and
  derives its printed version from the package manifest.
- **We reported a timing side-channel in our own test fixtures.** Pointed at its own
  repository, Cejel's secret-handling dimension flagged a "non-constant-time secret
  comparison" — in string literals inside a test file, the deliberately-insecure example code
  that exists to prove the detector fires. It read a *file*, not a comparison, and reported a
  vulnerability in the test written to catch that vulnerability. Two sub-rules of the same
  dimension held two different private notions of what "production code" meant, and the one
  that had none was the louder. Version 0.1.3 gives every rule one shared, derived answer to
  that question, and reports the real line of a real match or nothing at all.
- **We fixed the COBOL false-verdict, shipped it, and it was still broken.** An earlier release
  corrected a repository written in a language we cannot read being scored anyway. The fixture
  that proved the fix contained COBOL and nothing else. The first real COBOL repository we
  pointed it at — AWS's mainframe credit-card demo — carried nine incidental shell scripts
  among 329 files, and those nine were enough to short-circuit the abstention path entirely:
  a 99%-COBOL codebase was scored on its deploy scripts and drew a confident `0.0`,
  "Unverified". Every real legacy repository has a deploy script, so the fix that passed every
  test was unreachable for essentially all of them. Recognised source must now be *dominant*,
  not merely present. **A fixture cleaner than reality proves nothing.**
- **Version 0.1.7 missed AVA's root-level `test.js` convention.** A smoke test against
  `sindresorhus/slugify` reported that a runner was configured but no concrete test files were
  detected even though `test.js` was present at the repository root. That was a detection gap
  in Cejel, not evidence about the repository. Rubric v6 recognizes AVA's `test.js` and
  `test-*.js` conventions; a regression fixture preserves the correction.

Every one was a trust failure produced by *us* — false alarms about other people's code,
silent omissions, inconsistent presentation, or a home-only scoring path — and we would
rather you knew that than discovered it. If you believe the board scores your repository
wrongly, open an issue — a rubric that cannot be corrected in public has no business being
published in public.

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
