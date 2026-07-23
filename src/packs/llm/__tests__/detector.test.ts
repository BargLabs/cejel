import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CEJEL_LLM_ACTION_RULES } from '../action-rules.js';
import {
  collectCejelLlmPack,
  scanCejelLlmPack,
  snapshotCejelLlmPackInput,
} from '../detector.js';
import { CEJEL_LLM_EVALUATION_RULES } from '../evaluation-rules.js';
import { CEJEL_LLM_V1_RULES } from '../rules.js';
import {
  CEJEL_LLM_ENABLED_RULE_IDS,
  CEJEL_LLM_RULE_IDS,
  CejelLlmPackResultSchema,
  CejelLlmRuleResultSchema,
  CejelLlmRuleStateSchema,
} from '../types.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(fixtureDir, name), 'utf8');
}

function scan(contents: string) {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-llm-'));
  writeFileSync(join(repo, 'app.ts'), contents, 'utf8');
  return collectCejelLlmPack(repo, ['app.ts']);
}

describe('Free LLM Pack alpha', () => {
  it('has stable unique rule ids and explicit contracts', () => {
    const implementedRules = [
      ...CEJEL_LLM_V1_RULES,
      ...CEJEL_LLM_ACTION_RULES,
      ...CEJEL_LLM_EVALUATION_RULES,
    ];
    expect(implementedRules.map((rule) => rule.id).sort()).toEqual(
      [...CEJEL_LLM_ENABLED_RULE_IDS].sort(),
    );
    expect(new Set(CEJEL_LLM_RULE_IDS).size).toBe(CEJEL_LLM_RULE_IDS.length);
    expect(CEJEL_LLM_RULE_IDS).toHaveLength(8);
    for (const rule of implementedRules) {
      expect(rule.evidenceContract.length).toBeGreaterThan(20);
      expect(rule.exclusions.length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['LLM-IOH-001', 'unsafe-sink'],
    ['LLM-AGY-002', 'unbounded-loop'],
    ['LLM-DAT-001', 'sensitive-prompt'],
  ] as const)('%s has positive and negative fixtures', (ruleId, fixtureStem) => {
    const positive = scan(fixture(`${fixtureStem}.positive.fixture`));
    const negative = scan(fixture(`${fixtureStem}.negative.fixture`));

    expect(positive.status).toBe('assessed_with_limitations');
    expect(positive.findings.some((finding) => finding.ruleId === ruleId)).toBe(true);
    expect(
      positive.findings.find((finding) => finding.ruleId === ruleId)?.evidence.line,
    ).toBeGreaterThan(0);
    expect(negative.findings.some((finding) => finding.ruleId === ruleId)).toBe(false);
    expect(
      negative.ruleResults.find((result) => result.ruleId === ruleId)?.state,
    ).toBe('not_applicable');
  });

  it('returns not_applicable without findings for a repository with no supported LLM integration', () => {
    const result = scan('export function add(a: number, b: number) { return a + b; }\n');

    expect(result.status).toBe('not_applicable');
    expect(result.findings).toEqual([]);
    expect(result.ruleResults.every((rule) => rule.state === 'not_applicable')).toBe(true);
    expect(result.notes).toContain('not scored');
    expect(result.coverage.sourceFilesConsidered).toBe(1);
    expect(result.coverage.sourceFilesWithLlmIndicators).toBe(0);
  });

  it('lets an import-bound model-facing tool registration activate AGY-001', () => {
    const result = scan(fixture('authority-boundary-member-helper.positive.fixture'));

    expect(result.status).toBe('assessed_with_limitations');
    expect(result.coverage.sourceFilesWithLlmIndicators).toBe(1);
    expect(result.coverage.detectedIntegrations).toContain('Model-facing tool registration');
    expect(result.findings.some((finding) => finding.ruleId === 'LLM-AGY-001')).toBe(true);
  });

  it('reports a controlled model-facing tool surface as insufficient rather than absent', () => {
    const result = scan(fixture('authority-boundary-member-helper.negative.fixture'));

    expect(result.status).toBe('assessed_with_limitations');
    expect(result.findings).toEqual([]);
    expect(
      result.ruleResults.find((rule) => rule.ruleId === 'LLM-AGY-001')?.state,
    ).toBe('insufficient_data');
  });

  it('lets a Python model-facing consequential tool activate VAL-001', () => {
    const repo = mkdtempSync(join(tmpdir(), 'cejel-llm-python-action-'));
    writeFileSync(
      join(repo, 'tool.py'),
      fixture('python-action-validation-tool.positive.fixture'),
      'utf8',
    );
    const result = collectCejelLlmPack(repo, ['tool.py']);

    expect(result.status).toBe('assessed_with_limitations');
    expect(result.findings.some((finding) => finding.ruleId === 'LLM-VAL-001')).toBe(true);
  });

  it('does not establish applicability from comments, tests, or generic mailbox calls', () => {
    const repo = mkdtempSync(join(tmpdir(), 'cejel-llm-applicability-'));
    writeFileSync(join(repo, 'app.ts'), [
      "// import OpenAI from 'openai';",
      'const response = await mailbox.messages.create({ body: input });',
      'const output = response.content[0].text;',
      'eval(output);',
    ].join('\n'));
    mkdirSync(join(repo, 'tests'));
    writeFileSync(
      join(repo, 'tests', 'mock.test.ts'),
      "import OpenAI from 'openai';\nawait new OpenAI().responses.create({ input: 'x' });\n",
    );
    const result = collectCejelLlmPack(repo, ['app.ts', 'tests/mock.test.ts']);
    expect(result.status).toBe('not_applicable');
    expect(result.findings).toEqual([]);
  });

  it('does not link an unused SDK import to an unrelated same-shape receiver', () => {
    const result = scan([
      "import OpenAI from 'openai';",
      "import { exec } from 'node:child_process';",
      "import { writeFileSync } from 'node:fs';",
      "const response = await mailbox.responses.create({ input: 'hello' });",
      'const output = response.output_text;',
      'const parsed = JSON.parse(output);',
      'await deploy(parsed);',
      'const accuracy = results.filter((item) => item.correct).length / results.length;',
      "writeFileSync('metrics.json', JSON.stringify({ accuracy }));",
    ].join('\n'));

    expect(result.status).toBe('not_applicable');
    expect(result.findings).toEqual([]);
  });

  it('does not link a shadowing function parameter to an outer SDK client', () => {
    const result = scan([
      "import OpenAI from 'openai';",
      'const client = new OpenAI();',
      'async function processMailbox(client) {',
      "  const response = await client.responses.create({ input: 'mail' });",
      '  const output = response.output_text;',
      '  eval(output);',
      '}',
    ].join('\n'));

    expect(result.findings).toEqual([]);
    expect(result.status).toBe('not_applicable');
  });

  it('does not link a shadowing local variable to an outer SDK client', () => {
    const result = scan([
      "import OpenAI from 'openai';",
      'const client = new OpenAI();',
      'async function processMailbox() {',
      '  const client = mailbox;',
      "  const response = await client.responses.create({ input: 'mail' });",
      '  const output = response.output_text;',
      '  eval(output);',
      '}',
    ].join('\n'));

    expect(result.findings).toEqual([]);
    expect(result.status).toBe('not_applicable');
  });

  it.each([
    [
      'OpenAI client reassignment',
      [
        "import OpenAI from 'openai';",
        'let client = new OpenAI();',
        'client = mailbox;',
        'await client.responses.create({ input: process.env.DATABASE_URL });',
      ],
    ],
    [
      'Anthropic client reassignment',
      [
        "import Anthropic from '@anthropic-ai/sdk';",
        'let client = new Anthropic(); client = mailbox;',
        'await client.messages.create({ messages: process.env.DATABASE_URL });',
      ],
    ],
    [
      'OpenAI constructor reassignment',
      [
        "import OpenAI from 'openai';",
        'OpenAI = FakeClient;',
        'await new OpenAI().responses.create({ input: process.env.DATABASE_URL });',
      ],
    ],
    [
      'OpenAI client reassignment inside a control-flow block',
      [
        "import OpenAI from 'openai';",
        'let client = new OpenAI();',
        'if (useMailbox) { client = mailbox; }',
        'await client.responses.create({ input: process.env.DATABASE_URL });',
      ],
    ],
    [
      'OpenAI client array-destructuring reassignment',
      [
        "import OpenAI from 'openai';",
        'let client = new OpenAI(); [client] = [mailbox];',
        'await client.responses.create({ input: process.env.DATABASE_URL });',
      ],
    ],
    [
      'OpenAI client object-destructuring reassignment inside control flow',
      [
        "import OpenAI from 'openai';",
        'let client = new OpenAI();',
        'if (useMailbox) { ({ replacement: client } = mailbox); }',
        'await client.responses.create({ input: process.env.DATABASE_URL });',
      ],
    ],
    [
      'OpenAI client nested object-destructuring reassignment',
      [
        "import OpenAI from 'openai';",
        'let client = new OpenAI();',
        '({ nested: { client } } = mailbox);',
        'await client.responses.create({ input: process.env.DATABASE_URL });',
      ],
    ],
    [
      'OpenAI constructor destructuring reassignment',
      [
        "import OpenAI from 'openai';",
        '[OpenAI] = [FakeClient];',
        'await new OpenAI().responses.create({ input: process.env.DATABASE_URL });',
      ],
    ],
  ])('does not retain JavaScript SDK provenance after %s', (_name, lines) => {
    const result = scan(lines.join('\n'));

    expect(result.findings).toEqual([]);
    expect(result.status).toBe('not_applicable');
  });

  it('allows an ordinary assignment to establish genuine JavaScript SDK provenance', () => {
    const result = scan([
      "import OpenAI from 'openai';",
      'let client = mailbox; [client] = [mailbox];',
      'if (restoreSdk) { client = new OpenAI(); }',
      'await client.responses.create({ input: process.env.DATABASE_URL });',
    ].join('\n'));

    expect(result.findings.some((finding) => finding.ruleId === 'LLM-DAT-001')).toBe(true);
    expect(result.status).toBe('assessed_with_limitations');
  });

  it('does not treat an object destructuring property key as the assigned binding', () => {
    const result = scan([
      "import OpenAI from 'openai';",
      'const client = new OpenAI();',
      '({ client: replacement } = mailbox);',
      'await client.responses.create({ input: process.env.DATABASE_URL });',
    ].join('\n'));

    expect(result.findings.some((finding) => finding.ruleId === 'LLM-DAT-001')).toBe(true);
    expect(result.status).toBe('assessed_with_limitations');
  });

  it.each([
    [
      'object-destructured OpenAI parameter',
      [
        "import OpenAI from 'openai';",
        'async function processMailbox({ OpenAI }) {',
        "  return new OpenAI().responses.create({ input: 'mail' });",
        '}',
      ],
    ],
    [
      'array-destructured OpenAI parameter',
      [
        "import OpenAI from 'openai';",
        'async function processMailbox([OpenAI]) {',
        "  return new OpenAI().responses.create({ input: 'mail' });",
        '}',
      ],
    ],
    [
      'object-destructured Vercel parameter',
      [
        "import { generateText } from 'ai';",
        'async function processMailbox({ generateText }) {',
        "  return generateText({ prompt: 'mail' });",
        '}',
      ],
    ],
  ])('does not link %s to an imported SDK binding', (_name, lines) => {
    const result = scan(lines.join('\n'));

    expect(result.findings).toEqual([]);
    expect(result.status).toBe('not_applicable');
  });

  it('does not link a shadowing parameter to an imported Vercel AI function', () => {
    const result = scan([
      "import { generateText } from 'ai';",
      'async function processMailbox(generateText) {',
      "  const response = await generateText({ prompt: 'mail' });",
      '  const output = response.content[0].text;',
      '  const action = JSON.parse(output);',
      '  await deploy(action.target);',
      '}',
    ].join('\n'));

    expect(result.findings).toEqual([]);
    expect(result.status).toBe('not_applicable');
  });

  it('terminates and preserves imported Vercel AI function provenance on reassignment', () => {
    const reassigned = scan([
      "import { generateText } from 'ai';",
      'generateText = mailbox;',
      "await generateText({ prompt: 'mail' });",
    ].join('\n'));
    const genuine = scan([
      "import { generateText } from 'ai';",
      "await generateText({ prompt: 'mail' });",
    ].join('\n'));

    expect(reassigned.status).toBe('not_applicable');
    expect(reassigned.findings).toEqual([]);
    expect(genuine.status).toBe('assessed_with_limitations');
  });

  it('does not link concise-arrow or class-method parameters to an outer SDK client', () => {
    for (const body of [
      "const response = await ((client) => client.responses.create({ input: 'mail' }))(mailbox);",
      "class Box { async process(client) { return client.responses.create({ input: 'mail' }); } }\nconst response = await new Box().process(mailbox);",
    ]) {
      const result = scan([
        "import OpenAI from 'openai';",
        'const client = new OpenAI();',
        body,
        'const output = response.output_text;',
        'eval(output);',
      ].join('\n'));

      expect(result.findings).toEqual([]);
      expect(result.status).toBe('not_applicable');
    }
  });

  it('does not attribute unrelated same-shape calls or outputs in a genuinely eligible file', () => {
    const base = [
      "import OpenAI from 'openai';",
      "import { exec } from 'node:child_process';",
      'const client = new OpenAI();',
      "const modelResponse = await client.responses.create({ model: 'gpt-5', input: 'safe' });",
    ];
    const cases = [
      [
        "const mail = await mailbox.responses.create({ input: process.env.DATABASE_PASSWORD });",
      ],
      [
        'const analytics = internalJob();',
        'exec(analytics.output_text);',
      ],
      [
        'const analytics = internalJob();',
        'const action = JSON.parse(analytics.output_text);',
        'await deploy(action.target);',
      ],
    ];
    for (const lines of cases) {
      const result = scan([...base, ...lines].join('\n'));
      expect(result.findings).toEqual([]);
      expect(result.status).toBe('assessed_with_limitations');
    }
  });

  it('does not treat a provider API key used for client construction as prompt disclosure', () => {
    const result = scan(fixture('sensitive-prompt.negative.fixture'));

    expect(result.findings.some((finding) => finding.ruleId === 'LLM-DAT-001')).toBe(false);
  });

  it('does not carry a model-output alias through a reassignment', () => {
    const result = scan(
      [
        "import OpenAI from 'openai';",
        "const response = await new OpenAI().responses.create({ model: 'example', input: 'x' });",
        'let output = response.output_text;',
        'output = sanitize(output);',
        'eval(output);',
      ].join('\n'),
    );

    expect(result.findings.some((finding) => finding.ruleId === 'LLM-IOH-001')).toBe(false);
  });

  it('uses warning severity for raw HTML while code and shell sinks remain critical', () => {
    const result = scan(
      [
        "import OpenAI from 'openai';",
        "const response = await new OpenAI().responses.create({ model: 'example', input: 'x' });",
        'const output = response.output_text;',
        'element.innerHTML = output;',
      ].join('\n'),
    );
    expect(result.findings.find((finding) => finding.ruleId === 'LLM-IOH-001')?.severity).toBe(
      'warning',
    );
  });

  it('does not extend sensitive-prompt evidence beyond the matched model-call arguments', () => {
    const result = scan(
      [
        "import OpenAI from 'openai';",
        "await new OpenAI().responses.create({ model: 'example', input: 'public text' });",
        'const unrelated = process.env.DATABASE_PASSWORD;',
      ].join('\n'),
    );

    expect(result.findings.some((finding) => finding.ruleId === 'LLM-DAT-001')).toBe(false);
  });

  it('does not treat rule-shaped JavaScript comments or strings as executable evidence', () => {
    const result = scan(
      [
        "import OpenAI from 'openai';",
        "const response = await new OpenAI().responses.create({ model: 'example', input: 'public' });",
        'const output = response.output_text;',
        "const documentation = 'eval(output) process.env.DATABASE_PASSWORD while (true) {';",
        '// eval(output);',
      ].join('\n'),
    );
    expect(result.findings).toEqual([]);
  });

  it('requires the recognized model call to be inside the unconditional loop body', () => {
    const result = scan(
      [
        "import OpenAI from 'openai';",
        'while (true) {',
        '  await tick();',
        '}',
        "await new OpenAI().responses.create({ model: 'example', input: 'x' });",
      ].join('\n'),
    );

    expect(result.findings.some((finding) => finding.ruleId === 'LLM-AGY-002')).toBe(false);
  });

  it.each([
    [
      'finite counter',
      [
        'let attempts = 0;',
        'while (true) {',
        "  await new OpenAI().responses.create({ model: 'example', input: 'x' });",
        '  attempts += 1;',
        '  if (attempts >= 3) break;',
        '}',
      ],
    ],
    [
      'deadline',
      [
        'const deadline = Date.now() + 1000;',
        'for (;;) {',
        "  await new OpenAI().responses.create({ model: 'example', input: 'x' });",
        "  if (Date.now() >= deadline) throw new Error('timeout');",
        '}',
      ],
    ],
    [
      'cancellation budget',
      [
        'while (true) {',
        "  await new OpenAI().responses.create({ model: 'example', input: 'x' });",
        '  if (signal.aborted || remainingBudget <= 0) return;',
        '}',
      ],
    ],
  ] as const)('does not flag an unconditional loop with an observable %s guard', (_name, body) => {
    const result = scan(["import OpenAI from 'openai';", ...body].join('\n'));
    expect(result.findings.some((finding) => finding.ruleId === 'LLM-AGY-002')).toBe(false);
  });

  it('retains AGY-002 when bound-looking names do not participate in an exit guard', () => {
    const result = scan(
      [
        "import OpenAI from 'openai';",
        'const maxIterations = 3;',
        'while (true) {',
        "  await new OpenAI().responses.create({ model: 'example', input: 'x' });",
        '  observe(maxIterations);',
        '}',
      ].join('\n'),
    );
    expect(result.findings.some((finding) => finding.ruleId === 'LLM-AGY-002')).toBe(true);
  });

  it('retains AGY-002 when a break only exits a nested loop', () => {
    const result = scan(
      [
        "import OpenAI from 'openai';",
        'while (true) {',
        "  await new OpenAI().responses.create({ model: 'example', input: 'x' });",
        '  for (const attempt of attempts) {',
        '    if (attempt >= 3) break;',
        '  }',
        '}',
      ].join('\n'),
    );
    expect(result.findings.some((finding) => finding.ruleId === 'LLM-AGY-002')).toBe(true);
  });

  it.each(['tests/agent.test.ts', 'examples/unsafe.ts'])(
    'does not emit direct-pattern findings from excluded path %s',
    (path) => {
      for (const [ruleId, fixtureName] of [
        ['LLM-IOH-001', 'unsafe-sink.positive.fixture'],
        ['LLM-AGY-002', 'unbounded-loop.positive.fixture'],
        ['LLM-DAT-001', 'sensitive-prompt.positive.fixture'],
      ] as const) {
        const rule = CEJEL_LLM_V1_RULES.find((candidate) => candidate.id === ruleId);
        expect(rule?.detect({ path, contents: fixture(fixtureName) })).toEqual([]);
      }
    },
  );

  it('ignores paths that escape the supplied repository root', () => {
    const repo = mkdtempSync(join(tmpdir(), 'cejel-llm-root-'));
    const result = collectCejelLlmPack(repo, ['../outside.ts']);

    expect(result.status).toBe('not_applicable');
    expect(result.coverage.sourceFilesConsidered).toBe(0);
  });

  it('changes the input-source digest when a supported source file changes', () => {
    const repo = mkdtempSync(join(tmpdir(), 'cejel-llm-snapshot-'));
    writeFileSync(join(repo, 'app.ts'), "import OpenAI from 'openai';\n", 'utf8');
    const before = snapshotCejelLlmPackInput(repo);
    writeFileSync(join(repo, 'app.ts'), "import Anthropic from '@anthropic-ai/sdk';\n", 'utf8');
    const after = snapshotCejelLlmPackInput(repo);
    expect(after.sourceSha256).not.toBe(before.sourceSha256);
  });

  it('emits an artifact accepted by the strict pack-owned schema', () => {
    const result = scan(fixture('unsafe-sink.positive.fixture'));

    expect(CejelLlmPackResultSchema.parse(result)).toEqual(result);
    expect(result.ruleResults.map((rule) => rule.ruleId)).toEqual(CEJEL_LLM_ENABLED_RULE_IDS);
    expect(result.coverage.deferredRuleIds).toEqual([]);
  });

  it('does not treat unrelated metrics as an LLM evaluation from repository-level applicability alone', () => {
    const repo = mkdtempSync(join(tmpdir(), 'cejel-llm-evaluation-integration-'));
    writeFileSync(
      join(repo, 'model.ts'),
      "import OpenAI from 'openai';\nawait new OpenAI().responses.create({ model: 'gpt-5', input: 'x' });\n",
      'utf8',
    );
    writeFileSync(
      join(repo, 'evaluation.ts'),
      [
        "import { writeFileSync } from 'node:fs';",
        'const eligible = results.filter((result) => result.status === \'ok\');',
        'const accuracy = eligible.filter((result) => result.correct).length / eligible.length;',
        "writeFileSync('evaluation.json', JSON.stringify({ accuracy }));",
      ].join('\n'),
      'utf8',
    );

    const result = collectCejelLlmPack(repo, ['model.ts', 'evaluation.ts']);

    expect(result.status).toBe('assessed_with_limitations');
    expect(result.findings.some((finding) => finding.ruleId === 'LLM-PRV-001')).toBe(false);
    expect(result.findings.some((finding) => finding.ruleId === 'LLM-EVL-001')).toBe(false);
  });

  it('can emit evidence for every enabled v1 rule through the integrated pack path', () => {
    const repo = mkdtempSync(join(tmpdir(), 'cejel-llm-all-rules-'));
    const files = [
      ['unsafe.ts', 'unsafe-sink.positive.fixture'],
      ['validation.ts', 'action-validation-direct.positive.fixture'],
      ['authority.ts', 'authority-boundary-direct.positive.fixture'],
      ['loop.ts', 'unbounded-loop.positive.fixture'],
      ['data.ts', 'sensitive-prompt.positive.fixture'],
      ['provenance.ts', 'llm-evaluation-provenance.positive.fixture'],
      ['denominator.ts', 'llm-evaluation-denominator.positive.fixture'],
      ['judge.ts', 'llm-evaluation-self-judge.positive.fixture'],
    ] as const;
    for (const [path, fixtureName] of files) {
      writeFileSync(join(repo, path), fixture(fixtureName), 'utf8');
    }

    const result = collectCejelLlmPack(
      repo,
      files.map(([path]) => path),
    );

    expect(new Set(result.findings.map((finding) => finding.ruleId))).toEqual(
      new Set(CEJEL_LLM_ENABLED_RULE_IDS),
    );
    expect(result.ruleResults.every((rule) => rule.state === 'finding')).toBe(true);
    expect(result.status).toBe('assessed_with_limitations');
  });

  it('represents every frozen contract state without treating no finding as verified', () => {
    expect(CejelLlmRuleStateSchema.options).toEqual([
      'finding',
      'verified_control',
      'not_applicable',
      'insufficient_data',
    ]);
    const result = scan(fixture('unsafe-sink.negative.fixture'));
    expect(result.ruleResults.some((rule) => rule.state === 'verified_control')).toBe(false);
    expect(
      CejelLlmRuleResultSchema.parse({
        ruleId: 'LLM-EVL-002',
        state: 'insufficient_data',
        confidence: 'low',
        findings: [],
        notes: 'Frozen catalogue entry is representable but is not enabled by the alpha detector.',
      }).ruleId,
    ).toBe('LLM-EVL-002');
  });

  it('distinguishes absent rule surfaces from relevant but unresolved surfaces', () => {
    const simpleChat = scan(
      [
        "import OpenAI from 'openai';",
        "const response = await new OpenAI().responses.create({ model: 'example', input: 'hello' });",
        'console.log(response.output_text);',
      ].join('\n'),
    );
    expect(simpleChat.status).toBe('assessed_with_limitations');
    expect(simpleChat.ruleResults.every((rule) => rule.state === 'not_applicable')).toBe(true);

    const controlledAction = scan(fixture('action-validation-schema.negative.fixture'));
    expect(
      controlledAction.ruleResults.find((rule) => rule.ruleId === 'LLM-VAL-001')?.state,
    ).toBe('insufficient_data');
  });

  it('uses tracked files in a git repository and excludes ignored evidence', () => {
    const repo = mkdtempSync(join(tmpdir(), 'cejel-llm-git-'));
    execFileSync('git', ['init', '--quiet'], { cwd: repo });
    writeFileSync(join(repo, '.gitignore'), 'ignored.ts\n', 'utf8');
    writeFileSync(join(repo, 'app.ts'), fixture('unsafe-sink.negative.fixture'), 'utf8');
    writeFileSync(join(repo, 'ignored.ts'), fixture('unsafe-sink.positive.fixture'), 'utf8');
    execFileSync('git', ['add', '.gitignore', 'app.ts'], { cwd: repo });

    const result = scanCejelLlmPack(repo);

    expect(result.status).toBe('assessed_with_limitations');
    expect(result.findings).toEqual([]);
    expect(result.coverage.sourceFilesConsidered).toBe(1);
  });

  it('excludes node_modules in a non-git directory', () => {
    const repo = mkdtempSync(join(tmpdir(), 'cejel-llm-local-'));
    mkdirSync(join(repo, 'node_modules', 'unsafe'), { recursive: true });
    writeFileSync(join(repo, 'app.ts'), 'export const safe = true;\n', 'utf8');
    writeFileSync(
      join(repo, 'node_modules', 'unsafe', 'index.ts'),
      fixture('unsafe-sink.positive.fixture'),
      'utf8',
    );

    const result = scanCejelLlmPack(repo);

    expect(result.status).toBe('not_applicable');
    expect(result.coverage.sourceFilesConsidered).toBe(1);
  });

  it('does not follow a source symlink outside a non-git repository', () => {
    const repo = mkdtempSync(join(tmpdir(), 'cejel-llm-symlink-'));
    const outside = join(mkdtempSync(join(tmpdir(), 'cejel-llm-outside-')), 'outside.ts');
    writeFileSync(outside, fixture('unsafe-sink.positive.fixture'), 'utf8');
    symlinkSync(outside, join(repo, 'outside.ts'));

    const result = scanCejelLlmPack(repo);

    expect(result.status).toBe('not_applicable');
    expect(result.coverage.sourceFilesConsidered).toBe(0);
  });
});
