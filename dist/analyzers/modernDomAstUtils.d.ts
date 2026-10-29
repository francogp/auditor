import ts from "typescript";
import MagicString from "magic-string";
import { JSDOM, VirtualConsole } from "jsdom";
export declare const SILENT_VIRTUAL_CONSOLE: VirtualConsole;
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
export declare function getAttrLocation(loc: JsdomElementLocation | null | undefined, attrName: string): JsdomAttrLocation | undefined;
export declare function getStartTagEndOffset(loc: JsdomElementLocation | null | undefined): number | undefined;
export declare function parseDomWithLocations(htmlContent: string): JSDOM;
export declare function computeRawLineOffsets(rawContent: string): number[];
export declare function getRawSpanFromAstNode(node: ts.Node, sf: ts.SourceFile, rawLineOffsets: readonly number[]): {
  start: number;
  end: number;
  line: number;
};
export declare function getLineFromRawOffsets(rawLineOffsets: readonly number[], offset: number): number;
export declare function runScriptAstMagicStringPass<TFinding>(rawContent: string, sf: ts.SourceFile, enableFix: boolean, onNode: (node: ts.Node, rawLineOffsets: readonly number[], ms: MagicString | null, findings: TFinding[]) => boolean): {
  readonly findings: readonly TFinding[];
  readonly fixedContent?: string;
};