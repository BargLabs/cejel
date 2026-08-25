import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = join(__dirname, '..', '..');
const DOCS_DIRECTORY = join(REPOSITORY_ROOT, 'docs');
const CONSTRAINTS_PATH = join(DOCS_DIRECTORY, 'standing-constraints.md');
const PARITY_WORKFLOW_PATH = join(
  REPOSITORY_ROOT,
  '.github',
  'workflows',
  'standing-constraints-parity.yml',
);
const PARITY_GUARD_SCRIPT_PATH = join(REPOSITORY_ROOT, 'scripts', 'constraints-parity-guard.sh');
const ENTRYPOINTS = ['AGENTS.md', 'CLAUDE.md'] as const;
const PINNED_SHA256 = 'f871f0b6dfce6cea9fcce3bfc6e195d02da5d2bbe2d0afaca1764f05d3d9be22';
const EXPECTED_VERSION = '**CONSTRAINTS-VERSION: 2026-08-01.5**';
const CONSTRAINTS_LINK = '[`docs/standing-constraints.md`](docs/standing-constraints.md)';
const HANDSHAKE_INSTRUCTION =
  '**Echo the exact `CONSTRAINTS-VERSION` line from that file in every report.** This is an observable delivery handshake: omission flags non-delivery or non-compliance, but does not logically prove the whole file was unread.';
const LOCAL_PIN_BOUNDARY =
  'Each repository pins only its local file. This is a shared point-in-time parity record and local immutability guard; neither test proves current cross-repository byte equality.';
const EXPLICIT_PARITY_CHECK =
  'Cross-repo parity must be checked explicitly on every change: compare both files, copy the canonical bytes, bump `CONSTRAINTS-VERSION`, and update both local pins.';
const LOCAL_PIN_INSTRUCTION =
  'The current local SHA-256 pin is `f871f0b6dfce6cea9fcce3bfc6e195d02da5d2bbe2d0afaca1764f05d3d9be22`.';
const PARITY_GUARD_NAMED =
  'This is checked mechanically by [`scripts/constraints-parity-guard.sh`](scripts/constraints-parity-guard.sh) in CI — wired into both repos on any PR touching the file, on push to `main`, and on a daily schedule; drift or an unreadable sibling fails the check loud, it never silently skips.';
const HISTORICAL_REVERIFY_INSTRUCTION =
  'Historical counts and open-item labels must be mechanically reverified against current repository state before action.';

function normalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\s+/g, ' ').trim();
}

describe('standing constraints', () => {
  const raw = readFileSync(CONSTRAINTS_PATH);

  it('matches the local point-in-time byte pin', () => {
    expect(createHash('sha256').update(raw).digest('hex')).toBe(PINNED_SHA256);
  });

  it('carries the exact locally pinned constraints version', () => {
    const constraints = raw.toString('utf8');

    expect(constraints).toContain(EXPECTED_VERSION);
    expect(constraints).toContain('## Open at the close of this session — historical snapshot');
    expect(normalized(CONSTRAINTS_PATH)).toContain(HISTORICAL_REVERIFY_INSTRUCTION);
    expect(constraints).not.toContain('A test asserts byte-equality');
    expect(constraints).not.toContain('or CI fails');
  });

  it('has exactly one canonical docs path, compared case-insensitively', () => {
    const variants = readdirSync(DOCS_DIRECTORY)
      .filter((file) => {
        const normalizedName = file.toLowerCase().replaceAll('_', '-');
        return /^standing-constraints(?:-\d{4}-\d{2}-\d{2})?\.md$/.test(normalizedName);
      })
      .sort();

    expect(variants).toEqual(['standing-constraints.md']);
  });

  it.each(ENTRYPOINTS)('%s links the canonical file and carries the evidence boundaries', (file) => {
    const entrypoint = normalized(join(REPOSITORY_ROOT, file));

    expect(entrypoint).toContain(CONSTRAINTS_LINK);
    expect(entrypoint).toContain(HANDSHAKE_INSTRUCTION);
    expect(entrypoint).toContain(LOCAL_PIN_BOUNDARY);
    expect(entrypoint).toContain(LOCAL_PIN_INSTRUCTION);
    expect(entrypoint).toContain(EXPLICIT_PARITY_CHECK);
    expect(entrypoint).toContain(PARITY_GUARD_NAMED);
    expect(entrypoint).toContain(
      'historical snapshot written at the close of the 2026-08-01 session',
    );
    expect(entrypoint).toContain(HISTORICAL_REVERIFY_INSTRUCTION);
  });

  it('vendors one guard script that fails closed and reads the sibling via the raw-contents API', () => {
    // The stronger guarantee -- that the script never SHELLS OUT to git
    // clone/fetch or a shallow flag, as opposed to merely mentioning them in
    // the comment that explains why it must not -- is asserted by the
    // functional/structural regression tests in
    // scripts/constraints_parity_guard_tests.sh, which strip comments
    // before checking. This test only asserts the positive contract.
    const guard = normalized(PARITY_GUARD_SCRIPT_PATH);

    expect(guard).toContain('set -euo pipefail');
    expect(guard).toContain('gh api');
    expect(guard).toContain('application/vnd.github.raw');
    expect(guard).toContain('an unreadable sibling is treated as drift, not skipped');
  });

  it('fails loudly when the cross-repo parity reader cannot fetch or finds drift', () => {
    const workflow = normalized(PARITY_WORKFLOW_PATH);

    expect(workflow).toContain("pull_request: paths: - 'docs/standing-constraints.md'");
    expect(workflow).toContain("schedule: - cron: '23 9 * * *'");
    expect(workflow).toContain('run: ./scripts/constraints-parity-guard.sh');
    expect(workflow).toContain('PARITY_GUARD_SIBLING_REPO: BargLabs/alfred');
    expect(workflow).toContain('GH_TOKEN: ${{ secrets.ALFRED_CONSTRAINTS_READ_TOKEN }}');
    expect(workflow).toContain(
      "if: failure() && steps.guard.outcome == 'failure' && github.event_name != 'pull_request'",
    );
    expect(workflow).toContain('--label escalation:operator');
    expect(workflow).not.toContain('continue-on-error:');
  });
});
