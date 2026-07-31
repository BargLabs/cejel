import ts from 'typescript';

import { listCejelLlmPackFiles } from '../llm/files.js';
import {
  createTypeScriptModuleGraph,
  isFirstPartyModuleGraphSource,
  toModuleGraphRepoPath,
} from '../../typescript-module-graph.js';

export type D5AssertionKind = 'node-assert' | 'expect';

export interface D5Finding {
  readonly ruleId: 'D5';
  readonly assertionKind: D5AssertionKind;
  readonly expectedImport: string;
  readonly subjectPath: string;
  readonly severity: 'warning';
  readonly confidence: 'high';
  readonly summary: string;
  readonly evidence: {
    readonly path: string;
    readonly line: number;
    readonly label: string;
  };
}

interface ImportedBinding {
  readonly localName: string;
  readonly sourceFile: ts.SourceFile;
}

interface AssertionCandidate {
  readonly kind: D5AssertionKind;
  readonly actual: ts.Expression;
  readonly expected: ts.Expression;
  readonly call: ts.CallExpression;
}

const EXPECTED_NAME_PATTERN = /^(?:EXPECTED(?:[_$]|$)|expected(?:[A-Z_$]|$))/;
const TEST_PATH_PATTERN = /(?:^|\/)(?:__tests__\/|[^/]*\.(?:test|spec)(?:\.|$))/i;
const NODE_ASSERTION_METHODS = new Set([
  'deepEqual',
  'deepStrictEqual',
  'equal',
  'strictEqual',
]);
const EXPECT_ASSERTION_METHODS = new Set(['toBe', 'toEqual', 'toStrictEqual']);

function importedBinding(checker: ts.TypeChecker, identifier: ts.Identifier): ImportedBinding | null {
  const symbol = checker.getSymbolAtLocation(identifier);
  if (!symbol || (symbol.flags & ts.SymbolFlags.Alias) === 0) return null;
  if (
    !symbol.declarations?.some(
      (declaration) =>
        ts.isImportSpecifier(declaration) ||
        ts.isImportClause(declaration) ||
        ts.isNamespaceImport(declaration),
    )
  ) {
    return null;
  }
  const target = checker.getAliasedSymbol(symbol);
  const declaration = target.valueDeclaration ?? target.declarations?.[0];
  return declaration
    ? { localName: identifier.text, sourceFile: declaration.getSourceFile() }
    : null;
}

function assertionCandidate(node: ts.CallExpression): AssertionCandidate | null {
  if (ts.isPropertyAccessExpression(node.expression)) {
    const method = node.expression.name.text;
    const receiver = node.expression.expression;
    if (
      NODE_ASSERTION_METHODS.has(method) &&
      ts.isIdentifier(receiver) &&
      /^(?:assert|strict)$/.test(receiver.text) &&
      node.arguments[0] &&
      node.arguments[1]
    ) {
      return {
        kind: 'node-assert',
        actual: node.arguments[0],
        expected: node.arguments[1],
        call: node,
      };
    }
    if (
      EXPECT_ASSERTION_METHODS.has(method) &&
      ts.isCallExpression(receiver) &&
      ts.isIdentifier(receiver.expression) &&
      receiver.expression.text === 'expect' &&
      receiver.arguments[0] &&
      node.arguments[0]
    ) {
      return {
        kind: 'expect',
        actual: receiver.arguments[0],
        expected: node.arguments[0],
        call: node,
      };
    }
  }
  return null;
}

function actualUsesSiblingImport(
  checker: ts.TypeChecker,
  actual: ts.Expression,
  expected: ts.Identifier,
  expectedBinding: ImportedBinding,
): boolean {
  let usesSibling = false;
  const visit = (node: ts.Node): void => {
    if (usesSibling) return;
    if (ts.isIdentifier(node) && node !== expected) {
      const binding = importedBinding(checker, node);
      if (binding?.sourceFile === expectedBinding.sourceFile) {
        usesSibling = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(actual);
  return usesSibling;
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/** Detect the exact high-confidence ADR-0013 D5 signature without changing Witan scoring. */
export function detectSelfReferentialVerification(
  repoRoot: string,
  repoFiles: readonly string[],
): D5Finding[] {
  const graph = createTypeScriptModuleGraph(repoRoot, repoFiles);
  const findings: D5Finding[] = [];
  for (const sourceFile of graph.program.getSourceFiles()) {
    if (!isFirstPartyModuleGraphSource(graph.root, sourceFile)) continue;
    const path = toModuleGraphRepoPath(graph.root, sourceFile.fileName);
    if (!TEST_PATH_PATTERN.test(path)) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const candidate = assertionCandidate(node);
        if (candidate && ts.isIdentifier(candidate.expected)) {
          const expectedBinding = importedBinding(graph.checker, candidate.expected);
          if (
            expectedBinding &&
            isFirstPartyModuleGraphSource(graph.root, expectedBinding.sourceFile) &&
            EXPECTED_NAME_PATTERN.test(expectedBinding.localName) &&
            actualUsesSiblingImport(
              graph.checker,
              candidate.actual,
              candidate.expected,
              expectedBinding,
            )
          ) {
            const subjectPath = toModuleGraphRepoPath(
              graph.root,
              expectedBinding.sourceFile.fileName,
            );
            findings.push({
              ruleId: 'D5',
              assertionKind: candidate.kind,
              expectedImport: expectedBinding.localName,
              subjectPath,
              severity: 'warning',
              confidence: 'high',
              summary: `Assertion expected value ${JSON.stringify(expectedBinding.localName)} is imported from the module under test.`,
              evidence: {
                path,
                line: lineOf(sourceFile, candidate.call),
                label: `Self-referential expected value ${expectedBinding.localName}`,
              },
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return findings.sort(
    (left, right) =>
      left.evidence.path.localeCompare(right.evidence.path) ||
      left.evidence.line - right.evidence.line ||
      left.expectedImport.localeCompare(right.expectedImport),
  );
}

export function scanSelfReferentialVerification(repoRoot: string): D5Finding[] {
  return detectSelfReferentialVerification(repoRoot, listCejelLlmPackFiles(repoRoot));
}
