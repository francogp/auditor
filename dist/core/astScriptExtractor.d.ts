import ts from "typescript";
export interface AstTextReplacement {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}
/**
 * Extracts script content from a source string.
 * For .vue files, masks non-script regions into spaces while preserving line breaks,
 * ensuring character offsets computed by TypeScript AST match the original file on disk.
 */
export declare function extractUnifiedScriptBuffer(sourceText: string, isVue: boolean): string;
/**
 * Creates a ts.SourceFile with 1:1 coordinate parity with the disk file.
 */
export declare function createUnifiedAstSourceFile(filePath: string, sourceText: string): {
  readonly sourceFile: ts.SourceFile;
  readonly textToParse: string;
  readonly isVue: boolean;
};
/**
 * Applies a list of text replacements to a source text string.
 * Automatically deduplicates and sorts replacements in descending offset order (bottom-to-top),
 * ensuring node edits do not shift token coordinates of preceding modifications.
 */
export declare function applyAstReplacements(sourceText: string, replacements: readonly AstTextReplacement[]): string;
/**
 * Deterministically applies AST replacements across a list of target files.
 */
export declare function applyAstReplacementsAcrossFiles(targetDir: string, targetFiles: readonly string[], computeReplacements: (fullPath: string, sourceText: string) => readonly AstTextReplacement[]): {
  readonly filesChanged: number;
  readonly changesApplied: number;
};