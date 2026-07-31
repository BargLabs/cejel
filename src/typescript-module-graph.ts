import { extname, relative, resolve, sep } from 'node:path';

import ts from 'typescript';

export const TYPESCRIPT_MODULE_GRAPH_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

export interface TypeScriptModuleGraph {
  readonly root: string;
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
}

export function toModuleGraphRepoPath(repoRoot: string, file: string): string {
  return relative(resolve(repoRoot), resolve(file)).split(sep).join('/');
}

export function isFirstPartyModuleGraphSource(
  repoRoot: string,
  sourceFile: ts.SourceFile,
): boolean {
  if (sourceFile.isDeclarationFile) return false;
  const repoPath = toModuleGraphRepoPath(repoRoot, sourceFile.fileName);
  const segments = repoPath.split('/');
  return (
    repoPath !== '' &&
    repoPath !== '..' &&
    !repoPath.startsWith('../') &&
    !segments.includes('node_modules') &&
    TYPESCRIPT_MODULE_GRAPH_EXTENSIONS.has(extname(sourceFile.fileName).toLowerCase())
  );
}

/**
 * Build the resolved first-party TypeScript/JavaScript module graph used by structural rules.
 *
 * This is the production extraction of the `ts.createProgram` walk introduced by Cejel #54 and
 * hardened by #55. Callers share one resolver and checker instead of maintaining source-text
 * import approximations in each rule.
 */
export function createTypeScriptModuleGraph(
  repoRoot: string,
  files: readonly string[],
): TypeScriptModuleGraph {
  const root = resolve(repoRoot);
  const rootNames = files
    .filter((file) => TYPESCRIPT_MODULE_GRAPH_EXTENSIONS.has(extname(file).toLowerCase()))
    .map((file) => resolve(root, file));
  const program = ts.createProgram({
    rootNames,
    options: {
      allowJs: true,
      checkJs: false,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      resolveJsonModule: true,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return { root, program, checker: program.getTypeChecker() };
}
