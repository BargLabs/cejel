import assert from 'node:assert/strict';
import test from 'node:test';

import {
  approvalConfig as defectiveConfig,
  approvesRelease as defectiveApproval,
} from './subject.positive.fixture.mjs';
import { approvesRelease as repairedApproval } from './subject.negative.fixture.mjs';

test('the config specimen ignores a binding approval requirement that the repair enforces', () => {
  assert.equal(defectiveConfig.requireNamedApprover, true);
  assert.equal(defectiveApproval([]), true);
  assert.equal(repairedApproval([]), false);
});
