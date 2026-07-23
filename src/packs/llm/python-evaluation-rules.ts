import { isExcludedLlmSourcePath, maskPythonNonCode } from './lexical.js';
import type { CejelLlmEvaluationFinding } from './evaluation-rules.js';
import type { LlmSourceFile } from './rules.js';

function lineNumberAt(contents: string, index: number): number {
  return contents.slice(0, index).split('\n').length;
}

function escaped(identifier: string): string {
  return identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface PythonClassBlock {
  readonly index: number;
  readonly contents: string;
}

function pythonClassBlocks(masked: string): readonly PythonClassBlock[] {
  const declarations = [...masked.matchAll(
    /^([ \t]*)class\s+[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?\s*:/gm,
  )];
  return declarations.map((declaration, declarationIndex) => {
    const indentation = declaration[1]?.length ?? 0;
    const next = declarations.slice(declarationIndex + 1).find(
      (candidate) => (candidate[1]?.length ?? 0) <= indentation,
    );
    return {
      index: declaration.index,
      contents: masked.slice(declaration.index, next?.index ?? masked.length),
    };
  });
}

/**
 * Detects a complete same-instance Python self-judge path: the judge configuration falls back to
 * the producer configuration, both aliases are stored on the instance and invoked, and a judge
 * verdict is retained on the completed result. This helper is deliberately separate from the
 * Python direct rules so repository-level orchestration can integrate it without broadening them.
 */
export function detectPythonConfiguredSelfJudge(
  file: LlmSourceFile,
): readonly CejelLlmEvaluationFinding[] {
  if (!file.path.toLowerCase().endsWith('.py') || isExcludedLlmSourcePath(file.path)) return [];
  const masked = maskPythonNonCode(file.contents);

  for (const classBlock of pythonClassBlocks(masked)) {
    const classContents = classBlock.contents;
    for (const alias of classContents.matchAll(
      /\bif\s+([A-Za-z_][A-Za-z0-9_]*)\s+is\s+None\s*:\s*\n[ \t]+\1\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/gi,
    )) {
      const judgeParameter = alias[1];
      const producerParameter = alias[2];
      if (!judgeParameter || !producerParameter) continue;
      if (!/judge/i.test(judgeParameter) || !/(?:llm|model)/i.test(producerParameter)) {
        continue;
      }
      const judgeAssignment = classContents.match(
        new RegExp(
          `\\bself\\.([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*${escaped(judgeParameter)}\\b`,
          'i',
        ),
      );
      const producerAssignment = classContents.match(
        new RegExp(
          `\\bself\\.([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*${escaped(producerParameter)}\\b`,
        ),
      );
      const judgeAttribute = judgeAssignment?.[1];
      const producerAttribute = producerAssignment?.[1];
      if (!judgeAttribute || !producerAttribute || judgeAttribute === producerAttribute) continue;
      if (!/judge/i.test(judgeAttribute)) continue;

      const judgeInvoked = new RegExp(
        `\\bself\\.${escaped(judgeAttribute)}\\.(?:ainvoke|invoke|acomplete|complete)\\s*\\(`,
      ).test(classContents);
      const producerInvoked = new RegExp(
        `\\bself\\.${escaped(producerAttribute)}\\.(?:ainvoke|invoke|acomplete|complete)\\s*\\(`,
      ).test(classContents);
      if (!judgeInvoked || !producerInvoked) continue;

      const verdictAssignment = [...classContents.matchAll(
        /\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*await\s+self\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/gi,
      )].find((candidate) => /judge/i.test(candidate[2] ?? ''));
      const verdictIdentifier = verdictAssignment?.[1];
      if (!verdictIdentifier || verdictAssignment.index === undefined) continue;
      const verdictTail = classContents.slice(
        verdictAssignment.index + verdictAssignment[0].length,
      );
      const retainedVerdict = new RegExp(
        `\\bself\\.[A-Za-z_][A-Za-z0-9_.\\[\\]-]*\\.(?:judgement|judgment|verdict|judge_result)\\s*=\\s*${escaped(verdictIdentifier)}\\b`,
        'i',
      ).test(verdictTail.slice(0, 1_200));
      if (!retainedVerdict) continue;

      const completionMatch = classContents.match(
        /\bif\s+self\.[A-Za-z_][A-Za-z0-9_.]*use_judge[A-Za-z0-9_]*\s*:\s*\n[ \t]+await\s+self\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/i,
      );
      const completionJudge = Boolean(
        completionMatch?.[1] && /judge/i.test(completionMatch[1]),
      );
      if (!completionJudge) continue;

      return [{
        ruleId: 'LLM-EVL-002',
        severity: 'warning',
        confidence: 'high',
        summary:
          'A Python evaluation instance defaults its judge to the producer model and retains that judge verdict as the completed result without an independently configured judge.',
        evidence: {
          path: file.path,
          line: lineNumberAt(file.contents, classBlock.index + alias.index),
          label: 'Configured judge aliases the producer model through completion',
        },
      }];
    }
  }
  return [];
}
