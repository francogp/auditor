/**
 * packages/auditor/src/core/auditedDocument.ts
 *
 * CENTRAL AUDITED DOCUMENT ENGINE (Node.js 26+ Native)
 *
 * Provides a high-performance, immutable abstraction for scanned source files:
 * 1. O(log N) line and column resolution via binary search over pre-computed line offsets.
 * 2. Lexical indexing for comments (line, block, HTML) and strings with O(log K) range lookup.
 * 3. Pre-computed escape hatch indexer supporting rule-specific directives (// <rule>-ok:),
 *    file-level suppressions (// auditor-disable <rule>), and common short aliases.
 * 4. Canonical Vue Single-File Component (SFC) extraction for <script>, <template>, and <style>.
 * 5. Transparent TypeScript AST generation with line-offset preservation for SFC scripts.
 * 6. Deterministic auto-fix replacement register applying non-overlapping transformations from end-to-start.
 */

import path from 'node:path';
import fs from 'node:fs';
import ts from 'typescript';
import type { SharedAstContext } from './astContext.ts';

export interface LineColumnPosition {
  readonly line: number;
  readonly column: number;
  readonly lineText: string;
}

export type LexicalRangeKind = 'comment_line' | 'comment_block' | 'comment_html' | 'string_single' | 'string_double' | 'string_template';

export interface LexicalRange {
  readonly start: number;
  readonly end: number;
  readonly kind: LexicalRangeKind;
}

export interface VueScriptBlock {
  readonly start: number;
  readonly end: number;
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly tagLine: number;
  readonly startLine: number;
  readonly content: string;
  readonly isSetup: boolean;
  readonly lang?: string;
}

export interface VueTemplateBlock {
  readonly start: number;
  readonly end: number;
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly tagLine: number;
  readonly startLine: number;
  readonly content: string;
}

export interface VueStyleBlock {
  readonly start: number;
  readonly end: number;
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly tagLine: number;
  readonly startLine: number;
  readonly content: string;
  readonly scoped: boolean;
  readonly lang?: string;
}

export interface VueSfcBlocks {
  readonly scripts: readonly VueScriptBlock[];
  readonly template?: VueTemplateBlock;
  readonly styles: readonly VueStyleBlock[];
}

export interface DocumentReplacement {
  readonly start: number;
  readonly end: number;
  readonly newText: string;
  readonly ruleId?: string;
  readonly description?: string;
}

export interface EscapeHatchMatch {
  readonly line: number;
  readonly rawText: string;
  readonly ruleToken: string;
  readonly reason?: string;
}

/** Binary search to find line index from character offset */
function binarySearchLineIndex(lineOffsets: readonly number[], offset: number): number {
  let low = 0;
  let high = lineOffsets.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const current = lineOffsets[mid]!;
    if (current <= offset) {
      if (mid === lineOffsets.length - 1 || (lineOffsets[mid + 1]! > offset)) {
        return mid;
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return 0;
}

/** Binary search to find if an offset falls within any sorted non-overlapping lexical range */
function binarySearchLexicalRange(ranges: readonly LexicalRange[], offset: number): LexicalRange | undefined {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const r = ranges[mid]!;
    if (offset >= r.start && offset < r.end) {
      return r;
    }
    if (offset < r.start) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return undefined;
}

/** Intermediate descriptor for parsed XML/HTML tag blocks */
interface RawTagMatch {
  readonly start: number;
  readonly end: number;
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly tagLine: number;
  readonly startLine: number;
  readonly content: string;
  readonly attrs: string;
}

function extractRawTagMatches(content: string, tagName: string, doc: AuditedDocument): RawTagMatch[] {
  const matches: RawTagMatch[] = [];
  const regex = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  let m: RegExpExecArray | null;

  while ((m = regex.exec(content)) !== null) {
    const attrs = m[1] ?? '';
    const inner = m[2] ?? '';
    const start = m.index;
    const end = start + m[0].length;
    const contentStart = start + m[0].indexOf('>') + 1;
    const contentEnd = contentStart + inner.length;
    const tagLine = doc.getLineAndColumn(start).line;
    const startLine = tagLine + (inner.startsWith('\n') || inner.startsWith('\r\n') ? 1 : 0);

    matches.push({
      start,
      end,
      contentStart,
      contentEnd,
      tagLine,
      startLine,
      content: inner,
      attrs
    });
  }

  return matches;
}

export class AuditedDocument {
  public readonly filePath: string;
  public readonly relPath: string;
  public readonly rawContent: string;
  public readonly lines: readonly string[];
  public readonly lineOffsets: readonly number[];

  private readonly astContext?: SharedAstContext;
  private cachedAst?: ts.SourceFile;
  private cachedLexicalRanges?: readonly LexicalRange[];
  private cachedVueBlocks?: VueSfcBlocks | null;
  private cachedEscapeHatches?: readonly EscapeHatchMatch[];
  private readonly fileDisabledRules: Set<string> = new Set();
  private readonly replacements: DocumentReplacement[] = [];

  constructor(filePath: string, rawContent: string, relPath?: string, astContext?: SharedAstContext) {
    this.filePath = filePath;
    this.rawContent = rawContent;
    this.relPath = relPath ?? filePath;
    this.astContext = astContext;

    // Build line offsets and split lines
    const offsets: number[] = [0];
    const len = rawContent.length;
    for (let i = 0; i < len; i++) {
      if (rawContent[i] === '\n') {
        offsets.push(i + 1);
      }
    }
    this.lineOffsets = offsets;
    this.lines = rawContent.split(/\r?\n/);
  }

  /**
   * Retrieves 1-indexed line and column with full lineText via O(log N) binary search.
   */
  public getLineAndColumn(offset: number): LineColumnPosition {
    const clamped = Math.max(0, Math.min(this.rawContent.length, offset));
    const lineIndex = binarySearchLineIndex(this.lineOffsets, clamped);
    const lineStart = this.lineOffsets[lineIndex] ?? 0;
    const line = lineIndex + 1;
    const column = clamped - lineStart + 1;
    const lineText = this.lines[lineIndex] ?? '';
    return { line, column, lineText };
  }

  /**
   * Returns character offset given 1-indexed line and column numbers.
   */
  public getOffset(line: number, column: number = 1): number {
    const lineIdx = Math.max(0, Math.min(this.lines.length - 1, line - 1));
    const lineStart = this.lineOffsets[lineIdx] ?? 0;
    return lineStart + Math.max(0, column - 1);
  }

  /**
   * Computes or returns cached sorted lexical ranges for comments and strings.
   */
  public getLexicalRanges(): readonly LexicalRange[] {
    if (this.cachedLexicalRanges) {
      return this.cachedLexicalRanges;
    }

    const ranges: LexicalRange[] = [];
    const content = this.rawContent;
    const limit = content.length;
    let i = 0;

    while (i < limit) {
      const ch = content[i];

      // Single-line comment //
      if (ch === '/' && content[i + 1] === '/') {
        const start = i;
        i += 2;
        while (i < limit && content[i] !== '\n') {
          i++;
        }
        ranges.push({ start, end: i, kind: 'comment_line' });
        continue;
      }

      // Multi-line comment /* ... */
      if (ch === '/' && content[i + 1] === '*') {
        const start = i;
        i += 2;
        while (i < limit && !(content[i] === '*' && content[i + 1] === '/')) {
          i++;
        }
        i = Math.min(limit, i + 2);
        ranges.push({ start, end: i, kind: 'comment_block' });
        continue;
      }

      // HTML comment <!-- ... -->
      if (ch === '<' && content.startsWith('<!--', i)) {
        const start = i;
        i += 4;
        while (i < limit && !content.startsWith('-->', i)) {
          i++;
        }
        i = Math.min(limit, i + 3);
        ranges.push({ start, end: i, kind: 'comment_html' });
        continue;
      }

      // Single-quote string
      if (ch === "'") {
        const start = i;
        i++;
        while (i < limit) {
          if (content[i] === '\\') {
            i += 2;
          } else if (content[i] === "'") {
            i++;
            break;
          } else if (content[i] === '\n') {
            break; // Unterminated single-line string
          } else {
            i++;
          }
        }
        ranges.push({ start, end: i, kind: 'string_single' });
        continue;
      }

      // Double-quote string
      if (ch === '"') {
        const start = i;
        i++;
        while (i < limit) {
          if (content[i] === '\\') {
            i += 2;
          } else if (content[i] === '"') {
            i++;
            break;
          } else if (content[i] === '\n') {
            break; // Unterminated single-line string
          } else {
            i++;
          }
        }
        ranges.push({ start, end: i, kind: 'string_double' });
        continue;
      }

      // Template string `...`
      if (ch === '`') {
        const start = i;
        i++;
        while (i < limit) {
          if (content[i] === '\\') {
            i += 2;
          } else if (content[i] === '`') {
            i++;
            break;
          } else {
            i++;
          }
        }
        ranges.push({ start, end: i, kind: 'string_template' });
        continue;
      }

      i++;
    }

    this.cachedLexicalRanges = ranges;
    return ranges;
  }

  /**
   * Checks whether an offset falls inside a comment (//, /* *\/, or <!-- -->).
   */
  public isInsideComment(offset: number): boolean {
    const range = binarySearchLexicalRange(this.getLexicalRanges(), offset);
    return range ? range.kind.startsWith('comment_') : false;
  }

  /**
   * Checks whether an offset falls inside a string literal ('', "", or ``).
   */
  public isInsideString(offset: number): boolean {
    const range = binarySearchLexicalRange(this.getLexicalRanges(), offset);
    return range ? range.kind.startsWith('string_') : false;
  }

  /**
   * Checks whether an offset falls inside any comment or string literal.
   */
  public isInsideCommentOrString(offset: number): boolean {
    return binarySearchLexicalRange(this.getLexicalRanges(), offset) !== undefined;
  }

  /**
   * Advances past any comment or string starting at offset. Returns offset if not at a comment or string.
   */
  public advancePastCommentOrString(offset: number): number {
    const ranges = this.getLexicalRanges();
    const range = binarySearchLexicalRange(ranges, offset);
    if (range && range.start === offset) {
      return range.end;
    }
    return offset;
  }

  /**
   * Returns pre-indexed escape hatches and file disable directives.
   */
  public getEscapeHatches(): readonly EscapeHatchMatch[] {
    if (this.cachedEscapeHatches) {
      return this.cachedEscapeHatches;
    }

    const matches: EscapeHatchMatch[] = [];
    const disableRegex = /(?:\/\/|\/\*)\s*auditor-disable\s+([\w,-]+)/gi;
    let m: RegExpExecArray | null;

    while ((m = disableRegex.exec(this.rawContent)) !== null) {
      const tokens = (m[1] ?? '').split(',').map(t => t.trim().toLowerCase());
      for (const tok of tokens) {
        if (tok) this.fileDisabledRules.add(tok);
      }
    }

    const hatchRegex = /(?:\/\/|\/\*)\s*(?:([\w-]+)-ok|(?:auditor-ignore|audit-ignore)(?::|\s+)([\w-]+))\s*:?\s*([^\n*]*)/gi;
    while ((m = hatchRegex.exec(this.rawContent)) !== null) {
      const ruleToken = (m[1] ?? m[2] ?? '').trim().toLowerCase();
      const reason = m[3]?.trim();
      const line = this.getLineAndColumn(m.index).line;
      matches.push({
        line,
        rawText: m[0],
        ruleToken,
        reason: reason || undefined
      });
    }

    this.cachedEscapeHatches = matches;
    return matches;
  }

  /**
   * Determines whether an escape hatch suppresses the specified rule at the given line or offset.
   */
  public hasEscapeHatch(lineOrOffset: number, ruleId: string): boolean {
    const targetLine = lineOrOffset > this.lines.length && lineOrOffset <= this.rawContent.length
      ? this.getLineAndColumn(lineOrOffset).line
      : lineOrOffset;

    this.getEscapeHatches(); // Ensure index is populated

    const ruleLower = ruleId.toLowerCase();
    if (this.fileDisabledRules.has('all') || this.fileDisabledRules.has(ruleLower)) {
      return true;
    }

    // Common family aliases (e.g. 'gsap-no-layout-properties' -> 'layout', 'gpu', 'shimmer')
    const acceptedTokens = new Set<string>([ruleLower]);
    if (ruleLower.includes('layout')) {
      acceptedTokens.add('layout');
      acceptedTokens.add('gpu');
      acceptedTokens.add('shimmer');
    }
    if (ruleLower.includes('timer') || ruleLower.includes('delay')) {
      acceptedTokens.add('timer');
      acceptedTokens.add('delay');
    }
    if (ruleLower.includes('storage') || ruleLower.includes('persistence')) {
      acceptedTokens.add('storage');
    }
    if (ruleLower.includes('path')) {
      acceptedTokens.add('path');
    }
    if (ruleLower.includes('type')) {
      acceptedTokens.add('type');
    }
    if (ruleLower.includes('catch')) {
      acceptedTokens.add('catch');
    }

    // Direct suffix match: e.g. rule 'vue-banned-raw-timers' -> token 'vue-banned-raw-timers' or 'raw-timers' or 'timers'
    const parts = ruleLower.split('-');
    if (parts.length > 1) {
      acceptedTokens.add(parts.slice(1).join('-'));
      acceptedTokens.add(parts[parts.length - 1]!);
    }

    // Check escape hatches on target line and up to 2 preceding lines
    for (const hatch of this.cachedEscapeHatches ?? []) {
      if (hatch.line >= targetLine - 2 && hatch.line <= targetLine) {
        if (acceptedTokens.has(hatch.ruleToken)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Convenience helper to check escape hatch at a specific character offset.
   */
  public hasEscapeHatchAtOffset(offset: number, ruleId: string): boolean {
    const { line } = this.getLineAndColumn(offset);
    return this.hasEscapeHatch(line, ruleId);
  }

  /**
   * Extracts Vue Single-File Component blocks (<script>, <template>, <style>).
   */
  public getVueBlocks(): VueSfcBlocks | undefined {
    if (!this.filePath.endsWith('.vue')) {
      return undefined;
    }
    if (this.cachedVueBlocks !== undefined) {
      return this.cachedVueBlocks ?? undefined;
    }

    const content = this.rawContent;

    // Extract scripts via generic tag parser
    const scriptMatches = extractRawTagMatches(content, 'script', this);
    const scripts: VueScriptBlock[] = scriptMatches.map(m => {
      const { attrs, ...base } = m;
      return {
        ...base,
        isSetup: /\bsetup\b/i.test(attrs),
        lang: attrs.match(/\blang=['"]([^'"]+)['"]/i)?.[1]
      };
    });

    // Extract template
    const templateMatches = extractRawTagMatches(content, 'template', this);
    const templateBlock: VueTemplateBlock | undefined = templateMatches[0]
      ? (() => {
          const { attrs: _attrs, ...base } = templateMatches[0];
          return base;
        })()
      : undefined;

    // Extract styles
    const styleMatches = extractRawTagMatches(content, 'style', this);
    const styles: VueStyleBlock[] = styleMatches.map(m => {
      const { attrs, ...base } = m;
      return {
        ...base,
        scoped: /\bscoped\b/i.test(attrs),
        lang: attrs.match(/\blang=['"]([^'"]+)['"]/i)?.[1]
      };
    });

    const result: VueSfcBlocks = {
      scripts,
      template: templateBlock,
      styles
    };

    this.cachedVueBlocks = result;
    return result;
  }

  /**
   * Resolves 1-indexed line and column for a TypeScript AST node.
   * Handles both standard TS files and Vue SFC script blocks transparently.
   */
  public getNodeLineAndColumn(node: ts.Node, ast?: ts.SourceFile): LineColumnPosition {
    const sourceFile = ast ?? this.getAst();
    if (!sourceFile) {
      return { line: 1, column: 1, lineText: '' };
    }
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const lineNum = line + 1;
    const column = character + 1;
    const lineText = this.lines[lineNum - 1] ?? '';
    return { line: lineNum, column, lineText };
  }

  /**
   * Returns a cached TypeScript AST for this document.
   * If SharedAstContext is available, delegates to it. Otherwise parses on-demand.
   * For Vue SFCs, pads lines before script blocks with newlines so AST line numbers align 1-to-1.
   */
  public getAst(): ts.SourceFile | undefined {
    if (this.cachedAst) {
      return this.cachedAst;
    }

    if (this.astContext) {
      this.cachedAst = this.astContext.getSourceFile(this.filePath, this.rawContent);
      return this.cachedAst;
    }

    const isVue = this.filePath.endsWith('.vue');
    let codeToParse = this.rawContent;

    if (isVue) {
      const blocks = this.getVueBlocks();
      const primaryScript = blocks?.scripts.find(s => s.isSetup) ?? blocks?.scripts[0];
      if (!primaryScript) return undefined;
      const linesBefore = (this.rawContent.substring(0, primaryScript.contentStart).match(/\n/g) ?? []).length;
      codeToParse = '\n'.repeat(linesBefore) + primaryScript.content;
    }

    this.cachedAst = ts.createSourceFile(
      path.basename(this.filePath),
      codeToParse,
      ts.ScriptTarget.Latest,
      true,
      isVue ? ts.ScriptKind.TS : undefined
    );

    return this.cachedAst;
  }

  /**
   * Registers a code replacement for auto-repair.
   */
  public registerFix(replacement: DocumentReplacement): void {
    this.replacements.push(replacement);
  }

  /**
   * Returns true if one or more auto-fixes have been registered.
   */
  public hasFixes(): boolean {
    return this.replacements.length > 0;
  }

  /**
   * Returns the count of registered fixes.
   */
  public getFixCount(): number {
    return this.replacements.length;
  }

  /**
   * Applies all registered replacements sorted descending by start offset to prevent index shifts.
   */
  public getTransformedContent(): string {
    if (this.replacements.length === 0) {
      return this.rawContent;
    }

    // Sort descending by start offset
    const sorted = [...this.replacements].sort((a, b) => b.start - a.start);
    let result = this.rawContent;

    for (const rep of sorted) {
      result = result.slice(0, rep.start) + rep.newText + result.slice(rep.end);
    }

    return result;
  }

  /**
   * Writes transformed content back to the physical file on disk.
   */
  public applyFixesToFile(): boolean {
    if (!this.hasFixes()) return false;
    const newContent = this.getTransformedContent();
    fs.writeFileSync(this.filePath, newContent, 'utf-8');
    return true;
  }
}
