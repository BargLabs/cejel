import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = join(__dirname, '..', '..');

// #421: an emulated arm64 `pnpm install` hung 2 of 20 release-shape image builds with a QEMU
// SIGILL (docs/experiments/dist-determinism-2026-10-07/result.md), and v0.6.1's first publish run
// hung the same way for 53 minutes. The image now builds dist/ once, on the builder's own platform,
// and the final stage copies everything it needs instead of running anything. A RUN in the final
// stage would execute under emulation for every foreign platform again, so this guard refuses it.
// Building without QEMU in CI would not prove the same thing: BuildKit can carry its own emulators.

type Instruction = { keyword: string; text: string; line: number };

// Joins backslash continuations and drops comments, so a multi-line RUN is one instruction.
export function dockerfileInstructions(source: string): Instruction[] {
  const instructions: Instruction[] = [];
  let pending: { text: string; line: number } | null = null;
  source.split('\n').forEach((raw, index) => {
    const line = raw.trimEnd();
    if (pending === null && (line.trim() === '' || line.trimStart().startsWith('#'))) return;
    const continued = line.endsWith('\\');
    const body = continued ? line.slice(0, -1) : line;
    pending = pending === null ? { text: body.trim(), line: index + 1 } : { ...pending, text: `${pending.text} ${body.trim()}` };
    if (!continued) {
      const keyword = pending.text.split(/\s+/, 1)[0]?.toUpperCase() ?? '';
      instructions.push({ keyword, text: pending.text, line: pending.line });
      pending = null;
    }
  });
  return instructions;
}

export function emulationViolations(source: string): string[] {
  const instructions = dockerfileInstructions(source);
  const stages = instructions.filter((i) => i.keyword === 'FROM');
  const violations: string[] = [];
  if (stages.length < 2) violations.push(`expected a build stage and a final stage, found ${stages.length} FROM`);
  const buildStage = stages.find((s) => /\sAS\s+build$/i.test(s.text));
  if (!buildStage) {
    violations.push('no stage named `build`');
  } else if (!/^FROM\s+--platform=\$BUILDPLATFORM\s/i.test(buildStage.text)) {
    violations.push(`line ${buildStage.line}: the build stage must be \`FROM --platform=$BUILDPLATFORM ...\` so it runs natively once for every target`);
  }
  const finalStage = stages.at(-1);
  if (finalStage) {
    for (const i of instructions) {
      if (i.line > finalStage.line && i.keyword === 'RUN') {
        violations.push(`line ${i.line}: RUN in the final stage executes under emulation for a foreign platform: ${i.text.slice(0, 80)}`);
      }
    }
  }
  return violations;
}

describe('Dockerfile builds natively and runs nothing emulated (#421)', () => {
  it('the committed Dockerfile has a native build stage and a RUN-free final stage', () => {
    const source = readFileSync(join(REPOSITORY_ROOT, 'Dockerfile'), 'utf8');
    expect(emulationViolations(source)).toEqual([]);
  });

  it('refuses the v0.6.1 Dockerfile (negative control: the shape that hung)', () => {
    const before = execFileSync('git', ['show', 'v0.6.1:Dockerfile'], { cwd: REPOSITORY_ROOT, encoding: 'utf8' });
    const violations = emulationViolations(before);
    expect(violations.some((v) => v.includes('--platform=$BUILDPLATFORM'))).toBe(true);
    expect(violations.some((v) => v.includes('RUN in the final stage'))).toBe(true);
  });

  it('joins continuation lines, so a multi-line RUN is caught as one instruction', () => {
    const source = [
      'FROM --platform=$BUILDPLATFORM node AS build',
      'RUN echo build',
      'FROM node AS runtime',
      '# a comment is not an instruction',
      'RUN chmod +x a \\',
      '  && ln -s a b',
    ].join('\n');
    expect(emulationViolations(source)).toEqual([expect.stringContaining('line 5: RUN in the final stage')]);
  });
});
