#!/usr/bin/env node
// GitHub Action entrypoint for the Cejel Trust Check composite action. Runs the offline
// scoring CLI, then reports the result to the job (step summary + outputs) and applies
// the optional min-score gate.
//
// Deliberately cwd-agnostic: action.yml invokes this with cwd left at the CALLING
// workflow's default working directory (the repo being scored), not at the alfred
// monorepo checkout — so repo-path/out-dir must resolve against process.cwd() as-is,
// while the CLI's own dist/index.js (part of this action's source, wherever it happens
// to be checked out) is located relative to this file, never to cwd.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliEntry = fileURLToPath(new URL('../dist/index.js', import.meta.url));

// repo-path's action.yml default is '' (action.yml can't evaluate `${{ github.workspace }}`
// in an input default — only step-level contexts support expressions), so fall back to the
// real GITHUB_WORKSPACE env var, which every GitHub-hosted runner sets.
const repoPath =
  process.env.WITAN_REPO_PATH?.trim() || process.env.GITHUB_WORKSPACE?.trim() || process.cwd();
const outDir = process.env.WITAN_OUT_DIR?.trim() || '.cejel';
const minScoreRaw = process.env.WITAN_MIN_SCORE?.trim();

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

const summaryPath = resolve(outDir, 'summary.json');
if (!existsSync(summaryPath)) {
  console.error('Cejel: run failed before producing a report (see output above).');
  process.exitCode = 1;
} else {
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));

  const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummaryPath) {
    appendFileSync(stepSummaryPath, renderStepSummary(summary));
  }

  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    appendFileSync(
      outputPath,
      `score=${typeof summary.overallScore === 'number' ? summary.overallScore.toFixed(1) : ''}\n`,
    );
    appendFileSync(outputPath, `verdict=${summary.verdict}\n`);
  }

  if (cliFailed) process.exitCode = 1;
}

function renderStepSummary(s) {
  if (s.verdict === 'Insufficient source') {
    return `${[
      `## Cejel trust check — ${s.productDisplayName}`,
      '',
      '**Insufficient source to certify.**',
      '',
      s.insufficientSourceReason ?? 'No ratable source was found.',
      '',
    ].join('\n')}\n`;
  }
  const lines = [
    `## Cejel trust check — ${s.productDisplayName}`,
    '',
    `**Overall: ${s.overallScore.toFixed(1)}/4.0 (${s.verdict})**`,
    '',
    '| Code trust | Process trust |',
    '|---|---|',
    `| ${s.codeTrustScore.toFixed(1)}/4.0 | ${s.processTrustScore.toFixed(1)}/4.0 |`,
    '',
  ];
  if (s.topFindings.length === 0) {
    lines.push('No evidence-backed findings.');
  } else {
    lines.push(`### Top findings (${s.findingCount} total)`, '');
    for (const finding of s.topFindings) {
      lines.push(`- **[${finding.severity}]** ${finding.criterionId}: ${finding.summary}`);
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
