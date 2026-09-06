import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

function paragraphsContaining(contents: string, needle: string): string[] {
  return contents.split(/\n\s*\n/).filter((paragraph) => paragraph.includes(needle));
}

describe('bounded recall figures stay bound to their scope in README.md', () => {
  const readme = readRepoFile('README.md');

  it('never states 16/30 without "fixture" in the same paragraph', () => {
    const paragraphs = paragraphsContaining(readme, '16/30');
    expect(paragraphs.length).toBeGreaterThan(0);
    for (const paragraph of paragraphs) {
      expect(paragraph.toLowerCase()).toContain('fixture');
    }
  });

  it('never states 24/30 without "prospective" in the same paragraph', () => {
    const paragraphs = paragraphsContaining(readme, '24/30');
    expect(paragraphs.length).toBeGreaterThan(0);
    for (const paragraph of paragraphs) {
      expect(paragraph.toLowerCase()).toContain('prospective');
    }
  });
});
