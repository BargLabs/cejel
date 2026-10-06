import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createTypeScriptModuleGraph,
  isFirstPartyModuleGraphSource,
  toModuleGraphRepoPath,
} from '../../typescript-module-graph.js';
import { ANALYSIS_TIERS, type AnalysisTier } from '../analysis-tier.js';
import { CEJEL_LLM_ACTION_RULES } from '../llm/action-rules.js';
import { CEJEL_LLM_EVALUATION_RULES } from '../llm/evaluation-rules.js';
import { CEJEL_LLM_PYTHON_RULES } from '../llm/python-rules.js';
import { CEJEL_LLM_V1_RULES } from '../llm/rules.js';
import { CEJEL_LLM_RULE_IDS } from '../llm/types.js';
import { D_SERIES_RULE_TIERS } from '../d-series/tiers.js';
import { DECISION_CONTRACT_RULE_TIERS } from '../decision-contracts/tiers.js';

// ADR-0016 (accepted 2026-10-06): every shipped pack rule declares the analysis tier its matcher
// actually implements. The tier is read from the matcher, not from the rule's policy. These tests
// bind the declarations to the rule catalogue, to what each rule's source imports, and to the
// scan path the rule is reachable from.

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const DEFAULT_SCAN_ENTRYPOINTS = ['src/index.ts', 'src/scan.ts', 'src/witan/public-scan.ts'];

interface DeclaredRule {
  readonly pack: 'llm' | 'd-series' | 'decision-contracts';
  readonly id: string;
  readonly tier: AnalysisTier;
  /** Repo-relative source files whose matcher the declaration is about. */
  readonly sourceFiles: readonly string[];
}

const LLM_DEFINITIONS: readonly {
  readonly id: string;
  readonly tier: AnalysisTier;
  readonly sourceFile: string;
}[] = [
  ...CEJEL_LLM_V1_RULES.map((rule) => ({ ...rule, sourceFile: 'src/packs/llm/rules.ts' })),
  ...CEJEL_LLM_PYTHON_RULES.map((rule) => ({ ...rule, sourceFile: 'src/packs/llm/python-rules.ts' })),
  ...CEJEL_LLM_ACTION_RULES.map((rule) => ({ ...rule, sourceFile: 'src/packs/llm/action-rules.ts' })),
  ...CEJEL_LLM_EVALUATION_RULES.map((rule) => ({
    ...rule,
    sourceFile: 'src/packs/llm/evaluation-rules.ts',
  })),
];

function llmDeclared(): readonly DeclaredRule[] {
  return CEJEL_LLM_RULE_IDS.map((id) => {
    const definitions = LLM_DEFINITIONS.filter((definition) => definition.id === id);
    return {
      pack: 'llm' as const,
      id,
      // A rule id shipped by several definitions must declare one tier; the first is reported
      // here and the single-tier test below fails if they disagree.
      tier: definitions[0]?.tier as AnalysisTier,
      sourceFiles: definitions.map((definition) => definition.sourceFile),
    };
  });
}

function mapDeclared(
  pack: 'd-series' | 'decision-contracts',
  tiers: Readonly<Record<string, { readonly tier: AnalysisTier; readonly sourceFile: string }>>,
): readonly DeclaredRule[] {
  return Object.entries(tiers).map(([id, entry]) => ({
    pack,
    id,
    tier: entry.tier,
    sourceFiles: [entry.sourceFile],
  }));
}

const D_SERIES_IDS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
const DECISION_CONTRACT_IDS = ['DECISION-CONTRACT-EDGE'];

const ALL_DECLARED: readonly DeclaredRule[] = [
  ...llmDeclared(),
  ...mapDeclared('d-series', D_SERIES_RULE_TIERS),
  ...mapDeclared('decision-contracts', DECISION_CONTRACT_RULE_TIERS),
];

function importsAParser(repoPath: string): boolean {
  const source = readFileSync(resolve(REPO_ROOT, repoPath), 'utf8');
  return /^\s*import\s+(?:[^'"]*\s+from\s+)?['"](?:typescript|@babel\/[^'"]+|acorn[^'"]*|esprima|espree|tree-sitter[^'"]*|@typescript-eslint\/[^'"]+)['"]/m.test(
    source,
  );
}

describe('every shipped pack rule declares an analysis tier (ADR-0016)', () => {
  it('declares exactly one valid tier for every rule id each pack exports, with no orphan', () => {
    const expectedIds = [
      ...CEJEL_LLM_RULE_IDS.map((id) => `llm:${id}`),
      ...D_SERIES_IDS.map((id) => `d-series:${id}`),
      ...DECISION_CONTRACT_IDS.map((id) => `decision-contracts:${id}`),
    ].sort();

    const declaredIds = [
      ...LLM_DEFINITIONS.map((definition) => `llm:${definition.id}`),
      ...Object.keys(D_SERIES_RULE_TIERS).map((id) => `d-series:${id}`),
      ...Object.keys(DECISION_CONTRACT_RULE_TIERS).map((id) => `decision-contracts:${id}`),
    ];
    // Every rule id is declared at least once, and nothing is declared for an id that is not a
    // real rule (orphan). An LLM rule id may legitimately be defined once per language.
    expect([...new Set(declaredIds)].sort()).toEqual(expectedIds);

    for (const declared of ALL_DECLARED) {
      expect(ANALYSIS_TIERS, `${declared.pack}:${declared.id}`).toContain(declared.tier);
    }
  });

  it('declares one tier per LLM rule id across its per-language definitions', () => {
    for (const id of CEJEL_LLM_RULE_IDS) {
      const tiers = new Set(
        LLM_DEFINITIONS.filter((definition) => definition.id === id).map(
          (definition) => definition.tier,
        ),
      );
      expect([...tiers], id).toHaveLength(1);
    }
  });

  it('never declares lexical for a rule whose source imports a parser', () => {
    const offenders = ALL_DECLARED.filter(
      (declared) =>
        declared.tier === 'lexical' &&
        declared.sourceFiles.some((sourceFile) => importsAParser(sourceFile)),
    ).map((declared) => `${declared.pack}:${declared.id}`);
    expect(offenders).toEqual([]);
  });

  it('declares every default-scan rule lexical', () => {
    const { program } = createTypeScriptModuleGraph(REPO_ROOT, DEFAULT_SCAN_ENTRYPOINTS);
    const reachable = program
      .getSourceFiles()
      .filter((sourceFile) => isFirstPartyModuleGraphSource(REPO_ROOT, sourceFile))
      .map((sourceFile) => toModuleGraphRepoPath(REPO_ROOT, sourceFile.fileName));

    // Positive control: the walk must actually reach the default-scan entry points, so an empty or
    // broken graph cannot make the lexical assertion below pass vacuously.
    for (const entry of DEFAULT_SCAN_ENTRYPOINTS) {
      expect(reachable, entry).toContain(entry);
    }

    const defaultScanRules = ALL_DECLARED.filter((declared) =>
      reachable.some((repoPath) => repoPath.startsWith(`src/packs/${declared.pack}/`)),
    );
    const offenders = defaultScanRules
      .filter((declared) => declared.tier !== 'lexical')
      .map((declared) => `${declared.pack}:${declared.id}=${declared.tier}`);
    expect(offenders).toEqual([]);
  });

  // Operator ruling 2026-10-06 (ADR-0016 acceptance amendment): "lexical only" governs new rules
  // and anything wired into the default scan. The rules that already shipped keep their honest
  // tiers, and the semantic ones are frozen at this list. Adding a semantic rule, or changing any
  // rule's tier to or from semantic, fails here until the operator rules and this list is edited
  // in a reviewed change.
  it('declares semantic only for the rules frozen by the 2026-10-06 ruling', () => {
    const SEMANTIC_AS_SHIPPED_2026_10_06 = [
      'd-series:D1',
      'd-series:D4',
      'd-series:D5',
      'decision-contracts:DECISION-CONTRACT-EDGE',
      'llm:LLM-AGY-001',
      'llm:LLM-EVL-001',
      'llm:LLM-IOH-001',
      'llm:LLM-PRV-001',
      'llm:LLM-VAL-001',
    ];
    const semantic = ALL_DECLARED.filter((declared) => declared.tier === 'semantic')
      .map((declared) => `${declared.pack}:${declared.id}`)
      .sort();
    expect(semantic).toEqual(SEMANTIC_AS_SHIPPED_2026_10_06);
  });
});
