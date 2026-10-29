import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
// src/core/auditedDocument.ts
/**
* packages/auditor/src/core/auditedDocument.ts
*
* CENTRAL AUDITED DOCUMENT ENGINE (Node.js 26+ Native)
*
* Provides a high-performance, immutable abstraction for scanned source files:
* 1. O(log N) line and column resolution via binary search over pre-computed line offsets.
* 2. Lexical indexing for comments (line, block, HTML) and strings with O(log K) range lookup.
* 3. Canonical Vue Single-File Component (SFC) extraction for <script>, <template>, and <style>.
* 4. Transparent TypeScript AST generation with line-offset preservation for SFC scripts.
* 5. Deterministic auto-fix replacement register applying non-overlapping transformations from end-to-start.
*/
/** Binary search to find line index from character offset */
function binarySearchLineIndex(lineOffsets, offset) {
	let low = 0;
	let high = lineOffsets.length - 1;
	while (low <= high) {
		const mid = low + high >> 1;
		if (lineOffsets[mid] <= offset) {
			if (mid === lineOffsets.length - 1 || lineOffsets[mid + 1] > offset) return mid;
			low = mid + 1;
		} else high = mid - 1;
	}
	return 0;
}
/** Binary search to find if an offset falls within any sorted non-overlapping lexical range */
function binarySearchLexicalRange(ranges, offset) {
	let low = 0;
	let high = ranges.length - 1;
	while (low <= high) {
		const mid = low + high >> 1;
		const r = ranges[mid];
		if (offset >= r.start && offset < r.end) return r;
		if (offset < r.start) high = mid - 1;
		else low = mid + 1;
	}
}
function extractRawTagMatches(content, tagName, doc) {
	const matches = [];
	const regex = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "gi");
	let m;
	while ((m = regex.exec(content)) !== null) {
		const attrs = m[1] ?? "";
		const inner = m[2] ?? "";
		const start = m.index;
		const end = start + m[0].length;
		const contentStart = start + m[0].indexOf(">") + 1;
		const contentEnd = contentStart + inner.length;
		const tagLine = doc.getLineAndColumn(start).line;
		const startLine = tagLine + (inner.startsWith("\n") || inner.startsWith("\r\n") ? 1 : 0);
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
function scanLineComment(content, start, limit) {
	let i = start + 2;
	while (i < limit && content[i] !== "\n") i++;
	return {
		start,
		end: i,
		kind: "comment_line"
	};
}
function scanBlockComment(content, start, limit) {
	let i = start + 2;
	while (i < limit && !(content[i] === "*" && content[i + 1] === "/")) i++;
	return {
		start,
		end: Math.min(limit, i + 2),
		kind: "comment_block"
	};
}
function scanHtmlComment(content, start, limit) {
	let i = start + 4;
	while (i < limit && !content.startsWith("-->", i)) i++;
	return {
		start,
		end: Math.min(limit, i + 3),
		kind: "comment_html"
	};
}
function scanQuotedString(content, start, limit, quote) {
	let i = start + 1;
	while (i < limit) if (content[i] === "\\") i += 2;
	else if (content[i] === quote) {
		i++;
		break;
	} else if (content[i] === "\n") break;
	else i++;
	return {
		start,
		end: i,
		kind: quote === "'" ? "string_single" : "string_double"
	};
}
function scanTemplateString(content, start, limit) {
	let i = start + 1;
	let braceDepth = 0;
	while (i < limit) if (content[i] === "\\") i += 2;
	else if (braceDepth === 0 && content[i] === "$" && content[i + 1] === "{") {
		braceDepth = 1;
		i += 2;
	} else if (braceDepth > 0) {
		if (content[i] === "{") braceDepth++;
		else if (content[i] === "}") braceDepth--;
		else if (content[i] === "'" || content[i] === "\"") {
			i = scanQuotedString(content, i, limit, content[i]).end;
			continue;
		} else if (content[i] === "`") {
			i = scanTemplateString(content, i, limit).end;
			continue;
		}
		i++;
	} else if (content[i] === "`") {
		i++;
		break;
	} else i++;
	return {
		start,
		end: i,
		kind: "string_template"
	};
}
const REGEX_PRECEDING_CHARS = /* @__PURE__ */ new Set([
	"=",
	"(",
	"[",
	",",
	":",
	";",
	"!",
	"&",
	"|",
	"?",
	"{",
	"}",
	"+",
	"-",
	"~",
	"*",
	"%",
	"^",
	"<",
	">"
]);
function tryFindRegexLiteralEnd(content, start, limit) {
	let prevIdx = start - 1;
	while (prevIdx >= 0 && (content[prevIdx] === " " || content[prevIdx] === "	" || content[prevIdx] === "\r" || content[prevIdx] === "\n")) prevIdx--;
	if (prevIdx >= 0 && !REGEX_PRECEDING_CHARS.has(content[prevIdx])) return null;
	let i = start + 1;
	let inCharClass = false;
	while (i < limit) {
		const c = content[i];
		if (c === "\n" || c === "\r") return null;
		if (c === "\\") {
			i += 2;
			continue;
		}
		if (c === "[") inCharClass = true;
		else if (c === "]") inCharClass = false;
		else if (c === "/" && !inCharClass) {
			i++;
			while (i < limit && /[dgimsuvy]/.test(content[i])) i++;
			return i;
		}
		i++;
	}
	return null;
}
function scanNextLexicalRange(content, i, limit) {
	const ch = content[i];
	if (ch === "/") {
		if (content[i + 1] === "/") return scanLineComment(content, i, limit);
		if (content[i + 1] === "*") return scanBlockComment(content, i, limit);
	}
	if (ch === "<" && content.startsWith("<!--", i)) return scanHtmlComment(content, i, limit);
	if (ch === "'" || ch === "\"") return scanQuotedString(content, i, limit, ch);
	if (ch === "`") return scanTemplateString(content, i, limit);
	return null;
}
var AuditedDocument = class {
	filePath;
	relPath;
	rawContent;
	lines;
	lineOffsets;
	astContext;
	cachedAst;
	cachedLexicalRanges;
	cachedVueBlocks;
	replacements = [];
	constructor(filePath, rawContent, relPath, astContext) {
		this.filePath = filePath;
		this.rawContent = rawContent;
		this.relPath = relPath ?? filePath;
		this.astContext = astContext;
		const offsets = [0];
		const len = rawContent.length;
		for (let i = 0; i < len; i++) if (rawContent[i] === "\n") offsets.push(i + 1);
		this.lineOffsets = offsets;
		this.lines = rawContent.split(/\r?\n/);
	}
	/**
	* Retrieves 1-indexed line and column with full lineText via O(log N) binary search.
	*/
	getLineAndColumn(offset) {
		const clamped = Math.max(0, Math.min(this.rawContent.length, offset));
		const lineIndex = binarySearchLineIndex(this.lineOffsets, clamped);
		const lineStart = this.lineOffsets[lineIndex] ?? 0;
		return {
			line: lineIndex + 1,
			column: clamped - lineStart + 1,
			lineText: this.lines[lineIndex] ?? ""
		};
	}
	/**
	* Returns character offset given 1-indexed line and column numbers.
	*/
	getOffset(line, column = 1) {
		const lineIdx = Math.max(0, Math.min(this.lines.length - 1, line - 1));
		return (this.lineOffsets[lineIdx] ?? 0) + Math.max(0, column - 1);
	}
	/**
	* Computes or returns cached sorted lexical ranges for comments and strings.
	*/
	getLexicalRanges() {
		if (this.cachedLexicalRanges) return this.cachedLexicalRanges;
		const ranges = [];
		const content = this.rawContent;
		const limit = content.length;
		let i = 0;
		while (i < limit) {
			if (content[i] === "/" && content[i + 1] !== "/" && content[i + 1] !== "*") {
				const regexEnd = tryFindRegexLiteralEnd(content, i, limit);
				if (regexEnd !== null) {
					i = regexEnd;
					continue;
				}
			}
			const match = scanNextLexicalRange(content, i, limit);
			if (match) {
				ranges.push(match);
				i = match.end;
			} else i++;
		}
		this.cachedLexicalRanges = ranges;
		return ranges;
	}
	/**
	* Checks whether an offset falls inside a comment (//, /* *\/, or <!-- -->).
	*/
	isInsideComment(offset) {
		const range = binarySearchLexicalRange(this.getLexicalRanges(), offset);
		return range ? range.kind.startsWith("comment_") : false;
	}
	/**
	* Checks whether an offset falls inside a string literal ('', "", or ``).
	*/
	isInsideString(offset) {
		const range = binarySearchLexicalRange(this.getLexicalRanges(), offset);
		return range ? range.kind.startsWith("string_") : false;
	}
	/**
	* Checks whether an offset falls inside any comment or string literal.
	*/
	isInsideCommentOrString(offset) {
		return binarySearchLexicalRange(this.getLexicalRanges(), offset) !== void 0;
	}
	/**
	* Advances past any comment or string starting at offset. Returns offset if not at a comment or string.
	*/
	advancePastCommentOrString(offset) {
		const range = binarySearchLexicalRange(this.getLexicalRanges(), offset);
		if (range && range.start === offset) return range.end;
		return offset;
	}
	/**
	* Extracts Vue Single-File Component blocks (<script>, <template>, <style>).
	*/
	getVueBlocks() {
		if (!this.filePath.endsWith(".vue")) return;
		if (this.cachedVueBlocks !== void 0) return this.cachedVueBlocks ?? void 0;
		const content = this.rawContent;
		const scripts = extractRawTagMatches(content, "script", this).map((m) => {
			const { attrs, ...base } = m;
			return {
				...base,
				isSetup: /\bsetup\b/i.test(attrs),
				lang: attrs.match(/\blang=['"]([^'"]+)['"]/i)?.[1]
			};
		});
		const templateMatches = extractRawTagMatches(content, "template", this);
		const result = {
			scripts,
			template: templateMatches[0] ? (() => {
				const { attrs: _attrs, ...base } = templateMatches[0];
				return base;
			})() : void 0,
			styles: extractRawTagMatches(content, "style", this).map((m) => {
				const { attrs, ...base } = m;
				return {
					...base,
					scoped: /\bscoped\b/i.test(attrs),
					lang: attrs.match(/\blang=['"]([^'"]+)['"]/i)?.[1]
				};
			})
		};
		this.cachedVueBlocks = result;
		return result;
	}
	/**
	* Resolves 1-indexed line and column for a TypeScript AST node.
	* Handles both standard TS files and Vue SFC script blocks transparently.
	*/
	getNodeLineAndColumn(node, ast) {
		const sourceFile = ast ?? this.getAst();
		if (!sourceFile) return {
			line: 1,
			column: 1,
			lineText: ""
		};
		const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
		const lineNum = line + 1;
		return {
			line: lineNum,
			column: character + 1,
			lineText: this.lines[lineNum - 1] ?? ""
		};
	}
	/**
	* Returns a cached TypeScript AST for this document.
	* If SharedAstContext is available, delegates to it. Otherwise parses on-demand.
	* For Vue SFCs, pads lines before script blocks with newlines so AST line numbers align 1-to-1.
	*/
	getAst() {
		if (this.cachedAst) return this.cachedAst;
		if (this.astContext) {
			this.cachedAst = this.astContext.getSourceFile(this.filePath, this.rawContent);
			return this.cachedAst;
		}
		const isVue = this.filePath.endsWith(".vue");
		let codeToParse = this.rawContent;
		if (isVue) {
			const blocks = this.getVueBlocks();
			const primaryScript = blocks?.scripts.find((s) => s.isSetup) ?? blocks?.scripts[0];
			if (!primaryScript) return void 0;
			const linesBefore = (this.rawContent.substring(0, primaryScript.contentStart).match(/\n/g) ?? []).length;
			codeToParse = "\n".repeat(linesBefore) + primaryScript.content;
		}
		this.cachedAst = ts.createSourceFile(path.basename(this.filePath), codeToParse, ts.ScriptTarget.Latest, true, isVue ? ts.ScriptKind.TS : void 0);
		return this.cachedAst;
	}
	/**
	* Registers a code replacement for auto-repair.
	*/
	registerFix(replacement) {
		this.replacements.push(replacement);
	}
	/**
	* Returns true if one or more auto-fixes have been registered.
	*/
	hasFixes() {
		return this.replacements.length > 0;
	}
	/**
	* Returns the count of registered fixes.
	*/
	getFixCount() {
		return this.replacements.length;
	}
	/**
	* Applies all registered replacements sorted descending by start offset to prevent index shifts.
	*/
	getTransformedContent() {
		if (this.replacements.length === 0) return this.rawContent;
		const sorted = [...this.replacements].sort((a, b) => b.start - a.start);
		let result = this.rawContent;
		for (const rep of sorted) result = result.slice(0, rep.start) + rep.newText + result.slice(rep.end);
		return result;
	}
	/**
	* Writes transformed content back to the physical file on disk.
	*/
	applyFixesToFile() {
		if (!this.hasFixes()) return false;
		const newContent = this.getTransformedContent();
		fs.writeFileSync(this.filePath, newContent, "utf-8");
		return true;
	}
};
export { AuditedDocument };
