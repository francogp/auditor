import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/auditCoverage.js";
import { BaseAuditor, collectRepositoryFiles, createRuleCapabilities } from "../../core/auditorBase.js";
import "../../core/safePath.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { Package, checkPackage } from "@arethetypeswrong/core";
//#region src/suites/architecture/validate_package_types.ts
/**
* src/suites/architecture/validate_package_types.ts
*
* PACKAGE TYPES RESOLUTION AUDITOR (Node.js 26+ Native)
* Validates TypeScript declaration (.d.ts) resolution and dual ESM/CJS compatibility
* for compiled packages in dist/ via @arethetypeswrong/core (ATTW).
*
* Capabilities: phase: 'post-build' (executed exclusively post-build via phase=post-build).
*/
enableCompileCache();
const PACKAGE_TYPES_RULES = [
	"pkg-types-resolution",
	"pkg-types-dual-hazard",
	"pkg-types-missing-dts"
];
/**
* Builds an in-memory Package representation for @arethetypeswrong/core from a disk directory.
*/
function createPackageFromDirectory(pkgDir) {
	const pkgJsonPath = path.join(pkgDir, "package.json");
	if (!fs.existsSync(pkgJsonPath)) throw new Error(`[validate_package_types]: No package.json found at ${pkgDir}`);
	const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
	const name = pkgJson.name ?? "unknown-package";
	const version = pkgJson.version ?? "0.0.0";
	const files = {};
	const scannedFiles = collectRepositoryFiles(pkgDir, pkgDir, [
		"node_modules/**",
		".git/**",
		"scratch/**"
	], /* @__PURE__ */ new Set(), ["dist"]);
	for (const filePath of scannedFiles) {
		const relPath = toPosixRelative(pkgDir, filePath);
		files[`/node_modules/${name}/${relPath}`] = fs.readFileSync(filePath);
	}
	return new Package(files, name, version);
}
function classifyAttwProblem(p) {
	switch (p.kind) {
		case "UntypedResolution": return {
			ruleId: "pkg-types-missing-dts",
			severity: "error",
			message: `Entrypoint '${p.entrypoint}' sin tipos en resolución ${p.resolutionKind}`,
			context: `${p.entrypoint} (${p.resolutionKind})`
		};
		case "NoResolution": return {
			ruleId: "pkg-types-resolution",
			severity: "error",
			message: `Entrypoint '${p.entrypoint}' no resuelve tipos en resolución ${p.resolutionKind}`,
			context: `${p.entrypoint} (${p.resolutionKind})`
		};
		case "FalseESM": return {
			ruleId: "pkg-types-dual-hazard",
			severity: "error",
			message: `Incompatibilidad ESM en tipos vs impl: ${p.typesFileName} vs ${p.implementationFileName}`,
			context: p.typesFileName
		};
		case "FalseCJS": return {
			ruleId: "pkg-types-dual-hazard",
			severity: "error",
			message: `Incompatibilidad CJS en tipos vs impl: ${p.typesFileName} vs ${p.implementationFileName}`,
			context: p.typesFileName
		};
		case "CJSResolvesToESM": return {
			ruleId: "pkg-types-dual-hazard",
			severity: "warning",
			message: `Entrypoint '${p.entrypoint}' resuelve a ESM cuando se requiere desde CJS`,
			context: `${p.entrypoint} (${p.resolutionKind})`
		};
		case "NamedExports": return {
			ruleId: "pkg-types-resolution",
			severity: "error",
			message: `Faltan exportaciones nombradas en la implementación: ${p.missing.join(", ")}`,
			context: p.typesFileName
		};
		case "InternalResolutionError": return {
			ruleId: "pkg-types-resolution",
			severity: "error",
			message: `Error interno de resolución en ${p.fileName}: ${p.moduleSpecifier}`,
			context: p.fileName
		};
		case "UnexpectedModuleSyntax": return {
			ruleId: "pkg-types-resolution",
			severity: "error",
			message: `Sintaxis de módulo inesperada en ${p.fileName}`,
			context: p.fileName
		};
		case "FallbackCondition": return {
			ruleId: "pkg-types-resolution",
			severity: "warning",
			message: `Condición fallback de export detectada para entrypoint '${p.entrypoint}'`,
			context: p.entrypoint
		};
		case "FalseExportDefault": return {
			ruleId: "pkg-types-resolution",
			severity: "error",
			message: "Discrepancia en export default entre tipos e implementación",
			context: p.typesFileName
		};
		case "MissingExportEquals": return {
			ruleId: "pkg-types-resolution",
			severity: "error",
			message: `Falta export = para compatibilidad CJS en ${p.typesFileName}`,
			context: p.typesFileName
		};
		case "CJSOnlyExportsDefault": return {
			ruleId: "pkg-types-dual-hazard",
			severity: "warning",
			message: `Módulo CJS solo exporta default en ${p.fileName}`,
			context: p.fileName
		};
	}
}
/**
* Parses @arethetypeswrong/core problems into canonical AuditFindings.
*/
function parseAttwProblems(problems, pkgJson) {
	const findings = [];
	const isPureEsm = pkgJson.type === "module";
	for (const p of problems) {
		if ("resolutionKind" in p && p.resolutionKind === "node10") continue;
		if (p.kind === "CJSResolvesToESM" && isPureEsm) continue;
		const { ruleId, severity, message, context } = classifyAttwProblem(p);
		findings.push({
			suiteId: "validate_package_types",
			suiteName: "Package Types Resolution Validator",
			ruleId,
			ruleDescription: "Distribución: Resolución de tipos inválida",
			severity,
			file: "package.json",
			line: 1,
			context,
			message
		});
	}
	return findings;
}
var ValidatePackageTypesAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const effectiveRoot = options.projectRoot ?? process.cwd();
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(PACKAGE_TYPES_RULES, {
				speed: "light",
				phase: "post-build",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_package_types",
			name: "Package Types Resolution Validator",
			description: "Valida resolución de tipos .d.ts en dist con ATTW",
			family: "architecture",
			packageName: "Distribución",
			icon: "🏷️",
			ruleIds: PACKAGE_TYPES_RULES,
			ruleDescriptions: {
				"pkg-types-resolution": "Resolución de tipos inválida",
				"pkg-types-dual-hazard": "Incompatibilidad dual ESM y CJS",
				"pkg-types-missing-dts": "Entrypoint sin tipos declarados"
			},
			ruleRemediations: {
				"pkg-types-resolution": "Guía de diagnóstico y remediación para pkg-types-resolution. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"pkg-types-dual-hazard": "Guía de diagnóstico y remediación para pkg-types-dual-hazard. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"pkg-types-missing-dts": "Guía de diagnóstico y remediación para pkg-types-missing-dts. Revisa la incidencia detectada y ajusta el código correspondiente."
			},
			coverage: { include: ["package.json", "dist/**"] },
			projectRoot: effectiveRoot,
			configKey: "packageDistribution.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {}
		});
	}
	async runAudit() {
		if (this.isSuiteGatingDisabled("Package distribution auditing is disabled")) return;
		this.recordScanned("package.json");
		const pkgJsonPath = path.resolve(this.projectRoot, "package.json");
		if (!fs.existsSync(pkgJsonPath)) return;
		let pkgJson;
		try {
			pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
		} catch {
			return;
		}
		const configuredLevel = getAuditConfig(this.projectRoot).packageDistribution?.level ?? "warning";
		const pkg = createPackageFromDirectory(this.projectRoot);
		const checkResult = await checkPackage(pkg);
		const findings = parseAttwProblems(checkResult.types ? checkResult.problems : [], pkgJson);
		for (const ruleId of PACKAGE_TYPES_RULES) this.runSubAuditorSync(ruleId, () => {
			const ruleFindings = findings.filter((f) => f.ruleId === ruleId);
			for (const f of ruleFindings) {
				const finalSeverity = configuredLevel === "warning" ? "warning" : f.severity;
				this.addViolation({
					ruleId,
					severity: finalSeverity,
					file: f.file,
					line: f.line,
					context: f.context,
					message: f.message
				});
			}
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidatePackageTypesAuditor());
//#endregion
export { PACKAGE_TYPES_RULES, ValidatePackageTypesAuditor, createPackageFromDirectory, parseAttwProblems };
