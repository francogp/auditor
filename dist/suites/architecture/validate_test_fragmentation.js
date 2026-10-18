import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { renderBoxTable } from "../../core/unifiedTheme.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
//#region src/suites/architecture/validate_test_fragmentation.ts
/**
* scripts/auditors/architecture/validate_test_fragmentation.ts
*
* TEST ANTI-FRAGMENTATION & JSDOM GOVERNANCE AUDITOR (Node.js 26+ Native)
*
* Enforces test suite architecture standards across the test suite:
*   - Prevents proliferation of micro-files (< 60 lines or configurable minimum).
*   - Encourages domain-cohesive test suites (300-800 lines) to eliminate
*     Vitest worker thread setup/teardown and module boot overhead.
*   - Detects unnecessary @vitest-environment jsdom annotations on tests that do not
*     mount Vue components or use browser DOM globals, saving ~250ms per suite.
*   - Generates test suite size distribution analytics (summary=true).
*
* Escape Hatches:
*   - Registered in TEST_FRAGMENTATION_WHITELIST (standalone worker wrappers, SFC view mounts).
*   - Line annotation: `// test-fragmentation-ok: <justification>`.
*   - JSDOM annotation: `// jsdom-ok: <justification>`.
*
* Usage:
*   npm run validate:test-fragmentation
*   npm run validate:test-fragmentation:summary
*/
enableCompileCache();
const TEST_FRAGMENTATION_RULES = ["no-fragmented-tests", "unnecessary-jsdom"];
const MIN_TEST_FILE_LINES = 60;
const DISTRIBUTION_SMALL_MAX_LINES = 300;
const DISTRIBUTION_TARGET_MAX_LINES = 800;
const DISTRIBUTION_OVERSIZED_MIN_LINES = 1200;
/**
* Whitelist of legitimately standalone runners, process wrappers, container benchmarks,
* and isolated Vue SFC view mounting specs that are exempt from the 60-line floor.
*/
const TEST_FRAGMENTATION_WHITELIST = /* @__PURE__ */ new Set([]);
var TestFragmentationAuditor = class extends FileScanAuditor {
	minTestLines;
	fragmentationWhitelist;
	distribution = {
		micro: 0,
		small: 0,
		target: 0,
		oversized: 0,
		other: 0,
		totalTestFiles: 0,
		totalTestLines: 0
	};
	constructor(roots, projectRoot) {
		const config = getAuditConfig(projectRoot);
		const effectiveRoots = roots ?? [
			...config.paths.testRoots ?? [],
			...config.paths.integrationRoots ?? [],
			...config.paths.e2eRoots ?? []
		];
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(TEST_FRAGMENTATION_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_test_fragmentation",
			name: "Test Anti-Fragmentation Validator",
			description: "Previene micro-tests (<60 líns) y JSDOM innecesario",
			family: "architecture",
			ruleIds: TEST_FRAGMENTATION_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(TEST_FRAGMENTATION_RULES, "hygiene"),
			packageName: "Tests",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "🧪",
			ruleDescriptions: {
				"no-fragmented-tests": "Archivo fragmentado (<60 líneas)",
				"unnecessary-jsdom": "JSDOM innecesario sin Vue/DOM"
			},
			ruleRemediations: {
				"no-fragmented-tests": "📖 GUÍA DE REMEDIACIÓN: no-fragmented-tests\n1. Causa Raíz: El archivo de test contiene menos de 60 líneas (micro-test). La proliferación de micro-tests fragmenta el runner de Vitest, multiplica el tiempo de importación de módulos y dificulta la visión integral del subsistema.\n2. Diagnóstico: Comprueba la cantidad de líneas del archivo de prueba reportado.\n3. Solución Canónica:\n   a) Consolida las aserciones de este archivo dentro de la suite de pruebas del módulo correspondiente (`<modulo>.test.ts`).\n   b) Si el archivo prueba un comportamiento autónomo, expande la cobertura incluyendo pruebas de casos borde, errores y caminos negativos.\n   c) Si es un test de integración o contrato deliberadamente conciso, añade el archivo a `testFragmentationWhitelist` en `audit.config.ts` o anota `// test-ok: <justificación>`.\n4. Ejemplo:\n   ❌ Fragmentado: `userHelper.test.ts` con 25 líneas y un solo assert trivial.\n   ✅ Consolidado: Fusionado dentro de `userService.test.ts` cubriendo el ciclo completo.",
				"unnecessary-jsdom": "📖 GUÍA DE REMEDIACIÓN: unnecessary-jsdom\n1. Causa Raíz: El archivo de test declara `// @vitest-environment jsdom` o está configurado para ejecutarse bajo JSDOM, pero su código no interactúa con el DOM de navegador, no monta componentes Vue ni accede a `document`/`window`.\n2. Diagnóstico: Inspecciona el archivo de test y verifica si solo prueba lógica pura de TypeScript/Node.js.\n3. Solución Canónica: Elimina el comentario `// @vitest-environment jsdom` para que se ejecute en el entorno nativo `node` de Vitest, multiplicando por 10x la velocidad de arranque.\n4. Ejemplo:\n   ❌ Innecesario: `// @vitest-environment jsdom` en prueba de cálculos matemáticos.\n   ✅ Optimizado:  Eliminado; ejecuta en entorno nativo `node`."
			},
			roots: effectiveRoots,
			allowedExtensions: /* @__PURE__ */ new Set([".ts", ".js"]),
			projectRoot
		});
		this.minTestLines = config.paths.minTestFileLines ?? 60;
		const customWhitelist = config.paths.testFragmentationWhitelist ?? [];
		this.fragmentationWhitelist = /* @__PURE__ */ new Set([...TEST_FRAGMENTATION_WHITELIST, ...customWhitelist]);
	}
	getDistribution() {
		return this.distribution;
	}
	scanFile(relPath, content) {
		const normalized = relPath.split(path.sep).join(path.posix.sep);
		if (!normalized.endsWith(".test.ts") && !normalized.endsWith(".spec.ts")) return;
		const lineCount = content.split("\n").length;
		this.distribution.totalTestFiles++;
		this.distribution.totalTestLines += lineCount;
		if (this.minTestLines > 0 && lineCount < this.minTestLines) this.distribution.micro++;
		else if (lineCount < 300) this.distribution.small++;
		else if (lineCount <= 800) this.distribution.target++;
		else if (lineCount > 1200) this.distribution.oversized++;
		else this.distribution.other++;
		this.runSubAuditorSync("no-fragmented-tests", () => {
			this.checkMicroTestFragmentation(normalized, content, lineCount);
		});
		this.runSubAuditorSync("unnecessary-jsdom", () => {
			this.checkUnnecessaryJsdom(normalized, content);
		});
	}
	checkMicroTestFragmentation(relPath, content, lineCount) {
		if (this.minTestLines <= 0 || lineCount >= this.minTestLines) return;
		if (this.fragmentationWhitelist.has(relPath) || TEST_FRAGMENTATION_WHITELIST.has(relPath)) return;
		if (content.includes("test-fragmentation-ok")) return;
		this.addViolation({
			ruleId: "no-fragmented-tests",
			severity: "error",
			file: relPath,
			line: 1,
			message: `Test file is overly fragmented (${lineCount} lines < ${this.minTestLines} line minimum). Consolidate into a domain-cohesive test suite (300-800 lines) or annotate with // test-fragmentation-ok: <justification>.`,
			context: `Lines: ${lineCount}`
		});
	}
	checkUnnecessaryJsdom(relPath, content) {
		const jsdomMatch = /@vitest-environment\s+jsdom/.exec(content);
		if (!jsdomMatch) return;
		if (this.hasEscapeHatch(content, [
			"jsdom-ok",
			"test-ok",
			"test-fragmentation-ok"
		])) return;
		const hasVueMount = /@vue\/test-utils|mount\(|shallowMount\(/.test(content);
		const hasDomGlobals = /\b(?:document\.|window\.|localStorage|sessionStorage|navigator\.|HTMLElement|customElements|MutationObserver|ResizeObserver|IntersectionObserver)\b/.test(content);
		const hasWorkerGlobals = /\bself\.(?:onmessage|postMessage|importScripts)\b/.test(content);
		if (!hasVueMount && !hasDomGlobals && !hasWorkerGlobals) {
			const line = this.getLineNumber(content, jsdomMatch.index);
			this.addViolation({
				ruleId: "unnecessary-jsdom",
				severity: "error",
				file: relPath,
				line,
				message: `Test file unnecessarily requests JSDOM environment without mounting Vue components or using DOM APIs. Remove "@vitest-environment jsdom" to run in native Node environment (~250ms faster), or annotate with // jsdom-ok: <justification>.`,
				context: `@vitest-environment jsdom`
			});
		}
	}
	async runAudit() {
		await super.runAudit();
		this.context.setMetric("Suites Ideales (300-800L)", this.distribution.target);
		this.context.setMetric("Suites Pequeñas (60-299L)", this.distribution.small);
		this.context.setMetric("Micro-suites (<60L)", this.distribution.micro);
		this.context.setMetric("Sobredimensionadas (>1200L)", this.distribution.oversized);
		this.context.setMetric("Total Archivos Test", this.distribution.totalTestFiles);
		this.context.setMetric("Total Líneas Test", this.distribution.totalTestLines);
		if (process.argv.some((arg) => arg.includes("summary=true") || arg === "--summary")) this.printDistributionSummary();
	}
	printDistributionSummary() {
		const d = this.distribution;
		const tableStr = renderBoxTable([{
			header: "DISTRIBUCIÓN DE SUITES",
			width: 35,
			key: "category"
		}, {
			header: "CANTIDAD",
			width: 15,
			align: "right",
			key: "count"
		}], [
			{
				category: "Micro-archivos (<60 líns)",
				count: String(d.micro)
			},
			{
				category: "Suites Pequeñas (60-299 líns)",
				count: String(d.small)
			},
			{
				category: "Suites Objetivo (300-800 líns)",
				count: `${d.target} (Ideal)`
			},
			{
				category: "Suites Medias (801-1200 líns)",
				count: String(d.other)
			},
			{
				category: "Sobredimensionadas (>1200 líns)",
				count: String(d.oversized)
			}
		], { footerRows: [{
			category: "Total Archivos de Test",
			count: String(d.totalTestFiles)
		}, {
			category: "Total Líneas de Código Test",
			count: String(d.totalTestLines)
		}] });
		process.stdout.write(`\n${tableStr}\n\n`);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new TestFragmentationAuditor());
//#endregion
export { DISTRIBUTION_OVERSIZED_MIN_LINES, DISTRIBUTION_SMALL_MAX_LINES, DISTRIBUTION_TARGET_MAX_LINES, MIN_TEST_FILE_LINES, TEST_FRAGMENTATION_RULES, TEST_FRAGMENTATION_WHITELIST, TestFragmentationAuditor };
