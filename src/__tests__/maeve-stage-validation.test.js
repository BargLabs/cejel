import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { HOLDING, selectEntries, validateSelection } from '../../scripts/validate-staged-maeve-seeds.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it('passes every selected record to the canonical validator with repository binding', () => {
  const validate = vi.fn(value => value);
  const entries = [{ path: `${HOLDING}PENDING_cejel_fixture.json`, contents: '[{"fixture":true}]' }];
  expect(validateSelection(entries, validate)).toEqual({ examinedFiles: 1, examinedSeeds: 1, invalidSeeds: 0 });
  expect(validate).toHaveBeenCalledWith([{ fixture: true }], {
    expectedRepository: 'BargLabs/cejel', filePath: entries[0].path,
  });
});

it('propagates canonical rejection while the record remains present', () => {
  const reject = () => { throw new Error('canonical_property_rejected'); };
  expect(() => validateSelection([{ path: 'present.json', contents: '[{}]' }], reject))
    .toThrow('canonical_property_rejected');
});

it('refuses zero files distinctly from a valid nonempty selection', () => {
  expect(() => validateSelection([], value => value)).toThrow('maeve_staging_zero_examined');
});

it('refuses zero records even if a selected file is present', () => {
  expect(() => validateSelection([{ path: 'empty.json', contents: '[]' }], value => value))
    .toThrow('maeve_staging_zero_examined');
});

it('examines staged blobs even when the worktree contains different bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'cejel-stage-'));
  roots.push(root);
  const git = args => execFileSync('git', ['-C', root, ...args], {
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    stdio: 'pipe',
  });
  git(['init', '-q']);
  mkdirSync(join(root, HOLDING), { recursive: true });
  const path = `${HOLDING}PENDING_cejel_fixture.json`;
  writeFileSync(join(root, path), '[{"index":true}]');
  git(['add', '--', path]);
  writeFileSync(join(root, path), '[{"worktree":true}]');
  expect(selectEntries(root, 'staged')).toEqual([{ path, contents: '[{"index":true}]' }]);
});

it('wires staged validation into the hook without inheriting Git index overrides', () => {
  const hook = readFileSync(new URL('../../.githooks/pre-commit', import.meta.url), 'utf8');
  expect(hook).toContain('node --import tsx scripts/validate-staged-maeve-seeds.mjs --mode staged');
  expect(hook).toContain('env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE');
  expect(hook).toContain('--diff-filter=ACM');
});
