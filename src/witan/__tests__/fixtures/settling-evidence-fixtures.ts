// Synthetic repository shapes for v26 item 6 (docs/calibration/v26/ruling-item-6.md): A5's
// no-reconciliation finding and A2's tenant-without-RLS finding fire only on the evidence that
// settles them. Every shape below is invented from the ruling's own wording. Nothing is derived
// from a calibration case, a counterparty, or a real repository.
//
// Kept apart from the test file so a one-off before/after measurement can score the same shapes
// with the scanner at two commits without registering the suite twice.

export interface SettlingEvidenceFixture {
  readonly name: string;
  readonly files: Readonly<Record<string, string>>;
}

const PACKAGE_JSON = `${JSON.stringify(
  { name: 'settling-evidence-fixture', version: '1.0.0', scripts: { test: 'vitest run' } },
  null,
  2,
)}\n`;

const IMPLEMENTATION = 'export function total(values: number[]): number {\n  return values.reduce((a, b) => a + b, 0);\n}\n';

/** The shared base every fixture starts from: a claim source and one implementation file. */
function base(readme: string, extra: Readonly<Record<string, string>> = {}): Record<string, string> {
  return {
    'package.json': PACKAGE_JSON,
    'src/total.ts': IMPLEMENTATION,
    'README.md': readme,
    ...extra,
  };
}

const PLAIN_README = '# Settling evidence fixture\n\nAdds numbers.\n';

// ---------------------------------------------------------------------------------------------
// A5
// ---------------------------------------------------------------------------------------------

/** README line 5 links the register; nothing else in the fixture names it. */
export const A5_DECLARED_LINK_README =
  '# Settling evidence fixture\n\nAdds numbers.\n\nEvery claim above is tracked in the [claims register](docs/claims-register.md).\n';
export const A5_DECLARED_LINK_LINE = 5;

const CEJEL_FORMAT_ARTIFACT = '# Claim Reality Reconciliation\n\n| Claim | Evidence |\n| --- | --- |\n| Adds numbers | src/total.ts |\n';

export const A5_FIXTURES = {
  declaredLinkAbsent: { name: 'a5-declared-link-absent', files: base(A5_DECLARED_LINK_README) },
  declaredLinkPresent: {
    name: 'a5-declared-link-present',
    files: base(A5_DECLARED_LINK_README, {
      'docs/claims-register.md': '# Claims register\n\n- Adds numbers.\n',
    }),
  },
  noDeclaration: { name: 'a5-no-declaration', files: base(PLAIN_README) },
  cejelFormatArtifact: {
    name: 'a5-cejel-format-artifact',
    files: base(PLAIN_README, { 'claim-reality-reconciliation.md': CEJEL_FORMAT_ARTIFACT }),
  },
  // The same declaration as declaredLinkAbsent, with a Cejel-format artifact also present.
  declaredAbsentWithCejelArtifact: {
    name: 'a5-declared-absent-with-cejel-artifact',
    files: base(A5_DECLARED_LINK_README, {
      'claim-reality-reconciliation.md': CEJEL_FORMAT_ARTIFACT,
    }),
  },
  codeSpanAbsent: {
    name: 'a5-code-span-absent',
    files: base('# Settling evidence fixture\n\nClaims are reconciled in `docs/claims-ledger.json`.\n'),
  },
  contributingLinkAbsent: {
    name: 'a5-contributing-link-absent',
    files: base(PLAIN_README, {
      'CONTRIBUTING.md': '# Contributing\n\nUpdate the [claim reality register](CLAIM_REALITY_REGISTER.md) with each change.\n',
    }),
  },
  topLevelDocRelativeLinkPresent: {
    name: 'a5-top-level-doc-relative-link-present',
    files: base(PLAIN_README, {
      'docs/overview.md': '# Overview\n\nSee the [claims register](claims-register.md).\n',
      'docs/claims-register.md': '# Claims register\n',
    }),
  },
  workflowStepAbsent: {
    name: 'a5-workflow-step-absent',
    files: base(PLAIN_README, {
      '.github/workflows/claims.yml':
        'name: claims\non:\n  push:\n    branches: [main]\njobs:\n  reconcile:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: node scripts/reconcile.js --register claims/claims-reconciliation.yaml\n',
    }),
  },
  linkInFencedBlock: {
    name: 'a5-link-in-fenced-block',
    files: base(
      '# Settling evidence fixture\n\n```md\nSee the [claims register](docs/claims-register.md).\n```\n',
    ),
  },
  externalUrl: {
    name: 'a5-external-url',
    files: base(
      '# Settling evidence fixture\n\nSee the [claims register](https://example.invalid/docs/claims-register.md).\n',
    ),
  },
  outOfVocabulary: {
    name: 'a5-out-of-vocabulary',
    files: base('# Settling evidence fixture\n\nSee [the claims](docs/claims.md) and [the register](docs/register.md).\n'),
  },
  nestedDocNotADeclaringSource: {
    name: 'a5-nested-doc-not-declaring',
    files: base(PLAIN_README, {
      'docs/guides/process.md': 'See the [claims register](../claims-register.md).\n',
    }),
  },
} as const satisfies Record<string, SettlingEvidenceFixture>;

// ---------------------------------------------------------------------------------------------
// A5, revision (goal_cejel_v26_item6_revision_2026-10-14): a path a workflow step writes or
// uploads is that step's output, not a declaration of a file the repository should hold.
// ---------------------------------------------------------------------------------------------

/** A claims workflow whose last step(s) are `steps`; the first step after `steps:` is line 9. */
function claimsWorkflow(steps: string): Record<string, string> {
  return base(PLAIN_README, {
    '.github/workflows/claims.yml':
      'name: claims\non:\n  push:\n    branches: [main]\njobs:\n  reconcile:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n' +
      steps,
  });
}
/** The line of the first step `claimsWorkflow` appends. */
export const A5_WORKFLOW_STEP_LINE = 10;

export const A5_WRITE_FIXTURES = {
  redirect: {
    name: 'a5-workflow-write-redirect',
    files: claimsWorkflow('      - run: node scripts/claims.js > claims-register.json\n'),
  },
  appendRedirect: {
    name: 'a5-workflow-write-append-redirect',
    files: claimsWorkflow('      - run: node scripts/claims.js >> claims-register.json\n'),
  },
  tee: {
    name: 'a5-workflow-write-tee',
    files: claimsWorkflow('      - run: node scripts/claims.js | tee claims-register.json\n'),
  },
  shortOutputOption: {
    name: 'a5-workflow-write-short-output-option',
    files: claimsWorkflow('      - run: curl -sSL -o claims-register.json https://example.invalid/claims\n'),
  },
  longOutputOption: {
    name: 'a5-workflow-write-long-output-option',
    files: claimsWorkflow('      - run: node scripts/claims.js --output claims-register.json\n'),
  },
  outOption: {
    name: 'a5-workflow-write-out-option',
    files: claimsWorkflow('      - run: node scripts/claims.js --out=claims-register.json\n'),
  },
  continuedRedirect: {
    name: 'a5-workflow-write-continued-redirect',
    files: claimsWorkflow(
      '      - run: |\n          node scripts/claims.js > \\\n            claims-register.json\n',
    ),
  },
  uploadArtifact: {
    name: 'a5-workflow-upload-artifact',
    files: claimsWorkflow(
      '      - uses: actions/upload-artifact@v4\n        with:\n          name: claims\n          path: claims-ledger.json\n',
    ),
  },
  // YAML keys are unordered: `uses:` after the `path:` it governs.
  uploadArtifactUsesLast: {
    name: 'a5-workflow-upload-artifact-uses-last',
    files: claimsWorkflow(
      '      - name: Upload the ledger\n        with:\n          path: claims-ledger.json\n        uses: actions/upload-artifact@v4\n',
    ),
  },
} as const satisfies Record<string, SettlingEvidenceFixture>;

export const A5_READ_FIXTURES = {
  // A step that only reads the file declares it.
  catOnly: {
    name: 'a5-workflow-read-cat',
    files: claimsWorkflow('      - run: cat claims-register.json\n'),
  },
  // The file is read before the redirect; only what follows `>` is written.
  readThenRedirect: {
    name: 'a5-workflow-read-then-redirect',
    files: claimsWorkflow('      - run: node scripts/check.js claims-register.json > report.txt\n'),
  },
  // An upload-artifact step does not shield the next step.
  readAfterUpload: {
    name: 'a5-workflow-read-after-upload',
    files: claimsWorkflow(
      '      - run: cat claims-register.json\n      - uses: actions/upload-artifact@v4\n        with:\n          path: report.txt\n',
    ),
  },
} as const satisfies Record<string, SettlingEvidenceFixture>;

// ---------------------------------------------------------------------------------------------
// A2
// ---------------------------------------------------------------------------------------------

/** orders: a tenant table under row-level security. This is what makes T-1 hold. */
export const ORDERS_WITH_RLS = [
  '-- 0001: orders, isolated per tenant.',
  'CREATE TABLE orders (',
  '  id uuid PRIMARY KEY,',
  '  tenant_id uuid NOT NULL,',
  '  total_cents integer NOT NULL',
  ');',
  '',
  'ALTER TABLE orders ENABLE ROW LEVEL SECURITY;',
  '',
  "CREATE POLICY orders_tenant_isolation ON orders USING (tenant_id = current_setting('app.tenant_id')::uuid);",
  '',
].join('\n');

/** invoices: a tenant table with no policy. CREATE TABLE is on line 2. */
export const INVOICES_UNCOVERED = [
  '-- 0002: invoices.',
  'CREATE TABLE invoices (',
  '  id uuid PRIMARY KEY,',
  '  tenant_id uuid NOT NULL,',
  '  amount_cents integer NOT NULL',
  ');',
  '',
].join('\n');
export const INVOICES_CREATE_TABLE_LINE = 2;

function a2(sql: Readonly<Record<string, string>>): Record<string, string> {
  return base(PLAIN_README, sql);
}

/** A tenant table declared with `createTableName`, covered (or not) by `coverage`. */
function invoicesVariant(createTableName: string, coverage: string, ifNotExists = false): Record<string, string> {
  return a2({
    'migrations/0001_orders.sql': ORDERS_WITH_RLS,
    'migrations/0002_invoices.sql': [
      '-- 0002: invoices.',
      `CREATE TABLE ${ifNotExists ? 'IF NOT EXISTS ' : ''}${createTableName} (`,
      '  id uuid PRIMARY KEY,',
      '  tenant_id uuid NOT NULL',
      ');',
      coverage,
      '',
    ].join('\n'),
  });
}

export const A2_FIXTURES = {
  uncoveredTenantTable: {
    name: 'a2-uncovered-tenant-table',
    files: a2({
      'migrations/0001_orders.sql': ORDERS_WITH_RLS,
      'migrations/0002_invoices.sql': INVOICES_UNCOVERED,
    }),
  },
  everyTenantTableCovered: {
    name: 'a2-every-tenant-table-covered',
    files: a2({
      'migrations/0001_orders.sql': ORDERS_WITH_RLS,
      'migrations/0002_invoices.sql': `${INVOICES_UNCOVERED}ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;\n`,
    }),
  },
  tenantColumnNoRlsAnywhere: {
    name: 'a2-tenant-column-no-rls',
    files: a2({ 'migrations/0002_invoices.sql': INVOICES_UNCOVERED }),
  },
  prismaOnly: {
    name: 'a2-prisma-only',
    files: a2({
      'prisma/schema.prisma': [
        'datasource db {',
        '  provider = "postgresql"',
        '  url      = env("DATABASE_URL")',
        '}',
        '',
        'model Invoice {',
        '  id       String @id',
        '  tenantId String',
        '}',
        '',
      ].join('\n'),
    }),
  },

  // T-2 / T-3 table matching. Each case has a positive (the finding fires on an uncovered
  // tenant table written in that form) and a negative (coverage written in another form of the
  // same name is recognised, so nothing fires).
  quotedUncovered: { name: 'a2-quoted-uncovered', files: invoicesVariant('"invoices"', '') },
  quotedCovered: {
    name: 'a2-quoted-covered',
    files: invoicesVariant('"invoices"', 'ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;'),
  },
  schemaQualifiedUncovered: {
    name: 'a2-schema-qualified-uncovered',
    files: invoicesVariant('billing.invoices', ''),
  },
  schemaQualifiedCovered: {
    name: 'a2-schema-qualified-covered',
    files: invoicesVariant(
      'public.invoices',
      "CREATE POLICY invoices_tenant ON invoices USING (tenant_id = current_setting('app.tenant_id')::uuid);",
    ),
  },
  quotedSchemaQualifiedCovered: {
    name: 'a2-quoted-schema-qualified-covered',
    files: invoicesVariant('"public"."invoices"', 'ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;'),
  },
  caseDifferenceUncovered: { name: 'a2-case-difference-uncovered', files: invoicesVariant('Invoices', '') },
  caseDifferenceCovered: {
    name: 'a2-case-difference-covered',
    files: invoicesVariant('Invoices', 'alter table INVOICES enable row level security;'),
  },
  ifNotExistsUncovered: {
    name: 'a2-if-not-exists-uncovered',
    files: invoicesVariant('invoices', '', true),
  },
  ifNotExistsCovered: {
    name: 'a2-if-not-exists-covered',
    files: invoicesVariant('invoices', 'ALTER TABLE IF EXISTS ONLY invoices ENABLE ROW LEVEL SECURITY;', true),
  },
  multipleStatementsUncovered: {
    name: 'a2-multiple-statements-uncovered',
    files: a2({
      'migrations/0001_schema.sql': `${ORDERS_WITH_RLS}\n${INVOICES_UNCOVERED}`,
    }),
  },
  multipleStatementsCovered: {
    name: 'a2-multiple-statements-covered',
    files: a2({
      'migrations/0001_schema.sql':
        'CREATE TABLE orders (id uuid PRIMARY KEY, tenant_id uuid NOT NULL); CREATE TABLE invoices (id uuid PRIMARY KEY, tenant_id uuid NOT NULL); ' +
        'ALTER TABLE orders ENABLE ROW LEVEL SECURITY; ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;\n',
    }),
  },
  enableThenDisable: {
    name: 'a2-enable-then-disable',
    files: a2({
      'migrations/0001_orders.sql': ORDERS_WITH_RLS,
      'migrations/0002_invoices.sql': `${INVOICES_UNCOVERED}ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;\n`,
      'migrations/0003_invoices_disable.sql': 'ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;\n',
    }),
  },
  disableThenEnable: {
    name: 'a2-disable-then-enable',
    files: a2({
      'migrations/0001_orders.sql': ORDERS_WITH_RLS,
      'migrations/0002_invoices.sql':
        `${INVOICES_UNCOVERED}ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;\nALTER TABLE invoices ENABLE ROW LEVEL SECURITY;\n`,
    }),
  },
  unreadableTableName: {
    name: 'a2-unreadable-table-name',
    files: invoicesVariant('"invoice records"', ''),
  },
  dynamicCoverage: {
    name: 'a2-dynamic-coverage',
    files: a2({
      'migrations/0001_orders.sql': ORDERS_WITH_RLS,
      'migrations/0002_invoices.sql': INVOICES_UNCOVERED,
      'migrations/0003_enable_all.sql': [
        'DO $$',
        'DECLARE t text;',
        'BEGIN',
        "  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP",
        "    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);",
        '  END LOOP;',
        'END $$;',
        '',
      ].join('\n'),
    }),
  },
  commentedOutCoverage: {
    name: 'a2-commented-out-coverage',
    files: a2({
      'migrations/0001_orders.sql': ORDERS_WITH_RLS,
      'migrations/0002_invoices.sql': `${INVOICES_UNCOVERED}-- ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;\n/* CREATE POLICY p ON invoices USING (true); */\n`,
    }),
  },
  rlsOnlyInComments: {
    name: 'a2-rls-only-in-comments',
    files: a2({
      'migrations/0002_invoices.sql': `-- TODO: ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;\n${INVOICES_UNCOVERED}`,
    }),
  },
} as const satisfies Record<string, SettlingEvidenceFixture>;

// ---------------------------------------------------------------------------------------------
// A2, revision (goal_cejel_v26_item6_revision_2026-10-14): a tenant table that no longer exists
// under its CREATE TABLE name.
// ---------------------------------------------------------------------------------------------

export const A2_NAME_FIXTURES = {
  dropped: {
    name: 'a2-tenant-table-dropped',
    files: a2({
      'migrations/0001_orders.sql': ORDERS_WITH_RLS,
      'migrations/0002_invoices.sql': INVOICES_UNCOVERED,
      'migrations/0003_drop_invoices.sql': 'DROP TABLE invoices;\n',
    }),
  },
  droppedIfExistsQualified: {
    name: 'a2-tenant-table-dropped-if-exists-qualified',
    files: a2({
      'migrations/0001_orders.sql': ORDERS_WITH_RLS,
      'migrations/0002_invoices.sql': INVOICES_UNCOVERED,
      'migrations/0003_drop_invoices.sql': 'DROP TABLE IF EXISTS public.invoices, legacy_reports CASCADE;\n',
    }),
  },
  // The idempotent pattern: a DROP before the CREATE in the same directory removes nothing.
  droppedBeforeCreate: {
    name: 'a2-tenant-table-dropped-before-create',
    files: a2({
      'migrations/0001_orders.sql': ORDERS_WITH_RLS,
      'migrations/0002_invoices.sql': `DROP TABLE IF EXISTS invoices;\n${INVOICES_UNCOVERED}`,
    }),
  },
  droppedInAnotherDirectory: {
    name: 'a2-tenant-table-dropped-in-another-directory',
    files: a2({
      'migrations/0001_orders.sql': ORDERS_WITH_RLS,
      'migrations/0002_invoices.sql': INVOICES_UNCOVERED,
      'db/cleanup/drop_invoices.sql': 'DROP TABLE invoices;\n',
    }),
  },
  droppedDynamically: {
    name: 'a2-tenant-table-dropped-dynamically',
    files: a2({
      'migrations/0001_orders.sql': ORDERS_WITH_RLS,
      'migrations/0002_invoices.sql': INVOICES_UNCOVERED,
      'migrations/0003_cleanup.sql': "DO $$\nBEGIN\n  EXECUTE 'DROP TABLE ' || 'invoices';\nEND $$;\n",
    }),
  },
  renamedCoveredUnderNewName: {
    name: 'a2-tenant-table-renamed-covered-under-new-name',
    files: a2({
      'migrations/0001_orders.sql': ORDERS_WITH_RLS,
      'migrations/0002_invoices.sql': INVOICES_UNCOVERED,
      'migrations/0003_archive_invoices.sql': [
        'ALTER TABLE invoices RENAME TO invoices_archive;',
        "CREATE POLICY invoices_archive_tenant ON invoices_archive USING (tenant_id = current_setting('app.tenant_id')::uuid);",
        '',
      ].join('\n'),
    }),
  },
  // Coverage written before the rename moves with the table.
  renamedAfterCoverage: {
    name: 'a2-tenant-table-renamed-after-coverage',
    files: a2({
      'migrations/0001_orders.sql': ORDERS_WITH_RLS,
      'migrations/0002_invoices.sql': `${INVOICES_UNCOVERED}ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;\n`,
      'migrations/0003_archive_invoices.sql': 'ALTER TABLE invoices RENAME TO invoices_archive;\n',
    }),
  },
  renamedUncovered: {
    name: 'a2-tenant-table-renamed-uncovered',
    files: a2({
      'migrations/0001_orders.sql': ORDERS_WITH_RLS,
      'migrations/0002_invoices.sql': INVOICES_UNCOVERED,
      'migrations/0003_archive_invoices.sql': 'ALTER TABLE invoices RENAME TO invoices_archive;\n',
    }),
  },
  renamedInAnotherDirectory: {
    name: 'a2-tenant-table-renamed-in-another-directory',
    files: a2({
      'migrations/0001_orders.sql': ORDERS_WITH_RLS,
      'migrations/0002_invoices.sql': INVOICES_UNCOVERED,
      'db/archive/archive_invoices.sql': 'ALTER TABLE invoices RENAME TO invoices_archive;\n',
    }),
  },
} as const satisfies Record<string, SettlingEvidenceFixture>;

export const SETTLING_EVIDENCE_FIXTURES: readonly SettlingEvidenceFixture[] = [
  ...Object.values(A5_FIXTURES),
  ...Object.values(A5_WRITE_FIXTURES),
  ...Object.values(A5_READ_FIXTURES),
  ...Object.values(A2_FIXTURES),
  ...Object.values(A2_NAME_FIXTURES),
];
