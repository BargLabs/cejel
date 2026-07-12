import type { WitanCriterionCategory, WitanCriterionId } from './schemas.js';

export interface WitanRubricCriterion {
  id: WitanCriterionId;
  title: string;
  category: WitanCriterionCategory;
}

export const WITAN_RUBRIC: readonly WitanRubricCriterion[] = [
  {
    id: 'A1',
    title: 'Test integrity and regression signal',
    category: 'code_trust',
  },
  {
    id: 'A2',
    title: 'Data-layer isolation and secrets posture',
    category: 'code_trust',
  },
  {
    id: 'A3',
    title: 'Production readiness',
    category: 'code_trust',
  },
  {
    id: 'A4',
    title: 'Dependency hygiene',
    category: 'code_trust',
  },
  {
    id: 'A5',
    title: 'Claim-vs-reality reconciliation',
    category: 'code_trust',
  },
  {
    id: 'B1',
    title: 'Dispatch trace completeness',
    category: 'process_trust',
  },
  {
    id: 'B2',
    title: 'PR outcome traceability',
    category: 'process_trust',
  },
  {
    id: 'B3',
    title: 'CI and QA discipline',
    category: 'process_trust',
  },
  {
    id: 'B4',
    title: 'Audit trail and report-up completeness',
    category: 'process_trust',
  },
  {
    id: 'B5',
    title: 'Verified learning trace',
    category: 'process_trust',
  },
  {
    id: 'B6',
    title: 'Privileged-operation human gating',
    category: 'process_trust',
  },
];

export function getWitanRubricCriterion(id: WitanCriterionId): WitanRubricCriterion {
  const criterion = WITAN_RUBRIC.find((candidate) => candidate.id === id);
  if (!criterion) {
    throw new Error(`Unknown Witan criterion: ${id}`);
  }
  return criterion;
}

// witan-trading-rubric-v0 — certifies trading-product trust signals.
// Criterion ids are locked (see WITAN_TRADING_RUBRIC_V0_CRITERION_IDS in ./schemas.ts);
// renaming an id here requires a new rubric version.
export const WITAN_TRADING_RUBRIC_V0: readonly WitanRubricCriterion[] = [
  {
    id: 'validation-integrity',
    title: 'Backtest and validation process integrity',
    category: 'validation_trust',
  },
  {
    id: 'calibration',
    title: 'Model and strategy calibration accuracy',
    category: 'validation_trust',
  },
  {
    id: 'promotion-governance',
    title: 'Strategy promotion governance',
    category: 'governance_trust',
  },
  {
    id: 'risk-governance',
    title: 'Risk limits and oversight governance',
    category: 'governance_trust',
  },
  {
    id: 'execution-integrity',
    title: 'Live execution integrity',
    category: 'execution_trust',
  },
  {
    id: 'real-outcome-evidence',
    title: 'Real trading outcome evidence',
    category: 'execution_trust',
  },
  {
    id: 'data-confidence',
    title: 'Market data feed confidence',
    category: 'validation_trust',
  },
  {
    id: 'audit-completeness',
    title: 'Audit trail completeness',
    category: 'governance_trust',
  },
  {
    id: 'claim-reality',
    title: 'Claim-vs-reality reconciliation',
    category: 'governance_trust',
  },
];

// Domain-profile rubric slices live with their rule packs in their own extraction-excluded
// modules, not here: this file ships in the public cejel tree and must carry only the
// general rubrics above.
