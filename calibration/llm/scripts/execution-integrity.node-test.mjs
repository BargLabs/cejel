import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assembleExecutionBundle } from './assemble-execution-bundle.mjs';
import { canonicalize } from './freeze-cohorts.mjs';

const sha = (document) => createHash('sha256').update(canonicalize(document), 'utf8').digest('hex');

test('committed runtime no-egress probe denies network and process escape paths', () => {
  const result = spawnSync(
    fileURLToPath(new URL('./no-egress-wrapper.sh', import.meta.url)),
    [fileURLToPath(new URL('./no-egress-probe.mjs', import.meta.url))],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    policy: 'node-runtime-deny-hook-v1', denied: 5, attempted: 5,
  });
});

test('trusted workflow pins runtime and generates parity from the dedicated pack-free fixture', () => {
  const workflow = readFileSync(
    new URL('../../../.github/workflows/llm-calibration.yml', import.meta.url),
    'utf8',
  );
  assert.match(
    workflow,
    /\$GITHUB_WORKSPACE\/calibration\/llm\/fixtures\/free-core-parity/,
  );
  assert.doesNotMatch(
    workflow,
    /\$GITHUB_WORKSPACE\/src\/packs\/llm\/__tests__\/fixtures/,
  );
  assert.match(workflow, /node-version: 22\.23\.1/);
  const execute = workflow.indexOf('Execute frozen cohort under the hash-bound no-egress wrapper');
  const retain = workflow.indexOf('Retain exact golden free-core compatibility evidence');
  const uploadRaw = workflow.indexOf('Upload raw calibration outputs');
  assert.ok(execute >= 0 && retain > execute && uploadRaw > retain);
  assert.match(
    workflow,
    /install -m 600[\s\S]*free-core-parity\.json[\s\S]*llm-output\/free-core-compatibility\.json/,
  );
});

test('execution bundle derives canonical receipt and report bindings from raw output', () => {
  const root = mkdtempSync(join(tmpdir(), 'cejel-llm-bundle-'));
  const repository = join(root, 'owner__repository');
  mkdirSync(repository);
  const receipt = { cohort: 'golden', repository_id: 'owner/repository' };
  const report = { result: { findings: [] } };
  writeFileSync(join(repository, 'calibration-execution.json'), JSON.stringify(receipt));
  writeFileSync(join(repository, 'llm-report.json'), JSON.stringify(report));
  assert.deepEqual(assembleExecutionBundle('golden', root, '1'.repeat(64), null), {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', cohort: 'golden',
    pre_result_commitment_sha256: '1'.repeat(64), detector_freeze_sha256: null,
    free_core_parity_sha256: null,
    execution_receipts: [{ repository_id: 'owner/repository', document_sha256: sha(receipt) }],
    llm_reports: [{ repository_id: 'owner/repository', document_sha256: sha(report) }],
  });
});
