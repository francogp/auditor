import ts from "typescript";
import MagicString from "magic-string";
import { JSDOM, VirtualConsole } from "jsdom";
// src/analyzers/modernDomAstUtils.ts
/**
* src/analyzers/modernDomAstUtils.ts
*
* SHARED DOM & TYPESCRIPT AST LOCATION UTILITIES (Node.js 26+ Native)
*
* Provides shared JSDOM (`includeNodeLocations: true`, `VirtualConsole`) and
* TypeScript AST source-span utilities across modern web static analyzers.
*/
const SILENT_VIRTUAL_CONSOLE = new VirtualConsole();
function getAttrLocation(loc, attrName) {
	if (!loc) return void 0;
	const key = attrName.toLowerCase();
	return loc.startTag?.attrs?.[key] ?? loc.attrs?.[key];
}
function getStartTagEndOffset(loc) {
	return loc?.startTag?.endOffset ?? loc?.endOffset;
}
function parseDomWithLocations(htmlContent) {
	return new JSDOM(htmlContent, {
		includeNodeLocations: true,
		virtualConsole: SILENT_VIRTUAL_CONSOLE
	});
}
function computeRawLineOffsets(rawContent) {
	const offsets = [0];
	for (let i = 0; i < rawContent.length; i++) if (rawContent[i] === "\n") offsets.push(i + 1);
	return offsets;
}
function getRawSpanFromAstNode(node, sf, rawLineOffsets) {
	const startLC = sf.getLineAndCharacterOfPosition(node.getStart(sf));
	const endLC = sf.getLineAndCharacterOfPosition(node.getEnd());
	return {
		start: (rawLineOffsets[startLC.line] ?? 0) + startLC.character,
		end: (rawLineOffsets[endLC.line] ?? 0) + endLC.character,
		line: startLC.line + 1
	};
}
function getLineFromRawOffsets(rawLineOffsets, offset) {
	let line = 1;
	for (let i = 0; i < rawLineOffsets.length; i++) if (rawLineOffsets[i] <= offset) line = i + 1;
	else break;
	return line;
}
function runScriptAstMagicStringPass(rawContent, sf, enableFix, onNode) {
	const rawLineOffsets = computeRawLineOffsets(rawContent);
	const ms = enableFix ? new MagicString(rawContent) : null;
	const findings = [];
	let mutated = false;
	const visit = (node) => {
		if (onNode(node, rawLineOffsets, ms, findings)) mutated = true;
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return {
		findings,
		fixedContent: mutated && ms ? ms.toString() : void 0
	};
}
export { SILENT_VIRTUAL_CONSOLE, computeRawLineOffsets, getAttrLocation, getLineFromRawOffsets, getRawSpanFromAstNode, getStartTagEndOffset, parseDomWithLocations, runScriptAstMagicStringPass };
