/**
 * src/core/vueSfcParser.ts
 *
 * CANONICAL VUE SINGLE FILE COMPONENT (SFC) BLOCK EXTRACTOR (Node.js 26+ Native)
 *
 * Deterministically parses .vue Single File Components into structured <template>,
 * <script>, and <style> blocks, eliminating fragmented ad-hoc and greedy regexes.
 */
export declare const VUE_SFC_BLOCK_TAGS: readonly ["template", "script", "style"];
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
/**
 * Parses a Vue SFC source string and extracts all top-level constituent blocks.
 */
export declare function parseVueSfcBlocks(sfcContent: string): VueSfcBlocks;
/**
 * Extracts concatenated inner script content from all script blocks in a Vue SFC.
 * Returns null if the SFC contains no script blocks.
 */
export declare function extractSfcScriptContent(sfcContent: string): string | null;
/**
 * Returns script content for .vue files, or the raw file content for other script files (.ts, .js).
 * Returns null if a .vue file contains no <script> blocks.
 */
export declare function extractVueScriptOrRaw(relPath: string, content: string): string | null;
//# sourceMappingURL=vueSfcParser.d.ts.map