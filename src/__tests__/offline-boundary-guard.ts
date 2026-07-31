import { existsSync, readdirSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { extname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

export const SCORING_SOURCE_ROOTS = ['src', 'api'] as const;
export const ALLOWED_SUBPROCESS_FILE = 'src/witan/git-exec.ts';

const PRODUCTION_SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

const SUBPROCESS_MODULES = new Set(['child_process']);
const NETWORK_MODULES = new Set([
  'http',
  'https',
  'http2',
  'net',
  'dgram',
  'dns',
  'tls',
  'undici',
  'node-fetch',
  'ws',
]);
const OPAQUE_LOADER_MODULES = new Set(['module']);
// Every newly reachable built-in must be reviewed for code-execution, process,
// native-addon, or transport capabilities before it enters this allowlist.
const ALLOWED_BUILTIN_MODULES = new Set([
  'crypto',
  'fs',
  'fs/promises',
  'os',
  'path',
  'url',
]);
// External packages are not capability-transparent. Keep the exact runtime
// entrypoints used by the scoring graph explicit so a new client/transport
// import requires review instead of silently expanding the offline boundary.
const ALLOWED_EXTERNAL_MODULES = new Set([
  '@modelcontextprotocol/sdk/server/mcp.js',
  '@modelcontextprotocol/sdk/server/stdio.js',
  // /api/mcp now requires application-level bearer authentication; retain this transport so
  // authorized remote clients can use the route without granting scoring code outbound access.
  '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js',
  'zod',
]);
const OUTBOUND_GLOBALS = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']);
const GLOBAL_OBJECTS = new Set(['globalThis', 'global', 'window', 'self']);
const GLOBAL_LOADER_OBJECTS = new Set(['process', 'module']);

export type OfflineBoundaryViolationKind =
  | 'subprocess_module'
  | 'network_module'
  | 'unapproved_builtin_module'
  | 'unapproved_external_module'
  | 'opaque_module_loader'
  | 'outbound_global';

export interface OfflineBoundaryViolation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly kind: OfflineBoundaryViolationKind;
  readonly detail: string;
}

function toRepoPath(repoRoot: string, file: string): string {
  return relative(resolve(repoRoot), resolve(file)).split(sep).join('/');
}

function isExcludedSourcePath(repoPath: string): boolean {
  const segments = repoPath.split('/');
  const basename = segments.at(-1) ?? '';
  return (
    segments.includes('__tests__') ||
    segments.includes('__fixtures__') ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(basename)
  );
}

function collectDirectorySources(directory: string, repoRoot: string): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = resolve(directory, entry.name);
    const repoPath = toRepoPath(repoRoot, fullPath);
    if (isExcludedSourcePath(repoPath)) continue;
    if (entry.isSymbolicLink()) {
      throw new Error(`offline_guard_symbolic_link_forbidden:${repoPath}`);
    }
    if (entry.isDirectory()) {
      files.push(...collectDirectorySources(fullPath, repoRoot));
      continue;
    }
    if (entry.isFile() && PRODUCTION_SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

export function collectScoringSourceFiles(repoRoot: string): string[] {
  return SCORING_SOURCE_ROOTS.flatMap((root) =>
    collectDirectorySources(resolve(repoRoot, root), repoRoot),
  ).sort();
}

function normalizeModuleSpecifier(specifier: string): string {
  return specifier.startsWith('node:') ? specifier.slice('node:'.length) : specifier;
}

function literalText(node: ts.Expression | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  return null;
}

function location(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): Pick<OfflineBoundaryViolation, 'line' | 'column'> {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: position.line + 1, column: position.character + 1 };
}

function isExactAllowedSubprocessImport(sourceFile: ts.SourceFile, node: ts.Node): boolean {
  if (sourceFile.fileName.split(sep).join('/').endsWith(`/${ALLOWED_SUBPROCESS_FILE}`) === false) {
    return false;
  }
  if (!ts.isStringLiteralLike(node) || !ts.isImportDeclaration(node.parent)) return false;
  if (node.text !== 'node:child_process') return false;
  const bindings = node.parent.importClause?.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings) || bindings.elements.length !== 1) return false;
  const [element] = bindings.elements;
  if (!element || element.isTypeOnly) return false;
  return (element.propertyName?.text ?? element.name.text) === 'execFileSync';
}

function isGlobalBinding(checker: ts.TypeChecker, node: ts.Identifier): boolean {
  const symbol = checker.getSymbolAtLocation(node);
  const declarations = symbol?.getDeclarations();
  return (
    !declarations ||
    declarations.every((declaration) => declaration.getSourceFile().isDeclarationFile)
  );
}

function isPropertyName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isMethodSignature(parent) && parent.name === node) ||
    (ts.isPropertyDeclaration(parent) && parent.name === node) ||
    (ts.isPropertySignature(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && (parent.name === node || parent.propertyName === node)) ||
    ts.isImportSpecifier(parent) ||
    ts.isExportSpecifier(parent)
  );
}

function globalObjectName(checker: ts.TypeChecker, node: ts.Expression): string | null {
  return ts.isIdentifier(node) && GLOBAL_OBJECTS.has(node.text) && isGlobalBinding(checker, node)
    ? node.text
    : null;
}

function globalLoaderObjectName(checker: ts.TypeChecker, node: ts.Expression): string | null {
  return ts.isIdentifier(node) &&
    GLOBAL_LOADER_OBJECTS.has(node.text) &&
    isGlobalBinding(checker, node)
    ? node.text
    : null;
}

function propertyNameText(
  node: ts.PropertyName | ts.BindingName | ts.Expression | undefined,
): string | null {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return null;
}

function isImportCall(node: ts.CallExpression): boolean {
  return node.expression.kind === ts.SyntaxKind.ImportKeyword;
}

function isRequireCall(checker: ts.TypeChecker, node: ts.CallExpression): boolean {
  if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
    return isGlobalBinding(checker, node.expression);
  }
  return (
    ((ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'require') ||
      (ts.isElementAccessExpression(node.expression) &&
        literalText(node.expression.argumentExpression) === 'require')) &&
    globalLoaderObjectName(checker, node.expression.expression) === 'module'
  );
}

function isDirectRequireCallee(node: ts.Node): boolean {
  return ts.isCallExpression(node.parent) && node.parent.expression === node;
}

function isDirectCapabilityReceiver(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
      parent.expression === node) ||
    (ts.isVariableDeclaration(parent) &&
      ts.isObjectBindingPattern(parent.name) &&
      parent.initializer === node)
  );
}

function importHasRuntimeBindings(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name || !clause.namedBindings || ts.isNamespaceImport(clause.namedBindings)) {
    return true;
  }
  return clause.namedBindings.elements.some((element) => !element.isTypeOnly);
}

function exportHasRuntimeBindings(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return false;
  if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) return true;
  return node.exportClause.elements.some((element) => !element.isTypeOnly);
}

function isErasedTypeNode(node: ts.Node): boolean {
  if (!ts.isTypeNode(node)) return false;
  if (!ts.isExpressionWithTypeArguments(node)) return true;
  const heritage = node.parent;
  return !(
    ts.isHeritageClause(heritage) &&
    heritage.token === ts.SyntaxKind.ExtendsKeyword &&
    (ts.isClassDeclaration(heritage.parent) || ts.isClassExpression(heritage.parent))
  );
}

function isFirstPartySourceFile(repoRoot: string, sourceFile: ts.SourceFile): boolean {
  if (sourceFile.isDeclarationFile) return false;
  const repoPath = toRepoPath(repoRoot, sourceFile.fileName);
  const segments = repoPath.split('/');
  return (
    repoPath !== '' &&
    repoPath !== '..' &&
    !repoPath.startsWith('../') &&
    !segments.includes('node_modules') &&
    PRODUCTION_SOURCE_EXTENSIONS.has(extname(sourceFile.fileName))
  );
}

export function findOfflineBoundaryViolations(
  repoRoot: string,
  files: readonly string[],
): OfflineBoundaryViolation[] {
  const root = resolve(repoRoot);
  // A Program provides the parsed ASTs, resolved first-party module graph, and
  // binding information needed to distinguish globals from harmless local names.
  const program = ts.createProgram({
    rootNames: [...files],
    options: {
      allowJs: true,
      checkJs: false,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const checker = program.getTypeChecker();
  const violations: OfflineBoundaryViolation[] = [];

  function add(
    sourceFile: ts.SourceFile,
    node: ts.Node,
    kind: OfflineBoundaryViolationKind,
    detail: string,
  ): void {
    violations.push({
      file: toRepoPath(root, sourceFile.fileName),
      ...location(sourceFile, node),
      kind,
      detail,
    });
  }

  function inspectModuleSpecifier(
    sourceFile: ts.SourceFile,
    node: ts.Expression,
    loadKind: string,
  ): void {
    const specifier = literalText(node);
    if (specifier === null) {
      add(
        sourceFile,
        node,
        'opaque_module_loader',
        `${loadKind} uses a non-literal module specifier`,
      );
      return;
    }
    const normalized = normalizeModuleSpecifier(specifier);
    const moduleBase = normalized.split('/')[0] ?? normalized;
    if (SUBPROCESS_MODULES.has(moduleBase)) {
      if (!isExactAllowedSubprocessImport(sourceFile, node)) {
        add(
          sourceFile,
          node,
          'subprocess_module',
          `${loadKind} reaches subprocess module ${JSON.stringify(specifier)} outside the exact ${ALLOWED_SUBPROCESS_FILE} import`,
        );
      }
      return;
    }
    if (NETWORK_MODULES.has(moduleBase)) {
      add(
        sourceFile,
        node,
        'network_module',
        `${loadKind} reaches outbound-capable module ${JSON.stringify(specifier)}`,
      );
      return;
    }
    if (OPAQUE_LOADER_MODULES.has(moduleBase)) {
      add(
        sourceFile,
        node,
        'opaque_module_loader',
        `${loadKind} reaches ${JSON.stringify(specifier)}, which can construct an untracked module loader`,
      );
      return;
    }
    if (isBuiltin(specifier)) {
      if (!ALLOWED_BUILTIN_MODULES.has(normalized)) {
        add(
          sourceFile,
          node,
          'unapproved_builtin_module',
          `${loadKind} reaches unapproved built-in module ${JSON.stringify(specifier)}`,
        );
      }
      return;
    }
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const resolvedModule = ts.resolveModuleName(
        specifier,
        sourceFile.fileName,
        program.getCompilerOptions(),
        ts.sys,
      ).resolvedModule;
      const resolvedSourceFile = resolvedModule
        ? program.getSourceFile(resolvedModule.resolvedFileName)
        : undefined;
      if (!resolvedSourceFile || !isFirstPartySourceFile(root, resolvedSourceFile)) {
        add(
          sourceFile,
          node,
          'opaque_module_loader',
          `${loadKind} reaches relative module ${JSON.stringify(specifier)} outside the scanned first-party graph`,
        );
      }
      return;
    }
    if (!ALLOWED_EXTERNAL_MODULES.has(specifier)) {
      add(
        sourceFile,
        node,
        'unapproved_external_module',
        `${loadKind} reaches unapproved external module ${JSON.stringify(specifier)}`,
      );
    }
  }

  function visit(sourceFile: ts.SourceFile, node: ts.Node): void {
    if (isErasedTypeNode(node)) return;

    if (ts.isImportDeclaration(node)) {
      if (importHasRuntimeBindings(node)) {
        inspectModuleSpecifier(sourceFile, node.moduleSpecifier, 'import');
      }
    } else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && exportHasRuntimeBindings(node)) {
        inspectModuleSpecifier(sourceFile, node.moduleSpecifier, 're-export');
      }
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression
    ) {
      inspectModuleSpecifier(sourceFile, node.moduleReference.expression, 'import-equals');
    } else if (ts.isCallExpression(node)) {
      if (isImportCall(node)) {
        inspectModuleSpecifier(sourceFile, node.arguments[0] as ts.Expression, 'dynamic import');
      } else if (isRequireCall(checker, node)) {
        inspectModuleSpecifier(sourceFile, node.arguments[0] as ts.Expression, 'require');
      }
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'process' &&
      isGlobalBinding(checker, node.expression) &&
      node.name.text === 'getBuiltinModule'
    ) {
      add(
        sourceFile,
        node,
        'opaque_module_loader',
        'process.getBuiltinModule can bypass static import analysis',
      );
    }

    if (ts.isPropertyAccessExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'module' &&
        node.name.text === 'require' &&
        isGlobalBinding(checker, node.expression) &&
        !isDirectRequireCallee(node)
      ) {
        add(
          sourceFile,
          node,
          'opaque_module_loader',
          'an aliased module.require reference can bypass literal module analysis',
        );
      }
      const objectName = globalObjectName(checker, node.expression);
      if (objectName && OUTBOUND_GLOBALS.has(node.name.text)) {
        add(
          sourceFile,
          node,
          'outbound_global',
          `${objectName}.${node.name.text} exposes an outbound network primitive`,
        );
      } else if (objectName && GLOBAL_LOADER_OBJECTS.has(node.name.text)) {
        add(
          sourceFile,
          node,
          'opaque_module_loader',
          `${objectName}.${node.name.text} exposes an opaque module-loader object`,
        );
      }
    } else if (ts.isElementAccessExpression(node)) {
      const objectName = globalObjectName(checker, node.expression);
      if (objectName) {
        const member = literalText(node.argumentExpression);
        if (member === null) {
          add(
            sourceFile,
            node,
            'outbound_global',
            `${objectName}[...] uses a computed global capability lookup`,
          );
        } else if (OUTBOUND_GLOBALS.has(member)) {
          add(
            sourceFile,
            node,
            'outbound_global',
            `${objectName}[${JSON.stringify(member)}] exposes an outbound network primitive`,
          );
        } else if (GLOBAL_LOADER_OBJECTS.has(member)) {
          add(
            sourceFile,
            node,
            'opaque_module_loader',
            `${objectName}[${JSON.stringify(member)}] exposes an opaque module-loader object`,
          );
        }
      }
      const loaderObjectName = globalLoaderObjectName(checker, node.expression);
      if (loaderObjectName) {
        const member = literalText(node.argumentExpression);
        const loaderMember =
          loaderObjectName === 'process' ? 'getBuiltinModule' : 'require';
        if (member === null || member === loaderMember) {
          add(
            sourceFile,
            node,
            'opaque_module_loader',
            member === null
              ? `${loaderObjectName}[...] uses a computed module-loader capability lookup`
              : `${loaderObjectName}[${JSON.stringify(member)}] exposes an opaque module loader`,
          );
        }
      }
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      globalObjectName(checker, node.initializer)
    ) {
      for (const element of node.name.elements) {
        const member = propertyNameText(element.propertyName ?? element.name);
        if (element.dotDotDotToken || member === null || OUTBOUND_GLOBALS.has(member)) {
          add(
            sourceFile,
            element,
            'outbound_global',
            element.dotDotDotToken || member === null
              ? 'global capability rest binding is not statically bounded'
              : `global ${member} is aliased through destructuring`,
          );
        } else if (GLOBAL_LOADER_OBJECTS.has(member)) {
          add(
            sourceFile,
            element,
            'opaque_module_loader',
            `global loader object ${member} is aliased through destructuring`,
          );
        }
      }
    } else if (
      ts.isIdentifier(node) &&
      node.text === 'require' &&
      isGlobalBinding(checker, node) &&
      !isDirectRequireCallee(node)
    ) {
      add(
        sourceFile,
        node,
        'opaque_module_loader',
        'an aliased require reference can bypass literal module analysis',
      );
    } else if (
      ts.isIdentifier(node) &&
      OUTBOUND_GLOBALS.has(node.text) &&
      !isPropertyName(node) &&
      isGlobalBinding(checker, node)
    ) {
      add(
        sourceFile,
        node,
        'outbound_global',
        `global ${node.text} exposes an outbound network primitive`,
      );
    } else if (
      ts.isIdentifier(node) &&
      GLOBAL_OBJECTS.has(node.text) &&
      isGlobalBinding(checker, node) &&
      !isDirectCapabilityReceiver(node)
    ) {
      add(
        sourceFile,
        node,
        'outbound_global',
        `global object ${node.text} escapes direct capability analysis`,
      );
    } else if (
      ts.isIdentifier(node) &&
      GLOBAL_LOADER_OBJECTS.has(node.text) &&
      isGlobalBinding(checker, node) &&
      !isDirectCapabilityReceiver(node)
    ) {
      add(
        sourceFile,
        node,
        'opaque_module_loader',
        `global loader object ${node.text} escapes direct capability analysis`,
      );
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer
    ) {
      const loaderObjectName = globalLoaderObjectName(checker, node.initializer);
      if (loaderObjectName) {
        const loaderMember =
          loaderObjectName === 'process' ? 'getBuiltinModule' : 'require';
        for (const element of node.name.elements) {
          const member = propertyNameText(element.propertyName ?? element.name);
          if (element.dotDotDotToken || member === null || member === loaderMember) {
            add(
              sourceFile,
              element,
              'opaque_module_loader',
              element.dotDotDotToken || member === null
                ? `${loaderObjectName} capability rest binding is not statically bounded`
                : `${loaderObjectName}.${loaderMember} is aliased through destructuring`,
            );
          }
        }
      }
    }

    ts.forEachChild(node, (child) => visit(sourceFile, child));
  }

  for (const file of files) {
    if (!program.getSourceFile(resolve(file))) {
      throw new Error(`offline_guard_source_unavailable:${toRepoPath(root, file)}`);
    }
  }
  for (const sourceFile of program.getSourceFiles()) {
    if (!isFirstPartySourceFile(root, sourceFile)) continue;
    visit(sourceFile, sourceFile);
  }

  return violations.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column ||
      left.kind.localeCompare(right.kind),
  );
}
