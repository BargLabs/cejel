import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const AUDIT_PATH = new URL(
  '../docs/experiments/criterion-path-emission-audit-2026-07-31.json',
  import.meta.url,
);
const REPORT_PATH = new URL(
  '../docs/experiments/criterion-path-emission-audit-2026-07-31.md',
  import.meta.url,
);
const RUBRIC_PATH = new URL('../src/witan/rubric.ts', import.meta.url);
const SIGNALS_PATH = new URL('../src/witan/repo-signals.ts', import.meta.url);
const SCHEMAS_PATH = new URL('../src/witan/schemas.ts', import.meta.url);
const SCORING_PATH = new URL('../src/witan/scoring.ts', import.meta.url);
const ATTESTATION_PATH = new URL('../src/witan/attestation.ts', import.meta.url);
const MARKDOWN_PATH = new URL('../src/witan/markdown.ts', import.meta.url);
const HTML_PATH = new URL('../src/witan/html.ts', import.meta.url);

const EXPECTED_CRITERIA = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6'];
const EXPECTED_PATH_CAPABLE = ['A1', 'A2', 'A3', 'A4', 'A5', 'B2', 'B3', 'B4', 'B6'];
const EXPECTED_NOT_PATH_CAPABLE = ['B1', 'B5'];

function readText(path) {
  return readFileSync(path, 'utf8');
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must remain present in repo-signals.ts`);

  const brace = source.indexOf('{', start);
  assert.notEqual(brace, -1, `${name} must have a function body`);

  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(brace + 1, index);
    }
  }
  assert.fail(`${name} must have a balanced function body`);
}

test('the path-emission audit covers every native criterion and matches executable emitters', () => {
  const audit = JSON.parse(readText(AUDIT_PATH));
  const report = readText(REPORT_PATH);
  const rubric = readText(RUBRIC_PATH);
  const signals = readText(SIGNALS_PATH);

  assert.equal(audit.schemaVersion, 'cejel-criterion-path-emission-audit-v1');
  assert.deepEqual(
    audit.criteria.map(({ id }) => id),
    EXPECTED_CRITERIA,
    'the audit must contain exactly one ordered row for every native criterion',
  );
  assert.deepEqual(
    audit.criteria.filter(({ canEmitEvidencePath }) => canEmitEvidencePath).map(({ id }) => id),
    EXPECTED_PATH_CAPABLE,
  );
  assert.deepEqual(
    audit.criteria.filter(({ canEmitEvidencePath }) => !canEmitEvidencePath).map(({ id }) => id),
    EXPECTED_NOT_PATH_CAPABLE,
  );
  assert.equal(audit.summary.pathCapable, 9);
  assert.equal(audit.summary.findingPathCapable, 6);
  assert.equal(audit.summary.totalCriteria, 11);

  for (const id of EXPECTED_CRITERIA) {
    assert.match(rubric, new RegExp(`id: '${id}'`), `${id} must remain in WITAN_RUBRIC`);
    assert.match(report, new RegExp(`\\| ${id} \\|`), `${id} must have one human-readable row`);
  }

  for (const row of audit.criteria.filter(({ canEmitEvidencePath }) => canEmitEvidencePath)) {
    assert.equal(typeof row.collector, 'string');
    const body = functionBody(signals, row.collector);
    assert.match(
      body,
      /evidenceForRelative(?:AtLine)?\(/,
      `${row.id} must have an executable native evidence.path constructor`,
    );
    assert.equal(
      row.positiveEvidencePath || row.findingEvidencePath,
      true,
      `${row.id} must name at least one path-emitting channel`,
    );
  }

  for (const row of audit.criteria.filter(({ canEmitEvidencePath }) => !canEmitEvidencePath)) {
    assert.equal(row.collector, 'buildNotApplicableSignal');
    assert.equal(row.positiveEvidencePath, false);
    assert.equal(row.findingEvidencePath, false);
    assert.match(
      signals,
      new RegExp(`buildNotApplicableSignal\\(\\s*'${row.id}'`),
      `${row.id} must remain an explicit repository-scan N/A`,
    );
  }

  assert.deepEqual(
    audit.criteria.filter(({ observedInPc01 }) => observedInPc01).map(({ id }) => id),
    ['A2'],
    'PC-01 observed A2 only; capability must not be reported as observation',
  );
  assert.equal(audit.positiveControl.controlId, 'PC-01');
  assert.equal(audit.positiveControl.criterionId, 'A2');
  assert.equal(audit.positiveControl.evidencePath, 'src/subject.mjs');
  assert.equal(audit.positiveControl.entersSeededDenominator, false);
});

test('schema, scoring, JSON serialization, and presentations preserve structured evidence.path', () => {
  const schemas = readText(SCHEMAS_PATH);
  const scoring = readText(SCORING_PATH);
  const attestation = readText(ATTESTATION_PATH);
  const markdown = readText(MARKDOWN_PATH);
  const html = readText(HTML_PATH);

  assert.match(schemas, /path: z\.string\(\)\.min\(1\)\.max\(700\)\.optional\(\)/);
  assert.match(schemas, /evidence: z\.array\(WitanEvidencePointerSchema\)/);
  assert.match(schemas, /findings: z\.array\(WitanFindingSchema\)/);
  assert.match(scoring, /evidence: scored\.evidence/);
  assert.match(scoring, /findings: scored\.findings/);
  assert.match(scoring, /return WitanReportSchema\.parse\(/);
  assert.match(attestation, /return JSON\.stringify\(report, null, 2\)/);
  assert.match(markdown, /evidence\.path/);
  assert.match(html, /evidence\.path/);
});

test('the published scope statement binds every cited denominator to path-capable findings', () => {
  const report = readText(REPORT_PATH);
  assert.match(report, /9 of 11/);
  assert.match(report, /6 of 11/);
  assert.match(report, /finding\.evidence\.path/);
  assert.match(report, /exactly\s+equals the defect-file path/);
  assert.match(report, /A1, A2, A3, A4, A5, and B6/);
  assert.match(report, /B2, B3, and B4/);
  assert.match(report, /B1 and B5/);
  assert.match(report, /must not be described as\s+recall across all 11 criteria/);
});
