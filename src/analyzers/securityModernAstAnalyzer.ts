/**
 * src/analyzers/securityModernAstAnalyzer.ts
 *
 * AST-DRIVEN WEB & CI/CD SECURITY HARDENING ANALYZER (Node.js 26+ Native)
 *
 * Evaluates TypeScript/JavaScript/Vue <script> code via TypeScript Compiler AST
 * (`SharedAstContext` / `AuditedDocument`), HTML files via JSDOM (`includeNodeLocations`),
 * and GitHub Actions workflows via `yaml` AST (`parseDocument`), providing
 * deterministic auto-fixes via MagicString.
 */

import ts from 'typescript';
import { parseDocument, isMap, isSeq, isScalar, YAMLMap } from 'yaml';
import MagicString from 'magic-string';
import {
  type JsdomElementLocation,
  computeRawLineOffsets,
  getLineFromRawOffsets,
  getRawSpanFromAstNode,
  parseDomWithLocations,
  runScriptAstMagicStringPass
} from './modernDomAstUtils.ts';

export { computeRawLineOffsets, getRawSpanFromAstNode } from './modernDomAstUtils.ts';

export const MODERN_SECURITY_RULES = [
  'security-postmessage-origin-validation',
  'security-trusted-types-passthrough',
  'security-external-sri-missing',
  'security-cookie-samesite-partitioned',
  'ci-github-actions-script-injection'
] as const;

export type ModernSecurityRuleId = (typeof MODERN_SECURITY_RULES)[number];

export interface ModernSecurityFinding {
  readonly ruleId: ModernSecurityRuleId;
  readonly line: number;
  readonly message: string;
  readonly fixable: boolean;
}

export interface ModernSecurityAnalysisResult {
  readonly findings: readonly ModernSecurityFinding[];
  readonly fixedContent?: string;
}

const WINDOW_OR_GLOBAL_IDENTIFIERS: ReadonlySet<string> = new Set([
  // runtime-set: Fast O(1) membership lookup set
  'window',
  'self',
  'globalThis'
]);

function isWindowOrGlobalTarget(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr)) {
    return WINDOW_OR_GLOBAL_IDENTIFIERS.has(expr.text);
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return (
      expr.name.text === 'window' ||
      expr.name.text === 'parent' ||
      expr.name.text === 'top' ||
      expr.name.text === 'contentWindow'
    );
  }
  return false;
}

function inspectMessageListenerCallback(
  callback: ts.FunctionLikeDeclarationBase,
  sf: ts.SourceFile
): { accessesData: boolean; hasSafeOriginCheck: boolean } {
  const firstParam = callback.parameters[0];
  if (!firstParam || !callback.body) {
    return { accessesData: false, hasSafeOriginCheck: true };
  }

  let paramName: string | null = null;
  let destructuresData = false;
  let destructuresOrigin = false;

  if (ts.isIdentifier(firstParam.name)) {
    paramName = firstParam.name.text;
  } else if (ts.isObjectBindingPattern(firstParam.name)) {
    for (const el of firstParam.name.elements) {
      const propName =
        el.propertyName && ts.isIdentifier(el.propertyName)
          ? el.propertyName.text
          : ts.isIdentifier(el.name)
            ? el.name.text
            : '';
      if (propName === 'data') destructuresData = true;
      if (propName === 'origin') destructuresOrigin = true;
    }
  }

  let accessesData = destructuresData;
  let referencesOrigin = destructuresOrigin;
  let hasWeakSubstringOriginCheck = false;

  const visitBody = (node: ts.Node): void => {
    if (
      paramName &&
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === paramName
    ) {
      if (node.name.text === 'data') accessesData = true;
      if (node.name.text === 'origin') referencesOrigin = true;
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === 'includes' ||
        node.expression.name.text === 'startsWith' ||
        node.expression.name.text === 'endsWith')
    ) {
      const targetText = node.expression.expression.getText(sf);
      if (
        (paramName && targetText === `${paramName}.origin`) ||
        (destructuresOrigin && targetText === 'origin')
      ) {
        hasWeakSubstringOriginCheck = true;
      }
    }

    ts.forEachChild(node, visitBody);
  };

  visitBody(callback.body);
  return {
    accessesData,
    hasSafeOriginCheck: referencesOrigin && !hasWeakSubstringOriginCheck
  };
}

function isWindowMessageListenerTarget(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr)) {
    return expr.text === 'window' || expr.text === 'globalThis';
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return expr.name.text === 'window';
  }
  return false;
}

function checkPostMessageAstNode(
  node: ts.Node,
  sf: ts.SourceFile,
  rawLineOffsets: readonly number[],
  ms: MagicString | null,
  findings: ModernSecurityFinding[]
): boolean {
  if (!ts.isCallExpression(node)) return false;

  // 1. Check postMessage(payload, '*')
  const isPostMessageCall =
    (ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'postMessage' &&
      isWindowOrGlobalTarget(node.expression.expression)) ||
    (ts.isIdentifier(node.expression) && node.expression.text === 'postMessage');

  if (isPostMessageCall && node.arguments.length >= 2) {
    const targetOriginArg = node.arguments[1]!;
    if (ts.isStringLiteralLike(targetOriginArg) && targetOriginArg.text === '*') {
      const span = getRawSpanFromAstNode(targetOriginArg, sf, rawLineOffsets);
      findings.push({
        ruleId: 'security-postmessage-origin-validation',
        line: span.line,
        message:
          "postMessage called with wildcard targetOrigin '*'; specify an exact origin or window.location.origin.",
        fixable: true
      });
      if (ms) {
        ms.overwrite(span.start, span.end, 'window.location.origin');
        return true;
      }
      return false;
    }
  }

  // 2. Check window.addEventListener('message', handler) — exclude Dedicated Web Workers (self.addEventListener / *.worker.ts)
  const isWorkerFile = /\.worker\.[cm]?[jt]s$/i.test(sf.fileName);
  const isWindowAddListener =
    !isWorkerFile &&
    ((ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'addEventListener' &&
      isWindowMessageListenerTarget(node.expression.expression)) ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'addEventListener'));

  if (isWindowAddListener && node.arguments.length >= 2) {
    const eventArg = node.arguments[0]!;
    const handlerArg = node.arguments[1]!;
    if (
      ts.isStringLiteralLike(eventArg) &&
      eventArg.text === 'message' &&
      (ts.isArrowFunction(handlerArg) || ts.isFunctionExpression(handlerArg))
    ) {
      const { accessesData, hasSafeOriginCheck } = inspectMessageListenerCallback(handlerArg, sf);
      if (accessesData && !hasSafeOriginCheck) {
        const span = getRawSpanFromAstNode(node, sf, rawLineOffsets);
        findings.push({
          ruleId: 'security-postmessage-origin-validation',
          line: span.line,
          message:
            "Message event listener reads event.data without strict exact event.origin validation (never use includes/startsWith/endsWith).",
          fixable: false
        });
      }
    }
  }

  return false;
}

function isIdentityPassthroughFunction(fn: ts.FunctionLikeDeclarationBase, sf: ts.SourceFile): boolean {
  const firstParam = fn.parameters[0];
  if (!firstParam || !ts.isIdentifier(firstParam.name) || !fn.body) return false;
  const paramName = firstParam.name.text;

  if (ts.isIdentifier(fn.body)) {
    return fn.body.text === paramName;
  }
  if (ts.isParenthesizedExpression(fn.body) && ts.isIdentifier(fn.body.expression)) {
    return fn.body.expression.text === paramName;
  }
  if (ts.isBlock(fn.body) && fn.body.statements.length === 1) {
    const stmt = fn.body.statements[0]!;
    if (ts.isReturnStatement(stmt) && stmt.expression) {
      return stmt.expression.getText(sf).trim() === paramName;
    }
  }
  return false;
}

function checkTrustedTypesPassthroughAstNode(
  node: ts.Node,
  sf: ts.SourceFile,
  rawLineOffsets: readonly number[],
  findings: ModernSecurityFinding[]
): void {
  if (!ts.isCallExpression(node)) return;
  if (
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.name.text !== 'createPolicy'
  ) {
    return;
  }
  const receiverText = node.expression.expression.getText(sf);
  if (!receiverText.endsWith('trustedTypes')) return;

  const rulesArg = node.arguments[1];
  if (!rulesArg || !ts.isObjectLiteralExpression(rulesArg)) return;

  for (const prop of rulesArg.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const name = prop.name.text;
      if (name !== 'createHTML' && name !== 'createScript' && name !== 'createScriptURL') continue;
      if (
        (ts.isArrowFunction(prop.initializer) || ts.isFunctionExpression(prop.initializer)) &&
        isIdentityPassthroughFunction(prop.initializer, sf)
      ) {
        const span = getRawSpanFromAstNode(prop, sf, rawLineOffsets);
        findings.push({
          ruleId: 'security-trusted-types-passthrough',
          line: span.line,
          message: `Trusted Types policy '${name}' is an unsanitized identity pass-through function, neutralizing DOM XSS defenses.`,
          fixable: false
        });
      }
    } else if (ts.isMethodDeclaration(prop) && ts.isIdentifier(prop.name)) {
      const name = prop.name.text;
      if (name !== 'createHTML' && name !== 'createScript' && name !== 'createScriptURL') continue;
      if (isIdentityPassthroughFunction(prop, sf)) {
        const span = getRawSpanFromAstNode(prop, sf, rawLineOffsets);
        findings.push({
          ruleId: 'security-trusted-types-passthrough',
          line: span.line,
          message: `Trusted Types policy '${name}' is an unsanitized identity pass-through method, neutralizing DOM XSS defenses.`,
          fixable: false
        });
      }
    }
  }
}

function getPropertyKeyName(nameNode: ts.PropertyName): string {
  if (ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode)) {
    return nameNode.text;
  }
  return '';
}

function checkCookieSameSiteAstNode(
  node: ts.Node,
  sf: ts.SourceFile,
  rawLineOffsets: readonly number[],
  ms: MagicString | null,
  findings: ModernSecurityFinding[]
): boolean {
  if (!ts.isObjectLiteralExpression(node)) return false;

  let sameSiteProp: ts.PropertyAssignment | null = null;
  let secureProp: ts.PropertyAssignment | null = null;

  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = getPropertyKeyName(prop.name).toLowerCase();
    if (key === 'samesite') {
      if (
        ts.isStringLiteralLike(prop.initializer) &&
        prop.initializer.text.toLowerCase() === 'none'
      ) {
        sameSiteProp = prop;
      }
    } else if (key === 'secure') {
      secureProp = prop;
    }
  }

  if (!sameSiteProp) return false;

  const isSecureTrue =
    secureProp !== null && secureProp.initializer.kind === ts.SyntaxKind.TrueKeyword;
  if (isSecureTrue) return false;

  const isSecureFalse =
    secureProp !== null && secureProp.initializer.kind === ts.SyntaxKind.FalseKeyword;
  const isFixable = secureProp === null || isSecureFalse;

  const span = getRawSpanFromAstNode(sameSiteProp, sf, rawLineOffsets);
  findings.push({
    ruleId: 'security-cookie-samesite-partitioned',
    line: span.line,
    message:
      "Cookie configuration sets sameSite: 'none' without secure: true. Browsers reject SameSite=None cookies over insecure contexts.",
    fixable: isFixable
  });

  if (ms && isFixable) {
    if (secureProp && isSecureFalse) {
      const valSpan = getRawSpanFromAstNode(secureProp.initializer, sf, rawLineOffsets);
      ms.overwrite(valSpan.start, valSpan.end, 'true');
    } else {
      ms.appendLeft(span.end, ', secure: true');
    }
    return true;
  }

  return false;
}

export function analyzeModernSecurityScriptAst(
  rawContent: string,
  sf: ts.SourceFile,
  enableFix: boolean
): ModernSecurityAnalysisResult {
  return runScriptAstMagicStringPass<ModernSecurityFinding>(
    rawContent,
    sf,
    enableFix,
    (node, rawLineOffsets, ms, findings) => {
      const m1 = checkPostMessageAstNode(node, sf, rawLineOffsets, ms, findings);
      checkTrustedTypesPassthroughAstNode(node, sf, rawLineOffsets, findings);
      const m2 = checkCookieSameSiteAstNode(node, sf, rawLineOffsets, ms, findings);
      return m1 || m2;
    }
  );
}

export function analyzeExternalSriHtml(
  htmlContent: string,
  enableFix: boolean
): ModernSecurityAnalysisResult {
  const dom = parseDomWithLocations(htmlContent);
  const doc = dom.window.document;
  const ms = enableFix ? new MagicString(htmlContent) : null;
  const findings: ModernSecurityFinding[] = [];
  let mutated = false;

  const candidates = doc.querySelectorAll('script[src], link[rel="stylesheet"][href]');
  for (const el of candidates) {
    const tagLower = el.tagName.toLowerCase();
    const url = (el.getAttribute('src') ?? el.getAttribute('href') ?? '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    // Dynamic font stylesheet generators cannot use static SRI hashes
    if (/fonts\.googleapis\.com|use\.typekit\.net/i.test(url)) continue;

    const hasIntegrity = (el.getAttribute('integrity')?.trim().length ?? 0) > 0;
    const hasCrossorigin = el.hasAttribute('crossorigin');
    if (hasIntegrity && hasCrossorigin) continue;

    const loc = dom.nodeLocation(el) as JsdomElementLocation | null;
    const startTag = loc?.startTag;
    const line = startTag?.startLine ?? loc?.startLine ?? 1;

    findings.push({
      ruleId: 'security-external-sri-missing',
      line,
      message: !hasIntegrity
        ? `External CDN <${tagLower}> (${url}) lacks Subresource Integrity (integrity="sha384-...") and crossorigin="anonymous".`
        : `External CDN <${tagLower}> (${url}) with integrity attribute is missing crossorigin="anonymous".`,
      fixable: hasIntegrity && !hasCrossorigin && Boolean(startTag)
    });

    if (ms && hasIntegrity && !hasCrossorigin && startTag) {
      ms.appendLeft(startTag.startOffset + tagLower.length + 1, ' crossorigin="anonymous"');
      mutated = true;
    }
  }

  return {
    findings,
    fixedContent: mutated && ms ? ms.toString() : undefined
  };
}

const UNSAFE_GH_INTERPOLATION_REGEX = /\$\{\{\s*((?:inputs|github\.event)\.[a-zA-Z0-9_.-]+)\s*\}\}/g;

function exprToEnvVarName(expr: string): string {
  return (
    'GH_' +
    expr
      .replace(/^(?:github\.event\.|inputs\.)/, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase()
  );
}

function inspectAndRepairStepNode(
  stepItem: YAMLMap,
  lineOffsets: readonly number[],
  enableFix: boolean,
  findings: ModernSecurityFinding[]
): boolean {
  const runNode = stepItem.get('run', true);
  if (!isScalar(runNode) || typeof runNode.value !== 'string') return false;

  const runScript = runNode.value;
  UNSAFE_GH_INTERPOLATION_REGEX.lastIndex = 0;
  const matches = [...runScript.matchAll(UNSAFE_GH_INTERPOLATION_REGEX)];
  if (matches.length === 0) return false;

  const offset = runNode.range?.[0] ?? 0;
  const line = getLineFromRawOffsets(lineOffsets, offset);

  findings.push({
    ruleId: 'ci-github-actions-script-injection',
    line,
    message: `GitHub Actions 'run' block interpolates untrusted context (\${{ ${matches[0]![1]} }}) directly into shell script. Bind via step 'env:' instead.`,
    fixable: true
  });

  if (!enableFix) return false;

  const existingEnv = stepItem.get('env', true);
  let envMap: YAMLMap;
  if (isMap(existingEnv)) {
    envMap = existingEnv;
  } else {
    envMap = new YAMLMap();
    stepItem.set('env', envMap);
  }

  let updatedRun = runScript;
  for (const m of matches) {
    const fullExpr = m[0];
    const innerPath = m[1]!;
    const envKey = exprToEnvVarName(innerPath);
    envMap.set(envKey, `\${{ ${innerPath} }}`);
    updatedRun = updatedRun.replaceAll(fullExpr, `"$${envKey}"`);
  }
  runNode.value = updatedRun;
  return true;
}

export function analyzeGithubActionsWorkflowYaml(
  yamlContent: string,
  enableFix: boolean
): ModernSecurityAnalysisResult {
  const lineOffsets = computeRawLineOffsets(yamlContent);
  const findings: ModernSecurityFinding[] = [];
  let doc;
  try {
    doc = parseDocument(yamlContent);
  } catch {
    return { findings };
  }

  const root = doc.contents;
  if (!isMap(root)) return { findings };

  const jobsNode = root.get('jobs', true);
  if (!isMap(jobsNode)) return { findings };

  let mutated = false;

  for (const jobPair of jobsNode.items) {
    if (!isMap(jobPair.value)) continue;
    const stepsNode = jobPair.value.get('steps', true);
    if (!isSeq(stepsNode)) continue;

    for (const stepItem of stepsNode.items) {
      if (!isMap(stepItem)) continue;
      if (inspectAndRepairStepNode(stepItem, lineOffsets, enableFix, findings)) {
        mutated = true;
      }
    }
  }

  return {
    findings,
    fixedContent: mutated ? doc.toString() : undefined
  };
}
