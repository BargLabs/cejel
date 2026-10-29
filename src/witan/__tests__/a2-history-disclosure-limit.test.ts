import { createHash } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { GitExecFailureReason } from '../git-exec.js';
import { WITAN_A2_HISTORY_APPLICABILITY_PREFIX } from '../abstention.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { type A2HistoryIncompleteness, a2HistoryApplicabilityDisclosure, v27A2FailedHistoryNote } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';
import {
  SHALLOW_A2_SYNTHETIC_SECRET_LINE,
  buildA2HistoryOrigin,
  cloneShallowA2Origin,
  removeShallowA2Fixtures,
} from './fixtures/shallow-a2-shapes.js';

// The #606 review: A2's applicability disclosure (every rubric but v27, which abstains instead) joins
// a prefix, every detected cause of an incomplete history read and the re-scan advice for each. With
// enough causes at once it ran past the schema's 1000-character limit for one disclosure, and the
// scan failed validation and wrote no report, under v17, the default, too. #606 fixed the same kind
// of overflow on v27's B2 note only. A disclosure that fits is unchanged. One that does not keeps the
// prefix and the first cause whole, names the next causes while the whole fits with its advice, and
// counts the rest ("and 2 more causes that the scan limitations name"). A cause no scan limitation
// names (a shallow clone, the history secret scan's file cap) is never counted, only named.
//
// The 30-second timeout cannot be produced quickly on a host that has git, so, as #560's tests do,
// the execGit mock below reports chosen reasons for chosen reads and runs the real git otherwise.
const injected = vi.hoisted(() => ({
  fail: null as null | ((argv: readonly string[]) => GitExecFailureReason | null),
}));
vi.mock('../git-exec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../git-exec.js')>();
  return {
    ...actual,
    execGit: (argv: readonly string[], options: Parameters<typeof actual.execGit>[1]) => {
      const reason = injected.fail?.(argv) ?? null;
      return reason ? { ok: false as const, reason } : actual.execGit(argv, options);
    },
  };
});

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const LIMIT = 1000;
const SECRET = `stripe_secret_key = "${SHALLOW_A2_SYNTHETIC_SECRET_LINE.trim().split('=')[1]}"\n`;
const SHALLOW_CAUSE = "this clone is shallow, so Cejel's scans of earlier commits read only the commits it holds";
const MIDDLE =
  ". Marking A2 not applicable rests in part on Cejel's scans of earlier commits for .env files and " +
  'credential-shaped values, so a complete read of the history may make A2 applicable and give it a score.';

// Three of A2's history reads fall short: the .env-path log (`--diff-filter=AM --name-only`, whole
// and in its batched re-read) stops at the 8 MiB output limit, the per-path log of a deleted
// credential-shaped file at the timeout, and the history secret scan's `git rev-list HEAD` fails
// outright. The history also holds a credential-shaped path with a tab in its name.
const isEnvPathRead = (argv: readonly string[]) =>
  argv[0] === 'log' && argv.includes('--diff-filter=AM') && argv.includes('--name-only');
const isPathHistoryRead = (argv: readonly string[]) => argv[0] === 'log' && argv.includes('--format=%H') && argv.includes('--');
const isRevisionEnumeration = (argv: readonly string[]) => argv.length === 2 && argv[0] === 'rev-list' && argv[1] === 'HEAD';
const OVERFLOWING_READS = (argv: readonly string[]): GitExecFailureReason | null =>
  isEnvPathRead(argv)
    ? 'buffer_exceeded'
    : isPathHistoryRead(argv)
      ? 'timeout'
      : isRevisionEnumeration(argv)
        ? 'exec_failed'
        : null;

let repo = '';

beforeAll(() => {
  const base = { 'package.json': '{"name":"note-limit","version":"1.0.0"}\n', 'src/a.js': 'export const a = 1;\n' };
  const origin = buildA2HistoryOrigin('disclosure-limit', [
    { write: base },
    { write: { 'secrets\tkey.txt': SECRET, 'secrets/key.txt': SECRET } },
    { remove: ['secrets\tkey.txt', 'secrets/key.txt'] },
    { write: { 'README.md': '# n\n' } },
  ]);
  // Depth 3 holds the commit that added both credential-shaped files.
  repo = cloneShallowA2Origin(origin, 3);
}, 120_000);

afterEach(() => {
  injected.fail = null;
});

afterAll(() => {
  removeShallowA2Fixtures();
});

function scan(rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'a2-disclosure-limit',
    productDisplayName: 'A2 disclosure limit',
    generatedAt: '2026-10-28T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
}

function a2(report: WitanReport): WitanCriterionScore {
  const found = report.criteria.find(({ id }) => id === 'A2');
  if (!found) throw new Error('no A2');
  return found;
}

/** Every combination of the causes that reads ran and fell short, as in #606's test of v27's A2 note. */
function everyCombination(): A2HistoryIncompleteness[] {
  const limits = ['120-second time budget for re-reading history in batches', '30-second timeout', '500 KiB output limit', '8 MiB output limit'];
  const inputs: A2HistoryIncompleteness[] = [];
  for (let mask = 1; mask < 1 << 8; mask += 1) {
    inputs.push({
      limitHits: limits.filter((_, bit) => (mask & (1 << bit)) !== 0),
      shallow: (mask & 16) !== 0,
      otherFailure: (mask & 32) !== 0,
      blobCapHit: (mask & 64) !== 0,
      controlCharacterSkip: (mask & 128) !== 0,
    });
  }
  // The causes that mean no history was read replace every other cause in the sentence.
  for (const noRead of [{ gitUnavailable: true }, { repositoryUnopenable: true }, { gitUnavailable: true, repositoryUnopenable: true }]) {
    inputs.push({ ...inputs[inputs.length - 1]!, ...noRead });
  }
  return inputs;
}

describe('the #606 review: A2\'s history-applicability disclosure never stops a scan from writing its report', () => {
  it('the reproduction: a shallow clone where three reads fail and a credential-shaped path has a tab writes a report under v17; v27 is unchanged', () => {
    injected.fail = OVERFLOWING_READS;
    const v17 = a2(scan(V17));
    expect(v17.status).toBe('not_applicable');
    const disclosure = (v17.disclosures ?? []).find((text) => text.startsWith(WITAN_A2_HISTORY_APPLICABILITY_PREFIX)) ?? '';
    expect(disclosure.length).toBeGreaterThan(0);
    expect(disclosure.length).toBeLessThanOrEqual(LIMIT);
    // The prefix and the first cause stay whole; the rest are named while they fit, then counted.
    expect(disclosure.startsWith(`${WITAN_A2_HISTORY_APPLICABILITY_PREFIX}: ${SHALLOW_CAUSE}, and `)).toBe(true);
    expect(disclosure).toContain(', and 1 more cause that the scan limitations name. Marking A2 not applicable');
    expect(disclosure).toContain(MIDDLE);
    expect(disclosure).toContain('Re-scan a full, unfiltered clone (for actions/checkout, set fetch-depth: 0 and no filter).');

    // v27 abstains with its own note, which v27 freeze change F1 already fits to the limit.
    const v27 = a2(scan(V27));
    expect(v27.status).toBe('insufficient_data');
    expect((v27.notes ?? '').length).toBeLessThanOrEqual(LIMIT);
    expect(v27.notes).toBe(
      v27A2FailedHistoryNote(
        {
          shallow: true,
          limitHits: ['30-second timeout', '8 MiB output limit'],
          otherFailure: true,
          controlCharacterSkip: true,
        },
        true,
      ),
    );
  });

  it('every combination of causes fits; the prefix and the first cause stay whole; a disclosure that fits today is unchanged', () => {
    let shortened = 0;
    const unchanged: string[] = [];
    for (const input of everyCombination()) {
      const disclosure = a2HistoryApplicabilityDisclosure(input);
      expect(disclosure.length, JSON.stringify(input)).toBeLessThanOrEqual(LIMIT);
      expect(disclosure, JSON.stringify(input)).toContain(MIDDLE);
      if (/ more causes?(?: that the scan limitations name)?\. Marking/.test(disclosure)) {
        shortened += 1;
        // Only causes a scan limitation names are counted: a shallow clone and the file cap, which
        // none names, are always named in the disclosure itself.
        expect(disclosure, JSON.stringify(input)).toMatch(/ more causes? that the scan limitations name\. Marking/);
        if (input.shallow) expect(disclosure, JSON.stringify(input)).toContain(SHALLOW_CAUSE);
        if (input.blobCapHit) expect(disclosure, JSON.stringify(input)).toContain('stopped at its own cap of 5,000 historical files');
        // The first cause is whole: the text after the prefix runs to the first ", and " that
        // begins another cause, and is one of the causes' own openings.
        expect(disclosure, JSON.stringify(input)).toMatch(
          new RegExp(
            `^${WITAN_A2_HISTORY_APPLICABILITY_PREFIX.replace(/[.*+?^${}()|[\]\\']/g, '\\$&')}: (?:this clone is shallow, so Cejel's scans of earlier commits read only the commits it holds|some of Cejel's reads of earlier commits stopped at Cejel's own [^,]+?(?: \\(the scan limitations name each failed read\\))?), and `,
          ),
        );
      } else {
        unchanged.push(disclosure);
      }
    }
    // 72 combinations ran past the limit at baae3472c (origin/main when this was written).
    expect(shortened).toBe(72);
    expect(unchanged).toHaveLength(258 - 72);
    // The other 186 disclosures, joined, hashed at baae3472c: byte-identical to main.
    expect(createHash('sha256').update(unchanged.join('\n')).digest('hex')).toBe(
      '6f466ee099c9b023151612199772034955e9eca57d2664db166f406372114410',
    );
  });

  it('at exactly the limit the disclosure is unchanged; one character over, it is shortened', () => {
    // The limit names are Cejel's own, so the length is padded through one of them, as #606's test
    // padded a workflow path.
    const base: A2HistoryIncompleteness = {
      shallow: true,
      limitHits: ['30-second timeout', 'X'],
      otherFailure: false,
      controlCharacterSkip: true,
    };
    const probe = a2HistoryApplicabilityDisclosure(base);
    expect(probe.length).toBeLessThan(LIMIT);
    for (const extra of [0, 1]) {
      const name = `${'x'.repeat(LIMIT - probe.length + extra)}X`;
      const input = { ...base, limitHits: ['30-second timeout', name] };
      const disclosure = a2HistoryApplicabilityDisclosure(input);
      if (extra === 0) {
        expect(disclosure.length).toBe(LIMIT);
        expect(disclosure).toContain(`stopped at Cejel's own 30-second timeout and ${name} (the scan limitations name each failed read), and Cejel left`);
        expect(disclosure).not.toMatch(/ more causes?/);
      } else {
        expect(disclosure.length).toBeLessThanOrEqual(LIMIT);
        expect(disclosure.startsWith(`${WITAN_A2_HISTORY_APPLICABILITY_PREFIX}: ${SHALLOW_CAUSE}, and `)).toBe(true);
        expect(disclosure).toMatch(/ more causes?(?: that the scan limitations name)?\. Marking A2 not applicable/);
      }
    }
  });
});
