import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The changelog states, in bold, exactly which signals the withheld-path abstention mechanism
// covers. That sentence was written when two signals were wired and went stale the moment a
// third was added in the same release, by a different PR that never read it: a false assertion
// in the document a customer reads to decide whether to upgrade. Count the wirings in the
// source and require the prose to agree.
describe('changelog withheld-path signal count matches the source', () => {
  it('names as many signals as repo-signals.ts actually wires', () => {
    const source = readFileSync('src/witan/repo-signals.ts', 'utf8');
    const wired = [...source.matchAll(/abstainSignalOnWithheldPaths\(\s*'[^']+',\s*'([^']+)'/g)].map(
      (m) => m[1],
    );
    expect(wired.length).toBeGreaterThan(0);
    const changelog = readFileSync('CHANGELOG.md', 'utf8');
    const claim = changelog.match(/This mechanism covers exactly (\w+) signals?/);
    const claimedWord = claim?.[1];
    expect(claimedWord, 'the changelog must state how many signals the mechanism covers').toBeDefined();
    const WORDS: Record<string, number | undefined> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
    };
    expect(WORDS[claimedWord ?? ''], `unrecognised count word "${claimedWord}"`).toBe(
      new Set(wired).size,
    );
    for (const signal of new Set(wired)) {
      expect(changelog, `changelog must name the wired signal ${signal}`).toContain(signal);
    }
  });
});
