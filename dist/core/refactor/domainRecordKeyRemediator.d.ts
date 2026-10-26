/**
 * src/core/refactor/domainRecordKeyRemediator.ts
 *
 * CANONICAL DOMAIN RECORD KEY REMEDIATOR (Node.js 26+ Native)
 * Provides standalone AST discovery and deterministic remediation for prohibited open Record<string, T>
 * contracts, transforming them to nominal domain keys or DisplayText primitives.
 */
export interface RecordKeyFinding {
  readonly filePath: string;
  readonly line: number;
  readonly originalSnippet: string;
  readonly suggestedReplacement: string;
}
/**
 * Discovers Record<string, T> and Record<PropertyKey, T> declarations via TypeScript AST.
 */
export declare function discoverRecordKeyFindings(filePath: string, sourceText: string): readonly RecordKeyFinding[];
/**
 * Safely injects an import statement into source code, handling Vue SFC, shebangs, and TS files.
 */
export declare function injectImportStatement(content: string, importToAdd: string, isVue: boolean): string;
/**
 * Remediates Record<string, T> occurrences in a target contract file.
 */
export declare function remediateRecordKeysInFile(fullPath: string, projectRoot: string): {
  readonly changed: boolean;
  readonly replacementCount: number;
};