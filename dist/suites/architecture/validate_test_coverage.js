import { buildTestCoverageConfig } from "../../core/auditConfigDefaults.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/auditCoverage.js";
import { isProductionEnvironment } from "../../core/auditorEnvironment.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import "../../core/safePath.js";
import { analyzeTestCoverage, resolveCoverageFile } from "../../core/testCoverageCore.js";
import { enableCompileCache } from "node:module";
import fs from "node:fs";
//#region src/suites/architecture/validate_test_coverage.ts
/**
* @file validate_test_coverage.ts
* @description Architecture sub-auditor verifying that repository test execution coverage
* meets configured thresholds and has no untracked blind spots when enforceInAudit is enabled.
*/
enableCompileCache();
const TEST_COVERAGE_RULES = [
	"test-coverage-below-threshold",
	"test-coverage-missing-report",
	"test-coverage-untracked-files"
];
const DEFAULT_COVERAGE_THRESHOLD = 80;
var ValidateTestCoverageAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const effectiveRoot = options.projectRoot ?? process.cwd();
		super({
			usesThirdPartyTool: false,
			id: "validate_test_coverage",
			name: "Test Execution Coverage Auditor",
			description: "Gobernanza de cobertura real de pruebas unitarias",
			family: "architecture",
			packageName: "Cobertura",
			configKey: "testCoverage.enforceInAudit",
			defaultConfig: {
				enabled: true,
				enforceInAudit: true,
				threshold: 80,
				path: "scratch/coverage/coverage-final.json"
			},
			criticalConfig: {},
			icon: "🧪",
			ruleIds: TEST_COVERAGE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(TEST_COVERAGE_RULES, "polish"),
			ruleDescriptions: {
				"test-coverage-below-threshold": "Cobertura de tests bajo umbral",
				"test-coverage-missing-report": "Falta archivo de cobertura",
				"test-coverage-untracked-files": "Archivos en disco sin testear"
			},
			ruleRemediations: {
				"test-coverage-below-threshold": "La cobertura de código de tests unitarios está por debajo del umbral mínimo exigido. Diagnóstico: El porcentaje de sentencias cubiertas en el proyecto no alcanza el umbral establecido (por defecto 80%). Remediación: 1) Revisa los archivos con cobertura insuficiente usando \"npm run auditor task=validate_test_coverage\" o inspeccionando scratch/coverage/index.html. 2) Añade pruebas unitarias en tests/ para cubrir las ramas y funciones no testeadas. 3) Si ciertos archivos o módulos utilitarios están exentos, configúralos en testCoverage.exemptGlobs en .auditor/audit.config.ts.",
				"test-coverage-missing-report": "No se encontró el reporte de cobertura en la ruta configurada (por defecto scratch/coverage/coverage-final.json). Diagnóstico: Vitest o el ejecutor de pruebas aún no ha corrido con cobertura o los reportes se emitieron en otra carpeta. Remediación: 1) Ejecuta \"npm run test:coverage\" o \"vp test --coverage\". 2) Verifica que vite.config.ts tenga configurado test.coverage.reportsDirectory = \"scratch/coverage\" y provider = \"v8\". 3) Asegúrate de tener instalado @vitest/coverage-v8 en devDependencies.",
				"test-coverage-untracked-files": "Se detectaron archivos fuente en src/ que nunca fueron ejecutados ni importados durante las pruebas unitarias. Diagnóstico: Existen módulos enteros huérfanos de pruebas. Remediación: 1) Crea archivos de test en tests/ para cada archivo fuente no cubierto. 2) Si el archivo corresponde a un barrel re-export o archivo de tipos puros sin lógica ejecutable, agrégalo a testCoverage.exemptGlobs en .auditor/audit.config.ts."
			},
			coverage: {
				include: [
					"src/**/*.ts",
					"src/**/*.vue",
					"scripts/**/*.ts"
				],
				source: "declared-only"
			},
			ruleCapabilities: createRuleCapabilities(TEST_COVERAGE_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			projectRoot: effectiveRoot
		});
	}
	async runAudit() {
		if (isProductionEnvironment()) {
			this.markSkipped("Test coverage omitido en entorno de producción (AUDITOR_ENV=production)");
			return;
		}
		if (this.isSuiteGatingDisabled("Test coverage enforceInAudit desactivado")) return;
		const projectRoot = this.projectRoot;
		const config = getAuditConfig(projectRoot);
		const resolvedCovConfig = buildTestCoverageConfig(config.testCoverage);
		const threshold = resolvedCovConfig.threshold;
		let coverageFile = null;
		this.runSubAuditorSync("test-coverage-missing-report", () => {
			coverageFile = resolveCoverageFile(projectRoot, resolvedCovConfig.path);
			if (!coverageFile) this.addViolation({
				ruleId: "test-coverage-missing-report",
				severity: "error",
				file: resolvedCovConfig.path,
				line: 1,
				context: "coverage missing",
				message: `No se encontró el archivo de cobertura de tests en '${resolvedCovConfig.path}'. Ejecuta las pruebas con cobertura ('vp test --coverage' o 'npm run test:coverage') antes de auditar.`
			});
		});
		if (!coverageFile) {
			for (const r of ["test-coverage-below-threshold", "test-coverage-untracked-files"]) this.runSubAuditorSync(r, () => {
				this.markRuleNotApplicable(r, "Reporte de cobertura no disponible");
			});
			return;
		}
		try {
			const rawJson = JSON.parse(fs.readFileSync(coverageFile, "utf8"));
			const report = analyzeTestCoverage(rawJson, projectRoot, resolvedCovConfig);
			this.runSubAuditorSync("test-coverage-below-threshold", () => {
				if (report.overall.statements.pct < threshold) this.addViolation({
					ruleId: "test-coverage-below-threshold",
					severity: "error",
					file: toPosixRelative(projectRoot, coverageFile),
					line: 1,
					context: `${report.overall.statements.pct}% < ${threshold}%`,
					message: `Cobertura global de statements (${report.overall.statements.pct}%) inferior al umbral configurado de ${threshold}% (${report.overall.statements.covered}/${report.overall.statements.total} sentencias cubiertas).`
				});
			});
			this.runSubAuditorSync("test-coverage-untracked-files", () => {
				if (report.untrackedFiles.length > 0) this.addViolation({
					ruleId: "test-coverage-untracked-files",
					severity: "warning",
					file: report.untrackedFiles[0],
					line: 1,
					context: "untracked files",
					message: `Se detectaron ${report.untrackedFiles.length} archivo(s) en disco que nunca fueron ejecutados por los tests (ej: ${report.untrackedFiles.slice(0, 3).join(", ")}).`
				});
			});
		} catch (err) {
			this.addViolation({
				ruleId: "test-coverage-missing-report",
				severity: "error",
				file: toPosixRelative(projectRoot, coverageFile),
				line: 1,
				context: "parse error",
				message: `Error analizando reporte de cobertura: ${err instanceof Error ? err.message : String(err)}`
			});
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateTestCoverageAuditor());
//#endregion
export { DEFAULT_COVERAGE_THRESHOLD, TEST_COVERAGE_RULES, ValidateTestCoverageAuditor };
