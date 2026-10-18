import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import "../../core/auditConfig.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import "../../core/safePath.js";
import { enableCompileCache } from "node:module";
import ts from "typescript";
//#region src/suites/architecture/validate_pinia_reactivity.ts
/**
* scripts/auditors/architecture/validate_pinia_reactivity.ts
*
* PINIA REACTIVITY & STATE INTEGRITY AUDITOR (Node.js 26+ Native)
*
* Enforces Pinia reactivity standards across components and composables (vue-pinia-best-practices):
*   1. No Store Destructuring Without storeToRefs (`no-store-destructuring-without-storetorefs`):
*      Calling `const { a, b } = useXxxStore()` directly strips reactivity from reactive
*      state properties and getters. Reactive state destructuring MUST be wrapped with `storeToRefs(store)`.
*   2. No Direct State Mutation Outside Actions (`no-direct-state-mutation-outside-actions`):
*      Direct assignment to `store.$state = ...` bypasses Pinia mutation tracking and action
*      lifecycle. Permitted exclusively in authorized save persistence coordinators and tests.
*
* Escape Hatches:
*   `// pinia-ok: <reason>`, `// store-ok: <reason>`
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_pinia_reactivity.ts
*/
enableCompileCache();
const PINIA_REACTIVITY_RULES = ["no-store-destructuring-without-storetorefs", "no-direct-state-mutation-outside-actions"];
const DEFAULT_AUTHORIZED_STATE_MUTATION_FILES = [];
function getAuthorizedStateMutationFiles(projectRoot) {
	const config = getAuditConfig(projectRoot);
	const fromPersistence = config.persistence?.authorizedSaveFiles ?? [];
	const fromPinia = config.pinia?.authorizedMutationFiles ?? [];
	return /* @__PURE__ */ new Set([
		...DEFAULT_AUTHORIZED_STATE_MUTATION_FILES,
		...fromPersistence,
		...fromPinia
	]);
}
const AUTHORIZED_STATE_MUTATION_FILES = new Set(DEFAULT_AUTHORIZED_STATE_MUTATION_FILES);
function isStoreCallExpression(expr, sf) {
	if (!ts.isCallExpression(expr)) return false;
	const calleeText = expr.expression.getText(sf);
	return /^use[A-Z]\w*Store$/.test(calleeText);
}
function isStoreDestructuring(initializer, sf, storeVariables) {
	if (isStoreCallExpression(initializer, sf)) return true;
	return ts.isIdentifier(initializer) && storeVariables.has(initializer.text);
}
function resolvePiniaAuditRoots(roots, projectRoot) {
	return roots ?? getAuditConfig(projectRoot).paths.srcRoots ?? [];
}
var PiniaReactivityAuditor = class extends FileScanAuditor {
	storesRoots;
	authorizedStateMutationFiles;
	constructor(roots, projectRoot) {
		const piniaRoots = resolvePiniaAuditRoots(roots, projectRoot);
		const config = getAuditConfig(projectRoot);
		super({
			usesThirdPartyTool: false,
			roots: piniaRoots,
			projectRoot,
			ruleCapabilities: createRuleCapabilities(PINIA_REACTIVITY_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: true,
				changedOnly: false,
				critical: false
			}),
			id: "validate_pinia_reactivity",
			name: "Pinia Reactivity & State Integrity Auditor",
			description: "Protege reactividad e integridad de stores de Pinia",
			family: "architecture",
			ruleIds: PINIA_REACTIVITY_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(PINIA_REACTIVITY_RULES, "behavior"),
			packageName: "Pinia",
			configKey: "pinia.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "🍍",
			ruleDescriptions: {
				"no-store-destructuring-without-storetorefs": "Desestructuración sin storeToRefs",
				"no-direct-state-mutation-outside-actions": "Mutación directa de $state"
			},
			ruleRemediations: {
				"no-store-destructuring-without-storetorefs": "Causa Raíz:\nSe desestructuraron propiedades de estado o getters directamente desde una instancia de store de Pinia: \"const { foo, bar } = useMyStore()\".\nEn Pinia, la store es un proxy reactivo creado sobre reactive(). Al desestructurar primitivos directamente sin envoltorio, JavaScript extrae el valor por copia, rompiendo la reactividad con la store de forma silenciosa.\n\nDiagnóstico:\nRevisa la declaración desestructurada que llama a \"use...Store()\". Si estás extrayendo estado o getters, deben pasar por storeToRefs.\n\nSolución Canónica:\n1. Usar la utilidad oficial \"storeToRefs(store)\" para desestructurar estado y getters como \"Ref<T>\".\n2. Las acciones (métodos de la store) NO deben pasarse por storeToRefs, sino desestructurarse directamente de la store o invocarse como \"store.action()\".\n3. Si solo estás desestructurando acciones, documenta con \"// pinia-ok: actions only\".\n\nEjemplo Antes vs Después:\n// ❌ Incorrecto: reactividad rota en username y score\nconst { username, score, login } = useAuthStore();\n\n// ✅ Correcto: storeToRefs para estado/getters, store directo para acciones\nimport { storeToRefs } from \"pinia\";\nconst authStore = useAuthStore();\nconst { username, score } = storeToRefs(authStore);\nconst { login } = authStore;",
				"no-direct-state-mutation-outside-actions": "Causa Raíz:\nSe detectó una asignación directa a la propiedad interna \"store.$state = ...\" fuera de los coordinadores autorizados de persistencia.\nSobrescribir $state elude los plugins de Pinia, desincroniza las suscripciones de auditoría ($subscribe) y viola el principio de encapsulamiento del estado.\n\nDiagnóstico:\nBusca \". $state =\" en el código del componente o composable.\n\nSolución Canónica:\n1. Encapsular la modificación dentro de una acción nombrada (\"action\") en la definición de la store.\n2. Si necesitas aplicar un parche múltiple de varias propiedades a la vez, utiliza \"store.$patch({ ... })\" o \"store.$patch((state) => { ... })\".\n3. Si se trata de un módulo oficial de persistencia/hidratación de partidas o datos locales, registra el archivo en \"config.persistence.authorizedSaveFiles\" o \"config.pinia.authorizedMutationFiles\" en \"audit.config.ts\".\n\nEjemplo Antes vs Después:\n// ❌ Incorrecto: reasignación directa de $state en componente\nplayerStore.$state = newPlayerData;\n\n// ✅ Correcto: llamada a acción o uso de $patch\nplayerStore.loadProfile(newPlayerData);\n// o bien: playerStore.$patch(newPlayerData);"
			},
			allowedExtensions: /* @__PURE__ */ new Set([".vue", ".ts"]),
			requiresAst: true
		});
		this.storesRoots = config.paths.storesRoots ?? [];
		this.authorizedStateMutationFiles = getAuthorizedStateMutationFiles(projectRoot);
	}
	reportPiniaViolation(node, sf, content, relPath, ruleId, message) {
		const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
		const lineNum = line + 1;
		const lineContent = this.getLineAt(content, lineNum);
		if (!this.hasEscapeHatch(lineContent, ["pinia-ok", "store-ok"])) this.addViolation({
			ruleId,
			severity: "error",
			file: relPath,
			line: lineNum,
			message,
			context: lineContent.trim()
		});
	}
	checkStoreVariableDeclaration(node, sf, content, relPath, storeVariables, isStoreFile) {
		if (!node.initializer) return;
		if (ts.isIdentifier(node.name) && isStoreCallExpression(node.initializer, sf)) storeVariables.add(node.name.text);
		if (!isStoreFile && ts.isObjectBindingPattern(node.name)) {
			if (isStoreDestructuring(node.initializer, sf, storeVariables)) this.reportPiniaViolation(node, sf, content, relPath, "no-store-destructuring-without-storetorefs", `Direct or indirect destructuring from use...Store() detected. Destructuring directly strips reactivity from state and getters; wrap with 'storeToRefs(store)' or use '// pinia-ok: <reason>' if destructuring actions only.`);
		}
	}
	checkStateMutation(node, sf, content, relPath, storeVariables, isAuthorized) {
		if (isAuthorized || !ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
		if (ts.isPropertyAccessExpression(node.left) && node.left.name.text === "$state") {
			const objText = node.left.expression.getText(sf);
			if (objText.toLowerCase().includes("store") || storeVariables.has(objText)) this.reportPiniaViolation(node, sf, content, relPath, "no-direct-state-mutation-outside-actions", `Direct assignment to store.$state detected. Mutating $state directly outside persistence coordinators bypasses action lifecycles. Use actions or store.$patch instead.`);
		}
	}
	scanFile(relPath, content, sourceFile) {
		const normalizedPath = normalizePosixPath(relPath);
		if (!content.includes("Store") && !content.includes("$state")) return;
		const isStoreFile = this.storesRoots.some((root) => {
			const normalizedRoot = normalizePosixPath(root).replace(/\/+$/, "") + "/";
			return normalizedPath.startsWith(normalizedRoot);
		});
		const isAuthorized = this.authorizedStateMutationFiles.has(normalizedPath) || AUTHORIZED_STATE_MUTATION_FILES.has(normalizedPath);
		const sf = sourceFile ?? this.context.getAst(relPath, content);
		const storeVariables = /* @__PURE__ */ new Set();
		this.runSubAuditorSync("no-store-destructuring-without-storetorefs", () => {
			const visitDestructuring = (node) => {
				if (ts.isVariableDeclaration(node)) this.checkStoreVariableDeclaration(node, sf, content, relPath, storeVariables, isStoreFile);
				ts.forEachChild(node, visitDestructuring);
			};
			visitDestructuring(sf);
		});
		this.runSubAuditorSync("no-direct-state-mutation-outside-actions", () => {
			const visitMutations = (node) => {
				if (!ts.isVariableDeclaration(node)) this.checkStateMutation(node, sf, content, relPath, storeVariables, isAuthorized);
				ts.forEachChild(node, visitMutations);
			};
			visitMutations(sf);
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new PiniaReactivityAuditor());
//#endregion
export { AUTHORIZED_STATE_MUTATION_FILES, DEFAULT_AUTHORIZED_STATE_MUTATION_FILES, PINIA_REACTIVITY_RULES, PiniaReactivityAuditor, getAuthorizedStateMutationFiles };
