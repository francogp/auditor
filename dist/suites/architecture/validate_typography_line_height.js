import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
// src/suites/architecture/validate_typography_line_height.ts
/**
* scripts/auditors/architecture/validate_typography_line_height.ts
*
* TYPOGRAPHY LINE-HEIGHT & INTERLINEAR SPACING AUDITOR (Node.js 26+ Native)
*
* Enforces safe multiline line-height across design system typography:
*   Anti-Zero Line-Height (`line-height-overlap`): Detects text classes, headings, titles,
*   descriptions, and multiline labels that declare 'line-height: 1' or 'line-height: 0'.
*   Fonts with line-height <= 1 collide and overlap vertically when text wraps.
*
* Usage:
*   npm run validate:line-height
*/
enableCompileCache();
const TYPOGRAPHY_LINE_HEIGHT_RULES = ["line-height-overlap"];
const ICON_ELEMENT_REGEX = /(?:^|[._-])(?:emoji|icon|arrow|bullet|symbol|glyph|avatar|medal|quote|mark|placeholder|checkmark|star|indicator|infinity|dash|tooltip-wrapper|fx-wrapper|clear|close|dismiss)(?:$|[._-])|(?<![\w-])(?:img|svg|canvas)\b/i;
const TEXT_ELEMENT_REGEX = /(?:^|[._-])(?:title|heading|header|caption|desc|description|sub|subtitle|dialogue|name|label|text|body|wrap|item|card|accordion|content|h[1-6]|paragraph|note|message|banner|alert|prompt|phrase|comment|summary|reason|metric|pill|tag)(?:$|[._-])/i;
function extractStyleBlocks(filePath, fileContent) {
	if (filePath.endsWith(".scss") || filePath.endsWith(".css")) return [{
		content: fileContent,
		startLine: 1
	}];
	const blocks = [];
	const styleTagRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
	let match;
	while ((match = styleTagRegex.exec(fileContent)) !== null) {
		const startLine = fileContent.slice(0, match.index).split("\n").length;
		blocks.push({
			content: match[1] || "",
			startLine
		});
	}
	return blocks;
}
function getLeafSelector(fullSelector) {
	const segments = fullSelector.split(/[\s>+~]/).map((s) => s.trim()).filter(Boolean);
	return (segments[segments.length - 1] || fullSelector).replace(/::?[\w-]+(\([^)]*\))?/g, "").trim();
}
function isEmojiFontContext(lines, currentIndex) {
	const start = Math.max(0, currentIndex - 6);
	const end = Math.min(lines.length - 1, currentIndex + 6);
	for (let idx = start; idx <= end; idx++) {
		const l = lines[idx] || "";
		if (/font-family\s*:\s*(?:\S.*)?(?:Emoji|Apple Color Emoji|Segoe UI Emoji|Noto Color Emoji)/i.test(l)) return true;
	}
	return false;
}
function updateSelectorStack(trimmed, selectorStack) {
	if (trimmed.includes("{")) {
		const selectorPart = trimmed.slice(0, trimmed.indexOf("{")).trim();
		if (selectorPart) selectorStack.push({ selector: selectorPart });
	}
}
function popSelectorStack(trimmed, selectorStack) {
	if (trimmed.includes("}")) {
		const closeCount = (trimmed.match(/\}/g) || []).length;
		for (let c = 0; c < closeCount; c++) selectorStack.pop();
	}
}
function isLineHeightOverlapCandidate(trimmed) {
	return trimmed.match(/\bline-height\s*:\s*(0|1|0px|1px|1em|1rem)\s*(?:!important\s*)?;/i);
}
function isTextSelectorCandidate(currentSelector, leafSelector) {
	return TEXT_ELEMENT_REGEX.test(leafSelector) || currentSelector.includes("&__") || currentSelector.includes(".text");
}
var TypographyLineHeightAuditor = class extends FileScanAuditor {
	totalRulesChecked = 0;
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, (config) => config.paths?.srcRoots ?? []);
		super({
			ruleFixers: {},
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(TYPOGRAPHY_LINE_HEIGHT_RULES, {
				speed: "light",
				phase: "normal",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_typography_line_height",
			name: "Typography Line-Height & Interlinear Spacing Validator",
			description: "Detects line-height collisions in multiline typography",
			family: "architecture",
			ruleIds: TYPOGRAPHY_LINE_HEIGHT_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(TYPOGRAPHY_LINE_HEIGHT_RULES, "behavior"),
			packageName: "Typography",
			configKey: "styles.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "🔤",
			ruleDescriptions: { "line-height-overlap": "Line-height collision" },
			ruleRemediations: { "line-height-overlap": "1. Root Cause:\nA collapsed line-height value (`0`, `1`, `1px`, `1rem`) was declared on a multiline text element or typography class (`p`, `span`, `h1`-`h6`, `.text`, etc.). When text wraps across multiple lines, font descenders collide with ascenders of the line below, impairing legibility and violating WCAG accessibility guidelines.\n\n2. Diagnosis:\nLocate the `line-height` declaration in the reported line of the stylesheet or Vue component.\n\n3. Canonical Solution:\n1. Use proportional line-height values suitable for multiline text: minimum `line-height: 1.25` for headings and `line-height: 1.5` for body text and paragraphs.\n2. For single-line icons or non-text containers, use specific dedicated icon classes or CSS flexbox/grid alignment.\n\n4. Example / Auto-fix command:\n// ❌ Incorrect: collapsed line-height in multiline text\np { font-size: 16px; line-height: 1; }\n\n// ✅ Correct: accessible line-height\np { font-size: 16px; line-height: 1.5; }" },
			roots: targetRoots,
			allowedExtensions: /* @__PURE__ */ new Set([
				".vue",
				".scss",
				".css"
			]),
			projectRoot: effectiveRoot
		});
	}
	checkBlockLine(blockLines, lineIndex, blockStartLine, relPath, selectorStack) {
		const line = blockLines[lineIndex];
		if (!line) return;
		const trimmed = line.trim();
		updateSelectorStack(trimmed, selectorStack);
		const lineHeightMatch = isLineHeightOverlapCandidate(trimmed);
		if (lineHeightMatch) {
			this.totalRulesChecked++;
			const currentSelector = selectorStack.map((f) => f.selector).join(" ") || "(global scope)";
			const leafSelector = getLeafSelector(currentSelector);
			if (!ICON_ELEMENT_REGEX.test(leafSelector) && !isEmojiFontContext(blockLines, lineIndex)) {
				if (isTextSelectorCandidate(currentSelector, leafSelector)) this.addViolation({
					ruleId: "line-height-overlap",
					severity: "error",
					file: relPath,
					line: blockStartLine + lineIndex,
					message: `Dangerous '${lineHeightMatch[0]}' on text selector '${currentSelector}'. Fonts overlap when text wraps. Use 'line-height: 1.2' to '1.5' or $lh-normal.`,
					context: trimmed
				});
			}
		}
		popSelectorStack(trimmed, selectorStack);
	}
	scanFile(relPath, content) {
		if (getAuditConfig(this.projectRoot).styles?.lineHeightOverlapCheck === false) return;
		const styleBlocks = extractStyleBlocks(relPath, content);
		for (const block of styleBlocks) {
			const blockLines = block.content.split("\n");
			const selectorStack = [];
			for (let i = 0; i < blockLines.length; i++) this.checkBlockLine(blockLines, i, block.startLine, relPath, selectorStack);
		}
	}
	async runAudit() {
		await super.runAudit();
		this.context.setMetric("Line-height rules analyzed", this.totalRulesChecked);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new TypographyLineHeightAuditor());
export { TYPOGRAPHY_LINE_HEIGHT_RULES, TypographyLineHeightAuditor };
