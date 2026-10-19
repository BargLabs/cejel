import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { parseGenericDocument } from '../generic-adapter.js';
import {
  INGEST_FRESHNESS_WINDOW_SECONDS,
  type IngestDocumentRecord,
  bindingStatusForChecks,
  evaluateInputBindingRecord,
  extractSarifIdentity,
  extractScorecardIdentity,
  normalizeRepositoryIdentity,
  parseObservedAt,
  verifyRecordedInputDigests,
} from '../input-binding.js';

const HEAD = '3f9c2a7e5b1d4c6a8e0f2b4d6c8a0e2f4b6d8c0a';
const SCANNED = {
  repository: 'github.com/owner/repo',
  commit: HEAD,
  commitTime: '2026-10-01T12:00:00.000Z',
};

function record(identity: IngestDocumentRecord['identity']): IngestDocumentRecord {
  return {
    sha256: 'a'.repeat(64),
    format: 'generic',
    provenance: 'operator_supplied',
    identity,
    displayPath: 'input.json',
  };
}

describe('repository identity normalization', () => {
  it.each([
    ['github.com/Owner/Repo', 'github.com/owner/repo'],
    ['https://github.com/owner/repo.git', 'github.com/owner/repo'],
    ['https://github.com/owner/repo/', 'github.com/owner/repo'],
    ['git@github.com:owner/repo.git', 'github.com/owner/repo'],
    ['ssh://git@github.com:22/owner/repo', 'github.com/owner/repo'],
    ['https://user:token@github.com/owner/repo', 'github.com/owner/repo'],
    ['https://gitlab.example.com/group/sub/repo', 'gitlab.example.com/group/sub/repo'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeRepositoryIdentity(input)).toBe(expected);
  });

  it('never records URL credentials', () => {
    expect(normalizeRepositoryIdentity('https://user:s3cr3t@github.com/owner/repo')).not.toContain(
      's3cr3t',
    );
  });

  it.each(['', 'not a repository', 'repo', 'https://github.com/'])(
    'refuses to normalize %j',
    (input) => {
      expect(normalizeRepositoryIdentity(input)).toBeUndefined();
    },
  );
});

describe('observation times', () => {
  it('reads a date-only value as the last second of that UTC day', () => {
    expect(parseObservedAt('2026-10-01')).toBe('2026-10-01T23:59:59.000Z');
  });
  it('normalizes offsets to UTC', () => {
    expect(parseObservedAt('2026-10-01T14:00:00+02:00')).toBe('2026-10-01T12:00:00.000Z');
  });
  it.each(['yesterday', '2026-13-45', '1696161600', 42])('ignores %j', (value) => {
    expect(parseObservedAt(value)).toBeUndefined();
  });
});

describe('format identity extraction', () => {
  it('Scorecard: repo.name, repo.commit, date, scorecard version and commit', () => {
    expect(
      extractScorecardIdentity({
        date: '2026-10-02T00:00:00Z',
        repo: { name: 'github.com/owner/repo', commit: HEAD },
        scorecard: { version: 'v5.6.0', commit: 'C0FFEE00C0FFEE00C0FFEE00C0FFEE00C0FFEE00' },
        checks: [],
      }),
    ).toEqual({
      producers: [
        { name: 'scorecard', version: 'v5.6.0', commit: 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00' },
      ],
      subjects: [{ repository: 'github.com/owner/repo', commit: HEAD }],
      observedAt: '2026-10-02T00:00:00.000Z',
    });
  });

  it('SARIF: every run and provenance entry, earliest invocation time', () => {
    expect(
      extractSarifIdentity({
        runs: [
          {
            tool: { driver: { name: 'ToolA', semanticVersion: '1.2.3' } },
            versionControlProvenance: [{ repositoryUri: 'https://github.com/owner/repo', revisionId: HEAD }],
            invocations: [{ startTimeUtc: '2026-10-02T10:00:00Z', endTimeUtc: '2026-10-02T10:05:00Z' }],
          },
          {
            tool: { driver: { name: 'ToolB', version: '9' } },
            versionControlProvenance: [{ repositoryUri: 'https://github.com/owner/repo', revisionId: HEAD }],
            invocations: [{ startTimeUtc: '2026-10-02T09:00:00Z' }],
            results: [],
          },
        ],
      }),
    ).toEqual({
      producers: [
        { name: 'ToolA', version: '1.2.3' },
        { name: 'ToolB', version: '9' },
      ],
      subjects: [{ repository: 'github.com/owner/repo', commit: HEAD }],
      observedAt: '2026-10-02T09:00:00.000Z',
    });
  });

  it('SARIF without provenance or invocations carries no subject', () => {
    expect(extractSarifIdentity({ runs: [{ tool: { driver: { name: 'X' } }, results: [] }] })).toEqual({
      producers: [{ name: 'X' }],
      subjects: [],
    });
  });

  it('generic 1.1 reads subject, producer and observedAt', () => {
    const { identity } = parseGenericDocument({
      version: '1.1',
      tool: 'scanner',
      subject: { repository: 'https://github.com/owner/repo.git', commit: HEAD.toUpperCase() },
      producer: { version: '2.0.0' },
      observedAt: '2026-10-02T00:00:00Z',
      signals: [],
    });
    expect(identity).toEqual({
      producers: [{ name: 'scanner', version: '2.0.0' }],
      subjects: [{ repository: 'github.com/owner/repo', commit: HEAD }],
      observedAt: '2026-10-02T00:00:00.000Z',
    });
  });

  it('generic 1.0 ignores identity-named fields, as v1 consumers must ignore unknown fields', () => {
    const { identity } = parseGenericDocument({
      version: '1.0',
      tool: 'scanner',
      subject: 'free text that 1.0 never defined',
      observedAt: 'whenever',
      signals: [],
    });
    expect(identity).toEqual({ producers: [{ name: 'scanner' }], subjects: [] });
  });

  it('generic 1.1 fails loudly on an invalid stable identity field', () => {
    expect(() =>
      parseGenericDocument({
        version: '1.1',
        tool: 'scanner',
        subject: { commit: 'not-a-commit' },
        signals: [],
      }),
    ).toThrow(/subject\.commit/);
    expect(() =>
      parseGenericDocument({ version: '1.1', tool: 'scanner', observedAt: 'yesterday', signals: [] }),
    ).toThrow(/observedAt/);
  });
});

describe('binding evaluation', () => {
  it('precedence: repository mismatch, commit mismatch, stale, matched, unverifiable, unbound', () => {
    expect(
      bindingStatusForChecks({ repository: 'mismatched', commit: 'mismatched', freshness: 'stale' }),
    ).toBe('mismatched-repository');
    expect(
      bindingStatusForChecks({ repository: 'matched', commit: 'mismatched', freshness: 'stale' }),
    ).toBe('mismatched-commit');
    expect(
      bindingStatusForChecks({ repository: 'matched', commit: 'matched', freshness: 'stale' }),
    ).toBe('stale');
    expect(
      bindingStatusForChecks({ repository: 'absent', commit: 'matched', freshness: 'absent' }),
    ).toBe('matched');
    expect(
      bindingStatusForChecks({ repository: 'matched', commit: 'unverifiable', freshness: 'absent' }),
    ).toBe('unverifiable');
    expect(
      bindingStatusForChecks({ repository: 'matched', commit: 'absent', freshness: 'within-window' }),
    ).toBe('unbound');
  });

  it('matches an abbreviated commit by prefix and a full one exactly', () => {
    const short = evaluateInputBindingRecord(
      record({ producers: [], subjects: [{ commit: HEAD.slice(0, 12) }] }),
      SCANNED,
    );
    expect(short.status).toBe('matched');
    const almost = evaluateInputBindingRecord(
      record({ producers: [], subjects: [{ commit: `${HEAD.slice(0, 39)}b` }] }),
      SCANNED,
    );
    expect(almost.status).toBe('mismatched-commit');
  });

  it('measures freshness against the HEAD commit time, at the declared window boundary', () => {
    const windowStart = new Date(
      Date.parse(SCANNED.commitTime) - INGEST_FRESHNESS_WINDOW_SECONDS * 1000,
    ).toISOString();
    const justInside = evaluateInputBindingRecord(
      record({ producers: [], subjects: [], observedAt: windowStart }),
      SCANNED,
    );
    expect(justInside.checks.freshness).toBe('within-window');
    const justOutside = evaluateInputBindingRecord(
      record({
        producers: [],
        subjects: [],
        observedAt: new Date(Date.parse(windowStart) - 1000).toISOString(),
      }),
      SCANNED,
    );
    expect(justOutside.status).toBe('stale');
  });

  it('records a declared repository as unverifiable when the scan names none', () => {
    const result = evaluateInputBindingRecord(
      record({ producers: [], subjects: [{ repository: 'github.com/other/repo', commit: HEAD }] }),
      { commit: HEAD },
    );
    expect(result.checks.repository).toBe('unverifiable');
    expect(result.status).toBe('matched');
  });
});

describe('recorded input digests', () => {
  const sha = (text: string) => createHash('sha256').update(Buffer.from(text)).digest('hex');
  const files: Record<string, string> = { '/a.json': 'A', '/b.json': 'B', '/swapped.json': 'C' };
  const read = (path: string) => Buffer.from(files[path] ?? '');
  const report = {
    inputBinding: {
      policy: 'record-only' as const,
      freshnessWindowSeconds: 86_400,
      scannedSubject: {},
      inputs: [sha('A'), sha('B')].map((digest) => ({
        sha256: digest,
        format: 'generic' as const,
        provenance: 'operator_supplied' as const,
        producers: [],
        subjects: [],
        status: 'unbound' as const,
        checks: { repository: 'absent' as const, commit: 'absent' as const, freshness: 'absent' as const },
        scored: true,
      })),
    },
  };

  it('accepts exactly the recorded set, in any order', () => {
    expect(verifyRecordedInputDigests(report, ['/b.json', '/a.json'], read).valid).toBe(true);
  });

  it('detects a swapped input', () => {
    const result = verifyRecordedInputDigests(report, ['/a.json', '/swapped.json'], read);
    expect(result.valid).toBe(false);
    expect(result.lines.join('\n')).toContain('/swapped.json');
    expect(result.lines.join('\n')).toContain(sha('B'));
  });

  it('detects an omitted input and refuses a report that records none', () => {
    expect(verifyRecordedInputDigests(report, ['/a.json'], read).valid).toBe(false);
    expect(verifyRecordedInputDigests({}, ['/a.json'], read).valid).toBe(false);
  });
});
