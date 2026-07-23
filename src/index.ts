import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CEJEL_LLM_ATTESTATION_PREDICATE,
  CejelLlmPackArtifactSchema,
  createCejelLlmPackArtifact,
  createCejelLlmPackAttestation,
  renderCejelLlmPackHtml,
  renderCejelLlmPackTerminal,
  collectCejelLlmPack,
  serializeCejelLlmPackArtifact,
  snapshotCejelLlmPackInput,
  verifyCejelLlmPackAttestationBinding,
} from './packs/llm/index.js';
import { WitanReportSchema } from './witan/index.js';
import {
  createWitanAttestation,
  renderWitanBadgeEndpoint,
  renderWitanBadgeSvg,
  renderWitanHtmlReport,
  serializeWitanReport,
  verifyWitanAttestationBinding,
} from './witan/index.js';

import { runCejelScan } from './scan.js';
import { renderTerminalCertificate } from './terminal.js';

export interface WitanCliOptions {
  repoPath: string;
  outDir: string;
  minScore?: number;
  quiet: boolean;
  showHelp: boolean;
  showVersion: boolean;
  /** Raw --ingest values (file paths or single-level globs), in the order given. */
  ingestPatterns: string[];
  /** Explicit opt-in domain packs. They emit separate artifacts and never alter the base score. */
  packs: CejelPackId[];
}

export type CejelPackId = 'llm';

export type CejelCliInvocation =
  | { command: 'scan'; options: WitanCliOptions }
  | { command: 'verify'; reportPath: string; attestationPath: string };

const DEFAULT_OUT_DIR = '.cejel';

export type CliFlagKind =
  | 'help'
  | 'version'
  | 'quiet'
  | 'out'
  | 'minScore'
  | 'ingest'
  | 'pack';

interface CliFlagSpec {
  tokens: readonly string[];
  value?: string;
  description: string;
  kind: CliFlagKind;
}

export const CLI_FLAG_SPECS = [
  {
    tokens: ['--out', '--out-dir'],
    value: '<dir>',
    description: 'write the certificate here (default: .cejel; --out-dir is a compatibility alias)',
    kind: 'out',
  },
  {
    tokens: ['--min-score'],
    value: '<0-4>',
    description: 'exit nonzero below this overall score',
    kind: 'minScore',
  },
  {
    tokens: ['--ingest'],
    value: '<file>',
    description: 'fold in a SARIF/JSON scanner report (repeatable)',
    kind: 'ingest',
  },
  {
    tokens: ['--pack'],
    value: '<llm>',
    description: 'run an opt-in pack and write its separate evidence artifact (repeatable)',
    kind: 'pack',
  },
  {
    tokens: ['--quiet'],
    description: 'suppress the terminal summary',
    kind: 'quiet',
  },
  {
    tokens: ['-h', '--help'],
    description: 'show this help',
    kind: 'help',
  },
  {
    tokens: ['-v', '--version'],
    description: 'print the version',
    kind: 'version',
  },
] as const satisfies readonly CliFlagSpec[];

export type CliFlagToken = (typeof CLI_FLAG_SPECS)[number]['tokens'][number];

export const CLI_FLAG_TOKENS: readonly CliFlagToken[] = CLI_FLAG_SPECS.flatMap(
  (spec) => spec.tokens,
);

const CLI_FLAG_KIND_BY_TOKEN = new Map<string, CliFlagKind>(
  CLI_FLAG_SPECS.flatMap((spec) => spec.tokens.map((token) => [token, spec.kind] as const)),
);

// The SEA bundle has no package.json at runtime. Its dedicated build config defines this from
// the same manifest used by every other build; `typeof` keeps normal ESM/dev execution safe when
// the identifier is intentionally absent.
declare const __CEJEL_SEA_VERSION__: string | undefined;
declare const __CEJEL_SEA_PACKAGE_NAME__: string | undefined;

interface CejelPackageManifest {
  name?: unknown;
  version?: unknown;
}

function readCliManifest(): CejelPackageManifest {
  return JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as CejelPackageManifest;
}

function cliVersion(): string {
  if (typeof __CEJEL_SEA_VERSION__ === 'string' && __CEJEL_SEA_VERSION__.length > 0) {
    return __CEJEL_SEA_VERSION__;
  }
  const manifest = readCliManifest();
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error('Cejel package manifest has no version.');
  }
  return manifest.version;
}

function cliPackageName(): string {
  if (typeof __CEJEL_SEA_PACKAGE_NAME__ === 'string' && __CEJEL_SEA_PACKAGE_NAME__.length > 0) {
    return __CEJEL_SEA_PACKAGE_NAME__;
  }
  const manifest = readCliManifest();
  if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
    throw new Error('Cejel package manifest has no name.');
  }
  return manifest.name;
}

const usageOptionLabels = CLI_FLAG_SPECS.map(
  (spec) => `${spec.tokens.join(', ')}${'value' in spec && spec.value ? ` ${spec.value}` : ''}`,
);
const usageOptionLabelWidth = Math.max(...usageOptionLabels.map((label) => label.length));
const usageOptions = CLI_FLAG_SPECS.map(
  (spec, index) =>
    `  ${usageOptionLabels[index]?.padEnd(usageOptionLabelWidth)}  ${spec.description}`,
).join('\n');

const NPX_PACKAGE_NAME = cliPackageName();

export const USAGE = `cejel — a trust certificate for your codebase

Usage:
  npx ${NPX_PACKAGE_NAME} [path] [options]
  npx ${NPX_PACKAGE_NAME} scan [path] [options]
  npx ${NPX_PACKAGE_NAME} verify <report.json> <attestation.json>

Commands:
  scan    score a repository (default when the command is omitted)
  verify  verify report/attestation binding only; no signature or signer identity check

Scan options:
${usageOptions}

Runs entirely offline. No code leaves your machine.
Docs: https://cejel.dev
`;

async function main(): Promise<void> {
  const exitCode = await runWitanFreeCli(process.argv.slice(2));
  process.exitCode = exitCode;
}

/**
 * Zero-config public entry: `npx @cejel/cejel .` (or `npx @cejel/cejel`, defaulting to the
 * current directory). Fully offline — reuses this package's deterministic, no-LLM scoring core
 * and repo-signal collector; this module only adds ergonomic defaults + presentation.
 */
export async function runWitanFreeCli(args: readonly string[]): Promise<number> {
  const invocation = parseCliInvocation(args);
  if (invocation.command === 'verify') {
    return runVerifyBinding(invocation.reportPath, invocation.attestationPath);
  }

  const options = invocation.options;
  if (options.showVersion) {
    process.stdout.write(`${cliVersion()}\n`);
    return 0;
  }
  if (options.showHelp) {
    process.stdout.write(USAGE);
    return 0;
  }

  const initialLlmSnapshot = options.packs.includes('llm')
    ? snapshotCejelLlmPackInput(options.repoPath)
    : null;
  const { report, summary } = runCejelScan({
    repoPath: options.repoPath,
    ingestPatterns: options.ingestPatterns,
    warnOnEmptyIngestMatch: !options.quiet,
  });
  const attestation = createWitanAttestation(report, { toolVersion: cliVersion() });
  const serializedReport = serializeWitanReport(report);

  mkdirSync(options.outDir, { recursive: true });
  writeFileSync(join(options.outDir, 'report.json'), serializedReport, 'utf8');
  writeFileSync(
    join(options.outDir, 'attestation.json'),
    JSON.stringify(attestation, null, 2),
    'utf8',
  );
  writeFileSync(join(options.outDir, 'certificate.html'), renderWitanHtmlReport(report), 'utf8');
  writeFileSync(
    join(options.outDir, 'badge.json'),
    JSON.stringify(renderWitanBadgeEndpoint(report), null, 2),
    'utf8',
  );
  writeFileSync(join(options.outDir, 'badge.svg'), renderWitanBadgeSvg(report), 'utf8');
  writeFileSync(join(options.outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  let llmTerminal = '';
  if (options.packs.includes('llm')) {
    const llmSnapshot = snapshotCejelLlmPackInput(options.repoPath);
    if (!initialLlmSnapshot || initialLlmSnapshot.sourceSha256 !== llmSnapshot.sourceSha256) {
      throw new Error('Cejel: repository source changed between the base and LLM pack scans; rerun on a stable tree.');
    }
    const llmResult = collectCejelLlmPack(options.repoPath, llmSnapshot.repoFiles);
    const finalLlmSnapshot = snapshotCejelLlmPackInput(options.repoPath);
    if (finalLlmSnapshot.sourceSha256 !== llmSnapshot.sourceSha256) {
      throw new Error('Cejel: repository source changed during the LLM pack scan; rerun on a stable tree.');
    }
    const llmArtifact = createCejelLlmPackArtifact(llmResult, {
      generatedAt: report.generatedAt,
      repoPath: options.repoPath,
      ...(report.repo.headSha ? { headSha: report.repo.headSha } : {}),
      baseReportSha256: createHash('sha256').update(serializedReport).digest('hex'),
      inputSourceSha256: llmSnapshot.sourceSha256,
      toolVersion: cliVersion(),
      detectorSourceRevision: `local-or-unverified-build:@cejel/cejel@${cliVersion()}`,
    });
    const serializedLlmArtifact = serializeCejelLlmPackArtifact(llmArtifact);
    const llmAttestation = createCejelLlmPackAttestation(llmArtifact, serializedLlmArtifact);
    writeFileSync(join(options.outDir, 'llm-report.json'), serializedLlmArtifact, 'utf8');
    writeFileSync(
      join(options.outDir, 'llm-attestation.json'),
      `${JSON.stringify(llmAttestation, null, 2)}\n`,
      'utf8',
    );
    writeFileSync(
      join(options.outDir, 'llm-certificate.html'),
      renderCejelLlmPackHtml(llmArtifact),
      'utf8',
    );
    llmTerminal = renderCejelLlmPackTerminal(llmArtifact);
  } else {
    for (const staleArtifact of [
      'llm-report.json',
      'llm-attestation.json',
      'llm-certificate.html',
    ]) {
      rmSync(join(options.outDir, staleArtifact), { force: true });
    }
  }

  if (!options.quiet) {
    process.stdout.write(renderTerminalCertificate(summary));
    if (llmTerminal) process.stdout.write(`\n${llmTerminal}`);
    process.stdout.write(
      `\nWrote:\n  ${options.outDir}/report.json\n  ${options.outDir}/attestation.json\n  ${options.outDir}/certificate.html\n  ${options.outDir}/badge.json\n  ${options.outDir}/badge.svg\n${options.packs.includes('llm') ? `  ${options.outDir}/llm-report.json\n  ${options.outDir}/llm-attestation.json\n  ${options.outDir}/llm-certificate.html\n` : ''}`,
    );
  }

  if (options.minScore != null) {
    if (report.verdict === 'insufficient_source') {
      process.stderr.write(
        `Cejel: cannot evaluate the required minimum ${options.minScore.toFixed(1)}/4.0 because this repository has insufficient source.\n`,
      );
      return 1;
    }
    if (report.overallScore < options.minScore) {
      process.stderr.write(
        `Cejel: overall score ${report.overallScore.toFixed(1)}/4.0 is below the required minimum ${options.minScore.toFixed(1)}/4.0\n`,
      );
      return 1;
    }
  }

  return 0;
}

export function parseCliInvocation(args: readonly string[]): CejelCliInvocation {
  const command = args[0];
  if (command === 'scan') {
    return { command: 'scan', options: parseArgs(args.slice(1)) };
  }
  if (command === 'verify') {
    const verifyArgs = args.slice(1);
    if (verifyArgs.some((arg) => arg === '-h' || arg === '--help')) {
      return { command: 'scan', options: parseArgs(['--help']) };
    }
    if (verifyArgs.some((arg) => arg === '-v' || arg === '--version')) {
      return { command: 'scan', options: parseArgs(['--version']) };
    }
    if (verifyArgs.length !== 2) {
      throw new Error(`Usage: npx ${NPX_PACKAGE_NAME} verify <report.json> <attestation.json>`);
    }
    const [reportPath, attestationPath] = verifyArgs;
    if (!reportPath || !attestationPath) {
      throw new Error(`Usage: npx ${NPX_PACKAGE_NAME} verify <report.json> <attestation.json>`);
    }
    return {
      command: 'verify',
      reportPath: resolve(reportPath),
      attestationPath: resolve(attestationPath),
    };
  }
  return { command: 'scan', options: parseArgs(args) };
}

function runVerifyBinding(reportPath: string, attestationPath: string): number {
  const reportArtifact = readJsonArtifact(reportPath, 'report');
  const statement = readJsonArtifact(attestationPath, 'attestation');
  if (isLlmPackAttestation(statement.value)) {
    const artifactResult = CejelLlmPackArtifactSchema.safeParse(reportArtifact.value);
    if (!artifactResult.success) {
      const members = artifactResult.error.issues.map(
        (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
      );
      process.stderr.write(
        `Cejel: Free LLM Pack artifact validation failed:\n${members.map((member) => `  - ${member}`).join('\n')}\n`,
      );
      return 1;
    }
    const result = verifyCejelLlmPackAttestationBinding(
      statement.value,
      artifactResult.data,
      reportArtifact.contents,
    );
    if (!result.valid) {
      process.stderr.write(
        `Cejel: Free LLM Pack artifact/attestation binding verification failed:\n${result.errors
          .map((error) => `  - ${error}`)
          .join('\n')}\n`,
      );
      return 1;
    }
    process.stdout.write('Cejel: Free LLM Pack artifact/attestation binding verified.\n');
    process.stdout.write('Cejel: signature and signer identity were not verified.\n');
    return 0;
  }

  const reportResult = WitanReportSchema.safeParse(reportArtifact.value);
  if (!reportResult.success) {
    const members = reportResult.error.issues.map(
      (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    );
    process.stderr.write(
      `Cejel: report validation failed:\n${members.map((member) => `  - ${member}`).join('\n')}\n`,
    );
    return 1;
  }

  const reportSha256 = createHash('sha256').update(reportArtifact.contents).digest('hex');
  const result = verifyWitanAttestationBinding(statement.value, reportResult.data, {
    reportSha256,
  });
  if (!result.valid) {
    process.stderr.write(
      `Cejel: report/attestation binding verification failed:\n${result.errors
        .map((error) => `  - ${error}`)
        .join('\n')}\n`,
    );
    return 1;
  }

  process.stdout.write('Cejel: report/attestation binding verified.\n');
  process.stdout.write('Cejel: signature and signer identity were not verified.\n');
  return 0;
}

function isLlmPackAttestation(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { predicateType?: unknown }).predicateType === CEJEL_LLM_ATTESTATION_PREDICATE
  );
}

interface JsonArtifact {
  contents: Buffer;
  value: unknown;
}

function readJsonArtifact(path: string, label: 'report' | 'attestation'): JsonArtifact {
  let contents: Buffer;
  try {
    contents = readFileSync(path);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cejel: could not read ${label} file ${path}: ${message}`);
  }
  try {
    return { contents, value: JSON.parse(contents.toString('utf8')) as unknown };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cejel: invalid JSON in ${label} file ${path}: ${message}`);
  }
}

export function parseArgs(args: readonly string[]): WitanCliOptions {
  let repoPath: string | undefined;
  let outDir = DEFAULT_OUT_DIR;
  let minScore: number | undefined;
  let quiet = false;
  let showHelp = false;
  let showVersion = false;
  const ingestPatterns: string[] = [];
  const packs: CejelPackId[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--' || arg === undefined) continue;
    const flagKind = CLI_FLAG_KIND_BY_TOKEN.get(arg);
    if (!flagKind && arg.startsWith('-')) {
      throw new Error(`Unknown Cejel CLI flag: ${arg}`);
    }
    if (flagKind) {
      switch (flagKind) {
        case 'help':
          showHelp = true;
          break;
        case 'version':
          showVersion = true;
          break;
        case 'quiet':
          quiet = true;
          break;
        case 'out': {
          const value = args[index + 1];
          if (!value) throw new Error(`Missing value for ${arg}`);
          outDir = value;
          index += 1;
          break;
        }
        case 'minScore': {
          const value = args[index + 1];
          if (!value) throw new Error('Missing value for --min-score');
          const parsed = Number(value);
          if (!Number.isFinite(parsed) || parsed < 0 || parsed > 4) {
            throw new Error(`--min-score must be between 0 and 4, got: ${value}`);
          }
          minScore = parsed;
          index += 1;
          break;
        }
        case 'ingest': {
          const value = args[index + 1];
          if (!value) throw new Error('Missing value for --ingest');
          ingestPatterns.push(value);
          index += 1;
          break;
        }
        case 'pack': {
          const value = args[index + 1];
          if (!value) throw new Error('Missing value for --pack');
          if (value !== 'llm') {
            throw new Error(`Unknown Cejel pack: ${value}. Supported packs: llm`);
          }
          if (!packs.includes(value)) packs.push(value);
          index += 1;
          break;
        }
      }
      continue;
    }
    // First bare positional argument is the repo path. Anything after it is an error: silently
    // accepting a mistyped command or extra path makes the certificate target ambiguous.
    if (repoPath === undefined) {
      repoPath = arg;
    } else {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
  }

  return {
    repoPath: resolve(repoPath ?? '.'),
    outDir,
    ...(minScore != null ? { minScore } : {}),
    quiet,
    showHelp,
    showVersion,
    ingestPatterns,
    packs,
  };
}

function isEntryPoint(): boolean {
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  // npm's installed node_modules/.bin/cejel is a symlink to dist/index.js: argv[1] is the
  // symlink path while import.meta.url resolves to the real file, so the comparison must
  // go through the same realpath or `npx @cejel/cejel`/`.bin/cejel` silently exits 0 doing
  // nothing.
  let resolvedPath: string;
  try {
    resolvedPath = realpathSync(invokedPath);
  } catch {
    resolvedPath = invokedPath;
  }
  return import.meta.url === pathToFileURL(resolvedPath).href;
}

if (isEntryPoint()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown Cejel CLI error.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
