# Cited-commit inventory — 2026-10-02 (cejel #368)

CONSTRAINTS-VERSION: 2026-08-01.5 (read from `origin/main`).

Scope: every hexadecimal token of 7 to 40 characters (bounded by non-hex characters on both
sides) in `docs/experiments/**` and `leaderboard/RUBRIC_CHANGELOG.md` on `origin/main`
`e2651ccad95f91bd042473388b4675ac454442b1`, after `git fetch origin --tags`. Execution mode:
local macOS worktree, `git` against this repository only, no network beyond the fetch.

This file deliberately lives outside the scanned paths, so its own citations are not checked.

## Predictions (written and committed before measuring)

Counted over distinct tokens (one token, many occurrences, counts once).

| Class | Predicted |
|---|---|
| commit reachable from `main` | ~150 |
| commit reachable only from an `evidence/*` tag | ~4 (the 0.4.9 preregistrations `0f80959`, `680b9d3`, plus the #307 mutation) |
| commit present, reachable from neither | ~10 |
| blob or tree | ~20 |
| nothing | ~600, dominated by pure-decimal runs (dates, counts) and alfred/lab_notes SHAs |

Current `main` failures under the commit rule: predicted a handful (1–10); 0 is not assumed.
