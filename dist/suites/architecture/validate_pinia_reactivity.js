import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isPathContained } from "../../core/safePath.js";
import "../../core/auditConfig.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import ts from "typescript";
// src/suites/architecture/validate_pinia_reactivity.ts
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
var PiniaReactivityAuditor = class extends FileScanAuditor {
	storesRoots;
	authorizedStateMutationFiles;
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, (cfg) => cfg.paths.srcRoots ?? []);
		const config = getAuditConfig(effectiveRoot);
		super({
			ruleFixers: {},
			usesThirdPartyTool: false,
			requiredPermissions: [],
			roots: targetRoots,
			projectRoot: effectiveRoot,
			ruleCapabilities: createRuleCapabilities(PINIA_REACTIVITY_RULES, {
				speed: "light",
				phase: "normal",
				md: false,
				ast: true,
				changedOnly: false,
				critical: false
			}),
			id: "validate_pinia_reactivity",
			name: "Pinia Reactivity & State Integrity Auditor",
			description: "Protects reactivity and integrity of Pinia stores",
			family: "architecture",
			ruleIds: PINIA_REACTIVITY_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(PINIA_REACTIVITY_RULES, "behavior"),
			packageName: "Pinia",
			configKey: "pinia.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "🍍",
			ruleDescriptions: {
				"no-store-destructuring-without-storetorefs": "Destructuring without storeToRefs",
				"no-direct-state-mutation-outside-actions": "Direct mutation of $state"
			},
			ruleRemediations: {
				"no-store-destructuring-without-storetorefs": "1. Root Cause:\nState properties or getters were destructured directly from a Pinia store instance: \"const { foo, bar } = useMyStore()\".\nIn Pinia, the store is a reactive proxy built on reactive(). When destructuring primitive state directly without wrapping, JavaScript copies the values, silently severing reactivity from the store.\n\n2. Diagnosis:\nInspect the destructuring assignment that calls \"use...Store()\". If extracting state or getters, they must pass through storeToRefs.\n\n3. Canonical Solution:\n1. Use the official utility \"storeToRefs(store)\" to destructure state and getters as \"Ref<T>\".\n2. Actions (store methods) must NOT pass through storeToRefs; call actions directly on the store instance (\"store.action()\") or assign the store to a variable first.\n\n4. Example / Auto-fix command:\n// ❌ Incorrect: severed reactivity on username and score\nconst { username, score, login } = useAuthStore();\n\n// ✅ Correct: storeToRefs for state/getters, direct store for actions\nimport { storeToRefs } from \"pinia\";\nconst authStore = useAuthStore();\nconst { username, score } = storeToRefs(authStore);\nconst { login } = authStore;",
				"no-direct-state-mutation-outside-actions": "1. Root Cause:\nDirect assignment to the internal property \"store.$state = ...\" was detected outside authorized persistence coordinators.\nOverwriting $state bypasses Pinia plugins, desynchronizes $subscribe audit listeners, and violates state encapsulation.\n\n2. Diagnosis:\nSearch for \".$state =\" in the component or composable source code.\n\n3. Canonical Solution:\n1. Encapsulate the mutation inside a named action in the store definition.\n2. If applying multiple property updates simultaneously, use \"store.$patch({ ... })\" or \"store.$patch((state) => { ... })\".\n3. If this is an authorized game persistence/hydration coordinator, register the file in \"config.persistence.authorizedSaveFiles\" or \"config.pinia.authorizedMutationFiles\" in \"audit.config.ts\".\n\n4. Example / Auto-fix command:\n// ❌ Incorrect: direct reassignment of $state in component\nplayerStore.$state = newPlayerData;\n\n// ✅ Correct: call action or use $patch\nplayerStore.loadProfile(newPlayerData);\n// or: playerStore.$patch(newPlayerData);"
			},
			allowedExtensions: /* @__PURE__ */ new Set([".vue", ".ts"]),
			requiresAst: true
		});
		this.storesRoots = config.paths.storesRoots ?? [];
		this.authorizedStateMutationFiles = getAuthorizedStateMutationFiles(effectiveRoot);
	}
	reportPiniaViolation(node, sf, content, relPath, ruleId, message) {
		const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
		const lineNum = line + 1;
		const lineContent = this.getLineAt(content, lineNum);
		this.addViolation({
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
			if (isStoreDestructuring(node.initializer, sf, storeVariables)) this.reportPiniaViolation(node, sf, content, relPath, "no-store-destructuring-without-storetorefs", `Direct or indirect destructuring from use...Store() detected. Destructuring directly strips reactivity from state and getters; wrap with 'storeToRefs(store)' or call actions directly on the store instance.`);
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
		const isStoreFile = this.storesRoots.some((root) => isPathContained(path.resolve(this.projectRoot, root), path.resolve(this.projectRoot, normalizedPath)));
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
export { AUTHORIZED_STATE_MUTATION_FILES, DEFAULT_AUTHORIZED_STATE_MUTATION_FILES, PINIA_REACTIVITY_RULES, PiniaReactivityAuditor, getAuthorizedStateMutationFiles };
