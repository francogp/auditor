/**
 * src/analyzers/cliContracts/detectors/dynamicBypassDetector.ts
 *
 * cli-contracts-dynamic-eval-bypass: Detects dynamic code execution (`eval`, `new Function`)
 * or raw file descriptor `0` stdin reads (`fs.readFileSync(0)`) that bypass static CLI contracts.
 */

import ts from 'typescript';

import { unwrapCliExpression } from '../cliContractHeuristics.ts';
import type { CliContractDetector } from '../cliContractTypes.ts';

const DYNAMIC_BYPASS_MESSAGE =
  "Dynamic CLI contract bypass detected ('eval', 'new Function', or raw stdin descriptor read 'fs.readFileSync(0)'). All CLI arguments and inputs must be statically declared via 'citty'.";

function isEvalOrFunctionCall(node: ts.CallExpression): boolean {
  const callee = unwrapCliExpression(node.expression);
  return ts.isIdentifier(callee) && (callee.text === 'eval' || callee.text === 'Function');
}

function isNewFunctionConstruct(node: ts.NewExpression): boolean {
  const callee = unwrapCliExpression(node.expression);
  return ts.isIdentifier(callee) && callee.text === 'Function';
}

function isStdinZeroReadCall(node: ts.CallExpression): boolean {
  const callee = unwrapCliExpression(node.expression);
  const isReadFileSync =
    (ts.isIdentifier(callee) && callee.text === 'readFileSync') ||
    (ts.isPropertyAccessExpression(callee) && callee.name.text === 'readFileSync');
  if (!isReadFileSync) return false;
  const firstArg = node.arguments[0];
  return firstArg !== undefined && ts.isNumericLiteral(firstArg) && firstArg.text === '0';
}

export const dynamicBypassDetector: CliContractDetector = (node, ctx) => {
  if (ctx.isAuthorizedHarness) return null;

  if (ts.isCallExpression(node)) {
    if (isEvalOrFunctionCall(node) || isStdinZeroReadCall(node)) {
      return {
        ruleId: 'cli-contracts-dynamic-eval-bypass',
        node,
        message: DYNAMIC_BYPASS_MESSAGE
      };
    }
  }

  if (ts.isNewExpression(node) && isNewFunctionConstruct(node)) {
    return {
      ruleId: 'cli-contracts-dynamic-eval-bypass',
      node,
      message: DYNAMIC_BYPASS_MESSAGE
    };
  }

  return null;
};
