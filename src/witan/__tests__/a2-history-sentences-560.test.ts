import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { WITAN_A2_HISTORY_APPLICABILITY_PREFIX, WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX } from '../abstention.js';
import {
  a2HistoryApplicabilityDisclosure,
  v27A2FailedHistoryNote,
  type A2HistoryIncompleteness,
} from '../repo-signals.js';

// #560 review round 7 (G1): the exact v27 note, on the scoring path and on the not-applicable path,
// and the every-rubric disclosure, for every single cause of an incomplete history read and for
// several combinations. Before, the scoring-path note always appended "read only part of the
// history", so where git could not be run or could not open the repository it said Cejel read
// "none of the commit history, so … read only part of the history". The expected sentences are
// committed in fixtures/a2-history-sentences-560.json, so a wording change is a reviewed edit there.

interface Expected {
  readonly input: A2HistoryIncompleteness;
  readonly scored: string;
  readonly notApplicable: string;
  readonly disclosure: string;
}

const EXPECTED = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/a2-history-sentences-560.json', import.meta.url)), 'utf8'),
) as Record<string, Expected>;

const SINGLE = [
  'shallow',
  'outputLimit',
  'timeout',
  'otherFailure',
  'blobCap',
  'controlCharacters',
  'gitUnavailable',
  'repositoryUnopenable',
];

describe('A2 history-read sentences, exactly', () => {
  it('covers every single cause and at least two combinations', () => {
    for (const name of SINGLE) expect(EXPECTED[name], name).toBeDefined();
    expect(Object.keys(EXPECTED).filter((name) => name.includes('+')).length).toBeGreaterThanOrEqual(2);
  });

  for (const [name, expected] of Object.entries(EXPECTED)) {
    it(name, () => {
      expect(v27A2FailedHistoryNote(expected.input, false)).toBe(expected.scored);
      expect(v27A2FailedHistoryNote(expected.input, true)).toBe(expected.notApplicable);
      expect(a2HistoryApplicabilityDisclosure(expected.input)).toBe(expected.disclosure);
    });
  }

  it('never says Cejel read none of the history and also part of it', () => {
    for (const [name, expected] of Object.entries(EXPECTED)) {
      for (const sentence of [expected.scored, expected.notApplicable, expected.disclosure]) {
        expect(sentence.includes('none of the') && sentence.includes('only part of'), `${name}: ${sentence}`).toBe(false);
        expect(sentence.length, name).toBeLessThanOrEqual(1000);
      }
      expect(expected.scored.startsWith(WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX), name).toBe(true);
      expect(expected.notApplicable.startsWith(WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX), name).toBe(true);
      expect(expected.disclosure.startsWith(WITAN_A2_HISTORY_APPLICABILITY_PREFIX), name).toBe(true);
    }
  });

  it('where no history read could succeed, reports only that cause and its advice', () => {
    for (const name of ['gitUnavailable', 'repositoryUnopenable', 'gitUnavailable+otherFailure']) {
      const expected = EXPECTED[name] as Expected;
      for (const sentence of [expected.scored, expected.notApplicable, expected.disclosure]) {
        expect(sentence, name).toContain('so Cejel read none of the commit history');
        expect(sentence, name).not.toMatch(/could not read part|fetch-depth|will not lift|may not lift/);
      }
    }
  });
});
