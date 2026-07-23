const NEGATION_PATTERN =
  /\b(?:does?\s+not|is\s+not|are\s+not|cannot|can't|won't|never|no\s+claim\s+(?:of|to)|not\s+designed\s+to|doesn't)\b/i;

const CLAIM_PATTERNS = [
  {
    claimClass: 'general_hallucination_rate',
    pattern: /\b(?:general\s+)?hallucination(?:s)?\s+(?:rate|rates)\b|\b(?:rate|rates)\s+of\s+(?:model\s+)?hallucinations?\b/gi,
  },
  {
    claimClass: 'hallucination_prevention_or_detection',
    pattern: /\b(?:detect(?:s|ed|ing|ion)?|prevent(?:s|ed|ing|ion)?|eliminat(?:e|es|ed|ing|ion)|stop(?:s|ped|ping)?)\b[^.!?\n]{0,80}\bhallucinations?\b|\bhallucinations?\b[^.!?\n]{0,80}\b(?:detect(?:s|ed|ing|ion)?|prevent(?:s|ed|ing|ion)?|eliminat(?:e|es|ed|ing|ion)|stop(?:s|ped|ping)?)\b|\bhallucination[- ]free\b/gi,
  },
  {
    claimClass: 'universal_safety_or_trust',
    pattern: /\b(?:make(?:s)?|keep(?:s)?|guarantee(?:s|d)?|ensure(?:s|d)?|prove(?:s|d)?)\b[^.!?\n]{0,100}\b(?:every|all|any)\b[^.!?\n]{0,60}\b(?:llm|model|agent|application|repository|codebase)s?\b[^.!?\n]{0,50}\b(?:safe|secure|trusted|trustworthy)\b|\b(?:universal(?:ly)?|always)\b[^.!?\n]{0,80}\b(?:safe|secure|trusted|trustworthy)\b/gi,
  },
  {
    claimClass: 'complete_framework_coverage',
    pattern: /\b(?:complete|comprehensive|full)\s+(?:coverage|support)\b[^.!?\n]{0,100}\b(?:llm|model|agent|sdk|language|framework)s?\b|\bcover(?:s|ed|ing)?\s+(?:every|all)\b[^.!?\n]{0,80}\b(?:llm|model|agent|sdk|language|framework)s?\b/gi,
  },
];

function isNegated(text, start) {
  const sentenceStart = Math.max(
    text.lastIndexOf('.', start - 1),
    text.lastIndexOf('!', start - 1),
    text.lastIndexOf('?', start - 1),
    text.lastIndexOf('\n', start - 1),
  );
  const prefix = text.slice(sentenceStart + 1, start);
  const boundaries = [...prefix.matchAll(/;|\b(?:but|however|yet)\b/gi)];
  const lastBoundary = boundaries.at(-1);
  const clause = lastBoundary
    ? prefix.slice((lastBoundary.index ?? 0) + lastBoundary[0].length)
    : prefix;
  return NEGATION_PATTERN.test(clause);
}

export function findProhibitedPublicClaims(text) {
  if (typeof text !== 'string') throw new Error('public claim input must be UTF-8 text');
  const matches = [];
  for (const { claimClass, pattern } of CLAIM_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const originalIndex = match.index ?? 0;
      const internalBoundaries = [...match[0].matchAll(/;|\b(?:but|however|yet)\b/gi)];
      const lastInternalBoundary = internalBoundaries.at(-1);
      const boundaryEnd = lastInternalBoundary
        ? (lastInternalBoundary.index ?? 0) + lastInternalBoundary[0].length
        : 0;
      const claimIndex = originalIndex + boundaryEnd;
      if (isNegated(text, claimIndex)) continue;
      matches.push({
        claim_class: claimClass,
        index: claimIndex,
        excerpt: match[0].slice(boundaryEnd).trim(),
      });
    }
  }
  return matches.sort((left, right) => left.index - right.index ||
    left.claim_class.localeCompare(right.claim_class));
}
