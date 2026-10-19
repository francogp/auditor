//#region src/core/refactor/refactorFileScanner.d.ts
/**
 * src/core/refactor/refactorFileScanner.ts
 *
 * Shared filesystem scanner and text replacement utilities for refactoring engines.
 * Strictly uses Node.js native standard library (node:path, node:fs) for 100% cross-platform safety.
 */
/**
 * Checks if two path references resolve to the same underlying file in a cross-platform manner.
 */
export declare function isSameFilePath(fileA: string, fileB: string, baseDir?: string): boolean;
/**
 * Scans project code roots dynamically driven by audit.config.ts,
 * respecting codeRoots, ignoreGlobs, test exclusions, and file exemptions.
 */
export declare function scanProjectSourceFiles(dir: string, allowedExtensions?: ReadonlySet<string>): readonly string[];
/**
 * Extracts script content and line offset from TypeScript, JavaScript, or Vue SFC files.
 */
export declare function extractFileScriptContent(filePath: string): {
  readonly scriptContent: string;
  readonly lineOffset: number;
} | null;
/**
 * Iterates through non-empty lines of a source script (TS/JS/Vue SFC) providing the line and actual line number.
 */
export declare function forEachSourceScriptLine(filePath: string, onLine: (line: string, actualLineNumber: number, lineIndex: number, allLines: readonly string[]) => void): boolean;
export interface RefactorTextReplacement {
  readonly file: string;
  readonly original: string;
  readonly replacement: string;
}
/**
 * Applies a list of exact text replacements to content if the target file matches.
 */
export declare function applyFileTextReplacements(initialContent: string, relFile: string, fullPath: string, baseDir: string, replacements?: readonly RefactorTextReplacement[]): {
  readonly content: string;
  readonly count: number;
};
export type FileContentTransformer = (content: string, relFile: string, fullPath: string, baseDir: string) => {
  readonly content: string;
  readonly count: number;
};
/**
 * Deterministically applies grouped text replacements to all targeted files across a project.
 */
export declare function executePlanFileReplacements(baseDir: string, targetFiles: readonly string[], replacementGroups: readonly (readonly RefactorTextReplacement[] | undefined)[], customTransformers?: readonly FileContentTransformer[]): {
  readonly filesChanged: number;
  readonly changesApplied: number;
};
//#endregion