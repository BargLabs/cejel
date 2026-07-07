import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../../repo-signals.js';
import {
  buildChecksumFalsePositiveRepo,
  buildHardcodedSecretNoEnvSurfaceRepo,
  buildPlantedCleanRepo,
  buildVariableNamingSecretRepo,
} from './calibration-fixtures.js';

// A2 secret detection v2 — goal_cejel_launch_hardening_combined_2026-07-06, Phase 2.
// Locks the three miscalibrations #337 did not touch: a checksum/hash false positive, a
// false negative where the archetype N/A gate hid a real committed secret, and a false
// negative where the secret keyword wasn't immediately adjacent to `=`/`:`.

function a2SignalFor(repoPath: string) {
  const input = buildWitanInputFromRepo({
    productSlug: 'a2-v2-fixture',
    productDisplayName: 'A2 v2 Fixture',
    repoPath,
    generatedAt: '2026-07-06T00:00:00.000Z',
  });
  return (input.signals ?? []).find((s) => s.criterionId === 'A2') ?? null;
}

describe('A2 fix #1 — checksums/hashes are never flagged as secrets', () => {
  it('a 64-hex sha256 digest assigned to a token-named identifier never fires critical', () => {
    const a2 = a2SignalFor(buildChecksumFalsePositiveRepo());
    expect(a2).not.toBeNull();
    expect((a2?.findings ?? []).some((f) => f.severity === 'critical')).toBe(false);
  });
});

describe('A2 fix #2 — committed secret scan runs regardless of the archetype N/A gate', () => {
  it('a hardcoded sk- style secret with no .env surface anywhere still fires critical', () => {
    const a2 = a2SignalFor(buildHardcodedSecretNoEnvSurfaceRepo());
    expect(a2).not.toBeNull();
    expect((a2?.findings ?? []).some((f) => f.severity === 'critical')).toBe(true);
  });
});

describe('A2 fix #3 — secret keyword anywhere in the identifier, not just immediately before =', () => {
  it('stripe_secret_key / myApiKey / access_token_value are all flagged', () => {
    const a2 = a2SignalFor(buildVariableNamingSecretRepo());
    expect(a2).not.toBeNull();
    expect((a2?.findings ?? []).some((f) => f.severity === 'critical')).toBe(true);
  });

  it('a hardcoded stripe_secret_key with no .env surface still fires critical (fix #2 + #3 together)', () => {
    const a2 = a2SignalFor(buildHardcodedSecretNoEnvSurfaceRepo());
    expect(a2).not.toBeNull();
    expect((a2?.findings ?? []).some((f) => f.severity === 'critical')).toBe(true);
  });
});

describe('A2 — #337 placeholder behavior is preserved', () => {
  it('planted-clean (.env.example template + gitignore + tests) still never fires critical', () => {
    const a2 = a2SignalFor(buildPlantedCleanRepo());
    expect(a2).not.toBeNull();
    expect((a2?.findings ?? []).some((f) => f.severity === 'critical')).toBe(false);
  });
});
