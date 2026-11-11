/**
 * packages/auditor/src/core/auditZLayers.ts
 *
 * Z-Layers resolution helpers, TypeScript parser, and canonical default layer map.
 */

import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { CANONICAL_Z_LAYERS } from '../modals/modalZLayers.ts';
import { getAuditConfig } from './auditConfigLoader.ts';
import { createDomainSet } from './domainCollections.ts';

/**
 * Resolves the primary SCSS file path for Z-Layers from config or stylesRoots.
 */
export function resolveZLayersScssPath(projectRoot: string = process.cwd()): string | undefined {
  const config = getAuditConfig(projectRoot);
  const rawTarget = config.styles?.zLayersScssFile ?? config.styles?.baseScssFile;
  if (rawTarget) {
    const configuredPath = path.resolve(projectRoot, rawTarget);
    if (fs.existsSync(configuredPath)) return configuredPath;
  }

  const stylesRoots = config.paths?.stylesRoots ?? ['src/styles'];
  const baseNames = [
    '_base.scss',
    'core/_base.scss',
    'base.scss',
    'main.scss',
    'index.scss'
  ] as const;
  for (const r of stylesRoots) {
    for (const b of baseNames) {
      const candidate = path.resolve(projectRoot, r, b);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return undefined;
}

/**
 * Canonical fallback Z-Layers scale matching framework standards.
 */
export const Z_LAYERS: Readonly<Record<string, number>> = CANONICAL_Z_LAYERS;

const SPREADABLE_CANONICAL_IDENTIFIERS = createDomainSet([
  'CANONICAL_Z_LAYERS',
  'Z_LAYERS'
] as const);

function unwrapTypeScriptExpression(expr: ts.Expression): ts.Expression {
  let current = expr;
  while (true) {
    if (
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isTypeAssertionExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      ts.isIdentifier(current.expression.expression) &&
      current.expression.expression.text === 'Object' &&
      current.expression.name.text === 'freeze' &&
      current.arguments.length > 0 &&
      current.arguments[0]
    ) {
      current = current.arguments[0];
      continue;
    }
    return current;
  }
}

function extractNumericLiteralValue(expr: ts.Expression): number | null {
  const unwrapped = unwrapTypeScriptExpression(expr);
  if (ts.isNumericLiteral(unwrapped)) {
    const num = Number(unwrapped.text);
    return Number.isFinite(num) ? num : null;
  }
  if (
    ts.isPrefixUnaryExpression(unwrapped) &&
    (unwrapped.operator === ts.SyntaxKind.MinusToken ||
      unwrapped.operator === ts.SyntaxKind.PlusToken) &&
    ts.isNumericLiteral(unwrapped.operand)
  ) {
    const raw = Number(unwrapped.operand.text);
    if (!Number.isFinite(raw)) return null;
    return unwrapped.operator === ts.SyntaxKind.MinusToken ? -raw : raw;
  }
  return null;
}

function applyObjectLiteralZLayers(
  obj: ts.ObjectLiteralExpression,
  target: Record<string, number>
): void {
  for (const prop of obj.properties) {
    if (ts.isSpreadAssignment(prop)) {
      const spreadExpr = unwrapTypeScriptExpression(prop.expression);
      if (ts.isIdentifier(spreadExpr) && SPREADABLE_CANONICAL_IDENTIFIERS.has(spreadExpr.text)) {
        Object.assign(target, CANONICAL_Z_LAYERS);
      }
      continue;
    }
    if (!ts.isPropertyAssignment(prop)) continue;
    const key =
      ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : undefined;
    if (!key) continue;
    const numVal = extractNumericLiteralValue(prop.initializer);
    if (numVal !== null) {
      target[key] = numVal;
    }
  }
}

function resolveCalleeIdentifierName(expr: ts.Expression): string {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return '';
}

function parseResolveModalZLayersCall(callExpr: ts.CallExpression): Record<string, number> | null {
  if (resolveCalleeIdentifierName(callExpr.expression) !== 'resolveModalZLayers') {
    return null;
  }
  const parsed: Record<string, number> = { ...CANONICAL_Z_LAYERS };
  const rawArg = callExpr.arguments[0];
  if (!rawArg) return parsed;
  const firstArg = unwrapTypeScriptExpression(rawArg);
  if (ts.isObjectLiteralExpression(firstArg)) {
    applyObjectLiteralZLayers(firstArg, parsed);
  }
  return parsed;
}

function parseZLayersInitializer(rawInit: ts.Expression): Record<string, number> | null {
  const init = unwrapTypeScriptExpression(rawInit);
  if (ts.isCallExpression(init)) {
    return parseResolveModalZLayersCall(init);
  }
  if (!ts.isObjectLiteralExpression(init)) {
    return null;
  }
  const parsed: Record<string, number> = {};
  applyObjectLiteralZLayers(init, parsed);
  return Object.keys(parsed).length > 0 ? parsed : null;
}

function findZLayersInitializerInStatement(stmt: ts.Statement): ts.Expression | undefined {
  if (!ts.isVariableStatement(stmt)) return undefined;
  for (const decl of stmt.declarationList.declarations) {
    if (ts.isIdentifier(decl.name) && decl.name.text === 'Z_LAYERS' && decl.initializer) {
      return decl.initializer;
    }
  }
  return undefined;
}

/**
 * Parses `Z_LAYERS` declarations from TypeScript source code using the TypeScript AST,
 * supporting plain object literals, `Object.freeze(...)`, `...CANONICAL_Z_LAYERS` spreads,
 * and `resolveModalZLayers({ ... })` factory calls with custom domain keys.
 */
export function parseZLayersFromSource(content: string): Record<string, number> | null {
  const sourceFile = ts.createSourceFile(
    'zLayers.ts',
    content,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  );

  for (const stmt of sourceFile.statements) {
    const initializer = findZLayersInitializerInStatement(stmt);
    if (!initializer) continue;
    const parsed = parseZLayersInitializer(initializer);
    if (parsed) return parsed;
  }

  return null;
}

function parseZLayersFromTs(tsPath: string): Record<string, number> | null {
  if (!fs.existsSync(tsPath)) return null;
  try {
    const content = fs.readFileSync(tsPath, 'utf-8');
    return parseZLayersFromSource(content);
  } catch {
    // Fallback to default on read or parse failure
    return null;
  }
}

/**
 * Resolves the effective Z-Layers dictionary from config.styles.zLayers,
 * or by parsing the TypeScript file defined in config.styles.zLayersTsFile or config.domain.zLayersFile,
 * or falls back to the default Z_LAYERS.
 */
export function getEffectiveZLayers(projectRoot: string = process.cwd()): Record<string, number> {
  const config = getAuditConfig(projectRoot);
  if (config.styles?.zLayers && Object.keys(config.styles.zLayers).length > 0) {
    return config.styles.zLayers;
  }

  const rawTsTarget = config.styles?.zLayersTsFile ?? config.domain?.zLayersFile;
  if (rawTsTarget) {
    const parsed = parseZLayersFromTs(path.resolve(projectRoot, rawTsTarget));
    if (parsed) return parsed;
  }

  return Z_LAYERS;
}
