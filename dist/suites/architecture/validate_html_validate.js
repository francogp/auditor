import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { extractJsonReportFilePaths, parseLintResultsToFindings } from "../../core/reportUtils.js";
import "../../core/auditConfig.js";
import { executeNodeCli, resolveNodeModuleBin } from "../../cli/cliUtils.js";
import { BaseAuditor, collectRepositoryFiles, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_html_validate.ts
/**
* packages/auditor/src/suites/architecture/validate_html_validate.ts
*
* HTML5 STANDARDS & MARKUP HYGIENE AUDITOR (Node.js 26+ Native)
*
* Runs `html-validate` with `html-validate-vue` across project templates (.vue, .html),
* detects deprecated attributes, obsolete elements, and spec violations (Zero-Warning Policy),
* and persists structured reports to scratch/audits/architecture/validate_html_validate.json.
* Supports auto-fix when `fix` is passed.
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* --allow-child-process packages/auditor/src/suites/architecture/validate_html_validate.ts
*   npm run validate:html
*/
enableCompileCache();
const HTML_VALIDATE_RULES = ["html-validate-issue"];
const MAX_BUFFER_BYTES = 52428800;
const EXECUTION_TIMEOUT_MS = 0;
/**
* Parses raw JSON output or an array of file reports from html-validate into canonical AuditFindings.
* Elevates both warnings and errors to severity: 'error' (Zero-Warning Policy).
*/
function parseHtmlValidateResults(input, cwd = process.cwd()) {
	return parseLintResultsToFindings(input, {
		cwd,
		suiteId: "validate_html_validate",
		suiteName: "HTML5 Standards & Markup Hygiene Validator",
		ruleId: "html-validate-issue",
		ruleDescription: "Violación de estándar HTML5",
		defaultRuleName: "html-validate",
		defaultMessage: "HTML validation issue"
	});
}
function resolveHtmlValidateConfig(projectRoot) {
	const hostConfig = path.resolve(projectRoot, ".htmlvalidate.json");
	if (fs.existsSync(hostConfig)) return hostConfig;
	const packageConfig = path.resolve(import.meta.dirname, "../../../.htmlvalidate.json");
	if (fs.existsSync(packageConfig)) return packageConfig;
	return ".htmlvalidate.json";
}
function collectRootHtmlTargets(projectRoot, root, targets, filesToScan) {
	const fullRoot = path.resolve(projectRoot, root);
	const found = collectRepositoryFiles(fullRoot, projectRoot, [], /* @__PURE__ */ new Set([".html", ".vue"]));
	if (found.length > 0) {
		targets.push(root);
		filesToScan.push(...found);
	}
}
function collectTopLevelHtmlTargets(projectRoot, targets, filesToScan) {
	try {
		const rootEntries = fs.readdirSync(projectRoot, { withFileTypes: true });
		for (const entry of rootEntries) if (entry.isFile() && entry.name.endsWith(".html")) {
			targets.push(entry.name);
			filesToScan.push(path.join(projectRoot, entry.name));
		}
	} catch {}
}
function collectHtmlTargets(projectRoot, roots) {
	const targets = [];
	const filesToScan = [];
	for (const root of roots) collectRootHtmlTargets(projectRoot, root, targets, filesToScan);
	collectTopLevelHtmlTargets(projectRoot, targets, filesToScan);
	return {
		targets,
		filesToScan
	};
}
function readAndParseHtmlValidateOutput(reportFile, combinedOutput, projectRoot) {
	let findings;
	let rawJson = combinedOutput;
	if (fs.existsSync(reportFile)) try {
		rawJson = fs.readFileSync(reportFile, "utf-8");
		findings = parseHtmlValidateResults(rawJson, projectRoot);
	} catch {
		findings = parseHtmlValidateResults(combinedOutput, projectRoot);
	}
	else findings = parseHtmlValidateResults(combinedOutput, projectRoot);
	return {
		findings,
		rawJson
	};
}
var HtmlValidateAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		super({
			usesThirdPartyTool: true,
			thirdPartyToolPolicy: {
				toolName: "html-validate",
				fallbackBehavior: "violation",
				fallbackRuleId: "html-validate-issue"
			},
			ruleCapabilities: createRuleCapabilities(HTML_VALIDATE_RULES, {
				speed: "light",
				phase: "normal",
				fix: "normal",
				md: false,
				ast: false,
				changedOnly: false,
				critical: true
			}, ["html-validate-issue"]),
			fixableRuleIds: ["html-validate-issue"],
			id: "validate_html_validate",
			name: "HTML5 Standards & Markup Hygiene Validator",
			description: "Valida estándares y elementos obsoletos con html-validate",
			family: "architecture",
			packageName: "HTML",
			configKey: "htmlValidate.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "🌐",
			ruleIds: HTML_VALIDATE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(HTML_VALIDATE_RULES, "behavior"),
			ruleDescriptions: { "html-validate-issue": "Violación de estándar HTML5" },
			ruleRemediations: { "html-validate-issue": "Causa Raíz:\nViolación de estándares del HTML Living Standard (WHATWG) o buenas prácticas de accesibilidad y marcado semántico en archivos .html o plantillas de componentes Vue (.vue).\nhtml-validate detecta elementos obsoletos (<center>, <font>, <marquee>), anidamientos no permitidos (ej. <p> dentro de <p>, <div> dentro de <span> o <a> interactivo dentro de <a>), atributos inválidos o no admitidos en el elemento, o IDs duplicados en el mismo DOM.\n\nDiagnóstico:\n1. Ejecuta \"npm run auditor:findings rule=html-validate-issue\" para ver el archivo, línea y regla específica de HTML5 que falló.\n2. Identifica si la violación proviene de un tag deprecado, de un anidamiento prohibido o de un atributo inválido.\n\nSolución Canónica:\n1. Sustituir elementos obsoletos por contenedores semánticos (<header>, <nav>, <main>, <section>, <article>, <div>) y aplicar estilos mediante clases CSS o utilidades del sistema de diseño.\n2. Corregir anidamientos ilegales. Por ejemplo, en HTML5 un párrafo <p> solo puede contener elementos phrasing (en línea); un bloque <div> o lista <ul> dentro de un <p> fuerza el cierre implícito del párrafo y corrompe el árbol del DOM.\n3. Evitar colocar elementos interactivos dentro de otros elementos interactivos (ej. un <button> dentro de un <a>).\n4. Ejecuta \"npm run auditor:fix\" para corregir automáticamente los problemas de formateo o atributos triviales soportados por html-validate.\n\nEjemplo Antes vs Después:\n// ❌ Incorrecto: tag obsoleto y anidamiento no permitido en HTML5\n<center>\n  <p>Texto con bloque interno: <div>Contenido ilegal</div></p>\n</center>\n\n// ✅ Correcto: elementos semánticos estándar con clases de diseño\n<div class=\"text-center\">\n  <p>Texto con elemento en línea: <span class=\"highlight\">Contenido válido</span></p>\n</div>" },
			coverage: {
				include: [
					"src/**/*.{html,vue}",
					"ui-demo/**/*.{html,vue}",
					"*.html",
					".htmlvalidate.json"
				],
				source: "runtime"
			},
			projectRoot: options.projectRoot
		});
	}
	async runAudit() {
		if (this.isSuiteGatingDisabled("HTML-Validate deshabilitado en configuración")) return;
		const isFixMode = this.isFixModeRequested();
		const config = getAuditConfig(this.projectRoot);
		const binPath = resolveNodeModuleBin(this.projectRoot, "html-validate/bin/html-validate.mjs");
		const configFile = resolveHtmlValidateConfig(this.projectRoot);
		const reportFile = path.resolve(this.projectRoot, "scratch/audits/architecture/html-validate-raw.json");
		fs.mkdirSync(path.dirname(reportFile), { recursive: true });
		const scannableRoots = Array.from(/* @__PURE__ */ new Set([
			"src",
			...config.paths.srcRoots ?? [],
			...config.paths.codeRoots ?? [],
			...config.paths.demoRoots ?? []
		])).filter((r) => fs.existsSync(path.resolve(this.projectRoot, r)));
		const localConfigPath = path.resolve(this.projectRoot, ".htmlvalidate.json");
		const hasLocalConfig = fs.existsSync(localConfigPath);
		const coverageInclude = scannableRoots.map((r) => `${r}/**/*.{html,vue}`);
		coverageInclude.push("*.html");
		if (hasLocalConfig) {
			coverageInclude.push(".htmlvalidate.json");
			this.recordScanned(localConfigPath);
		}
		this.redeclareCoverage({
			include: coverageInclude,
			source: "runtime"
		});
		const { targets, filesToScan } = collectHtmlTargets(this.projectRoot, scannableRoots);
		if (filesToScan.length === 0 && targets.length === 0) {
			this.markRuleNotApplicable("html-validate-issue", "No existen archivos HTML ni plantillas para validar");
			return;
		}
		for (const f of filesToScan) this.recordScanned(f);
		const relFiles = filesToScan.map((f) => path.relative(this.projectRoot, f).split(path.sep).join(path.posix.sep));
		const effectiveTargets = relFiles.reduce((acc, f) => acc + f.length + 1, 0) < 6e3 && relFiles.length > 0 ? relFiles : targets;
		const args = [
			"-c",
			configFile,
			"--ext",
			"html,vue",
			"-f",
			`json=${reportFile}`,
			...effectiveTargets
		];
		if (isFixMode) args.push("--fix");
		const { findings, rawJson } = readAndParseHtmlValidateOutput(reportFile, executeNodeCli(binPath, args, {
			cwd: this.projectRoot,
			maxBuffer: MAX_BUFFER_BYTES,
			timeout: EXECUTION_TIMEOUT_MS
		}), this.projectRoot);
		const scannedReportFiles = extractJsonReportFilePaths(rawJson, findings);
		this.recordScannedMany(scannedReportFiles);
		const normalizedFindings = isFixMode ? findings.map((f) => ({
			...f,
			fixable: false
		})) : findings;
		this.markRuleEvaluated("html-validate-issue");
		this.importAuditFindings(normalizedFindings, "html-validate-issue", "html-validate");
		this.context.setMetric("html_violations", normalizedFindings.length);
		this.context.setMetric("mode", isFixMode ? "fix" : "check");
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new HtmlValidateAuditor());
//#endregion
export { HTML_VALIDATE_RULES, HtmlValidateAuditor, collectHtmlTargets, parseHtmlValidateResults, readAndParseHtmlValidateOutput };
