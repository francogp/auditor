/**
 * src/analyzers/cliContracts/detectors/unregisteredScriptDetector.ts
 *
 * cli-contracts-unregistered-script: Ensures `CORE_PACKAGE_SCRIPT_REQUIREMENTS` in
 * `packageScriptRegistry.ts` registers all mandatory `:human` mode scripts promised
 * by the framework documentation (`auditor:human`, `auditor:lint:human`,
 * `auditor:full:human`, `auditor:fix:human`, `auditor:findings:human`).
 */

import ts from 'typescript';

import { getStaticStringValue, unwrapCliExpression } from '../cliContractHeuristics.ts';
import type { CliContractDetector } from '../cliContractTypes.ts';

const MANDATORY_HUMAN_PACKAGE_SCRIPTS: readonly string[] = [
  'auditor:human',
  'auditor:lint:human',
  'auditor:full:human',
  'auditor:fix:human',
  'auditor:findings:human'
] as const;

function collectRegisteredScriptNames(arrayExpr: ts.ArrayLiteralExpression): Set<string> {
  const names = new Set<string>();
  for (const el of arrayExpr.elements) {
    const unwrapped = unwrapCliExpression(el);
    if (!ts.isObjectLiteralExpression(unwrapped)) continue;
    for (const prop of unwrapped.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === 'name'
      ) {
        const val = getStaticStringValue(unwrapCliExpression(prop.initializer));
        if (val) names.add(val);
      }
    }
  }
  return names;
}

export const unregisteredScriptDetector: CliContractDetector = (node) => {
  if (!ts.isVariableDeclaration(node)) return null;
  if (!ts.isIdentifier(node.name) || node.name.text !== 'CORE_PACKAGE_SCRIPT_REQUIREMENTS') {
    return null;
  }
  if (!node.initializer) return null;
  const init = unwrapCliExpression(node.initializer);
  if (!ts.isArrayLiteralExpression(init)) return null;

  const registered = collectRegisteredScriptNames(init);
  const missing = MANDATORY_HUMAN_PACKAGE_SCRIPTS.filter((s) => !registered.has(s));
  if (missing.length === 0) return null;

  return {
    ruleId: 'cli-contracts-unregistered-script',
    node: node.name,
    message: `CORE_PACKAGE_SCRIPT_REQUIREMENTS is missing mandatory ':human' package scripts: ${missing.join(', ')}. Register all ':human' scripts so 'auditor fix' injects them into consumer host projects.`
  };
};
