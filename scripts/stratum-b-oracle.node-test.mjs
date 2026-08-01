import assert from 'node:assert/strict';
import test from 'node:test';

import { parseWorkflowShellSteps } from './stratum-b-oracle.mjs';

test('extracts only shell run blocks from the named workflow job', () => {
  const workflow = `name: CI
jobs:
  target:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: First
        run: |
          echo one
          echo two
      - name: Second
        run: test -f artifact
  other:
    steps:
      - name: Not selected
        run: |
          exit 9
`;
  assert.deepEqual(parseWorkflowShellSteps(workflow, 'target'), [
    { name: 'First', shell: 'echo one\necho two' },
    { name: 'Second', shell: 'test -f artifact' },
  ]);
});
