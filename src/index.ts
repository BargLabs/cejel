import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createWitanAttestation,
  renderWitanBadgeEndpoint,
  renderWitanBadgeSvg,
  renderWitanHtmlReport,
  serializeWitanReport,
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
}

const DEFAULT_OUT_DIR = '.cejel';

export type CliFlagKind = 'help' | 'version' | 'quiet' | 'out' | 'minScore' | 'ingest';

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

function cliVersion(): string {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version?: unknown };
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error('Cejel package manifest has no version.');
  }
  return manifest.version;
}

const usageOptionLabels = CLI_FLAG_SPECS.map(
  (spec) => `${spec.tokens.join(', ')}${'value' in spec && spec.value ? ` ${spec.value}` : ''}`,
);
const usageOptionLabelWidth = Math.max(...usageOptionLabels.map((label) => label.length));
const usageOptions = CLI_FLAG_SPECS.map(
  (spec, index) =>
    `  ${usageOptionLabels[index]?.padEnd(usageOptionLabelWidth)}  ${spec.description}`,
).join('\n');

export const USAGE = `cejel — a trust certificate for your codebase

Usage:  npx cejel [path] [options]

Options:
${usageOptions}

Runs entirely offline. No code leaves your machine.
Docs: https://cejel.dev
`;

async function main(): Promise<void> {
  const exitCode = await runWitanFreeCli(process.argv.slice(2));
  process.exitCode = exitCode;
}

/**
 * Zero-config public entry: `npx cejel .` (or `npx cejel`, defaulting to the
 * current directory). Fully offline — reuses this package's deterministic, no-LLM scoring core
 * and repo-signal collector; this module only adds ergonomic defaults + presentation.
 */
export async function runWitanFreeCli(args: readonly string[]): Promise<number> {
  const options = parseArgs(args);
  if (options.showVersion) {
    process.stdout.write(`${cliVersion()}\n`);
    return 0;
  }
  if (options.showHelp) {
    process.stdout.write(USAGE);
    return 0;
  }

  const { report, summary } = runCejelScan({
    repoPath: options.repoPath,
    ingestPatterns: options.ingestPatterns,
    warnOnEmptyIngestMatch: !options.quiet,
  });
  const attestation = createWitanAttestation(report, { toolVersion: cliVersion() });

  mkdirSync(options.outDir, { recursive: true });
  writeFileSync(join(options.outDir, 'report.json'), serializeWitanReport(report), 'utf8');
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

  if (!options.quiet) {
    process.stdout.write(renderTerminalCertificate(summary));
    process.stdout.write(
      `\nWrote:\n  ${options.outDir}/report.json\n  ${options.outDir}/attestation.json\n  ${options.outDir}/certificate.html\n  ${options.outDir}/badge.json\n  ${options.outDir}/badge.svg\n`,
    );
  }

  if (options.minScore != null && report.overallScore < options.minScore) {
    process.stderr.write(
      `Cejel: overall score ${report.overallScore.toFixed(1)}/4.0 is below the required minimum ${options.minScore.toFixed(1)}/4.0\n`,
    );
    return 1;
  }

  return 0;
}

export function parseArgs(args: readonly string[]): WitanCliOptions {
  let repoPath: string | undefined;
  let outDir = DEFAULT_OUT_DIR;
  let minScore: number | undefined;
  let quiet = false;
  let showHelp = false;
  let showVersion = false;
  const ingestPatterns: string[] = [];

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
      }
      continue;
    }
    // First bare positional argument is the repo path.
    if (repoPath === undefined) repoPath = arg;
  }

  return {
    repoPath: resolve(repoPath ?? '.'),
    outDir,
    ...(minScore != null ? { minScore } : {}),
    quiet,
    showHelp,
    showVersion,
    ingestPatterns,
  };
}

function isEntryPoint(): boolean {
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  // npm's installed node_modules/.bin/cejel is a symlink to dist/index.js: argv[1] is the
  // symlink path while import.meta.url resolves to the real file, so the comparison must
  // go through the same realpath or `npx cejel`/`.bin/cejel` silently exits 0 doing nothing.
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
