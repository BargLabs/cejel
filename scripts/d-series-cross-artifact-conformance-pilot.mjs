import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateCrossArtifactConformancePilot } from './d-series-cross-artifact-conformance-lib.mjs';

const RECOVERY_PREREGISTRATION_COMMIT = '1163749225e678063b4d8c75e09c0839dbd53b77';
const RUNTIME_PINS = {
  tsxVersion: '4.22.3',
  tsxCliSha256: '5c916fa6ecad44aedbb01ca5815536d00ea07de6b73eeb9443d317326b0218d8',
  lockfileBlob: 'f265bc459610b22a7844e019e4d1fc9bf307dfd3',
  packageJsonBlob: '8b7e8adace9696090761aa95adfc9be7f2b8470d',
};

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

  const actualLockfileBlob = git(checkout, ['rev-parse', 'HEAD:pnpm-lock.yaml']);
  if (actualLockfileBlob !== RUNTIME_PINS.lockfileBlob) {
    throw new Error(`lockfile_blob_mismatch:${actualLockfileBlob}:${RUNTIME_PINS.lockfileBlob}`);
  }
  const actualPackageJsonBlob = git(checkout, ['rev-parse', 'HEAD:package.json']);
  if (actualPackageJsonBlob !== RUNTIME_PINS.packageJsonBlob) {
    throw new Error(
      `package_json_blob_mismatch:${actualPackageJsonBlob}:${RUNTIME_PINS.packageJsonBlob}`,
    );
  }
  const tsxPackagePath = resolve(checkout, 'node_modules/tsx/package.json');
  const tsxCliPath = resolve(checkout, 'node_modules/tsx/dist/cli.mjs');
  const tsxPackage = JSON.parse(readFileSync(tsxPackagePath, 'utf8'));
  if (tsxPackage.version !== RUNTIME_PINS.tsxVersion) {
    throw new Error(`tsx_version_mismatch:${tsxPackage.version}:${RUNTIME_PINS.tsxVersion}`);
  }
  const actualTsxCliSha256 = createHash('sha256').update(readFileSync(tsxCliPath)).digest('hex');
  if (actualTsxCliSha256 !== RUNTIME_PINS.tsxCliSha256) {
    throw new Error(
      `tsx_cli_hash_mismatch:${actualTsxCliSha256}:${RUNTIME_PINS.tsxCliSha256}`,
    );
  }
  return { ...RUNTIME_PINS, tsxCliPath };
}

function observe(adapterPath, checkout, subject, runtime) {
  const reportRelativePath = manifest.implementationPath;
  const corpusRelativePath = `${dirname(reportRelativePath)}/corpus.ts`;
  const stdout = execFileSync(
    process.execPath,
    [
      runtime.tsxCliPath,
      adapterPath,
      '--alfred-root',
      checkout,
      '--corpus-relative-path',
      corpusRelativePath,
      '--report-relative-path',
      reportRelativePath,
    ],
    { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const parsed = JSON.parse(stdout);
  return {
    role: subject.role,
    revision: parsed.revision,
    reportBlob: subject.reportBlob,
    runtime: {
      tsxVersion: runtime.tsxVersion,
      tsxCliSha256: runtime.tsxCliSha256,
      lockfileBlob: runtime.lockfileBlob,
      packageJsonBlob: runtime.packageJsonBlob,
    },
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
try {
  execFileSync(
    'git',
    ['merge-base', '--is-ancestor', RECOVERY_PREREGISTRATION_COMMIT, 'HEAD'],
    { cwd: repoRoot, stdio: 'ignore' },
  );
} catch {
  throw new Error(`recovery_preregistration_not_ancestor:${RECOVERY_PREREGISTRATION_COMMIT}`);
}

for (const subject of manifest.subjects) {
  const checkoutArgument = args.get(`--${subject.role}-checkout`);
  if (!checkoutArgument) throw new Error(`missing_argument:--${subject.role}-checkout`);
  const checkout = resolve(checkoutArgument);
  const runtime = verifyCheckout(manifest, subject, checkout);
  observations.push(observe(adapterPath, checkout, subject, runtime));
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
