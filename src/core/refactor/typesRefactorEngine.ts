/**
 * src/core/refactor/typesRefactorEngine.ts
 *
 * TYPE ASSERTION & RETURN TYPE GOVERNANCE REFACTORING ENGINE (Node.js 26+ Native)
 * Provides deterministic discovery, Dirac micro-context extraction,
 * and automated plan-based remediation for `as any`, double assertions, and missing return types.
 */

import {
  executePlanFileReplacements,
  forEachSourceScriptLine
} from './refactorFileScanner.ts';
import type {
  TypesFindingItem,
  TypesRefactorPlan
} from './refactorContracts.ts';
import { BaseRefactorEngine } from './baseRefactorEngine.ts';
import type { AuditEngineConfig } from '../auditConfigTypes.ts';
import { ValidateTypeAssertionHygieneAuditor } from '../../suites/architecture/validate_type_assertion_hygiene.ts';

const AS_ANY_REGEX = /\bas\s+any\b/g;
const ANGLE_ANY_REGEX = /<any>\s*([a-zA-Z0-9_$.()]+)/g;
const DOUBLE_ASSERTION_REGEX = /\bas\s+(?:unknown|any)\s+as\s+([A-Za-z0-9_$.<>[\]|& ]+)/g;
const EXPORTED_FN_REGEX = /^(\s*export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\([^)]*\))\s*\{/m;

export class TypesRefactorEngine extends BaseRefactorEngine<
  TypesFindingItem,
  TypesRefactorPlan,
  ValidateTypeAssertionHygieneAuditor
> {
  public readonly toolId = 'auditor-types';
  public readonly configSectionKey = 'types' as const;

  constructor(
    auditorOrOptions?: ValidateTypeAssertionHygieneAuditor | string | { projectRoot?: string; config?: AuditEngineConfig },
    _explicitConfig?: AuditEngineConfig
  ) {
    const auditor =
      auditorOrOptions instanceof ValidateTypeAssertionHygieneAuditor
        ? auditorOrOptions
        : new ValidateTypeAssertionHygieneAuditor(
            typeof auditorOrOptions === 'string'
              ? auditorOrOptions
              : auditorOrOptions?.projectRoot
          );
    super(auditor);
  }

  public override discoverInFile(filePath: string): readonly TypesFindingItem[] {
    return TypesRefactorEngine.discoverInFile(filePath);
  }

  public override createPlan(
    typesPlanId: string,
    typesFindings: readonly TypesFindingItem[]
  ): TypesRefactorPlan {
    return TypesRefactorEngine.buildTypeAssertionPlan(typesPlanId, typesFindings);
  }

  public override applyPlan(
    projectRoot: string,
    plan: TypesRefactorPlan
  ): { readonly modifiedFiles: readonly string[] } {
    TypesRefactorEngine.applyPlan(projectRoot, plan);
    return { modifiedFiles: plan.targetFiles };
  }
  /**
   * Scans a file to discover type assertion and return type hygiene violations.
   */
  public static discoverInFile(filePath: string): readonly TypesFindingItem[] {
    const findings: TypesFindingItem[] = [];

    forEachSourceScriptLine(filePath, (line, actualLine) => {
      // Check escape hatches
      if (line.includes('// type-ok:') || line.includes('// type-ignore:') || line.includes('// eslint-disable')) {
        return;
      }

      // 1. Detect double assertions (e.g. as unknown as Foo, as any as Bar)
      DOUBLE_ASSERTION_REGEX.lastIndex = 0;
      let doubleMatch: RegExpExecArray | null;
      if ((doubleMatch = DOUBLE_ASSERTION_REGEX.exec(line)) !== null) {
        const fullMatch = doubleMatch[0];
        const targetType = doubleMatch[1]?.trim() || 'TargetType';
        findings.push({
          file: filePath,
          line: actualLine,
          kind: 'double-assertion',
          originalSnippet: fullMatch,
          suggestedReplacement: `as ${targetType} /* verify narrowing */`,
          explanation: `Avoid double-casting (${fullMatch}). Use explicit type narrowing or domain-specific guards.`
        });
        return;
      }

      // 2. Detect `as any`
      AS_ANY_REGEX.lastIndex = 0;
      if (AS_ANY_REGEX.test(line)) {
        findings.push({
          file: filePath,
          line: actualLine,
          kind: 'as-any',
          originalSnippet: 'as any',
          suggestedReplacement: 'as unknown',
          explanation: 'Avoid loose "as any" assertions. Prefer "as unknown" or domain types to maintain compile-time safety.'
        });
        return;
      }

      // 3. Detect legacy `<any>` casting
      ANGLE_ANY_REGEX.lastIndex = 0;
      let angleMatch: RegExpExecArray | null;
      if ((angleMatch = ANGLE_ANY_REGEX.exec(line)) !== null) {
        const fullMatch = angleMatch[0];
        const expr = angleMatch[1] || 'expr';
        findings.push({
          file: filePath,
          line: actualLine,
          kind: 'as-any',
          originalSnippet: fullMatch,
          suggestedReplacement: `(${expr} as unknown)`,
          explanation: `Avoid legacy angle-bracket syntax "${fullMatch}". Use "as unknown" or specific interfaces.`
        });
        return;
      }

      // 4. Detect exported function declarations lacking return type annotations
      const fnMatch = EXPORTED_FN_REGEX.exec(line);
      if (fnMatch) {
        const header = fnMatch[1];
        const fnName = fnMatch[2];
        if (header && fnName && !line.includes('):') && !header.endsWith(':')) {
          const isAsync = header.includes('async ');
          const fallbackReturn = isAsync ? ': Promise<void>' : ': void';
          findings.push({
            file: filePath,
            line: actualLine,
            kind: 'missing-return-type',
            identifier: fnName,
            originalSnippet: header,
            suggestedReplacement: `${header}${fallbackReturn}`,
            explanation: `Exported function "${fnName}" lacks an explicit return type. Add an explicit contract.`
          });
        }
      }
    });

    return findings;
  }

  /**
   * Creates a deterministic refactoring plan from findings.
   */
  public static buildTypeAssertionPlan(
    planId: string,
    findings: readonly TypesFindingItem[]
  ): TypesRefactorPlan {
    const targetFiles = Array.from(new Set(findings.map((f) => f.file)));
    const assertionReplacements: {
      file: string;
      line: number;
      originalSnippet: string;
      replacementSnippet: string;
    }[] = [];
    const returnTypeInjections: {
      file: string;
      line: number;
      originalHeader: string;
      replacementHeader: string;
    }[] = [];

    for (const f of findings) {
      if (f.kind === 'as-any' || f.kind === 'double-assertion') {
        assertionReplacements.push({
          file: f.file,
          line: f.line,
          originalSnippet: f.originalSnippet,
          replacementSnippet: f.suggestedReplacement.replace(/\s*\/\*.*?\*\/\s*$/, '')
        });
      } else if (f.kind === 'missing-return-type') {
        returnTypeInjections.push({
          file: f.file,
          line: f.line,
          originalHeader: f.originalSnippet,
          replacementHeader: f.suggestedReplacement
        });
      }
    }

    return {
      version: 1,
      planId,
      targetFiles,
      assertionReplacements,
      returnTypeInjections
    };
  }

  public static createPlan(
    planId: string,
    findings: readonly TypesFindingItem[]
  ): TypesRefactorPlan {
    return TypesRefactorEngine.buildTypeAssertionPlan(planId, findings);
  }

  /**
   * Deterministically applies a TypesRefactorPlan across target source files.
   */
  public static applyPlan(
    targetDir: string,
    plan: TypesRefactorPlan
  ): { readonly filesChanged: number; readonly changesApplied: number } {
    const assertionReplacements = plan.assertionReplacements?.map((item) => ({
      file: item.file,
      original: item.originalSnippet,
      replacement: item.replacementSnippet
    }));

    const returnTypeInjections = plan.returnTypeInjections?.map((item) => ({
      file: item.file,
      original: item.originalHeader,
      replacement: item.replacementHeader
    }));

    return executePlanFileReplacements(targetDir, plan.targetFiles, [
      assertionReplacements,
      returnTypeInjections
    ]);
  }
}
