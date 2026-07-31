import ts from 'typescript';

import { listCejelLlmPackFiles } from '../llm/files.js';
import {
  createTypeScriptModuleGraph,
  isFirstPartyModuleGraphSource,
  toModuleGraphRepoPath,
} from '../../typescript-module-graph.js';

export interface D4Finding {
  readonly ruleId: 'D4';
  readonly callee: string;
  readonly resultBinding: string;
  readonly collection: string;
  readonly severity: 'warning';
  readonly confidence: 'high';
  readonly summary: string;
  readonly evidence: {
    readonly path: string;
    readonly line: number;
    readonly label: string;
  };
}

interface CalleeContract {
  readonly name: string;
  readonly collection: string;
}

interface CallerSignature extends CalleeContract {
  readonly resultBinding: ts.Identifier;
}

interface StaticReturn {
  readonly ok: boolean;
  readonly error: boolean;
  readonly arrayProperties: ReadonlyMap<string, 'empty' | 'populated'>;
}

type ImplementedFunctionLike =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration;

function literalPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function propertyAssignments(
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

function staticReturn(statement: ts.ReturnStatement): StaticReturn | null {
  if (!statement.expression || !ts.isObjectLiteralExpression(statement.expression)) return null;
  const properties = propertyAssignments(statement.expression);
  if (!properties) return null;
  const ok = properties.get('ok')?.initializer;
  if (ok?.kind !== ts.SyntaxKind.TrueKeyword && ok?.kind !== ts.SyntaxKind.FalseKeyword) {
    return null;
  }
  const error = properties.get('error')?.initializer;
  const arrayProperties = new Map<string, 'empty' | 'populated'>();
  for (const [name, property] of properties) {
    if (name !== 'ok' && ts.isArrayLiteralExpression(property.initializer)) {
      arrayProperties.set(
        name,
        property.initializer.elements.length === 0 ? 'empty' : 'populated',
      );
    }
  }
  return {
    ok: ok.kind === ts.SyntaxKind.TrueKeyword,
    error: Boolean(error && ts.isStringLiteralLike(error) && error.text.trim().length > 0),
    arrayProperties,
  };
}

function directReturns(functionDeclaration: ts.FunctionDeclaration): ts.ReturnStatement[] | null {
  if (!functionDeclaration.body) return null;
  const returns: ts.ReturnStatement[] = [];
  let hasUnsupportedReturn = false;
  const visit = (node: ts.Node): void => {
    if (node !== functionDeclaration && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node)) {
      if (staticReturn(node)) {
        returns.push(node);
      } else {
        hasUnsupportedReturn = true;
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(functionDeclaration.body);
  return hasUnsupportedReturn ? null : returns;
}

function calleeContract(
  repoRoot: string,
  checker: ts.TypeChecker,
  call: ts.CallExpression,
): CalleeContract | null {
  if (!ts.isIdentifier(call.expression)) return null;
  const alias = checker.getSymbolAtLocation(call.expression);
  if (!alias) return null;
  const symbol = (alias.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(alias) : alias;
  const declaration = symbol.declarations?.find(ts.isFunctionDeclaration);
  if (
    !declaration?.name ||
    !isFirstPartyModuleGraphSource(repoRoot, declaration.getSourceFile())
  ) {
    return null;
  }
  const returns = directReturns(declaration);
  if (!returns || returns.length < 3) return null;

  let hasFailure = false;
  const emptyCollections = new Set<string>();
  const populatedCollections = new Set<string>();
  for (const statement of returns) {
    const result = staticReturn(statement);
    if (!result) return null;
    if (!result.ok && result.error) hasFailure = true;
    if (result.ok) {
      for (const [name, cardinality] of result.arrayProperties) {
        (cardinality === 'empty' ? emptyCollections : populatedCollections).add(name);
      }
    }
  }
  if (!hasFailure) return null;
  const candidates = [...emptyCollections].filter((name) => populatedCollections.has(name));
  return candidates.length === 1
    ? { name: declaration.name.text, collection: candidates[0] as string }
    : null;
}

function singleConstBinding(statement: ts.Statement): ts.VariableDeclaration | null {
  if (!ts.isVariableStatement(statement)) return null;
  if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) return null;
  if (statement.declarationList.declarations.length !== 1) return null;
  const declaration = statement.declarationList.declarations[0];
  return declaration && ts.isIdentifier(declaration.name) ? declaration : null;
}

function directCall(initializer: ts.Expression | undefined): ts.CallExpression | null {
  return initializer && ts.isCallExpression(initializer) ? initializer : null;
}

function resultProperty(
  expression: ts.Expression,
  resultBinding: ts.Identifier,
  property: string,
): boolean {
  return (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === resultBinding.text &&
    expression.name.text === property
  );
}

function exactFallbackBinding(
  statement: ts.Statement,
  resultBinding: ts.Identifier,
  collection: string,
): ts.Identifier | null {
  const declaration = singleConstBinding(statement);
  if (!declaration?.initializer || !ts.isConditionalExpression(declaration.initializer)) {
    return null;
  }
  const conditional = declaration.initializer;
  if (!resultProperty(conditional.condition, resultBinding, 'ok')) return null;
  if (!resultProperty(conditional.whenTrue, resultBinding, collection)) return null;
  if (
    !ts.isArrayLiteralExpression(conditional.whenFalse) ||
    conditional.whenFalse.elements.length !== 0
  ) {
    return null;
  }
  return declaration.name as ts.Identifier;
}

function unconditionalSuccessReturn(
  statement: ts.Statement,
  collection: string,
  collectionBinding: ts.Identifier,
): boolean {
  if (!ts.isReturnStatement(statement)) return false;
  if (!statement.expression || !ts.isObjectLiteralExpression(statement.expression)) return false;
  if (statement.expression.properties.length !== 2) return false;
  let hasOk = false;
  let hasCollection = false;
  for (const property of statement.expression.properties) {
    if (!property.name) return false;
    const name = literalPropertyName(property.name);
    if (
      name === 'ok' &&
      ts.isPropertyAssignment(property) &&
      property.initializer.kind === ts.SyntaxKind.TrueKeyword
    ) {
      hasOk = true;
    } else if (
      name === collection &&
      ((ts.isShorthandPropertyAssignment(property) &&
        property.name.text === collectionBinding.text) ||
        (ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.initializer) &&
          property.initializer.text === collectionBinding.text))
    ) {
      hasCollection = true;
    } else {
      return false;
    }
  }
  return hasOk && hasCollection;
}

function isImplementedFunctionLike(node: ts.Node): node is ImplementedFunctionLike {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

function exactCallerSignature(
  repoRoot: string,
  checker: ts.TypeChecker,
  node: ImplementedFunctionLike,
): CallerSignature | null {
  if (!node.body || !ts.isBlock(node.body) || node.body.statements.length !== 3) return null;
  const [callStatement, fallbackStatement, returnStatement] = node.body.statements;
  if (!callStatement || !fallbackStatement || !returnStatement) return null;
  const resultDeclaration = singleConstBinding(callStatement);
  if (!resultDeclaration) return null;
  const call = directCall(resultDeclaration.initializer);
  if (!call) return null;
  const contract = calleeContract(repoRoot, checker, call);
  if (!contract) return null;
  const collectionBinding = exactFallbackBinding(
    fallbackStatement,
    resultDeclaration.name as ts.Identifier,
    contract.collection,
  );
  if (!collectionBinding) return null;
  if (!unconditionalSuccessReturn(returnStatement, contract.collection, collectionBinding)) {
    return null;
  }
  return { ...contract, resultBinding: resultDeclaration.name as ts.Identifier };
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/** Detect only the exact ADR-0013 D4 failure-as-empty caller signature. */
export function detectEmptyFailureConflation(
  repoRoot: string,
  repoFiles: readonly string[],
): D4Finding[] {
  const graph = createTypeScriptModuleGraph(repoRoot, repoFiles);
  const findings: D4Finding[] = [];
  for (const sourceFile of graph.program.getSourceFiles()) {
    if (!isFirstPartyModuleGraphSource(graph.root, sourceFile)) continue;
    const visit = (node: ts.Node): void => {
      if (isImplementedFunctionLike(node)) {
        const signature = exactCallerSignature(graph.root, graph.checker, node);
        if (signature) {
          const path = toModuleGraphRepoPath(graph.root, sourceFile.fileName);
          findings.push({
            ruleId: 'D4',
            callee: signature.name,
            resultBinding: signature.resultBinding.text,
            collection: signature.collection,
            severity: 'warning',
            confidence: 'high',
            summary: `Failure from ${JSON.stringify(signature.name)} is converted to an empty ${JSON.stringify(signature.collection)} collection and returned as success.`,
            evidence: {
              path,
              line: lineOf(sourceFile, signature.resultBinding),
              label: `Failure-as-empty result ${signature.resultBinding.text}`,
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
      left.callee.localeCompare(right.callee),
  );
}

export function scanEmptyFailureConflation(repoRoot: string): D4Finding[] {
  return detectEmptyFailureConflation(repoRoot, listCejelLlmPackFiles(repoRoot));
}
