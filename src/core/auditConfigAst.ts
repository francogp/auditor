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

export function formatValueWithIndent(value: unknown, indent: string): string {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    const subIndent = indent + '  ';
    const lines = entries.map(([k, v]) => {
      const safeKey = /^[a-z_$][\w$]*$/i.test(k) ? k : `'${k}'`;
      return `${subIndent}${safeKey}: ${formatValueWithIndent(v, subIndent)}`;
    });
    return `{\n${lines.join(',\n')}\n${indent}}`;
  }
  return printTsExpression(dtoValueToTsExpression(value));
}

export function deepMergeMissingJson(
  target: Record<string, unknown>,
  missing: Record<string, unknown>
): boolean {
  let modified = false;
  for (const [key, val] of Object.entries(missing)) {
    if (val === undefined) continue;
    if (target[key] === undefined) {
      target[key] = val;
      modified = true;
    } else if (
      typeof target[key] === 'object' &&
      target[key] !== null &&
      !Array.isArray(target[key]) &&
      typeof val === 'object' &&
      val !== null &&
      !Array.isArray(val)
    ) {
      if (
        deepMergeMissingJson(
          target[key] as Record<string, unknown>,
          val as Record<string, unknown>
        )
      ) {
        modified = true;
      }
    }
  }
  return modified;
}

export function appendMissingSectionsToJsonFile(
  configFilePath: string,
  sectionsToInsert: Record<string, Record<string, unknown>> // open-record: Dictionary of configuration sections
): void {
  try {
    const code = fs.readFileSync(configFilePath, 'utf8');
    const json = JSON.parse(code);
    if (!json || typeof json !== 'object') return;
    const modified = deepMergeMissingJson(json as Record<string, unknown>, sectionsToInsert);
    if (modified) {
      fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
    }
  } catch {
    // catch-ok: ignore unparseable json config files
  }
}

interface AstInsertion {
  pos: number;
  text: string;
}

function collectMissingPropInsertions(
  code: string,
  source: ts.SourceFile,
  objNode: ts.ObjectLiteralExpression,
  missingProps: Record<string, unknown>,
  indent: string,
  insertions: AstInsertion[]
): void {
  const existingPropMap = new Map<string, ts.PropertyAssignment>();
  for (const prop of objNode.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const name = prop.name.getText(source).replace(/^['"]|['"]$/g, '');
      existingPropMap.set(name, prop);
    }
  }

  const propsToAppend: Array<[string, unknown]> = [];

  for (const [key, missingVal] of Object.entries(missingProps)) {
    if (missingVal === undefined) continue;
    const existing = existingPropMap.get(key);
    if (existing) {
      if (
        ts.isObjectLiteralExpression(existing.initializer) &&
        typeof missingVal === 'object' &&
        missingVal !== null &&
        !Array.isArray(missingVal)
      ) {
        collectMissingPropInsertions(
          code,
          source,
          existing.initializer,
          missingVal as Record<string, unknown>,
          indent + '  ',
          insertions
        );
      }
    } else {
      propsToAppend.push([key, missingVal]);
    }
  }

  if (propsToAppend.length === 0) return;

  const formattedLines = propsToAppend.map(([k, v]) => {
    const safeKey = /^[a-z_$][\w$]*$/i.test(k) ? k : `'${k}'`;
    return `${indent}${safeKey}: ${formatValueWithIndent(v, indent)}`;
  });

  const closeBracePos = code.lastIndexOf('}', objNode.getEnd() - 1);
  if (closeBracePos === -1) return;

  if (objNode.properties.length > 0) {
    const lastProp = objNode.properties[objNode.properties.length - 1]!;
    const endOfLastProp = lastProp.getEnd();
    const textBetween = code.slice(endOfLastProp, closeBracePos);
    const hasComma = textBetween.includes(',');
    const commaPrefix = hasComma ? '' : ',';

    const lastNewlineBeforeClose = code.lastIndexOf('\n', closeBracePos);
    const insertPos =
      lastNewlineBeforeClose !== -1 && lastNewlineBeforeClose >= endOfLastProp
        ? lastNewlineBeforeClose
        : closeBracePos;

    insertions.push({
      pos: insertPos,
      text: `${commaPrefix}\n${formattedLines.join(',\n')},`
    });
  } else {
    const parentIndent = indent.length >= 2 ? indent.slice(2) : '';
    insertions.push({
      pos: closeBracePos,
      text: `\n${formattedLines.join(',\n')},\n${parentIndent}`
    });
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

  const insertions: AstInsertion[] = [];
  collectMissingPropInsertions(code, source, configObj, sectionsToInsert, '  ', insertions);

  if (insertions.length === 0) return;

  insertions.sort((a, b) => b.pos - a.pos);
  let updatedCode = code;
  for (const ins of insertions) {
    updatedCode = updatedCode.slice(0, ins.pos) + ins.text + updatedCode.slice(ins.pos);
  }
  fs.writeFileSync(configFilePath, updatedCode, 'utf8');
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
