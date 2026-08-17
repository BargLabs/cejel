import { existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';

import { readRepoText } from '../../witan/content-reads.js';
import { execGit } from '../../witan/git-exec.js';

import { listCejelLlmPackFiles } from '../llm/files.js';

export type D6Mechanism = 'exit-status-discarded' | 'report-independent-of-operation';
export type D6FileStatus =
  | 'examined-clean'
  | 'examined-finding'
  | 'abstained-ambiguous'
  | 'abstained-non-coverage';
export type D6AbstentionKind =
  | 'deliberately-advisory'
  | 'non-coverage'
  | 'anchor-unavailable';

export interface D6Finding {
  readonly ruleId: 'D6';
  readonly mechanism: D6Mechanism;
  readonly scope: 'exact-shell-signature';
  readonly severity: 'warning';
  readonly confidence: 'high';
  readonly summary: string;
  readonly introducedCommit?: string;
  readonly evidence: {
    readonly path: string;
    readonly line: number;
    readonly label: string;
  };
}

export interface D6Abstention {
  readonly ruleId: 'D6';
  readonly kind: D6AbstentionKind;
  readonly path: string;
  readonly line?: number;
  readonly reason: string;
}

export interface D6FileAssessment {
  readonly path: string;
  readonly status: D6FileStatus;
  readonly findingCount: number;
  readonly reason?: string;
}

export interface D6Inspection {
  readonly ruleId: 'D6';
  readonly claim: 'two-exact-shell-signatures-only';
  readonly registration: 'export-only';
  readonly findings: readonly D6Finding[];
  readonly abstentions: readonly D6Abstention[];
  readonly files: readonly D6FileAssessment[];
  readonly coverage: {
    readonly examinedFiles: number;
    readonly examinedCleanFiles: number;
    readonly findingFiles: number;
    readonly ambiguousAbstentionFiles: number;
    readonly nonCoverageFiles: number;
  };
  readonly certificateWording: string;
}

interface Candidate extends D6Finding {
  readonly commitSearchText: string;
}

interface FileAnalysis {
  readonly path: string;
  readonly candidates: readonly Candidate[];
  readonly abstentions: readonly D6Abstention[];
  readonly assessment: D6FileAssessment;
}

interface Operation {
  readonly displayName: string;
  readonly operationName: string;
  readonly commitSearchText: string;
}

const SHELL_EXTENSIONS = new Set(['.sh', '.bash']);
const CONTROL_NAME = /(?:guard|check|verify|validat|audit|integrity|test)/i;
const OPERATION_NAME = /^(?:rm|remove|delete|destroy|drop|purge|reap|apply|deploy|publish|release)/i;
const SUCCESS_REPORT = /\b(?:removed|reaped|verified|succeeded|success|completed|passed|published|deployed)\b/i;
const ADVISORY_MARKER = /\b(?:advisory|best[ -]effort|non[ -]blocking|optional)\b/i;

function shellCommandName(line: string): string | null {
  const match =
    /^\s*(?:command\s+)?((?:[A-Za-z_][A-Za-z0-9_-]*|(?:\.\/)?[A-Za-z0-9_./-]+))(?=\s|[;|&]|$)/.exec(
      line,
    );
  if (!match?.[1] || match[1].startsWith('#')) return null;
  const command = match[1].split('/').at(-1)?.replace(/\.(?:sh|bash)$/i, '');
  return command ?? null;
}

function shellWords(line: string): string[] {
  return line.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s;|&]+/g) ?? [];
}

function operationFromLine(line: string): Operation | null {
  const command = shellCommandName(line);
  if (command === null) return null;
  if (command !== 'git') {
    return {
      displayName: command,
      operationName: command,
      commitSearchText: command,
    };
  }

  const words = shellWords(line);
  let index = words.findIndex((word) => word.split('/').at(-1) === 'git') + 1;
  if (index === 0) return null;
  while (index < words.length) {
    const word = words[index];
    if (!word?.startsWith('-')) break;
    if (word === '-C' || word === '-c' || word === '--git-dir' || word === '--work-tree') {
      index += 2;
    } else {
      index += 1;
    }
  }
  if (words[index] === 'worktree' && words[index + 1] === 'remove') {
    return {
      displayName: 'git worktree remove',
      operationName: 'remove',
      commitSearchText: 'worktree remove',
    };
  }
  return {
    displayName: 'git',
    operationName: 'git',
    commitSearchText: 'git',
  };
}

function isControlInvocation(line: string): boolean {
  const command = shellCommandName(line);
  return command !== null && CONTROL_NAME.test(command);
}

function hasErrexit(lines: readonly string[]): boolean {
  return lines.some((line) => /^\s*set\s+(?:-[^#\n]*e|-[oO]\s+errexit)\b/.test(line));
}

function lineOf(index: number): number {
  return index + 1;
}

function advisoryReason(line: string, followingLine: string): string | null {
  return ADVISORY_MARKER.test(`${line}\n${followingLine}`)
    ? 'explicit advisory or best-effort marker makes the control deliberately non-gating'
    : null;
}

function exitStatusAnalysis(
  path: string,
  lines: readonly string[],
): { readonly candidates: Candidate[]; readonly abstentions: D6Abstention[] } {
  const candidates: Candidate[] = [];
  const abstentions: D6Abstention[] = [];
  const errexit = hasErrexit(lines);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || !isControlInvocation(line)) continue;
    const neutralized = /(?:\|\||;)\s*true(?:\s*(?:#.*)?)?$/.test(line);
    const ignoredReturn =
      !errexit &&
      !neutralized &&
      !/^\s*(?:if|while|until)\b/.test(line) &&
      /^\s*echo\s+.*\b(?:verified|passed|success)\b/i.test(lines[index + 1] ?? '');
    if (!neutralized && !ignoredReturn) continue;

    const ambiguity = advisoryReason(line, lines[index + 1] ?? '');
    if (ambiguity !== null) {
      abstentions.push({
        ruleId: 'D6',
        kind: 'deliberately-advisory',
        path,
        line: lineOf(index),
        reason: ambiguity,
      });
      continue;
    }

    const command = shellCommandName(line) ?? 'control';
    candidates.push({
      ruleId: 'D6',
      mechanism: 'exit-status-discarded',
      scope: 'exact-shell-signature',
      severity: 'warning',
      confidence: 'high',
      summary: `The exit status of ${JSON.stringify(command)} is discarded before a success report; the report provides no evidence that this control result affected the outcome.`,
      evidence: {
        path,
        line: lineOf(index),
        label: `Discarded control exit status ${command}`,
      },
      commitSearchText: command,
    });
  }
  return { candidates, abstentions };
}

function neutralizedAdvisoryOperation(line: string): boolean {
  return /(?:\|\||;)\s*true(?:\s*(?:#.*)?)?$/.test(line);
}

function reportIndependentCandidates(path: string, lines: readonly string[]): Candidate[] {
  const findings: Candidate[] = [];
  const errexit = hasErrexit(lines);
  for (let index = 0; index < lines.length; index += 1) {
    const operationLine = lines[index];
    if (!operationLine || errexit || /^\s*(?:if|while|until)\b/.test(operationLine)) continue;
    const operation = operationFromLine(operationLine);
    if (operation === null || !OPERATION_NAME.test(operation.operationName)) continue;
    if (neutralizedAdvisoryOperation(operationLine) || /&&\s*$/.test(operationLine)) continue;

    const nextLine = lines[index + 1] ?? '';
    const hasAdvisoryInterveningOperation = neutralizedAdvisoryOperation(nextLine);
    const reportIndex = index + (hasAdvisoryInterveningOperation ? 2 : 1);
    const returnIndex = reportIndex + 1;
    const report = lines[reportIndex] ?? '';
    const returnStatement = lines[returnIndex] ?? '';
    if (
      !/^\s*echo\s+/.test(report) ||
      !SUCCESS_REPORT.test(report) ||
      !/^\s*return\s+0(?:\s*(?:#.*)?)?$/.test(returnStatement)
    ) {
      continue;
    }

    findings.push({
      ruleId: 'D6',
      mechanism: 'report-independent-of-operation',
      scope: 'exact-shell-signature',
      severity: 'warning',
      confidence: 'high',
      summary: `The exit status of ${JSON.stringify(operation.displayName)} cannot affect the following success report or return value; that report provides no evidence that the operation result affected the outcome.`,
      evidence: {
        path,
        line: lineOf(reportIndex),
        label: `Success report independent of ${operation.displayName}`,
      },
      commitSearchText: operation.commitSearchText,
    });
  }
  return findings;
}

function analyzeFile(repoRoot: string, path: string): FileAnalysis {
  if (!SHELL_EXTENSIONS.has(extname(path).toLowerCase())) {
    const reason = 'only .sh and .bash files are examined by this proposal';
    return {
      path,
      candidates: [],
      abstentions: [{ ruleId: 'D6', kind: 'non-coverage', path, reason }],
      assessment: {
        path,
        status: 'abstained-non-coverage',
        findingCount: 0,
        reason,
      },
    };
  }

  const absolute = resolve(repoRoot, path);
  if (!existsSync(absolute)) {
    const reason = 'the supplied shell path was unavailable for examination';
    return {
      path,
      candidates: [],
      abstentions: [{ ruleId: 'D6', kind: 'non-coverage', path, reason }],
      assessment: {
        path,
        status: 'abstained-non-coverage',
        findingCount: 0,
        reason,
      },
    };
  }

  const lines = readRepoText(absolute).split(/\r?\n/);
  const exitStatus = exitStatusAnalysis(path, lines);
  const candidates = [...exitStatus.candidates, ...reportIndependentCandidates(path, lines)];
  const ambiguous = exitStatus.abstentions.length > 0;
  return {
    path,
    candidates,
    abstentions: exitStatus.abstentions,
    assessment: {
      path,
      status:
        candidates.length > 0
          ? 'examined-finding'
          : ambiguous
            ? 'abstained-ambiguous'
            : 'examined-clean',
      findingCount: candidates.length,
      ...(ambiguous && candidates.length === 0
        ? { reason: exitStatus.abstentions[0]?.reason }
        : {}),
    },
  };
}

function candidateOrder(left: Candidate, right: Candidate): number {
  return (
    left.evidence.path.localeCompare(right.evidence.path) ||
    left.evidence.line - right.evidence.line ||
    left.mechanism.localeCompare(right.mechanism)
  );
}

function certificateWording(files: readonly D6FileAssessment[]): string {
  const examined = files.filter(
    (file) => file.status === 'examined-clean' || file.status === 'examined-finding',
  ).length;
  const findings = files.filter((file) => file.status === 'examined-finding').length;
  const ambiguous = files.filter((file) => file.status === 'abstained-ambiguous').length;
  const nonCoverage = files.filter((file) => file.status === 'abstained-non-coverage').length;
  return `D6 export-only proposal: examined ${examined} .sh/.bash files for two exact signatures; ${findings} files contained findings, ${ambiguous} deliberately advisory files abstained as ambiguous, and ${nonCoverage} files abstained by non-coverage. This is not a claim that unobserved controls are absent, and D6 is not run by cejel scan or included in its certificate.`;
}

function inspectionFromAnalyses(
  analyses: readonly FileAnalysis[],
  findings: readonly D6Finding[],
  additionalAbstentions: readonly D6Abstention[] = [],
): D6Inspection {
  const files = analyses.map((analysis) => analysis.assessment);
  const abstentions = [
    ...analyses.flatMap((analysis) => analysis.abstentions),
    ...additionalAbstentions,
  ].sort((left, right) => left.path.localeCompare(right.path) || (left.line ?? 0) - (right.line ?? 0));
  const findingFiles = files.filter((file) => file.status === 'examined-finding').length;
  const examinedCleanFiles = files.filter((file) => file.status === 'examined-clean').length;
  return {
    ruleId: 'D6',
    claim: 'two-exact-shell-signatures-only',
    registration: 'export-only',
    findings,
    abstentions,
    files,
    coverage: {
      examinedFiles: findingFiles + examinedCleanFiles,
      examinedCleanFiles,
      findingFiles,
      ambiguousAbstentionFiles: files.filter((file) => file.status === 'abstained-ambiguous').length,
      nonCoverageFiles: files.filter((file) => file.status === 'abstained-non-coverage').length,
    },
    certificateWording: certificateWording(files),
  };
}

/**
 * Inspect only D6.a and D6.g exact shell signatures. Unsupported files are recorded as explicit
 * non-coverage abstentions; deliberately advisory shell controls are recorded separately from
 * examined-and-clean files.
 */
export function inspectUnobservedControls(
  repoRoot: string,
  repoFiles: readonly string[],
): D6Inspection {
  const analyses = repoFiles.map((path) => analyzeFile(repoRoot, path));
  const findings = analyses
    .flatMap((analysis) => analysis.candidates)
    .sort(candidateOrder)
    .map(({ commitSearchText: _commitSearchText, ...finding }) => finding);
  return inspectionFromAnalyses(analyses, findings);
}

/** Finding-only convenience projection. It must not be interpreted as a coverage claim. */
export function detectUnobservedControls(repoRoot: string, repoFiles: readonly string[]): D6Finding[] {
  return [...inspectUnobservedControls(repoRoot, repoFiles).findings];
}

function introducedCommit(repoRoot: string, path: string, searchText: string): string | undefined {
  const result = execGit(['log', '--reverse', '--format=%H', `-S${searchText}`, '--', path], {
    cwd: repoRoot,
  });
  if (!result.ok) return undefined;
  const commit = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^[0-9a-f]{40}$/i.test(line));
  return commit;
}

/**
 * Scan the tracked-first repository boundary. Findings require an oldest introducing commit; an
 * unavailable anchor is recorded as abstention instead of silently broadening the claim. No author
 * name, email, or handle is read or emitted.
 */
export function scanUnobservedControls(repoRoot: string): D6Inspection {
  const analyses = listCejelLlmPackFiles(repoRoot).map((path) => analyzeFile(repoRoot, path));
  const findings: D6Finding[] = [];
  const anchorAbstentions: D6Abstention[] = [];
  for (const candidate of analyses.flatMap((analysis) => analysis.candidates).sort(candidateOrder)) {
    const commit = introducedCommit(
      repoRoot,
      candidate.evidence.path,
      candidate.commitSearchText,
    );
    const { commitSearchText: _commitSearchText, ...finding } = candidate;
    if (commit) {
      findings.push({ ...finding, introducedCommit: commit });
    } else {
      anchorAbstentions.push({
        ruleId: 'D6',
        kind: 'anchor-unavailable',
        path: finding.evidence.path,
        line: finding.evidence.line,
        reason: 'Git could not establish the oldest introducing commit for this exact signature',
      });
    }
  }
  return inspectionFromAnalyses(analyses, findings, anchorAbstentions);
}
