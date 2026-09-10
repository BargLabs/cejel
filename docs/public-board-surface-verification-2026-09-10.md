# Public board surface drift — 2026-09-10

**CONSTRAINTS-VERSION: 2026-08-01.5**

Baseline: `e09f82174c80867e3e2ee7871a16fcc4d55901fa` on origin/main.
Policy read using `git show origin/main:CLAUDE.md` and
`git show origin/main:docs/standing-constraints.md`.

## Decision and observed state

Card 4 expressly permits option (b). This PR prepares that option for operator review:
remove the duplicate scored artifacts and link the single site board. No manual sync of
site scores into this repository was performed. The site's withdrawal record was verified
before removal in all three formats: `/leaderboard/leaderboard.md`,
`/leaderboard/leaderboard.html`, and `/leaderboard/`.
The live site was read over HTTPS on 2026-09-10, not inferred from a mounted checkout.

| Surface | Cejel | Run date | Rubric | Rows | Withdrawal |
| --- | --- | --- | --- | ---: | --- |
| Repository (before) | @cejel/cejel@0.2.1 | 2026-07-27T01:48:38.955Z | witan-rubric-v18-prospective-2026-07-25 | 24 | absent |
| Live site | @cejel/cejel@0.4.5 | 2026-08-25T01:09:08.813Z | witan-rubric-v17-2026-07-24 | 24 | present |

The site MD also declares an explicit 0.4.5 scorer pin. This card makes no claim that the
site has received the separate 0.4.8 regeneration. Versions, run date and rubric were
independently compared across all three formats on each surface.

Of 24 rows, **one overall score differs** (Alfred, -0.1 site minus repository).
23 rows have numeric scores on both surfaces; carddemo abstains on both. These values
are a dated discrepancy record, not a republication of the withdrawn scores as current.

| Row | Repository before | Live site | Site minus repository |
| --- | ---: | ---: | ---: |
| react | 3 | 3 | 0 |
| vue | 2.9 | 2.9 | 0.0 |
| svelte | 3.1 | 3.1 | 0.0 |
| django | 3.2 | 3.2 | 0.0 |
| flask | 2.9 | 2.9 | 0.0 |
| fastapi | 3.1 | 3.1 | 0.0 |
| express | 3 | 3 | 0 |
| vite | 3.4 | 3.4 | 0.0 |
| esbuild | 2.5 | 2.5 | 0.0 |
| biomejs | 3 | 3 | 0 |
| requests | 2.9 | 2.9 | 0.0 |
| pydantic | 3.2 | 3.2 | 0.0 |
| axios | 3.3 | 3.3 | 0.0 |
| zod | 3.2 | 3.2 | 0.0 |
| scorecard | 2.9 | 2.9 | 0.0 |
| ripgrep | 2.1 | 2.1 | 0.0 |
| guava | 1.9 | 1.9 | 0.0 |
| cobra | 2.5 | 2.5 | 0.0 |
| sinatra | 2.4 | 2.4 | 0.0 |
| automapper | 2.2 | 2.2 | 0.0 |
| fmt | 2.6 | 2.6 | 0.0 |
| carddemo | abstained | abstained | abstained |
| alfred | 3.3 | 3.2 | -0.1 |
| cejel | 2.8 | 2.8 | 0.0 |

## Change and dependencies

Remove 99 scored artifacts: three board formats and four artifacts for each of 24 rows.
Retain `leaderboard/corpus.json` and `leaderboard/RUBRIC_CHANGELOG.md` byte-identically.
Add a location notice. The old files remain in Git history; this does not rewrite history.
The historical placement regression reads its frozen pre-removal revision through `git show`,
keeping its original assertions. No preregistration, protocol, rubric or result record changed.

The distribution validator now requires no local scored board or report directory at all,
in place of validating redaction inside files this repository no longer distributes.
It still validates the remaining distribution metadata. The new guard checks version,
rubric and date in all three live formats, rejects a missing permanent withdrawal record,
and rejects reintroduced local reports even without a board index. Unknown or unreadable
surfaces fail closed. CI invokes both the guard fixtures and the live check.
This is a check of the known board routes, not a crawl of the entire internet or Git history.
The site lane continues to own its report redaction checks and publication pipeline.

## README claims

Before (removed):

> Every score is produced by the same sealed public scorer used by `npx @cejel/cejel@latest .`; no private domain collector contributes.

The following invitation to reproduce those scores, verdicts, coverage and evidence is
also removed. The opening dogfood quote's 3.3 prospective-v18 score is removed too.

After:

> The Cejel OSS trust leaderboard is hosted on cejel.dev, which is the single current board.

The README directs readers to the producing version, rubric and recipe on that board;
it makes no new exact reproduction assertion. It explicitly acknowledges the false earlier
claim and links the site carrying the permanent 2026-08-18 withdrawal. Private snapshots
remain labelled as not independently reproducible.

## Regression: real surfaces RED before removal, GREEN after

Command for both runs:

```sh
node scripts/verify-board-surfaces.mjs
```

RED, exit 1 (guard commit `c61ca66`, old scored files still present):

```text
{
  "surfaces": [
    {
      "name": "repo/leaderboard.md",
      "version": "@cejel/cejel@0.2.1",
      "rubric": "witan-rubric-v18-prospective-2026-07-25",
      "date": "2026-07-27T01:48:38.955Z",
      "withdrawal": false
    },
    {
      "name": "site/leaderboard.md",
      "version": "@cejel/cejel@0.4.5",
      "rubric": "witan-rubric-v17-2026-07-24",
      "date": "2026-08-25T01:09:08.813Z",
      "withdrawal": true
    },
    {
      "name": "repo/leaderboard.html",
      "version": "@cejel/cejel@0.2.1",
      "rubric": "witan-rubric-v18-prospective-2026-07-25",
      "date": "2026-07-27T01:48:38.955Z",
      "withdrawal": false
    },
    {
      "name": "site/leaderboard.html",
      "version": "@cejel/cejel@0.4.5",
      "rubric": "witan-rubric-v17-2026-07-24",
      "date": "2026-08-25T01:09:08.813Z",
      "withdrawal": true
    },
    {
      "name": "repo/index.html",
      "version": "@cejel/cejel@0.2.1",
      "rubric": "witan-rubric-v18-prospective-2026-07-25",
      "date": "2026-07-27T01:48:38.955Z",
      "withdrawal": false
    },
    {
      "name": "site/index.html",
      "version": "@cejel/cejel@0.4.5",
      "rubric": "witan-rubric-v17-2026-07-24",
      "date": "2026-08-25T01:09:08.813Z",
      "withdrawal": true
    }
  ],
  "errors": [
    "repo/leaderboard.md: missing 2026-08-18 withdrawal record",
    "site/leaderboard.md: version @cejel/cejel@0.4.5 != @cejel/cejel@0.2.1",
    "site/leaderboard.md: rubric witan-rubric-v17-2026-07-24 != witan-rubric-v18-prospective-2026-07-25",
    "site/leaderboard.md: date 2026-08-25T01:09:08.813Z != 2026-07-27T01:48:38.955Z",
    "repo/leaderboard.html: missing 2026-08-18 withdrawal record",
    "site/leaderboard.html: version @cejel/cejel@0.4.5 != @cejel/cejel@0.2.1",
    "site/leaderboard.html: rubric witan-rubric-v17-2026-07-24 != witan-rubric-v18-prospective-2026-07-25",
    "site/leaderboard.html: date 2026-08-25T01:09:08.813Z != 2026-07-27T01:48:38.955Z",
    "repo/index.html: missing 2026-08-18 withdrawal record",
    "site/index.html: version @cejel/cejel@0.4.5 != @cejel/cejel@0.2.1",
    "site/index.html: rubric witan-rubric-v17-2026-07-24 != witan-rubric-v18-prospective-2026-07-25",
    "site/index.html: date 2026-08-25T01:09:08.813Z != 2026-07-27T01:48:38.955Z",
    "Repository must not publish a second scored board: index.html, leaderboard.html, leaderboard.md, reports"
  ]
}
BOARD SURFACES: RED — 6 artifacts checked, 13 violations
```

GREEN, exit 0 (after removal):

```text
{
  "surfaces": [
    {
      "name": "site/leaderboard.md",
      "version": "@cejel/cejel@0.4.5",
      "rubric": "witan-rubric-v17-2026-07-24",
      "date": "2026-08-25T01:09:08.813Z",
      "withdrawal": true
    },
    {
      "name": "site/leaderboard.html",
      "version": "@cejel/cejel@0.4.5",
      "rubric": "witan-rubric-v17-2026-07-24",
      "date": "2026-08-25T01:09:08.813Z",
      "withdrawal": true
    },
    {
      "name": "site/index.html",
      "version": "@cejel/cejel@0.4.5",
      "rubric": "witan-rubric-v17-2026-07-24",
      "date": "2026-08-25T01:09:08.813Z",
      "withdrawal": true
    }
  ],
  "errors": []
}
BOARD SURFACES: OK — 3 artifacts checked, 0 violations
```

## Focused validation

```sh
node --test scripts/verify-board-surfaces.node-test.mjs scripts/b4-commit-year-v19-paired-rescore.node-test.mjs
node scripts/validate-distribution-metadata.mjs
PREFLIGHT_NO_INSTALL=1 bash scripts/preflight_fast.sh
```

```text
✔ placement excludes publisher-owned, scoreless, and low-confidence rows (0.628625ms)
✔ placement reproduces the frozen prospective-v18 board (335.893125ms)
✔ decision requires 24 completed, stable rows and permits at most three raw changes (0.670167ms)
✔ markdown renders every row explicitly (0.311333ms)
✔ compares every header and requires withdrawal even after republication (1.361333ms)
✔ missing or duplicate headers fail instead of certifying an empty comparison (0.136833ms)
✔ site-only policy refuses a reintroduced report, even without a board index (1.306416ms)
✔ reads all three site formats and fails closed on an unreadable surface (1.340458ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 379.742875
Distribution metadata agrees on npm v0.4.8, MCP Registry v0.4.8, and OCI v0.4.8 for io.github.BargLabs/cejel.
Validated explicit permissions blocks in 12 GitHub workflows.
=== Cejel fast preflight (tsc — same check as CI's ci.yml typecheck step) ===

--- pnpm run typecheck (tsc --noEmit) ---

> @cejel/cejel@0.4.8 typecheck /private/tmp/cejel-orch-card4-20260910
> tsc --noEmit -p tsconfig.json

PASS: typecheck

preflight_fast: OK — typecheck passed.
```

Process correction: initial fast preflight passed before the guard commit. A later sandboxed
preflight stalled while the pnpm launcher tried to verify its runtime through the registry;
the removal commit was made before that process returned, contrary to the pre-commit gate.
That process ultimately failed on registry fetch, not TypeScript. The replacement preflight
with network permission passed without bypassing package verification. The final evidence
commit is gated on a completed successful preflight.

## Lesson and limits

The card author's lesson statement is preserved exactly (926 characters), with
stagingVersion 2 and PR #301 as its move condition. A withdrawal must travel with every
copy of the artifact; leaving an unmaintained copy keeps making the withdrawn claim.

Not covered: edits or deployments in the separate site repository; whether anyone cited
the withdrawn numbers elsewhere; the separate grandfathered label-class-file inventory
(the card's historical 53 count was not re-enumerated); npm releases or rubric changes.
No merge or publication was performed. No CI wait or full test suite was run.

Branch: `codex/public-board-surface-20260910`.
Draft PR: https://github.com/BargLabs/cejel/pull/301.
Next-session preview: `alfred reap` (not run; isolated clone, not a managed worktree).
