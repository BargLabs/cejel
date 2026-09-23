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
// Re-pinned for report format 1.3 (goal_cejel_withheld_paths_always_disclosed_2026-09-22):
// createWitanReport now always sets an additive `withheldPaths` field (here `[]`, since REPO_INPUT
// carries no signals and no scan ever ran), which adds bytes with no other change to the report.
const EXPECTED_NO_INGEST_REPORT_BYTES = 2_845;
const EXPECTED_NO_INGEST_REPORT_SHA256 =
  '329fb115155e5d341c9a492adcb77d0cdb878b7f102f6e21b1861dc330f55992';
// The pre-1.3 pin above's comment was a claim, not a proof. These are the pre-1.3 bytes and hash
// this fixture carried before that change, recovered from `git show
// v0.4.10:src/witan/__tests__/evidence-seam-v1.test.ts` — the test below deletes `withheldPaths`
// from the current report and re-serializes it the same way (serializeWitanReport) to prove that
// is the only delta.
const EXPECTED_PRE_1_3_REPORT_BYTES = 2_822;
const EXPECTED_PRE_1_3_REPORT_SHA256 =
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
    const report = JSON.parse(bytes) as Record<string, unknown>;
    expect(report).not.toHaveProperty('consumedSignals');

    const { withheldPaths, ...withoutWithheldPaths } = report;
    expect(withheldPaths).toEqual([]);
    const strippedBytes = JSON.stringify(withoutWithheldPaths, null, 2);
    expect(Buffer.byteLength(strippedBytes)).toBe(EXPECTED_PRE_1_3_REPORT_BYTES);
    expect(
      createHash('sha256').update(strippedBytes, 'utf8').digest('hex'),
      'the pre-1.3 report bytes must be recoverable by removing exactly the withheldPaths field',
    ).toBe(EXPECTED_PRE_1_3_REPORT_SHA256);
  });

  it('states the heal-log claim boundary verbatim', () => {
    const docs = readFileSync(join(DOCS_DIR, 'heal-log-mapping.md'), 'utf8');
    expect(docs).toContain(
      'The certificate records what was healed; it does not validate the healing.',
    );
  });
});
