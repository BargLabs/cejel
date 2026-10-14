import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type {
  WitanCriterionMetric,
  WitanCriterionScore,
  WitanFinding,
  WitanReport,
} from '../schemas.js';

import { buildRelyingPartySummary } from '../certificate-presentation.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { scoreMetrics } from '../scoring.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V22,
  WITAN_RUBRIC_VERSION_V23,
  WITAN_RUBRIC_VERSION_V24,
  WITAN_RUBRIC_VERSION_V25,
  WITAN_RUBRIC_VERSION_V26,
} from '../rubric-version.js';
import {
  A2_FIXTURES,
  A2_NAME_FIXTURES,
  A5_DECLARED_LINK_LINE,
  A5_FIXTURES,
  A5_READ_FIXTURES,
  A5_WORKFLOW_STEP_LINE,
  A5_WRITE_FIXTURES,
  INVOICES_CREATE_TABLE_LINE,
  SETTLING_EVIDENCE_FIXTURES,
  type SettlingEvidenceFixture,
} from './fixtures/settling-evidence-fixtures.js';

// v26 item 6, implemented from the operator-signed ruling docs/calibration/v26/ruling-item-6.md.
// A5's "no dedicated claim-reality reconciliation artifact" and A2's "tenant-scoped schema without
// row-level-security policies" claim something about the world, and a missing file does not settle
// either. Under v26 alone each fires only on the evidence the ruling names:
//   - A5 (S-A5): the repository itself names a claim-reconciliation artifact, and it is absent;
//   - A2 (T-1..T-3): row-level security is the repository's own mechanism, a tenant table is
//     identifiable from a CREATE TABLE statement, and no ENABLE or CREATE POLICY names it (a later
//     DISABLE uncovers it).
// Otherwise each abstains: no finding, and one sentence in the certificate's "What was not
// established". Never criterion-level insufficient_data. Every metric is unchanged but one:
// amendment 1 (docs/calibration/v26/ruling-item-6-amendment-1.md) omits A5's
// reconciliation_artifact_depth when no Cejel-format artifact is present and none is named.
//
// The revision (goal_cejel_v26_item6_revision_2026-10-14) adds amendment 1 and closes two
// false-fire paths: an A2 tenant table a later migration drops or renames, and an A5 path a
// workflow step writes or uploads.
//
// Synthetic fixtures only (fixtures/settling-evidence-fixtures.ts).

// A5 scores on the shared base fixture (a README and one implementation file). Read from the
// scorer, and checked against scoreMetrics where the metric set is what changed.
const A5_NO_DECLARATION_V25_SCORE = 1.4;
const A5_NO_DECLARATION_V26_SCORE = 1.6;
const A5_CEJEL_FORMAT_SCORE = 1.6;

const A5_DISCLOSURE =
  "Whether this repository's claims are reconciled against its implementation cannot be settled from static evidence; Cejel makes no finding on it.";
const A2_DISCLOSURE =
  'Whether tenant isolation is enforced outside the database cannot be settled from static evidence; Cejel makes no finding on it.';

/** Every rubric the ruling requires to stay byte-stable, plus v25 as v26's parent. */
const UNCHANGED_RUBRICS = [
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V22,
  WITAN_RUBRIC_VERSION_V23,
  WITAN_RUBRIC_VERSION_V24,
  WITAN_RUBRIC_VERSION_V25,
] as const;

function makeRepo(files: Readonly<Record<string, string>>): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-settling-evidence-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(repo, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
  execFileSync('git', ['add', '-A', '.'], { cwd: repo });
  return repo;
}

const repoByFixture = new Map<string, string>();
const reportCache = new Map<string, WitanReport>();

function report(fixture: SettlingEvidenceFixture, rubricVersion: string): WitanReport {
  const key = `${fixture.name}@${rubricVersion}`;
  const cached = reportCache.get(key);
  if (cached) return cached;
  let repo = repoByFixture.get(fixture.name);
  if (!repo) {
    repo = makeRepo(fixture.files);
    repoByFixture.set(fixture.name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'settling-evidence-fixture',
    productDisplayName: 'Settling evidence fixture',
    generatedAt: '2026-10-14T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reportCache.set(key, scored);
  return scored;
}

function criterion(scored: WitanReport, id: string): WitanCriterionScore {
  const found = scored.criteria.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no ${id} in report`);
  return found;
}

function notEstablished(scored: WitanReport): string {
  return buildRelyingPartySummary(scored).notEstablished;
}

// v17-v25's A5 absence finding: "... matched no dedicated claim-reality report artifact."
const isNoReconciliationFinding = (finding: WitanFinding) =>
  /no dedicated claim-reality report artifact/.test(finding.summary);
// v26's S-A5 finding.
const isDeclaredArtifactFinding = (finding: WitanFinding) =>
  /declares a claim-reconciliation artifact at `/.test(finding.summary);
// v18-v25's A2 gap: "A tenant-scoped schema signal is present, while ... matched no row-level-security policy."
const isTenantWithoutAnyRlsFinding = (finding: WitanFinding) =>
  /tenant-scoped schema signal is present/.test(finding.summary);
// v26's T-1..T-3 finding.
const isUncoveredTenantTableFinding = (finding: WitanFinding) =>
  /carries a tenant column and no row-level-security policy/.test(finding.summary);

function a5Findings(fixture: SettlingEvidenceFixture, rubricVersion: string) {
  const a5 = criterion(report(fixture, rubricVersion), 'A5');
  return {
    status: a5.status,
    noReconciliation: a5.findings.filter(isNoReconciliationFinding),
    declaredArtifact: a5.findings.filter(isDeclaredArtifactFinding),
  };
}

function a2Findings(fixture: SettlingEvidenceFixture, rubricVersion: string) {
  const a2 = criterion(report(fixture, rubricVersion), 'A2');
  return {
    status: a2.status,
    withoutAnyRls: a2.findings.filter(isTenantWithoutAnyRlsFinding),
    uncoveredTable: a2.findings.filter(isUncoveredTenantTableFinding),
  };
}

describe('A5 under v26: fires only when the repository names a claim-reconciliation artifact that is absent', () => {
  it('README links docs/claims-register.md, which is absent: the finding fires and cites the declaring line', () => {
    const { declaredArtifact, noReconciliation } = a5Findings(
      A5_FIXTURES.declaredLinkAbsent,
      WITAN_RUBRIC_VERSION_V26,
    );
    expect(noReconciliation).toEqual([]);
    expect(declaredArtifact).toHaveLength(1);
    const [finding] = declaredArtifact as [WitanFinding];
    expect(finding.summary).toContain('`docs/claims-register.md`');
    expect(finding.summary).toMatch(/not present/);
    expect(finding.evidence.path).toBe('README.md');
    expect(finding.evidence.line).toBe(A5_DECLARED_LINK_LINE);
    expect(notEstablished(report(A5_FIXTURES.declaredLinkAbsent, WITAN_RUBRIC_VERSION_V26))).not.toContain(
      A5_DISCLOSURE,
    );
  });

  it('the same link with the file present: no finding', () => {
    const { declaredArtifact, noReconciliation } = a5Findings(
      A5_FIXTURES.declaredLinkPresent,
      WITAN_RUBRIC_VERSION_V26,
    );
    expect(declaredArtifact).toEqual([]);
    expect(noReconciliation).toEqual([]);
    expect(notEstablished(report(A5_FIXTURES.declaredLinkPresent, WITAN_RUBRIC_VERSION_V26))).toContain(
      A5_DISCLOSURE,
    );
  });

  it('no declaration and no Cejel-format artifact: no finding and the disclosure line under v26; the finding fires under v25', () => {
    const v26 = a5Findings(A5_FIXTURES.noDeclaration, WITAN_RUBRIC_VERSION_V26);
    expect(v26.declaredArtifact).toEqual([]);
    expect(v26.noReconciliation).toEqual([]);
    expect(v26.status).not.toBe('insufficient_data');
    expect(notEstablished(report(A5_FIXTURES.noDeclaration, WITAN_RUBRIC_VERSION_V26))).toContain(
      A5_DISCLOSURE,
    );

    const v25 = a5Findings(A5_FIXTURES.noDeclaration, WITAN_RUBRIC_VERSION_V25);
    expect(v25.noReconciliation).toHaveLength(1);
    expect(v25.declaredArtifact).toEqual([]);
    expect(notEstablished(report(A5_FIXTURES.noDeclaration, WITAN_RUBRIC_VERSION_V25))).not.toContain(
      A5_DISCLOSURE,
    );
  });

  it('a Cejel-format artifact present: evidence and metric unchanged, no finding, no disclosure', () => {
    const v25 = criterion(report(A5_FIXTURES.cejelFormatArtifact, WITAN_RUBRIC_VERSION_V25), 'A5');
    const v26 = criterion(report(A5_FIXTURES.cejelFormatArtifact, WITAN_RUBRIC_VERSION_V26), 'A5');
    expect(v26.evidence).toEqual(v25.evidence);
    expect(v26.evidence.map((pointer) => pointer.path)).toContain('claim-reality-reconciliation.md');
    expect(v26.metrics).toEqual(v25.metrics);
    expect(v26.metrics.find((metric) => metric.name === 'reconciliation_artifact_depth')?.value).toBe(1);
    expect(v26.findings).toEqual(v25.findings);
    expect(v26.score).toBe(v25.score);
    expect(v26.status).toBe(v25.status);
    expect(notEstablished(report(A5_FIXTURES.cejelFormatArtifact, WITAN_RUBRIC_VERSION_V26))).not.toContain(
      A5_DISCLOSURE,
    );
  });

  it('a declared artifact is absent but a Cejel-format artifact is present: no finding (the reading that fires less)', () => {
    const { declaredArtifact, noReconciliation } = a5Findings(
      A5_FIXTURES.declaredAbsentWithCejelArtifact,
      WITAN_RUBRIC_VERSION_V26,
    );
    expect(declaredArtifact).toEqual([]);
    expect(noReconciliation).toEqual([]);
  });

  it('a code-span path in a claim source declares the artifact too', () => {
    const { declaredArtifact } = a5Findings(A5_FIXTURES.codeSpanAbsent, WITAN_RUBRIC_VERSION_V26);
    expect(declaredArtifact).toHaveLength(1);
    expect(declaredArtifact[0]?.summary).toContain('`docs/claims-ledger.json`');
    expect(declaredArtifact[0]?.evidence.path).toBe('README.md');
    expect(declaredArtifact[0]?.evidence.line).toBe(3);
  });

  it('a relative link in CONTRIBUTING declares the artifact too', () => {
    const { declaredArtifact } = a5Findings(A5_FIXTURES.contributingLinkAbsent, WITAN_RUBRIC_VERSION_V26);
    expect(declaredArtifact).toHaveLength(1);
    expect(declaredArtifact[0]?.summary).toContain('`CLAIM_REALITY_REGISTER.md`');
    expect(declaredArtifact[0]?.evidence.path).toBe('CONTRIBUTING.md');
    expect(declaredArtifact[0]?.evidence.line).toBe(3);
  });

  it('a path in a CI workflow step declares the artifact too', () => {
    const { declaredArtifact } = a5Findings(A5_FIXTURES.workflowStepAbsent, WITAN_RUBRIC_VERSION_V26);
    expect(declaredArtifact).toHaveLength(1);
    expect(declaredArtifact[0]?.summary).toContain('`claims/claims-reconciliation.yaml`');
    expect(declaredArtifact[0]?.evidence.path).toBe('.github/workflows/claims.yml');
    expect(declaredArtifact[0]?.evidence.line).toBe(10);
  });

  it('a link in a top-level doc resolves relative to that doc: present, so no finding', () => {
    const { declaredArtifact } = a5Findings(
      A5_FIXTURES.topLevelDocRelativeLinkPresent,
      WITAN_RUBRIC_VERSION_V26,
    );
    expect(declaredArtifact).toEqual([]);
  });

  for (const [label, fixture] of [
    ['a link inside a fenced code block', A5_FIXTURES.linkInFencedBlock],
    ['an external URL', A5_FIXTURES.externalUrl],
    ['names outside the bounded vocabulary', A5_FIXTURES.outOfVocabulary],
    ['a link in a nested doc that is not a declaring source', A5_FIXTURES.nestedDocNotADeclaringSource],
  ] as const) {
    it(`${label} declares nothing: no finding, and the disclosure line`, () => {
      const { declaredArtifact, noReconciliation } = a5Findings(fixture, WITAN_RUBRIC_VERSION_V26);
      expect(declaredArtifact).toEqual([]);
      expect(noReconciliation).toEqual([]);
      expect(notEstablished(report(fixture, WITAN_RUBRIC_VERSION_V26))).toContain(A5_DISCLOSURE);
    });
  }
});

// Amendment 1 (docs/calibration/v26/ruling-item-6-amendment-1.md): under v26, with no Cejel-format
// artifact present and none named, reconciliation_artifact_depth is not scored, and the other A5
// metrics carry the score at their declared relative weights. Named and absent, or present: as
// before. A5's status rules are unchanged, so its status is whatever the score band says.
const reconciliationDepth = (a5: WitanCriterionScore): WitanCriterionMetric | undefined =>
  a5.metrics.find((metric) => metric.name === 'reconciliation_artifact_depth');
const withoutWeightShares = (metrics: readonly WitanCriterionMetric[]) =>
  metrics.map(({ appliedWeightShare: _share, ...rest }) => rest);

describe('amendment 1: reconciliation_artifact_depth under v26', () => {
  it('no Cejel-format artifact and none named: the metric is absent, the other two carry the score, and the disclosure is present', () => {
    const v25 = criterion(report(A5_FIXTURES.noDeclaration, WITAN_RUBRIC_VERSION_V25), 'A5');
    const v26 = criterion(report(A5_FIXTURES.noDeclaration, WITAN_RUBRIC_VERSION_V26), 'A5');
    expect(reconciliationDepth(v25)?.value).toBe(0);
    expect(reconciliationDepth(v26)).toBeUndefined();
    expect(withoutWeightShares(v26.metrics)).toEqual(
      withoutWeightShares(v25.metrics).filter((metric) => metric.name !== 'reconciliation_artifact_depth'),
    );
    expect(v26.metrics.map((metric) => [metric.name, metric.weight])).toEqual([
      ['claim_match_rate', 0.5],
      ['claim_source_depth', 0.35],
    ]);
    // Their declared relative weights: 0.5 and 0.35 of 0.85.
    expect(v26.metrics[0]?.appliedWeightShare).toBeCloseTo(0.5 / 0.85, 12);
    expect(v26.metrics[1]?.appliedWeightShare).toBeCloseTo(0.35 / 0.85, 12);
    expect(v26.score).toBe(scoreMetrics(v26.metrics));
    expect(v26.score).toBe(A5_NO_DECLARATION_V26_SCORE);
    expect(v26.status).toBe('warning');
    expect(v26.findings.map((finding) => [finding.severity, finding.summary])).toEqual([
      [
        'warning',
        `A5 metric-derived score is ${A5_NO_DECLARATION_V26_SCORE.toFixed(1)}/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below.`,
      ],
    ]);
    expect(notEstablished(report(A5_FIXTURES.noDeclaration, WITAN_RUBRIC_VERSION_V26))).toContain(
      A5_DISCLOSURE,
    );
    // v25 at the same fixture, for the record: the metric scores 0 and the finding holds A5 at warning.
    expect(v25.score).toBe(A5_NO_DECLARATION_V25_SCORE);
    expect(v25.status).toBe('warning');
  });

  it('named and absent (S-A5): the metric is scored at 0 beside the finding', () => {
    const v25 = criterion(report(A5_FIXTURES.declaredLinkAbsent, WITAN_RUBRIC_VERSION_V25), 'A5');
    const v26 = criterion(report(A5_FIXTURES.declaredLinkAbsent, WITAN_RUBRIC_VERSION_V26), 'A5');
    expect(reconciliationDepth(v26)?.value).toBe(0);
    expect(v26.metrics).toEqual(v25.metrics);
    expect(v26.findings.map((finding) => finding.severity)).toEqual(['warning']);
    expect(v26.findings.filter(isDeclaredArtifactFinding)).toHaveLength(1);
    expect(v26.score).toBe(v25.score);
    expect(v26.score).toBe(A5_NO_DECLARATION_V25_SCORE);
    expect(v26.status).toBe('warning');
    expect(notEstablished(report(A5_FIXTURES.declaredLinkAbsent, WITAN_RUBRIC_VERSION_V26))).not.toContain(
      A5_DISCLOSURE,
    );
  });

  it('a Cejel-format artifact present: the metric, score, status and findings are unchanged', () => {
    const v25 = criterion(report(A5_FIXTURES.cejelFormatArtifact, WITAN_RUBRIC_VERSION_V25), 'A5');
    const v26 = criterion(report(A5_FIXTURES.cejelFormatArtifact, WITAN_RUBRIC_VERSION_V26), 'A5');
    expect(reconciliationDepth(v26)?.value).toBe(1);
    expect(v26.metrics).toEqual(v25.metrics);
    expect(v26.score).toBe(v25.score);
    expect(v26.score).toBe(A5_CEJEL_FORMAT_SCORE);
    expect(v26.status).toBe(v25.status);
    expect(v26.findings).toEqual(v25.findings);
  });

  it('named and present, not in Cejel format: the metric is scored (the amendment omits it only when none is named)', () => {
    const v25 = criterion(report(A5_FIXTURES.declaredLinkPresent, WITAN_RUBRIC_VERSION_V25), 'A5');
    const v26 = criterion(report(A5_FIXTURES.declaredLinkPresent, WITAN_RUBRIC_VERSION_V26), 'A5');
    expect(reconciliationDepth(v26)?.value).toBe(0);
    expect(v26.metrics).toEqual(v25.metrics);
    expect(v26.score).toBe(v25.score);
  });
});

describe('A5 under v26: a path a workflow step writes or uploads declares nothing', () => {
  for (const [label, fixture] of [
    ['`> claims-register.json`', A5_WRITE_FIXTURES.redirect],
    ['`>> claims-register.json`', A5_WRITE_FIXTURES.appendRedirect],
    ['`| tee claims-register.json`', A5_WRITE_FIXTURES.tee],
    ['`-o claims-register.json`', A5_WRITE_FIXTURES.shortOutputOption],
    ['`--output claims-register.json`', A5_WRITE_FIXTURES.longOutputOption],
    ['`--out=claims-register.json`', A5_WRITE_FIXTURES.outOption],
    ['a `>` continued onto the next line', A5_WRITE_FIXTURES.continuedRedirect],
    ['the `path:` of an actions/upload-artifact step', A5_WRITE_FIXTURES.uploadArtifact],
    ['the `path:` of an actions/upload-artifact step whose `uses:` comes last', A5_WRITE_FIXTURES.uploadArtifactUsesLast],
  ] as const) {
    it(`${label}, the file absent: no finding, and the disclosure line`, () => {
      const { declaredArtifact, noReconciliation } = a5Findings(fixture, WITAN_RUBRIC_VERSION_V26);
      expect(declaredArtifact).toEqual([]);
      expect(noReconciliation).toEqual([]);
      expect(notEstablished(report(fixture, WITAN_RUBRIC_VERSION_V26))).toContain(A5_DISCLOSURE);
    });
  }

  for (const [label, fixture, path] of [
    ['`cat claims-register.json`', A5_READ_FIXTURES.catOnly, 'claims-register.json'],
    ['a path read before a `>` on the same line', A5_READ_FIXTURES.readThenRedirect, 'claims-register.json'],
    ['a read step followed by an upload-artifact step', A5_READ_FIXTURES.readAfterUpload, 'claims-register.json'],
  ] as const) {
    it(`a step that only reads the file, ${label}, the file absent: the finding fires`, () => {
      const { declaredArtifact } = a5Findings(fixture, WITAN_RUBRIC_VERSION_V26);
      expect(declaredArtifact).toHaveLength(1);
      expect(declaredArtifact[0]?.summary).toContain(`\`${path}\``);
      expect(declaredArtifact[0]?.evidence.path).toBe('.github/workflows/claims.yml');
      expect(declaredArtifact[0]?.evidence.line).toBe(A5_WORKFLOW_STEP_LINE);
    });
  }
});

describe('A2 under v26: a tenant table that no longer exists under its CREATE TABLE name', () => {
  for (const [label, fixture] of [
    ['invoices created with tenant_id, then a later DROP TABLE invoices', A2_NAME_FIXTURES.dropped],
    [
      'invoices created with tenant_id, then a later DROP TABLE IF EXISTS public.invoices, … CASCADE',
      A2_NAME_FIXTURES.droppedIfExistsQualified,
    ],
    ['invoices dropped by a DROP TABLE in another directory', A2_NAME_FIXTURES.droppedInAnotherDirectory],
    ['invoices possibly dropped by dynamic SQL', A2_NAME_FIXTURES.droppedDynamically],
    [
      'invoices renamed to invoices_archive, the policy then on invoices_archive',
      A2_NAME_FIXTURES.renamedCoveredUnderNewName,
    ],
    ['invoices covered, then renamed to invoices_archive', A2_NAME_FIXTURES.renamedAfterCoverage],
    ['invoices renamed in another directory', A2_NAME_FIXTURES.renamedInAnotherDirectory],
  ] as const) {
    it(`${label}: no finding, and the disclosure line`, () => {
      const { uncoveredTable, withoutAnyRls } = a2Findings(fixture, WITAN_RUBRIC_VERSION_V26);
      expect(uncoveredTable).toEqual([]);
      expect(withoutAnyRls).toEqual([]);
      expect(notEstablished(report(fixture, WITAN_RUBRIC_VERSION_V26))).toContain(A2_DISCLOSURE);
    });
  }

  it('a rename with no policy anywhere on the new name, and RLS used elsewhere: the finding names the new name', () => {
    const { uncoveredTable } = a2Findings(A2_NAME_FIXTURES.renamedUncovered, WITAN_RUBRIC_VERSION_V26);
    expect(uncoveredTable).toHaveLength(1);
    const [finding] = uncoveredTable as [WitanFinding];
    expect(finding.summary).toBe(
      'Table `invoices_archive` carries a tenant column and no row-level-security policy, while this repository enforces tenant isolation with row-level security elsewhere.',
    );
    expect(finding.evidence.path).toBe('migrations/0002_invoices.sql');
    expect(finding.evidence.line).toBe(INVOICES_CREATE_TABLE_LINE);
  });

  it('a DROP TABLE IF EXISTS before the CREATE TABLE in the same directory removes nothing: the finding fires', () => {
    const { uncoveredTable } = a2Findings(A2_NAME_FIXTURES.droppedBeforeCreate, WITAN_RUBRIC_VERSION_V26);
    expect(uncoveredTable).toHaveLength(1);
    expect(uncoveredTable[0]?.summary).toContain('Table `invoices` carries');
  });
});

describe('A2 under v26: fires only when RLS is the repository mechanism and an identifiable tenant table is uncovered', () => {
  it('RLS on orders, plus invoices with tenant_id and no policy: the finding names invoices and cites its CREATE TABLE line', () => {
    const { uncoveredTable, withoutAnyRls } = a2Findings(
      A2_FIXTURES.uncoveredTenantTable,
      WITAN_RUBRIC_VERSION_V26,
    );
    expect(withoutAnyRls).toEqual([]);
    expect(uncoveredTable).toHaveLength(1);
    const [finding] = uncoveredTable as [WitanFinding];
    expect(finding.summary).toBe(
      'Table `invoices` carries a tenant column and no row-level-security policy, while this repository enforces tenant isolation with row-level security elsewhere.',
    );
    expect(finding.evidence.path).toBe('migrations/0002_invoices.sql');
    expect(finding.evidence.line).toBe(INVOICES_CREATE_TABLE_LINE);
    expect(notEstablished(report(A2_FIXTURES.uncoveredTenantTable, WITAN_RUBRIC_VERSION_V26))).not.toContain(
      A2_DISCLOSURE,
    );
    // The change of direction the ruling names: v25 does not fire here, because a policy exists.
    expect(a2Findings(A2_FIXTURES.uncoveredTenantTable, WITAN_RUBRIC_VERSION_V25).withoutAnyRls).toEqual([]);
  });

  it('RLS on every tenant table: no finding', () => {
    const { uncoveredTable, withoutAnyRls } = a2Findings(
      A2_FIXTURES.everyTenantTableCovered,
      WITAN_RUBRIC_VERSION_V26,
    );
    expect(uncoveredTable).toEqual([]);
    expect(withoutAnyRls).toEqual([]);
  });

  it('a tenant column and no RLS anywhere: no finding and the disclosure line under v26; the finding fires under v25', () => {
    const v26 = a2Findings(A2_FIXTURES.tenantColumnNoRlsAnywhere, WITAN_RUBRIC_VERSION_V26);
    expect(v26.uncoveredTable).toEqual([]);
    expect(v26.withoutAnyRls).toEqual([]);
    expect(v26.status).not.toBe('insufficient_data');
    expect(notEstablished(report(A2_FIXTURES.tenantColumnNoRlsAnywhere, WITAN_RUBRIC_VERSION_V26))).toContain(
      A2_DISCLOSURE,
    );

    const v25 = a2Findings(A2_FIXTURES.tenantColumnNoRlsAnywhere, WITAN_RUBRIC_VERSION_V25);
    expect(v25.withoutAnyRls).toHaveLength(1);
    expect(notEstablished(report(A2_FIXTURES.tenantColumnNoRlsAnywhere, WITAN_RUBRIC_VERSION_V25))).not.toContain(
      A2_DISCLOSURE,
    );
  });

  it('RLS named only inside comments is not the repository mechanism: no finding, and the disclosure line', () => {
    const { uncoveredTable } = a2Findings(A2_FIXTURES.rlsOnlyInComments, WITAN_RUBRIC_VERSION_V26);
    expect(uncoveredTable).toEqual([]);
    expect(notEstablished(report(A2_FIXTURES.rlsOnlyInComments, WITAN_RUBRIC_VERSION_V26))).toContain(
      A2_DISCLOSURE,
    );
  });

  it('a Prisma-only schema abstains: no finding and the disclosure line under v26; the finding fires under v25', () => {
    const v26 = a2Findings(A2_FIXTURES.prismaOnly, WITAN_RUBRIC_VERSION_V26);
    expect(v26.uncoveredTable).toEqual([]);
    expect(v26.withoutAnyRls).toEqual([]);
    expect(notEstablished(report(A2_FIXTURES.prismaOnly, WITAN_RUBRIC_VERSION_V26))).toContain(A2_DISCLOSURE);
    expect(a2Findings(A2_FIXTURES.prismaOnly, WITAN_RUBRIC_VERSION_V25).withoutAnyRls).toHaveLength(1);
  });

  for (const [label, uncovered, covered, expectedName] of [
    ['quoted names', A2_FIXTURES.quotedUncovered, A2_FIXTURES.quotedCovered, 'invoices'],
    [
      'schema-qualified names',
      A2_FIXTURES.schemaQualifiedUncovered,
      A2_FIXTURES.schemaQualifiedCovered,
      'billing.invoices',
    ],
    [
      'quoted schema-qualified names',
      A2_FIXTURES.schemaQualifiedUncovered,
      A2_FIXTURES.quotedSchemaQualifiedCovered,
      'billing.invoices',
    ],
    ['case differences', A2_FIXTURES.caseDifferenceUncovered, A2_FIXTURES.caseDifferenceCovered, 'invoices'],
    ['IF NOT EXISTS', A2_FIXTURES.ifNotExistsUncovered, A2_FIXTURES.ifNotExistsCovered, 'invoices'],
    [
      'multiple statements per file',
      A2_FIXTURES.multipleStatementsUncovered,
      A2_FIXTURES.multipleStatementsCovered,
      'invoices',
    ],
  ] as const) {
    it(`table matching, ${label}: an uncovered table fires`, () => {
      const { uncoveredTable } = a2Findings(uncovered, WITAN_RUBRIC_VERSION_V26);
      expect(uncoveredTable).toHaveLength(1);
      expect(uncoveredTable[0]?.summary).toContain(`Table \`${expectedName}\` carries`);
    });

    it(`table matching, ${label}: coverage written in another form of the name is recognised`, () => {
      const { uncoveredTable } = a2Findings(covered, WITAN_RUBRIC_VERSION_V26);
      expect(uncoveredTable).toEqual([]);
    });
  }

  it('ENABLE followed by a later DISABLE ROW LEVEL SECURITY on the same table: the finding fires', () => {
    const { uncoveredTable } = a2Findings(A2_FIXTURES.enableThenDisable, WITAN_RUBRIC_VERSION_V26);
    expect(uncoveredTable).toHaveLength(1);
    expect(uncoveredTable[0]?.summary).toContain('Table `invoices` carries');
  });

  it('DISABLE followed by a later ENABLE on the same table: covered, no finding', () => {
    const { uncoveredTable } = a2Findings(A2_FIXTURES.disableThenEnable, WITAN_RUBRIC_VERSION_V26);
    expect(uncoveredTable).toEqual([]);
  });

  it('commented-out coverage is not coverage: the finding fires', () => {
    const { uncoveredTable } = a2Findings(A2_FIXTURES.commentedOutCoverage, WITAN_RUBRIC_VERSION_V26);
    expect(uncoveredTable).toHaveLength(1);
  });

  it('a table name that cannot be normalised abstains: no finding, and the disclosure line', () => {
    const { uncoveredTable } = a2Findings(A2_FIXTURES.unreadableTableName, WITAN_RUBRIC_VERSION_V26);
    expect(uncoveredTable).toEqual([]);
    expect(notEstablished(report(A2_FIXTURES.unreadableTableName, WITAN_RUBRIC_VERSION_V26))).toContain(
      A2_DISCLOSURE,
    );
  });

  it('dynamic SQL that may enable RLS on unnamed tables abstains: no finding, and the disclosure line', () => {
    const { uncoveredTable } = a2Findings(A2_FIXTURES.dynamicCoverage, WITAN_RUBRIC_VERSION_V26);
    expect(uncoveredTable).toEqual([]);
    expect(notEstablished(report(A2_FIXTURES.dynamicCoverage, WITAN_RUBRIC_VERSION_V26))).toContain(
      A2_DISCLOSURE,
    );
  });
});

// The fixtures that name a claim-reconciliation artifact or hold a Cejel-format one, so keep
// reconciliation_artifact_depth under v26. Every other fixture names none and has none.
const KEEPS_RECONCILIATION_DEPTH: ReadonlySet<string> = new Set(
  [
    A5_FIXTURES.declaredLinkAbsent,
    A5_FIXTURES.declaredLinkPresent,
    A5_FIXTURES.cejelFormatArtifact,
    A5_FIXTURES.declaredAbsentWithCejelArtifact,
    A5_FIXTURES.codeSpanAbsent,
    A5_FIXTURES.contributingLinkAbsent,
    A5_FIXTURES.topLevelDocRelativeLinkPresent,
    A5_FIXTURES.workflowStepAbsent,
    ...Object.values(A5_READ_FIXTURES),
  ].map((fixture) => fixture.name),
);

describe('every fixture: metrics identical under v25 and v26 but for amendment 1, and the change is v26 alone', () => {
  for (const fixture of SETTLING_EVIDENCE_FIXTURES) {
    it(`${fixture.name}: every criterion's metrics and positive evidence are identical under v25 and v26, but for amendment 1`, () => {
      const v25 = report(fixture, WITAN_RUBRIC_VERSION_V25);
      const v26 = report(fixture, WITAN_RUBRIC_VERSION_V26);
      const outsideA5 = (scored: WitanReport) =>
        scored.criteria.filter((c) => c.id !== 'A5').map((c) => [c.id, c.metrics]);
      expect(outsideA5(v26)).toEqual(outsideA5(v25));
      const keeps = KEEPS_RECONCILIATION_DEPTH.has(fixture.name);
      expect(reconciliationDepth(criterion(v26, 'A5')) !== undefined).toBe(keeps);
      expect(withoutWeightShares(criterion(v26, 'A5').metrics)).toEqual(
        withoutWeightShares(criterion(v25, 'A5').metrics).filter(
          (metric) => keeps || metric.name !== 'reconciliation_artifact_depth',
        ),
      );
      expect(v26.criteria.map((c) => [c.id, c.evidence])).toEqual(v25.criteria.map((c) => [c.id, c.evidence]));
      // Abstention is never criterion-level insufficient_data.
      expect(criterion(v26, 'A5').status === 'insufficient_data').toBe(
        criterion(v25, 'A5').status === 'insufficient_data',
      );
      expect(criterion(v26, 'A2').status === 'insufficient_data').toBe(
        criterion(v25, 'A2').status === 'insufficient_data',
      );
    });

    it(`${fixture.name}: criteria other than A2 and A5 are identical under v25 and v26`, () => {
      const v25 = report(fixture, WITAN_RUBRIC_VERSION_V25);
      const v26 = report(fixture, WITAN_RUBRIC_VERSION_V26);
      const others = (scored: WitanReport) =>
        scored.criteria.filter((c) => c.id !== 'A2' && c.id !== 'A5').map((c) => JSON.stringify(c));
      expect(others(v26)).toEqual(others(v25));
    });

    it(`${fixture.name}: no rubric other than v26 carries a v26 finding or disclosure`, () => {
      for (const rubricVersion of UNCHANGED_RUBRICS) {
        const scored = report(fixture, rubricVersion);
        const findings = scored.criteria.flatMap((c) => c.findings);
        expect(findings.filter(isDeclaredArtifactFinding), rubricVersion).toEqual([]);
        expect(findings.filter(isUncoveredTenantTableFinding), rubricVersion).toEqual([]);
        expect(notEstablished(scored), rubricVersion).not.toContain(A5_DISCLOSURE);
        expect(notEstablished(scored), rubricVersion).not.toContain(A2_DISCLOSURE);
        expect(JSON.stringify(scored), rubricVersion).not.toContain('cannot be settled from static evidence');
      }
    });
  }
});
