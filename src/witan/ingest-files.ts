import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

// External scanner documents are allowed to be substantially larger than repository source
// files, but remain bounded before readFileSync/JSON.parse can materialize attacker-controlled
// input. This matches the existing explicit Git-output ceiling.
export const MAX_INGEST_DOCUMENT_BYTES = 8 * 1024 * 1024;

function isContainedPath(candidate: string, directory: string): boolean {
  const relativePath = relative(directory, candidate);
  return (
    relativePath === '' ||
    (relativePath !== '..' &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath))
  );
}

export function isMissingIngestPath(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

/** Resolve one regular, non-symlink ingest candidate inside its selected input directory. */
export function resolveIngestFilePath(filePath: string, inputDirectory = dirname(filePath)): string {
  const lexicalDirectory = resolve(inputDirectory);
  const lexicalCandidate = resolve(filePath);
  const directoryStat = lstatSync(lexicalDirectory);
  if (directoryStat.isSymbolicLink()) {
    throw new Error(`Cejel: refusing symlinked ingest directory: ${inputDirectory}`);
  }
  if (!directoryStat.isDirectory()) {
    throw new Error(`Cejel: refusing non-directory ingest boundary: ${inputDirectory}`);
  }

  const candidateStat = lstatSync(lexicalCandidate);
  if (candidateStat.isSymbolicLink()) {
    throw new Error(`Cejel: refusing symlinked ingest file: ${filePath}`);
  }
  if (!candidateStat.isFile()) {
    throw new Error(`Cejel: refusing non-regular ingest file: ${filePath}`);
  }
  if (candidateStat.size > MAX_INGEST_DOCUMENT_BYTES) {
    throw new Error(
      `Cejel: ingest file exceeds the ${MAX_INGEST_DOCUMENT_BYTES.toLocaleString('en-US')} byte budget: ${filePath}`,
    );
  }

  const resolvedDirectory = realpathSync(lexicalDirectory);
  const resolvedCandidate = realpathSync(lexicalCandidate);
  if (!isContainedPath(resolvedCandidate, resolvedDirectory)) {
    throw new Error(`Cejel: refusing ingest file outside its resolved input directory: ${filePath}`);
  }
  return resolvedCandidate;
}

export function isResolvedIngestPathContained(candidate: string, directory: string): boolean {
  return isContainedPath(candidate, directory);
}
