/**
 * src/core/auditConfigAst.ts
 * AST parsing and configuration rewrite utilities for .auditor/audit.config.ts and .json.
 */
import fs from 'node:fs';
import { Project, SyntaxKind, type ObjectLiteralExpression, type SourceFile } from 'ts-morph';
import { safeReadFileSync, safeJsonParse, tryCatchSync } from './safeUtils.ts';

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function deepMergeMissingJson(
  target: Record<string, unknown>,
  missing: Record<string, unknown>
): boolean {
  let modified = false;
  for (const [key, val] of Object.entries(missing)) {
    if (val === undefined) continue;
    const curr = target[key];
    if (curr === undefined) {
      target[key] = val;
      modified = true;
    } else if (isPlainRecord(curr) && isPlainRecord(val) && deepMergeMissingJson(curr, val)) {
      modified = true;
    }
  }
  return modified;
}

export function appendMissingSectionsToJsonFile(
  configFilePath: string,
  sectionsToInsert: Record<string, Record<string, unknown>> // open-record: Dictionary of configuration sections
): void {
  const code = safeReadFileSync(configFilePath);
  if (!code) return;
  const json = safeJsonParse<Record<string, unknown>>(code);
  if (!isPlainRecord(json)) return;
  if (deepMergeMissingJson(json, sectionsToInsert)) {
    tryCatchSync(() => {
      fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
    });
  }
}

function valueToTsMorphInitializer(val: unknown): string {
  if (typeof val === 'string') return `'${val.replaceAll("'", "\\'")}'`;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val === null || val === undefined) return 'undefined';
  if (Array.isArray(val)) return `[${val.map((item) => valueToTsMorphInitializer(item)).join(', ')}]`;
  if (isPlainRecord(val)) {
    const entries = Object.entries(val).filter(([, v]) => v !== undefined);
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
    if (existing?.isKind(SyntaxKind.PropertyAssignment)) {
      const init = existing.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
      if (init && isPlainRecord(missingVal) && syncMissingPropsWithTsMorph(init, missingVal)) {
        mutated = true;
      }
      continue;
    }
    if (!existing) {
      const safeName = /^[a-z_$][\w$]*$/i.test(key) ? key : JSON.stringify(key);
      obj.addPropertyAssignment({ name: safeName, initializer: valueToTsMorphInitializer(missingVal) });
      mutated = true;
    }
  }
  return mutated;
}

export function findTargetAuditConfigObject(
  sourceFile: SourceFile
): ObjectLiteralExpression | undefined {
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getText() === 'defineAuditConfig') {
      const arg = call.getArguments()[0];
      if (arg && arg.isKind(SyntaxKind.ObjectLiteralExpression)) return arg;
    }
  }
  const expr = sourceFile.getDescendantsOfKind(SyntaxKind.ExportAssignment)[0]?.getExpression();
  if (expr && expr.isKind(SyntaxKind.ObjectLiteralExpression)) return expr;
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
    if (!targetObj || !mutator(targetObj, sourceFile)) return false;
    sourceFile.formatText({ indentSize: 2 });
    sourceFile.saveSync();
    return true;
  } catch {
    return false;
  }
}

export function syncAuditorVersionInTsFile(configFilePath: string, version: string): boolean {
  return mutateAuditConfigFileAst(configFilePath, (targetObj) => {
    const existingProp = targetObj.getProperty('auditorVersion');
    if (existingProp && existingProp.isKind(SyntaxKind.PropertyAssignment)) {
      const currentVal = existingProp.getInitializer()?.getText().replace(/^['"]|['"]$/g, '');
      if (currentVal === version) return false;
      existingProp.setInitializer(`'${version}'`);
      return true;
    }
    const nameProp = targetObj.getProperty('name');
    const idx =
      nameProp && nameProp.isKind(SyntaxKind.PropertyAssignment) ? nameProp.getChildIndex() + 1 : 0;
    targetObj.insertPropertyAssignment(idx, { name: 'auditorVersion', initializer: `'${version}'` });
    return true;
  });
}

export function appendMissingSectionsToConfigFile(
  configFilePath: string,
  sectionsToInsert: Record<string, Record<string, unknown>> // open-record: Dictionary of configuration sections
): void {
  if (configFilePath.endsWith('.json')) {
    appendMissingSectionsToJsonFile(configFilePath, sectionsToInsert);
    return;
  }
  mutateAuditConfigFileAst(configFilePath, (targetObj) =>
    syncMissingPropsWithTsMorph(targetObj, sectionsToInsert)
  );
}
