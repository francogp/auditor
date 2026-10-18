import { AUDITOR_DIR, AUDIT_CONFIG_FILE, LEGACY_ROOT_CONFIG_FILES } from "../../core/auditConfigTypes.js";
import { AUDITOR_VERSION } from "../../core/version.js";
import { DEFAULT_AUDIT_CONFIG } from "../../core/auditConfigDefaults.js";
import { loadAuditConfig } from "../../core/auditConfigLoader.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import "../../core/auditConfig.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import "../../core/safePath.js";
import { appendGitIgnoreEntries, findMissingGitIgnoreRequirements } from "../../core/gitignoreMatcher.js";
import { collectAllGitIgnoreRequirements, discoverAuditors } from "../../cli/auditScanner.js";
import { migrateLegacyAuditConfig } from "../../cli/migrateAuditConfig.js";
import { getPackageJson } from "../../core/packageJson.js";
import { appendMissingSectionsFallback, appendMissingSectionsToConfigFile, appendMissingSectionsToJsonFile, appendMissingSectionsToTsFile, dtoValueToTsExpression, findConfigObjectLiteral, formatSectionObjectLiteral, parseAuditConfigFileAst, printTsExpression } from "../../core/auditConfigAst.js";
import { applyAcknowledgedDegradationsFix, detectUnacknowledgedDegradations } from "../../core/auditConfigDegradations.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "typescript";
//#region src/suites/architecture/validate_audit_config.ts
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
function appendTaskDefaultConfig(sections, task) {
	if (!task.configKey || task.configKey === "paths" || task.configKey === "core") return;
	const rootKey = task.configKey.split(".")[0];
	if (!rootKey) return;
	if (!task.defaultConfig || typeof task.defaultConfig !== "object" || Object.keys(task.defaultConfig).length === 0) return;
	sections[rootKey] = {
		...sections[rootKey],
		...task.defaultConfig
	};
}
function collectConfigSectionsFromTasks(tasks) {
	const sections = {};
	for (const task of tasks) appendTaskDefaultConfig(sections, task);
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
	const parsed = parseAuditConfigFileAst(configFilePath);
	if (!parsed || !parsed.configObj) return false;
	const { code, source, configObj } = parsed;
	try {
		const versionProp = configObj.properties.find((p) => {
			if (!ts.isPropertyAssignment(p)) return false;
			return p.name.getText(source).replace(/^['"]|['"]$/g, "") === "auditorVersion";
		});
		const versionLiteral = printTsExpression(dtoValueToTsExpression(version));
		if (versionProp) {
			const currentVal = versionProp.initializer.getText(source);
			if (currentVal === `'${version}'` || currentVal === `"${version}"`) return false;
			const updated = code.slice(0, versionProp.initializer.getStart(source)) + versionLiteral + code.slice(versionProp.initializer.getEnd());
			fs.writeFileSync(configFilePath, updated, "utf8");
			return true;
		}
		const nameProp = configObj.properties.find((p) => {
			if (!ts.isPropertyAssignment(p)) return false;
			return p.name.getText(source).replace(/^['"]|['"]$/g, "") === "name";
		});
		if (nameProp) {
			const insertPos = nameProp.getEnd();
			const commaOffset = code.indexOf(",", insertPos);
			const hasComma = commaOffset !== -1 && commaOffset < insertPos + 5;
			const actualPos = hasComma ? commaOffset + 1 : insertPos;
			const snippet = `${hasComma ? "" : ","}\n  auditorVersion: ${versionLiteral},`;
			const updated = code.slice(0, actualPos) + snippet + code.slice(actualPos);
			fs.writeFileSync(configFilePath, updated, "utf8");
			return true;
		}
		const openBracePos = code.indexOf("{", configObj.getStart(source));
		if (openBracePos === -1) return false;
		const updated = code.slice(0, openBracePos + 1) + `\n  auditorVersion: ${versionLiteral},` + code.slice(openBracePos + 1);
		fs.writeFileSync(configFilePath, updated, "utf8");
		return true;
	} catch {
		return false;
	}
}
function createDefaultAuditConfigContent(packageName = "Project", tasks = []) {
	const defaultDto = {
		name: packageName,
		auditorVersion: AUDITOR_VERSION,
		paths: {
			srcRoots: ["src"],
			testRoots: ["tests"],
			scriptsRoots: ["scripts"]
		},
		documentation: { language: "en" },
		...collectConfigSectionsFromTasks(tasks)
	};
	const importDecl = ts.factory.createImportDeclaration(void 0, ts.factory.createImportClause(false, void 0, ts.factory.createNamedImports([ts.factory.createImportSpecifier(false, void 0, ts.factory.createIdentifier("defineAuditConfig"))])), ts.factory.createStringLiteral("@francogp/auditor", true));
	const exportDecl = ts.factory.createExportAssignment(void 0, false, ts.factory.createCallExpression(ts.factory.createIdentifier("defineAuditConfig"), void 0, [dtoValueToTsExpression(defaultDto)]));
	const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
	const dummySource = ts.createSourceFile("audit.config.ts", "", ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
	return `${printer.printNode(ts.EmitHint.Unspecified, importDecl, dummySource)}\n\n${printer.printNode(ts.EmitHint.Unspecified, exportDecl, dummySource).split("\n").map((line) => line.replace(/^( {4})+/, (m) => " ".repeat(m.length / 2))).join("\n")}\n`;
}
function isSectionConfigured(rootKey, rawConfig) {
	if (typeof rawConfig !== "object" || rawConfig === null) return false;
	if (rootKey === "stylelint") {
		const stylesConfig = Reflect.get(rawConfig, "styles");
		const isStylesObject = typeof stylesConfig === "object" && stylesConfig !== null;
		return Reflect.get(rawConfig, "stylelint") !== void 0 || isStylesObject && Reflect.get(stylesConfig, "stylelint") !== void 0 || stylesConfig !== void 0;
	}
	return Reflect.get(rawConfig, rootKey) !== void 0;
}
function collectMissingSections(tasks, rawConfig) {
	const missingByRootKey = /* @__PURE__ */ new Map();
	for (const task of tasks) {
		if (!task.configKey || task.configKey === "paths" || task.configKey === "core" || task.configKey === "none") continue;
		const rootKey = task.configKey.split(".")[0];
		if (!rootKey || isSectionConfigured(rootKey, rawConfig)) continue;
		let entry = missingByRootKey.get(rootKey);
		if (!entry) {
			entry = {
				tasks: [],
				defaultConfig: {}
			};
			missingByRootKey.set(rootKey, entry);
		}
		entry.tasks.push(task);
		if (task.defaultConfig && typeof task.defaultConfig === "object") Object.assign(entry.defaultConfig, task.defaultConfig);
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
	"audit-config-unacknowledged-degradation"
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
	description: "Configuración del auditor en .auditor/",
	ruleId: "audit-config-missing-file",
	generateDefaultContent: async (ctx) => {
		if (LEGACY_ROOT_CONFIG_FILES.find((f) => fs.existsSync(path.resolve(ctx.projectRoot, f)))) {
			migrateLegacyAuditConfig(ctx.projectRoot);
			const migratedPath = path.resolve(ctx.projectRoot, AUDIT_CONFIG_FILE);
			if (fs.existsSync(migratedPath)) return fs.readFileSync(migratedPath, "utf-8");
		}
		let pkgName = ctx.packageName || "Project";
		try {
			const pkg = getPackageJson(ctx.projectRoot);
			if (pkg?.name) pkgName = pkg.name;
		} catch {}
		let tasks = [];
		try {
			const { discoverAuditors } = await import("../../cli/auditScanner.js");
			tasks = await discoverAuditors({ projectRoot: ctx.projectRoot });
		} catch {}
		return createDefaultAuditConfigContent(pkgName, tasks);
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
				"audit-config-critical-violation",
				"audit-config-unacknowledged-degradation"
			],
			configFiles: [AUDIT_CONFIG_REQUIREMENT],
			fix: options.fix,
			id: "validate_audit_config",
			name: "Audit Configuration Integrity Validator",
			description: "Valida configuración del auditor en .auditor/",
			family: "architecture",
			ruleIds: AUDIT_CONFIG_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(AUDIT_CONFIG_RULES, "setup"),
			packageName: "Config",
			icon: "⚙️",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			ruleDescriptions: {
				"audit-config-missing-path": "Ruta configurada no existe",
				"audit-config-missing-file": "Archivo configurado no existe",
				"audit-config-invalid-extension": "Extensión configurada no existe",
				"audit-config-missing-gitignore-entry": "Falta entrada en .gitignore",
				"audit-config-missing-section": "Falta sección en audit.config",
				"audit-config-unknown-field": "Campo no reconocido en config",
				"audit-config-critical-violation": "Violación a configuración crítica",
				"audit-config-unacknowledged-degradation": "Degradación de cobertura no documentada"
			},
			ruleRemediations: {
				"audit-config-missing-path": "Una de las rutas declaradas en config.paths no existe en el sistema de archivos del proyecto.\nPosibles causas y soluciones:\n1. Si el directorio fue renombrado o movido, actualiza la ruta correspondiente en .auditor/audit.config.ts.\n2. Si el directorio es opcional o aún no se ha creado, crea la carpeta vacía o remuévela de la configuración si no corresponde a este proyecto.",
				"audit-config-missing-file": "No se encontró el archivo principal de configuración .auditor/audit.config.ts (o audit.config.json).\nPosibles causas y soluciones:\n1. Ejecuta \"auditor fix\" o \"npm run auditor:fix\" para generar automáticamente la configuración canónica con sus valores por defecto.\n2. Si existe en la raíz como audit.config.ts, muévelo dentro de .auditor/.",
				"audit-config-invalid-extension": "Se declaró una extensión o plugin en config.extensions que no pudo resolverse en disco o no exporta un auditor válido.\nPosibles causas y soluciones:\n1. Verifica la ruta relativa declarada en extensions: [...] dentro de .auditor/audit.config.ts.\n2. Asegúrate de que el archivo termine en .ts o .js y exporte una subclase de BaseAuditor.",
				"audit-config-missing-gitignore-entry": "Faltan entradas obligatorias gobernadas por el auditor en el archivo .gitignore del repositorio (ej. scratch/, coverage/).\nPosibles causas y soluciones:\n1. Ejecuta \"auditor fix\" para inyectar automáticamente las entradas requeridas en .gitignore.\n2. O agrega manualmente las entradas indicadas en el reporte a tu archivo .gitignore.",
				"audit-config-missing-section": "Uno de los sub-auditores activos requiere una sección de configuración específica en .auditor/audit.config.ts que no está presente.\nPosibles causas y soluciones:\n1. Ejecuta \"auditor fix\" para que el motor de AST de TypeScript inyecte automáticamente la sección faltante con sus valores canónicos.\n2. O agrega manualmente la sección declarada por el sub-auditor en tu archivo .auditor/audit.config.ts.",
				"audit-config-unknown-field": "Se encontró una clave o propiedad en .auditor/audit.config.ts que no es reconocida por el esquema del auditor (clave obsoleta o mal tipada).\nPosibles causas y soluciones:\n1. Revisa el nombre del campo en .auditor/audit.config.ts por posibles errores tipográficos.\n2. Si era una clave de una versión anterior del auditor, elimínala o migra al nombre canónico actual.",
				"audit-config-critical-violation": "La configuración viola una política crítica e inmutable del framework (ej. omisión de reglas estrictas obligatorias o valores prohibidos).\nPosibles causas y soluciones:\n1. Revisa la justificación técnica mostrada en el mensaje del error.\n2. Ejecuta \"auditor fix\" para restablecer automáticamente la línea base mínima obligatoria requerida por el sub-auditor.",
				"audit-config-unacknowledged-degradation": "Se declararon rutas en config.paths (scriptsRoots, dataRoots, cliRoots, demoRoots o exemptFiles) que contienen archivos en disco pero cuyas reglas silenciadas no están documentadas en coverage.acknowledgedDegradations.\nPosibles causas y soluciones:\n1. Ejecuta \"auditor fix\" o \"npm run auditor:fix\" para registrar automáticamente en coverage.acknowledgedDegradations las políticas correspondientes con su motivo y glob canónico.\n2. O declara manualmente en coverage.acknowledgedDegradations en .auditor/audit.config.ts el objeto { policy, glob, reason } justificando la exención."
			},
			coverage: { include: [path.posix.join(AUDITOR_DIR, "**"), ".gitignore"] },
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
		let tasks = [];
		try {
			tasks = await discoverAuditors({ projectRoot: this.projectRoot });
		} catch {}
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
		try {
			let text = fs.readFileSync(configFilePath, "utf-8");
			if (!text.includes("eslint:")) return false;
			text = text.replace(/(^|\s)eslint\s*:/g, "$1oxlint:");
			if (!text.includes("vitePlusConfig:")) text = text.replace(/oxlint\s*:\s*\{[^}]*\},?/, (m) => `${m}\n  vitePlusConfig: { enabled: true },`);
			fs.writeFileSync(configFilePath, text, "utf-8");
			return true;
		} catch {
			return false;
		}
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
		const missingByRootKey = collectMissingSections(tasks, config._rawConfig ?? {});
		if (missingByRootKey.size === 0) return;
		if (this.isFixActive()) {
			this.applyMissingSectionsFix(missingByRootKey);
			return;
		}
		this.reportMissingSectionViolations(missingByRootKey);
	}
	applyMissingSectionsFix(missingByRootKey) {
		const configFilePath = path.resolve(this.projectRoot, AUDIT_CONFIG_FILE);
		if (!fs.existsSync(configFilePath)) return;
		const sectionsToInsert = {};
		for (const [rootKey, entry] of missingByRootKey.entries()) sectionsToInsert[rootKey] = Object.keys(entry.defaultConfig).length > 0 ? entry.defaultConfig : { enabled: true };
		appendMissingSectionsToConfigFile(configFilePath, sectionsToInsert);
	}
	reportMissingSectionViolations(missingByRootKey) {
		for (const [rootKey, entry] of missingByRootKey.entries()) {
			const suiteNames = entry.tasks.map((t) => t.id).join(", ");
			this.addViolation({
				ruleId: "audit-config-missing-section",
				severity: "error",
				file: AUDIT_CONFIG_FILE,
				line: 1,
				message: `Configuration error in ${AUDIT_CONFIG_FILE}: Missing required section "${rootKey}" declared by ${suiteNames}. Run "auditor fix" to add automatically.`,
				context: rootKey
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
		if (this.isFixActive()) {
			applyAcknowledgedDegradationsFix(this.projectRoot, missing);
			return;
		}
		for (const item of missing) this.addViolation({
			ruleId: "audit-config-unacknowledged-degradation",
			severity: "error",
			file: AUDIT_CONFIG_FILE,
			line: 1,
			message: `Configuration error in ${AUDIT_CONFIG_FILE}: Path '${item.rootOrFile}' contains ${item.filesCount} code file(s) with silenced rules under policy '${item.policy}', but no matching entry exists in coverage.acknowledgedDegradations. Run "auditor fix" to document automatically.`,
			context: `coverage.acknowledgedDegradations.${item.policy}`,
			fixable: true
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
		try {
			const fileContent = fs.readFileSync(targetFile, "utf-8");
			if (!(fileContent.includes("ruleRemediationPhases") || fileContent.includes("remediationPhase"))) {
				this.addViolation({
					ruleId: "audit-config-invalid-extension",
					severity: "error",
					file: AUDIT_CONFIG_FILE,
					line: 1,
					message: `Configuration error in ${AUDIT_CONFIG_FILE}: Extension '${relTarget}' is missing mandatory 'remediationPhase' or 'ruleRemediationPhases' in its constructor options. Every extension must declare its strategic remediation classification.`,
					context: normalized
				});
				return false;
			}
		} catch {}
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
			this.addViolation({
				ruleId: "audit-config-invalid-extension",
				severity: "error",
				file: AUDIT_CONFIG_FILE,
				line: 1,
				message: `Configuration error in ${AUDIT_CONFIG_FILE}: Extension '${relTarget}' failed compilation or runtime instantiation: ${errorMsg}. Fix the extension before continuing.`,
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
//#endregion
export { AUDIT_CONFIG_REQUIREMENT, AUDIT_CONFIG_RULES, PATH_ROOT_KEYS, ValidateAuditConfigAuditor, appendMissingSectionsFallback, appendMissingSectionsToConfigFile, appendMissingSectionsToJsonFile, appendMissingSectionsToTsFile, collectConfigSectionsFromTasks, collectMissingSections, createDefaultAuditConfigContent, dtoValueToTsExpression, enforceCriticalConfigurations, findConfigObjectLiteral, formatSectionObjectLiteral, parseAuditConfigFileAst, printTsExpression, syncAuditorVersionInConfigFile };
