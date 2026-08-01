import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

function readSection(contents: string, heading: string): string {
  const section = contents.split(`${heading}\n`, 2)[1];
  return section?.split('\n## ', 1)[0] ?? '';
}

function normalizeCopy(contents: string): string {
  return contents.replace(/\s+/g, ' ').trim();
}

describe('public D-series coverage boundary', () => {
  it('discloses that D6 is trace-only and excluded from static source rules', () => {
    const coverage = readSection(readRepoFile('README.md'), '## D-series source-rule coverage');

    expect(coverage).toContain('D6 (partial-view inference) is excluded');
    expect(coverage).toContain('trace-surface evidence');
    expect(coverage).toContain('blocked on the harvester resolver');
    expect(coverage).toContain(
      'No static or source heuristic in Cejel claims to detect D6 or reasoning defects in source.',
    );
  });

  it('records the D6 public disclosure in the CLI changelog without implying a rubric change', () => {
    const unreleased = normalizeCopy(
      readSection(readRepoFile('CHANGELOG.md'), '## [Unreleased]'),
    );

    expect(unreleased).toContain(
      'The public D-series coverage documentation now excludes D6 partial-view inference from static source rules.',
    );
    expect(unreleased).toContain(
      'This is a documentation boundary only; no scoring rubric, rule behavior, or public board score changes.',
    );
  });
});
