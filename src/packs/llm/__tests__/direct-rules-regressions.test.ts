import { describe, expect, it } from 'vitest';

import { CEJEL_LLM_V1_RULES, type LlmSourceFile } from '../rules.js';
import { detectPythonUnsafeModelOutputSink } from '../python-rules.js';

function detect(ruleId: 'LLM-IOH-001' | 'LLM-DAT-001', contents: readonly string[]) {
  const rule = CEJEL_LLM_V1_RULES.find((candidate) => candidate.id === ruleId);
  const file: LlmSourceFile = { path: 'src/agent.ts', contents: contents.join('\n') };
  return rule?.detect(file) ?? [];
}

describe('Free LLM direct JavaScript rule regressions', () => {
  it('does not carry a model-output alias across function scope', () => {
    expect(detect('LLM-IOH-001', [
      "import OpenAI from 'openai';",
      'async function extract() {',
      "  const response = await new OpenAI().responses.create({ model: 'example', input: 'x' });",
      '  const output = response.output_text;',
      '  return output;',
      '}',
      'function unrelated() {',
      '  eval(output);',
      '}',
    ])).toEqual([]);
  });

  it('does not confuse RegExp.prototype.exec with a process sink', () => {
    expect(detect('LLM-IOH-001', [
      "import OpenAI from 'openai';",
      "const response = await new OpenAI().responses.create({ model: 'example', input: 'x' });",
      'const output = response.output_text;',
      'const matcher = /allowed/;',
      'matcher.exec(output);',
    ])).toEqual([]);
  });

  it('does not confuse Python member exec with the eval builtin', () => {
    const file: LlmSourceFile = {
      path: 'src/agent.py',
      contents: [
        'from openai import OpenAI',
        'client = OpenAI()',
        "response = client.responses.create(model='example', input='x')",
        'output = response.output_text',
        "matcher = re.compile(r'allowed')",
        'matcher.exec(output)',
      ].join('\n'),
    };
    expect(detectPythonUnsafeModelOutputSink(file)).toEqual([]);
  });

  it('requires import evidence and recognizes an aliased child-process exec sink', () => {
    expect(detect('LLM-IOH-001', [
      "import OpenAI from 'openai';",
      "const response = await new OpenAI().responses.create({ model: 'example', input: 'x' });",
      'const output = response.output_text;',
      'exec(output);',
    ])).toEqual([]);
    expect(detect('LLM-IOH-001', [
      "import OpenAI from 'openai';",
      "import { exec as runProcess } from 'node:child_process';",
      "const response = await new OpenAI().responses.create({ model: 'example', input: 'x' });",
      'const output = response.output_text;',
      'runProcess(output);',
    ])).toHaveLength(1);
  });

  it('does not extract DAT arguments from fake model calls in comments or strings', () => {
    expect(detect('LLM-DAT-001', [
      "import OpenAI from 'openai';",
      '// client.responses.create({ input: process.env.DATABASE_PASSWORD });',
      "const example = 'client.responses.create({ input: process.env.DATABASE_PASSWORD })';",
      "await new OpenAI().responses.create({ model: 'example', input: 'public' });",
    ])).toEqual([]);
  });
});
