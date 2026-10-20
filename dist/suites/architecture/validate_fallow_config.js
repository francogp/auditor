import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/auditCoverage.js";
import "../../core/safePath.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
//#region src/suites/architecture/validate_fallow_config.ts
/**
* scripts/auditors/architecture/validate_fallow_config.ts
*
* FALLOW CONFIGURATION & EXPORTS HYGIENE AUDITOR (Node.js 26+)
*
* Enforces the integrity of .fallowrc.json:
*   1. Prohibits banned blanket entry globs (e.g. src/components/**) that suppress dead code.
*   2. Guarantees that 100% of files listed in ignoreExports actually exist on disk.
*   3. Guarantees that 100% of symbols in ignoreExports are legitimately exported in their files.
*   4. Flags duplicate entries and empty export lists.
*/
enableCompileCache();
const FALLOW_CONFIG_RULES = [
	"fallow-config-missing",
	"fallow-config-syntax",
	"fallow-banned-entry-glob",
	"fallow-stale-file",
	"fallow-stale-export",
	"fallow-empty-export-list",
	"fallow-duplicate-entry",
	"fallow-config-workspace-diagnostic"
];
function getBannedEntryGlobs(projectRoot) {
	const config = getAuditConfig(projectRoot);
	const globs = [];
	const compRoots = config.paths.componentsRoots ?? [];
	const viewRoots = config.paths.viewsRoots ?? [];
	for (const c of compRoots) globs.push(`${c}/**/*.vue`, `${c}/**`);
	for (const v of viewRoots) globs.push(`${v}/**/*.vue`, `${v}/**`);
	return globs;
}
const BANNED_ENTRY_GLOBS = getBannedEntryGlobs();
const escapeRegExp = (s) => RegExp.escape(s);
/**
* Checks whether a symbol is exported from file content.
*/
function isSymbolExportedInContent(content, symbol, isVue = false) {
	if (symbol === "default") return /export\s+default\b/.test(content) || isVue;
	const escaped = escapeRegExp(symbol);
	if (!new RegExp(`\\b${escaped}\\b`).test(content)) return false;
	return new RegExp(`export\\s+(?:const|let|var|function|async\\s+function|type|interface|enum|class|abstract\\s+class)\\s+${escaped}\\b|export\\s+(?:const|let|var)\\s+\\{[^}]*\\b${escaped}\\b|export\\s+(?:const|let|var)\\s+\\[[^\\]]*\\b${escaped}\\b|export\\s+(?:type\\s+)?\\{[^}]*\\b${escaped}\\b|export\\s+\\*\\s+as\\s+${escaped}\\b`).test(content);
}
function createDefaultFallowConfigContent() {
	return JSON.stringify({
		$schema: "https://fallow.tools/schema/config.json",
		entry: ["src/index.ts"],
		ignorePatterns: [
			"dist/**",
			"scratch/**",
			"tests/**"
		],
		typeAware: true,
		duplicates: {
			nearMiss: true,
			mode: "strict"
		},
		health: { maxCrap: 0 }
	}, null, 2) + "\n";
}
function loadFallowConfig(configPath, auditor) {
	if (!fs.existsSync(configPath)) return null;
	try {
		const raw = fs.readFileSync(configPath, "utf-8");
		return JSON.parse(raw);
	} catch (err) {
		auditor.addViolation({
			ruleId: "fallow-config-syntax",
			severity: "error",
			file: ".fallowrc.json",
			line: 1,
			message: `Error al parsear .fallowrc.json: ${err.message}`,
			context: ".fallowrc.json"
		});
		return null;
	}
}
function validateFallowEntries(config, bannedGlobs, auditor) {
	if (!Array.isArray(config.entry)) return false;
	let modified = false;
	const keptEntries = [];
	for (let i = 0; i < config.entry.length; i++) {
		const pattern = config.entry[i];
		let isBanned = false;
		for (const banned of bannedGlobs) if (pattern === banned || pattern.startsWith(banned.replace(/\*.*$/, ""))) {
			isBanned = true;
			if (auditor.isFixActive()) modified = true;
			else auditor.addViolation({
				ruleId: "fallow-banned-entry-glob",
				severity: "error",
				file: ".fallowrc.json",
				line: i + 1,
				message: `Patrón entry prohibido '${pattern}' detectado. Oculta componentes o vistas muertas.`,
				context: pattern,
				fixable: true
			});
		}
		if (!isBanned) keptEntries.push(pattern);
	}
	if (modified) config.entry = keptEntries.length > 0 ? keptEntries : ["src/index.ts"];
	return modified;
}
function validateExportSymbols(params) {
	const seenExportsInFile = /* @__PURE__ */ new Set();
	const keptExports = [];
	let exportCount = 0;
	let modified = false;
	for (const exp of params.entry.exports) {
		exportCount++;
		const isDup = seenExportsInFile.has(exp);
		if (isDup) {
			if (params.auditor.isFixActive()) modified = true;
			else params.auditor.addViolation({
				ruleId: "fallow-duplicate-entry",
				severity: "error",
				file: ".fallowrc.json",
				line: params.lineNum,
				message: `Export duplicado '${exp}' en '${params.relFile}'.`,
				context: `${params.relFile} -> ${exp}`,
				fixable: true
			});
		}
		seenExportsInFile.add(exp);
		const isStale = !isSymbolExportedInContent(params.content, exp, params.isVue);
		if (isStale) {
			if (params.auditor.isFixActive()) modified = true;
			else params.auditor.addViolation({
				ruleId: "fallow-stale-export",
				severity: "error",
				file: ".fallowrc.json",
				line: params.lineNum,
				message: `El símbolo '${exp}' no se encuentra exportado en el archivo real '${params.relFile}'.`,
				context: `${params.relFile} -> ${exp}`,
				fixable: true
			});
		}
		if (!isDup && !isStale) keptExports.push(exp);
	}
	if (modified) params.entry.exports = keptExports;
	return {
		exportCount: modified ? keptExports.length : exportCount,
		modified
	};
}
function validateSingleIgnoreEntry(params) {
	const { entry, lineNum, projectRoot, seenFiles, auditor } = params;
	const relFile = entry.file;
	let isDuplicateFile = false;
	let modified = false;
	auditor.runSubAuditorSync("fallow-duplicate-entry", () => {
		if (seenFiles.has(relFile)) {
			isDuplicateFile = true;
			if (auditor.isFixActive()) modified = true;
			else auditor.addViolation({
				ruleId: "fallow-duplicate-entry",
				severity: "error",
				file: ".fallowrc.json",
				line: lineNum,
				message: `Archivo duplicado en ignoreExports: '${relFile}'.`,
				context: relFile,
				fixable: true
			});
		}
	});
	seenFiles.add(relFile);
	if (isDuplicateFile && auditor.isFixActive()) return {
		symbolCount: 0,
		keepEntry: false,
		modified: true
	};
	let hasEmptyList = false;
	auditor.runSubAuditorSync("fallow-empty-export-list", () => {
		if (!Array.isArray(entry.exports) || entry.exports.length === 0) {
			hasEmptyList = true;
			if (auditor.isFixActive()) modified = true;
			else auditor.addViolation({
				ruleId: "fallow-empty-export-list",
				severity: "error",
				file: ".fallowrc.json",
				line: lineNum,
				message: `Entrada para '${relFile}' no declara ningún export en su array de exports.`,
				context: relFile,
				fixable: true
			});
		}
	});
	if (hasEmptyList) return {
		symbolCount: 0,
		keepEntry: !auditor.isFixActive(),
		modified
	};
	const fullFilePath = path.resolve(projectRoot, relFile);
	let isStale = false;
	auditor.runSubAuditorSync("fallow-stale-file", () => {
		if (!fs.existsSync(fullFilePath)) {
			isStale = true;
			if (auditor.isFixActive()) modified = true;
			else auditor.addViolation({
				ruleId: "fallow-stale-file",
				severity: "error",
				file: ".fallowrc.json",
				line: lineNum,
				message: `Archivo '${relFile}' declarado en ignoreExports no existe en el disco.`,
				context: relFile,
				fixable: true
			});
		}
	});
	if (isStale) return {
		symbolCount: 0,
		keepEntry: !auditor.isFixActive(),
		modified
	};
	let symbolCount = 0;
	let keepEntry = true;
	auditor.runSubAuditorSync("fallow-stale-export", () => {
		let content;
		try {
			content = fs.readFileSync(fullFilePath, "utf-8");
		} catch (err) {
			if (auditor.isFixActive()) {
				modified = true;
				keepEntry = false;
			} else auditor.addViolation({
				ruleId: "fallow-stale-file",
				severity: "error",
				file: ".fallowrc.json",
				line: lineNum,
				message: `No se pudo leer el archivo '${relFile}': ${err.message}`,
				context: relFile,
				fixable: true
			});
			return;
		}
		const res = validateExportSymbols({
			entry,
			content,
			relFile,
			isVue: relFile.endsWith(".vue"),
			lineNum,
			auditor
		});
		symbolCount = res.exportCount;
		if (res.modified) {
			modified = true;
			if (entry.exports.length === 0) keepEntry = false;
		}
	});
	return {
		symbolCount,
		keepEntry,
		modified
	};
}
function validateFallowIgnoreExports(config, projectRoot, auditor) {
	if (!Array.isArray(config.ignoreExports)) return {
		fileCount: 0,
		exportCount: 0,
		modified: false
	};
	const seenFiles = /* @__PURE__ */ new Set();
	const keptEntries = [];
	let totalExports = 0;
	let modified = false;
	for (let entryIdx = 0; entryIdx < config.ignoreExports.length; entryIdx++) {
		const entry = config.ignoreExports[entryIdx];
		const res = validateSingleIgnoreEntry({
			entry,
			lineNum: entryIdx + 1,
			projectRoot,
			seenFiles,
			auditor
		});
		totalExports += res.symbolCount;
		if (res.modified) modified = true;
		if (res.keepEntry) keptEntries.push(entry);
	}
	if (modified) {
		if (keptEntries.length > 0) config.ignoreExports = keptEntries;
		else delete config.ignoreExports;
	}
	return {
		fileCount: modified ? keptEntries.length : seenFiles.size,
		exportCount: totalExports,
		modified
	};
}
function validateFallowWorkspaceDiagnostics(diagnostics, auditor) {
	if (!Array.isArray(diagnostics)) return;
	for (const d of diagnostics) {
		if (d.kind === "boundaries-not-configured" || d.kind === "rule-packs-not-configured") continue;
		auditor.addViolation({
			ruleId: "fallow-config-workspace-diagnostic",
			severity: "error",
			file: d.path && d.path !== "." ? d.path : ".fallowrc.json",
			line: 1,
			message: `Diagnóstico de workspace (Fallow): [${d.kind || "diagnostic"}] ${d.message || ""}`,
			context: d.kind || "workspace_diagnostic"
		});
	}
}
const FALLOW_CONFIG_REQUIREMENT = {
	id: "fallow-config",
	file: ".fallowrc.json",
	description: "Configuración de Fallow y control de exports",
	ruleId: "fallow-config-missing",
	generateDefaultContent: () => createDefaultFallowConfigContent()
};
var ValidateFallowConfigAuditor = class extends BaseAuditor {
	constructor(targetPathOrOptions) {
		let projectRoot;
		let configPath;
		let fix = false;
		if (typeof targetPathOrOptions === "object" && targetPathOrOptions !== null) {
			projectRoot = targetPathOrOptions.projectRoot || process.cwd();
			configPath = targetPathOrOptions.configFile ? path.resolve(projectRoot, targetPathOrOptions.configFile) : path.resolve(projectRoot, ".fallowrc.json");
			fix = Boolean(targetPathOrOptions.fix);
		} else {
			const isJsonFile = typeof targetPathOrOptions === "string" && targetPathOrOptions.endsWith(".json");
			projectRoot = isJsonFile ? path.dirname(targetPathOrOptions) : targetPathOrOptions || process.cwd();
			configPath = isJsonFile ? targetPathOrOptions : path.resolve(projectRoot, ".fallowrc.json");
		}
		const relConfig = toPosixRelative(projectRoot, configPath) || ".fallowrc.json";
		const configRequirement = {
			...FALLOW_CONFIG_REQUIREMENT,
			file: relConfig,
			candidateFiles: [relConfig]
		};
		super({
			usesThirdPartyTool: true,
			requiredPermissions: ["--allow-child-process"],
			thirdPartyToolPolicy: {
				toolName: "Fallow",
				fallbackBehavior: "violation",
				fallbackRuleId: "fallow-config-workspace-diagnostic"
			},
			ruleCapabilities: createRuleCapabilities(FALLOW_CONFIG_RULES, {
				speed: "light",
				phase: "setup",
				fix: "priority",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}, [
				"fallow-config-missing",
				"fallow-banned-entry-glob",
				"fallow-stale-file",
				"fallow-stale-export",
				"fallow-empty-export-list",
				"fallow-duplicate-entry"
			]),
			fixableRuleIds: [
				"fallow-config-missing",
				"fallow-banned-entry-glob",
				"fallow-stale-file",
				"fallow-stale-export",
				"fallow-empty-export-list",
				"fallow-duplicate-entry"
			],
			configFiles: [configRequirement],
			fix,
			id: "validate_fallow_config",
			name: "Fallow Configuration & Exports Hygiene Validator",
			description: "Valida integridad de .fallowrc.json y sus ignoreExports",
			family: "architecture",
			ruleIds: FALLOW_CONFIG_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(FALLOW_CONFIG_RULES, "setup"),
			packageName: "Fallow",
			configKey: "fallow.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "🌾",
			ruleDescriptions: {
				"fallow-config-missing": "Falta archivo .fallowrc.json",
				"fallow-config-syntax": "JSON inválido en .fallowrc.json",
				"fallow-banned-entry-glob": "Glob prohibido en entry",
				"fallow-stale-file": "Archivo inexistente en config",
				"fallow-stale-export": "Export inexistente en config",
				"fallow-empty-export-list": "Entrada vacía en ignoreExports",
				"fallow-duplicate-entry": "Entrada o export duplicado",
				"fallow-config-workspace-diagnostic": "Diagnóstico de workspace"
			},
			ruleRemediations: {
				"fallow-config-missing": "Causa Raíz:\nEl archivo .fallowrc.json no existe en la raíz del proyecto.\nFallow requiere este archivo para mapear los puntos de entrada canónicos y las excepciones legítimas de código muerto.\n\nDiagnóstico:\nVerifica si existe el archivo .fallowrc.json en la raíz del repositorio.\n\nSolución Canónica:\nEjecuta \"npm run auditor:fix\" o \"auditor fix\". El framework generará automáticamente la configuración canónica con los puntos de entrada detectados.",
				"fallow-config-syntax": "Causa Raíz:\nEl archivo .fallowrc.json contiene un error de sintaxis JSON (comas de más, comillas sin cerrar o formato corrupto).\n\nDiagnóstico:\nRevisa el mensaje de error del parser JSON para ubicar la línea del defecto.\n\nSolución Canónica:\nAbre .fallowrc.json y corrige el error de formato utilizando un linter JSON o formateador de código.",
				"fallow-banned-entry-glob": "Causa Raíz:\nSe declaró un patrón de entrada (entry) prohibido en .fallowrc.json (como comodines masivos \"src/components/**/*\" o \"src/views/**/*\").\nDeclarar árboles completos de componentes como puntos de entrada enmascara código huérfano y vistas muertas, impidiendo que Fallow detecte archivos no enlazados en el árbol de dependencias.\n\nDiagnóstico:\nExamina el array \"entry\" en .fallowrc.json.\n\nSolución Canónica:\n1. Ejecuta \"npm run auditor:fix\" para purgar los globs prohibidos automáticamente.\n2. Mantén únicamente los puntos de entrada raíz auténticos (ej. \"src/main.ts\", \"src/index.ts\").",
				"fallow-stale-file": "Causa Raíz:\nUna entrada en \"ignoreExports\" referencia un archivo que ya fue eliminado, movido o renombrado en el disco.\n\nDiagnóstico:\nEl mensaje de la advertencia detalla la ruta del archivo que no se encuentra en el sistema de archivos.\n\nSolución Canónica:\nEjecuta \"npm run auditor:fix\" o \"auditor fix\". El auditor eliminará automáticamente todas las entradas obsoletas de .fallowrc.json.",
				"fallow-stale-export": "Causa Raíz:\nUn símbolo declarado en el array \"exports\" de una entrada en \"ignoreExports\" ya no se encuentra exportado en el archivo fuente correspondiente.\n\nDiagnóstico:\nComprueba el archivo fuente: el símbolo fue renombrado o eliminado de las sentencias export.\n\nSolución Canónica:\nEjecuta \"npm run auditor:fix\" para sincronizar y eliminar los nombres de símbolos caducados.",
				"fallow-empty-export-list": "Causa Raíz:\nUna entrada de archivo en \"ignoreExports\" tiene un array de exports vacío (\"exports\": []).\n\nDiagnóstico:\nRevisa las entradas en .fallowrc.json donde no se declaró ningún símbolo.\n\nSolución Canónica:\nEjecuta \"npm run auditor:fix\" para eliminar la entrada innecesaria.",
				"fallow-duplicate-entry": "Causa Raíz:\nEl mismo archivo o símbolo está repetido más de una vez dentro de .fallowrc.json.\n\nDiagnóstico:\nEl mensaje indica la entrada duplicada.\n\nSolución Canónica:\nEjecuta \"npm run auditor:fix\" para deduplicar automáticamente las entradas y símbolos.",
				"fallow-config-workspace-diagnostic": "Causa Raíz:\nEl analizador Fallow emitió un diagnóstico a nivel de espacio de trabajo o configuración de límites arquitectónicos.\n\nDiagnóstico:\nInspecciona el mensaje emitido por el motor de Fallow en el reporte.\n\nSolución Canónica:\nAjusta la configuración de paquetes o límites en .fallowrc.json de acuerdo a la recomendación del motor."
			},
			coverage: { include: [".fallowrc.json"] },
			projectRoot
		});
	}
	async runAudit() {
		const requirement = this.configFiles[0] ?? FALLOW_CONFIG_REQUIREMENT;
		const ensured = await this.runSubAuditor("fallow-config-missing", async () => {
			return await this.ensureConfigFile(requirement);
		});
		if (!ensured) return;
		const resolvedPath = ensured.resolvedPath;
		const config = this.runSubAuditorSync("fallow-config-syntax", () => {
			return loadFallowConfig(resolvedPath, this);
		});
		if (!config) return;
		const validConfig = config;
		this.recordScanned(".fallowrc.json");
		let modified = false;
		this.runSubAuditorSync("fallow-banned-entry-glob", () => {
			const bannedGlobs = getBannedEntryGlobs(this.projectRoot);
			if (validateFallowEntries(validConfig, bannedGlobs, this)) modified = true;
		});
		if (!Array.isArray(validConfig.ignoreExports) || validConfig.ignoreExports.length === 0) {
			this.markRuleNotApplicable("fallow-duplicate-entry", "Sin ignoreExports en .fallowrc.json");
			this.markRuleNotApplicable("fallow-empty-export-list", "Sin ignoreExports en .fallowrc.json");
			this.markRuleNotApplicable("fallow-stale-file", "Sin ignoreExports en .fallowrc.json");
			this.markRuleNotApplicable("fallow-stale-export", "Sin ignoreExports en .fallowrc.json");
		} else {
			const { fileCount, exportCount, modified: ignoreModified } = validateFallowIgnoreExports(validConfig, this.projectRoot, this);
			if (ignoreModified) modified = true;
			this.context.setMetric("Archivos en ignoreExports", fileCount);
			this.context.setMetric("Exports Validados", exportCount);
		}
		if (modified && this.isFixActive()) fs.writeFileSync(resolvedPath, JSON.stringify(validConfig, null, 2) + "\n", "utf-8");
		this.runSubAuditorSync("fallow-config-workspace-diagnostic", () => {
			try {
				const fallowBin = [path.resolve(this.projectRoot, "node_modules/fallow/bin/fallow"), path.resolve(process.cwd(), "node_modules/fallow/bin/fallow")].find((c) => fs.existsSync(c));
				if (fallowBin) {
					const stdout = execSync(`node "${fallowBin}" list --workspaces --format json --root "${this.projectRoot}"`, {
						encoding: "utf8",
						stdio: [
							"pipe",
							"pipe",
							"ignore"
						],
						timeout: 1e4
					});
					validateFallowWorkspaceDiagnostics(JSON.parse(stdout).workspace_diagnostics, this);
				}
			} catch {}
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateFallowConfigAuditor());
//#endregion
export { BANNED_ENTRY_GLOBS, FALLOW_CONFIG_REQUIREMENT, FALLOW_CONFIG_RULES, ValidateFallowConfigAuditor, createDefaultFallowConfigContent, escapeRegExp, getBannedEntryGlobs, isSymbolExportedInContent, validateFallowWorkspaceDiagnostics };
