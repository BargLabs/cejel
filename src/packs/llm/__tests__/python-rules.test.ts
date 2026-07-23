import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CEJEL_LLM_PYTHON_RULES,
  hasSupportedPythonLlmIntegration,
} from '../python-rules.js';
import type { LlmSourceFile } from '../rules.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function source(name: string): LlmSourceFile {
  return {
    path: `src/${name}.py`,
    contents: readFileSync(join(fixtureDir, name), 'utf8'),
  };
}

describe('Free LLM Pack Python rule foundation', () => {
  it('exports only the three enabled frozen rule families with explicit limitations', () => {
    expect(CEJEL_LLM_PYTHON_RULES.map((rule) => rule.id)).toEqual([
      'LLM-IOH-001',
      'LLM-AGY-002',
      'LLM-DAT-001',
    ]);
    for (const rule of CEJEL_LLM_PYTHON_RULES) {
      expect(rule.evidenceContract.length).toBeGreaterThan(40);
      expect(rule.exclusions.length).toBeGreaterThan(1);
    }
  });

  it.each([
    ['LLM-IOH-001', 'python-unsafe-sink'],
    ['LLM-AGY-002', 'python-unbounded-loop'],
    ['LLM-DAT-001', 'python-sensitive-prompt'],
  ] as const)('%s has positive and negative official-SDK fixtures', (ruleId, stem) => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === ruleId);
    expect(rule).toBeDefined();

    const positiveFindings = rule?.detect(source(`${stem}.positive.fixture`)) ?? [];
    const negativeFindings = rule?.detect(source(`${stem}.negative.fixture`)) ?? [];

    expect(positiveFindings).toHaveLength(1);
    expect(positiveFindings[0]?.ruleId).toBe(ruleId);
    expect(positiveFindings[0]?.evidence.path).toContain(stem);
    expect(positiveFindings[0]?.evidence.line).toBeGreaterThan(0);
    expect(negativeFindings).toEqual([]);
  });

  it('recognizes official OpenAI and Anthropic Python call shapes', () => {
    expect(hasSupportedPythonLlmIntegration(source('python-unsafe-sink.positive.fixture'))).toBe(
      true,
    );
    expect(hasSupportedPythonLlmIntegration(source('python-unbounded-loop.positive.fixture'))).toBe(
      true,
    );
  });

  it.each([
    ['LLM-IOH-001', 'python-anthropic-unsafe-sink'],
    ['LLM-AGY-002', 'python-openai-unbounded-loop'],
    ['LLM-DAT-001', 'python-anthropic-sensitive-prompt'],
  ] as const)('%s covers both polarities of the second Python SDK syntax shape', (ruleId, stem) => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === ruleId);
    const findings = rule?.detect(source(`${stem}.positive.fixture`)) ?? [];
    const negative = rule?.detect(source(`${stem}.negative.fixture`)) ?? [];

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe(ruleId);
    expect(findings[0]?.evidence.line).toBeGreaterThan(0);
    expect(negative).toEqual([]);
  });

  it('does not treat an API key used for client construction as prompt disclosure', () => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-DAT-001');
    expect(rule?.detect(source('python-sensitive-prompt.negative.fixture'))).toEqual([]);
  });

  it('does not attribute unrelated same-shape Python calls or outputs to a real SDK client', () => {
    const file: LlmSourceFile = {
      path: 'src/mixed.py',
      contents: [
        'from openai import OpenAI',
        'client = OpenAI()',
        "model_response = client.responses.create(model='gpt-5', input='safe')",
        "mail = mailbox.responses.create(input=os.getenv('DATABASE_PASSWORD'))",
        'analytics = internal_job()',
        'exec(analytics.output_text)',
      ].join('\n'),
    };
    for (const rule of CEJEL_LLM_PYTHON_RULES) {
      expect(rule.detect(file)).toEqual([]);
    }
  });

  it('does not accept a function parameter shadowing an SDK client binding', () => {
    const file: LlmSourceFile = {
      path: 'src/shadow.py',
      contents: [
        'from openai import OpenAI',
        'client = OpenAI()',
        'def process_mail(client):',
        "    response = client.responses.create(input='mail')",
        '    exec(response.output_text)',
      ].join('\n'),
    };
    expect(hasSupportedPythonLlmIntegration(file)).toBe(false);
    for (const rule of CEJEL_LLM_PYTHON_RULES) expect(rule.detect(file)).toEqual([]);
  });

  it.each([
    [
      'a later line',
      [
        'from openai import OpenAI',
        'client = OpenAI()',
        'client = mailbox',
        "client.responses.create(input=os.getenv('DATABASE_URL'))",
      ],
    ],
    [
      'an earlier same-line statement',
      [
        'from openai import OpenAI',
        'client = OpenAI()',
        "client = mailbox; client.responses.create(input=os.getenv('DATABASE_URL'))",
      ],
    ],
    [
      'constructor reassignment',
      [
        'from openai import OpenAI',
        'OpenAI = FakeClient',
        "OpenAI().responses.create(input=os.getenv('DATABASE_URL'))",
      ],
    ],
  ])('does not retain Python SDK provenance after %s', (_name, lines) => {
    const file: LlmSourceFile = { path: 'src/reassigned.py', contents: lines.join('\n') };

    expect(hasSupportedPythonLlmIntegration(file)).toBe(false);
    for (const rule of CEJEL_LLM_PYTHON_RULES) expect(rule.detect(file)).toEqual([]);
  });

  it('allows an earlier same-line assignment to establish genuine Python SDK provenance', () => {
    const file: LlmSourceFile = {
      path: 'src/reassigned.py',
      contents: [
        'from openai import OpenAI',
        "client = mailbox; client = OpenAI(); client.responses.create(input=os.getenv('DATABASE_URL'))",
      ].join('\n'),
    };
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-DAT-001');

    expect(hasSupportedPythonLlmIntegration(file)).toBe(true);
    expect(rule?.detect(file)).toHaveLength(1);
  });

  it('does not carry a Python model-output alias through a reassignment', () => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-IOH-001');
    const file: LlmSourceFile = {
      path: 'src/agent.py',
      contents: [
        'from openai import OpenAI',
        'response = OpenAI().responses.create(model="example", input="x")',
        'output = response.output_text',
        'output = sanitize(output)',
        'exec(output)',
      ].join('\n'),
    };

    expect(rule?.detect(file)).toEqual([]);
  });

  it('does not carry a Python model-output alias across function scope', () => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-IOH-001');
    const file: LlmSourceFile = {
      path: 'src/agent.py',
      contents: [
        'from openai import OpenAI',
        'def extract():',
        '    response = OpenAI().responses.create(model="example", input="x")',
        '    output = response.output_text',
        '    return output',
        'def unrelated():',
        '    exec(output)',
      ].join('\n'),
    };

    expect(rule?.detect(file)).toEqual([]);
  });

  it('does not extend Python sensitive-prompt evidence beyond matched call arguments', () => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-DAT-001');
    const file: LlmSourceFile = {
      path: 'src/agent.py',
      contents: [
        'import os',
        'from openai import OpenAI',
        'OpenAI().responses.create(model="example", input="public text")',
        'unrelated = os.environ["DATABASE_PASSWORD"]',
      ].join('\n'),
    };

    expect(rule?.detect(file)).toEqual([]);
  });

  it('does not treat rule-shaped Python comments or strings as executable evidence', () => {
    const file: LlmSourceFile = {
      path: 'src/agent.py',
      contents: [
        'from openai import OpenAI',
        'response = OpenAI().responses.create(model="example", input="public")',
        'output = response.output_text',
        'documentation = "exec(output) os.getenv(\\"DATABASE_PASSWORD\\") while True:"',
        '# exec(output)',
      ].join('\n'),
    };
    for (const rule of CEJEL_LLM_PYTHON_RULES) expect(rule.detect(file)).toEqual([]);
  });

  it('does not extract sensitive DAT arguments from fake Python calls in comments or strings', () => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-DAT-001');
    const file: LlmSourceFile = {
      path: 'src/agent.py',
      contents: [
        'from openai import OpenAI',
        '# OpenAI().responses.create(input=os.getenv("DATABASE_PASSWORD"))',
        'example = "OpenAI().responses.create(input=os.getenv(\\"DATABASE_PASSWORD\\"))"',
        'OpenAI().responses.create(model="example", input="public")',
      ].join('\n'),
    };

    expect(rule?.detect(file)).toEqual([]);
  });

  it('requires the Python model call to be inside the while True body', () => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-AGY-002');
    const file: LlmSourceFile = {
      path: 'src/agent.py',
      contents: [
        'from openai import OpenAI',
        'while True:',
        '    tick()',
        'OpenAI().responses.create(model="example", input="x")',
      ].join('\n'),
    };

    expect(rule?.detect(file)).toEqual([]);
  });

  it.each(['tests/test_agent.py', 'examples/unsafe.py'])(
    'does not emit Python findings from excluded path %s',
    (path) => {
      for (const [ruleId, fixtureName] of [
        ['LLM-IOH-001', 'python-unsafe-sink.positive.fixture'],
        ['LLM-AGY-002', 'python-unbounded-loop.positive.fixture'],
        ['LLM-DAT-001', 'python-sensitive-prompt.positive.fixture'],
      ] as const) {
        const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === ruleId);
        expect(rule?.detect({ path, contents: source(fixtureName).contents })).toEqual([]);
      }
    },
  );

  it('does not report Python-like patterns without an official SDK integration and call', () => {
    const unsupported: LlmSourceFile = {
      path: 'worker.py',
      contents: 'while True:\n    exec(response.output_text)\n',
    };
    expect(hasSupportedPythonLlmIntegration(unsupported)).toBe(false);
    for (const rule of CEJEL_LLM_PYTHON_RULES) {
      expect(rule.detect(unsupported)).toEqual([]);
    }
  });
});
