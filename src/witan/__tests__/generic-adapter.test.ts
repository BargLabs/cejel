import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { isGenericSignalDocument, parseGenericFile, parseGenericJson } from '../generic-adapter.js';

const GENERIC_DOC: unknown = {
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
        { ruleId: 'unknown-severity', severity: 'bogus', message: 'dropped' },
      ],
    },
    { dimension: 'unknown-dimension', findings: [{ ruleId: 'x', severity: 'warning' }] },
    { dimension: 'A4', findings: [] },
  ],
};

describe('generic-adapter — isGenericSignalDocument', () => {
  it('accepts a document with a tool string and signals array', () => {
    expect(isGenericSignalDocument(GENERIC_DOC)).toBe(true);
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

  it('drops findings with an unrecognized severity', () => {
    const signals = parseGenericJson(GENERIC_DOC);
    const ruleIds = signals.flatMap((s) => s.findings.map((f) => f.ruleId));
    expect(ruleIds).toContain('hardcoded-secret');
    expect(ruleIds).not.toContain('unknown-severity');
  });

  it('drops signals with an unrecognized dimension', () => {
    const signals = parseGenericJson(GENERIC_DOC);
    expect(signals.some((s) => s.dimension === ('unknown-dimension' as never))).toBe(false);
  });

  it('drops signals with zero surviving findings', () => {
    const signals = parseGenericJson(GENERIC_DOC);
    expect(signals.some((s) => s.dimension === 'A4')).toBe(false);
  });

  it('defaults weight to 0.5 when omitted, clamps out-of-range weights', () => {
    const noWeight = parseGenericJson({
      tool: 'x',
      signals: [{ dimension: 'A1', findings: [{ ruleId: 'r', severity: 'info' }] }],
    });
    expect(noWeight[0]?.weight).toBe(0.5);

    const clamped = parseGenericJson({
      tool: 'x',
      signals: [{ dimension: 'A1', weight: 5, findings: [{ ruleId: 'r', severity: 'info' }] }],
    });
    expect(clamped[0]?.weight).toBe(1);
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
