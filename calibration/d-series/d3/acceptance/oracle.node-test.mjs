import assert from 'node:assert/strict';
import { test } from 'node:test';

import { publishRows as defectivePublishRows } from './subject.positive.fixture.mjs';
import { publishRows as repairedPublishRows } from './subject.negative.fixture.mjs';

const rows = [
  { id: 'public', publishable: true },
  { id: 'withheld', publishable: false },
];

test('defective transform reports success while one input row is unexplained', () => {
  const result = defectivePublishRows(rows);
  assert.equal(result.ok, true);
  assert.equal(result.published.length, 1);
  assert.equal(result.explained.length, 0);
  assert.notEqual(rows.length, result.published.length + result.explained.length);
});

test('paired repair accounts for every input row before reporting success', () => {
  const result = repairedPublishRows(rows);
  assert.equal(result.ok, true);
  assert.equal(result.published.length, 1);
  assert.equal(result.explained.length, 1);
  assert.equal(rows.length, result.published.length + result.explained.length);
});
