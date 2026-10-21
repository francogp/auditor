import { BaseAuditor, createUniformRemediationPhases, createUniformRuleCapabilities } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/documentation/validate_markdown_lint_config.ts
/**
* src/suites/documentation/validate_markdown_lint_config.ts
*
* MARKDOWNLINT CONFIGURATION & MANDATORY BASELINE AUDITOR (Node.js 26+ Native)
*
* Enforces standardized documentation hygiene rules across .markdownlint.json:
*   1. Guarantees .markdownlint.json exists on disk; auto-scaffolds in --fix mode.
*   2. Guarantees valid JSON syntax without corruption.
*   3. Enforces standard documentation baseline:
*      - default: true
*      - MD033 allowed_elements: ["br"]
*      - MD024 siblings_only: true
*      - MD007 indent: 2
*      - MD013: false (no hard line length wrapping)
*/
enableCompileCache();
const MARKDOWNLINT_CONFIG_RULES = [
	"markdownlint-config-missing",
	"markdownlint-config-syntax",
	"markdownlint-config-missing-strict-rule"
];
const CANONICAL_MARKDOWNLINT_CONFIG = {
	default: true,
	MD013: false,
	MD060: false,
	MD033: { allowed_elements: ["br"] },
	MD024: { siblings_only: true },
	MD007: { indent: 2 }
};
const MARKDOWNLINT_CONFIG_REQUIREMENT = {
	id: "markdownlint-config",
	file: ".markdownlint.json",
	candidateFiles: [".markdownlint.json", ".markdownlint-cli2.jsonc"],
	description: "Standard markdownlint configuration for documentation",
	ruleId: "markdownlint-config-missing",
	generateDefaultContent: () => JSON.stringify(CANONICAL_MARKDOWNLINT_CONFIG, null, 2) + "\n"
};
var ValidateMarkdownLintConfigAuditor = class extends BaseAuditor {
	constructor(rootsOrOptions, maybeProjectRoot) {
		const optionsObj = rootsOrOptions && !Array.isArray(rootsOrOptions) ? rootsOrOptions : void 0;
		const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();
		const configRequirement = {
			...MARKDOWNLINT_CONFIG_REQUIREMENT,
			...optionsObj?.configFile ? {
				file: optionsObj.configFile,
				candidateFiles: [optionsObj.configFile]
			} : {}
		};
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createUniformRuleCapabilities(MARKDOWNLINT_CONFIG_RULES, {
				speed: "light",
				phase: "setup",
				fix: "priority",
				md: true,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			fixableRuleIds: ["markdownlint-config-missing", "markdownlint-config-missing-strict-rule"],
			configFiles: [configRequirement],
			id: "validate_markdown_lint_config",
			name: "Markdownlint Configuration Validator",
			description: "Validates markdownlint configuration baseline",
			icon: "📝",
			family: "documentation",
			ruleIds: MARKDOWNLINT_CONFIG_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(MARKDOWNLINT_CONFIG_RULES, "setup"),
			packageName: "Markdown",
			configKey: "documentation",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			ruleDescriptions: {
				"markdownlint-config-missing": "Missing .markdownlint.json file",
				"markdownlint-config-syntax": "Configuration syntax error",
				"markdownlint-config-missing-strict-rule": "Missing mandatory strict rule"
			},
			ruleRemediations: {
				"markdownlint-config-missing": "📖 REMEDIATION GUIDE: markdownlint-config-missing\n1. Root Cause: Canonical configuration file `.markdownlint.json` does not exist in repository root.\n2. Diagnosis: Check whether `.markdownlint.json` exists in project root.\n3. Canonical Solution: Run `npm run auditor:fix` to auto-scaffold canonical configuration with the strict baseline.\n4. Example / Auto-fix command:\n   - Run: `npm run auditor:fix` or `auditor fix`",
				"markdownlint-config-syntax": "📖 REMEDIATION GUIDE: markdownlint-config-syntax\n1. Root Cause: File `.markdownlint.json` contains JSON syntax errors (trailing commas, unclosed quotes, or corrupt format).\n2. Diagnosis: Open `.markdownlint.json` and validate syntax with a JSON parser.\n3. Canonical Solution: Correct trailing commas or missing quotes in `.markdownlint.json`.\n4. Example / Auto-fix command:\n   - Run: `npm run auditor:fix` or format `.markdownlint.json` with `vp run oxfmt`",
				"markdownlint-config-missing-strict-rule": "📖 REMEDIATION GUIDE: markdownlint-config-missing-strict-rule\n1. Root Cause: Missing mandatory strict baseline rules (MD033 with allowed_elements: [\"br\"], MD024 with siblings_only: true, etc.) in `.markdownlint.json`.\n2. Diagnosis: Compare `.markdownlint.json` against required rules from framework documentation standards.\n3. Canonical Solution: Restore strict baseline rules by running auditor mechanical auto-repair.\n4. Example / Auto-fix command:\n   - Run: `npm run auditor:fix` or `auditor fix`"
			},
			coverage: { include: [".markdownlint*"] },
			projectRoot,
			fix: optionsObj?.fix,
			...optionsObj
		});
	}
	async runAudit() {
		const isFix = this.isFixActive();
		let configFile = null;
		this.runSubAuditorSync("markdownlint-config-missing", () => {
			configFile = this.resolveConfigFile(MARKDOWNLINT_CONFIG_REQUIREMENT);
		});
		if (!configFile) {
			const ensured = await this.runSubAuditor("markdownlint-config-missing", () => this.ensureConfigFile(MARKDOWNLINT_CONFIG_REQUIREMENT));
			if (!ensured) {
				this.markRuleNotApplicable("markdownlint-config-syntax", "Missing .markdownlint.json file");
				this.markRuleNotApplicable("markdownlint-config-missing-strict-rule", "Missing .markdownlint.json file");
				return;
			}
			configFile = ensured.resolvedPath;
		}
		const resolvedPath = configFile;
		const relPath = path.relative(this.projectRoot, resolvedPath) || MARKDOWNLINT_CONFIG_REQUIREMENT.file;
		this.recordScanned(relPath);
		let rawContent;
		try {
			rawContent = fs.readFileSync(resolvedPath, "utf8");
		} catch {
			this.markRuleNotApplicable("markdownlint-config-syntax", "No se pudo leer el archivo");
			this.markRuleNotApplicable("markdownlint-config-missing-strict-rule", "No se pudo leer el archivo");
			return;
		}
		let parsed;
		this.runSubAuditorSync("markdownlint-config-syntax", () => {
			try {
				parsed = JSON.parse(rawContent);
			} catch {
				this.addViolation({
					ruleId: "markdownlint-config-syntax",
					severity: "error",
					file: relPath,
					line: 1,
					message: `JSON syntax error in ${relPath}.`
				});
			}
		});
		if (!parsed || typeof parsed !== "object") {
			this.markRuleNotApplicable("markdownlint-config-missing-strict-rule", "Invalid JSON syntax");
			return;
		}
		let modified = false;
		const parsedConfig = parsed;
		this.runSubAuditorSync("markdownlint-config-missing-strict-rule", () => {
			if (parsedConfig.default !== true) {
				if (isFix) {
					parsedConfig.default = true;
					modified = true;
				} else this.addViolation({
					ruleId: "markdownlint-config-missing-strict-rule",
					severity: "error",
					file: relPath,
					line: 1,
					message: "Configuration must define \"default\": true."
				});
			}
			const md033 = parsedConfig.MD033;
			if (!(typeof md033 === "object" && md033 !== null && Array.isArray(md033.allowed_elements) && md033.allowed_elements.includes("br")) && md033 !== false) {
				if (isFix) {
					parsedConfig.MD033 = { allowed_elements: ["br"] };
					modified = true;
				} else this.addViolation({
					ruleId: "markdownlint-config-missing-strict-rule",
					severity: "error",
					file: relPath,
					line: 1,
					message: "MD033 must allow <br> via allowed_elements: [\"br\"]."
				});
			}
			const md024 = parsedConfig.MD024;
			if (!(typeof md024 === "object" && md024 !== null && md024.siblings_only === true) && md024 !== false) {
				if (isFix) {
					parsedConfig.MD024 = { siblings_only: true };
					modified = true;
				} else this.addViolation({
					ruleId: "markdownlint-config-missing-strict-rule",
					severity: "error",
					file: relPath,
					line: 1,
					message: "MD024 must configure siblings_only: true to allow duplicate headings across different sections."
				});
			}
			const md007 = parsedConfig.MD007;
			if (!(typeof md007 === "object" && md007 !== null && md007.indent === 2) && md007 !== false) {
				if (isFix) {
					parsedConfig.MD007 = { indent: 2 };
					modified = true;
				} else this.addViolation({
					ruleId: "markdownlint-config-missing-strict-rule",
					severity: "error",
					file: relPath,
					line: 1,
					message: "MD007 must configure indent: 2 according to markdown style standards."
				});
			}
		});
		if (isFix && modified) fs.writeFileSync(resolvedPath, JSON.stringify(parsedConfig, null, 2) + "\n", "utf8");
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateMarkdownLintConfigAuditor());
//#endregion
export { CANONICAL_MARKDOWNLINT_CONFIG, MARKDOWNLINT_CONFIG_REQUIREMENT, MARKDOWNLINT_CONFIG_RULES, ValidateMarkdownLintConfigAuditor };
