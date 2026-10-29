import { AUDITOR_DIR, AUDIT_CONFIG_FILE, LEGACY_ROOT_CONFIG_FILES } from "../../core/auditConfigTypes.js";
import { AUDITOR_VERSION } from "../../core/version.js";
import { DEFAULT_AUDIT_CONFIG } from "../../core/auditConfigDefaults.js";
import { tryOrNull } from "../../core/safeUtils.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import { loadAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/safePath.js";
import "../../core/auditConfig.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { dtoValueToTsExpression, formatTsNodeTwoSpaceIndent } from "../../core/astContext.js";
import { appendGitIgnoreEntries, findMissingGitIgnoreRequirements } from "../../core/gitignoreMatcher.js";
import { collectAllGitIgnoreRequirements, discoverAuditors } from "../../cli/auditScanner.js";
import { migrateLegacyAuditConfig } from "../../cli/migrateAuditConfig.js";
import { appendMissingSectionsToConfigFile, mutateAuditConfigFileAst, syncAuditorVersionInTsFile } from "../../core/auditConfigAst.js";
import { getPackageJson } from "../../core/packageJson.js";
import { detectUnacknowledgedDegradations } from "../../core/auditConfigDegradations.js";
import { auditConfigRatchet } from "../../core/configRatchet.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { SyntaxKind } from "ts-morph";
// src/suites/architecture/validate_audit_config.ts
/**
* packages/auditor/src/suites/architecture/validate_audit_config.ts
*
* AUDIT CONFIGURATION INTEGRITY VALIDATOR (Node.js 26+)
*
* Validates that 100% of files, paths, directories, modules, and extensions
* declared in audit.config.ts physically exist on disk.
* Emits severity: 'error' if any referenced path is missing.
*/
enableCompileCache();
function resolveConfigPath(obj, pathStr) {
	if (typeof obj !== "object" || obj === null) return void 0;
	const parts = pathStr.split(".");
	let curr = obj;
	for (const p of parts) {
		if (typeof curr !== "object" || curr === null) return void 0;
		curr = Reflect.get(curr, p);
	}
	return curr;
}
function setDeepProperty(obj, pathStr, value) {
	const parts = pathStr.split(".");
	let curr = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		const p = parts[i];
		if (typeof curr[p] !== "object" || curr[p] === null) curr[p] = {};
		curr = curr[p];
	}
	curr[parts[parts.length - 1]] = value;
}
function deepMergeDefaultsObject(target, defaults) {
	for (const [key, val] of Object.entries(defaults)) {
		if (val === void 0) continue;
		if (typeof val === "object" && val !== null && !Array.isArray(val) && typeof target[key] === "object" && target[key] !== null && !Array.isArray(target[key])) deepMergeDefaultsObject(target[key], val);
		else if (target[key] === void 0) target[key] = typeof val === "object" && val !== null ? structuredClone(val) : val;
	}
}
function buildTaskExpectedConfigTree(tasks) {
	const byRoot = /* @__PURE__ */ new Map();
	for (const task of tasks) {
		const rootConfigKeys = /* @__PURE__ */ new Set([
			"paths",
			"core",
			"none"
		]);
		if (!task.configKey || rootConfigKeys.has(task.configKey)) continue;
		if (!task.defaultConfig || typeof task.defaultConfig !== "object" || Object.keys(task.defaultConfig).length === 0) continue;
		const parts = task.configKey.split(".");
		const rootKey = parts[0];
		let entry = byRoot.get(rootKey);
		if (!entry) {
			entry = {
				tasks: [],
				expectedTree: {}
			};
			byRoot.set(rootKey, entry);
		}
		entry.tasks.push(task);
		const subParts = parts.slice(1);
		if (subParts.length > 0 && (subParts[subParts.length - 1] === "enabled" || subParts[subParts.length - 1] === "enforceInAudit" || subParts[subParts.length - 1] === "zLayersEnabled")) subParts.pop();
		let targetContainer = entry.expectedTree;
		for (const sub of subParts) {
			if (typeof targetContainer[sub] !== "object" || targetContainer[sub] === null || Array.isArray(targetContainer[sub])) targetContainer[sub] = {};
			targetContainer = targetContainer[sub];
		}
		deepMergeDefaultsObject(targetContainer, task.defaultConfig);
	}
	return byRoot;
}
function collectConfigSectionsFromTasks(tasks) {
	const sections = {};
	const byRoot = buildTaskExpectedConfigTree(tasks);
	for (const [rootKey, { expectedTree }] of byRoot.entries()) sections[rootKey] = expectedTree;
	return sections;
}
function syncAuditorVersionInConfigFile(configFilePath, version) {
	if (!fs.existsSync(configFilePath)) return false;
	if (configFilePath.endsWith(".json")) try {
		const content = fs.readFileSync(configFilePath, "utf8");
		const json = JSON.parse(content);
		if (json.auditorVersion === version) return false;
		json.auditorVersion = version;
		fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + "\n", "utf8");
		return true;
	} catch {
		return false;
	}
	return syncAuditorVersionInTsFile(configFilePath, version);
}
function createDefaultAuditConfigContent(packageName = "Project", tasks = []) {
	const defaultDto = {
		name: packageName,
		auditorVersion: AUDITOR_VERSION,
		paths: {
			enabled: true,
			srcRoots: DEFAULT_AUDIT_CONFIG.paths.srcRoots,
			testRoots: DEFAULT_AUDIT_CONFIG.paths.testRoots,
			scriptsRoots: DEFAULT_AUDIT_CONFIG.paths.scriptsRoots
		},
		documentation: {
			enabled: true,
			language: "en",
			chatLanguage: "es"
		},
		...collectConfigSectionsFromTasks(tasks)
	};
	const importDecl = ts.factory.createImportDeclaration(void 0, ts.factory.createImportClause(false, void 0, ts.factory.createNamedImports([ts.factory.createImportSpecifier(false, void 0, ts.factory.createIdentifier("defineAuditConfig"))])), ts.factory.createStringLiteral("@francogp/auditor", true));
	const exportDecl = ts.factory.createExportAssignment(void 0, false, ts.factory.createCallExpression(ts.factory.createIdentifier("defineAuditConfig"), void 0, [dtoValueToTsExpression(defaultDto)]));
	return `${formatTsNodeTwoSpaceIndent(importDecl)}\n\n${formatTsNodeTwoSpaceIndent(exportDecl)}\n`;
}
function computeMissingConfigDiff(expected, current, isRootLevel = true) {
	if (current === void 0) {
		if (typeof expected === "object" && expected !== null) return structuredClone(expected);
		return expected;
	}
	if (typeof current === "object" && current !== null && (current.enabled === false || current.engine === "none")) return;
	if (typeof expected === "object" && expected !== null && !Array.isArray(expected) && typeof current === "object" && current !== null && !Array.isArray(current)) {
		const missingObj = {};
		for (const [key, expectedVal] of Object.entries(expected)) {
			if (expectedVal === void 0) continue;
			const currentVal = Reflect.get(current, key);
			if (isRootLevel && !(typeof expectedVal === "object" && expectedVal !== null && !Array.isArray(expectedVal))) continue;
			const diff = computeMissingConfigDiff(expectedVal, currentVal, false);
			if (diff !== void 0) missingObj[key] = diff;
		}
		return Object.keys(missingObj).length > 0 ? missingObj : void 0;
	}
}
function extractMissingConfigPaths(prefix, missingTree, currentVal) {
	const paths = [];
	for (const [key, val] of Object.entries(missingTree)) {
		const fullPath = prefix ? `${prefix}.${key}` : key;
		const currentChild = typeof currentVal === "object" && currentVal !== null ? Reflect.get(currentVal, key) : void 0;
		if (currentChild === void 0) paths.push(fullPath);
		else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
			const subPaths = extractMissingConfigPaths(fullPath, val, currentChild);
			if (subPaths.length > 0) paths.push(...subPaths);
			else paths.push(fullPath);
		} else paths.push(fullPath);
	}
	return paths;
}
function collectMissingSections(tasks, rawConfig) {
	const missingByRootKey = /* @__PURE__ */ new Map();
	const byRoot = buildTaskExpectedConfigTree(tasks);
	for (const [rootKey, { tasks: rootTasks, expectedTree }] of byRoot.entries()) {
		let currentVal;
		if (typeof rawConfig === "object" && rawConfig !== null) {
			if (rootKey === "stylelint") {
				const stylesConfig = Reflect.get(rawConfig, "styles");
				const stylelintConfig = Reflect.get(rawConfig, "stylelint");
				currentVal = stylelintConfig !== void 0 ? stylelintConfig : stylesConfig && typeof stylesConfig === "object" ? stylesConfig.stylelint ?? stylesConfig : void 0;
			} else currentVal = Reflect.get(rawConfig, rootKey);
		}
		const missingDiff = computeMissingConfigDiff(expectedTree, currentVal, true);
		if (missingDiff && Object.keys(missingDiff).length > 0) {
			const missingPaths = extractMissingConfigPaths(rootKey, missingDiff, currentVal);
			missingByRootKey.set(rootKey, {
				tasks: rootTasks,
				defaultConfig: expectedTree,
				missingTree: missingDiff,
				missingPaths
			});
		}
	}
	return missingByRootKey;
}
const AUDIT_CONFIG_RULES = [
	"audit-config-missing-path",
	"audit-config-missing-file",
	"audit-config-invalid-extension",
	"audit-config-missing-gitignore-entry",
	"audit-config-missing-section",
	"audit-config-unknown-field",
	"audit-config-critical-violation",
	"audit-config-unacknowledged-degradation",
	"audit-config-ratchet-relaxation"
];
const PATH_ROOT_KEYS = [
	"srcRoots",
	"testRoots",
	"e2eRoots",
	"integrationRoots",
	"scriptsRoots",
	"codeRoots",
	"dataRoots",
	"componentsRoots",
	"viewsRoots",
	"storesRoots",
	"composablesRoots",
	"typesRoots",
	"stylesRoots",
	"logicRoots",
	"cliRoots"
];
const AUDIT_CONFIG_REQUIREMENT = {
	id: "audit-config",
	file: AUDIT_CONFIG_FILE,
	candidateFiles: [AUDIT_CONFIG_FILE, ".auditor/audit.config.json"],
	description: "Auditor configuration in .auditor/",
	ruleId: "audit-config-missing-file",
	generateDefaultContent: async (ctx) => {
		if (LEGACY_ROOT_CONFIG_FILES.find((f) => fs.existsSync(path.resolve(ctx.projectRoot, f)))) {
			migrateLegacyAuditConfig(ctx.projectRoot);
			const migratedPath = path.resolve(ctx.projectRoot, AUDIT_CONFIG_FILE);
			if (fs.existsSync(migratedPath)) return fs.readFileSync(migratedPath, "utf-8");
		}
		return createDefaultAuditConfigContent(tryOrNull(() => getPackageJson(ctx.projectRoot))?.name ?? ctx.packageName ?? "Project", await import("../../cli/auditScanner.js").then((m) => m.discoverAuditors({ projectRoot: ctx.projectRoot })).catch(() => []));
	},
	customMissingMessage: (ctx, file) => {
		const legacy = LEGACY_ROOT_CONFIG_FILES.find((f) => fs.existsSync(path.resolve(ctx.projectRoot, f)));
		if (legacy) return `Configuration error: root-level ${legacy} is no longer supported. Run "auditor fix" to move it to ${file}.`;
		return `Configuration error: ${file} does not exist. Run "auditor fix" to initialize default configuration.`;
	},
	customMissingFile: (ctx, defaultFile) => {
		return LEGACY_ROOT_CONFIG_FILES.find((f) => fs.existsSync(path.resolve(ctx.projectRoot, f))) ?? defaultFile;
	}
};
var ValidateAuditConfigAuditor = class extends BaseAuditor {
	constructor(targetPathOrOptions) {
		const options = typeof targetPathOrOptions === "string" ? { projectRoot: targetPathOrOptions } : targetPathOrOptions ?? {};
		const projectRoot = options.projectRoot || process.cwd();
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(AUDIT_CONFIG_RULES, {
				speed: "light",
				phase: "setup",
				fix: "priority",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}, [
				"audit-config-missing-section",
				"audit-config-missing-file",
				"audit-config-missing-gitignore-entry",
				"audit-config-critical-violation",
				"audit-config-unacknowledged-degradation"
			]),
			fixableRuleIds: [
				"audit-config-missing-section",
				"audit-config-missing-file",
				"audit-config-missing-gitignore-entry",
				"audit-config-critical-violation"
			],
			configFiles: [AUDIT_CONFIG_REQUIREMENT],
			fix: options.fix,
			id: "validate_audit_config",
			name: "Audit Configuration Integrity Validator",
			description: "Validates auditor configuration in .auditor/",
			family: "architecture",
			ruleIds: AUDIT_CONFIG_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(AUDIT_CONFIG_RULES, "setup"),
			packageName: "Config",
			icon: "⚙️",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			ruleDescriptions: {
				"audit-config-missing-path": "Configured path does not exist",
				"audit-config-missing-file": "Configured file does not exist",
				"audit-config-invalid-extension": "Configured extension does not exist",
				"audit-config-missing-gitignore-entry": "Missing entry in .gitignore",
				"audit-config-missing-section": "Missing section in audit.config",
				"audit-config-unknown-field": "Unrecognized field in config",
				"audit-config-critical-violation": "Critical configuration violation",
				"audit-config-unacknowledged-degradation": "Undocumented coverage degradation",
				"audit-config-ratchet-relaxation": "Unauthorized rule relaxation (ratchet)"
			},
			ruleRemediations: {
				"audit-config-missing-path": "📖 REMEDIATION GUIDE: audit-config-missing-path\n1. Root Cause: A directory path declared in `config.paths` does not exist on the project filesystem.\n2. Diagnosis: Compare the paths defined in `.auditor/audit.config.ts` against actual folders in your repository.\n3. Canonical Solution: If the directory was renamed or moved, update `.auditor/audit.config.ts`. If optional or not yet created, create the empty directory or remove it from configuration.\n4. Example / Auto-fix command:\n   Update `.auditor/audit.config.ts` with correct paths.",
				"audit-config-missing-file": "📖 REMEDIATION GUIDE: audit-config-missing-file\n1. Root Cause: The primary auditor configuration file `.auditor/audit.config.ts` (or `audit.config.json`) was not found.\n2. Diagnosis: Check whether `.auditor/audit.config.ts` exists in the project root.\n3. Canonical Solution: Run `npm run auditor:fix` or `auditor fix` to automatically generate the canonical configuration file with default settings.\n4. Example / Auto-fix command:\n   `npm run auditor:fix`",
				"audit-config-invalid-extension": "📖 REMEDIATION GUIDE: audit-config-invalid-extension\n1. Root Cause: An extension or plugin declared in `config.extensions` could not be resolved on disk, fails compilation, or violates BaseAuditor constructor contracts.\n2. Diagnosis: Inspect the target extension file reported in the violation and its runtime compilation/instantiation error message.\n3. Canonical Solution: Ensure the extension file exists, compiles cleanly, and subclasses `BaseAuditor`. If missing `requiredPermissions`, declare `requiredPermissions: []` in constructor options. If using `hasLineSuppression`, replace it with `hasPrecedingComment`.\n4. Example / Auto-fix command:\n   Verify `extensions: [\"./scripts/auditors/my_audit.ts\"]` in `.auditor/audit.config.ts` and ensure `super({ ..., requiredPermissions: [] })`.",
				"audit-config-missing-gitignore-entry": "📖 REMEDIATION GUIDE: audit-config-missing-gitignore-entry\n1. Root Cause: Mandatory entries governed by the auditor (e.g., `scratch/`, `coverage/`) are missing from `.gitignore`.\n2. Diagnosis: Inspect `.gitignore` against required auditor artifact paths.\n3. Canonical Solution: Run `auditor fix` to automatically inject missing gitignore entries, or add them manually.\n4. Example / Auto-fix command:\n   `npm run auditor:fix`",
				"audit-config-missing-section": "📖 REMEDIATION GUIDE: audit-config-missing-section\n1. Root Cause: An active sub-auditor requires a specific configuration section in `.auditor/audit.config.ts` that is currently missing.\n2. Diagnosis: Identify the missing configuration section mentioned in the report.\n3. Canonical Solution: Run `npm run auditor:fix` to automatically inject the missing section with canonical default values via TypeScript AST.\n4. Example / Auto-fix command:\n   `npm run auditor:fix`",
				"audit-config-unknown-field": "📖 REMEDIATION GUIDE: audit-config-unknown-field\n1. Root Cause: An unrecognized property or key was found in `.auditor/audit.config.ts` (obsolete or misspelled key).\n2. Diagnosis: Review the field name reported in `.auditor/audit.config.ts` for typographical errors.\n3. Canonical Solution: Remove obsolete keys or rename them to the canonical modern schema.\n4. Example / Auto-fix command:\n   Remove unknown property from `.auditor/audit.config.ts`.",
				"audit-config-critical-violation": "📖 REMEDIATION GUIDE: audit-config-critical-violation\n1. Root Cause: Configuration violates an immutable framework policy (e.g. omitting mandatory strict values or setting prohibited overrides).\n2. Diagnosis: Read the technical explanation in the violation message.\n3. Canonical Solution: Run `npm run auditor:fix` to restore the immutable required baseline, or update the configuration accordingly.\n4. Example / Auto-fix command:\n   `npm run auditor:fix`",
				"audit-config-unacknowledged-degradation": "📖 REMEDIATION GUIDE: audit-config-unacknowledged-degradation\n1. Root Cause: Paths declared in `config.paths` contain files whose silenced rules are not documented in `coverage.acknowledgedDegradations`.\n2. Diagnosis: Check unacknowledged degradation paths reported by the auditor.\n3. Canonical Solution: Declare acknowledged degradation policies with canonical globs and rationales in `coverage.acknowledgedDegradations`, or remove the silenced rules from source code.\n4. Example / Auto-fix command:\n   Review and declare in `coverage.acknowledgedDegradations` manually if strictly justified.",
				"audit-config-ratchet-relaxation": "📖 REMEDIATION GUIDE: audit-config-ratchet-relaxation\n1. Root Cause: Configuration rules or exemptions were relaxed relative to online origin/main without explicit user authorization.\n2. Diagnosis: Check the generated RELAX-<8hex> code and the list of relaxed rules, added exemptions, lowered floors, or raised ceilings.\n3. Canonical Solution: Hardening rules is permitted with zero friction. To accept a relaxation genuinely requested by the human programmer, confirm the RELAX-<8hex> code directly in Antigravity chat.\n4. Example / Auto-fix command:\n   Revert the relaxed configuration or ask the human user to confirm RELAX-<8hex> in chat."
			},
			coverage: { include: [path.posix.join(AUDITOR_DIR, "*.{ts,json}"), ".gitignore"] },
			projectRoot
		});
	}
	async runAudit() {
		let ensured = null;
		await this.runSubAuditor("audit-config-missing-file", async () => {
			const requirement = this.configFiles[0] ?? AUDIT_CONFIG_REQUIREMENT;
			ensured = await this.ensureConfigFile(requirement);
		});
		if (!ensured) return;
		this.recordScanned(AUDIT_CONFIG_FILE);
		if (fs.existsSync(path.resolve(this.projectRoot, ".gitignore"))) this.recordScanned(".gitignore");
		const config = await loadAuditConfig(this.projectRoot);
		const baselineFile = config.ratchet?.baselineFile ?? path.posix.join(".auditor", "audit-baseline.json");
		if (fs.existsSync(path.resolve(this.projectRoot, baselineFile))) this.recordScanned(baselineFile);
		const tasks = await discoverAuditors({ projectRoot: this.projectRoot }).catch(() => []);
		await this.runSubAuditor("audit-config-missing-section", async () => {
			await this.verifyRequiredSections(config, tasks);
		});
		await this.runSubAuditor("audit-config-critical-violation", async () => {
			await this.verifyCriticalConfigurations(config, tasks);
		});
		this.runSubAuditorSync("audit-config-unacknowledged-degradation", () => {
			this.verifyUnacknowledgedDegradations(config);
		});
		this.runSubAuditorSync("audit-config-unknown-field", () => {
			this.verifyUnknownFields(config, tasks);
		});
		this.runSubAuditorSync("audit-config-missing-path", () => {
			this.verifyPathRoots(config);
			this.verifyPersistencePaths(config);
			this.verifyDomainAndStylePaths(config);
		});
		await this.runSubAuditor("audit-config-invalid-extension", async () => {
			await this.verifyExtensionPaths(config);
		});
		await this.runSubAuditor("audit-config-missing-gitignore-entry", async () => {
			await this.verifyGitIgnore(config);
		});
		this.runSubAuditorSync("audit-config-ratchet-relaxation", () => {
			this.verifyConfigRatchet(config);
		});
	}
	verifyConfigRatchet(config) {
		const ratchetRes = auditConfigRatchet(this.projectRoot, config._rawConfig ?? config);
		if (!ratchetRes.passed) for (const rel of ratchetRes.relaxations) this.addViolation({
			ruleId: "audit-config-ratchet-relaxation",
			severity: "error",
			file: rel.file,
			line: 1,
			message: `[Config Ratchet] Unauthorized rule relaxation detected in ${rel.path}: ${rel.description}. Authorization code: '${ratchetRes.relaxationCode}'. Confirm in Antigravity chat to proceed.`,
			context: rel.path
		});
	}
	verifyUnknownFields(config, tasks) {
		const rawConfig = config._rawConfig ?? {};
		if (typeof rawConfig !== "object" || rawConfig === null) return;
		this.verifyUnknownTopLevelSections(rawConfig, tasks);
		this.verifyUnknownPathsFields(rawConfig);
		this.verifyUnknownConstantsFields(rawConfig);
		this.verifyUnknownBundleFields(rawConfig);
	}
	verifyUnknownBundleFields(rawConfig) {
		const rawBundle = rawConfig.bundle;
		if (typeof rawBundle !== "object" || rawBundle === null) return;
		const validBundleKeys = /* @__PURE__ */ new Set([
			"enabled",
			"statsFile",
			"distDir",
			"exemptChunkPrefixes",
			"maxClientChunkWarnBytes",
			"maxClientChunkErrorBytes",
			"budgets",
			"duplicateModuleThresholdBytes",
			"topModulesLimit",
			"forbiddenUiImports"
		]);
		for (const key of Object.keys(rawBundle)) if (!validBundleKeys.has(key)) this.addViolation({
			ruleId: "audit-config-unknown-field",
			severity: "error",
			file: AUDIT_CONFIG_FILE,
			line: 1,
			message: `Configuration error in ${AUDIT_CONFIG_FILE}: Unknown or legacy field "bundle.${key}". This field is not supported. Please remove it.`,
			context: `bundle.${key}`
		});
		const budgets = rawBundle.budgets;
		if (Array.isArray(budgets)) {
			const validBudgetKeys = /* @__PURE__ */ new Set([
				"name",
				"prefix",
				"matcher",
				"limitBytes"
			]);
			budgets.forEach((budgetEntry, idx) => {
				if (typeof budgetEntry !== "object" || budgetEntry === null) return;
				for (const bKey of Object.keys(budgetEntry)) if (!validBudgetKeys.has(bKey)) this.addViolation({
					ruleId: "audit-config-unknown-field",
					severity: "error",
					file: AUDIT_CONFIG_FILE,
					line: 1,
					message: `Configuration error in ${AUDIT_CONFIG_FILE}: Unknown field "bundle.budgets[${idx}].${bKey}". Canonical fields for ChunkBudgetConfig are 'name', 'prefix', 'matcher', and 'limitBytes'.`,
					context: `bundle.budgets.${bKey}`
				});
			});
		}
	}
	verifyUnknownTopLevelSections(rawConfig, tasks) {
		const validTopLevelKeys = new Set(Object.keys(DEFAULT_AUDIT_CONFIG).filter((k) => !k.startsWith("_")));
		for (const task of tasks) if (task.configKey && task.configKey !== "paths" && task.configKey !== "core" && task.configKey !== "none") {
			const rootKey = task.configKey.split(".")[0];
			if (rootKey) validTopLevelKeys.add(rootKey);
		}
		for (const key of Object.keys(rawConfig)) {
			if (key.startsWith("_")) continue;
			if (!validTopLevelKeys.has(key)) {
				if (key === "eslint" && this.isFixActive()) {
					const configFilePath = path.resolve(this.projectRoot, AUDIT_CONFIG_FILE);
					if (this.migrateLegacyEslintConfigSection(configFilePath)) continue;
				}
				this.addViolation({
					ruleId: "audit-config-unknown-field",
					severity: "error",
					file: AUDIT_CONFIG_FILE,
					line: 1,
					message: `Configuration error in ${AUDIT_CONFIG_FILE}: Unknown or legacy top-level section "${key}". This section is not supported by @francogp/auditor. Please remove it.`,
					context: key,
					fixable: key === "eslint"
				});
			}
		}
	}
	migrateLegacyEslintConfigSection(configFilePath) {
		if (!fs.existsSync(configFilePath)) return false;
		if (configFilePath.endsWith(".json")) try {
			const text = fs.readFileSync(configFilePath, "utf8");
			const json = JSON.parse(text);
			if (!("eslint" in json)) return false;
			json.oxlint = json.eslint;
			delete json.eslint;
			if (!("vitePlusConfig" in json)) json.vitePlusConfig = { enabled: true };
			fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + "\n", "utf8");
			return true;
		} catch {
			return false;
		}
		return mutateAuditConfigFileAst(configFilePath, (targetObj) => {
			const eslintProp = targetObj.getProperty("eslint");
			if (!eslintProp) return false;
			if (eslintProp.isKind(SyntaxKind.PropertyAssignment)) eslintProp.getNameNode().replaceWithText("oxlint");
			if (!targetObj.getProperty("vitePlusConfig")) targetObj.addPropertyAssignment({
				name: "vitePlusConfig",
				initializer: "{ enabled: true }"
			});
			return true;
		});
	}
	verifyUnknownPathsFields(rawConfig) {
		const rawPaths = rawConfig.paths;
		if (typeof rawPaths !== "object" || rawPaths === null) return;
		const validPathKeys = new Set(Object.keys(DEFAULT_AUDIT_CONFIG.paths));
		for (const key of Object.keys(rawPaths)) if (!validPathKeys.has(key)) this.addViolation({
			ruleId: "audit-config-unknown-field",
			severity: "error",
			file: AUDIT_CONFIG_FILE,
			line: 1,
			message: `Configuration error in ${AUDIT_CONFIG_FILE}: Unknown or legacy field "paths.${key}". This field is not supported. Please remove it.`,
			context: `paths.${key}`
		});
	}
	verifyUnknownConstantsFields(rawConfig) {
		const rawConstants = rawConfig.constants;
		if (typeof rawConstants !== "object" || rawConstants === null) return;
		const validConstantsKeys = new Set(Object.keys(DEFAULT_AUDIT_CONFIG.constants ?? {}));
		for (const key of Object.keys(rawConstants)) if (!validConstantsKeys.has(key)) this.addViolation({
			ruleId: "audit-config-unknown-field",
			severity: "error",
			file: AUDIT_CONFIG_FILE,
			line: 1,
			message: `Configuration error in ${AUDIT_CONFIG_FILE}: Unknown or legacy field "constants.${key}". This field is not supported. Please remove it.`,
			context: `constants.${key}`
		});
	}
	async verifyRequiredSections(config, tasks) {
		if (tasks.length === 0) return;
		const rawConfig = config._rawConfig ?? {};
		const missingByRootKey = collectMissingSections(tasks, rawConfig);
		if (missingByRootKey.size === 0) return;
		if (this.isFixActive()) {
			this.applyMissingSectionsFix(missingByRootKey);
			return;
		}
		this.reportMissingSectionViolations(missingByRootKey, rawConfig);
	}
	applyMissingSectionsFix(missingByRootKey) {
		const configFilePath = path.resolve(this.projectRoot, AUDIT_CONFIG_FILE);
		if (!fs.existsSync(configFilePath)) return;
		const sectionsToInsert = {};
		for (const [rootKey, entry] of missingByRootKey.entries()) sectionsToInsert[rootKey] = Object.keys(entry.missingTree).length > 0 ? entry.missingTree : Object.keys(entry.defaultConfig).length > 0 ? entry.defaultConfig : { enabled: true };
		appendMissingSectionsToConfigFile(configFilePath, sectionsToInsert);
	}
	reportMissingSectionViolations(missingByRootKey, rawConfig) {
		for (const [rootKey, entry] of missingByRootKey.entries()) {
			const suiteNames = entry.tasks.map((t) => t.id).join(", ");
			if (typeof rawConfig !== "object" || rawConfig === null || Reflect.get(rawConfig, rootKey) === void 0) this.addViolation({
				ruleId: "audit-config-missing-section",
				severity: "error",
				file: AUDIT_CONFIG_FILE,
				line: 1,
				message: `Configuration error in ${AUDIT_CONFIG_FILE}: Missing required section "${rootKey}" declared by ${suiteNames}. Run "auditor fix" to add automatically.`,
				context: rootKey,
				fixable: true
			});
			else for (const missingPath of entry.missingPaths) this.addViolation({
				ruleId: "audit-config-missing-section",
				severity: "error",
				file: AUDIT_CONFIG_FILE,
				line: 1,
				message: `Configuration error in ${AUDIT_CONFIG_FILE}: Missing required sub-configuration "${missingPath}" declared by ${suiteNames}. Run "auditor fix" to add automatically.`,
				context: missingPath,
				fixable: true
			});
		}
	}
	resolveTaskSectionContext(task, rawConfig) {
		const rootKey = task.configKey && task.configKey !== "paths" && task.configKey !== "core" && task.configKey !== "none" ? task.configKey.split(".")[0] : void 0;
		return {
			rootKey,
			sectionConfig: rootKey ? rawConfig[rootKey] : void 0
		};
	}
	async repairCriticalMinimum(sectionConfig, rawConfig, rootKey, propPath, configuredList, missing, repair) {
		if (repair) {
			await repair(sectionConfig ?? rawConfig, this.projectRoot);
			return;
		}
		if (rootKey && typeof sectionConfig === "object" && sectionConfig !== null) {
			setDeepProperty(sectionConfig, propPath, Array.from(/* @__PURE__ */ new Set([...configuredList, ...missing])));
			const configFilePath = path.resolve(this.projectRoot, AUDIT_CONFIG_FILE);
			if (fs.existsSync(configFilePath)) appendMissingSectionsToConfigFile(configFilePath, { [rootKey]: sectionConfig });
		}
	}
	async verifyTaskMinimumProperty(task, propPath, minList, sectionConfig, rawConfig, rootKey, rationale, repair) {
		const configuredVal = resolveConfigPath(sectionConfig, propPath) ?? resolveConfigPath(rawConfig, propPath);
		if (configuredVal === void 0) return;
		const configuredList = Array.isArray(configuredVal) ? configuredVal : [];
		const missing = minList.filter((item) => !configuredList.includes(item));
		if (missing.length === 0) return;
		if (this.isFixActive()) await this.repairCriticalMinimum(sectionConfig, rawConfig, rootKey, propPath, configuredList, missing, repair);
		else this.addViolation({
			ruleId: "audit-config-critical-violation",
			severity: "error",
			file: AUDIT_CONFIG_FILE,
			line: 1,
			message: `Configuration error in ${AUDIT_CONFIG_FILE}: [${task.id}] missing required minimum values for "${propPath}": [${missing.join(", ")}]. Rationale: ${rationale}`,
			context: `${task.id}:${propPath}`
		});
	}
	async verifyTaskCriticalMinimums(task, requiredMinimums, sectionConfig, rawConfig, rootKey, rationale, repair) {
		for (const [propPath, minList] of Object.entries(requiredMinimums)) await this.verifyTaskMinimumProperty(task, propPath, minList, sectionConfig, rawConfig, rootKey, rationale, repair);
	}
	async verifyTaskForbiddenOverrides(task, forbiddenOverrides, sectionConfig, rawConfig, rationale, repair) {
		for (const [propPath, disallowedList] of Object.entries(forbiddenOverrides)) {
			const actualVal = resolveConfigPath(sectionConfig, propPath) ?? resolveConfigPath(rawConfig, propPath);
			if (actualVal !== void 0 && disallowedList.includes(actualVal)) {
				if (this.isFixActive() && repair) await repair(sectionConfig ?? rawConfig, this.projectRoot);
				else this.addViolation({
					ruleId: "audit-config-critical-violation",
					severity: "error",
					file: AUDIT_CONFIG_FILE,
					line: 1,
					message: `Configuration error in ${AUDIT_CONFIG_FILE}: [${task.id}] field "${propPath}" is set to disallowed value "${typeof actualVal === "string" ? actualVal : typeof actualVal === "number" || typeof actualVal === "boolean" ? String(actualVal) : JSON.stringify(actualVal)}". Rationale: ${rationale}`,
					context: `${task.id}:${propPath}`
				});
			}
		}
	}
	async verifyTaskCustomValidation(task, validate, sectionConfig, rawConfig, rationale, repair) {
		const errorMsg = validate(sectionConfig ?? rawConfig, this.projectRoot);
		if (typeof errorMsg === "string" && errorMsg.trim().length > 0) {
			if (this.isFixActive() && repair) await repair(sectionConfig ?? rawConfig, this.projectRoot);
			else this.addViolation({
				ruleId: "audit-config-critical-violation",
				severity: "error",
				file: AUDIT_CONFIG_FILE,
				line: 1,
				message: `Configuration error in ${AUDIT_CONFIG_FILE}: [${task.id}] ${errorMsg}. Rationale: ${rationale}`,
				context: task.id
			});
		}
	}
	async verifyTaskCriticalConfig(task, rawConfig) {
		if (!task.criticalConfig) return;
		const { rationale, requiredMinimums, forbiddenOverrides, validate, repair } = task.criticalConfig;
		const { rootKey, sectionConfig } = this.resolveTaskSectionContext(task, rawConfig);
		if (requiredMinimums) await this.verifyTaskCriticalMinimums(task, requiredMinimums, sectionConfig, rawConfig, rootKey, rationale, repair);
		if (forbiddenOverrides) await this.verifyTaskForbiddenOverrides(task, forbiddenOverrides, sectionConfig, rawConfig, rationale, repair);
		if (validate) await this.verifyTaskCustomValidation(task, validate, sectionConfig, rawConfig, rationale, repair);
	}
	async verifyCriticalConfigurations(config, tasks) {
		const rawConfig = config._rawConfig ?? {};
		for (const task of tasks) await this.verifyTaskCriticalConfig(task, rawConfig);
	}
	handleMissingGitIgnoreFile(gitignorePath, requirements) {
		if (this.isFixActive()) {
			const contentLines = [
				"# Auditor tool caches (Added by @francogp/auditor)",
				...requirements.map((e) => e.pattern),
				""
			];
			fs.writeFileSync(gitignorePath, contentLines.join("\n"), "utf8");
			return;
		}
		this.addViolation({
			ruleId: "audit-config-missing-file",
			severity: "error",
			file: ".gitignore",
			line: 1,
			message: "Configuration error: .gitignore does not exist in project root.",
			context: ".gitignore"
		});
	}
	appendMissingGitIgnoreEntries(gitignorePath, missing) {
		appendGitIgnoreEntries(gitignorePath, missing.map((e) => e.pattern));
	}
	async verifyGitIgnore(config) {
		const gitignorePath = path.resolve(this.projectRoot, ".gitignore");
		const applicable = (await collectAllGitIgnoreRequirements(this.projectRoot, config)).filter((req) => req.isApplicable ? req.isApplicable(config) : true);
		if (!fs.existsSync(gitignorePath)) {
			this.handleMissingGitIgnoreFile(gitignorePath, applicable);
			return;
		}
		const missing = findMissingGitIgnoreRequirements(this.projectRoot, gitignorePath, applicable);
		if (missing.length === 0) return;
		if (this.isFixActive()) {
			this.appendMissingGitIgnoreEntries(gitignorePath, missing);
			return;
		}
		for (const req of missing) this.addViolation({
			ruleId: "audit-config-missing-gitignore-entry",
			severity: "error",
			file: ".gitignore",
			line: 1,
			message: `Missing required .gitignore entry for ${req.id} (${req.reason}). Expected "${req.pattern}" in .gitignore.`,
			context: req.pattern
		});
	}
	verifyUnacknowledgedDegradations(config) {
		const missing = detectUnacknowledgedDegradations(config, this.projectRoot);
		if (missing.length === 0) return;
		for (const item of missing) this.addViolation({
			ruleId: "audit-config-unacknowledged-degradation",
			severity: "error",
			file: AUDIT_CONFIG_FILE,
			line: 1,
			message: `Configuration error in ${AUDIT_CONFIG_FILE}: Path '${item.rootOrFile}' contains ${item.filesCount} code file(s) with silenced rules under policy '${item.policy}', but no matching entry exists in coverage.acknowledgedDegradations. Resolve the silenced rules in source code or declare the degradation manually.`,
			context: `coverage.acknowledgedDegradations.${item.policy}`
		});
	}
	checkPathExists(relPath, ruleId, description) {
		const normalized = relPath.trim();
		if (!normalized) return true;
		const resolved = path.resolve(this.projectRoot, normalized);
		if (!fs.existsSync(resolved)) {
			this.addViolation({
				ruleId,
				severity: "error",
				file: AUDIT_CONFIG_FILE,
				line: 1,
				message: `Configuration error in ${AUDIT_CONFIG_FILE}: Referenced ${description} "${normalized}" does not exist on disk.`,
				context: normalized
			});
			return false;
		}
		return true;
	}
	verifyPathRoots(config) {
		const rawPaths = config._rawPaths ?? config.paths;
		if (!rawPaths) return;
		for (const key of PATH_ROOT_KEYS) {
			const val = rawPaths[key];
			if (Array.isArray(val)) {
				for (const item of val) if (typeof item === "string") this.checkPathExists(item, "audit-config-missing-path", `directory in paths.${String(key)}`);
			}
		}
	}
	verifyPersistencePaths(config) {
		const rawPersistence = config._rawConfig?.persistence;
		if (config.paths?.migrationsDir && config.persistence?.engine !== "none") {
			if (config._rawPaths?.migrationsDir) this.checkPathExists(config.paths.migrationsDir, "audit-config-missing-path", "migrations directory");
		}
		if (rawPersistence?.supabaseDir) this.checkPathExists(rawPersistence.supabaseDir, "audit-config-missing-path", "supabase directory");
		if (Array.isArray(rawPersistence?.allowedDatabaseDirs)) for (const d of rawPersistence.allowedDatabaseDirs) this.checkPathExists(d, "audit-config-missing-path", "database directory");
		if (Array.isArray(rawPersistence?.allowedDatabaseFiles)) for (const f of rawPersistence.allowedDatabaseFiles) this.checkPathExists(f, "audit-config-missing-file", "database file");
		if (Array.isArray(rawPersistence?.authorizedSaveFiles)) for (const f of rawPersistence.authorizedSaveFiles) this.checkPathExists(f, "audit-config-missing-file", "authorized save file");
	}
	verifyDomainPaths(config) {
		const rawDomain = config._rawConfig?.domain;
		if (rawDomain?.zLayersFile) this.checkPathExists(rawDomain.zLayersFile, "audit-config-missing-file", "domain z-layers file");
		if (rawDomain?.timezoneHelperModule) this.checkPathExists(rawDomain.timezoneHelperModule, "audit-config-missing-file", "timezone helper module");
		if (rawDomain?.loggerModule) this.checkPathExists(rawDomain.loggerModule, "audit-config-missing-file", "logger module");
		if (Array.isArray(rawDomain?.o1CatalogPatterns)) {
			for (const pattern of rawDomain.o1CatalogPatterns) if (pattern.definingFile) this.checkPathExists(pattern.definingFile, "audit-config-missing-file", `O(1) pattern defining file for '${pattern.name}'`);
		}
	}
	verifyStylesPaths(config) {
		const rawStyles = config._rawConfig?.styles;
		if (config.styles?.zLayersEnabled !== false && rawStyles) {
			if (rawStyles.baseScssFile) this.checkPathExists(rawStyles.baseScssFile, "audit-config-missing-file", "styles base SCSS file");
			if (rawStyles.zLayersScssFile) this.checkPathExists(rawStyles.zLayersScssFile, "audit-config-missing-file", "styles z-layers SCSS file");
			if (rawStyles.zLayersTsFile) this.checkPathExists(rawStyles.zLayersTsFile, "audit-config-missing-file", "styles z-layers TS file");
		}
		if (rawStyles?.buttonGovernance?.buttonsScssFile) this.checkPathExists(rawStyles.buttonGovernance.buttonsScssFile, "audit-config-missing-file", "button governance SCSS file");
		if (Array.isArray(rawStyles?.heavyEffectPaths)) for (const p of rawStyles.heavyEffectPaths) this.checkPathExists(p, "audit-config-missing-path", "heavy effect path");
	}
	verifyDomainAndStylePaths(config) {
		this.verifyDomainPaths(config);
		this.verifyStylesPaths(config);
	}
	resolveExtensionFiles(resolved) {
		const stat = fs.statSync(resolved);
		if (stat.isDirectory()) return fs.readdirSync(resolved).filter((f) => (f.endsWith(".ts") || f.endsWith(".js")) && !f.endsWith(".d.ts")).map((f) => path.join(resolved, f));
		if (stat.isFile() && (resolved.endsWith(".ts") || resolved.endsWith(".js"))) return [resolved];
		return [];
	}
	checkExtensionStaticContract(targetFile, relTarget, normalized) {
		const fileContent = tryOrNull(() => fs.readFileSync(targetFile, "utf-8"));
		if (!fileContent) return true;
		if (!(fileContent.includes("ruleRemediationPhases") || fileContent.includes("remediationPhase"))) {
			this.addViolation({
				ruleId: "audit-config-invalid-extension",
				severity: "error",
				file: AUDIT_CONFIG_FILE,
				line: 1,
				message: `Configuration error in ${AUDIT_CONFIG_FILE}: Extension '${relTarget}' is missing mandatory 'remediationPhase' or 'ruleRemediationPhases' in its constructor options. Every extension must declare its strategic remediation classification. To remediate: add "remediationPhase: 'contracts'" (or 'setup' | 'prune' | 'dedup' | 'contracts' | 'behavior' | 'hygiene' | 'polish') inside super({ ... }) in '${relTarget}'.`,
				context: normalized
			});
			return false;
		}
		return true;
	}
	instantiateAuditorClass(AuditorClass) {
		let firstErr;
		try {
			new AuditorClass(this.projectRoot);
			return;
		} catch (err) {
			firstErr = err;
		}
		try {
			new AuditorClass({ projectRoot: this.projectRoot });
		} catch {
			throw firstErr;
		}
	}
	isAuditorConstructor(val) {
		if (typeof val !== "function" || !val.prototype) return false;
		return val.prototype instanceof BaseAuditor || typeof val.prototype.runAudit === "function" || val.name.endsWith("Auditor");
	}
	async verifyExtensionRuntime(targetFile, relTarget, normalized) {
		try {
			const mod = await import(pathToFileURL(targetFile).href);
			for (const val of Object.values(mod)) {
				if (!this.isAuditorConstructor(val)) continue;
				const AuditorClass = val;
				this.instantiateAuditorClass(AuditorClass);
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			let hint = "";
			if (errorMsg.includes("requiredPermissions")) hint = " Hint: declare 'requiredPermissions: []' in constructor options.";
			else if (errorMsg.includes("hasLineSuppression")) hint = " Hint: 'hasLineSuppression' was eradicated by Zero-Ignore Mandate; replace it with 'hasPrecedingComment'.";
			this.addViolation({
				ruleId: "audit-config-invalid-extension",
				severity: "error",
				file: relTarget,
				line: 1,
				message: `Extension '${relTarget}' failed compilation or runtime instantiation: ${errorMsg}.${hint} Fix the extension before continuing.`,
				context: normalized
			});
		}
	}
	async verifySingleExtensionFile(targetFile, normalized) {
		const relTarget = normalizePosixPath(path.relative(this.projectRoot, targetFile));
		if (!this.checkExtensionStaticContract(targetFile, relTarget, normalized)) return;
		await this.verifyExtensionRuntime(targetFile, relTarget, normalized);
	}
	async verifyExtensionPaths(config) {
		const rawExtensions = config._rawConfig?.extensions ?? config.extensions;
		if (!Array.isArray(rawExtensions)) return;
		for (const ext of rawExtensions) {
			if (typeof ext !== "string") continue;
			const normalized = ext.trim();
			if (!normalized) continue;
			if (!this.checkPathExists(normalized, "audit-config-invalid-extension", "extension file or directory")) continue;
			const resolved = path.resolve(this.projectRoot, normalized);
			let targetFiles = [];
			try {
				targetFiles = this.resolveExtensionFiles(resolved);
			} catch (err) {
				this.addViolation({
					ruleId: "audit-config-invalid-extension",
					severity: "error",
					file: AUDIT_CONFIG_FILE,
					line: 1,
					message: `Configuration error in ${AUDIT_CONFIG_FILE}: Failed to inspect extension '${normalized}': ${err instanceof Error ? err.message : String(err)}.`,
					context: normalized
				});
				continue;
			}
			for (const targetFile of targetFiles) await this.verifySingleExtensionFile(targetFile, normalized);
		}
	}
};
async function enforceCriticalConfigurations(projectRoot, tasks) {
	try {
		const auditor = new ValidateAuditConfigAuditor({
			projectRoot,
			fix: true
		});
		const config = await loadAuditConfig(projectRoot);
		await auditor.verifyCriticalConfigurations(config, tasks);
		return true;
	} catch {
		return false;
	}
}
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateAuditConfigAuditor());
export { AUDIT_CONFIG_REQUIREMENT, AUDIT_CONFIG_RULES, PATH_ROOT_KEYS, ValidateAuditConfigAuditor, buildTaskExpectedConfigTree, collectConfigSectionsFromTasks, collectMissingSections, computeMissingConfigDiff, createDefaultAuditConfigContent, deepMergeDefaultsObject, enforceCriticalConfigurations, extractMissingConfigPaths, syncAuditorVersionInConfigFile };
