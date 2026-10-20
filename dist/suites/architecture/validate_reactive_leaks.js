import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import ts from "typescript";
//#region src/suites/architecture/validate_reactive_leaks.ts
/**
* scripts/auditors/architecture/validate_reactive_leaks.ts
*
* REACTIVE & DOM EVENT LEAK AUDITOR (Node.js 26+ Native)
*
* Enforces strict memory leak prevention and listener hygiene across Vue components and composables:
*   1. Event Listeners: Every window/document/element.addEventListener must either have { once: true },
*      an explicit removeEventListener, or an unmount lifecycle hook (onUnmounted, onBeforeUnmount, onScopeDispose).
*   2. Native Timers: Every setInterval must have a clearInterval.
*
* Escape Hatch:
*   // leak-ok: <justification> or // reactive-leak-ok: <justification>
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_reactive_leaks.ts
*   npm run validate:reactive-leaks
*/
enableCompileCache();
const REACTIVE_LEAK_RULES = ["dom-event-leak", "interval-leak"];
function hasOnceOption(node) {
	if (node.arguments.length < 3) return false;
	const optionsArg = node.arguments[2];
	if (!optionsArg || !ts.isObjectLiteralExpression(optionsArg)) return false;
	for (const prop of optionsArg.properties) if (ts.isPropertyAssignment(prop) && prop.name && ts.isIdentifier(prop.name) && prop.name.text === "once") {
		if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) return true;
	}
	return false;
}
var ReactiveLeaksAuditor = class extends FileScanAuditor {
	constructor(options = {}) {
		const scanRoots = resolveFileScanRoots(options, (cfg) => [
			...cfg.paths.componentsRoots ?? [],
			...cfg.paths.viewsRoots ?? [],
			...cfg.paths.composablesRoots ?? []
		]);
		super({
			id: "validate_reactive_leaks",
			name: "Reactive & DOM Event Leak Auditor",
			description: "Detecta posibles fugas de memoria y listeners sin limpiar",
			family: "architecture",
			usesThirdPartyTool: false,
			requiredPermissions: [],
			roots: scanRoots.targetRoots,
			projectRoot: scanRoots.effectiveRoot,
			ruleCapabilities: createRuleCapabilities(REACTIVE_LEAK_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: true,
				changedOnly: false,
				critical: false
			}),
			ruleIds: REACTIVE_LEAK_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(REACTIVE_LEAK_RULES, "behavior"),
			packageName: "Fuga",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "💧",
			ruleDescriptions: {
				"dom-event-leak": "addEventListener sin limpiar",
				"interval-leak": "setInterval sin limpiar"
			},
			ruleRemediations: {
				"dom-event-leak": "Causa Raíz:\nSe registró un escucha de eventos (\"addEventListener\") sobre window, document o un elemento del DOM dentro de un componente o composable sin mecanismo de desregistro.\nSi el componente se desmonta y el listener no se elimina, la función callback permanece viva en memoria y retiene todo el ámbito léxico del componente, produciendo fugas de memoria acumulativas.\n\nDiagnóstico:\nRevisa la llamada a \"addEventListener\". Faltan la opción \"{ once: true }\", la llamada a \"removeEventListener\" o el ciclo de vida \"onUnmounted\" / \"onScopeDispose\".\n\nSolución Canónica:\n1. Usar \"useEventListener\" de \"@vueuse/core\", que registra y remueve el listener automáticamente en sincronía con el ciclo de vida del componente.\n2. Si usas la API nativa, define la función listener como variable con nombre y llama a \"removeEventListener\" dentro de \"onUnmounted()\".\n3. Si el evento solo debe ocurrir una única vez, pasa \"{ once: true }\" como tercer argumento.\n\nEjemplo Antes vs Después:\n// ❌ Incorrecto: listener huérfano sin limpieza\nwindow.addEventListener(\"resize\", handleResize);\n\n// ✅ Correcto (Opción A): useEventListener de VueUse\nimport { useEventListener } from \"@vueuse/core\";\nuseEventListener(window, \"resize\", handleResize);\n\n// ✅ Correcto (Opción B): limpieza explícita en onUnmounted\nonMounted(() => window.addEventListener(\"resize\", handleResize));\nonUnmounted(() => window.removeEventListener(\"resize\", handleResize));",
				"interval-leak": "Causa Raíz:\nSe inició un temporizador repetitivo (\"setInterval\") en un componente o composable sin almacenar su identificador ni ejecutar \"clearInterval\".\nEl temporizador continuará ejecutándose indefinidamente cada N milisegundos en segundo plano incluso después de que la vista haya sido destruida, degradando la batería y la CPU.\n\nDiagnóstico:\nBusca la llamada a \"setInterval\" en el archivo señalado.\n\nSolución Canónica:\n1. Usar \"useIntervalFn\" de \"@vueuse/core\", que gestiona el arranque, pausa y destrucción automática con el hook de desmontaje de Vue.\n2. Si usas la API nativa, almacena el handle retornado y cancela el temporizador en \"onUnmounted()\".\n\nEjemplo Antes vs Después:\n// ❌ Incorrecto: setInterval sin cancelar\nsetInterval(() => { refreshData(); }, 5000);\n\n// ✅ Correcto: useIntervalFn de VueUse\nimport { useIntervalFn } from \"@vueuse/core\";\nuseIntervalFn(() => { refreshData(); }, 5000);"
			},
			allowedExtensions: /* @__PURE__ */ new Set([".ts", ".vue"])
		});
	}
	checkEventListenerLeak(node, sf, relPath, checkLineEscape, hasRemoveEventListener, hasUnmountHook) {
		const expr = node.expression;
		if (!ts.isPropertyAccessExpression(expr) || expr.name.text !== "addEventListener") return;
		const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
		if (checkLineEscape(line)) return;
		if (!hasOnceOption(node) && !hasRemoveEventListener && !hasUnmountHook) this.addViolation({
			ruleId: "dom-event-leak",
			severity: "error",
			file: relPath,
			line,
			message: "addEventListener sin removeEventListener ni ciclo de vida onUnmounted / onScopeDispose (potencial fuga de memoria).",
			context: node.getText(sf)
		});
	}
	checkIntervalLeak(node, sf, relPath, checkLineEscape, hasClearInterval) {
		const expr = node.expression;
		if (!ts.isIdentifier(expr) || expr.text !== "setInterval") return;
		const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
		if (checkLineEscape(line) || hasClearInterval) return;
		this.addViolation({
			ruleId: "interval-leak",
			severity: "error",
			file: relPath,
			line,
			message: "setInterval ejecutado sin clearInterval en el componente o composable.",
			context: node.getText(sf)
		});
	}
	scanFile(relPath, content, sourceFile) {
		if (!content.includes("addEventListener") && !content.includes("setInterval")) return;
		const sf = sourceFile ?? this.context.getAst(relPath, content);
		if (!sf.text.trim()) return;
		const fullLines = content.split("\n");
		const hasUnmountHook = content.includes("onUnmounted") || content.includes("onBeforeUnmount") || content.includes("onScopeDispose");
		const hasRemoveEventListener = content.includes("removeEventListener");
		const hasClearInterval = content.includes("clearInterval");
		const checkLineEscape = (lineNum) => {
			const lineText = fullLines[lineNum - 1] || "";
			return lineText.includes("leak-ok") || lineText.includes("reactive-leak-ok");
		};
		this.runSubAuditorSync("dom-event-leak", () => {
			const visitEvents = (node) => {
				if (ts.isCallExpression(node)) this.checkEventListenerLeak(node, sf, relPath, checkLineEscape, hasRemoveEventListener, hasUnmountHook);
				ts.forEachChild(node, visitEvents);
			};
			visitEvents(sf);
		});
		this.runSubAuditorSync("interval-leak", () => {
			const visitIntervals = (node) => {
				if (ts.isCallExpression(node)) this.checkIntervalLeak(node, sf, relPath, checkLineEscape, hasClearInterval);
				ts.forEachChild(node, visitIntervals);
			};
			visitIntervals(sf);
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ReactiveLeaksAuditor());
//#endregion
export { REACTIVE_LEAK_RULES, ReactiveLeaksAuditor };
