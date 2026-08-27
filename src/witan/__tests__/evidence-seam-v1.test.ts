import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { serializeWitanReport } from '../attestation.js';
import {
  CEJEL_GENERIC_INGEST_CONTRACT_VERSION,
  type GenericSignalDocumentV1,
} from '../generic-adapter.js';
import { renderWitanHtmlReport } from '../html.js';
import { parseIngestFile } from '../ingest.js';
import { createWitanReport } from '../scoring.js';

// Expected values are declared before either fixture is accepted or parsed.
const EXPECTED_HEAL_LOG_SIGNAL_COUNT = 1;
const EXPECTED_HEAL_LOG_FINDING_COUNT = 2;
const EXPECTED_NO_INGEST_REPORT_BYTES = 2_822;
const EXPECTED_NO_INGEST_REPORT_SHA256 =
  '1d244830182eb85407a23c94aafc4cc0dd230e14d38054850cf8763afdf8e614';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(TEST_DIR, '..', '..', '..', 'docs');
const RAW_HEAL_LOG_PATH = join(DOCS_DIR, 'fixtures', 'heal-log.synthetic.json');
const MAPPED_HEAL_LOG_PATH = join(
  DOCS_DIR,
  'fixtures',
  'heal-log-ingest-v1.synthetic.json',
);
const INGEST_SCHEMA_PATH = join(DOCS_DIR, 'schemas', 'cejel-ingest-v1.schema.json');

const REPO_INPUT = {
  productSlug: 'sample-app',
  productDisplayName: 'Sample App',
  repo: { path: '/tmp/sample-app' },
  generatedAt: '2026-07-06T00:00:00.000Z',
  rubricVersion: 'witan-rubric-v1-2026-06-24',
};

interface SyntheticHealAttempt {
  attempt: number;
  exitCode: number;
  matchedFailurePattern: string;
  actionTaken: string;
  outcome: string;
}

interface SyntheticHealLog {
  fixtureNotice: string;
  workflow: string;
  attempts: SyntheticHealAttempt[];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function mapSyntheticHealLog(raw: SyntheticHealLog): GenericSignalDocumentV1 {
  return {
    version: CEJEL_GENERIC_INGEST_CONTRACT_VERSION,
    tool: `${raw.workflow}-heal-log`,
    signals: [
      {
        dimension: 'B6',
        weight: 0,
        findings: raw.attempts.map((attempt) => ({
          ruleId: `ci-heal/${attempt.outcome.replaceAll('_', '-')}`,
          severity: 'info',
          message: `RECORDED attempt ${attempt.attempt}: exitCode=${attempt.exitCode}; matchedFailurePattern="${attempt.matchedFailurePattern}"; actionTaken="${attempt.actionTaken}"; outcome="${attempt.outcome}".`,
          location: `${raw.workflow}/heal-log.json#attempt-${attempt.attempt}`,
        })),
      },
    ],
  };
}

describe('Evidence Seam v1', () => {
  it('publishes a JSON Schema whose major and required fields match the runtime contract', () => {
    const schema = readJson(INGEST_SCHEMA_PATH) as {
      $id: string;
      required: string[];
      properties: { version: { pattern: string } };
    };

    expect(schema.$id).toBe('https://cejel.dev/schemas/ingest/v1.json');
    expect(schema.required).toEqual(['version', 'tool', 'signals']);
    expect(new RegExp(schema.properties.version.pattern).test(CEJEL_GENERIC_INGEST_CONTRACT_VERSION))
      .toBe(true);
  });

  it('maps the synthetic heal log into the preregistered one-signal fixture before ingest', () => {
    const raw = readJson(RAW_HEAL_LOG_PATH) as SyntheticHealLog;
    const mapped = readJson(MAPPED_HEAL_LOG_PATH) as GenericSignalDocumentV1;

    expect(raw.fixtureNotice).toMatch(/^SYNTHETIC FIXTURE/);
    expect(mapped.signals).toHaveLength(EXPECTED_HEAL_LOG_SIGNAL_COUNT);
    expect(mapped.signals[0]?.findings).toHaveLength(EXPECTED_HEAL_LOG_FINDING_COUNT);
    expect(mapSyntheticHealLog(raw)).toEqual(mapped);
  });

  it('records both heal attempts without changing score or erasing insufficient_data', () => {
    const signals = parseIngestFile(MAPPED_HEAL_LOG_PATH);
    expect(signals).toHaveLength(EXPECTED_HEAL_LOG_SIGNAL_COUNT);
    expect(signals[0]?.findings).toHaveLength(EXPECTED_HEAL_LOG_FINDING_COUNT);
    expect(signals[0]?.weight).toBe(0);

    const report = createWitanReport(REPO_INPUT, signals);
    expect(report.criteria.find((criterion) => criterion.id === 'B6')?.status).toBe(
      'insufficient_data',
    );
    expect(report.consumedSignals).toEqual([
      {
        source: 'synthetic-ci-heal-log',
        provenance: 'operator_supplied',
        dimension: 'B6',
        findingCount: 2,
        severityBreakdown: { critical: 0, warning: 0, info: 2 },
        nativeScore: 0,
        scoreAdjustment: -0,
        adjustedScore: 0,
        findings: signals[0]?.findings,
      },
    ]);
    expect(
      report.consumedSignals?.[0]?.findings.every((finding) =>
        finding.message.startsWith('RECORDED attempt '),
      ),
    ).toBe(true);

    const certificate = renderWitanHtmlReport(report);
    expect(certificate).toContain('External findings');
    expect(certificate.match(/RECORDED attempt/g)).toHaveLength(EXPECTED_HEAL_LOG_FINDING_COUNT);
  });

  it('keeps the existing no-ingest fixture report byte-identical to its pre-change baseline', () => {
    const bytes = serializeWitanReport(createWitanReport(REPO_INPUT));

    expect(Buffer.byteLength(bytes)).toBe(EXPECTED_NO_INGEST_REPORT_BYTES);
    expect(createHash('sha256').update(bytes, 'utf8').digest('hex')).toBe(
      EXPECTED_NO_INGEST_REPORT_SHA256,
    );
    expect(JSON.parse(bytes)).not.toHaveProperty('consumedSignals');
  });

  it('states the heal-log claim boundary verbatim', () => {
    const docs = readFileSync(join(DOCS_DIR, 'heal-log-mapping.md'), 'utf8');
    expect(docs).toContain(
      'The certificate records what was healed; it does not validate the healing.',
    );
  });
});
