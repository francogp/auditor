import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
//#region src/core/auditedDocument.ts
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
	while (i < limit) if (content[i] === "\\") i += 2;
	else if (content[i] === "`") {
		i++;
		break;
	} else i++;
	return {
		start,
		end: i,
		kind: "string_template"
	};
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
	cachedEscapeHatches;
	fileDisabledRules = /* @__PURE__ */ new Set();
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
	* Returns pre-indexed escape hatches and file disable directives.
	*/
	getEscapeHatches() {
		if (this.cachedEscapeHatches) return this.cachedEscapeHatches;
		const matches = [];
		const disableRegex = /(?:\/\/|\/\*)\s*auditor-disable\s+([\w,-]+)/gi;
		let m;
		while ((m = disableRegex.exec(this.rawContent)) !== null) {
			const tokens = (m[1] ?? "").split(",").map((t) => t.trim().toLowerCase());
			for (const tok of tokens) if (tok) this.fileDisabledRules.add(tok);
		}
		const hatchRegex = /(?:\/\/|\/\*)\s*(?:([\w-]+)-ok\b|(?:auditor-ignore|audit-ignore)(?::|\s+)([\w-]+)|([\w-]+):)\s*:?\s*([^\n*]*)/gi;
		while ((m = hatchRegex.exec(this.rawContent)) !== null) {
			const ruleToken = (m[1] ?? m[2] ?? m[3] ?? "").trim().toLowerCase();
			const reason = m[4]?.trim();
			const line = this.getLineAndColumn(m.index).line;
			matches.push({
				line,
				rawText: m[0],
				ruleToken,
				reason: reason || void 0
			});
		}
		this.cachedEscapeHatches = matches;
		return matches;
	}
	/**
	* Resolves accepted escape hatch rule tokens including common domain, o1, and reactivity aliases.
	*/
	resolveAcceptedRuleTokens(ruleLower) {
		const acceptedTokens = /* @__PURE__ */ new Set([ruleLower]);
		if (ruleLower.includes("layout")) {
			acceptedTokens.add("layout");
			acceptedTokens.add("gpu");
			acceptedTokens.add("shimmer");
		}
		if (ruleLower.includes("timer") || ruleLower.includes("delay")) {
			acceptedTokens.add("timer");
			acceptedTokens.add("delay");
		}
		if (ruleLower.includes("storage") || ruleLower.includes("persistence")) acceptedTokens.add("storage");
		if (ruleLower.includes("path")) acceptedTokens.add("path");
		if (ruleLower.includes("type") || ruleLower.includes("assertion")) {
			acceptedTokens.add("type");
			acceptedTokens.add("cast");
			acceptedTokens.add("double-cast");
			acceptedTokens.add("any");
			acceptedTokens.add("literal");
			acceptedTokens.add("promise");
			acceptedTokens.add("void");
			acceptedTokens.add("array");
			acceptedTokens.add("no-domain");
			acceptedTokens.add("open-record");
		}
		if (ruleLower.includes("catch")) acceptedTokens.add("catch");
		if (ruleLower.includes("domain")) {
			acceptedTokens.add("domain");
			acceptedTokens.add("no-domain");
			acceptedTokens.add("runtime-set");
			acceptedTokens.add("runtime-map");
			acceptedTokens.add("open-record");
			acceptedTokens.add("infra-id");
			acceptedTokens.add("string");
			acceptedTokens.add("dto");
		}
		if (ruleLower.includes("o1") || ruleLower.includes("linear")) {
			acceptedTokens.add("o1");
			acceptedTokens.add("linear-search");
			acceptedTokens.add("clone");
			acceptedTokens.add("spread");
		}
		if (ruleLower.includes("reactiv") || ruleLower.includes("computed") || ruleLower.includes("watch")) {
			acceptedTokens.add("reactivity");
			acceptedTokens.add("sfc");
		}
		const parts = ruleLower.split("-");
		if (parts.length > 1) {
			acceptedTokens.add(parts.slice(1).join("-"));
			acceptedTokens.add(parts[parts.length - 1]);
		}
		return acceptedTokens;
	}
	isLineOnlyComments(lineNum) {
		return (this.lines[lineNum - 1] ?? "").replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "").trim().length === 0;
	}
	hasIndexedEscapeHatchInRange(startLine, endLine, acceptedTokens) {
		for (const hatch of this.cachedEscapeHatches ?? []) {
			if (hatch.line < startLine - 2 || hatch.line > endLine + 1) continue;
			if (!acceptedTokens.has(hatch.ruleToken)) continue;
			if (hatch.line < startLine || hatch.line > endLine) {
				if (!this.isLineOnlyComments(hatch.line)) continue;
			}
			return true;
		}
		return false;
	}
	hasNodeDirectCommentsHatch(node, enclosing, sf, acceptedTokens) {
		const text = sf.text;
		const leading = [...ts.getLeadingCommentRanges(text, node.pos) ?? [], ...ts.getLeadingCommentRanges(text, enclosing.pos) ?? []];
		const trailing = [...ts.getTrailingCommentRanges(text, node.end) ?? [], ...ts.getTrailingCommentRanges(text, enclosing.end) ?? []];
		for (const comment of [...leading, ...trailing]) {
			const commentText = text.slice(comment.pos, comment.end);
			for (const token of acceptedTokens) if (commentText.includes(`// ${token}:`) || commentText.includes(`/* ${token}:`) || commentText.includes(`// ${token}-ok`) || commentText.includes(`/* ${token}-ok`) || commentText.includes(`// ${token}`)) return true;
		}
		return false;
	}
	getAuthorizedRuleTokens(ruleId) {
		this.getEscapeHatches();
		const ruleLower = ruleId.toLowerCase();
		if (this.fileDisabledRules.has("all") || this.fileDisabledRules.has(ruleLower)) return null;
		return this.resolveAcceptedRuleTokens(ruleLower);
	}
	/**
	* Determines whether an escape hatch suppresses the specified rule at the given line or offset.
	*/
	hasEscapeHatch(lineOrOffset, ruleId) {
		const targetLine = lineOrOffset > this.lines.length && lineOrOffset <= this.rawContent.length ? this.getLineAndColumn(lineOrOffset).line : lineOrOffset;
		const acceptedTokens = this.getAuthorizedRuleTokens(ruleId);
		if (!acceptedTokens) return true;
		return this.hasIndexedEscapeHatchInRange(targetLine, targetLine, acceptedTokens);
	}
	/**
	* Determines whether an AST node or its enclosing statement has an authorized escape hatch.
	* Checks:
	* 1. Line range of the node from (startLine - 2) to (endLine + 1).
	* 2. Leading and trailing comment ranges from TypeScript AST if sourceFile is provided.
	*/
	hasEscapeHatchForNode(node, ruleId, sourceFile) {
		const sf = sourceFile ?? this.getAst();
		if (!sf) return false;
		let enclosing = node;
		while (enclosing.parent && !ts.isSourceFile(enclosing.parent)) {
			enclosing = enclosing.parent;
			if (ts.isStatement(enclosing)) break;
		}
		const startPos = Math.min(node.getStart(sf), enclosing.getStart(sf));
		const endPos = Math.max(node.getEnd(), enclosing.getEnd());
		const startLine = sf.getLineAndCharacterOfPosition(startPos).line + 1;
		const endLine = sf.getLineAndCharacterOfPosition(endPos).line + 1;
		const acceptedTokens = this.getAuthorizedRuleTokens(ruleId);
		if (!acceptedTokens) return true;
		if (this.hasIndexedEscapeHatchInRange(startLine, endLine, acceptedTokens)) return true;
		return this.hasNodeDirectCommentsHatch(node, enclosing, sf, acceptedTokens);
	}
	/**
	* Convenience helper to check escape hatch at a specific character offset.
	*/
	hasEscapeHatchAtOffset(offset, ruleId) {
		const { line } = this.getLineAndColumn(offset);
		return this.hasEscapeHatch(line, ruleId);
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
//#endregion
export { AuditedDocument };
