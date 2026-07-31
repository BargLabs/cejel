import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { approvesRelease as defectiveApproval } from './consumer.positive.fixture.mjs';
import { approvesRelease as repairedApproval } from './consumer.negative.fixture.mjs';

function readFrontmatter(path) {
  const contents = readFileSync(new URL(path, import.meta.url), 'utf8');
  const block = contents.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1];
  assert.ok(block, `missing frontmatter in ${path}`);
  return Object.fromEntries(
    block.split('\n').map((line) => {
      const separator = line.indexOf(':');
      assert.notEqual(separator, -1, `invalid frontmatter line: ${line}`);
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    }),
  );
}

test('the frontmatter specimen ignores a binding approval key that the repair enforces', () => {
  const defectivePolicy = readFrontmatter('./policy.positive.fixture.md');
  const repairedPolicy = readFrontmatter('./policy.negative.fixture.md');
  assert.equal(defectivePolicy.requireNamedApprover, 'true');
  assert.equal(defectiveApproval(defectivePolicy, []), true);
  assert.equal(repairedApproval(repairedPolicy, []), false);
});
