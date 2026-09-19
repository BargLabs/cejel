import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RECORD_PATH = join(ROOT, 'docs/fixtures/specimen-derivations/cycle-12-miss-specimens.json');
const GUARD_FIXTURE = join(ROOT, 'src/__tests__/fixtures/specimen-derivation-guard');

type Status = 'established-nonreproduction' | 'evidence-pending' | 'unversioned-evidence';
interface RecordEntry {
  id: string;
  status: Status;
  closedDescriptionProperties: string[];
  measurement?: string;
  missingEvidence?: string;
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
  // uncommitted or operator-held specimens. CI fetches full history.
  const registered = JSON.parse(execFileSync('git', [
    'show',
    'bc0ee453b272ea47e04e70273d4713e6beccb060:docs/fixtures/specimen-derivations/cycle-12-miss-specimens.json',
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
    if (entry.status === 'established-nonreproduction' && !entry.measurement) {
      throw new Error(`${entry.id} lacks its required measurement`);
    }
    if (entry.status !== 'established-nonreproduction' && !entry.missingEvidence) {
      throw new Error(`${entry.id} lacks named missing evidence`);
    }
  }
  return parsed.records;
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
    expect(records.find((entry) => entry.id === 'a2-history-env')?.status).toBe(
      'established-nonreproduction',
    );
    expect(records.find((entry) => entry.id === 'coverage-node')?.status).toBe(
      'unversioned-evidence',
    );
    expect(records.find((entry) => entry.id === 'template-pem')?.status).toBe('evidence-pending');
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
