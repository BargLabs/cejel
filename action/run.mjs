#!/usr/bin/env node
// GitHub Action entrypoint for the Cejel Trust Check composite action. Runs the offline
// scoring CLI, then reports the result to the job (step summary + outputs) and applies
// the optional min-score gate.
//
// Deliberately cwd-agnostic: action.yml invokes this with cwd left at the CALLING
// workflow's default working directory (the repo being scored), not at the alfred
// monorepo checkout — so repo-path and the write-only artifact export destination resolve
// against process.cwd() as-is, while the CLI's own dist/index.js (part of this action's
// source, wherever it happens to be checked out) is located relative to this file.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cliEntry = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const CEJEL_ARTIFACT_NAMES = new Set([
  'attestation.json',
  'badge.json',
  'badge.svg',
  'certificate.html',
  'report.json',
  'summary.json',
]);

function renderMarkdownInline(value) {
  return String(value)
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/([\\`*_[\]<>|#])/g, '\\$1');
}

export function renderStepSummary(s) {
  const abstained = s.verdict === 'Insufficient source' || s.verdict === 'Insufficient evidence';
  const limitationLines =
    Array.isArray(s.scanLimitations) && s.scanLimitations.length > 0
      ? [
          '### LIMITED EVIDENCE',
          '',
          'The score and verdict are qualified by scan limitations:',
          '',
          ...s.scanLimitations.map((limitation) => `- ${renderMarkdownInline(limitation)}`),
          '',
        ]
      : [];
  if (abstained) {
    return `${[
      `## Cejel trust check — ${renderMarkdownInline(s.productDisplayName)}`,
      '',
      `**${renderMarkdownInline(s.verdict)} to certify.**`,
      '',
      renderMarkdownInline(
        s.insufficientSourceReason ?? 'No ratable source or measurable evidence was found.',
      ),
      '',
      ...limitationLines,
    ].join('\n')}\n`;
  }
  if (
    typeof s.overallScore !== 'number' ||
    typeof s.codeTrustScore !== 'number' ||
    typeof s.processTrustScore !== 'number'
  ) {
    throw new Error('A scored Cejel Action summary must carry numeric headline scores.');
  }
  const lines = [
    `## Cejel trust check — ${renderMarkdownInline(s.productDisplayName)}`,
    '',
    `**Overall: ${s.overallScore.toFixed(1)}/4.0 (${renderMarkdownInline(s.verdict)})**`,
    '',
    '| Code trust | Process trust |',
    '|---|---|',
    `| ${s.codeTrustScore.toFixed(1)}/4.0 | ${s.processTrustScore.toFixed(1)}/4.0 |`,
    '',
    ...limitationLines,
  ];
  if (s.topFindings.length === 0) {
    lines.push('No evidence-backed findings.');
  } else {
    lines.push(
      `### Top findings (${s.findingCount} total; labels distinguish finding severity from dimension band)`,
      '',
    );
    for (const finding of s.topFindings) {
      lines.push(
        `- **[finding severity: ${renderMarkdownInline(finding.severity)}]** ${renderMarkdownInline(finding.criterionId)} **[dimension band: ${renderMarkdownInline(finding.dimensionBand)}]**: ${renderMarkdownInline(finding.displaySummary ?? finding.summary)}`,
      );
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function isInside(candidate, directory) {
  const relativePath = relative(directory, candidate);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function createActionOutputDirectory(repoPath) {
  const tempRoot = resolve(process.env.RUNNER_TEMP?.trim() || tmpdir());
  mkdirSync(tempRoot, { recursive: true });
  const outDir = mkdtempSync(join(tempRoot, 'cejel-action-'));
  if (isInside(outDir, resolve(repoPath))) {
    throw new Error('Cejel: refusing an Action output directory inside the repository tree.');
  }
  if (readdirSync(outDir).length !== 0) {
    throw new Error('Cejel: refusing a pre-populated Action output directory.');
  }
  return outDir;
}

function exportCurrentRun(outDir, exportDir) {
  if (existsSync(exportDir)) {
    const destination = lstatSync(exportDir);
    if (!destination.isDirectory() || destination.isSymbolicLink()) {
      throw new Error('Cejel: refusing a non-directory or symlinked Action artifact destination.');
    }
  } else {
    mkdirSync(exportDir, { recursive: true });
  }

  let backupDirectory;
  for (const entry of readdirSync(outDir)) {
    if (!CEJEL_ARTIFACT_NAMES.has(entry)) {
      throw new Error(`Cejel: refusing to export an unexpected Action artifact: ${entry}`);
    }
    const destination = join(exportDir, entry);
    if (existsSync(destination)) {
      const existing = lstatSync(destination);
      if (!existing.isFile() || existing.isSymbolicLink()) {
        throw new Error(`Cejel: refusing to replace a non-regular Action artifact: ${entry}`);
      }
      const backupRoot = join(exportDir, '.previous-cejel-runs');
      if (existsSync(backupRoot)) {
        const backupRootStat = lstatSync(backupRoot);
        if (!backupRootStat.isDirectory() || backupRootStat.isSymbolicLink()) {
          throw new Error('Cejel: refusing a non-directory or symlinked Action backup root.');
        }
      }
      backupDirectory ??= join(backupRoot, randomUUID());
      mkdirSync(backupDirectory, { recursive: true });
      renameSync(destination, join(backupDirectory, entry));
    }
    cpSync(join(outDir, entry), destination, {
      errorOnExist: true,
      force: false,
      recursive: true,
    });
  }
}

function renderMultilineOutput(name, value) {
  const rendered = String(value);
  let delimiter;
  do {
    delimiter = `cejel_${randomUUID()}`;
  } while (rendered.split('\n').includes(delimiter));
  return `${name}<<${delimiter}\n${rendered}\n${delimiter}\n`;
}

export function renderActionOutputs(summary, artifactDir = '') {
  const limitations = Array.isArray(summary.scanLimitations) ? summary.scanLimitations : [];
  return [
    ['score', typeof summary.overallScore === 'number' ? summary.overallScore.toFixed(1) : ''],
    ['verdict', summary.verdict],
    ['limited', limitations.length > 0 ? 'true' : 'false'],
    ['limitation-count', limitations.length],
    ['limitations', JSON.stringify(limitations)],
    ['artifact-dir', artifactDir],
  ]
    .map(([name, value]) => renderMultilineOutput(name, value))
    .join('');
}

export function main() {
  // repo-path's action.yml default is '' (action.yml can't evaluate `${{ github.workspace }}`
  // in an input default — only step-level contexts support expressions), so fall back to the
  // real GITHUB_WORKSPACE env var, which every GitHub-hosted runner sets.
  const repoPath =
    process.env.WITAN_REPO_PATH?.trim() || process.env.GITHUB_WORKSPACE?.trim() || process.cwd();
  const minScoreRaw = process.env.WITAN_MIN_SCORE?.trim();
  const exportDir = resolve(process.env.WITAN_EXPORT_DIR?.trim() || '.cejel');
  let outDir;
  try {
    outDir = createActionOutputDirectory(repoPath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  try {
    // The --min-score bound (0-4) is validated exactly once, inside the CLI's own parseArgs —
    // forward the raw value and let that be the only place the rule lives, rather than
    // re-deriving the gate here from summary.json after the fact.
    const cliArgs = [cliEntry, resolve(repoPath), '--out-dir', outDir];
    if (minScoreRaw) cliArgs.push('--min-score', minScoreRaw);

    let cliFailed = false;
    try {
      execFileSync('node', cliArgs, { stdio: 'inherit' });
    } catch {
      // The CLI already printed its own error (invalid flag, or overallScore below
      // --min-score) and set a non-zero exit code — surface that, but still try to report
      // whatever summary.json it managed to write.
      cliFailed = true;
    }

    const summaryPath = join(outDir, 'summary.json');
    if (!existsSync(summaryPath)) {
      console.error('Cejel: run failed before producing a report (see output above).');
      process.exitCode = 1;
      return;
    }

    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));

    try {
      exportCurrentRun(outDir, exportDir);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
      return;
    }

    const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (stepSummaryPath) {
      appendFileSync(stepSummaryPath, renderStepSummary(summary));
    }

    const outputPath = process.env.GITHUB_OUTPUT;
    if (outputPath) {
      appendFileSync(outputPath, renderActionOutputs(summary, exportDir));
    }

    if (cliFailed) process.exitCode = 1;
  } finally {
    rmSync(outDir, { force: true, recursive: true });
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main();
}
