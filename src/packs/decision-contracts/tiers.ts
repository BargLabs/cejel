import type { RuleTierDeclaration } from '../analysis-tier.js';

/** ADR-0016 analysis tier for the decision-contract conformance rule. */
export const DECISION_CONTRACT_RULE_TIERS = {
  'DECISION-CONTRACT-EDGE': {
    tier: 'semantic',
    sourceFile: 'src/packs/decision-contracts/decision-contract-conformance.ts',
    evidence:
      'parses one file with ts.createSourceFile (structural), but transitiveDecisionReferences() expands local initializers to follow which premises the returned decision depends on (data flow, within one function); ambiguous, so the higher tier',
  },
} as const satisfies Readonly<Record<'DECISION-CONTRACT-EDGE', RuleTierDeclaration>>;
