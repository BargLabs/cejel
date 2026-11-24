import { realpathSync } from 'node:fs';
import { isAbsolute, posix, relative, resolve, sep, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

// #767. An ingested finding's location is presentation: it reaches report.json and the
// certificate as written. Scanners may write it as an absolute path or a file:// URI (OSV-Scanner
// 2.7.1's SARIF does, for every result), which would publish the scanning machine's directory
// path in a certificate made on that machine. So a location is kept only in a form that names no
// directory outside the scanned repository:
//
// - a file:// URI or an absolute path inside the repository becomes relative to it, with forward
//   slashes, keeping any `:line` or `:line:column` suffix;
// - one outside the repository, one on another host, or one that cannot be read as a path is
//   dropped (the finding stays; only its location goes);
// - a relative location, or a URL with another scheme, is left as it is.

const LINE_SUFFIX = /^(.*?)((?::\d+){1,2})$/s;
const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/;

function repositoryRoots(repoRoot: string): string[] {
  const roots = [resolve(repoRoot)];
  try {
    const real = realpathSync(repoRoot);
    if (!roots.includes(real)) roots.push(real);
  } catch {
    // An unreadable root leaves the lexical form only.
  }
  return roots;
}

function relativeInside(path: string, roots: readonly string[]): string | undefined {
  for (const root of roots) {
    const rel = relative(root, path);
    if (rel === '') return '.';
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) continue;
    return rel.split(sep).join(posix.sep);
  }
  return undefined;
}

export function normalizeIngestLocation(location: string, repoRoot: string): string | undefined {
  const match = LINE_SUFFIX.exec(location);
  const target = match ? (match[1] as string) : location;
  const suffix = match ? (match[2] as string) : '';

  let path: string;
  if (/^file:/i.test(target)) {
    try {
      path = fileURLToPath(target);
    } catch {
      return undefined;
    }
  } else if (WINDOWS_DRIVE.test(target) || target.startsWith('\\\\')) {
    // A Windows path: relative() on this platform can only place it if this platform is Windows.
    if (sep !== win32.sep) return undefined;
    path = target;
  } else if (isAbsolute(target)) {
    path = target;
  } else {
    // A relative path, or a URL with another scheme.
    return location;
  }

  const inside = relativeInside(resolve(path), repositoryRoots(repoRoot));
  return inside === undefined ? undefined : `${inside}${suffix}`;
}
