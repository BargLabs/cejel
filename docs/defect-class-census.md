# Defect-class census

<!-- GENERATED FILE. Do not hand-edit. Regenerate with:
       pnpm exec tsx scripts/derive-defect-class-census.ts
     and verify with:
       pnpm exec tsx scripts/derive-defect-class-census.ts --check
     Source: src/census/defect-class-census.ts -->

**This is a coverage-breadth census, not a recall or precision claim.** A class marked
`covered` or `partial` means a shipped rule exists and states a mechanism targeting it —
never that the rule reliably catches instances of that class in the wild, and never a
substitute for the bounded in-scope recall records linked at the end of this document. No
recall or precision figure appears anywhere below.

**CONSTRAINTS-VERSION: 2026-08-01.5**

## Method

The rule inventory below is extracted mechanically, never hand-typed, from two structures in
this repository's current state:

1. `WITAN_RUBRIC` and `WITAN_TRADING_RUBRIC_V0`, the certificate criteria arrays exported
   from `src/witan/rubric.ts` (11 core + 9 trading-domain criteria).
2. The D-series rule-contract docs under `docs/packs/d-series-d*-rule-contract.md`, each
   naming its own `Rule ID` — cross-referencing the exported detectors in
   `src/packs/d-series/index.ts`.

Every rule this repository currently ships has an entry in `RULE_DISPOSITIONS`
(`src/census/defect-class-census.ts`), including rules that target nothing in these three
taxonomies (an explicit "reviewed, targets nothing" record, not a silent omission). The
generator asserts that the mechanically-derived rule-ID set exactly equals the set of
disposition entries before rendering; a rule added to either structure above with no
corresponding entry — or a stale entry for a rule no longer shipped — throws and fails CI
instead of silently going uncensused (`src/census/__tests__/defect-class-census.test.ts`
demonstrates this).

**A note on scope.** The D-series detectors live in `src/packs/d-series/`, not
`src/witan/` — a separate, opt-in surface. ADR-0013 and each rule-contract doc state they
do not feed the Witan rubric, certificate score, or leaderboard. They are included here
because this census's third taxonomy *is* the D-series, and omitting the one place cejel
ships D-series detectors would misstate the boundary this document exists to publish. This
inclusion is itself a judgment call — see "Judgment calls" below.

## CWE Top 25 (2024)

Source: <https://cwe.mitre.org/top25/archive/2024/2024_cwe_top25.html>. Rank order below reflects the published list; verify
against the source before relying on exact rank for anything beyond this document.

| Class | Name | Status | Rule(s) and mechanism |
|---|---|---|---|
| CWE-79 | Improper Neutralization of Input During Web Page Generation ('Cross-site Scripting') | not targeted | — |
| CWE-787 | Out-of-bounds Write | not targeted | — |
| CWE-89 | Improper Neutralization of Special Elements used in an SQL Command ('SQL Injection') | not targeted | — |
| CWE-352 | Cross-Site Request Forgery (CSRF) | not targeted | — |
| CWE-22 | Improper Limitation of a Pathname to a Restricted Directory ('Path Traversal') | not targeted | — |
| CWE-125 | Out-of-bounds Read | not targeted | — |
| CWE-78 | Improper Neutralization of Special Elements used in an OS Command ('OS Command Injection') | not targeted | — |
| CWE-434 | Unrestricted Upload of File with Dangerous Type | not targeted | — |
| CWE-20 | Improper Input Validation | not targeted | — |
| CWE-862 | Missing Authorization | partial | **A2**: Native-RLS mode flags a tenant-scoped storage/migration file with no row-level-security policy defined for it (collectA2IsolationEvidence, nativeRlsInventory/tenantWithoutRlsPremiseFiles). _Gap: Only the Postgres-native-RLS multi-tenant shape is checked; any other authorization-boundary omission (missing ACL check, missing ownership check outside RLS) is not detected._<br>**B6**: collectB6PrivilegedOpsGatingEvidence flags a file that executes a SET ROLE/privilege-escalation statement (SQL_EXEC_PATTERN) with no preceding GATED_PRIVILEGE_CHECK_PATTERN (pg_has_role/has_role membership check) in the same file. _Gap: Narrow to the SQL role-escalation shape; general missing-authorization checks elsewhere in application code are not covered._ |
| CWE-476 | NULL Pointer Dereference | not targeted | — |
| CWE-287 | Improper Authentication | not targeted | — |
| CWE-190 | Integer Overflow or Wraparound | not targeted | — |
| CWE-918 | Server-Side Request Forgery (SSRF) | not targeted | — |
| CWE-119 | Improper Restriction of Operations within the Bounds of a Memory Buffer | not targeted | — |
| CWE-416 | Use After Free | not targeted | — |
| CWE-863 | Incorrect Authorization | not targeted | — |
| CWE-94 | Improper Control of Generation of Code ('Code Injection') | not targeted | — |
| CWE-502 | Deserialization of Untrusted Data | not targeted | — |
| CWE-77 | Improper Neutralization of Special Elements used in a Command ('Command Injection') | not targeted | — |
| CWE-269 | Improper Privilege Management | partial | **B6**: Same executed-privilege-escalation-without-gate mechanism as CWE-862 above, read as improper privilege management rather than missing authorization. _Gap: Same narrow SQL-role-escalation shape only._ |
| CWE-798 | Use of Hard-coded Credentials | covered | **A2**: findCommittedSecretInFile + looksLikeSecretValue scan authored source for branded API-key prefixes (sk-, ghp_, AKIA…) and high-entropy generic tokens assigned to secret-shaped identifiers (src/witan/repo-signals.ts, SECRET_VALUE_BRANDED_PATTERN/GENERIC_SECRET_SHAPE_PATTERN), independent of a .gitignore/archetype gate. |
| CWE-200 | Exposure of Sensitive Information to an Unauthorized Actor | partial | **A2**: Same committed-secret scan as CWE-798 — a hardcoded secret is one narrow, concrete instance of sensitive-information exposure. _Gap: Does not detect exposure via verbose errors, logs, response bodies, or any channel other than a secret literal committed to source._ |
| CWE-400 | Uncontrolled Resource Consumption | not targeted | — |
| CWE-306 | Missing Authentication for Critical Function | not targeted | — |

**Counts:** covered 1, partial 3, not targeted 21 (of 25).

## OWASP Top 10 (2021)

Source: <https://owasp.org/Top10/>.

| Class | Name | Status | Rule(s) and mechanism |
|---|---|---|---|
| A01:2021 | Broken Access Control | partial | **A2**: Same tenant-without-RLS-policy check as CWE-862 — a missing authorization boundary for multi-tenant data. _Gap: Limited to the native-RLS shape; general broken access control (IDOR, missing function-level auth) is not checked._ |
| A02:2021 | Cryptographic Failures | partial | **A2**: Crypto-hygiene nudge: flags a plain ===/!== compare of an hmac/signature/digest-named value (INSECURE_SECRET_COMPARE_LINE_PATTERN, non-constant-time) and a sign/HMAC call with no canonical-serialization step first (CANONICAL_SERIALIZE_PATTERN + SIGN_OR_HMAC_CALL_PATTERN). _Gap: Explicitly a low-severity "nudge" (code comment: never scored critical) covering two narrow patterns; no coverage of key management, weak algorithms, or transport-layer crypto._ |
| A03:2021 | Injection | not targeted | — |
| A04:2021 | Insecure Design | not targeted | — |
| A05:2021 | Security Misconfiguration | not targeted | — |
| A06:2021 | Vulnerable and Outdated Components | partial | **A4**: collectA4DependencyEvidence checks for a lockfile, a dependency-update bot config (Dependabot/Renovate), an audit script, and pinned version specs. _Gap: No CVE/advisory database lookup — this is a process-hygiene proxy for reducing exposure, not a scan for actually-vulnerable component versions._ |
| A07:2021 | Identification and Authentication Failures | covered | **A2**: Same committed-secret scan as CWE-798; hard-coded credentials are the OWASP A07 example this rule directly matches. |
| A08:2021 | Software and Data Integrity Failures | not targeted | — |
| A09:2021 | Security Logging and Monitoring Failures | partial | **B4**: collectB4AuditEvidence checks that agent dispatch/PR operations get logged and reported up to a human-visible surface — the same "was this operation observable after the fact" question A09 asks. _Gap: This is agent-operation audit-trail completeness (did the agent log what it did), not application runtime security-event logging (failed auth attempts, intrusion alerting) — a judgment call flagged for reviewer attention, not a confident match._ |
| A10:2021 | Server-Side Request Forgery (SSRF) | not targeted | — |

**Counts:** covered 1, partial 4, not targeted 5 (of 10).

## cejel's own D1-D8 agent-defect taxonomy

D1-D6 are canonically defined and implemented in this repo (`docs/packs/d-series-d{1-6}-rule-contract.md`,
`src/packs/d-series/`). Their originating decision record, [ADR-0013](https://github.com/BargLabs/alfred/blob/233a7a962eb280c7730495bb07bdba1073e8c85c/docs/adr/0013-d-series-detection-rules.md),
lives in the alfred repo (external to cejel) and is cited here per this census's own rule:
locate the canonical description, and cite it as external if it lives only in alfred.

| Class | Name | Status | Rule(s) and mechanism |
|---|---|---|---|
| D1 | Declared-but-unread config | partial | **D1**: D1-config exact signature: a binding-boolean key (require*/enforce*/fail*/must*/allow*/enable*/disable*) in an exported config/schema object or Markdown frontmatter, with a sibling read and no read site in the resolved first-party TypeScript module graph (docs/packs/d-series-d1-rule-contract.md). _Gap: ADR-0013 (alfred): "narrower than 'declared-but-unread config'" — arbitrary declared-but-unread configuration is not covered, only this one binding-boolean shape. The historical semantic-D1 seed corpus scored 0/3 cited._ |
| D2 | Swallowed error | partial | **D2**: Exact signature: an awaited operation with a static success return, and a sole-statement catch with a simple unused binding and a static failure return (docs/packs/d-series-d2-rule-contract.md). _Gap: General swallowed-error behavior (any catch that discards its error) is not covered, only this exact awaited/return shape. No seed exists in the historical corpus to measure semantic recall against._ |
| D3 | Unasserted set transform | partial | **D3**: Exact signature: a direct-parameter .filter call, an empty explanation ledger, and an exact literal-success return (docs/packs/d-series-d3-rule-contract.md). _Gap: General unasserted set transforms (most .filter calls are fine) are explicitly not claimed. Historical semantic-D3 seed corpus scored 0/5 cited._ |
| D4 | Pass-by-absence | partial | **D4**: Exact signature: a three-statement caller and three-state callee (failure, successful emptiness, successful population) conflating empty-but-successful with populated (docs/packs/d-series-d4-rule-contract.md). _Gap: The general form — "an empty result was wrong here" — is undecidable statically and is explicitly not claimed. Historical semantic-D4 seed corpus scored 0/4 cited._ |
| D5 | Self-referential verification | partial | **D5**: Exact signature: a supported equality assertion in a recognized test path, with a named expected import and a separately exercised actual import from the same first-party module under test (docs/packs/d-series-d5-rule-contract.md). _Gap: General verification independence is not covered, only this narrow same-module-import shape. Historical semantic-D5 seed corpus scored 0/4 cited._ |
| D6 | Unobserved control / partial-view inference | partial | **D6**: Uncalibrated proposal, two exact signatures in .sh/.bash files only: a self-announcing control name neutralised before a success report, or a removal/deploy operation followed by an unconditional success report (docs/packs/d-series-d6-rule-contract.md). _Gap: Shell-script-only; not wired into `cejel scan`, does not appear in a released certificate, and does not feed the Witan rubric or leaderboard. A zero-finding result means no exact signature matched, not that no unobserved control exists._ |

**D7 and D8 are not canonically defined** in either cejel or alfred as of this census. They
appear only as reserved classification labels in tooling (e.g. `scripts/stratum-b-ledger.mjs`'s
`'Outside D1-D8'`/`'D7'` seed tags) — never as a detector, a rule-contract doc, or a one-line
definition. Marked `not targeted` below because there is no rule and no defined class to
target; this absence-of-definition is itself flagged in "Judgment calls."

**Counts:** covered 0, partial 6, not targeted 2 (of 8, including D7/D8).

## Judgment calls for reviewer attention

- **B4 → OWASP A09:2021** (partial): B4 checks agent-operation audit-trail completeness
  (dispatch/PR logging reported up to a human), not application runtime security-event
  logging (failed auth attempts, intrusion alerting). Marked partial rather than not
  targeted because both are, at root, "was this operation observable after the fact" — but
  the reviewer may reasonably disagree with rounding this up at all.
- **D-series inclusion**: the D-series pack lives outside `src/witan/` and does not feed the
  certificate. Including it as a second rule source (see "A note on scope" above) is a
  scope decision, not a mechanical necessity — a narrower reading of this census's own
  extraction instruction would have left D1-D6 `not targeted` by the certificate-facing
  rule inventory, which is also true and arguably the more literal reading.
- **D7/D8 non-definition**: this census reports their absence rather than inventing a
  definition. A reviewer with access to the operator's private lab notes may know of an
  unpublished definition this census could not see.
- **CWE-862 vs. CWE-863** (A2's RLS check, B6's privilege-gating check): classified under
  CWE-862 (Missing Authorization — no check present) rather than CWE-863 (Incorrect
  Authorization — a check exists but is wrong), since both mechanisms detect the *absence*
  of a check, not a flawed one. A reviewer may weigh this differently.
- **Every rule marked `partial` in the D-series table** carries the same gap: cejel's own
  2026-08-01 ADR correction states the D-series rules implement "narrow exact signatures,
  not the semantic classes their technical IDs name" — this census follows that correction
  rather than rounding any of them up to `covered`.

## Depth claims — see instead

This document makes no recall or precision claim. For bounded in-scope recall figures, see:

- `docs/experiments/in-scope-detection-recall-v3-result-2026-08-09.md`
- `docs/experiments/in-scope-detection-recall-v4-result-2026-08-11.md`
