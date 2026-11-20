# v27 A3: when an LFS pointer abstention is warranted, and what the abstaining reading shows

Investigation, 2026-11-20. Refs #519 #749. Base: `646e187e7b8d7c6b62d1da5ab9c7f59f0c906010`.

No score changes. No file under `src/` outside `__tests__/` changes, so every report under every
rubric stays byte-identical. The fixtures are synthetic repositories written from scratch, in
`src/witan/__tests__/v27-a3-pointer-abstention-investigation.test.ts`. To print the item B tables,
run that test with `V27_A3_POINTER_DUMP` set to an output path:

```
V27_A3_POINTER_DUMP=/tmp/a3-dump.txt pnpm vitest run src/witan/__tests__/v27-a3-pointer-abstention-investigation.test.ts
```

## A. Every way v27's A3 differs from v17's

The search, at the base commit, over non-test source:

```
git grep -n -E 'WITAN_RUBRIC_VERSION_V27|usesV27FalseAssuranceClosure' 646e187e7b8d7c6b62d1da5ab9c7f59f0c906010 -- src ':(exclude,glob)src/**/__tests__/**'
```

It prints 32 lines in 7 files. Each hit (imports grouped with their uses), and whether it can
reach A3's signal, score, status, findings or evidence:

| Site | What it does | Effect on A3 |
| --- | --- | --- |
| `src/witan/repo-signals.ts:131`, `src/witan/scoring.ts:64`, `:389`, `:538`, `:1124` | V27 listed beside V17 in the v17 detector closure, the status-adjustment exemption, the repo-scan rubric set and the finding-adjustment exemption | None. v27 takes v17's branch at each one. |
| `src/witan/repo-signals.ts:148-149` | Defines the one v27 gate, `usesV27FalseAssuranceClosure` | Not a comparison site in itself. Its call sites are listed below. |
| `src/witan/repo-signals.ts:520` | `trackContentReads(..., { lfsPointerAbstention })`. A read of a Git LFS pointer (`readRepoText` / `readRepoTextPrefix`, `src/witan/content-reads.ts:538-540`, `:600-602`) is attributed to the criterion that read it. In the non-v23 branch, A3 is then abstained wholesale (`wholesaleCriterionAbstention`, `repo-signals.ts:564-570`). | **Abstains A3.** Score 0, status `insufficient_data`, kept in the composite at 0 as a read failure. Metrics and findings are dropped. This is the LFS pointer abstention. |
| `src/witan/repo-signals.ts:548` | Keeps a criterion that made a critical finding, where only LFS pointers were skipped | Unreachable for A3. Under v17 and v27, A3's collector emits only info findings (`repo-signals.ts:4547-4568`). |
| `src/witan/repo-signals.ts:555` | Keeps a not-applicable result where every pointer is outside the gate's reads (`LFS_POINTER_NOT_APPLICABLE_RULES`) | A2 and B4 only. A3 has no rule, so a not-applicable A3 that read a pointer **abstains** (v17: `not_applicable`). This is the same abstention reached from the not-applicable exit. |
| `src/witan/repo-signals.ts:953` (`usesV27Closure`), passed on as `useV27FalseAssuranceClosure` | Passed to A1, A2, A4, B2 and B3, and to the report-level history reason (`:1090`) | Never passed to `collectA3ProdReadinessEvidence`: its call at `repo-signals.ts:2217-2229` takes no v27 flag. The history reason is report text (see `history-depth.ts`). |
| `src/witan/scoring.ts:592` | An abstaining signal's evidence: only the LFS pointer citations pass through, and only under v27 | **Text and evidence only.** The abstaining A3 cites its pointers. Score and status are as before. |
| `src/witan/certificate-presentation.ts:392` | v27 wording of two glossary entries (`pr-gate-ci-workflow-count`, `non-hollow`) | Not A3. |
| `src/plain-summary.ts:244`, `:697` | v27 history-reason pattern. The read-failure cause is "LFS" only under v27. | Text only. It can name A3's area as abstaining on LFS pointers. |
| `src/witan/history-depth.ts:13`, `:81`, `:114` | v27's 1 Nov wording of the shallow-clone and unknown-depth reasons | Report text only. Since the 2 Nov ruling every rubric abstains there. |
| `src/witan/rubric-fingerprint.ts:16`, `:281` | v27's behaviour fingerprint | Identity only. |
| `src/witan/rubric-version.ts:181-182`, `:648`, `:668` | The declaration and the prospective list | Identity only. |

So the LFS pointer abstention is the only way v27's A3 differs from v17's in score or status. It is
reached by two exits: a scored A3 that read a pointer, and a not-applicable A3 that read one. It
can only lower A3: a score falls to 0, or `not_applicable` becomes a 0 kept in the composite. Its
only other effect is text: the citation of the pointers (`scoring.ts:592`) and the plain-summary
wording. No A3-specific branch names the gate. This search finds no line that names both the gate
and `'A3'`:

```
git grep -c -E "(usesV27FalseAssuranceClosure|useV27FalseAssuranceClosure|usesV27Closure).*'A3'|'A3'.*(usesV27FalseAssuranceClosure|useV27FalseAssuranceClosure|usesV27Closure)" 646e187e7b8d7c6b62d1da5ab9c7f59f0c906010 -- src/witan/repo-signals.ts src/witan/scoring.ts src/witan/certificate-presentation.ts src/plain-summary.ts src/witan/content-reads.ts
```

The looser search for the gate names alone finds 43 lines: 37 in `repo-signals.ts`, 2 in
`scoring.ts`, 2 in `certificate-presentation.ts` and 2 in `plain-summary.ts`. They are the
sites in the table above and the A1, A2, A4, B2 and B3 collectors' own parameters.

## B. What the abstaining reading shows

Each fixture is a service. "Strong" means: a `build` script, CI, a Dockerfile with a non-root
`USER` and a `HEALTHCHECK`, a compose file with healthchecks, named volumes and restart policies,
`.env.example`, a health route file, an error-boundary file, a structured logger and a rollback
note. "Weak" means: a Dockerfile with neither `USER` nor `HEALTHCHECK`, a server and CI.

Scores are A3's, out of 4. "Components" are the six production-readiness primitives.

| Fixture | Pointer at | A3 read that reached the pointer (from the code) | v17 A3 | v27 A3 | Composite v17 → v27 |
| --- | --- | --- | --- | --- | --- |
| B1 `a3-strong-docs-image-pointer` | `docs/architecture.png` | `rollback_safety_depth`: `countFilesContaining` reads every file under `docs/`, `migrations/`, `drizzle/`, `prisma/` or `scripts/`, whatever its type (`repo-signals.ts:4321-4331`) | 2.9 verified. Components 6/6, workflow depth 3, observability 1, rollback 1. No findings. 7 evidence items. | 0 insufficient_data. 1 evidence item (the pointer). | 2 → 1.7 (at_risk → at_risk) |
| B1 control `a3-strong-control` | none | - | 2.9 verified | 2.9 verified | 2 → 2 |
| B2 `a3-weak-docs-image-pointer` | `docs/architecture.png` | `rollback_safety_depth`, as B1 | 1 warning. Components 2/6 (CI, deployment configuration). Warning-band finding. 2 evidence items. | 0 insufficient_data. 1 evidence item (the pointer). | 1.6 → 1.4 (at_risk → unverified) |
| B2 control `a3-weak-control` | none | - | 1 warning | 1 warning | 1.6 → 1.6 |
| B3 `a3-strong-compose-pointer` | `docker-compose.yml` | No scored read: the compose file earns its credits by path (deployment configuration, workflow depth, explicit deploy target). Its content is read only for the line of its "Release deploy configuration" citation (`evidenceForRelative`, `repo-signals.ts:4355-4363`). | 2.9 verified. Identical to the control, citing `docker-compose.yml:1` | 0 insufficient_data. 1 evidence item. A2 abstains too. | 2 → 1.4 (at_risk → unverified) |
| B3 `a3-strong-dockerfile-pointer` | `Dockerfile` | `prod_readiness_primitives` health component (`isHealthCheckSignalFile` reads the root Dockerfile for `HEALTHCHECK`), the runtime-container read (`repo-signals.ts:4216`) and the citation line | 2.9 verified. The health component is still 1, now earned by `healthcheck.js`. | 0 insufficient_data. 1 evidence item. A2 abstains too. | 2 → 1.4 (at_risk → unverified) |
| B3 `a3-strong-health-route-pointer` (no `HEALTHCHECK`, no `healthcheck.js`) | `src/routes/health.js` | `prod_readiness_primitives` health component (`isHealthCheckSignalFile` reads `health.*` files) and `observability_depth` (implementation files) | 2.5 verified. Components 5/6: health 0. | 0 insufficient_data. 1 evidence item. A2 and B6 abstain too. | 2 → 1.1 (at_risk → unverified) |
| B3 control `a3-strong-health-route-control` | none | - | 2.9 verified. Components 6/6. | 2.9 verified | 2 → 2 |
| B4 `a3-strong-web-image-pointer` | `public/images/logo.png` | None. No A3 read selects `public/`. | 2.9 verified | 2.9 verified, identical. A2 abstains (it read the image), not A3. | 2 → 1.7 |
| B4 `a3-strong-helm-icon-pointer` | `helm/svc/icon.png` | `prod_readiness_primitives` health component: `isHealthCheckSignalFile` reads every file under `helm/`, `k8s/` or `kubernetes/` for a probe, whatever its type | 2.9 verified | 0 insufficient_data. 1 evidence item. A2 abstains too. | 2 → 1.4 |
| C `a3-library-entrypoint-pointer` | `server.js` | The applicability gate: `findServerEntrypointFile` reads entry-shaped files for a port binding | not_applicable | 0 insufficient_data. 1 evidence item. | 1.5 → 1.1 |
| C control `a3-library-entrypoint-control` | none | - | 0.5 warning. Components 1/6. | 0.5 warning | 1.5 → 1.5 |

In every fixture whose pointer A3 read, v27's A3 entry is the same, apart from the pointer's path:

- score 0, status `insufficient_data`, no metrics and no findings;
- one evidence item, `<pointer path>:1`, labelled "Git LFS pointer; its content is not in this
  checkout";
- the note "Cejel abstained on this criterion because relevant files in this checkout are Git LFS
  pointers, so their content was not read. This abstention rests on 1 Git LFS pointer, cited in
  this criterion's evidence. Fetch the LFS content (git lfs pull) and re-scan.";
- no disclosures;
- at report level, `A3` is in `contentReadSummary.affectedCriteria` and the read-failure scan
  limitation counts it.

No A3 entry, under either rubric, carries a disclosure.

**What a reader of the v27 reading can tell about the evidence A3 did read: nothing.** The B1 and
B2 entries are identical, so a reader cannot tell a service that v17 rates 2.9 verified, with all
six primitives, from one that v17 rates 1 warning with two. None of the read evidence is cited.
v17 cites 7 items in B1 and 2 in B2, and all of them were read from content that is present.
Under v27 they are dropped: `wholesaleCriterionAbstention` empties the signal's evidence except
the pointer citations (`repo-signals.ts:334`), and `scoreCriterion` passes on only the
LFS-labelled pointers (`scoring.ts:593`). The reading also does not say which read reached the
pointer. In B1 that read is the rollback-note scan reading a PNG under `docs/`. The report records
the criterion and the path, not the signal.

## C. When could the unread content change the rating?

The table below covers every content read A3 makes under v17 and v27
(`collectA3ProdReadinessEvidence`, `repo-signals.ts:4065-4640`; under v17 and v27 every v20-v26
flag it takes is off). A pointer read as text matches none of A3's patterns. So for each read,
the pointer gives the result the real content would give if it contained none of the matched text.

| Metric or decision | Reads | Content behind a pointer could |
| --- | --- | --- |
| Applicability gate (`isDeployableService`) | Workflows, for a deploy job. Entry-shaped files, for a port binding. Authored Dockerfiles, for a runtime `CMD`/`ENTRYPOINT`. These run only where no explicit deploy target path exists. | **Change the result**, from `not_applicable` to scored. A scored A3 enters the composite, so it can lower the composite (fixture C: 1.5 with A3 out; the control has A3 at 0.5 warning). |
| `prod_readiness_primitives`: build or type-check command | Root `package.json` scripts | Raise only (0 → 1) |
| `prod_readiness_primitives`: CI workflow, deployment configuration, environment template | Paths only | Nothing |
| `prod_readiness_primitives`: health or readiness signal | Root `Dockerfile` (`HEALTHCHECK`), every file under `k8s/`, `kubernetes/`, `helm/` (probes), and `health.*`, `readiness.*` and similar files | Raise only (0 → 1). B3 shows 2.5 → 2.9. |
| `prod_readiness_primitives`: error boundary | Path match first. Without one, implementation files are scanned for Express error middleware. | Raise only |
| `prod_workflow_depth` | Paths only | Nothing |
| `observability_depth` | Implementation files, a count of matches | Raise only |
| `rollback_safety_depth` | Every file under `docs/`, `migrations/`, `drizzle/`, `prisma/`, `scripts/`, a count of matches | Raise only |
| Evidence lines, and the runtime-container anchor | Each cited file, for its first meaningful line. Dockerfiles, for an anchor used only when no other evidence exists. | Nothing scored |

Findings A3 asserts from absence under v17 and v27:

- "A deployable service signal is present, while the ... inventory matched no CI workflow or
  release-deployment automation" (`repo-signals.ts:4547-4568`). It is decided from paths: a
  workflow or deploy target committed as a pointer still has its path. **Unread content cannot
  contradict it.**
- The warning-band finding that scoring adds from the metric-derived score ("A3 metric-derived
  score is 1.0/4.0, in the warning band ..."). It follows the score, and unread content can only
  raise the score, so it can only remove this finding.
- The not-applicable result. It asserts the absence of a deployable-service surface ("No
  deployable-service surface detected ..."), and **unread content at a file the gate reads can
  contradict it** (fixture C).

The absence findings v20-v26 add (no build script, no active `HEALTHCHECK`, no health route) read
content. v27 does not inherit them.

So, under the code at the base commit: **on a scored A3, a reading with pointers is a floor on
the content-complete reading.** No content read can lower a scored A3, so v17's reading there
never states more than the content would support. Fixture pairs: B1 and B2 equal their controls,
and B3 is 2.5 against 2.9. The one place a pointer can make A3 state more than the content would
support is the not-applicable exit. There, a pointer at a gate-read file can take A3 out of the
composite, where the content would have scored it.

This is a property of today's A3 reads, not of A3 as a criterion. Any future A3 content check
that can lower the rating would break it: for example a finding that a container runs as root, or
that compose has no restart policy. None exists now. A3 reads no Dockerfile `USER` instruction and no
compose healthcheck, volume or restart policy. A compose file earns A3 credit by its path alone,
and a Dockerfile is read only for `HEALTHCHECK` and its runtime command. At the base commit,
`git grep -c -E 'restart:|restart_policy|volumes:' -- src/witan/repo-signals.ts` finds nothing. The
looser `git grep -c -i -E 'restart|USER|volume' -- src/witan/repo-signals.ts` finds 24 lines, none
in A3's collector (`repo-signals.ts:4065-4640`). Its `USER` hits are A2's SQL `CREATE ROLE|USER ...
SUPERUSER` patterns (`:14458`, `:14464`, `:14466`). So the production-readiness evidence those
settings carry, as in the strong fixture, is not what A3 scores.

## D. Proposals for a ruling

Each rule is stated as the exact condition under which A3 abstains. None is implemented.

**(i) A3 abstains whenever it read a Git LFS pointer (as now), and the abstaining reading also
cites the A3 evidence it read.**

- Effect on the fixtures: no score, status or composite moves. B1, B2, B3, the B4 helm case and C
  stay at 0 `insufficient_data`. B1 would cite 7 read items beside the pointer, and B2 would cite
  2, so a reader could tell B1 from B2.
- v27 ≤ v17: unchanged.
- Cost in #517/#519 terms: it lets in no false assurance, since no score rises. It keeps the cost
  the operator's ruling objected to: the reading withholds a rating that, by item C, the read
  evidence already supports as a floor. It drags the composite and verdict down (B2: at_risk →
  unverified) over a PNG under `docs/`.
- Implementing it needs `scoring.ts:593` to pass on more than LFS-labelled pointers. The
  certificate would also need to say that the cited items earned no score.

**(ii) A3 abstains only where a pointer it read sits in the reach of a read whose result was
absent: the not-applicable gate, or a component or count that scored 0. Otherwise it keeps
v17's reading.**

- Effect: B1 keeps 2.9 (rollback count 1, health present). B2 abstains (rollback count 0). The
  compose pointer keeps 2.9 (no scored read). The Dockerfile pointer keeps 2.9 (health present
  through `healthcheck.js`). The health-route pointer abstains (health 0). The helm icon pointer
  keeps 2.9. C abstains. B4 web is unchanged.
- v27 ≤ v17: a kept reading equals v17's, and an abstention is 0.
- Cost: on a scored A3, the reads it abstains on can only raise A3 (item C). So the abstentions it
  keeps protect against understatement, not false assurance, and a weak service is penalised more
  than a strong one for the same pointer (B1 kept, B2 abstained). It lets in no false assurance
  under today's reads. The condition "scored 0" also misses saturating counts below their maximum,
  which unread content could raise too. Stating it as "below its maximum" would abstain B1 as
  well (rollback 1 of 4).

**(iii) A3 abstains on a Git LFS pointer only when its collector returned not applicable. When
A3 was scored, it keeps v17's score, status, metrics, findings and evidence, and adds one
disclosure naming each pointer it read and stating that unread content could only raise this
rating.**

- Effect: B1 2.9, B2 1, compose 2.9, Dockerfile 2.9, health route 2.5 and helm 2.9 are kept, each
  with the disclosure. C abstains. B4 web is unchanged.
- v27 ≤ v17: kept readings are v17's, and C is 0 against v17's `not_applicable`.
- Cost: it lets in a rating over content Cejel did not read. By item C, that rating is a floor,
  not an overstatement: the health-route case reads 2.5 where the content gives 2.9. This is the
  #519 sense of "asserts more than Cejel read" only if a reader takes the rating as complete,
  which the disclosure states it is not. The protection is lost wherever an A3 content read can
  lower the rating. None can today, so the rule would need a guard test: a pointer at each A3
  content read scores at or below its control. The rule must stay stated as this property, not
  as a list of reads. It fits #612's budget (A3 carries no collector disclosure under v17 or
  v27, so one more fits). It mirrors the not-applicable rule #749 gave A2 and B4, in the other
  direction: there the gate cannot be changed by the pointer; here the scored rating cannot be
  lowered by it.

Recommendation: (iii). It is the only one of the three whose firing condition matches item C's
finding: the not-applicable exit is the one place unread content can contradict what A3 asserts.
It does not depend on file type, which the 19 Nov measurement showed the judgements do not split
by.
