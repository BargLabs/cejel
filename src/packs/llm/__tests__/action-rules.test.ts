import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CEJEL_LLM_ACTION_RULES,
  detectSideEffectingToolWithoutAuthorityBoundary,
  detectUnvalidatedConsequentialAction,
  registeredToolParameterSideEffects,
} from '../action-rules.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(fixtureDir, name), 'utf8');
}

describe('Free LLM consequential-action rules', () => {
  it('exports stable definitions for the two action rules', () => {
    expect(CEJEL_LLM_ACTION_RULES.map((rule) => rule.id)).toEqual([
      'LLM-VAL-001',
      'LLM-AGY-001',
    ]);
    expect(CEJEL_LLM_ACTION_RULES.every((rule) => rule.evidenceContract.length > 40)).toBe(true);
  });

  it('finds a direct unvalidated structured dispatch with exact file and line evidence', () => {
    const findings = detectUnvalidatedConsequentialAction({
      path: 'src/deploy-agent.ts',
      contents: fixture('action-validation-direct.positive.fixture'),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'LLM-VAL-001',
      severity: 'critical',
      confidence: 'high',
      evidence: { path: 'src/deploy-agent.ts', line: 8 },
    });
    expect(findings[0]?.evidence.label).toContain('action.target');
  });

  it('does not assert a validation finding when runtime schema parsing is observable', () => {
    const findings = detectUnvalidatedConsequentialAction({
      path: 'src/deploy-agent.ts',
      contents: fixture('action-validation-schema.negative.fixture'),
    });

    expect(findings).toEqual([]);
  });

  it('ignores read-only use and fixture paths', () => {
    const readOnly = fixture('action-validation-direct.positive.fixture').replace(
      'await deploy(action.target);',
      'console.log(action.target);',
    );
    expect(
      detectUnvalidatedConsequentialAction({ path: 'src/read-only.ts', contents: readOnly }),
    ).toEqual([]);
    expect(
      detectUnvalidatedConsequentialAction({
        path: 'tests/deploy.fixture.ts',
        contents: fixture('action-validation-direct.positive.fixture'),
      }),
    ).toEqual([]);
  });

  it('does not correlate same-named values across lexical scopes', () => {
    const contents = `import OpenAI from 'openai';
async function parse() {
  const response = await client.responses.create({ input: 'plan' });
  const action = JSON.parse(response.output_text);
  return action;
}
async function deployFixed() {
  const action = { target: 'staging' };
  await deploy(action.target);
}`;
    expect(
      detectUnvalidatedConsequentialAction({ path: 'src/scoped.ts', contents }),
    ).toEqual([]);
  });

  it('tracks model-output aliases from code only, latest assignment, and the same scope', () => {
    const cases = [
      `// const ghost = response.output_text;
const action = JSON.parse(ghost);
await deploy(action.target);`,
      `let output = response.output_text;
output = '{"target":"staging"}';
const action = JSON.parse(output);
await deploy(action.target);`,
      `function remember() {
  const output = response.output_text;
  return output;
}
function dispatchFixed() {
  const action = JSON.parse(output);
  deploy(action.target);
}`,
    ];

    for (const contents of cases) {
      expect(
        detectUnvalidatedConsequentialAction({ path: 'src/alias-scope.ts', contents }),
      ).toEqual([]);
    }
  });

  it('finds a locally exposed side-effecting tool without an authority boundary', () => {
    const findings = detectSideEffectingToolWithoutAuthorityBoundary({
      path: 'src/mail-agent.ts',
      contents: fixture('authority-boundary-direct.positive.fixture'),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'LLM-AGY-001',
      severity: 'critical',
      confidence: 'high',
      evidence: { path: 'src/mail-agent.ts', line: 8 },
    });
    expect(findings[0]?.summary).toContain('writeAuditTool');
  });

  it('does not treat an unbound generic registerTool call as model exposure', () => {
    const rule = CEJEL_LLM_ACTION_RULES.find((candidate) => candidate.id === 'LLM-AGY-001');
    const findings = rule?.detect({
      path: 'src/tool.ts',
      contents: [
        "import { writeFile } from 'node:fs';",
        "import { generateText, tool } from 'ai';",
        "await generateText({ model, prompt: 'unrelated' });",
        'const writeAuditTool = tool({ execute: (input) => writeFile("audit.log", input) });',
        'mailbox.registerTool(writeAuditTool);',
      ].join('\n'),
    }) ?? [];
    expect(findings).toEqual([]);
  });

  it('does not assert an authority finding when human approval fails closed', () => {
    const findings = detectSideEffectingToolWithoutAuthorityBoundary({
      path: 'src/mail-agent.ts',
      contents: fixture('authority-boundary-approval.negative.fixture'),
    });

    expect(findings).toEqual([]);
  });

  it('does not treat a read-only or unexposed tool declaration as applicable evidence', () => {
    const positive = fixture('authority-boundary-direct.positive.fixture');
    expect(
      detectSideEffectingToolWithoutAuthorityBoundary({
        path: 'src/read-tool.ts',
        contents: positive.replace("writeFile('audit.log', input);", 'lookupCustomer(input);'),
      }),
    ).toEqual([]);
    expect(
      detectSideEffectingToolWithoutAuthorityBoundary({
        path: 'src/unexposed-tool.ts',
        contents: positive.replace('tools: { writeAuditTool },', 'tools: {},'),
      }),
    ).toEqual([]);
  });

  it('does not treat side-effect names in tool descriptions or comments as calls', () => {
    const contents = `import { generateText, tool } from 'ai';
const explainTool = tool({
  description: 'Explain sendEmail(input)',
  execute: async (input) => {
    // sendEmail(input);
    return lookupCustomer(input);
  },
});
await generateText({ model, tools: { explainTool }, prompt: 'help' });`;
    expect(
      detectSideEffectingToolWithoutAuthorityBoundary({ path: 'src/explain.ts', contents }),
    ).toEqual([]);
  });

  it('does not infer a side effect from an unbound generic call name', () => {
    const contents = `import { generateText, tool } from 'ai';
function publish(value) { return value; }
const publishTool = tool({
  execute: async (input) => publish(input),
});
await generateText({ model, tools: { publishTool }, prompt: 'help' });`;
    expect(
      detectSideEffectingToolWithoutAuthorityBoundary({ path: 'src/publish.ts', contents }),
    ).toEqual([]);
  });

  it('finds an import-bound member tool registration with a one-hop side-effect helper', () => {
    const findings = detectSideEffectingToolWithoutAuthorityBoundary({
      path: 'src/desktop-extension.ts',
      contents: fixture('authority-boundary-member-helper.positive.fixture'),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'LLM-AGY-001',
      severity: 'critical',
      confidence: 'high',
      evidence: { path: 'src/desktop-extension.ts', line: 9 },
    });
  });

  it('finds fixed registered-tool input passed to a direct imported process sink', () => {
    const contents = [
      "import type { ToolAPI } from '@synthetic/agent-runtime';",
      "import { execFileSync } from 'node:child_process';",
      'export function attach(api: ToolAPI) {',
      '  api.registerTool({',
      "    name: 'open_target',",
      '    parameters: Type.Object({ target: Type.String() }),',
      '    execute(_callId, input) {',
      "      const processArgs = ['--target', input.target];",
      "      return execFileSync('/usr/bin/open-target', processArgs);",
      '    },',
      '  });',
      '}',
    ].join('\n');

    expect(
      detectSideEffectingToolWithoutAuthorityBoundary({
        path: 'src/open-target.ts',
        contents,
      }),
    ).toEqual([
      expect.objectContaining({
        ruleId: 'LLM-AGY-001',
        evidence: expect.objectContaining({ line: 4 }),
      }),
    ]);
  });

  it('finds registered-tool input passed to an imported filesystem mutation', () => {
    const contents = [
      "import type { ToolAPI } from '@synthetic/agent-runtime';",
      "import { writeFileSync } from 'node:fs';",
      'export function attach(api: ToolAPI) {',
      '  api.registerTool({',
      "    name: 'save_deliverable',",
      '    parameters: Type.Object({ contents: Type.String() }),',
      '    execute(_callId, params) {',
      '      const { contents } = params;',
      "      writeFileSync('/workspace/deliverable.md', contents);",
      "      return 'saved';",
      '    },',
      '  });',
      '}',
    ].join('\n');

    expect(
      detectSideEffectingToolWithoutAuthorityBoundary({
        path: 'src/save-deliverable.ts',
        contents,
      }),
    ).toHaveLength(1);
  });

  it('resolves a fixed browser mutation through exactly two local helper layers', () => {
    const contents = [
      "import type { ToolAPI } from '@synthetic/agent-runtime';",
      "import { execFileSync } from 'node:child_process';",
      "const CDP_SCRIPT = '/opt/cdp.js';",
      "function execCdp(args: string[]) { return execFileSync('node', args); }",
      "function cdpClick(target: string) { return execCdp([CDP_SCRIPT, 'click', target]); }",
      'export function attach(api: ToolAPI) {',
      '  api.registerTool({',
      "    name: 'page_click',",
      '    parameters: Type.Object({ target: Type.String() }),',
      '    execute(_callId, params) { return cdpClick(params.target); },',
      '  });',
      '}',
    ].join('\n');
    const file = { path: 'src/browser-extension.ts', contents };

    expect(detectSideEffectingToolWithoutAuthorityBoundary(file)).toHaveLength(1);
    expect(registeredToolParameterSideEffects(file)).toEqual([
      expect.objectContaining({
        kind: 'process',
        executesModelInput: false,
      }),
    ]);
  });

  it('abstains for a read-only CDP harvest through the same helper depth', () => {
    const contents = [
      "import type { ToolAPI } from '@synthetic/agent-runtime';",
      "import { execFileSync } from 'node:child_process';",
      "const CDP_SCRIPT = '/opt/cdp.js';",
      "function execCdp(args: string[]) { return execFileSync('node', args); }",
      "function cdpEval(code: string, target: string) { return execCdp([CDP_SCRIPT, 'eval', code, target]); }",
      "function getHarvestScript() { return 'document.body.innerText'; }",
      'export function attach(api: ToolAPI) {',
      '  api.registerTool({',
      "    name: 'page_state',",
      '    parameters: Type.Object({ target: Type.String() }),',
      '    execute(_callId, params) { return cdpEval(getHarvestScript(), params.target); },',
      '  });',
      '}',
    ].join('\n');
    const file = { path: 'src/browser-extension.ts', contents };

    expect(detectSideEffectingToolWithoutAuthorityBoundary(file)).toEqual([]);
    expect(registeredToolParameterSideEffects(file)).toEqual([]);
  });

  it('retains a finding when capture selection interpolates model input into a shell', () => {
    const contents = [
      "import type { ToolAPI } from '@synthetic/agent-runtime';",
      "import { execFileSync } from 'node:child_process';",
      'export function attach(api: ToolAPI) {',
      '  api.registerTool({',
      "    name: 'capture_window',",
      '    parameters: Type.Object({ window: Type.String() }),',
      '    execute(_callId, params) {',
      "      const selected = execFileSync('bash', ['-c', `window-id --title \"${params.window}\"`]).trim();",
      "      const output = '/tmp/capture.png';",
      "      execFileSync('capture', ['--window', selected, output]);",
      "      return output;",
      '    },',
      '  });',
      '}',
    ].join('\n');
    const file = { path: 'src/capture-extension.ts', contents };

    expect(detectSideEffectingToolWithoutAuthorityBoundary(file)).toHaveLength(1);
    expect(registeredToolParameterSideEffects(file)).toEqual([
      expect.objectContaining({
        kind: 'process',
        executesModelInput: true,
      }),
    ]);
  });

  it('abstains for constants, read-only helpers, and schema-only member tools', () => {
    const cases = [
      [
        "import type { ToolAPI } from '@synthetic/agent-runtime';",
        "import { execFileSync } from 'node:child_process';",
        'export function attach(api: ToolAPI) {',
        '  api.registerTool({',
        "    name: 'constant_status',",
        '    parameters: Type.Object({ target: Type.String() }),',
        "    execute(_callId, params) { void params; return execFileSync('/usr/bin/status', ['--json']); },",
        '  });',
        '}',
      ],
      [
        "import type { ToolAPI } from '@synthetic/agent-runtime';",
        "import { execFileSync } from 'node:child_process';",
        'function describeTarget(target: string) { return target.toUpperCase(); }',
        'export function attach(api: ToolAPI) {',
        '  api.registerTool({',
        "    name: 'describe_target',",
        '    parameters: Type.Object({ target: Type.String() }),',
        '    execute(_callId, params) { return describeTarget(params.target); },',
        '  });',
        '}',
      ],
      [
        "import type { ToolAPI } from '@synthetic/agent-runtime';",
        "import { writeFileSync } from 'node:fs';",
        'export function attach(api: ToolAPI) {',
        '  api.registerTool({',
        "    name: 'declared_only',",
        '    parameters: Type.Object({ contents: Type.String() }),',
        "    execute() { return 'not implemented'; },",
        '  });',
        '}',
      ],
    ];

    for (const lines of cases) {
      expect(
        detectSideEffectingToolWithoutAuthorityBoundary({
          path: 'src/member-control.ts',
          contents: lines.join('\n'),
        }),
      ).toEqual([]);
    }
  });

  it('abstains when a registered-tool operation allowlist fails closed', () => {
    const contents = [
      "import type { ToolAPI } from '@synthetic/agent-runtime';",
      "import { execFileSync } from 'node:child_process';",
      "const OPERATION_ALLOWLIST = new Set(['status']);",
      'export function attach(api: ToolAPI) {',
      '  api.registerTool({',
      "    name: 'run_operation',",
      '    parameters: Type.Object({ operation: Type.String() }),',
      '    execute(_callId, params) {',
      '      if (!OPERATION_ALLOWLIST.has(params.operation)) return "rejected";',
      "      return execFileSync('/usr/bin/operation', [params.operation]);",
      '    },',
      '  });',
      '}',
    ].join('\n');

    expect(
      detectSideEffectingToolWithoutAuthorityBoundary({
        path: 'src/allowed-operation.ts',
        contents,
      }),
    ).toEqual([]);
  });

  it('requires a fail-closed gate before a member-registered helper side effect', () => {
    expect(
      detectSideEffectingToolWithoutAuthorityBoundary({
        path: 'src/desktop-extension.ts',
        contents: fixture('authority-boundary-member-helper.negative.fixture'),
      }),
    ).toEqual([]);
  });

  it('does not combine a typed receiver or helper binding across JavaScript scopes', () => {
    const receiverFromAnotherScope = [
      "import type { AgentExtension } from '@synthetic/agent-runtime';",
      "import { execFileSync } from 'node:child_process';",
      'function bind(extension: AgentExtension) { return extension; }',
      'function attachOtherRuntime() {',
      '  const extension = getUnrelatedExtension();',
      '  extension.registerTool({',
      "    name: 'local_action',",
      "    execute() { return execFileSync('/usr/bin/local-action'); },",
      '  });',
      '}',
    ].join('\n');
    const shadowedHelper = [
      "import type { AgentExtension } from '@synthetic/agent-runtime';",
      "import { execFileSync } from 'node:child_process';",
      "function invokeLocalProgram() { return execFileSync('/usr/bin/local-action'); }",
      'function attachTools(extension: AgentExtension) {',
      "  function invokeLocalProgram() { return 'read-only'; }",
      '  extension.registerTool({',
      "    name: 'local_action',",
      '    execute() { return invokeLocalProgram(); },',
      '  });',
      '}',
    ].join('\n');

    expect(
      detectSideEffectingToolWithoutAuthorityBoundary({
        path: 'src/other-runtime.ts',
        contents: receiverFromAnotherScope,
      }),
    ).toEqual([]);
    expect(
      detectSideEffectingToolWithoutAuthorityBoundary({
        path: 'src/shadowed-helper.ts',
        contents: shadowedHelper,
      }),
    ).toEqual([]);
  });

  it('finds an unconstrained Python model-facing tool parameter reaching execution', () => {
    const findings = detectUnvalidatedConsequentialAction({
      path: 'src/execution-tool.py',
      contents: fixture('python-action-validation-tool.positive.fixture'),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'LLM-VAL-001',
      severity: 'critical',
      confidence: 'high',
      evidence: { path: 'src/execution-tool.py', line: 12 },
    });
  });

  it('accepts a closed Python literal constraint before execution dispatch', () => {
    expect(
      detectUnvalidatedConsequentialAction({
        path: 'src/execution-tool.py',
        contents: fixture('python-action-validation-tool.negative.fixture'),
      }),
    ).toEqual([]);
  });

  it('does not combine a harmless model-facing Python method with another class method', () => {
    const contents = [
      'class RunTool:',
      '    args_schema = RunInput',
      '    def _run(self, command: str):',
      '        return command',
      '    def administrative_dispatch(self, command: str):',
      '        return dispatcher.invoke(',
      '            method="execute_command",',
      '            payload={"command": command},',
      '        )',
    ].join('\n');

    expect(
      detectUnvalidatedConsequentialAction({
        path: 'src/execution-tool.py',
        contents,
      }),
    ).toEqual([]);
  });
});
