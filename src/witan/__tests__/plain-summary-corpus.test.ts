import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  DOES_NOT_COVER_TEXT,
  bannedWordsOnFirstPage,
  extractFirstPage,
  firstPageReadableText,
  unresolvedFirstPageLinks,
} from '../../__tests__/plain-first-page-helpers.js';
import { buildPlainSummary } from '../../plain-summary.js';
import { buildWitanCliSummary } from '../../summary.js';
import { renderTerminalCertificate } from '../../terminal.js';
import { createWitanAttestation, serializeWitanReport } from '../attestation.js';
import { renderWitanHtmlReport } from '../html.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import type { WitanReport } from '../schemas.js';
import {
  BEHAVIOUR_CORPUS,
  BEHAVIOUR_CORPUS_HEAD_SHAS,
  buildBehaviourFixture,
  fixtureHeadSha,
} from './fixtures/behaviour-corpus.js';

// goal_cejel_four_question_summary_2026-11-02, item D: the plain first page changes no
// report.json or attestation.json byte. Every behaviour-corpus fixture is scored under the default
// rubric (v17) and the opt-in v27; the sha256 of its report.json and attestation.json bytes is
// pinned here. The pins were captured on origin/main 5600f75c8, before any source change of this
// card, by running this file with PLAIN_SUMMARY_BYTE_PINS set to the pin path. The second block
// renders every surface the card adds (certificate.html, the terminal, summary.json's plainSummary)
// between two serialisations and asserts the report did not move, so a renderer that mutated its
// input would fail here too.

const PINS_PATH = new URL('./fixtures/plain-summary-byte-identity-pins.json', import.meta.url);
const GENERATED_AT = '2026-11-02T00:00:00.000Z';
const TOOL_VERSION = '0.0.0-plain-summary-test';
const RUBRICS = [WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27] as const;

interface BytePin {
  readonly reportSha256: string;
  readonly attestationSha256: string;
}

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

function attestationBytes(report: WitanReport): string {
  return JSON.stringify(
    createWitanAttestation(report, { toolVersion: TOOL_VERSION, generatedAt: GENERATED_AT }),
    null,
    2,
  );
}

const reports = new Map<string, WitanReport>();

beforeAll(() => {
  for (const fixture of BEHAVIOUR_CORPUS) {
    const dir = buildBehaviourFixture(fixture);
    expect(fixtureHeadSha(dir), `${fixture.name}: fixture does not reproduce`).toBe(
      BEHAVIOUR_CORPUS_HEAD_SHAS[fixture.name],
    );
    for (const rubricVersion of RUBRICS) {
      reports.set(
        `${rubricVersion}/${fixture.name}`,
        scoreRepoWithPublicCejel({
          repoPath: dir,
          productSlug: fixture.name,
          productDisplayName: fixture.name,
          generatedAt: GENERATED_AT,
          rubricVersion,
          ingestPatterns: [],
          autoDiscoverIngest: false,
        }),
      );
    }
  }
}, 600_000);

describe('report.json and attestation.json are byte-identical to origin/main on every corpus fixture', () => {
  it.runIf(process.env.PLAIN_SUMMARY_BYTE_PINS !== undefined)('writes the pins', () => {
    const pins = Object.fromEntries(
      [...reports].map(([key, report]) => [
        key,
        { reportSha256: sha256(serializeWitanReport(report)), attestationSha256: sha256(attestationBytes(report)) },
      ]),
    );
    writeFileSync(process.env.PLAIN_SUMMARY_BYTE_PINS ?? '', `${JSON.stringify(pins, null, 2)}\n`);
  });

  it.skipIf(process.env.PLAIN_SUMMARY_BYTE_PINS !== undefined)('every fixture matches its pin', () => {
    const pins = JSON.parse(readFileSync(PINS_PATH, 'utf8')) as Record<string, BytePin>;
    expect(Object.keys(pins).sort()).toEqual([...reports.keys()].sort());
    for (const [key, report] of reports) {
      expect(sha256(serializeWitanReport(report)), `${key} report.json`).toBe(pins[key]?.reportSha256);
      expect(sha256(attestationBytes(report)), `${key} attestation.json`).toBe(pins[key]?.attestationSha256);
    }
  });

  it('rendering the plain summary on every surface leaves the report bytes unchanged', () => {
    for (const [key, report] of reports) {
      const before = serializeWitanReport(report);
      buildPlainSummary(report);
      renderWitanHtmlReport(report, { cliVersion: TOOL_VERSION, generatedAt: GENERATED_AT });
      renderTerminalCertificate(buildWitanCliSummary(report), report);
      expect(serializeWitanReport(report), key).toBe(before);
    }
  });
});

describe('the first page on every corpus fixture', () => {
  it('uses none of the banned words, states what it does not cover, and every link resolves', () => {
    for (const [key, report] of reports) {
      const html = renderWitanHtmlReport(report, { cliVersion: TOOL_VERSION, generatedAt: GENERATED_AT });
      expect(bannedWordsOnFirstPage(html), key).toEqual([]);
      expect(firstPageReadableText(extractFirstPage(html)), key).toContain(DOES_NOT_COVER_TEXT);
      expect(unresolvedFirstPageLinks(html), key).toEqual([]);
    }
  });

  it('every Wrong and Not known item has one Check next line', () => {
    for (const [key, report] of reports) {
      const plain = buildPlainSummary(report);
      expect(plain.checkNext.map((check) => check.for), key).toEqual(
        [...plain.wrong, ...plain.notKnown].map((item) => item.id),
      );
    }
  });
});
