import assert from 'node:assert/strict';
import { test } from 'node:test';

import { publishRelease as defectivePublishRelease } from './subject.positive.fixture.mjs';
import { publishRelease as repairedPublishRelease } from './subject.negative.fixture.mjs';

const upstreamDetail = 'upstream refused release token';
const rejectRequest = async () => {
  throw new Error(upstreamDetail);
};

test('defective catch discards the bound failure from its surfaced message', async () => {
  const result = await defectivePublishRelease(rejectRequest);
  assert.equal(result.ok, false);
  assert.equal(result.message.includes(upstreamDetail), false);
});

test('paired repair incorporates the bound failure into its surfaced message', async () => {
  const result = await repairedPublishRelease(rejectRequest);
  assert.equal(result.ok, false);
  assert.equal(result.message.includes(upstreamDetail), true);
});
