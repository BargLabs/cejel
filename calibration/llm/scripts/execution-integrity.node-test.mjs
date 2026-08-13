import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assembleExecutionBundle } from './assemble-execution-bundle.mjs';
import { canonicalize } from './freeze-cohorts.mjs';
import { retainGoldenCompatibilityEvidence } from './retain-golden-compatibility.mjs';

const require = createRequire(import.meta.url);
const {
  POLICY_ID,
  SURFACE_IDS,
  SURFACE_SHA256,
} = require('./no-egress-policy.cjs');

const sha = (document) => createHash('sha256').update(canonicalize(document), 'utf8').digest('hex');

test('committed runtime no-egress probe denies network and process escape paths', () => {
  const result = spawnSync(
    fileURLToPath(new URL('./no-egress-runtime-wrapper.sh', import.meta.url)),
    [fileURLToPath(new URL('./no-egress-probe.mjs', import.meta.url))],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const probe = JSON.parse(result.stdout);
  assert.equal(probe.policy, POLICY_ID);
  assert.equal(probe.denied, SURFACE_IDS.length);
  assert.equal(probe.attempted, SURFACE_IDS.length);
  assert.deepEqual(probe.surface_ids, SURFACE_IDS);
  assert.equal(probe.surface_sha256, SURFACE_SHA256);
  assert.equal(probe.complete_for_declared_surface, true);
  assert.equal(probe.allowed_local_git, true);
  assert.equal(probe.denied_git_variants, 3);
  assert.ok(probe.surface_ids.includes('dns.Resolver.prototype.resolve4'));
  assert.ok(probe.surface_ids.includes('node:dns/promises.resolve4'));
  assert.ok(probe.surface_ids.includes('node:dns/promises.Resolver.prototype.resolve4'));
});

test('committed host wrapper has no default route under Docker network none', {
  skip: !process.env.CEJEL_CALIBRATION_NO_EGRESS_TEST_IMAGE,
}, () => {
  const result = spawnSync(
    fileURLToPath(new URL('./no-egress-wrapper.sh', import.meta.url)),
    [fileURLToPath(new URL('./no-egress-probe.mjs', import.meta.url))],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        CEJEL_CALIBRATION_NO_EGRESS_IMAGE: process.env.CEJEL_CALIBRATION_NO_EGRESS_TEST_IMAGE,
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const probe = JSON.parse(result.stdout);
  assert.equal(probe.host_network_isolation, 'docker-network-none');
  assert.equal(probe.host_default_route_absent, true);
  assert.equal(probe.host_container_image, process.env.CEJEL_CALIBRATION_NO_EGRESS_TEST_IMAGE);
});

test('committed v22 calibration launcher selects v22 under the host-plus-runtime no-egress lane', {
  skip: !process.env.CEJEL_CALIBRATION_NO_EGRESS_TEST_IMAGE,
}, () => {
  const wrapper = fileURLToPath(new URL('./no-egress-wrapper.sh', import.meta.url));
  const driver = fileURLToPath(new URL('./run-v22-public-calibration.mjs', import.meta.url));
  const detectorRoot = fileURLToPath(new URL('../../..', import.meta.url));
  const source = mkdtempSync(join(tmpdir(), 'cejel-v22-no-egress-source-'));
  const output = mkdtempSync(join(tmpdir(), 'cejel-v22-no-egress-output-'));
  const publicOutput = mkdtempSync(join(tmpdir(), 'cejel-v17-public-default-output-'));
  writeFileSync(
    join(source, 'package.json'),
    JSON.stringify({ name: 'v22-no-egress-driver-fixture', scripts: { start: 'node server.js' } }),
  );
  writeFileSync(
    join(source, 'server.js'),
    "import { createServer } from 'node:http'; createServer(() => {}).listen(3000);\n",
  );

  // A launcher is an immutable part of the detector candidate, not a generated file placed next
  // to a build after preregistration. The wrapper can only invoke it from the mounted candidate.
  const tracked = spawnSync('git', [
    '-C',
    detectorRoot,
    'ls-files',
    '--error-unmatch',
    'calibration/llm/scripts/run-v22-public-calibration.mjs',
  ], { encoding: 'utf8' });
  assert.equal(tracked.status, 0, tracked.stderr);

  const result = spawnSync(
    wrapper,
    [driver, 'scan', source, '--out', output, '--quiet'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        CEJEL_CALIBRATION_NO_EGRESS_IMAGE: process.env.CEJEL_CALIBRATION_NO_EGRESS_TEST_IMAGE,
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(readFileSync(join(output, 'report.json'), 'utf8'));
  assert.equal(report.rubricVersion, 'witan-rubric-v22-prospective-2026-08-10');
  const manifest = JSON.parse(readFileSync(join(output, 'v22-calibration-manifest.json'), 'utf8'));
  assert.equal(manifest.rubric_version, 'witan-rubric-v22-prospective-2026-08-10');

  const verifier = fileURLToPath(
    new URL('./v22-public-calibration-artifacts.mjs', import.meta.url),
  );
  const verification = spawnSync(process.execPath, [verifier, output], { encoding: 'utf8' });
  assert.equal(verification.status, 0, verification.stderr);
  const receipt = JSON.parse(readFileSync(join(output, 'v22-calibration-receipt.json'), 'utf8'));
  assert.equal(receipt.rubric_version, 'witan-rubric-v22-prospective-2026-08-10');
  assert.equal(receipt.report_attestation_binding, 'verified');

  const publicCli = spawnSync(
    process.execPath,
    [join(detectorRoot, 'dist', 'index.js'), 'scan', source, '--out', publicOutput, '--quiet'],
    { encoding: 'utf8' },
  );
  assert.equal(publicCli.status, 0, publicCli.stderr);
  const publicAttestation = JSON.parse(readFileSync(join(publicOutput, 'attestation.json'), 'utf8'));
  assert.equal(publicAttestation.predicate.rubricVersion, 'witan-rubric-v17-2026-07-24');
});

test('v22 artifact verifier fails loudly when a driver output has no artifacts', () => {
  const verifier = fileURLToPath(
    new URL('./v22-public-calibration-artifacts.mjs', import.meta.url),
  );
  const emptyOutput = mkdtempSync(join(tmpdir(), 'cejel-v22-empty-driver-output-'));
  const result = spawnSync(process.execPath, [verifier, emptyOutput], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /v22 calibration required artifact missing: v22-calibration-manifest\.json/);
});

test('normal Node execution keeps local DNS and child processes available outside the wrapper', () => {
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `
      import { execFileSync } from 'node:child_process';
      import { promises as dnsPromises } from 'node:dns';
      execFileSync(process.execPath, ['--version']);
      await dnsPromises.lookup('localhost');
      process.stdout.write('available');
    `,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'available');
});

test('no-egress wrapper refuses inherited Node preload or loader options', () => {
  const result = spawnSync(
    fileURLToPath(new URL('./no-egress-wrapper.sh', import.meta.url)),
    [process.execPath, '--version'],
    { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '--require=./attacker.cjs' } },
  );
  assert.equal(result.status, 66);
  assert.match(result.stderr, /refuses inherited NODE_OPTIONS/);
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
  const assemble = workflow.indexOf('Assemble deterministic evidence binding');
  const retain = workflow.indexOf('Retain exact golden free-core compatibility evidence');
  const uploadRaw = workflow.indexOf('Upload raw calibration outputs');
  assert.ok(execute >= 0 && assemble > execute && retain > assemble && uploadRaw > retain);
  assert.match(
    workflow,
    /retain-golden-compatibility\.mjs[\s\S]*free-core-parity\.json[\s\S]*llm-output\/free-core-compatibility\.json/,
  );
});

test('golden compatibility retention preserves exact bytes and fails closed on replacement', () => {
  const root = mkdtempSync(join(tmpdir(), 'cejel-llm-parity-retention-'));
  const source = join(root, 'free-core-parity.json');
  const retained = join(root, 'free-core-compatibility.json');
  const sourceBytes = '{\n  "candidate": {"exit_code": 0},\n  "baseline": {"exit_code": 0}\n}\n';
  writeFileSync(source, sourceBytes, 'utf8');
  const result = retainGoldenCompatibilityEvidence(source, retained);
  assert.equal(readFileSync(retained, 'utf8'), sourceBytes);
  assert.equal(result.byte_sha256, createHash('sha256').update(sourceBytes).digest('hex'));
  assert.equal(lstatSync(retained).mode & 0o777, 0o600);
  assert.throws(
    () => retainGoldenCompatibilityEvidence(source, retained),
    /EEXIST|file already exists/,
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
