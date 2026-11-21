import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { witanV27LfsPointerNotApplicablePrefix } from '../abstention.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { A3_FLOOR_PAIRS } from './fixtures/a3-pointer-fixtures.js';
import { type FalseAssuranceFixture, buildFalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';

// v27 A3 floor guard (operator ruling of 20 Nov on #753; refs #519 #753). v27 keeps a scored A3 that
// read Git LFS pointers where every metric that read one is at its maximum (lfsPointerKeepsScoredA3
// in repo-signals.ts). That rests on #753's finding that no A3 content read can lower a scored A3: a
// pointer, read as text, matches none of A3's patterns, so a reading with pointers is a floor on
// the content-complete reading. This file fails if that stops being true, in two parts:
//   1. A static inventory, read with the TypeScript parser, of every place in
//      collectA3ProdReadinessEvidence that names a function which reaches readRepoText or
//      readRepoTextPrefix (the two reads that detect a pointer), directly or through other
//      functions in src/. Each is pinned by name and occurrence and reviewed below with the read it
//      is (a row of #753's item C), or why v17 and v27 never run it. A new content read, or one
//      moved, fails here until it is reviewed and, where v17 or v27 runs it, given a pair.
//   2. For each reviewed read, a control and the same repository with that read's file committed
//      as a Git LFS pointer (fixtures/a3-pointer-fixtures.ts, A3_FLOOR_PAIRS). Under v17, and under
//      v27 with the pointer abstention switched off (the pointer read as text, as v17 reads it), the
//      pointer reading's A3 score is at or below its control's. Under v27 as shipped, A3 must be
//      shown to have read the pointer, so a pair whose pointer A3 never reaches cannot pass.
// What it cannot see: a read through a function value it cannot name (a callback from data, a
// dynamic import), and a lowering that no pair's repository exercises.

const switches = vi.hoisted(() => ({ pointerAbstentionOff: false }));

vi.mock('../content-reads.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../content-reads.js')>();
  return {
    ...actual,
    trackContentReads: ((repoPath, collect, options) =>
      actual.trackContentReads(
        repoPath,
        collect,
        switches.pointerAbstentionOff ? { ...options, lfsPointerAbstention: false } : options,
      )) as typeof actual.trackContentReads,
  };
});

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;

// ---------------------------------------------------------------------------------------------
// 1. The inventory of A3's content reads
// ---------------------------------------------------------------------------------------------

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const COLLECTOR = 'collectA3ProdReadinessEvidence';
const POINTER_READERS = ['readRepoText', 'readRepoTextPrefix'];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return /\.ts$/.test(entry.name) && !/\.(?:test|spec)\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) ? [path] : [];
  });
}

type FunctionLike = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;

function nameOf(fn: FunctionLike): string | undefined {
  if ((ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) && fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  if (ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) return fn.parent.name.text;
  return undefined;
}

/** True where `node` is the name half of `a.name`, a property key, or a declaration's own name. */
function isNotAReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isFunctionDeclaration(parent) && parent.name === node) ||
    (ts.isVariableDeclaration(parent) && parent.name === node) ||
    (ts.isParameter(parent) && parent.name === node) ||
    ts.isImportSpecifier(parent) ||
    ts.isExportSpecifier(parent)
  );
}

interface Graph {
  readonly references: Map<string, Set<string>>;
  readonly collector?: { readonly node: FunctionLike; readonly sourceFile: ts.SourceFile };
}

function buildGraph(): Graph {
  const references = new Map<string, Set<string>>();
  let collector: Graph['collector'];
  for (const file of sourceFiles(SRC)) {
    const sourceFile = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node, owner: string | undefined): void => {
      let current = owner;
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
        const name = nameOf(node);
        // A named function is its own node in the graph; an anonymous one belongs to its owner.
        if (name !== undefined) {
          current = name;
          if (!references.has(name)) references.set(name, new Set());
          if (name === COLLECTOR && relative(SRC, file) === join('witan', 'repo-signals.ts')) collector = { node, sourceFile };
        }
      }
      if (ts.isIdentifier(node) && current !== undefined && !isNotAReference(node)) {
        references.get(current)?.add(node.text);
      }
      ts.forEachChild(node, (child) => visit(child, current));
    };
    visit(sourceFile, undefined);
  }
  return { references, ...(collector ? { collector } : {}) };
}

/** Every function name that reaches a pointer-detecting read, by name, across src/. */
function contentReaders(graph: Graph): Set<string> {
  const readers = new Set(POINTER_READERS);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, refs] of graph.references) {
      if (readers.has(name)) continue;
      if ([...refs].some((ref) => readers.has(ref))) {
        readers.add(name);
        grew = true;
      }
    }
  }
  return readers;
}

/** `<name>#<n>` for each reference, in source order, inside the collector to a content reader. */
function a3ContentReadSites(): string[] {
  const graph = buildGraph();
  if (!graph.collector) throw new Error(`${COLLECTOR} not found in witan/repo-signals.ts`);
  const readers = contentReaders(graph);
  const seen = new Map<string, number>();
  const sites: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && !isNotAReference(node) && readers.has(node.text)) {
      const index = seen.get(node.text) ?? 0;
      seen.set(node.text, index + 1);
      sites.push(`${node.text}#${index}`);
    }
    ts.forEachChild(node, visit);
  };
  const body = graph.collector.node.body;
  if (body) visit(body);
  return sites;
}

type ReviewedRead = { readonly reads: readonly string[] } | { readonly offUnderV17AndV27: string };

const GATE = ['gate: CI workflow deploy job', 'gate: server entrypoint port binding', 'gate: Dockerfile runtime command'];
const HEALTH = [
  'prod_readiness_primitives: Dockerfile HEALTHCHECK',
  'prod_readiness_primitives: k8s probe',
  'prod_readiness_primitives: health signal file',
];
const CITATION = ['evidence: citation line'];
const V20 = 'Inside a useV20ExplicitGaps branch: v20-v26 only.';
const V28 = 'Inside the useV28OwnReadings block or its inputs: v28 only.';

// Reviewed 20 Nov against #753 item C. `reads` names the pairs in A3_FLOOR_PAIRS that commit the
// file this site reads as a pointer. Under v17 and v27 every v20-v26 flag the collector takes is off.
const REVIEWED_A3_READS: Readonly<Record<string, ReviewedRead>> = {
  'findV20DirectHttpServerEntrypointFile#0': { offUnderV17AndV27: 'useV20ExplicitGaps only.' },
  'findV22PackageStartHttpServerEntrypointFile#0': { offUnderV17AndV27: 'useV22PackageStartEntrypoint only.' },
  'findRuntimeContainerEntrypointFile#0': { offUnderV17AndV27: 'v20RuntimeContainer: useV20ExplicitGaps only.' },
  // The applicability gate: workflows for a deploy job, entry-shaped files for a port binding,
  // Dockerfiles for a runtime command. A pointer here can only take A3 to not-applicable, where v27
  // abstains.
  'isDeployableService#0': { reads: GATE },
  'readPackageScripts#0': { reads: ['prod_readiness_primitives: build or type-check script'] },
  'isHealthCheckSignalFile#0': { reads: HEALTH },
  'fileMatchesOutsideComments#0': { offUnderV17AndV27: 'inlineHealthRouteFile: useV25InlineHealthRoute only.' },
  'fileContains#0': { offUnderV17AndV27: 'hasV20HealthOrReadinessRoute: useV20ExplicitGaps, or v28 (item B), only.' },
  'fileContains#1': { offUnderV17AndV27: 'hasV22PackageStartHealthOrReadinessRoute: v22PackageStartHttpEntrypoint is null without useV22PackageStartEntrypoint.' },
  // serverEntrypoint: the same entry-shaped files the gate reads; used only for the anchor citation
  // (and a v20 finding).
  'findServerEntrypointFile#0': { reads: ['gate: server entrypoint port binding'] },
  'findRuntimeContainerEntrypointFile#1': { reads: ['runtime container read'] },
  'fileMatchesOutsideComments#1': { reads: ['prod_readiness_primitives: error middleware content'] },
  'fileMatchesOutsideComments#2': { reads: ['prod_readiness_primitives: error middleware content'] },
  'countFilesMatchingAny#0': { reads: ['observability_depth'] },
  'countFilesContaining#0': { reads: ['rollback_safety_depth'] },
  // The citations: each cited file's first meaningful line, or its matched line. Nothing scored.
  'evidenceForRelative#0': { reads: CITATION },
  'evidenceForRelative#1': { reads: CITATION },
  'evidenceForRelative#2': { reads: CITATION },
  'evidenceForRelative#3': { reads: CITATION },
  'evidenceForRelative#4': { reads: CITATION },
  'evidenceForRelative#5': { reads: CITATION },
  'evidenceForRelativeAtLine#0': { offUnderV17AndV27: 'The inline health route citation: useV25InlineHealthRoute only.' },
  'findFirstMatchingLineOutsideComments#0': { offUnderV17AndV27: 'The inline health route citation: useV25InlineHealthRoute only.' },
  'evidenceForRelativeAtLine#1': { reads: CITATION },
  'findFirstMatchingLineOutsideComments#1': { reads: CITATION },
  'evidenceForRelative#6': { reads: CITATION },
  'evidenceForRelative#7': { reads: CITATION },
  'evidenceForRelative#8': { reads: CITATION },
  'findDeclaredWorkspaceManifests#0': { offUnderV17AndV27: V20 },
  'readPackageScripts#1': { offUnderV17AndV27: V20 },
  'settleV26BuildStepEvidence#0': { offUnderV17AndV27: V20 },
  'evidenceForRelative#9': { offUnderV17AndV27: V20 },
  'fileContains#2': { offUnderV17AndV27: V20 },
  'evidenceForRelative#10': { offUnderV17AndV27: V20 },
  'fileContains#3': { offUnderV17AndV27: V20 },
  'evidenceForRelative#11': { offUnderV17AndV27: V20 },
  // The second v28 card (21 Nov), items A and B: run under v28 alone (useV28OwnReadings). Every read
  // they make is attributed to dockerfile_healthcheck or health_readiness_route, neither a metric, so
  // under the v27 gate v28 carries, a pointer among them abstains A3 rather than lowering it.
  'findV20DirectHttpServerEntrypointFile#1': { offUnderV17AndV27: V28 },
  'readV28RuntimeHealthcheckCoverage#0': { offUnderV17AndV27: V28 },
  'evidenceForRelativeAtLine#2': { offUnderV17AndV27: V28 },
  'evidenceForRelative#12': { offUnderV17AndV27: V28 },
  'fileContains#4': { offUnderV17AndV27: V28 },
  'evidenceForRelative#13': { offUnderV17AndV27: V28 },
};

describe('v27 A3 floor guard, part 1: every A3 content read is named and paired', () => {
  const sites = a3ContentReadSites();

  it('finds the reads it is meant to find, so an empty inventory cannot pass', () => {
    expect(sites).toContain('isDeployableService#0');
    expect(sites).toContain('countFilesContaining#0');
    expect(sites).toContain('isHealthCheckSignalFile#0');
  });

  it('matches the reviewed inventory exactly: a new or moved A3 content read must be reviewed', () => {
    const unreviewed = sites.filter((site) => !(site in REVIEWED_A3_READS));
    const stale = Object.keys(REVIEWED_A3_READS).filter((site) => !sites.includes(site));
    expect({ unreviewed, stale }, `A3 content reads changed. Review each, and pair every read v17 or v27 runs.`).toEqual({
      unreviewed: [],
      stale: [],
    });
  });

  it('pairs every reviewed read that v17 or v27 runs, and pairs nothing that is not reviewed', () => {
    const reads = new Set(
      Object.values(REVIEWED_A3_READS).flatMap((entry) => ('reads' in entry ? entry.reads : [])),
    );
    const paired = new Set(A3_FLOOR_PAIRS.map(({ read }) => read));
    expect([...reads].filter((read) => !paired.has(read)), 'reviewed reads with no pair').toEqual([]);
    expect([...paired].filter((read) => !reads.has(read)), 'pairs for no reviewed read').toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. The pairs
// ---------------------------------------------------------------------------------------------

const repos = new Map<string, string>();

function scoreFixture(fixture: FalseAssuranceFixture, rubricVersion: string, pointerAbstentionOff: boolean): WitanReport {
  let repo = repos.get(fixture.name);
  if (!repo) {
    repo = buildFalseAssuranceFixture(fixture);
    repos.set(fixture.name, repo);
  }
  switches.pointerAbstentionOff = pointerAbstentionOff;
  try {
    return scoreRepoWithPublicCejel({
      repoPath: repo,
      productSlug: 'a3-floor-guard',
      productDisplayName: 'A3 floor guard',
      generatedAt: '2026-11-20T00:00:00.000Z',
      rubricVersion,
      ingestPatterns: [],
      autoDiscoverIngest: false,
    });
  } finally {
    switches.pointerAbstentionOff = false;
  }
}

function a3Of(report: WitanReport): WitanCriterionScore {
  const found = report.criteria.find(({ id }) => id === 'A3');
  if (!found) throw new Error('no A3');
  return found;
}

describe('v27 A3 floor guard, part 2: a pointer at any A3 content read never raises A3', () => {
  it.each(A3_FLOOR_PAIRS.map((pair) => [pair.read, pair] as const))('%s', (_read, pair) => {
    // Under v27 as shipped, A3 read the pointer: it abstained on it, or kept with the disclosure.
    const shipped = scoreFixture(pair.pointer, V27, false);
    const readByA3 =
      (shipped.contentReadSummary?.affectedCriteria ?? []).includes('A3') ||
      (a3Of(shipped).disclosures ?? []).some((text) => text.startsWith(witanV27LfsPointerNotApplicablePrefix('A3')));
    expect(readByA3, `${pair.pointer.name}: A3 never read the pointer, so the pair guards nothing`).toBe(true);

    for (const [rubricVersion, off] of [
      [V17, false],
      [V27, true],
    ] as const) {
      const control = a3Of(scoreFixture(pair.control, rubricVersion, off));
      const pointer = a3Of(scoreFixture(pair.pointer, rubricVersion, off));
      expect(pointer.score, `${pair.pointer.name}@${rubricVersion}${off ? ' (pointer abstention off)' : ''}`).toBeLessThanOrEqual(
        control.score,
      );
    }
  });

  it('switching the pointer abstention off gives v27 a reading of the pointer text, not an abstention', () => {
    const pair = A3_FLOOR_PAIRS.find(({ read }) => read === 'rollback_safety_depth');
    if (!pair) throw new Error('no rollback pair');
    const off = scoreFixture(pair.pointer, V27, true);
    expect(off.contentReadSummary?.byReason.lfsPointer ?? 0).toBeGreaterThan(0);
    expect(off.contentReadSummary?.affectedCriteria ?? []).not.toContain('A3');
    expect(a3Of(off).status).not.toBe('insufficient_data');
  });
});
