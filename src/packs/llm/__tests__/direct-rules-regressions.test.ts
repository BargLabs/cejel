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

  it('treats an imported member-tool handler parameter as observable model input', () => {
    expect(detect('LLM-IOH-001', [
      "import type { ToolAPI } from '@synthetic/agent-runtime';",
      "import { execFileSync } from 'node:child_process';",
      'function runBridge(program: string, args: string[]) {',
      '  return execFileSync(program, args);',
      '}',
      'export function attach(api: ToolAPI) {',
      '  api.registerTool({',
      "    name: 'fixed_action',",
      '    parameters: Type.Object({ target: Type.String() }),',
      '    execute(_callId, params) {',
      "      const bridgeArgs = ['act', params.target];",
      "      return runBridge('/usr/bin/bridge', bridgeArgs);",
      '    },',
      '  });',
      '}',
    ])).toEqual([
      expect.objectContaining({
        ruleId: 'LLM-IOH-001',
        evidence: expect.objectContaining({ line: 12 }),
      }),
    ]);
  });

  it('links tainted script materialization to its imported process launch', () => {
    expect(detect('LLM-IOH-001', [
      "import type { ToolAPI } from '@synthetic/agent-runtime';",
      "import { writeFileSync } from 'node:fs';",
      "import { spawn } from 'node:child_process';",
      'export function attach(api: ToolAPI) {',
      '  api.registerTool({',
      "    name: 'visible_command',",
      '    parameters: Type.Object({ command: Type.String() }),',
      '    execute(_callId, params) {',
      "      const scriptPath = '/tmp/run.sh';",
      '      const script = `#!/bin/sh\\n${params.command}`;',
      '      writeFileSync(scriptPath, script);',
      "      return spawn('terminal', [scriptPath]);",
      '    },',
      '  });',
      '}',
    ])).toEqual([
      expect.objectContaining({
        ruleId: 'LLM-IOH-001',
        evidence: expect.objectContaining({ line: 11 }),
      }),
    ]);
  });

  it('anchors multiline script materialization at the executable model input', () => {
    expect(detect('LLM-IOH-001', [
      "import type { ToolAPI } from '@synthetic/agent-runtime';",
      "import { writeFileSync } from 'node:fs';",
      "import { spawn } from 'node:child_process';",
      'export function attach(api: ToolAPI) {',
      '  api.registerTool({',
      "    name: 'visible_command',",
      '    parameters: Type.Object({ command: Type.String() }),',
      '    execute(_callId, params) {',
      "      const scriptPath = '/tmp/run.sh';",
      '      writeFileSync(',
      '        scriptPath,',
      '        [',
      "          '#!/bin/sh',",
      '          `( ${params.command} )`,',
      "        ].join('\\n'),",
      '      );',
      "      return spawn('terminal', [scriptPath]);",
      '    },',
      '  });',
      '}',
    ])).toEqual([
      expect.objectContaining({
        ruleId: 'LLM-IOH-001',
        evidence: expect.objectContaining({ line: 14 }),
      }),
    ]);
  });

  it('does not treat an ordinary model-controlled filesystem write as execution', () => {
    expect(detect('LLM-IOH-001', [
      "import type { ToolAPI } from '@synthetic/agent-runtime';",
      "import { writeFileSync } from 'node:fs';",
      'export function attach(api: ToolAPI) {',
      '  api.registerTool({',
      "    name: 'save_note',",
      '    parameters: Type.Object({ contents: Type.String() }),',
      "    execute(_callId, params) { writeFileSync('/tmp/note.txt', params.contents); },",
      '  });',
      '}',
    ])).toEqual([]);
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
