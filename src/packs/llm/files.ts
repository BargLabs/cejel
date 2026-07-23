import { execFileSync } from 'node:child_process';
import { type Dirent, lstatSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.terraform',
  '.venv',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'site-packages',
  'target',
  'vendor',
  'venv',
]);
const HARD_EXCLUDED_PATH_PATTERN =
  /(^|\/)(?:\.git|\.venv|venv|site-packages|node_modules|dist|build|\.next|__pycache__|vendor|\.terraform|coverage)(?:\/|$)/;
const MAX_ENUMERATED_FILE_BYTES = 512_000;

function isInsideRoot(root: string, path: string): boolean {
  const resolved = resolve(path);
  return resolved === root || resolved.startsWith(`${root}${sep}`);
}

function isRegularFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function listTrackedFiles(repoPath: string): string[] | null {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const output = execFileSync('git', ['ls-files', '--cached'], {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!output) return [];

    const root = resolve(repoPath);
    return output
      .split('\n')
      .filter((path) => {
        if (path.length === 0 || HARD_EXCLUDED_PATH_PATTERN.test(path)) return false;
        const fullPath = resolve(root, path);
        return isInsideRoot(root, fullPath) && isRegularFile(fullPath);
      })
      .sort();
  } catch {
    return null;
  }
}

function visitDirectory(root: string, directory: string, files: string[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const fullPath = join(directory, entry.name);
    if (!isInsideRoot(root, fullPath)) continue;
    if (entry.isDirectory()) {
      visitDirectory(root, fullPath, files);
      continue;
    }
    // Symlinks, sockets, devices, and other ambient filesystem objects are never evidence.
    if (!entry.isFile()) continue;
    try {
      if (statSync(fullPath).size > MAX_ENUMERATED_FILE_BYTES) continue;
    } catch {
      continue;
    }
    files.push(relative(root, fullPath));
  }
}

/** Enumerate the same tracked-first/local-fallback repository boundary as the public core scan. */
export function listCejelLlmPackFiles(repoPath: string): readonly string[] {
  const root = resolve(repoPath);
  let stat;
  try {
    stat = lstatSync(root);
  } catch {
    throw new Error(`Cejel LLM pack repository path does not exist: ${repoPath}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Cejel LLM pack repository path is not a directory: ${repoPath}`);
  }

  const tracked = listTrackedFiles(root);
  if (tracked !== null) return tracked;

  const files: string[] = [];
  visitDirectory(root, root, files);
  return files
    .filter((path) => !HARD_EXCLUDED_PATH_PATTERN.test(path))
    .sort();
}
