import assert from 'node:assert/strict';
import test from 'node:test';

import { validatesApproval as defectiveValidation } from './subject.positive.fixture.mjs';
import { validatesApproval as repairedValidation } from './subject.negative.fixture.mjs';

test('the schema specimen accepts a value whose declared boolean key the repair validates', () => {
  const invalidApproval = {
    minimumApprovals: 0,
    requireNamedApprover: 'yes',
  };
  assert.equal(defectiveValidation(invalidApproval), true);
  assert.equal(repairedValidation(invalidApproval), false);
});
