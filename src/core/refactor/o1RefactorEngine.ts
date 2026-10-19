/**
 * src/core/refactor/o1RefactorEngine.ts
 *
 * O(1) DATA STRUCTURE & LINEAR SEARCH REFACTORING ENGINE (Node.js 26+ Native)
 * Provides deterministic discovery, Dirac micro-context extraction,
 * and automated plan-based remediation for linear search anti-patterns,
 * structuredClone migration, and ReadonlySet hoists.
 */

import {
  executePlanFileReplacements,
  forEachSourceScriptLine,
  isSameFilePath
} from './refactorFileScanner.ts';
import type {
  O1FindingItem,
  O1RefactorPlan
} from './refactorContracts.ts';
import { BaseRefactorEngine } from './baseRefactorEngine.ts';

const STATIC_ARRAY_INCLUDES_REGEX =
  /(?:\(\s*)?\b([A-Z][A-Z0-9_]+_(?:IDS|LIST|TYPES|CATEGORIES|NAMES|KINDS|ORDER|ERRORS|ITEMS|CONFIGS|DEFAULTS|FAMILIES|[A-Z0-9]+))(?:\s+as\s+[^)\s]+(?:\s+[^)\s]+)*)?(?:\s*\))?\.(includes|indexOf)\s*\(([^)]+)\)/g;

const JSON_CLONE_REGEX = /\bJSON\.parse\s*\(\s*JSON\.stringify\s*\(([^)]+)\)\s*\)/g;
const REDUNDANT_SPREAD_RETURN_REGEX = /return\s*\[\s*\.\.\.([\w$.]+(?:\([^)]*\))?)\s*\]\s*;/g;

export class O1RefactorEngine extends BaseRefactorEngine<O1FindingItem, O1RefactorPlan> {
  public readonly toolId = 'auditor-o1';
  public readonly configSectionKey = 'codeSimplification' as const;
  public readonly allowedExtensions = new Set<string>(['.ts', '.vue']);

  public override discoverInFile(filePath: string): readonly O1FindingItem[] {
    return O1RefactorEngine.discoverInFile(filePath);
  }

  public override createPlan(
    o1PlanId: string,
    o1Findings: readonly O1FindingItem[]
  ): O1RefactorPlan {
    return O1RefactorEngine.buildOptimizationPlan(o1PlanId, o1Findings);
  }

  public override applyPlan(
    projectRoot: string,
    plan: O1RefactorPlan
  ): { readonly modifiedFiles: readonly string[] } {
    O1RefactorEngine.applyPlan(projectRoot, plan);
    return { modifiedFiles: plan.targetFiles };
  }
  /**
   * Scans a file to discover O(1) optimization opportunities.
   */
  public static discoverInFile(filePath: string): readonly O1FindingItem[] {
    const findings: O1FindingItem[] = [];

    forEachSourceScriptLine(filePath, (line, actualLine) => {
      // Escape hatches
      if (line.includes('// o1-ok:') || line.includes('// linear-search-ok:')) {
        return;
      }

      // 1. JSON.parse(JSON.stringify(x)) -> structuredClone(x)
      JSON_CLONE_REGEX.lastIndex = 0;
      let jsonMatch: RegExpExecArray | null;
      while ((jsonMatch = JSON_CLONE_REGEX.exec(line)) !== null) {
        const fullMatch = jsonMatch[0];
        const expr = jsonMatch[1];
        if (!fullMatch || !expr) continue;

        findings.push({
          file: filePath,
          line: actualLine,
          kind: 'json-clone',
          ruleId: 'o1-json-clone',
          originalSnippet: fullMatch,
          suggestedReplacement: `structuredClone(${expr.trim()})`,
          explanation: `JSON.parse(JSON.stringify()) is slow and loses dates/types; use native Node.js structuredClone().`
        });
      }

      // 2. Redundant spread return: return [...arr]; -> return arr;
      REDUNDANT_SPREAD_RETURN_REGEX.lastIndex = 0;
      let spreadMatch: RegExpExecArray | null;
      while ((spreadMatch = REDUNDANT_SPREAD_RETURN_REGEX.exec(line)) !== null) {
        const fullMatch = spreadMatch[0];
        const expr = spreadMatch[1];
        if (!fullMatch || !expr) continue;

        findings.push({
          file: filePath,
          line: actualLine,
          kind: 'redundant-spread',
          ruleId: 'o1-redundant-spread-return',
          originalSnippet: fullMatch,
          suggestedReplacement: `return ${expr.trim()};`,
          explanation: `Redundant shallow clone on return; return directly or mark function return type as readonly T[].`
        });
      }

      // 3. Constant array .includes() / .indexOf() -> Set.has()
      STATIC_ARRAY_INCLUDES_REGEX.lastIndex = 0;
      let incMatch: RegExpExecArray | null;
      while ((incMatch = STATIC_ARRAY_INCLUDES_REGEX.exec(line)) !== null) {
        const fullMatch = incMatch[0];
        const arrayIdent = incMatch[1];
        const method = incMatch[2];
        const arg = incMatch[3];
        if (!fullMatch || !arrayIdent || !method || !arg) continue;

        const setIdent = `${arrayIdent}_SET`;
        const suggested = method === 'indexOf'
          ? `(${setIdent}.has(${arg.trim()}) ? 0 : -1)`
          : `${setIdent}.has(${arg.trim()})`;

        findings.push({
          file: filePath,
          line: actualLine,
          kind: 'linear-membership',
          ruleId: 'o1-linear-membership',
          identifier: arrayIdent,
          originalSnippet: fullMatch,
          suggestedReplacement: suggested,
          explanation: `Linear search O(N) via ${arrayIdent}.${method}(); hoist ${setIdent} = new Set(${arrayIdent}) for O(1) membership lookup.`
        });
      }
    });

    return findings;
  }

  /**
   * Builds a declarative O1RefactorPlan from findings.
   */
  public static buildOptimizationPlan(
    planId: string,
    findings: readonly O1FindingItem[]
  ): O1RefactorPlan {
    const files = [...new Set(findings.map((f) => f.file))];
    const membershipHoistsMap = new Map<string, Map<string, number[]>>();
    const jsonCloneReplacements: Array<{
      file: string;
      line: number;
      originalExpression: string;
      replacementExpression: string;
    }> = [];
    const spreadReplacements: Array<{
      file: string;
      line: number;
      originalReturn: string;
      replacementReturn: string;
    }> = [];

    for (const f of findings) {
      if (f.kind === 'linear-membership' && f.identifier) {
        if (!membershipHoistsMap.has(f.file)) {
          membershipHoistsMap.set(f.file, new Map());
        }
        const fileMap = membershipHoistsMap.get(f.file)!;
        if (!fileMap.has(f.identifier)) {
          fileMap.set(f.identifier, []);
        }
        fileMap.get(f.identifier)!.push(f.line);
      } else if (f.kind === 'json-clone') {
        jsonCloneReplacements.push({
          file: f.file,
          line: f.line,
          originalExpression: f.originalSnippet,
          replacementExpression: f.suggestedReplacement
        });
      } else if (f.kind === 'redundant-spread') {
        spreadReplacements.push({
          file: f.file,
          line: f.line,
          originalReturn: f.originalSnippet,
          replacementReturn: f.suggestedReplacement
        });
      }
    }

    const membershipHoists: Array<{
      file: string;
      arrayIdentifier: string;
      setIdentifier: string;
      callLines: readonly number[];
    }> = [];

    for (const [file, fileMap] of membershipHoistsMap.entries()) {
      for (const [arrayIdentifier, callLines] of fileMap.entries()) {
        membershipHoists.push({
          file,
          arrayIdentifier,
          setIdentifier: `${arrayIdentifier}_SET`,
          callLines
        });
      }
    }

    return {
      version: 1,
      planId,
      targetFiles: files,
      membershipHoists,
      jsonCloneReplacements,
      spreadReplacements
    };
  }

  public static createPlan(
    planId: string,
    findings: readonly O1FindingItem[]
  ): O1RefactorPlan {
    return O1RefactorEngine.buildOptimizationPlan(planId, findings);
  }

  private static applyHoistReplacements(
    initialContent: string,
    relFile: string,
    fullPath: string,
    baseDir: string,
    hoists?: readonly { file: string; arrayIdentifier: string; setIdentifier: string }[]
  ): { content: string; count: number } {
    if (!hoists) return { content: initialContent, count: 0 };
    let content = initialContent;
    let count = 0;
    for (const hoist of hoists) {
      if (!isSameFilePath(hoist.file, relFile, baseDir) && !isSameFilePath(hoist.file, fullPath, baseDir)) {
        continue;
      }

      const incPattern = new RegExp(`\\b${hoist.arrayIdentifier}\\.includes\\s*\\(`, 'g');
      if (incPattern.test(content)) {
        content = content.replace(incPattern, `${hoist.setIdentifier}.has(`);
        count++;
      }

      if (content.includes(`const ${hoist.setIdentifier}`)) continue;

      const arrayDefRegex = new RegExp(
        `((?:export\\s+)?const\\s+${hoist.arrayIdentifier}\\s*=[^;]+;)`,
        'm'
      );
      if (arrayDefRegex.test(content)) {
        content = content.replace(
          arrayDefRegex,
          `$1\nexport const ${hoist.setIdentifier}: ReadonlySet<any> = new Set(${hoist.arrayIdentifier});`
        );
      } else {
        content = `const ${hoist.setIdentifier}: ReadonlySet<any> = new Set(${hoist.arrayIdentifier});\n${content}`;
      }
      count++;
    }
    return { content, count };
  }

  /**
   * Applies an O1RefactorPlan deterministically onto target files.
   */
  public static applyPlan(
    baseDir: string,
    plan: O1RefactorPlan
  ): { readonly filesChanged: number; readonly changesApplied: number } {
    const jsonTextItems = plan.jsonCloneReplacements?.map((r) => ({
      file: r.file,
      original: r.originalExpression,
      replacement: r.replacementExpression
    }));

    const spreadTextItems = plan.spreadReplacements?.map((r) => ({
      file: r.file,
      original: r.originalReturn,
      replacement: r.replacementReturn
    }));

    return executePlanFileReplacements(
      baseDir,
      plan.targetFiles,
      [jsonTextItems, spreadTextItems],
      [
        (content, relFile, fullPath, bDir) =>
          this.applyHoistReplacements(content, relFile, fullPath, bDir, plan.membershipHoists)
      ]
    );
  }
}
