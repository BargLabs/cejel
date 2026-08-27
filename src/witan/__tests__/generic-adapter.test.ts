import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { isGenericSignalDocument, parseGenericFile, parseGenericJson } from '../generic-adapter.js';

const GENERIC_DOC: unknown = {
  version: '1.0',
  tool: 'munatrust',
  signals: [
    {
      dimension: 'A2',
      weight: 0.7,
      findings: [
        {
          ruleId: 'hardcoded-secret',
          severity: 'critical',
          message: 'Hardcoded API key detected.',
          location: 'src/config.ts:10',
        },
      ],
    },
  ],
};

describe('generic-adapter — isGenericSignalDocument', () => {
  it('detects a document structurally so version validation runs separately', () => {
    expect(isGenericSignalDocument(GENERIC_DOC)).toBe(true);
    expect(isGenericSignalDocument({ version: '99.0', tool: 'x', signals: [] })).toBe(true);
  });

  it('rejects SARIF, Scorecard, and malformed documents', () => {
    expect(isGenericSignalDocument({ runs: [] })).toBe(false);
    expect(isGenericSignalDocument({ checks: [] })).toBe(false);
    expect(isGenericSignalDocument({ tool: 'x' })).toBe(false);
    expect(isGenericSignalDocument({ signals: [] })).toBe(false);
    expect(isGenericSignalDocument(null)).toBe(false);
    expect(isGenericSignalDocument([])).toBe(false);
  });
});

describe('generic-adapter — parseGenericJson', () => {
  it('maps a valid signal into a WitanInputSignal with source = tool', () => {
    const signals = parseGenericJson(GENERIC_DOC);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ source: 'munatrust', dimension: 'A2', weight: 0.7 });
  });

  it('rejects a missing version rather than guessing the de-facto contract', () => {
    expect(() => parseGenericJson({ tool: 'x', signals: [] })).toThrow(
      /contract version is required.*Refusing to guess/,
    );
  });

  it('rejects unknown majors loudly rather than parsing them as the current contract', () => {
    expect(() => parseGenericJson({ version: '2.0', tool: 'x', signals: [] })).toThrow(
      /unsupported generic ingest contract major version 2.*Refusing to guess/,
    );
  });

  it('accepts additive minor versions and ignores unknown additive fields', () => {
    const signals = parseGenericJson({
      version: '1.7',
      tool: 'future-tool',
      producer: { build: 'synthetic' },
      signals: [
        {
          dimension: 'A1',
          futureSignalField: true,
          findings: [
            {
              ruleId: 'recorded-event',
              severity: 'info',
              message: 'Recorded.',
              futureFindingField: 'ignored',
            },
          ],
        },
      ],
    });
    expect(signals).toEqual([
      {
        source: 'future-tool',
        dimension: 'A1',
        weight: 0.5,
        findings: [{ ruleId: 'recorded-event', severity: 'info', message: 'Recorded.' }],
      },
    ]);
  });

  it('defaults weight to 0.5 when omitted and rejects out-of-range weights', () => {
    const noWeight = parseGenericJson({
      version: '1.0',
      tool: 'x',
      signals: [
        {
          dimension: 'A1',
          findings: [{ ruleId: 'r', severity: 'info', message: 'Recorded.' }],
        },
      ],
    });
    expect(noWeight[0]?.weight).toBe(0.5);

    expect(() =>
      parseGenericJson({
        version: '1.0',
        tool: 'x',
        signals: [
          {
            dimension: 'A1',
            weight: 5,
            findings: [{ ruleId: 'r', severity: 'info', message: 'Recorded.' }],
          },
        ],
      }),
    ).toThrow(/signals\.0\.weight/);
  });

  it('rejects invalid dimensions, severities, empty findings, and missing stable fields', () => {
    expect(() =>
      parseGenericJson({
        version: '1.0',
        tool: 'x',
        signals: [
          {
            dimension: 'unknown-dimension',
            findings: [{ ruleId: 'r', severity: 'bogus' }],
          },
          { dimension: 'A4', findings: [] },
        ],
      }),
    ).toThrow(/invalid generic ingest contract v1\.0/);
  });

  it('returns [] for a non-generic document', () => {
    expect(parseGenericJson({ runs: [] })).toEqual([]);
    expect(parseGenericJson(null)).toEqual([]);
  });
});

describe('generic-adapter — parseGenericFile', () => {
  it('reads and parses a generic signal JSON file from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'witan-generic-'));
    const file = join(dir, 'munatrust.json');
    writeFileSync(file, JSON.stringify(GENERIC_DOC));

    const signals = parseGenericFile(file);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.source).toBe('munatrust');
  });
});
