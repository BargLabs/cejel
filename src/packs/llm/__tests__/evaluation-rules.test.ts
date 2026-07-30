import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CEJEL_LLM_EVALUATION_RULES,
  detectCejelLlmEvaluationRules,
} from '../evaluation-rules.js';
import { supportedJavaScriptModelCallIndices } from '../javascript-integrations.js';
import {
  detectPythonMissingDenominator,
  detectPythonMissingEvaluationProvenance,
} from '../python-evaluation-rules.js';
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
        'from openai import OpenAI',
        '',
        'async def evaluate_response(candidate):',
        '    client = OpenAI()',
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
        'from openai import OpenAI',
        '',
        'async def evaluate_response(candidate):',
        '    client = OpenAI()',
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
        'from openai import OpenAI',
        '',
        'async def generate_reply(candidate):',
        '    client = OpenAI()',
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
        'from openai import OpenAI',
        '',
        'class EvaluationRunner:',
        '    async def run(self, candidate):',
        '        client = OpenAI()',
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
        'from openai import OpenAI',
        '',
        'async def evaluate_response(candidate):',
        '    client = OpenAI()',
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

  it('detects a Python evaluation aggregate emitted without its eligible-case denominator', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.py',
      contents: [
        'def run_benchmark(judge, cases):',
        '    scores = []',
        '    for case in cases:',
        '        verdict = judge.evaluate(case)',
        '        if verdict is not None:',
        '            scores.append(verdict.score)',
        '    average_score = sum(scores) / len(scores)',
        '    return {"model_id": "judge-v1", "average_score": average_score}',
      ].join('\n'),
    };
    const findings = detectCejelLlmEvaluationRules([source]).filter(
      (finding) => finding.ruleId === 'LLM-EVL-001',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.confidence).toBe('high');
  });

  it('recognizes an import-resolved official Python SDK evaluation invocation', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.py',
      contents: [
        'from openai import OpenAI',
        '',
        'def run_benchmark(cases):',
        '    client = OpenAI()',
        '    scores = []',
        '    for case in cases:',
        '        response = client.responses.create(model="gpt-5", input=case)',
        '        scores.append(response.score)',
        '    average_score = sum(scores) / len(scores)',
        '    return {"model_id": "gpt-5", "average_score": average_score}',
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-EVL-001',
      ),
    ).toHaveLength(1);
  });

  it.each([
    [
      'unrelated lookalike client',
      [
        'def run_benchmark(cases):',
        '    client = MetricsClient()',
      ],
    ],
    [
      'parameter shadowing an official client',
      [
        'from openai import OpenAI',
        'client = OpenAI()',
        '',
        'def run_benchmark(client, cases):',
      ],
    ],
  ] as const)(
    'abstains from a Python SDK-shaped evaluation invocation on an %s',
    (_name, prefix) => {
      const source: LlmSourceFile = {
        path: 'src/evaluation/benchmarks.py',
        contents: [
          ...prefix,
          '    scores = []',
          '    for case in cases:',
          '        response = client.responses.create(model="gpt-5", input=case)',
          '        scores.append(response.score)',
          '    average_score = sum(scores) / len(scores)',
          '    return {"model_id": "gpt-5", "average_score": average_score}',
        ].join('\n'),
      };
      expect(
        detectCejelLlmEvaluationRules([source]).filter(
          (finding) => finding.ruleId === 'LLM-EVL-001',
        ),
      ).toEqual([]);
    },
  );

  it('does not treat an unresolved Python SDK-shaped call as provenance evidence', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluator.py',
      contents: [
        'async def evaluate_response(client, candidate):',
        '    judged = await client.responses.create(model="gpt-5", input=candidate)',
        '    return {"model_id": judged.model, "score": 1, "verdict": judged.output_text}',
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-PRV-001',
      ),
    ).toEqual([]);
  });

  it('suppresses the Python denominator finding when the eligible count is retained', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.py',
      contents: [
        'def run_benchmark(judge, cases):',
        '    scores = []',
        '    for case in cases:',
        '        verdict = judge.evaluate(case)',
        '        if verdict is not None:',
        '            scores.append(verdict.score)',
        '    average_score = sum(scores) / len(scores)',
        '    return {"average_score": average_score, "eligible_count": len(scores)}',
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-EVL-001',
      ),
    ).toEqual([]);
  });

  it('does not flag a Python aggregate with no preceding model or judge invocation', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.py',
      contents: [
        'def summarize_scores(scores):',
        '    average_score = sum(scores) / len(scores)',
        '    return {"average_score": average_score}',
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-EVL-001',
      ),
    ).toEqual([]);
  });

  it('detects a Python statistics.mean aggregate emitted without its eligible-case denominator', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.py',
      contents: [
        'import statistics',
        '',
        'def run_benchmark(judge, cases):',
        '    scores = [judge.evaluate(case).score for case in cases]',
        '    mean_score = statistics.mean(scores)',
        '    return {"mean_score": mean_score}',
      ].join('\n'),
    };
    const findings = detectCejelLlmEvaluationRules([source]).filter(
      (finding) => finding.ruleId === 'LLM-EVL-001',
    );
    expect(findings).toHaveLength(1);
  });

  it('detects a Python per-metric aggregate dict built via subscript assignment', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.py',
      contents: [
        'class BenchmarkRunner:',
        '    def run_benchmark(self, judge, metrics, examples):',
        '        results = []',
        '        for example in examples:',
        '            results.append(judge.evaluate(example))',
        '        aggregate_scores = {}',
        '        for metric in metrics:',
        '            scores = [r.metrics.get(metric, 0) for r in results if metric in r.metrics]',
        '            if scores:',
        '                aggregate_scores[metric] = sum(scores) / len(scores)',
        '            else:',
        '                aggregate_scores[metric] = 0.0',
        '        benchmark_result = BenchmarkResult(aggregate_scores=aggregate_scores)',
        '        return benchmark_result',
      ].join('\n'),
    };
    const findings = detectCejelLlmEvaluationRules([source]).filter(
      (finding) => finding.ruleId === 'LLM-EVL-001',
    );
    expect(findings).toHaveLength(1);
  });

  it.each([
    [
      'attribute',
      'metrics.accuracy = eligible.filter((item) => item.correct).length / eligible.length;',
      "writeFileSync('evaluation.json', JSON.stringify(metrics));",
    ],
    [
      'static subscript',
      "metrics['accuracy'] = eligible.filter((item) => item.correct).length / eligible.length;",
      "writeFileSync('evaluation.json', JSON.stringify(metrics));",
    ],
    [
      'dynamic subscript on an aggregate-named container',
      'aggregateScores[metric] = scores.reduce((sum, value) => sum + value, 0) / scores.length;',
      "writeFileSync('evaluation.json', JSON.stringify({ aggregateScores, modelId, promptDigest }));",
    ],
  ] as const)(
    'detects a JavaScript aggregate assigned through a local %s',
    (_name, assignment, emission) => {
      const source: LlmSourceFile = {
        path: 'src/evaluation/benchmarks.ts',
        contents: [
          "import OpenAI from 'openai';",
          "import { writeFileSync } from 'node:fs';",
          'const client = new OpenAI();',
          "await client.responses.create({ model: 'gpt-5', input: candidate });",
          'const eligible = cases.filter((item) => item.status === "ok");',
          'const scores = eligible.map((item) => item.score);',
          'const metrics = { modelId, promptDigest };',
          'const aggregateScores = {};',
          assignment,
          emission,
        ].join('\n'),
      };
      expect(
        detectCejelLlmEvaluationRules([source]).filter(
          (finding) => finding.ruleId === 'LLM-EVL-001',
        ),
      ).toHaveLength(1);
    },
  );

  it('suppresses a JavaScript attribute aggregate when the emitted result retains its denominator', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.ts',
      contents: [
        "import OpenAI from 'openai';",
        "import { writeFileSync } from 'node:fs';",
        'const client = new OpenAI();',
        "await client.responses.create({ model: 'gpt-5', input: candidate });",
        'const eligible = cases.filter((item) => item.status === "ok");',
        'const metrics = { modelId, promptDigest };',
        'metrics.accuracy = eligible.filter((item) => item.correct).length / eligible.length;',
        'metrics.eligibleTotal = eligible.length;',
        "writeFileSync('evaluation.json', JSON.stringify(metrics));",
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-EVL-001',
      ),
    ).toEqual([]);
  });

  it('does not treat a mid-word JavaScript property substring as an aggregate name', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.ts',
      contents: [
        "import OpenAI from 'openai';",
        "import { writeFileSync } from 'node:fs';",
        'const client = new OpenAI();',
        "await client.responses.create({ model: 'gpt-5', input: candidate });",
        'const flags = cases.map((item) => item.moderate);',
        'const metrics = { modelId, promptDigest };',
        'metrics.moderateCount = flags.reduce((sum, value) => sum + value, 0) / flags.length;',
        "writeFileSync('evaluation.json', JSON.stringify(metrics));",
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-EVL-001',
      ),
    ).toEqual([]);
  });

  it('does not combine a JavaScript aggregate and identifier emitter across local scopes', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.ts',
      contents: [
        "import OpenAI from 'openai';",
        "import { writeFileSync } from 'node:fs';",
        'async function calculateEvaluation() {',
        '  const client = new OpenAI();',
        "  await client.responses.create({ model: 'gpt-5', input: candidate });",
        '  const eligible = cases.filter((item) => item.status === "ok");',
        '  const metrics = {};',
        '  metrics.accuracy = eligible.filter((item) => item.correct).length / eligible.length;',
        '}',
        'function publishUnrelatedMetrics() {',
        '  const metrics = { accuracy: cachedAccuracy, modelId, promptDigest };',
        "  writeFileSync('evaluation.json', JSON.stringify(metrics));",
        '}',
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-EVL-001',
      ),
    ).toEqual([]);
  });

  it('does not infer aggregate lineage from an unrelated emitted property value', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.ts',
      contents: [
        "import OpenAI from 'openai';",
        "import { writeFileSync } from 'node:fs';",
        'const client = new OpenAI();',
        "await client.responses.create({ model: 'gpt-5', input: candidate });",
        'const eligible = cases.filter((item) => item.status === "ok");',
        'const metrics = { modelId, promptDigest };',
        'metrics.accuracy = eligible.filter((item) => item.correct).length / eligible.length;',
        "writeFileSync('evaluation.json', JSON.stringify({ accuracy: cachedAccuracy, modelId, promptDigest }));",
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-EVL-001',
      ),
    ).toEqual([]);
  });

  it('does not connect an emitted object to an aggregate assigned after emission', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.ts',
      contents: [
        "import OpenAI from 'openai';",
        "import { writeFileSync } from 'node:fs';",
        'const client = new OpenAI();',
        "await client.responses.create({ model: 'gpt-5', input: candidate });",
        'const eligible = cases.filter((item) => item.status === "ok");',
        'const metrics = { modelId, promptDigest };',
        "writeFileSync('evaluation.json', JSON.stringify(metrics));",
        'metrics.accuracy = eligible.filter((item) => item.correct).length / eligible.length;',
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-EVL-001',
      ),
    ).toEqual([]);
  });

  it('does not retain aggregate lineage after the emitted variable is overwritten', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.ts',
      contents: [
        "import OpenAI from 'openai';",
        "import { writeFileSync } from 'node:fs';",
        'const client = new OpenAI();',
        "await client.responses.create({ model: 'gpt-5', input: candidate });",
        'const eligible = cases.filter((item) => item.status === "ok");',
        'let accuracy = eligible.filter((item) => item.correct).length / eligible.length;',
        'accuracy = cachedAccuracy;',
        "writeFileSync('evaluation.json', JSON.stringify({ accuracy, modelId, promptDigest }));",
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-EVL-001',
      ),
    ).toEqual([]);
  });

  it('does not combine evaluation evidence across sibling callback scopes', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.ts',
      contents: [
        "import OpenAI from 'openai';",
        "import { writeFileSync } from 'node:fs';",
        'const client = new OpenAI();',
        'cases.forEach(async (candidate) => {',
        "  await client.responses.create({ model: 'gpt-5', input: candidate });",
        '  const eligible = cases.filter((item) => item.status === "ok");',
        '  const accuracy = eligible.filter((item) => item.correct).length / eligible.length;',
        '});',
        'queueMicrotask(() => {',
        "  writeFileSync('evaluation.json', JSON.stringify({ accuracy, modelId, promptDigest }));",
        '});',
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-EVL-001',
      ),
    ).toEqual([]);
  });

  it('detects a Python aggregate assigned to a local result attribute', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.py',
      contents: [
        'class BenchmarkRunner:',
        '    def run_benchmark(self, judge, cases):',
        '        scores = [judge.evaluate(case).score for case in cases]',
        '        result = BenchmarkResult(model_id="judge-v1")',
        '        result.average_score = sum(scores) / len(scores)',
        '        return result',
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-EVL-001',
      ),
    ).toHaveLength(1);
  });

  it.each([
    [
      'return',
      [
        '        return result',
        '        result.eligible_count = len(scores)',
        '        store_result(result, eligible_count=result.eligible_count)',
      ],
    ],
    [
      'persistence call',
      [
        '        store_result(result)',
        '        result.eligible_count = len(scores)',
        '        return result',
      ],
    ],
  ] as const)(
    'ignores Python denominator mutations after the first observable %s',
    (_name, observableLines) => {
      const source: LlmSourceFile = {
        path: 'src/evaluation/benchmarks.py',
        contents: [
          'class BenchmarkRunner:',
          '    def run_benchmark(self, judge, cases):',
          '        scores = [judge.evaluate(case).score for case in cases]',
          '        result = BenchmarkResult(model_id="judge-v1")',
          '        result.average_score = sum(scores) / len(scores)',
          ...observableLines,
        ].join('\n'),
      };
      expect(
        detectCejelLlmEvaluationRules([source]).filter(
          (finding) => finding.ruleId === 'LLM-EVL-001',
        ),
      ).toHaveLength(1);
    },
  );

  it('ignores Python provenance mutations after the result is returned', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.py',
      contents: [
        'class BenchmarkRunner:',
        '    def run_benchmark(self, judge, case):',
        '        verdict = judge.evaluate(case)',
        '        result = EvaluationResult(model_id="judge-v1")',
        '        result.score = verdict.score',
        '        return result',
        '        result.config_id = config_id',
        '        store_result(result, config_id=result.config_id)',
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-PRV-001',
      ),
    ).toHaveLength(1);
  });

  it('suppresses a Python result-attribute aggregate when the result retains its denominator', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.py',
      contents: [
        'class BenchmarkRunner:',
        '    def run_benchmark(self, judge, cases):',
        '        scores = [judge.evaluate(case).score for case in cases]',
        '        result = BenchmarkResult(model_id="judge-v1")',
        '        result.average_score = sum(scores) / len(scores)',
        '        result.eligible_count = len(scores)',
        '        return result',
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-EVL-001',
      ),
    ).toEqual([]);
  });

  it('recognizes a domain-named manager component (metrics_manager.evaluate) as a judge invocation', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.py',
      contents: [
        'class BenchmarkManager:',
        '    def run_benchmark(self, examples, metrics):',
        '        scores = []',
        '        for example in examples:',
        '            result = self.metrics_manager.evaluate(example)',
        '            scores.append(result.score)',
        '        average_score = sum(scores) / len(scores)',
        '        return {"average_score": average_score}',
      ].join('\n'),
    };
    const findings = detectCejelLlmEvaluationRules([source]).filter(
      (finding) => finding.ruleId === 'LLM-EVL-001',
    );
    expect(findings).toHaveLength(1);
  });

  it('does not treat a generic metrics/telemetry component as a judge invocation', () => {
    // Regression test: a bare "metrics" keyword previously matched any <x>metrics<y> component
    // paired with a common method name, causing false positives on non-judge telemetry objects.
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.py',
      contents: [
        'class ScoreEvaluator:',
        '    def run_benchmark(self, cases):',
        '        outputs = []',
        '        for case in cases:',
        '            outputs.append(case.value)',
        '            self.summary_metrics.run(case)',
        '        return {"scores": outputs, "model_id": "gpt-x"}',
      ].join('\n'),
    };
    expect(detectCejelLlmEvaluationRules([source])).toEqual([]);
  });

  it('does not treat a mid-word substring as an aggregate name', () => {
    // Regression test: PYTHON_AGGREGATE_NAME_PATTERN previously matched "rate"/"mean"/etc. as an
    // unanchored substring, so e.g. "moderate_count" (containing "rate" inside "moderate") could
    // wrongly qualify as an aggregate name.
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.py',
      contents: [
        'def run_benchmark(judge, cases, flags):',
        '    scores = [judge.evaluate(case).score for case in cases]',
        '    moderate_count = sum(flags) / len(flags)',
        '    return {"moderate_count": moderate_count}',
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-EVL-001',
      ),
    ).toEqual([]);
  });

  it('suppresses a denominator finding when every other emitted key is an outcome count', () => {
    // Regression test: the "all outcome counts" suppression branch was unreachable dead code
    // (the aggregate's own key was always counted against itself). Fixed to exclude the
    // aggregate's own key(s) before checking whether everything else is just an outcome count.
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.py',
      contents: [
        'def run_benchmark(judge, cases):',
        '    scores = []',
        '    errors = 0',
        '    for case in cases:',
        '        verdict = judge.evaluate(case)',
        '        if verdict is None:',
        '            errors += 1',
        '        else:',
        '            scores.append(verdict.score)',
        '    average_score = sum(scores) / len(scores)',
        '    return {"average_score": average_score, "errors": errors}',
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-EVL-001',
      ),
    ).toEqual([]);
  });

  it('scans a long non-matching underscore-delimited identifier chain in linear time', () => {
    // Regression test for a quadratic-time backtracking bug in the widened
    // PYTHON_MODEL_OR_JUDGE_CALL_PATTERN: a long run of "word_" segments that never resolves to a
    // recognized `.method(` call previously took seconds to scan; must stay well under a second.
    // Exercises the two Python detectors directly (not detectCejelLlmEvaluationRules) so this stays
    // a targeted guard on the pattern that was actually fixed, rather than on the full rule
    // pipeline, which also runs unrelated JS-side detectors against every file regardless of
    // extension and can be slow for its own, separate reasons.
    const longIdentifier = 'a_model_b_'.repeat(8000);
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.py',
      contents: [
        'def run_benchmark(judge):',
        `    ${longIdentifier}end = 1`,
        '    return {}',
      ].join('\n'),
    };
    const start = performance.now();
    detectPythonMissingEvaluationProvenance(source);
    detectPythonMissingDenominator(source);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('scans a long non-matching identifier chain through the JS-side call/scope detectors in linear time', () => {
    // Regression test for a second, pre-existing quadratic-time backtracking bug found while
    // diagnosing the one above: supportedJavaScriptModelCallIndices (and the arrow/function-scope
    // patterns it relies on via functionScopes) each had an unbounded [A-Za-z_$][\w$]* continuation
    // followed by a check that usually fails on this input, causing the same per-start-offset
    // backtracking blowup. It matters here specifically because completeLocalSource/
    // hasSupportedEvaluationImport gate on file *path* shape, not extension, so this JS-side
    // scanning runs against every file -- including .py files -- regardless of language.
    const longIdentifier = 'a_model_b_'.repeat(8000);
    const contents = [
      'def run_benchmark(judge):',
      `    ${longIdentifier}end = 1`,
      '    return {}',
    ].join('\n');
    const start = performance.now();
    supportedJavaScriptModelCallIndices(contents);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('indexes JavaScript scopes once for many aggregate-emission pairs', () => {
    const pairs = Array.from({ length: 200 }, (_, index) => [
      `const scores_${index} = cases.map((item) => item.score);`,
      `const accuracy_${index} = scores_${index}.reduce((sum, value) => sum + value, 0) / scores_${index}.length;`,
      `writeFileSync('evaluation-${index}.json', JSON.stringify({ accuracy_${index}, modelId, promptDigest }));`,
    ].join('\n'));
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.ts',
      contents: [
        "import OpenAI from 'openai';",
        "import { writeFileSync } from 'node:fs';",
        'const client = new OpenAI();',
        "await client.responses.create({ model: 'gpt-5', input: candidate });",
        ...pairs,
      ].join('\n'),
    };
    const start = performance.now();
    detectCejelLlmEvaluationRules([source]);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('still treats retained raw per-example results as a sufficient denominator substitute even for a subscript-built aggregate dict', () => {
    // Documents an intentional negative boundary: BenchmarkResult here retains the full raw
    // `results` list alongside `aggregate_scores`, so per the rule's own "denominator or raw
    // case-level results" contract this does not fire -- even though each individual metric's
    // eligible count is technically a filtered subset of `results`. Widening this further would
    // require tracing the per-metric filter, which is out of scope for this detector.
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.py',
      contents: [
        'class BenchmarkManager:',
        '    def run_benchmark(self, examples, metrics):',
        '        results = []',
        '        for example in examples:',
        '            results.append(self.metrics_manager.evaluate(example))',
        '        aggregate_scores = {}',
        '        for metric in metrics:',
        '            scores = [r.metrics.get(metric, 0) for r in results if metric in r.metrics]',
        '            if scores:',
        '                aggregate_scores[metric] = sum(scores) / len(scores)',
        '        return BenchmarkResult(results=results, aggregate_scores=aggregate_scores)',
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-EVL-001',
      ),
    ).toEqual([]);
  });

  it('does not flag a Python statistics.mean aggregate with a retained denominator', () => {
    const source: LlmSourceFile = {
      path: 'src/evaluation/benchmarks.py',
      contents: [
        'import statistics',
        '',
        'def run_benchmark(judge, cases):',
        '    scores = [judge.evaluate(case).score for case in cases]',
        '    mean_score = statistics.mean(scores)',
        '    return {"mean_score": mean_score, "total_cases": len(scores)}',
      ].join('\n'),
    };
    expect(
      detectCejelLlmEvaluationRules([source]).filter(
        (finding) => finding.ruleId === 'LLM-EVL-001',
      ),
    ).toEqual([]);
  });
});
