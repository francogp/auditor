import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isTestFileForCodeAudit } from "../../core/auditTestPredicates.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import "../../core/safePath.js";
import { FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { scanBalancedBraces } from "../../core/scannerUtils.js";
import { isCommentLine } from "../../analyzers/auditRuleTypes.js";
import { enableCompileCache } from "node:module";
//#region src/suites/persistence/validate_persistence_client.ts
/**
* packages/auditor/src/suites/persistence/validate_persistence_client.ts
*
* CLIENT-SIDE WEB STORAGE & PERSISTENCE HYGIENE AUDITOR (Node.js 26+ Native)
*
* Enforces client-side storage architecture, quota error handling, and key typing:
* 1. Storage Uncoordinated Save (`persistence-client-uncoordinated-save`):
*    Direct writes to localStorage / sessionStorage with reserved save prefixes outside authorizedSaveFiles.
* 2. Storage Untyped Key (`persistence-client-untyped-key`):
*    Arbitrary raw string literal keys passed directly to storage without typed constants or domain keys.
* 3. Storage Unhandled Quota Error (`persistence-client-unhandled-quota-error`):
*    Storage mutations (.setItem) invoked outside try/catch blocks susceptible to QuotaExceededError crashes.
*/
enableCompileCache();
const PERSISTENCE_CLIENT_RULES = [
	"persistence-client-uncoordinated-save",
	"persistence-client-untyped-key",
	"persistence-client-unhandled-quota-error"
];
const EXTENSIONS = /* @__PURE__ */ new Set([".ts", ".vue"]);
const P_STORAGE_METHOD = /\b(?:localStorage|sessionStorage)\.(setItem|getItem|removeItem)\s*\(\s*([^,)\s][^,)]*)/g;
const P_STORAGE_INDEXED = /\b(?:localStorage|sessionStorage)\s*\[([^\]]+)\]/g;
var ValidatePersistenceClientAuditor = class extends FileScanAuditor {
	authorizedSaveFiles;
	saveKeyPrefixes;
	constructor(options) {
		const rootPath = typeof options === "string" ? options : options?.projectRoot;
		const cfg = getAuditConfig(rootPath);
		const codeRoots = typeof options === "object" && options?.roots ? options.roots : cfg.paths.codeRoots ?? [];
		const customAuthorized = typeof options === "object" && options?.authorizedSaveFiles ? options.authorizedSaveFiles : cfg.persistence?.authorizedSaveFiles ?? [];
		const customPrefixes = typeof options === "object" && options?.saveKeyPrefixes ? options.saveKeyPrefixes : cfg.persistence?.saveKeyPrefixes ?? [];
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(PERSISTENCE_CLIENT_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_persistence_client",
			name: "Client-Side Web Storage & Persistence Hygiene",
			description: "localStorage governance, quotas, and key typing",
			family: "persistence",
			ruleIds: PERSISTENCE_CLIENT_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(PERSISTENCE_CLIENT_RULES, "behavior"),
			packageName: "Storage",
			icon: "🗄️",
			configKey: "persistence.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			ruleDescriptions: {
				"persistence-client-uncoordinated-save": "Uncoordinated write to storage",
				"persistence-client-untyped-key": "Untyped storage key",
				"persistence-client-unhandled-quota-error": "setItem without quota error handling"
			},
			ruleRemediations: {
				"persistence-client-uncoordinated-save": "📖 REMEDIATION GUIDE: persistence-client-uncoordinated-save\n1. Root Cause: `localStorage.setItem()` or `sessionStorage.setItem()` was called directly outside the authorized persistence service (`authorizedSaveFiles`). Dispersed direct writes cause synchronization races and state corruption.\n2. Diagnosis: Locate the `setItem` call in the reported component or module.\n3. Canonical Solution: Route all storage mutations through the centralized persistence service or corresponding Pinia store.\n4. Example:\n   ❌ Insecure:     `localStorage.setItem(\"user\", JSON.stringify(user));` in a component.\n   ✅ Coordinated:  `await persistenceService.saveUser(user);`",
				"persistence-client-untyped-key": "📖 REMEDIATION GUIDE: persistence-client-untyped-key\n1. Root Cause: A naked string literal (e.g.: `\"app_settings\"`) was used as web storage key instead of a typed domain constant or union.\n2. Diagnosis: Check the key passed to `getItem` or `setItem` on the report line.\n3. Canonical Solution: Define storage keys in a canonical constant object (`STORAGE_KEYS = { ... } as const`) and use the typed key.\n4. Example:\n   ❌ Naked key: `localStorage.getItem(\"theme_mode\");`\n   ✅ Typed:     `localStorage.getItem(STORAGE_KEYS.THEME_MODE);`",
				"persistence-client-unhandled-quota-error": "📖 REMEDIATION GUIDE: persistence-client-unhandled-quota-error\n1. Root Cause: The `setItem()` call is not wrapped in a `try-catch` block capturing `QuotaExceededError`. If the browser exceeds storage quota (5MB-10MB or private browsing mode), the uncaught exception halts application execution.\n2. Diagnosis: Inspect the reported `localStorage.setItem()` call.\n3. Canonical Solution: Wrap the call in a `try-catch` block and gracefully handle degradation or quota notification.\n4. Example:\n   ❌ Uncaught: `localStorage.setItem(key, value);`\n   ✅ Robust:   `try { localStorage.setItem(key, value); } catch (e) { handleStorageQuotaError(e); }`"
			},
			coverage: {
				include: deriveCoverageFromRoots(codeRoots, EXTENSIONS).include,
				exclude: [
					"coverage/**",
					"dist/**",
					"scratch/**",
					".agents/**"
				]
			},
			roots: codeRoots,
			allowedExtensions: EXTENSIONS,
			extraIgnorePatterns: [
				"coverage/**",
				"dist/**",
				"scratch/**",
				".agents/**",
				"migrations/**",
				"database/**"
			],
			projectRoot: rootPath
		});
		this.authorizedSaveFiles = new Set(customAuthorized);
		this.saveKeyPrefixes = customPrefixes;
	}
	scanFile(file, content) {
		if (getAuditConfig(this.projectRoot).persistence?.engine === "none") return;
		if (isTestFileForCodeAudit(file, this.projectRoot)) return;
		this.runSubAuditorSync("persistence-client-uncoordinated-save", () => {
			this.scanUncoordinatedSave(file, content);
		});
		this.runSubAuditorSync("persistence-client-untyped-key", () => {
			this.scanUntypedKey(file, content);
		});
		this.runSubAuditorSync("persistence-client-unhandled-quota-error", () => {
			this.scanQuotaError(file, content);
		});
	}
	forEachStorageAccess(content, callback) {
		const lines = content.split("\n");
		P_STORAGE_METHOD.lastIndex = 0;
		let match;
		while ((match = P_STORAGE_METHOD.exec(content)) !== null) {
			const lineNum = content.slice(0, match.index).split("\n").length;
			if (this.isIgnoredLine(lines, lineNum)) continue;
			callback({
				rawKeyArg: match[2]?.trim() ?? "",
				matchIndex: match.index,
				isWrite: match[1] === "setItem",
				line: lines[lineNum - 1] ?? "",
				mutationLabel: "'.setItem()'"
			});
		}
		P_STORAGE_INDEXED.lastIndex = 0;
		while ((match = P_STORAGE_INDEXED.exec(content)) !== null) {
			const matchIndex = match.index;
			const lineNum = content.slice(0, matchIndex).split("\n").length;
			if (this.isIgnoredLine(lines, lineNum)) continue;
			const rawKeyArg = match[1]?.trim() ?? "";
			const afterMatch = content.slice(matchIndex + match[0].length).trimStart();
			callback({
				rawKeyArg,
				matchIndex,
				isWrite: afterMatch.startsWith("=") && !afterMatch.startsWith("==") && !afterMatch.startsWith("=>"),
				line: lines[lineNum - 1] ?? "",
				mutationLabel: "by indexed assignment ('[key] = ...')"
			});
		}
	}
	scanUncoordinatedSave(file, content) {
		if (this.isAuthorizedSaveFile(file) || this.saveKeyPrefixes.length === 0) return;
		this.forEachStorageAccess(content, ({ rawKeyArg, matchIndex, isWrite, line }) => {
			if (!isWrite) return;
			if (this.saveKeyPrefixes.some((prefix) => rawKeyArg.includes(`'${prefix}`) || rawKeyArg.includes(`"${prefix}`) || rawKeyArg.includes(`\`${prefix}`))) this.addViolationAtMatch({
				ruleId: "persistence-client-uncoordinated-save",
				filePath: file,
				content,
				matchIndex,
				message: `Direct write to web storage bypasses authorized persistence architecture. Delegate to authorized save stores or persistence service.`,
				context: line.trim()
			});
		});
	}
	scanUntypedKey(file, content) {
		this.forEachStorageAccess(content, ({ rawKeyArg, matchIndex, line }) => {
			if (/^['"`][\w$-]+['"`]$/.test(rawKeyArg)) this.addViolationAtMatch({
				ruleId: "persistence-client-untyped-key",
				filePath: file,
				content,
				matchIndex,
				message: `Storage key ${rawKeyArg} is a raw string literal — use typed constant or enum from canonical storage definitions.`,
				context: line.trim()
			});
		});
	}
	scanQuotaError(file, content) {
		this.forEachStorageAccess(content, ({ matchIndex, isWrite, line, mutationLabel }) => {
			if (isWrite && !this.isInsideTryCatch(content, matchIndex)) this.addViolationAtMatch({
				ruleId: "persistence-client-unhandled-quota-error",
				filePath: file,
				content,
				matchIndex,
				message: `Web storage mutation ${mutationLabel} must be wrapped in try/catch to guard against QuotaExceededError on full or private storage.`,
				context: line.trim()
			});
		});
	}
	isIgnoredLine(lines, lineNum) {
		const line = lines[lineNum - 1] ?? "";
		return isCommentLine(line.trim());
	}
	isAuthorizedSaveFile(file) {
		const normalized = normalizePosixPath(file);
		return Array.from(this.authorizedSaveFiles).some((auth) => normalized.endsWith(auth) || normalized.includes(auth));
	}
	isInsideTryCatch(content, position) {
		const preceding = content.slice(0, position);
		const tryRegex = /\btry\s*\{/g;
		let match;
		while ((match = tryRegex.exec(preceding)) !== null) {
			const openBraceIdx = match.index + match[0].indexOf("{");
			if (scanBalancedBraces(content, openBraceIdx + 1, position, 1).depth > 0) return true;
		}
		return false;
	}
};
await FileScanAuditor.runCliIfMain(import.meta.url, new ValidatePersistenceClientAuditor());
//#endregion
export { PERSISTENCE_CLIENT_RULES, ValidatePersistenceClientAuditor };
