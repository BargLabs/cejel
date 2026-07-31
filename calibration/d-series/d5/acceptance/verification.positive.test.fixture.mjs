import assert from 'node:assert/strict';

import {
  EXPECTED_REVIEW_REQUIRED,
  reviewRequired,
} from './subject.positive.fixture.mjs';

assert.equal(reviewRequired(), EXPECTED_REVIEW_REQUIRED);
