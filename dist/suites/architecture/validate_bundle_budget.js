import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots, toPosixRelative } from "../../core/auditCoverage.js";
import "../../core/safePath.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { SharedAstContext } from "../../core/astContext.js";
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
		reason: "PostgreSQL backend driver must not be imported in UI layers (src/components, src/views, src/stores)."
	},
	{
		module: "node:sqlite",
		reason: "Native SQLite driver must not be imported in UI layers."
	},
	{
		module: "@playwright/test",
		reason: "E2E testing library must not be imported in src/ production code."
	},
	{
		module: "vitest",
		reason: "Test framework must not be imported in src/ production code."
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
	const results = [];
	ts.forEachChild(sourceFile, (node) => {
		if (ts.isImportDeclaration(node)) {
			const moduleSpecifier = node.moduleSpecifier;
			if (!ts.isStringLiteral(moduleSpecifier)) return;
			if (isImportTypeOnly(node)) return;
			const lineNum = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
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
		message: `Runtime code leak: '${imp.moduleSpecifier}'. Importing runtime values from '${seg}' into production code is prohibited.`,
		context: imp.moduleSpecifier
	});
}
function checkHeavyImports(imports, relPath, forbiddenUiImports, auditor) {
	for (const imp of imports) for (const forbidden of forbiddenUiImports) if (imp.moduleSpecifier === forbidden.module || imp.moduleSpecifier.startsWith(`${forbidden.module}/`)) auditor.addViolation({
		ruleId: "bundle-heavy-import",
		severity: "error",
		file: relPath,
		line: imp.lineNum,
		message: `Runtime value import forbidden in UI: '${imp.moduleSpecifier}'. ${forbidden.reason}`,
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
			message: `Chunk '${asset}' (${(statsSize / 1024).toFixed(1)} KB) exceeds configured budget '${matchingBudget.name}' of ${(matchingBudget.limitBytes / 1024).toFixed(0)} KB.`,
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
		message: `Client chunk '${asset}' (${(statsSize / 1024).toFixed(1)} KB) exceeds critical configured limit of ${(maxErrorBytes / 1024).toFixed(0)} KB.`,
		context: asset
	});
	else if (maxWarnBytes !== void 0 && statsSize > maxWarnBytes) auditor.addViolation({
		ruleId: "bundle-chunk-size",
		severity: "warning",
		file: relAssetPath,
		line: 1,
		message: `Client chunk '${asset}' (${(statsSize / 1024).toFixed(1)} KB) exceeds suggested configured limit of ${(maxWarnBytes / 1024).toFixed(0)} KB.`,
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
		reason: "Compiled production bundle and artifact directory",
		isApplicable: (config) => config.bundle?.enabled !== false && config.packageDistribution?.enabled !== true
	}];
	constructor(options = {}) {
		const projectRoot = options.projectRoot ?? process.cwd();
		const config = getAuditConfig(projectRoot);
		const srcRoots = config.paths.srcRoots ?? [];
		const distDirRel = config.bundle?.distDir ? toPosixRelative(projectRoot, config.bundle.distDir) : "dist";
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
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
			description: "Audits bundle size limits and import leaks",
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
				"bundle-runtime-leak": "Test/script leak into production",
				"bundle-heavy-import": "Heavy library imported in UI layer",
				"bundle-chunk-size": "Chunk exceeds size limit"
			},
			ruleRemediations: {
				"bundle-runtime-leak": "📖 REMEDIATION GUIDE: bundle-runtime-leak\n1. Root Cause: Values (functions, objects, classes) were imported from test folders (`tests/`, `__tests__/`) or dev utilities (`scripts/`) into production code (`src/`). This leaks development dependencies and fixtures into final production bundles.\n2. Diagnosis: Locate the `import ... from \"...tests/...\"` statement in the reported production file.\n3. Canonical Solution:\n   a) If only types or interfaces are needed, use type-only imports: `import type { ... } from \"...\"`.\n   b) If common utilities are needed, move them to `src/utils/` or a shared domain package.\n   c) Ensure production files never import runtime values or fixtures from test directories.\n4. Example / Auto-fix command:\n   ❌ Insecure: `import { mockUser } from \"../../tests/fixtures/user\";`\n   ✅ Secure:   `import type { UserProfile } from \"@/domain/types\";`",
				"bundle-heavy-import": "📖 REMEDIATION GUIDE: bundle-heavy-import\n1. Root Cause: A heavy backend or Node.js library (e.g. `node:fs`, `jsdom`, `typescript`, `fallow`, `exceljs`) was imported directly into a UI component, view, or store.\n2. Diagnosis: Inspect the import statement in the reported component or store.\n3. Canonical Solution:\n   a) If the library is only needed for user-initiated actions, use dynamic imports (`await import(\"...\")`) inside the specific handler for code-splitting.\n   b) Move heavy processing to a Web Worker or backend API endpoint.\n   c) Use lightweight browser-optimized alternatives.\n4. Example / Auto-fix command:\n   ❌ Heavy static:  `import { HeavyParser } from \"heavy-parser\";` in component.\n   ✅ Code-splitting: `const { HeavyParser } = await import(\"heavy-parser\");` inside handler.",
				"bundle-chunk-size": "📖 REMEDIATION GUIDE: bundle-chunk-size\n1. Root Cause: A compiled client chunk in `dist/` exceeds the maximum configured size limit in `.auditor/audit.config.ts` (`config.bundle.maxChunkSizeKB`). Giant chunks hurt First Contentful Paint (FCP) and mobile interaction speeds.\n2. Diagnosis: Check the chunk name and size reported in the finding.\n3. Canonical Solution:\n   a) Configure manual code-splitting (`manualChunks` in Vite / Rollup) to isolate vendor dependencies.\n   b) Apply lazy loading (`defineAsyncComponent`) for Vue Router routes and heavy views.\n   c) Inspect bundle sizes using `rollup-plugin-visualizer` and replace non-tree-shakeable packages.\n4. Example / Auto-fix command:\n   - Load routes with: `component: () => import(\"@/views/DashboardView.vue\")`"
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
			this.markRuleNotApplicable("bundle-runtime-leak", "No candidate source files found");
			this.markRuleNotApplicable("bundle-heavy-import", "No candidate source files found");
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
		if (chunksAudited === 0) this.markRuleNotApplicable("bundle-chunk-size", "No compiled artifacts found in dist");
		this.context.setMetric("Files Audited", this.filesScannedCount);
		this.context.setMetric("Compiled Chunks", chunksAudited);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new BundleBudgetAuditor());
//#endregion
export { BUNDLE_BUDGET_RULES, BundleBudgetAuditor, DEFAULT_FORBIDDEN_VALUE_IMPORTS_UI, getForbiddenValueImportsUI };
