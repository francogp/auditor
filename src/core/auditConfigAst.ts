/**
 * src/core/auditConfigAst.ts
 * AST parsing and configuration rewrite utilities for .auditor/audit.config.ts and .json.
 */
import { Project, SyntaxKind, type ObjectLiteralExpression, type SourceFile } from 'ts-morph';

import {
  deduplicateObjectLiteralProperties,
  findTargetAuditConfigObject,
  getNormalizedPropName,
  syncArrayElementsWithTsMorph,
  syncMissingPropsWithTsMorph,
  valueToTsMorphInitializer
} from './auditConfigAstMutation.ts';
import { appendMissingSectionsToJsonFile, deepMergeMissingJson } from './auditConfigJson.ts';

export {
  appendMissingSectionsToJsonFile,
  deduplicateObjectLiteralProperties,
  deepMergeMissingJson,
  findTargetAuditConfigObject,
  getNormalizedPropName,
  syncArrayElementsWithTsMorph,
  syncMissingPropsWithTsMorph,
  valueToTsMorphInitializer
};

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
      const currentVal = existingProp
        .getInitializer()
        ?.getText()
        .replace(/^['"]|['"]$/g, '');
      if (currentVal === version) return false;
      existingProp.setInitializer(`'${version}'`);
      return true;
    }
    const nameProp = targetObj.getProperty('name');
    const idx =
      nameProp && nameProp.isKind(SyntaxKind.PropertyAssignment) ? nameProp.getChildIndex() + 1 : 0;
    targetObj.insertPropertyAssignment(idx, {
      name: 'auditorVersion',
      initializer: `'${version}'`
    });
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
  mutateAuditConfigFileAst(configFilePath, (targetObj) => {
    const dedupMutated = deduplicateObjectLiteralProperties(targetObj);
    const syncMutated = syncMissingPropsWithTsMorph(targetObj, sectionsToInsert);
    return dedupMutated || syncMutated;
  });
}
