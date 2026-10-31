import { BaseEntityRegistry } from "./baseRegistry.js";
// src/core/packageScriptRegistry.ts
const CORE_PACKAGE_SCRIPT_REQUIREMENTS = [
	{
		name: "auditor",
		command: "auditor",
		description: "Execute static analysis and architecture audit engine (default speed cap: speed=heavy)",
		category: "core"
	},
	{
		name: "auditor:fix",
		command: "auditor fix",
		description: "Mechanical auto-fix and configuration scaffolding mode",
		category: "core"
	},
	{
		name: "auditor:human",
		command: "auditor human",
		description: "Interactive human console audit with Box-Drawing tables and live telemetry",
		category: "core"
	},
	{
		name: "auditor:lint:human",
		command: "auditor speed=light human",
		description: "Fast linter audit in interactive human Box-Drawing console mode",
		category: "core"
	},
	{
		name: "auditor:full:human",
		command: "auditor speed=full human",
		description: "Exhaustive pre-build audit in interactive human Box-Drawing console mode",
		category: "core"
	},
	{
		name: "auditor:fix:human",
		command: "auditor fix human",
		description: "Mechanical auto-fix mode with interactive human Box-Drawing console output",
		category: "core"
	},
	{
		name: "auditor:findings:human",
		command: "auditor-findings human",
		description: "Inspect latest audit findings in interactive human Box-Drawing console mode",
		category: "reporting"
	},
	{
		name: "auditor:next:human",
		command: "auditor-findings next human",
		description: "Inspect most critical unresolved remediation phase in interactive human Box-Drawing mode",
		category: "reporting"
	},
	{
		name: "auditor:help",
		command: "auditor --help",
		description: "Catalog of help commands, options, and specialized remediation tools",
		category: "core"
	},
	{
		name: "auditor:guide",
		command: "auditor guide",
		description: "Step-by-step architectural rule remediation manuals (usage: npm run auditor:guide -- <rule>)",
		category: "core"
	},
	{
		name: "auditor:by-file",
		command: "auditor-by-file",
		description: "Detailed breakdown of findings sorted by file and line",
		category: "reporting"
	},
	{
		name: "auditor:lint",
		command: "auditor speed=light",
		description: "Fast linter and static analysis audit (speed cap: speed=light)",
		category: "core"
	},
	{
		name: "auditor:critical",
		command: "auditor critical",
		description: "Exclusive execution of critical code, typing, and syntax suites (speed bypass)",
		category: "core"
	},
	{
		name: "auditor:md",
		command: "auditor preset=md",
		description: "Fast documentation and markdown preset (relative links and DOX indices)",
		category: "core"
	},
	{
		name: "auditor:full",
		command: "auditor speed=full",
		description: "Exhaustive pre-build audit with speed cap speed=full (includes fallow dead-code --type-aware)",
		category: "core"
	},
	{
		name: "auditor:post-build",
		command: "auditor phase=post-build",
		description: "Post-compilation validation on distributed artifacts in dist/",
		category: "core"
	},
	{
		name: "build:deploy",
		command: "auditor-build-deploy",
		description: "CI/CD deployment build under AUDITOR_ENV=production (skips similar-code and coverage)",
		category: "core"
	},
	{
		name: "auditor:changed",
		command: "auditor changed-since=main",
		description: "Incremental audit scoped to changes against main branch",
		category: "core"
	},
	{
		name: "test:coverage",
		command: "vp test --coverage",
		description: "Unit test execution with coverage report generation in scratch/coverage/",
		category: "core"
	},
	{
		name: "auditor:update",
		command: "auditor-update",
		description: "Automatic update and synchronization of @francogp/auditor package",
		category: "lifecycle"
	},
	{
		name: "auditor:version",
		command: "auditor-version",
		description: "Auditor engine version inspection and diagnosis",
		category: "lifecycle"
	},
	{
		name: "version:analyze",
		command: "auditor-version analyze",
		description: "Static change analysis and semantic version bump calculation",
		category: "versioning"
	},
	{
		name: "version:bump",
		command: "auditor-version bump",
		description: "Atomic version increment in package.json and historical commit",
		category: "versioning"
	},
	{
		name: "auditor:next",
		command: "auditor-findings next",
		description: "Immediate focus on findings in the most critical unresolved remediation phase",
		category: "reporting"
	},
	{
		name: "auditor:findings",
		command: "auditor-findings",
		description: "Findings viewer in 80-column Box-Drawing format",
		category: "reporting"
	},
	{
		name: "auditor:errors",
		command: "auditor-findings severity=error",
		description: "Findings filter exclusive to blocking errors",
		category: "reporting"
	},
	{
		name: "auditor:warnings",
		command: "auditor-findings severity=warning",
		description: "Findings filter exclusive to technical debt warnings",
		category: "reporting"
	},
	{
		name: "auditor:summary",
		command: "auditor-findings",
		description: "Consolidated summary of metrics and violations from latest audit",
		category: "reporting"
	},
	{
		name: "auditor:files",
		command: "auditor-findings files",
		description: "Consolidated list of files with architecture violations",
		category: "reporting"
	},
	{
		name: "auditor:rules",
		command: "auditor-findings rules",
		description: "Consolidated breakdown of violations grouped and sorted by rule",
		category: "reporting"
	},
	{
		name: "auditor:by-rule",
		command: "auditor-findings by-rule",
		description: "Consolidated breakdown of violations grouped and sorted by rule",
		category: "reporting"
	},
	{
		name: "auditor:complexity",
		command: "auditor-complexity",
		description: "Cyclomatic complexity diagnosis and Fallow refactoring targets",
		category: "reporting"
	},
	{
		name: "auditor:similar",
		command: "auditor-similar",
		description: "Semantic duplicate code detection via Candle CPU vectors",
		category: "reporting",
		isApplicable: (config) => config.fallow?.similarCode?.enabled !== false
	},
	{
		name: "auditor:review",
		command: "auditor-review",
		description: "Architectural review of diffs against Fallow static graph",
		category: "reporting"
	},
	{
		name: "auditor:guard",
		command: "auditor-guard",
		description: "Sanity control gate and regression barrier",
		category: "reporting"
	},
	{
		name: "auditor:flags",
		command: "auditor-flags",
		description: "Feature flags and conditional dead-code audit",
		category: "reporting"
	},
	{
		name: "auditor:coverage-gaps",
		command: "auditor-fallow category=coverage-gaps",
		description: "Coverage gaps and unexecuted code detected by Fallow",
		category: "reporting"
	},
	{
		name: "auditor:dupes",
		command: "auditor-dupes",
		description: "Deterministic refactoring and deduplication of syntactic code and clones",
		category: "reporting",
		permissions: ["--allow-addons"]
	},
	{
		name: "auditor:magic",
		command: "auditor-magic",
		description: "Magic numbers remediation and Super-Dirac extraction to design tokens",
		category: "reporting"
	},
	{
		name: "auditor:motion",
		command: "auditor-motion",
		description: "UI animation governance, timer migration, and GPU transforms",
		category: "reporting"
	},
	{
		name: "auditor:o1",
		command: "auditor-o1",
		description: "Algorithmic optimization of linear lookups and O(1) modernization",
		category: "reporting"
	},
	{
		name: "auditor:types",
		command: "auditor-types",
		description: "Deterministic remediation of as any, double assertions, and return contracts",
		category: "reporting"
	},
	{
		name: "auditor:domain",
		command: "auditor-domain",
		description: "Deterministic remediation of raw strings, mutable catalogs, and unbranded IDs",
		category: "reporting"
	},
	{
		name: "auditor:hygiene",
		command: "auditor-hygiene",
		description: "Deterministic remediation of member accessibility, globalThis, and void expressions",
		category: "reporting"
	},
	{
		name: "auditor:dependencies",
		command: "auditor-dependencies",
		description: "Inspection of minimum and maximum versions of approved libraries",
		category: "reporting"
	},
	{
		name: "auditor:fallow:dupes",
		command: "auditor-fallow category=dupes",
		description: "Syntactic duplicate code blocks detection via Fallow",
		category: "fallow",
		isApplicable: (config) => config.fallow?.enabled !== false
	},
	{
		name: "auditor:fallow:circular",
		command: "auditor-fallow category=circular",
		description: "Circular dependencies detection between modules via Fallow",
		category: "fallow",
		isApplicable: (config) => config.fallow?.enabled !== false
	},
	{
		name: "auditor:fallow:exports",
		command: "auditor-fallow category=exports",
		description: "Orphan exports and unimported symbols detection",
		category: "fallow",
		isApplicable: (config) => config.fallow?.enabled !== false
	},
	{
		name: "auditor:fallow:security",
		command: "auditor-fallow category=security",
		description: "Static vulnerability scanning and CWE security sinks",
		category: "fallow",
		isApplicable: (config) => config.fallow?.enabled !== false && config.fallow?.security?.enabled !== false
	},
	{
		name: "auditor:fallow:dead-code",
		command: "auditor-fallow category=dead-code",
		description: "Dead files and unreferenced code detection via Fallow",
		category: "fallow",
		isApplicable: (config) => config.fallow?.enabled !== false
	},
	{
		name: "auditor:fallow:boundaries",
		command: "auditor-fallow category=boundaries",
		description: "Architectural boundary violations detection via Fallow",
		category: "fallow",
		isApplicable: (config) => config.fallow?.enabled !== false
	},
	{
		name: "auditor:fallow:suppressions",
		command: "auditor-fallow category=suppressions",
		description: "Active fallow-ignore suppression markers audit",
		category: "fallow",
		isApplicable: (config) => config.fallow?.enabled !== false
	},
	{
		name: "auditor:fallow:flags",
		command: "auditor-fallow category=flags",
		description: "Feature flags and conditional code audit via Fallow",
		category: "fallow",
		isApplicable: (config) => config.fallow?.enabled !== false
	},
	{
		name: "auditor:fallow:viz",
		command: "auditor-fallow category=viz",
		description: "Interactive HTML architecture map generation via Fallow",
		category: "fallow",
		isApplicable: (config) => config.fallow?.enabled !== false
	},
	{
		name: "auditor:family:architecture",
		command: "auditor family=architecture",
		description: "Architecture family execution, AST standards, and Fallow",
		category: "family"
	},
	{
		name: "auditor:family:domain",
		command: "auditor family=domain_data",
		description: "Domain types and data structures family execution",
		category: "family",
		isApplicable: (config) => config.domain?.enabled !== false
	},
	{
		name: "auditor:family:persistence",
		command: "auditor family=persistence",
		description: "Persistence, SQL, and database migrations family execution",
		category: "family",
		isApplicable: (config) => config.persistence?.engine !== "none"
	},
	{
		name: "lint",
		command: "npm run auditor:lint",
		description: "Canonical linter alias delegating to auditor speed=light",
		category: "aliases"
	},
	{
		name: "lint:fix",
		command: "auditor speed=light fix",
		description: "Fast automatic remediation of linting violations",
		category: "aliases"
	},
	{
		name: "check",
		command: "vp check",
		description: "Static verification and comprehensive linting with Vite+ (Oxlint/Oxfmt)",
		category: "core",
		isApplicable: (config) => config.vitePlusConfig?.enabled !== false
	},
	{
		name: "check:fix",
		command: "vp check --fix",
		description: "Comprehensive auto-repair of syntax and typing rules with Vite+",
		category: "core",
		isApplicable: (config) => config.vitePlusConfig?.enabled !== false
	},
	{
		name: "fmt",
		command: "vp fmt",
		description: "Automatic code formatting across project via Oxfmt",
		category: "core",
		isApplicable: (config) => config.vitePlusConfig?.enabled !== false && config.vitePlusConfig?.fmt?.enabled !== false
	},
	{
		name: "fmt:check",
		command: "vp fmt --check",
		description: "Code formatting hygiene check without modifying files",
		category: "core",
		isApplicable: (config) => config.vitePlusConfig?.enabled !== false && config.vitePlusConfig?.fmt?.enabled !== false
	},
	{
		name: "auditor:oxfmt",
		command: "auditor task=validate_oxfmt",
		description: "Strict formatting audit and verification with Oxfmt",
		category: "core",
		isApplicable: (config) => config.vitePlusConfig?.enabled !== false && config.vitePlusConfig?.fmt?.enabled !== false && config.oxfmt?.enabled !== false
	}
];
var PackageScriptRegistryImpl = class extends BaseEntityRegistry {
	constructor() {
		super((req) => req?.name, (reg) => {
			for (const req of CORE_PACKAGE_SCRIPT_REQUIREMENTS) reg.register({
				...req,
				sourceId: "framework:core"
			});
		});
	}
	/**
	* Registers a single package script requirement with command collision verification.
	* Throws an explicit error if a script name collides with another registered command.
	*/
	register(requirement, sourceId) {
		if (!requirement || !requirement.name || !requirement.command) return;
		const existing = this.get(requirement.name);
		if (existing) {
			if (existing.command === requirement.command) return;
			throw new Error(`[COMMAND COLLISION] Script command '${requirement.name}' is duplicated between '${existing.sourceId ?? "core"}' ('${existing.command}') and '${sourceId ?? requirement.sourceId ?? "unknown"}' ('${requirement.command}'). Each sub-auditor and extension MUST declare unique command names in package.json. Rename the command to resolve the collision.`);
		}
		const item = sourceId ? {
			...requirement,
			sourceId
		} : requirement;
		super.register(item);
	}
	/**
	* Registers multiple package script requirements.
	*/
	registerMany(requirements, sourceId) {
		for (const req of requirements) this.register(req, sourceId);
	}
};
/**
* Universal singleton instance for PackageScriptRegistry.
* Inherits directly from BaseEntityRegistry to eliminate Middle Man delegation.
*/
const PackageScriptRegistry = new PackageScriptRegistryImpl();
/**
* Builds the canonical runner command for an AuditorPackageScriptRequirement,
* dynamically appending required runtime flags or permissions (e.g. --allow-addons) if specified.
*/
function buildCanonicalRunnerCommand(requirement) {
	let cmd = requirement.command;
	if (requirement.permissions && requirement.permissions.length > 0) {
		const flagsStr = requirement.permissions.join(" ");
		if (!cmd.includes(flagsStr)) cmd = `${cmd} ${flagsStr}`;
	}
	return cmd;
}
export { CORE_PACKAGE_SCRIPT_REQUIREMENTS, PackageScriptRegistry, PackageScriptRegistryImpl, buildCanonicalRunnerCommand };
