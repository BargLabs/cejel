import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { projectWitanScoringSurface } from '../rubric-fingerprint.js';
import { WITAN_RUBRIC_VERSION_V23, WITAN_RUBRIC_VERSION_V27, WITAN_RUBRIC_VERSION_V28 } from '../rubric-version.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';
import { HERMETIC_GIT_ENV } from './fixtures/behaviour-corpus.js';
import {
  V28_A3_A2_FIXTURES,
  V28_ITEM_A_FIXTURES,
  V28_ITEM_B_FIXTURES,
  V28_ITEM_C_FIXTURES,
  type V28A3A2Fixture,
} from './fixtures/v28-a3-a2-readings-fixtures.js';
import { v28A3A2ItemsReaching, v28Rises } from './v28-rises.js';

// goal_cejel_v28_a3_health_readings_and_a2_pem_2026-11-20 (operator rulings 35 and 36, 20 Nov). The
// second v28 card: v28 checks every runtime Dockerfile for a healthcheck and credits a compose
// healthcheck or an orchestration probe whose link to the Dockerfile is resolved from tracked files
// (item A); carries the v20 health-route finding with its withheld-read abstention (item B); reads
// PEM private keys with v23's grammar, in the tree and in history (item C); and never fires the
// build/typecheck-script finding (item D). Every v28 rise over v27 on these fixtures is named below
// with its item.

const V23 = WITAN_RUBRIC_VERSION_V23;
const V27 = WITAN_RUBRIC_VERSION_V27;
const V28 = WITAN_RUBRIC_VERSION_V28;

const HEALTHCHECK = 'A runtime Dockerfile declares no active HEALTHCHECK instruction.';
const HEALTH_ROUTE = 'A production HTTP entrypoint handles requests directly but declares no health or readiness route.';
const BUILD_SCRIPT = 'A deployable service package manifest declares neither a build nor a typecheck script.';
const PEM = /PEM-formatted private key/i;

const dirs = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function makeRepo(fixture: V28A3A2Fixture): string {
  const dir = mkdtempSync(join(tmpdir(), 'witan-v28-a3-a2-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env: HERMETIC_GIT_ENV, stdio: 'pipe' });
  git('init', '--quiet');
  fixture.commits.forEach((files, index) => {
    for (const [relativePath, contents] of Object.entries(files)) {
      const path = join(dir, relativePath);
      if (contents === null) {
        rmSync(path);
        continue;
      }
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents, 'utf8');
    }
    git('add', '--all');
    git('commit', '--quiet', '--no-gpg-sign', '-m', `synthetic ${index + 1}`);
  });
  return dir;
}

function score(name: string, rubricVersion: string): WitanReport {
  const key = `${rubricVersion}/${name}`;
  const cached = reports.get(key);
  if (cached) return cached;
  const report = scoreRepoWithPublicCejel({
    repoPath: dirs.get(name) as string,
    productSlug: 'synthetic-v28-a3-a2',
    productDisplayName: 'Synthetic v28 A3 A2',
    generatedAt: '2026-11-21T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, report);
  return report;
}

function criterion(name: string, rubricVersion: string, id: string): WitanCriterionScore {
  const found = score(name, rubricVersion).criteria.find((entry) => entry.id === id);
  if (!found) throw new Error(`${name}@${rubricVersion} has no ${id}`);
  return found;
}

const findings = (name: string, rubricVersion: string, id: string, summary: string | RegExp) =>
  criterion(name, rubricVersion, id).findings.filter((finding) =>
    typeof summary === 'string' ? finding.summary === summary : summary.test(finding.summary),
  );

beforeAll(() => {
  for (const fixture of V28_A3_A2_FIXTURES) dirs.set(fixture.name, makeRepo(fixture));
}, 120_000);

describe('item A: every runtime Dockerfile is checked for a healthcheck', () => {
  it('two runtime Dockerfiles, one with HEALTHCHECK: one finding under v28, citing the second', () => {
    const name = 'v28-a3a-two-runtime-dockerfiles';
    const fired = findings(name, V28, 'A3', HEALTHCHECK);
    expect(fired.map(({ evidence }) => evidence?.path)).toEqual(['worker/Dockerfile']);
    expect(fired[0]?.severity).toBe('info');
    expect(
      criterion(name, V28, 'A3').evidence.some(
        ({ path, line, label }) => path === 'api/Dockerfile' && line === 4 && /^Runtime Dockerfile healthcheck/.test(label),
      ),
      JSON.stringify(criterion(name, V28, 'A3').evidence),
    ).toBe(true);
    expect(findings(name, V27, 'A3', HEALTHCHECK)).toEqual([]);
  });

  it('a compose healthcheck for the service built from the second Dockerfile: no finding, the compose line cited', () => {
    for (const [name, path, line] of [
      ['v28-a3a-compose-healthcheck-covers-second', 'docker-compose.yml', 7],
      ['v28-a3a-compose-dockerfile-key-covers-second', 'deploy/compose.yaml', 6],
    ] as const) {
      expect(findings(name, V28, 'A3', HEALTHCHECK), name).toEqual([]);
      expect(
        criterion(name, V28, 'A3').evidence.some(
          (pointer) => pointer.path === path && pointer.line === line && /^Runtime Dockerfile healthcheck/.test(pointer.label),
        ),
        `${name}: ${JSON.stringify(criterion(name, V28, 'A3').evidence)}`,
      ).toBe(true);
    }
  });

  it('a compose healthcheck whose service has no resolvable build, or that is disabled: the finding stands', () => {
    for (const name of [
      'v28-a3a-compose-healthcheck-no-build',
      'v28-a3a-compose-healthcheck-interpolated-build',
      'v28-a3a-compose-healthcheck-disabled',
    ]) {
      expect(findings(name, V28, 'A3', HEALTHCHECK).map(({ evidence }) => evidence?.path), name).toEqual([
        'worker/Dockerfile',
      ]);
    }
  });

  it('an orchestration probe covers the Dockerfile only where tracked files link its image to it', () => {
    const linked = 'v28-a3a-probe-linked-by-compose-image';
    expect(findings(linked, V28, 'A3', HEALTHCHECK)).toEqual([]);
    expect(
      criterion(linked, V28, 'A3').evidence.some(
        ({ path, line, label }) => path === 'k8s/worker.yaml' && line === 11 && /^Runtime Dockerfile healthcheck/.test(label),
      ),
      JSON.stringify(criterion(linked, V28, 'A3').evidence),
    ).toBe(true);
    const unlinked = 'v28-a3a-probe-image-not-linked';
    expect(findings(unlinked, V28, 'A3', HEALTHCHECK).map(({ evidence }) => evidence?.path)).toEqual(['worker/Dockerfile']);
  });

  it('a repository that trips the build/typecheck branch under v23 gets the healthcheck finding under v28', () => {
    const name = 'v28-a3a-build-branch-and-uncovered-dockerfile';
    expect(findings(name, V23, 'A3', BUILD_SCRIPT)).toHaveLength(1);
    expect(findings(name, V23, 'A3', HEALTHCHECK)).toEqual([]);
    expect(findings(name, V28, 'A3', HEALTHCHECK).map(({ evidence }) => evidence?.path)).toEqual(['Dockerfile']);
    expect(findings(name, V28, 'A3', BUILD_SCRIPT)).toEqual([]);
  });
});

describe('item B: the v20 health-route finding, with its withheld-read abstention', () => {
  it('a direct HTTP entrypoint that handles requests and declares no route: the finding, citing it', () => {
    const name = 'v28-a3b-direct-http-no-route';
    const fired = findings(name, V28, 'A3', HEALTH_ROUTE);
    expect(fired.map(({ severity, evidence }) => [severity, evidence?.path])).toEqual([['info', 'src/main.js']]);
    expect(findings(name, V27, 'A3', HEALTH_ROUTE)).toEqual([]);
  });

  it('a readiness route, a delegated handler or a route module: no finding', () => {
    for (const name of ['v28-a3b-direct-http-ready-route', 'v28-a3b-delegated-handler', 'v28-a3b-route-module']) {
      expect(findings(name, V28, 'A3', HEALTH_ROUTE), name).toEqual([]);
    }
  });

  it('a withheld file the reading would read: no finding', () => {
    expect(findings('v28-a3b-withheld-route-file', V28, 'A3', HEALTH_ROUTE)).toEqual([]);
  });

  it("the bare v20 fixture stays not applicable: v28 does not carry v20's widened applicability", () => {
    const name = 'v28-a3b-bare-v20-fixture';
    expect(criterion(name, V27, 'A3').status).toBe('not_applicable');
    expect(criterion(name, V28, 'A3').status).toBe('not_applicable');
  });
});

describe("item C: v23's PEM private-key grammar, in the tree and in history", () => {
  it('a PEM private key in a tracked .key file: a critical finding under v28, none under v27', () => {
    const name = 'v28-a2c-tracked-key-file';
    const fired = findings(name, V28, 'A2', PEM);
    expect(fired.map(({ severity }) => severity)).toContain('critical');
    expect(fired.some(({ evidence }) => evidence?.path === 'deploy/server.key')).toBe(true);
    expect(findings(name, V27, 'A2', PEM)).toEqual([]);
  });

  it('a key deleted from the tree but present in history: a critical finding under v28, none under v27', () => {
    const name = 'v28-a2c-key-in-history-only';
    expect(findings(name, V28, 'A2', PEM).map(({ severity }) => severity)).toContain('critical');
    expect(findings(name, V27, 'A2', PEM)).toEqual([]);
  });

  it('a key as the only secrets surface: A2 is scored under v28 and stays not applicable under v27', () => {
    const name = 'v28-a2c-key-only-secrets-surface';
    expect(criterion(name, V27, 'A2').status).toBe('not_applicable');
    expect(criterion(name, V28, 'A2').status).not.toBe('not_applicable');
    expect(findings(name, V28, 'A2', PEM).map(({ severity }) => severity)).toContain('critical');
  });
});

describe('item D: the build/typecheck-script finding is not carried', () => {
  it('the v20 manifest-script fixture: the finding fires under v23, never under v28', () => {
    const name = 'v28-a3d-build-typecheck-omission';
    expect(findings(name, V23, 'A3', BUILD_SCRIPT)).toHaveLength(1);
    expect(findings(name, V28, 'A3', BUILD_SCRIPT)).toEqual([]);
    expect(criterion(name, V28, 'A3').findings).toEqual(criterion(name, V27, 'A3').findings);
  });
});

// Every fixture here on which v28 scores above v27 by any exit v28Rises counts (composite, either
// trust score, any criterion, or a criterion v27 kept out as not applicable), with its item. Each
// is listed in the RUBRIC_CHANGELOG entry.
export const V28_A3_A2_DECLARED_RISES: Readonly<Record<string, 'A' | 'B' | 'C'>> = {
  'v28-a2c-key-only-secrets-surface': 'C',
};

// The items each fixture reaches, as its v28 report shows them.
const V28_A3_A2_REACH: Readonly<Record<string, readonly ('A' | 'B' | 'C')[]>> = {
  ...Object.fromEntries(V28_ITEM_A_FIXTURES.map(({ name }) => [name, ['A']])),
  'v28-a3a-build-branch-and-uncovered-dockerfile': ['A'],
  ...Object.fromEntries(V28_ITEM_B_FIXTURES.map(({ name }) => [name, []])),
  'v28-a3b-direct-http-no-route': ['B'],
  ...Object.fromEntries(V28_ITEM_C_FIXTURES.map(({ name }) => [name, ['C']])),
  'v28-a3d-build-typecheck-omission': [],
};

describe('no rise above v27 except by a named item', () => {
  it('each fixture reaches exactly the items listed for it', () => {
    for (const { name } of V28_A3_A2_FIXTURES) {
      expect(v28A3A2ItemsReaching(score(name, V28)), name).toEqual(V28_A3_A2_REACH[name]);
    }
  });

  it('every v28 rise over v27, the not-applicable exit included, is a declared fixture whose item reaches it', () => {
    const undeclared: string[] = [];
    for (const { name } of V28_A3_A2_FIXTURES) {
      const moved = v28Rises(score(name, V27), score(name, V28));
      const item = V28_A3_A2_DECLARED_RISES[name];
      if (moved.length > 0 && item === undefined) undeclared.push(`${name}: ${moved.join(', ')}`);
      if (item !== undefined) {
        expect(moved.length, `${name} is declared to rise by item ${item}, but does not`).toBeGreaterThan(0);
        expect(v28A3A2ItemsReaching(score(name, V28)), name).toContain(item);
      }
    }
    expect(undeclared).toEqual([]);
  });

  it('A3 never rises: items A, B and D only add or withhold an info finding and cite evidence', () => {
    for (const { name } of V28_A3_A2_FIXTURES) {
      const before = criterion(name, V27, 'A3');
      const after = criterion(name, V28, 'A3');
      expect(after.status === 'not_applicable', name).toBe(before.status === 'not_applicable');
      expect(after.score, name).toBeLessThanOrEqual(before.score);
      expect(after.metrics, name).toEqual(before.metrics);
    }
  });

  it('where no item reaches a fixture, its scoring surface is v27s', () => {
    for (const { name } of V28_A3_A2_FIXTURES) {
      if ((V28_A3_A2_REACH[name] ?? []).length > 0) continue;
      expect(projectWitanScoringSurface(score(name, V28)), name).toEqual(projectWitanScoringSurface(score(name, V27)));
    }
  });
});
