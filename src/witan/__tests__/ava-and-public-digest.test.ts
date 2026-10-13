import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildWitanInputFromRepo } from '../repo-signals.js';

const roots: string[] = [];
function scan(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'cejel-assertion-context-'));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return buildWitanInputFromRepo({ repoPath: root, productSlug: 'assertion-context', productDisplayName: 'assertion-context', generatedAt: '2026-09-15T00:00:00.000Z' }).signals ?? [];
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function avaShare(body: string) {
  return scan({ 'package.json': '{"scripts":{"test":"ava"},"devDependencies":{"ava":"6.0.0"}}', 'index.js': 'export const f = x => x;', 'test.js': body }).find(c => c.criterionId === 'A1')?.metrics?.find(m => m.name === 'non_hollow_test_share')?.value;
}

describe('AVA live assertion evidence (#427)', () => {
  it.each(['is', 'deepEqual', 'true', 'throws', 'throwsAsync', 'snapshot', 'like', 'pass'])('credits active t.%s', method => {
    expect(avaShare(`import test from 'ava'; test('works', t => { t.${method}(1, 1); });`)).toBe(1);
  });
  it('supports an imported alias, renamed callback, async and serial modifier', () => {
    expect(avaShare(`import check from 'ava'; check.serial('works', async ctx => { ctx.notThrowsAsync(work()); });`)).toBe(1);
  });
  it('supports CommonJS and function callbacks', () => {
    expect(avaShare(`const test = require('ava'); test('works', function(t) { t.is(1, 1); });`)).toBe(1);
  });
  it.each([
    `import test from 'ava'; test.skip('ignored', t => { t.is(1, 1); });`,
    `import test from 'ava'; test.serial.skip('ignored', t => { t.is(1, 1); });`,
    `import test from 'ava'; test.todo('later');`,
    `import test from 'ava'; test('empty', t => { t.plan(1); t.log('t.is(1, 1)'); });`,
    `import test from 'ava'; // test('ignored', t => { t.is(1, 1); });`,
    `import test from 'ava'; test('empty', t => { /* t.is(1, 1); */ });`,
    `import test from 'ava'; const t = { is() {} }; t.is(1, 1);`,
    `const t = { is() {} }; t.is(1, 1);`,
    `import test from 'ava'; test('empty', t => { test.skip('nested', t => { t.is(1, 1); }); });`,
    `import test from 'ava'; test('empty', t => { const unused = () => t.is(1, 1); });`,
    `import test from 'ava'; test('empty', t => { function unused(t) { t.is(1, 1); } });`,
  ])('does not credit inactive or unrelated assertions: %s', body => { expect(avaShare(body)).toBe(0); });
  it('credits an outer throws assertion while ignoring its nested callback', () => {
    expect(avaShare(`import test from 'ava'; test('live', t => { t.throws(() => work()); });`)).toBe(1);
  });
  it('retains credit when a live test coexists with a skipped one', () => {
    expect(avaShare(`import test from 'ava'; test.skip('ignored', t => { t.is(1, 1); }); test('live', t => { t.true(true); });`)).toBe(1);
  });
});

describe('public digest names are not secret comparison evidence (#430)', () => {
  it.each(['extractorDigest', 'fileDigest', 'contentDigest', 'digest'])('does not assert a timing leak for %s', name => {
    const a2 = scan({ 'src/lookup.ts': `export const lookup = (published, ${name}) => published.find(p => p.${name} === ${name});` }).find(c => c.criterionId === 'A2');
    expect(a2?.findings?.some(f => f.summary.includes('timing side-channel')) ?? false).toBe(false);
  });
  it.each(['hmac', 'hmacDigest', 'signature', 'mac'])('retains authentication comparison evidence for %s', name => {
    const a2 = scan({ 'src/auth.ts': `export const verify = (${name}, supplied) => ${name} === supplied;` }).find(c => c.criterionId === 'A2');
    expect(a2?.findings?.some(f => f.summary.includes('timing side-channel'))).toBe(true);
  });
  it('keeps a genuine comparison elsewhere in the same file after a public lookup', () => {
    const a2 = scan({ 'src/auth.ts': `export const lookup = (rows, digest) => rows.find(p => p.digest === digest);\nexport const verify = (signature, supplied) => signature === supplied;` }).find(c => c.criterionId === 'A2');
    expect(a2?.findings?.find(f => f.summary.includes('timing side-channel'))?.evidence?.line).toBe(2);
  });
  it('continues to reject numeric and presence checks', () => {
    const a2 = scan({ 'src/auth.ts': `export const verify = (hmac, signature) => hmac === signature.length || signature === undefined;` }).find(c => c.criterionId === 'A2');
    expect(a2?.findings?.some(f => f.summary.includes('timing side-channel')) ?? false).toBe(false);
  });
});
