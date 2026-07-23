import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CEJEL_LLM_ACTION_RULES } from '../action-rules.js';
import { detectCejelLlmEvaluationRules } from '../evaluation-rules.js';
import { CEJEL_LLM_PYTHON_RULES } from '../python-rules.js';
import { CEJEL_LLM_V1_RULES, type LlmSourceFile } from '../rules.js';
import { CEJEL_LLM_ENABLED_RULE_IDS, type CejelLlmEnabledRuleId } from '../types.js';

type Detector = 'javascript' | 'python' | 'action' | 'python-action' | 'evaluation';
interface CoveragePattern {
  readonly pattern_id: string;
  readonly detector: Detector;
  readonly structural_signature: string;
  readonly positive_fixture: string;
  readonly negative_fixture: string;
}
interface RuleCoverage {
  readonly rule_id: CejelLlmEnabledRuleId;
  readonly patterns: readonly CoveragePattern[];
}
interface FixtureCoverageManifest {
  readonly schema_version: '1.0.0';
  readonly catalogue_id: string;
  readonly claim_boundary: string;
  readonly enabled_rule_ids: readonly CejelLlmEnabledRuleId[];
  readonly rules: readonly RuleCoverage[];
}

const testDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(testDir, 'fixtures');
const manifest = JSON.parse(
  readFileSync(join(testDir, 'fixture-coverage-manifest.json'), 'utf8'),
) as FixtureCoverageManifest;

function source(name: string, detector: Detector): LlmSourceFile {
  const extension = detector === 'python' || detector === 'python-action' ? 'py' : 'ts';
  return {
    path: `src/fixture-coverage.${extension}`,
    contents: readFileSync(join(fixtureDir, name), 'utf8'),
  };
}

function findings(
  detector: Detector,
  ruleId: CejelLlmEnabledRuleId,
  file: LlmSourceFile,
) {
  if (detector === 'evaluation') {
    return detectCejelLlmEvaluationRules([file]).filter((finding) => finding.ruleId === ruleId);
  }
  const catalogue = detector === 'python'
    ? CEJEL_LLM_PYTHON_RULES
    : detector === 'action' || detector === 'python-action'
      ? CEJEL_LLM_ACTION_RULES
      : CEJEL_LLM_V1_RULES;
  const rule = catalogue.find((candidate) => candidate.id === ruleId);
  expect(rule, `${ruleId} must exist in its declared ${detector} detector`).toBeDefined();
  return rule?.detect(file) ?? [];
}

describe('Free LLM synthetic fixture coverage manifest', () => {
  it('maps the exact enabled catalogue once, with unique syntax-pattern ids', () => {
    expect(manifest.schema_version).toBe('1.0.0');
    expect(manifest.claim_boundary).toContain('no package or SDK version');
    expect(manifest.enabled_rule_ids).toEqual(CEJEL_LLM_ENABLED_RULE_IDS);
    expect(manifest.rules.map((rule) => rule.rule_id)).toEqual(CEJEL_LLM_ENABLED_RULE_IDS);
    const patternIds = manifest.rules.flatMap((rule) =>
      rule.patterns.map((pattern) => pattern.pattern_id)
    );
    expect(new Set(patternIds).size).toBe(patternIds.length);
    expect(manifest.rules.every((rule) => rule.patterns.length > 0)).toBe(true);
  });

  for (const rule of manifest.rules) {
    for (const pattern of rule.patterns) {
      it(`${rule.rule_id} ${pattern.pattern_id} has tested positive and negative structural fixtures`, () => {
        expect(pattern.structural_signature.length).toBeGreaterThan(40);
        expect(existsSync(join(fixtureDir, pattern.positive_fixture))).toBe(true);
        expect(existsSync(join(fixtureDir, pattern.negative_fixture))).toBe(true);

        const positive = findings(
          pattern.detector,
          rule.rule_id,
          source(pattern.positive_fixture, pattern.detector),
        );
        const negative = findings(
          pattern.detector,
          rule.rule_id,
          source(pattern.negative_fixture, pattern.detector),
        );
        expect(positive.length).toBeGreaterThan(0);
        expect(positive.every((finding) => finding.ruleId === rule.rule_id)).toBe(true);
        expect(negative).toEqual([]);
      });
    }
  }
});
