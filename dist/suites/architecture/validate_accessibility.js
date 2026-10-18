import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots, toPosixRelative } from "../../core/auditCoverage.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import "../../core/safePath.js";
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
			description: "Valida estándares WCAG 2.1/2.2 y accesibilidad",
			family: "architecture",
			packageName: "A11y",
			configKey: "accessibility.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "♿",
			ruleIds: ACCESSIBILITY_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(ACCESSIBILITY_RULES, "behavior"),
			ruleDescriptions: {
				"a11y-img-alt": "Imagen sin atributo alt accesible",
				"a11y-form-control-has-label": "Control de formulario sin label",
				"a11y-interactive-supports-focus": "Elemento interactivo sin foco",
				"a11y-anchor-has-content": "Enlace o botón sin texto o label",
				"a11y-aria-role-invalid": "Rol o atributo ARIA no conforme",
				"a11y-viewport-zoom-lock": "Bloqueo de zoom en viewport HTML"
			},
			ruleRemediations: {
				"a11y-img-alt": "📖 GUÍA DE REMEDIACIÓN: a11y-img-alt\n1. Causa Raíz: Se encontró una etiqueta `<img>` sin atributo `alt` (o con `alt` ausente). Los lectores de pantalla no pueden transmitir el contenido visual a usuarios con discapacidad visual (WCAG 1.1.1).\n2. Diagnóstico: Ubica la imagen señalada en la plantilla del componente Vue.\n3. Solución Canónica:\n   a) Si la imagen aporta información: describe su contenido de forma concisa mediante `alt=\"Descripción del gráfico o foto\"`.\n   b) Si la imagen es puramente decorativa: añade un atributo alt vacío explícito `alt=\"\"` o `aria-hidden=\"true\"`.\n4. Ejemplo:\n   ❌ Inaccesible: `<img src=\"/logo.png\">`\n   ✅ Accesible:   `<img src=\"/logo.png\" alt=\"Logotipo de la aplicación\">`",
				"a11y-form-control-has-label": "📖 GUÍA DE REMEDIACIÓN: a11y-form-control-has-label\n1. Causa Raíz: Un control de formulario (`<input>`, `<select>`, `<textarea>`) carece de etiqueta accesible asociada, impidiendo que los lectores de pantalla anuncien el propósito del campo (WCAG 1.3.1 / 4.1.2).\n2. Diagnóstico: Examina el campo de formulario en la línea reportada.\n3. Solución Canónica:\n   a) Asocia una etiqueta `<label :for=\"id\">Texto</label>` con el `id` correspondiente del control.\n   b) O añade un atributo `aria-label=\"Nombre del campo\"` o `aria-labelledby=\"labelId\"`.\n4. Ejemplo:\n   ❌ Inaccesible: `<input v-model=\"email\" type=\"email\" placeholder=\"Correo\">`\n   ✅ Accesible:   `<input v-model=\"email\" type=\"email\" aria-label=\"Correo electrónico\">`",
				"a11y-interactive-supports-focus": "📖 GUÍA DE REMEDIACIÓN: a11y-interactive-supports-focus\n1. Causa Raíz: Un elemento no interactivo (como `<div>` o `<span>`) tiene directivas `@click` pero no es accesible mediante teclado (`tabindex` o eventos de teclado), excluyendo a usuarios que navegan sin ratón (WCAG 2.1.1).\n2. Diagnóstico: Revisa el elemento con manejador `@click` reportado.\n3. Solución Canónica:\n   a) Convierte el elemento en un botón semántico nativo: `<button type=\"button\" @click=\"...\">`.\n   b) Si debe ser un div por diseño, añade `role=\"button\"`, `tabindex=\"0\"` y un manejador `@keydown.enter.space=\"...\"`.\n4. Ejemplo:\n   ❌ Inaccesible: `<div class=\"card\" @click=\"selectItem\">`\n   ✅ Semántico:   `<button type=\"button\" class=\"card\" @click=\"selectItem\">`",
				"a11y-anchor-has-content": "📖 GUÍA DE REMEDIACIÓN: a11y-anchor-has-content\n1. Causa Raíz: Un enlace (`<a>`) o botón (`<button>`) no contiene texto visible ni etiqueta accesible (por ejemplo, contiene únicamente un icono visual sin texto alternativo), por lo que el lector de pantalla no puede anunciar su destino o acción (WCAG 2.4.4 / 4.1.2).\n2. Diagnóstico: Comprueba el contenido del enlace o botón en la plantilla.\n3. Solución Canónica:\n   a) Añade texto descriptivo dentro del elemento o una etiqueta oculta para lectores: `<span class=\"sr-only\">Cerrar</span>`.\n   b) O define el atributo `aria-label=\"Descripción de la acción\"`.\n4. Ejemplo:\n   ❌ Vacío:     `<button @click=\"close\"><i class=\"icon-close\" /></button>`\n   ✅ Accesible: `<button @click=\"close\" aria-label=\"Cerrar modal\"><i class=\"icon-close\" aria-hidden=\"true\" /></button>`",
				"a11y-aria-role-invalid": "📖 GUÍA DE REMEDIACIÓN: a11y-aria-role-invalid\n1. Causa Raíz: Se utilizó un valor no reconocido o mal escrito en el atributo `role=\"...\"`. La especificación W3C WAI-ARIA define un catálogo estricto de roles válidos.\n2. Diagnóstico: Revisa el valor asignado a `role` en el elemento reportado.\n3. Solución Canónica: Corrige el valor utilizando un rol WAI-ARIA canónico (ej: `dialog`, `button`, `navigation`, `tab`, `alert`).\n4. Ejemplo:\n   ❌ Inválido: `<div role=\"modal-box\">`\n   ✅ Conforme: `<div role=\"dialog\" aria-modal=\"true\">`",
				"a11y-viewport-zoom-lock": "📖 GUÍA DE REMEDIACIÓN: a11y-viewport-zoom-lock\n1. Causa Raíz: La etiqueta `<meta name=\"viewport\">` en `index.html` bloquea el zoom del usuario (`user-scalable=no` o `maximum-scale=1.0`). Esto impide que personas con baja visión amplíen el contenido, violando WCAG 1.4.4 (Resize Text).\n2. Diagnóstico: Inspecciona el archivo `index.html` en la etiqueta meta viewport.\n3. Solución Canónica: Elimina `user-scalable=no`, `user-scalable=0` y `maximum-scale=1.0`. Permite que el viewport sea el estándar responsivo.\n4. Ejemplo:\n   ❌ Bloqueo: `<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, user-scalable=no\">`\n   ✅ Accesible: `<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">`"
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
					message: "Elemento <img> no posee atributo alt accesible. Viola WCAG 1.1.1 Non-text Content.",
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
					message: "Control de formulario sin label asociado ni aria-label. Viola WCAG 1.3.1 Info and Relationships.",
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
					message: `Elemento no interactivo <${match[1]}> con manejador de clic sin soporte de foco ni teclado. Viola WCAG 2.1.1 Keyboard.`,
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
					message: `Elemento <${tag}> carece de contenido textual accesible o aria-label. Viola WCAG 2.4.4 Link Purpose.`,
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
					message: `El rol ARIA '${roleVal}' no es un rol WAI-ARIA válido conforme a W3C.`,
					fixable: false
				});
			}
		}
	}
	auditIndexViewport() {
		const indexPath = path.resolve(this.projectRoot, INDEX_HTML_FILE);
		if (!fs.existsSync(indexPath)) {
			this.markRuleNotApplicable("a11y-viewport-zoom-lock", `No existe ${INDEX_HTML_FILE} en la raíz del proyecto`);
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
				message: "Meta viewport bloquea el zoom móvil (user-scalable=no o maximum-scale=1.0). Viola WCAG 1.4.4 Resize text.",
				fixable: false
			});
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateAccessibilityAuditor());
//#endregion
export { ACCESSIBILITY_RULES, ValidateAccessibilityAuditor, mapA11yRuleId };
