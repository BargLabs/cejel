#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ALFRED = {
  slug: 'BargLabs/alfred',
  localPath: '/Users/bargs/projects/alfred',
  tip: '76a631be63cf1be2cd4d9c6b303626a7124864c4',
};

const REPLAYS = [
  {
    fixSha: 'f644be09bc0e49cb99199b7534b36e5fd2733917',
    namedJob: 'Orchestrator preflight',
    kind: 'command',
    command: ['./scripts/orchestrator_preflight.sh'],
  },
  {
    fixSha: '5978eeddafb247b8f81238331fd8ae1adb55fc30',
    namedJob: 'ci-full',
    kind: 'command',
    command: ['pnpm', '--filter', '@alfred/web', 'test'],
  },
  {
    fixSha: '26f235ab0f4c3f7003228601931e509a29f9fea4',
    namedJob: 'ci-full',
    kind: 'command',
    command: ['pnpm', '--filter', '@alfred/web', 'typecheck'],
  },
  {
    fixSha: 'bf53ee8ad45a3e0e17f41c93950e4d678fe304f4',
    namedJob: 'Build + run SEA binary',
    kind: 'workflow-shell',
    workflow: '.github/workflows/witan-onprem-sea-smoke.yml',
    workflowJob: 'sea-smoke',
  },
  {
    fixSha: 'cae732ea8d398bcbc692cd960d001e0ffd38fb86',
    namedJob: 'Build + run SEA binary',
    kind: 'workflow-shell',
    workflow: '.github/workflows/witan-onprem-sea-smoke.yml',
    workflowJob: 'sea-smoke',
  },
];

function runProcess(command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    input: options.input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: options.timeout ?? 20 * 60_000,
  });
  return {
    ok: result.status === 0 && !result.error,
    exitCode: result.status,
    signal: result.signal,
    durationMs: Date.now() - started,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    errorCode: result.error?.code ?? null,
  };
}

function git(cwd, args, options = {}) {
  return runProcess('git', args, { cwd, ...options });
}

function must(result, label) {
  if (!result.ok) throw new Error(`${label} failed (exit=${result.exitCode ?? 'none'}, signal=${result.signal ?? 'none'}, error=${result.errorCode ?? 'none'})`);
  return result;
}

function cleanEnvironment(tempRoot) {
  const env = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: path.join(tempRoot, 'home'),
    TMPDIR: path.join(tempRoot, 'tmp'),
    CI: 'true',
    NO_COLOR: '1',
    PNPM_HOME: path.join(tempRoot, 'pnpm-home'),
    PNPM_STORE_DIR: '/Users/bargs/Library/pnpm/store/v11',
    DOCKER_CONFIG: path.join(tempRoot, 'docker-config'),
  };
  for (const directory of [env.HOME, env.TMPDIR, env.PNPM_HOME, env.DOCKER_CONFIG]) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return env;
}

function parseWorkflowShellSteps(text, jobId) {
  const lines = text.split('\n');
  const jobStart = lines.findIndex((line) => line === `  ${jobId}:`);
  if (jobStart < 0) throw new Error(`workflow job not found: ${jobId}`);
  let jobEnd = lines.length;
  for (let index = jobStart + 1; index < lines.length; index++) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[index])) { jobEnd = index; break; }
  }
  const steps = [];
  let name = '';
  for (let index = jobStart + 1; index < jobEnd; index++) {
    const nameMatch = lines[index].match(/^      - name:\s*(.+?)\s*$/);
    if (nameMatch) { name = nameMatch[1]; continue; }
    const runMatch = lines[index].match(/^        run:\s*(.*)$/);
    if (!runMatch) continue;
    const inline = runMatch[1].trim();
    if (inline && !['|', '>-', '>'].includes(inline)) {
      steps.push({ name, shell: inline });
      continue;
    }
    const body = [];
    for (index += 1; index < jobEnd; index++) {
      if (/^      - /.test(lines[index])) { index -= 1; break; }
      body.push(lines[index].startsWith('          ') ? lines[index].slice(10) : lines[index].trimStart());
    }
    steps.push({ name, shell: body.join('\n').trimEnd() });
  }
  return steps;
}

function loadGithubEnv(file, env) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, '', { mode: 0o600 });
  for (const line of text.split('\n')) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }
}

function runWorkflowShellSteps({ cwd, env, workflow, workflowJob }) {
  const steps = parseWorkflowShellSteps(fs.readFileSync(path.join(cwd, workflow), 'utf8'), workflowJob);
  const executable = steps.filter((step) => !/^Install dependencies$/i.test(step.name));
  const githubEnv = path.join(env.TMPDIR, 'github-env');
  fs.writeFileSync(githubEnv, '', { mode: 0o600 });
  const stepEnv = {
    ...env,
    GITHUB_ENV: githubEnv,
    GITHUB_RUN_ID: 'stratum-b',
    GITHUB_WORKSPACE: cwd,
    WITAN_CUSTOMER_ID: 'ci-demo',
    WITAN_BUILD_ID: 'ci-stratum-b',
  };
  const substitutions = [
    [/\$\{\{\s*github\.run_id\s*\}\}/g, 'stratum-b'],
    [/\$\{\{\s*github\.workspace\s*\}\}/g, cwd],
  ];
  const started = Date.now();
  for (const step of executable) {
    let shell = step.shell;
    for (const [pattern, replacement] of substitutions) shell = shell.replace(pattern, replacement);
    const result = runProcess('bash', ['-euo', 'pipefail', '-c', shell], { cwd, env: stepEnv });
    if (!result.ok) return { ...result, durationMs: Date.now() - started, failedStep: step.name };
    loadGithubEnv(githubEnv, stepEnv);
  }
  return { ok: true, exitCode: 0, signal: null, durationMs: Date.now() - started, failedStep: null };
}

function executeReplay(replay, cwd, env) {
  if (replay.kind === 'command') {
    const [command, ...args] = replay.command;
    const result = runProcess(command, args, { cwd, env });
    return { ok: result.ok, exitCode: result.exitCode, signal: result.signal, durationMs: result.durationMs, failedStep: replay.namedJob };
  }
  return runWorkflowShellSteps({ cwd, env, workflow: replay.workflow, workflowJob: replay.workflowJob });
}

function patchFor(cwd, candidate) {
  const result = git(cwd, ['diff', '--binary', '--full-index', candidate.parentSha, candidate.fixSha, '--', ...candidate.eligibleFiles]);
  must(result, 'build configuration patch');
  return result.stdout;
}

function reversePatch(cwd, patch) {
  let result = git(cwd, ['apply', '--reverse', '--whitespace=nowarn', '-'], { input: patch });
  if (result.ok) return { applied: true, mode: 'direct' };
  result = git(cwd, ['apply', '--reverse', '--3way', '--whitespace=nowarn', '-'], { input: patch });
  return { applied: result.ok, mode: result.ok ? 'three-way' : null };
}

async function run(extractionPath, outputPath, requestedFixes = []) {
  const extraction = JSON.parse(fs.readFileSync(extractionPath, 'utf8'));
  const bySha = new Map(extraction.candidates.filter((candidate) => !candidate.duplicateOf).map((candidate) => [candidate.fixSha, candidate]));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stratum-b-oracle-'));
  fs.chmodSync(tempRoot, 0o700);
  const clone = path.join(tempRoot, 'alfred');
  const env = cleanEnvironment(tempRoot);
  try {
    must(runProcess('git', ['clone', '--shared', '--no-checkout', ALFRED.localPath, clone], { cwd: tempRoot, env }), 'scratch clone');
    must(git(clone, ['checkout', '--detach', ALFRED.tip], { env }), 'checkout frozen tip');
    const install = runProcess('pnpm', ['install', '--frozen-lockfile', '--store-dir', env.PNPM_STORE_DIR], { cwd: clone, env, timeout: 30 * 60_000 });
    if (!install.ok) throw new Error(`frozen-lockfile install failed (exit=${install.exitCode ?? 'none'}, signal=${install.signal ?? 'none'})`);
    const results = [];
    const selectedReplays = requestedFixes.length
      ? REPLAYS.filter((replay) => requestedFixes.some((fix) => replay.fixSha.startsWith(fix)))
      : REPLAYS;
    if (selectedReplays.length === 0) throw new Error('no replay candidates selected');
    for (const replay of selectedReplays) {
      const candidate = bySha.get(replay.fixSha);
      if (!candidate) throw new Error(`candidate missing from extraction: ${replay.fixSha}`);
      process.stderr.write(`replay ${replay.fixSha.slice(0, 8)} fixed\n`);
      const fixed = executeReplay(replay, clone, env);
      const patch = patchFor(clone, candidate);
      const application = reversePatch(clone, patch);
      let reversed = null;
      let restored = null;
      if (fixed.ok && application.applied) {
        process.stderr.write(`replay ${replay.fixSha.slice(0, 8)} reversed\n`);
        reversed = executeReplay(replay, clone, env);
        must(git(clone, ['restore', '--source=HEAD', '--worktree', '--', ...candidate.eligibleFiles], { env }), 'restore fixed configuration');
        process.stderr.write(`replay ${replay.fixSha.slice(0, 8)} restored\n`);
        restored = executeReplay(replay, clone, env);
      } else {
        git(clone, ['restore', '--source=HEAD', '--worktree', '--', ...candidate.eligibleFiles], { env });
      }
      results.push({
        repo: candidate.repo,
        fixSha: candidate.fixSha,
        parentSha: candidate.parentSha,
        namedJob: replay.namedJob,
        safeCommand: replay.kind === 'command' ? replay.command.join(' ') : `workflow-shell:${replay.workflow}#${replay.workflowJob}`,
        patchApplied: application.applied,
        patchMode: application.mode,
        fixed: fixed ? { ok: fixed.ok, exitCode: fixed.exitCode, signal: fixed.signal, durationMs: fixed.durationMs, failedStep: fixed.failedStep } : null,
        reversed: reversed ? { ok: reversed.ok, exitCode: reversed.exitCode, signal: reversed.signal, durationMs: reversed.durationMs, failedStep: reversed.failedStep } : null,
        restored: restored ? { ok: restored.ok, exitCode: restored.exitCode, signal: restored.signal, durationMs: restored.durationMs, failedStep: restored.failedStep } : null,
        qualifiesMechanical: Boolean(fixed?.ok && application.applied && reversed && !reversed.ok && restored?.ok),
      });
    }
    const output = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      frozenTip: ALFRED.tip,
      install: { ok: true, mode: 'public-registry-frozen-lockfile', productionCredentialsInherited: false },
      results,
    };
    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(output, null, 2));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export { parseWorkflowShellSteps };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run(
    process.argv[2] ?? '/tmp/stratum-b-primary.json',
    process.argv[3] ?? '/tmp/stratum-b-oracle.json',
    process.argv.slice(4),
  );
}
