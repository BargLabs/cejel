// Defect-class census — mechanically derives cejel's shipped detection-rule inventory
// (from src/witan/rubric.ts and the D-series rule-contract docs) and classifies it against
// three external/internal defect taxonomies. See docs/defect-class-census.md for the
// generated report and scripts/derive-defect-class-census.ts for the CLI that writes it.
//
// This module is a breadth census, not a recall/precision instrument: "covered" means a rule
// exists and states a mechanism, never that the rule works or that the class is handled
// generally. See RULE_DISPOSITIONS below for the one judgment-call layer that cannot be
// derived from code — the classification of each rule against each taxonomy class.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WITAN_RUBRIC, WITAN_TRADING_RUBRIC_V0 } from '../witan/rubric.js';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export type TaxonomyId = 'cwe-2024' | 'owasp-2021' | 'd-series';
export type CoverageStatus = 'covered' | 'partial' | 'not targeted';

export interface TaxonomyClass {
  readonly id: string;
  readonly name: string;
}

export interface RuleTarget {
  readonly taxonomy: TaxonomyId;
  readonly classId: string;
  readonly status: 'covered' | 'partial';
  readonly justification: string;
  readonly gap?: string;
}

export interface RuleDisposition {
  readonly title: string;
  readonly source: 'witan-core' | 'witan-trading-v0' | 'd-series';
  readonly targets: readonly RuleTarget[];
}

export interface RuleRef {
  readonly id: string;
  readonly title: string;
  readonly source: 'witan-core' | 'witan-trading-v0' | 'd-series';
}

/**
 * The 2024 CWE Top 25 Most Dangerous Software Weaknesses, in the order published.
 * External standard — not derivable from this repo. Verify against the source before
 * relying on exact rank order: https://cwe.mitre.org/top25/archive/2024/2024_cwe_top25.html
 */
export const CWE_TOP_25_2024_SOURCE =
  'https://cwe.mitre.org/top25/archive/2024/2024_cwe_top25.html';

export const CWE_TOP_25_2024: readonly TaxonomyClass[] = [
  { id: 'CWE-79', name: "Improper Neutralization of Input During Web Page Generation ('Cross-site Scripting')" },
  { id: 'CWE-787', name: 'Out-of-bounds Write' },
  { id: 'CWE-89', name: "Improper Neutralization of Special Elements used in an SQL Command ('SQL Injection')" },
  { id: 'CWE-352', name: 'Cross-Site Request Forgery (CSRF)' },
  { id: 'CWE-22', name: "Improper Limitation of a Pathname to a Restricted Directory ('Path Traversal')" },
  { id: 'CWE-125', name: 'Out-of-bounds Read' },
  { id: 'CWE-78', name: "Improper Neutralization of Special Elements used in an OS Command ('OS Command Injection')" },
  { id: 'CWE-434', name: 'Unrestricted Upload of File with Dangerous Type' },
  { id: 'CWE-20', name: 'Improper Input Validation' },
  { id: 'CWE-862', name: 'Missing Authorization' },
  { id: 'CWE-476', name: 'NULL Pointer Dereference' },
  { id: 'CWE-287', name: 'Improper Authentication' },
  { id: 'CWE-190', name: 'Integer Overflow or Wraparound' },
  { id: 'CWE-918', name: 'Server-Side Request Forgery (SSRF)' },
  { id: 'CWE-119', name: 'Improper Restriction of Operations within the Bounds of a Memory Buffer' },
  { id: 'CWE-416', name: 'Use After Free' },
  { id: 'CWE-863', name: 'Incorrect Authorization' },
  { id: 'CWE-94', name: "Improper Control of Generation of Code ('Code Injection')" },
  { id: 'CWE-502', name: 'Deserialization of Untrusted Data' },
  { id: 'CWE-77', name: "Improper Neutralization of Special Elements used in a Command ('Command Injection')" },
  { id: 'CWE-269', name: 'Improper Privilege Management' },
  { id: 'CWE-798', name: 'Use of Hard-coded Credentials' },
  { id: 'CWE-200', name: 'Exposure of Sensitive Information to an Unauthorized Actor' },
  { id: 'CWE-400', name: 'Uncontrolled Resource Consumption' },
  { id: 'CWE-306', name: 'Missing Authentication for Critical Function' },
];

export const OWASP_TOP_10_2021_SOURCE = 'https://owasp.org/Top10/';

export const OWASP_TOP_10_2021: readonly TaxonomyClass[] = [
  { id: 'A01:2021', name: 'Broken Access Control' },
  { id: 'A02:2021', name: 'Cryptographic Failures' },
  { id: 'A03:2021', name: 'Injection' },
  { id: 'A04:2021', name: 'Insecure Design' },
  { id: 'A05:2021', name: 'Security Misconfiguration' },
  { id: 'A06:2021', name: 'Vulnerable and Outdated Components' },
  { id: 'A07:2021', name: 'Identification and Authentication Failures' },
  { id: 'A08:2021', name: 'Software and Data Integrity Failures' },
  { id: 'A09:2021', name: 'Security Logging and Monitoring Failures' },
  { id: 'A10:2021', name: 'Server-Side Request Forgery (SSRF)' },
];

/**
 * cejel's own agent-defect taxonomy. D1-D6 are defined and implemented in this repo
 * (docs/packs/d-series-d{1-6}-rule-contract.md + src/packs/d-series/); D7 and D8 are not
 * canonically defined anywhere in cejel or alfred as of this census — see the report for
 * the evidence trail (they appear only as reserved classification-tool labels).
 */
export const D_SERIES_TAXONOMY: readonly (TaxonomyClass & { readonly defined: boolean })[] = [
  { id: 'D1', name: 'Declared-but-unread config', defined: true },
  { id: 'D2', name: 'Swallowed error', defined: true },
  { id: 'D3', name: 'Unasserted set transform', defined: true },
  { id: 'D4', name: 'Pass-by-absence', defined: true },
  { id: 'D5', name: 'Self-referential verification', defined: true },
  { id: 'D6', name: 'Unobserved control / partial-view inference', defined: true },
  { id: 'D7', name: '(not canonically defined in cejel or alfred)', defined: false },
  { id: 'D8', name: '(not canonically defined in cejel or alfred)', defined: false },
];

function dSeriesContractRuleIds(): readonly string[] {
  const packsDir = resolve(REPO_ROOT, 'docs', 'packs');
  const ids = readdirSync(packsDir)
    .filter((file) => /^d-series-d\d+-rule-contract\.md$/.test(file))
    .map((file) => {
      const text = readFileSync(resolve(packsDir, file), 'utf8');
      const match = text.match(/Rule ID:\s*`(D\d+)`/);
      const ruleId = match?.[1];
      if (!ruleId) throw new Error(`d_series_contract_missing_rule_id:${file}`);
      return ruleId;
    });
  return [...ids].sort();
}

/** Mechanically enumerates every shipped rule/criterion this census can find — never hand-typed. */
export function deriveShippedRuleInventory(): readonly RuleRef[] {
  const core = WITAN_RUBRIC.map((c) => ({ id: c.id, title: c.title, source: 'witan-core' as const }));
  const trading = WITAN_TRADING_RUBRIC_V0.map((c) => ({
    id: c.id,
    title: c.title,
    source: 'witan-trading-v0' as const,
  }));
  const dSeries = dSeriesContractRuleIds().map((id) => ({
    id,
    title: D_SERIES_TAXONOMY.find((d) => d.id === id)?.name ?? id,
    source: 'd-series' as const,
  }));
  return [...core, ...trading, ...dSeries];
}

// --- The judgment-call layer -------------------------------------------------------------
// Every rule mechanically enumerated above MUST have an entry here, even if its `targets`
// array is empty (an explicit "reviewed, targets nothing in these taxonomies" record). The
// D7 guard (renderCensus, below) fails loudly if a rule exists with no entry, or an entry
// exists for a rule that no longer does.

export const RULE_DISPOSITIONS: Readonly<Record<string, RuleDisposition>> = {
  A1: { title: 'Test integrity and regression signal', source: 'witan-core', targets: [] },
  A2: {
    title: 'Data-layer isolation and secrets posture',
    source: 'witan-core',
    targets: [
      {
        taxonomy: 'cwe-2024',
        classId: 'CWE-798',
        status: 'covered',
        justification:
          'findCommittedSecretInFile + looksLikeSecretValue scan authored source for branded API-key prefixes (sk-, ghp_, AKIA…) and high-entropy generic tokens assigned to secret-shaped identifiers (src/witan/repo-signals.ts, SECRET_VALUE_BRANDED_PATTERN/GENERIC_SECRET_SHAPE_PATTERN), independent of a .gitignore/archetype gate.',
      },
      {
        taxonomy: 'cwe-2024',
        classId: 'CWE-862',
        status: 'partial',
        justification:
          'Native-RLS mode flags a tenant-scoped storage/migration file with no row-level-security policy defined for it (collectA2IsolationEvidence, nativeRlsInventory/tenantWithoutRlsPremiseFiles).',
        gap: 'Only the Postgres-native-RLS multi-tenant shape is checked; any other authorization-boundary omission (missing ACL check, missing ownership check outside RLS) is not detected.',
      },
      {
        taxonomy: 'cwe-2024',
        classId: 'CWE-200',
        status: 'partial',
        justification: 'Same committed-secret scan as CWE-798 — a hardcoded secret is one narrow, concrete instance of sensitive-information exposure.',
        gap: 'Does not detect exposure via verbose errors, logs, response bodies, or any channel other than a secret literal committed to source.',
      },
      {
        taxonomy: 'owasp-2021',
        classId: 'A07:2021',
        status: 'covered',
        justification: 'Same committed-secret scan as CWE-798; hard-coded credentials are the OWASP A07 example this rule directly matches.',
      },
      {
        taxonomy: 'owasp-2021',
        classId: 'A02:2021',
        status: 'partial',
        justification:
          'Crypto-hygiene nudge: flags a plain ===/!== compare of an hmac/signature/digest-named value (INSECURE_SECRET_COMPARE_LINE_PATTERN, non-constant-time) and a sign/HMAC call with no canonical-serialization step first (CANONICAL_SERIALIZE_PATTERN + SIGN_OR_HMAC_CALL_PATTERN).',
        gap: 'Explicitly a low-severity "nudge" (code comment: never scored critical) covering two narrow patterns; no coverage of key management, weak algorithms, or transport-layer crypto.',
      },
      {
        taxonomy: 'owasp-2021',
        classId: 'A01:2021',
        status: 'partial',
        justification: 'Same tenant-without-RLS-policy check as CWE-862 — a missing authorization boundary for multi-tenant data.',
        gap: 'Limited to the native-RLS shape; general broken access control (IDOR, missing function-level auth) is not checked.',
      },
    ],
  },
  A3: { title: 'Production readiness', source: 'witan-core', targets: [] },
  A4: {
    title: 'Dependency hygiene',
    source: 'witan-core',
    targets: [
      {
        taxonomy: 'owasp-2021',
        classId: 'A06:2021',
        status: 'partial',
        justification:
          'collectA4DependencyEvidence checks for a lockfile, a dependency-update bot config (Dependabot/Renovate), an audit script, and pinned version specs.',
        gap: 'No CVE/advisory database lookup — this is a process-hygiene proxy for reducing exposure, not a scan for actually-vulnerable component versions.',
      },
    ],
  },
  A5: { title: 'Claim-vs-reality reconciliation', source: 'witan-core', targets: [] },
  B1: { title: 'Dispatch trace completeness', source: 'witan-core', targets: [] },
  B2: { title: 'PR outcome traceability', source: 'witan-core', targets: [] },
  B3: { title: 'CI and QA discipline', source: 'witan-core', targets: [] },
  B4: {
    title: 'Audit trail and report-up completeness',
    source: 'witan-core',
    targets: [
      {
        taxonomy: 'owasp-2021',
        classId: 'A09:2021',
        status: 'partial',
        justification:
          'collectB4AuditEvidence checks that agent dispatch/PR operations get logged and reported up to a human-visible surface — the same "was this operation observable after the fact" question A09 asks.',
        gap: 'This is agent-operation audit-trail completeness (did the agent log what it did), not application runtime security-event logging (failed auth attempts, intrusion alerting) — a judgment call flagged for reviewer attention, not a confident match.',
      },
    ],
  },
  B5: { title: 'Verified learning trace', source: 'witan-core', targets: [] },
  B6: {
    title: 'Privileged-operation human gating',
    source: 'witan-core',
    targets: [
      {
        taxonomy: 'cwe-2024',
        classId: 'CWE-862',
        status: 'partial',
        justification:
          'collectB6PrivilegedOpsGatingEvidence flags a file that executes a SET ROLE/privilege-escalation statement (SQL_EXEC_PATTERN) with no preceding GATED_PRIVILEGE_CHECK_PATTERN (pg_has_role/has_role membership check) in the same file.',
        gap: 'Narrow to the SQL role-escalation shape; general missing-authorization checks elsewhere in application code are not covered.',
      },
      {
        taxonomy: 'cwe-2024',
        classId: 'CWE-269',
        status: 'partial',
        justification: 'Same executed-privilege-escalation-without-gate mechanism as CWE-862 above, read as improper privilege management rather than missing authorization.',
        gap: 'Same narrow SQL-role-escalation shape only.',
      },
    ],
  },
  'validation-integrity': { title: 'Backtest and validation process integrity', source: 'witan-trading-v0', targets: [] },
  calibration: { title: 'Model and strategy calibration accuracy', source: 'witan-trading-v0', targets: [] },
  'promotion-governance': { title: 'Strategy promotion governance', source: 'witan-trading-v0', targets: [] },
  'risk-governance': { title: 'Risk limits and oversight governance', source: 'witan-trading-v0', targets: [] },
  'execution-integrity': { title: 'Live execution integrity', source: 'witan-trading-v0', targets: [] },
  'real-outcome-evidence': { title: 'Real trading outcome evidence', source: 'witan-trading-v0', targets: [] },
  'data-confidence': { title: 'Market data feed confidence', source: 'witan-trading-v0', targets: [] },
  'audit-completeness': { title: 'Audit trail completeness', source: 'witan-trading-v0', targets: [] },
  'claim-reality': { title: 'Claim-vs-reality reconciliation', source: 'witan-trading-v0', targets: [] },
  D1: {
    title: 'Declared-but-unread config',
    source: 'd-series',
    targets: [
      {
        taxonomy: 'd-series',
        classId: 'D1',
        status: 'partial',
        justification:
          'D1-config exact signature: a binding-boolean key (require*/enforce*/fail*/must*/allow*/enable*/disable*) in an exported config/schema object or Markdown frontmatter, with a sibling read and no read site in the resolved first-party TypeScript module graph (docs/packs/d-series-d1-rule-contract.md).',
        gap: 'ADR-0013 (alfred): "narrower than \'declared-but-unread config\'" — arbitrary declared-but-unread configuration is not covered, only this one binding-boolean shape. The historical semantic-D1 seed corpus scored 0/3 cited.',
      },
    ],
  },
  D2: {
    title: 'Swallowed error',
    source: 'd-series',
    targets: [
      {
        taxonomy: 'd-series',
        classId: 'D2',
        status: 'partial',
        justification:
          'Exact signature: an awaited operation with a static success return, and a sole-statement catch with a simple unused binding and a static failure return (docs/packs/d-series-d2-rule-contract.md).',
        gap: 'General swallowed-error behavior (any catch that discards its error) is not covered, only this exact awaited/return shape. No seed exists in the historical corpus to measure semantic recall against.',
      },
    ],
  },
  D3: {
    title: 'Unasserted set transform',
    source: 'd-series',
    targets: [
      {
        taxonomy: 'd-series',
        classId: 'D3',
        status: 'partial',
        justification:
          'Exact signature: a direct-parameter .filter call, an empty explanation ledger, and an exact literal-success return (docs/packs/d-series-d3-rule-contract.md).',
        gap: 'General unasserted set transforms (most .filter calls are fine) are explicitly not claimed. Historical semantic-D3 seed corpus scored 0/5 cited.',
      },
    ],
  },
  D4: {
    title: 'Pass-by-absence',
    source: 'd-series',
    targets: [
      {
        taxonomy: 'd-series',
        classId: 'D4',
        status: 'partial',
        justification:
          'Exact signature: a three-statement caller and three-state callee (failure, successful emptiness, successful population) conflating empty-but-successful with populated (docs/packs/d-series-d4-rule-contract.md).',
        gap: 'The general form — "an empty result was wrong here" — is undecidable statically and is explicitly not claimed. Historical semantic-D4 seed corpus scored 0/4 cited.',
      },
    ],
  },
  D5: {
    title: 'Self-referential verification',
    source: 'd-series',
    targets: [
      {
        taxonomy: 'd-series',
        classId: 'D5',
        status: 'partial',
        justification:
          'Exact signature: a supported equality assertion in a recognized test path, with a named expected import and a separately exercised actual import from the same first-party module under test (docs/packs/d-series-d5-rule-contract.md).',
        gap: 'General verification independence is not covered, only this narrow same-module-import shape. Historical semantic-D5 seed corpus scored 0/4 cited.',
      },
    ],
  },
  D6: {
    title: 'Unobserved control / partial-view inference',
    source: 'd-series',
    targets: [
      {
        taxonomy: 'd-series',
        classId: 'D6',
        status: 'partial',
        justification:
          'Uncalibrated proposal, two exact signatures in .sh/.bash files only: a self-announcing control name neutralised before a success report, or a removal/deploy operation followed by an unconditional success report (docs/packs/d-series-d6-rule-contract.md).',
        gap: 'Shell-script-only; not wired into `cejel scan`, does not appear in a released certificate, and does not feed the Witan rubric or leaderboard. A zero-finding result means no exact signature matched, not that no unobserved control exists.',
      },
    ],
  },
};

function statusForClass(taxonomy: TaxonomyId, classId: string): {
  status: CoverageStatus;
  ruleRefs: { ruleId: string; status: 'covered' | 'partial'; justification: string; gap?: string }[];
} {
  const ruleRefs: { ruleId: string; status: 'covered' | 'partial'; justification: string; gap?: string }[] = [];
  for (const [ruleId, disposition] of Object.entries(RULE_DISPOSITIONS)) {
    for (const target of disposition.targets) {
      if (target.taxonomy === taxonomy && target.classId === classId) {
        ruleRefs.push({ ruleId, status: target.status, justification: target.justification, gap: target.gap });
      }
    }
  }
  const status: CoverageStatus = ruleRefs.some((r) => r.status === 'covered')
    ? 'covered'
    : ruleRefs.length > 0
      ? 'partial'
      : 'not targeted';
  return { status, ruleRefs };
}

export class UncensusedRuleError extends Error {
  constructor(missing: readonly string[], stale: readonly string[]) {
    super(
      `defect-class-census totality guard failed. ` +
        (missing.length > 0
          ? `Rule(s) with no disposition entry (add to RULE_DISPOSITIONS): ${missing.join(', ')}. `
          : '') +
        (stale.length > 0
          ? `Disposition entry(ies) for rule(s) no longer shipped (remove from RULE_DISPOSITIONS): ${stale.join(', ')}.`
          : ''),
    );
  }
}

function assertTotality(inventory: readonly RuleRef[]): void {
  const shipped = new Set(inventory.map((r) => r.id));
  const censused = new Set(Object.keys(RULE_DISPOSITIONS));
  const missing = [...shipped].filter((id) => !censused.has(id)).sort();
  const stale = [...censused].filter((id) => !shipped.has(id)).sort();
  if (missing.length > 0 || stale.length > 0) {
    throw new UncensusedRuleError(missing, stale);
  }
}

function renderTaxonomyTable(
  taxonomy: TaxonomyId,
  classes: readonly TaxonomyClass[],
): { markdown: string; counts: Record<CoverageStatus, number> } {
  const counts: Record<CoverageStatus, number> = { covered: 0, partial: 0, 'not targeted': 0 };
  const rows = classes.map((cls) => {
    const { status, ruleRefs } = statusForClass(taxonomy, cls.id);
    counts[status] += 1;
    const justification =
      ruleRefs.length === 0
        ? '—'
        : ruleRefs
            .map((r) => `**${r.ruleId}**: ${r.justification}${r.gap ? ` _Gap: ${r.gap}_` : ''}`)
            .join('<br>');
    return `| ${cls.id} | ${cls.name} | ${status} | ${justification} |`;
  });
  const markdown = [
    '| Class | Name | Status | Rule(s) and mechanism |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n');
  return { markdown, counts };
}

export interface RenderCensusOptions {
  readonly constraintsVersionLine: string;
}

export function renderCensus(options: RenderCensusOptions): string {
  const inventory = deriveShippedRuleInventory();
  assertTotality(inventory);

  const cwe = renderTaxonomyTable('cwe-2024', CWE_TOP_25_2024);
  const owasp = renderTaxonomyTable('owasp-2021', OWASP_TOP_10_2021);
  const dSeries = renderTaxonomyTable(
    'd-series',
    D_SERIES_TAXONOMY.filter((d) => d.defined),
  );

  const undefinedDClasses = D_SERIES_TAXONOMY.filter((d) => !d.defined);

  return `# Defect-class census

<!-- GENERATED FILE. Do not hand-edit. Regenerate with:
       pnpm exec tsx scripts/derive-defect-class-census.ts
     and verify with:
       pnpm exec tsx scripts/derive-defect-class-census.ts --check
     Source: src/census/defect-class-census.ts -->

**This is a coverage-breadth census, not a recall or precision claim.** A class marked
\`covered\` or \`partial\` means a shipped rule exists and states a mechanism targeting it —
never that the rule reliably catches instances of that class in the wild, and never a
substitute for the bounded in-scope recall records linked at the end of this document. No
recall or precision figure appears anywhere below.

${options.constraintsVersionLine}

## Method

The rule inventory below is extracted mechanically, never hand-typed, from two structures in
this repository's current state:

1. \`WITAN_RUBRIC\` and \`WITAN_TRADING_RUBRIC_V0\`, the certificate criteria arrays exported
   from \`src/witan/rubric.ts\` (11 core + 9 trading-domain criteria).
2. The D-series rule-contract docs under \`docs/packs/d-series-d*-rule-contract.md\`, each
   naming its own \`Rule ID\` — cross-referencing the exported detectors in
   \`src/packs/d-series/index.ts\`.

Every rule this repository currently ships has an entry in \`RULE_DISPOSITIONS\`
(\`src/census/defect-class-census.ts\`), including rules that target nothing in these three
taxonomies (an explicit "reviewed, targets nothing" record, not a silent omission). The
generator asserts that the mechanically-derived rule-ID set exactly equals the set of
disposition entries before rendering; a rule added to either structure above with no
corresponding entry — or a stale entry for a rule no longer shipped — throws and fails CI
instead of silently going uncensused (\`src/census/__tests__/defect-class-census.test.ts\`
demonstrates this).

**A note on scope.** The D-series detectors live in \`src/packs/d-series/\`, not
\`src/witan/\` — a separate, opt-in surface. ADR-0013 and each rule-contract doc state they
do not feed the Witan rubric, certificate score, or leaderboard. They are included here
because this census's third taxonomy *is* the D-series, and omitting the one place cejel
ships D-series detectors would misstate the boundary this document exists to publish. This
inclusion is itself a judgment call — see "Judgment calls" below.

## CWE Top 25 (2024)

Source: <${CWE_TOP_25_2024_SOURCE}>. Rank order below reflects the published list; verify
against the source before relying on exact rank for anything beyond this document.

${cwe.markdown}

**Counts:** covered ${cwe.counts.covered}, partial ${cwe.counts.partial}, not targeted ${cwe.counts['not targeted']} (of ${CWE_TOP_25_2024.length}).

## OWASP Top 10 (2021)

Source: <${OWASP_TOP_10_2021_SOURCE}>.

${owasp.markdown}

**Counts:** covered ${owasp.counts.covered}, partial ${owasp.counts.partial}, not targeted ${owasp.counts['not targeted']} (of ${OWASP_TOP_10_2021.length}).

## cejel's own D1-D8 agent-defect taxonomy

D1-D6 are canonically defined and implemented in this repo (\`docs/packs/d-series-d{1-6}-rule-contract.md\`,
\`src/packs/d-series/\`). Their originating decision record, [ADR-0013](https://github.com/BargLabs/alfred/blob/233a7a962eb280c7730495bb07bdba1073e8c85c/docs/adr/0013-d-series-detection-rules.md),
lives in the alfred repo (external to cejel) and is cited here per this census's own rule:
locate the canonical description, and cite it as external if it lives only in alfred.

${dSeries.markdown}

**D7 and D8 are not canonically defined** in either cejel or alfred as of this census. They
appear only as reserved classification labels in tooling (e.g. \`scripts/stratum-b-ledger.mjs\`'s
\`'Outside D1-D8'\`/\`'D7'\` seed tags) — never as a detector, a rule-contract doc, or a one-line
definition. Marked \`not targeted\` below because there is no rule and no defined class to
target; this absence-of-definition is itself flagged in "Judgment calls."

**Counts:** covered ${dSeries.counts.covered}, partial ${dSeries.counts.partial}, not targeted ${dSeries.counts['not targeted'] + undefinedDClasses.length} (of ${D_SERIES_TAXONOMY.length}, including D7/D8).

## Judgment calls for reviewer attention

- **B4 → OWASP A09:2021** (partial): B4 checks agent-operation audit-trail completeness
  (dispatch/PR logging reported up to a human), not application runtime security-event
  logging (failed auth attempts, intrusion alerting). Marked partial rather than not
  targeted because both are, at root, "was this operation observable after the fact" — but
  the reviewer may reasonably disagree with rounding this up at all.
- **D-series inclusion**: the D-series pack lives outside \`src/witan/\` and does not feed the
  certificate. Including it as a second rule source (see "A note on scope" above) is a
  scope decision, not a mechanical necessity — a narrower reading of this census's own
  extraction instruction would have left D1-D6 \`not targeted\` by the certificate-facing
  rule inventory, which is also true and arguably the more literal reading.
- **D7/D8 non-definition**: this census reports their absence rather than inventing a
  definition. A reviewer with access to the operator's private lab notes may know of an
  unpublished definition this census could not see.
- **CWE-862 vs. CWE-863** (A2's RLS check, B6's privilege-gating check): classified under
  CWE-862 (Missing Authorization — no check present) rather than CWE-863 (Incorrect
  Authorization — a check exists but is wrong), since both mechanisms detect the *absence*
  of a check, not a flawed one. A reviewer may weigh this differently.
- **Every rule marked \`partial\` in the D-series table** carries the same gap: cejel's own
  2026-08-01 ADR correction states the D-series rules implement "narrow exact signatures,
  not the semantic classes their technical IDs name" — this census follows that correction
  rather than rounding any of them up to \`covered\`.

## Depth claims — see instead

This document makes no recall or precision claim. For bounded in-scope recall figures, see:

- \`docs/experiments/in-scope-detection-recall-v3-result-2026-08-09.md\`
- \`docs/experiments/in-scope-detection-recall-v4-result-2026-08-11.md\`
`;
}
