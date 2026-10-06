/**
 * Analysis tier a pack rule's matcher actually implements (ADR-0016). Declared per rule, read from
 * the matcher rather than from policy; there is deliberately no default.
 *
 * - `lexical`: line and token patterns. No cross-line state beyond a fixed window, no name
 *   resolution, no control-flow graph.
 * - `structural`: parses the file; reasons about blocks, functions and call sites within it.
 * - `semantic`: resolves names across files, follows data or control flow, reasons about
 *   reachability.
 */
export const ANALYSIS_TIERS = ['lexical', 'structural', 'semantic'] as const;

export type AnalysisTier = (typeof ANALYSIS_TIERS)[number];

export interface RuleTierDeclaration {
  readonly tier: AnalysisTier;
  /** Repo-relative file holding the matcher the tier describes. */
  readonly sourceFile: string;
  /** One line: the function and what it does. */
  readonly evidence: string;
}
