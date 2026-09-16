# Cycle-12 draw addendum — §4's seed and allocation, fixed and recorded

> **Published transcription, redacted.** Operator-signed source record, held in the private
> measurement repository. **The 119 drawn case ids are withheld** — see "The draw" below and
> [`REDACTIONS.md`](REDACTIONS.md). Path, pull-request and commit references below are that
> repository's and do not resolve here; they are code spans, not links.

Status: **IN FORCE — operator-signed.** No draw is authorized and no id below is spent until the operator
signature block is complete. On signing, all 119 ids are spent whether or not the review
completes, per the standing rule.

Fulfils `cycle-12-estimation-protocol.md` §4's "seed fixed and recorded here" requirement as a
companion record (the protocol file itself is not modified). Method, population, spent ledger,
ceilings and decision rule are the signed protocol's; this record adds only the budget, the
allocation, the seed, and the drawn ids.

## Budget and scope

Operator-set review budget: **120 cases** (40 candidates / 80 controls) — realized as **119**
after one honest exhaustion (below). Controls are deliberately weighted ~2:1 over candidates:
recall's denominator and the untested control-side decidability risk both live there, while
candidate decidability was measured at 0-of-40 insufficient-context in cycle 11.

**Scope consequence, stated up front:** all 80 control slots go to the seven candidate-bearing
strata. The zero-candidate rules (`CORE-A1-EPHEMERAL-HEALTH`, `CORE-A2-UNSORTED-SIGNATURE`,
`CORE-A4-SUSPICIOUS-DEPENDENCY`, `CORE-B6-UNGATED-PRIVILEGE-ESCALATION`) and the spent-out
rules (`CORE-A2-CURRENT-ENV`, `CORE-A2-TENANT-WITHOUT-RLS`, `CORE-A1-NO-TEST-FILES`,
`CORE-A3-NO-CI-DEPLOY`, `CORE-A4-NO-LOCKFILE`) receive no draw, resolve via
`missingRulePolicy: inconclusive-no-go`, and are excluded from the headline figure and reported
in the validity verdict — a budget-forced scope decision recorded here, never a silent omission.
The headline figure this cycle therefore describes the seven measured rules only, and every
publication of it must say so.

## Allocation (against §2's table minus the 160-identity spent ledger)

Identity resolution: **v8 sealed key only** (`packets-fullcohort-v8-2026-09-02/sealed-output/
finding-review/key.json`), per §4's identity-resolution requirement.

| rule | cand avail | cand drawn | ctrl avail | ctrl drawn |
|---|---|---|---|---|
| `CORE-A5-NO-RECONCILIATION` | 68 | 10 | 53 | 14 |
| `CORE-A1-NO-COVERAGE-CONFIG` | 38 | 10 | 55 | 13 |
| `CORE-A1-AUTHENTICATED-TEST-ABSENCE` | 12 | 8 | 56 | 13 |
| `CORE-A2-HISTORY-ENV` | 10 | 5 | 9 | **9 — stratum exhausted** |
| `CORE-A2-COMMITTED-SECRET` | 7 | 4 | 60 | 10 |
| `CORE-A2-HISTORY-SECRET` | 4 | 2 | 23 | 10 |
| `CORE-A2-NONCONSTANT-SECRET-COMPARE` | 2 | 1 | 55 | 10 |
| **total** | **141** | **40** | — | **79** |

## The draw

**Seed:** `cycle-12-estimation-draw-2026-09-05`
Method: §4's — within each (rule, kind) stratum, ids ordered by `sha256(seed + caseId)`, first
N taken, over the v8 key minus the 160 spent identities.

**Drawn ids (119, all distinct, v8-build positional):**

> **Withheld under the disclosure boundary; digest published.**
>
> The signed source record lists all 119 drawn case ids at this point. They are withheld here
> under the closed-class item *cohort member identities*: the cycle-12 cohort is spent, but
> retirement is a separate signed act and has not occurred. Spent frame membership is revealed
> at retirement and not before.
>
> The commitment that stands in their place — pin, seed, selection method, allocation, and case
> count, which together determine the drawn set exactly — is published in
> [`README.md`](README.md) under "Membership: committed to, not yet revealed", together with the
> specification of the manifest digest over these 119 ids. **That digest value is owed and is
> not yet computed;** the specification is published so the value is fixed in advance rather
> than chosen later. Nothing about this withholding is silent: the list exists, its extent is
> stated (119, 40 candidates and 79 controls, all distinct), and it is recomputable at
> retirement from the seed and method above.

## Execution

Per §8 (the Amendment 3 split, unchanged): the operator verifies these ids against the v8
sealed key, labels in the field-parity viewer against the v8 public packets, blinded, restricted
to the drawn ids by the fail-closed resume mechanism. Controls are judged per the reviewer
standard's should-this-rule-have-fired question. No agent authors, suggests, or pre-fills any
label. On completion, the v3 estimator (`untouched-estimator-spec-v3.json`, merged signed) runs
once over the labels and outputs figure + CI + validity verdict per §5 — and nothing else.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Signed at: 2026-09-05T14:42:16Z
- Signature: Houman Azimi-Nejadi — cycle-12 draw authorized: budget 120 realized as 119, seven measured rules with the scope consequence recorded, one control stratum honestly exhausted, seed and 119 ids fixed and spent on signing, identity resolution via the v8 sealed key only
