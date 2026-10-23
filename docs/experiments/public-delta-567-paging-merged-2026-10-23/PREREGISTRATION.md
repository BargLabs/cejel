# Third preregistration — #567 paged A2 history reads, public before-and-after, on the code that will merge

**CONSTRAINTS-VERSION: 2026-08-01.5**

This is a new preregistration. It is committed and pushed before any run under it is scored.

- **Written:** 2026-10-23, by an AI agent (Claude Opus 5.5, Claude Code), at the coordinator's direction. The operator authorised the merges of #558, #571, #580 and #582, and the user said "go".
- **Why a third:** after the successor's result (`6adf3a398`), `main` moved from `75c951e40` to `fd64796c7`. #571 changed `src/witan/repo-signals.ts`, so #572 no longer merged cleanly. `main` was merged into #572's branch, which makes the code that will merge differ from the successor's candidate `5b154064a`. This plan measures the merged code. **The original (`../public-delta-567-paging-2026-10-22/`, `09f017229`) and the successor (`../public-delta-567-paging-successor-2026-10-22/`, `5450b687f`) are not edited.**
- **Baseline:** `fd64796c702d35f90aa4917b3db2331a87a67f3e`, `main` at this writing (#558, #571, #580 and #582 merged).
- **Candidate:** `ef08a9770450c94eb06a72f2290202c4f6a158f4`, the merge of that baseline into #572's branch (parents `26ef5b761` and `fd64796c7`). It is on `fix/567-page-history-reads`, so the PR's merge commit will make it reachable from `main`.
- **Harness:** `../public-delta-harness/` (v2), unchanged. `norise.mjs` and `norise.node-test.mjs` are byte-identical to the successor's and the original's.
- **Corpus:** `leaderboard/corpus.json`, sha256 `dc723f53a201542e0febb98964093ba4a3e7173221e746ba56aab6f726400d00`, the 23 public rows. It is unchanged.

## What moved between the successor's baseline and this one

`git diff --name-only 75c951e400893cf23b004f85ecf4d1543baf63ef fd64796c702d35f90aa4917b3db2331a87a67f3e`:

```
CHANGELOG.md
docs/experiments/limitation-wording-569-2026-10-22/byte-identity.json
docs/orchestration/maeve-unanchored-lessons/PENDING_cejel_abstention_denominator_by_arithmetic_2026-10-22.json
docs/orchestration/maeve-unanchored-lessons/PENDING_cejel_or_disables_errexit_inside_2026-10-22.json
docs/orchestration/maeve-unanchored-lessons/PENDING_cejel_record_edits_read_hunk_edges_2026-10-22.json
docs/orchestration/maeve-unanchored-lessons/PENDING_cejel_verify_delivery_by_path_not_listing_2026-10-22.json
docs/orchestration/maeve-unanchored-lessons/PENDING_cejel_wording_uses_the_decisions_rules_2026-10-22.json
docs/release-process.md
docs/reviews/v27-false-assurance-closure-2026-10-19.md
leaderboard/RUBRIC_CHANGELOG.md
scripts/release.sh
scripts/release_tests.sh
src/witan/__tests__/false-assurance-v27-generated-1.test.ts
src/witan/__tests__/false-assurance-v27-generated-2.test.ts
src/witan/__tests__/false-assurance-v27-generated-3.test.ts
src/witan/__tests__/false-assurance-v27-generated-4.test.ts
src/witan/__tests__/false-assurance-v27-generated-5.test.ts
src/witan/__tests__/false-assurance-v27-generated-6.test.ts
src/witan/__tests__/false-assurance-v27-shards.test.ts
src/witan/__tests__/false-assurance-v27.test.ts
src/witan/__tests__/fixtures/v27-norise-shapes.ts
src/witan/__tests__/history-control-character-limitation-569.test.ts
src/witan/__tests__/v27-no-rise-failed-history-cap.test.ts
src/witan/__tests__/v27-no-rise-failed-history.test.ts
src/witan/__tests__/v27-no-rise-generated-suite.ts
src/witan/__tests__/v27-no-rise.ts
src/witan/repo-signals.ts
```

**The only scan-path change is #571** (fixes #569), in `src/witan/repo-signals.ts`. A history path whose name has control characters is still left unread and still adds a scan limitation. What changes is the sentence: the existing "credential-shaped pathname" sentence is now kept only for a path whose name is credential-shaped under the rubric's history grammar, or `.env`-shaped. Any other such path gets a new sentence saying it is not credential-shaped.

The rest has no effect on a scan:
- **#558:** tests under `src/witan/__tests__/` and a review record.
- **#580:** records.
- **#582:** the release driver, its tests and its documentation.
- **Lesson seeds and changelogs.**

No package manifest or lockfile changed.

## The candidate's scan-path code

The merge had conflicts in `src/witan/repo-signals.ts`, `CHANGELOG.md` and `leaderboard/RUBRIC_CHANGELOG.md`. In `repo-signals.ts`:
- #567's batched tree enumeration and `.env` read now pass #571's arguments (the path and the rubric's two flags) to `skipControlCharacterHistoryPath`.
- `envPathInHistoryOutput`, the `.env` parse that #567 split out, takes the two flags.

**Checked mechanically.** I compared the added and removed lines of `git diff 75c951e40 5b154064a -- src/witan/repo-signals.ts` (#567 alone) with those of `git diff fd64796c7 ef08a9770 -- src/witan/repo-signals.ts` (#567 on the new baseline). They are equal except for exactly that threading: three call sites and one signature. No other file under `src/` outside `__tests__` differs between the baseline and the candidate.

## Plan and expected values

`plan.json` is the successor's with only the four run commits changed: `base-v17` and `base-v27` at the new baseline, `cand-v17` and `cand-v27` at the new candidate. The corpus digest, `generatedAt`, the pairs and the expected values are unchanged.

**E0-E3 are carried over word for word from the original** (`09f017229`). The `expected` object is identical in all three `plan.json` files.

### Could #571 alter any forecast value? Checked from the code, without running anything

The forecasts at risk are:
- E1 and E2's "the other 21 reports byte-identical";
- E1 and E2's "`undeclaredFieldChanges` exactly biomejs and react, `scanLimitations` only".

E3's comparison of v27 with v17 at one commit uses scores only. `scanLimitations` is not a scoring field.

**Why #571 cannot alter them:**
1. **Wording only.** `skipControlCharacterHistoryPath` still runs at the same call sites, for the same paths, and adds exactly one entry each time. #571 only chooses which of two fixed sentences that entry is. The choice is a pure function of the path and the rubric's two flags. The flags are the same for the baseline and the candidate within a pair, since each pair has one rubric.
2. **Same wording code on both sides.** Both commits of every pair contain #571. So for any path that both sides read, both sides add the same sentence.
3. **Extra paths only on two rows.** A pair's `scanLimitations` can differ through #571 only via a control-character path that the candidate reads and the baseline does not. The candidate reads more history only where a whole-history read stopped at Cejel's output limit on the baseline: biomejs (the tree enumeration and the `.env`-path log) and react (the tree enumeration). #571 does not change which reads stop at the limit. On every other row, both sides run the same one-shot reads, parse the same output, and add the same sentences. Those 21 rows are axios included: its `\bMIGRATION_GUIDE.md` is worded "not credential-shaped" on both sides.
4. **The two rows have no such paths.** On biomejs and react, the successor's result (`6adf3a398`, `result.md`) records that the candidate's reports have no scan limitation at all, after reading those rows' complete histories. So those histories hold no control-character path in any of the three readers' output. #571 does not change which paths a reader lists. It therefore adds nothing on those two rows either.
5. **The `.env` read's early stop.** It parses the same paths in the batched and one-shot forms: everything up to the first `.env` path.

**Conclusion.** No expected value is changed from forecast to recorded on #571's account.

**This depends in part on a measured fact.** Point 4 relies on the successor's recorded result for biomejs and react, not on the code alone. If it were wrong, E1 or E2 would miss, and the miss would be reported with its rows.

**Values recorded, not forecast, as before:**
- the placement moves in `paging-v27`;
- biomejs's v27 overall and code_trust values;
- `v27-shadow`'s count of differing rows, its placement moves, and its A2 and B2 abstentions.

## Disclosure

**The forecasts are not blind.** They come from the informal measurement in `leaderboard/RUBRIC_CHANGELOG.md`. Their author has also read the successor's result, measured at `75c951e40` and `5b154064a`, in which every expected value held.

**Earlier runs:**
- **The original plan at its pins** (`c9d341d5f` and `da7d2d4f3`, prereg `09f017229`) was scored once before `main` moved. It was set aside, and its outputs are not used (see the successor's `result.md`).
- **The successor's result** (`6adf3a398`, at `75c951e40` and `5b154064a`) stands as the record for that code. **For the code that will merge, it is superseded by this preregistration and its result.**

## Procedure

As the successor:
- harness v2;
- a fresh scratch root, outside every checkout;
- detached clean source checkouts at the two commits;
- fresh APFS copies of the same verified full-history target clones.

Each run is scored once. This commit stays a strict ancestor of the result commit, and the branch is merged with a merge commit, never squashed.

## What this does not show

It measures #567's effect on the 23 public rows at one baseline. It makes no precision, recall or calibration claim, and v27 stays prospective and opt-in.
