import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CEJEL_LLM_EVALUATION_RULES,
  detectCejelLlmEvaluationRules,
} from '../evaluation-rules.js';
import type { LlmSourceFile } from '../rules.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function fixture(name: string, path = 'src/evaluation.ts'): LlmSourceFile {
  return { path, contents: readFileSync(join(fixtureDir, name), 'utf8') };
}

describe('Free LLM evaluation and provenance rules', () => {
  it('exposes the three frozen rule definitions in contract order', () => {
    expect(CEJEL_LLM_EVALUATION_RULES.map((rule) => rule.id)).toEqual([
      'LLM-PRV-001',
      'LLM-EVL-001',
      'LLM-EVL-002',
    ]);
    for (const rule of CEJEL_LLM_EVALUATION_RULES) {
      expect(rule.detectorConfidence).toBe('high');
      expect(rule.evidenceContract.length).toBeGreaterThan(40);
      expect(rule.exclusions.length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['LLM-PRV-001', 'llm-evaluation-provenance'],
    ['LLM-EVL-001', 'llm-evaluation-denominator'],
    ['LLM-EVL-002', 'llm-evaluation-self-judge'],
  ] as const)('%s has positive and negative fixtures with measured evidence', (ruleId, stem) => {
    const positive = detectCejelLlmEvaluationRules([
      fixture(`${stem}.positive.fixture`),
    ]).filter((finding) => finding.ruleId === ruleId);
    const negative = detectCejelLlmEvaluationRules([
      fixture(`${stem}.negative.fixture`),
    ]).filter((finding) => finding.ruleId === ruleId);

    expect(positive).toHaveLength(1);
    expect(positive[0]?.confidence).toBe('high');
    expect(positive[0]?.evidence.path).toBe('src/evaluation.ts');
    expect(positive[0]?.evidence.line).toBeGreaterThan(1);
    expect(negative).toEqual([]);
  });

  it('uses info severity for the provenance contract and warning for evaluation defects', () => {
    const findings = detectCejelLlmEvaluationRules([
      fixture('llm-evaluation-provenance.positive.fixture'),
      fixture('llm-evaluation-denominator.positive.fixture', 'src/denominator.ts'),
      fixture('llm-evaluation-self-judge.positive.fixture', 'src/judge.ts'),
    ]);

    expect(findings.find((finding) => finding.ruleId === 'LLM-PRV-001')?.severity).toBe('info');
    expect(findings.find((finding) => finding.ruleId === 'LLM-EVL-001')?.severity).toBe(
      'warning',
    );
    expect(findings.find((finding) => finding.ruleId === 'LLM-EVL-002')?.severity).toBe(
      'warning',
    );
  });

  it('abstains when the judge identity is unresolved', () => {
    const unresolved = fixture('llm-evaluation-self-judge.positive.fixture');
    const contents = unresolved.contents.replace(
      "const MODEL = 'gpt-4.1-2025-04-14';",
      'const MODEL = process.env.MODEL_ID;',
    );

    expect(
      detectCejelLlmEvaluationRules([{ ...unresolved, contents }]).some(
        (finding) => finding.ruleId === 'LLM-EVL-002',
      ),
    ).toBe(false);
  });

  it('abstains from absence findings for incomplete or excluded local paths', () => {
    const source = fixture('llm-evaluation-denominator.positive.fixture');
    for (const path of [
      '/absolute/evaluation.ts',
      '../evaluation.ts',
      'src/__tests__/evaluation.ts',
      'examples/evaluation.ts',
      'docs/evaluation.ts',
    ]) {
      expect(detectCejelLlmEvaluationRules([{ ...source, path }])).toEqual([]);
    }
  });

  it('abstains when an aggregate is passed to an unresolved helper reporter', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation.ts',
      contents: [
        'const eligible = cases.filter((item) => item.status === "ok");',
        'const accuracy = eligible.filter((item) => item.correct).length / eligible.length;',
        'publishEvaluation({ accuracy });',
      ].join('\n'),
    };

    expect(detectCejelLlmEvaluationRules([source])).toEqual([]);
  });

  it('does not classify unrelated local metrics as an LLM evaluation', () => {
    const source: LlmSourceFile = {
      path: 'src/image-classifier.ts',
      contents: [
        "import { writeFileSync } from 'node:fs';",
        'const accuracy = predictions.filter((item) => item.correct).length / predictions.length;',
        "writeFileSync('metrics.json', JSON.stringify({ accuracy }));",
      ].join('\n'),
    };

    expect(detectCejelLlmEvaluationRules([source])).toEqual([]);

    const laterModelCall: LlmSourceFile = {
      path: 'src/mixed-workload.ts',
      contents: [
        "import { writeFileSync } from 'node:fs';",
        'const accuracy = predictions.filter((item) => item.correct).length / predictions.length;',
        "await openai.responses.create({ model: 'gpt-5', input: unrelatedPrompt });",
        "writeFileSync('metrics.json', JSON.stringify({ accuracy }));",
      ].join('\n'),
    };

    expect(detectCejelLlmEvaluationRules([laterModelCall])).toEqual([]);
  });

  it('does not link an unused SDK import to an unrelated mailbox call', () => {
    const source: LlmSourceFile = {
      path: 'src/mixed-workload.ts',
      contents: [
        "import OpenAI from 'openai';",
        "import { writeFileSync } from 'node:fs';",
        "const response = await mailbox.responses.create({ input: 'hello' });",
        'const parsed = JSON.parse(response.output_text);',
        'await deploy(parsed);',
        'const accuracy = results.filter((item) => item.correct).length / results.length;',
        "writeFileSync('metrics.json', JSON.stringify({ accuracy }));",
      ].join('\n'),
    };

    expect(detectCejelLlmEvaluationRules([source])).toEqual([]);
  });

  it('does not treat evaluation-shaped comments or strings as executable evidence', () => {
    const source: LlmSourceFile = {
      path: 'src/documentation.ts',
      contents: [
        "const example = 'openai.responses.create({ model: \\\"gpt-5\\\" })';",
        "const reporter = 'writeFileSync(\\\"metrics.json\\\", JSON.stringify({ accuracy }))';",
        '// const accuracy = correct.length / cases.length;',
      ].join('\n'),
    };
    expect(detectCejelLlmEvaluationRules([source])).toEqual([]);
  });

  it('recognizes an emitted denominator alias with local collection-length lineage', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation.ts',
      contents: [
        "import OpenAI from 'openai';",
        "import { writeFileSync } from 'node:fs';",
        'const openai = new OpenAI();',
        "const response = await openai.responses.create({ model: 'gpt-5', input: candidate });",
        "const eligible = results.filter((result) => result.status === 'ok');",
        'const accuracy = eligible.filter((result) => result.output === response.output_text).length / eligible.length;',
        'const n = eligible.length;',
        "writeFileSync('evaluation.json', JSON.stringify({ accuracy, n, modelId, promptDigest }));",
      ].join('\n'),
    };

    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-EVL-001',
      ),
    ).toEqual([]);
  });
});
