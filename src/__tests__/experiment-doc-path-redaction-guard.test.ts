import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PUBLIC_REDACTED_ARTIFACTS = [
  'docs/experiments/d-series-base-rate-2026-08-02/owned-corpus.json',
  'docs/experiments/session-archive-census-2026-08-01.md',
  'docs/experiments/session-trace-recall-preregistration-2026-08-01.md',
  'docs/experiments/session-trace-recall-result-2026-08-01.md',
  'docs/experiments/shape-diversity-preregistration-2026-08-01.md',
  'docs/experiments/shape-diversity-therasyn-sitemachine-2026-08-01.md',
  'docs/experiments/strata-a-yield-2026-08-01.md',
  'docs/experiments/stratum-b-yield-2026-08-01.md',
] as const;

const OPERATOR_HOME_PREFIXES = ['/Us' + 'ers/', '/ho' + 'me/', ':\\Us' + 'ers\\'];
const OPERATOR_HOME_PATH = /(?:\/Users\/|\/home\/)[^/\s`"'|]+/;
const WINDOWS_OPERATOR_HOME_PATH = /[A-Za-z]:\\Users\\[^\\\s`"'|]+/;
const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function trackedPathViolations(): { status: number | null; output: string } {
  const patterns = OPERATOR_HOME_PREFIXES.flatMap((prefix) => ['-e', prefix]);
  const result = spawnSync('git', ['grep', '-n', '-F', ...patterns, '--', '.'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`.trim(),
  };
}

describe('public repository path redaction', () => {
  for (const artifact of PUBLIC_REDACTED_ARTIFACTS) {
    it(`keeps ${artifact} free of workstation-specific home paths`, () => {
      const contents = readFileSync(new URL(`../../${artifact}`, import.meta.url), 'utf8');

      expect(contents).not.toMatch(OPERATOR_HOME_PATH);
      expect(contents).not.toMatch(WINDOWS_OPERATOR_HOME_PATH);
    });
  }

  it('keeps every tracked artifact free of workstation-specific home paths', () => {
    const violations = trackedPathViolations();

    expect(violations).toEqual({ status: 1, output: '' });
  });
});
