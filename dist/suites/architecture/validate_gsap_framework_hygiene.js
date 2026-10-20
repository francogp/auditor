import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { matchesAnyRoot } from "../../core/auditRootMatcher.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import { isInCodeRoots } from "../../core/auditCodeRoots.js";
import { isExemptFile } from "../../core/auditPathPredicates.js";
import "../../core/auditConfig.js";
import "../../core/safePath.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { scanBalancedParens } from "../../core/scannerUtils.js";
import { enableCompileCache } from "node:module";
//#region src/suites/architecture/validate_gsap_framework_hygiene.ts
/**
* src/suites/architecture/validate_gsap_framework_hygiene.ts
*
* GSAP FRAMEWORK HYGIENE & COMPONENT LIFECYCLE AUDITOR (Node.js 26+ Native)
*
* Enforces best practices for GSAP in UI frameworks (Vue SFC, React, Svelte):
*   1. `gsap-unscoped-component-selectors`: Prohibits unscoped global selectors in UI components.
*   2. `gsap-missing-context-revert`: Enforces ctx.revert() or kill() on component unmount.
*   3. `gsap-missing-plugin-registration`: Enforces gsap.registerPlugin(...) for imported GSAP plugins.
*   4. `gsap-banned-devtools-production`: Prohibits GSDevTools or MotionPathHelper without dev guard.
*
* Escape Hatches:
*   `// scope-ok: <reason>`, `// revert-ok: <reason>`, `// plugin-ok: <reason>`, `// devtools-ok: <reason>`
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_gsap_framework_hygiene.ts
*/
enableCompileCache();
const GSAP_FRAMEWORK_HYGIENE_RULES = [
	"gsap-unscoped-component-selectors",
	"gsap-missing-context-revert",
	"gsap-missing-plugin-registration",
	"gsap-banned-devtools-production"
];
const DEVTOOLS_GUARD_WINDOW_PRE_CHARS = 150;
const DEVTOOLS_GUARD_WINDOW_POST_CHARS = 200;
function findGsapScopeRanges(content) {
	const ranges = [];
	const scopeRegex = /\b(?:gsap\.context|useGSAP|\w*ctx\.add)\s*\(/g;
	let match;
	while ((match = scopeRegex.exec(content)) !== null) {
		const openParenIndex = match.index + match[0].length - 1;
		const result = scanBalancedParens(content, openParenIndex + 1);
		if (result.depth === 0) ranges.push({
			start: match.index,
			end: result.end
		});
	}
	return ranges;
}
function isInsideAnyScopeRange(index, ranges) {
	return ranges.some((r) => index >= r.start && index < r.end);
}
var ValidateGsapFrameworkHygieneAuditor = class extends FileScanAuditor {
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options);
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			projectRoot: effectiveRoot,
			roots: targetRoots,
			id: "validate_gsap_framework_hygiene",
			name: "GSAP Framework Hygiene",
			description: "Gobernanza de ciclo de vida UI, scope y plugins GSAP",
			family: "architecture",
			packageName: "GSAP",
			icon: "🎭",
			configKey: "animation",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			ruleCapabilities: createRuleCapabilities(GSAP_FRAMEWORK_HYGIENE_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			allowedExtensions: /* @__PURE__ */ new Set([
				".ts",
				".vue",
				".tsx",
				".jsx"
			]),
			ruleIds: GSAP_FRAMEWORK_HYGIENE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(GSAP_FRAMEWORK_HYGIENE_RULES, "behavior"),
			ruleDescriptions: {
				"gsap-unscoped-component-selectors": "Selector global sin acotar en UI",
				"gsap-missing-context-revert": "Falta revert o cleanup en unmount",
				"gsap-missing-plugin-registration": "Plugin GSAP usado sin registrar",
				"gsap-banned-devtools-production": "Herramienta devtools en producción"
			},
			ruleRemediations: {
				"gsap-unscoped-component-selectors": "Causa Raíz:\nSe utilizan selectores CSS globales tipo string (ej. \".card\", \"#btn\") en un componente UI (Vue SFC, React, Svelte).\nEsto busca elementos en todo el document global, animando accidentalmente otras instancias del mismo componente o elementos ajenos en la página.\n\nDiagnóstico:\nIdentifica el selector string pasado a gsap.to/from. En componentes UI, el selector debe acotarse al subárbol del componente.\n\nSolución Canónica:\n1. Envolver las animaciones dentro de \"gsap.context((self) => { ... }, rootElementRef.value)\". Todos los selectores dentro del contexto se acotan automáticamente a rootElementRef.\n2. Alternativamente, pasar directamente la referencia del elemento del DOM (ref.value o template ref) en lugar de un string.\n\nEjemplo Antes vs Después:\n// ❌ Incorrecto: selector global sin acotar en Vue SFC\ngsap.to(\".card\", { opacity: 1 });\n\n// ✅ Correcto: acotado con gsap.context y template ref\nconst root = ref<HTMLElement | null>(null);\nlet ctx: gsap.Context;\nonMounted(() => {\n  ctx = gsap.context(() => {\n    gsap.to(\".card\", { opacity: 1 }); // busca solo dentro de root\n  }, root.value);\n});",
				"gsap-missing-context-revert": "Causa Raíz:\nEl componente inicializa animaciones con \"gsap.context()\" pero no invoca \"ctx.revert()\" al desmontarse (onUnmounted en Vue, cleanup de useEffect en React).\nEsto produce fugas de memoria, tweens huérfanos y distorsiones visuales si el usuario navega y vuelve al componente.\n\nDiagnóstico:\nRevisa el ciclo de vida del componente donde se crea el contexto de GSAP.\n\nSolución Canónica:\nGuardar la instancia de gsap.context en una variable de alcance de componente y llamar a \"ctx.revert()\" en el hook \"onUnmounted\" (o \"onScopeDispose\").\n\nEjemplo Antes vs Después:\n// ❌ Incorrecto: contexto creado sin revertir al desmontar\nonMounted(() => {\n  gsap.context(() => { gsap.to(el.value, { x: 100 }); });\n});\n\n// ✅ Correcto: revert canónico en desmontaje\nlet ctx: gsap.Context;\nonMounted(() => {\n  ctx = gsap.context(() => { gsap.to(el.value, { x: 100 }); });\n});\nonUnmounted(() => {\n  ctx?.revert();\n});",
				"gsap-missing-plugin-registration": "Causa Raíz:\nSe importa un plugin de GSAP (ScrollTrigger, Flip, Draggable, SplitText, etc.) pero no se ejecuta \"gsap.registerPlugin(PluginName)\".\nSin el registro explícito, los bundlers modernos como Vite / Rollup pueden descartar el plugin en producción por tree-shaking o fallar en inicializar los hooks del núcleo de GSAP.\n\nDiagnóstico:\nRevisa los imports del archivo. Si importas ScrollTrigger de \"gsap/ScrollTrigger\", debes registrarlo antes de usarlo.\n\nSolución Canónica:\nInvocar \"gsap.registerPlugin(ScrollTrigger)\" inmediatamente debajo de las sentencias import.\n\nEjemplo Antes vs Después:\n// ❌ Incorrecto: importar y usar directamente\nimport { ScrollTrigger } from \"gsap/ScrollTrigger\";\ngsap.to(\".box\", { scrollTrigger: \".box\" });\n\n// ✅ Correcto: registro explícito del plugin\nimport { gsap } from \"gsap\";\nimport { ScrollTrigger } from \"gsap/ScrollTrigger\";\ngsap.registerPlugin(ScrollTrigger);",
				"gsap-banned-devtools-production": "Causa Raíz:\nSe detectó el uso de herramientas de depuración visual de GSAP (GSDevTools o MotionPathHelper) sin una guarda condicional de entorno de desarrollo.\nEstas utilidades incrementan el peso del bundle y exponen controles de depuración en entornos productivos.\n\nDiagnóstico:\nBusca llamadas a \"GSDevTools.create()\" o \"MotionPathHelper.create()\".\n\nSolución Canónica:\nEnvolver la llamada en una guarda \"if (import.meta.env.DEV)\" o eliminar la herramienta una vez concluida la calibración de la animación.\n\nEjemplo Antes vs Después:\n// ❌ Incorrecto: GSDevTools expuesto incondicionalmente\nGSDevTools.create();\n\n// ✅ Correcto: protegido bajo guarda de desarrollo\nif (import.meta.env.DEV) {\n  GSDevTools.create();\n}"
			}
		});
	}
	scanFile(relPath, content) {
		const norm = normalizePosixPath(relPath);
		if (!this.isCodeFile(norm) || isExemptFile(relPath)) return;
		this.runSubAuditorSync("gsap-unscoped-component-selectors", () => {
			if (this.isUiComponent(norm) && isInCodeRoots(relPath)) this.scanUnscopedSelectors(relPath, content);
		});
		this.runSubAuditorSync("gsap-missing-context-revert", () => {
			if (this.isUiComponent(norm) && isInCodeRoots(relPath)) this.scanContextRevert(relPath, content);
		});
		this.runSubAuditorSync("gsap-missing-plugin-registration", () => {
			this.scanPluginRegistration(relPath, content);
		});
		this.runSubAuditorSync("gsap-banned-devtools-production", () => {
			this.scanDevtoolsProduction(relPath, content);
		});
	}
	isCodeFile(norm) {
		return norm.endsWith(".ts") || norm.endsWith(".vue") || norm.endsWith(".tsx") || norm.endsWith(".jsx");
	}
	isUiComponent(norm) {
		const config = getAuditConfig(this.projectRoot);
		const uiRoots = [...config.paths.componentsRoots ?? [], ...config.paths.viewsRoots ?? []];
		return norm.endsWith(".vue") || matchesAnyRoot(norm, uiRoots);
	}
	scanUnscopedSelectors(relPath, content) {
		const scopeRanges = findGsapScopeRanges(content);
		const unscopedRegex = /\b(?:gsap|timeline|\w*Timeline|tl)\s*\.\s*(?:to|from|fromTo)\s*\(\s*['"]([.#][\w\s>+~.:#-]+)['"]/g;
		let m;
		while ((m = unscopedRegex.exec(content)) !== null) {
			const selector = m[1];
			const preceding = content.slice(Math.max(0, m.index - 200), m.index);
			const lineEnd = content.indexOf("\n", m.index);
			const currentLine = content.slice(m.index, lineEnd === -1 ? void 0 : lineEnd);
			const nearby = preceding + "\n" + currentLine;
			if (/\/\/\s*(?:scope-ok|selector-ok):\s*\S+/i.test(nearby)) continue;
			if (!isInsideAnyScopeRange(m.index, scopeRanges)) this.addViolationAtMatch({
				ruleId: "gsap-unscoped-component-selectors",
				filePath: relPath,
				content,
				matchIndex: m.index,
				message: `Selector global '${selector}' en componente UI sin scope acotado. Usa 'gsap.context(..., rootRef.value)' o 'useGSAP()' para evitar fugas.`,
				severity: "error"
			});
		}
	}
	scanContextRevert(relPath, content) {
		if (!/gsap\.context\s*\(/.test(content)) return;
		const hasRevert = /\.revert\s*\(|\.kill\s*\(/.test(content);
		const hasUnmountLifecycle = /onUnmounted|onScopeDispose|useEffect/.test(content);
		const hasRevertOk = /\/\/\s*revert-ok:\s*\S+/i.test(content);
		if ((!hasRevert || !hasUnmountLifecycle) && !hasRevertOk) this.addViolationAtMatch({
			ruleId: "gsap-missing-context-revert",
			filePath: relPath,
			content,
			matchIndex: content.indexOf("gsap.context"),
			message: "Uso de 'gsap.context()' en componente UI sin llamar a 'revert()' en 'onUnmounted' / 'onScopeDispose'.",
			severity: "error"
		});
	}
	scanPluginRegistration(relPath, content) {
		const pluginImportRegex = /import\s*\{[^}]*\b(ScrollTrigger|Flip|Draggable|SplitText|Observer|ScrollSmoother|InertiaPlugin|MotionPathPlugin)\b[^}]*\}\s*from\s*['"]gsap\/[a-zA-Z0-9]+['"]/g;
		let pluginMatch;
		while ((pluginMatch = pluginImportRegex.exec(content)) !== null) {
			const pluginName = pluginMatch[1];
			const hasRegister = new RegExp(`gsap\\.registerPlugin\\s*\\([^)]*\\b${pluginName}\\b`).test(content);
			const hasPluginOk = /\/\/\s*plugin-ok:\s*\S+/i.test(content);
			if (!hasRegister && !hasPluginOk) this.addViolationAtMatch({
				ruleId: "gsap-missing-plugin-registration",
				filePath: relPath,
				content,
				matchIndex: pluginMatch.index,
				message: `Plugin GSAP '${pluginName}' importado sin llamar a 'gsap.registerPlugin(${pluginName})'. Riesgo de descarte por tree-shaking.`,
				severity: "error"
			});
		}
	}
	scanDevtoolsProduction(relPath, content) {
		const devtoolsRegex = /\b(GSDevTools|MotionPathHelper)\.create\s*\(/g;
		let devtoolsMatch;
		while ((devtoolsMatch = devtoolsRegex.exec(content)) !== null) {
			const toolName = devtoolsMatch[1];
			const windowAround = content.slice(Math.max(0, devtoolsMatch.index - 150), Math.min(content.length, devtoolsMatch.index + 200));
			const hasDevGuard = /import\.meta\.env\.DEV|NODE_ENV\s*!==\s*['"]production['"]/i.test(windowAround);
			const hasDevtoolsOk = /\/\/\s*devtools-ok:\s*\S+/i.test(windowAround);
			if (!hasDevGuard && !hasDevtoolsOk) this.addViolationAtMatch({
				ruleId: "gsap-banned-devtools-production",
				filePath: relPath,
				content,
				matchIndex: devtoolsMatch.index,
				message: `Herramienta de depuración '${toolName}' detectada sin guardia de entorno 'import.meta.env.DEV'. Prohibida en producción.`,
				severity: "error"
			});
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateGsapFrameworkHygieneAuditor());
//#endregion
export { DEVTOOLS_GUARD_WINDOW_POST_CHARS, DEVTOOLS_GUARD_WINDOW_PRE_CHARS, GSAP_FRAMEWORK_HYGIENE_RULES, ValidateGsapFrameworkHygieneAuditor, findGsapScopeRanges };
