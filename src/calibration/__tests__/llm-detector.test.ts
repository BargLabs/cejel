import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CejelLlmPackArtifactSchema } from '../../packs/llm/artifact.js';
import {
  CEJEL_LLM_OVER_LIMIT_EVIDENCE,
  cejelLlmOverLimitPathsLimitation,
} from '../../packs/llm/types.js';
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

  // Review of #697, item D: CejelLlmEvidenceSchema.path caps paths at 700 characters, so a rule file
  // at a longer path made the detector throw and write nothing. The finding now stays, on a stated
  // anchor, and the artifact states the drop.
  it('writes a valid artifact for a rule file at a path over 700 characters, keeping the finding', () => {
    const run = (relativeDir: string) => {
      const source = mkdtempSync(join(tmpdir(), 'cejel-llm-calibration-source-'));
      const output = mkdtempSync(join(tmpdir(), 'cejel-llm-calibration-output-'));
      mkdirSync(join(source, relativeDir), { recursive: true });
      writeFileSync(
        join(source, 'package.json'),
        `${JSON.stringify({ name: 'calibration-fixture', version: '1.0.0' })}\n`,
      );
      writeFileSync(
        join(source, relativeDir, 'app.ts'),
        [
          "import OpenAI from 'openai';",
          '',
          'const client = new OpenAI();',
          "const response = await client.responses.create({ model: 'example', input: 'write code' });",
          'const generatedCode = response.output_text;',
          'eval(generatedCode);',
          '',
        ].join('\n'),
      );
      runCalibrationLlmDetector(['scan', source, '--out', output, '--quiet']);
      return CejelLlmPackArtifactSchema.parse(
        JSON.parse(readFileSync(join(output, 'llm-report.json'), 'utf8')),
      );
    };
    let longDir = 'src';
    while (longDir.length < 720) longDir += `/${'d'.repeat(Math.min(99, 720 - longDir.length - 1))}`;
    expect(`${longDir}/app.ts`.length).toBeGreaterThan(700);

    const short = run('src');
    const long = run(longDir);
    const finding = short.result.findings.find(({ ruleId }) => ruleId === 'LLM-IOH-001');
    expect(finding?.evidence.path).toBe('src/app.ts');

    const essentials = (artifact: typeof short) => ({
      status: artifact.result.status,
      findings: artifact.result.findings.map(({ ruleId, severity, confidence, summary }) => ({
        ruleId,
        severity,
        confidence,
        summary,
      })),
      ruleStates: artifact.result.ruleResults.map(({ ruleId, state }) => ({ ruleId, state })),
      considered: artifact.result.coverage.sourceFilesConsidered,
      indicators: artifact.result.coverage.sourceFilesWithLlmIndicators,
    });
    expect(essentials(long)).toEqual(essentials(short));
    expect(long.result.findings.find(({ ruleId }) => ruleId === 'LLM-IOH-001')?.evidence).toEqual(
      CEJEL_LLM_OVER_LIMIT_EVIDENCE,
    );
    expect(JSON.stringify(long).includes(longDir)).toBe(false);
    expect(long.result.coverage.limitations).toEqual([
      ...short.result.coverage.limitations,
      cejelLlmOverLimitPathsLimitation(1),
    ]);
  });

  it('rejects the removed public --pack flag', () => {
    expect(() =>
      runCalibrationLlmDetector(['scan', '.', '--out', '.cejel', '--pack', 'llm', '--quiet']),
    ).toThrow(/unknown calibration detector argument: --pack/);
  });
});
