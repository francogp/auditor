/**
 * scripts/lib/astContext.ts
 *
 * SHARED AST ENGINE & REPOSITORY (Node.js 26+)
 * Provides centralized, memoized TypeScript AST creation and caching across all sub-auditors:
 *   1. Eliminates duplicate file parsing across concurrent or sequential audit suites.
 *   2. Provides O(1) in-memory retrieval of pre-compiled ts.SourceFile objects.
 *   3. Supports Vue Single File Components (SFC) script block extraction with line offset preservation.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { enableCompileCache } from 'node:module';

enableCompileCache();

export interface ExtractedScript {
  readonly scriptContent: string;
  readonly offsetLine: number;
}

export class SharedAstContext {
  private readonly sourceFiles: Map<string, ts.SourceFile> = new Map();
  private readonly extractedScripts: Map<string, ExtractedScript> = new Map();

  /**
   * Checks whether an AST for the given normalized file path is already in cache.
   */
  public hasSourceFile(filePath: string): boolean {
    const norm = this.normalizePath(filePath);
    return this.sourceFiles.has(norm);
  }

  /**
   * Retrieves an existing ts.SourceFile or creates and caches it on-demand.
   * If content is omitted, the file is read synchronously from disk.
   */
  public getSourceFile(filePath: string, content?: string): ts.SourceFile {
    const norm = this.normalizePath(filePath);
    const existing = this.sourceFiles.get(norm);
    if (existing) {
      return existing;
    }

    const rawContent = content !== undefined ? content : fs.readFileSync(filePath, 'utf-8');
    const isVue = norm.endsWith('.vue');

    let codeToParse = rawContent;
    if (isVue) {
      const extracted = this.extractScript(rawContent, norm);
      const match = rawContent.match(/<script\b[^>]*>/i);
      const openTagEnd = match && match.index !== undefined ? match.index + match[0].length : 0;
      const linesBefore = (rawContent.substring(0, openTagEnd).match(/\n/g) ?? []).length;
      codeToParse = '\n'.repeat(linesBefore) + extracted.scriptContent;
    }

    const sf = ts.createSourceFile(
      path.basename(norm),
      codeToParse,
      ts.ScriptTarget.Latest,
      true,
      isVue ? ts.ScriptKind.TS : undefined
    );

    this.sourceFiles.set(norm, sf);
    return sf;
  }

  /**
   * Extracts the main `<script>` or `<script setup>` block from a Vue SFC.
   * Caches results to avoid repeated regex searches on the same component.
   */
  public extractScript(content: string, filePath: string): ExtractedScript {
    const norm = this.normalizePath(filePath);
    const cached = this.extractedScripts.get(norm);
    if (cached) return cached;

    // Prefer <script setup ...> if present, otherwise standard <script ...>
    const setupMatch = content.match(/<script\b[^>]*\bsetup\b[^>]*>([\s\S]*?)<\/script>/i);
    const standardMatch = content.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
    const match = setupMatch || standardMatch;

    if (!match || match.index === undefined) {
      const empty: ExtractedScript = { scriptContent: '', offsetLine: 0 };
      this.extractedScripts.set(norm, empty);
      return empty;
    }

    const scriptContent = match[1] ?? '';
    const codeBeforeScript = content.substring(0, match.index);
    const offsetLine = (codeBeforeScript.match(/\n/g) ?? []).length + 1;

    const result: ExtractedScript = { scriptContent, offsetLine };
    this.extractedScripts.set(norm, result);
    return result;
  }

  /**
   * Batch pre-parses and caches an array of files into the AST repository.
   */
  public preParseFiles(filePaths: readonly string[]): void {
    for (const file of filePaths) {
      try {
        this.getSourceFile(file);
      } catch {
        // Ignore read/syntax errors on inaccessible files
      }
    }
  }

  /**
   * Returns the count of unique AST SourceFiles currently in memory cache.
   */
  public get size(): number {
    return this.sourceFiles.size;
  }

  /**
   * Clears the AST repository cache to free memory.
   */
  public clear(): void {
    this.sourceFiles.clear();
    this.extractedScripts.clear();
  }

  private normalizePath(p: string): string {
    return path.resolve(p).split(path.sep).join(path.posix.sep);
  }
}
