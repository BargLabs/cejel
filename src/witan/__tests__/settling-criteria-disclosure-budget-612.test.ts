import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  WITAN_A2_TENANT_ISOLATION_UNSETTLED_DISCLOSURE,
  WITAN_A3_BUILD_STEP_UNSETTLED_DISCLOSURE,
  WITAN_A5_RECONCILIATION_UNSETTLED_DISCLOSURE,
} from '../abstention.js';
import { SETTLING_CRITERIA } from '../next-checks.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V26, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { WitanCriterionDisclosuresSchema, type WitanReport } from '../schemas.js';
import { createWitanReport } from '../scoring.js';

import { buildBehaviourFixture } from './fixtures/behaviour-corpus.js';
import { ALL_BUILD_STEP_FIXTURES } from './fixtures/build-step-evidence-fixtures.js';
import { SETTLING_EVIDENCE_FIXTURES } from './fixtures/settling-evidence-fixtures.js';

// #612 guard (operator ruling of 10 Nov, review of #706). Where a criterion already holds the four
// disclosures the schema allows, a dropped-path statement goes into its notes, and where the notes
// would pass 1,000 characters their tail is cut (stateOn in path-limits.ts). A2, A3 and A5 carry a
// "cannot be settled from static evidence" sentence in their notes, which the certificate's "What
// was not established" and the plain summary read. If such a sentence sat at the tail of full notes
// the cut could drop it, and the certificate would state less uncertainty than exists.
//
// No collector reaches that case today: no A2, A3 or A5 signal carries more than 2 collector
// disclosures, and 2 plus the at most 2 statements a criterion can take is 4, so every statement
// goes into the disclosures and the notes are never touched. Nothing in the source enforces it, so
// this file does, in three parts:
//   1. the budget (2) is derived from the schema and from dropMarkedCitations' behaviour, not typed in;
//   2. a static inventory, read with the TypeScript parser, of every place in src/ that writes a
//      `disclosures` property and every call of a helper that returns one, each pinned by a hash of
//      its source text and reviewed below with the most collector disclosures it can put on one
//      A2, A3 or A5 signal. A new site, a new call of a helper, or any edit to a pinned one fails
//      here until it is reviewed again, and no reviewed entry may exceed the budget;
//   3. a property over the synthetic fixtures that reach the three "cannot be settled" branches:
//      no scored report puts more than the budget on A2, A3 or A5.
// Part 2 does not see a sentence pushed onto a pinned array after its declaration, or a helper
// reached other than by a direct call of its name; part 3 sees only the branches its fixtures
// reach. Neither covers a report input built by hand, whose disclosures and notes no collector wrote.

const BUDGET_NOTE = 'A dropped-path statement must never reach the notes of A2, A3 or A5.';

// ---------------------------------------------------------------------------------------------
// 1. The budget
// ---------------------------------------------------------------------------------------------

const OVER = `src/${'p'.repeat(697)}/x.ts`;
const pointer = (path: string) => ({ kind: 'repository' as const, label: 'file', path });

/** The most entries WitanCriterionDisclosuresSchema accepts, read from the schema itself. */
function schemaDisclosuresMax(): number {
  let max = 0;
  for (let count = 1; count <= 64; count += 1) {
    if (WitanCriterionDisclosuresSchema.safeParse(Array.from({ length: count }, (_, i) => `s${i}.`)).success) {
      max = count;
    }
  }
  return max;
}

/**
 * A criterion with `count` collector disclosures that takes both statements dropMarkedCitations
 * can put on one criterion: a dropped citation and the dropped withheld paths.
 */
function worstCase(count: number) {
  const disclosures = Array.from({ length: count }, (_, i) => `collector ${i}.`);
  const report = createWitanReport({
    productSlug: 'settling-budget',
    productDisplayName: 'Settling budget',
    repo: {},
    generatedAt: '2026-11-10T00:00:00.000Z',
    rubricVersion: WITAN_RUBRIC_VERSION_V17,
    signals: [
      {
        criterionId: 'A3',
        positiveEvidence: [pointer(OVER)],
        notes: WITAN_A3_BUILD_STEP_UNSETTLED_DISCLOSURE,
        ...(count > 0 ? { disclosures } : {}),
      },
    ],
    withheldPaths: [{ path: OVER, reason: 'too_large', signalsAdmitting: ['A3.build_script'], actedOn: false }],
  });
  const a3 = report.criteria.find(({ id }) => id === 'A3');
  if (!a3) throw new Error('no A3');
  return a3;
}

const SCHEMA_DISCLOSURES_MAX = schemaDisclosuresMax();
const STATEMENTS_MAX = (worstCase(0).disclosures ?? []).length;
/** The most collector disclosures an A2, A3 or A5 signal may carry. */
const COLLECTOR_DISCLOSURES_BUDGET = SCHEMA_DISCLOSURES_MAX - STATEMENTS_MAX;

describe('#612 guard: the collector disclosure budget of A2, A3 and A5', () => {
  it('is the schema maximum less the statements one criterion can take: 4 - 2 = 2', () => {
    expect(SCHEMA_DISCLOSURES_MAX).toBe(4);
    expect(STATEMENTS_MAX).toBe(2);
    expect(COLLECTOR_DISCLOSURES_BUDGET).toBe(2);
  });

  it('is exactly where the statements start to reach the notes', () => {
    for (let count = 0; count <= SCHEMA_DISCLOSURES_MAX; count += 1) {
      const a3 = worstCase(count);
      const notesUntouched = a3.notes === WITAN_A3_BUILD_STEP_UNSETTLED_DISCLOSURE;
      expect(notesUntouched, `${count} collector disclosures`).toBe(count <= COLLECTOR_DISCLOSURES_BUDGET);
    }
  });

  it('covers the criteria whose notes the certificate reads a "cannot be settled" sentence from', () => {
    expect([...SETTLING_CRITERIA]).toEqual(['A2', 'A3', 'A5']);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. The static inventory
// ---------------------------------------------------------------------------------------------

const SRC = fileURLToPath(new URL('../../', import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') && !entry.name.endsWith('.test.ts')
      ? [path]
      : [];
  });
}

type FunctionNode = ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression;

function isFunctionNode(node: ts.Node): node is FunctionNode {
  return ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function functionName(fn: FunctionNode): string | undefined {
  if (!ts.isArrowFunction(fn) && fn.name) return fn.name.getText();
  const { parent } = fn;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isPropertyAssignment(parent)) return parent.name.getText();
  return undefined;
}

function nearestFunction(node: ts.Node): FunctionNode | undefined {
  for (let at = node.parent; at; at = at.parent) if (isFunctionNode(at)) return at;
  return undefined;
}

/** The nearest named function around a node, for a stable, readable label. */
function namedWithin(node: ts.Node): string {
  for (let fn = nearestFunction(node); fn; fn = nearestFunction(fn)) {
    const name = functionName(fn);
    if (name) return name;
  }
  return '<module>';
}

const normalised = (text: string): string => text.replace(/\s+/g, ' ').trim();
const shortSha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);

/**
 * The source text a `disclosures` property writes. Where its value is a bare identifier (the
 * shorthand `{ disclosures }`, or `disclosures: kept`), the text of that local's declaration is
 * included, so an entry added to the array it names changes the pin.
 */
function siteText(node: ts.PropertyAssignment | ts.ShorthandPropertyAssignment, sourceFile: ts.SourceFile): string {
  const value = ts.isShorthandPropertyAssignment(node) ? node.name : node.initializer;
  let text = node.getText(sourceFile);
  if (ts.isIdentifier(value)) {
    const scope: ts.Node = nearestFunction(node) ?? sourceFile;
    const visit = (at: ts.Node): void => {
      if (ts.isVariableDeclaration(at) && ts.isIdentifier(at.name) && at.name.text === value.text && at.initializer) {
        text += ` <= ${at.initializer.getText(sourceFile)}`;
      }
      ts.forEachChild(at, visit);
    };
    visit(scope);
  }
  return normalised(text);
}

/** True where the property sits in what its function returns (a return statement or an arrow's expression body). */
function returnedByItsFunction(node: ts.Node, fn: FunctionNode): boolean {
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return true;
  for (let at = node.parent; at && at !== fn; at = at.parent) if (ts.isReturnStatement(at)) return true;
  return false;
}

/**
 * The statement a helper call sits in (the return or declaration that builds the signal), so a
 * disclosure spread added beside the call, or a call moved to another return path, changes the pin.
 */
function callText(node: ts.CallExpression, sourceFile: ts.SourceFile): string {
  for (let at: ts.Node | undefined = node.parent; at && !isFunctionNode(at); at = at.parent) {
    if (ts.isReturnStatement(at) || ts.isVariableStatement(at)) return normalised(at.getText(sourceFile));
  }
  return normalised(node.getText(sourceFile));
}

/** True where `file` declares `name` itself, or imports it from the module `helperFile` names. */
function seesHelper(sourceFile: ts.SourceFile, file: string, name: string, helperFile: string): boolean {
  if (file === helperFile) return true;
  const helperModule = helperFile.replace(/\.ts$/, '').split('/').pop() as string;
  return sourceFile.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.replace(/\.js$/, '').split('/').pop() === helperModule &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some((element) => element.name.text === name),
  );
}

interface InventoryEntry {
  readonly kind: 'site' | 'call';
  readonly file: string;
  readonly within: string;
  /** sha256 of the entry's text, then '#' and its ordinal among entries with the same text. */
  readonly sha: string;
  readonly text: string;
}

const entryKey = ({ kind, file, within, sha }: Pick<InventoryEntry, 'kind' | 'file' | 'within' | 'sha'>): string =>
  `${kind} ${file} ${within} ${sha}`;

/**
 * Every `disclosures` property written in an object literal in src/ (tests excluded), and every
 * call of a named, non-collector function that returns one (a helper such as
 * placeholderSetAsideDisclosures), so a helper called from a new collector is a new entry too.
 * Collectors (`collect*`) are not followed to their callers: a collector is where a signal is
 * made, and its own sites are already entries.
 */
function disclosureInventory(): InventoryEntry[] {
  const raw = rawDisclosureInventory();
  const seen = new Map<string, number>();
  return raw.map((entry) => {
    const base = entryKey(entry);
    const ordinal = seen.get(base) ?? 0;
    seen.set(base, ordinal + 1);
    return { ...entry, sha: `${entry.sha}#${ordinal}` };
  });
}

function rawDisclosureInventory(): InventoryEntry[] {
  const parsed = sourceFiles(SRC).map((path) => ({
    file: relative(SRC, path).split('\\').join('/'),
    sourceFile: ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true),
  }));
  const entries: InventoryEntry[] = [];
  const helpers = new Map<string, string>();
  for (const { file, sourceFile } of parsed) {
    const visit = (node: ts.Node): void => {
      const isSite =
        (ts.isPropertyAssignment(node) &&
          ts.isObjectLiteralExpression(node.parent) &&
          (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
          node.name.text === 'disclosures') ||
        (ts.isShorthandPropertyAssignment(node) && node.name.text === 'disclosures');
      if (isSite) {
        const text = siteText(node as ts.PropertyAssignment | ts.ShorthandPropertyAssignment, sourceFile);
        entries.push({ kind: 'site', file, within: namedWithin(node), sha: shortSha(text), text });
        const fn = nearestFunction(node);
        const name = fn ? functionName(fn) : undefined;
        if (fn && name && !name.startsWith('collect') && returnedByItsFunction(node, fn)) helpers.set(name, file);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  for (const { file, sourceFile } of parsed) {
    const visit = (node: ts.Node): void => {
      const helperFile = ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        ? helpers.get(node.expression.text)
        : undefined;
      if (
        helperFile !== undefined &&
        ts.isCallExpression(node) &&
        seesHelper(sourceFile, file, (node.expression as ts.Identifier).text, helperFile)
      ) {
        const text = callText(node, sourceFile);
        entries.push({ kind: 'call', file, within: namedWithin(node), sha: shortSha(text), text });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return entries;
}

type Role =
  /** Puts collector disclosures on a criterion signal. `most` is reviewed per return path. */
  | 'producer'
  /** Copies, filters or merges disclosures already on a signal; adds none of its own. */
  | 'pass-through'
  /** path-limits' own statements (stateOn): the thing the budget leaves room for. */
  | 'statement'
  /** A schema definition of the field, not a value. */
  | 'schema';

interface ReviewedEntry {
  readonly kind: 'site' | 'call';
  readonly file: string;
  readonly within: string;
  readonly sha: string;
  readonly role: Role;
  /** The criteria this entry can put disclosures on. */
  readonly criteria: readonly string[];
  /**
   * For a producer on A2, A3 or A5: the most collector disclosures the signal it builds can carry
   * on the return path this entry is on, counting every other producer on that path.
   */
  readonly most?: number;
  readonly why: string;
}

const RS = 'witan/repo-signals.ts';
const ANY = ['*'];

// Reviewed 10 Nov at the head of #706. Each collector (collectRepoSignals in repo-signals.ts) emits
// one signal per criterion, so the per-path counts below are what reaches the merge in scoring.ts.
const REVIEWED: readonly ReviewedEntry[] = [
  // A2: the only criterion of the three with collector disclosures today.
  {
    kind: 'site', file: RS, within: 'placeholderSetAsideDisclosures', sha: '4dc96e169fb7#0',
    role: 'producer', criteria: ['A2'], most: 1,
    why: 'One sentence naming the documentation placeholders A2 read and set aside.',
  },
  {
    kind: 'call', file: RS, within: 'collectA2IsolationEvidence', sha: '32f107db13eb#0',
    role: 'producer', criteria: ['A2'], most: 1,
    why: 'Scored A2: the placeholder sentence is its only disclosure. This is the return whose notes end with the tenant-isolation "cannot be settled" sentence.',
  },
  {
    kind: 'call', file: RS, within: 'collectA2IsolationEvidence', sha: '112037139ecd#0',
    role: 'producer', criteria: ['A2'], most: 1,
    why: 'A2 abstains on a directory with no git history (shallowHistoryAbstention carries none), plus the placeholder sentence.',
  },
  {
    kind: 'call', file: RS, within: 'collectA2IsolationEvidence', sha: '495870336548#0',
    role: 'producer', criteria: ['A2'], most: 1,
    why: 'The same abstention where A2 would have been not applicable, plus the placeholder sentence.',
  },
  {
    kind: 'call', file: RS, within: 'collectA2IsolationEvidence', sha: '9b3e7a728939#0',
    role: 'producer', criteria: ['A2'], most: 1,
    why: 'Abstention after an incomplete history read (v27A2HistoryAbstention carries none), plus the placeholder sentence.',
  },
  {
    kind: 'call', file: RS, within: 'collectA2IsolationEvidence', sha: '52aae5465217#0',
    role: 'producer', criteria: ['A2'], most: 2,
    why: 'Not-applicable A2: the placeholder sentence and the history-applicability sentence. Its notes carry no "cannot be settled" sentence, and the certificate reads none from a not-applicable criterion.',
  },
  {
    kind: 'site', file: RS, within: 'collectA2IsolationEvidence', sha: '057d7bffd41b#0',
    role: 'producer', criteria: ['A2'], most: 2,
    why: 'The not-applicable return above, written as `{ disclosures }`: the two sentences of that array.',
  },
  // Criteria outside A2, A3 and A5. A3 and A5 have no entry: their collectors write no disclosure.
  {
    kind: 'site', file: RS, within: 'collectA4DependencyEvidence', sha: 'f97f94c3622c#0',
    role: 'producer', criteria: ['A4'], why: 'Lockfile coverage not computed: one sentence.',
  },
  {
    kind: 'site', file: RS, within: 'collectA4DependencyEvidence', sha: '0d0d73fd243f#0',
    role: 'producer', criteria: ['A4'], why: 'Lockfile requirement not determined: one sentence.',
  },
  {
    kind: 'site', file: RS, within: 'collectB2PrTraceEvidence', sha: '33efd82e6b0b#0',
    role: 'producer', criteria: ['B2'], why: 'Uncredited CI workflows: one sentence.',
  },
  {
    kind: 'site', file: RS, within: 'b3Disclosures', sha: '192409c2dc28#0',
    role: 'producer', criteria: ['B3'], why: "B3's unshown-check and uncredited-workflow sentences.",
  },
  {
    kind: 'call', file: RS, within: 'collectB3CiDisciplineEvidence', sha: 'c8160a831c11#0',
    role: 'producer', criteria: ['B3'], why: "B3's scored return.",
  },
  // Code that moves disclosures already on a signal, and adds none.
  {
    kind: 'site', file: RS, within: 'withoutCountDisclosures', sha: '7c690d70b85b#0',
    role: 'pass-through', criteria: ANY, why: "Filters the abstaining signal's own list.",
  },
  {
    kind: 'call', file: RS, within: 'wholesaleCriterionAbstention', sha: 'edc6fcc22ab0#0',
    role: 'pass-through', criteria: ANY,
    why: "A criterion's wholesale abstention keeps a subset of its own disclosures and replaces its notes with the abstention note.",
  },
  {
    kind: 'site', file: 'witan/scoring.ts', within: 'mergedDisclosures', sha: 'd8b618bd8ea3#0',
    role: 'pass-through', criteria: ANY,
    why: 'Unions two signals for one criterion; the collectors emit one signal per criterion, so it adds none to A2, A3 or A5.',
  },
  {
    kind: 'call', file: 'witan/scoring.ts', within: 'mergeSignalsByCriterion', sha: 'adf99b6fad92#0',
    role: 'pass-through', criteria: ANY, why: 'The merge above.',
  },
  {
    kind: 'site', file: 'witan/scoring.ts', within: 'createWitanReport', sha: '811a73cc3e37#0',
    role: 'pass-through', criteria: ANY, why: "Copies the merged signal's list onto the criterion.",
  },
  {
    kind: 'site', file: 'witan/scoring.ts', within: 'createWitanReport', sha: '811a73cc3e37#1',
    role: 'pass-through', criteria: ANY, why: 'The same, where imported findings adjust the score.',
  },
  // What the budget leaves room for, and the schema.
  {
    kind: 'site', file: 'witan/path-limits.ts', within: 'stateOn', sha: '8f026a87d99d#0',
    role: 'statement', criteria: ANY, why: "#612's dropped-path statements: at most 2 on one criterion.",
  },
  {
    kind: 'site', file: 'witan/schemas.ts', within: '<module>', sha: '04b4c6c83a0c#0',
    role: 'schema', criteria: ANY, why: 'WitanCriterionSignalSchema: at most 4.',
  },
  {
    kind: 'site', file: 'witan/schemas.ts', within: '<module>', sha: '04b4c6c83a0c#1',
    role: 'schema', criteria: ANY, why: 'WitanCriterionScoreSchema: at most 4.',
  },
];

describe('#612 guard: every place src/ writes a disclosure is reviewed against the budget', () => {
  const inventory = disclosureInventory();

  it('finds the sites it is meant to find, so an empty inventory cannot pass', () => {
    expect(inventory.some(({ within }) => within === 'collectA2IsolationEvidence')).toBe(true);
    expect(inventory.some(({ kind, within }) => kind === 'call' && within === 'collectA2IsolationEvidence')).toBe(true);
    expect(inventory.some(({ within }) => within === 'stateOn')).toBe(true);
  });

  it('matches the reviewed inventory exactly: a new or edited site, or a new helper call, must be reviewed', () => {
    const reviewed = new Set(REVIEWED.map(entryKey));
    const found = new Set(inventory.map(entryKey));
    const unreviewed = inventory
      .filter((entry) => !reviewed.has(entryKey(entry)))
      .map(({ kind, file, within, sha, text }) => `${kind} ${file} ${within} ${sha}\n    ${text}`);
    const stale = REVIEWED.filter((entry) => !found.has(entryKey(entry))).map(entryKey);
    const message = [
      'Disclosure-producing code changed. For each unreviewed entry, decide which criteria it reaches',
      `and, on A2, A3 or A5, the most collector disclosures its signal can carry (at most ${COLLECTOR_DISCLOSURES_BUDGET}).`,
      BUDGET_NOTE,
      'Unreviewed:',
      ...unreviewed,
      'No longer found:',
      ...stale,
    ].join('\n');
    expect({ unreviewed, stale }, message).toEqual({ unreviewed: [], stale: [] });
    expect(found.size, 'two entries share a key').toBe(inventory.length);
  });

  it('keeps every producer on A2, A3 or A5 within the budget', () => {
    const settling = new Set<string>(SETTLING_CRITERIA);
    for (const entry of REVIEWED) {
      if (entry.role !== 'producer' || !entry.criteria.some((id) => settling.has(id))) continue;
      expect(entry.most, `${entryKey(entry)}: no reviewed maximum`).toBeTypeOf('number');
      expect(entry.most, `${entryKey(entry)}: ${BUDGET_NOTE}`).toBeLessThanOrEqual(COLLECTOR_DISCLOSURES_BUDGET);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 3. The property over the fixtures that reach the "cannot be settled" branches
// ---------------------------------------------------------------------------------------------

const SETTLING_SENTENCES: Readonly<Record<string, string>> = {
  A2: WITAN_A2_TENANT_ISOLATION_UNSETTLED_DISCLOSURE,
  A3: WITAN_A3_BUILD_STEP_UNSETTLED_DISCLOSURE,
  A5: WITAN_A5_RECONCILIATION_UNSETTLED_DISCLOSURE,
};
const RUBRICS = [WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V26, WITAN_RUBRIC_VERSION_V27] as const;
const FIXTURES = [...SETTLING_EVIDENCE_FIXTURES, ...ALL_BUILD_STEP_FIXTURES];
const created: string[] = [];

afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

describe('#612 guard: no scored fixture puts more than the budget on A2, A3 or A5', () => {
  const reports: { readonly label: string; readonly report: WitanReport }[] = [];

  beforeAll(() => {
    for (const fixture of FIXTURES) {
      const dir = buildBehaviourFixture({ ...fixture, purpose: 'settling-criteria disclosure budget' });
      created.push(dir);
      for (const rubricVersion of RUBRICS) {
        reports.push({
          label: `${fixture.name}@${rubricVersion}`,
          report: scoreRepoWithPublicCejel({
            repoPath: dir,
            productSlug: 'settling-budget-fixture',
            productDisplayName: 'Settling budget fixture',
            generatedAt: '2026-11-10T00:00:00.000Z',
            rubricVersion,
            ingestPatterns: [],
            autoDiscoverIngest: false,
          }),
        });
      }
    }
  }, 600_000);

  it('scored every fixture under every rubric', () => {
    expect(reports.length).toBe(FIXTURES.length * RUBRICS.length);
  });

  it('reaches each "cannot be settled" sentence at least once, so the property is not vacuous', () => {
    for (const [id, sentence] of Object.entries(SETTLING_SENTENCES)) {
      const reached = reports.some(({ report }) =>
        report.criteria.some((criterion) => criterion.id === id && criterion.notes?.includes(sentence) === true),
      );
      expect(reached, `${id}'s sentence`).toBe(true);
    }
  });

  it('never puts more than the budget on A2, A3 or A5', () => {
    for (const { label, report } of reports) {
      for (const criterion of report.criteria) {
        if (!(SETTLING_CRITERIA as readonly string[]).includes(criterion.id)) continue;
        expect((criterion.disclosures ?? []).length, `${label} ${criterion.id}`).toBeLessThanOrEqual(
          COLLECTOR_DISCLOSURES_BUDGET,
        );
      }
    }
  });
});
