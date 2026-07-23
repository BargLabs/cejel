import assert from 'node:assert/strict';
import {
  chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { main } from './verify-free-core-parity.mjs';

const executable = (marker, value, removeOptInArtifact = false) => `#!/usr/bin/env node
const { mkdirSync, rmSync, writeFileSync } = require('node:fs');
const output = process.argv[process.argv.indexOf('--out') + 1];
mkdirSync(output, { recursive: true });
${removeOptInArtifact ? "rmSync(output + '/llm-report.json', { force: true });" : ''}
writeFileSync(
  output + '/report.json',
  JSON.stringify({ marker: ${JSON.stringify(value)}, generatedAt: new Date().toISOString() }) + '\\n',
);
// executable identity marker: ${marker}
`;

test('free-core parity compares valid fixed-clock output artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'cejel-parity-test-'));
  try {
    const baseline = join(root, 'baseline');
    const candidate = join(root, 'candidate');
    const output = join(root, 'parity.json');
    writeFileSync(baseline, executable('baseline', 'same'));
    writeFileSync(candidate, executable('candidate', 'same'));
    chmodSync(baseline, 0o755);
    chmodSync(candidate, 0o755);
    main([
      baseline,
      'a'.repeat(40),
      candidate,
      'b'.repeat(40),
      resolve('calibration/llm/fixtures/free-core-parity'),
      output,
    ]);
    const document = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(document.baseline.exit_code, 0);
    assert.equal(document.candidate.exit_code, 0);
    assert.equal(document.baseline.output_tree_sha256, document.candidate.output_tree_sha256);
    assert.equal(document.clock.fixed_iso, '2026-07-23T00:00:00.000Z');

    writeFileSync(candidate, executable('candidate-changed', 'changed'));
    assert.throws(
      () => main([
        baseline,
        'a'.repeat(40),
        candidate,
        'b'.repeat(40),
        resolve('calibration/llm/fixtures/free-core-parity'),
        join(root, 'changed.json'),
      ]),
      /default free-core output differs/,
    );

    writeFileSync(candidate, executable('candidate-deletes-opt-in', 'same', true));
    assert.throws(
      () => main([
        baseline,
        'a'.repeat(40),
        candidate,
        'b'.repeat(40),
        resolve('calibration/llm/fixtures/free-core-parity'),
        join(root, 'deleted-opt-in.json'),
      ]),
      /default free-core output differs/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
