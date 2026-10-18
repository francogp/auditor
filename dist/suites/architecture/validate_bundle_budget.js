import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots, toPosixRelative } from "../../core/auditCoverage.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { SharedAstContext } from "../../core/astContext.js";
import "../../core/safePath.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
//#region src/suites/architecture/validate_bundle_budget.ts
/**
* scripts/auditors/architecture/validate_bundle_budget.ts
*
* BUNDLE BUDGET & CLIENT LEAK AUDITOR (Node.js 26+ Native)
*
* Enforces bundle boundaries and import discipline across production code:
*   1. Prohibits importing from /tests/ or /scripts/ inside src/ (bundle-runtime-leak).
*   2. Prohibits importing heavy modules (postgres, node:sqlite, vitest, @playwright/test)
*      as runtime values in UI layers (src/components, src/views, src/stores).
*   3. Enforces client chunk budgets in dist/assets when compiled assets exist.
*
* Escape Hatch:
*   // bundle-leak-ok: <justification> disables import check on that line.
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_bundle_budget.ts
*   npm run validate:bundle-budget
*/
enableCompileCache();
const BUNDLE_BUDGET_RULES = [
	"bundle-runtime-leak",
	"bundle-heavy-import",
	"bundle-chunk-size"
];
const DEFAULT_FORBIDDEN_VALUE_IMPORTS_UI = [
	{
		module: "postgres",
		reason: "Driver PostgreSQL backend no debe importarse en UI layers (src/components, src/views, src/stores)."
	},
	{
		module: "node:sqlite",
		reason: "Driver SQLite nativo no debe importarse en UI layers."
	},
	{
		module: "@playwright/test",
		reason: "Librería de pruebas E2E no debe importarse en código de producción de src/."
	},
	{
		module: "vitest",
		reason: "El framework de pruebas no debe importarse en código de producción de src/."
	}
];
function getForbiddenValueImportsUI(projectRoot) {
	const custom = getAuditConfig(projectRoot).bundle?.forbiddenUiImports ?? [];
	return [...DEFAULT_FORBIDDEN_VALUE_IMPORTS_UI, ...custom];
}
function isImportTypeOnly(node) {
	const importClause = node.importClause;
	if (!importClause) return false;
	if (importClause.isTypeOnly) return true;
	if (importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) return importClause.namedBindings.elements.every((elem) => elem.isTypeOnly);
	return false;
}
function extractRuntimeImports(fullPath, astEngine) {
	const content = fs.readFileSync(fullPath, "utf8");
	if (!content.includes("import ")) return [];
	const sourceFile = astEngine.getSourceFile(fullPath, content);
	if (!sourceFile.text.trim()) return [];
	const fullLines = content.split("\n");
	const results = [];
	ts.forEachChild(sourceFile, (node) => {
		if (ts.isImportDeclaration(node)) {
			const moduleSpecifier = node.moduleSpecifier;
			if (!ts.isStringLiteral(moduleSpecifier)) return;
			if (isImportTypeOnly(node)) return;
			const lineNum = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
			if ((fullLines[lineNum - 1] || "").includes("// bundle-leak-ok:")) return;
			results.push({
				moduleSpecifier: moduleSpecifier.text,
				lineNum
			});
		}
	});
	return results;
}
function checkRuntimeLeaks(imports, relPath, forbiddenSegments, auditor) {
	for (const imp of imports) for (const seg of forbiddenSegments) if (imp.moduleSpecifier.includes(seg) || imp.moduleSpecifier.startsWith(`..${seg}`)) auditor.addViolation({
		ruleId: "bundle-runtime-leak",
		severity: "error",
		file: relPath,
		line: imp.lineNum,
		message: `Fuga de código en tiempo de ejecución: '${imp.moduleSpecifier}'. No se permite importar valores desde '${seg}' en código de producción.`,
		context: imp.moduleSpecifier
	});
}
function checkHeavyImports(imports, relPath, forbiddenUiImports, auditor) {
	for (const imp of imports) for (const forbidden of forbiddenUiImports) if (imp.moduleSpecifier === forbidden.module || imp.moduleSpecifier.startsWith(`${forbidden.module}/`)) auditor.addViolation({
		ruleId: "bundle-heavy-import",
		severity: "error",
		file: relPath,
		line: imp.lineNum,
		message: `Import de valor en tiempo de ejecución prohibido en UI: '${imp.moduleSpecifier}'. ${forbidden.reason}`,
		context: imp.moduleSpecifier
	});
}
function auditSingleChunkBudget(asset, statsSize, relAssetPath, bundleConfig, auditor) {
	const matchingBudget = (bundleConfig?.budgets ?? []).find((b) => {
		if (b.prefix && asset.startsWith(b.prefix)) return true;
		if (b.matcher && new RegExp(b.matcher).test(asset)) return true;
		return false;
	});
	if (matchingBudget) {
		if (statsSize > matchingBudget.limitBytes) auditor.addViolation({
			ruleId: "bundle-chunk-size",
			severity: "error",
			file: relAssetPath,
			line: 1,
			message: `El chunk '${asset}' (${(statsSize / 1024).toFixed(1)} KB) supera el presupuesto configurado '${matchingBudget.name}' de ${(matchingBudget.limitBytes / 1024).toFixed(0)} KB.`,
			context: asset
		});
		return;
	}
	const maxErrorBytes = bundleConfig?.maxClientChunkErrorBytes;
	const maxWarnBytes = bundleConfig?.maxClientChunkWarnBytes;
	if (maxErrorBytes !== void 0 && statsSize > maxErrorBytes) auditor.addViolation({
		ruleId: "bundle-chunk-size",
		severity: "error",
		file: relAssetPath,
		line: 1,
		message: `El chunk de cliente '${asset}' (${(statsSize / 1024).toFixed(1)} KB) supera el límite crítico configurado de ${(maxErrorBytes / 1024).toFixed(0)} KB.`,
		context: asset
	});
	else if (maxWarnBytes !== void 0 && statsSize > maxWarnBytes) auditor.addViolation({
		ruleId: "bundle-chunk-size",
		severity: "warning",
		file: relAssetPath,
		line: 1,
		message: `El chunk de cliente '${asset}' (${(statsSize / 1024).toFixed(1)} KB) excede el límite sugerido configurado de ${(maxWarnBytes / 1024).toFixed(0)} KB.`,
		context: asset
	});
}
function auditCompiledChunks(distDir, bundleConfig, projectRoot, auditor) {
	if (!fs.existsSync(distDir)) return 0;
	const exemptPrefixes = bundleConfig?.exemptChunkPrefixes ?? [];
	let chunksAudited = 0;
	try {
		const entries = fs.readdirSync(distDir, {
			withFileTypes: true,
			recursive: true
		});
		for (const entry of entries) {
			if (!entry.isFile()) continue;
			const name = entry.name;
			if (!name.endsWith(".js") && !name.endsWith(".mjs") && !name.endsWith(".cjs") || name.endsWith(".d.ts") || name.endsWith(".map") || name.endsWith(".br") || name.endsWith(".gz")) continue;
			const parentPath = entry.parentPath ?? distDir;
			const fullPath = path.join(parentPath, name);
			const relName = normalizePosixPath(path.relative(distDir, fullPath));
			if (exemptPrefixes.some((prefix) => name.startsWith(prefix) || relName.startsWith(prefix))) continue;
			chunksAudited++;
			const stats = fs.statSync(fullPath);
			const relAssetPath = toPosixRelative(projectRoot, fullPath);
			auditor["recordScanned"](relAssetPath);
			auditor["markRuleEvaluated"]("bundle-chunk-size");
			auditSingleChunkBudget(relName, stats.size, relAssetPath, bundleConfig, auditor);
		}
	} catch {
		return 0;
	}
	return chunksAudited;
}
var BundleBudgetAuditor = class BundleBudgetAuditor extends BaseAuditor {
	static gitIgnoreEntries = [{
		id: "dist",
		pattern: "dist/",
		samplePath: "dist/index.js",
		reason: "Directorio de artefactos y bundle compilado de producción",
		isApplicable: (config) => config.bundle?.enabled !== false && config.packageDistribution?.enabled !== true
	}];
	constructor(projectRoot = process.cwd()) {
		const config = getAuditConfig(projectRoot);
		const srcRoots = config.paths.srcRoots ?? [];
		const distDirRel = config.bundle?.distDir ? toPosixRelative(projectRoot, config.bundle.distDir) : "dist";
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(BUNDLE_BUDGET_RULES, {
				speed: "light",
				phase: "post-build",
				fix: "none",
				md: false,
				ast: true,
				changedOnly: false,
				critical: false
			}),
			gitIgnoreEntries: BundleBudgetAuditor.gitIgnoreEntries,
			id: "validate_bundle_budget",
			name: "Bundle Budget & Client Leak Auditor",
			description: "Audita límites de tamaño de bundles y fugas de imports",
			family: "architecture",
			ruleIds: BUNDLE_BUDGET_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(BUNDLE_BUDGET_RULES, "polish"),
			packageName: "Bundle",
			configKey: "bundle.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "📦",
			coverage: { include: [...deriveCoverageFromRoots(srcRoots, /* @__PURE__ */ new Set([
				".ts",
				".vue",
				".js"
			]), projectRoot).include, `${distDirRel}/**`] },
			ruleDescriptions: {
				"bundle-runtime-leak": "Fuga de test/script en producción",
				"bundle-heavy-import": "Librería pesada en capas de UI",
				"bundle-chunk-size": "Chunk excede límite de tamaño"
			},
			ruleRemediations: {
				"bundle-runtime-leak": "Guía de diagnóstico y remediación para bundle-runtime-leak. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"bundle-heavy-import": "Guía de diagnóstico y remediación para bundle-heavy-import. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"bundle-chunk-size": "Guía de diagnóstico y remediación para bundle-chunk-size. Revisa la incidencia detectada y ajusta el código correspondiente."
			},
			requiresAst: true,
			projectRoot
		});
	}
	async runAudit(astContext) {
		if (this.isSuiteGatingDisabled("Bundle audit desactivado en config")) {
			this.context.setMetric("Bundle Status", "Disabled");
			return;
		}
		const config = getAuditConfig(this.projectRoot);
		const srcRoots = config.paths.srcRoots ?? [];
		const distDirRel = config.bundle?.distDir ? toPosixRelative(this.projectRoot, config.bundle.distDir) : "dist";
		this.redeclareCoverage({ include: [...deriveCoverageFromRoots(srcRoots, /* @__PURE__ */ new Set([
			".ts",
			".vue",
			".js"
		]), this.projectRoot).include, `${distDirRel}/**`] });
		const effectiveUiDirs = [
			...config.paths.componentsRoots ?? [],
			...config.paths.viewsRoots ?? [],
			...config.paths.storesRoots ?? []
		];
		const forbiddenSegments = [...config.paths.testRoots?.map((r) => `/${r}/`) ?? [], ...config.paths.scriptsRoots?.map((r) => `/${r}/`) ?? []];
		const effectiveForbiddenUiImports = getForbiddenValueImportsUI(this.projectRoot);
		const candidateFiles = this.context.collectFiles(srcRoots, /* @__PURE__ */ new Set([
			".ts",
			".vue",
			".js"
		])).filter((f) => !isTestPath(f) && !path.basename(f).endsWith(".d.ts"));
		const astEngine = astContext ?? new SharedAstContext();
		if (candidateFiles.length === 0) {
			this.markRuleNotApplicable("bundle-runtime-leak", "No se encontraron archivos de código fuente candidatos");
			this.markRuleNotApplicable("bundle-heavy-import", "No se encontraron archivos de código fuente candidatos");
		} else for (const relPath of candidateFiles) {
			this.recordScanned(relPath);
			const fullPath = path.resolve(this.projectRoot, relPath);
			const norm = toPosixRelative(this.projectRoot, fullPath);
			const isUiLayer = effectiveUiDirs.some((d) => norm.startsWith(d));
			const imports = extractRuntimeImports(fullPath, astEngine);
			this.runSubAuditorSync("bundle-runtime-leak", () => {
				checkRuntimeLeaks(imports, relPath, forbiddenSegments, this);
			});
			this.runSubAuditorSync("bundle-heavy-import", () => {
				if (isUiLayer) checkHeavyImports(imports, relPath, effectiveForbiddenUiImports, this);
			});
		}
		const configuredDist = config.bundle?.distDir ?? "dist/assets";
		const resolvedConfigured = path.resolve(this.projectRoot, configuredDist);
		const distDir = fs.existsSync(resolvedConfigured) || !fs.existsSync(path.resolve(this.projectRoot, "dist")) ? resolvedConfigured : path.resolve(this.projectRoot, "dist");
		let chunksAudited = 0;
		this.runSubAuditorSync("bundle-chunk-size", () => {
			chunksAudited = auditCompiledChunks(distDir, config.bundle, this.projectRoot, this);
		});
		if (chunksAudited === 0) this.markRuleNotApplicable("bundle-chunk-size", "No se encontraron artefactos compilados en dist");
		this.context.setMetric("Files Audited", this.filesScannedCount);
		this.context.setMetric("Compiled Chunks", chunksAudited);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new BundleBudgetAuditor());
//#endregion
export { BUNDLE_BUDGET_RULES, BundleBudgetAuditor, DEFAULT_FORBIDDEN_VALUE_IMPORTS_UI, getForbiddenValueImportsUI };
