import ts from "typescript";
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
/**
 * Creates a synthetic, empty ts.SourceFile for use with ts.Printer when printing generated AST nodes.
 */
export declare function createSyntheticSourceFile(fileName?: string): ts.SourceFile;
/**
 * Helper to print an AST node using a synthetic source file.
 */
export declare function printAstNode(node: ts.Node, printer?: ts.Printer, hint?: ts.EmitHint): string;
export declare function extractExportedConfigObjectLiteral(source: ts.SourceFile): ts.ObjectLiteralExpression | null;
export declare function dtoValueToTsExpression(value: unknown): ts.Expression;
export declare function formatTsNodeTwoSpaceIndent(node: ts.Node, hint?: ts.EmitHint): string;