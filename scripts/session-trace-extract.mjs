#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';

import { portfolioRepositories } from './portfolio-repo-registry.mjs';

const REPOSITORIES = portfolioRepositories();

const TEST_COMMAND = /(?:^|[\s;&|])(?:[^\s;&|]*\/)?(?:pytest|vitest|jest|mocha|playwright|cargo\s+test|go\s+test|node\s+--test|bun\s+test)|\b(?:npm|pnpm|yarn)\b[^\n;&|]*\btest\b/i;
const SHELL_NAMES = /^(?:exec_command|Bash|shell|run_command)$/i;
const NATIVE_EDIT_NAMES = /^(?:apply_patch|Edit|Write|MultiEdit|NotebookEdit)$/i;
const COMMIT_ACTION = /(?:^|[\s;&|])git\s+(?:commit|cherry-pick|merge)\b/i;
const PR_ACTION = /(?:^|[\s;&|])gh\s+pr\s+(?:create|merge)\b/i;
const FAILURE_MARKER = /(?:^|\b)(?:FAILED|FAIL)(?:\b|\s)|AssertionError|Test Files\s+\d+\s+failed|Tests\s+\d+\s+failed/i;
const PASS_MARKER = /(?:\b\d+\s+passed\b|Test Files\s+\d+\s+passed|Tests\s+\d+\s+passed|\bPASS(?:ED)?\b|BUILD SUCCESS)/i;
const TIMEOUT_MARKER = /timed?\s*out|SIGTERM|ETIMEDOUT/i;
const SOURCE_EXTENSION = /\.(?:py|pyi|ts|tsx|js|jsx|mjs|cjs|go|rs|java|rb|php|cs|c|cc|cpp|h|hpp|sh|bash|zsh|sql|ya?ml|json|toml)$/i;
const TEST_PATH = /(?:^|\/)(?:tests?|__tests__|spec)(?:\/|$)|\.(?:test|spec)\.[^/]+$/i;
const NON_SOURCE_PATH = /(?:^|\/)(?:docs?|notes?|fixtures?|snapshots?|node_modules|dist|build|coverage)(?:\/|$)|\.(?:md|mdx|txt|png|jpe?g|gif|svg|pdf|lock)$/i;
const SECRET_PATTERNS = [
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bAKIA[A-Z0-9]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /(?:token|secret|password|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi,
];

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function redact(value) {
  let text = String(value ?? '');
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, '[REDACTED]');
  return text;
}

function parseJson(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function repositoryCwdPattern(repo) {
  const name = escapeRegExp(repo.product);
  const nested = repo.nestedProjectFolder ? '(?:[^/]+/)?' : '';
  return new RegExp(`/projects/${nested}${name}(?:/|$)|/${name}(?:--|/|$)`);
}

function productFromCwd(cwd = '') {
  const normalized = cwd.replaceAll('\\', '/').toLowerCase();
  for (const repo of REPOSITORIES) {
    if (repositoryCwdPattern(repo).test(normalized)) return repo.product;
  }
  return null;
}

function repositoryFor(product) {
  return REPOSITORIES.find((repo) => repo.product === product) ?? null;
}

function normalizeCommand(command = '') {
  return redact(command)
    .replace(/\/private\/tmp\/[^\s'";|]+/g, '/tmp/WORK')
    .replace(/\/var\/folders\/[^\s'";|]+/g, '/tmp/WORK')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePath(filePath = '', cwd = '', repo = null) {
  let value = redact(filePath).replaceAll('\\', '/').replace(/^['"]|['"]$/g, '');
  if (!value || value.includes('[REDACTED]')) return null;
  if (path.isAbsolute(value)) {
    if (repo && value.startsWith(`${repo.localPath}/`)) value = path.relative(repo.localPath, value);
    else if (cwd && value.startsWith(`${cwd}/`)) value = path.relative(cwd, value);
    else {
      const marker = value.match(/\/(?:\.worktrees|worktrees)\/[^/]+\/(.+)$/);
      if (marker) value = marker[1];
      else return null;
    }
  } else if (cwd && repo) {
    const absolute = path.resolve(cwd, value).replaceAll('\\', '/');
    const worktree = cwd.replaceAll('\\', '/').match(new RegExp(`^${repo.localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(?:\\.worktrees|worktrees)/[^/]+`));
    if (worktree && absolute.startsWith(`${worktree[0]}/`)) value = path.relative(worktree[0], absolute);
    else if (absolute.startsWith(`${repo.localPath}/`)) value = path.relative(repo.localPath, absolute);
  }
  value = path.posix.normalize(value).replace(/^\.\//, '');
  if (value === '..' || value.startsWith('../')) return null;
  return value;
}

function isSourcePath(filePath) {
  return Boolean(filePath && SOURCE_EXTENSION.test(filePath) && !TEST_PATH.test(filePath) && !NON_SOURCE_PATH.test(filePath));
}

function extractWritePaths(command, cwd, repo) {
  const paths = [];
  const add = (candidate) => {
    const normalized = normalizePath(candidate, cwd, repo);
    if (normalized) paths.push(normalized);
  };
  for (const match of command.matchAll(/^\*\*\* (?:Update|Add|Delete) File:\s*(.+)$/gm)) add(match[1].trim());
  for (const match of command.matchAll(/(?:^|[\s;])(?:>|>>)\s*['"]?([^'"\s;&|]+)/g)) add(match[1]);
  for (const match of command.matchAll(/\btee(?:\s+-a)?\s+['"]?([^'"\s;&|]+)/g)) add(match[1]);
  for (const match of command.matchAll(/\bPath\(\s*['"]([^'"]+)['"]\s*\)\.(?:write_text|write_bytes)/g)) add(match[1]);
  for (const match of command.matchAll(/\bopen\(\s*['"]([^'"]+)['"]\s*,\s*['"][wax+]/g)) add(match[1]);
  for (const match of command.matchAll(/\b(?:sed|perl)\b[^\n]*(?:-i|-pi)[^\n]*\s['"]?([^'"\s;&|]+\.[A-Za-z0-9]+)['"]?(?:\s|$)/g)) add(match[1]);
  for (const match of command.matchAll(/\bcp\b(?:\s+-\S+)*\s+['"]?[^'"\s;&|]+['"]?\s+['"]?([^'"\s;&|]+)/g)) add(match[1]);
  return [...new Set(paths)];
}

function namedTestsFromOutput(rawOutput) {
  const output = redact(rawOutput);
  const tests = [];
  const add = (file, name) => {
    const normalizedFile = file?.replace(/^\.\//, '').replace(/:\d+(?::\d+)?$/, '');
    const normalizedName = redact(name ?? '').trim().slice(0, 500);
    if (!normalizedFile || !normalizedName || !TEST_PATH.test(normalizedFile)) return;
    tests.push({ file: normalizedFile, name: normalizedName });
  };
  for (const line of output.split('\n')) {
    let match = line.match(/\bFAILED\s+([^\s:]+(?:\.[A-Za-z0-9]+)?(?:::[^\s]+)+)(?:\s+-\s+(.+))?/);
    if (match) {
      const [file, ...parts] = match[1].split('::');
      add(file, parts.join('::'));
      continue;
    }
    match = line.match(/^\s*FAIL\s+([^>\n]+?)\s+>\s+(.+)$/);
    if (match) {
      const file = match[1].trim().split(/\s+/)[0];
      add(file, match[2].trim());
      continue;
    }
    match = line.match(/^\s*(?:×|✗|✕)\s+(.+?)\s+([^\s]+\.(?:test|spec)\.[^\s:]+(?::\d+)?)$/);
    if (match) add(match[2], match[1]);
  }
  return [...new Map(tests.map((test) => [`${test.file}::${test.name}`, test])).values()];
}

function unwrapResult(result, explicitError = false) {
  const parsed = parseJson(result);
  if (typeof parsed === 'string') return { text: parsed, exitCode: explicitError ? 1 : null, timedOut: TIMEOUT_MARKER.test(parsed) };
  const object = parsed && typeof parsed === 'object' ? parsed : {};
  const text = redact([
    object.output,
    object.stdout,
    object.stderr,
    object.content,
    object.error,
  ].filter((value) => value != null).map((value) => typeof value === 'string' ? value : JSON.stringify(value)).join('\n'));
  const exitCode = object.exit_code ?? object.exitCode ?? object.status ?? object.code ?? (explicitError ? 1 : null);
  const timedOut = object.timedOut === true || object.interrupted === true || TIMEOUT_MARKER.test(text);
  return { text, exitCode: typeof exitCode === 'number' ? exitCode : null, timedOut };
}

function parsePrHints(text) {
  const hints = [];
  for (const match of redact(text).matchAll(/https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)/g)) {
    hints.push({ repo: match[1], pr: Number(match[2]) });
  }
  return hints;
}

function parseShaHints(text, actionKind) {
  const safe = redact(text);
  const hints = [];
  if (actionKind === 'commit') {
    for (const pattern of [
      /\[[^\]\n]+\s([0-9a-f]{7,40})\]\s/g,
      /(?:commit|committed|HEAD)[^0-9a-f\n]{0,20}([0-9a-f]{7,40})\b/gi,
    ]) for (const match of safe.matchAll(pattern)) hints.push(match[1].toLowerCase());
  }
  return [...new Set(hints)];
}

function commandSelection(command) {
  const files = [];
  for (const match of command.matchAll(/(?:^|\s)([^\s'";&|]+\.(?:py|ts|tsx|js|jsx|mjs|cjs|go|rs|java|rb)(?:::[^\s'";&|]+)?)(?=\s|$)/g)) {
    const file = match[1].split('::')[0].replace(/^\.\//, '');
    if (TEST_PATH.test(file)) files.push(file);
  }
  const runner = command.match(/\b(pytest|vitest|jest|mocha|playwright|cargo|go|node|bun|npm|pnpm|yarn)\b/i)?.[1]?.toLowerCase() ?? 'unknown';
  return { files: [...new Set(files)], runner };
}

function coverageFor(red, green) {
  if (red.commandHash === green.commandHash) return 'exact-command';
  const redFiles = new Set(red.namedTests.map((test) => test.file.replace(/^\.\//, '')));
  if (green.selection.files.some((file) => redFiles.has(file) || [...redFiles].some((redFile) => path.basename(redFile) === path.basename(file)))) return 'same-file';
  if (green.selection.files.length === 0 && green.selection.runner === red.selection.runner && green.cwd === red.cwd) return 'containing-suite';
  return null;
}

class TraceParser {
  constructor({ source, relativePath, rawSha256 }) {
    this.source = source;
    this.relativePath = relativePath;
    this.rawSha256 = rawSha256;
    this.provider = null;
    this.sessionId = null;
    this.cwd = '';
    this.eventCount = 0;
    this.events = [];
    this.calls = new Map();
    this.pty = new Map();
    this.redactionHits = 0;
  }

  addEvent(event) {
    this.events.push({ index: this.eventCount, ...event });
  }

  onCall(id, name, input, timestamp) {
    const command = typeof input === 'string' ? input : (input?.cmd ?? input?.command ?? '');
    const safeCommand = normalizeCommand(command);
    const repo = repositoryFor(productFromCwd(this.cwd));
    const nativePaths = [];
    if (NATIVE_EDIT_NAMES.test(name)) {
      for (const candidate of [input?.file_path, input?.path]) {
        const normalized = normalizePath(candidate, this.cwd, repo);
        if (normalized) nativePaths.push(normalized);
      }
      if (typeof input?.patch === 'string' || typeof input === 'string') nativePaths.push(...extractWritePaths(input?.patch ?? input, this.cwd, repo));
    }
    const shellPaths = SHELL_NAMES.test(name) ? extractWritePaths(command, this.cwd, repo) : [];
    const editPaths = [...new Set([...nativePaths, ...shellPaths])];
    if (editPaths.length) this.addEvent({ kind: 'edit', timestamp, paths: editPaths });
    const isTest = SHELL_NAMES.test(name) && TEST_COMMAND.test(command);
    const actionKind = SHELL_NAMES.test(name) && COMMIT_ACTION.test(command) ? 'commit'
      : SHELL_NAMES.test(name) && PR_ACTION.test(command) ? 'pr' : null;
    const selection = isTest ? commandSelection(safeCommand) : null;
    this.calls.set(id, { name, command: safeCommand, commandHash: hash(safeCommand), isTest, actionKind, selection, cwd: this.cwd, timestamp, ptySessionId: input?.session_id ?? null });
  }

  emitTest(call, result, explicitError = false, timestamp = null) {
    const unwrapped = unwrapResult(result, explicitError);
    if (unwrapped.timedOut) return;
    const namedTests = namedTestsFromOutput(unwrapped.text);
    const failed = namedTests.length > 0 && (unwrapped.exitCode !== 0 || FAILURE_MARKER.test(unwrapped.text));
    const passed = (unwrapped.exitCode === 0 || (unwrapped.exitCode == null && !explicitError))
      && PASS_MARKER.test(unwrapped.text) && !FAILURE_MARKER.test(unwrapped.text);
    if (!failed && !passed) return;
    this.addEvent({
      kind: 'test',
      timestamp: timestamp ?? call.timestamp,
      outcome: failed ? 'red' : 'green',
      commandHash: call.commandHash,
      selection: call.selection,
      namedTests,
      cwd: call.cwd,
    });
  }

  onResult(id, result, explicitError = false, timestamp = null) {
    const call = this.calls.get(id);
    if (!call) return;
    const unwrapped = unwrapResult(result, explicitError);
    const parsed = parseJson(result);
    const ptyId = parsed && typeof parsed === 'object' ? (parsed.session_id ?? parsed.sessionId) : null;
    if (call.name === 'exec_command' && ptyId != null && unwrapped.exitCode == null) {
      this.pty.set(String(ptyId), { ...call, chunks: unwrapped.text });
      return;
    }
    if (call.name === 'write_stdin' && call.ptySessionId != null) {
      const original = this.pty.get(String(call.ptySessionId));
      if (!original) return;
      original.chunks = `${original.chunks}\n${unwrapped.text}`.slice(-2_000_000);
      if (unwrapped.exitCode != null) {
        this.emitTest(original, { output: original.chunks, exit_code: unwrapped.exitCode }, explicitError, timestamp);
        this.pty.delete(String(call.ptySessionId));
      }
      return;
    }
    if (call.isTest) this.emitTest(call, result, explicitError, timestamp);
    if (call.actionKind && unwrapped.exitCode !== null && unwrapped.exitCode !== 0) return;
    if (call.actionKind) {
      const shaPrefixes = parseShaHints(unwrapped.text, call.actionKind);
      const prs = parsePrHints(unwrapped.text);
      if (shaPrefixes.length || prs.length) this.addEvent({ kind: 'anchor', timestamp, actionKind: call.actionKind, shaPrefixes, prs });
    }
  }

  consume(row) {
    this.eventCount++;
    this.cwd ||= row?.payload?.cwd ?? row?.cwd ?? '';
    if (row.type === 'session_meta') {
      this.provider = 'codex';
      this.sessionId = row.payload?.id ?? this.sessionId;
    } else if (row.sessionId || row?.message?.role) {
      this.provider ??= (this.source.startsWith('cowork') || this.relativePath.includes('/cowork/')) ? 'cowork' : 'claude';
      this.sessionId = row.sessionId ?? this.sessionId;
    }
    const timestamp = row.timestamp ?? null;
    if (row.type === 'response_item' && row.payload?.type === 'function_call') {
      this.provider ??= 'codex';
      const input = parseJson(row.payload.arguments);
      this.onCall(row.payload.call_id ?? row.payload.id, row.payload.name, input, timestamp);
    }
    if (row.type === 'response_item' && row.payload?.type === 'function_call_output') {
      this.onResult(row.payload.call_id, row.payload.output, false, timestamp);
    }
    if (row.type === 'pr-link' && row.prRepository && row.prNumber) {
      this.addEvent({ kind: 'anchor', timestamp, actionKind: 'pr', shaPrefixes: [], prs: [{ repo: row.prRepository, pr: Number(row.prNumber) }] });
    }
    const blocks = Array.isArray(row?.message?.content) ? row.message.content : [];
    for (const block of blocks) {
      if (block?.type === 'tool_use') this.onCall(block.id, block.name, block.input, timestamp);
      if (block?.type === 'tool_result') {
        const result = row.toolUseResult && typeof row.toolUseResult === 'object'
          ? { ...row.toolUseResult, content: block.content }
          : (block.content ?? row.toolUseResult);
        this.onResult(block.tool_use_id, result, block.is_error === true, timestamp);
      }
    }
  }

  finish() {
    const product = productFromCwd(this.cwd);
    const repo = repositoryFor(product);
    const sessionKey = this.sessionId ? `${this.provider}:${this.sessionId}` : `content:${this.rawSha256}`;
    return {
      source: this.source,
      relativePath: this.relativePath,
      rawSha256: this.rawSha256,
      provider: this.provider ?? 'unknown',
      sessionId: this.sessionId,
      sessionKey,
      sessionHash: hash(`session-trace-v1:${sessionKey}`),
      product,
      repo: repo?.slug ?? null,
      eventCount: this.eventCount,
      events: this.events,
    };
  }
}

function candidatesFromSession(session) {
  if (!session.repo) return [];
  const candidates = [];
  const events = session.events;
  for (let redIndex = 0; redIndex < events.length; redIndex++) {
    const red = events[redIndex];
    if (red.kind !== 'test' || red.outcome !== 'red' || red.namedTests.length === 0) continue;
    const edited = new Set();
    for (let greenIndex = redIndex + 1; greenIndex < events.length; greenIndex++) {
      const event = events[greenIndex];
      if (event.kind === 'edit') for (const file of event.paths) if (isSourcePath(file)) edited.add(file);
      if (event.kind !== 'test' || event.outcome !== 'green' || edited.size === 0) continue;
      const coverage = coverageFor(red, event);
      if (!coverage) continue;
      const anchor = events.slice(greenIndex + 1).find((later) => later.kind === 'anchor' && (later.shaPrefixes.length || later.prs.length));
      if (!anchor) break;
      candidates.push({
        provider: session.provider,
        sessionHash: session.sessionHash,
        product: session.product,
        repo: session.repo,
        redEventIndex: red.index,
        greenEventIndex: event.index,
        redAt: red.timestamp,
        greenAt: event.timestamp,
        namedTests: red.namedTests,
        editedSourceFiles: [...edited].sort(),
        coverage,
        exactCommand: coverage === 'exact-command',
        redCommandHash: red.commandHash,
        greenCommandHash: event.commandHash,
        anchorAction: {
          actionKind: anchor.actionKind,
          shaPrefixes: anchor.shaPrefixes,
          prs: anchor.prs,
        },
      });
      break;
    }
  }
  const unique = new Map();
  for (const candidate of candidates) {
    const anchorKey = candidate.anchorAction.shaPrefixes.join(',') || candidate.anchorAction.prs.map((pr) => `${pr.repo}#${pr.pr}`).join(',');
    const key = `${candidate.repo}|${candidate.sessionHash}|${anchorKey}`;
    const previous = unique.get(key);
    if (!previous) unique.set(key, candidate);
    else {
      previous.namedTests = [...new Map([...previous.namedTests, ...candidate.namedTests].map((test) => [`${test.file}::${test.name}`, test])).values()];
      previous.editedSourceFiles = [...new Set([...previous.editedSourceFiles, ...candidate.editedSourceFiles])].sort();
      previous.exactCommand ||= candidate.exactCommand;
    }
  }
  return [...unique.values()];
}

async function parseFile(entry, roots) {
  const root = roots[entry.source];
  if (!root) throw new Error(`unknown source ${entry.source}`);
  const file = path.join(root, entry.relativePath);
  const parser = new TraceParser(entry);
  const digest = crypto.createHash('sha256');
  const input = fs.createReadStream(file);
  input.on('data', (chunk) => digest.update(chunk));
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    try { parser.consume(JSON.parse(line)); } catch {}
  }
  const observedSha256 = digest.digest('hex');
  if (observedSha256 !== entry.rawSha256) return null;
  return parser.finish();
}

async function run({ manifestPath, outputPath }) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const exactContent = new Map();
  for (const entry of manifest.entries) if (!exactContent.has(entry.sha256)) exactContent.set(entry.sha256, entry);
  const parsed = [];
  let changedAfterFreeze = 0;
  let complete = 0;
  for (const entry of exactContent.values()) {
    const session = await parseFile({ source: entry.source, relativePath: entry.relativePath, rawSha256: entry.sha256 }, manifest.sourceRoots);
    if (session) parsed.push(session);
    else changedAfterFreeze++;
    complete++;
    if (complete % 250 === 0) process.stderr.write(`parsed ${complete}/${exactContent.size}\n`);
  }
  const bySession = new Map();
  for (const session of parsed) {
    const previous = bySession.get(session.sessionKey);
    if (!previous || session.eventCount > previous.eventCount || (session.eventCount === previous.eventCount && session.rawSha256 < previous.rawSha256)) bySession.set(session.sessionKey, session);
  }
  const sessions = [...bySession.values()];
  const candidates = sessions.flatMap(candidatesFromSession);
  const funnel = {};
  for (const session of sessions) {
    const key = `${session.provider}:${session.product ?? 'unmapped'}`;
    const bucket = funnel[key] ??= { sessions: 0, namedRed: 0, sourceEdit: 0, sameTestGreen: 0, anchoredCandidates: 0, exactCommandCandidates: 0 };
    bucket.sessions++;
    const namedRed = session.events.some((event) => event.kind === 'test' && event.outcome === 'red' && event.namedTests.length);
    if (namedRed) bucket.namedRed++;
    if (namedRed && session.events.some((event) => event.kind === 'edit' && event.paths.some(isSourcePath))) bucket.sourceEdit++;
    const sessionCandidates = candidates.filter((candidate) => candidate.sessionHash === session.sessionHash);
    if (sessionCandidates.length) bucket.sameTestGreen++;
    bucket.anchoredCandidates += sessionCandidates.length;
    bucket.exactCommandCandidates += sessionCandidates.filter((candidate) => candidate.exactCommand).length;
  }
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    manifestRootSha256: manifest.rootSha256,
    sourceFiles: manifest.entries.length,
    uniqueRawContent: exactContent.size,
    parsedUniqueContent: parsed.length,
    changedAfterFreeze,
    uniqueSessions: sessions.length,
    duplicateFilesRemovedByContent: manifest.entries.length - exactContent.size,
    duplicateContentSessionsRemovedBySessionId: parsed.length - sessions.length,
    funnel,
    candidates,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ ...result, candidates: undefined }, null, 2));
}

export {
  TraceParser,
  candidatesFromSession,
  coverageFor,
  extractWritePaths,
  isSourcePath,
  namedTestsFromOutput,
  normalizeCommand,
  productFromCwd,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifestPath = process.argv[2] ?? '/tmp/session-trace-source-manifest.json';
  const outputPath = process.argv[3] ?? '/tmp/session-trace-extraction.json';
  await run({ manifestPath, outputPath });
}
