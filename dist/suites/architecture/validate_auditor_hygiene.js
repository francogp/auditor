import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
import "../../core/safePath.js";
import { isSelfProviderProject } from "../../core/auditProjectIdentity.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { AUDITOR_HOMEBREW_RULES } from "../../analyzers/homebrew/homebrewTypes.js";
import { HomebrewDetectorRegistry } from "../../analyzers/homebrew/homebrewRegistry.js";
import "../../analyzers/homebrew/index.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
// src/suites/architecture/validate_auditor_hygiene.ts
/**
* src/suites/architecture/validate_auditor_hygiene.ts
*
* AUDITOR ARCHITECTURE & HOMEBREW HYGIENE VALIDATOR (Node.js 26+ Native)
*
* Scans all official auditor suites, analyzers, and host project extensions,
* validating that they leverage the unified core framework abstractions
* (getPackageJson, AuditedDocument, scannerUtils, safePath, SharedAstContext,
* auditTestPredicates, auditProjectIdentity) and eliminate homebrew anti-patterns.
*/
enableCompileCache();
var AuditorHygieneAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const projectRoot = options.projectRoot ?? process.cwd();
		const config = getAuditConfig(projectRoot);
		const configuredRoots = config.auditorHygiene?.roots && config.auditorHygiene.roots.length > 0 ? config.auditorHygiene.roots : isSelfProviderProject(projectRoot) ? [
			"src/suites",
			"src/analyzers",
			"src/core",
			"scripts/auditors"
		] : ["scripts/auditors"];
		super({
			ruleFixers: {},
			usesThirdPartyTool: false,
			requiredPermissions: [],
			id: "validate_auditor_hygiene",
			name: "Auditor Architecture & Homebrew Hygiene Validator",
			description: "Validates auditor hygiene and canonical API usage",
			family: "architecture",
			ruleIds: HomebrewDetectorRegistry.getRuleIds(),
			packageName: "Auditor",
			icon: "🧹",
			ruleDescriptions: HomebrewDetectorRegistry.getRuleDescriptions(),
			ruleRemediations: HomebrewDetectorRegistry.getRuleRemediations(),
			ruleRemediationPhases: createUniformRemediationPhases(HomebrewDetectorRegistry.getRuleIds(), "hygiene"),
			configKey: "auditorHygiene",
			defaultConfig: {
				enabled: true,
				roots: ["scripts/auditors"]
			},
			criticalConfig: {},
			ruleCapabilities: createRuleCapabilities(HomebrewDetectorRegistry.getRuleIds(), {
				speed: "light",
				phase: "normal",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			coverage: {
				include: deriveCoverageFromRoots(configuredRoots, /* @__PURE__ */ new Set([".ts"]), projectRoot).include,
				exclude: ["src/analyzers/homebrew/**"]
			},
			projectRoot
		});
	}
	collectTargetFiles() {
		const files = /* @__PURE__ */ new Set();
		const isSelfRepo = isSelfProviderProject(this.projectRoot);
		const config = getAuditConfig(this.projectRoot);
		const exemptFiles = new Set(config.auditorHygiene?.exemptFiles ?? []);
		const roots = config.auditorHygiene?.roots && config.auditorHygiene.roots.length > 0 ? config.auditorHygiene.roots : isSelfRepo ? [
			"src/suites",
			"src/analyzers",
			"src/core",
			"scripts/auditors"
		] : ["scripts/auditors"];
		const candidateFiles = this.context.collectFiles(roots, /* @__PURE__ */ new Set([".ts"]));
		for (const absPath of candidateFiles) {
			const relPath = normalizePosixPath(path.relative(this.projectRoot, absPath));
			if (absPath.endsWith(".d.ts")) continue;
			if (isTestPath(relPath)) continue;
			if (relPath.includes("analyzers/homebrew/")) continue;
			if (path.basename(relPath).startsWith("_")) continue;
			if (exemptFiles.has(relPath)) continue;
			files.add(absPath);
		}
		if (config.extensions && config.extensions.length > 0) for (const ext of config.extensions) {
			const absPath = path.resolve(this.projectRoot, ext);
			if (fs.existsSync(absPath)) files.add(absPath);
		}
		return Array.from(files);
	}
	async runAudit() {
		const disabledDetectors = getAuditConfig(this.projectRoot).auditorHygiene?.disabledDetectors ?? [];
		const targetFiles = this.collectTargetFiles();
		if (targetFiles.length === 0) {
			for (const r of this.ruleIds) this.runSubAuditorSync(r, () => {
				this.markRuleNotApplicable(r, "No se encontraron archivos de auditor");
			});
			return;
		}
		let cleanFilesCount = 0;
		for (const absPath of targetFiles) {
			const relPath = normalizePosixPath(path.relative(this.projectRoot, absPath));
			const content = fs.readFileSync(absPath, "utf8");
			const inspectionContext = {
				filePath: relPath,
				absolutePath: absPath,
				content,
				lines: content.split("\n"),
				isExtension: relPath.startsWith("scripts/auditors/") || !relPath.startsWith("src/"),
				isBuiltinSuite: relPath.startsWith("src/suites/"),
				isAnalyzer: relPath.startsWith("src/analyzers/"),
				isCore: relPath.startsWith("src/core/"),
				projectRoot: this.projectRoot
			};
			const findings = HomebrewDetectorRegistry.run(inspectionContext, disabledDetectors, (ruleId, durationMs) => {
				this.markRuleEvaluated(ruleId);
				this.reportRuleDuration(ruleId, durationMs);
			});
			if (findings.length === 0) cleanFilesCount++;
			else for (const f of findings) this.addViolation({
				ruleId: f.ruleId,
				file: relPath,
				line: f.line,
				message: f.message,
				context: f.context,
				severity: f.severity ?? "error"
			});
			this.recordScanned(absPath);
		}
		this.context.setMetric("Auditor Files Inspected", targetFiles.length);
		this.context.setMetric("Active Homebrew Detectors", HomebrewDetectorRegistry.getAll().length);
		this.context.setMetric("Clean Auditor Files", cleanFilesCount);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new AuditorHygieneAuditor());
export { AUDITOR_HOMEBREW_RULES, AuditorHygieneAuditor };
