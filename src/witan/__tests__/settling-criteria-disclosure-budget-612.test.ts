// REVIEWED (part 2) is an operator decision. Adding, removing or editing an entry, or raising a
// `most`, is the operator's to approve, not the author's or a reviewer's.

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
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
import { disclosureGapFixture } from './fixtures/disclosure-gap-fixtures.js';
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
//   2. a static inventory, read with the TypeScript parser, of every place in src/ that can put a
//      disclosure on a signal, each pinned by a hash of its source text and reviewed below with the
//      most collector disclosures it can put on one A2, A3 or A5 signal. A new place, or any edit
//      to a pinned one, fails here until it is reviewed again, and no reviewed entry may exceed
//      the budget. It lists:
//        site      a `disclosures` property written in an object literal;
//        write     a property write of `disclosures` (=, ??=, x['disclosures'] = ...), an
//                  Object.assign whose source is not written out there, an Object.defineProperty
//                  or Reflect.set whose key is 'disclosures' or not a literal, and the string
//                  'disclosures' anywhere as a value (from which a computed key could be made);
//        mutation  a call of any method other than a known reader (push, unshift, splice, ...) on
//                  an array that is, aliases or later becomes a `disclosures` value, a write to
//                  one of its elements or properties, or a reassignment of such a local;
//        escape    such an array leaving where the file can follow it: passed to a function that
//                  is not a helper, stored under another property, or returned bare;
//        call      a direct call of a helper;
//        reference a helper reached any other way: aliased, passed or stored as a value, indexed
//                  (`[helper][0](...)`), read as a member, named in a string, imported or exported
//                  under another name, or a namespace, default or dynamic import of its module.
//      A helper is a named function, not a collector and not in REPORT_BOUNDARY, that returns a
//      `disclosures` literal, contains a write, mutation, call or reference, so a wrapper is
//      followed to its own callers;
//   3. a property over the synthetic fixtures that reach the three "cannot be settled" branches
//      and A2's no_git_history abstentions (a directory with no .git): no scored report puts more
//      than the budget on A2, A3 or A5.
// What part 2 still cannot see: a key assembled at run time from pieces or read from data rather
// than written as the literal 'disclosures'; a signal object moved by a spread or a parameter
// without its `disclosures` being named (its list was written at a listed place, and a spread
// replaces rather than unions); an array of disclosures reaching a mutation through a closure or
// a container after leaving by a path not listed above; eval, Function, Proxy, getters and
// prototype patching. Names are resolved per function, not per block, which only lists more.
// Part 3 sees only the branches its fixtures reach. Neither covers a report input built by hand,
// whose disclosures and notes no collector wrote.

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

/**
 * True where `file` declares `name` itself, or imports a binding of that name from any module: a
 * re-export (index.ts) passes a helper on under its own name, so the module is not checked. A
 * same-named function from another module is then listed too, which only lists more.
 */
function seesHelper(sourceFile: ts.SourceFile, file: string, name: string, helperFile: string): boolean {
  if (file === helperFile) return true;
  return sourceFile.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some(
        (element) => element.name.text === name && (element.propertyName ?? element.name).getText() === name,
      ),
  );
}

interface InventoryEntry {
  readonly kind: 'site' | 'call' | 'write' | 'mutation' | 'escape' | 'reference';
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

/** Array methods that read an array and leave it as it was. Any other method called on a tracked array is listed. */
const READERS = new Set([
  'at', 'concat', 'entries', 'every', 'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'flat', 'flatMap',
  'forEach', 'includes', 'indexOf', 'join', 'keys', 'lastIndexOf', 'map', 'reduce', 'reduceRight', 'slice', 'some',
  'toReversed', 'toSorted', 'toSpliced', 'toString', 'values', 'with',
]);
/** The readers that return a new array built from the one they are called on. */
const COPIERS = new Set(['concat', 'filter', 'flat', 'flatMap', 'map', 'slice', 'toReversed', 'toSorted', 'toSpliced', 'with']);
/** Calls that only read the arrays passed to them, so passing one there is not an escape. */
const READING_CALLEES = new Set(['Array.from', 'Array.isArray', 'JSON.stringify', 'Set', 'String']);
/** Calls that write a property named by an argument, or copy every property of a source onto a target. */
const PROPERTY_WRITERS = new Set(['Object.assign', 'Object.defineProperty', 'Reflect.set', 'Reflect.defineProperty']);

type Scope = ts.SourceFile | FunctionNode;

function bare(expression: ts.Expression): ts.Expression {
  let at = expression;
  while (
    ts.isParenthesizedExpression(at) ||
    ts.isNonNullExpression(at) ||
    ts.isAsExpression(at) ||
    ts.isSatisfiesExpression(at) ||
    ts.isTypeAssertionExpression(at)
  ) {
    at = at.expression;
  }
  return at;
}

/** `x.disclosures`, `x?.disclosures` or `x['disclosures']`. */
function namesDisclosures(expression: ts.Expression): boolean {
  const at = bare(expression);
  return (
    (ts.isPropertyAccessExpression(at) && at.name.text === 'disclosures') ||
    (ts.isElementAccessExpression(at) &&
      ts.isStringLiteralLike(at.argumentExpression) &&
      at.argumentExpression.text === 'disclosures')
  );
}

const isAssignment = (node: ts.Node): node is ts.BinaryExpression =>
  ts.isBinaryExpression(node) &&
  node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
  node.operatorToken.kind <= ts.SyntaxKind.LastAssignment;

const VALUE_JOINS = new Set([
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.CommaToken,
]);

/**
 * The arrays an expression's value may be, or may share entries with: identifiers and
 * `.disclosures` reads, through parentheses, `??`, `||`, `&&`, a conditional, an array literal's
 * spreads, a method that returns a copy (filter, slice, concat, ...), Array.from and new Set.
 */
function arrayLeaves(expression: ts.Expression, leaves: ts.Expression[] = []): ts.Expression[] {
  const at = bare(expression);
  if (ts.isIdentifier(at) || namesDisclosures(at)) {
    leaves.push(at);
  } else if (ts.isArrayLiteralExpression(at)) {
    for (const element of at.elements) if (ts.isSpreadElement(element)) arrayLeaves(element.expression, leaves);
  } else if (ts.isConditionalExpression(at)) {
    arrayLeaves(at.whenTrue, leaves);
    arrayLeaves(at.whenFalse, leaves);
  } else if (ts.isBinaryExpression(at) && VALUE_JOINS.has(at.operatorToken.kind)) {
    arrayLeaves(at.left, leaves);
    arrayLeaves(at.right, leaves);
  } else if (ts.isNewExpression(at)) {
    for (const argument of at.arguments ?? []) arrayLeaves(argument, leaves);
  } else if (ts.isCallExpression(at) && ts.isPropertyAccessExpression(at.expression)) {
    const callee = at.expression;
    if (callee.expression.getText() === 'Array') {
      for (const argument of at.arguments) arrayLeaves(argument, leaves);
    } else if (COPIERS.has(callee.name.text)) {
      arrayLeaves(callee.expression, leaves);
      if (callee.name.text === 'concat') for (const argument of at.arguments) arrayLeaves(argument, leaves);
    }
  }
  return leaves;
}

function inTypePosition(node: ts.Node): boolean {
  for (let at: ts.Node | undefined = node.parent; at; at = at.parent) if (ts.isTypeNode(at)) return true;
  return false;
}

function bindingIdentifiers(name: ts.BindingName, into: ts.Identifier[] = []): ts.Identifier[] {
  if (ts.isIdentifier(name)) into.push(name);
  else for (const element of name.elements) if (!ts.isOmittedExpression(element)) bindingIdentifiers(element.name, into);
  return into;
}

/** The statement a node sits in, for a pin: a change anywhere in that statement changes the pin. */
function statementText(node: ts.Node, sourceFile: ts.SourceFile): string {
  let at = node;
  while (
    at.parent &&
    !ts.isBlock(at.parent) &&
    !ts.isSourceFile(at.parent) &&
    !ts.isCaseClause(at.parent) &&
    !ts.isDefaultClause(at.parent) &&
    !ts.isModuleBlock(at.parent) &&
    !(isFunctionNode(at.parent) && at.parent.body === at)
  ) {
    at = at.parent;
  }
  return normalised(at.getText(sourceFile));
}

/**
 * The local arrays of one file that end up as, or alias, a `disclosures` value. Names are resolved
 * to the function (or module) that declares them, ignoring block scope, so two same-named locals in
 * one function are one name here: that only lists more, never less.
 */
function trackedArrays(sourceFile: ts.SourceFile, values: readonly ts.Expression[]): (id: ts.Identifier) => boolean {
  const declared = new Map<Scope, Set<string>>();
  const declare = (scope: Scope, id: ts.Identifier) => {
    const names = declared.get(scope) ?? new Set<string>();
    names.add(id.text);
    declared.set(scope, names);
  };
  const scopeOf = (node: ts.Node): Scope => nearestFunction(node) ?? sourceFile;
  const bindings: { readonly target: ts.Identifier; readonly init: ts.Expression }[] = [];
  const aliases: ts.Identifier[] = [];
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
      for (const id of bindingIdentifiers(node.name)) declare(scopeOf(node), id);
      if (ts.isIdentifier(node.name) && node.initializer) bindings.push({ target: node.name, init: node.initializer });
    }
    if (ts.isFunctionDeclaration(node) && node.name) declare(scopeOf(node), node.name);
    // `const { disclosures } = signal` and `{ disclosures: list }` in a parameter alias the array.
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) {
      const key = node.propertyName ?? node.name;
      if ((ts.isIdentifier(key) || ts.isStringLiteralLike(key)) && key.text === 'disclosures') aliases.push(node.name);
    }
    if (isAssignment(node) && ts.isIdentifier(bare(node.left))) {
      bindings.push({ target: bare(node.left) as ts.Identifier, init: node.right });
    }
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);
  const resolve = (id: ts.Identifier): Scope => {
    for (let scope = scopeOf(id); ; scope = scopeOf(scope)) {
      if (declared.get(scope)?.has(id.text) || ts.isSourceFile(scope)) return scope;
    }
  };
  const tracked = new Map<Scope, Set<string>>();
  const isTracked = (id: ts.Identifier): boolean => tracked.get(resolve(id))?.has(id.text) === true;
  const track = (id: ts.Identifier): boolean => {
    if (isTracked(id)) return false;
    const scope = resolve(id);
    tracked.set(scope, (tracked.get(scope) ?? new Set<string>()).add(id.text));
    return true;
  };
  for (const value of values) for (const leaf of arrayLeaves(value)) if (ts.isIdentifier(leaf)) track(leaf);
  for (const alias of aliases) track(alias);
  for (const { target, init } of bindings) if (arrayLeaves(init).some(namesDisclosures)) track(target);
  for (let changed = true; changed; ) {
    changed = false;
    for (const { target, init } of bindings) {
      const leaves = arrayLeaves(init).filter(ts.isIdentifier);
      if (isTracked(target)) for (const leaf of leaves) changed = track(leaf) || changed;
      if (leaves.some(isTracked)) changed = track(target) || changed;
    }
  }
  return isTracked;
}

type EntryKind = InventoryEntry['kind'];

interface Found {
  readonly kind: EntryKind;
  readonly file: string;
  readonly node: ts.Node;
  readonly text: string;
}

/**
 * The functions that return a scored WitanReport. The merge and the dropped-path statements run
 * inside them, so what A2, A3 and A5 carry is settled when they return: their callers hold a
 * report, not a signal, and are not followed. Each must keep a declared WitanReport return type
 * (checked below), so a rename or a change of what it returns fails here.
 */
const REPORT_BOUNDARY: ReadonlyMap<string, string> = new Map([
  ['createWitanReport', 'witan/scoring.ts'],
  ['scoreRepoWithPublicCejel', 'witan/public-scan.ts'],
]);

/**
 * The nearest named function around a node, whose result a caller may pass on as a signal, unless
 * it is a collector (a collector is where a signal is made, and its own entries are listed) or
 * returns a report (REPORT_BOUNDARY).
 */
function followable(node: ts.Node): string | undefined {
  for (let fn = nearestFunction(node); fn; fn = nearestFunction(fn)) {
    const name = functionName(fn);
    if (name) return name.startsWith('collect') || REPORT_BOUNDARY.has(name) ? undefined : name;
  }
  return undefined;
}

/** The declared return type of each REPORT_BOUNDARY function, read from its file. */
function reportBoundaryReturnTypes(): Map<string, string | undefined> {
  const types = new Map<string, string | undefined>();
  for (const [name, file] of REPORT_BOUNDARY) {
    const sourceFile = ts.createSourceFile(file, readFileSync(join(SRC, file), 'utf8'), ts.ScriptTarget.Latest, true);
    for (const statement of sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
        types.set(name, statement.type?.getText(sourceFile));
      }
    }
  }
  return types;
}

function rawDisclosureInventory(): InventoryEntry[] {
  const parsed = sourceFiles(SRC).map((path) => ({
    file: relative(SRC, path).split('\\').join('/'),
    sourceFile: ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true),
  }));
  const sites: Found[] = [];
  const writes: Found[] = [];
  const mutations: Found[] = [];
  const helpers = new Map<string, string>();
  const makeHelper = (node: ts.Node, file: string): boolean => {
    const name = followable(node);
    if (!name || helpers.has(name)) return false;
    helpers.set(name, file);
    return true;
  };
  const trackers = new Map<string, (id: ts.Identifier) => boolean>();

  // (a) `disclosures` written in an object literal, and (b) written as a property.
  for (const { file, sourceFile } of parsed) {
    const values: ts.Expression[] = [];
    const visit = (node: ts.Node): void => {
      const isSite =
        (ts.isPropertyAssignment(node) &&
          ts.isObjectLiteralExpression(node.parent) &&
          (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
          node.name.text === 'disclosures') ||
        (ts.isShorthandPropertyAssignment(node) && node.name.text === 'disclosures');
      if (isSite) {
        const text = siteText(node as ts.PropertyAssignment | ts.ShorthandPropertyAssignment, sourceFile);
        sites.push({ kind: 'site', file, node, text });
        values.push(ts.isShorthandPropertyAssignment(node) ? node.name : (node as ts.PropertyAssignment).initializer);
        const fn = nearestFunction(node);
        if (fn && returnedByItsFunction(node, fn)) makeHelper(node, file);
      }
      // x.disclosures = ..., x.disclosures ??= ..., x['disclosures'] = ...
      if (isAssignment(node) && namesDisclosures(node.left)) {
        writes.push({ kind: 'write', file, node, text: statementText(node, sourceFile) });
        values.push(node.right);
      }
      // Object.assign(target, source) with a source not written out here, and
      // Object.defineProperty / Reflect.set with the key 'disclosures' or a key computed at run time.
      if (ts.isCallExpression(node) && PROPERTY_WRITERS.has(node.expression.getText(sourceFile))) {
        const [, key, ...rest] = node.arguments;
        const listed =
          node.expression.getText(sourceFile) === 'Object.assign'
            ? [key, ...rest].some((source) => source !== undefined && !ts.isObjectLiteralExpression(bare(source)))
            : key === undefined || !ts.isStringLiteralLike(key) || key.text === 'disclosures';
        if (listed) writes.push({ kind: 'write', file, node, text: statementText(node, sourceFile) });
      }
      // The key 'disclosures' as a value, from which a computed write could be made.
      if (
        ts.isStringLiteralLike(node) &&
        node.text === 'disclosures' &&
        !inTypePosition(node) &&
        !(ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node) &&
        !((ts.isPropertyAssignment(node.parent) || ts.isBindingElement(node.parent)) && node.parent.name === node) &&
        !(ts.isBindingElement(node.parent) && node.parent.propertyName === node)
      ) {
        writes.push({ kind: 'write', file, node, text: statementText(node, sourceFile) });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    trackers.set(file, trackedArrays(sourceFile, values));
  }

  // (c) a change to an array that is, or will be, a `disclosures` value.
  for (const { file, sourceFile } of parsed) {
    const isTracked = trackers.get(file) as (id: ts.Identifier) => boolean;
    const holdsDisclosures = (expression: ts.Expression): boolean =>
      arrayLeaves(expression).some((leaf) => namesDisclosures(leaf) || (ts.isIdentifier(leaf) && isTracked(leaf)));
    const visit = (node: ts.Node): void => {
      let changes = false;
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const callee = node.expression;
        const method = callee.name.text;
        const indirect =
          (method === 'call' || method === 'apply') &&
          ts.isPropertyAccessExpression(callee.expression) &&
          !READERS.has(callee.expression.name.text) &&
          node.arguments[0] !== undefined &&
          holdsDisclosures(node.arguments[0]);
        changes = indirect || (!READERS.has(method) && holdsDisclosures(callee.expression));
      }
      if (isAssignment(node) && !namesDisclosures(node.left)) {
        const target = bare(node.left);
        changes =
          (ts.isIdentifier(target) && isTracked(target)) ||
          ((ts.isElementAccessExpression(target) || ts.isPropertyAccessExpression(target)) &&
            holdsDisclosures(target.expression));
      }
      if (changes) {
        mutations.push({ kind: 'mutation', file, node, text: statementText(node, sourceFile) });
        makeHelper(node, file);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  for (const { node, file } of writes) makeHelper(node, file);

  // (d) every call of a helper, and (e) every other reference to one, until no new helper appears.
  // A named, non-collector function that calls a helper, refers to one, or changes a disclosure is a
  // helper too, so a wrapper around a helper is followed to its own callers.
  let calls: Found[] = [];
  let references: Found[] = [];
  for (let grew = true; grew; ) {
    grew = false;
    calls = [];
    references = [];
    const helperModules = new Set([...helpers.values()].map((file) => file.replace(/\.ts$/, '').split('/').pop() as string));
    for (const { file, sourceFile } of parsed) {
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && helpers.has(node.text) && !inTypePosition(node)) {
          const { parent } = node;
          const helperFile = helpers.get(node.text) as string;
          const declaration =
            (isFunctionNode(parent) || ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) &&
            (parent as { name?: ts.Node }).name === node;
          const importName = ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent);
          const memberName =
            (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
            (ts.isPropertyAssignment(parent) && parent.name === node);
          if (importName && parent.propertyName === node) {
            // import { helper as other } or export { helper as other }: calls of `other` are not read
            // as calls of the helper.
            references.push({ kind: 'reference', file, node, text: statementText(node, sourceFile) });
          } else if (memberName) {
            // ns.helper(...), obj.helper: listed in every file, whatever it imports.
            if (ts.isPropertyAccessExpression(parent)) {
              references.push({ kind: 'reference', file, node, text: statementText(node, sourceFile) });
            }
          } else if (!declaration && !importName && seesHelper(sourceFile, file, node.text, helperFile)) {
            if (ts.isCallExpression(parent) && parent.expression === node) {
              calls.push({ kind: 'call', file, node: parent, text: callText(parent, sourceFile) });
            } else {
              references.push({ kind: 'reference', file, node, text: statementText(node, sourceFile) });
            }
          }
        }
        // 'helperName' as a value, from which a computed lookup could be made.
        if (ts.isStringLiteralLike(node) && helpers.has(node.text) && !inTypePosition(node)) {
          references.push({ kind: 'reference', file, node, text: statementText(node, sourceFile) });
        }
        // A namespace or default import, a dynamic import or a require of a module that defines a
        // helper: member lookups on it cannot all be read statically.
        const specifier =
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          (node.importClause?.name !== undefined ||
            (node.importClause?.namedBindings !== undefined && ts.isNamespaceImport(node.importClause.namedBindings)))
            ? node.moduleSpecifier
            : ts.isCallExpression(node) &&
                (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                  (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
              ? node.arguments[0]
              : undefined;
        if (specifier !== undefined) {
          const module = ts.isStringLiteralLike(specifier)
            ? specifier.text.replace(/\.js$/, '').split('/').pop()
            : undefined;
          if (module === undefined || helperModules.has(module)) {
            references.push({ kind: 'reference', file, node, text: statementText(node, sourceFile) });
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    for (const { node, file } of [...calls, ...references]) grew = makeHelper(node, file) || grew;
  }

  // (f) an array that holds disclosures leaving where this file can follow it: passed to a function
  // that is not a helper, stored under another property, or returned bare.
  const escapes: Found[] = [];
  for (const { file, sourceFile } of parsed) {
    const isTracked = trackers.get(file) as (id: ts.Identifier) => boolean;
    const holdsDisclosures = (expression: ts.Expression): boolean =>
      arrayLeaves(expression).some((leaf) => namesDisclosures(leaf) || (ts.isIdentifier(leaf) && isTracked(leaf)));
    const visit = (node: ts.Node): void => {
      let escapes_ = false;
      if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && node.arguments) {
        const callee = node.expression.getText(sourceFile);
        const reads =
          READING_CALLEES.has(callee) ||
          (ts.isPropertyAccessExpression(node.expression) && READERS.has(node.expression.name.text)) ||
          (ts.isIdentifier(node.expression) && helpers.has(node.expression.text));
        escapes_ = !reads && node.arguments.some((argument) => !ts.isSpreadElement(argument) && holdsDisclosures(argument));
      }
      if (ts.isPropertyAssignment(node) && node.name.getText(sourceFile) !== 'disclosures') {
        escapes_ = holdsDisclosures(node.initializer);
      }
      if (isAssignment(node) && !namesDisclosures(node.left) && !ts.isIdentifier(bare(node.left))) {
        escapes_ = holdsDisclosures(node.right);
      }
      if (ts.isReturnStatement(node) && node.expression) escapes_ = holdsDisclosures(node.expression);
      if (escapes_) escapes.push({ kind: 'escape', file, node, text: statementText(node, sourceFile) });
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return [...sites, ...calls, ...writes, ...mutations, ...escapes, ...references].map(({ kind, file, node, text }) => ({
    kind,
    file,
    within: namedWithin(node),
    sha: shortSha(text),
    text,
  }));
}

type Role =
  /** Puts collector disclosures on a criterion signal. `most` is reviewed per return path. */
  | 'producer'
  /** Copies, filters or merges disclosures already on a signal; adds none of its own. */
  | 'pass-through'
  /** path-limits' own statements (stateOn): the thing the budget leaves room for. */
  | 'statement'
  /** Reads a scored criterion's disclosures for presentation; puts none on a signal. */
  | 'reader'
  /** A schema definition of the field, not a value. */
  | 'schema';

interface ReviewedEntry {
  readonly kind: InventoryEntry['kind'];
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
    kind: 'call', file: RS, within: 'buildWitanInputFromRepo', sha: '5f8ac6265a1a#0',
    role: 'pass-through', criteria: ANY,
    why: 'A criterion abstaining wholesale on a content-read limit: wholesaleCriterionAbstention, above, adds none.',
  },
  {
    kind: 'call', file: RS, within: 'buildWitanInputFromRepo', sha: '5f8ac6265a1a#1',
    role: 'pass-through', criteria: ANY, why: 'The same, on the second return path with the same text.',
  },
  {
    kind: 'call', file: RS, within: 'buildWitanInputFromRepo', sha: 'cd053f1ad4e4#0',
    role: 'pass-through', criteria: ANY, why: 'The same, where the read tracker names no affected signal.',
  },
  {
    kind: 'call', file: RS, within: 'buildWitanInputFromRepo', sha: '81dca7367ea2#0',
    role: 'pass-through', criteria: ANY, why: 'The same, where nothing of the signal survives the dropped reads.',
  },
  {
    kind: 'call', file: 'witan/public-scan.ts', within: 'scoreRepoWithPublicCejel', sha: 'abb87c389354#0',
    role: 'pass-through', criteria: ANY,
    why: 'Gathers the collector signals (buildWitanInputFromRepo) that createWitanReport scores; adds none.',
  },
  {
    kind: 'call', file: 'witan/scoring.ts', within: 'createWitanReport', sha: '3b0ef1ef6a33#0',
    role: 'pass-through', criteria: ANY, why: 'The merge (mergeSignalsByCriterion, above) of the parsed signals.',
  },
  {
    kind: 'site', file: 'witan/scoring.ts', within: 'createWitanReport', sha: '811a73cc3e37#0',
    role: 'pass-through', criteria: ANY, why: "Copies the merged signal's list onto the criterion.",
  },
  {
    kind: 'site', file: 'witan/scoring.ts', within: 'createWitanReport', sha: '811a73cc3e37#1',
    role: 'pass-through', criteria: ANY, why: 'The same, where imported findings adjust the score.',
  },
  // Presentation.
  {
    kind: 'escape', file: 'witan/certificate-presentation.ts', within: 'criterionDisclosures', sha: '5970c1012efd#0',
    role: 'reader', criteria: ANY,
    why: "Returns a filtered copy of a scored criterion's list for the certificate; writes nothing back.",
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

  it('stops following callers only at functions that return a report', () => {
    for (const [name, type] of reportBoundaryReturnTypes()) expect(type, name).toBe('WitanReport');
    expect(reportBoundaryReturnTypes().size).toBe(REPORT_BOUNDARY.size);
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

// A2's no_git_history abstentions (repo-signals.ts, noGitHistoryA2Abstention): a directory with no
// .git, as an archive export is. Each fixture has a documentation placeholder A2 sets aside, so the
// abstention carries a collector disclosure and the property is not vacuous on it.
const NO_GIT_WOULD_BE_NOT_APPLICABLE = 'would otherwise have been marked not applicable';
const NO_GIT_FIXTURES = [
  {
    // No data layer and no .env surface: the abstention that replaces a not-applicable result.
    name: 'a2-not-applicable-with-set-aside',
    files: disclosureGapFixture('a2-not-applicable-with-set-aside').files,
    wouldBeNotApplicable: true,
  },
  {
    // A committed env file beside a .gitignore .env rule, no confirmed secret: the abstention
    // that replaces a scored A2.
    name: 'a2-doc-example-pair-in-committed-env-file',
    files: disclosureGapFixture('a2-doc-example-pair-in-committed-env-file').files,
    wouldBeNotApplicable: false,
  },
] as const;

/** The fixture's files in a fresh directory with no .git. */
function withoutGit(name: string, files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), `cejel-settling-budget-no-git-${name}-`));
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), contents, 'utf8');
  }
  return dir;
}

afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

describe('#612 guard: no scored fixture puts more than the budget on A2, A3 or A5', () => {
  const reports: { readonly label: string; readonly report: WitanReport }[] = [];
  const noGitReports: { readonly label: string; readonly report: WitanReport; readonly wouldBeNotApplicable: boolean }[] = [];
  const score = (repoPath: string, rubricVersion: string): WitanReport =>
    scoreRepoWithPublicCejel({
      repoPath,
      productSlug: 'settling-budget-fixture',
      productDisplayName: 'Settling budget fixture',
      generatedAt: '2026-11-10T00:00:00.000Z',
      rubricVersion,
      ingestPatterns: [],
      autoDiscoverIngest: false,
    });

  beforeAll(() => {
    for (const fixture of FIXTURES) {
      const dir = buildBehaviourFixture({ ...fixture, purpose: 'settling-criteria disclosure budget' });
      created.push(dir);
      for (const rubricVersion of RUBRICS) {
        reports.push({ label: `${fixture.name}@${rubricVersion}`, report: score(dir, rubricVersion) });
      }
    }
    for (const { name, files, wouldBeNotApplicable } of NO_GIT_FIXTURES) {
      const dir = withoutGit(name, files);
      created.push(dir);
      for (const rubricVersion of RUBRICS) {
        const entry = { label: `${name} (no .git)@${rubricVersion}`, report: score(dir, rubricVersion), wouldBeNotApplicable };
        reports.push(entry);
        noGitReports.push(entry);
      }
    }
  }, 600_000);

  it('scored every fixture under every rubric', () => {
    expect(reports.length).toBe((FIXTURES.length + NO_GIT_FIXTURES.length) * RUBRICS.length);
  });

  it("reaches both of A2's no_git_history abstentions, each carrying a collector disclosure", () => {
    for (const { label, report, wouldBeNotApplicable } of noGitReports) {
      const a2 = report.criteria.find(({ id }) => id === 'A2');
      expect(a2?.notes ?? '', label).toContain('A2 abstained (reason: no_git_history)');
      expect((a2?.notes ?? '').includes(NO_GIT_WOULD_BE_NOT_APPLICABLE), label).toBe(wouldBeNotApplicable);
      expect((a2?.disclosures ?? []).length, label).toBeGreaterThanOrEqual(1);
    }
    expect(new Set(noGitReports.map(({ wouldBeNotApplicable }) => wouldBeNotApplicable)).size).toBe(2);
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
