import assert from 'node:assert/strict';
import test from 'node:test';

import { reviewRequired as defectiveReviewRequired } from './subject.positive.fixture.mjs';
import { reviewRequired as repairedReviewRequired } from './subject.negative.fixture.mjs';

test('the imported expectation hides a false verification result that the repair exposes', () => {
  assert.equal(defectiveReviewRequired(), false);
  assert.equal(repairedReviewRequired(), true);
});
