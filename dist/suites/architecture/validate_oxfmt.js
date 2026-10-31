import { normalizePosixPath } from "../../core/reportUtils.js";
import { executeNodeCli, resolvePackageBin } from "../../cli/cliUtils.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { getVitePlusDefaultExcludeGlobs } from "../../core/vitePlusConfigSync.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
// src/suites/architecture/validate_oxfmt.ts
/**
* src/suites/architecture/validate_oxfmt.ts
*
* OXFMT & VITE+ CODE FORMATTING HYGIENE AUDITOR (Node.js 26+ Native)
*
* Validates project-wide source code formatting hygiene using Oxfmt via Vite+ (`vp fmt`).
* In check mode, detects files with formatting deviations.
* In fix mode (`auditor fix` or `auditor:fix`), automatically formats the files according
* to the canonical format options configured in `audit.config.ts` and `vite.config.ts`.
*
* Usage:
*   node src/suites/architecture/validate_oxfmt.ts
*   vp fmt --check
*/
enableCompileCache();
const OXFMT_RULES = ["oxfmt-violation"];
function stripAnsiEscapes(text) {
	const esc = String.fromCharCode(27);
	if (!text.includes(esc)) return text;
	return text.replaceAll(new RegExp(`${esc}\\[[0-9;]*[a-zA-Z]`, "g"), "");
}
const MAX_BUFFER_BYTES = 52428800;
const EXECUTION_TIMEOUT_MS = 0;
async function fixOxfmt(context) {
	const vpBin = resolvePackageBin("vite-plus", {
		projectRoot: context.projectRoot,
		fallbackRelativeBin: "bin/vp"
	}) ?? path.resolve(context.projectRoot, "node_modules/vite-plus/bin/vp");
	try {
		executeNodeCli(vpBin, ["fmt"], {
			cwd: context.projectRoot,
			maxBuffer: MAX_BUFFER_BYTES,
			timeout: EXECUTION_TIMEOUT_MS
		});
		return true;
	} catch {
		return false;
	}
}
const OXFMT_FIXERS = { "oxfmt-violation": fixOxfmt };
var OxfmtAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const effectiveRoot = options.projectRoot || process.cwd();
		super({
			ruleFixers: OXFMT_FIXERS,
			usesThirdPartyTool: true,
			requiredPermissions: ["--allow-child-process"],
			thirdPartyToolPolicy: {
				toolName: "Vite+ Oxfmt",
				fallbackBehavior: "violation",
				fallbackRuleId: "oxfmt-violation"
			},
			ruleCapabilities: createRuleCapabilities(OXFMT_RULES, {
				speed: "light",
				phase: "normal",
				md: false,
				ast: false,
				changedOnly: false,
				critical: true
			}),
			id: "validate_oxfmt",
			name: "Vite+ Oxfmt Code Formatting Validator",
			description: "Validates code formatting with Vite+ Oxfmt",
			family: "architecture",
			packageName: "Oxfmt",
			configKey: "oxfmt.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "✨",
			ruleIds: OXFMT_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(OXFMT_RULES, "polish"),
			ruleDescriptions: { "oxfmt-violation": "Code format deviation" },
			ruleRemediations: { "oxfmt-violation": "1. Root Cause:\nThe file deviates from the canonical code formatting style governed by Oxfmt (Vite+).\nOxfmt enforces indentation, quotes, semicolons, import sorting (\"sortImports\"), and package.json key sorting (\"sortPackageJson\") at Rust-native speeds.\n\n2. Diagnosis:\nThe formatting linter detected stylistic differences between the file on disk and the canonical formatting specification.\n\n3. Canonical Solution:\n1. Run \"npm run fmt\" or \"vp fmt\" to reformat the entire repository automatically.\n2. Alternatively, run \"npm run auditor:fix\" or \"auditor fix\", which executes a deterministic final Oxfmt pass.\n\n4. Example / Auto-fix command:\nnpm run fmt" },
			coverage: {
				include: ["**/*.{js,ts,mjs,cjs,vue,json,md,css,scss}"],
				exclude: getVitePlusDefaultExcludeGlobs(effectiveRoot),
				source: "declared-only"
			},
			projectRoot: effectiveRoot
		});
	}
	async runAudit() {
		const excludeGlobs = getVitePlusDefaultExcludeGlobs(this.projectRoot);
		this.redeclareCoverage({
			include: ["**/*.{js,ts,mjs,cjs,vue,json,md,css,scss}"],
			exclude: excludeGlobs,
			source: "declared-only"
		});
		const isFixMode = this.isFixActive();
		const vpBin = resolvePackageBin("vite-plus", {
			projectRoot: this.projectRoot,
			fallbackRelativeBin: "bin/vp"
		}) ?? path.resolve(this.projectRoot, "node_modules/vite-plus/bin/vp");
		if (isFixMode) executeNodeCli(vpBin, ["fmt"], {
			cwd: this.projectRoot,
			maxBuffer: MAX_BUFFER_BYTES,
			timeout: EXECUTION_TIMEOUT_MS
		});
		const checkOutput = executeNodeCli(vpBin, ["fmt", "--list-different"], {
			cwd: this.projectRoot,
			maxBuffer: MAX_BUFFER_BYTES,
			timeout: EXECUTION_TIMEOUT_MS
		});
		this.recordExternalScanCount(1);
		const rawLines = checkOutput.split(/\r?\n/);
		let violationsCount = 0;
		await this.runSubAuditor("oxfmt-violation", async () => {
			for (const rawLine of rawLines) {
				const line = rawLine.trim();
				if (!line) continue;
				const plainLine = stripAnsiEscapes(line).trim();
				if (!plainLine || plainLine.startsWith("(node:") || plainLine.startsWith("[WARN]") || plainLine.startsWith("ExperimentalWarning") || plainLine.includes("permission") || plainLine.startsWith("error:") || plainLine.startsWith("warn:") || plainLine.includes("Package not found") || plainLine.includes("Finished in")) continue;
				let fullCandidate = path.isAbsolute(plainLine) ? plainLine : path.resolve(this.projectRoot, plainLine);
				if (!fs.existsSync(fullCandidate)) {
					const fromCwd = path.resolve(process.cwd(), plainLine);
					if (fs.existsSync(fromCwd)) fullCandidate = fromCwd;
				}
				let exists;
				try {
					exists = fs.existsSync(fullCandidate) && fs.statSync(fullCandidate).isFile();
				} catch {
					exists = false;
				}
				if (!exists) continue;
				const cleanFile = normalizePosixPath(fullCandidate, this.projectRoot);
				if (this.isPathIgnored(cleanFile) || this.isPathExempt(cleanFile)) continue;
				violationsCount++;
				this.addViolation({
					ruleId: "oxfmt-violation",
					severity: "error",
					file: cleanFile,
					line: 1,
					col: 1,
					context: "oxfmt",
					message: `File ${cleanFile} does not match canonical Oxfmt formatting. Run 'npm run fmt' or 'auditor fix'.`,
					fixable: !isFixMode
				});
			}
		});
		this.context.setMetric("oxfmt_violations", violationsCount);
		this.context.setMetric("mode", isFixMode ? "fix" : "check");
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new OxfmtAuditor());
export { OXFMT_RULES, OxfmtAuditor, fixOxfmt };
