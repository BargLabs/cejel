import assert from 'node:assert/strict';
import { test } from 'node:test';

import { collectQueue as defectiveCollectQueue } from './subject.positive.fixture.mjs';
import { collectQueue as repairedCollectQueue } from './subject.negative.fixture.mjs';

test('defective caller surfaces callee failure exactly like successful emptiness', () => {
  assert.deepEqual(defectiveCollectQueue('unparseable'), defectiveCollectQueue('empty'));
  assert.deepEqual(defectiveCollectQueue('unparseable'), { ok: true, entries: [] });
});

test('paired repair preserves the callee failure signal', () => {
  assert.deepEqual(repairedCollectQueue('unparseable'), {
    ok: false,
    error: 'queue directory is not parseable',
  });
  assert.deepEqual(repairedCollectQueue('empty'), { ok: true, entries: [] });
  assert.notDeepEqual(repairedCollectQueue('unparseable'), repairedCollectQueue('empty'));
});

test('both specimens preserve a populated successful return', () => {
  assert.deepEqual(defectiveCollectQueue('populated'), {
    ok: true,
    entries: ['goal-1'],
  });
  assert.deepEqual(repairedCollectQueue('populated'), {
    ok: true,
    entries: ['goal-1'],
  });
});
