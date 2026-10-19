/**
 * src/core/refactor/domainRefactorEngine.ts
 *
 * DOMAIN TYPE & BRANDED ID GOVERNANCE REFACTORING ENGINE (Node.js 26+ Native)
 * Provides deterministic discovery, Dirac micro-context extraction,
 * and automated plan-based remediation for naked strings, unfrozen catalogs, and unbranded IDs.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  forEachSourceScriptLine,
  isSameFilePath
} from './refactorFileScanner.ts';
import type {
  DomainFindingItem,
  DomainRefactorPlan
} from './refactorContracts.ts';
import { BaseRefactorEngine } from './baseRefactorEngine.ts';
import type { AuditEngineConfig } from '../auditConfigTypes.ts';
import { DomainTypesAuditor } from '../../suites/domain_data/validate_domain_types.ts';

const UNFROZEN_ARRAY_REGEX = /^(\s*export\s+const\s+([A-Z0-9_]+)\s*=\s*\[[^\]]+\])\s*;/m;
const UNFROZEN_OBJECT_REGEX = /^(\s*export\s+const\s+([A-Z0-9_]+)\s*=\s*\{[^}]+\})\s*;/m;
const NAKED_PARAM_REGEX = /\b([a-zA-Z0-9_$]*(?:id|type|status|category|mode|kind))\s*:\s*string\b/gi;
const UNBRANDED_ID_REGEX = /^\s*export\s+type\s+([A-Za-z0-9_$]+Id)\s*=\s*string\s*;/m;

export class DomainRefactorEngine extends BaseRefactorEngine<
  DomainFindingItem,
  DomainRefactorPlan,
  DomainTypesAuditor
> {
  public readonly toolId = 'auditor-domain';
  public readonly configSectionKey = 'domain' as const;

  constructor(
    auditorOrOptions?: DomainTypesAuditor | string | { projectRoot?: string; config?: AuditEngineConfig },
    _explicitConfig?: AuditEngineConfig
  ) {
    const auditor =
      auditorOrOptions instanceof DomainTypesAuditor
        ? auditorOrOptions
        : new DomainTypesAuditor(
            undefined,
            typeof auditorOrOptions === 'string'
              ? auditorOrOptions
              : auditorOrOptions?.projectRoot
          );
    super(auditor);
  }

  public override discoverInFile(filePath: string): readonly DomainFindingItem[] {
    return DomainRefactorEngine.discoverInFile(filePath);
  }

  public override createPlan(
    domainPlanId: string,
    domainFindings: readonly DomainFindingItem[]
  ): DomainRefactorPlan {
    const targetFiles = Array.from(new Set(domainFindings.map((f) => f.file)));
    return DomainRefactorEngine.buildDomainHygienePlan(domainPlanId, targetFiles, domainFindings);
  }

  public override applyPlan(
    projectRoot: string,
    plan: DomainRefactorPlan
  ): { readonly modifiedFiles: readonly string[] } {
    DomainRefactorEngine.applyPlan(projectRoot, plan);
    return { modifiedFiles: plan.targetFiles };
  }
  /**
   * Scans a file to discover domain type hygiene and branded ID opportunities.
   */
  public static discoverInFile(filePath: string): readonly DomainFindingItem[] {
    const findings: DomainFindingItem[] = [];

    forEachSourceScriptLine(filePath, (line, actualLine) => {
      // Check escape hatches
      if (line.includes('// domain-ok:') || line.includes('// domain-ignore:') || line.includes('// layout-ok:')) {
        return;
      }

      // 1. Detect unbranded ID type definitions without Brand wrapper
      const unbrandedMatch = UNBRANDED_ID_REGEX.exec(line);
      if (unbrandedMatch) {
        const typeName = unbrandedMatch[1];
        if (typeName && !line.includes('Brand<')) {
          const originalSnippet = unbrandedMatch[0].trim();
          findings.push({
            file: filePath,
            line: actualLine,
            kind: 'unbranded-id',
            identifier: typeName,
            originalSnippet,
            suggestedReplacement: `export type ${typeName} = Brand<string, '${typeName}'>;`,
            explanation: `Type alias "${typeName}" is a raw string alias. Use nominal branding (Brand<string, '${typeName}'>) to prevent accidental duck-typing.`
          });
          return;
        }
      }

      // 2. Detect unfrozen catalog arrays or objects
      if (line.includes('export const ') && !line.includes('as const') && !line.includes('satisfies')) {
        const arrayMatch = UNFROZEN_ARRAY_REGEX.exec(line);
        if (arrayMatch && arrayMatch[1] && arrayMatch[2]) {
          const originalSnippet = arrayMatch[0].trim();
          const identifier = arrayMatch[2];
          findings.push({
            file: filePath,
            line: actualLine,
            kind: 'unfrozen-catalog',
            identifier,
            originalSnippet,
            suggestedReplacement: `${arrayMatch[1]} as const;`,
            explanation: `Catalog array "${identifier}" is mutable. Append "as const" to freeze literal tuples and derive union types.`
          });
          return;
        }

        const objectMatch = UNFROZEN_OBJECT_REGEX.exec(line);
        if (objectMatch && objectMatch[1] && objectMatch[2]) {
          const originalSnippet = objectMatch[0].trim();
          const identifier = objectMatch[2];
          findings.push({
            file: filePath,
            line: actualLine,
            kind: 'unfrozen-catalog',
            identifier,
            originalSnippet,
            suggestedReplacement: `${objectMatch[1]} as const;`,
            explanation: `Catalog dictionary "${identifier}" is mutable. Append "as const" to derive strict key-value domain records.`
          });
          return;
        }
      }

      // 3. Detect naked string parameters (e.g. heroId: string, status: string)
      NAKED_PARAM_REGEX.lastIndex = 0;
      let paramMatch: RegExpExecArray | null;
      while ((paramMatch = NAKED_PARAM_REGEX.exec(line)) !== null) {
        const fullSnippet = paramMatch[0];
        const paramName = paramMatch[1];
        if (paramName) {
          // Derive suggested domain type name: heroId -> HeroId, status -> Status
          const suggestedType = paramName.charAt(0).toUpperCase() + paramName.slice(1);
          findings.push({
            file: filePath,
            line: actualLine,
            kind: 'naked-string-parameter',
            identifier: paramName,
            originalSnippet: fullSnippet,
            suggestedReplacement: `${paramName}: ${suggestedType}`,
            explanation: `Parameter "${paramName}" is typed as open "string". Use a canonical domain union or Branded ID instead.`
          });
        }
      }
    });

    return findings;
  }

  public static buildDomainHygienePlan(
    planId: string,
    targetFiles: readonly string[],
    findings: readonly DomainFindingItem[]
  ): DomainRefactorPlan {
    const constAssertions: {
      file: string;
      line: number;
      originalDeclaration: string;
      replacementDeclaration: string;
    }[] = [];
    const brandWrappers: {
      file: string;
      line: number;
      originalTypeDef: string;
      replacementTypeDef: string;
    }[] = [];
    const parameterReplacements: {
      file: string;
      line: number;
      originalParameter: string;
      replacementParameter: string;
    }[] = [];

    for (const f of findings) {
      if (f.kind === 'unfrozen-catalog') {
        constAssertions.push({
          file: f.file,
          line: f.line,
          originalDeclaration: f.originalSnippet,
          replacementDeclaration: f.suggestedReplacement
        });
      } else if (f.kind === 'unbranded-id') {
        brandWrappers.push({
          file: f.file,
          line: f.line,
          originalTypeDef: f.originalSnippet,
          replacementTypeDef: f.suggestedReplacement
        });
      } else if (f.kind === 'naked-string-parameter') {
        parameterReplacements.push({
          file: f.file,
          line: f.line,
          originalParameter: f.originalSnippet,
          replacementParameter: f.suggestedReplacement
        });
      }
    }

    return {
      version: 1,
      planId,
      targetFiles,
      constAssertions,
      brandWrappers,
      parameterReplacements
    };
  }

  public static createPlan(
    planId: string,
    findings: readonly DomainFindingItem[]
  ): DomainRefactorPlan {
    const targetFiles = Array.from(new Set(findings.map((f) => f.file)));
    return DomainRefactorEngine.buildDomainHygienePlan(planId, targetFiles, findings);
  }

  /**
   * Deterministically applies a DomainRefactorPlan across target source files.
   */
  public static applyPlan(
    targetDir: string,
    plan: DomainRefactorPlan
  ): { readonly filesChanged: number; readonly changesApplied: number } {
    let filesChanged = 0;
    let changesApplied = 0;

    for (const relFile of (plan.targetFiles ?? [])) {
      const fullPath = path.resolve(targetDir, relFile);
      if (!fs.existsSync(fullPath)) continue;
      const initialContent = fs.readFileSync(fullPath, 'utf-8');
      let currentContent = initialContent;

      for (const item of plan.constAssertions ?? []) {
        if (isSameFilePath(item.file, relFile, targetDir) && currentContent.includes(item.originalDeclaration)) {
          currentContent = currentContent.replace(item.originalDeclaration, item.replacementDeclaration);
          changesApplied++;
        }
      }

      for (const item of plan.brandWrappers ?? []) {
        if (isSameFilePath(item.file, relFile, targetDir) && currentContent.includes(item.originalTypeDef)) {
          currentContent = currentContent.replace(item.originalTypeDef, item.replacementTypeDef);
          changesApplied++;
        }
      }

      for (const item of plan.parameterReplacements ?? []) {
        if (isSameFilePath(item.file, relFile, targetDir) && currentContent.includes(item.originalParameter)) {
          currentContent = currentContent.replace(item.originalParameter, item.replacementParameter);
          changesApplied++;
        }
      }

      if (currentContent !== initialContent) {
        fs.writeFileSync(fullPath, currentContent, 'utf-8');
        filesChanged++;
      }
    }

    return { filesChanged, changesApplied };
  }
}
