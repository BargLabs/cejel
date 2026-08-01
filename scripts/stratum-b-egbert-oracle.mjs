#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const EGBERT = {
  localPath: '/Users/bargs/projects/egbert',
  tip: 'b8346c235a9607c0efff31af6bb44a25ee4d16bb',
};

const REPLAYS = [
  {
    fixSha: 'd52b82777311501f20a9cafc253825ed78bffc87',
    namedJob: 'Deploy core to Vultr',
    kind: 'bundle-from-checkout',
    workflow: '.github/workflows/deploy-egbert.yml',
    stepName: 'Build tested git bundle',
  },
  {
    fixSha: '8e6e7951eed2a088c24bbb614b1900448773c15d',
    namedJob: 'Check changed paths',
    kind: 'large-path-list',
    workflow: '.github/workflows/deploy-cockpit.yml',
    stepName: 'Detect relevant changes',
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
    timeout: options.timeout ?? 5 * 60_000,
  });
  return {
    ok: result.status === 0 && !result.error,
    exitCode: result.status,
    signal: result.signal,
    durationMs: Date.now() - started,
    errorCode: result.error?.code ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function must(result, label) {
  if (!result.ok) {
    throw new Error(`${label} failed (exit=${result.exitCode ?? 'none'}, signal=${result.signal ?? 'none'}, error=${result.errorCode ?? 'none'})`);
  }
  return result;
}

function git(cwd, args, options = {}) {
  return runProcess('git', args, { cwd, ...options });
}

function cleanEnvironment(root) {
  const env = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: path.join(root, 'home'),
    TMPDIR: path.join(root, 'tmp'),
    CI: 'true',
    NO_COLOR: '1',
  };
  fs.mkdirSync(env.HOME, { recursive: true, mode: 0o700 });
  fs.mkdirSync(env.TMPDIR, { recursive: true, mode: 0o700 });
  return env;
}

function workflowStep(text, stepName) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === `- name: ${stepName}`);
  if (start < 0) throw new Error(`workflow step not found: ${stepName}`);
  const run = lines.findIndex((line, index) => index > start && /^\s{8}run:\s*[|>]?-?\s*$/.test(line));
  if (run < 0) throw new Error(`workflow run block not found: ${stepName}`);
  const body = [];
  for (let index = run + 1; index < lines.length; index++) {
    if (lines[index].trim() && !lines[index].startsWith('          ')) break;
    body.push(lines[index].startsWith('          ') ? lines[index].slice(10) : '');
  }
  return body.join('\n').trimEnd();
}

function patchFor(cwd, candidate) {
  const result = git(cwd, ['diff', '--binary', '--full-index', candidate.parentSha, candidate.fixSha, '--', ...candidate.eligibleFiles]);
  must(result, 'build configuration patch');
  const raw = spawnSync('git', ['-C', cwd, 'diff', '--binary', '--full-index', candidate.parentSha, candidate.fixSha, '--', ...candidate.eligibleFiles], {
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (raw.status !== 0) throw new Error('binary patch extraction failed');
  return raw.stdout;
}

function reversePatch(cwd, patch) {
  let result = spawnSync('git', ['-C', cwd, 'apply', '--reverse', '--whitespace=nowarn', '-'], { input: patch });
  if (result.status === 0) return { applied: true, mode: 'direct' };
  result = spawnSync('git', ['-C', cwd, 'apply', '--reverse', '--3way', '--whitespace=nowarn', '-'], { input: patch });
  return { applied: result.status === 0, mode: result.status === 0 ? 'three-way' : null };
}

function restoreFiles(cwd, files) {
  must(git(cwd, ['restore', '--staged', '--worktree', '--source=HEAD', '--', ...files]), 'restore fixed configuration');
}

function executeBundleReplay({ configCwd, workflow, stepName, root, env }) {
  const text = fs.readFileSync(path.join(configCwd, workflow), 'utf8');
  const shell = workflowStep(text, stepName)
    .replaceAll('${{ github.event.workflow_run.head_sha || github.sha }}', EGBERT.tip)
    .replaceAll('/tmp/egbert-deploy.bundle', path.join(root, 'egbert-deploy.bundle'));
  const fullCheckout = /fetch-depth:\s*0/.test(text.slice(0, text.indexOf(`- name: ${stepName}`)));
  const checkout = fs.mkdtempSync(path.join(root, 'checkout-'));
  const cloneArgs = fullCheckout
    ? ['clone', '--shared', '--no-checkout', EGBERT.localPath, checkout]
    : ['clone', '--depth', '1', '--no-checkout', `file://${EGBERT.localPath}`, checkout];
  must(runProcess('git', cloneArgs, { cwd: root, env }), 'fixture checkout');
  must(git(checkout, ['checkout', '--detach', EGBERT.tip], { env }), 'fixture tip checkout');
  const result = runProcess('bash', ['-euo', 'pipefail', '-c', shell], { cwd: checkout, env });
  fs.rmSync(checkout, { recursive: true, force: true });
  fs.rmSync(path.join(root, 'egbert-deploy.bundle'), { force: true });
  return result;
}

function writeGitStub(bin) {
  const stub = `#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  "rev-parse HEAD") echo "${EGBERT.tip}" ;;
  "rev-parse --verify refs/tags/_deploy/cockpit") exit 1 ;;
  "rev-parse HEAD~1") echo "1111111111111111111111111111111111111111" ;;
  "diff --name-only 1111111111111111111111111111111111111111 HEAD")
    i=0
    while [[ "$i" -lt 20000 ]]; do
      printf 'egbert-ui/generated-%05d.ts\\n' "$i"
      i=$((i + 1))
    done
    ;;
  *) exit 0 ;;
esac
`;
  const file = path.join(bin, 'git');
  fs.writeFileSync(file, stub, { mode: 0o700 });
}

function executeLargePathReplay({ configCwd, workflow, stepName, root, env }) {
  const text = fs.readFileSync(path.join(configCwd, workflow), 'utf8');
  const shell = workflowStep(text, stepName);
  const fixture = fs.mkdtempSync(path.join(root, 'paths-'));
  const bin = path.join(fixture, 'bin');
  fs.mkdirSync(bin, { mode: 0o700 });
  writeGitStub(bin);
  const githubOutput = path.join(fixture, 'github-output');
  fs.writeFileSync(githubOutput, '', { mode: 0o600 });
  const result = runProcess('bash', ['-euo', 'pipefail', '-c', shell], {
    cwd: fixture,
    env: {
      ...env,
      PATH: `${bin}:${env.PATH}`,
      EVENT_NAME: 'workflow_run',
      HEAD_SHA: EGBERT.tip,
      GITHUB_OUTPUT: githubOutput,
    },
  });
  fs.rmSync(fixture, { recursive: true, force: true });
  return result;
}

function executeReplay(replay, context) {
  if (replay.kind === 'bundle-from-checkout') return executeBundleReplay({ ...context, ...replay });
  if (replay.kind === 'large-path-list') return executeLargePathReplay({ ...context, ...replay });
  throw new Error(`unsupported replay kind: ${replay.kind}`);
}

function publicResult(result) {
  return {
    ok: result.ok,
    exitCode: result.exitCode,
    signal: result.signal,
    durationMs: result.durationMs,
    errorCode: result.errorCode,
  };
}

function run(extractionPath, outputPath) {
  const extraction = JSON.parse(fs.readFileSync(extractionPath, 'utf8'));
  const candidates = new Map(extraction.candidates.map((candidate) => [candidate.fixSha, candidate]));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stratum-b-egbert-oracle-'));
  fs.chmodSync(root, 0o700);
  const configCwd = path.join(root, 'config');
  const env = cleanEnvironment(root);
  try {
    must(runProcess('git', ['clone', '--shared', '--no-checkout', EGBERT.localPath, configCwd], { cwd: root, env }), 'scratch clone');
    must(git(configCwd, ['checkout', '--detach', EGBERT.tip], { env }), 'checkout frozen tip');
    const results = [];
    for (const replay of REPLAYS) {
      const candidate = candidates.get(replay.fixSha);
      if (!candidate) throw new Error(`candidate missing from extraction: ${replay.fixSha}`);
      const fixed = executeReplay(replay, { configCwd, root, env });
      if (!fixed.ok) process.stderr.write(`fixed replay ${replay.fixSha.slice(0, 8)}: ${fixed.stderr.slice(0, 1000)}\n`);
      const patch = patchFor(configCwd, candidate);
      const application = reversePatch(configCwd, patch);
      let reversed = null;
      let restored = null;
      if (fixed.ok && application.applied) {
        reversed = executeReplay(replay, { configCwd, root, env });
        restoreFiles(configCwd, candidate.eligibleFiles);
        restored = executeReplay(replay, { configCwd, root, env });
      } else {
        restoreFiles(configCwd, candidate.eligibleFiles);
      }
      results.push({
        repo: candidate.repo,
        fixSha: candidate.fixSha,
        parentSha: candidate.parentSha,
        namedJob: replay.namedJob,
        safeReplay: replay.kind,
        patchApplied: application.applied,
        patchMode: application.mode,
        fixed: publicResult(fixed),
        reversed: reversed ? publicResult(reversed) : null,
        restored: restored ? publicResult(restored) : null,
        qualifiesMechanical: Boolean(fixed.ok && application.applied && reversed && !reversed.ok && restored?.ok),
      });
    }
    const output = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      frozenTip: EGBERT.tip,
      productionCredentialsInherited: false,
      results,
    };
    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(output, null, 2));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run(process.argv[2] ?? '/tmp/stratum-b-egbert.json', process.argv[3] ?? '/tmp/stratum-b-egbert-oracle.json');
