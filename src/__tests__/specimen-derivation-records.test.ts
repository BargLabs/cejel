import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RECORD_PATH = join(ROOT, 'docs/fixtures/specimen-derivations/cycle-12-miss-specimens.json');
const GUARD_FIXTURE = join(ROOT, 'src/__tests__/fixtures/specimen-derivation-guard');
const COVERAGE_NODE_FIXTURE = join(ROOT, 'src/__tests__/fixtures/cycle-12-coverage-node');

type Status =
  | 'evidence-established'
  | 'established-nonreproduction'
  | 'evidence-pending'
  | 'unversioned-evidence'
  | 'unmeasurable-by-construction'
  | 'specimen-unrepresentative';
interface RecordEntry {
  id: string;
  status: Status;
  closedDescriptionProperties: string[];
  measurement?: string;
  missingEvidence?: string;
  rationale?: string;
  representativeness?: string;
  evidencePin?: {
    revision: string;
    specimenPath: string;
    specimenDigest: string;
    specimenKind: 'blob' | 'tree';
  };
}

function parseRecords(recordPath = RECORD_PATH): RecordEntry[] {
  const parsed = JSON.parse(readFileSync(recordPath, 'utf8')) as {
    version: number;
    closedDescriptionStatus: string;
    records: RecordEntry[];
  };
  if (parsed.version !== 1 || parsed.closedDescriptionStatus !== 'pending-operator-input') {
    throw new Error('derivation record must declare pending operator-only description evidence');
  }
  // Read the registered inventory from an immutable ancestor, not the mutable record
  // being checked. This is completeness against this registration only, not against
  // uncommitted or operator-held specimens. The pinned ab2026d8… commit must
  // remain reachable; CI must fetch full history (actions/checkout fetch-depth: 0).
  const registered = JSON.parse(execFileSync('git', [
    'show',
    'ab2026d88ad33857aefc31044cc72d782d523231:docs/fixtures/specimen-derivations/cycle-12-miss-specimens.json',
  ], { cwd: ROOT, encoding: 'utf8' })) as { records: RecordEntry[] };
  const expected = registered.records.map((entry) => entry.id).sort();
  if (expected.length === 0 || new Set(expected).size !== expected.length) {
    throw new Error('registered specimen inventory is empty or duplicated');
  }
  if (parsed.records.map((entry) => entry.id).sort().join(',') !== expected.join(',')) {
    throw new Error('every registered cycle-12 item requires exactly one derivation record');
  }
  for (const entry of parsed.records) {
    if (entry.closedDescriptionProperties.length !== 0) {
      throw new Error('closed description properties must remain absent from this public record');
    }
    const established = new Set<Status>(['established-nonreproduction', 'evidence-established']);
    const measured = new Set<Status>([...established, 'specimen-unrepresentative']);
    if (measured.has(entry.status) && !entry.measurement?.trim()) {
      throw new Error(`${entry.id} lacks its required measurement`);
    }
    if (established.has(entry.status) && Object.hasOwn(entry, 'missingEvidence')) {
      throw new Error(`${entry.id} must not retain missingEvidence`);
    }
    if (entry.status === 'specimen-unrepresentative') {
      if (!entry.representativeness?.trim()) {
        throw new Error(`${entry.id} lacks its required representativeness`);
      }
      if (Object.hasOwn(entry, 'missingEvidence')) {
        throw new Error(`${entry.id} must not retain missingEvidence`);
      }
    }
    if (entry.status === 'unmeasurable-by-construction') {
      if (!entry.rationale?.trim()) throw new Error(`${entry.id} lacks its required rationale`);
      if (Object.hasOwn(entry, 'evidencePin')) {
        throw new Error(`${entry.id} must not retain evidencePin`);
      }
      if (Object.hasOwn(entry, 'measurement')) {
        throw new Error(`${entry.id} must not retain measurement`);
      }
      if (Object.hasOwn(entry, 'missingEvidence')) {
        throw new Error(`${entry.id} must not retain missingEvidence`);
      }
    }
    if (!measured.has(entry.status) && entry.status !== 'unmeasurable-by-construction' && !entry.missingEvidence?.trim()) {
      throw new Error(`${entry.id} lacks named missing evidence`);
    }
  }
  for (const entry of parsed.records) {
    if (entry.status === 'evidence-established' || entry.status === 'specimen-unrepresentative') {
      assertEvidencePin(entry);
    }
  }
  return parsed.records;
}

function assertEvidencePin(entry: RecordEntry, repository = ROOT): void {
  const pin = entry.evidencePin;
  if (!pin) throw new Error(`${entry.id} lacks evidencePin`);
  if (![pin.revision, pin.specimenPath, pin.specimenDigest].every(
    (value) => typeof value === 'string' && value.trim().length > 0,
  )) throw new Error(`${entry.id} evidencePin fields must be populated`);
  if (pin.specimenKind !== 'blob' && pin.specimenKind !== 'tree') {
    throw new Error(`${entry.id} evidencePin specimenKind must be declared as blob or tree`);
  }
  if (!/^[0-9a-f]{40}$/.test(pin.revision)) {
    throw new Error(`${entry.id} evidencePin revision must be a full 40-hex commit SHA`);
  }
  const git = (args: string[], input?: string): Buffer => {
    const result = spawnSync('git', args, { cwd: repository, input, stdio: ['pipe', 'pipe', 'pipe'] });
    // Git can emit corruption errors yet return status 0 with a batch "missing"
    // response. Such diagnostics are not evidence that the object is absent.
    if (result.error || result.status !== 0 || result.stderr?.length) {
      throw new Error(`${entry.id} evidencePin unresolved measurement: git ${args.join(' ')} failed: ${result.stderr?.toString() || result.error?.message || `status=${result.status}, signal=${result.signal}`}`);
    }
    return result.stdout;
  };
  const objectType = (object: string): string | undefined => {
    // Batch mode reports missing objects as data; process failures stay unresolved.
    const result = git(['cat-file', '--batch-check=%(objecttype)'], `${object}\n`).toString().trimEnd();
    if (result === `${object} missing`) return undefined;
    if (['commit', 'tree', 'blob', 'tag'].includes(result)) return result;
    throw new Error(`${entry.id} evidencePin unresolved measurement: unexpected git object response: ${result}`);
  };
  if (objectType(pin.revision) !== 'commit') {
    throw new Error(`${entry.id} evidencePin revision must resolve to a commit`);
  }
  if (/[\r\n]/.test(pin.specimenPath) || pin.specimenPath.startsWith('/') || pin.specimenPath.includes('\\') ||
      pin.specimenPath.split('/').some((part) => ['', '.', '..'].includes(part))) {
    throw new Error(`${entry.id} evidencePin specimenPath must be repo-relative`);
  }
  const object = `${pin.revision}:${pin.specimenPath}`;
  const actualKind = objectType(object);
  if (actualKind !== pin.specimenKind) {
    throw new Error(`${entry.id} evidencePin specimenPath must name a ${pin.specimenKind} at the pinned revision (kind mismatch: found ${actualKind ?? 'missing'})`);
  }

  let digest: string;
  if (pin.specimenKind === 'blob') {
    const blob = git(['cat-file', 'blob', object]);
    digest = `sha256:${createHash('sha256').update(blob).digest('hex')}`;
  } else {
    // The recursive manifest is the content being pinned. Keep mode, type, object id,
    // and path in a deterministic order; the tree object id itself is SHA-1 here.
    const lines = git(['ls-tree', '-r', '--full-tree', object]).toString('utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .sort();
    const manifest = lines.length > 0 ? `${lines.join('\n')}\n` : '';
    digest = `sha256:${createHash('sha256').update(manifest).digest('hex')}`;
  }
  if (digest !== pin.specimenDigest) {
    throw new Error(`${entry.id} evidencePin digest mismatch`);
  }
}

function assertSyntheticFixture(directory = GUARD_FIXTURE, expectedCommand = 'node --test --coverage'): void {
  if (readdirSync(directory).sort().join(',') !== 'package.json') {
    throw new Error('derivation fixture must contain exactly its asserted artifact');
  }
  const packageJson = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
    scripts?: { test?: string };
  };
  if (packageJson.scripts?.test !== expectedCommand) {
    throw new Error('derivation record assertion is not exhibited by its specimen');
  }
}

describe('cycle-12 specimen derivation records', () => {
  it('covers the immutable registered inventory and names evidence states honestly', () => {
    const records = parseRecords();
    expect(records).toHaveLength(3);
    expect(records.find((entry) => entry.id === 'a2-history-env')?.status).toBe(
      'established-nonreproduction',
    );
    expect(records.find((entry) => entry.id === 'coverage-node')?.status).toBe(
      'specimen-unrepresentative',
    );
    expect(records.find((entry) => entry.id === 'template-pem')?.status).toBe(
      'unmeasurable-by-construction',
    );
  });

  it('refuses the real record when a required specimen entry is removed', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'cejel-specimen-record-'));
    const mutatedRecord = join(temporary, 'cycle-12-miss-specimens.json');
    try {
      cpSync(RECORD_PATH, mutatedRecord);
      const parsed = JSON.parse(readFileSync(mutatedRecord, 'utf8')) as { records: RecordEntry[] };
      parsed.records = parsed.records.filter((entry) => entry.id !== 'coverage-node');
      writeFileSync(mutatedRecord, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
      expect(() => parseRecords(mutatedRecord)).toThrow('every registered cycle-12 item requires exactly one derivation record');
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it('refuses a renamed item while all three record entries remain present', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'cejel-specimen-identity-'));
    const mutatedRecord = join(temporary, 'record.json');
    try {
      const parsed = JSON.parse(readFileSync(RECORD_PATH, 'utf8')) as { records: RecordEntry[] };
      parsed.records[0]!.id = 'unregistered-replacement';
      writeFileSync(mutatedRecord, JSON.stringify(parsed));
      expect(() => parseRecords(mutatedRecord)).toThrow('every registered cycle-12 item');
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it('refuses a synthetic derivation record whose asserted property is not exhibited', () => {
    expect(() => assertSyntheticFixture(GUARD_FIXTURE, 'node --test --experimental-test-coverage')).toThrow(
      'derivation record assertion is not exhibited',
    );
  });

  it('accepts the coverage-node specimen property: tests run without coverage instrumentation', () => {
    assertSyntheticFixture(COVERAGE_NODE_FIXTURE, 'node --test');
  });

  it('refuses a specimen with a required element stripped while its record remains intact', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'cejel-specimen-derivation-'));
    try {
      cpSync(GUARD_FIXTURE, temporary, { recursive: true });
      rmSync(join(temporary, 'package.json'));
      expect(() => assertSyntheticFixture(temporary)).toThrow(
        'derivation fixture must contain exactly its asserted artifact',
      );
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});

// These exercise the pin validator with an existing public guard fixture only.
// They do not promote either open specimen's evidence status.
describe('established evidence pins', () => {
  // This pinned 9ce92fc1… commit must remain reachable; CI must fetch full history
  // (actions/checkout fetch-depth: 0), as for the registered-inventory ancestor above.
  const revision = '9ce92fc16afefe2c69116e9b25b03d01847196f4';
  const specimenPath = 'src/__tests__/fixtures/specimen-derivation-guard/package.json';
  const blob = execFileSync('git', ['cat-file', 'blob', `${revision}:${specimenPath}`], { cwd: ROOT });
  const specimenDigest = `sha256:${createHash('sha256').update(blob).digest('hex')}`;

  function check(mutate: (entry: RecordEntry) => void = () => {}): RecordEntry[] {
    const temporary = mkdtempSync(join(tmpdir(), 'cejel-evidence-pin-'));
    try {
      const parsed = JSON.parse(readFileSync(RECORD_PATH, 'utf8')) as { records: RecordEntry[] };
      const entry = parsed.records.find((record) => record.id === 'coverage-node')!;
      entry.status = 'evidence-established';
      entry.measurement = 'Pin-validator control only; no specimen qualification claimed.';
      delete entry.missingEvidence;
      entry.evidencePin = { revision, specimenPath, specimenDigest, specimenKind: 'blob' };
      mutate(entry);
      const path = join(temporary, 'record.json');
      writeFileSync(path, JSON.stringify(parsed));
      return parseRecords(path);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }

  it('accepts a valid committed-blob pin', () => {
    expect(check().find((entry) => entry.id === 'coverage-node')?.evidencePin)
      .toEqual({ revision, specimenPath, specimenDigest, specimenKind: 'blob' });
  });

  it('ignores divergent working-tree bytes', () => {
    const path = join(ROOT, specimenPath);
    const original = readFileSync(path);
    expect(original).toEqual(blob);
    try {
      writeFileSync(path, Buffer.concat([blob, Buffer.from('\nworking-tree divergence\n')]));
      expect(readFileSync(path)).not.toEqual(blob);
      expect(() => check()).not.toThrow();
    } finally {
      writeFileSync(path, original);
      expect(readFileSync(path)).toEqual(blob);
    }
  });

  it.each(['missing git directory', 'corrupt object'])('reports %s as unresolved with git stderr', (scenario) => {
    const repository = mkdtempSync(join(tmpdir(), 'cejel-pin-git-failure-'));
    try {
      if (scenario === 'corrupt object') {
        execFileSync('git', ['init', '--quiet', repository]);
        const directory = join(repository, '.git', 'objects', revision.slice(0, 2));
        mkdirSync(directory);
        writeFileSync(join(directory, revision.slice(2)), 'invalid loose object');
      }
      const entry: RecordEntry = {
        id: 'pin-validator-control', status: 'evidence-established', closedDescriptionProperties: [],
        evidencePin: { revision, specimenPath, specimenDigest, specimenKind: 'blob' },
      };
      const diagnostic = spawnSync('git', ['cat-file', '--batch-check=%(objecttype)'], {
        cwd: repository, input: `${revision}\n`,
      }).stderr.toString();
      expect(diagnostic.length).toBeGreaterThan(0);
      expect(() => assertEvidencePin(entry, repository)).toThrow(
        `unresolved measurement: git cat-file --batch-check=%(objecttype) failed: ${diagnostic}`,
      );
    } finally {
      rmSync(repository, { recursive: true, force: true });
    }
  });

  const mutations: [string, (entry: RecordEntry) => void, string][] = [
    ['absent pin', (entry) => { delete entry.evidencePin; }, 'lacks evidencePin'],
    ['absent specimen kind', (entry) => {
      const pin = entry.evidencePin as unknown as { specimenKind?: string };
      delete pin.specimenKind;
    }, 'specimenKind must be declared'],
    ['tree kind for blob path', (entry) => { entry.evidencePin!.specimenKind = 'tree'; }, 'kind mismatch'],
    ['empty pin field', (entry) => { entry.evidencePin!.specimenPath = ''; }, 'fields must be populated'],
    ['changed digest', (entry) => {
      const digest = entry.evidencePin!.specimenDigest;
      entry.evidencePin!.specimenDigest = `sha256:${digest[7] === '0' ? '1' : '0'}${digest.slice(8)}`;
    }, 'digest mismatch'],
    ['different committed file', (entry) => { entry.evidencePin!.specimenPath = 'package.json'; }, 'digest mismatch'],
    ['stale missing evidence', (entry) => { entry.missingEvidence = 'old pending text'; }, 'must not retain missingEvidence'],
    ['empty missing evidence field', (entry) => { entry.missingEvidence = ''; }, 'must not retain missingEvidence'],
    ['absent measurement', (entry) => { delete entry.measurement; }, 'lacks its required measurement'],
    ['blank measurement', (entry) => { entry.measurement = ' '; }, 'lacks its required measurement'],
    ['abbreviated revision', (entry) => { entry.evidencePin!.revision = revision.slice(0, 8); }, 'full 40-hex commit SHA'],
    ['unresolvable revision', (entry) => { entry.evidencePin!.revision = '0'.repeat(40); }, 'must resolve to a commit'],
    ['tree revision', (entry) => {
      entry.evidencePin!.revision = execFileSync('git', ['rev-parse', `${revision}^{tree}`], { cwd: ROOT, encoding: 'utf8' }).trim();
    }, 'must resolve to a commit'],
    ['missing committed path', (entry) => { entry.evidencePin!.specimenPath = 'absent-card9-specimen'; }, 'must name a blob'],
    ['directory path', (entry) => { entry.evidencePin!.specimenPath = 'src'; }, 'must name a blob'],
    ['absolute path', (entry) => { entry.evidencePin!.specimenPath = '/package.json'; }, 'must be repo-relative'],
    ['closed properties', (entry) => { entry.closedDescriptionProperties = ['synthetic mutation']; },
      'closed description properties must remain absent from this public record'],
    ['legacy established stale evidence', (entry) => {
      entry.status = 'established-nonreproduction'; entry.missingEvidence = 'old pending text';
    }, 'must not retain missingEvidence'],
  ];
  it.each(mutations)('refuses %s for its own reason', (_name, mutate, reason) => {
    expect(() => check(mutate)).toThrow(reason);
  });
});

describe('tree evidence pins', () => {
  const revision = '9ce92fc16afefe2c69116e9b25b03d01847196f4';
  const specimenPath = 'src/__tests__/fixtures';
  const nestedPath = `${specimenPath}/offline-boundary/transitive/__tests__/network-helper.ts`;

  function manifestLines(): string[] {
    return execFileSync('git', ['ls-tree', '-r', '--full-tree', `${revision}:${specimenPath}`], {
      cwd: ROOT,
      encoding: 'utf8',
    }).split('\n').filter((line) => line.length > 0).sort();
  }

  function digest(lines: string[]): string {
    const manifest = lines.length > 0 ? `${lines.join('\n')}\n` : '';
    return `sha256:${createHash('sha256').update(manifest).digest('hex')}`;
  }

  const specimenDigest = digest(manifestLines());

  function check(mutate: (entry: RecordEntry) => void = () => {}): RecordEntry[] {
    const temporary = mkdtempSync(join(tmpdir(), 'cejel-tree-evidence-pin-'));
    try {
      const parsed = JSON.parse(readFileSync(RECORD_PATH, 'utf8')) as { records: RecordEntry[] };
      const entry = parsed.records.find((record) => record.id === 'coverage-node')!;
      entry.status = 'evidence-established';
      entry.measurement = 'Tree pin-validator control only; no specimen qualification claimed.';
      delete entry.missingEvidence;
      entry.evidencePin = { revision, specimenPath, specimenDigest, specimenKind: 'tree' };
      mutate(entry);
      const path = join(temporary, 'record.json');
      writeFileSync(path, JSON.stringify(parsed));
      return parseRecords(path);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }

  it('accepts a valid recursive tree pin', () => {
    expect(check().find((entry) => entry.id === 'coverage-node')?.evidencePin)
      .toEqual({ revision, specimenPath, specimenDigest, specimenKind: 'tree' });
  });

  it('ignores divergent working-tree bytes inside the pinned tree', () => {
    const path = join(ROOT, nestedPath);
    const original = readFileSync(path);
    const committed = execFileSync('git', ['cat-file', 'blob', `${revision}:${nestedPath}`], { cwd: ROOT });
    expect(original).toEqual(committed);
    try {
      writeFileSync(path, Buffer.concat([committed, Buffer.from('\nworking-tree tree divergence\n')]));
      expect(readFileSync(path)).not.toEqual(committed);
      expect(() => check()).not.toThrow();
    } finally {
      writeFileSync(path, original);
      expect(readFileSync(path)).toEqual(committed);
    }
  });

  it.each([
    ['nested file changed', (lines: string[]) => lines.map((line) => line.includes(`\t${nestedPath.slice(specimenPath.length + 1)}`) ? line.replace(/[0-9a-f]{40}\t/, `${'0'.repeat(40)}\t`) : line)],
    ['file added', (lines: string[]) => [...lines, `100644 blob ${'0'.repeat(40)}\tadded-by-mutation.txt`].sort()],
    ['file removed', (lines: string[]) => lines.filter((line) => !line.endsWith(`\t${nestedPath.slice(specimenPath.length + 1)}`))],
    ['file mode changed', (lines: string[]) => lines.map((line) => line.includes(`\t${nestedPath.slice(specimenPath.length + 1)}`) ? line.replace(/^100644 /, '100755 ') : line)],
  ] as [string, (lines: string[]) => string[]][] )('refuses %s on recursive digest mismatch', (_name, mutate) => {
    const mutatedDigest = digest(mutate(manifestLines()));
    expect(() => check((entry) => { entry.evidencePin!.specimenDigest = mutatedDigest; }))
      .toThrow('digest mismatch');
  });

  it.each([
    ['tree kind for blob path', (entry: RecordEntry) => {
      entry.evidencePin!.specimenPath = 'src/__tests__/fixtures/specimen-derivation-guard/package.json';
      entry.evidencePin!.specimenKind = 'tree';
    }],
    ['blob kind for tree path', (entry: RecordEntry) => { entry.evidencePin!.specimenKind = 'blob'; }],
  ] as [string, (entry: RecordEntry) => void][])('refuses %s as a kind mismatch', (_name, mutate) => {
    expect(() => check(mutate)).toThrow('kind mismatch');
  });

  it('refuses an absent specimen kind', () => {
    expect(() => check((entry) => {
      const pin = entry.evidencePin as unknown as { specimenKind?: string };
      delete pin.specimenKind;
    })).toThrow('specimenKind must be declared');
  });
});

describe('unmeasurable-by-construction status', () => {
  function check(mutate: (entry: RecordEntry) => void = () => {}): RecordEntry[] {
    const temporary = mkdtempSync(join(tmpdir(), 'cejel-unmeasurable-'));
    try {
      const parsed = JSON.parse(readFileSync(RECORD_PATH, 'utf8')) as { records: RecordEntry[] };
      const entry = parsed.records.find((record) => record.id === 'template-pem')!;
      mutate(entry);
      const path = join(temporary, 'record.json');
      writeFileSync(path, JSON.stringify(parsed));
      return parseRecords(path);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }

  it('accepts the valid permanent-unmeasurability record', () => {
    const entry = check().find((record) => record.id === 'template-pem');
    expect(entry?.status).toBe('unmeasurable-by-construction');
    expect(entry?.rationale).toMatch(/cannot be safely committed/);
  });

  it.each([
    ['absent rationale', (entry: RecordEntry) => { delete entry.rationale; }, 'lacks its required rationale'],
    ['evidence pin', (entry: RecordEntry) => {
      entry.evidencePin = { revision: '0'.repeat(40), specimenPath: 'x', specimenDigest: 'sha256:x', specimenKind: 'blob' };
    }, 'must not retain evidencePin'],
    ['measurement', (entry: RecordEntry) => { entry.measurement = 'nothing measured'; }, 'must not retain measurement'],
    ['missing evidence', (entry: RecordEntry) => { entry.missingEvidence = 'not available'; }, 'must not retain missingEvidence'],
  ])('refuses %s for its own reason', (_name, mutate, reason) => {
    expect(() => check(mutate)).toThrow(reason);
  });
});

describe('specimen-unrepresentative status', () => {
  function check(mutate: (entry: RecordEntry) => void = () => {}): RecordEntry[] {
    const temporary = mkdtempSync(join(tmpdir(), 'cejel-unrepresentative-'));
    try {
      const parsed = JSON.parse(readFileSync(RECORD_PATH, 'utf8')) as { records: RecordEntry[] };
      const entry = parsed.records.find((record) => record.id === 'coverage-node')!;
      mutate(entry);
      const path = join(temporary, 'record.json');
      writeFileSync(path, JSON.stringify(parsed));
      return parseRecords(path);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }

  it('accepts the valid pinned but unrepresentative record', () => {
    const entry = check().find((record) => record.id === 'coverage-node');
    expect(entry?.status).toBe('specimen-unrepresentative');
    expect(entry?.evidencePin).toBeDefined();
    expect(entry?.measurement).toMatch(/detector pin/);
    expect(entry?.representativeness).toMatch(/repository-shaped/);
  });

  it.each([
    ['absent pin', (entry: RecordEntry) => { delete entry.evidencePin; }, 'lacks evidencePin'],
    ['absent measurement', (entry: RecordEntry) => { delete entry.measurement; }, 'lacks its required measurement'],
    ['blank measurement', (entry: RecordEntry) => { entry.measurement = ' '; }, 'lacks its required measurement'],
    ['absent representativeness', (entry: RecordEntry) => { delete entry.representativeness; }, 'lacks its required representativeness'],
    ['blank representativeness', (entry: RecordEntry) => { entry.representativeness = ' '; }, 'lacks its required representativeness'],
    ['retained missing evidence', (entry: RecordEntry) => { entry.missingEvidence = 'stale'; }, 'must not retain missingEvidence'],
  ])('refuses %s for its own reason', (_name, mutate, reason) => {
    expect(() => check(mutate)).toThrow(reason);
  });
});
