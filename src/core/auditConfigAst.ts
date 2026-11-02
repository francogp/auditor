/**
 * src/core/auditConfigAst.ts
 * AST parsing and configuration rewrite utilities for .auditor/audit.config.ts and .json.
 */
import fs from 'node:fs';

import { Node, Project, SyntaxKind, type ObjectLiteralExpression, type SourceFile } from 'ts-morph';

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

function mutateJsonConfigFile(
  configFilePath: string,
  mutator: (json: Record<string, unknown>) => boolean
): boolean {
  try {
    const text = fs.readFileSync(configFilePath, 'utf8');
    const json = JSON.parse(text) as Record<string, unknown>;
    const modified = mutator(json);
    if (modified) {
      fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
    }
    return modified;
  } catch {
    return false;
  }
}

export function migrateLegacyEslintSectionAst(configFilePath: string): boolean {
  if (!fs.existsSync(configFilePath)) return false;

  if (configFilePath.endsWith('.json')) {
    return mutateJsonConfigFile(configFilePath, (json) => {
      if (!('eslint' in json)) return false;
      json.oxlint = json.eslint;
      delete json.eslint;
      if (!('vitePlusConfig' in json)) {
        json.vitePlusConfig = { enabled: true };
      }
      return true;
    });
  }

  return mutateAuditConfigFileAst(configFilePath, (targetObj) => {
    const eslintProp = targetObj.getProperty('eslint');
    if (!eslintProp) return false;

    if (Node.isPropertyAssignment(eslintProp)) {
      eslintProp.getNameNode().replaceWithText('oxlint');
    }

    if (!targetObj.getProperty('vitePlusConfig')) {
      targetObj.addPropertyAssignment({
        name: 'vitePlusConfig',
        initializer: '{ enabled: true }'
      });
    }

    return true;
  });
}

function ensureVitePlusLintTypeCheck(vpcProp: Node, isExplicitlyDisabled: boolean): void {
  if (!Node.isPropertyAssignment(vpcProp)) return;
  const vpcInit = vpcProp.getInitializer();
  if (!Node.isObjectLiteralExpression(vpcInit)) return;

  const lintProp = vpcInit.getProperty('lint');
  if (!lintProp) {
    vpcInit.addPropertyAssignment({
      name: 'lint',
      initializer: `{ typeCheck: ${!isExplicitlyDisabled} }`
    });
    return;
  }

  if (!Node.isPropertyAssignment(lintProp)) return;
  const lintInit = lintProp.getInitializer();
  if (!Node.isObjectLiteralExpression(lintInit)) return;

  const tcProp = lintInit.getProperty('typeCheck');
  if (!tcProp) {
    lintInit.addPropertyAssignment({
      name: 'typeCheck',
      initializer: `${!isExplicitlyDisabled}`
    });
    return;
  }

  if (Node.isPropertyAssignment(tcProp)) {
    tcProp.setInitializer(`${!isExplicitlyDisabled}`);
  }
}

export function migrateLegacyTypeCheckSectionAst(configFilePath: string): boolean {
  if (!fs.existsSync(configFilePath)) return false;

  if (configFilePath.endsWith('.json')) {
    return mutateJsonConfigFile(configFilePath, (json) => {
      const legacyKey =
        'typeCheck' in json
          ? 'typeCheck'
          : 'validate_type_check' in json
            ? 'validate_type_check'
            : null;
      if (!legacyKey) return false;
      const legacyVal = json[legacyKey] as Record<string, unknown> | undefined;
      const isExplicitlyDisabled = legacyVal?.enabled === false;
      delete json[legacyKey];

      if (!('vitePlusConfig' in json)) {
        json.vitePlusConfig = { enabled: true };
      }
      const vpc = json.vitePlusConfig as Record<string, unknown>;
      if (!vpc.lint || typeof vpc.lint !== 'object') {
        vpc.lint = {};
      }
      const lint = vpc.lint as Record<string, unknown>;
      lint.typeCheck = !isExplicitlyDisabled;
      return true;
    });
  }

  return mutateAuditConfigFileAst(configFilePath, (targetObj) => {
    const legacyProp =
      targetObj.getProperty('typeCheck') ?? targetObj.getProperty('validate_type_check');
    if (!legacyProp) return false;

    let isExplicitlyDisabled = false;
    if (Node.isPropertyAssignment(legacyProp)) {
      const init = legacyProp.getInitializer();
      if (Node.isObjectLiteralExpression(init)) {
        const enabledProp = init.getProperty('enabled');
        if (Node.isPropertyAssignment(enabledProp)) {
          isExplicitlyDisabled = enabledProp.getInitializer()?.getText() === 'false';
        }
      }
    }

    legacyProp.remove();

    const vpcProp = targetObj.getProperty('vitePlusConfig');
    if (!vpcProp) {
      targetObj.addPropertyAssignment({
        name: 'vitePlusConfig',
        initializer: `{ enabled: true, lint: { typeCheck: ${!isExplicitlyDisabled} } }`
      });
      return true;
    }

    ensureVitePlusLintTypeCheck(vpcProp, isExplicitlyDisabled);
    return true;
  });
}

export function removeAuditConfigPropertyAst(
  configFilePath: string,
  propertyPath: string
): boolean {
  if (!fs.existsSync(configFilePath)) return false;

  if (configFilePath.endsWith('.json')) {
    return mutateJsonConfigFile(configFilePath, (json) => {
      const parts = propertyPath.split('.');
      let cur: Record<string, unknown> = json;
      for (let i = 0; i < parts.length - 1; i++) {
        const sub = cur[parts[i]!];
        if (typeof sub === 'object' && sub !== null) {
          cur = sub as Record<string, unknown>;
        } else {
          return false;
        }
      }
      const lastKey = parts.at(-1)!;
      if (lastKey in cur) {
        delete cur[lastKey];
        return true;
      }
      return false;
    });
  }

  return mutateAuditConfigFileAst(configFilePath, (targetObj) => {
    const parts = propertyPath.split('.');
    let currentObj: ObjectLiteralExpression | null = targetObj;
    for (const part of parts.slice(0, -1)) {
      if (!currentObj) return false;
      const prop: Node | undefined = currentObj.getProperty(part);
      if (!prop || !Node.isPropertyAssignment(prop)) {
        return false;
      }
      currentObj = prop.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression) ?? null;
    }
    if (!currentObj) return false;
    const lastKey = parts.at(-1)!;
    const targetProp = currentObj.getProperty(lastKey);
    if (targetProp) {
      targetProp.remove();
      return true;
    }
    return false;
  });
}
