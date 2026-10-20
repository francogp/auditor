/**
 * src/analyzers/nativePaths/nativePathScanner.ts
 *
 * Single-pass TypeScript AST scanner for validate_native_paths.
 * Reuses AuditedDocument.getAst() (SharedAstContext / Vue <script> alignment),
 * runs a per-file pre-pass for path-origin variables and URL validation,
 * then dispatches every node to all detectors with escape-hatch and (rule, node) dedupe.
 */

import ts from 'typescript';

import type { AuditedDocument } from '../../core/auditedDocument.ts';
import {
  NODE_ONLY_RULES,
  type NativePathDetector,
  type NativePathFinding,
  type NativePathScanContext,
  type NativePathViolation
} from './nativePathTypes.ts';
import { getNodePathFunction, isFsSinkCall, isPathOriginChain, isUrlConstruction } from './pathHeuristics.ts';
import { concatDetector } from './detectors/concatDetector.ts';
import { normalizeDetector } from './detectors/normalizeDetector.ts';
import { parsingDetector } from './detectors/parsingDetector.ts';
import { containmentDetector } from './detectors/containmentDetector.ts';
import { fileUrlDetector } from './detectors/fileUrlDetector.ts';
import { urlParsingDetector } from './detectors/urlParsingDetector.ts';
import { slashDetector } from './detectors/slashDetector.ts';
import { envArgvDetector } from './detectors/envArgvDetector.ts';
import { fetchDetector } from './detectors/fetchDetector.ts';

const DETECTORS: readonly NativePathDetector[] = [
  normalizeDetector,
  concatDetector,
  parsingDetector,
  containmentDetector,
  fileUrlDetector,
  urlParsingDetector,
  slashDetector,
  envArgvDetector,
  fetchDetector
];

const ESCAPE_TOKENS: ReadonlySet<string> = new Set([
  'path',
  'url',
  'env',
  'cross-platform',
  'security',
  'string',
  'no-domain',
  'test'
]); // runtime-set: O(1) escape hatch token lookup

const URL_VALIDATION_PROPERTIES: ReadonlySet<string> = new Set(['hostname', 'origin', 'protocol']); // runtime-set: O(1) lookup
const NODE_BUILTIN_MODULES: ReadonlySet<string> = new Set([
  'fs',
  'fs/promises',
  'path',
  'os',
  'url',
  'child_process',
  'module',
  'process',
  'stream',
  'worker_threads',
  'crypto',
  'util'
]); // runtime-set: O(1) builtin specifier lookup
const NODE_PROCESS_MEMBERS: ReadonlySet<string> = new Set(['cwd', 'argv']); // runtime-set: O(1) lookup
const FALLOW_NEXT_LINE_DIRECTIVE = 'fallow-ignore-next-line';

interface FileFacts {
  readonly pathOriginNames: Set<string>;
  readonly hasUrlValidation: boolean;
  readonly isNodeContext: boolean;
}

function isNodeBuiltinSpecifier(node: ts.Node | undefined): boolean {
  if (!node || !ts.isStringLiteral(node)) return false;
  return node.text.startsWith('node:') || NODE_BUILTIN_MODULES.has(node.text);
}

function isNodeContextMarker(node: ts.Node): boolean {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return isNodeBuiltinSpecifier(node.moduleSpecifier);
  }
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    const isRequire = ts.isIdentifier(callee) && callee.text === 'require';
    const isDynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword;
    if ((isRequire || isDynamicImport) && isNodeBuiltinSpecifier(node.arguments[0])) return true;
    return getNodePathFunction(callee) !== undefined || isFsSinkCall(node);
  }
  if (ts.isPropertyAccessExpression(node)) {
    const owner = node.expression;
    const isProcessMember = ts.isIdentifier(owner) && owner.text === 'process' && NODE_PROCESS_MEMBERS.has(node.name.text);
    const isImportMetaPath =
      ts.isMetaProperty(owner) && (node.name.text === 'dirname' || node.name.text === 'filename');
    return isProcessMember || isImportMetaPath;
  }
  return ts.isIdentifier(node) && (node.text === '__dirname' || node.text === '__filename');
}

function collectFileFacts(sourceFile: ts.SourceFile): FileFacts {
  const pathOriginNames = new Set<string>();
  let hasUrlConstruction = false;
  let hasUrlPropertyCheck = false;
  let isNodeContext = false;
  const visit = (node: ts.Node): void => {
    if (!isNodeContext && isNodeContextMarker(node)) isNodeContext = true;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (isPathOriginChain(node.initializer)) pathOriginNames.add(node.name.text);
    } else if (isUrlConstruction(node)) {
      hasUrlConstruction = true;
    } else if (ts.isPropertyAccessExpression(node) && URL_VALIDATION_PROPERTIES.has(node.name.text)) {
      hasUrlPropertyCheck = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { pathOriginNames, hasUrlValidation: hasUrlConstruction && hasUrlPropertyCheck, isNodeContext };
}

function buildEscapedLines(doc: AuditedDocument): Set<number> {
  const lines = new Set<number>();
  for (const hatch of doc.getEscapeHatches()) {
    if (ESCAPE_TOKENS.has(hatch.ruleToken)) lines.add(hatch.line);
  }
  doc.lines.forEach((text, index) => {
    if (text.includes(FALLOW_NEXT_LINE_DIRECTIVE)) lines.add(index + 1);
  });
  return lines;
}

function toViolation(doc: AuditedDocument, sourceFile: ts.SourceFile, finding: NativePathFinding): NativePathViolation {
  const pos = sourceFile.getLineAndCharacterOfPosition(finding.node.getStart(sourceFile));
  const line = pos.line + 1;
  return {
    file: doc.relPath,
    line,
    column: pos.character + 1,
    ruleId: finding.ruleId,
    message: finding.message,
    context: (doc.lines[line - 1] ?? '').trim(),
    severity: 'error'
  };
}

/**
 * Scans a document AST and returns every native path violation (deduplicated per rule and node).
 */
export function scanNativePathAst(doc: AuditedDocument): NativePathViolation[] {
  const sourceFile = doc.getAst();
  if (!sourceFile) return [];

  const facts = collectFileFacts(sourceFile);
  const ctx: NativePathScanContext = {
    sourceFile,
    pathOriginNames: facts.pathOriginNames,
    hasUrlValidation: facts.hasUrlValidation,
    isNodeContext: facts.isNodeContext,
    claimed: new Set<ts.Node>()
  };
  const escapedLines = buildEscapedLines(doc);
  const seen = new Set<string>();
  const violations: NativePathViolation[] = [];

  const visit = (node: ts.Node): void => {
    for (const detect of DETECTORS) {
      const finding = detect(node, ctx);
      if (!finding || (!ctx.isNodeContext && NODE_ONLY_RULES.has(finding.ruleId))) continue;
      const key = `${finding.ruleId}:${finding.node.pos}:${finding.node.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const violation = toViolation(doc, sourceFile, finding);
      if (escapedLines.has(violation.line) || escapedLines.has(violation.line - 1)) continue;
      violations.push(violation);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}
