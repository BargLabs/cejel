import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectCejelLlmPack } from '../detector.js';
import { detectBoundedEvaluationResultProvenance } from '../evaluation-rules.js';
import { hasSupportedJavaScriptModelCall } from '../javascript-integrations.js';
import { detectPythonConfiguredSelfJudge } from '../python-evaluation-rules.js';
import { detectSideEffectingToolWithoutAuthorityBoundary } from '../action-rules.js';
import {
  CEJEL_LLM_V1_RULES,
  javaScriptExecutableHelperParameterSinks,
  type LlmSourceFile,
} from '../rules.js';

function source(contents: readonly string[], path = 'src/evaluation.ts'): LlmSourceFile {
  return { path, contents: contents.join('\n') };
}

describe('bounded golden corrections', () => {
  it('recognizes an authenticated OpenAI-compatible REST model call', () => {
    const file = source([
      'async function complete(',
      '  base: string,',
      '  key: string,',
      '  model: string,',
      '  messages: Array<{ role: string; content: string }>',
      '): Promise<string> {',
      '  const response = await fetch(`${base}/chat/completions`, {',
      "    method: 'POST',",
      '    headers: { Authorization: `Bearer ${key}` },',
      '    body: JSON.stringify({ model, messages, max_tokens: 1000 }),',
      '  });',
      '  return response.json();',
      '}',
    ]);
    expect(hasSupportedJavaScriptModelCall(file.contents)).toBe(true);
  });

  it.each([
    [
      'missing authentication',
      [
        "fetch('https://provider.example/v1/chat/completions', {",
        "  method: 'POST',",
        '  body: JSON.stringify({ model, messages }),',
        '});',
      ],
    ],
    [
      'unrelated endpoint',
      [
        "fetch('https://provider.example/v1/files', {",
        "  method: 'POST',",
        '  headers: { Authorization: `Bearer ${key}` },',
        '  body: JSON.stringify({ model, messages }),',
        '});',
      ],
    ],
    [
      'missing model input shape',
      [
        "fetch('https://provider.example/v1/chat/completions', {",
        "  method: 'POST',",
        '  headers: { Authorization: `Bearer ${key}` },',
        '  body: JSON.stringify({ payload }),',
        '});',
      ],
    ],
    [
      'non-POST request',
      [
        "fetch('https://provider.example/v1/chat/completions', {",
        '  headers: { Authorization: `Bearer ${key}` },',
        '  body: JSON.stringify({ model, messages }),',
        '});',
      ],
    ],
  ] as const)('abstains from a REST lookalike with %s', (_reason, lines) => {
    expect(hasSupportedJavaScriptModelCall(lines.join('\n'))).toBe(false);
  });

  it('detects a discrete evaluation emitted after a local REST model helper call', () => {
    const file = source([
      "import { writeFileSync } from 'node:fs';",
      'async function complete(',
      '  base: string,',
      '  key: string,',
      '  model: string,',
      '  messages: Array<{ role: string; content: string }>',
      '): Promise<string> {',
      '  const response = await fetch(`${base}/chat/completions`, {',
      "    method: 'POST',",
      '    headers: { Authorization: `Bearer ${key}` },',
      '    body: JSON.stringify({ model, messages, max_tokens: 1000 }),',
      '  });',
      '  return response.json();',
      '}',
      'async function main() {',
      '  const output = await complete(base, key, model, messages);',
      '  const result = { scenario, model, run, output, score, ok };',
      "  writeFileSync('evaluation.json', JSON.stringify(result));",
      '}',
    ]);
    expect(detectBoundedEvaluationResultProvenance([file])).toHaveLength(1);
  });

  it('does not borrow a REST helper that the result scope never calls', () => {
    const file = source([
      "import { writeFileSync } from 'node:fs';",
      'async function complete(base: string, key: string, model: string, messages: unknown[]) {',
      '  return fetch(`${base}/chat/completions`, {',
      "    method: 'POST',",
      '    headers: { Authorization: `Bearer ${key}` },',
      '    body: JSON.stringify({ model, messages }),',
      '  });',
      '}',
      'async function main() {',
      '  const result = { scenario, model, run, output, score, ok };',
      "  writeFileSync('evaluation.json', JSON.stringify(result));",
      '}',
    ]);
    expect(detectBoundedEvaluationResultProvenance([file])).toEqual([]);
  });

  it('detects Flowise evaluation result storage without configuration lineage', () => {
    const file = source([
      'async function evaluateChatflow(chatflowId: string, data: any, returnData: any) {',
      "  const headers = { 'X-Flowise-Evaluation': 'true' };",
      '  const postData = { question: data.input, evaluation: true };',
      '  const runData: any = {};',
      '  const response = await axios.post(`${this.baseURL}/api/v1/prediction/${chatflowId}`, postData, { headers });',
      "  runData.status = 'complete';",
      '  runData.actualOutput = response.data.text;',
      '  runData.metrics = response.data.metrics;',
      '  runData.latency = elapsed();',
      '  runData.runId = requestId;',
      '  returnData.rows[0].evaluations.push(runData);',
      '  return returnData;',
      '}',
    ]);
    expect(detectBoundedEvaluationResultProvenance([file])).toHaveLength(1);
  });

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

  it('abstains from an exported executable preview without a resolved model-output path', () => {
    const file = source([
      'export function renderActivePreview(componentCode: string) {',
      '  return `<script>',
      '    const source = ${JSON.stringify(componentCode)};',
      '    const compiled = transform(source);',
      '    (0, eval)(compiled);',
      '  </script>`;',
      '}',
    ], 'src/active-preview.ts');
    const rule = CEJEL_LLM_V1_RULES.find((candidate) => candidate.id === 'LLM-IOH-001');

    expect(rule?.detect(file)).toEqual([]);
  });

  it('detects an emitted identifier-bound discrete evaluation without config lineage', () => {
    const file = source([
      "import OpenAI from 'openai';",
      "import { writeFileSync } from 'node:fs';",
      'const client = new OpenAI();',
      "await client.responses.create({ model: 'example', input: scenarioId });",
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

  it('does not infer model provenance from evaluation-shaped fields alone', () => {
    const file = source([
      "import { writeFileSync } from 'node:fs';",
      'const evaluationRecord = {',
      '  scenario: scenarioId,',
      '  model: selectedModel,',
      '  run: runNumber,',
      '  score: measuredScore,',
      '  ok: measuredScore > threshold,',
      '};',
      "writeFileSync('evaluation.json', JSON.stringify(evaluationRecord));",
    ]);
    expect(detectBoundedEvaluationResultProvenance([file])).toEqual([]);
  });

  it('does not borrow a model invocation from another function scope', () => {
    const file = source([
      "import OpenAI from 'openai';",
      'async function unrelatedGeneration() {',
      '  const client = new OpenAI();',
      "  return client.responses.create({ model: 'example', input: 'draft' });",
      '}',
      'function publishEvaluation() {',
      '  const evaluationRecord = {',
      '    scenario: scenarioId, model: selectedModel, run: runNumber, score, ok',
      '  };',
      '  console.log(JSON.stringify(evaluationRecord));',
      '}',
    ]);
    expect(detectBoundedEvaluationResultProvenance([file])).toEqual([]);
  });

  it('does not borrow a model invocation from an unrelated arrow-function scope', () => {
    const file = source([
      "import OpenAI from 'openai';",
      'const unrelatedGeneration = async () => {',
      '  const client = new OpenAI();',
      "  return client.responses.create({ model: 'example', input: 'draft' });",
      '};',
      'const evaluationRecord = {',
      '  scenario: scenarioId, model: selectedModel, run: runNumber, score, ok',
      '};',
      'console.log(JSON.stringify(evaluationRecord));',
    ]);
    expect(detectBoundedEvaluationResultProvenance([file])).toEqual([]);
  });

  it('does not borrow a nested model invocation for an outer result', () => {
    const file = source([
      "import OpenAI from 'openai';",
      'async function publishEvaluation() {',
      '  async function unrelatedGeneration() {',
      '    const client = new OpenAI();',
      "    return client.responses.create({ model: 'example', input: 'draft' });",
      '  }',
      '  const evaluationRecord = {',
      '    scenario: scenarioId, model: selectedModel, run: runNumber, score, ok',
      '  };',
      '  console.log(JSON.stringify(evaluationRecord));',
      '}',
    ]);
    expect(detectBoundedEvaluationResultProvenance([file])).toEqual([]);
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

  it('does not resolve a discrete result through a later same-named lexical binding', () => {
    const file = source([
      'function collectCase() {',
      '  const evaluationRecord = {',
      '    scenario: scenarioId, model: selectedModel, run: runNumber, score, ok',
      '  };',
      '  consumeLater(evaluationRecord);',
      '}',
      'function describeConfiguration() {',
      '  const evaluationRecord = { model: selectedModel, promptDigest };',
      '  return evaluationRecord;',
      '}',
    ]);

    expect(detectBoundedEvaluationResultProvenance([file])).toEqual([]);
  });

  it('detects incrementally built per-case results with resolved return evidence', () => {
    const file = source([
      "import { generateText } from 'ai';",
      'async function executeEvaluation(dataset: Dataset) {',
      "  await generateText({ model, prompt: 'evaluate' });",
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

  it('detects parameter-backed per-case evaluation storage at the record declaration', () => {
    const file = source([
      "import { generateText } from 'ai';",
      'async evaluateSuite(suiteId: string, report: any) {',
      "  await generateText({ model, prompt: 'evaluate' });",
      '  for (const sample of report.samples) {',
      '    const record: any = {};',
      "    record.status = 'complete';",
      '    record.output = await runSample(sample);',
      '    record.metrics = collectMetrics();',
      '    record.latency = elapsed();',
      '    record.runId = suiteId;',
      '    report.samples[0].results.push(record);',
      '  }',
      '  return report;',
      '}',
    ]);
    expect(detectBoundedEvaluationResultProvenance([file])).toEqual([
      expect.objectContaining({
        evidence: expect.objectContaining({ line: 5 }),
      }),
    ]);
  });

  it('does not borrow per-case properties assigned after the record is stored', () => {
    const file = source([
      'async evaluateSuite(suiteId: string, report: any) {',
      '  const record: any = {};',
      "  record.status = 'pending';",
      '  report.samples[0].results.push(record);',
      '  record.output = await runSample();',
      '  record.metrics = collectMetrics();',
      '  record.latency = elapsed();',
      '  record.runId = suiteId;',
      '  return report;',
      '}',
    ]);
    expect(detectBoundedEvaluationResultProvenance([file])).toEqual([]);
  });

  it('anchors missing configuration lineage at a referenced configuration input', () => {
    const file = source([
      "import { generateText } from 'ai';",
      "import { EVALUATION_SYSTEM_PROMPT } from './policy';",
      "await generateText({ model, prompt: 'evaluate' });",
      'const systemMessage = EVALUATION_SYSTEM_PROMPT;',
      'const record = {',
      '  scenario: scenarioId, model: selectedModel, run: runNumber, score, ok',
      '};',
      'console.log(JSON.stringify(record));',
    ]);
    expect(detectBoundedEvaluationResultProvenance([file])).toEqual([
      expect.objectContaining({
        evidence: expect.objectContaining({ line: 2 }),
      }),
    ]);
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

  it('does not borrow retained-verdict evidence from a later Python method', () => {
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
      '    async def judge_without_retaining(self, messages):',
      '        judgement = await self.judge_trace(messages)',
      '        return judgement',
      '    async def unrelated_retention(self, judgement):',
      '        self.history.last_result.judgement = judgement',
      '    async def finish(self, messages):',
      '        if self.settings.use_judge:',
      '            await self.judge_without_retaining(messages)',
    ], 'src/evaluation_agent.py');

    expect(detectPythonConfiguredSelfJudge(file)).toEqual([]);
  });

  it('selects invoked Python model attributes and anchors at completion', () => {
    const file = source([
      'class EvaluationAgent:',
      '    def __init__(self, task_llm, judge_llm=None):',
      '        if judge_llm is None:',
      '            judge_llm = task_llm',
      '        self.task_timeout = task_llm',
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

    expect(detectPythonConfiguredSelfJudge(file)).toEqual([
      expect.objectContaining({
        evidence: expect.objectContaining({ line: 16 }),
      }),
    ]);
  });

  it('tracks dynamic registered-tool parameters and abstains for a fixed read helper', () => {
    const file = source([
      "import type { ToolAPI } from 'agent-runtime';",
      "import { execFileSync } from 'node:child_process';",
      'function invokeBridge(args: string[]) {',
      "  return execFileSync('bridge', args);",
      '}',
      'export function register(api: ToolAPI) {',
      '  api.registerTool({',
      "    name: 'fixed_read',",
      '    parameters: Type.Object({ target: Type.String() }),',
      "    execute(_id, params) { return invokeBridge(['read', params.target]); },",
      '  });',
      '  api.registerTool({',
      "    name: 'dynamic_action',",
      '    parameters: Type.Object({ action: Type.String(), target: Type.String() }),',
      "    execute(_id, params) { return invokeBridge(['act', params.target, params.action]); },",
      '  });',
      '}',
    ], 'src/tools.ts');

    expect(detectSideEffectingToolWithoutAuthorityBoundary(file)).toEqual([
      expect.objectContaining({
        evidence: expect.objectContaining({ line: 15 }),
      }),
    ]);
  });

  it('anchors Python code execution at the model-facing method and ignores command siblings', () => {
    const repo = mkdtempSync(join(tmpdir(), 'cejel-python-code-tool-'));
    writeFileSync(
      join(repo, 'tools.py'),
      [
        'class CodeInput(BaseModel):',
        '    code: str',
        'class CodeTool(BaseTool):',
        '    args_schema = CodeInput',
        '    def _run(self, code: str):',
        '        return self.runtime.invoke(method="executeCode", params={"code": code})',
        'class CommandInput(BaseModel):',
        '    command: str',
        'class CommandTool(BaseTool):',
        '    args_schema = CommandInput',
        '    def _run(self, command: str):',
        '        return self.runtime.invoke(method="executeCommand", params={"command": command})',
      ].join('\n'),
      'utf8',
    );

    expect(
      collectCejelLlmPack(repo, ['tools.py']).findings.filter(
        (finding) => finding.ruleId === 'LLM-VAL-001',
      ),
    ).toEqual([
      expect.objectContaining({
        evidence: expect.objectContaining({ line: 5 }),
      }),
    ]);
  });

  it('emits the bounded provenance finding through the integrated pack collector', () => {
    const repo = mkdtempSync(join(tmpdir(), 'cejel-bounded-provenance-'));
    writeFileSync(
      join(repo, 'evaluation.ts'),
      [
        "import OpenAI from 'openai';",
        'const client = new OpenAI();',
        "await client.responses.create({ model: 'example', input: scenarioId });",
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
