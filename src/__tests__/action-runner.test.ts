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
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

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

describe('GitHub Action step summary', () => {
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
