import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

import ts from 'typescript';

import { listCejelLlmPackFiles } from '../llm/files.js';
import {
  createTypeScriptModuleGraph,
  isFirstPartyModuleGraphSource,
  toModuleGraphRepoPath,
} from '../../typescript-module-graph.js';

export type D1DeclarationKind = 'config' | 'schema' | 'frontmatter';

export interface D1Finding {
  readonly ruleId: 'D1';
  readonly declarationKind: D1DeclarationKind;
  readonly key: string;
  readonly severity: 'warning';
  readonly confidence: 'high';
  readonly summary: string;
  readonly evidence: {
    readonly path: string;
    readonly line: number;
    readonly label: string;
  };
}

interface ObjectCandidate {
  readonly kind: 'config' | 'schema';
  readonly sourceFile: ts.SourceFile;
  readonly declaration: ts.VariableDeclaration;
  readonly symbol: ts.Symbol;
  readonly properties: ReadonlyMap<string, ts.PropertyAssignment>;
}

interface FrontmatterCandidate {
  readonly path: string;
  readonly properties: ReadonlyMap<string, { readonly line: number; readonly value: string }>;
}

const BINDING_BOOLEAN_KEY = /^(?:require|required|enforce|fail|must|allow|enable|disable)[A-Z_]/;

function resolvedSymbol(checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined {
  const symbol = checker.getSymbolAtLocation(node);
  return symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

function isExportedVariable(node: ts.VariableDeclaration): boolean {
  const statement = node.parent.parent;
  return (
    ts.isVariableStatement(statement) &&
    statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true
  );
}

function literalPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function objectCandidate(
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  node: ts.VariableDeclaration,
): ObjectCandidate | null {
  const initializer = node.initializer;
  if (!ts.isIdentifier(node.name) || !initializer || !ts.isObjectLiteralExpression(initializer)) {
    return null;
  }
  if (!isExportedVariable(node)) return null;
  const lowerName = node.name.text.toLowerCase();
  const lowerPath = sourceFile.fileName.toLowerCase();
  const kind =
    lowerName.endsWith('schema') || /(?:^|[/.\-_])schema(?:[/.\-_]|$)/.test(lowerPath)
      ? 'schema'
      : lowerName.endsWith('config') || /(?:^|[/.\-_])config(?:[/.\-_]|$)/.test(lowerPath)
        ? 'config'
        : null;
  if (!kind) return null;

  const properties = new Map<string, ts.PropertyAssignment>();
  for (const property of initializer.properties) {
    if (!ts.isPropertyAssignment(property)) return null;
    const name = literalPropertyName(property.name);
    if (name === null || properties.has(name)) return null;
    properties.set(name, property);
  }
  if (properties.size < 2) return null;
  const symbol = resolvedSymbol(checker, node.name);
  return symbol ? { kind, sourceFile, declaration: node, symbol, properties } : null;
}

function collectObjectCandidates(
  graph: ReturnType<typeof createTypeScriptModuleGraph>,
): ObjectCandidate[] {
  const candidates: ObjectCandidate[] = [];
  for (const sourceFile of graph.program.getSourceFiles()) {
    if (!isFirstPartyModuleGraphSource(graph.root, sourceFile)) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node)) {
        const candidate = objectCandidate(graph.checker, sourceFile, node);
        if (candidate) candidates.push(candidate);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return candidates;
}

function propertyRead(
  checker: ts.TypeChecker,
  candidate: ObjectCandidate,
  node: ts.Node,
): string | null {
  if (ts.isPropertyAccessExpression(node)) {
    return ts.isIdentifier(node.expression) &&
      resolvedSymbol(checker, node.expression) === candidate.symbol
      ? node.name.text
      : null;
  }
  if (
    ts.isElementAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    resolvedSymbol(checker, node.expression) === candidate.symbol &&
    node.argumentExpression &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return node.argumentExpression.text;
  }
  return null;
}

function isHarmlessObjectReference(candidate: ObjectCandidate, node: ts.Identifier): boolean {
  if (node === candidate.declaration.name) return true;
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.expression === node) ||
    (ts.isElementAccessExpression(parent) &&
      parent.expression === node &&
      parent.argumentExpression !== undefined &&
      ts.isStringLiteralLike(parent.argumentExpression)) ||
    ts.isImportSpecifier(parent) ||
    ts.isExportSpecifier(parent)
  );
}

function isBindingBooleanProperty(
  kind: ObjectCandidate['kind'],
  key: string,
  property: ts.PropertyAssignment,
): boolean {
  if (!BINDING_BOOLEAN_KEY.test(key)) return false;
  if (kind === 'config') {
    return (
      property.initializer.kind === ts.SyntaxKind.TrueKeyword ||
      property.initializer.kind === ts.SyntaxKind.FalseKeyword
    );
  }
  if (ts.isObjectLiteralExpression(property.initializer)) {
    return property.initializer.properties.some(
      (member) =>
        ts.isPropertyAssignment(member) &&
        literalPropertyName(member.name) === 'type' &&
        ts.isStringLiteralLike(member.initializer) &&
        member.initializer.text === 'boolean',
    );
  }
  return (
    ts.isCallExpression(property.initializer) &&
    ts.isPropertyAccessExpression(property.initializer.expression) &&
    property.initializer.expression.name.text === 'boolean'
  );
}

function objectReadState(
  graph: ReturnType<typeof createTypeScriptModuleGraph>,
  candidate: ObjectCandidate,
): { readonly readKeys: ReadonlySet<string>; readonly escaped: boolean } {
  const readKeys = new Set<string>();
  let escaped = false;
  for (const sourceFile of graph.program.getSourceFiles()) {
    if (!isFirstPartyModuleGraphSource(graph.root, sourceFile)) continue;
    const visit = (node: ts.Node): void => {
      const read = propertyRead(graph.checker, candidate, node);
      if (read !== null) readKeys.add(read);
      if (
        ts.isIdentifier(node) &&
        node.text === (candidate.declaration.name as ts.Identifier).text &&
        resolvedSymbol(graph.checker, node) === candidate.symbol &&
        !isHarmlessObjectReference(candidate, node)
      ) {
        escaped = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return { readKeys, escaped };
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function finding(
  kind: D1DeclarationKind,
  path: string,
  line: number,
  key: string,
): D1Finding {
  return {
    ruleId: 'D1',
    declarationKind: kind,
    key,
    severity: 'warning',
    confidence: 'high',
    summary: `Declared ${kind} key ${JSON.stringify(key)} has no read site in the resolved first-party module graph.`,
    evidence: {
      path,
      line,
      label: `Unread ${kind} key ${key}`,
    },
  };
}

function objectFindings(
  graph: ReturnType<typeof createTypeScriptModuleGraph>,
  candidate: ObjectCandidate,
): D1Finding[] {
  const state = objectReadState(graph, candidate);
  if (state.escaped) return [];
  const declaredKeys = [...candidate.properties.keys()];
  if (!declaredKeys.some((key) => state.readKeys.has(key))) return [];
  const path = toModuleGraphRepoPath(graph.root, candidate.sourceFile.fileName);
  return declaredKeys.flatMap((key) => {
    if (state.readKeys.has(key)) return [];
    const property = candidate.properties.get(key);
    return property && isBindingBooleanProperty(candidate.kind, key, property)
      ? [finding(candidate.kind, path, lineOf(candidate.sourceFile, property.name), key)]
      : [];
  });
}

function parseFrontmatter(repoRoot: string, path: string): FrontmatterCandidate | null {
  const absolute = resolve(repoRoot, path);
  if (!existsSync(absolute)) return null;
  const contents = readFileSync(absolute, 'utf8');
  const lines = contents.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  const properties = new Map<string, { line: number; value: string }>();
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === '---') break;
    if (!line || /^\s/.test(line) || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*?)\s*$/.exec(line);
    if (!match?.[1] || match[2] === undefined || properties.has(match[1])) return null;
    properties.set(match[1], { line: index + 1, value: match[2] });
  }
  return properties.size >= 2 ? { path, properties } : null;
}

function safeFrontmatterReads(
  graph: ReturnType<typeof createTypeScriptModuleGraph>,
): ReadonlySet<string> {
  const reads = new Set<string>();
  for (const sourceFile of graph.program.getSourceFiles()) {
    if (!isFirstPartyModuleGraphSource(graph.root, sourceFile)) continue;
    const visitFunction = (node: ts.Node): void => {
      if (ts.isFunctionLike(node)) {
        for (const parameter of node.parameters) {
          if (!ts.isIdentifier(parameter.name) || !/^frontmatter$/i.test(parameter.name.text)) {
            continue;
          }
          const parameterName = parameter.name.text;
          const symbol = resolvedSymbol(graph.checker, parameter.name);
          if (!symbol) continue;
          const localReads = new Set<string>();
          let escaped = false;
          const inspect = (child: ts.Node): void => {
            if (ts.isPropertyAccessExpression(child)) {
              if (
                ts.isIdentifier(child.expression) &&
                child.expression.text === parameterName &&
                resolvedSymbol(graph.checker, child.expression) === symbol
              ) {
                localReads.add(child.name.text);
              }
            } else if (
              ts.isElementAccessExpression(child) &&
              ts.isIdentifier(child.expression) &&
              child.expression.text === parameterName &&
              resolvedSymbol(graph.checker, child.expression) === symbol
            ) {
              if (child.argumentExpression && ts.isStringLiteralLike(child.argumentExpression)) {
                localReads.add(child.argumentExpression.text);
              } else {
                escaped = true;
              }
            } else if (
              ts.isIdentifier(child) &&
              child !== parameter.name &&
              child.text === parameterName &&
              resolvedSymbol(graph.checker, child) === symbol &&
              !(
                (ts.isPropertyAccessExpression(child.parent) ||
                  ts.isElementAccessExpression(child.parent)) &&
                child.parent.expression === child
              )
            ) {
              escaped = true;
            }
            ts.forEachChild(child, inspect);
          };
          if ('body' in node && node.body) inspect(node.body);
          if (!escaped) for (const key of localReads) reads.add(key);
        }
      }
      ts.forEachChild(node, visitFunction);
    };
    visitFunction(sourceFile);
  }
  return reads;
}

function frontmatterFindings(
  graph: ReturnType<typeof createTypeScriptModuleGraph>,
  repoFiles: readonly string[],
): D1Finding[] {
  const readKeys = safeFrontmatterReads(graph);
  return repoFiles
    .filter((path) => ['.md', '.mdx'].includes(extname(path).toLowerCase()))
    .map((path) => parseFrontmatter(graph.root, path))
    .filter((candidate): candidate is FrontmatterCandidate => candidate !== null)
    .flatMap((candidate) => {
      if (![...candidate.properties.keys()].some((key) => readKeys.has(key))) return [];
      return [...candidate.properties.entries()].flatMap(([key, property]) => {
        if (readKeys.has(key)) return [];
        if (!BINDING_BOOLEAN_KEY.test(key) || !/^(?:true|false)$/.test(property.value)) return [];
        return [finding('frontmatter', candidate.path, property.line, key)];
      });
    });
}

/** Detect the exact ADR-0013 D1 signature without changing Witan scoring or rubric behavior. */
export function detectDeclaredButUnreadConfig(
  repoRoot: string,
  repoFiles: readonly string[],
): D1Finding[] {
  const graph = createTypeScriptModuleGraph(repoRoot, repoFiles);
  const findings = [
    ...collectObjectCandidates(graph).flatMap((candidate) => objectFindings(graph, candidate)),
    ...frontmatterFindings(graph, repoFiles),
  ];
  return findings.sort(
    (left, right) =>
      left.evidence.path.localeCompare(right.evidence.path) ||
      left.evidence.line - right.evidence.line ||
      left.key.localeCompare(right.key),
  );
}

export function scanDeclaredButUnreadConfig(repoRoot: string): D1Finding[] {
  return detectDeclaredButUnreadConfig(repoRoot, listCejelLlmPackFiles(repoRoot));
}
