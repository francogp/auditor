/**
 * src/analyzers/cliContracts/cliContractScanner.ts
 *
 * Single-pass TypeScript AST scanner for validate_cli_contracts.
 * Collects per-file symbol facts (process aliases, shadowing, dynamic imports,
 * Citty contract presence) and dispatches every AST node to the 5 detectors.
 */

import path from 'node:path';
import ts from 'typescript';

import type { AuditedDocument } from '../../core/auditedDocument.ts';
import {
  CANONICAL_CITTY_BUILDERS,
  GLOBAL_HOST_OBJECTS,
  getStaticStringValue,
  PROCESS_MODULE_SPECIFIERS,
  unwrapCliExpression
} from './cliContractHeuristics.ts';
import {
  type CliContractDetector,
  type CliContractFinding,
  type CliContractScanContext,
  type CliContractViolation
} from './cliContractTypes.ts';
import { argvAccessDetector } from './detectors/argvAccessDetector.ts';
import { bannedParserDetector } from './detectors/bannedParserDetector.ts';
import { cittyContractDetector } from './detectors/cittyContractDetector.ts';
import { dynamicBypassDetector } from './detectors/dynamicBypassDetector.ts';
import { homebrewFlagDetector } from './detectors/homebrewFlagDetector.ts';
import { unregisteredScriptDetector } from './detectors/unregisteredScriptDetector.ts';

const CLI_CONTRACT_DETECTORS: readonly CliContractDetector[] = [
  argvAccessDetector,
  bannedParserDetector,
  homebrewFlagDetector,
  dynamicBypassDetector,
  cittyContractDetector,
  unregisteredScriptDetector
];

const CLI_CONTRACT_ESCAPE_TOKENS: ReadonlySet<string> = new Set([
  'cli',
  'cli-contracts',
  'argv',
  'env',
  'test'
]); // runtime-set: O(1) escape hatch token lookup

const AUTHORIZED_HARNESS_PATHS: ReadonlySet<string> = new Set([
  'src/core/cli/cittyHarness.ts',
  'src/cli/cliUtils.ts'
]); // runtime-set: O(1) authorized harness path lookup

interface CliFileFacts {
  readonly isCliEntrypoint: boolean;
  readonly hasCittyContract: boolean;
  readonly processAliases: Set<string>;
  readonly argvKeyConstants: Set<string>;
  readonly shadowedProcessScopes: Set<ts.Node>;
  readonly dynamicProcessParamNodes: Set<ts.Node>;
}

function findEnclosingScope(node: ts.Node): ts.Node {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isBlock(current) ||
      ts.isSourceFile(current) ||
      ts.isFunctionLike(current) ||
      ts.isModuleBlock(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return node;
}

function isGlobalProcessInitializer(expr: ts.Expression): boolean {
  const unwrapped = unwrapCliExpression(expr);
  if (ts.isIdentifier(unwrapped) && unwrapped.text === 'process') return true;
  if (ts.isPropertyAccessExpression(unwrapped) && unwrapped.name.text === 'process') {
    const owner = unwrapCliExpression(unwrapped.expression);
    return ts.isIdentifier(owner) && GLOBAL_HOST_OBJECTS.has(owner.text);
  }
  return false;
}

function isDynamicProcessImportThen(node: ts.CallExpression): ts.FunctionLikeDeclaration | null {
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  if (node.expression.name.text !== 'then') return null;

  const receiver = unwrapCliExpression(node.expression.expression);
  if (!ts.isCallExpression(receiver)) return null;
  if (receiver.expression.kind !== ts.SyntaxKind.ImportKeyword) return null;

  const spec = getStaticStringValue(receiver.arguments[0]);
  if (!spec || !PROCESS_MODULE_SPECIFIERS.has(spec)) return null;

  const callback = node.arguments[0];
  if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
    return callback;
  }
  return null;
}

function collectDynamicCallbackParamUsages(
  fn: ts.FunctionLikeDeclaration,
  targetSet: Set<ts.Node>
): void {
  const firstParam = fn.parameters[0];
  if (!firstParam || !ts.isIdentifier(firstParam.name)) return;
  const paramName = firstParam.name.text;

  const collectParamRefs = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && n.text === paramName && n !== firstParam.name) {
      targetSet.add(n);
    }
    ts.forEachChild(n, collectParamRefs);
  };
  collectParamRefs(fn.body ?? fn);
}

function inspectCliImportFact(
  node: ts.ImportDeclaration,
  processAliases: Set<string>
): void {
  const spec = getStaticStringValue(node.moduleSpecifier);
  if (spec && PROCESS_MODULE_SPECIFIERS.has(spec)) {
    const clause = node.importClause;
    if (clause?.name) processAliases.add(clause.name.text);
    if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      processAliases.add(clause.namedBindings.name.text);
    }
  }
}

function inspectCliVariableFact(
  node: ts.VariableDeclaration,
  processAliases: Set<string>,
  argvKeyConstants: Set<string>,
  shadowedProcessScopes: Set<ts.Node>
): void {
  if (!ts.isIdentifier(node.name)) return;
  const varName = node.name.text;
  if (!node.initializer) {
    if (varName === 'process') shadowedProcessScopes.add(findEnclosingScope(node));
    return;
  }
  if (isGlobalProcessInitializer(node.initializer)) {
    processAliases.add(varName);
  } else if (varName === 'process') {
    shadowedProcessScopes.add(findEnclosingScope(node));
  }
  const literalVal = getStaticStringValue(unwrapCliExpression(node.initializer));
  if (literalVal === 'argv') {
    argvKeyConstants.add(varName);
  }
}

function inspectCliCallFact(
  node: ts.CallExpression,
  dynamicProcessParamNodes: Set<ts.Node>
): { isMainCall: boolean; isCittyCall: boolean } {
  const callee = unwrapCliExpression(node.expression);
  let isMainCall = false;
  let isCittyCall = false;
  let builderName: string | null = null;

  if (ts.isIdentifier(callee)) {
    isMainCall = callee.text === 'isMainModule';
    if (CANONICAL_CITTY_BUILDERS.has(callee.text)) {
      builderName = callee.text;
    }
  } else if (ts.isPropertyAccessExpression(callee)) {
    if (CANONICAL_CITTY_BUILDERS.has(callee.name.text)) {
      builderName = callee.name.text;
    }
  }

  if (builderName) {
    if (builderName === 'parseCittyArgs') {
      const firstArg = node.arguments[0] ? unwrapCliExpression(node.arguments[0]) : null;
      isCittyCall = Boolean(
        firstArg && (ts.isObjectLiteralExpression(firstArg) || ts.isIdentifier(firstArg))
      );
    } else {
      isCittyCall = true;
    }
  }

  const dynamicCb = isDynamicProcessImportThen(node);
  if (dynamicCb) {
    collectDynamicCallbackParamUsages(dynamicCb, dynamicProcessParamNodes);
  }
  return { isMainCall, isCittyCall };
}

function collectCliFileFacts(
  sourceFile: ts.SourceFile,
  relPath: string,
  rawText: string
): CliFileFacts {
  const processAliases = new Set<string>();
  const argvKeyConstants = new Set<string>();
  const shadowedProcessScopes = new Set<ts.Node>();
  const dynamicProcessParamNodes = new Set<ts.Node>();
  let hasIsMainModuleCall = rawText.startsWith('#!');
  let hasCittyContract = false;

  const inspectNode = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      inspectCliImportFact(node, processAliases);
    } else if (ts.isVariableDeclaration(node)) {
      inspectCliVariableFact(node, processAliases, argvKeyConstants, shadowedProcessScopes);
    } else if (ts.isCallExpression(node)) {
      const callFlags = inspectCliCallFact(node, dynamicProcessParamNodes);
      if (callFlags.isMainCall) hasIsMainModuleCall = true;
      if (callFlags.isCittyCall) hasCittyContract = true;
    }
    ts.forEachChild(node, inspectNode);
  };

  inspectNode(sourceFile);

  const normalizedRel = relPath.replaceAll(path.win32.sep, path.posix.sep);
  const isCliDir = normalizedRel.startsWith('src/cli/') || normalizedRel.startsWith('cli/');
  return {
    isCliEntrypoint: isCliDir && hasIsMainModuleCall,
    hasCittyContract,
    processAliases,
    argvKeyConstants,
    shadowedProcessScopes,
    dynamicProcessParamNodes
  };
}

function hasCliEscapeOnLine(doc: AuditedDocument, oneBasedLine: number): boolean {
  for (const hatch of doc.getEscapeHatches()) {
    if (
      CLI_CONTRACT_ESCAPE_TOKENS.has(hatch.ruleToken) &&
      (hatch.line === oneBasedLine || hatch.line === oneBasedLine - 1)
    ) {
      return true;
    }
  }
  return false;
}

function formatCliViolation(
  doc: AuditedDocument,
  sourceFile: ts.SourceFile,
  finding: CliContractFinding
): CliContractViolation | null {
  const startOffset = ts.isSourceFile(finding.node) ? 0 : finding.node.getStart(sourceFile);
  const loc = sourceFile.getLineAndCharacterOfPosition(startOffset);
  const lineNumber = loc.line + 1;
  if (hasCliEscapeOnLine(doc, lineNumber)) return null;
  return {
    file: doc.relPath,
    line: lineNumber,
    column: loc.character + 1,
    ruleId: finding.ruleId,
    message: finding.message,
    context: (doc.lines[lineNumber - 1] ?? '').trim(),
    severity: 'error'
  };
}

/**
 * Scans an AuditedDocument AST and returns all CLI contract violations.
 */
export function scanCliContractAst(doc: AuditedDocument): CliContractViolation[] {
  const sourceFile = doc.getAst();
  if (!sourceFile) return [];

  const normalizedRel = doc.relPath.replaceAll(path.win32.sep, path.posix.sep);
  const isAuthorizedHarness = AUTHORIZED_HARNESS_PATHS.has(normalizedRel);
  const facts = collectCliFileFacts(sourceFile, normalizedRel, doc.rawContent);

  const ctx: CliContractScanContext = {
    sourceFile,
    relPath: normalizedRel,
    isCliEntrypoint: facts.isCliEntrypoint,
    isAuthorizedHarness,
    hasCittyContract: facts.hasCittyContract,
    processAliases: facts.processAliases,
    argvKeyConstants: facts.argvKeyConstants,
    shadowedProcessScopes: facts.shadowedProcessScopes,
    dynamicProcessParamNodes: facts.dynamicProcessParamNodes,
    claimed: new Set<ts.Node>()
  };

  const emittedKeys = new Set<string>();
  const cliViolations: CliContractViolation[] = [];

  const traverseCliAst = (node: ts.Node): void => {
    for (const runDetector of CLI_CONTRACT_DETECTORS) {
      const candidate = runDetector(node, ctx);
      if (!candidate) continue;
      const dedupeKey = `${candidate.ruleId}@${candidate.node.pos}-${candidate.node.end}`;
      if (emittedKeys.has(dedupeKey)) continue;
      emittedKeys.add(dedupeKey);
      const formatted = formatCliViolation(doc, sourceFile, candidate);
      if (formatted) cliViolations.push(formatted);
    }
    ts.forEachChild(node, traverseCliAst);
  };

  traverseCliAst(sourceFile);
  return cliViolations;
}
