# Ruling — v26 item 6: when A5 "no claim-reality reconciliation" and A2 "tenant schema without RLS" may fire

**CONSTRAINTS-VERSION: 2026-08-01.5**

- **Status:** ruled by the operator; this file's commit carries the operator's signature.
- **Date:** 2026-10-14.
- **Applies to:** `witan-rubric-v26-prospective-2026-10-14` only. It is prospective and
  explicit-only; the public default stays v17.

## Authority

The operator ruled on 2026-10-13 (private record) that these two findings fire only when the
specific evidence that settles them is present. Otherwise they abstain, and the abstention is
disclosed on the certificate. The evidence for each rule was to be written down and signed before
any code. This record is that statement. The answers to its open questions were given on 2026-10-14.

## Principle

The rule comes from ADR-0003 ("An unobserved control is absent"). Abstention governs claims about
the world; certainty is reserved for claims about the evidence.

Both findings make claims about the world:
- A5's says the repository's claims are not reconciled against its implementation.
- A2's says tenant data is not isolated.

Neither question is settled by a file that is merely missing. So each finding may fire only when the
repository's own bytes settle the question. Otherwise Cejel says it cannot tell, and makes no
finding. ADR-0001 still applies: what was not established is disclosed, never hidden.

## Scope

- **Changes:** under v26 only, the two findings named here and their disclosure lines.
- **Unchanged under v26:** every metric, including A5 `reconciliation_artifact_depth` and A2
  `rls_policy_count` / `tenant_scope_ratio`. Whether those metrics should stop scoring an absence is
  the metric-class question of proposed ADR-0020, which this record leaves open.
- **Unchanged:** v17 and v22–v25 stay byte-stable.

## A5 — "no dedicated claim-reality reconciliation artifact"

**What v17 asserts today.** A5 needs two things present:
- a claim source (a README or a top-level doc);
- implementation files.

When both are present and no file matches Cejel's own reconciliation-artifact format, A5 reports a
warning. The format is `claim-reality-reconciliation.{md,mdx,json}`, carrying either a
`# Claim Reality Reconciliation` heading or `artifactKind: claim_reality_reconciliation`. The warning
drops to info when the repository documents its limitations.

**Why absence does not settle it.** A repository can check its claims in many forms:
- tests written from its documented examples;
- documentation generated from code;
- doc-tests;
- a verified changelog.

Not using one file format that Cejel defined is no evidence that the repository's claims are
unchecked.

**Evidence that settles it — the finding fires only when this holds:**

- **S-A5.** The repository itself names a claim-reconciliation artifact, and that artifact is absent
  from the tree.
  - **Where the name may appear:**
    - a relative link or code-span path in a claim source, `CONTRIBUTING`, or a top-level doc;
    - a path in a CI workflow step.
  - **What counts as such an artifact:** a path whose basename matches the bounded vocabulary
    `claim(s)` with `reconciliation`, `register` or `ledger`, with an optional `reality` between.
    The pattern is fixed in the implementation and tested.
  - **What the finding says:** that the repository declares the artifact at that path and the path
    is not present. It cites the declaring line.

**Otherwise:** no finding. The certificate's "What was not established" section carries:
"Whether this repository's claims are reconciled against its implementation cannot be settled from
static evidence; Cejel makes no finding on it."

**Present artifacts are unchanged.** A matching Cejel-format artifact still earns its evidence and
metric credit as today.

## A2 — "tenant-scoped schema without row-level-security policies"

**What v17 asserts today.** A2 reports a warning ("isolation gap") when both hold:
- a data-layer file (`migrations/`, `drizzle/`, `prisma/`, `*.sql`, `*.prisma`) contains a tenant
  identifier (`tenantId`, `tenant_id` and variants);
- the data layer holds no row-level-security policy file at all.

**Why absence does not settle it.** Tenant isolation is often enforced without row-level security:
- application queries scoped by tenant;
- ORM middleware;
- a schema or database per tenant;
- a database that has no row-level security at all.

A tenant column with no policies is consistent with correct isolation.

**Evidence that settles it — the finding fires only when all three hold:**

1. **T-1, row-level security is the repository's own mechanism.** The data layer contains at least
   one `ENABLE ROW LEVEL SECURITY` or `CREATE POLICY` statement.
2. **T-2, a tenant table is identifiable.** A `CREATE TABLE` statement in the same data layer
   defines a column matching the tenant identifier pattern, and the table name can be read from the
   statement.
3. **T-3, that table is uncovered.** The data layer contains neither `ENABLE ROW LEVEL SECURITY` nor
   `CREATE POLICY … ON` naming that table. A later `DISABLE ROW LEVEL SECURITY` on it counts as
   uncovered.

The finding names the table and cites its `CREATE TABLE` line. Its wording: "Table `<name>` carries a
tenant column and no row-level-security policy, while this repository enforces tenant isolation
with row-level security elsewhere."

**Otherwise Cejel abstains.** This covers:
- no row-level security anywhere;
- a Prisma-only schema;
- a table name that cannot be read;
- dynamic SQL.

There is no finding. The certificate's "What was not established" section carries: "Whether tenant
isolation is enforced outside the database cannot be settled from static evidence; Cejel makes no
finding on it."

**Prose does not settle it.** A README saying that isolation is enforced in application code
changes nothing, in either direction.

**A known change of direction, stated plainly.** v17 fires only when no policy exists at all. The
v26 rule fires only when policies exist and a tenant table lacks one. So the two rules flag
disjoint sets of repositories. This is deliberate: it is the one shape of the gap that the
repository's own bytes settle.

## Constraints on the implementation

- **Gating:** every change is gated on the v26 identifier alone.
- **How the abstention is expressed:** as a disclosure line plus the absence of the finding. It is
  never criterion-level `insufficient_data`: ADR-0020 records that this wipes sibling metrics.
- **Fixtures:** each settling condition gets its own positive and negative fixture. Each "otherwise"
  branch gets a fixture that asserts the disclosure line is present and the finding is absent.
  Fixtures are synthetic, built from the shapes above, never from any calibration case.
- **The T-2 and T-3 table matching** is bounded and tested against:
  - quoted and schema-qualified names;
  - case differences;
  - `IF NOT EXISTS`;
  - multiple statements per file.

  A name it cannot normalise abstains.

## Answers recorded with this ruling (operator, 2026-10-14)

- **A5 `reconciliation_artifact_depth`:** unchanged under v26. It goes to ADR-0020's metric-class
  decision.
- **README prose about application-level isolation:** has no effect.
- **This record:** lands at `docs/calibration/v26/ruling-item-6.md`, in an operator-signed commit
  merged with a merge commit.
