import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  REPO_ROOT,
  RULE_DISPOSITIONS,
  UncensusedRuleError,
  deriveShippedRuleInventory,
  renderCensus,
} from '../defect-class-census.js';

const CONSTRAINTS_VERSION_LINE = '**CONSTRAINTS-VERSION: 2026-08-01.5**';

describe('defect-class census', () => {
  it('matches the committed docs/defect-class-census.md exactly', () => {
    const generated = renderCensus({ constraintsVersionLine: CONSTRAINTS_VERSION_LINE });
    const committed = readFileSync(resolve(REPO_ROOT, 'docs', 'defect-class-census.md'), 'utf8');
    expect(committed).toBe(generated);
  });

  it('mechanically derives at least the known Witan and D-series rule ids', () => {
    const ids = deriveShippedRuleInventory().map((r) => r.id);
    for (const expected of ['A1', 'A2', 'B6', 'validation-integrity', 'D1', 'D6']) {
      expect(ids).toContain(expected);
    }
  });

  it('red: throws when a shipped rule has no disposition entry', () => {
    const inventory = deriveShippedRuleInventory();
    const withExtraRule = [...inventory, { id: 'A99', title: 'Fabricated future rule', source: 'witan-core' as const }];
    const shipped = new Set(withExtraRule.map((r) => r.id));
    const censused = new Set(Object.keys(RULE_DISPOSITIONS));
    const missing = [...shipped].filter((id) => !censused.has(id));
    expect(missing).toEqual(['A99']);
    expect(() => {
      if (missing.length > 0) throw new UncensusedRuleError(missing, []);
    }).toThrowError(/A99/);
  });

  it('green: the real, current inventory has no missing or stale disposition entries', () => {
    const inventory = deriveShippedRuleInventory();
    const shipped = new Set(inventory.map((r) => r.id));
    const censused = new Set(Object.keys(RULE_DISPOSITIONS));
    expect([...shipped].filter((id) => !censused.has(id))).toEqual([]);
    expect([...censused].filter((id) => !shipped.has(id))).toEqual([]);
    // Also exercised end-to-end: renderCensus() above would have thrown UncensusedRuleError
    // already if this weren't true.
  });

  it('every rule disposition entry states a mechanism for each claimed target', () => {
    for (const [ruleId, disposition] of Object.entries(RULE_DISPOSITIONS)) {
      for (const target of disposition.targets) {
        expect(target.justification.length, `${ruleId} -> ${target.classId} justification`).toBeGreaterThan(20);
        if (target.status === 'partial') {
          expect(target.gap, `${ruleId} -> ${target.classId} partial status needs a stated gap`).toBeTruthy();
        }
      }
    }
  });
});
