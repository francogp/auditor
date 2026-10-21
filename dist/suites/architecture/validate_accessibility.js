import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots, toPosixRelative } from "../../core/auditCoverage.js";
import "../../core/safePath.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { parseVueSfc as parseVueSfcBlocks } from "../../core/vueSfcParser.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_accessibility.ts
enableCompileCache();
const INDEX_HTML_FILE = "index.html";
const VUE_EXTENSIONS = /* @__PURE__ */ new Set([".vue"]);
const ACCESSIBILITY_RULES = [
	"a11y-img-alt",
	"a11y-form-control-has-label",
	"a11y-interactive-supports-focus",
	"a11y-anchor-has-content",
	"a11y-aria-role-invalid",
	"a11y-viewport-zoom-lock"
];
const TEMPLATE_BACKED_RULES = ACCESSIBILITY_RULES.filter((id) => id !== "a11y-viewport-zoom-lock");
const A11Y_RULE_ID_MAP = {
	"alt-text": "a11y-img-alt",
	"form-control-has-label": "a11y-form-control-has-label",
	"label-has-for": "a11y-form-control-has-label",
	"interactive-supports-focus": "a11y-interactive-supports-focus",
	"click-events-have-key-events": "a11y-interactive-supports-focus",
	"mouse-events-have-key-events": "a11y-interactive-supports-focus",
	"anchor-has-content": "a11y-anchor-has-content",
	"heading-has-content": "a11y-anchor-has-content",
	"aria-props": "a11y-aria-role-invalid",
	"aria-role": "a11y-aria-role-invalid",
	"aria-unsupported-elements": "a11y-aria-role-invalid",
	"role-has-required-aria-props": "a11y-aria-role-invalid",
	"no-redundant-roles": "a11y-aria-role-invalid",
	"no-role-presentation-on-focusable": "a11y-aria-role-invalid"
};
const VALID_WAI_ARIA_ROLES = /* @__PURE__ */ new Set([
	"alert",
	"alertdialog",
	"application",
	"article",
	"banner",
	"button",
	"cell",
	"checkbox",
	"columnheader",
	"combobox",
	"complementary",
	"contentinfo",
	"definition",
	"dialog",
	"directory",
	"document",
	"feed",
	"figure",
	"form",
	"grid",
	"gridcell",
	"group",
	"heading",
	"img",
	"link",
	"list",
	"listbox",
	"listitem",
	"log",
	"main",
	"marquee",
	"math",
	"menu",
	"menubar",
	"menuitem",
	"menuitemcheckbox",
	"menuitemradio",
	"navigation",
	"none",
	"note",
	"option",
	"presentation",
	"progressbar",
	"radio",
	"radiogroup",
	"region",
	"row",
	"rowgroup",
	"rowheader",
	"scrollbar",
	"search",
	"searchbox",
	"separator",
	"slider",
	"spinbutton",
	"status",
	"switch",
	"tab",
	"table",
	"tablist",
	"tabpanel",
	"term",
	"textbox",
	"timer",
	"toolbar",
	"tooltip",
	"tree",
	"treegrid",
	"treeitem"
]);
/**
* Maps an eslint-plugin-vuejs-accessibility rule to canonical AccessibilityRuleId.
*/
function mapA11yRuleId(eslintRuleId) {
	const bare = eslintRuleId.replace(/^vuejs-accessibility\//, "");
	return A11Y_RULE_ID_MAP[bare] ?? "a11y-aria-role-invalid";
}
var ValidateAccessibilityAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const effectiveRoot = options.projectRoot ?? process.cwd();
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(ACCESSIBILITY_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			fix: options.fix,
			id: "validate_accessibility",
			name: "Vue & Web Accessibility Standards Auditor",
			description: "Validates WCAG 2.1/2.2 standards and accessibility",
			family: "architecture",
			packageName: "A11y",
			configKey: "accessibility.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "♿",
			ruleIds: ACCESSIBILITY_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(ACCESSIBILITY_RULES, "behavior"),
			ruleDescriptions: {
				"a11y-img-alt": "Image missing accessible alt attribute",
				"a11y-form-control-has-label": "Form control missing label",
				"a11y-interactive-supports-focus": "Interactive element missing focus",
				"a11y-anchor-has-content": "Link or button missing text or label",
				"a11y-aria-role-invalid": "Non-compliant ARIA role or attribute",
				"a11y-viewport-zoom-lock": "Viewport zoom lock in HTML"
			},
			ruleRemediations: {
				"a11y-img-alt": "📖 REMEDIATION GUIDE: a11y-img-alt\n1. Root Cause: An `<img>` tag was found without an `alt` attribute (or with missing `alt`). Screen readers cannot convey visual content to visually impaired users (WCAG 1.1.1).\n2. Diagnosis: Locate the reported image in the Vue component template.\n3. Canonical Solution:\n   a) If the image conveys information: concisely describe its content via `alt=\"Description of graphic or photo\"`.\n   b) If the image is purely decorative: add an explicit empty `alt=\"\"` or `aria-hidden=\"true\"`.\n4. Example / Auto-fix command:\n   ❌ Inaccessible: `<img src=\"/logo.png\">`\n   ✅ Accessible:   `<img src=\"/logo.png\" alt=\"Application logo\">`",
				"a11y-form-control-has-label": "📖 REMEDIATION GUIDE: a11y-form-control-has-label\n1. Root Cause: A form control (`<input>`, `<select>`, `<textarea>`) lacks an associated accessible label, preventing screen readers from announcing field purpose (WCAG 1.3.1 / 4.1.2).\n2. Diagnosis: Examine the form control at the reported line.\n3. Canonical Solution:\n   a) Associate a `<label :for=\"id\">Text</label>` with the control's matching `id`.\n   b) Or add an `aria-label=\"Field name\"` or `aria-labelledby=\"labelId\"` attribute.\n4. Example / Auto-fix command:\n   ❌ Inaccessible: `<input v-model=\"email\" type=\"email\" placeholder=\"Email\">`\n   ✅ Accessible:   `<input v-model=\"email\" type=\"email\" aria-label=\"Email address\">`",
				"a11y-interactive-supports-focus": "📖 REMEDIATION GUIDE: a11y-interactive-supports-focus\n1. Root Cause: A non-interactive element (e.g. `<div>` or `<span>`) has `@click` handlers but is not keyboard accessible (`tabindex` or keyboard listeners), excluding keyboard-only users (WCAG 2.1.1).\n2. Diagnosis: Check the element with `@click` at the reported line.\n3. Canonical Solution:\n   a) Convert the element into a native semantic button: `<button type=\"button\" @click=\"...\">`.\n   b) If it must remain a div for layout, add `role=\"button\"`, `tabindex=\"0\"`, and a `@keydown.enter.space=\"...\"` listener.\n4. Example / Auto-fix command:\n   ❌ Inaccessible: `<div class=\"card\" @click=\"selectItem\">`\n   ✅ Semantic:     `<button type=\"button\" class=\"card\" @click=\"selectItem\">`",
				"a11y-anchor-has-content": "📖 REMEDIATION GUIDE: a11y-anchor-has-content\n1. Root Cause: A link (`<a>`) or button (`<button>`) has no visible text or accessible label (e.g. an icon without text alternative), preventing screen readers from announcing its destination or action (WCAG 2.4.4 / 4.1.2).\n2. Diagnosis: Check link or button content in the template.\n3. Canonical Solution:\n   a) Add descriptive text or a visually hidden label: `<span class=\"sr-only\">Close</span>`.\n   b) Or define `aria-label=\"Action description\"`.\n4. Example / Auto-fix command:\n   ❌ Empty:      `<button @click=\"close\"><i class=\"icon-close\" /></button>`\n   ✅ Accessible: `<button @click=\"close\" aria-label=\"Close modal\"><i class=\"icon-close\" aria-hidden=\"true\" /></button>`",
				"a11y-aria-role-invalid": "📖 REMEDIATION GUIDE: a11y-aria-role-invalid\n1. Root Cause: An unrecognized or misspelled value was used in `role=\"...\"`. W3C WAI-ARIA defines an exact catalog of valid roles.\n2. Diagnosis: Inspect the value assigned to `role` at the reported element.\n3. Canonical Solution: Correct the value using a canonical WAI-ARIA role (e.g. `dialog`, `button`, `navigation`, `tab`, `alert`).\n4. Example / Auto-fix command:\n   ❌ Invalid:    `<div role=\"modal-box\">`\n   ✅ Compliant:  `<div role=\"dialog\" aria-modal=\"true\">`",
				"a11y-viewport-zoom-lock": "📖 REMEDIATION GUIDE: a11y-viewport-zoom-lock\n1. Root Cause: The `<meta name=\"viewport\">` tag in `index.html` disables user zooming (`user-scalable=no` or `maximum-scale=1.0`), preventing low-vision users from magnifying content (WCAG 1.4.4 Resize Text).\n2. Diagnosis: Inspect `index.html` at the viewport meta tag.\n3. Canonical Solution: Remove `user-scalable=no`, `user-scalable=0`, and `maximum-scale=1.0`. Allow standard responsive zoom.\n4. Example / Auto-fix command:\n   ❌ Locked:     `<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, user-scalable=no\">`\n   ✅ Accessible: `<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">`"
			},
			projectRoot: effectiveRoot,
			coverage: { include: [INDEX_HTML_FILE, "src/**/*.vue"] }
		});
	}
	async runAudit() {
		if (this.isSuiteGatingDisabled("Accesibilidad desactivada en config")) return;
		const config = getAuditConfig(this.projectRoot);
		const scannableRoots = [
			...config.paths.componentsRoots ?? [],
			...config.paths.viewsRoots ?? [],
			...config.paths.srcRoots ?? []
		];
		this.redeclareCoverage({ include: [INDEX_HTML_FILE, ...deriveCoverageFromRoots(scannableRoots, VUE_EXTENSIONS).include] });
		this.runSubAuditorSync("a11y-viewport-zoom-lock", () => {
			this.auditIndexViewport();
		});
		const vueFiles = this.context.collectFiles(scannableRoots, /* @__PURE__ */ new Set([".vue"]));
		if (vueFiles.length === 0) {
			for (const ruleId of TEMPLATE_BACKED_RULES) this.runSubAuditorSync(ruleId, () => {
				this.markRuleNotApplicable(ruleId, "No hay archivos .vue en las raíces configuradas");
			});
			return;
		}
		for (const ruleId of TEMPLATE_BACKED_RULES) this.runSubAuditorSync(ruleId, () => {
			for (const absFile of vueFiles) {
				const relFile = toPosixRelative(this.projectRoot, absFile);
				this.recordScanned(relFile);
				this.auditVueFileForRule(absFile, relFile, ruleId);
			}
		});
	}
	auditVueFileForRule(absPath, relPath, ruleId) {
		let content = "";
		try {
			content = fs.readFileSync(absPath, "utf-8");
		} catch {
			return;
		}
		const blocks = parseVueSfcBlocks(content);
		if (!blocks.template) return;
		const templateContent = blocks.template.content;
		const linesBeforeTemplate = Math.max(0, blocks.template.contentStartLine - 1);
		switch (ruleId) {
			case "a11y-img-alt":
				this.auditImgAlt(templateContent, relPath, linesBeforeTemplate);
				break;
			case "a11y-form-control-has-label":
				this.auditFormControlLabel(templateContent, relPath, linesBeforeTemplate);
				break;
			case "a11y-interactive-supports-focus":
				this.auditInteractiveFocus(templateContent, relPath, linesBeforeTemplate);
				break;
			case "a11y-anchor-has-content":
				this.auditAnchorContent(templateContent, relPath, linesBeforeTemplate);
				break;
			case "a11y-aria-role-invalid": this.auditAriaRole(templateContent, relPath, linesBeforeTemplate);
		}
	}
	auditImgAlt(template, relPath, lineOffset) {
		const imgRegex = /<img\b([^>]*)>/gi;
		let match;
		while ((match = imgRegex.exec(template)) !== null) {
			const attrs = match[1] ?? "";
			const hasAlt = /\b(?:alt|:alt|v-bind:alt)\s*=/i.test(attrs);
			const isAriaHidden = /aria-hidden\s*=\s*["']true["']/i.test(attrs);
			const isPresentation = /role\s*=\s*["'](?:presentation|none)["']/i.test(attrs);
			if (!hasAlt && !isAriaHidden && !isPresentation) {
				const lineNum = lineOffset + template.slice(0, match.index).split("\n").length;
				this.addViolation({
					ruleId: "a11y-img-alt",
					severity: "error",
					file: relPath,
					line: lineNum,
					context: match[0],
					message: "Element <img> is missing accessible alt attribute. Violates WCAG 1.1.1 Non-text Content.",
					fixable: false
				});
			}
		}
	}
	auditFormControlLabel(template, relPath, lineOffset) {
		const inputRegex = /<(?:input|select|textarea)\b([^>]*)>/gi;
		let match;
		while ((match = inputRegex.exec(template)) !== null) {
			const attrs = match[1] ?? "";
			if (/type\s*=\s*["'](?:hidden|submit|button|reset|image)["']/i.test(attrs)) continue;
			const hasAriaLabel = /\b(?:aria-label|aria-labelledby|:aria-label|:aria-labelledby)\s*=/i.test(attrs);
			const hasId = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs);
			let hasAssociatedLabel = false;
			if (hasId && hasId[1]) {
				const idVal = hasId[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				hasAssociatedLabel = new RegExp(`<label[^>]*\\s(?:for|:for)\\s*=\\s*["']${idVal}["']`, "i").test(template);
			}
			if (!hasAriaLabel && !hasAssociatedLabel) {
				const lineNum = lineOffset + template.slice(0, match.index).split("\n").length;
				this.addViolation({
					ruleId: "a11y-form-control-has-label",
					severity: "error",
					file: relPath,
					line: lineNum,
					context: match[0],
					message: "Form control missing associated label or aria-label. Violates WCAG 1.3.1 Info and Relationships.",
					fixable: false
				});
			}
		}
	}
	auditInteractiveFocus(template, relPath, lineOffset) {
		const nonInteractiveClickRegex = /<(div|span|p|li|section|article)\b([^>]*(?:@click|v-on:click|@mousedown|v-on:mousedown)[^>]*)>/gi;
		let match;
		while ((match = nonInteractiveClickRegex.exec(template)) !== null) {
			const attrs = match[2] ?? "";
			const hasTabIndex = /\btabindex\s*=/i.test(attrs);
			const hasRoleButton = /role\s*=\s*["']button["']/i.test(attrs);
			const hasKeyListeners = /@(keydown|keyup|keypress)\b/i.test(attrs);
			if (!hasTabIndex && !hasRoleButton && !hasKeyListeners) {
				const lineNum = lineOffset + template.slice(0, match.index).split("\n").length;
				this.addViolation({
					ruleId: "a11y-interactive-supports-focus",
					severity: "error",
					file: relPath,
					line: lineNum,
					context: match[0],
					message: `Non-interactive element <${match[1]}> with click handler without focus or keyboard support. Violates WCAG 2.1.1 Keyboard.`,
					fixable: false
				});
			}
		}
	}
	auditAnchorContent(template, relPath, lineOffset) {
		const tagRegex = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
		let match;
		while ((match = tagRegex.exec(template)) !== null) {
			const tag = match[1] ?? "";
			const attrs = match[2] ?? "";
			const inner = match[3] ?? "";
			const hasAriaLabel = /\b(?:aria-label|aria-labelledby|:aria-label|:aria-labelledby)\s*=/i.test(attrs);
			const hasText = inner.replace(/<[^>]*>/g, "").trim().length > 0;
			const hasAccessibleInner = /<(?:img|svg)\b[^>]*(?:alt|aria-label|title)=/i.test(inner);
			if (!hasAriaLabel && !hasText && !hasAccessibleInner) {
				const lineNum = lineOffset + template.slice(0, match.index).split("\n").length;
				this.addViolation({
					ruleId: "a11y-anchor-has-content",
					severity: "error",
					file: relPath,
					line: lineNum,
					context: match[0].slice(0, 100),
					message: `Element <${tag}> lacks accessible textual content or aria-label. Violates WCAG 2.4.4 Link Purpose.`,
					fixable: false
				});
			}
		}
	}
	auditAriaRole(template, relPath, lineOffset) {
		const roleRegex = /\brole\s*=\s*["']([^"']+)["']/gi;
		let match;
		while ((match = roleRegex.exec(template)) !== null) {
			const roleVal = match[1]?.trim().toLowerCase() ?? "";
			if (!VALID_WAI_ARIA_ROLES.has(roleVal)) {
				const lineNum = lineOffset + template.slice(0, match.index).split("\n").length;
				this.addViolation({
					ruleId: "a11y-aria-role-invalid",
					severity: "error",
					file: relPath,
					line: lineNum,
					context: match[0],
					message: `ARIA role '${roleVal}' is not a valid WAI-ARIA role according to W3C.`,
					fixable: false
				});
			}
		}
	}
	auditIndexViewport() {
		const indexPath = path.resolve(this.projectRoot, INDEX_HTML_FILE);
		if (!fs.existsSync(indexPath)) {
			this.markRuleNotApplicable("a11y-viewport-zoom-lock", `${INDEX_HTML_FILE} does not exist at project root`);
			return;
		}
		const content = fs.readFileSync(indexPath, "utf-8");
		this.recordScanned(INDEX_HTML_FILE);
		const viewportMatch = content.match(/<meta\s+name=["']viewport["'][^>]*>/i);
		if (!viewportMatch) return;
		const tag = viewportMatch[0];
		const userScalableNo = /user-scalable\s*=\s*(?:no|0)/i.test(tag);
		const maxScaleOne = /maximum-scale\s*=\s*1(?:\.0+)?(?:\b|[,;\s])/i.test(tag);
		if (userScalableNo || maxScaleOne) {
			const lineNum = content.slice(0, viewportMatch.index).split("\n").length;
			this.addViolation({
				ruleId: "a11y-viewport-zoom-lock",
				severity: "error",
				file: INDEX_HTML_FILE,
				line: lineNum,
				context: tag.trim(),
				message: "Meta viewport blocks mobile zoom (user-scalable=no or maximum-scale=1.0). Violates WCAG 1.4.4 Resize text.",
				fixable: false
			});
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateAccessibilityAuditor());
//#endregion
export { ACCESSIBILITY_RULES, ValidateAccessibilityAuditor, mapA11yRuleId };
