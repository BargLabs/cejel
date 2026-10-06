import type { RuleTierDeclaration } from '../analysis-tier.js';

/** ADR-0016 analysis tier per D-series rule, classified by what each matcher does. */
export const D_SERIES_RULE_TIERS = {
  D1: {
    tier: 'semantic',
    sourceFile: 'src/packs/d-series/declared-but-unread-config.ts',
    evidence:
      'resolvedSymbol() follows import aliases with checker.getAliasedSymbol across the first-party module graph to find read sites of a declared key',
  },
  D2: {
    tier: 'structural',
    sourceFile: 'src/packs/d-series/swallowed-error.ts',
    evidence:
      'walks the TypeScript AST for catch clauses; bindingIsUnused() compares checker symbols for the catch binding inside its own block',
  },
  D3: {
    tier: 'structural',
    sourceFile: 'src/packs/d-series/unasserted-set-transform.ts',
    evidence:
      "walks each file's TypeScript AST for a direct-parameter .filter call, an empty ledger and a literal-success return; no symbol resolution",
  },
  D4: {
    tier: 'semantic',
    sourceFile: 'src/packs/d-series/empty-failure-conflation.ts',
    evidence:
      "calleeContract() resolves a call to its declaration in another first-party file via checker.getAliasedSymbol and reads that callee's return states",
  },
  D5: {
    tier: 'semantic',
    sourceFile: 'src/packs/d-series/self-referential-verification.ts',
    evidence:
      'importedBinding() resolves test imports to their declaring source files with checker.getAliasedSymbol and compares the module under test across files',
  },
  D6: {
    tier: 'lexical',
    sourceFile: 'src/packs/d-series/unobserved-control.ts',
    evidence:
      'exitStatusAnalysis() regex-matches single shell lines plus the next line, with a whole-file presence test for set -e; no parse, no name resolution, no flow',
  },
} as const satisfies Readonly<Record<'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6', RuleTierDeclaration>>;
