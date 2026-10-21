/**
 * src/analyzers/cliContracts/detectors/bannedParserDetector.ts
 *
 * cli-contracts-banned-parser-library: Detects imports or requires of unauthorized
 * third-party CLI parsers (`minimist`, `yargs`, `commander`, `cac`, `mri`, `clipanion`)
 * or raw `node:util` `parseArgs` usage outside the canonical Citty harness.
 */

import ts from 'typescript';

import {
  BANNED_CLI_PACKAGES,
  getStaticStringValue,
  UTIL_MODULE_SPECIFIERS,
  unwrapCliExpression
} from '../cliContractHeuristics.ts';
import type { CliContractDetector } from '../cliContractTypes.ts';

const BANNED_PARSER_MESSAGE =
  "Unauthorized CLI parser library or manual 'node:util.parseArgs' usage detected. Every CLI command must be declared exclusively via 'citty' ('defineCommand' / 'runMain') or the canonical 'cittyHarness.ts'.";

function isBannedPackageSpecifier(specifier: string | undefined): boolean {
  if (!specifier) return false;
  return BANNED_CLI_PACKAGES.has(specifier);
}

function isUtilParseArgsImport(node: ts.ImportDeclaration): ts.Node | null {
  const spec = getStaticStringValue(node.moduleSpecifier);
  if (!spec || !UTIL_MODULE_SPECIFIERS.has(spec)) return null;
  const bindings = node.importClause?.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) {
    for (const el of bindings.elements) {
      if ((el.propertyName ?? el.name).text === 'parseArgs') {
        return el;
      }
    }
  }
  return null;
}

function isRequireBannedPackageCall(node: ts.CallExpression): boolean {
  const callee = unwrapCliExpression(node.expression);
  if (!ts.isIdentifier(callee) || callee.text !== 'require') return false;
  const spec = getStaticStringValue(node.arguments[0]);
  return isBannedPackageSpecifier(spec);
}

function isUtilParseArgsCall(node: ts.CallExpression): boolean {
  const callee = unwrapCliExpression(node.expression);
  if (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === 'parseArgs' &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'util'
  ) {
    return true;
  }
  return false;
}

export const bannedParserDetector: CliContractDetector = (node, ctx) => {
  if (ctx.isAuthorizedHarness) return null;

  if (ts.isImportDeclaration(node)) {
    const spec = getStaticStringValue(node.moduleSpecifier);
    if (isBannedPackageSpecifier(spec)) {
      return { ruleId: 'cli-contracts-banned-parser-library', node, message: BANNED_PARSER_MESSAGE };
    }
    const parseArgsSpec = isUtilParseArgsImport(node);
    if (parseArgsSpec) {
      return {
        ruleId: 'cli-contracts-banned-parser-library',
        node: parseArgsSpec,
        message: BANNED_PARSER_MESSAGE
      };
    }
  }

  if (ts.isCallExpression(node)) {
    if (isRequireBannedPackageCall(node) || isUtilParseArgsCall(node)) {
      return { ruleId: 'cli-contracts-banned-parser-library', node, message: BANNED_PARSER_MESSAGE };
    }
  }

  return null;
};
