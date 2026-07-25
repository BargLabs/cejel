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
    [
      'tuple reassignment on a later line',
      [
        'from openai import OpenAI',
        'client = OpenAI()',
        'client, other = mailbox, value',
        "client.responses.create(input=os.getenv('DATABASE_URL'))",
      ],
    ],
    [
      'tuple reassignment in an earlier same-line statement',
      [
        'from openai import OpenAI',
        'client = OpenAI()',
        "client, other = mailbox, value; client.responses.create(input=os.getenv('DATABASE_URL'))",
      ],
    ],
    [
      'tuple reassignment inside control flow',
      [
        'from openai import OpenAI',
        'client = OpenAI()',
        'if use_mailbox:',
        '    client, other = mailbox, value',
        "client.responses.create(input=os.getenv('DATABASE_URL'))",
      ],
    ],
    [
      'nested list reassignment',
      [
        'from openai import OpenAI',
        'client = OpenAI()',
        '[client, [other]] = mailbox, [value]',
        "client.responses.create(input=os.getenv('DATABASE_URL'))",
      ],
    ],
    [
      'constructor tuple reassignment',
      [
        'from openai import OpenAI',
        'OpenAI, other = FakeClient, value',
        "OpenAI().responses.create(input=os.getenv('DATABASE_URL'))",
      ],
    ],
    [
      'annotated client reassignment',
      [
        'from openai import OpenAI',
        'client = OpenAI()',
        'client: OpenAI = mailbox',
        "client.responses.create(input=os.getenv('DATABASE_URL'))",
      ],
    ],
    [
      'chained client reassignment',
      [
        'from openai import OpenAI',
        'other = OpenAI()',
        'client = other = mailbox',
        "other.responses.create(input=os.getenv('DATABASE_URL'))",
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
        "client, other = mailbox, value; client = OpenAI(); client.responses.create(input=os.getenv('DATABASE_URL'))",
      ].join('\n'),
    };
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-DAT-001');

    expect(hasSupportedPythonLlmIntegration(file)).toBe(true);
    expect(rule?.detect(file)).toHaveLength(1);
  });

  it.each([
    [
      'an annotated assignment',
      [
        'from openai import OpenAI',
        'client: OpenAI = OpenAI()',
        "client.responses.create(input=os.getenv('DATABASE_URL'))",
      ],
    ],
    [
      'a chained assignment',
      [
        'from openai import OpenAI',
        'client = other = OpenAI()',
        "other.responses.create(input=os.getenv('DATABASE_URL'))",
      ],
    ],
  ])('allows %s to establish genuine Python SDK provenance', (_name, lines) => {
    const file: LlmSourceFile = { path: 'src/reassigned.py', contents: lines.join('\n') };
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

  it.each([
    ['counter', ['attempts += 1', 'if attempts >= 3:', '    break']],
    ['deadline', ['if time.monotonic() >= deadline:', '    raise TimeoutError()']],
    ['cancellation', ['if cancellation.is_set():', '    return']],
    ['budget', ['remaining -= 1', 'if remaining <= 0:', '    break']],
  ] as const)('does not flag a while True loop with an observable %s guard', (_name, guard) => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-AGY-002');
    const file: LlmSourceFile = {
      path: 'src/agent.py',
      contents: [
        'from openai import OpenAI',
        'while True:',
        '    OpenAI().responses.create(model="example", input="x")',
        ...guard.map((line) => `    ${line}`),
      ].join('\n'),
    };
    expect(rule?.detect(file)).toEqual([]);
  });

  it.each([
    [
      'optional iteration limit',
      [
        'max_iterations: int | None = None',
        'iteration = 0',
        'while True:',
        '    response = OpenAI().responses.create(model="example", input="x")',
        '    iteration += 1',
        '    if max_iterations is not None and iteration >= max_iterations:',
        '        break',
      ],
    ],
    [
      'unset step limit with a model stop outcome',
      [
        'def run(max_steps=None):',
        '    step = 0',
        '    while True:',
        '        response = OpenAI().responses.create(model="example", input="x")',
        '        step += 1',
        '        if max_steps is not None and step >= max_steps:',
        '            return',
        '        if response.output_text:',
        '            return',
      ],
    ],
    [
      'unset tool-round limit with a tool-call outcome',
      [
        'max_tool_rounds = None',
        'tool_round = 0',
        'while True:',
        '    response = OpenAI().chat.completions.create(model="example", messages=[])',
        '    tool_round += 1',
        '    if max_tool_rounds is not None and tool_round >= max_tool_rounds:',
        '        break',
        '    if not response.choices[0].message.tool_calls:',
        '        break',
      ],
    ],
    [
      'optional deadline with an Anthropic stop outcome',
      [
        'deadline = None',
        'while True:',
        '    response = Anthropic().messages.create(model="example", messages=[])',
        '    if deadline is not None and time.monotonic() >= deadline:',
        '        raise TimeoutError()',
        '    if response.stop_reason == "end_turn":',
        '        break',
      ],
    ],
  ] as const)('flags a while True loop with an %s', (_name, body) => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-AGY-002');
    const providerImport = body.some((line) => line.includes('Anthropic'))
      ? 'from anthropic import Anthropic'
      : 'from openai import OpenAI';
    const file: LlmSourceFile = {
      path: 'src/agent.py',
      contents: [providerImport, ...body].join('\n'),
    };

    expect(rule?.detect(file)).toHaveLength(1);
  });

  it.each([
    [
      'parameter default',
      [
        'def run(max_iterations: int = 8):',
        '    iteration = 0',
        '    while True:',
        '        OpenAI().responses.create(model="example", input="x")',
        '        iteration += 1',
        '        if iteration >= max_iterations:',
        '            break',
      ],
    ],
    [
      'local default',
      [
        'max_iterations = 8',
        'iteration = 0',
        'while True:',
        '    OpenAI().responses.create(model="example", input="x")',
        '    iteration += 1',
        '    if iteration >= max_iterations:',
        '        break',
      ],
    ],
  ] as const)('does not flag a while True loop with a finite %s', (_name, body) => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-AGY-002');
    const file: LlmSourceFile = {
      path: 'src/agent.py',
      contents: ['from openai import OpenAI', ...body].join('\n'),
    };

    expect(rule?.detect(file)).toEqual([]);
  });

  it('retains Python AGY-002 when loop exit depends only on a model outcome', () => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-AGY-002');
    const file: LlmSourceFile = {
      path: 'src/agent.py',
      contents: [
        'from openai import OpenAI',
        'while True:',
        '    response = OpenAI().responses.create(model="example", input="x")',
        '    if response.output_text:',
        '        break',
      ].join('\n'),
    };

    expect(rule?.detect(file)).toHaveLength(1);
  });

  it('retains Python AGY-002 when counter progress depends on a model outcome', () => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-AGY-002');
    const file: LlmSourceFile = {
      path: 'src/agent.py',
      contents: [
        'from openai import OpenAI',
        'attempts = 0',
        'while True:',
        '    response = OpenAI().responses.create(model="example", input="x")',
        '    if response.output_text:',
        '        attempts += 1',
        '    if attempts >= 3:',
        '        break',
      ].join('\n'),
    };

    expect(rule?.detect(file)).toHaveLength(1);
  });

  it.each([
    ['sync response', 'self._process_model_response(messages)'],
    ['async response', 'await self._aprocess_model_response(messages)'],
    ['sync stream', 'responses = self.process_response_stream(messages)'],
    ['async stream', 'responses = self.aprocess_response_stream(messages)'],
  ] as const)(
    'detects a provider-neutral abstract model loop through its %s helper',
    (_name, modelCall) => {
      const rule = CEJEL_LLM_PYTHON_RULES.find(
        (candidate) => candidate.id === 'LLM-AGY-002',
      );
      const file: LlmSourceFile = {
        path: 'src/models/base.py',
        contents: [
          'from abc import ABC, abstractmethod',
          'class BaseModel(ABC):',
          '    @abstractmethod',
          '    def invoke(self, messages):',
          '        pass',
          '    def response(self, tool_call_limit=None):',
          '        while True:',
          `            ${modelCall}`,
          '            if assistant_message.tool_calls:',
          '                continue',
          '            break',
        ].join('\n'),
      };

      expect(rule?.detect(file)).toHaveLength(1);
    },
  );

  it('does not borrow an abstract model surface from another class', () => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-AGY-002');
    const file: LlmSourceFile = {
      path: 'src/processor.py',
      contents: [
        'from abc import ABC, abstractmethod',
        'class BaseModel(ABC):',
        '    @abstractmethod',
        '    def invoke(self, messages):',
        '        pass',
        'class ResponseProcessor:',
        '    def run(self):',
        '        while True:',
        '            self._process_model_response()',
      ].join('\n'),
    };

    expect(rule?.detect(file)).toEqual([]);
  });

  it('detects an explicitly unset tool-call limit on a model-facing agent class', () => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-AGY-002');
    const file: LlmSourceFile = {
      path: 'src/agent.py',
      contents: [
        'from framework.models.base import Model',
        'class RuntimeAgent:',
        '    model: Optional[Model] = None',
        '    tools: Optional[List[Callable]] = None',
        '    tool_call_limit: Optional[int] = None',
      ].join('\n'),
    };

    expect(rule?.detect(file)).toEqual([
      expect.objectContaining({
        ruleId: 'LLM-AGY-002',
        evidence: expect.objectContaining({ path: 'src/agent.py', line: 5 }),
      }),
    ]);
  });

  it.each([
    [
      'finite tool-call limit',
      [
        'from framework.models.base import Model',
        'class RuntimeAgent:',
        '    model: Optional[Model] = None',
        '    tools: Optional[List[Callable]] = None',
        '    tool_call_limit: int = 10',
      ],
    ],
    [
      'non-model configuration class',
      [
        'from framework.models.base import Model',
        'class ToolSettings:',
        '    tools: Optional[List[Callable]] = None',
        '    tool_call_limit: Optional[int] = None',
      ],
    ],
  ] as const)('does not flag a %s', (_name, body) => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-AGY-002');
    expect(rule?.detect({ path: 'src/agent.py', contents: body.join('\n') })).toEqual([]);
  });

  it('retains Python AGY-002 when a bound-looking value never gates loop exit', () => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-AGY-002');
    const file: LlmSourceFile = {
      path: 'src/agent.py',
      contents: [
        'from openai import OpenAI',
        'max_iterations = 3',
        'while True:',
        '    OpenAI().responses.create(model="example", input="x")',
        '    observe(max_iterations)',
      ].join('\n'),
    };
    expect(rule?.detect(file)).toHaveLength(1);
  });

  it('retains Python AGY-002 when a break only exits a nested loop', () => {
    const rule = CEJEL_LLM_PYTHON_RULES.find((candidate) => candidate.id === 'LLM-AGY-002');
    const file: LlmSourceFile = {
      path: 'src/agent.py',
      contents: [
        'from openai import OpenAI',
        'while True:',
        '    OpenAI().responses.create(model="example", input="x")',
        '    for attempt in attempts:',
        '        if attempt >= 3:',
        '            break',
      ].join('\n'),
    };
    expect(rule?.detect(file)).toHaveLength(1);
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
