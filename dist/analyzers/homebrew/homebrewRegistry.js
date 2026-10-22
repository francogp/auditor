//#region src/analyzers/homebrew/homebrewRegistry.ts
var HomebrewDetectorRegistry = class {
	static detectors = /* @__PURE__ */ new Map();
	static register(detector) {
		this.detectors.set(detector.id, detector);
	}
	static unregister(id) {
		return this.detectors.delete(id);
	}
	static get(id) {
		return this.detectors.get(id);
	}
	static getAll() {
		return Array.from(this.detectors.values());
	}
	static clear() {
		this.detectors.clear();
	}
	static getRuleIds() {
		const ids = /* @__PURE__ */ new Set();
		for (const d of this.detectors.values()) ids.add(d.ruleId);
		return Array.from(ids);
	}
	static getRuleDescriptions() {
		const descriptions = {};
		for (const d of this.detectors.values()) descriptions[d.ruleId] = d.ruleDescription;
		return descriptions;
	}
	static getRuleRemediations() {
		return {
			"auditor-manual-package-json": "Use the canonical getPackageJson(projectRoot) utility from src/core/packageJson.ts instead of manually reading or parsing package.json.",
			"auditor-manual-vue-sfc-regex": "Use AuditedDocument or parseVueSfc() from core to analyze Vue SFC blocks instead of fragile manual regular expressions.",
			"auditor-manual-ts-ast": "Use SharedAstContext or getAstContext(projectRoot) to reuse TypeScript AST instead of manually compiling or parsing files.",
			"auditor-raw-console": "Replace direct calls to console.log/error/warn with this.addViolation(), this.renderTable(), or authorized printTerminal().",
			"auditor-manual-comment-stripping": "Use canonical stripComments() from src/core/ or TypeScript AST instead of manual regexes to strip comments.",
			"auditor-manual-brace-counting": "Use canonical AST parser or extractBlocks() to balance braces instead of error-prone manual counters.",
			"auditor-manual-file-walker": "Inherit from FileScanAuditor or use this.context.collectFiles() instead of traversing the filesystem with manual walkers.",
			"auditor-homebrew-predicates": "Import canonical predicates from src/core/auditTestPredicates.ts or src/core/auditConfig.ts instead of reimplementing test checks.",
			"auditor-manual-rule-timing": "Wrap rule execution with this.runRuleMeasured(ruleId, () => ...) to record execution durations instead of manual timers.",
			"auditor-hardcoded-config": "Resolve paths, directories, and configurations dynamically from audit.config.ts without hardcoded filenames or constants.",
			"auditor-manual-step-logging": "Remove sequential step logging ([1/6], [2/6]) inside sub-auditors; streaming runner manages lifecycle and visual progress.",
			"auditor-unmeasured-rule": "Wrap rule evaluation with this.runRuleMeasured() or reportRuleDuration() to ensure measurement and performance telemetry.",
			"auditor-redundant-rule-evaluated": "Remove redundant markRuleEvaluated() calls when the rule is already measured automatically via runRuleMeasured().",
			"auditor-third-party-tool-contract": "Declare usesThirdPartyTool: true with thirdPartyToolPolicy ({ toolName, fallbackBehavior, fallbackRuleId }) in constructor when running external tools, or usesThirdPartyTool: false for native analyzers.",
			"auditor-inefficient-file-scan": "Avoid iterating rules before files or passing blind wildcards (**/*.ext) to external CLIs; use this.scanFilesSinglePass(), FileScanAuditor, or pass the list of files discovered by auditor."
		};
	}
	static run(context, disabledDetectors = [], onDetectorDuration) {
		const disabledSet = new Set(disabledDetectors);
		const findings = [];
		for (const detector of this.detectors.values()) {
			if (disabledSet.has(detector.id)) continue;
			const t0 = performance.now();
			const detectorFindings = detector.detect(context);
			if (onDetectorDuration) onDetectorDuration(detector.ruleId, performance.now() - t0);
			for (const finding of detectorFindings) findings.push(finding);
		}
		return findings;
	}
};
//#endregion
export { HomebrewDetectorRegistry };
