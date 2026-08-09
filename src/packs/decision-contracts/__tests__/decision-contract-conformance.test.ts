import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DECISION_CONTRACT_MANIFEST_PATH,
  evaluateDecisionContracts,
  scanDecisionContracts,
} from '../decision-contract-conformance.js';

function repository(source: string): string {
  const root = mkdtempSync(resolve(tmpdir(), 'cejel-decision-contract-'));
  mkdirSync(resolve(root, 'src'), { recursive: true });
  writeFileSync(resolve(root, 'src', 'release.mjs'), source);
  return root;
}

function manifest(requiredPremise = 'approval.status'): unknown {
  return {
    schemaVersion: 'cejel-decision-contracts-v1',
    contracts: [
      {
        id: 'release-approval',
        source: 'src/release.mjs',
        function: 'observe',
        decisionProperty: 'released',
        requiredPremises: [requiredPremise],
      },
    ],
  };
}

describe('decision-contract conformance', () => {
  it('cites a declared premise that does not bind the named decision', () => {
    const root = repository(`export function observe() {
  const approval = { status: 'pending', signed: false };
  const released = true;
  return { approval, released };
}`);

    expect(evaluateDecisionContracts(root, manifest())).toEqual(
      expect.objectContaining({
        findings: [
          expect.objectContaining({
            ruleId: 'DECISION-CONTRACT-EDGE',
            contractId: 'release-approval',
            missingPremise: 'approval.status',
            evidence: expect.objectContaining({ path: 'src/release.mjs' }),
          }),
        ],
        abstentions: [],
      }),
    );
  });

  it('keeps the paired repair clean when the premise binds the decision', () => {
    const root = repository(`export function observe() {
  const approval = { status: ['pen', 'ding'].join(''), signed: false };
  const released = approval.status === 'approved';
  return { approval, released };
}`);

    expect(evaluateDecisionContracts(root, manifest())).toEqual(
      expect.objectContaining({ findings: [], abstentions: [] }),
    );
  });

  it('follows direct immutable local dependencies', () => {
    const root = repository(`export function observe() {
  const findings = ['missing approval'];
  const findingCount = findings.length;
  const blocked = findingCount > 0;
  const released = !blocked;
  return { findingCount, released };
}`);

    expect(evaluateDecisionContracts(root, manifest('findings'))).toEqual(
      expect.objectContaining({ findings: [], abstentions: [] }),
    );
  });

  it('abstains on calls instead of guessing through opaque semantics', () => {
    const root = repository(`export function observe() {
  const approval = { status: 'pending' };
  const released = decide(approval.status);
  return { approval, released };
}`);

    expect(evaluateDecisionContracts(root, manifest())).toEqual(
      expect.objectContaining({
        findings: [],
        abstentions: [{ contractId: 'release-approval', reason: 'unsupported_decision_expression' }],
      }),
    );
  });

  it('abstains when the manifest names a premise the function does not declare', () => {
    const root = repository(`export function observe() {
  const released = false;
  return { released };
}`);

    expect(evaluateDecisionContracts(root, manifest())).toEqual(
      expect.objectContaining({
        findings: [],
        abstentions: [
          {
            contractId: 'release-approval',
            reason: 'required_premise_not_declared:approval.status',
          },
        ],
      }),
    );
  });

  it('is inert unless the fixed manifest path exists', () => {
    const root = repository(`export function observe() {
  const released = false;
  return { released };
}`);
    expect(scanDecisionContracts(root)).toEqual({
      configured: false,
      manifestPath: DECISION_CONTRACT_MANIFEST_PATH,
      findings: [],
      abstentions: [],
    });
  });

  it('reads the fixed manifest without auto-discovering another path', () => {
    const root = repository(`export function observe() {
  const approval = { status: 'pending' };
  const released = true;
  return { approval, released };
}`);
    mkdirSync(resolve(root, '.cejel'), { recursive: true });
    writeFileSync(
      resolve(root, DECISION_CONTRACT_MANIFEST_PATH),
      `${JSON.stringify(manifest(), null, 2)}\n`,
    );
    expect(scanDecisionContracts(root).findings).toHaveLength(1);
  });
});
