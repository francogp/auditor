import { DEFAULT_AUDIT_CONFIG } from "../../core/auditConfigDefaults.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { toPosixRelative } from "../../core/safePath.js";
import "../../core/auditConfig.js";
import "../../core/auditCoverage.js";
import { AuditedDocument } from "../../core/auditedDocument.js";
import { BaseAuditor, FileScanAuditor, SCANNABLE_EXTENSIONS, assertSafePathComponent, collectRepositoryFiles, createRuleCapabilities, resolveFileScanRoots } from "../../core/auditorBase.js";
import { getPackageJson, writePackageJson } from "../../core/packageJson.js";
import { CLI_CONTRACT_RULES } from "../../analyzers/cliContracts/cliContractTypes.js";
import { scanCliContractAst } from "../../analyzers/cliContracts/cliContractScanner.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
// src/suites/architecture/validate_cli_contracts.ts
/**
* src/suites/architecture/validate_cli_contracts.ts
*
* CLI CONTRACTS & CITTY GOVERNANCE AUDITOR (Node.js 26+ Native, TypeScript AST)
*
* Enforces declarative CLI contracts powered by `citty` across all repository CLI tools
* and prohibits homebrew command-line argument parsing:
*   1. `cli-contracts-direct-argv-access`: raw `process.argv`, `process['argv']`, destructuring, aliases, `Deno.args`, `Bun.argv`.
*   2. `cli-contracts-banned-parser-library`: unauthorized CLI parsers (`minimist`, `yargs`, `commander`, `cac`, `node:util.parseArgs`).
*   3. `cli-contracts-homebrew-flag-parsing`: manual flag heuristics (`startsWith('--')`, `includes('--flag')`, `BOOLEAN_FLAGS`, `args[0]`).
*   4. `cli-contracts-dynamic-eval-bypass`: dynamic bypasses (`eval`, `new Function`, `fs.readFileSync(0)`).
*   5. `cli-contracts-missing-citty-contract`: CLI entrypoints under `src/cli/` missing `defineCommand` / `createRefactorCli` / `createAuditorCli`.
*   6. `cli-contracts-unregistered-script`: missing `:human` script registrations in `CORE_PACKAGE_SCRIPT_REQUIREMENTS`.
*
* Usage:
*   npm run auditor -- task=validate_cli_contracts
*/
enableCompileCache();
/** Script extensions scanned by this suite. */
const CLI_CONTRACT_EXTENSIONS = /* @__PURE__ */ new Set([
	...SCANNABLE_EXTENSIONS,
	".tsx",
	".jsx"
]);
/**
* Scans in-memory source code for CLI contract violations using the TypeScript AST.
*/
function scanFileForCliContractViolations(filePath, content) {
	return scanCliContractAst(new AuditedDocument(filePath, content, filePath));
}
function initCliRuleCounters() {
	const counters = {};
	for (const ruleKey of CLI_CONTRACT_RULES) counters[ruleKey] = 0;
	return counters;
}
/**
* Full repository audit runner for CLI contracts and Citty governance.
*/
function auditCliContracts(targetDir = process.cwd()) {
	assertSafePathComponent(targetDir);
	const auditCfg = getAuditConfig(targetDir);
	const ignoredGlobs = [...auditCfg.paths?.ignoreGlobs ?? [], ...auditCfg.paths?.ignoredPatterns ?? []];
	const configuredRoots = auditCfg.paths?.codeRoots ?? DEFAULT_AUDIT_CONFIG.paths.codeRoots;
	const candidateFiles = [];
	for (const rootRel of configuredRoots) {
		const absRoot = path.resolve(targetDir, rootRel);
		if (fs.existsSync(absRoot)) candidateFiles.push(...collectRepositoryFiles(absRoot, targetDir, ignoredGlobs, CLI_CONTRACT_EXTENSIONS));
	}
	const countsByRule = initCliRuleCounters();
	const violations = [];
	for (const absFile of candidateFiles) {
		const posixRel = toPosixRelative(targetDir, absFile);
		let sourceText = "";
		try {
			sourceText = fs.readFileSync(absFile, "utf-8");
		} catch {
			continue;
		}
		const fileViolations = scanFileForCliContractViolations(posixRel, sourceText);
		for (const item of fileViolations) {
			violations.push(item);
			countsByRule[item.ruleId] += 1;
		}
	}
	return {
		filesScanned: candidateFiles.length,
		violations,
		passed: violations.length === 0,
		countsByRule
	};
}
const RULE_DESCRIPTIONS = {
	"cli-contracts-direct-argv-access": "Direct or indirect process.argv access",
	"cli-contracts-banned-parser-library": "Unauthorized CLI parser or parseArgs",
	"cli-contracts-homebrew-flag-parsing": "Homebrew CLI flag or subcommand parsing",
	"cli-contracts-dynamic-eval-bypass": "Dynamic eval or fd 0 stdin CLI bypass",
	"cli-contracts-missing-citty-contract": "CLI entrypoint missing Citty contract",
	"cli-contracts-missing-citty-dependency": "Missing citty in devDependencies",
	"cli-contracts-unregistered-script": "Missing :human script in registry"
};
const RULE_REMEDIATIONS = {
	"cli-contracts-direct-argv-access": "📖 REMEDIATION GUIDE: cli-contracts-direct-argv-access\n1. Root Cause: A module reads command-line arguments directly from the process runtime (`argv` property, computed index, destructuring, intermediate alias, or alternate runtime equivalents) instead of receiving typed arguments from the canonical Citty command definition.\n2. Diagnosis: Locate the AST node flagged in the report where the global process argument array is accessed or destructured.\n3. Canonical Solution: Define the CLI command with `defineCommand` from `citty` (or `createRefactorCli` / `createAuditorCli` from `src/core/cli/cittyHarness.ts`) and read typed parameters from `run({ args })`.\n4. Example:\n   ❌ Fragile: reading raw process argument indices manually\n   ✅ Canonical: `defineCommand({ args: { human: { type: \"boolean\" } }, run({ args }) { ... } })`",
	"cli-contracts-banned-parser-library": "📖 REMEDIATION GUIDE: cli-contracts-banned-parser-library\n1. Root Cause: A file imports or invokes an external third-party CLI parser (`minimist`, `yargs`, `commander`, `cac`, `mri`, `clipanion`) or calls `node:util` `parseArgs` directly outside the canonical Citty harness.\n2. Diagnosis: Inspect the flagged `import` declaration or parser invocation in the target file.\n3. Canonical Solution: Replace the ad-hoc parser import with `defineCommand` and `runMain` from `citty` or use `cittyHarness.ts`.\n4. Example:\n   ❌ Banned: importing legacy third-party or manual utility argument parsers\n   ✅ Canonical: `import { defineCommand, runMain } from \"citty\";`",
	"cli-contracts-homebrew-flag-parsing": "📖 REMEDIATION GUIDE: cli-contracts-homebrew-flag-parsing\n1. Root Cause: A CLI script manually inspects raw argument strings using prefix checks, array membership checks, boolean flag normalizers, or positional index switches, causing global flags like `human` to collide with subcommand names.\n2. Diagnosis: Locate the manual string prefix check, flag lookup, or positional index switch highlighted by the rule.\n3. Canonical Solution: Declare all boolean flags, string options, and `subCommands` (`discover`, `inspect`, `apply`) in `defineCommand` or `createRefactorCli`.\n4. Example:\n   ❌ Fragile: branching on the first positional element as a subcommand string\n   ✅ Canonical: `createRefactorCli({ toolName: \"auditor-motion\", ... })`",
	"cli-contracts-dynamic-eval-bypass": "📖 REMEDIATION GUIDE: cli-contracts-dynamic-eval-bypass\n1. Root Cause: Code executes dynamic strings or reads raw file descriptor `0` synchronously, bypassing static CLI argument contracts and security boundaries.\n2. Diagnosis: Locate the dynamic code evaluation or raw descriptor call reported on the line.\n3. Canonical Solution: Remove dynamic code execution and replace raw descriptor reads with explicit typed CLI arguments or file path options validated via `citty`.\n4. Example:\n   ❌ Unsafe: reading file descriptor zero or evaluating dynamic strings\n   ✅ Canonical: `args: { input: { type: \"string\", required: true } }`",
	"cli-contracts-missing-citty-contract": "📖 REMEDIATION GUIDE: cli-contracts-missing-citty-contract\n1. Root Cause: A standalone CLI executable under `src/cli/` defines `isMainModule` or a shebang entrypoint without declaring its command contract through `citty` (`defineCommand`, `createRefactorCli`, or `createAuditorCli`).\n2. Diagnosis: Open the reported `src/cli/*.ts` entrypoint and verify how its CLI execution is wired.\n3. Canonical Solution: Wrap the CLI entrypoint in `defineCommand` or `createAuditorCli` from `src/core/cli/cittyHarness.ts` and invoke `runCliMain`.\n4. Example:\n   ❌ Incomplete: running ad-hoc functions inside `isMainModule` without a Citty command schema\n   ✅ Canonical: `export const cliCommand = createAuditorCli({ ... });`",
	"cli-contracts-missing-citty-dependency": "📖 REMEDIATION GUIDE: cli-contracts-missing-citty-dependency\n1. Root Cause: The project defines CLI tools or scripts but omits `citty` from `package.json` (`devDependencies` or `dependencies`).\n2. Diagnosis: Inspect `package.json` to verify if `\"citty\"` is declared under `\"devDependencies\"` or `\"dependencies\"`.\n3. Canonical Solution: Add `\"citty\": \"^0.2.2\"` to `devDependencies` in `package.json` or run `npm run auditor:fix`.\n4. Example / Auto-fix command:\n   npm run auditor:fix",
	"cli-contracts-unregistered-script": "📖 REMEDIATION GUIDE: cli-contracts-unregistered-script\n1. Root Cause: `CORE_PACKAGE_SCRIPT_REQUIREMENTS` in `src/core/packageScriptRegistry.ts` omits one or more mandatory `:human` package scripts (`auditor:human`, `auditor:lint:human`, `auditor:full:human`, `auditor:fix:human`, `auditor:findings:human`).\n2. Diagnosis: Check the missing script names listed in the violation message against `CORE_PACKAGE_SCRIPT_REQUIREMENTS`.\n3. Canonical Solution: Register all 5 `:human` script requirements in `src/core/packageScriptRegistry.ts` and run `npm run auditor:fix`.\n4. Example:\n   ❌ Missing: omitting `:human` scripts from `CORE_PACKAGE_SCRIPT_REQUIREMENTS`\n   ✅ Canonical: `{ name: \"auditor:human\", command: \"auditor human\", description: \"...\", category: \"core\" }`"
};
const CLI_CONTRACT_REMEDIATION_PHASES = {
	"cli-contracts-missing-citty-dependency": "setup",
	"cli-contracts-unregistered-script": "setup",
	"cli-contracts-direct-argv-access": "contracts",
	"cli-contracts-banned-parser-library": "contracts",
	"cli-contracts-homebrew-flag-parsing": "contracts",
	"cli-contracts-dynamic-eval-bypass": "contracts",
	"cli-contracts-missing-citty-contract": "contracts"
};
var CliContractsAuditor = class extends FileScanAuditor {
	cliViolationsByDoc = /* @__PURE__ */ new WeakMap();
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, (cfg) => cfg.paths?.codeRoots ?? DEFAULT_AUDIT_CONFIG.paths.codeRoots);
		super({
			fix: options.fix,
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(CLI_CONTRACT_RULES, {
				speed: "light",
				phase: "setup",
				fix: "none",
				md: false,
				ast: true,
				changedOnly: false,
				critical: true
			}, ["cli-contracts-missing-citty-dependency"]),
			fixableRuleIds: ["cli-contracts-missing-citty-dependency"],
			id: "validate_cli_contracts",
			name: "CLI Contracts & Citty Governance Validator",
			description: "Enforces Citty CLI contracts and bans homebrew argv",
			family: "architecture",
			ruleIds: CLI_CONTRACT_RULES,
			ruleRemediationPhases: CLI_CONTRACT_REMEDIATION_PHASES,
			packageName: "CLI",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "⌨️",
			ruleDescriptions: RULE_DESCRIPTIONS,
			ruleRemediations: RULE_REMEDIATIONS,
			roots: targetRoots,
			allowedExtensions: CLI_CONTRACT_EXTENSIONS,
			projectRoot: effectiveRoot
		});
		for (const cliRuleId of CLI_CONTRACT_RULES) {
			if (cliRuleId === "cli-contracts-missing-citty-dependency") continue;
			this.declareFileSubAuditor(cliRuleId, (doc) => {
				const matches = this.getGroupedCliViolations(doc).get(cliRuleId);
				if (!matches) return;
				for (const match of matches) this.addViolation(match);
			});
		}
	}
	async runAudit(astContext) {
		await super.runAudit(astContext);
		this.checkCittyDependency();
	}
	checkCittyDependency() {
		this.runSubAuditorSync("cli-contracts-missing-citty-dependency", () => {
			const pkg = getPackageJson(this.projectRoot);
			if (!pkg) {
				this.markRuleNotApplicable("cli-contracts-missing-citty-dependency", "package.json not found");
				return;
			}
			if (!Boolean(pkg.devDependencies?.["citty"] || pkg.dependencies?.["citty"])) {
				if (this.isFixActive()) {
					const updatedPkg = {
						...pkg,
						devDependencies: {
							...pkg.devDependencies || {},
							citty: "^0.2.2"
						}
					};
					writePackageJson(this.projectRoot, updatedPkg);
				} else this.addViolation({
					ruleId: "cli-contracts-missing-citty-dependency",
					severity: "error",
					filePath: "package.json",
					line: 1,
					column: 1,
					message: "Missing 'citty' dependency in package.json. CLI commands and scripts require 'citty@^0.2.2' in devDependencies.",
					context: "\"devDependencies\": { ... }",
					fixable: true
				});
			}
		});
	}
	getGroupedCliViolations(doc) {
		const existing = this.cliViolationsByDoc.get(doc);
		if (existing) return existing;
		const grouped = /* @__PURE__ */ new Map();
		for (const item of scanCliContractAst(doc)) {
			const bucket = grouped.get(item.ruleId);
			if (bucket) bucket.push(item);
			else grouped.set(item.ruleId, [item]);
		}
		this.cliViolationsByDoc.set(doc, grouped);
		return grouped;
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new CliContractsAuditor());
export { CLI_CONTRACT_EXTENSIONS, CLI_CONTRACT_RULES, CliContractsAuditor, auditCliContracts, scanFileForCliContractViolations };
