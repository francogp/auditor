/**
 * src/core/vueSfcParser.ts
 *
 * CANONICAL VUE SINGLE FILE COMPONENT (SFC) BLOCK EXTRACTOR (Node.js 26+ Native)
 *
 * Deterministically parses .vue Single File Components into structured <template>,
 * <script>, and <style> blocks, eliminating fragmented ad-hoc and greedy regexes.
 */

import { enableCompileCache } from 'node:module';

enableCompileCache();

export const VUE_SFC_BLOCK_TAGS = ['template', 'script', 'style'] as const;
export type VueSfcBlockTag = (typeof VUE_SFC_BLOCK_TAGS)[number];

export interface VueSfcBlock {
  readonly tag: VueSfcBlockTag;
  /** Inner content inside the block tags */
  readonly content: string;
  /** Complete raw block including opening and closing tags */
  readonly rawBlock: string;
  /** 1-based line number where the opening tag begins */
  readonly startLine: number;
  /** 1-based line number where the inner content begins */
  readonly contentStartLine: number;
  /** 0-based character index where opening tag starts */
  readonly startIndex: number;
  /** 0-based character index where inner content starts */
  readonly contentStartIndex: number;
  /** 0-based character index where closing tag ends */
  readonly endIndex: number;
  readonly attributes: Record<string, string | boolean>;
  readonly isScoped: boolean;
  readonly isSetup: boolean;
  readonly lang?: string;
}

export interface VueSfcBlocks {
  readonly template?: VueSfcBlock;
  readonly scripts: readonly VueSfcBlock[];
  readonly styles: readonly VueSfcBlock[];
}

const BLOCK_REGEX = /<(template|script|style)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const ATTR_REGEX = /([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function parseAttributes(attrString: string): Record<string, string | boolean> {
  const attrs: Record<string, string | boolean> = {};
  if (!attrString || !attrString.trim()) return attrs;

  ATTR_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_REGEX.exec(attrString)) !== null) {
    const key = match[1];
    if (!key) continue;
    const value = match[2] ?? match[3] ?? match[4];
    attrs[key] = value !== undefined ? value : true;
  }
  return attrs;
}

/**
 * Parses a Vue SFC source string and extracts all top-level constituent blocks.
 */
export function parseVueSfcBlocks(sfcContent: string): VueSfcBlocks {
  let template: VueSfcBlock | undefined;
  const scripts: VueSfcBlock[] = [];
  const styles: VueSfcBlock[] = [];

  if (!sfcContent || typeof sfcContent !== 'string') {
    return { template, scripts, styles };
  }

  BLOCK_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = BLOCK_REGEX.exec(sfcContent)) !== null) {
    const rawBlock = match[0];
    const tagName = (match[1] ?? '').toLowerCase() as VueSfcBlockTag;
    const attrString = match[2] ?? '';
    const innerContent = match[3] ?? '';

    const startIndex = match.index;
    const endIndex = startIndex + rawBlock.length;

    const openingTagEndOffset = rawBlock.indexOf('>') + 1;
    const contentStartIndex = startIndex + openingTagEndOffset;

    const beforeBlock = sfcContent.slice(0, startIndex);
    const startLine = beforeBlock.split('\n').length;
    const beforeContent = sfcContent.slice(0, contentStartIndex);
    const contentStartLine = beforeContent.split('\n').length;

    const attributes = parseAttributes(attrString);
    const isScoped = attributes['scoped'] === true;
    const isSetup = attributes['setup'] === true;
    const lang = typeof attributes['lang'] === 'string' ? attributes['lang'] : undefined;

    const block: VueSfcBlock = {
      tag: tagName,
      content: innerContent,
      rawBlock,
      startLine,
      contentStartLine,
      startIndex,
      contentStartIndex,
      endIndex,
      attributes,
      isScoped,
      isSetup,
      lang
    };

    if (tagName === 'template') {
      if (!template) {
        template = block;
      }
    } else if (tagName === 'script') {
      scripts.push(block);
    } else if (tagName === 'style') {
      styles.push(block);
    }
  }

  return { template, scripts, styles };
}

/**
 * Extracts concatenated inner script content from all script blocks in a Vue SFC.
 * Returns null if the SFC contains no script blocks.
 */
export function extractSfcScriptContent(sfcContent: string): string | null {
  const parsed = parseVueSfcBlocks(sfcContent);
  if (parsed.scripts.length === 0) return null;
  return parsed.scripts.map(s => s.content).join('\n');
}

/**
 * Returns script content for .vue files, or the raw file content for other script files (.ts, .js).
 * Returns null if a .vue file contains no <script> blocks.
 */
export function extractVueScriptOrRaw(relPath: string, content: string): string | null {
  return relPath.endsWith('.vue') ? extractSfcScriptContent(content) : content;
}

