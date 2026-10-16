import { closeSync, constants, lstatSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The default output directory, `.cejel`, sits inside the checkout being scanned, and a checkout
// is untrusted input: it can commit `.cejel` or `.cejel/report.json` as a symlink to any file the
// user can write. Every CLI write therefore refuses a symlink at the output directory or at the
// output file, before anything is written, instead of following it.

// Windows has no O_NOFOLLOW; there the lstat check is the whole defence.
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export interface OutputFile {
  name: string;
  contents: string;
}

function isSymbolicLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function refusal(what: string, subject: string): Error {
  return new Error(
    `Cejel: refusing to write ${what}: ${subject} is a symbolic link. Nothing was written; remove the link or choose another output path.`,
  );
}

// lstat follows a symlink when the path ends in `/` or `/.`, so `--out .cejel/` would pass the
// check on a symlinked `.cejel`. Resolving first strips those forms; the message keeps the path
// as the user gave it.
function refuseSymlinkedDirectory(dir: string, what: string): void {
  if (isSymbolicLink(resolve(dir))) throw refusal(what, `output directory ${dir}`);
}

function refuseSymlinkedFile(path: string, what: string): void {
  if (isSymbolicLink(resolve(path))) throw refusal(what, path);
}

/**
 * Throws if `dir` or any of `names` inside it is a symlink. Callers run this before expensive
 * work so a refused run fails fast; writeOutputFiles repeats it immediately before writing.
 */
export function refuseSymlinkedOutputs(dir: string, names: readonly string[], what: string): void {
  refuseSymlinkedDirectory(dir, what);
  for (const name of names) refuseSymlinkedFile(join(dir, name), what);
}

/**
 * Writes one file without following a symlink at its final component. The open itself refuses
 * (O_NOFOLLOW), which covers a link planted after the lstat check on POSIX.
 */
export function writeOutputFileNoFollow(path: string, contents: string, what: string): void {
  let fd: number;
  try {
    fd = openSync(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | O_NOFOLLOW,
      0o666,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error(
        `Cejel: refusing to write ${what}: ${path} is a symbolic link (the open was refused without following it).`,
      );
    }
    throw error;
  }
  try {
    writeFileSync(fd, contents, 'utf8');
  } finally {
    closeSync(fd);
  }
}

/** A single output file whose directory the caller does not own (for example `export -o`). */
export function writeOutputFile(path: string, contents: string, what: string): void {
  refuseSymlinkedFile(path, what);
  writeOutputFileNoFollow(path, contents, what);
}

/**
 * Creates `dir` if needed and writes every file into it. Every symlink check runs before the
 * first write, so a refusal leaves nothing behind.
 */
export function writeOutputFiles(dir: string, files: readonly OutputFile[], what: string): void {
  const names = files.map((file) => file.name);
  refuseSymlinkedOutputs(dir, names, what);
  mkdirSync(dir, { recursive: true });
  refuseSymlinkedDirectory(dir, what);
  for (const file of files) writeOutputFileNoFollow(join(dir, file.name), file.contents, what);
}
