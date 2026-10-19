/**
 * src/core/auditConfigAst.ts
 *
 * AST PARSING & CONFIGURATION REWRITE UTILITIES (Node.js 26+ Native)
 * Provides programmatic AST extraction and insertion for .auditor/audit.config.ts
 * and .auditor/audit.config.json files using official AST libraries (ts-morph and TypeScript).
 */

import fs from 'node:fs';
import ts from 'typescript';
import { Project, SyntaxKind, type ObjectLiteralExpression, type SourceFile } from 'ts-morph';

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
  _code: string,
  sectionsToInsert: Record<string, Record<string, unknown>> // open-record: Dictionary of configuration sections
): void {
  appendMissingSectionsToTsFile(configFilePath, sectionsToInsert);
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

function valueToTsMorphInitializer(val: unknown): string {
  if (typeof val === 'string') return `'${val.replaceAll("'", "\\'")}'`;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val === null || val === undefined) return 'undefined';
  if (Array.isArray(val)) {
    const items = val.map((item) => valueToTsMorphInitializer(item));
    return `[${items.join(', ')}]`;
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>).filter(
      ([, v]) => v !== undefined
    );
    const lines = entries.map(([k, v]) => {
      const safeKey = /^[a-z_$][\w$]*$/i.test(k) ? k : `'${k.replaceAll("'", "\\'")}'`;
      return `${safeKey}: ${valueToTsMorphInitializer(v)}`;
    });
    return `{\n${lines.join(',\n')}\n}`;
  }
  return 'undefined';
}

function syncMissingPropsWithTsMorph(
  obj: ObjectLiteralExpression,
  missingProps: Record<string, unknown>
): boolean {
  let mutated = false;
  for (const [key, missingVal] of Object.entries(missingProps)) {
    if (missingVal === undefined) continue;
    const existing = obj.getProperty(key);
    if (existing && existing.isKind(SyntaxKind.PropertyAssignment)) {
      const init = existing.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
      if (
        init &&
        typeof missingVal === 'object' &&
        missingVal !== null &&
        !Array.isArray(missingVal)
      ) {
        if (syncMissingPropsWithTsMorph(init, missingVal as Record<string, unknown>)) {
          mutated = true;
        }
        continue;
      }
    }
    if (!existing) {
      const safeName = /^[a-z_$][\w$]*$/i.test(key) ? key : JSON.stringify(key);
      obj.addPropertyAssignment({
        name: safeName,
        initializer: valueToTsMorphInitializer(missingVal)
      });
      mutated = true;
    }
  }
  return mutated;
}

export function findTargetAuditConfigObject(
  sourceFile: SourceFile
): ObjectLiteralExpression | undefined {
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of callExpressions) {
    if (call.getExpression().getText() === 'defineAuditConfig') {
      const arg = call.getArguments()[0];
      if (arg && arg.isKind(SyntaxKind.ObjectLiteralExpression)) {
        return arg;
      }
    }
  }

  const exportAssign = sourceFile.getDescendantsOfKind(SyntaxKind.ExportAssignment)[0];
  const expr = exportAssign?.getExpression();
  if (expr && expr.isKind(SyntaxKind.ObjectLiteralExpression)) {
    return expr;
  }

  return sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)[0];
}

export function mutateAuditConfigFileAst(
  configFilePath: string,
  mutator: (targetObj: ObjectLiteralExpression, sourceFile: SourceFile) => boolean
): boolean {
  try {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
      compilerOptions: { allowJs: true }
    });
    const sourceFile = project.addSourceFileAtPath(configFilePath);
    const targetObj = findTargetAuditConfigObject(sourceFile);
    if (!targetObj) return false;

    const modified = mutator(targetObj, sourceFile);
    if (modified) {
      sourceFile.formatText({ indentSize: 2 });
      sourceFile.saveSync();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function syncAuditorVersionInTsFile(configFilePath: string, version: string): boolean {
  return mutateAuditConfigFileAst(configFilePath, (targetObj) => {
    const existingProp = targetObj.getProperty('auditorVersion');
    if (existingProp && existingProp.isKind(SyntaxKind.PropertyAssignment)) {
      const init = existingProp.getInitializer();
      const currentVal = init?.getText().replace(/^['"]|['"]$/g, '');
      if (currentVal === version) return false;
      existingProp.setInitializer(`'${version}'`);
      return true;
    }

    const nameProp = targetObj.getProperty('name');
    if (nameProp && nameProp.isKind(SyntaxKind.PropertyAssignment)) {
      const idx = nameProp.getChildIndex();
      targetObj.insertPropertyAssignment(idx + 1, {
        name: 'auditorVersion',
        initializer: `'${version}'`
      });
    } else {
      targetObj.insertPropertyAssignment(0, {
        name: 'auditorVersion',
        initializer: `'${version}'`
      });
    }
    return true;
  });
}

export function appendMissingSectionsToTsFile(
  configFilePath: string,
  sectionsToInsert: Record<string, Record<string, unknown>> // open-record: Dictionary of configuration sections
): void {
  mutateAuditConfigFileAst(configFilePath, (targetObj) =>
    syncMissingPropsWithTsMorph(targetObj, sectionsToInsert)
  );
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
