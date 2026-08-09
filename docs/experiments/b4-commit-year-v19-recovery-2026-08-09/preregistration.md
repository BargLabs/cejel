# B4 commit-year v19 Alfred-row recovery — preregistration

Status: **preregistered after publication of the first-run NO-GO and before any recovery
implementation or Alfred recovery score**

Date: 2026-08-09

Issue: `BargLabs/cejel#95`

## Why a separate protocol exists

The original paired run is immutable and remains a protocol NO-GO. Its canonical result merged
at `0edfe067813593292d4ba67f8f640cf71d05f0ec` after executing from scoring implementation commit
`ce6af76376264540a4d12494a8ac8d4ab92082ee`. It completed 23 of 24 frozen rows with no observed
change, then failed before checking out or scanning the private Alfred row. The harness set
`protocol.file.allow=never` for every Git command and then requested `clone --local`; Git correctly
rejected that contradictory request with `fatal: transport 'file' not allowed`.

That run is not repaired or retried. This is a new, narrower preregistration for the single missing
row. It reuses the 23 already-published successful row pairs byte-for-byte and never clones,
rescans, or replaces them.

## Frozen inputs

| Artifact | Git object / digest |
|---|---|
| Published first-run commit | `0edfe067813593292d4ba67f8f640cf71d05f0ec` |
| First-run canonical JSON | blob `2e6bd9c707a8ff3410e8737d71fa49c06feee97c`; SHA-256 `65e2229f2252c246af0023e764fed718ef2dc5ccd4795c70678e0f457279497b` |
| First-run Markdown | blob `cadc0b0d90a497f3da51c08407922ea2b4885eb5` |
| First-run changelog | blob `8e2668a7b8c0ac60061b2d7ab42a48947317ac65` |
| Scoring implementation | `ce6af76376264540a4d12494a8ac8d4ab92082ee` |
| Alfred source | commit `be2b4325a317fdfaafb68abf9c920a7d6242a830` |
| Baseline rubric | `witan-rubric-v18-prospective-2026-07-25` |
| Candidate rubric | `witan-rubric-v19-prospective-2026-08-09` |
| Fixed generatedAt | `2026-08-09T00:00:00.000Z` |

The recovery must verify that the first-run JSON contains exactly 24 named rows, exactly 23
successful rows, and exactly one error row named `alfred`. It must verify that all 23 successful
rows have the published source commits, report summaries, criterion hashes, placements, and
decision inputs unchanged. Any mismatch is a hard failure before reading Alfred.

## Recovery implementation

The recovery harness must be committed, pushed, reviewed, and merged before execution. It must
hard-code the merged commit of this preregistration and, before reading the first-run result or
the Alfred repository, prove that commit is a strict ancestor of execution `HEAD`.

The scoring sources used by the recovery must be byte-identical to the source bindings recorded
by the first run. In particular, no B4 detector, scoring, coverage, rubric, public-scan, or hardened
scan-path Git code may change between `ce6af76376264540a4d12494a8ac8d4ab92082ee` and the recovery
execution commit. Only a new recovery harness and its tests may be added before the run.

The private checkout method is deliberately narrow:

1. The operator supplies the local Alfred repository path; the path is never serialized, logged,
   hashed into a public artifact, or included in an error.
2. The harness creates a fresh, nonexistent checkout root.
3. For exactly one `git clone --local --no-hardlinks --no-checkout` command, and only for that
   operator-supplied local path, Git receives `protocol.allow=never` plus
   `protocol.file.allow=always`. System/global config, prompts, hooks, pagers, editors, credential
   helpers, signature programs, external diffs, and SSH commands remain disabled.
4. The target checkout uses a newly created Git config; source repository config and hooks are not
   copied. Checkout is detached at the exact frozen Alfred commit with hooks and executable-valued
   config disabled. Submodules, LFS, package managers, build tools, and repository code are never
   invoked.
5. Scoring uses the sealed public scoring entry point twice on that one checkout, with no explicit
   or auto-discovered ingest and the same fixed generatedAt as the first run.

The harness must fail rather than fall back to a transport, archive, copied work tree, synthetic
Git metadata, advanced commit, or wall clock.

## Outputs and combination

One invocation emits:

- a canonical Alfred-only recovery JSON and Markdown rendering;
- a canonical combined 24-row JSON and Markdown rendering made from the 23 frozen successful rows
  plus the new Alfred pair;
- source hashes, exact commits, scan limitations, report hashes, B4 metrics and score/status,
  headline scores, verdict, measured coverage, comparative-board placement, and non-B4 criterion
  hashes;
- an assertion that no private source path appears in any emitted byte.

The combined artifact must retain the original first-run NO-GO and its Alfred checkout error as
historical provenance. It may add a distinct recovery decision; it must not relabel or overwrite
the first run.

## Prediction and decision rule

Before reading Alfred at the frozen commit, the prediction for its recovered pair is:

- no B4 score or status change;
- no overall, code-trust, process-trust, verdict, measured-coverage, or placement change;
- no non-B4 criterion change;
- zero or one raw `audit_freshness_depth` numerator change.

The combined recovery is GO only if:

1. Alfred completes at the exact frozen commit with no scan or scoring error;
2. every non-B4 Alfred criterion is byte-identical between v18 and v19;
3. Alfred has no B4 score/status, headline, verdict, coverage, or placement change;
4. the combined 24 rows retain zero non-B4, headline, verdict, coverage, or placement changes;
5. the combined raw freshness numerator changes remain at most 3 of 24, matching the original
   preregistered bound; and
6. no private path is emitted.

A failure is published as another NO-GO and is not repaired or rerun. A GO authorizes only the
completed prospective-v19 paired delta. It still does not promote v19 as the public default;
default promotion requires the separately preregistered authenticated untouched holdout named in
the original protocol.

## Ordering

1. Merge this preregistration by itself.
2. Record its merged commit in the recovery harness.
3. Commit, push, review, and merge the harness and its synthetic tests without reading Alfred.
4. Execute the recovery once from that merged commit.
5. Commit the recovery and combined results plus a complete changelog follow-up separately.

This document must not be amended after merge. Corrections require an erratum or another new
preregistration.
