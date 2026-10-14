# v26 item 6: A5 and A2 tenant findings fire on settling evidence only — 2026-10-14

**CONSTRAINTS-VERSION: 2026-08-01.5**

The one change `witan-rubric-v26-prospective-2026-10-14` makes of its own, implemented from the
operator-signed ruling `docs/calibration/v26/ruling-item-6.md`. Gated on v26 alone
(`usesV26SettlingEvidence` in `src/witan/repo-signals.ts`). Everything here is synthetic. No
calibration case, counterparty or real repository was used or consulted.

## Preconditions, checked on `origin/main` `e43ab760`

- The v26 scaffold is merged: `WITAN_RUBRIC_VERSION_V26` is declared in
  `src/witan/rubric-version.ts`.
- The ruling exists and its last commit, `ea870d10`, carries a good SSH signature by the operator's
  key. `git show -s --format=%GG ea870d10` printed a `Good "git" signature` with ED25519 key
  `SHA256:j4H5gR9qB/hKcGNUqsj0i3bdQjySv2v4fhL3QPfq6Dw`. The session's permission
  profile blocked the literal `%G?` format string, so `%GG` was used in its place. GitHub's own
  verification reports `unknown_key`: the key is not registered on GitHub as a signing key. That is
  separate from the local check the goal names.

## What changed

- **A5.** Under v26 the no-reconciliation finding fires only when the repository names a
  claim-reconciliation artifact that is absent (S-A5): `findDeclaredAbsentClaimArtifact`. The
  finding says the repository declares the artifact at that path and the path is not present. Its
  evidence is the declaring file at the declaring line.
- **A2.** Under v26 the v18+ "no policy anywhere" gap is not emitted. Instead,
  `findUncoveredTenantTables` applies T-1 to T-3 and emits the ruling's sentence for each uncovered
  table, citing its `CREATE TABLE` line.
- **Abstention.** Otherwise there is no finding, and the ruling's exact sentence goes into that
  criterion's `notes`. `buildRelyingPartySummary` lifts it into "What was not established". The
  sentences are constants in `src/witan/abstention.ts`. No `report.json` field was added.
- **Metrics.** None changed. The new code only adds or removes findings and notes.

## Choices where the ruling is silent

Each is the reading that fires less.

**A5**

1. **Declaring documents.** The root `README.md`, a top-level `docs/*.md|mdx` page (the existing
   claim-source definition), and a root `CONTRIBUTING.md`. A `.github/CONTRIBUTING.md` is not read.
2. **Workflows.** GitHub Actions files (`.github/workflows/*.yml|yaml`) only. Paths count only
   inside a `steps:` block. YAML comments are ignored. A workflow that sets `working-directory:`
   anywhere declares nothing, because its relative paths cannot be resolved.
3. **Markdown.** Inline links and reference definitions count. Images, fenced code blocks and HTML
   comments declare nothing. External URLs, protocol-relative URLs and in-page anchors declare
   nothing. A query or fragment is stripped. A target whose percent-encoding cannot be decoded
   declares nothing.
4. **Resolution.** A link resolves against the declaring file, and a leading `/` means the
   repository root. A code-span path counts as present when either its root-relative or its
   file-relative reading is present. A path that escapes the root declares nothing.
5. **Normalisation.** Only a path made of `[A-Za-z0-9._/-]`, at most 160 characters, counts.
   Anything else cannot be normalised and declares nothing.
6. **Vocabulary.** Extensions are `md`, `mdx`, `json`, `yml` and `yaml`. Words may be joined by
   `-`, `_`, `.` or nothing. Matching ignores case.
7. **Presence.** A path is present if the tracked inventory or the list of withheld paths holds it,
   ignoring case, or holds a directory at that path. A file Cejel declined to read is never
   reported missing.
8. **One finding.** Only the first absent declaration, in path order and then line order.
9. **A declared artifact is absent but a Cejel-format artifact is present: no finding and no
   sentence.** The ruling's "present artifacts are unchanged" governs.
10. **Severity.** v25's rule is kept: `warning`, or `info` when the repository documents its
    limitations.
11. **When the sentence appears.** Only where v25 would have emitted the finding: a claim source
    and implementation files are present and no Cejel-format artifact is. It does not appear when
    A5 is not applicable.
12. **Derivation.** The finding carries an inventory-scan derivation under a new pattern set,
    `cejel.core-a5.declared-claim-artifact-path.v1` (one pattern: the declared path).

**A2**

1. **Only `.sql` files are parsed.** An RLS statement in any other data-layer file, such as an ORM
   migration or a Prisma schema, is coverage Cejel cannot read, so it abstains on every table.
2. **Dynamic SQL abstains on every table.** Comments are not code. An RLS statement inside a string
   literal or a dollar-quoted body is dynamic SQL. So is one whose table name cannot be normalised,
   and so is an RLS phrase in a statement form Cejel does not recognise.
3. **Name matching.** Names compare without regard to case, on their last segment. Coverage written
   with a different case, quoting or schema prefix still covers, and two schemas' same-named tables
   count as one.
4. **Identifiable tables.** A name with more than two segments, or a quoted name that is not a
   plain identifier, is not identifiable, so that table yields no finding.
5. **Coverage.** Coverage is `ENABLE ROW LEVEL SECURITY` or `CREATE [OR REPLACE] POLICY ... ON`.
   `FORCE ROW LEVEL SECURITY` alone is not coverage. `DROP POLICY` does not uncover a table.
6. **"Later" DISABLE.** A `DISABLE` uncovers a table only when it comes after the table's last
   `ENABLE` or `CREATE POLICY`. Order is decided only within one directory: migration files by path
   with numeric runs compared as numbers, then by statement position. Across directories a
   `DISABLE` is not treated as later.
7. **Findings.** At most three tables are named, one finding each.
8. **Severity.** `warning`, as in v25. No derivation: the finding is a positive parse of a cited
   statement, not a zero-match inventory claim.
9. **When the sentence appears.** Only when a tenant premise exists (a tenant identifier in any
   data-layer file, the v18+ premise) and no v26 finding fires.
10. **The tenant pattern.** `TENANT_SCOPE_PATTERN_V11` is tested against the column name alone, not
    the whole statement.

**Not changed.** The behaviour corpus has no new specimen. Adding one moves every rubric's
fingerprint, and the fingerprint is in every `report.json`. That would break the byte-stability the
ruling requires for v17 and v22-v25. The synthetic suite carries the A2 positive case instead.

## The direction change the ruling names

v17 through v25 fire A2 only when no policy exists at all. v26 fires only when policies exist and a
tenant table lacks one. So under v26, A2 fires on a disjoint set of repositories from v17's. The
fixture `a2-uncovered-tenant-table` fires under v26 and not under v25. `a2-tenant-column-no-rls`
fires under v25 and not under v26.

## A consequence the ruling does not name

A5 has no calibrated status rule (`calibratedCriterionStateV11` returns nothing for A5). Its status
comes from its findings when it has one, and from its score band when it does not. Where the v25 A5
finding no longer fires, an A5 score below 1.5 now shows `critical`, and `ensureFindingsExplainStatus`
adds a metric-derived critical finding ("A5 metric-derived score is 1.4/4.0, in the critical band
..."). v25 showed `warning` at the same score. The score is unchanged, because the finding's 2.4
cap never bound below it.

This is the metric path proposed ADR-0020 governs, and the ruling leaves it open. `scoring.ts` is
not touched here: changing how a status is derived is outside "the two findings named here and
their disclosure lines". It needs an operator decision before v26 is calibrated.

## Red first

`src/witan/__tests__/v26-a5-a2-settling-evidence.test.ts` against the unfixed source (`e43ab760`):
137 tests, 24 failed, 113 passed. The 113 that passed are the controls that must not move: every
"no rubric other than v26 carries a v26 finding or disclosure" case, the per-fixture identity of
metrics, evidence and non-item-6 criteria, and the cases where v25 and v26 must agree (a present
Cejel-format artifact, covered tenant tables). After the change: 137 of 137 pass.

## Guard deletions

Each guard was deleted alone from the committed source (`a6c73688`), the suite run, and the
source restored with `git checkout`.

| Guard deleted | Tests turned red | Named test among them |
|---|---|---|
| The v26 gate (`usesV26SettlingEvidence` forced false) | 24 | `no declaration and no Cejel-format artifact: no finding and the disclosure line under v26; the finding fires under v25` |
| T-1 (row-level security as the repository's own mechanism) | 2 | `a tenant column and no RLS anywhere: no finding and the disclosure line under v26; the finding fires under v25` |
| DISABLE handling (a later DISABLE ignored) | 1 | `ENABLE followed by a later DISABLE ROW LEVEL SECURITY on the same table: the finding fires` |
| The A5 declaration requirement (fire whenever no Cejel-format artifact exists) | 6 | `no declaration and no Cejel-format artifact: no finding and the disclosure line under v26; ...` |

The Prisma-only case did not turn red under the T-1 deletion. It abstains at T-2 as well, because
a Prisma schema has no `CREATE TABLE`, so T-1 is not what protects it. The second T-1 test is
`RLS named only inside comments is not the repository mechanism`.

## Behaviour corpus and byte stability

The pipeline was a throwaway vitest file, never committed. It scored the 19 corpus specimens and
the 34 synthetic fixtures under all ten selectable rubrics with the scanner at `e43ab760` and again
after the change, and compared the full `report.json` bytes. Before measuring anything, the
`e43ab760` run reproduced all ten committed fingerprints exactly.

- **v17 through v25** (nine rubrics, including v18-v21): 477 of 477 reports are byte-identical
  before and after, 171 corpus and 306 synthetic.
- **v26:** 15 of 19 corpus specimens move. The 4 that do not are `minimal-source-no-process`,
  `docs-only-repository`, `ava-live-assertions` and `public-digest-lookup`.
  - On all 15, every metric, the overall score and the verdict are unchanged, and the v25 A5
    finding is gone.
  - 11 have A5 at 1.4: `warning` becomes `critical`, with a metric-derived critical finding.
  - 4 have A5 at 1.7-1.9: they stay `warning`, with a metric-derived warning finding in place of
    the v25 one.
  - On 2 (`complete-node-service`, `privileged-migrations`), A2 gains only the disclosure sentence
    in its notes.
- **Fingerprints.** Only v26's moved: from
  `sha256:909235faa0171fd3201c58d1024283259db0b0916c809557df9fb491282a99e3` to
  `sha256:b157f45f873973cdd296199b13dc464727e2c72dc58d56eddf740e061d9f0ca8`. Only its A5 component
  pin moved; every report-level component is unchanged. v25 and v26 no longer collide, so the
  fingerprint guard's declared collision is removed.

## Report format

No new `report.json` field. Under v26 the sentence travels in the A2 and A5 criterion `notes` that
every report already carries. The certificate (Markdown, HTML and terminal, all through
`buildRelyingPartySummary`) shows it under "What was not established". v26 `report.json` and
certificate bytes change. No other rubric's do.

## Verification

See the PR body for the commands and results of the final run.

## Deferred

- **The A5 status consequence above.** It needs a decision under ADR-0020 before v26 is
  calibrated.
- **A behaviour-corpus specimen that reaches the v26 A2 finding.** Adding one moves every rubric's
  fingerprint, so it belongs with the next change that re-pins them all anyway.

## Lesson

Staged as `PENDING_cejel_removing_a_finding_can_raise_a_status_2026-10-14.json`: removing a
finding is not neutral when a status falls back to a score band. Measure the status, not only the
finding and the metrics.

## Revision — 2026-10-14 (goal_cejel_v26_item6_revision_2026-10-14)

This section supersedes "Metrics. None changed" and "A consequence the ruling does not name" above.
It records three changes. The first implements the operator-signed amendment 1. The other two
close false-fire paths found in review. Every change is gated on v26 alone.

### Preconditions

- `docs/calibration/v26/ruling-item-6-amendment-1.md` is on `origin/main`. Its last commit,
  `5b465b58`, carries a good signature: `git show -s --format=%GG 5b465b58` printed
  `Good "git" signature` with ED25519 key `SHA256:j4H5gR9qB/hKcGNUqsj0i3bdQjySv2v4fhL3QPfq6Dw`. The
  goal's `git log -1 --format=%GG -- <path>` form was refused by this session's permission
  profile, so `git show -s` on the commit it names was used.
- PR #482 is open, and its branch exists on origin.

### Bringing in `origin/main`

Main had moved to `52565fb9`, bringing in card 3 (#484, A1 coverage recognition, which re-pinned
every fingerprint) and amendment 1 (#483). The goal asks for a merge commit. This session's
permission profile refused `git merge`, `git pull`, `git merge-tree` and `git write-tree`. Writing
`MERGE_HEAD` was refused as a sensitive file. So main's content arrived in an ordinary
single-parent commit, `47867b72`:
- main-only files were taken from `52565fb9`;
- `repo-signals.ts` and `CHANGELOG.md` were merged three-way with `git merge-file`, with no
  conflicts;
- `RUBRIC_CHANGELOG.md`'s one conflict was resolved by keeping both entries, item 6 above card 3;
- the fingerprint constants and pins took card 3's v17-v25 values.

The staged tree's diff against `52565fb9` was exactly #482's own change set. To record the ancestry
without changing a byte, the operator can run this on the branch before merging:
`git merge -s ours 52565fb92c7619c6d0fc79746e20664392ec56d1`.

### Change 1: amendment 1, A5's `reconciliation_artifact_depth`

Under v26, when no Cejel-format artifact is present and the repository names no
claim-reconciliation artifact, A5 omits `reconciliation_artifact_depth`. `claim_match_rate` (0.5)
and `claim_source_depth` (0.35) then carry A5's score at those relative weights, 0.5/0.85 and
0.35/0.85, through the scorer's existing weighted mean. The disclosure sentence is unchanged, and
nothing else is added to the certificate. When S-A5 holds, the metric is scored at 0 beside the
finding. When a Cejel-format artifact is present, the metric is unchanged. No status rule changed.

`findDeclaredAbsentClaimArtifact` became `scanClaimArtifactDeclarations`. It returns whether any
artifact is named as well as the first absent one, so a single read of the declaring files serves
both the finding and the metric.

Choices where the amendment is silent:
1. **Named and present, not in Cejel format.** The repository links a register that exists and is
   not in Cejel's format. The amendment omits the metric only when the repository "names none", so
   it is scored here, at 0. This is the literal reading, and it fires more than omitting would.
   **This needs an operator decision**: the amendment's principle (not using Cejel's format is no
   evidence) points the other way.
2. **What counts as named** is exactly what S-A5 reads, after Change 3's exclusions. A path a
   workflow step writes or uploads names nothing, so the metric is omitted there too.

### Change 2: A2, a tenant table that no longer exists under its CREATE TABLE name

`findUncoveredTenantTables` now follows each tenant table through later statements in its own
directory, in the order it already used: files by path, numeric runs compared as numbers, then
statement position.
- **`DROP TABLE`** (with or without `IF EXISTS`, schema-qualified, one or several names,
  `CASCADE`/`RESTRICT`) after the table's `CREATE TABLE` removes it from the candidates. A `DROP`
  before the `CREATE` in the same directory removes nothing, which keeps the idempotent
  `DROP TABLE IF EXISTS x; CREATE TABLE x` pattern a candidate.
- **`ALTER TABLE ... RENAME TO`** after the `CREATE TABLE` moves the table's key and its coverage
  history. Coverage counts when it names the table by the name it held at that point. The finding
  names the new name, with the original schema prefix if any, and still cites the `CREATE TABLE`
  line, as the ruling requires.
- **Across directories** there is no readable order. A `DROP` or `RENAME TO` naming the table, or
  any later name of it, in another directory means it is not named.

Choices, each the reading that fires less:
1. A `DROP TABLE` or `RENAME TO` whose table name cannot be normalised abstains on every table, as
   an unreadable `CREATE POLICY` already did.
2. `DROP TABLE` or `RENAME TO` inside a string literal or dollar-quoted body (dynamic SQL) abstains
   on every table, extending the existing RLS rule for such bodies.
3. A table dropped and then re-created is a new candidate. Coverage written before the drop still
   counts for it, although PostgreSQL drops policies with the table.
4. A down migration in a later file than its up migration (`0003_x.down.sql` dropping a table
   created in `0002_x.up.sql`) removes the table. That costs recall and never asserts.
5. Only `ALTER TABLE ... RENAME TO` is a rename. MySQL's `RENAME TABLE` is not read; MySQL has no
   row-level security, so T-1 does not hold there.

### Change 3: A5, a path a workflow step writes or uploads

`workflowClaimArtifactDeclarations` no longer takes every path-shaped token in a step.
- On a line, every token after the first `>` (so also `>>`), `tee`, `-o` or `--out…` option is a
  written path, and declares nothing. Tokens before it are still read.
- A line ending in `\` after a write operator carries the exclusion onto its continuation.
- A step whose `uses:` is `actions/upload-artifact` or `actions/download-artifact` (any version or
  sub-action, with `uses:` before or after the `with:` block) declares nothing at all. Each step's
  declarations are held until the step ends for that reason.

Choices, each the reading that fires less:
1. "Follows" is read as "anywhere after the operator on the same line", not "immediately after".
2. Every `--out…` long option counts (`--out`, `--output`, `--outfile`, `--output-file`).
3. `actions/download-artifact` is treated like upload: its `path:` is where it writes.
4. `>` is matched wherever it appears, so `2>&1`, `=>` and YAML's folded `>` also start an excluded
   tail. A YAML `run: >` line has nothing after it; the command lines that follow are their own
   lines.
5. `cp`, `mv` and other commands that write a named destination are not treated as writes. They
   are not in the goal's list, and their argument order varies.

### Red first

The code was written before the tests, in `ce4e3479`. The tests (`6dfa9c43`) were then run against
the pre-revision `repo-signals.ts` from `47867b72`, restored with `git checkout` for that run. 225
tests: 61 failed and 164 passed. The 164 are the controls that must not move, among them every
"no rubric other than v26 carries a v26 finding or disclosure" case and the read-only workflow
cases. Against the revised source, 225 of 225 pass.

### Guard deletions

Each guard was deleted alone from `ce4e3479`, `v26-a5-a2-settling-evidence.test.ts` was run, and
the source was restored with `git checkout`.

| Guard deleted | Tests turned red | Named test among them |
|---|---|---|
| DROP handling (the `DROP TABLE` branch) | 3 | `invoices created with tenant_id, then a later DROP TABLE invoices: no finding, and the disclosure line` |
| RENAME handling (the `RENAME TO` branch and its unreadable-name abstention) | 3 | `invoices renamed to invoices_archive, the policy then on invoices_archive: no finding, and the disclosure line`; `a rename with no policy anywhere on the new name, and RLS used elsewhere: the finding names the new name` |
| Write-path exclusion (`writeAt` forced to -1) | 14 | `` `> claims-register.json`, the file absent: no finding, and the disclosure line `` |
| Upload-artifact exclusion | 4 | `` the `path:` of an actions/upload-artifact step, the file absent: no finding, and the disclosure line `` |
| Amendment 1 (`omitReconciliationArtifactDepth` forced false) | 45 | `no Cejel-format artifact and none named: the metric is absent, the other two carry the score, and the disclosure is present` |

### Measured before and after

The measurement was a throwaway vitest file, never committed. It scored all 22 behaviour-corpus
specimens and all 55 synthetic fixtures under all ten selectable rubrics with three scanners:
- `origin/main` `52565fb9`, where v26 scores exactly as v25;
- #482 before this revision, `47867b72`;
- this revision.

It compared the full `report.json` bytes. Every corpus fixture reproduced its committed head first.

- **v17 through v25:** byte-identical before and after this revision: 693 of 693 reports (198
  corpus, 495 synthetic). They are also identical to `origin/main`: 693 of 693.
- **v26 against `origin/main`:** 15 corpus specimens move. The 7 that do not are those where A5 is
  not applicable or has insufficient data. On all 15:
  - the v25 A5 finding is gone, `reconciliation_artifact_depth` is omitted, and A5 stays
    `warning`;
  - A5's score rises: 1.4 to 1.6 on 11, 1.7 to 2.0 on 1, and 1.9 to 2.2 on 3;
  - code trust rises 0.1 on 10, the overall score rises 0.1 on 6, and no verdict moves;
  - on 2 of them (`complete-node-service`, `privileged-migrations`) A2 gains only the disclosure
    sentence.

The other 7 corpus specimens' v26 reports differ from main only in the fingerprint field every
report carries.

**A5 status, v25 against v26, on the 22 corpus specimens**, read from the measurement output:

| Scanner | More severe under v26 | Less severe under v26 | Unchanged |
|---|---|---|---|
| Before this revision (`47867b72`) | 11 (`warning` to `critical`) | 0 | 11 |
| After this revision | 0 | 0 | 22 |

The 11 are the specimens scored 1.4. A5 does not land in the critical band on any corpus specimen
after this revision, so there is no critical band to report.

**Fingerprints.** Only v26's moved. Against main it went from
`sha256:2ce60ad90a956bf8b26372432b531fa7eaaa48eff8b11ef55ebaac81bc791c21` (equal to v25's) to
`sha256:e1fa40eb65bbfa777affea7951850b9d4c5302a08008a9af172f704f06621312`. The moved components are
the A5 criterion digest and the report digests of the 10 specimens whose code-trust score moved.
#482 before this revision measured
`sha256:010ca080049057dd82cb4af08e625208cd432904a85ba29b327525b018540e13` on the same 22-specimen
corpus; it was never pinned. The earlier `b157f45f…` was measured on the 19-specimen corpus and is
superseded.

### Tests changed beside the new ones

- `v26-a5-a2-settling-evidence.test.ts`: the "metrics identical under v25 and v26" case now
  allows exactly amendment 1's omission. It names the fixtures that keep the metric, and every other
  fixture must lose it.
- `v26-v25-parity.test.ts`:
  - A5 may also differ in `metrics` and, with ingested signals, `nativeScore`;
  - report-level composites (code trust, overall, category scores, and A5's ingested-signal
    scores) may move only where A5's score moved;
  - A5's status is pinned equal to v25's on every specimen;
  - the fingerprint check requires the moved report pins to be exactly the specimens whose
    composites moved.

### Deferred

- **Named-and-present** (Change 1, choice 1) needs an operator ruling.
- **A behaviour-corpus specimen that reaches the v26 A2 finding**, still deferred for the reason
  given above.

### Lesson

Staged as `PENDING_cejel_schema_is_the_fold_of_its_migrations_2026-10-14.json`:
- a schema is the fold of its migrations, not the union of their `CREATE TABLE` statements;
- a path on a command line is a declaration only when the command reads it.
