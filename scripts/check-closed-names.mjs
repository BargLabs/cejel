#!/usr/bin/env node
// Fails a change that adds a closed name to this public repository.
//
// Nothing scanned what is committed to cejel for closed names: alfred's extraction scrub runs only
// on alfred's own build, and the label-class guard reads paths, not text. An agent-written record
// put two private repository names on public main that way (alfred #2453, removed in #411).
//
// The deny list is scripts/closed-name-hashes.json: sha256 of each lowercased name, so this
// repository never spells them. Unsalted hashes of short names can be recovered by guessing; the
// list prevents accidental disclosure, not a determined reader.
//
// Reads only what a change ADDS: added lines and added or renamed file paths. Closed names already
// present in the August experiment files stay by operator ruling, and a record citing one of those
// files by its exact tracked path keeps passing (the one exemption, below).
//
// Never prints the matched text: a hit is reported as file, line and hash prefix only, and a file
// path that itself holds a closed name is withheld from the output.
//
// Refuses (exit 2) rather than passes on an empty diff, an unreadable list or an empty list: a
// guard that exits 0 on no input is indistinguishable from one that checked and found nothing.
//
// usage: node scripts/check-closed-names.mjs [--list <file>] <base> <head>
//        node scripts/check-closed-names.mjs [--list <file>] [--tracked <file>] < unified.diff
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_LIST_PATH = join(dirname(fileURLToPath(import.meta.url)), 'closed-name-hashes.json');
const HASH_PREFIX_LENGTH = 12;

export class Refusal extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

export const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

/** @returns {Set<string>} */
export function loadHashList(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Refusal(
      'closed_name_guard_refused_unreadable_list',
      `could not read the deny list (${error instanceof Error ? error.code ?? error.name : 'error'}). ` +
        'A list that cannot be read checks nothing.',
    );
  }
  const hashes = parsed?.sha256;
  if (!Array.isArray(hashes)) {
    throw new Refusal('closed_name_guard_refused_malformed_list', 'the deny list has no sha256 array.');
  }
  if (hashes.length === 0) {
    throw new Refusal(
      'closed_name_guard_refused_empty_list',
      'the deny list is empty. "Nothing is closed" must never read the same as "checked and clean".',
    );
  }
  if (!hashes.every((hash) => typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash))) {
    throw new Refusal(
      'closed_name_guard_refused_malformed_list',
      'a deny-list entry is not a lowercase 64-character sha256; it could never match.',
    );
  }
  return new Set(hashes);
}

/** Maximal runs of path-and-name characters on a line. */
export const extractRuns = (text) => text.match(/[A-Za-z0-9._/-]+/g) ?? [];

/**
 * Every string hashed for one run: the run itself (lowercased, trailing .git removed); its parts
 * split on / . _ with hyphenated compounds kept whole; those parts split again on -; and each pair
 * of adjacent /-segments, so an owner/repo pair matches inside a longer URL or path.
 */
export function candidatesForRun(run) {
  const whole = run.toLowerCase().replace(/\.git$/, '');
  const candidates = new Set([whole]);
  for (const part of whole.split(/[/._]/)) {
    if (!part) continue;
    candidates.add(part);
    for (const piece of part.split('-')) if (piece) candidates.add(piece);
  }
  const segments = whole.split('/').filter(Boolean).map((segment) => segment.replace(/\.git$/, ''));
  for (let i = 0; i + 1 < segments.length; i += 1) candidates.add(`${segments[i]}/${segments[i + 1]}`);
  return candidates;
}

/**
 * The one exemption: a run that is exactly the path of a file tracked at the base commit (with or
 * without a leading ./) is not checked, and neither is anything derived from it. Trailing full
 * stops are dropped first, so a citation that ends a sentence is still the exact path.
 */
export function isTrackedPathRun(run, trackedPaths) {
  const path = run.replace(/^\.\//, '').replace(/\.+$/, '');
  return trackedPaths.has(path);
}

/** Hashes on the list that a piece of text produces, skipping exempt runs. */
function matchText(text, hashes, trackedPaths, counts) {
  const matched = new Set();
  for (const run of extractRuns(text)) {
    if (isTrackedPathRun(run, trackedPaths)) {
      counts.exemptRuns += 1;
      continue;
    }
    for (const candidate of candidatesForRun(run)) {
      counts.candidates += 1;
      const hash = sha256(candidate);
      if (hashes.has(hash)) matched.add(hash);
    }
  }
  return matched;
}

// git C-quotes a path holding a quote, backslash or control character even with
// core.quotePath=false; octal escapes are raw bytes.
function unquotePath(text) {
  if (!text.startsWith('"')) return text;
  const bytes = [];
  for (let i = 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') break;
    if (ch !== '\\') {
      bytes.push(...Buffer.from(ch, 'utf8'));
      continue;
    }
    const next = text[i + 1];
    if (/[0-7]/.test(next)) {
      bytes.push(parseInt(text.slice(i + 1, i + 4), 8));
      i += 3;
      continue;
    }
    bytes.push({ n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11 }[next] ?? next.charCodeAt(0));
    i += 1;
  }
  return Buffer.from(bytes).toString('utf8');
}

const stripSide = (path) => path.replace(/^[ab]\//, '');

// `diff --git a/P b/P` is unambiguous only when both sides are equal, which holds for every
// added, modified and deleted file. A rename's new path comes from its `rename to` line instead.
function pathFromDiffGitLine(rest) {
  if (rest.startsWith('"')) {
    const second = rest.indexOf(' "', 1);
    return second === -1 ? null : stripSide(unquotePath(rest.slice(second + 1)));
  }
  if ((rest.length - 5) % 2 !== 0) return null;
  const path = rest.slice(2, 2 + (rest.length - 5) / 2);
  return rest === `a/${path} b/${path}` ? path : null;
}

/**
 * Parse a unified diff into added lines and added paths. Hunk line counts decide where a hunk
 * ends, so an added line whose own text begins with `++` or `diff` is still read as content.
 *
 * @returns {{files: {path: string|null, rawHeader: string, added: boolean, lines: {line: number, text: string}[]}[]}}
 */
export function parseDiff(text) {
  const files = [];
  let file = null;
  let oldLeft = 0;
  let newLeft = 0;
  let lineNo = 0;
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (oldLeft > 0 || newLeft > 0) {
      const tag = line[0];
      if (tag === '+') {
        file.lines.push({ line: lineNo, text: line.slice(1) });
        lineNo += 1;
        newLeft -= 1;
      } else if (tag === '-') {
        oldLeft -= 1;
      } else if (tag === ' ' || line === '') {
        lineNo += 1;
        oldLeft -= 1;
        newLeft -= 1;
      }
      continue;
    }
    if (line.startsWith('diff --git ')) {
      const rest = line.slice('diff --git '.length);
      file = { path: pathFromDiffGitLine(rest), rawHeader: rest, added: false, lines: [] };
      files.push(file);
      continue;
    }
    if (line.startsWith('--- ') && (file === null || file.lines.length > 0 || file.hunks)) {
      file = { path: null, rawHeader: '', added: false, lines: [] };
      files.push(file);
      continue;
    }
    if (file === null) continue;
    if (line.startsWith('new file mode ')) file.added = true;
    else if (line.startsWith('rename to ') || line.startsWith('copy to ')) {
      file.path = unquotePath(line.slice(line.indexOf(' to ') + 4));
      file.added = true;
    } else if (line.startsWith('+++ ')) {
      const target = line.slice(4);
      file.path = target === '/dev/null' ? file.path : stripSide(unquotePath(target));
    } else if (line.startsWith('@@ ')) {
      const header = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!header) continue;
      oldLeft = header[1] === undefined ? 1 : Number(header[1]);
      lineNo = Number(header[2]);
      newLeft = header[3] === undefined ? 1 : Number(header[3]);
      file.hunks = true;
    }
  }
  return { files };
}

/**
 * @param {{diff: string, hashes: Set<string>, trackedPaths?: Set<string>}} input
 */
export function checkDiff({ diff, hashes, trackedPaths = new Set() }) {
  if (diff.trim() === '') {
    throw new Refusal(
      'closed_name_guard_refused_empty_diff',
      'the diff is empty. Nothing was checked; that is not a pass.',
    );
  }
  const counts = { files: 0, addedLines: 0, addedPaths: 0, candidates: 0, exemptRuns: 0 };
  const hits = [];
  const { files } = parseDiff(diff);
  files.forEach((file, index) => {
    counts.files += 1;
    // The displayed path is withheld if it holds a closed name itself, exempt or not.
    const pathText = file.path ?? file.rawHeader;
    const ownPathHashes = matchText(pathText, hashes, new Set(), { candidates: 0, exemptRuns: 0 });
    const display =
      ownPathHashes.size === 0 ? pathText : `[path withheld, diff file #${index + 1}]`;
    if (file.added) {
      counts.addedPaths += 1;
      for (const hash of matchText(pathText, hashes, trackedPaths, counts)) {
        hits.push({ file: display, line: null, hashPrefix: hash.slice(0, HASH_PREFIX_LENGTH) });
      }
    }
    for (const { line, text } of file.lines) {
      counts.addedLines += 1;
      for (const hash of matchText(text, hashes, trackedPaths, counts)) {
        hits.push({ file: display, line, hashPrefix: hash.slice(0, HASH_PREFIX_LENGTH) });
      }
    }
  });
  return { hits, counts };
}

export function formatHit(hit) {
  const where = hit.line === null ? `${hit.file} (added path)` : `${hit.file}:${hit.line}`;
  return `closed_name_hit: ${where} sha256:${hit.hashPrefix}`;
}

const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

function readCommitRange(base, head) {
  for (const rev of [base, head]) {
    try {
      git(['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
    } catch {
      throw new Refusal('closed_name_guard_refused_bad_revision', 'a base or head argument does not name a commit.');
    }
  }
  const diff = git([
    '-c', 'core.quotePath=false',
    'diff', '-U0', '--no-color', '--no-ext-diff', '--no-textconv', '--find-renames',
    `${base}...${head}`,
  ]);
  const trackedPaths = new Set(git(['ls-tree', '-r', '-z', '--name-only', base]).split('\0').filter(Boolean));
  return { diff, trackedPaths };
}

function parseArgs(argv) {
  const options = { list: DEFAULT_LIST_PATH, tracked: null, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--list' || argv[i] === '--tracked') {
      if (argv[i + 1] === undefined) throw new Refusal('closed_name_guard_refused_usage', `${argv[i]} needs a file.`);
      options[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    } else {
      options.positional.push(argv[i]);
    }
  }
  if (options.positional.length !== 0 && options.positional.length !== 2) {
    throw new Refusal('closed_name_guard_refused_usage', 'pass <base> <head>, or a unified diff on stdin.');
  }
  return options;
}

export function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    const hashes = loadHashList(options.list);
    let diff;
    let trackedPaths = new Set();
    if (options.positional.length === 2) {
      ({ diff, trackedPaths } = readCommitRange(options.positional[0], options.positional[1]));
    } else {
      diff = readFileSync(0, 'utf8');
      if (options.tracked !== null) {
        trackedPaths = new Set(readFileSync(options.tracked, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean));
      }
    }
    const { hits, counts } = checkDiff({ diff, hashes, trackedPaths });
    // Counts first, so "checked nothing" and "checked everything" never print alike.
    const summary =
      `files=${counts.files} addedLines=${counts.addedLines} addedPaths=${counts.addedPaths} ` +
      `candidates=${counts.candidates} exemptRuns=${counts.exemptRuns} list=${hashes.size}`;
    if (hits.length === 0) {
      process.stdout.write(`closed_name_guard ok: ${summary}\n`);
      return;
    }
    process.stdout.write(`closed_name_guard failed: ${summary} hits=${hits.length}\n`);
    for (const hit of hits) process.stderr.write(`${formatHit(hit)}\n`);
    process.stderr.write(
      '\nThis change adds a name this public repository must not carry. The matched text is not\n' +
        'printed; the hash prefix identifies the list entry. Remove the name, or hand back to the\n' +
        'operator. Do not shorten scripts/closed-name-hashes.json to pass.\n',
    );
    process.exitCode = 1;
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
