import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRow, rises } from './norise.mjs';
const row = (before, after, movedCriteria = []) => ({ name: 'r', before, after, movedCriteria });
const s = (overall, code, process) => ({ overall, code, process });
const c = (id, b, a) => ({ id, before: b, after: a });
test('equal is not a rise', () => assert.deepEqual(checkRow(row(s(2, 2, 2), s(2, 2, 2))).problems, []));
test('lower is not a rise', () => assert.deepEqual(checkRow(row(s(3, 3, 3), s(2, 2.5, 1))).problems, []));
test('higher overall is a rise', () => assert.deepEqual(checkRow(row(s(2, 2, 2), s(2.1, 2, 2))).problems, ['overall rose']));
test('null to scored is a rise', () => assert.deepEqual(checkRow(row(s(null, 2, 2), s(1, 2, 2))).problems, ['overall rose']));
test('scored to null is not a rise', () => assert.deepEqual(checkRow(row(s(2, 2, 2), s(null, null, null))).problems, []));
test('criterion higher is a rise', () => assert.deepEqual(checkRow(row(s(2, 2, 2), s(2, 2, 2), [c('A1', { score: 2 }, { score: 2.3 })])).problems, ['criterion A1 rose']));
test('criterion absent to scored is a rise', () => assert.deepEqual(checkRow(row(s(2, 2, 2), s(2, 2, 2), [c('B6', null, { score: 1 })])).problems, ['criterion B6 rose']));
test('criterion to abstention at 0 is not a rise, and is counted for A2 and B2', () => {
  const r = checkRow(row(s(3, 3, 3), s(2, 2, 2), [c('A2', { score: 3.2, status: 'verified' }, { score: 0, status: 'insufficient_data' }), c('B2', { score: 4 }, { score: 0, status: 'insufficient_data' }), c('A4', { score: 2 }, { score: 0, status: 'insufficient_data' })]));
  assert.deepEqual(r.problems, []); assert.deepEqual(r.abstained, ['A2', 'B2']);
});
test('error row fails', () => assert.deepEqual(checkRow({ name: 'r', error: true }).problems, ['error row']));
test('rises() edge cases', () => { assert.equal(rises(undefined, undefined), false); assert.equal(rises(1, Number.NaN), false); assert.equal(rises(Number.NaN, 1), true); });
