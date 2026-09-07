import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V22,
  WITAN_RUBRIC_VERSION_V23,
} from '../rubric-version.js';

// goal_cejel_v23_pem_private_key_grammar_2026-09-06: cycle-12's inventory had one genuinely
// sensitive-shaped miss — a service-account private key in a JSON file whose PEM assignment
// the secret matchers rejected, surfaced in the git-history block. The identifier
// ("private_key") never matches SECRET_IDENTIFIER_KEYWORD_PATTERN (secret/token/api_key/
// password/access_key), and even a matching identifier's value would not survive
// findRealSecretAssignments' capture, which stops at the first real quote/whitespace — a PEM
// block's embedded newline (real or JSON's literal two-character `\n` escape) and the literal
// space inside "PRIVATE KEY" both trip that immediately. This file is the fail-without-fix
// regression guard: every `it` here is written against the ADDED grammar and fails on
// pre-fix repo-signals.ts (verified manually — see the goal's report).

function makeTmpRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'witan-pem-key-v23-'));
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.invalid'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Synthetic Test'], { cwd: dir });
  return dir;
}

function writeFile(dir: string, relativePath: string, contents: string): void {
  const path = join(dir, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
  execFileSync('git', ['add', relativePath], { cwd: dir });
}

function commit(dir: string, message: string): void {
  execFileSync('git', ['commit', '--quiet', '-m', message], { cwd: dir });
}

function removeAndCommit(dir: string, relativePath: string, message: string): void {
  execFileSync('git', ['rm', '--quiet', relativePath], { cwd: dir });
  commit(dir, message);
}

function a2Signal(dir: string, rubricVersion: string) {
  const input = buildWitanInputFromRepo({
    productSlug: 'synthetic-pem-key',
    productDisplayName: 'Synthetic PEM key',
    repoPath: dir,
    generatedAt: '2026-09-06T00:00:00.000Z',
    rubricVersion,
  });
  return (input.signals ?? []).find((signal) => signal.criterionId === 'A2');
}

function pemFinding(dir: string, rubricVersion: string) {
  return a2Signal(dir, rubricVersion)?.findings?.find((finding) =>
    /PEM-formatted private key/i.test(finding.summary),
  );
}

// A deterministic, obviously-synthetic base64 body — never a real key, never copied from any
// tutorial/example/cohort source. Long enough (>>40 chars post-strip) to read as genuine key
// material rather than a short placeholder, and wrapped every 64 columns with a literal `\n`
// escape the way a real GCP/AWS service-account JSON export wraps its PEM body, so the fixture
// exercises the exact JSON-escaped-newline shape the goal's "Why" section describes.
function syntheticPemJsonValue(header = 'PRIVATE KEY'): string {
  const raw = Array.from(
    { length: 24 },
    (_, i) => `witan-synthetic-pem-fixture-material-${i}`,
  ).join('|');
  const body = Buffer.from(raw, 'utf8').toString('base64');
  const wrapped: string[] = [];
  for (let i = 0; i < body.length; i += 64) wrapped.push(body.slice(i, i + 64));
  return `-----BEGIN ${header}-----\\n${wrapped.join('\\n')}\\n-----END ${header}-----\\n`;
}

const SERVICE_ACCOUNT_JSON = `{
  "type": "service_account",
  "project_id": "synthetic-example-project",
  "private_key_id": "0000000000000000000000000000000000synth",
  "private_key": "${syntheticPemJsonValue()}",
  "client_email": "synthetic-svc@synthetic-example-project.iam.gserviceaccount.com"
}
`;

describe('A2 v23 PEM private-key grammar — recognition (fails without the fix)', () => {
  it('recognizes a PEM private key in git history that a deleted-then-committed JSON file leaves behind, under v23 only', () => {
    const dir = makeTmpRepo();
    writeFile(dir, 'src/index.js', 'export const noop = () => {};\n');
    commit(dir, 'initial');
    writeFile(dir, 'config/service-account.json', SERVICE_ACCOUNT_JSON);
    commit(dir, 'add service account key (mistake)');
    removeAndCommit(dir, 'config/service-account.json', 'remove service account key');

    // RED (pre-fix): this is the exact cycle-12 gap — the value grammar rejects the PEM
    // assignment, so no critical finding is ever produced even though the secret is right
    // there in history. GREEN (post-fix): v23 recognizes it.
    expect(pemFinding(dir, WITAN_RUBRIC_VERSION_V23)).toBeDefined();
    expect(pemFinding(dir, WITAN_RUBRIC_VERSION_V23)?.severity).toBe('critical');

    // v17 and v22 detector behaviour must remain byte-stable — this goal's binding
    // constraint. Same repo, same commits: no PEM finding under either legacy rubric.
    expect(pemFinding(dir, WITAN_RUBRIC_VERSION_V22)).toBeUndefined();
    expect(pemFinding(dir, WITAN_RUBRIC_VERSION_V17)).toBeUndefined();
  });

  it('recognizes the same PEM private key when it is still present in the current tree', () => {
    const dir = makeTmpRepo();
    writeFile(dir, 'src/index.js', 'export const noop = () => {};\n');
    writeFile(dir, 'config/service-account.json', SERVICE_ACCOUNT_JSON);
    commit(dir, 'add service account key');

    expect(pemFinding(dir, WITAN_RUBRIC_VERSION_V23)).toBeDefined();
    expect(pemFinding(dir, WITAN_RUBRIC_VERSION_V22)).toBeUndefined();
    expect(pemFinding(dir, WITAN_RUBRIC_VERSION_V17)).toBeUndefined();
  });

  it('recognizes a YAML block-scalar PEM assignment (Kubernetes Secret shape), not just JSON', () => {
    const dir = makeTmpRepo();
    writeFile(dir, 'src/index.js', 'export const noop = () => {};\n');
    const raw = Array.from({ length: 24 }, (_, i) => `witan-synthetic-yaml-pem-${i}`).join('|');
    const body = Buffer.from(raw, 'utf8').toString('base64');
    const wrappedLines = [];
    for (let i = 0; i < body.length; i += 64) wrappedLines.push(`  ${body.slice(i, i + 64)}`);
    writeFile(
      dir,
      'deploy/service-account-key.yaml',
      [
        'apiVersion: v1',
        'kind: Secret',
        'metadata:',
        '  name: synthetic-example-key',
        'stringData:',
        '  private_key: |',
        '    -----BEGIN PRIVATE KEY-----',
        ...wrappedLines,
        '    -----END PRIVATE KEY-----',
      ].join('\n') + '\n',
    );
    commit(dir, 'add k8s secret manifest');

    expect(pemFinding(dir, WITAN_RUBRIC_VERSION_V23)).toBeDefined();
  });
});

describe('A2 v23 PEM private-key grammar — false-positive guards', () => {
  it('does NOT flag a PEM private key inside a __fixtures__ path', () => {
    const dir = makeTmpRepo();
    writeFile(dir, 'src/index.js', 'export const noop = () => {};\n');
    writeFile(dir, 'src/__tests__/__fixtures__/service-account.json', SERVICE_ACCOUNT_JSON);
    commit(dir, 'add fixture');

    expect(pemFinding(dir, WITAN_RUBRIC_VERSION_V23)).toBeUndefined();
  });

  it('does NOT flag a PEM private key inside a documentation (.md) file', () => {
    const dir = makeTmpRepo();
    writeFile(dir, 'src/index.js', 'export const noop = () => {};\n');
    writeFile(
      dir,
      'docs/service-account-setup.md',
      `# Service account setup\n\n\`\`\`json\n${SERVICE_ACCOUNT_JSON}\`\`\`\n`,
    );
    commit(dir, 'add docs');

    expect(pemFinding(dir, WITAN_RUBRIC_VERSION_V23)).toBeUndefined();
  });

  it('does NOT flag an obviously generated development key (path names it as local/dev), while an identical key elsewhere still fires', () => {
    const dir = makeTmpRepo();
    writeFile(dir, 'src/index.js', 'export const noop = () => {};\n');
    writeFile(dir, 'certs/local-dev-key.json', SERVICE_ACCOUNT_JSON);
    commit(dir, 'add local dev key');

    expect(pemFinding(dir, WITAN_RUBRIC_VERSION_V23)).toBeUndefined();

    // Same content, a path with no dev/local/self-signed marker — proves the guard
    // discriminates on the marker, rather than never firing at all.
    const dir2 = makeTmpRepo();
    writeFile(dir2, 'src/index.js', 'export const noop = () => {};\n');
    writeFile(dir2, 'config/service-account.json', SERVICE_ACCOUNT_JSON);
    commit(dir2, 'add service account key');
    expect(pemFinding(dir2, WITAN_RUBRIC_VERSION_V23)).toBeDefined();
  });

  it('does NOT flag a public key or a certificate (never matches "PRIVATE KEY")', () => {
    const dir = makeTmpRepo();
    writeFile(dir, 'src/index.js', 'export const noop = () => {};\n');
    const publicKeyJson = `{\n  "public_key": "${syntheticPemJsonValue('PUBLIC KEY')}"\n}\n`;
    writeFile(dir, 'config/public-key.json', publicKeyJson);
    const certificateJson = `{\n  "certificate": "${syntheticPemJsonValue('CERTIFICATE')}"\n}\n`;
    writeFile(dir, 'config/certificate.json', certificateJson);
    commit(dir, 'add public key and certificate');

    expect(pemFinding(dir, WITAN_RUBRIC_VERSION_V23)).toBeUndefined();
  });

  it('does NOT flag a private key its own file documents as rotated/revoked', () => {
    const dir = makeTmpRepo();
    writeFile(dir, 'src/index.js', 'export const noop = () => {};\n');
    const rotatedJson = `{
  "type": "service_account",
  "status": "rotated",
  "note": "this key was rotated on 2026-08-01 and is no longer valid",
  "private_key": "${syntheticPemJsonValue()}"
}
`;
    writeFile(dir, 'config/old-service-account.json', rotatedJson);
    commit(dir, 'add rotated key record');

    expect(pemFinding(dir, WITAN_RUBRIC_VERSION_V23)).toBeUndefined();
  });

  it('does NOT flag a placeholder PEM body (short filler, not real key material)', () => {
    const dir = makeTmpRepo();
    writeFile(dir, 'src/index.js', 'export const noop = () => {};\n');
    writeFile(
      dir,
      'config/service-account.example.json',
      '{\n  "private_key": "-----BEGIN PRIVATE KEY-----\\nYOUR_KEY_HERE\\n-----END PRIVATE KEY-----\\n"\n}\n',
    );
    commit(dir, 'add placeholder example');

    expect(pemFinding(dir, WITAN_RUBRIC_VERSION_V23)).toBeUndefined();
  });
});

describe('A2 v23 PEM private-key grammar — performance sanity', () => {
  it('scans a large keyword-free file without pathological backtracking', () => {
    const dir = makeTmpRepo();
    writeFile(dir, 'src/generated.txt', `${'private_key: no-pem-here\n'.repeat(20_000)}`);
    commit(dir, 'add generated file');

    const startedAt = performance.now();
    expect(pemFinding(dir, WITAN_RUBRIC_VERSION_V23)).toBeUndefined();
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });
});
