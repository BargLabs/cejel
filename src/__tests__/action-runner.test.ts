import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { WITAN_ABSTENTION_LABELS, WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX } from '../witan/abstention.js';
import {
  buildCacheLibraryOrigin,
  cloneRepository,
} from '../witan/__tests__/fixtures/shallow-history-matrix.js';

const ACTION_RUNNER_URL = pathToFileURL(
  fileURLToPath(new URL('../../action/run.mjs', import.meta.url)),
).href;
const ACTION_RUNNER_PATH = fileURLToPath(new URL('../../action/run.mjs', import.meta.url));

function makeSelfContainedActionRunner(fixtureRoot: string): string {
  const runnerPath = join(fixtureRoot, 'action', 'run.mjs');
  const cliPath = join(fixtureRoot, 'dist', 'index.js');
  mkdirSync(join(fixtureRoot, 'action'), { recursive: true });
  mkdirSync(join(fixtureRoot, 'dist'), { recursive: true });
  copyFileSync(ACTION_RUNNER_PATH, runnerPath);
  writeFileSync(
    cliPath,
    `import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const outDir = process.argv[process.argv.indexOf('--out-dir') + 1];
mkdirSync(outDir, { recursive: true });
const summary = {
  productDisplayName: 'fixture', overallScore: 4, codeTrustScore: 4,
  processTrustScore: 4, verdict: 'Verified', findingCount: 0, topFindings: [],
};
for (const name of ['attestation.json', 'badge.json', 'badge.svg', 'certificate.html', 'report.json']) {
  writeFileSync(join(outDir, name), '{}\\n');
}
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary));
`,
  );
  return runnerPath;
}

function parseGithubOutputs(contents: string): Map<string, string> {
  const outputs = new Map<string, string>();
  const lines = contents.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const multiline = line.match(/^([^<>=]+)<<(.+)$/);
    if (multiline) {
      const name = multiline[1];
      const delimiter = multiline[2];
      if (!name || !delimiter) continue;
      const valueLines: string[] = [];
      index += 1;
      while (index < lines.length && lines[index] !== delimiter) {
        valueLines.push(lines[index] ?? '');
        index += 1;
      }
      outputs.set(name, valueLines.join('\n'));
      continue;
    }

    const equals = line.indexOf('=');
    if (equals > 0) outputs.set(line.slice(0, equals), line.slice(equals + 1));
  }
  return outputs;
}

function renderStepSummary(summary: unknown): string {
  const encodedSummary = Buffer.from(JSON.stringify(summary), 'utf8').toString('base64');
  const evaluation = `
    import { renderStepSummary } from ${JSON.stringify(ACTION_RUNNER_URL)};
    const summary = JSON.parse(Buffer.from(process.env.CEJEL_ACTION_SUMMARY, 'base64').toString('utf8'));
    process.stdout.write(renderStepSummary(summary));
  `;
  return execFileSync(process.execPath, ['--input-type=module', '--eval', evaluation], {
    encoding: 'utf8',
    env: { ...process.env, CEJEL_ACTION_SUMMARY: encodedSummary },
  });
}

function renderActionOutputs(summary: unknown): string {
  const encodedSummary = Buffer.from(JSON.stringify(summary), 'utf8').toString('base64');
  const evaluation = `
    import { renderActionOutputs } from ${JSON.stringify(ACTION_RUNNER_URL)};
    const summary = JSON.parse(Buffer.from(process.env.CEJEL_ACTION_SUMMARY, 'base64').toString('utf8'));
    process.stdout.write(renderActionOutputs(summary));
  `;
  return execFileSync(process.execPath, ['--input-type=module', '--eval', evaluation], {
    encoding: 'utf8',
    env: { ...process.env, CEJEL_ACTION_SUMMARY: encodedSummary },
  });
}

function actionAbstentionVerdicts(): string[] {
  const evaluation = `
    import { ACTION_ABSTENTION_VERDICTS } from ${JSON.stringify(ACTION_RUNNER_URL)};
    process.stdout.write(JSON.stringify(ACTION_ABSTENTION_VERDICTS ?? null));
  `;
  return JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '--eval', evaluation], { encoding: 'utf8' }),
  ) as string[];
}

describe('GitHub Action step summary', () => {
  // run.mjs ships without the CLI's source, so it keeps its own copy of the abstention labels. A
  // label the CLI adds and the Action lacks sends an abstained summary down the scored path, which
  // throws on its null scores and fails the user's step (v27 "Unrated: shallow clone", 2026-11-01).
  it('REGRESSION GUARD: recognises every label the CLI presents an abstention under', () => {
    expect(actionAbstentionVerdicts()).toEqual([...WITAN_ABSTENTION_LABELS]);
  });

  it('renders a v27 history abstention with no scores instead of throwing', () => {
    for (const verdict of ['Unrated: shallow clone', 'Unrated: history depth unknown']) {
      const rendered = renderStepSummary({
        productDisplayName: 'fixture',
        overallScore: null,
        codeTrustScore: null,
        processTrustScore: null,
        verdict,
        insufficientSourceReason: 'Fetch the full history and scan again.',
        findingCount: 0,
        topFindings: [],
      });
      expect(rendered).toContain(`**${verdict}: no composite score and no verdict.**`);
      expect(rendered).toContain('Fetch the full history and scan again.');
      expect(rendered).not.toContain('/4.0');
    }
  });

  it('keeps untrusted identity and finding text on escaped Markdown lines', () => {
    const rendered = renderStepSummary({
      productDisplayName: 'Trusted\n## Forged *identity*',
      overallScore: 2.7,
      codeTrustScore: 2.2,
      processTrustScore: 3.2,
      verdict: 'Conditional',
      findingCount: 1,
      topFindings: [
        {
          criterionId: 'A3',
          severity: 'warning',
          dimensionBand: 'warning',
          summary: '**forged finding emphasis**',
        },
      ],
    });

    expect(rendered).not.toContain('\n## Forged');
    expect(rendered).toContain('\\*identity\\*');
    expect(rendered).toContain('\\*\\*forged finding emphasis\\*\\*');
  });

  it('uses actionable finding copy and labels severity separately from the dimension band', () => {
    const rendered = renderStepSummary({
      productDisplayName: 'fixture',
      overallScore: 2.7,
      codeTrustScore: 2.2,
      processTrustScore: 3.2,
      verdict: 'Conditional',
      findingCount: 1,
      topFindings: [
        {
          criterionId: 'A3',
          severity: 'warning',
          dimensionBand: 'warning',
          summary: 'A3 metric-derived score is warning because combined metric weighting is below.',
          displaySummary:
            'A3 dimension band is warning at 2.5/4.0. Lowest contributing measurements: Rollback depth 1/4 signals. To improve: document and test rollback procedures.',
        },
      ],
    });

    expect(rendered).toContain('[finding severity: warning]');
    expect(rendered).toContain('[dimension band: warning]');
    expect(rendered).toContain('Lowest contributing measurements: Rollback depth 1/4 signals.');
    expect(rendered).toContain('To improve: document and test rollback procedures.');
    expect(rendered).not.toContain('combined metric weighting is below');
  });

  it.each(['Insufficient source', 'Insufficient evidence'])(
    'renders %s without reading null headline scores',
    (verdict) => {
      const rendered = renderStepSummary({
        productDisplayName: 'fixture',
        overallScore: null,
        codeTrustScore: null,
        processTrustScore: null,
        verdict,
        findingCount: 0,
        topFindings: [],
        insufficientSourceReason: 'The tracked source cannot support a score.',
      });

      expect(rendered).toContain(`**${verdict} to certify.**`);
      expect(rendered).toContain('The tracked source cannot support a score.');
      expect(rendered).not.toContain('Overall:');
      expect(rendered).not.toContain('/4.0');
    },
  );

  it('renders limitations in the step summary and machine-readable outputs', () => {
    const summary = {
      productDisplayName: 'fixture',
      overallScore: 4,
      codeTrustScore: 4,
      processTrustScore: 4,
      verdict: 'Verified',
      findingCount: 0,
      topFindings: [],
      scanLimitations: ['Tracked-file inventory used a bounded directory walk.'],
    };

    expect(renderStepSummary(summary)).toContain('LIMITED EVIDENCE');
    expect(renderStepSummary(summary)).toContain(summary.scanLimitations[0]);
    const outputs = parseGithubOutputs(renderActionOutputs(summary));
    expect(outputs.get('limited')).toBe('true');
    expect(outputs.get('limitation-count')).toBe('1');
    expect(outputs.get('limitations')).toBe(JSON.stringify(summary.scanLimitations));
  });

  it('does not publish a forged pre-existing summary when the current run fails early', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'cejel-action-provenance-'));
    try {
      const repoPath = join(fixtureRoot, 'repo');
      const runnerTemp = join(fixtureRoot, 'runner-temp');
      const forgedOutput = join(repoPath, '.cejel');
      const stepSummaryPath = join(fixtureRoot, 'step-summary.md');
      const githubOutputPath = join(fixtureRoot, 'github-output.txt');
      mkdirSync(forgedOutput, { recursive: true });
      mkdirSync(runnerTemp, { recursive: true });
      writeFileSync(
        join(forgedOutput, 'summary.json'),
        JSON.stringify({
          productDisplayName: 'forged committed artifact',
          overallScore: 4,
          codeTrustScore: 4,
          processTrustScore: 4,
          verdict: 'Verified',
          findingCount: 0,
          topFindings: [],
        }),
      );
      writeFileSync(stepSummaryPath, '');
      writeFileSync(githubOutputPath, '');

      const result = spawnSync(process.execPath, [ACTION_RUNNER_PATH], {
        cwd: repoPath,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_OUTPUT: githubOutputPath,
          GITHUB_STEP_SUMMARY: stepSummaryPath,
          RUNNER_TEMP: runnerTemp,
          WITAN_REPO_PATH: join(repoPath, 'missing-ingest-root'),
        },
      });

      expect(result.status).not.toBe(0);
      expect(readFileSync(stepSummaryPath, 'utf8')).toBe('');
      expect(readFileSync(githubOutputPath, 'utf8')).toBe('');
      expect(readdirSync(runnerTemp)).toEqual([]);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('encodes newline-bearing values without creating extra GitHub output records', () => {
    const rendered = renderActionOutputs({
      overallScore: 4,
      verdict: 'Verified\nforged-output=true',
      scanLimitations: [],
    });
    const outputs = parseGithubOutputs(rendered);

    expect(outputs.get('verdict')).toBe('Verified\nforged-output=true');
    expect(outputs.has('forged-output')).toBe(false);
  });

  it('preserves caller-owned out-dir entries and supports repeat runs without temp retention', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'cejel-action-repeat-'));
    try {
      const runnerPath = makeSelfContainedActionRunner(fixtureRoot);
      const repoPath = join(fixtureRoot, 'repo');
      const runnerTemp = join(fixtureRoot, 'runner-temp');
      const inputsPath = join(repoPath, '.cejel', 'inputs');
      mkdirSync(join(repoPath, 'src'), { recursive: true });
      mkdirSync(inputsPath, { recursive: true });
      mkdirSync(runnerTemp, { recursive: true });
      writeFileSync(join(repoPath, 'src', 'index.ts'), 'export const answer = 42;\n');
      writeFileSync(join(inputsPath, 'operator-note.txt'), 'preserve me\n');

      const env = {
        ...process.env,
        GITHUB_WORKSPACE: repoPath,
        RUNNER_TEMP: runnerTemp,
        WITAN_EXPORT_DIR: join(repoPath, '.cejel'),
        WITAN_REPO_PATH: repoPath,
      };
      const invocation = `import { main } from ${JSON.stringify(pathToFileURL(runnerPath).href)}; main();`;
      const first = spawnSync(process.execPath, ['--input-type=module', '--eval', invocation], {
        cwd: repoPath,
        encoding: 'utf8',
        env,
      });
      const second = spawnSync(process.execPath, ['--input-type=module', '--eval', invocation], {
        cwd: repoPath,
        encoding: 'utf8',
        env,
      });

      expect(first.status).toBe(0);
      expect(second.status).toBe(0);
      expect(readFileSync(join(inputsPath, 'operator-note.txt'), 'utf8')).toBe('preserve me\n');
      expect(existsSync(join(repoPath, '.cejel', 'summary.json'))).toBe(true);
      expect(readdirSync(runnerTemp)).toEqual([]);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('refuses a symlinked prior-run backup root', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'cejel-action-backup-boundary-'));
    try {
      const runnerPath = makeSelfContainedActionRunner(fixtureRoot);
      const repoPath = join(fixtureRoot, 'repo');
      const runnerTemp = join(fixtureRoot, 'runner-temp');
      const outside = join(fixtureRoot, 'outside');
      const exportDir = join(repoPath, '.cejel');
      mkdirSync(join(repoPath, 'src'), { recursive: true });
      mkdirSync(exportDir, { recursive: true });
      mkdirSync(runnerTemp, { recursive: true });
      mkdirSync(outside, { recursive: true });
      writeFileSync(join(repoPath, 'src', 'index.ts'), 'export const answer = 42;\n');
      writeFileSync(join(exportDir, 'summary.json'), '{}\n');
      symlinkSync(outside, join(exportDir, '.previous-cejel-runs'));

      const invocation = `import { main } from ${JSON.stringify(pathToFileURL(runnerPath).href)}; main();`;
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', invocation], {
        cwd: repoPath,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_WORKSPACE: repoPath,
          RUNNER_TEMP: runnerTemp,
          WITAN_EXPORT_DIR: exportDir,
          WITAN_REPO_PATH: repoPath,
        },
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('refusing a non-directory or symlinked Action backup root');
      expect(readdirSync(outside)).toEqual([]);
      expect(readdirSync(runnerTemp)).toEqual([]);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});

// Track A5 rider (ADR-0022): action/run.mjs forwards GITHUB_RUN_ATTEMPT — a standard runner env
// var, present with no explicit passthrough in action.yml — to the CLI as --run-attempt, and
// forwards nothing when it's absent (a local `node run.mjs` invocation, or any non-Action CI).
function makeArgvCapturingActionRunner(fixtureRoot: string): string {
  const runnerPath = join(fixtureRoot, 'action', 'run.mjs');
  const cliPath = join(fixtureRoot, 'dist', 'index.js');
  mkdirSync(join(fixtureRoot, 'action'), { recursive: true });
  mkdirSync(join(fixtureRoot, 'dist'), { recursive: true });
  copyFileSync(ACTION_RUNNER_PATH, runnerPath);
  writeFileSync(
    cliPath,
    `import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const outDir = process.argv[process.argv.indexOf('--out-dir') + 1];
mkdirSync(outDir, { recursive: true });
// Written next to this fake CLI (outside outDir), not as an outDir entry — the real run.mjs
// refuses to export any file it doesn't recognize as one of its five artifacts, so a captured
// argv can't live in outDir without tripping that guard.
writeFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'argv.json'),
  JSON.stringify(process.argv.slice(2)),
);
const summary = {
  productDisplayName: 'fixture', overallScore: 4, codeTrustScore: 4,
  processTrustScore: 4, verdict: 'Verified', findingCount: 0, topFindings: [],
};
for (const name of ['attestation.json', 'badge.json', 'badge.svg', 'certificate.html', 'report.json']) {
  writeFileSync(join(outDir, name), '{}\\n');
}
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary));
`,
  );
  return runnerPath;
}

describe('GitHub Action run-attempt forwarding', () => {
  it('forwards GITHUB_RUN_ATTEMPT to the CLI as --run-attempt', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'cejel-action-run-attempt-'));
    try {
      const runnerPath = makeArgvCapturingActionRunner(fixtureRoot);
      const repoPath = join(fixtureRoot, 'repo');
      const runnerTemp = join(fixtureRoot, 'runner-temp');
      mkdirSync(join(repoPath, 'src'), { recursive: true });
      mkdirSync(runnerTemp, { recursive: true });
      writeFileSync(join(repoPath, 'src', 'index.ts'), 'export const answer = 42;\n');

      const invocation = `import { main } from ${JSON.stringify(pathToFileURL(runnerPath).href)}; main();`;
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', invocation], {
        cwd: repoPath,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_WORKSPACE: repoPath,
          GITHUB_RUN_ATTEMPT: '2',
          RUNNER_TEMP: runnerTemp,
          WITAN_EXPORT_DIR: join(repoPath, '.cejel'),
          WITAN_REPO_PATH: repoPath,
        },
      });

      expect(result.status).toBe(0);
      const argv = JSON.parse(
        readFileSync(join(fixtureRoot, 'dist', 'argv.json'), 'utf8'),
      ) as string[];
      expect(argv).toContain('--run-attempt');
      expect(argv[argv.indexOf('--run-attempt') + 1]).toBe('2');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('forwards no --run-attempt flag when GITHUB_RUN_ATTEMPT is unset', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'cejel-action-no-run-attempt-'));
    try {
      const runnerPath = makeArgvCapturingActionRunner(fixtureRoot);
      const repoPath = join(fixtureRoot, 'repo');
      const runnerTemp = join(fixtureRoot, 'runner-temp');
      mkdirSync(join(repoPath, 'src'), { recursive: true });
      mkdirSync(runnerTemp, { recursive: true });
      writeFileSync(join(repoPath, 'src', 'index.ts'), 'export const answer = 42;\n');

      // Tests must not inherit a real GITHUB_RUN_ATTEMPT from the ambient environment (e.g. this
      // suite itself running inside a GitHub Actions job) — this case exercises the absent path.
      const { GITHUB_RUN_ATTEMPT: _unused, ...ambientEnv } = process.env;
      const env = {
        ...ambientEnv,
        GITHUB_WORKSPACE: repoPath,
        RUNNER_TEMP: runnerTemp,
        WITAN_EXPORT_DIR: join(repoPath, '.cejel'),
        WITAN_REPO_PATH: repoPath,
      };
      const invocation = `import { main } from ${JSON.stringify(pathToFileURL(runnerPath).href)}; main();`;
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', invocation], {
        cwd: repoPath,
        encoding: 'utf8',
        env,
      });

      expect(result.status).toBe(0);
      const argv = JSON.parse(
        readFileSync(join(fixtureRoot, 'dist', 'argv.json'), 'utf8'),
      ) as string[];
      expect(argv).not.toContain('--run-attempt');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});

// The Action's optional rubric-pin input (action.yml -> WITAN_RUBRIC_PIN). run.mjs forwards a
// non-empty value to the CLI as --rubric-pin and forwards nothing otherwise; the CLI's own
// assertSelectableRubricVersion is the only list of accepted ids. These cases run the REAL CLI
// (src/index.ts through tsx, so no build is needed) behind a dist/index.js shim that records the
// argv run.mjs passed it.
const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TSX_CLI = join(PACKAGE_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CLI_SOURCE = join(PACKAGE_ROOT, 'src', 'index.ts');
const V17 = 'witan-rubric-v17-2026-07-24';
const V27 = 'witan-rubric-v27-prospective-2026-10-19';

function makeRealCliActionRunner(fixtureRoot: string): string {
  const runnerPath = join(fixtureRoot, 'action', 'run.mjs');
  mkdirSync(join(fixtureRoot, 'action'), { recursive: true });
  mkdirSync(join(fixtureRoot, 'dist'), { recursive: true });
  copyFileSync(ACTION_RUNNER_PATH, runnerPath);
  writeFileSync(
    join(fixtureRoot, 'dist', 'index.js'),
    `import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'argv.json'), JSON.stringify(args));
const result = spawnSync(process.execPath, [${JSON.stringify(TSX_CLI)}, ${JSON.stringify(CLI_SOURCE)}, ...args], { stdio: 'inherit' });
process.exit(result.status ?? 1);
`,
  );
  return runnerPath;
}

function writeSmallRepository(repoPath: string): void {
  mkdirSync(join(repoPath, 'src'), { recursive: true });
  writeFileSync(join(repoPath, 'src', 'index.ts'), 'export const answer = 42;\n');
}

interface ActionRun {
  readonly status: number | null;
  readonly stderr: string;
  readonly argv: string[] | undefined;
  readonly githubOutput: string;
  readonly stepSummary: string;
  readonly exportDir: string;
}

function runAction(
  fixtureRoot: string,
  runnerPath: string,
  repoPath: string,
  label: string,
  rubricPin: string | undefined,
): ActionRun {
  const runDir = join(fixtureRoot, `run-${label}`);
  const runnerTemp = join(runDir, 'runner-temp');
  const exportDir = join(runDir, 'export');
  const githubOutputPath = join(runDir, 'github-output.txt');
  const stepSummaryPath = join(runDir, 'step-summary.md');
  mkdirSync(runnerTemp, { recursive: true });
  writeFileSync(githubOutputPath, '');
  writeFileSync(stepSummaryPath, '');
  const argvPath = join(dirname(runnerPath), '..', 'dist', 'argv.json');
  rmSync(argvPath, { force: true });

  // Never inherit an ambient pin or run attempt (this suite may itself run inside an Action job).
  const {
    WITAN_RUBRIC_PIN: _pin,
    GITHUB_RUN_ATTEMPT: _attempt,
    ...ambientEnv
  } = process.env;
  // main() is imported rather than run.mjs spawned directly: run.mjs's entry-point check compares
  // a realpath'd import.meta.url with argv[1], which differ under a symlinked temp root.
  const invocation = `import { main } from ${JSON.stringify(pathToFileURL(runnerPath).href)}; main();`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', invocation], {
    cwd: repoPath,
    encoding: 'utf8',
    env: {
      ...ambientEnv,
      GITHUB_OUTPUT: githubOutputPath,
      GITHUB_STEP_SUMMARY: stepSummaryPath,
      GITHUB_WORKSPACE: repoPath,
      RUNNER_TEMP: runnerTemp,
      WITAN_EXPORT_DIR: exportDir,
      WITAN_REPO_PATH: repoPath,
      ...(rubricPin === undefined ? {} : { WITAN_RUBRIC_PIN: rubricPin }),
    },
  });
  return {
    status: result.status,
    stderr: result.stderr,
    argv: existsSync(argvPath) ? (JSON.parse(readFileSync(argvPath, 'utf8')) as string[]) : undefined,
    githubOutput: readFileSync(githubOutputPath, 'utf8'),
    stepSummary: readFileSync(stepSummaryPath, 'utf8'),
    exportDir,
  };
}

function readReport(run: ActionRun): { rubricVersion: string } & Record<string, unknown> {
  return JSON.parse(readFileSync(join(run.exportDir, 'report.json'), 'utf8')) as {
    rubricVersion: string;
  } & Record<string, unknown>;
}

/** An artifact's bytes with its per-invocation timestamp and this run's own paths blanked. */
function comparableArtifact(run: ActionRun, name: string): string {
  return readFileSync(join(run.exportDir, name), 'utf8')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, '<timestamp>')
    .replace(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}, \d{4}/g, '<date>')
    .replaceAll(run.exportDir, '<export>');
}

/** The argv run.mjs gives the CLI, with the fresh runner-temporary out-dir blanked. */
function comparableArgv(argv: string[] | undefined): string[] {
  if (!argv) throw new Error('the CLI was not invoked');
  const outDirIndex = argv.indexOf('--out-dir');
  return argv.map((value, index) => (index === outDirIndex + 1 ? '<out-dir>' : value));
}

function outputsOf(run: ActionRun): Map<string, string> {
  return parseGithubOutputs(run.githubOutput);
}

describe('GitHub Action rubric-pin input', () => {
  it('forwards a v27 pin to the CLI as --rubric-pin, and the report names v27 as its rubric', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'cejel-action-rubric-pin-v27-'));
    try {
      const runnerPath = makeRealCliActionRunner(fixtureRoot);
      const repoPath = join(fixtureRoot, 'repo');
      writeSmallRepository(repoPath);

      const run = runAction(fixtureRoot, runnerPath, repoPath, 'v27', V27);

      expect(run.stderr).not.toContain('unrecognized rubric version');
      expect(run.status).toBe(0);
      expect(comparableArgv(run.argv)).toEqual([repoPath, '--out-dir', '<out-dir>', '--rubric-pin', V27]);
      expect(readReport(run).rubricVersion).toBe(V27);
      expect(outputsOf(run).get('verdict')).toBe(
        (JSON.parse(readFileSync(join(run.exportDir, 'summary.json'), 'utf8')) as { verdict: string })
          .verdict,
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }, 120_000);

  it('passes no --rubric-pin when the input is empty or unset, and every artifact and output matches', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'cejel-action-rubric-pin-default-'));
    try {
      const runnerPath = makeRealCliActionRunner(fixtureRoot);
      const repoPath = join(fixtureRoot, 'repo');
      writeSmallRepository(repoPath);

      const unset = runAction(fixtureRoot, runnerPath, repoPath, 'unset', undefined);
      const empty = runAction(fixtureRoot, runnerPath, repoPath, 'empty', '');
      const blank = runAction(fixtureRoot, runnerPath, repoPath, 'blank', '  ');

      // Today's invocation, exactly: the repository and the fresh out-dir, nothing else.
      for (const run of [unset, empty, blank]) {
        expect(run.status).toBe(0);
        expect(comparableArgv(run.argv)).toEqual([repoPath, '--out-dir', '<out-dir>']);
        expect(readReport(run).rubricVersion).toBe(V17);
      }

      for (const name of readdirSync(unset.exportDir)) {
        const reference = comparableArtifact(unset, name);
        expect(comparableArtifact(empty, name), name).toBe(reference);
        expect(comparableArtifact(blank, name), name).toBe(reference);
      }
      expect(readdirSync(empty.exportDir).sort()).toEqual(readdirSync(unset.exportDir).sort());
      expect(empty.stepSummary).toBe(unset.stepSummary);
      expect(blank.stepSummary).toBe(unset.stepSummary);
      const reference = outputsOf(unset);
      for (const run of [empty, blank]) {
        const outputs = outputsOf(run);
        expect([...outputs.keys()]).toEqual([...reference.keys()]);
        for (const [name, value] of reference) {
          expect(outputs.get(name), name).toBe(name === 'artifact-dir' ? run.exportDir : value);
        }
      }
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }, 180_000);

  it('fails the step with the CLI\'s own message on an unknown rubric id, and publishes nothing', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'cejel-action-rubric-pin-unknown-'));
    try {
      const runnerPath = makeRealCliActionRunner(fixtureRoot);
      const repoPath = join(fixtureRoot, 'repo');
      writeSmallRepository(repoPath);

      const run = runAction(fixtureRoot, runnerPath, repoPath, 'unknown', 'witan-rubric-v99-unknown');

      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain('Cejel: unrecognized rubric version: "witan-rubric-v99-unknown". Accepted values: ');
      expect(run.githubOutput).toBe('');
      expect(run.stepSummary).toBe('');
      expect(existsSync(join(run.exportDir, 'report.json'))).toBe(false);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }, 120_000);

  it('passes a v27 shallow-clone result through unchanged: A2 abstains for the shallow history, and the outputs are the CLI\'s', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'cejel-action-rubric-pin-shallow-'));
    const origin = buildCacheLibraryOrigin();
    const clone = cloneRepository(origin, 1);
    try {
      const runnerPath = makeRealCliActionRunner(fixtureRoot);

      const run = runAction(fixtureRoot, runnerPath, clone, 'shallow-v27', V27);

      expect(run.status).toBe(0);
      const report = readReport(run) as {
        rubricVersion: string;
        criteria: { id: string; status: string; notes?: string }[];
        verdictCap?: { criterionId: string; reason: string };
      };
      expect(report.rubricVersion).toBe(V27);
      // Every history read succeeds on this fixture, so A2's abstention is the shallow-only one
      // (a failed read would carry the failed-history note prefix).
      const a2 = report.criteria.find((criterion) => criterion.id === 'A2');
      expect(a2?.status).toBe('insufficient_data');
      expect((a2?.notes ?? '').startsWith(WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX)).toBe(false);
      if (report.verdictCap) {
        expect(report.verdictCap).toMatchObject({ criterionId: 'A2', reason: 'shallow_history' });
      }

      const summary = JSON.parse(readFileSync(join(run.exportDir, 'summary.json'), 'utf8')) as {
        overallScore: number | null;
        verdict: string;
      };
      const outputs = outputsOf(run);
      expect(outputs.get('verdict')).toBe(summary.verdict);
      expect(outputs.get('score')).toBe(
        typeof summary.overallScore === 'number' ? summary.overallScore.toFixed(1) : '',
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
      rmSync(origin, { recursive: true, force: true });
      rmSync(dirname(clone), { recursive: true, force: true });
    }
  }, 180_000);
});
