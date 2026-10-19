/**
 * src/core/refactor/domainRefactorEngine.ts
 *
 * DOMAIN TYPE & BRANDED ID GOVERNANCE REFACTORING ENGINE (Node.js 26+ Native)
 * Provides deterministic discovery, Dirac micro-context extraction,
 * and automated plan-based remediation for naked strings, unfrozen catalogs, and unbranded IDs.
 */

import {
  executePlanFileReplacements,
  forEachSourceScriptLine
} from './refactorFileScanner.ts';
import type {
  DomainFindingItem,
  DomainRefactorPlan
} from './refactorContracts.ts';

const UNFROZEN_ARRAY_REGEX = /^(\s*export\s+const\s+([A-Z0-9_]+)\s*=\s*\[[^\]]+\])\s*;/m;
const UNFROZEN_OBJECT_REGEX = /^(\s*export\s+const\s+([A-Z0-9_]+)\s*=\s*\{[^}]+\})\s*;/m;
const NAKED_PARAM_REGEX = /\b([a-zA-Z0-9_$]*(?:id|type|status|category|mode|kind))\s*:\s*string\b/gi;
const UNBRANDED_ID_REGEX = /^\s*export\s+type\s+([A-Za-z0-9_$]+Id)\s*=\s*string\s*;/m;

export class DomainRefactorEngine {
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

  /**
   * Creates a deterministic refactoring plan from findings.
   */
  public static createPlan(
    planId: string,
    findings: readonly DomainFindingItem[]
  ): DomainRefactorPlan {
    const targetFiles = Array.from(new Set(findings.map((f) => f.file)));
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

  /**
   * Deterministically applies a DomainRefactorPlan across target source files.
   */
  public static applyPlan(
    targetDir: string,
    plan: DomainRefactorPlan
  ): { readonly filesChanged: number; readonly changesApplied: number } {
    const replacementBuckets = [];

    if (plan.constAssertions && plan.constAssertions.length > 0) {
      replacementBuckets.push(
        plan.constAssertions.map((c) => ({
          file: c.file,
          original: c.originalDeclaration,
          replacement: c.replacementDeclaration
        }))
      );
    }

    if (plan.brandWrappers && plan.brandWrappers.length > 0) {
      replacementBuckets.push(
        plan.brandWrappers.map((b) => ({
          file: b.file,
          original: b.originalTypeDef,
          replacement: b.replacementTypeDef
        }))
      );
    }

    if (plan.parameterReplacements && plan.parameterReplacements.length > 0) {
      replacementBuckets.push(
        plan.parameterReplacements.map((p) => ({
          file: p.file,
          original: p.originalParameter,
          replacement: p.replacementParameter
        }))
      );
    }

    return executePlanFileReplacements(targetDir, plan.targetFiles, replacementBuckets);
  }
}
