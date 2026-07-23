import assert from 'node:assert/strict';
import test from 'node:test';

import { findProhibitedPublicClaims } from './public-claims.mjs';

test('detects each prohibited public claim class', () => {
  const examples = [
    ['Cejel measures a general hallucination rate.', 'general_hallucination_rate'],
    ['Cejel prevents hallucinations in production.', 'hallucination_prevention_or_detection'],
    ['Cejel provides hallucination detection.', 'hallucination_prevention_or_detection'],
    ['Cejel makes every LLM application safe.', 'universal_safety_or_trust'],
    ['Cejel provides complete coverage for all agent frameworks.', 'complete_framework_coverage'],
    ['Cejel covers all model SDKs.', 'complete_framework_coverage'],
  ];
  for (const [content, expected] of examples) {
    assert.deepEqual(findProhibitedPublicClaims(content).map((item) => item.claim_class), [expected]);
  }
});

test('permits explicit boundary denials and unrelated guarantees', () => {
  for (const content of [
    'Cejel does not measure a model hallucination rate.',
    'Cejel cannot prevent hallucinations.',
    'Cejel does not guarantee that every LLM application is safe.',
    'Cejel does not provide complete coverage for all agent frameworks.',
    'The installer guarantees atomic replacement of the local output file.',
  ]) assert.deepEqual(findProhibitedPublicClaims(content), []);
});
