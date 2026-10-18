import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/auditCoverage.js";
import { executeCliAndReadJson, resolvePackageBin } from "../../cli/cliUtils.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import "../../core/safePath.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_type_coverage.ts
enableCompileCache();
const DEFAULT_MIN_TYPE_COVERAGE_PERCENT = 95;
const TYPE_COVERAGE_RULES = ["type-coverage-below-threshold", "type-coverage-untyped-identifier"];
/**
* Parses raw JSON output from type-coverage into canonical AuditFindings.
*/
function parseTypeCoverageReport(report, threshold, projectRoot = process.cwd()) {
	const findings = [];
	const percent = report.percent ?? 0;
	const percentStr = report.percentString ?? percent.toFixed(2);
	const correct = report.correctCount ?? 0;
	const total = report.totalCount ?? 0;
	if (percent < threshold) {
		findings.push({
			suiteId: "validate_type_coverage",
			suiteName: "TypeScript Quantitative Type Coverage Auditor",
			ruleId: "type-coverage-below-threshold",
			ruleDescription: "Tipos: Cobertura de tipos bajo el umbral",
			severity: "error",
			file: "tsconfig.json",
			line: 1,
			col: 1,
			context: `${percentStr}% < ${threshold}%`,
			message: `Cobertura de tipos de ${percentStr}% inferior al umbral configurado de ${threshold}% (${correct}/${total} identificadores tipados).`
		});
		for (const item of report.anys ?? []) {
			const relFile = toPosixRelative(projectRoot, item.filePath);
			findings.push({
				suiteId: "validate_type_coverage",
				suiteName: "TypeScript Quantitative Type Coverage Auditor",
				ruleId: "type-coverage-untyped-identifier",
				ruleDescription: "Tipos: Identificador untyped any detectado",
				severity: "error",
				file: relFile,
				line: item.line,
				col: item.character,
				context: item.text,
				message: `Identificador con tipo any o implícito no tipado: "${item.text}"`
			});
		}
	}
	return findings;
}
const DEFAULT_TYPE_COVERAGE_THRESHOLD = 95;
var ValidateTypeCoverageAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const effectiveRoot = options.projectRoot ?? process.cwd();
		super({
			usesThirdPartyTool: true,
			thirdPartyToolPolicy: {
				toolName: "type-coverage",
				fallbackBehavior: "violation",
				fallbackRuleId: "type-coverage-below-threshold"
			},
			ruleCapabilities: createRuleCapabilities(TYPE_COVERAGE_RULES, {
				speed: ["heavy", "full"],
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_type_coverage",
			name: "TypeScript Quantitative Type Coverage Auditor",
			description: "Gobernanza cuantitativa de cobertura de tipos estricta",
			family: "architecture",
			packageName: "Tipos",
			configKey: "typeCoverage.enabled",
			defaultConfig: {
				enabled: true,
				atLeast: 95
			},
			criticalConfig: {},
			icon: "📊",
			ruleIds: TYPE_COVERAGE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(TYPE_COVERAGE_RULES, "contracts"),
			ruleDescriptions: {
				"type-coverage-below-threshold": "Cobertura de tipos bajo el umbral",
				"type-coverage-untyped-identifier": "Identificador untyped any detectado"
			},
			ruleRemediations: {
				"type-coverage-below-threshold": "📖 GUÍA DE REMEDIACIÓN: type-coverage-below-threshold\n1. Causa Raíz: El porcentaje de identificadores fuertemente tipados en el proyecto está por debajo del umbral mínimo configurado en `.auditor/audit.config.ts` (`config.typeCoverage.atLeast`, por defecto 95%).\n2. Diagnóstico: Comprueba el reporte emitido por `type-coverage` para ver el porcentaje actual y la cantidad de símbolos que resuelven a `any`.\n3. Solución Canónica:\n   a) Revisa los archivos con mayor número de identificadores `any` o no tipados.\n   b) Añade tipos de retorno explícitos en funciones, tipos a parámetros, y tipea los objetos de respuesta o estado.\n   c) No utilices `any`; recurre a `unknown` con type guards o define interfaces/tipos de dominio precisos.\n4. Ejemplo:\n   - Tipar variables de `const data = JSON.parse(str)` a `const data: unknown = JSON.parse(str)` seguido de validación de esquema con Valibot.",
				"type-coverage-untyped-identifier": "📖 GUÍA DE REMEDIACIÓN: type-coverage-untyped-identifier\n1. Causa Raíz: Un identificador, propiedad, parámetro o variable específica resolvió al tipo `any` (explícito o inferido implícitamente por el compilador).\n2. Diagnóstico: Ubica el identificador y la posición (línea:columna) señalados en el reporte.\n3. Solución Canónica: Asigna una anotación de tipo explícita (`: string`, `: Record<string, unknown>`, `: TDomainEntity`) o tipea adecuadamente la función generadora de la que proviene.\n4. Ejemplo:\n   ❌ Untyped: `function handle(event) { ... }` (event es any implícito)\n   ✅ Tipado:  `function handle(event: MouseEvent): void { ... }`"
			},
			coverage: {
				include: [
					"src/**/*.ts",
					"src/**/*.vue",
					"scripts/**/*.ts"
				],
				source: "declared-only"
			},
			projectRoot: effectiveRoot
		});
	}
	async runAudit() {
		if (this.isSuiteGatingDisabled("Type coverage desactivado en config")) return;
		this.recordExternalScanCount(1);
		const config = getAuditConfig(this.projectRoot);
		const scratchDir = path.resolve(this.projectRoot, "scratch/audits/architecture");
		const cacheDir = path.resolve(this.projectRoot, "scratch/cache/type-coverage");
		fs.mkdirSync(scratchDir, { recursive: true });
		fs.mkdirSync(cacheDir, { recursive: true });
		const rawOutPath = path.resolve(scratchDir, "type-coverage-raw.json");
		if (fs.existsSync(rawOutPath)) try {
			fs.unlinkSync(rawOutPath);
		} catch {}
		const threshold = config.typeCoverage?.atLeast ?? 95;
		const report = this.executeTypeCoverageCli(config, cacheDir, rawOutPath, threshold);
		if (!report) {
			this.markRuleEvaluated("type-coverage-below-threshold");
			this.markRuleEvaluated("type-coverage-untyped-identifier");
			return;
		}
		this.applyCoverageMetricsAndFindings(report, threshold);
	}
	executeTypeCoverageCli(config, cacheDir, rawOutPath, threshold) {
		const isStrict = config.typeCoverage?.strict ?? true;
		const ignoreFiles = config.typeCoverage?.ignoreFiles ?? [];
		const tier = this.getExecutionTier();
		const baseFlags = [
			"--json-output",
			"--show-relative-path",
			"--at-least",
			String(threshold),
			"--cache",
			"--cache-directory",
			cacheDir
		];
		if (isStrict) baseFlags.push("--strict");
		const cliFlags = tier === "full" ? [
			...baseFlags,
			"--detail",
			"--ignore-catch"
		] : baseFlags;
		for (const ignoreFile of ignoreFiles) cliFlags.push("--ignore-files", ignoreFile);
		const resolvedBin = resolvePackageBin("type-coverage", {
			projectRoot: this.projectRoot,
			fallbackRelativeBin: "bin/type-coverage"
		});
		if (!resolvedBin) throw new Error("[validate_type_coverage] El ejecutable de 'type-coverage' no fue encontrado en node_modules/.bin ni en el entorno local. Asegúrate de que 'type-coverage' esté instalado en las dependencias del proyecto. El uso de npx está estrictamente prohibido.");
		const command = process.execPath;
		const finalArgs = [resolvedBin, ...cliFlags];
		return executeCliAndReadJson(command, finalArgs, rawOutPath, {
			cwd: this.projectRoot,
			shell: false
		});
	}
	applyCoverageMetricsAndFindings(report, threshold) {
		const percentStr = report.percentString ?? report.percent?.toFixed(2) ?? "0.00";
		const correct = report.correctCount ?? 0;
		const total = report.totalCount ?? 0;
		this.context.setMetric("Type Coverage", `${percentStr}% (≥${threshold}%)`);
		this.context.setMetric("Typed Identifiers", `${correct}/${total}`);
		const findings = parseTypeCoverageReport(report, threshold, this.projectRoot);
		for (const ruleId of TYPE_COVERAGE_RULES) this.runSubAuditorSync(ruleId, () => {
			for (const finding of findings) {
				if ((finding.ruleId ?? "type-coverage-below-threshold") !== ruleId) continue;
				this.addViolation({
					ruleId,
					severity: finding.severity,
					file: finding.file ?? "tsconfig.json",
					line: finding.line ?? 1,
					context: finding.context ?? finding.message,
					message: finding.message
				});
			}
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateTypeCoverageAuditor());
//#endregion
export { DEFAULT_MIN_TYPE_COVERAGE_PERCENT, DEFAULT_TYPE_COVERAGE_THRESHOLD, TYPE_COVERAGE_RULES, ValidateTypeCoverageAuditor, parseTypeCoverageReport };
