import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// The README tells a reader to clone in full and says, in plain words, what a shallow clone does to
// the criteria that read commit history, under the default rubric and under the opt-in v27 rubric.
// v27's shallow-clone behaviour changed with its freeze change F1 (2026-10-28): its shallow-only A2
// abstention leaves the composite, the verdict is capped where A2 could not be read, and B2 withholds
// only its ratio. The README must not say otherwise, and must not call v27 the default.

const README = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
const V27 = 'witan-rubric-v27-prospective-2026-10-19';

/** Each fenced YAML block in the README that checks out the repository. */
function checkoutExamples(): string[] {
  return [...README.matchAll(/```ya?ml\n([\s\S]*?)```/g)]
    .map((match) => match[1] ?? '')
    .filter((block) => block.includes('actions/checkout'));
}

/** The paragraphs that mention a shallow clone. */
function shallowParagraphs(): string[] {
  return README.split(/\n\s*\n/).filter((paragraph) => /shallow clone/.test(paragraph));
}

describe('README: clone in full, and what a shallow clone does', () => {
  it('every checkout example sets fetch-depth: 0', () => {
    const examples = checkoutExamples();
    expect(examples.length).toBeGreaterThanOrEqual(3);
    for (const example of examples) expect(example).toMatch(/\n\s*fetch-depth: 0\b/);
  });

  it('says the history criteria see only the commits held, and that B2 withholds its merge ratio', () => {
    const text = shallowParagraphs().join('\n\n').replace(/\s+/g, ' ');
    expect(text).toMatch(/A2's scans of earlier commits[^.]*read only/);
    expect(text).toMatch(/B2 withholds its pull-request merge ratio/);
    expect(text).toContain('History limitations');
  });

  it('says that under the opt-in v27 rubric a shallow scan\'s verdict is capped where A2 could not be read', () => {
    const v27Paragraphs = shallowParagraphs().filter((paragraph) => paragraph.includes(V27));
    expect(v27Paragraphs.length).toBeGreaterThanOrEqual(2);
    for (const paragraph of v27Paragraphs) {
      const text = paragraph.replace(/\s+/g, ' ');
      expect(text).toMatch(/opt-in/);
      expect(text).toMatch(/verdict (?:is )?capped/);
    }
  });

  it('does not call v27 the default, and drops the pre-F1 claims about v27 on a shallow clone', () => {
    const text = README.replace(/\s+/g, ' ');
    expect(text).not.toMatch(/v27[^.]*\bis the default\b/i);
    expect(text).not.toMatch(/\bdefault\b[^.]*\bv27\b/i);
    expect(text).not.toContain('B2 abstains, where it would be scored, when fewer than 12 commits are visible');
  });
});
