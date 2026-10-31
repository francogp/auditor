/**
 * src/analyzers/modernDomAstUtils.ts
 *
 * SHARED DOM & TYPESCRIPT AST LOCATION UTILITIES (Node.js 26+ Native)
 *
 * Provides shared JSDOM (`includeNodeLocations: true`, `VirtualConsole`) and
 * TypeScript AST source-span utilities across modern web static analyzers.
 */

import { JSDOM, VirtualConsole } from 'jsdom';
import MagicString from 'magic-string';
import ts from 'typescript';

export const SILENT_VIRTUAL_CONSOLE = new VirtualConsole();

export interface JsdomAttrLocation {
  readonly startLine: number;
  readonly startCol: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface JsdomStartTagLocation {
  readonly startLine: number;
  readonly startCol: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly attrs?: Readonly<Record<string, JsdomAttrLocation>>;
}

export interface JsdomElementLocation {
  readonly startLine: number;
  readonly startCol: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly startTag?: JsdomStartTagLocation;
  readonly attrs?: Readonly<Record<string, JsdomAttrLocation>>;
}

export function getAttrLocation(
  loc: JsdomElementLocation | null | undefined,
  attrName: string
): JsdomAttrLocation | undefined {
  if (!loc) return undefined;
  const key = attrName.toLowerCase();
  return loc.startTag?.attrs?.[key] ?? loc.attrs?.[key];
}

export function getStartTagEndOffset(
  loc: JsdomElementLocation | null | undefined
): number | undefined {
  return loc?.startTag?.endOffset ?? loc?.endOffset;
}

export function parseDomWithLocations(htmlContent: string): JSDOM {
  return new JSDOM(htmlContent, {
    includeNodeLocations: true,
    virtualConsole: SILENT_VIRTUAL_CONSOLE
  });
}

export function computeRawLineOffsets(rawContent: string): number[] {
  const offsets = [0];
  for (let i = 0; i < rawContent.length; i++) {
    if (rawContent[i] === '\n') offsets.push(i + 1);
  }
  return offsets;
}

export function getRawSpanFromAstNode(
  node: ts.Node,
  sf: ts.SourceFile,
  rawLineOffsets: readonly number[]
): { start: number; end: number; line: number } {
  const startLC = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  const endLC = sf.getLineAndCharacterOfPosition(node.getEnd());
  const start = (rawLineOffsets[startLC.line] ?? 0) + startLC.character;
  const end = (rawLineOffsets[endLC.line] ?? 0) + endLC.character;
  return { start, end, line: startLC.line + 1 };
}

export function getLineFromRawOffsets(rawLineOffsets: readonly number[], offset: number): number {
  let line = 1;
  for (let i = 0; i < rawLineOffsets.length; i++) {
    if (rawLineOffsets[i]! <= offset) line = i + 1;
    else break;
  }
  return line;
}

export function runScriptAstMagicStringPass<TFinding>(
  rawContent: string,
  sf: ts.SourceFile,
  enableFix: boolean,
  onNode: (
    node: ts.Node,
    rawLineOffsets: readonly number[],
    ms: MagicString | null,
    findings: TFinding[]
  ) => boolean
): { readonly findings: readonly TFinding[]; readonly fixedContent?: string } {
  const rawLineOffsets = computeRawLineOffsets(rawContent);
  const ms = enableFix ? new MagicString(rawContent) : null;
  const findings: TFinding[] = [];
  let mutated = false;

  const visit = (node: ts.Node): void => {
    if (onNode(node, rawLineOffsets, ms, findings)) {
      mutated = true;
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);

  return {
    findings,
    fixedContent: mutated && ms ? ms.toString() : undefined
  };
}
