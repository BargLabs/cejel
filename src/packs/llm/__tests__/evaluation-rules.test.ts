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

  it.each([
    '// humanReview must approve this score',
    "const documentation = 'independentDecision(judge)';",
    'const independentDecision = true;',
    'const review = await humanReview(judge);',
  ])('does not let a non-participating independent-review token suppress EVL-002', (line) => {
    const source = fixture('llm-evaluation-self-judge.positive.fixture');
    const contents = source.contents.replace(
      "writeFileSync('evaluation.json'",
      `${line}\nwriteFileSync('evaluation.json'`,
    );
    expect(
      detectCejelLlmEvaluationRules([{ ...source, contents }]).some(
        (finding) => finding.ruleId === 'LLM-EVL-002',
      ),
    ).toBe(true);
  });

  it.each([
    [
      'emitted acceptance',
      [
        'const independentDecision = await humanReview(judge);',
        "writeFileSync('evaluation.json', JSON.stringify({ score: judge.output_text, independentDecision }));",
      ],
    ],
    [
      'acceptance gate',
      [
        'const review = await evidenceVerification(judge);',
        "if (!review.approved) throw new Error('independent review rejected result');",
        "writeFileSync('evaluation.json', JSON.stringify({ score: judge.output_text }));",
      ],
    ],
  ] as const)('suppresses EVL-002 only for an observable independent %s', (_name, replacement) => {
    const source = fixture('llm-evaluation-self-judge.positive.fixture');
    const contents = source.contents.replace(
      "writeFileSync('evaluation.json', JSON.stringify({ score: judge.output_text }));",
      replacement.join('\n'),
    );
    expect(
      detectCejelLlmEvaluationRules([{ ...source, contents }]).some(
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

  it('detects a returned TypeScript evaluation collection with model-only provenance', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluate-batch.ts',
      contents: [
        "import OpenAI from 'openai';",
        'const openai = new OpenAI();',
        'async function evaluateBatch(cases: readonly string[]) {',
        '  const results = [];',
        '  for (const caseId of cases) {',
        "    const response = await openai.responses.create({ model: 'gpt-5', input: caseId });",
        '    results.push({ modelId: response.model, caseId, score: 1, verdict: response.output_text });',
        '  }',
        '  return results;',
        '}',
      ].join('\n'),
    };

    const findings = detectCejelLlmEvaluationRules([source]).filter(
      (finding) => finding.ruleId === 'LLM-PRV-001',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence.line).toBe(7);
  });

  it.each([
    'promptDigest: promptDigest',
    'configId: evaluationConfigId',
    'policyHash: policyHash',
  ])('suppresses the TypeScript collection form when %s is retained', (lineage) => {
    const source: LlmSourceFile = {
      path: 'src/evaluate-batch.ts',
      contents: [
        "import OpenAI from 'openai';",
        'const openai = new OpenAI();',
        'async function evaluateBatch(cases: readonly string[]) {',
        '  const results = [];',
        "  const response = await openai.responses.create({ model: 'gpt-5', input: cases[0] });",
        `  results.push({ modelId: response.model, score: 1, ${lineage} });`,
        '  return results;',
        '}',
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-PRV-001',
      ),
    ).toEqual([]);
  });

  it.each([
    [
      'direct return',
      [
        'async def evaluate_response(client, candidate):',
        '    judged = await client.responses.create(model="gpt-5", input=candidate)',
        '    return {"model_id": judged.model, "score": 1, "verdict": judged.output_text}',
      ],
    ],
    [
      'bound return',
      [
        'async def score_candidate(model, candidate):',
        '    judged = await model.ainvoke(candidate)',
        '    record = {"model_id": judged.model, "score": 1, "status": "complete"}',
        '    return record',
      ],
    ],
    [
      'collection store',
      [
        'async def benchmark_cases(model, cases, results):',
        '    judged = await model.ainvoke(cases[0])',
        '    results.append({"model_id": judged.model, "score": 1, "result": judged.content})',
        '    return results',
      ],
    ],
    [
      'structured log',
      [
        'async def grade_output(judge, candidate, logger):',
        '    judged = await judge.ainvoke(candidate)',
        '    logger.info("evaluation", extra={"model_id": judged.model, "score": 1, "verdict": judged.content})',
      ],
    ],
  ] as const)('detects bounded Python provenance in the %s form', (_name, lines) => {
    const findings = detectCejelLlmEvaluationRules([{
      path: 'src/evaluator.py',
      contents: lines.join('\n'),
    }]).filter((finding) => finding.ruleId === 'LLM-PRV-001');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.confidence).toBe('high');
  });

  it.each([
    ['prompt digest', '"promptDigest": prompt_digest'],
    ['configuration ID', '"config_id": config_id'],
    ['policy hash', '"policy_hash": policy_hash'],
  ])('suppresses Python provenance when immutable %s is retained', (_name, lineage) => {
    const source: LlmSourceFile = {
      path: 'src/evaluator.py',
      contents: [
        'async def evaluate_response(client, candidate):',
        '    judged = await client.responses.create(model="gpt-5", input=candidate)',
        `    return {"model_id": judged.model, "score": 1, ${lineage}}`,
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-PRV-001',
      ),
    ).toEqual([]);
  });

  it('does not connect a Python model call to a non-evaluator result scope', () => {
    const source: LlmSourceFile = {
      path: 'src/service.py',
      contents: [
        'async def generate_reply(client, candidate):',
        '    response = await client.responses.create(model="gpt-5", input=candidate)',
        '    return {"model_id": response.model, "score": 1, "result": response.output_text}',
      ].join('\n'),
    };
    expect(detectCejelLlmEvaluationRules([source])).toEqual([]);
  });

  it('uses the owning Python evaluator class as bounded context for a generic method name', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluator.py',
      contents: [
        'class EvaluationRunner:',
        '    async def run(self, client, candidate):',
        '        judged = await client.responses.create(model="gpt-5", input=candidate)',
        '        return {"model_id": judged.model, "score": 1, "verdict": judged.output_text}',
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-PRV-001',
      ),
    ).toHaveLength(1);
  });

  it('does not borrow a nested Python helper invocation for an outer result', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluator.py',
      contents: [
        'async def evaluate_response(client, candidate):',
        '    async def unrelated_helper():',
        '        return await client.responses.create(model="gpt-5", input=candidate)',
        '    return {"model_id": "gpt-5", "score": 1, "verdict": "pending"}',
      ].join('\n'),
    };
    expect(detectCejelLlmEvaluationRules([source])).toEqual([]);
  });

  it('does not treat a deterministic Python metric call as a model or judge invocation', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluator.py',
      contents: [
        'def score_candidate(rouge, candidate):',
        '    score = rouge.score(candidate)',
        '    return {"model_id": "candidate-v1", "score": score, "verdict": "measured"}',
      ].join('\n'),
    };
    expect(detectCejelLlmEvaluationRules([source])).toEqual([]);
  });

  it('does not treat a deterministic similarity-model prediction as a generative judge', () => {
    const source: LlmSourceFile = {
      path: 'src/similarity_evaluator.py',
      contents: [
        'class SimilarityEvaluator:',
        '    def run(self, pairs):',
        '        scores = self._similarity_model.predict(pairs)',
        '        return {"score": mean(scores), "individual_scores": scores}',
      ].join('\n'),
    };
    const provenanceRule = CEJEL_LLM_EVALUATION_RULES.find(
      (rule) => rule.id === 'LLM-PRV-001',
    );
    expect(provenanceRule?.applies([source])).toBe(false);
    expect(provenanceRule?.detect([source])).toEqual([]);
  });

  it('detects a typed LangChain evaluator collection that returns raw structured responses', () => {
    const source: LlmSourceFile = {
      path: 'src/llm-evaluation-runner.ts',
      contents: [
        "import { RunnableSequence } from '@langchain/core/runnables';",
        "import { PromptTemplate } from '@langchain/core/prompts';",
        'export class EvaluationRunner {',
        '  async runEvaluators(modelWithStructuredOutput: unknown) {',
        '    const evaluationResults: unknown[] = [];',
        '    const executor = RunnableSequence.from([',
        "      PromptTemplate.fromTemplate('score {answer}'),",
        '      modelWithStructuredOutput,',
        '    ]);',
        '    const response = await executor.invoke({ answer: candidate });',
        '    evaluationResults.push(response);',
        '    return evaluationResults;',
        '  }',
        '}',
      ].join('\n'),
    };
    const findings = detectCejelLlmEvaluationRules([source]).filter(
      (finding) => finding.ruleId === 'LLM-PRV-001',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence.line).toBe(10);

    const withConfig = source.contents.replace(
      'evaluationResults.push(response);',
      'evaluationResults.push(response);\n    evaluationResults.configId = evaluationConfigId;',
    );
    expect(
      detectCejelLlmEvaluationRules([{ ...source, contents: withConfig }]).filter(
        (finding) => finding.ruleId === 'LLM-PRV-001',
      ),
    ).toEqual([]);
  });

  it('detects a Python chat-generator evaluation return carrying results and provider metadata', () => {
    const source: LlmSourceFile = {
      path: 'src/llm_evaluator.py',
      contents: [
        'class LLMEvaluator:',
        '    def run(self, **inputs):',
        '        result = self._chat_generator.run(messages=inputs["messages"])',
        '        results = [parse_reply(result)]',
        '        metadata = [result["replies"][0].meta]',
        '        return {"results": results, "meta": metadata}',
      ].join('\n'),
    };
    const provenanceRule = CEJEL_LLM_EVALUATION_RULES.find(
      (rule) => rule.id === 'LLM-PRV-001',
    );
    expect(provenanceRule?.applies([source])).toBe(true);
    expect(provenanceRule?.detect([source])).toHaveLength(1);
  });

  it('detects a multiline Python evaluator that mutates and returns a structured result', () => {
    const source: LlmSourceFile = {
      path: 'src/agent_evaluator.py',
      contents: [
        'class AgentEvaluator:',
        '    def evaluate(',
        '        self,',
        '        agent,',
        '        trace,',
        '    ) -> AgentEvaluationResult:',
        '        result = AgentEvaluationResult(agent_id=agent.id)',
        '        score = self.evaluator.evaluate(agent=agent, trace=trace)',
        '        result.metrics["quality"] = score',
        '        return result',
      ].join('\n'),
    };
    const findings = detectCejelLlmEvaluationRules([source]).filter(
      (finding) => finding.ruleId === 'LLM-PRV-001',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence.line).toBe(9);
  });

  it.each([
    [
      'accuracy result',
      [
        'class AccuracyEval:',
        '    def run(self, evaluator_agent):',
        '        result = self.evaluate_answer(evaluator_agent=evaluator_agent)',
        '        self.result.results.append(result)',
        '        store_result_in_file(result=self.result)',
        '        return self.result',
      ],
      5,
    ],
    [
      'agent-as-judge result',
      [
        'class AgentAsJudge:',
        '    def run(self, evaluator):',
        '        result = AgentAsJudgeResult(run_id="run")',
        '        evaluation = self._evaluate(evaluator_agent=evaluator)',
        '        result.results.append(evaluation)',
        '        store_result_in_file(result=result)',
        '        return result',
      ],
      6,
    ],
  ] as const)('detects a persisted Python %s at the observable sink', (_name, lines, line) => {
    const source: LlmSourceFile = {
      path: 'src/evaluation.py',
      contents: lines.join('\n'),
    };
    const findings = detectCejelLlmEvaluationRules([source]).filter(
      (finding) => finding.ruleId === 'LLM-PRV-001',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence.line).toBe(line);

    const withPolicy = source.contents.replace(
      'store_result_in_file(',
      'store_result_in_file(policy_hash=policy_hash, ',
    );
    expect(
      detectCejelLlmEvaluationRules([{ ...source, contents: withPolicy }]).filter(
        (finding) => finding.ruleId === 'LLM-PRV-001',
      ),
    ).toEqual([]);
  });
});
