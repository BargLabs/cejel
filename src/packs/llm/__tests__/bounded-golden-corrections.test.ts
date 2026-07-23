import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectCejelLlmPack } from '../detector.js';
import { detectBoundedEvaluationResultProvenance } from '../evaluation-rules.js';
import { detectPythonConfiguredSelfJudge } from '../python-evaluation-rules.js';
import {
  CEJEL_LLM_V1_RULES,
  javaScriptExecutableHelperParameterSinks,
  type LlmSourceFile,
} from '../rules.js';

function source(contents: readonly string[], path = 'src/evaluation.ts'): LlmSourceFile {
  return { path, contents: contents.join('\n') };
}

describe('bounded golden corrections', () => {
  it('links same-file model output to an executable-template helper parameter', () => {
    const file = source([
      "import OpenAI from 'openai';",
      'function buildExecutablePreview(componentSource: string) {',
      '  return `<script>',
      '    const source = ${JSON.stringify(componentSource)};',
      '    const compiled = transform(source);',
      '    (0, eval)(compiled);',
      '  </script>`;',
      '}',
      'const client = new OpenAI();',
      "const response = await client.responses.create({ model: 'example', input: 'build' });",
      'const generatedComponent = response.output_text;',
      'const preview = buildExecutablePreview(generatedComponent);',
    ]);
    const rule = CEJEL_LLM_V1_RULES.find((candidate) => candidate.id === 'LLM-IOH-001');

    expect(javaScriptExecutableHelperParameterSinks(file)).toEqual([
      expect.objectContaining({
        functionName: 'buildExecutablePreview',
        parameterName: 'componentSource',
      }),
    ]);
    expect(rule?.detect(file)).toHaveLength(1);
  });

  it.each([
    [
      'non-executable template',
      [
        "import OpenAI from 'openai';",
        'function buildTextPreview(componentSource: string) {',
        '  return `<pre>${escapeHtml(componentSource)}</pre>`;',
        '}',
        'const client = new OpenAI();',
        "const response = await client.responses.create({ model: 'example', input: 'build' });",
        'buildTextPreview(response.output_text);',
      ],
    ],
    [
      'static dynamic evaluation',
      [
        "import OpenAI from 'openai';",
        'function buildPreview(componentSource: string) {',
        '  return `<script>',
        '    const source = ${JSON.stringify(componentSource)};',
        "    eval('trustedConstant()');",
        '    displayAsText(source);',
        '  </script>`;',
        '}',
        'const client = new OpenAI();',
        "const response = await client.responses.create({ model: 'example', input: 'build' });",
        'buildPreview(response.output_text);',
      ],
    ],
  ] as const)('abstains for the %s helper control', (_name, lines) => {
    const file = source(lines);
    const rule = CEJEL_LLM_V1_RULES.find((candidate) => candidate.id === 'LLM-IOH-001');
    expect(javaScriptExecutableHelperParameterSinks(file)).toEqual([]);
    expect(rule?.detect(file)).toEqual([]);
  });

  it('detects an emitted identifier-bound discrete evaluation without config lineage', () => {
    const file = source([
      "import { writeFileSync } from 'node:fs';",
      'const evaluationRecord = {',
      '  scenario: scenarioId,',
      '  model: selectedModel,',
      '  run: runNumber,',
      '  score: measuredScore,',
      '  ok: measuredScore > threshold,',
      '};',
      "writeFileSync('evaluation.json', JSON.stringify(evaluationRecord, null, 2));",
    ]);
    expect(detectBoundedEvaluationResultProvenance([file])).toHaveLength(1);
  });

  it('requires resolved emission and missing configuration for a discrete result', () => {
    const unresolved = source([
      'const evaluationRecord = {',
      '  scenario: scenarioId, model: selectedModel, run: runNumber, score, ok',
      '};',
      'publishLater(evaluationRecord);',
    ]);
    const reproducible = source([
      "import { writeFileSync } from 'node:fs';",
      'const evaluationRecord = {',
      '  scenario: scenarioId, model: selectedModel, run: runNumber, score, ok, promptDigest',
      '};',
      "writeFileSync('evaluation.json', JSON.stringify(evaluationRecord));",
    ]);
    expect(detectBoundedEvaluationResultProvenance([unresolved])).toEqual([]);
    expect(detectBoundedEvaluationResultProvenance([reproducible])).toEqual([]);
  });

  it('detects incrementally built per-case results with resolved return evidence', () => {
    const file = source([
      'async function executeEvaluation(dataset: Dataset) {',
      '  const report = {};',
      '  report.evaluationId = dataset.id;',
      '  report.rows = [];',
      '  for (const item of dataset.rows) {',
      '    report.rows.push({ expectedOutput: item.expected, evaluations: [] });',
      '    const caseRun = {};',
      "    caseRun.status = 'complete';",
      '    caseRun.actualOutput = await executeCase(item);',
      '    caseRun.metrics = collectMetrics();',
      '    caseRun.latency = elapsed();',
      '    report.rows[report.rows.length - 1].evaluations.push(caseRun);',
      '  }',
      '  return report;',
      '}',
    ]);
    expect(detectBoundedEvaluationResultProvenance([file])).toHaveLength(1);
  });

  it('does not infer provenance from an arbitrary returned object or a reproduced case report', () => {
    const arbitrary = source([
      'const payload = {};',
      'payload.rows = [];',
      'const entry = {};',
      "entry.status = 'ready';",
      'entry.output = value;',
      'entry.latency = elapsed();',
      'payload.rows.push(entry);',
      'return payload;',
    ]);
    const reproducible = source([
      'const report = {};',
      'report.evaluationId = evaluationId;',
      'report.rows = [];',
      'const caseRun = {};',
      "caseRun.status = 'complete';",
      'caseRun.actualOutput = output;',
      'caseRun.metrics = metrics;',
      'caseRun.promptDigest = promptDigest;',
      'report.rows.push(caseRun);',
      'return report;',
    ]);
    expect(detectBoundedEvaluationResultProvenance([arbitrary])).toEqual([]);
    expect(detectBoundedEvaluationResultProvenance([reproducible])).toEqual([]);
  });

  it('detects a Python producer/judge alias whose verdict is retained at completion', () => {
    const file = source([
      'class EvaluationAgent:',
      '    def __init__(self, task_llm, judge_llm=None):',
      '        if judge_llm is None:',
      '            judge_llm = task_llm',
      '        self.task_llm = task_llm',
      '        self.judge_llm = judge_llm',
      '    async def produce(self, messages):',
      '        return await self.task_llm.ainvoke(messages)',
      '    async def judge_trace(self, messages):',
      '        return await self.judge_llm.ainvoke(messages)',
      '    async def judge_and_retain(self, messages):',
      '        judgement = await self.judge_trace(messages)',
      '        self.history.last_result.judgement = judgement',
      '    async def finish(self, messages):',
      '        if self.settings.use_judge:',
      '            await self.judge_and_retain(messages)',
    ], 'src/evaluation_agent.py');
    expect(detectPythonConfiguredSelfJudge(file)).toHaveLength(1);
  });

  it.each([
    [
      'distinct judge',
      [
        'class EvaluationAgent:',
        '    def __init__(self, task_llm, judge_llm):',
        '        self.task_llm = task_llm',
        '        self.judge_llm = judge_llm',
        '    async def produce(self, messages): return await self.task_llm.ainvoke(messages)',
        '    async def judge_trace(self, messages): return await self.judge_llm.ainvoke(messages)',
      ],
    ],
    [
      'unretained critique',
      [
        'class EvaluationAgent:',
        '    def __init__(self, task_llm, judge_llm=None):',
        '        if judge_llm is None:',
        '            judge_llm = task_llm',
        '        self.task_llm = task_llm',
        '        self.judge_llm = judge_llm',
        '    async def produce(self, messages): return await self.task_llm.ainvoke(messages)',
        '    async def judge_trace(self, messages): return await self.judge_llm.ainvoke(messages)',
        '    async def finish(self, messages):',
        '        if self.settings.use_judge:',
        '            await self.judge_trace(messages)',
      ],
    ],
  ] as const)('abstains for the Python %s control', (_name, lines) => {
    expect(detectPythonConfiguredSelfJudge(source(lines, 'src/evaluation_agent.py'))).toEqual([]);
  });

  it('does not combine Python self-judge evidence across separate classes', () => {
    const file = source([
      'class ProducerAgent:',
      '    def __init__(self, task_llm, judge_llm=None):',
      '        if judge_llm is None:',
      '            judge_llm = task_llm',
      '        self.task_llm = task_llm',
      '        self.judge_llm = judge_llm',
      '    async def produce(self, messages):',
      '        return await self.task_llm.ainvoke(messages)',
      '',
      'class SeparateReviewer:',
      '    async def judge_trace(self, messages):',
      '        return await self.judge_llm.ainvoke(messages)',
      '    async def judge_and_retain(self, messages):',
      '        judgement = await self.judge_trace(messages)',
      '        self.history.last_result.judgement = judgement',
      '    async def finish(self, messages):',
      '        if self.settings.use_judge:',
      '            await self.judge_and_retain(messages)',
    ], 'src/evaluation_agent.py');
    expect(detectPythonConfiguredSelfJudge(file)).toEqual([]);
  });

  it('emits the bounded provenance finding through the integrated pack collector', () => {
    const repo = mkdtempSync(join(tmpdir(), 'cejel-bounded-provenance-'));
    writeFileSync(
      join(repo, 'evaluation.ts'),
      [
        'const evaluationRecord = {',
        '  scenario: scenarioId,',
        '  model: selectedModel,',
        '  run: runNumber,',
        '  score: measuredScore,',
        '  ok: measuredScore > threshold,',
        '};',
        'console.log(JSON.stringify(evaluationRecord));',
      ].join('\n'),
      'utf8',
    );
    const result = collectCejelLlmPack(repo, ['evaluation.ts']);
    const findings = result.findings.filter((finding) => finding.ruleId === 'LLM-PRV-001');
    expect(findings).toHaveLength(1);
    expect(
      result.ruleResults.find((rule) => rule.ruleId === 'LLM-PRV-001')?.state,
    ).toBe('finding');
  });

  it('does not activate provenance for generic returned model metadata', () => {
    const repo = mkdtempSync(join(tmpdir(), 'cejel-bounded-metadata-control-'));
    writeFileSync(
      join(repo, 'metadata.ts'),
      [
        'function describeRuntime() {',
        '  const metadata = { model: selectedModel, provider: selectedProvider };',
        '  return metadata;',
        '}',
      ].join('\n'),
      'utf8',
    );
    const result = collectCejelLlmPack(repo, ['metadata.ts']);
    expect(result.findings.filter((finding) => finding.ruleId === 'LLM-PRV-001')).toEqual([]);
    expect(
      result.ruleResults.find((rule) => rule.ruleId === 'LLM-PRV-001')?.state,
    ).toBe('not_applicable');
  });

  it('emits the bounded Python self-judge finding through the integrated pack collector', () => {
    const repo = mkdtempSync(join(tmpdir(), 'cejel-bounded-self-judge-'));
    writeFileSync(
      join(repo, 'evaluation_agent.py'),
      [
        'class EvaluationAgent:',
        '    def __init__(self, task_llm, judge_llm=None):',
        '        if judge_llm is None:',
        '            judge_llm = task_llm',
        '        self.task_llm = task_llm',
        '        self.judge_llm = judge_llm',
        '    async def produce(self, messages):',
        '        return await self.task_llm.ainvoke(messages)',
        '    async def judge_trace(self, messages):',
        '        return await self.judge_llm.ainvoke(messages)',
        '    async def judge_and_retain(self, messages):',
        '        judgement = await self.judge_trace(messages)',
        '        self.history.last_result.judgement = judgement',
        '    async def finish(self, messages):',
        '        if self.settings.use_judge:',
        '            await self.judge_and_retain(messages)',
      ].join('\n'),
      'utf8',
    );
    const result = collectCejelLlmPack(repo, ['evaluation_agent.py']);
    expect(result.findings.filter((finding) => finding.ruleId === 'LLM-EVL-002'))
      .toHaveLength(1);
    expect(
      result.ruleResults.find((rule) => rule.ruleId === 'LLM-EVL-002')?.state,
    ).toBe('finding');
  });
});
