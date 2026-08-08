#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { redactText } from '../../alfred/packages/operator-trace/src/redactor.ts';
import { detectDeclaredButUnreadConfig } from '../src/packs/d-series/declared-but-unread-config.ts';
import { detectEmptyFailureConflation } from '../src/packs/d-series/empty-failure-conflation.ts';
import { detectSelfReferentialVerification } from '../src/packs/d-series/self-referential-verification.ts';
import { detectSwallowedErrors } from '../src/packs/d-series/swallowed-error.ts';
import { detectUnassertedSetTransforms } from '../src/packs/d-series/unasserted-set-transform.ts';

type RuleId = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
type Finding = ReturnType<(typeof RULES)[RuleId]>[number];

interface CorpusEntry {
  readonly fullName: string;
  readonly url: string;
  readonly revision: string;
  readonly cohort?: 'fresh' | 'legacy-23';
  readonly localPath?: string;
}

interface CorpusManifest {
  readonly benchmarkId: string;
  readonly selected?: readonly CorpusEntry[];
  readonly repositories?: readonly CorpusEntry[];
}

interface Inventory {
  readonly inputFiles: readonly string[];
  readonly counts: {
    readonly trackedPaths: number;
    readonly regularFiles: number;
    readonly deniedPath: number;
    readonly nonRegular: number;
    readonly missingOrStatError: number;
    readonly d1AnalyzedFiles: number;
    readonly d2ToD5AnalyzedFiles: number;
    readonly d1ExcludedExtension: number;
    readonly d2ToD5ExcludedExtension: number;
    readonly tooLargeSkipped: 0;
    readonly analyzedOver512000Bytes: number;
    readonly unparseableSkipped: 0;
  };
}

const SCRIPT_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_ROOT, '..');
const RULE_IDS: readonly RuleId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];
const MODULE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const D1_EXTENSIONS = new Set([...MODULE_EXTENSIONS, '.md', '.mdx']);
const HARD_EXCLUDED_PATH_PATTERN =
  /(^|\/)(?:\.git|\.venv|venv|site-packages|node_modules|dist|build|\.next|__pycache__|vendor|\.terraform|coverage)(?:\/|$)/;
const RULES = {
  D1: detectDeclaredButUnreadConfig,
  D2: detectSwallowedErrors,
  D3: detectUnassertedSetTransforms,
  D4: detectEmptyFailureConflation,
  D5: detectSelfReferentialVerification,
} as const;

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseArguments(argv: readonly string[]): { mode: string; values: Map<string, string> } {
  const mode = argv[0];
  if (!mode) throw new Error('mode is required: control, public, or owned');
  const values = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`invalid argument: ${key}`);
    values.set(key, value);
  }
  return { mode, values };
}

function required(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key);
  if (!value) throw new Error(`missing ${key}`);
  return value;
}

function safeError(error: unknown): string {
  return redactText(error instanceof Error ? error.message : String(error), 500);
}

function scrubFinding(finding: Finding): Record<string, unknown> {
  const scrub = (value: unknown): unknown => {
    if (typeof value === 'string') return redactText(value, 1_000);
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrub(item)]));
    }
    return value;
  };
  return scrub(finding) as Record<string, unknown>;
}

function atomicJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporary, path);
}

function gitLines(root: string, args: readonly string[]): string[] {
  const output = execFileSync('git', [...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return output.split('\0').filter(Boolean);
}

function filesystemPaths(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const repoPath = relative(root, absolute).split(sep).join('/');
      if (HARD_EXCLUDED_PATH_PATTERN.test(repoPath)) continue;
      if (entry.isDirectory()) visit(absolute);
      else files.push(repoPath);
    }
  };
  visit(root);
  return files.sort();
}

function inventory(root: string, frozenPaths?: readonly string[]): Inventory {
  const trackedPaths = frozenPaths
    ? [...frozenPaths]
    : existsSync(join(root, '.git'))
      ? gitLines(root, ['ls-files', '--cached', '-z'])
      : filesystemPaths(root);
  const inputFiles: string[] = [];
  let deniedPath = 0;
  let nonRegular = 0;
  let missingOrStatError = 0;
  let analyzedOver512000Bytes = 0;
  for (const repoPath of trackedPaths) {
    if (HARD_EXCLUDED_PATH_PATTERN.test(repoPath)) {
      deniedPath += 1;
      continue;
    }
    const absolute = resolve(root, repoPath);
    if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
      deniedPath += 1;
      continue;
    }
    try {
      const stat = lstatSync(absolute);
      if (!stat.isFile()) {
        nonRegular += 1;
        continue;
      }
      inputFiles.push(repoPath);
      if (D1_EXTENSIONS.has(extname(repoPath).toLowerCase()) && stat.size > 512_000) {
        analyzedOver512000Bytes += 1;
      }
    } catch {
      missingOrStatError += 1;
    }
  }
  const d1AnalyzedFiles = inputFiles.filter((path) =>
    D1_EXTENSIONS.has(extname(path).toLowerCase()),
  ).length;
  const d2ToD5AnalyzedFiles = inputFiles.filter((path) =>
    MODULE_EXTENSIONS.has(extname(path).toLowerCase()),
  ).length;
  return {
    inputFiles,
    counts: {
      trackedPaths: trackedPaths.length,
      regularFiles: inputFiles.length,
      deniedPath,
      nonRegular,
      missingOrStatError,
      d1AnalyzedFiles,
      d2ToD5AnalyzedFiles,
      d1ExcludedExtension: inputFiles.length - d1AnalyzedFiles,
      d2ToD5ExcludedExtension: inputFiles.length - d2ToD5AnalyzedFiles,
      tooLargeSkipped: 0,
      analyzedOver512000Bytes,
      unparseableSkipped: 0,
    },
  };
}

function scanRules(root: string, files: readonly string[], blind: boolean) {
  const rules: Record<string, unknown> = {};
  for (const ruleId of RULE_IDS) {
    const cpuBefore = process.cpuUsage();
    const wallBefore = process.hrtime.bigint();
    try {
      const findings = RULES[ruleId](root, files);
      const cpu = process.cpuUsage(cpuBefore);
      rules[ruleId] = {
        findingCount: findings.length,
        scanCpuMilliseconds: (cpu.user + cpu.system) / 1_000,
        scanWallMilliseconds: Number(process.hrtime.bigint() - wallBefore) / 1_000_000,
        errored: false,
        ...(blind ? {} : { findings: findings.map(scrubFinding) }),
      };
    } catch (error) {
      const cpu = process.cpuUsage(cpuBefore);
      rules[ruleId] = {
        findingCount: null,
        scanCpuMilliseconds: (cpu.user + cpu.system) / 1_000,
        scanWallMilliseconds: Number(process.hrtime.bigint() - wallBefore) / 1_000_000,
        errored: true,
        error: safeError(error),
      };
    }
  }
  return rules;
}

function directoryKilobytes(path: string): number {
  return Number(
    execFileSync('du', ['-sk', path], { encoding: 'utf8' }).trim().split(/\s+/)[0] ?? 0,
  );
}

function transferredBytes(stderr: string): number | null {
  const matches = [...stderr.matchAll(/([0-9]+(?:\.[0-9]+)?)\s+(KiB|MiB|GiB)/g)];
  const match = matches.at(-1);
  if (!match?.[1] || !match[2]) return null;
  const multiplier = match[2] === 'GiB' ? 1024 ** 3 : match[2] === 'MiB' ? 1024 ** 2 : 1024;
  return Math.round(Number(match[1]) * multiplier);
}

function clonePinned(entry: CorpusEntry, target: string) {
  mkdirSync(target, { recursive: true });
  execFileSync('git', ['init', '--quiet'], { cwd: target });
  execFileSync('git', ['remote', 'add', 'origin', entry.url], { cwd: target });
  let lastError = '';
  const started = process.hrtime.bigint();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const fetch = spawnSync(
      'git',
      ['fetch', '--depth=1', '--no-tags', '--progress', 'origin', entry.revision],
      { cwd: target, encoding: 'utf8', timeout: 300_000, maxBuffer: 32 * 1024 * 1024 },
    );
    if (fetch.status === 0) {
      execFileSync('git', ['checkout', '--quiet', '--detach', 'FETCH_HEAD'], { cwd: target });
      const actual = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: target,
        encoding: 'utf8',
      }).trim();
      if (actual !== entry.revision) throw new Error('pinned revision mismatch after fetch');
      return {
        attempts: attempt,
        cloneWallMilliseconds: Number(process.hrtime.bigint() - started) / 1_000_000,
        bytesTransferred: transferredBytes(fetch.stderr),
      };
    }
    lastError = fetch.stderr || fetch.error?.message || `git fetch exited ${fetch.status}`;
  }
  throw new Error(`clone failed after 3 attempts: ${redactText(lastError, 400)}`);
}

function aggregate(repositories: readonly Record<string, unknown>[]) {
  const totals = Object.fromEntries(
    RULE_IDS.map((ruleId) => [ruleId, { findings: 0, errors: 0, scanCpuMilliseconds: 0 }]),
  ) as Record<RuleId, { findings: number; errors: number; scanCpuMilliseconds: number }>;
  let d1Files = 0;
  let d2ToD5Files = 0;
  let skipped = 0;
  let peakDiskKilobytes = 0;
  let cloneMilliseconds = 0;
  let bytesTransferred = 0;
  let unknownTransferRows = 0;
  for (const repository of repositories) {
    const counts = repository.inventory as Inventory['counts'] | undefined;
    if (counts) {
      d1Files += counts.d1AnalyzedFiles;
      d2ToD5Files += counts.d2ToD5AnalyzedFiles;
      skipped += counts.deniedPath + counts.nonRegular + counts.missingOrStatError;
    }
    peakDiskKilobytes = Math.max(peakDiskKilobytes, Number(repository.peakDiskKilobytes ?? 0));
    cloneMilliseconds += Number(repository.cloneWallMilliseconds ?? 0);
    if (repository.bytesTransferred === null) unknownTransferRows += 1;
    else bytesTransferred += Number(repository.bytesTransferred ?? 0);
    const rules = repository.rules as Record<string, Record<string, unknown>> | undefined;
    for (const ruleId of RULE_IDS) {
      const row = rules?.[ruleId];
      if (!row) continue;
      if (row.errored) totals[ruleId].errors += 1;
      else totals[ruleId].findings += Number(row.findingCount ?? 0);
      totals[ruleId].scanCpuMilliseconds += Number(row.scanCpuMilliseconds ?? 0);
    }
  }
  return {
    repositoryCount: repositories.length,
    d1AnalyzedFiles: d1Files,
    d2ToD5AnalyzedFiles: d2ToD5Files,
    skippedBoundaryOrFileErrors: skipped,
    peakDiskKilobytes,
    cloneWallMilliseconds: cloneMilliseconds,
    bytesTransferred,
    unknownTransferRows,
    rules: totals,
  };
}

function controlFiles(ruleId: RuleId, testCase: Record<string, string>, repaired: boolean): string[] {
  const selected = repaired ? testCase.repairedPath : testCase.defectPath;
  if (ruleId === 'D1' && testCase.kind === 'frontmatter') {
    return [
      selected,
      `calibration/d-series/d1/acceptance/frontmatter/consumer.${repaired ? 'negative' : 'positive'}.fixture.mjs`,
    ];
  }
  if (ruleId === 'D5') {
    return [selected, repaired ? testCase.repairedSubjectPath : testCase.subjectPath];
  }
  return [selected];
}

function runControl(outputPath: string): void {
  const cases = [];
  for (const ruleId of RULE_IDS) {
    const manifestPath = resolve(
      REPO_ROOT,
      `calibration/d-series/${ruleId.toLowerCase()}/acceptance/manifest.json`,
    );
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      cases: Record<string, string>[];
    };
    for (const testCase of manifest.cases) {
      const positive = RULES[ruleId](REPO_ROOT, controlFiles(ruleId, testCase, false));
      const negative = RULES[ruleId](REPO_ROOT, controlFiles(ruleId, testCase, true));
      cases.push({
        id: testCase.id,
        ruleId,
        positiveFindingCount: positive.length,
        negativeFindingCount: negative.length,
        passed: positive.length > 0 && negative.length === 0,
      });
    }
  }
  const result = {
    schemaVersion: 'cejel-d-series-base-rate-positive-control-v1',
    generatedAt: new Date().toISOString(),
    harnessPath: 'scripts/d-series-base-rate-scan.ts',
    harnessSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    passed: cases.every((row) => row.passed),
    cases,
  };
  atomicJson(outputPath, result);
  process.stdout.write(`positive-control passed=${result.passed} cases=${cases.length}\n`);
  if (!result.passed) process.exitCode = 1;
}

function loadOrStart(
  outputPath: string,
  manifestPath: string,
  manifest: CorpusManifest,
  blind: boolean,
) {
  if (existsSync(outputPath)) {
    const existing = JSON.parse(readFileSync(outputPath, 'utf8'));
    if (existing.manifestSha256 !== sha256(readFileSync(manifestPath))) {
      throw new Error('resume artifact manifest SHA-256 mismatch');
    }
    if (existing.completedAt) throw new Error('refusing to rescan a completed corpus artifact');
    return existing;
  }
  return {
    schemaVersion: 'cejel-d-series-base-rate-scan-v1',
    benchmarkId: manifest.benchmarkId,
    startedAt: new Date().toISOString(),
    manifestPath: relative(REPO_ROOT, manifestPath).split(sep).join('/'),
    manifestSha256: sha256(readFileSync(manifestPath)),
    blindFindingDetails: blind,
    clonePolicy: { depth: 1, tags: false, maximumAttempts: 3, streamedDelete: true },
    repositories: [],
  };
}

function runPublic(
  manifestPath: string,
  outputPath: string,
  blind: boolean,
  workRootArgument?: string,
): void {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as CorpusManifest;
  const entries = manifest.selected ?? manifest.repositories;
  if (!entries?.length) throw new Error('public corpus manifest has no repositories');
  const result = loadOrStart(outputPath, manifestPath, manifest, blind);
  const completed = new Set(
    (result.repositories as Record<string, unknown>[]).map((row) => `${row.fullName}@${row.revision}`),
  );
  const workRoot = workRootArgument
    ? resolve(workRootArgument)
    : mkdtempSync(join(tmpdir(), 'cejel-d-series-public-'));
  mkdirSync(workRoot, { recursive: true });
  if (!workRoot.startsWith(resolve(tmpdir()))) throw new Error('public work root must be under tmp');
  try {
    for (const [index, entry] of entries.entries()) {
      const key = `${entry.fullName}@${entry.revision}`;
      if (completed.has(key)) continue;
      const target = join(workRoot, `repo-${String(index + 1).padStart(5, '0')}`);
      let repository: Record<string, unknown>;
      try {
        const clone = clonePinned(entry, target);
        const files = inventory(target);
        const peakDiskKilobytes = directoryKilobytes(workRoot);
        const rules = scanRules(target, files.inputFiles, blind);
        repository = {
          index: index + 1,
          fullName: redactText(entry.fullName, 240),
          revision: entry.revision,
          cohort: entry.cohort ?? 'fresh',
          ...clone,
          peakDiskKilobytes,
          inventory: files.counts,
          rules,
        };
      } catch (error) {
        repository = {
          index: index + 1,
          fullName: redactText(entry.fullName, 240),
          revision: entry.revision,
          cohort: entry.cohort ?? 'fresh',
          repositoryError: safeError(error),
        };
      } finally {
        if (existsSync(target)) rmSync(target, { recursive: true, force: true });
      }
      result.repositories.push(repository);
      result.totals = aggregate(result.repositories);
      atomicJson(outputPath, result);
      process.stdout.write(
        `${index + 1}/${entries.length} ${redactText(entry.fullName, 120)} ` +
          `files=${(repository.inventory as Inventory['counts'] | undefined)?.d1AnalyzedFiles ?? 0} ` +
          `findings=${RULE_IDS.map((id) => `${id}:${(repository.rules as Record<string, Record<string, unknown>> | undefined)?.[id]?.findingCount ?? 'E'}`).join(',')}\n`,
      );
    }
    result.completedAt = new Date().toISOString();
    result.totals = aggregate(result.repositories);
    result.streamedDeleteConfirmed = readdirSync(workRoot).length === 0;
    atomicJson(outputPath, result);
  } finally {
    if (existsSync(workRoot) && readdirSync(workRoot).length === 0) {
      rmSync(workRoot, { recursive: true, force: true });
    }
  }
}

function archivedPaths(repositoryPath: string, revision: string): string[] {
  return execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', revision], {
    cwd: repositoryPath,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
}

function archiveSnapshot(repositoryPath: string, revision: string, target: string): string[] {
  const archive = `${target}.tar`;
  mkdirSync(target, { recursive: true });
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, revision], {
    cwd: repositoryPath,
  });
  execFileSync('tar', ['-xf', archive, '-C', target]);
  rmSync(archive, { force: true });
  return archivedPaths(repositoryPath, revision);
}

function runOwned(manifestPath: string, outputPath: string): void {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as CorpusManifest;
  const entries = manifest.repositories;
  if (!entries?.length) throw new Error('owned corpus manifest has no repositories');
  const result = loadOrStart(outputPath, manifestPath, manifest, false);
  const completed = new Set(
    (result.repositories as Record<string, unknown>[]).map((row) => `${row.fullName}@${row.revision}`),
  );
  const workRoot = mkdtempSync(join(tmpdir(), 'cejel-d-series-owned-'));
  try {
    for (const [index, entry] of entries.entries()) {
      const key = `${entry.fullName}@${entry.revision}`;
      if (completed.has(key)) continue;
      if (!entry.localPath) throw new Error(`owned corpus entry has no localPath: ${entry.fullName}`);
      const target = join(workRoot, `repo-${index + 1}`);
      let repository: Record<string, unknown>;
      try {
        const frozenPaths = archiveSnapshot(entry.localPath, entry.revision, target);
        const files = inventory(target, frozenPaths);
        const peakDiskKilobytes = directoryKilobytes(workRoot);
        repository = {
          index: index + 1,
          fullName: redactText(entry.fullName, 240),
          revision: entry.revision,
          cloneWallMilliseconds: 0,
          bytesTransferred: 0,
          peakDiskKilobytes,
          inventory: files.counts,
          rules: scanRules(target, files.inputFiles, false),
        };
      } catch (error) {
        repository = {
          index: index + 1,
          fullName: redactText(entry.fullName, 240),
          revision: entry.revision,
          repositoryError: safeError(error),
        };
      } finally {
        if (existsSync(target)) rmSync(target, { recursive: true, force: true });
      }
      result.repositories.push(repository);
      result.totals = aggregate(result.repositories);
      atomicJson(outputPath, result);
      process.stdout.write(`${index + 1}/${entries.length} ${entry.fullName} owned-snapshot-complete\n`);
    }
    result.completedAt = new Date().toISOString();
    result.totals = aggregate(result.repositories);
    result.noNetwork = true;
    result.cloneCount = 0;
    result.streamedDeleteConfirmed = readdirSync(workRoot).length === 0;
    atomicJson(outputPath, result);
  } finally {
    if (existsSync(workRoot)) rmSync(workRoot, { recursive: true, force: true });
  }
}

const { mode, values } = parseArguments(process.argv.slice(2));
const outputPath = resolve(required(values, '--json'));
if (mode === 'control') runControl(outputPath);
else if (mode === 'public') {
  runPublic(
    resolve(required(values, '--manifest')),
    outputPath,
    values.get('--blind') === 'true',
    values.get('--work-root'),
  );
} else if (mode === 'owned') {
  runOwned(resolve(required(values, '--manifest')), outputPath);
} else {
  throw new Error(`unknown mode: ${mode}`);
}
