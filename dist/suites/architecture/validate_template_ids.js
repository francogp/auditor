import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { parseVueSfc as parseVueSfcBlocks } from "../../core/vueSfcParser.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
// src/suites/architecture/validate_template_ids.ts
/**
* scripts/auditors/architecture/validate_template_ids.ts
*
* TEMPLATE STATIC ID INTEGRITY & COLLISION AUDITOR (Node.js 26+ Native)
*
* Enforces HTML/DOM uniqueness and E2E locator predictability across all Vue components:
*   1. Duplicate Static ID within Component (`template-duplicate-static-id`):
*      Forbids having two elements with the exact same static `id="..."` attribute
*      inside the same `<template>` block.
*   2. Shared Generic Static IDs Across Components (`template-shared-static-id`):
*      Detects collision-prone static IDs reused across different components (e.g.
*      `id="close-btn"`, `id="confirm-btn"`). Components should namespace their IDs
*      (e.g. `id="rename-modal-close-btn"`) to prevent DOM collisions and Playwright
*      locator ambiguity.
*
* Usage:
*   npm run validate:template-ids
*/
enableCompileCache();
const TEMPLATE_ID_RULES = [
	"template-duplicate-static-id",
	"template-shared-static-id",
	"template-missing-input-id"
];
const STATIC_ID_REGEX = /(?:^|[\s<])id\s*=\s*["']([^"'\s>]+)["']/g;
const INTERACTIVE_TAG_REGEX = /<([\w-]+)\b/g;
const INHERENT_INTERACTIVE_TAGS = /* @__PURE__ */ new Set([
	"input",
	"select",
	"textarea",
	"button"
]);
const INTERACTIVE_EVENT_REGEX = /@(?:click|change|submit|input|keydown\.enter)\b|v-on:(?:click|change|submit|input)/i;
function extractFullTag(content, startIndex) {
	let inQuote = null;
	for (let i = startIndex; i < content.length; i++) {
		const char = content[i];
		if (inQuote) {
			if (char === inQuote) inQuote = null;
		} else if (char === "\"" || char === "'") inQuote = char;
		else if (char === ">") return {
			tag: content.substring(startIndex, i + 1),
			endIndex: i + 1
		};
	}
	return null;
}
function scanTemplateStaticIds(ctx) {
	const intraMap = /* @__PURE__ */ new Map();
	let match;
	STATIC_ID_REGEX.lastIndex = 0;
	while ((match = STATIC_ID_REGEX.exec(ctx.templateContent)) !== null) {
		const id = match[1];
		if (!id) continue;
		const info = ctx.auditor.getMatchLineInfo(ctx.content, ctx.lines, ctx.templateStartOffset + match.index);
		const occurrence = {
			file: ctx.relPath,
			line: info.lineNumber,
			context: info.lineContent.trim()
		};
		if (!intraMap.has(id)) intraMap.set(id, occurrence);
		else {
			const first = intraMap.get(id);
			ctx.auditor.addViolation({
				ruleId: "template-duplicate-static-id",
				severity: "error",
				file: ctx.relPath,
				line: info.lineNumber,
				message: `Duplicate static id '${id}' found within the same component template (previously defined at line ${first.line}).`,
				context: info.lineContent.trim()
			});
		}
		if (!ctx.globalIdMap.has(id)) ctx.globalIdMap.set(id, [occurrence]);
		else ctx.globalIdMap.get(id).push(occurrence);
	}
}
function scanTemplateFormControlIds(ctx) {
	INTERACTIVE_TAG_REGEX.lastIndex = 0;
	let formMatch;
	while ((formMatch = INTERACTIVE_TAG_REGEX.exec(ctx.templateContent)) !== null) {
		const tagType = (formMatch[1] ?? "").toLowerCase();
		const tagInfo = extractFullTag(ctx.templateContent, formMatch.index);
		if (!tagInfo) continue;
		const tagFull = tagInfo.tag;
		if (!(INHERENT_INTERACTIVE_TAGS.has(tagType) || INTERACTIVE_EVENT_REGEX.test(tagFull))) continue;
		if (tagType === "input" && /\btype\s*=\s*["']hidden["']/i.test(tagFull)) continue;
		const hasId = /\b(?:v-bind:id|:id|id)\s*=/i.test(tagFull);
		const info = ctx.auditor.getMatchLineInfo(ctx.content, ctx.lines, ctx.templateStartOffset + formMatch.index);
		if (!hasId) ctx.auditor.addViolation({
			ruleId: "template-missing-input-id",
			severity: "error",
			file: ctx.relPath,
			line: info.lineNumber,
			message: `Interactive element <${tagType}> lacks an id attribute for Playwright automation and accessibility.`,
			context: info.lineContent.trim()
		});
	}
}
var TemplateIdAuditor = class extends FileScanAuditor {
	globalIdMap = /* @__PURE__ */ new Map();
	requireInputIds;
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, (config) => [...config.paths.componentsRoots ?? [], ...config.paths.viewsRoots ?? []]);
		const config = getAuditConfig(effectiveRoot);
		super({
			ruleFixers: {},
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(TEMPLATE_ID_RULES, {
				speed: "light",
				phase: "normal",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_template_ids",
			name: "Template Static ID Uniqueness & Collision Validator",
			description: "Verifies static IDs and inputs in Vue templates",
			family: "architecture",
			ruleIds: TEMPLATE_ID_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(TEMPLATE_ID_RULES, "hygiene"),
			packageName: "Template",
			configKey: "templates.requireInputIds",
			defaultConfig: {
				enabled: true,
				requireInputIds: true
			},
			criticalConfig: {},
			icon: "🆔",
			ruleDescriptions: {
				"template-duplicate-static-id": "Duplicate static ID",
				"template-shared-static-id": "Static ID shared across components",
				"template-missing-input-id": "Form control missing unique ID"
			},
			ruleRemediations: {
				"template-duplicate-static-id": "📖 REMEDIATION GUIDE: template-duplicate-static-id\n1. Root Cause: The same static attribute `id=\"...\"` was found on two or more elements inside the same Vue component template. Under HTML5 standards, IDs must be unique within a document.\n2. Diagnosis: Locate the duplicate ID indicated in the error message and contrast it with the line of its first occurrence.\n3. Canonical Solution: Assign distinct and descriptive IDs to each element, or use CSS classes (`class=\"...\"`) if grouping for styling.\n4. Example / Auto-fix command:\n   ❌ Duplicate: `<div id=\"card\">...</div> <div id=\"card\">...</div>`\n   ✅ Unique:    `<div id=\"card-primary\">...</div> <div id=\"card-secondary\">...</div>`",
				"template-shared-static-id": "📖 REMEDIATION GUIDE: template-shared-static-id\n1. Root Cause: The same static identifier `id=\"foo\"` was detected across two different Vue components. If both mount simultaneously, an ID collision occurs in the global DOM.\n2. Diagnosis: Inspect the two component files reported in the finding.\n3. Canonical Solution:\n   a) Prefix the ID with the component name (e.g. `id=\"user-profile-header\"` vs `id=\"settings-header\"`).\n   b) Or generate unique per-instance IDs using Vue 3 `useId()` (`const inputId = useId();` with `:id=\"inputId\"`).\n4. Example / Auto-fix command:\n   ❌ Collision: `id=\"submit-btn\"` in LoginForm.vue and RegisterForm.vue\n   ✅ Prefixed:  `id=\"login-submit-btn\"` and `id=\"register-submit-btn\"`",
				"template-missing-input-id": "📖 REMEDIATION GUIDE: template-missing-input-id\n1. Root Cause: A form control (`<input>`, `<select>`, `<textarea>`) lacks an `id` attribute or `:id` binding, preventing accessible `<label :for=\"...\">` association.\n2. Diagnosis: Review the form control in the component template.\n3. Canonical Solution:\n   a) Add a unique ID to the control: `<input id=\"search-query\" ...>` and associate with `<label for=\"search-query\">`.\n   b) If reusable across multiple instances, generate the ID with Vue 3 `useId()` and bind `:id=\"id\"`.\n4. Example / Auto-fix command:\n   ❌ Missing ID: `<input v-model=\"name\" type=\"text\" />`\n   ✅ With ID:    `<input :id=\"nameInputId\" v-model=\"name\" type=\"text\" />`"
			},
			roots: targetRoots,
			allowedExtensions: /* @__PURE__ */ new Set([".vue"]),
			projectRoot: effectiveRoot
		});
		this.requireInputIds = options.requireInputIds ?? config.templates?.requireInputIds ?? false;
	}
	getMatchLineInfo(content, lines, offset) {
		const lineNumber = content.slice(0, offset).split("\n").length;
		return {
			lineNumber,
			lineContent: lines[lineNumber - 1] || ""
		};
	}
	scanFile(relPath, content) {
		const sfc = parseVueSfcBlocks(content);
		if (!sfc.template || !sfc.template.content) return;
		const ctx = {
			content,
			lines: content.split("\n"),
			templateContent: sfc.template.content,
			templateStartOffset: sfc.template.contentStartIndex,
			relPath,
			auditor: this,
			globalIdMap: this.globalIdMap
		};
		this.runSubAuditorSync("template-duplicate-static-id", () => {
			scanTemplateStaticIds(ctx);
		});
		if (this.requireInputIds) this.runSubAuditorSync("template-missing-input-id", () => {
			scanTemplateFormControlIds(ctx);
		});
	}
	checkSingleIdCollisions(id, occs) {
		const distinctFiles = Array.from(new Set(occs.map((o) => o.file)));
		if (distinctFiles.length <= 1) return;
		const firstOcc = occs[0];
		const fileSummary = distinctFiles.slice(0, 3).map((f) => path.basename(f)).join(", ") + (distinctFiles.length > 3 ? "..." : "");
		for (let i = 1; i < occs.length; i++) {
			const occ = occs[i];
			if (occ && firstOcc && occ.file !== firstOcc.file) this.addViolation({
				ruleId: "template-shared-static-id",
				severity: "error",
				file: occ.file,
				line: occ.line,
				message: `Static id '${id}' is shared across multiple components (${fileSummary}). Prefix with component name to avoid E2E locator collisions.`,
				context: occ.context
			});
		}
	}
	async runAudit() {
		await super.runAudit();
		this.runSubAuditorSync("template-shared-static-id", () => {
			for (const [id, occs] of this.globalIdMap.entries()) this.checkSingleIdCollisions(id, occs);
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new TemplateIdAuditor());
export { TEMPLATE_ID_RULES, TemplateIdAuditor };
