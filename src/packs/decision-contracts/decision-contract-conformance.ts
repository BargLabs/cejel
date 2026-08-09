import { existsSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import ts from 'typescript';
import { z } from 'zod';

import { readRepoText } from '../../witan/content-reads.js';

export const DECISION_CONTRACT_MANIFEST_PATH = '.cejel/decision-contracts.json';

const referenceSchema = z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/);

export const decisionContractSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    source: z.string().min(1),
    function: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
    decisionProperty: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
    requiredPremises: z.array(referenceSchema).min(1),
  })
  .strict()
  .superRefine((contract, context) => {
    if (contract.requiredPremises.includes(contract.decisionProperty)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `decision_property_cannot_be_its_own_premise:${contract.decisionProperty}`,
        path: ['requiredPremises'],
      });
    }
  });

export const decisionContractManifestSchema = z
  .object({
    schemaVersion: z.literal('cejel-decision-contracts-v1'),
    contracts: z.array(decisionContractSchema).min(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    const ids = new Set<string>();
    for (const [index, contract] of manifest.contracts.entries()) {
      if (ids.has(contract.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate_contract_id:${contract.id}`,
          path: ['contracts', index, 'id'],
        });
      }
      ids.add(contract.id);
      if (new Set(contract.requiredPremises).size !== contract.requiredPremises.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate_required_premise:${contract.id}`,
          path: ['contracts', index, 'requiredPremises'],
        });
      }
    }
  });

export type DecisionContract = z.infer<typeof decisionContractSchema>;
export type DecisionContractManifest = z.infer<typeof decisionContractManifestSchema>;

export interface DecisionContractFinding {
  readonly ruleId: 'DECISION-CONTRACT-EDGE';
  readonly contractId: string;
  readonly function: string;
  readonly decisionProperty: string;
  readonly missingPremise: string;
  readonly severity: 'warning';
  readonly confidence: 'high';
  readonly summary: string;
  readonly evidence: {
    readonly path: string;
    readonly line: number;
    readonly label: string;
  };
}

export interface DecisionContractAbstention {
  readonly contractId: string;
  readonly reason: string;
}

export interface DecisionContractResult {
  readonly configured: boolean;
  readonly manifestPath: string;
  readonly findings: readonly DecisionContractFinding[];
  readonly abstentions: readonly DecisionContractAbstention[];
}

function repoPath(repoRoot: string, candidate: string): string | null {
  const root = resolve(repoRoot);
  const absolute = resolve(root, candidate);
  const path = relative(root, absolute).split(sep).join('/');
  return path !== '' && path !== '..' && !path.startsWith('../') ? path : null;
}

function literalPropertyName(name: ts.PropertyName): string | null {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)
    ? name.text
    : null;
}

function propertyReference(node: ts.PropertyAccessExpression | ts.ElementAccessExpression): string | null {
  const segments: string[] = [];
  let current: ts.Expression = node;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    if (ts.isPropertyAccessExpression(current)) {
      segments.unshift(current.name.text);
      current = current.expression;
      continue;
    }
    const argument = current.argumentExpression;
    if (!argument || !ts.isStringLiteralLike(argument)) return null;
    segments.unshift(argument.text);
    current = current.expression;
  }
  if (!ts.isIdentifier(current)) return null;
  segments.unshift(current.text);
  return segments.join('.');
}

interface DirectFunctionShape {
  readonly sourceFile: ts.SourceFile;
  readonly declaration: ts.FunctionDeclaration;
  readonly bindings: ReadonlyMap<string, ts.Expression>;
  readonly declaredPremises: ReadonlySet<string>;
  readonly decision: ts.Expression;
}

function directFunctionShape(
  sourceFile: ts.SourceFile,
  contract: DecisionContract,
): DirectFunctionShape | string {
  const matches = sourceFile.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === contract.function,
  );
  const declaration = matches[0];
  if (matches.length !== 1 || !declaration?.body) return 'function_not_uniquely_resolved';
  const body = declaration.body;
  const bindings = new Map<string, ts.Expression>();
  const declaredPremises = new Set<string>();
  const returns: ts.ReturnStatement[] = [];

  for (const statement of body.statements) {
    if (ts.isVariableStatement(statement)) {
      if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
        return 'mutable_local_binding';
      }
      for (const variable of statement.declarationList.declarations) {
        if (!ts.isIdentifier(variable.name) || !variable.initializer) {
          return 'unsupported_local_binding';
        }
        if (bindings.has(variable.name.text)) return 'duplicate_local_binding';
        bindings.set(variable.name.text, variable.initializer);
        declaredPremises.add(variable.name.text);
        if (ts.isObjectLiteralExpression(variable.initializer)) {
          const propertyNames = new Set<string>();
          for (const property of variable.initializer.properties) {
            if (!ts.isPropertyAssignment(property)) return 'unsupported_object_binding';
            const name = literalPropertyName(property.name);
            if (name === null || propertyNames.has(name)) return 'unsupported_object_binding';
            propertyNames.add(name);
            declaredPremises.add(`${variable.name.text}.${name}`);
          }
        }
      }
      continue;
    }
    if (ts.isReturnStatement(statement)) {
      returns.push(statement);
      continue;
    }
    if (ts.isEmptyStatement(statement)) continue;
    return 'unsupported_function_statement';
  }

  if (returns.length !== 1 || !returns[0]?.expression || !ts.isObjectLiteralExpression(returns[0].expression)) {
    return 'single_direct_object_return_required';
  }
  const matchingProperties = returns[0].expression.properties.filter((property) => {
    if (!property.name) return false;
    return literalPropertyName(property.name) === contract.decisionProperty;
  });
  if (matchingProperties.length !== 1) return 'decision_property_not_uniquely_returned';
  const property = matchingProperties[0];
  if (!property) return 'decision_property_not_uniquely_returned';
  const decision = ts.isShorthandPropertyAssignment(property)
    ? property.name
    : ts.isPropertyAssignment(property)
      ? property.initializer
      : null;
  if (!decision) return 'unsupported_decision_property';
  return { sourceFile, declaration, bindings, declaredPremises, decision };
}

interface DependencyState {
  readonly references: Set<string>;
  unsupported: boolean;
}

function collectExpressionReferences(expression: ts.Expression, state: DependencyState): void {
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isAwaitExpression(node)) {
      state.unsupported = true;
      return;
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const reference = propertyReference(node);
      if (reference === null) {
        state.unsupported = true;
      } else {
        state.references.add(reference);
      }
      return;
    }
    if (ts.isIdentifier(node)) {
      state.references.add(node.text);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
}

function transitiveDecisionReferences(
  shape: DirectFunctionShape,
  requiredPremises: readonly string[],
): DependencyState {
  const state: DependencyState = { references: new Set<string>(), unsupported: false };
  const expanded = new Set<string>();
  const expand = (expression: ts.Expression): void => {
    const local: DependencyState = { references: new Set<string>(), unsupported: false };
    collectExpressionReferences(expression, local);
    state.unsupported ||= local.unsupported;
    for (const reference of local.references) {
      state.references.add(reference);
      const [base, ...propertySegments] = reference.split('.');
      if (
        base &&
        propertySegments.length > 0 &&
        shape.bindings.has(base) &&
        !requiredPremises.some((premise) => premise === base || premise.startsWith(`${base}.`))
      ) {
        state.unsupported = true;
      }
      const initializer = shape.bindings.get(reference);
      if (
        initializer &&
        !requiredPremises.includes(reference) &&
        !expanded.has(reference)
      ) {
        expanded.add(reference);
        expand(initializer);
      }
    }
  };
  expand(shape.decision);
  return state;
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function evaluateContract(
  repoRoot: string,
  contract: DecisionContract,
): { findings: DecisionContractFinding[]; abstention?: DecisionContractAbstention } {
  const source = repoPath(repoRoot, contract.source);
  if (!source) {
    return { findings: [], abstention: { contractId: contract.id, reason: 'source_outside_repo' } };
  }
  const absolute = resolve(repoRoot, source);
  if (!existsSync(absolute)) {
    return { findings: [], abstention: { contractId: contract.id, reason: 'source_missing' } };
  }
  const sourceFile = ts.createSourceFile(
    source,
    readRepoText(absolute),
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX,
  );
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  if ((parseDiagnostics?.length ?? 0) > 0) {
    return { findings: [], abstention: { contractId: contract.id, reason: 'source_parse_error' } };
  }
  const shape = directFunctionShape(sourceFile, contract);
  if (typeof shape === 'string') {
    return { findings: [], abstention: { contractId: contract.id, reason: shape } };
  }
  const undeclared = contract.requiredPremises.filter(
    (premise) => !shape.declaredPremises.has(premise),
  );
  if (undeclared.length > 0) {
    return {
      findings: [],
      abstention: {
        contractId: contract.id,
        reason: `required_premise_not_declared:${undeclared.join(',')}`,
      },
    };
  }
  const dependencies = transitiveDecisionReferences(shape, contract.requiredPremises);
  if (dependencies.unsupported) {
    return {
      findings: [],
      abstention: { contractId: contract.id, reason: 'unsupported_decision_expression' },
    };
  }
  const ambiguousWholeObject = contract.requiredPremises.find((premise) => {
    const separator = premise.indexOf('.');
    return separator > 0 && dependencies.references.has(premise.slice(0, separator));
  });
  if (ambiguousWholeObject) {
    return {
      findings: [],
      abstention: {
        contractId: contract.id,
        reason: `whole_premise_object_dependency:${ambiguousWholeObject}`,
      },
    };
  }
  const missing = contract.requiredPremises.filter(
    (premise) =>
      ![...dependencies.references].some(
        (reference) => reference === premise || reference.startsWith(`${premise}.`),
      ),
  );
  return {
    findings: missing.map((premise) => ({
      ruleId: 'DECISION-CONTRACT-EDGE',
      contractId: contract.id,
      function: contract.function,
      decisionProperty: contract.decisionProperty,
      missingPremise: premise,
      severity: 'warning',
      confidence: 'high',
      summary: `Decision contract ${JSON.stringify(contract.id)} requires ${JSON.stringify(premise)} to bind returned decision ${JSON.stringify(contract.decisionProperty)}, but no supported local dependency edge was found.`,
      evidence: {
        path: source,
        line: lineOf(shape.sourceFile, shape.decision),
        label: `Unbound decision premise ${premise}`,
      },
    })),
  };
}

export function evaluateDecisionContracts(
  repoRoot: string,
  manifestInput: unknown,
  manifestPath = DECISION_CONTRACT_MANIFEST_PATH,
): DecisionContractResult {
  const manifest = decisionContractManifestSchema.parse(manifestInput);
  const findings: DecisionContractFinding[] = [];
  const abstentions: DecisionContractAbstention[] = [];
  for (const contract of manifest.contracts) {
    const result = evaluateContract(repoRoot, contract);
    findings.push(...result.findings);
    if (result.abstention) abstentions.push(result.abstention);
  }
  return {
    configured: true,
    manifestPath,
    findings: findings.sort(
      (left, right) =>
        left.evidence.path.localeCompare(right.evidence.path) ||
        left.evidence.line - right.evidence.line ||
        left.contractId.localeCompare(right.contractId) ||
        left.missingPremise.localeCompare(right.missingPremise),
    ),
    abstentions: abstentions.sort((left, right) => left.contractId.localeCompare(right.contractId)),
  };
}

export function scanDecisionContracts(repoRoot: string): DecisionContractResult {
  const manifest = resolve(repoRoot, DECISION_CONTRACT_MANIFEST_PATH);
  if (!existsSync(manifest)) {
    return {
      configured: false,
      manifestPath: DECISION_CONTRACT_MANIFEST_PATH,
      findings: [],
      abstentions: [],
    };
  }
  return evaluateDecisionContracts(
    repoRoot,
    JSON.parse(readRepoText(manifest)) as unknown,
    DECISION_CONTRACT_MANIFEST_PATH,
  );
}
