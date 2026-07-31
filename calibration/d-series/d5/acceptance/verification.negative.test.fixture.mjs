import assert from 'node:assert/strict';

import { reviewRequired } from './subject.negative.fixture.mjs';

assert.equal(reviewRequired(), true);
