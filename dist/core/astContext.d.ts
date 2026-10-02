/**
 * scripts/lib/astContext.ts
 *
 * SHARED AST ENGINE & REPOSITORY (Node.js 26+)
 * Provides centralized, memoized TypeScript AST creation and caching across all sub-auditors:
 *   1. Eliminates duplicate file parsing across concurrent or sequential audit suites.
 *   2. Provides O(1) in-memory retrieval of pre-compiled ts.SourceFile objects.
 *   3. Supports Vue Single File Components (SFC) script block extraction with line offset preservation.
 */
import ts from 'typescript';
export interface ExtractedScript {
    readonly scriptContent: string;
    readonly offsetLine: number;
}
export declare class SharedAstContext {
    private readonly sourceFiles;
    private readonly extractedScripts;
    /**
     * Checks whether an AST for the given normalized file path is already in cache.
     */
    hasSourceFile(filePath: string): boolean;
    /**
     * Retrieves an existing ts.SourceFile or creates and caches it on-demand.
     * If content is omitted, the file is read synchronously from disk.
     */
    getSourceFile(filePath: string, content?: string): ts.SourceFile;
    /**
     * Extracts the main `<script>` or `<script setup>` block from a Vue SFC.
     * Caches results to avoid repeated regex searches on the same component.
     */
    extractScript(content: string, filePath: string): ExtractedScript;
    /**
     * Batch pre-parses and caches an array of files into the AST repository.
     */
    preParseFiles(filePaths: readonly string[]): void;
    /**
     * Returns the count of unique AST SourceFiles currently in memory cache.
     */
    get size(): number;
    /**
     * Clears the AST repository cache to free memory.
     */
    clear(): void;
    private normalizePath;
}
//# sourceMappingURL=astContext.d.ts.map