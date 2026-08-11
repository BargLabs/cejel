import { existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';

import { readRepoText } from '../../witan/content-reads.js';
import { execGit } from '../../witan/git-exec.js';

import { listCejelLlmPackFiles } from '../llm/files.js';

export type D6Mechanism = 'exit-status-discarded' | 'report-independent-of-operation';

export interface D6Finding {
  readonly ruleId: 'D6';
  readonly mechanism: D6Mechanism;
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

interface Candidate extends D6Finding {
  readonly commitSearchText: string;
}

const SHELL_EXTENSIONS = new Set(['.sh', '.bash']);
const CONTROL_NAME = /(?:guard|check|verify|validat|audit|integrity|test)/i;
const OPERATION_NAME = /^(?:rm|remove|delete|destroy|drop|purge|reap|apply|deploy|publish|release)/i;
const SUCCESS_REPORT = /\b(?:removed|verified|succeeded|success|completed|passed|published|deployed)\b/i;

function shellCommandName(line: string): string | null {
  const match =
    /^\s*(?:command\s+)?((?:[A-Za-z_][A-Za-z0-9_-]*|(?:\.\/)?[A-Za-z0-9_./-]+))(?=\s|[;|&]|$)/.exec(
      line,
    );
  if (!match?.[1] || match[1].startsWith('#')) return null;
  const command = match[1].split('/').at(-1)?.replace(/\.(?:sh|bash)$/i, '');
  return command ?? null;
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

function exitStatusCandidates(path: string, lines: readonly string[]): Candidate[] {
  const findings: Candidate[] = [];
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
    const command = shellCommandName(line) ?? 'control';
    findings.push({
      ruleId: 'D6',
      mechanism: 'exit-status-discarded',
      severity: 'warning',
      confidence: 'high',
      summary: `The exit status of ${JSON.stringify(command)} is discarded before a success report; the report provides no evidence that this control result affected the outcome.`,
      evidence: {
        path,
        line: lineOf(index),
        label: `Discarded control exit status ${command}`,
      },
      commitSearchText: line.trim(),
    });
  }
  return findings;
}

function reportIndependentCandidates(path: string, lines: readonly string[]): Candidate[] {
  const findings: Candidate[] = [];
  const errexit = hasErrexit(lines);
  for (let index = 0; index + 2 < lines.length; index += 1) {
    const operation = lines[index];
    const report = lines[index + 1];
    const returnStatement = lines[index + 2];
    if (!operation || !report || !returnStatement) continue;
    const command = shellCommandName(operation);
    if (
      command === null ||
      errexit ||
      !OPERATION_NAME.test(command) ||
      /^\s*(?:if|while|until)\b/.test(operation) ||
      !/^\s*echo\s+/.test(report) ||
      !SUCCESS_REPORT.test(report) ||
      !/^\s*return\s+0(?:\s*(?:#.*)?)?$/.test(returnStatement)
    ) {
      continue;
    }
    findings.push({
      ruleId: 'D6',
      mechanism: 'report-independent-of-operation',
      severity: 'warning',
      confidence: 'high',
      summary: `The exit status of ${JSON.stringify(command)} cannot affect the following success report or return value; that report provides no evidence that the operation result affected the outcome.`,
      evidence: {
        path,
        line: lineOf(index + 1),
        label: `Success report independent of ${command}`,
      },
      commitSearchText: report.trim(),
    });
  }
  return findings;
}

function candidatesForFile(repoRoot: string, path: string): Candidate[] {
  if (!SHELL_EXTENSIONS.has(extname(path).toLowerCase())) return [];
  const absolute = resolve(repoRoot, path);
  if (!existsSync(absolute)) return [];
  const lines = readRepoText(absolute).split(/\r?\n/);
  return [...exitStatusCandidates(path, lines), ...reportIndependentCandidates(path, lines)];
}

/**
 * Detect only D6.a and D6.g exact shell signatures. A result states an evidentiary limitation,
 * never whether the control ran or whether the property it checked holds.
 */
export function detectUnobservedControls(repoRoot: string, repoFiles: readonly string[]): D6Finding[] {
  return repoFiles
    .flatMap((path) => candidatesForFile(repoRoot, path))
    .sort(
      (left, right) =>
        left.evidence.path.localeCompare(right.evidence.path) ||
        left.evidence.line - right.evidence.line ||
        left.mechanism.localeCompare(right.mechanism),
    )
    .map(({ commitSearchText: _commitSearchText, ...finding }) => finding);
}

function introducedCommit(repoRoot: string, path: string, searchText: string): string | undefined {
  const result = execGit(['log', '-1', '--format=%H', `-S${searchText}`, '--', path], {
    cwd: repoRoot,
  });
  if (!result.ok) return undefined;
  const commit = result.stdout.trim();
  return /^[0-9a-f]{40}$/i.test(commit) ? commit : undefined;
}

/**
 * Scan the tracked-first repository boundary and report only findings whose introducing commit Git
 * can establish. No author name, email, or handle is read or emitted.
 */
export function scanUnobservedControls(repoRoot: string): D6Finding[] {
  return listCejelLlmPackFiles(repoRoot)
    .flatMap((path) => candidatesForFile(repoRoot, path))
    .sort(
      (left, right) =>
        left.evidence.path.localeCompare(right.evidence.path) ||
        left.evidence.line - right.evidence.line ||
        left.mechanism.localeCompare(right.mechanism),
    )
    .flatMap(({ commitSearchText, ...finding }) => {
      const commit = introducedCommit(repoRoot, finding.evidence.path, commitSearchText);
      return commit ? [{ ...finding, introducedCommit: commit }] : [];
    });
}
