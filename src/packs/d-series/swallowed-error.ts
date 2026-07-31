import ts from 'typescript';

import { listCejelLlmPackFiles } from '../llm/files.js';
import {
  createTypeScriptModuleGraph,
  isFirstPartyModuleGraphSource,
  toModuleGraphRepoPath,
} from '../../typescript-module-graph.js';

export interface D2Finding {
  readonly ruleId: 'D2';
  readonly binding: string;
  readonly severity: 'warning';
  readonly confidence: 'high';
  readonly summary: string;
  readonly evidence: {
    readonly path: string;
    readonly line: number;
    readonly label: string;
  };
}

interface SurfacedResult {
  readonly message: string;
}

function literalPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function objectProperties(
  object: ts.ObjectLiteralExpression,
): ReadonlyMap<string, ts.PropertyAssignment> | null {
  const properties = new Map<string, ts.PropertyAssignment>();
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) return null;
    const name = literalPropertyName(property.name);
    if (name === null || properties.has(name)) return null;
    properties.set(name, property);
  }
  return properties;
}

function surfacedResult(
  statement: ts.Statement | undefined,
  expectedOk: boolean,
): SurfacedResult | null {
  if (!statement || !ts.isReturnStatement(statement)) return null;
  if (!statement.expression || !ts.isObjectLiteralExpression(statement.expression)) return null;
  const properties = objectProperties(statement.expression);
  if (!properties) return null;
  const ok = properties.get('ok')?.initializer;
  if (ok?.kind !== (expectedOk ? ts.SyntaxKind.TrueKeyword : ts.SyntaxKind.FalseKeyword)) {
    return null;
  }
  const message = properties.get('message')?.initializer;
  if (!message || !ts.isStringLiteralLike(message) || message.text.trim().length === 0) return null;
  return { message: message.text };
}

function containsAwait(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) return;
    if (ts.isAwaitExpression(child)) {
      found = true;
      return;
    }
    if (child !== node && ts.isFunctionLike(child)) return;
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function bindingIsUnused(
  checker: ts.TypeChecker,
  catchClause: ts.CatchClause,
  binding: ts.Identifier,
): boolean {
  const symbol = checker.getSymbolAtLocation(binding);
  if (!symbol) return false;
  let used = false;
  const visit = (node: ts.Node): void => {
    if (used) return;
    if (
      ts.isIdentifier(node) &&
      node !== binding &&
      checker.getSymbolAtLocation(node) === symbol
    ) {
      used = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(catchClause.block);
  return !used;
}

function exactSwallowedResultCatch(
  checker: ts.TypeChecker,
  catchClause: ts.CatchClause,
): ts.Identifier | null {
  const binding = catchClause.variableDeclaration?.name;
  if (!binding || !ts.isIdentifier(binding)) return null;
  if (catchClause.block.statements.length !== 1) return null;
  if (!surfacedFailure(catchClause)) return null;
  const tryStatement = catchClause.parent;
  if (!ts.isTryStatement(tryStatement) || !containsAwait(tryStatement.tryBlock)) return null;
  const success = surfacedResult(tryStatement.tryBlock.statements.at(-1), true);
  if (!success) return null;
  return bindingIsUnused(checker, catchClause, binding) ? binding : null;
}

function surfacedFailure(catchClause: ts.CatchClause): SurfacedResult | null {
  return surfacedResult(catchClause.block.statements[0], false);
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/** Detect the exact ADR-0013 D2 surfaced-result signature without changing Witan scoring. */
export function detectSwallowedErrors(
  repoRoot: string,
  repoFiles: readonly string[],
): D2Finding[] {
  const graph = createTypeScriptModuleGraph(repoRoot, repoFiles);
  const findings: D2Finding[] = [];
  for (const sourceFile of graph.program.getSourceFiles()) {
    if (!isFirstPartyModuleGraphSource(graph.root, sourceFile)) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isCatchClause(node)) {
        const binding = exactSwallowedResultCatch(graph.checker, node);
        if (binding) {
          const path = toModuleGraphRepoPath(graph.root, sourceFile.fileName);
          findings.push({
            ruleId: 'D2',
            binding: binding.text,
            severity: 'warning',
            confidence: 'high',
            summary:
              'Caught error is discarded while a static failure message is returned to the caller.',
            evidence: {
              path,
              line: lineOf(sourceFile, binding),
              label: `Swallowed catch binding ${binding.text}`,
            },
          });
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
      left.binding.localeCompare(right.binding),
  );
}

export function scanSwallowedErrors(repoRoot: string): D2Finding[] {
  return detectSwallowedErrors(repoRoot, listCejelLlmPackFiles(repoRoot));
}
