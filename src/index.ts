import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { WitanReportSchema } from './witan/index.js';
import {
  WITAN_ISSUANCE_PRINCIPAL,
  WITAN_ISSUANCE_SIGNATURE_NAMESPACE,
  createWitanAttestation,
  createWitanIssuanceStatement,
  findIssuerRevocation,
  parseIssuerPublicKey,
  parseIssuerRevocations,
  renderWitanBadgeEndpoint,
  renderWitanBadgeSvg,
  renderWitanHtmlReport,
  serializeWitanIssuance,
  serializeWitanReport,
  verifyWitanAttestationBinding,
  verifyWitanIssuanceBinding,
  verifyWitanIssuanceSignature,
} from './witan/index.js';
import {
  WITAN_RUBRIC_VERSION_V22,
  assertSelectableRubricVersion,
} from './witan/rubric-version.js';

export { WitanReportSchema, verifyWitanAttestationBinding };

import { runCejelScan } from './scan.js';
import {
  renderMinScoreAbstentionFailure,
  renderMinScoreLimitationFailure,
  renderTerminalCertificate,
} from './terminal.js';

export interface WitanCliOptions {
  repoPath: string;
  outDir: string;
  minScore?: number;
  productName?: string;
  productDisplayName?: string;
  quiet: boolean;
  showHelp: boolean;
  showVersion: boolean;
  /** Raw --ingest values (file paths or single-level globs), in the order given. */
  ingestPatterns: string[];
  /**
   * Explicit public opt-in to an alternate rubric (see WITAN_SELECTABLE_RUBRIC_VERSIONS).
   * Omitted by every ordinary invocation, which stays on the calibrated public default.
   */
  rubricPin?: string;
  /**
   * GITHUB_RUN_ATTEMPT, forwarded by the GitHub Action (see action/run.mjs). Never set by an
   * ordinary local invocation; never defaulted.
   */
  runAttempt?: string;
}

/**
 * `cejel issue` re-runs the scan and records a reproduction. It never signs and never reads a
 * private key: `keyPath` names the issuer's PUBLIC key, used only to record the fingerprint the
 * relying party will check and to print the exact ssh-agent signing command.
 */
export interface CejelIssueOptions {
  repoPath: string;
  reportPath: string;
  attestationPath: string;
  keyPath: string;
  engagementRef: string;
  outDir: string;
  productName?: string;
  productDisplayName?: string;
  rubricPin?: string;
  ingestPatterns: string[];
}

export interface CejelVerifyInvocation {
  command: 'verify';
  reportPath: string;
  attestationPath: string;
  /** Present only when the caller supplied an issuance pair. */
  issuancePath?: string;
  issuanceSignaturePath?: string;
  /** Overrides for the published files, for a relying party holding their own copies. */
  signersPath?: string;
  revocationsPath?: string;
}

export type CejelCliInvocation =
  | { command: 'scan'; options: WitanCliOptions }
  | CejelVerifyInvocation
  | { command: 'issue'; options: CejelIssueOptions };

const DEFAULT_OUT_DIR = '.cejel';

const ISSUER_SIGNERS_FILE = 'issuer-signers';
const ISSUER_REVOCATIONS_FILE = 'issuer-revocations';
// dist/index.js resolves the first candidate; src/index.ts under tsx/vitest resolves the second.
// Both files are listed in package.json "files", so an npm consumer has them without a network
// call — which is the whole point of publishing the allowed-signers list.
const SECURITY_FILE_CANDIDATES = ['../docs/security/', '../../docs/security/'] as const;

function resolveBundledSecurityFile(name: string): string | undefined {
  for (const prefix of SECURITY_FILE_CANDIDATES) {
    let candidate: string;
    try {
      candidate = fileURLToPath(new URL(`${prefix}${name}`, import.meta.url));
    } catch {
      continue;
    }
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export type CliFlagKind =
  | 'help'
  | 'version'
  | 'quiet'
  | 'out'
  | 'minScore'
  | 'ingest'
  | 'name'
  | 'productName'
  | 'rubricPin'
  | 'runAttempt';

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
    tokens: ['--product-name'],
    value: '<name>',
    description: 'set caller-context slug and display name for reproducible certificates',
    kind: 'productName',
  },
  {
    tokens: ['--name'],
    value: '<display>',
    description: 'override only the displayed project name (legacy compatibility)',
    kind: 'name',
  },
  {
    tokens: ['--ingest'],
    value: '<file>',
    description: 'fold in a SARIF/JSON scanner report (repeatable)',
    kind: 'ingest',
  },
  {
    tokens: ['--rubric-pin'],
    value: '<version>',
    description:
      'EXPLICIT OPT-IN: pin a rubric other than the calibrated default (see docs); prospective rubrics carry no calibration claim',
    kind: 'rubricPin',
  },
  {
    tokens: ['--run-attempt'],
    value: '<n>',
    description:
      'record which CI run attempt produced this certificate (set by the GitHub Action; omit otherwise)',
    kind: 'runAttempt',
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
  npx ${NPX_PACKAGE_NAME} verify <report.json> <attestation.json> [issuance.json issuance.json.sig]
  npx ${NPX_PACKAGE_NAME} issue [path] --report <report.json> --attestation <attestation.json> --key <key.pub> --engagement-ref <ref>

Commands:
  scan    score a repository (default when the command is omitted)
  verify  verify the report/attestation binding; with an issuance pair, also check the issuer
          signature against docs/security/${ISSUER_SIGNERS_FILE} and docs/security/${ISSUER_REVOCATIONS_FILE}
  issue   re-run this version at the certificate's revision and, only if report.json reproduces
          byte for byte, write an unsigned issuance.json for the issuer to sign through ssh-agent

Scan options:
${usageOptions}

Verify options:
  --signers <file>       use this allowed-signers file instead of the published one
  --revocations <file>   use this revocations file instead of the published one

Issue options:
  --report <file>        the report.json being countersigned (required)
  --attestation <file>   the attestation.json beside it (required)
  --key <file>           the issuer PUBLIC key (.pub); a private key file is refused (required)
  --engagement-ref <id>  opaque issuer-chosen identifier; never a counterparty name (required)
  --out <dir>            where issuance.json is written (default: the report.json directory)
  --product-name <name>  pass exactly what the original scan used, or the bytes will not reproduce
  --name <display>       pass exactly what the original scan used, or the bytes will not reproduce
  --rubric-pin <version> pass exactly what the original scan used, or the bytes will not reproduce
  --ingest <file>        pass exactly what the original scan used, or the bytes will not reproduce

cejel never signs and never reads private key material.

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
  return runWitanCli(args);
}

/**
 * Calibration-only entry for a committed evaluation driver. This is deliberately not a public
 * CLI flag: product scans retain the calibrated default unless a separately reviewed driver
 * pins an experimental rubric in its own frozen source tree.
 */
export async function runWitanV22CalibrationCli(args: readonly string[]): Promise<number> {
  return runWitanCli(args, WITAN_RUBRIC_VERSION_V22);
}

async function runWitanCli(
  args: readonly string[],
  rubricVersion?: string,
): Promise<number> {
  const invocation = parseCliInvocation(args);
  if (invocation.command === 'verify') {
    return runVerifyBinding(invocation);
  }
  if (invocation.command === 'issue') {
    return runIssue(invocation.options);
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

  // An explicit --rubric-pin on this invocation always wins over a preset rubricVersion: the
  // preset exists only for a committed calibration driver's own args (see
  // runWitanV22CalibrationCli below), which never populates options.rubricPin.
  const effectiveRubricVersion = options.rubricPin ?? rubricVersion;
  const { report, summary, generatedAt } = runCejelScan({
    repoPath: options.repoPath,
    ...(options.productName ? { productName: options.productName } : {}),
    ...(options.productDisplayName ? { productDisplayName: options.productDisplayName } : {}),
    ...(effectiveRubricVersion ? { rubricVersion: effectiveRubricVersion } : {}),
    ingestPatterns: options.ingestPatterns,
    warnOnEmptyIngestMatch: !options.quiet,
    toolVersion: cliVersion(),
  });
  const attestation = createWitanAttestation(report, {
    toolVersion: cliVersion(),
    generatedAt,
    ...(options.runAttempt ? { githubRunAttempt: options.runAttempt } : {}),
  });

  mkdirSync(options.outDir, { recursive: true });
  writeFileSync(join(options.outDir, 'report.json'), serializeWitanReport(report), 'utf8');
  writeFileSync(
    join(options.outDir, 'attestation.json'),
    JSON.stringify(attestation, null, 2),
    'utf8',
  );
  writeFileSync(
    join(options.outDir, 'certificate.html'),
    renderWitanHtmlReport(report, {
      cliVersion: cliVersion(),
      generatedAt,
      ...(options.runAttempt ? { runAttempt: options.runAttempt } : {}),
    }),
    'utf8',
  );
  writeFileSync(
    join(options.outDir, 'badge.json'),
    JSON.stringify(renderWitanBadgeEndpoint(report), null, 2),
    'utf8',
  );
  writeFileSync(join(options.outDir, 'badge.svg'), renderWitanBadgeSvg(report), 'utf8');
  writeFileSync(join(options.outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  if (!options.quiet) {
    process.stdout.write(renderTerminalCertificate(summary, report));
    process.stdout.write(
      `\nWrote:\n  ${options.outDir}/report.json\n  ${options.outDir}/summary.json\n  ${options.outDir}/attestation.json\n  ${options.outDir}/certificate.html\n  ${options.outDir}/badge.json\n  ${options.outDir}/badge.svg\n`,
    );
  }

  if (options.minScore != null) {
    if (summary.scanLimitations.length > 0) {
      process.stderr.write(renderMinScoreLimitationFailure(summary, options.minScore));
      return 1;
    }
    if (report.verdict === 'insufficient_source') {
      process.stderr.write(renderMinScoreAbstentionFailure(summary, options.minScore));
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
    return parseVerifyArgs(verifyArgs);
  }
  if (command === 'issue') {
    const issueArgs = args.slice(1);
    if (issueArgs.some((arg) => arg === '-h' || arg === '--help')) {
      return { command: 'scan', options: parseArgs(['--help']) };
    }
    if (issueArgs.some((arg) => arg === '-v' || arg === '--version')) {
      return { command: 'scan', options: parseArgs(['--version']) };
    }
    return { command: 'issue', options: parseIssueArgs(issueArgs) };
  }
  return { command: 'scan', options: parseArgs(args) };
}

const VERIFY_USAGE = () =>
  `Usage: npx ${NPX_PACKAGE_NAME} verify <report.json> <attestation.json> [issuance.json issuance.json.sig] [--signers <file>] [--revocations <file>]`;

export function parseVerifyArgs(args: readonly string[]): CejelVerifyInvocation {
  const positionals: string[] = [];
  let signersPath: string | undefined;
  let revocationsPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (arg === '--signers' || arg === '--revocations') {
      const value = args[index + 1];
      if (!value) throw new Error(`Missing value for ${arg}`);
      if (arg === '--signers') signersPath = resolve(value);
      else revocationsPath = resolve(value);
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`Unknown Cejel verify flag: ${arg}`);
    positionals.push(arg);
  }

  // Two artifacts, or four. Three is a truncated issuance pair, and a signature this command
  // silently did not check is exactly the failure mode issuance exists to remove.
  if (positionals.length !== 2 && positionals.length !== 4) throw new Error(VERIFY_USAGE());
  const [reportPath, attestationPath, issuancePath, issuanceSignaturePath] = positionals;
  if (!reportPath || !attestationPath) throw new Error(VERIFY_USAGE());

  return {
    command: 'verify',
    reportPath: resolve(reportPath),
    attestationPath: resolve(attestationPath),
    ...(issuancePath ? { issuancePath: resolve(issuancePath) } : {}),
    ...(issuanceSignaturePath
      ? { issuanceSignaturePath: resolve(issuanceSignaturePath) }
      : {}),
    ...(signersPath ? { signersPath } : {}),
    ...(revocationsPath ? { revocationsPath } : {}),
  };
}

export function parseIssueArgs(args: readonly string[]): CejelIssueOptions {
  let repoPath: string | undefined;
  let reportPath: string | undefined;
  let attestationPath: string | undefined;
  let keyPath: string | undefined;
  let engagementRef: string | undefined;
  let outDir: string | undefined;
  let productName: string | undefined;
  let productDisplayName: string | undefined;
  let rubricPin: string | undefined;
  const ingestPatterns: string[] = [];

  function takeValue(arg: string, index: number): string {
    const value = args[index];
    if (!value) throw new Error(`Missing value for ${arg}`);
    return value;
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    switch (arg) {
      case '--report':
        reportPath = resolve(takeValue(arg, index + 1));
        index += 1;
        continue;
      case '--attestation':
        attestationPath = resolve(takeValue(arg, index + 1));
        index += 1;
        continue;
      case '--key':
        keyPath = resolve(takeValue(arg, index + 1));
        index += 1;
        continue;
      case '--engagement-ref':
        engagementRef = takeValue(arg, index + 1).trim();
        index += 1;
        continue;
      case '--out':
      case '--out-dir':
        outDir = resolve(takeValue(arg, index + 1));
        index += 1;
        continue;
      case '--product-name':
        productName = takeValue(arg, index + 1).trim();
        index += 1;
        continue;
      case '--name':
        productDisplayName = takeValue(arg, index + 1).trim();
        index += 1;
        continue;
      case '--rubric-pin': {
        const value = takeValue(arg, index + 1);
        assertSelectableRubricVersion(value);
        rubricPin = value;
        index += 1;
        continue;
      }
      case '--ingest':
        ingestPatterns.push(takeValue(arg, index + 1));
        index += 1;
        continue;
      default:
        break;
    }
    if (arg.startsWith('-')) throw new Error(`Unknown Cejel issue flag: ${arg}`);
    if (repoPath !== undefined) throw new Error(`Unexpected positional argument: ${arg}`);
    repoPath = arg;
  }

  const missing = [
    reportPath ? null : '--report',
    attestationPath ? null : '--attestation',
    keyPath ? null : '--key',
    engagementRef ? null : '--engagement-ref',
  ].filter((entry): entry is string => entry !== null);
  if (missing.length > 0 || !reportPath || !attestationPath || !keyPath || !engagementRef) {
    throw new Error(
      `Cejel issue requires ${missing.join(', ')}. Usage: npx ${NPX_PACKAGE_NAME} issue [path] --report <report.json> --attestation <attestation.json> --key <key.pub> --engagement-ref <ref>`,
    );
  }
  if (productName && productDisplayName) {
    throw new Error('--product-name and --name cannot be used together');
  }

  return {
    repoPath: resolve(repoPath ?? '.'),
    reportPath,
    attestationPath,
    keyPath,
    engagementRef,
    outDir: outDir ?? dirname(reportPath),
    ...(productName ? { productName } : {}),
    ...(productDisplayName ? { productDisplayName } : {}),
    ...(rubricPin ? { rubricPin } : {}),
    ingestPatterns,
  };
}

function runVerifyBinding(invocation: CejelVerifyInvocation): number {
  const reportArtifact = readJsonArtifact(invocation.reportPath, 'report');
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

  const statement = readJsonArtifact(invocation.attestationPath, 'attestation');
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

  if (!invocation.issuancePath || !invocation.issuanceSignaturePath) {
    process.stdout.write('Cejel: signature and signer identity were not verified.\n');
    return 0;
  }

  const attestationSha256 = createHash('sha256').update(statement.contents).digest('hex');
  return runVerifyIssuance(invocation, {
    reportSha256,
    attestationSha256,
    productSlug: reportResult.data.productSlug,
    issuancePath: invocation.issuancePath,
    issuanceSignaturePath: invocation.issuanceSignaturePath,
  });
}

interface VerifyIssuanceContext {
  reportSha256: string;
  attestationSha256: string;
  productSlug: string;
  issuancePath: string;
  issuanceSignaturePath: string;
}

/**
 * The three lines a relying party reads: is the signature valid, is it bound to these exact
 * bytes, and has this report digest been withdrawn. Anything this build cannot establish prints
 * as not established. There is no path here that prints "valid" for a signature that was not
 * cryptographically verified against a key published in the allowed-signers file.
 */
function runVerifyIssuance(
  invocation: CejelVerifyInvocation,
  context: VerifyIssuanceContext,
): number {
  const issuance = readJsonArtifact(context.issuancePath, 'issuance');
  let armoredSignature: string;
  try {
    armoredSignature = readFileSync(context.issuanceSignaturePath, 'utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cejel: could not read issuance signature file ${context.issuanceSignaturePath}: ${message}`,
    );
  }

  const signersPath = invocation.signersPath ?? resolveBundledSecurityFile(ISSUER_SIGNERS_FILE);
  const revocationsPath =
    invocation.revocationsPath ?? resolveBundledSecurityFile(ISSUER_REVOCATIONS_FILE);

  let signatureLine: string;
  let signatureOk = false;
  if (!signersPath) {
    signatureLine = `signature:  NOT VERIFIED — no ${ISSUER_SIGNERS_FILE} file was found beside this build; pass --signers <file>`;
  } else {
    const verdict = verifyWitanIssuanceSignature({
      message: issuance.contents,
      armoredSignature,
      allowedSignersText: readFileSync(signersPath, 'utf8'),
    });
    switch (verdict.status) {
      case 'valid':
        signatureOk = true;
        signatureLine = `signature:  valid — signed by ${verdict.principal} (${verdict.keyType}, ${verdict.fingerprint}) under namespace ${WITAN_ISSUANCE_SIGNATURE_NAMESPACE}`;
        break;
      case 'unlisted_key':
        signatureLine = `signature:  SIGNED BY AN UNLISTED KEY — ${verdict.keyType} ${verdict.fingerprint} is not listed for ${WITAN_ISSUANCE_PRINCIPAL} in ${signersPath}`;
        break;
      case 'unsupported':
        signatureLine = `signature:  NOT VERIFIED — ${verdict.reason}`;
        break;
      default:
        signatureLine = `signature:  INVALID — ${verdict.reason}`;
        break;
    }
  }

  const binding = verifyWitanIssuanceBinding(issuance.value, {
    reportSha256: context.reportSha256,
    attestationSha256: context.attestationSha256,
    productSlug: context.productSlug,
  });
  const bindingLine = binding.valid
    ? 'binding:    valid — the issuance names the exact report.json and attestation.json supplied, and asserts reportByteIdentical: true'
    : `binding:    INVALID — ${binding.errors.join('; ')}`;

  let revocationLine: string;
  let revocationOk = false;
  if (!revocationsPath) {
    revocationLine = `revocation: NOT CHECKED — no ${ISSUER_REVOCATIONS_FILE} file was found beside this build; pass --revocations <file>`;
  } else {
    let revocation: ReturnType<typeof findIssuerRevocation>;
    try {
      revocation = findIssuerRevocation(
        parseIssuerRevocations(readFileSync(revocationsPath, 'utf8')),
        context.reportSha256,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(`${signatureLine}\n${bindingLine}\n`);
      process.stdout.write(`revocation: NOT CHECKED — ${message}\n`);
      return 1;
    }
    if (revocation) {
      revocationLine = `revocation: REVOKED — withdrawn ${revocation.date}: ${revocation.reason}`;
    } else {
      revocationOk = true;
      revocationLine = `revocation: not revoked — this report digest is absent from ${revocationsPath}`;
    }
  }

  process.stdout.write(`${signatureLine}\n${bindingLine}\n${revocationLine}\n`);
  return signatureOk && binding.valid && revocationOk ? 0 : 1;
}

function runIssue(options: CejelIssueOptions): number {
  const reportArtifact = readJsonArtifact(options.reportPath, 'report');
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
  const suppliedReport = reportResult.data;

  const attestationArtifact = readJsonArtifact(options.attestationPath, 'attestation');
  const reportSha256 = createHash('sha256').update(reportArtifact.contents).digest('hex');
  const attestationSha256 = createHash('sha256')
    .update(attestationArtifact.contents)
    .digest('hex');
  const attestationBinding = verifyWitanAttestationBinding(
    attestationArtifact.value,
    suppliedReport,
    { reportSha256 },
  );
  if (!attestationBinding.valid) {
    process.stderr.write(
      `Cejel: refusing to issue — the supplied report and attestation are not bound to each other:\n${attestationBinding.errors
        .map((error) => `  - ${error}`)
        .join('\n')}\n`,
    );
    return 1;
  }

  let keyContents: string;
  try {
    keyContents = readFileSync(options.keyPath, 'utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cejel: could not read --key file ${options.keyPath}: ${message}`);
  }
  // Refused before the scan runs: a private key file must never travel further into the process
  // than the first byte that identifies it as one.
  const issuerKey = parseIssuerPublicKey(keyContents);

  // The reproduction. Same version, same revision, same invocation: the bytes match or there is
  // no issuance. There is deliberately no flag that downgrades this to a warning.
  const reproduction = runCejelScan({
    repoPath: options.repoPath,
    ...(options.productName ? { productName: options.productName } : {}),
    ...(options.productDisplayName ? { productDisplayName: options.productDisplayName } : {}),
    ...(options.rubricPin ? { rubricVersion: options.rubricPin } : {}),
    ingestPatterns: options.ingestPatterns,
    warnOnEmptyIngestMatch: true,
    toolVersion: cliVersion(),
  });
  const reproducedBytes = serializeWitanReport(reproduction.report);
  const reproducedSha256 = createHash('sha256').update(reproducedBytes, 'utf8').digest('hex');
  if (reproducedSha256 !== reportSha256) {
    process.stderr.write(
      [
        'Cejel: refusing to issue — report.json did not reproduce byte for byte.',
        `  supplied report.json:   sha256:${reportSha256}`,
        `  re-run at ${options.repoPath}: sha256:${reproducedSha256}`,
        `  this build:             @cejel/cejel ${cliVersion()}`,
        '  Check that the checkout is at the certificate revision, that the @cejel/cejel version matches',
        '  report.json\'s toolVersion, and that --product-name/--name/--rubric-pin/--ingest match the',
        '  original invocation. An issuance that cannot reproduce is not issued.',
        '',
      ].join('\n'),
    );
    return 1;
  }

  const statement = createWitanIssuanceStatement(suppliedReport, {
    reportSha256,
    attestationSha256,
    issuerKeyFingerprint: issuerKey.fingerprint,
    toolVersion: cliVersion(),
    issuedAt: new Date().toISOString(),
    engagementRef: options.engagementRef,
  });

  mkdirSync(options.outDir, { recursive: true });
  const issuancePath = join(options.outDir, 'issuance.json');
  writeFileSync(issuancePath, serializeWitanIssuance(statement), 'utf8');

  process.stdout.write(
    [
      `Cejel: reproduced report.json byte for byte (sha256:${reportSha256}).`,
      `Wrote:\n  ${issuancePath}`,
      '',
      'report.json and attestation.json were not modified. Cejel does not sign and never reads a',
      'private key. Sign through ssh-agent, with the issuer key on its token:',
      '',
      `  ssh-keygen -Y sign -n ${WITAN_ISSUANCE_SIGNATURE_NAMESPACE} -f ${options.keyPath} -U ${issuancePath}`,
      '',
      'Then verify before delivery:',
      '',
      `  npx ${NPX_PACKAGE_NAME} verify ${options.reportPath} ${options.attestationPath} ${issuancePath} ${issuancePath}.sig`,
      '',
    ].join('\n'),
  );
  return 0;
}

interface JsonArtifact {
  contents: Buffer;
  value: unknown;
}

function readJsonArtifact(
  path: string,
  label: 'report' | 'attestation' | 'issuance',
): JsonArtifact {
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
  let productName: string | undefined;
  let productDisplayName: string | undefined;
  let quiet = false;
  let showHelp = false;
  let showVersion = false;
  let rubricPin: string | undefined;
  let runAttempt: string | undefined;
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
        case 'name': {
          const value = args[index + 1];
          if (!value) throw new Error('Missing value for --name');
          const trimmed = value.trim();
          if (
            trimmed.length === 0 ||
            trimmed.length > 120 ||
            hasUnsafeDisplayNameCharacter(trimmed)
          ) {
            throw new Error(
              '--name must be a single printable line containing between 1 and 120 characters',
            );
          }
          productDisplayName = trimmed;
          index += 1;
          break;
        }
        case 'productName': {
          const value = args[index + 1];
          if (!value) throw new Error('Missing value for --product-name');
          const trimmed = value.trim();
          if (
            trimmed.length === 0 ||
            trimmed.length > 120 ||
            hasUnsafeDisplayNameCharacter(trimmed)
          ) {
            throw new Error(
              '--product-name must be a single printable line containing between 1 and 120 characters',
            );
          }
          productName = trimmed;
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
        case 'rubricPin': {
          const value = args[index + 1];
          if (!value) throw new Error('Missing value for --rubric-pin');
          assertSelectableRubricVersion(value);
          rubricPin = value;
          index += 1;
          break;
        }
        case 'runAttempt': {
          const value = args[index + 1];
          if (!value) throw new Error('Missing value for --run-attempt');
          if (!/^[1-9][0-9]*$/.test(value)) {
            throw new Error(`--run-attempt must be a positive integer, got: ${value}`);
          }
          runAttempt = value;
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

  if (productName && productDisplayName) {
    throw new Error('--product-name and --name cannot be used together');
  }

  return {
    repoPath: resolve(repoPath ?? '.'),
    outDir,
    ...(minScore != null ? { minScore } : {}),
    ...(productName ? { productName } : {}),
    ...(productDisplayName ? { productDisplayName } : {}),
    quiet,
    showHelp,
    showVersion,
    ingestPatterns,
    ...(rubricPin ? { rubricPin } : {}),
    ...(runAttempt ? { runAttempt } : {}),
  };
}

function hasUnsafeDisplayNameCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint === undefined ||
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0x2028 ||
      codePoint === 0x2029
    ) {
      return true;
    }
  }
  return false;
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
