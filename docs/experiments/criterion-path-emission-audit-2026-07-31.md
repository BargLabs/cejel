# Cejel A1-B6 criterion path-emission audit — 2026-07-31

Status: measured at Cejel `cd8d225881996273ad59702dd020c70eb90a7458`

Machine-readable matrix: `criterion-path-emission-audit-2026-07-31.json`

Scope: the native A1-B6 repository signals reached through `scoreRepoWithPublicCejel`.
Operator-ingested findings and opt-in domain packs are excluded.

This is a measurement of the evidence interface. It changes no collector, rule, heuristic,
score, rubric version, or leaderboard artifact.

## Result

**9 of 11** native criteria can emit a structured `evidence.path` somewhere: A1-A5, B2-B4,
and B6. B1 and B5 cannot; repository scans always construct them as `not_applicable` with empty
positive evidence and findings.

The dual-control experiment uses a narrower predicate than “any structured path.” Its `cited`
definition reads only `criterion.findings[]` and requires that `finding.evidence.path` exactly
equals the defect-file path. Under that predicate, only **6 of 11** criteria are citation-capable:
A1, A2, A3, A4, A5, and B6. B2, B3, and B4 can emit path-bearing positive evidence but their
native collectors never emit findings. B1 and B5 emit neither channel.

That distinction bounds recall by construction. A path-bearing B2/B3/B4 positive observation can
never count as `cited` under the current predicate. B1/B5 cannot supply any path. If a denominator
is described in criterion terms, the current upper observable surface is 6/11 (54.5%), not 9/11.
The 16 dual-control seeds are not one-per-criterion and all four seeded defect classes were reported
as unclaimed Cejel coverage, so **no numeric 6/11 multiplier may be applied to the 16-seed recall
denominator**. A seed-level upper bound would require a preregistered seed-to-criterion mapping that
does not exist.

Every publication of a result under this `cited` predicate must state all of the following beside
its numerator and denominator:

1. `cited` means an exact defect-file equality against `criterion.findings[].evidence.path`, not
   any path-bearing positive evidence;
2. at the audited Cejel revision, six native criteria can produce such a finding path, three more
   can produce only positive-evidence paths, and two can produce no path; and
3. the reported seed denominator covers only its named defect classes and must not be described as
   recall across all 11 criteria.

## Eleven-criterion matrix

“Positive path” and “finding path” mean that at least one executable native collector branch can
place a path-bearing `WitanEvidencePointer` in that channel. “Observed PC-01” is narrower still: it
records what the control actually produced, not what source inspection says is possible.

| Criterion | Native collector | Positive path | Finding path (`cited`-eligible) | Any path | Observed PC-01 | Code evidence |
|---|---|---:|---:|---:|---:|---|
| A1 | `collectA1TestIntegrityEvidence` | yes | yes | yes | no | `evidenceForRelative` builds test/config/coverage pointers; scheduled-health and authenticated-absence findings construct or reuse them. |
| A2 | `collectA2IsolationEvidence` | yes | yes | yes | **yes** | `evidenceForRelative` / `evidenceForRelativeAtLine` build secret/data-layer pointers; committed-secret findings cite the measured match path. |
| A3 | `collectA3ProdReadinessEvidence` | yes | yes | yes | no | `evidenceForRelative` builds deploy/readiness pointers; the missing-automation finding reuses `firstEvidence`. |
| A4 | `collectA4DependencyEvidence` | yes | yes | yes | no | `evidenceForRelative` builds manifest/lock/update pointers and dependency findings construct manifest pointers. |
| A5 | `collectA5ClaimRealityEvidence` | yes | yes | yes | no | `evidenceForRelative` builds claim/implementation pointers; the reconciliation-gap finding reuses `firstEvidence`. |
| B1 | `buildNotApplicableSignal` | no | no | no | no | `collectRepoSignals` always returns repository-scan B1 as N/A; the helper returns both arrays empty. |
| B2 | `collectB2PrTraceEvidence` | yes | no | yes | no | `evidenceForRelative` builds workflow/template/review-gate pointers; the collector returns `findings: []`. |
| B3 | `collectB3CiDisciplineEvidence` | yes | no | yes | no | `evidenceForRelative` builds package-script/workflow pointers; the collector returns `findings: []`. |
| B4 | `collectB4AuditEvidence` | yes | no | yes | no | `evidenceForRelative` builds audit/changelog pointers; the measured branch returns `findings: []`. |
| B5 | `buildNotApplicableSignal` | no | no | no | no | `collectRepoSignals` always returns repository-scan B5 as N/A; the helper returns both arrays empty. |
| B6 | `collectB6PrivilegedOpsGatingEvidence` | yes | yes | yes | no | `evidenceForRelative` builds governance pointers and ungated-escalation findings construct executable-file pointers. |

## End-to-end path trace

1. `src/witan/repo-signals.ts` constructs native pointers through `evidenceForRelative` or
   `evidenceForRelativeAtLine`; both set `path` directly. Some A2 history branches construct the
   same schema-shaped pointer inline.
2. `src/witan/schemas.ts` permits optional `path` on `WitanEvidencePointerSchema`, nests it in both
   `positiveEvidence` and `WitanFindingSchema.evidence`, and nests both channels in each criterion.
3. `src/witan/scoring.ts` carries `signal.positiveEvidence` and `signal.findings` through
   `scoreCriterion`, assigns `scored.evidence` and `scored.findings` to the criterion score, then
   validates the complete object with `WitanReportSchema.parse`.
4. `src/witan/attestation.ts` serializes the validated report with `JSON.stringify`, so
   `report.json` retains both path-bearing channels. The MCP JSON format returns that same full
   report. `summary.json` is intentionally compact and does not retain evidence pointers.
5. `src/witan/markdown.ts` and `src/witan/html.ts` render both positive evidence and finding
   evidence, including `path` and measured `line` where present.

## PC-01 reconciliation

At Alfred harness commit `28fb2365dd1fa4952f63b2d1506cf248d31148c0`, PC-01 was frozen as a
credential-shaped assignment in `src/subject.mjs`. The predicate selected only native findings
whose `evidence.path === 'src/subject.mjs'`. Recorded result commit
`a506a5e8aaa89862a8288a208aa083e685e47fbc` reports that A2 emitted the exact path.

This is consistent with the matrix: A2 is one of the six finding-path-capable criteria. It proves
that the static-rubric wiring and fixture shape could produce one exact-path finding. It does not
establish observation of A1, A3-A5, B1-B6; it does not test B2/B3/B4 positive-evidence paths; and it
does not enter the seeded, held-out, per-class, or clean-control denominators. This audit reconciles
the recorded control but did **not** independently rerun it.

## Reproduction guard and score boundary

Run:

```bash
pnpm audit:path-emission
# Dependency-free equivalent:
node --test scripts/criterion-path-emission-audit.node-test.mjs
```

The guard checks the machine-readable matrix against the current native rubric, executable
collector functions, pointer schema, scoring pass-through, JSON serialization, and Markdown/HTML
path rendering. It also requires exactly one PC-01 observation (A2) and the denominator scope above.

Red proof before these two audit artifacts existed:

```text
tests 3; pass 1; fail 2
ENOENT: criterion-path-emission-audit-2026-07-31.json
ENOENT: criterion-path-emission-audit-2026-07-31.md
```

Green proof after the artifacts landed:

```text
tests 3; pass 3; fail 0
```

The baseline `leaderboard/` Git tree is
`696c995a7486bd4e9ede08a18cc0b995100ef8b5`. This lane must leave that tree unchanged, and
`git diff origin/main -- leaderboard` must remain empty. No leaderboard repository was rescanned
because this lane changes no executable criterion or scoring behavior.

## Follow-up boundary

This artifact does not edit Alfred ADR-0013 or the dual-control result, because the denominator
lane owns those files. Before another result is published, that owner must carry the three-part
`cited` scope statement above into the result beside every affected denominator. Until that lands,
the existing result's criterion-surface qualification remains incomplete.
