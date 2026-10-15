import { enableCompileCache } from "node:module";
//#region src/core/vueSfcParser.ts
/**
* src/core/vueSfcParser.ts
*
* CANONICAL VUE SINGLE FILE COMPONENT (SFC) BLOCK EXTRACTOR (Node.js 26+ Native)
*
* Deterministically parses .vue Single File Components into structured <template>,
* <script>, and <style> blocks, eliminating fragmented ad-hoc and greedy regexes.
*/
enableCompileCache();
const VUE_SFC_BLOCK_TAGS = [
	"template",
	"script",
	"style"
];
const BLOCK_REGEX = /<(template|script|style)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const ATTR_REGEX = /([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
function parseAttributes(attrString) {
	const attrs = {};
	if (!attrString || !attrString.trim()) return attrs;
	ATTR_REGEX.lastIndex = 0;
	let match;
	while ((match = ATTR_REGEX.exec(attrString)) !== null) {
		const key = match[1];
		if (!key) continue;
		const value = match[2] ?? match[3] ?? match[4];
		attrs[key] = value !== void 0 ? value : true;
	}
	return attrs;
}
/**
* Parses a Vue SFC source string and extracts all top-level constituent blocks.
*/
function parseVueSfcBlocks(sfcContent) {
	let template;
	const scripts = [];
	const styles = [];
	if (!sfcContent || typeof sfcContent !== "string") return {
		template,
		scripts,
		styles
	};
	BLOCK_REGEX.lastIndex = 0;
	let match;
	while ((match = BLOCK_REGEX.exec(sfcContent)) !== null) {
		const rawBlock = match[0];
		const tagName = (match[1] ?? "").toLowerCase();
		const attrString = match[2] ?? "";
		const innerContent = match[3] ?? "";
		const startIndex = match.index;
		const endIndex = startIndex + rawBlock.length;
		const contentStartIndex = startIndex + (rawBlock.indexOf(">") + 1);
		const startLine = sfcContent.slice(0, startIndex).split("\n").length;
		const contentStartLine = sfcContent.slice(0, contentStartIndex).split("\n").length;
		const attributes = parseAttributes(attrString);
		const block = {
			tag: tagName,
			content: innerContent,
			rawBlock,
			startLine,
			contentStartLine,
			startIndex,
			contentStartIndex,
			endIndex,
			attributes,
			isScoped: attributes["scoped"] === true,
			isSetup: attributes["setup"] === true,
			lang: typeof attributes["lang"] === "string" ? attributes["lang"] : void 0
		};
		if (tagName === "template") {
			if (!template) template = block;
		} else if (tagName === "script") scripts.push(block);
		else if (tagName === "style") styles.push(block);
	}
	return {
		template,
		scripts,
		styles
	};
}
/**
* Extracts concatenated inner script content from all script blocks in a Vue SFC.
* Returns null if the SFC contains no script blocks.
*/
function extractSfcScriptContent(sfcContent) {
	const parsed = parseVueSfcBlocks(sfcContent);
	if (parsed.scripts.length === 0) return null;
	return parsed.scripts.map((s) => s.content).join("\n");
}
/**
* Returns script content for .vue files, or the raw file content for other script files (.ts, .js).
* Returns null if a .vue file contains no <script> blocks.
*/
function extractVueScriptOrRaw(relPath, content) {
	return relPath.endsWith(".vue") ? extractSfcScriptContent(content) : content;
}
//#endregion
export { VUE_SFC_BLOCK_TAGS, extractSfcScriptContent, extractVueScriptOrRaw, parseVueSfcBlocks as parseVueSfc, parseVueSfcBlocks };
