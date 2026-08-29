import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V20,
  WITAN_RUBRIC_VERSION_V21,
} from '../rubric-version.js';
import { WITAN_RUBRIC_VERSION } from '../schemas.js';

const V21_B6_SUMMARY =
  'This file contains an authored administrative SQL statement — role-membership grant, SUPERUSER escalation, or schema-wide table privilege grant — or executes one through a direct database-driver call, and does not itself contain text matching the human-gate marker pattern.';

function makeRepo(files: Readonly<Record<string, string | undefined>>): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-b6-v21-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  for (const [path, contents] of Object.entries(files)) {
    if (contents === undefined) continue;
    const fullPath = join(repo, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
    execFileSync('git', ['add', path], { cwd: repo });
  }
  return repo;
}

function v21B6Findings(
  files: Readonly<Record<string, string | undefined>>,
  rubricVersion: string,
) {
  const input = buildWitanInputFromRepo({
    productSlug: 'b6-v21-test',
    productDisplayName: 'B6 v21 test',
    repoPath: makeRepo(files),
    generatedAt: '2026-08-10T00:00:00.000Z',
    rubricVersion,
  });
  const b6 = input.signals?.find(({ criterionId }) => criterionId === 'B6');
  return (b6?.findings ?? []).filter(({ summary }) => summary === V21_B6_SUMMARY);
}

describe('prospective v21 B6 executed-escalation findings', () => {
  it('keeps v17 as the public default and leaves v20 free of v21 findings', () => {
    expect(WITAN_RUBRIC_VERSION).toBe(WITAN_RUBRIC_VERSION_V17);
    const files = { 'migrations/roles.sql': 'ALTER ROLE report_worker SUPERUSER;\n' };
    expect(v21B6Findings(files, WITAN_RUBRIC_VERSION_V17)).toEqual([]);
    expect(v21B6Findings(files, WITAN_RUBRIC_VERSION_V20)).toEqual([]);
  });

  it.each([
    {
      name: 'raw ALTER ROLE SUPERUSER',
      defectFile: 'migrations/roles.sql',
      seeded: 'ALTER ROLE report_worker SUPERUSER;\n',
      repaired: 'ALTER ROLE report_worker NOSUPERUSER;\n',
    },
    {
      name: 'raw administrative role membership grant',
      defectFile: 'db/bootstrap.sql',
      seeded: 'GRANT billing_admin TO billing_service;\n',
      repaired: 'GRANT SELECT, INSERT ON invoices TO billing_service;\n',
    },
    {
      name: 'driver query role membership grant',
      defectFile: 'src/promote.js',
      seeded:
        "export async function promote(db, account) { return db.query('GRANT release_admin TO ' + account); }\n",
      repaired:
        "export async function lookup(db, account) { return db.query('SELECT role FROM accounts WHERE id = $1', [account]); }\n",
    },
    {
      name: 'driver execute SUPERUSER escalation',
      defectFile: 'src/roles.ts',
      seeded:
        "export async function elevate(db) { return db.execute('ALTER ROLE identity_worker SUPERUSER'); }\n",
      repaired:
        "export async function harden(db) { return db.execute('ALTER ROLE identity_worker NOSUPERUSER'); }\n",
    },
    {
      name: 'schema-wide table privilege grant',
      defectFile: 'scripts/access.sql',
      seeded: 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO analytics_service;\n',
      repaired: 'GRANT SELECT ON reporting_daily TO analytics_service;\n',
    },
    {
      name: 'raw CREATE ROLE SUPERUSER',
      defectFile: 'database/maintenance.sql',
      seeded: "CREATE ROLE maintenance_worker WITH LOGIN SUPERUSER PASSWORD 'placeholder';\n",
      repaired: 'CREATE ROLE maintenance_worker WITH LOGIN NOSUPERUSER;\n',
    },
  ])('cites only the seeded $name path and stays silent on its repair', (testCase) => {
    const seeded = v21B6Findings(
      { [testCase.defectFile]: testCase.seeded },
      WITAN_RUBRIC_VERSION_V21,
    );
    expect(seeded).toHaveLength(1);
    expect(seeded[0]).toMatchObject({
      severity: 'critical',
      summary: V21_B6_SUMMARY,
      evidence: { path: testCase.defectFile },
    });
    expect(
      v21B6Findings(
        { [testCase.defectFile]: testCase.repaired },
        WITAN_RUBRIC_VERSION_V21,
      ),
    ).toEqual([]);
  });

  it.each([
    ['docs SQL example', { 'docs/example.sql': 'ALTER ROLE sample SUPERUSER;\n' }],
    ['test SQL fixture', { 'tests/roles.sql': 'GRANT release_admin TO test_user;\n' }],
    [
      'commented migration example',
      {
        'migrations/roles.sql':
          '-- ALTER ROLE sample SUPERUSER;\n/* GRANT release_admin TO sample; */\nSELECT 1;\n',
      },
    ],
    [
      'ordinary object grants',
      { 'db/access.sql': 'GRANT SELECT, INSERT, UPDATE ON invoices TO billing_service;\n' },
    ],
    [
      'unexecuted source string',
      { 'src/help.ts': "export const example = 'GRANT release_admin TO account';\n" },
    ],
    [
      'dangerous text inside a safe SELECT literal',
      {
        'src/read.ts':
          'export async function read(db) { return db.query("SELECT \'GRANT release_admin TO account\'"); }\n',
      },
    ],
    [
      'commented-out driver call',
      { 'src/old.ts': "// db.query('GRANT release_admin TO account');\nexport const live = true;\n" },
    ],
    [
      'inline commented-out driver call',
      {
        'src/old-inline.ts':
          "export const live = true; // db.query('GRANT release_admin TO account');\n",
      },
    ],
    [
      'block-commented driver call',
      {
        'src/old-block.ts':
          "export const live = true; /* db.query('GRANT release_admin TO account'); */\n",
      },
    ],
    [
      'documented human gate',
      {
        'src/admin.ts':
          "// This is human-executed and operator-run; never agent-run.\nexport async function promote(db) { return db.query('GRANT release_admin TO account'); }\n",
      },
    ],
  ])('does not flag the paired clean control: %s', (_name, files) => {
    expect(v21B6Findings(files, WITAN_RUBRIC_VERSION_V21)).toEqual([]);
  });
});
