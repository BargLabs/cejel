import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  TraceParser,
  candidatesFromSession,
  extractWritePaths,
  namedTestsFromOutput,
  productFromCwd,
} from './session-trace-extract.mjs';

const OPERATOR_HOME = os.homedir();
const projectPath = (...segments) => path.join(OPERATOR_HOME, 'projects', ...segments);

function claudeRow(type, content, extra = {}) {
  return {
    type,
    sessionId: 'session-1',
    cwd: projectPath('cejel'),
    timestamp: extra.timestamp ?? '2026-07-01T00:00:00Z',
    message: { role: type, content },
    ...extra,
  };
}

test('extracts pytest and Vitest named failures without retaining assertion text', () => {
  assert.deepEqual(namedTestsFromOutput('FAILED tests/test_quant.py::test_hold - AssertionError: secret'), [
    { file: 'tests/test_quant.py', name: 'test_hold' },
  ]);
  assert.deepEqual(namedTestsFromOutput('FAIL  src/__tests__/guard.test.ts > guard > rejects absence'), [
    { file: 'src/__tests__/guard.test.ts', name: 'guard > rejects absence' },
  ]);
});

test('maps migrated and current worktree paths to the canonical product', () => {
  assert.equal(productFromCwd(projectPath('some-org', 'site-machine')), 'site-machine');
  assert.equal(productFromCwd(projectPath('cejel', '.worktrees', 'fix-one')), 'cejel');
  assert.equal(productFromCwd(projectPath('site-machine')), 'site-machine');
});

test('extracts structurally written paths from patch and Python write calls', () => {
  const command = `apply_patch <<'PATCH'\n*** Update File: src/guard.ts\nPATCH\npython -c "from pathlib import Path; Path('src/other.ts').write_text('x')"`;
  assert.deepEqual(extractWritePaths(command, projectPath('cejel'), { localPath: projectPath('cejel') }), [
    'src/guard.ts',
    'src/other.ts',
  ]);
});

test('normalizes package-relative edit paths to the repository root', () => {
  const command = `python -c "from pathlib import Path; Path('src/quant.py').write_text('x')"`;
  assert.deepEqual(extractWritePaths(command, projectPath('cejel', 'nested_pkg'), { localPath: projectPath('cejel') }), [
    'nested_pkg/src/quant.py',
  ]);
});

test('primary rule accepts same named test through a later containing file command', () => {
  const parser = new TraceParser({ source: 'claude-code', relativePath: 'session.jsonl', rawSha256: 'a'.repeat(64) });
  parser.consume(claudeRow('assistant', [{
    type: 'tool_use', id: 'red', name: 'Bash', input: { command: 'pytest -q tests/test_quant.py::test_hold' },
  }]));
  parser.consume(claudeRow('user', [{
    type: 'tool_result', tool_use_id: 'red', is_error: true,
    content: 'FAILED tests/test_quant.py::test_hold - AssertionError\n1 failed',
  }]));
  parser.consume(claudeRow('assistant', [{
    type: 'tool_use', id: 'edit', name: 'Edit', input: { file_path: projectPath('cejel', 'src', 'quant.py'), old_string: 'a', new_string: 'b' },
  }]));
  parser.consume(claudeRow('assistant', [{
    type: 'tool_use', id: 'green', name: 'Bash', input: { command: 'pytest -q tests/test_quant.py' },
  }]));
  parser.consume(claudeRow('user', [{
    type: 'tool_result', tool_use_id: 'green', content: '1 passed in 0.1s',
  }]));
  parser.consume(claudeRow('assistant', [{
    type: 'tool_use', id: 'commit', name: 'Bash', input: { command: 'git commit -m message' },
  }]));
  parser.consume(claudeRow('user', [{
    type: 'tool_result', tool_use_id: 'commit', content: '[main abc1234] message',
  }]));
  const candidates = candidatesFromSession(parser.finish());
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].coverage, 'same-file');
  assert.equal(candidates[0].exactCommand, false);
  assert.deepEqual(candidates[0].editedSourceFiles, ['src/quant.py']);
  assert.deepEqual(candidates[0].anchorAction.shaPrefixes, ['abc1234']);
});

test('exact-command sensitivity is a subset of the primary rule', () => {
  const parser = new TraceParser({ source: 'claude-code', relativePath: 'session.jsonl', rawSha256: 'b'.repeat(64) });
  const command = 'pytest -q tests/test_quant.py::test_hold';
  parser.consume(claudeRow('assistant', [{ type: 'tool_use', id: 'red', name: 'Bash', input: { command } }]));
  parser.consume(claudeRow('user', [{ type: 'tool_result', tool_use_id: 'red', is_error: true, content: 'FAILED tests/test_quant.py::test_hold\n1 failed' }]));
  parser.consume(claudeRow('assistant', [{ type: 'tool_use', id: 'edit', name: 'Edit', input: { file_path: projectPath('cejel', 'src', 'quant.py') } }]));
  parser.consume(claudeRow('assistant', [{ type: 'tool_use', id: 'green', name: 'Bash', input: { command } }]));
  parser.consume(claudeRow('user', [{ type: 'tool_result', tool_use_id: 'green', content: '1 passed' }]));
  parser.consume({ type: 'pr-link', sessionId: 'session-1', cwd: projectPath('cejel'), prRepository: 'BargLabs/cejel', prNumber: 99 });
  const candidates = candidatesFromSession(parser.finish());
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].coverage, 'exact-command');
  assert.equal(candidates[0].exactCommand, true);
});

test('suite setup failures with no named failing test are excluded', () => {
  const parser = new TraceParser({ source: 'claude-code', relativePath: 'session.jsonl', rawSha256: 'c'.repeat(64) });
  parser.consume(claudeRow('assistant', [{ type: 'tool_use', id: 'red', name: 'Bash', input: { command: 'pytest -q tests/test_quant.py' } }]));
  parser.consume(claudeRow('user', [{ type: 'tool_result', tool_use_id: 'red', is_error: true, content: 'ERROR collecting tests/test_quant.py\n10 skipped' }]));
  assert.equal(candidatesFromSession(parser.finish()).length, 0);
});
