// goal_cejel_issue_reproduces_scan_year_2026-11-05, item A: the attested scan time `cejel issue`
// reproduces with is refused, with a named reason, when it is missing, is not an ISO 8601 time, or
// is later than the issuer's clock.

import { describe, expect, it } from 'vitest';

import { isWithinDayOfNewYearUtc, readReproductionGeneratedAt } from '../issuance.js';

describe('isWithinDayOfNewYearUtc (item B)', () => {
  it('holds from 24 hours before to 24 hours after midnight UTC on 1 January, inclusive', () => {
    expect(isWithinDayOfNewYearUtc('2025-12-31T00:00:00.000Z')).toBe(true);
    expect(isWithinDayOfNewYearUtc('2025-12-31T23:59:59.999Z')).toBe(true);
    expect(isWithinDayOfNewYearUtc('2026-01-01T00:00:00.000Z')).toBe(true);
    expect(isWithinDayOfNewYearUtc('2026-01-02T00:00:00.000Z')).toBe(true);
  });

  it('does not hold one millisecond outside that window, or mid-year', () => {
    expect(isWithinDayOfNewYearUtc('2025-12-30T23:59:59.999Z')).toBe(false);
    expect(isWithinDayOfNewYearUtc('2026-01-02T00:00:00.001Z')).toBe(false);
    expect(isWithinDayOfNewYearUtc('2025-06-15T12:00:00.000Z')).toBe(false);
  });

  it('reads the window in UTC, whatever offset the time is written with', () => {
    expect(isWithinDayOfNewYearUtc('2025-12-30T20:00:00-05:00')).toBe(true);
    expect(isWithinDayOfNewYearUtc('2026-01-02T08:00:00+09:00')).toBe(true);
    expect(isWithinDayOfNewYearUtc('2026-01-02T10:00:00+09:00')).toBe(false);
  });
});

describe('readReproductionGeneratedAt', () => {
  const now = new Date('2026-02-01T12:00:00.000Z');

  it('returns the attested time when it is valid and not in the future', () => {
    expect(
      readReproductionGeneratedAt({ predicate: { generatedAt: '2025-06-15T12:00:00.000Z' } }, now),
    ).toEqual({ ok: true, generatedAt: '2025-06-15T12:00:00.000Z' });
  });

  it('accepts a time equal to the issuer clock', () => {
    expect(
      readReproductionGeneratedAt({ predicate: { generatedAt: now.toISOString() } }, now).ok,
    ).toBe(true);
  });

  it('accepts a time with a numeric offset', () => {
    expect(
      readReproductionGeneratedAt({ predicate: { generatedAt: '2025-06-15T05:00:00-07:00' } }, now)
        .ok,
    ).toBe(true);
  });

  it('names a missing value', () => {
    for (const statement of [{ predicate: {} }, {}, null, 'attestation']) {
      const result = readReproductionGeneratedAt(statement, now);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/predicate\.generatedAt is missing/);
    }
  });

  it('names a value that is not an ISO 8601 time', () => {
    for (const value of [
      '15 June 2025',
      '2025-06-15',
      1749988800000,
      '2025-99-99T99:99:99Z',
      '2025-06-15T12:00:00',
    ]) {
      const result = readReproductionGeneratedAt({ predicate: { generatedAt: value } }, now);
      expect(result.ok, String(value)).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/predicate\.generatedAt is not a valid ISO 8601 time/);
      }
    }
  });

  it('names a value later than the issuer clock', () => {
    const result = readReproductionGeneratedAt(
      { predicate: { generatedAt: '2026-02-01T12:00:00.001Z' } },
      now,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/later than this issuer's clock/);
  });
});
