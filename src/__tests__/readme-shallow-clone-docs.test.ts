import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// The README tells a reader to clone in full and says, in plain words, what a shallow clone does to
// the criteria that read commit history, under the default rubric and under the opt-in v27 rubric.
// v27's shallow-clone behaviour changed with its freeze change F1 (2026-10-28), and again with the
// operator's ruling of 1 Nov: under v27 a shallow clone gets no composite score and no verdict, and
// the scan says how to fetch the history. The ruling of 2 Nov gives every rubric, the default v17
// included, that abstention, and gives every rubric "Unrated: no git history" for a directory with
// no .git. The README must not say otherwise, and must not call v27 the default.

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

  // Operator ruling of 2 Nov, extending v27's of 1 Nov: under every rubric, the default included, a
  // shallow clone gets no composite and no verdict, and Cejel says how to fetch the history.
  it('says that under every rubric, the default included, a shallow clone gets no composite and no verdict, and how to fetch the history', () => {
    const everyRubric = shallowParagraphs().filter((paragraph) =>
      /under every rubric, the (?:calibrated )?default included/.test(paragraph.replace(/\s+/g, ' ')),
    );
    expect(everyRubric.length).toBeGreaterThanOrEqual(2);
    for (const paragraph of everyRubric) {
      const text = paragraph.replace(/\s+/g, ' ');
      expect(text).toMatch(/shallow (?:clone|checkout) gets no composite score and no verdict/);
      expect(text).toContain('Unrated: shallow clone');
      expect(text).toContain('git fetch --unshallow');
      expect(text).toContain('fetch-depth: 0');
      expect(text).toMatch(/`limited` output is `true`/);
    }
    // The superseded v27-only wording: under the default a shallow clone is no longer scored.
    const text = README.replace(/\s+/g, ' ');
    expect(text).not.toMatch(/Under the opt-in (?:prospective )?(?:v27 rubric|`witan-rubric-v27-prospective-2026-10-19` rubric)[^.]*, a shallow (?:clone|checkout) gets no composite/);
  });

  it('shows fetch-depth: 0 next to the quick start, and says why', () => {
    const quickStart = README.slice(0, README.indexOf('Or run it once from a shell'));
    expect(quickStart).toMatch(/fetch-depth: 0/);
    expect(quickStart.replace(/\s+/g, ' ')).toContain('"Unrated: shallow clone", with no score and no verdict, under every rubric, the default included');
  });

  it('says a directory with no .git, an uploaded snapshot included, is Unrated: no git history under every rubric', () => {
    const paragraphs = README.split(/\n\s*\n/).filter((paragraph) => paragraph.includes('Unrated: no git history'));
    expect(paragraphs.length).toBeGreaterThanOrEqual(3);
    const text = paragraphs.join('\n\n').replace(/\s+/g, ' ');
    expect(text).toMatch(/under every rubric/);
    expect(text).toMatch(/HTTP or remote-MCP server/);
    expect(text).toContain('an uploaded snapshot or archive carries no history');
  });

  it('does not call v27 the default, and drops the superseded claims about v27 on a shallow clone', () => {
    const text = README.replace(/\s+/g, ' ');
    expect(text).not.toMatch(/v27[^.]*\bis the default\b/i);
    expect(text).not.toMatch(/\bdefault\b[^.]*\bv27\b/i);
    expect(text).not.toContain('B2 abstains, where it would be scored, when fewer than 12 commits are visible');
    expect(text).not.toMatch(/verdict (?:is )?capped/);
    expect(text).not.toMatch(/left out of the composite, but the verdict/);
  });
});
