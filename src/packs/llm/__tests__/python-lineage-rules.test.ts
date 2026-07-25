import { describe, expect, it } from 'vitest';

import { detectPythonInterproceduralModelOutput } from '../python-lineage-rules.js';

describe('Python interprocedural model-output lineage', () => {
  it('follows official SDK output through local parsing helpers into action and eval sinks', () => {
    const findings = detectPythonInterproceduralModelOutput({
      path: 'agent.py',
      contents: `
from openai import AsyncOpenAI

class Agent:
    def __init__(self, client: AsyncOpenAI):
        self.client = client

    async def run(self):
        response = await self.client.chat.completions.create(model="m", messages=[])
        prediction = response.choices[0].message.content
        parsed = self.parse(prediction)
        return self.act(parsed)

    def parse(self, prediction):
        return decode(prediction)

    def act(self, responses):
        for response in responses:
            box = response.get("box")
            eval(box)
            actions.append(ClickAction(x=box))
`,
    });

    expect(findings.map((finding) => finding.ruleId)).toEqual([
      'LLM-IOH-001',
      'LLM-VAL-001',
    ]);
  });

  it('treats decorated and registered tool parameters as model-controlled', () => {
    const findings = detectPythonInterproceduralModelOutput({
      path: 'tools.py',
      contents: `
class Tools(Toolkit):
    def __init__(self):
        tools = [self.run_shell]

    def run_shell(self, command: str):
        subprocess.run(command, shell=True)

    @tool()
    def execute(self, code: str):
        exec(code)
`,
    });

    expect(findings.filter((finding) => finding.ruleId === 'LLM-IOH-001')).toHaveLength(2);
  });

  it('does not treat a generic CLI command decorator as model-facing', () => {
    const findings = detectPythonInterproceduralModelOutput({
      path: 'cli.py',
      contents: `
import subprocess
import typer

app = typer.Typer()

@app.command()
def scaffold(name: str):
    subprocess.run(["cargo", "init", "--name", name], check=True)
`,
    });

    expect(findings).toEqual([]);
  });

  it('still treats a supported model-facing tool decorator as model-controlled', () => {
    const findings = detectPythonInterproceduralModelOutput({
      path: 'tools.py',
      contents: `
import subprocess

@mcp.tool()
def run_command(command: str):
    subprocess.run(command, shell=True)
`,
    });

    expect(findings).toEqual([
      expect.objectContaining({
        ruleId: 'LLM-IOH-001',
        evidence: expect.objectContaining({ line: 6 }),
      }),
    ]);
  });

  it('does not carry provenance through an observable closed validator', () => {
    const findings = detectPythonInterproceduralModelOutput({
      path: 'safe.py',
      contents: `
from openai import OpenAI
client = OpenAI()
response = client.responses.create(model="m", input="x")

@tool
def act(payload):
    checked = Action.model_validate(payload)
    actions.append(ClickAction(x=checked.x))
`,
    });

    expect(findings).toEqual([]);
  });

  it('does not borrow a same-named helper from another class', () => {
    const findings = detectPythonInterproceduralModelOutput({
      path: 'separate-tools.py',
      contents: `
class Producer:
    @tool
    def source(self, payload):
        return self.transform(payload)

class Unrelated:
    def transform(self, value):
        exec(value)
`,
    });

    expect(findings).toEqual([]);
  });

  it('does not link a model-written file to execution of a different path', () => {
    const findings = detectPythonInterproceduralModelOutput({
      path: 'tools.py',
      contents: `
class Tools:
    @tool
    def execute(self, code):
        source_path = "source.py"
        fixed_path = "fixed.py"
        workspace.write_file(source_path, code)
        return execute_python_file(fixed_path)
`,
    });

    expect(findings).toEqual([]);
  });
});
