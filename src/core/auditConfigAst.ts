/**
 * src/core/auditConfigAst.ts
 *
 * AST PARSING & CONFIGURATION REWRITE UTILITIES (Node.js 26+ Native)
 * Provides programmatic AST extraction and insertion for .auditor/audit.config.ts
 * and .auditor/audit.config.json files.
 */

import fs from 'node:fs';
import ts from 'typescript';

export function dtoValueToTsExpression(value: unknown): ts.Expression {
  if (typeof value === 'string') {
    return ts.factory.createStringLiteral(value, true);
  }
  if (typeof value === 'number') {
    if (value < 0) {
      return ts.factory.createPrefixUnaryExpression(
        ts.SyntaxKind.MinusToken,
        ts.factory.createNumericLiteral(Math.abs(value))
      );
    }
    return ts.factory.createNumericLiteral(value);
  }
  if (typeof value === 'boolean') {
    return value ? ts.factory.createTrue() : ts.factory.createFalse();
  }
  if (value === null || value === undefined) {
    return ts.factory.createNull();
  }
  if (Array.isArray(value)) {
    const elements = value.map((item) => dtoValueToTsExpression(item));
    const multiLine =
      value.length > 3 || value.some((item) => typeof item === 'object' && item !== null);
    return ts.factory.createArrayLiteralExpression(elements, multiLine);
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined
    );
    const props = entries.map(([k, v]) => {
      const propName = /^[a-z_$][\w$]*$/i.test(k)
        ? ts.factory.createIdentifier(k)
        : ts.factory.createStringLiteral(k, true);
      return ts.factory.createPropertyAssignment(propName, dtoValueToTsExpression(v));
    });
    return ts.factory.createObjectLiteralExpression(props, entries.length > 0);
  }
  return ts.factory.createNull();
}

export function printTsExpression(expr: ts.Expression): string {
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  // homebrew-ok: synthetic AST source file for ts.createPrinter
  const dummySource = ts.createSourceFile(
    'config.ts',
    '',
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  );
  const raw = printer.printNode(ts.EmitHint.Expression, expr, dummySource);
  return raw
    .split('\n')
    .map((line) => line.replace(/^( {4})+/, (m) => ' '.repeat(m.length / 2)))
    .join('\n');
}

export function formatSectionObjectLiteral(value: unknown): string {
  const printed = printTsExpression(dtoValueToTsExpression(value));
  return printed
    .split('\n')
    .map((line, idx) => (idx === 0 ? line : `  ${line}`))
    .join('\n');
}

export function findConfigObjectLiteral(source: ts.SourceFile): ts.ObjectLiteralExpression | null {
  let configObj: ts.ObjectLiteralExpression | null = null;
  const visit = (node: ts.Node): void => {
    if (configObj) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineAuditConfig' &&
      node.arguments.length > 0 &&
      ts.isObjectLiteralExpression(node.arguments[0]!)
    ) {
      configObj = node.arguments[0];
      return;
    }
    if (ts.isExportAssignment(node) && ts.isObjectLiteralExpression(node.expression)) {
      configObj = node.expression;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return configObj;
}

export function appendMissingSectionsFallback(
  configFilePath: string,
  code: string,
  sectionsToInsert: Record<string, Record<string, unknown>> // open-record: Dictionary of configuration sections
): void {
  const lastBrace = code.lastIndexOf('}');
  if (lastBrace === -1) return;
  const beforeClose = code.slice(0, lastBrace).trimEnd();
  const needsComma = !beforeClose.endsWith(',');
  const commaPos = beforeClose.length;

  const sectionLines: string[] = [];
  for (const [key, val] of Object.entries(sectionsToInsert)) {
    sectionLines.push(`  ${key}: ${formatSectionObjectLiteral(val)},`);
  }

  const base = needsComma
    ? code.slice(0, commaPos) + ',' + code.slice(commaPos, lastBrace)
    : code.slice(0, lastBrace);

  const snippet = '\n' + sectionLines.join('\n') + '\n';
  const updated = base + snippet + code.slice(lastBrace);
  fs.writeFileSync(configFilePath, updated, 'utf8');
}

export function parseAuditConfigFileAst(
  configFilePath: string
): { code: string; source: ts.SourceFile; configObj: ts.ObjectLiteralExpression | null } | null {
  try {
    const code = fs.readFileSync(configFilePath, 'utf8');
    // homebrew-ok: in-place AST configuration rewrite
    const source = ts.createSourceFile(
      configFilePath,
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const configObj = findConfigObjectLiteral(source);
    return { code, source, configObj };
  } catch {
    return null;
  }
}

export function appendMissingSectionsToJsonFile(
  configFilePath: string,
  sectionsToInsert: Record<string, Record<string, unknown>> // open-record: Dictionary of configuration sections
): void {
  try {
    const code = fs.readFileSync(configFilePath, 'utf8');
    const json = JSON.parse(code);
    if (!json || typeof json !== 'object') return;
    for (const [key, value] of Object.entries(sectionsToInsert)) {
      Reflect.set(json, key, value);
    }
    fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  } catch {
    // catch-ok: ignore unparseable json config files
  }
}

export function appendMissingSectionsToTsFile(
  configFilePath: string,
  sectionsToInsert: Record<string, Record<string, unknown>> // open-record: Dictionary of configuration sections
): void {
  const parsed = parseAuditConfigFileAst(configFilePath);
  if (!parsed) return;
  const { code, source, configObj } = parsed;

  if (!configObj) {
    appendMissingSectionsFallback(configFilePath, code, sectionsToInsert);
    return;
  }

  const existingProps = new Map<string, ts.PropertyAssignment>();
  for (const prop of configObj.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const propName = prop.name.getText(source).replace(/^['"]|['"]$/g, '');
      existingProps.set(propName, prop);
    }
  }

  const inPlaceUpdates: Array<{ prop: ts.PropertyAssignment; val: Record<string, unknown> }> = [];
  const newAdditions: Array<[string, Record<string, unknown>]> = [];

  for (const [key, val] of Object.entries(sectionsToInsert)) {
    const existingProp = existingProps.get(key);
    if (existingProp) {
      inPlaceUpdates.push({ prop: existingProp, val });
    } else {
      newAdditions.push([key, val]);
    }
  }

  let updatedCode = code;

  if (inPlaceUpdates.length > 0) {
    inPlaceUpdates.sort(
      (a, b) => b.prop.initializer.getStart(source) - a.prop.initializer.getStart(source)
    );
    for (const { prop, val } of inPlaceUpdates) {
      const start = prop.initializer.getStart(source);
      const end = prop.initializer.getEnd();
      updatedCode =
        updatedCode.slice(0, start) + formatSectionObjectLiteral(val) + updatedCode.slice(end);
    }
    fs.writeFileSync(configFilePath, updatedCode, 'utf8');
  }

  if (newAdditions.length === 0) return;

  const reparsed = inPlaceUpdates.length > 0 ? parseAuditConfigFileAst(configFilePath) : parsed;
  if (!reparsed || !reparsed.configObj) return;

  const targetCode = reparsed.code;
  const targetObj = reparsed.configObj;
  const properties = targetObj.properties;
  let hasTrailingComma = false;

  if (properties.length > 0) {
    const lastProp = properties[properties.length - 1]!;
    const endOfLastProp = lastProp.getEnd();
    const closeBracePos = targetCode.lastIndexOf('}', targetObj.getEnd() - 1);
    const between = targetCode.slice(endOfLastProp, closeBracePos);
    hasTrailingComma = between.includes(',');
  }

  const closeBracePos = targetCode.lastIndexOf('}', targetObj.getEnd() - 1);
  if (closeBracePos === -1) return;

  let baseCode = targetCode;
  let effectiveCloseBracePos = closeBracePos;

  if (!hasTrailingComma && properties.length > 0) {
    const lastProp = properties[properties.length - 1]!;
    const endOfLastProp = lastProp.getEnd();
    baseCode = targetCode.slice(0, endOfLastProp) + ',' + targetCode.slice(endOfLastProp);
    effectiveCloseBracePos += 1;
  }

  const sectionLines = newAdditions.map(
    ([key, val]) => `  ${key}: ${formatSectionObjectLiteral(val)},`
  );
  const snippet = '\n' + sectionLines.join('\n') + '\n';

  const finalCode =
    baseCode.slice(0, effectiveCloseBracePos) + snippet + baseCode.slice(effectiveCloseBracePos);
  fs.writeFileSync(configFilePath, finalCode, 'utf8');
}

export function appendMissingSectionsToConfigFile(
  configFilePath: string,
  sectionsToInsert: Record<string, Record<string, unknown>> // open-record: Dictionary of configuration sections
): void {
  if (configFilePath.endsWith('.json')) {
    appendMissingSectionsToJsonFile(configFilePath, sectionsToInsert);
    return;
  }
  appendMissingSectionsToTsFile(configFilePath, sectionsToInsert);
}
