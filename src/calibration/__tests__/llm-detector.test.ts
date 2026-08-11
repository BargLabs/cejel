import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCalibrationLlmDetector } from '../llm-detector.js';

describe('calibration-only LLM detector entrypoint', () => {
  it('emits the pack artifact without exposing the checkout path', () => {
    const source = mkdtempSync(join(tmpdir(), 'cejel-llm-calibration-source-'));
    const output = mkdtempSync(join(tmpdir(), 'cejel-llm-calibration-output-'));
    mkdirSync(join(source, 'src'));
    writeFileSync(
      join(source, 'package.json'),
      `${JSON.stringify({ name: 'calibration-fixture', version: '1.0.0' })}\n`,
    );
    writeFileSync(
      join(source, 'src', 'app.ts'),
      "import OpenAI from 'openai';\nexport const client = new OpenAI();\n",
    );

    runCalibrationLlmDetector(['scan', source, '--out', output, '--quiet']);

    const bytes = readFileSync(join(output, 'llm-report.json'), 'utf8');
    const artifact = JSON.parse(bytes) as { repo: { path: string } };
    expect(artifact.repo.path).toBe('calibration-fixture');
    expect(bytes).not.toContain(source);
  });

  it('rejects the removed public --pack flag', () => {
    expect(() =>
      runCalibrationLlmDetector(['scan', '.', '--out', '.cejel', '--pack', 'llm', '--quiet']),
    ).toThrow(/unknown calibration detector argument: --pack/);
  });
});
