/**
 * src/analyzers/cliContracts/cliContractHeuristics.ts
 *
 * Pure TypeScript AST predicates shared across CLI contract detectors.
 */

import ts from 'typescript';

import type { CliContractScanContext } from './cliContractTypes.ts';

export const GLOBAL_HOST_OBJECTS: ReadonlySet<string> = new Set([
  'global',
  'globalThis',
  'window',
  'self'
]); // runtime-set: O(1) global host lookup

export const PROCESS_MODULE_SPECIFIERS: ReadonlySet<string> = new Set(['process', 'node:process']); // runtime-set: O(1) process module specifier lookup

export const UTIL_MODULE_SPECIFIERS: ReadonlySet<string> = new Set(['util', 'node:util']); // runtime-set: O(1) util module specifier lookup

export const BANNED_CLI_PACKAGES: ReadonlySet<string> = new Set([
  'minimist',
  'yargs',
  'yargs/helpers',
  'commander',
  'cac',
  'mri',
  'arg',
  'meow',
  'clipanion',
  'sade',
  'caporal'
]); // runtime-set: O(1) banned CLI package lookup

export const CLI_ARG_COLLECTION_NAMES: ReadonlySet<string> = new Set([
  'args',
  'rawArgs',
  'cliArgs',
  'argv',
  'rawCliArgs',
  'posArgs',
  'posList',
  'positionals',
  'nonProjectPositionals'
]); // runtime-set: O(1) argument array identifier lookup

export const CLI_ARG_ITEM_NAMES: ReadonlySet<string> = new Set([
  'arg',
  'a',
  'p',
  'rawArg',
  'token',
  'flag',
  'opt'
]); // runtime-set: O(1) argument item identifier lookup

export const CANONICAL_CITTY_BUILDERS: ReadonlySet<string> = new Set([
  'defineCommand',
  'runMain',
  'runCommand',
  'createRefactorCli',
  'runRefactorCliHarness',
  'createAuditorCli',
  'runAuditorCli',
  'runCliIfMain',
  'parseCittyArgs'
]); // runtime-set: O(1) canonical Citty builder lookup

/**
 * Unwraps parenthesized expressions, type assertions, non-null expressions, and satisfies.
 */
export function unwrapCliExpression(expr: ts.Expression): ts.Expression {
  let current = expr;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/**
 * Checks whether `process` is locally shadowed in an enclosing lexical scope.
 */
function isProcessShadowedAt(node: ts.Node, shadowedScopes: ReadonlySet<ts.Node>): boolean {
  if (shadowedScopes.size === 0) return false;
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (shadowedScopes.has(current)) return true;
    current = current.parent;
  }
  return false;
}

/**
 * Checks whether an expression resolves to the Node.js `process` object (direct, global, or alias).
 */
export function isProcessObjectExpression(
  rawExpr: ts.Expression,
  ctx: CliContractScanContext
): boolean {
  const expr = unwrapCliExpression(rawExpr);

  if (ts.isIdentifier(expr)) {
    if (expr.text === 'process') {
      return !isProcessShadowedAt(expr, ctx.shadowedProcessScopes);
    }
    return ctx.processAliases.has(expr.text) || ctx.dynamicProcessParamNodes.has(expr);
  }

  if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'process') {
    const host = unwrapCliExpression(expr.expression);
    return ts.isIdentifier(host) && GLOBAL_HOST_OBJECTS.has(host.text);
  }

  return false;
}

/**
 * Extracts the string value from a StringLiteral or NoSubstitutionTemplateLiteral.
 */
export function getStaticStringValue(node: ts.Node | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return undefined;
}
