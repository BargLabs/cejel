import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseScorecardFile, parseScorecardJson } from '../scorecard-adapter.js';

const SCORECARD: unknown = {
  repo: { name: 'github.com/acme/widget', commit: 'abc123' },
  scorecard: { version: 'v5.0.0' },
  score: 4.8,
  checks: [
    { name: 'Branch-Protection', score: 0, reason: 'branch protection not enabled' },
    { name: 'Code-Review', score: 3, reason: '8 unreviewed changesets' },
    { name: 'Token-Permissions', score: 2, reason: 'non read-only tokens in workflows' },
    { name: 'Dangerous-Workflow', score: 10, reason: 'none detected' },
    { name: 'Signed-Releases', score: 0, reason: 'no signed releases' },
    { name: 'Pinned-Dependencies', score: 2, reason: 'unpinned deps' },
    { name: 'SAST', score: 5, reason: 'SAST not on all commits' },
    { name: 'Vulnerabilities', score: 8, reason: '1 existing vulnerability' },
    { name: 'License', score: 10, reason: 'license present' }, // unmapped → dropped
    { name: 'CII-Best-Practices', score: -1, reason: 'no badge' }, // inconclusive → dropped
  ],
};

describe('scorecard-adapter — parseScorecardJson', () => {
  const signals = parseScorecardJson(SCORECARD);
  const byDim = new Map(signals.map((s) => [s.dimension, s]));

  it('maps failing checks to the correct dimensions', () => {
    expect(byDim.has('B2')).toBe(true); // Branch-Protection + Code-Review
    expect(byDim.has('B3')).toBe(true); // Token-Permissions
    expect(byDim.has('B4')).toBe(true); // Signed-Releases
    expect(byDim.has('A4')).toBe(true); // Pinned-Dependencies + Vulnerabilities
    expect(byDim.has('A2')).toBe(true); // SAST
  });

  it('never maps to substrate-only B1/B5', () => {
    expect(byDim.has('B1')).toBe(false);
    expect(byDim.has('B5')).toBe(false);
  });

  it('drops perfect (10), inconclusive (<0), and unmapped checks', () => {
    const allRuleIds = signals.flatMap((s) => s.findings.map((f) => f.ruleId));
    expect(allRuleIds).not.toContain('scorecard:Dangerous-Workflow'); // perfect 10
    expect(allRuleIds).not.toContain('scorecard:License'); // unmapped
    expect(allRuleIds).not.toContain('scorecard:CII-Best-Practices'); // inconclusive -1
  });

  it('maps score bands to severities (<=3 critical, 4-6 warning, 7-9 info)', () => {
    const b2 = byDim.get('B2');
    const branchProt = b2?.findings.find((f) => f.ruleId === 'scorecard:Branch-Protection');
    expect(branchProt?.severity).toBe('critical'); // score 0
    const a2 = byDim.get('A2');
    const sast = a2?.findings.find((f) => f.ruleId === 'scorecard:SAST');
    expect(sast?.severity).toBe('warning'); // score 5
    const a4 = byDim.get('A4');
    const vulns = a4?.findings.find((f) => f.ruleId === 'scorecard:Vulnerabilities');
    expect(vulns?.severity).toBe('info'); // score 8
  });

  it('bucket weight is the max weight among contributing checks', () => {
    // A4: Pinned-Dependencies (0.8) + Vulnerabilities (0.9) → max 0.9
    expect(byDim.get('A4')?.weight).toBe(0.9);
    // B2: Branch-Protection (0.8) + Code-Review (0.7) → max 0.8
    expect(byDim.get('B2')?.weight).toBe(0.8);
  });

  it('sets source to "scorecard" and stays within schema bounds', () => {
    for (const s of signals) {
      expect(s.source).toBe('scorecard');
      expect(s.weight).toBeGreaterThan(0);
      expect(s.weight).toBeLessThanOrEqual(1);
      for (const f of s.findings) {
        expect(f.message.length).toBeLessThanOrEqual(500);
        expect(f.ruleId.length).toBeGreaterThan(0);
      }
    }
  });

  it('returns [] for malformed input', () => {
    expect(parseScorecardJson(null)).toEqual([]);
    expect(parseScorecardJson({})).toEqual([]);
    expect(parseScorecardJson({ checks: 'nope' })).toEqual([]);
    expect(parseScorecardJson([])).toEqual([]);
  });
});

describe('scorecard-adapter — parseScorecardFile', () => {
  it('reads and parses a Scorecard JSON file from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'witan-scorecard-'));
    const path = join(dir, 'scorecard.json');
    writeFileSync(path, JSON.stringify(SCORECARD), 'utf8');
    const signals = parseScorecardFile(path);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s.source === 'scorecard')).toBe(true);
  });
});
