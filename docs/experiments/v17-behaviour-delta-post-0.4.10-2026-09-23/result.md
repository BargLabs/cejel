# Result — v17 behaviour delta after 0.4.10

Measured on 2026-09-23 against the preregistration in `PREREGISTRATION.md` (`12549c4`), which is
a strict ancestor of this commit. Baseline `d2a8018` (`v0.4.10`); candidate `5ae73b2`. Both arms
ran at package version 0.4.10 under `witan-rubric-v17-2026-07-24`. Scoring-level evidence is in
`paired-result.json` (from `harness/compare.mjs`); byte-level evidence is in `bytes-result.json`
(from `harness/compare-bytes.mjs`).

**Result: no repository moved.** Three of the five expected values held as written. Two did not,
and both failures are recorded below as measured. Neither one concerns scoring.

| | Expected | Measured | |
|---|---|---|---|
| E1 | 24/24 rows complete in both arms | 24/24, 0 errors | held |
| E2 | 0 rows move at scoring level | 0 headlines, 0 criteria, 0 metrics moved | held |
| E3 | board check 20/24 (fastapi, biomejs, fmt, private row differ) | **24/24 reproduce** | **failed** |
| E4 | 0/24 byte-identical; `withheldPaths` non-empty on **24**; 24/24 identical without it; fingerprint equal | 0/24; non-empty on **17**; 24/24; 24/24 | **failed in one part** |
| E5 | fingerprint unchanged between the arms despite the behaviour change | unchanged on 24/24 | held |

## E2: the scoring result

No headline, criterion score or status, metric value, verdict, placement or coverage figure
changed on any row. Every row reads "none (report differs elsewhere)". The only difference
anywhere is the `withheldPaths` field, which E4 accounts for exactly.

This is what the checkouts predicted, for the reasons stated before the run. The corpus contains
no non-template `.env` file for #336 to read. It also has no A3-applicable row where the old and
new error-boundary predicates disagree on any file: the only handler-shaped files in the corpus
are express test files, and express's A3 is not applicable. **A zero here is a statement about
this corpus, not about the changes.** Each change moves on its own fixture shapes
(`src/witan/__tests__/database-url-userinfo.test.ts`,
`src/witan/__tests__/a3-error-boundary-idioms.test.ts`), and a customer repository with those
shapes will score differently on the next release than on 0.4.10.

## E3 failed: the board had been republished

The prediction carried forward the 0.4.9 entry's board check (20 of 24 reproduce) without
checking the site repository's later history. The board reports were regenerated at 0.4.9 in
cejel-site `026774b` ("site: prepare 0.4.9 board and release disclosures", 2026-09-16). That was
after the 0.4.9 delta measured 20 of 24, and it resolved the four known differences. The baseline
arm (0.4.10, which scores identically to 0.4.9) therefore reproduces the published board on
24 of 24 rows. The prediction was wrong because its input was stale. The measured state is the
better outcome: the published board agrees with the current release on every row.

## E4 failed in one part: skipped is not withheld

`withheldPaths` is non-empty on 17 rows, not 24. The prediction read `contentReadSummary.skipped`
as the number of withheld files. It isn't. `skipped` includes `excludedByExtension`, and a file
excluded by extension is still pushed to the walked file list, so it is not withheld from any
signal (see `registerWithheldRepoPath` in `src/witan/content-reads.ts`). The seven empty rows
(vue, svelte, flask, express, axios, cobra, sinatra) skip files only by extension. Every other
part of E4 held. In particular, deleting `withheldPaths` from every candidate report reproduces
its baseline report byte for byte on 24 of 24 rows. So #351's field is the only difference
between the arms, which is what #351 claimed and #358 made into a test.

## Observed while checking E4: counter totals and the list do not always agree

On 15 of the 17 rows with withheld content, the number of entries in `withheldPaths` equals
`byReason.tooLarge + deniedPath + nonRegularFile`. On two rows it does not:

- **biomejs:** 154 entries against 161 counted. The list is complete: all 22 tracked non-regular
  files (git mode `120000`/`160000`) are present. Seven of them sit under `node_modules/` and are
  withheld for two reasons. The report exports only the alphabetically first reason
  (`src/witan/repo-signals.ts`, `[...reasons].sort()[0]`), so those seven read as `denied_path`,
  and the `non_regular_file` reason is dropped from the serialized entry. The report states this
  loosely, not falsely, and the CHANGELOG describes one reason per entry.
- **esbuild:** `byReason.tooLarge` is 2, but only one tracked file exceeds
  `MAX_REPOSITORY_CONTENT_BYTES` (512,000). That file, `internal/js_parser/js_parser.go`, is
  listed. The counter records one more too-large event than there are too-large tracked files.
  This run did not establish why. The counters predate #351 and are identical in both arms, so it
  is not a behaviour change and nothing here moves because of it.

Neither observation is a false assertion about a repository, and neither was adjusted. Both are
recorded so that the next reader of these counters does not rediscover them.
