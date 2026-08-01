import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateCrossArtifactConformancePilot } from './d-series-cross-artifact-conformance-lib.mjs';

function parseArguments(argv) {
  const args = new Map();
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error(`invalid_argument:${key ?? ''}`);
    args.set(key, value);
  }
  return args;
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function verifyCheckout(manifest, subject, checkout) {
  const actualRevision = git(checkout, ['rev-parse', 'HEAD']);
  if (actualRevision !== subject.revision) {
    throw new Error(`revision_mismatch:${subject.role}:${actualRevision}:${subject.revision}`);
  }
  const actualReportBlob = git(checkout, ['rev-parse', `HEAD:${manifest.implementationPath}`]);
  if (actualReportBlob !== subject.reportBlob) {
    throw new Error(
      `report_blob_mismatch:${subject.role}:${actualReportBlob}:${subject.reportBlob}`,
    );
  }
  const actualDeclarationBlob = git(checkout, [
    'rev-parse',
    `${manifest.declaration.revision}:${manifest.declaration.path}`,
  ]);
  if (actualDeclarationBlob !== manifest.declaration.blob) {
    throw new Error(
      `declaration_blob_mismatch:${actualDeclarationBlob}:${manifest.declaration.blob}`,
    );
  }
}

function observe(adapterPath, checkout, subject) {
  const stdout = execFileSync(
    'pnpm',
    ['exec', 'tsx', adapterPath, '--alfred-root', checkout],
    { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const parsed = JSON.parse(stdout);
  return {
    role: subject.role,
    revision: parsed.revision,
    reportBlob: subject.reportBlob,
    summaries: {
      zero: {
        claimBearing: parsed.summaries.zero.claimBearing,
        refusalReasons: parsed.summaries.zero.refusalReasons,
      },
      perfect: {
        claimBearing: parsed.summaries.perfect.claimBearing,
        refusalReasons: parsed.summaries.perfect.refusalReasons,
      },
    },
  };
}

const args = parseArguments(process.argv);
const scriptRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptRoot, '..');
const manifestPath = resolve(
  args.get('--manifest') ??
    resolve(
      repoRoot,
      'docs/experiments/d-series-cross-artifact-conformance-pilot-manifest-2026-08-01.json',
    ),
);
const outputPath = resolve(
  args.get('--json') ?? '/tmp/cejel-d-series-cross-artifact-conformance-pilot.json',
);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const adapterPath = resolve(scriptRoot, 'd-series-cross-artifact-alfred-adapter.mjs');
const observations = [];

try {
  execFileSync(
    'git',
    ['merge-base', '--is-ancestor', manifest.preregistrationCommit, 'HEAD'],
    { cwd: repoRoot, stdio: 'ignore' },
  );
} catch {
  throw new Error(`preregistration_not_ancestor:${manifest.preregistrationCommit}`);
}

for (const subject of manifest.subjects) {
  const checkoutArgument = args.get(`--${subject.role}-checkout`);
  if (!checkoutArgument) throw new Error(`missing_argument:--${subject.role}-checkout`);
  const checkout = resolve(checkoutArgument);
  verifyCheckout(manifest, subject, checkout);
  observations.push(observe(adapterPath, checkout, subject));
}

const result = evaluateCrossArtifactConformancePilot(manifest, observations);
result.detectorCommit = git(repoRoot, ['rev-parse', 'HEAD']);
result.manifestPath = manifestPath.startsWith(`${repoRoot}/`)
  ? manifestPath.slice(repoRoot.length + 1)
  : manifestPath;
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
});
process.stdout.write(
  `result=${result.result} findings=${result.findingCount}/${result.denominator} output=${outputPath}\n`,
);
if (result.result !== 'pass') process.exitCode = 1;
