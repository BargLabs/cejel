import { afterEach, describe, expect, it, vi } from 'vitest';

// #419: the `@cejel/cejel/d-series` subpath is deprecated in 0.6.2 and removed in 0.7.0. The
// package ships no type declarations, so a JSDoc @deprecated tag would reach nobody; the notice is
// Node's own DeprecationWarning, emitted once when the subpath is loaded.
describe('d-series subpath deprecation', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('emits one DeprecationWarning with a stable code when the subpath is loaded', async () => {
    const warnings: Error[] = [];
    const onWarning = (warning: Error) => warnings.push(warning);
    process.on('warning', onWarning);
    try {
      vi.resetModules();
      await import('../index.js');
      await import('../index.js');
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off('warning', onWarning);
    }

    const ours = warnings.filter((w) => (w as NodeJS.ErrnoException).code === 'CEJEL_DEP_D_SERIES');
    expect(ours).toHaveLength(1);
    const [warning] = ours;
    expect(warning?.name).toBe('DeprecationWarning');
    expect(warning?.message).toContain('0.7.0');
    expect(warning?.message).toContain('@cejel/cejel/d-series');
  });

  it('still exports every detector until removal', async () => {
    // Only the exports matter here; the warning is the first test's subject. Node skips emitting a
    // DeprecationWarning while noDeprecation is set, so this load adds no second warning to the
    // test output.
    const previous = process.noDeprecation;
    process.noDeprecation = true;
    let pack: Record<string, unknown>;
    try {
      pack = await import('../index.js');
    } finally {
      process.noDeprecation = previous;
    }
    for (const name of [
      'D_SERIES_RULE_TIERS',
      'scanDeclaredButUnreadConfig',
      'scanSwallowedErrors',
      'scanUnassertedSetTransforms',
      'scanEmptyFailureConflation',
      'scanSelfReferentialVerification',
      'scanUnobservedControls',
    ]) {
      expect(pack).toHaveProperty(name);
    }
  });
});
