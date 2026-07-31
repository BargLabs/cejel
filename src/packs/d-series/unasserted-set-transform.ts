import ts from 'typescript';

import {
  createTypeScriptModuleGraph,
  isFirstPartyModuleGraphSource,
  toModuleGraphRepoPath,
} from '../../typescript-module-graph.js';
import { listCejelLlmPackFiles } from '../llm/files.js';

export interface D3Finding {
  readonly ruleId: 'D3';
  readonly sourceBinding: string;
  readonly outputBinding: string;
  readonly explanationBinding: string;
  readonly severity: 'warning';
  readonly confidence: 'high';
  readonly summary: string;
  readonly evidence: {
    readonly path: string;
    readonly line: number;
    readonly label: string;
  };
}

interface FilterTransform {
  readonly sourceBinding: string;
  readonly outputBinding: string;
  readonly call: ts.CallExpression;
}

function isConst(declarationList: ts.VariableDeclarationList): boolean {
  return (declarationList.flags & ts.NodeFlags.Const) !== 0;
}

function directVariableDeclarations(body: ts.Block): readonly ts.VariableDeclaration[] {
  return body.statements.flatMap((statement) =>
    ts.isVariableStatement(statement) && isConst(statement.declarationList)
      ? [...statement.declarationList.declarations]
      : [],
  );
}

function filterTransform(
  declaration: ts.VariableDeclaration,
  parameterNames: ReadonlySet<string>,
): FilterTransform | null {
  if (!ts.isIdentifier(declaration.name)) return null;
  const initializer = declaration.initializer;
  if (!initializer || !ts.isCallExpression(initializer) || initializer.arguments.length !== 1) {
    return null;
  }
  const expression = initializer.expression;
  if (
    !ts.isPropertyAccessExpression(expression) ||
    expression.name.text !== 'filter' ||
    !ts.isIdentifier(expression.expression) ||
    !parameterNames.has(expression.expression.text)
  ) {
    return null;
  }
  return {
    sourceBinding: expression.expression.text,
    outputBinding: declaration.name.text,
    call: initializer,
  };
}

function emptyArrayBinding(declaration: ts.VariableDeclaration): string | null {
  if (!ts.isIdentifier(declaration.name)) return null;
  const initializer = declaration.initializer;
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) return null;
  return initializer.elements.length === 0 ? declaration.name.text : null;
}

function literalPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function surfacedSuccessBindings(statement: ts.Statement): ReadonlySet<string> | null {
  if (!ts.isReturnStatement(statement)) return null;
  if (!statement.expression || !ts.isObjectLiteralExpression(statement.expression)) return null;
  if (statement.expression.properties.length !== 3) return null;

  let literalSuccess = false;
  const shorthandBindings = new Set<string>();
  for (const property of statement.expression.properties) {
    if (ts.isPropertyAssignment(property)) {
      if (literalPropertyName(property.name) !== 'ok') return null;
      if (property.initializer.kind !== ts.SyntaxKind.TrueKeyword) return null;
      literalSuccess = true;
      continue;
    }
    if (!ts.isShorthandPropertyAssignment(property)) return null;
    shorthandBindings.add(property.name.text);
  }
  return literalSuccess && shorthandBindings.size === 2 ? shorthandBindings : null;
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isFunctionImplementation(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function findingsForFunction(
  sourceFile: ts.SourceFile,
  path: string,
  node: ts.FunctionLikeDeclaration,
): D3Finding[] {
  if (!node.body || !ts.isBlock(node.body)) return [];
  const parameterNames = new Set(
    node.parameters.flatMap((parameter) =>
      ts.isIdentifier(parameter.name) ? [parameter.name.text] : [],
    ),
  );
  if (parameterNames.size === 0) return [];

  const declarations = directVariableDeclarations(node.body);
  const transforms = declarations.flatMap((declaration) => {
    const transform = filterTransform(declaration, parameterNames);
    return transform ? [transform] : [];
  });
  const emptyLedgers = new Set(
    declarations.flatMap((declaration) => {
      const binding = emptyArrayBinding(declaration);
      return binding ? [binding] : [];
    }),
  );
  if (transforms.length === 0 || emptyLedgers.size === 0) return [];

  const surfacedResults = node.body.statements.flatMap((statement) => {
    const bindings = surfacedSuccessBindings(statement);
    return bindings ? [bindings] : [];
  });
  const findings: D3Finding[] = [];
  for (const transform of transforms) {
    for (const explanationBinding of emptyLedgers) {
      if (transform.outputBinding === explanationBinding) continue;
      if (
        !surfacedResults.some(
          (bindings) =>
            bindings.has(transform.outputBinding) && bindings.has(explanationBinding),
        )
      ) {
        continue;
      }
      findings.push({
        ruleId: 'D3',
        sourceBinding: transform.sourceBinding,
        outputBinding: transform.outputBinding,
        explanationBinding,
        severity: 'warning',
        confidence: 'high',
        summary:
          'Filtered output is surfaced as successful beside a statically empty explanation ledger.',
        evidence: {
          path,
          line: lineOf(sourceFile, transform.call),
          label: `Unasserted ${transform.sourceBinding} filter into ${transform.outputBinding}`,
        },
      });
    }
  }
  return findings;
}

/** Detect the exact high-confidence ADR-0013 D3 false-success signature. */
export function detectUnassertedSetTransforms(
  repoRoot: string,
  repoFiles: readonly string[],
): D3Finding[] {
  const graph = createTypeScriptModuleGraph(repoRoot, repoFiles);
  const findings: D3Finding[] = [];
  for (const sourceFile of graph.program.getSourceFiles()) {
    if (!isFirstPartyModuleGraphSource(graph.root, sourceFile)) continue;
    const path = toModuleGraphRepoPath(graph.root, sourceFile.fileName);
    const visit = (node: ts.Node): void => {
      if (isFunctionImplementation(node)) {
        findings.push(...findingsForFunction(sourceFile, path, node));
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return findings.sort(
    (left, right) =>
      left.evidence.path.localeCompare(right.evidence.path) ||
      left.evidence.line - right.evidence.line ||
      left.outputBinding.localeCompare(right.outputBinding) ||
      left.explanationBinding.localeCompare(right.explanationBinding),
  );
}

export function scanUnassertedSetTransforms(repoRoot: string): D3Finding[] {
  return detectUnassertedSetTransforms(repoRoot, listCejelLlmPackFiles(repoRoot));
}
