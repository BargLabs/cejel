# Maeve lesson holding directory

This is cejel's own local staging area for `PENDING_cejel_<slug>_<date>.json` Maeve lesson seeds
— the same `MaeveLessonSeed[]` shape and staging convention documented in BargLabs/alfred's
`docs/orchestration/lesson-staging-convention.md`. A coding-agent session with this repository
open stages a seed here as part of its own PR (the "has this repository open" row of that
document), rather than detouring through alfred.

**This directory is transit, not a destination.** alfred's operator-run harvest
(`packages/api/scripts/harvest-holding-lessons.ts` in BargLabs/alfred) copies every file here,
byte-for-byte and schema-validated exactly as an alfred-authored seed would be, into alfred's own
`docs/orchestration/maeve-unanchored-lessons/`. A human then removes the delivered file from
*this* directory in a follow-up PR — the delivery is only complete once both land (mirrors the
manual precedent: alfred #1345 copied a cejel lesson in, cejel #284 dropped it).

The pre-commit hook validates added or modified seed files from the Git index using
Alfred's `validateMaeveStagedSeedBatch` directly. Set `ALFRED_REPO_ROOT` to an installed Alfred
checkout (the default is a sibling `alfred` directory), then use the normal commit command.
The validator enforces the statement cap, structured move condition, and repository binding;
there is no second schema in Cejel. Deletions are outside the added/modified selection.

Explicit invocations (with Cejel's development dependencies installed):

```sh
node --import tsx scripts/validate-staged-maeve-seeds.mjs --mode staged --alfred-root /path/to/alfred
node --import tsx scripts/validate-staged-maeve-seeds.mjs --mode tree --alfred-root /path/to/alfred
```

`staged` reads index blobs; `tree` reads committed HEAD blobs. Both refuse zero examined files
or records distinctly from a nonempty valid selection. The hook calls the validator only when
seed additions or edits exist. Missing canonical-validator dependencies fail closed. Public CI
checks the adapter and hook; full canonical validation requires the installed private checkout
and is also enforced by the destination harvester. The private validator is not copied here.

A file sitting here for more than 7 days is presumed undelivered, not merely "listed": both
`src/__tests__/maeve-lesson-delivery.test.ts` (this repo's own CI) and alfred's cross-repo
`scripts/maeve-lesson-delivery-guard.mjs` (`lessonHoldingMaxAgeDays: 7` for cejel in
`.github/maeve-sync-products.json`) enforce that threshold and fail loud rather than treat this
directory's allowlist entry as proof of delivery. See goal_maeve_cross_repo_lesson_delivery_2026-09-07
in BargLabs/alfred for the full design.

Seeds staged here are public from the moment they are committed and remain in this repository's
git history after deletion — the 7-day bound limits staleness, not exposure. A lesson touching
closed-class material under the IP boundary (`CLAUDE.md`/`AGENTS.md`) routes to alfred directly
and never lands here.
