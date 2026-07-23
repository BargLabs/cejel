import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CEJEL_LLM_ACTION_RULES,
  detectSideEffectingToolWithoutAuthorityBoundary,
  detectUnvalidatedConsequentialAction,
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
      evidence: { path: 'src/desktop-extension.ts', line: 13 },
    });
  });

  it('requires a fail-closed gate before a member-registered helper side effect', () => {
    expect(
      detectSideEffectingToolWithoutAuthorityBoundary({
        path: 'src/desktop-extension.ts',
        contents: fixture('authority-boundary-member-helper.negative.fixture'),
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
      evidence: { path: 'src/execution-tool.py', line: 13 },
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
});
