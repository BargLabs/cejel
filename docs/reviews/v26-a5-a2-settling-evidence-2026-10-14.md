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
