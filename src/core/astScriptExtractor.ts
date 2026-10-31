/**
 * src/core/astScriptExtractor.ts
 *
 * UNIFIED 1:1 AST SCRIPT EXTRACTOR & CODE MUTATION ENGINE (Node.js 26+ Native)
 *
 * Provides coordinate-preserving script extraction for TypeScript and Vue Single File Components (SFC).
 * Non-script content (templates, styles, markup) is masked with spaces while preserving line breaks (`\n`),
 * guaranteeing 100% 1:1 character offset, line, and column parity between the parsed AST and the file on disk.
 */

import fs from 'node:fs';
import { enableCompileCache } from 'node:module';
import path from 'node:path';

import ts from 'typescript';

enableCompileCache();

export interface AstTextReplacement {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const VUE_SCRIPT_BLOCK_REGEX = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;

/**
 * Extracts script content from a source string.
 * For .vue files, masks non-script regions into spaces while preserving line breaks,
 * ensuring character offsets computed by TypeScript AST match the original file on disk.
 */
export function extractUnifiedScriptBuffer(sourceText: string, isVue: boolean): string {
  if (!isVue) {
    return sourceText;
  }

  let result = '';
  let lastIndex = 0;
  VUE_SCRIPT_BLOCK_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = VUE_SCRIPT_BLOCK_REGEX.exec(sourceText)) !== null) {
    const fullMatchStart = match.index;
    const openTagEndOffset = match[0].indexOf('>') + 1;
    const contentStart = fullMatchStart + openTagEndOffset;
    const closeTagOffset = match[0].lastIndexOf('</script>');
    const contentEnd = fullMatchStart + closeTagOffset;

    // Mask everything before contentStart (template, styles, opening <script ...> tag) with spaces
    for (let i = lastIndex; i < contentStart; i++) {
      result += sourceText[i] === '\n' ? '\n' : ' ';
    }

    // Preserve raw script body exactly
    result += sourceText.slice(contentStart, contentEnd);
    lastIndex = contentEnd;
  }

  // Mask remaining trailing content (closing tags, styles, template) with spaces
  for (let i = lastIndex; i < sourceText.length; i++) {
    result += sourceText[i] === '\n' ? '\n' : ' ';
  }

  return result;
}

/**
 * Creates a ts.SourceFile with 1:1 coordinate parity with the disk file.
 */
export function createUnifiedAstSourceFile(
  filePath: string,
  sourceText: string
): {
  readonly sourceFile: ts.SourceFile;
  readonly textToParse: string;
  readonly isVue: boolean;
} {
  const isVue = filePath.endsWith('.vue');
  const textToParse = extractUnifiedScriptBuffer(sourceText, isVue);

  const sourceFile = ts.createSourceFile(
    filePath,
    textToParse,
    ts.ScriptTarget.Latest,
    true,
    isVue ? ts.ScriptKind.TS : undefined
  );

  return { sourceFile, textToParse, isVue };
}

/**
 * Applies a list of text replacements to a source text string.
 * Automatically deduplicates and sorts replacements in descending offset order (bottom-to-top),
 * ensuring node edits do not shift token coordinates of preceding modifications.
 */
export function applyAstReplacements(
  sourceText: string,
  replacements: readonly AstTextReplacement[]
): string {
  if (replacements.length === 0) {
    return sourceText;
  }

  // Sort descending by start position to prevent offset drift
  const sorted = [...replacements].sort((a, b) => {
    if (b.start !== a.start) return b.start - a.start;
    return b.end - a.end;
  });

  // Deduplicate overlapping identical edits
  const filtered: AstTextReplacement[] = [];
  let lastStart = Infinity;

  for (const rep of sorted) {
    if (rep.end <= lastStart) {
      filtered.push(rep);
      lastStart = rep.start;
    }
  }

  let updated = sourceText;
  for (const rep of filtered) {
    updated = updated.slice(0, rep.start) + rep.text + updated.slice(rep.end);
  }

  return updated;
}

/**
 * Deterministically applies AST replacements across a list of target files.
 */
export function applyAstReplacementsAcrossFiles(
  targetDir: string,
  targetFiles: readonly string[],
  computeReplacements: (fullPath: string, sourceText: string) => readonly AstTextReplacement[]
): { readonly filesChanged: number; readonly changesApplied: number } {
  let filesChanged = 0;
  let changesApplied = 0;

  for (const relFile of targetFiles) {
    const fullPath = path.isAbsolute(relFile) ? relFile : path.resolve(targetDir, relFile);
    if (!fs.existsSync(fullPath)) continue;

    const sourceText = fs.readFileSync(fullPath, 'utf-8');
    const replacements = computeReplacements(fullPath, sourceText);
    if (replacements.length === 0) continue;

    const updated = applyAstReplacements(sourceText, replacements);
    if (updated !== sourceText) {
      fs.writeFileSync(fullPath, updated, 'utf-8');
      filesChanged++;
      changesApplied += replacements.length;
    }
  }

  return { filesChanged, changesApplied };
}
