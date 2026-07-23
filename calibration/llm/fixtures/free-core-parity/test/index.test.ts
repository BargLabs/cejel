import assert from 'node:assert/strict';
import test from 'node:test';

import { greeting } from '../src/index.js';

test('greets a normalized name', () => {
  assert.equal(greeting(' Cejel '), 'Hello, Cejel');
});
