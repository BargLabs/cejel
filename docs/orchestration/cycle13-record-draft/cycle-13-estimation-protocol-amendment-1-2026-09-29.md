> Republished from the operator's private calibration records, signed there; this copy is the public record.

# Cycle 13 — estimation protocol, amendment 1: the unclassified wording, and the allocation arithmetic

**CONSTRAINTS-VERSION: 2026-08-01.5**

**Status: SIGNED by the operator commit that adds this file.** Amends `docs/calibration/cycle-13-estimation-protocol.md` (signed,
source `a72bf4f8`, (private record)). The protocol file is not edited. The one ruling (§2) was made by the operator on 2026-09-30. No case has
been drawn: the unit-table run (private record) stopped before `draw`, as §2 of the protocol requires when a
finding is unclassifiable.

## 1. What stopped the run

The unit table read all 386 reports and classified 1,930 units (849 out of population). Eighteen
findings, from eight distinct summaries, matched no rule and are not metric-band findings. They
sat in templates the 2026-09-28 inventory suppressed (fewer than 3 members), which is why the rule
table did not cover them. The operator read the eight summaries in custody on 2026-09-29. Counts
per arm:

| Criterion | Severity | Summary (paths and quoted strings replaced) | v17 | v23 |
|---|---|---|---:|---:|
| A1 | warning | A test runner is configured, but … matched no concrete test file. | 1 | 1 |
| A2 | critical | A PEM-formatted private key appears committed in the scanned repository. | 0 | 1 |
| A2 | critical | A PEM-formatted private key appears in recent git history. | 0 | 2 |
| A2 | critical | An explicit default administrative credential appears committed in production configuration. | 2 | 2 |
| A2 | critical | Secret-shaped value appears in recent git history. | 1 | 1 |
| A2 | warning | A <path> value appears compared with a plain equality operator instead of a constant-time comparison — potential timing side-channel. | 2 | 2 |
| A2 | warning | A tenant-scoped schema signal is present, while … matched no row-level-security policy. | 1 | 1 |
| A3 | info | A production HTTP entrypoint handles requests directly but declares no health or readiness route. | 0 | 1 |

## 2. Rows added to the §2 rule table

Existing rule identifiers are reused where the lineage already defines them (cycle 12 and the
alfred classifier use each of these). Where a new wording is the same defect as an existing rule,
it maps to that rule rather than creating a new one, so a v23-only detection of a known defect
counts as a discordant unit of that rule.

| Rule | Criterion | Pattern (substring of the 0.4.11 summary) | Basis |
|---|---|---|---|
| `CORE-A1-NO-TEST-FILES` | A1 | `A test runner is configured, but` … `matched no concrete test file.` (anchored at the end, so it never matches the longer `CORE-A1-AUTHENTICATED-TEST-ABSENCE` wording, which continues with a comma) | cycle-12 rule |
| `CORE-A2-COMMITTED-SECRET` | A2 | `A PEM-formatted private key appears committed in the scanned repository` | same defect; v23's PEM grammar is the only arm that sees it |
| `CORE-A2-COMMITTED-SECRET` | A2 | `An explicit default administrative credential appears committed in production configuration` | the instrument emits this as a committed-secret variant (`repo-signals.ts`) |
| `CORE-A2-HISTORY-SECRET` | A2 | `A PEM-formatted private key appears in recent git history` | same defect, v23 PEM grammar |
| `CORE-A2-HISTORY-SECRET` | A2 | `Secret-shaped value appears in recent git history` | cycle-12 rule |
| `CORE-A2-NONCONSTANT-SECRET-COMPARE` | A2 | `appears compared with a plain equality operator instead of a constant-time comparison` | cycle-12 rule |
| `CORE-A2-TENANT-WITHOUT-RLS` | A2 | `matched no row-level-security policy` | cycle-12 rule |
| `CORE-A3-HTTP-NO-HEALTH-ROUTE` | A3 | `A production HTTP entrypoint handles requests directly but declares no health or readiness route` | admitted by the ruling below |

`CORE-A2-COMMITTED-SECRET`'s defect proposition, for labelling, is: a real credential, key or
secret is present in a tracked file at the pinned revision, including a default administrative
credential in production configuration; a placeholder, a test or fixture value, or a value the
file itself marks as an example is `absent`.

### OPERATOR RULING — the third pin-native A3 family

`A production HTTP entrypoint handles requests directly but declares no health or readiness route`
is the third pin-native family cycle 12 set aside, alongside the two admitted on 2026-09-28. v23
emits it once on this cohort, v17 never.

- **(a) Admit as `CORE-A3-HTTP-NO-HEALTH-ROUTE`**, for consistency with Ruling 1: the defect is
  present only if the service exposes no health or readiness endpoint and no tracked file
  (platform manifest probe, orchestration health check, reverse-proxy check) supplies one.
- **(b) Classify it as a non-candidate family** and report its one finding as unmeasured.

Recommended **(a)**: Ruling 1 measured v23's pin-native additions because they are what v23 emits
and v17 does not. Leaving the third one out would be an inconsistency made after seeing that it
occurs once.

> Ruling: **(a)**, admitted as `CORE-A3-HTTP-NO-HEALTH-ROUTE` with the proposition above
> (operator, 2026-09-30, in session).

## 3. Allocation arithmetic, left open by the protocol and the card

Both are as implemented in (private record) and are fixed here:

1. **Shares.** With `R = 180 − D`, the candidate side (`C/C`) is `floor(R / 3)` and the
   non-emitting side (`N/N` and `X/X`) is `R − floor(R / 3)`.
2. **Floor, then re-split.** Within a side, a non-empty stratum whose proportional share is below
   2 receives exactly 2; the side's remaining budget is re-split proportionally over the other
   strata; leftover places go by largest remainder, ties by rule id then class. If the floors alone
   exceed the side's budget, the draw stops.
3. **Pattern matching** for every rule, including the admitted A3 rules, is a plain substring of the
   finding summary, as in the protocol's §2, except where a row above states an anchor.

## 4. Where the draft addendum goes

The unit-table card directed its draft draw addendum to `docs/calibration/`, an authority path
since (private record). An agent-authored draft goes to (private record),
unsigned; the operator's signed addendum is his own commit under `docs/calibration/`.

## 5. Expected effect, stated before the re-run

- Unclassifiable: **0**.
- `D`: the provisional 25 plus the v23-only units these rows create (PEM committed 1, PEM history 2,
  and HTTP health route 1 under Ruling (a)), less any overlap with units already discordant: about
  **28 to 29**.
- Nothing else in the protocol changes.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Signed at: `2026-09-30T22:50:18Z`
- Rows added: the eight in §2
- Third pin-native family: admitted as `CORE-A3-HTTP-NO-HEALTH-ROUTE`
- Allocation arithmetic: as §3
- Signature: Houman Azimi-Nejadi — cycle-13 estimation protocol amended before any case is drawn:
  the eight unclassified summaries mapped to existing rules or ruled on, allocation arithmetic
  fixed, and agent drafts kept off authority paths
