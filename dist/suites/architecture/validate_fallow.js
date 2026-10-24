import { DEFAULT_AUDIT_CONFIG } from "../../core/auditConfigDefaults.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { toPosixRelative } from "../../core/safePath.js";
import { isCliPath } from "../../core/auditCodeRoots.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES } from "../../cli/cliUtils.js";
import { BaseAuditor } from "../../core/auditorBase.js";
import { resolveFallowBinary } from "./validate_similar_code.js";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
// src/suites/architecture/validate_fallow.ts
/**
* packages/auditor/src/suites/architecture/validate_fallow.ts
*
* OFFICIAL FALLOW STATIC INTELLIGENCE & REFACTORING TARGETS AUDITOR
*
* Dedicated standalone auditor for Fallow intelligence engine:
*   1. Duplicate and triplicate code detection.
*   2. Static security vulnerability analysis (CWE sinks).
*   3. Dead code, unused exports, files, dependencies, and circular dependencies.
*   4. Structural complexity and refactoring targets enforcement.
*/
const FALLOW_RULES = [
	"fallow-refactoring-targets",
	"fallow-duplicate-code",
	"fallow-triplicate-code",
	"fallow-unused-exports",
	"fallow-unused-files",
	"fallow-unused-dependencies",
	"fallow-circular-dependencies",
	"fallow-boundary-violations",
	"fallow-stale-suppressions",
	"fallow-workspace-diagnostic",
	"fallow-security-cwe"
];
const FALLOW_RULE_CAPABILITIES = {
	"fallow-boundary-violations": {
		speed: ["light", "full"],
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-stale-suppressions": {
		speed: ["light", "full"],
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-workspace-diagnostic": {
		speed: ["light", "full"],
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-refactoring-targets": {
		speed: "heavy",
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-duplicate-code": {
		speed: "heavy",
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-triplicate-code": {
		speed: "heavy",
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-unused-exports": {
		speed: ["light", "full"],
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-unused-files": {
		speed: ["light", "full"],
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-unused-dependencies": {
		speed: "heavy",
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-circular-dependencies": {
		speed: "heavy",
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-security-cwe": {
		speed: "light",
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	}
};
const FALLOW_RULE_DESCRIPTIONS = {
	"fallow-refactoring-targets": "Fallow refactoring targets",
	"fallow-duplicate-code": "Duplicate code detected",
	"fallow-triplicate-code": "Critical triplicate code",
	"fallow-unused-exports": "Unused exports in code",
	"fallow-unused-files": "Dead or unused files",
	"fallow-unused-dependencies": "Unused dependencies",
	"fallow-circular-dependencies": "Circular dependencies",
	"fallow-boundary-violations": "Boundary violations",
	"fallow-stale-suppressions": "Stale suppressions",
	"fallow-workspace-diagnostic": "Workspace diagnostic",
	"fallow-security-cwe": "CWE security vulnerabilities"
};
const FALLOW_RULE_REMEDIATIONS = {
	"fallow-refactoring-targets": "1. Root Cause:\nThe Fallow architecture analysis engine computes refactoring priority by combining cyclomatic complexity, cognitive complexity, file size (LOC), afferent/efferent coupling, and the count of dependent modules that amplify changes. A score above the configured threshold (\"fallow.maxTargetPriority\", default \"high\" = 20, or \"critical\" = 30) indicates a high-risk architectural hotspot.\n\n2. Diagnosis:\n1. Run \"npm run auditor:findings -- rule=fallow-refactoring-targets flat\" to view affected files, exact priority score, and specific functions identified by Fallow.\n2. Run \"npm run auditor:complexity\" to break down cyclomatic and cognitive complexity function by function.\n3. Run \"npm run auditor:fallow\" to view overall dependency graph health.\n\n3. Canonical Solution:\n1. Functional Decomposition: Extract high cognitive complexity functions into pure helper functions, reducing nesting depth, branch conditions, and in-place mutations.\n2. Modularize High-Impact Files: If the report indicates \"Split high-impact file (N LOC), M dependents amplify every change\", split the file into smaller, cohesive, decoupled subsystems.\n3. Configuration in .auditor/audit.config.ts: Fallow assesses targets according to \"config.fallow.maxTargetPriority\" (\"critical\" >= 30, \"high\" >= 20). In monolithic systems or authorized coordinators, gating can be tuned via \"fallow.enforceTargets: false\" or raising the threshold upon explicit consultation with the human developer.\n4. Disassembling node_modules or hot-patching third-party libraries to silence this check is STRICTLY PROHIBITED.\n5. Worsened Metrics & Branch Lifecycle: If Fallow reports attribution \"worsened\", an existing complexity hotspot inherited from parent branches had its metrics degraded by recent changes. Review the specific worsened metrics (cyclomatic complexity, LOC, or fan-out) and revert or refactor only the newly introduced branches to restore metrics to at least their pre-branch baseline.\n\n4. Example / Auto-fix command:\n  Diagnostics:        npm run auditor:complexity\n  Deduplication:      npm run auditor:dupes\n  Target inspection:  npm run auditor:findings -- rule=fallow-refactoring-targets flat",
	"fallow-duplicate-code": "1. Root Cause:\nTwo structurally identical code fragments or syntactic clones exceeding Fallow token and line thresholds were detected, violating the DRY principle.\n\n2. Diagnosis:\nRun \"npm run auditor:dupes\" to inspect the consolidated table of duplicate blocks by file, or \"npm run auditor:fallow:dupes\" for a detailed clone view.\n\n3. Canonical Solution:\n1. Extract duplicated logic into a shared utility function, composable, or pure helper.\n2. Use the official refactoring tool: \"npm run auditor:dupes inspect <fingerprint>\" to generate a plan and apply it with \"npm run auditor:dupes apply <plan.json>\".\n\n4. Example / Auto-fix command:\n  Discovery:   npm run auditor:dupes\n  Inspection:  npm run auditor:dupes inspect <fingerprint>",
	"fallow-triplicate-code": "1. Root Cause:\nA triplicate code block (present across 3 or more locations in the repository) was detected. Triplication represents severe technical debt and multiplies bug divergence risks.\n\n2. Diagnosis:\nRun \"npm run auditor:dupes\" to inspect fingerprints and files participating in the triplicate clone.\n\n3. Canonical Solution:\n1. Unify triplicate code into a Single Source of Truth (SSoT) in a shared common module.\n2. Run \"npm run auditor:dupes inspect <fingerprint>\" and apply refactoring with \"npm run auditor:dupes apply <plan.json> --worktree\" to verify safely in an isolated tree.\n\n4. Example / Auto-fix command:\n  Triplicate discovery:  npm run auditor:dupes\n  Detailed inspection:   npm run auditor:dupes inspect <fingerprint>",
	"fallow-unused-exports": "1. Root Cause:\nA function, class, interface, type, or constant declared with \"export\" has no consumers or references in any other file across the repository or package entrypoints.\n\n2. Diagnosis:\nRun \"npm run auditor:fallow:exports\" or \"npm run auditor:findings -- rule=fallow-unused-exports flat\" to identify the unused export symbol and line number.\n\n3. Canonical Solution:\n1. If the symbol is consumed only within the file, remove the \"export\" keyword.\n2. If the symbol is dead or obsolete code, delete it completely.\n3. If the symbol is part of the public API exported by a library package, ensure the file is declared in package.json \"exports\" or configured as an entrypoint in .fallowrc.json.\n\n4. Example / Auto-fix command:\n  npm run auditor:fallow:exports",
	"fallow-unused-files": "1. Root Cause:\nA source file is not imported or reached directly or transitively by any entrypoint in the dependency graph analyzed by Fallow.\n\n2. Diagnosis:\nRun \"npm run auditor:findings -- rule=fallow-unused-files flat\" to list orphan files.\n\n3. Canonical Solution:\n1. If the file is dead or abandoned code from prior refactors, delete it with \"git rm\".\n2. If the file should be active, import it into the appropriate module.\n3. If it is a standalone CLI script, config, or fixture, register it under \"entryPoints\" in .fallowrc.json.\n\n4. Example / Auto-fix command:\n  npm run auditor:fallow category=dead-code",
	"fallow-unused-dependencies": "1. Root Cause:\nA package declared in package.json \"dependencies\" or \"devDependencies\" is neither imported nor referenced in any repository source file.\n\n2. Diagnosis:\nRun \"npm run auditor:dependencies\" or \"npm run auditor:findings -- rule=fallow-unused-dependencies flat\".\n\n3. Canonical Solution:\n1. Uninstall the unneeded package via \"npm rm <package-name>\".\n2. If the package is strictly an indirect runtime requirement (e.g. testing engine or dynamic plugin), declare it in the dependency exemptions section in .fallowrc.json.\n\n4. Example / Auto-fix command:\n  npm run auditor:dependencies",
	"fallow-circular-dependencies": "1. Root Cause:\nTwo or more modules form a circular dependency loop (A imports B and B imports A), which can trigger undefined imports at startup, initialization errors, and memory leaks.\n\n2. Diagnosis:\nRun \"npm run auditor:fallow:circular\" to trace the exact circular dependency cycle.\n\n3. Canonical Solution:\n1. Break the cycle by extracting shared types, interfaces, or constants into a common neutral file.\n2. Invert dependencies via dependency injection, callbacks, or event dispatchers.\n3. Use \"import type { ... }\" if cross-dependencies are solely for TypeScript type definitions.\n\n4. Example / Auto-fix command:\n  npm run auditor:fallow:circular",
	"fallow-boundary-violations": "1. Root Cause:\nA module imports code from another architectural tier, violating layer boundaries defined in .fallowrc.json (for example, client UI code importing server DB models directly).\n\n2. Diagnosis:\nRun \"npm run auditor:findings -- rule=fallow-boundary-violations flat\" to view offending imports and violated boundaries.\n\n3. Canonical Solution:\n1. Replace direct imports with public API contracts or domain DTOs provided by the target layer.\n2. Encapsulate logic in authorized service intermediaries to maintain architectural decoupling.\n\n4. Example / Auto-fix command:\n  npm run auditor:findings -- rule=fallow-boundary-violations",
	"fallow-stale-suppressions": "1. Root Cause:\nA Fallow suppression comment (\"// \" + \"fallow\" + \"-ignore\", etc.) exists on a line where no static violation occurs, cluttering source code with stale directives.\n\n2. Diagnosis:\nRun \"npm run auditor:findings -- rule=fallow-stale-suppressions flat\" to find the obsolete comment.\n\n3. Canonical Solution:\n1. Remove the obsolete suppression comment to maintain code cleanliness.\n\n4. Example / Auto-fix command:\n  npm run auditor:fallow category=suppressions",
	"fallow-workspace-diagnostic": "1. Root Cause:\nFallow detected a structural workspace configuration defect, such as tsconfig.json errors, unresolvable paths, or syntax issues in .fallowrc.json.\n\n2. Diagnosis:\nReview the diagnostic violation message and run \"npm run auditor:tsconfig\" and \"npm run auditor:fallow-config\".\n\n3. Canonical Solution:\n1. Correct compiler options or include paths in tsconfig.json.\n2. Verify that .fallowrc.json is valid JSON conforming to the configuration schema.\n\n4. Example / Auto-fix command:\n  npm run auditor:tsconfig\n  npm run auditor:fallow-config",
	"fallow-security-cwe": "1. Root Cause:\nFallow identified a code pattern susceptible to a security vulnerability cataloged in CWE (Common Weakness Enumeration), such as path traversal (CWE-22), injection, or unsafe input handling.\n\n2. Diagnosis:\nRun \"npm run auditor:fallow:security\" to inspect the CWE identifier and vulnerability risk vector.\n\n3. Canonical Solution:\n1. For user input validation, implement strict typed schemas with Valibot or domain types.\n2. For path containment (CWE-22), always use \"path.resolve()\" + \"path.relative()\" from node:path.\n3. Sanitize and escape arguments before interpolating into commands or queries.\n\n4. Example / Auto-fix command:\n  npm run auditor:fallow:security"
};
const FALLOW_RULE_REMEDIATION_PHASES = {
	"fallow-unused-files": "prune",
	"fallow-unused-exports": "prune",
	"fallow-unused-dependencies": "prune",
	"fallow-duplicate-code": "dedup",
	"fallow-triplicate-code": "dedup",
	"fallow-boundary-violations": "contracts",
	"fallow-security-cwe": "behavior",
	"fallow-refactoring-targets": "hygiene",
	"fallow-circular-dependencies": "hygiene",
	"fallow-stale-suppressions": "hygiene",
	"fallow-workspace-diagnostic": "setup"
};
const FALLOW_CRITICAL_PRIORITY_THRESHOLD = 30;
const FALLOW_HIGH_PRIORITY_THRESHOLD = 20;
const FALLOW_MEDIUM_PRIORITY_THRESHOLD = 10;
const FALLOW_MODERATE_PRIORITY_THRESHOLD = 10;
const FALLOW_LOW_PRIORITY_THRESHOLD = 5;
const FALLOW_ALL_PRIORITY_THRESHOLD = 1;
const FALLOW_PRIORITY_MIN_THRESHOLDS = {
	critical: 30,
	high: 20,
	medium: 10,
	moderate: 10,
	low: 5,
	all: 1
};
function resolveFallowTargetMinThreshold(priority) {
	if (typeof priority === "number") return Number.isFinite(priority) ? Math.max(0, priority) : 20;
	if (typeof priority === "string" && priority in FALLOW_PRIORITY_MIN_THRESHOLDS) return FALLOW_PRIORITY_MIN_THRESHOLDS[priority];
	return 20;
}
const FALLOW_DUPES_CONFIG = ["--min-occurrences", "2"];
const FALLOW_TRIPLETS_CONFIG = [
	"--min-occurrences",
	"3",
	"--min-lines",
	"10",
	"--min-tokens",
	"60"
];
function mapCloneFindings(cloneGroups, isTriplets, projectRoot) {
	const findings = [];
	const ruleId = isTriplets ? "fallow-triplicate-code" : "fallow-duplicate-code";
	const label = isTriplets ? "Critical triplicate code detected by Fallow" : "Duplicate code detected by Fallow";
	const context = isTriplets ? "fallow-triplets" : "fallow-dupes";
	for (const group of cloneGroups || []) {
		const tokens = group.token_count ?? group.duplicated_tokens ?? 0;
		for (const inst of group.instances || []) findings.push({
			file: path.resolve(projectRoot, inst.file),
			line: inst.start_line,
			message: `${label} (${tokens} tokens)`,
			context,
			ruleId,
			severity: "error"
		});
	}
	return findings;
}
function mapSecurityFindings(findings, projectRoot) {
	const res = [];
	for (const f of findings || []) {
		if (isCliPath(f.path)) continue;
		res.push({
			file: path.resolve(projectRoot, f.path),
			line: f.line || 1,
			message: `Fallow security vulnerability: ${f.message || f.rule_id || "CWE Sink"}`,
			context: f.rule_id || "cwe",
			ruleId: "fallow-security-cwe",
			severity: "error"
		});
	}
	return res;
}
function mapUnusedFileFindings(files, projectRoot) {
	return (files || []).map((f) => ({
		file: path.resolve(projectRoot, f.path),
		line: 1,
		message: `Orphan unused file (Fallow Dead Code): '${f.path}'`,
		context: f.path,
		ruleId: "fallow-unused-files",
		severity: "error"
	}));
}
function mapUnusedExportFindings(exports, projectRoot) {
	return (exports || []).map((x) => ({
		file: path.resolve(projectRoot, x.path),
		line: x.line || 1,
		message: `Unused export (Fallow): '${x.export_name}'`,
		context: x.export_name,
		ruleId: "fallow-unused-exports",
		severity: "error"
	}));
}
function mapUnusedDepFindings(deps, projectRoot) {
	return (deps || []).map((d) => ({
		file: path.resolve(projectRoot, d.path || "package.json"),
		line: d.line || 1,
		message: `Unused dependency in package.json (Fallow): '${d.package_name}'`,
		context: d.package_name,
		ruleId: "fallow-unused-dependencies",
		severity: "error"
	}));
}
function mapCircularDepFindings(circulars, projectRoot) {
	return (circulars || []).map((c) => {
		const filesList = c.files || c.cycle || [];
		const filePath = c.path || filesList[0] || "src";
		return {
			file: path.resolve(projectRoot, filePath),
			line: c.line || 1,
			message: `Critical circular dependency (Fallow): ${filesList.join(" → ") || c.message || filePath}`,
			context: filePath,
			ruleId: "fallow-circular-dependencies",
			severity: "error"
		};
	});
}
function mapBoundaryFindings(boundaries, projectRoot) {
	return (boundaries || []).map((b) => ({
		file: path.resolve(projectRoot, b.path),
		line: b.line || 1,
		message: `Architectural boundary violation (Fallow): ${b.message}`,
		context: b.message,
		ruleId: "fallow-boundary-violations",
		severity: "error"
	}));
}
function mapStaleSuppressions(suppressions, projectRoot) {
	const findings = [];
	for (const s of suppressions || []) {
		if (s.origin?.issue_kind?.startsWith("cwe-") || s.origin?.kind_known === false) continue;
		findings.push({
			file: path.resolve(projectRoot, s.path || s.file || "src"),
			line: s.line || 1,
			message: `Stale Fallow suppression: ${s.message || s.kind || ""}`,
			context: s.path || s.file || "",
			ruleId: "fallow-stale-suppressions",
			severity: "error"
		});
	}
	return findings;
}
function mapWorkspaceDiagFindings(diagnostics, projectRoot) {
	const findings = [];
	for (const diag of diagnostics || []) {
		if (diag.kind === "boundaries-not-configured" || diag.kind === "rule-packs-not-configured") continue;
		findings.push({
			file: path.resolve(projectRoot, diag.path || "package.json"),
			line: 1,
			message: `Workspace diagnostic (Fallow): [${diag.kind || "diagnostic"}] ${diag.message || ""}`,
			context: diag.kind || "diagnostic",
			ruleId: "fallow-workspace-diagnostic",
			severity: "error"
		});
	}
	return findings;
}
function mapDeadCodeFindings(data, projectRoot) {
	const dc = data.dead_code || data;
	const allDeps = [...dc.unused_dependencies || [], ...dc.unused_dev_dependencies || []];
	return [
		...mapUnusedFileFindings(dc.unused_files, projectRoot),
		...mapUnusedExportFindings(dc.unused_exports, projectRoot),
		...mapUnusedDepFindings(allDeps, projectRoot),
		...mapCircularDepFindings(dc.circular_dependencies, projectRoot),
		...mapBoundaryFindings(data.boundary_violations, projectRoot),
		...mapStaleSuppressions(dc.stale_suppressions, projectRoot),
		...mapWorkspaceDiagFindings(dc.workspace_diagnostics, projectRoot)
	];
}
function mapHealthFindings(data, projectRoot) {
	const findings = [];
	const cfg = getAuditConfig(projectRoot);
	if (cfg.fallow?.enforceTargets) {
		const minThreshold = resolveFallowTargetMinThreshold(cfg.fallow.maxTargetPriority);
		for (const t of data.targets || []) {
			const priority = t.priority ?? 0;
			if (priority < minThreshold) continue;
			findings.push({
				file: path.resolve(projectRoot, t.path),
				line: 1,
				message: `Critical refactoring target (Fallow [priority: ${priority}]): ${t.recommendation || t.category || "Critical maintenance"}`,
				context: t.category || "refactoring-target",
				ruleId: "fallow-refactoring-targets",
				severity: "error"
			});
		}
	}
	return findings;
}
function mapFallowJson(command, data, projectRoot = process.cwd()) {
	if (command === "dupes") return mapCloneFindings(data.clone_groups, false, projectRoot);
	if (command === "triplets") return mapCloneFindings(data.clone_groups, true, projectRoot);
	if (command === "security") return mapSecurityFindings(data.findings, projectRoot);
	if (command === "dead-code") return mapDeadCodeFindings(data, projectRoot);
	if (command === "health") return mapHealthFindings(data, projectRoot);
	if (command === "audit") return [...mapDeadCodeFindings(data, projectRoot), ...mapHealthFindings(data, projectRoot)];
	return [];
}
function tryParseFallowJson(raw) {
	if (!raw) return null;
	const str = typeof raw === "string" ? raw : raw.toString("utf8");
	const start = str.indexOf("{");
	if (start === -1) return null;
	try {
		return JSON.parse(str.substring(start));
	} catch {
		return null;
	}
}
var FallowArchitectureAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const projectRoot = options.projectRoot ?? process.cwd();
		const codeRoots = getAuditConfig(projectRoot).paths?.codeRoots ?? DEFAULT_AUDIT_CONFIG.paths.codeRoots;
		super({
			usesThirdPartyTool: true,
			requiredPermissions: ["--allow-child-process"],
			thirdPartyToolPolicy: {
				toolName: "Fallow",
				fallbackBehavior: "violation",
				fallbackRuleId: "fallow-workspace-diagnostic"
			},
			ruleCapabilities: FALLOW_RULE_CAPABILITIES,
			id: "validate_fallow",
			name: "Fallow Architecture & Refactoring Targets",
			description: "Audits dead code, targets, and CWE with Fallow",
			family: "architecture",
			packageName: "Fallow",
			configKey: "fallow",
			defaultConfig: {
				enabled: true,
				typeAware: true,
				showCascade: true,
				duplicates: {
					nearMiss: true,
					mode: "strict"
				},
				viz: {
					enabled: true,
					outputPath: "scratch/fallow_map.html"
				}
			},
			criticalConfig: {},
			icon: "🌾",
			ruleIds: FALLOW_RULES,
			ruleDescriptions: FALLOW_RULE_DESCRIPTIONS,
			ruleRemediations: FALLOW_RULE_REMEDIATIONS,
			ruleRemediationPhases: FALLOW_RULE_REMEDIATION_PHASES,
			coverage: {
				include: deriveCoverageFromRoots(codeRoots, /* @__PURE__ */ new Set([
					".ts",
					".js",
					".vue"
				]), projectRoot).include,
				source: "declared-only"
			},
			projectRoot
		});
	}
	handleParsedFallowOutput(parsed, primaryRule, command) {
		if (!parsed) return null;
		if (typeof parsed.elapsed_ms === "number") this.reportRuleDuration(primaryRule, parsed.elapsed_ms);
		return mapFallowJson(command, parsed, this.projectRoot);
	}
	runFallowSubCommand(command, extraArgs = [], associatedRules = []) {
		const fallowBin = resolveFallowBinary(this.projectRoot);
		if (!fallowBin) return [];
		const args = [
			"--format",
			"json",
			...extraArgs
		];
		const cmd = `node "${fallowBin}" ${command === "triplets" ? "dupes" : command} ${args.join(" ")}`;
		const primaryRule = associatedRules[0] ?? "fallow-workspace-diagnostic";
		return this.runSubAuditorSync(primaryRule, () => {
			try {
				const stdout = execSync(cmd, {
					cwd: this.projectRoot,
					encoding: "utf8",
					stdio: [
						"pipe",
						"pipe",
						"ignore"
					],
					maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
				});
				const mapped = this.handleParsedFallowOutput(tryParseFallowJson(stdout), primaryRule, command);
				if (mapped) return mapped;
				if (stdout && stdout.trim().length > 0) this.addViolation({
					ruleId: "fallow-workspace-diagnostic",
					severity: "error",
					file: "fallow",
					line: 1,
					message: `Unexpected non-JSON output from fallow ${command}: ${stdout.trim().slice(0, 300)}`,
					context: `fallow ${command}`
				});
			} catch (e) {
				const err = e;
				const mapped = this.handleParsedFallowOutput(tryParseFallowJson(err.stdout), primaryRule, command);
				if (mapped) return mapped;
				this.addViolation({
					ruleId: "fallow-workspace-diagnostic",
					severity: "error",
					file: "fallow",
					line: 1,
					message: `Error executing fallow ${command}: ${err.message || String(e)}`,
					context: `fallow ${command}`
				});
			}
			return [];
		});
	}
	async runAudit() {
		if (this.isSuiteGatingDisabled("Fallow disabled in configuration")) return;
		for (const rule of FALLOW_RULES) if (this.isRuleActiveForCurrentRun(rule)) this.markRuleEvaluated(rule);
		else this.markRuleNotApplicable(rule, `Skipped in tier '${this.getExecutionTier()}'`);
		this.recordExternalScanCount(1);
		const config = getAuditConfig(this.projectRoot);
		const allFindings = [];
		const deadCodeProfile = {
			command: "fallow dead-code",
			profiles: {
				light: ["--no-type-aware"],
				full: (() => {
					const args = [];
					if (config.fallow?.typeAware !== false && fs.existsSync(path.resolve(this.projectRoot, "tsconfig.json"))) args.push("--type-aware");
					if (config.fallow?.showCascade !== false) args.push("--show-cascade");
					return args;
				})()
			},
			defaultArgs: ["--no-type-aware"]
		};
		const deadCodeArgs = this.resolveCommandArgs(deadCodeProfile);
		const deadCodeRules = [
			"fallow-unused-exports",
			"fallow-unused-files",
			"fallow-boundary-violations",
			"fallow-stale-suppressions",
			"fallow-workspace-diagnostic"
		];
		const executeFallowSecurity = () => {
			if (!this.isRuleActiveForCurrentRun("fallow-security-cwe")) return;
			if ((config.fallow?.security?.enabled ?? config.security?.enabled ?? true) !== false) allFindings.push(...this.runFallowSubCommand("security", [], ["fallow-security-cwe"]));
			else this.markRuleNotApplicable("fallow-security-cwe", "Disabled in config (fallow.security.enabled: false)");
		};
		if (this.isRuleActiveForCurrentRun("fallow-duplicate-code")) {
			const dupesArgs = [...FALLOW_DUPES_CONFIG];
			if (config.fallow?.duplicates?.nearMiss !== false) dupesArgs.push("--dupes-near");
			if (config.fallow?.duplicates?.mode) dupesArgs.push("--dupes-mode", config.fallow.duplicates.mode);
			allFindings.push(...this.runFallowSubCommand("dupes", dupesArgs, ["fallow-duplicate-code"]));
		}
		if (this.isRuleActiveForCurrentRun("fallow-triplicate-code")) allFindings.push(...this.runFallowSubCommand("triplets", FALLOW_TRIPLETS_CONFIG, ["fallow-triplicate-code"]));
		executeFallowSecurity();
		if (deadCodeRules.some((r) => this.isRuleActiveForCurrentRun(r))) {
			const deadCode = this.runFallowSubCommand("dead-code", deadCodeArgs, deadCodeRules);
			allFindings.push(...deadCode.filter((f) => this.isRuleActiveForCurrentRun(f.ruleId)));
		}
		const healthRules = [
			"fallow-refactoring-targets",
			"fallow-circular-dependencies",
			"fallow-unused-dependencies"
		];
		if (healthRules.some((r) => this.isRuleActiveForCurrentRun(r))) {
			const healthArgs = ["--targets", "--report-only"];
			const covPath = path.resolve(this.projectRoot, "coverage/coverage-final.json");
			if (fs.existsSync(covPath)) healthArgs.push("--coverage", "coverage/coverage-final.json");
			const healthFindings = this.runFallowSubCommand("health", healthArgs, healthRules);
			allFindings.push(...healthFindings.filter((f) => this.isRuleActiveForCurrentRun(f.ruleId)));
		}
		for (const f of allFindings) {
			const relPath = toPosixRelative(this.projectRoot, f.file);
			this.recordScanned(relPath);
			this.addViolation({
				ruleId: f.ruleId,
				ruleDescription: FALLOW_RULE_DESCRIPTIONS[f.ruleId],
				severity: f.severity,
				file: relPath,
				line: f.line,
				message: f.message,
				context: f.context
			});
		}
		this.ensureSubAuditorsLogged();
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new FallowArchitectureAuditor());
export { FALLOW_ALL_PRIORITY_THRESHOLD, FALLOW_CRITICAL_PRIORITY_THRESHOLD, FALLOW_HIGH_PRIORITY_THRESHOLD, FALLOW_LOW_PRIORITY_THRESHOLD, FALLOW_MEDIUM_PRIORITY_THRESHOLD, FALLOW_MODERATE_PRIORITY_THRESHOLD, FALLOW_PRIORITY_MIN_THRESHOLDS, FALLOW_RULES, FALLOW_RULE_CAPABILITIES, FALLOW_RULE_DESCRIPTIONS, FALLOW_RULE_REMEDIATIONS, FALLOW_RULE_REMEDIATION_PHASES, FallowArchitectureAuditor, mapFallowJson, resolveFallowTargetMinThreshold };
