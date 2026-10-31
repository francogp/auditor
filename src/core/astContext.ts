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
import { enableCompileCache } from 'node:module';
import path from 'node:path';

import ts from 'typescript';

import { normalizePosixPath } from './safePath.ts';
import { tryCatchSync } from './safeUtils.ts';

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
      const linesBefore = Math.max(0, extracted.offsetLine - 1);
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
    const setupMatch = content.match(/<script\b[^>]+?\bsetup\b[^>]*>([\s\S]*?)<\/script>/i);
    const standardMatch = content.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
    const match = setupMatch || standardMatch;

    if (!match || match.index === undefined) {
      const empty: ExtractedScript = { scriptContent: '', offsetLine: 0 };
      this.extractedScripts.set(norm, empty);
      return empty;
    }

    const scriptContent = match[1] ?? '';
    const openTagLength = match[0].indexOf(scriptContent);
    const codeBeforeScriptContent = content.substring(0, match.index + Math.max(openTagLength, 0));
    const offsetLine = (codeBeforeScriptContent.match(/\n/g) ?? []).length + 1;

    const result: ExtractedScript = { scriptContent, offsetLine };
    this.extractedScripts.set(norm, result);
    return result;
  }

  /**
   * Batch pre-parses and caches an array of files into the AST repository.
   */
  public preParseFiles(filePaths: readonly string[]): void {
    for (const file of filePaths) {
      tryCatchSync(() => {
        this.getSourceFile(file);
      });
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
    return normalizePosixPath(p);
  }
}

/**
 * Creates a synthetic, empty ts.SourceFile for use with ts.Printer when printing generated AST nodes.
 */
export function createSyntheticSourceFile(fileName = 'synthetic.ts'): ts.SourceFile {
  return ts.createSourceFile(fileName, '', ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
}

/**
 * Helper to print an AST node using a synthetic source file.
 */
export function printAstNode(
  node: ts.Node,
  printer: ts.Printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }),
  hint: ts.EmitHint = ts.EmitHint.Unspecified
): string {
  const dummy = createSyntheticSourceFile();
  return printer.printNode(hint, node, dummy);
}

export function extractExportedConfigObjectLiteral(
  source: ts.SourceFile
): ts.ObjectLiteralExpression | null {
  const exportAssign = source.statements.find(ts.isExportAssignment);
  const expr = exportAssign?.expression;
  if (!expr) return null;
  if (ts.isObjectLiteralExpression(expr)) return expr;
  if (
    ts.isCallExpression(expr) &&
    expr.arguments[0] &&
    ts.isObjectLiteralExpression(expr.arguments[0])
  ) {
    return expr.arguments[0];
  }
  return null;
}

export function dtoValueToTsExpression(value: unknown): ts.Expression {
  if (typeof value === 'string') return ts.factory.createStringLiteral(value, true);
  if (typeof value === 'number') {
    return value < 0
      ? ts.factory.createPrefixUnaryExpression(
          ts.SyntaxKind.MinusToken,
          ts.factory.createNumericLiteral(Math.abs(value))
        )
      : ts.factory.createNumericLiteral(value);
  }
  if (typeof value === 'boolean') return value ? ts.factory.createTrue() : ts.factory.createFalse();
  if (value === null || value === undefined) return ts.factory.createNull();
  if (Array.isArray(value)) {
    const elements = value.map((item) => dtoValueToTsExpression(item));
    const multiLine =
      value.length > 3 || value.some((item) => typeof item === 'object' && item !== null);
    return ts.factory.createArrayLiteralExpression(elements, multiLine);
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined
    );
    const props = entries.map(([k, v]) => {
      const propName = /^[a-z_$][\w$]*$/i.test(k)
        ? ts.factory.createIdentifier(k)
        : ts.factory.createStringLiteral(k, true);
      return ts.factory.createPropertyAssignment(propName, dtoValueToTsExpression(v));
    });
    return ts.factory.createObjectLiteralExpression(props, entries.length > 0);
  }
  return ts.factory.createNull();
}

export function formatTsNodeTwoSpaceIndent(node: ts.Node, hint = ts.EmitHint.Unspecified): string {
  return printAstNode(node, undefined, hint)
    .split('\n')
    .map((line) => line.replace(/^( {4})+/, (m) => ' '.repeat(m.length / 2)))
    .join('\n');
}
