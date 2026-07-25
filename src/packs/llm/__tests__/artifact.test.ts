import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  CejelLlmPackArtifactSchema,
  createCejelLlmPackArtifact,
  createCejelLlmPackAttestation,
  serializeCejelLlmPackArtifact,
  verifyCejelLlmPackAttestationBinding,
} from '../artifact.js';
import { CejelLlmEvidenceSchema, CejelLlmPackResultSchema } from '../types.js';
import { collectCejelLlmPack } from '../detector.js';
import { renderCejelLlmPackHtml, renderCejelLlmPackTerminal } from '../render.js';

const BASE_SHA = 'a'.repeat(64);
const INPUT_SHA = 'c'.repeat(64);

function artifact() {
  const result = collectCejelLlmPack('/tmp', []);
  return createCejelLlmPackArtifact(result, {
    generatedAt: '2026-07-22T17:30:00-07:00',
    repoPath: '/tmp/repository',
    headSha: 'b'.repeat(40),
    baseReportSha256: BASE_SHA,
    inputSourceSha256: INPUT_SHA,
    toolVersion: '0.1.8-test',
  });
}

describe('Free LLM Pack artifact and unsigned attestation', () => {
  it('accepts file-level evidence but rejects absolute and parent-traversing paths', () => {
    expect(CejelLlmEvidenceSchema.parse({ path: 'src/agent.ts', line: null, label: 'file' })).toEqual({
      path: 'src/agent.ts',
      line: null,
      label: 'file',
    });
    expect(() =>
      CejelLlmEvidenceSchema.parse({ path: '/tmp/agent.ts', line: 1, label: 'bad' }),
    ).toThrow();
    expect(() =>
      CejelLlmEvidenceSchema.parse({ path: '../agent.ts', line: 1, label: 'bad' }),
    ).toThrow();
  });

  it('rejects contradictory pack status and top-level findings', () => {
    const result = artifact().result;
    expect(() => CejelLlmPackResultSchema.parse({ ...result, status: 'assessed' })).toThrow();
    expect(() =>
      CejelLlmPackResultSchema.parse({
        ...result,
        findings: [
          {
            ruleId: 'LLM-IOH-001',
            severity: 'critical',
            confidence: 'high',
            summary: 'Contradictory top-level finding.',
            evidence: { path: 'src/agent.ts', line: 1, label: 'mismatch' },
          },
        ],
      }),
    ).toThrow();
  });

  it('keeps low-confidence candidates out of emitted pack artifacts', () => {
    const result = artifact().result;
    const candidate = {
      ruleId: 'LLM-IOH-001' as const,
      severity: 'warning' as const,
      confidence: 'low' as const,
      summary: 'A candidate that requires human review.',
      evidence: { path: 'src/agent.ts', line: 1, label: 'candidate' },
    };
    expect(() =>
      CejelLlmPackResultSchema.parse({
        ...result,
        status: 'assessed_with_limitations',
        findings: [candidate],
        ruleResults: result.ruleResults.map((rule, index) =>
          index === 0
            ? { ...rule, state: 'finding', confidence: 'low', findings: [candidate] }
            : rule,
        ),
      }),
    ).toThrow();
  });

  it('strictly binds the pack result to repository identity and the base report digest', () => {
    const value = artifact();

    expect(CejelLlmPackArtifactSchema.parse(value)).toEqual(value);
    expect(value.baseReportSha256).toBe(BASE_SHA);
    expect(value.inputSourceSha256).toBe(INPUT_SHA);
    expect(value.assurance).toEqual({ status: 'unsigned', issuer: 'self-generated' });
    expect(value.lineage).toMatchObject({
      ruleContractVersion: 'cejel-free-llm-rules-v1.1-2026-07-23',
      detectorVersion: 'free-llm-detector-alpha-2',
      toolVersion: '0.1.8-test',
      detectorSourceRevision: 'local-or-unverified-build:@cejel/cejel@0.1.8-test',
    });
    expect(value.claimBoundary).toContain('not a model hallucination rate');
  });

  it('creates an in-toto statement over the exact serialized llm-report artifact', () => {
    const value = artifact();
    const serialized = serializeCejelLlmPackArtifact(value);
    const statement = createCejelLlmPackAttestation(value, serialized);

    expect(statement.subject[0].digest.sha256).toBe(
      createHash('sha256').update(serialized).digest('hex'),
    );
    expect(statement.predicate.baseReportSha256).toBe(BASE_SHA);
    expect(statement.predicate.assurance.status).toBe('unsigned');
    expect(verifyCejelLlmPackAttestationBinding(statement, value, serialized)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('rejects a binding after exact artifact bytes change', () => {
    const value = artifact();
    const serialized = serializeCejelLlmPackArtifact(value);
    const statement = createCejelLlmPackAttestation(value, serialized);
    const result = verifyCejelLlmPackAttestationBinding(
      statement,
      value,
      serialized.replace('not_applicable', 'assessed_with_limitations'),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('subject digest does not match llm-report.json');
  });

  it('rejects artifact object A paired with valid serialized artifact B', () => {
    const valueA = artifact();
    const valueB = { ...valueA, generatedAt: '2026-07-22T18:30:00-07:00' };
    const serializedB = serializeCejelLlmPackArtifact(valueB);
    const statementB = createCejelLlmPackAttestation(valueB, serializedB);
    const result = verifyCejelLlmPackAttestationBinding(statementB, valueA, serializedB);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'serialized llm-report.json does not represent the supplied artifact',
    );
  });

  it('renders the claim boundary and never converts no findings into a safety claim', () => {
    const value = artifact();
    const html = renderCejelLlmPackHtml(value);
    const terminal = renderCejelLlmPackTerminal(value);

    expect(html).toContain('not a model hallucination rate');
    expect(html).toContain('This is not proof that every control exists.');
    expect(terminal).toContain('not a hallucination rate');
  });
});
