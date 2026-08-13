import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAllSurfacesDenied,
  assertSurfaceDenied,
} from './no-egress-probe-timeouts.mjs';

const denied = () => {
  throw new Error('Cejel calibration no-egress policy denied synthetic.surface');
};

test('no-egress per-surface timeout: compliant denial completes within the declared bound', async () => {
  const surfaces = [
    { id: 'synthetic.dns', target: { resolve: denied }, method: 'resolve' },
    { id: 'synthetic.socket', target: { connect: denied }, method: 'connect' },
    { id: 'synthetic.http', target: { request: denied }, method: 'request' },
  ];
  assert.deepEqual(await assertAllSurfacesDenied(surfaces, { timeoutMs: 25 }), [
    'synthetic.dns',
    'synthetic.socket',
    'synthetic.http',
  ]);
});

test('no-egress per-surface timeout: a hung surface fails loudly with its surface id', async () => {
  await assert.rejects(
    assertSurfaceDenied(
      { id: 'synthetic.dns.hung', target: { resolve: () => new Promise(() => {}) }, method: 'resolve' },
      { timeoutMs: 25 },
    ),
    /no-egress probe surface timed out: synthetic\.dns\.hung after 25ms/,
  );
});

test('no-egress per-surface timeout: a leaky surface still fails closed', async () => {
  await assert.rejects(
    assertSurfaceDenied(
      { id: 'synthetic.http.leaky', target: { request: async () => undefined }, method: 'request' },
      { timeoutMs: 25 },
    ),
    /no-egress probe surface completed without policy denial: synthetic\.http\.leaky/,
  );
});
