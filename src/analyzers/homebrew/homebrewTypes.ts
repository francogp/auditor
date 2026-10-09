/**
 * src/analyzers/homebrew/homebrewTypes.ts
 *
 * Types and interfaces for the dynamic auditor and extension homebrew code detection engine.
 */

import type { FindingSeverity } from '../../core/auditContract.ts';

export const AUDITOR_HOMEBREW_RULES = [
  'auditor-manual-package-json',
  'auditor-manual-vue-sfc-regex',
  'auditor-manual-ts-ast',
  'auditor-manual-path-normalize',
  'auditor-raw-console',
  'auditor-manual-comment-stripping',
  'auditor-manual-brace-counting',
  'auditor-manual-path-containment',
  'auditor-manual-file-walker',
  'auditor-homebrew-predicates'
] as const;

export type AuditorHomebrewRuleId = (typeof AUDITOR_HOMEBREW_RULES)[number];

export interface HomebrewInspectionContext {
  readonly filePath: string;          // Normalized POSIX relative path
  readonly absolutePath: string;      // Absolute filesystem path
  readonly content: string;           // Full file text content
  readonly lines: readonly string[];  // File lines
  readonly isExtension: boolean;      // True if defined in scripts/auditors or host extensions
  readonly isBuiltinSuite: boolean;   // True if residing in src/suites/
  readonly isAnalyzer: boolean;       // True if residing in src/analyzers/
  readonly projectRoot: string;       // Repository root
}

export interface HomebrewFinding {
  readonly ruleId: AuditorHomebrewRuleId;
  readonly line: number;
  readonly message: string;
  readonly context?: string;
  readonly severity?: FindingSeverity;
}

export interface HomebrewDetector {
  readonly id: string;
  readonly ruleId: AuditorHomebrewRuleId;
  readonly ruleDescription: string;   // Pure Spanish description (max 41 chars)
  detect(context: HomebrewInspectionContext): HomebrewFinding[];
}

export interface LineDetectorOptions {
  readonly id: string;
  readonly ruleId: AuditorHomebrewRuleId;
  readonly ruleDescription: string;
  readonly checkLine: (
    line: string,
    trimmed: string,
    lineNum: number,
    context: HomebrewInspectionContext
  ) => { message: string; context?: string; severity?: FindingSeverity } | string | null | void;
}

export function createLineDetector(options: LineDetectorOptions): HomebrewDetector {
  return {
    id: options.id,
    ruleId: options.ruleId,
    ruleDescription: options.ruleDescription,
    detect(context: HomebrewInspectionContext): HomebrewFinding[] {
      if (context.filePath.includes('core/')) return [];

      const findings: HomebrewFinding[] = [];

      context.lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;

        const result = options.checkLine(line, trimmed, lineNum, context);
        if (result) {
          if (typeof result === 'string') {
            findings.push({
              ruleId: options.ruleId,
              line: lineNum,
              message: result,
              context: trimmed,
              severity: 'error'
            });
          } else {
            findings.push({
              ruleId: options.ruleId,
              line: lineNum,
              message: result.message,
              context: result.context ?? trimmed,
              severity: result.severity ?? 'error'
            });
          }
        }
      });

      return findings;
    }
  };
}
