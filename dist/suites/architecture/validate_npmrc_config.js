import { BaseAuditor, createUniformRemediationPhases, createUniformRuleCapabilities } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_npmrc_config.ts
/**
* src/suites/architecture/validate_npmrc_config.ts
*
* NPMRC CONFIGURATION & REPRODUCIBILITY BASELINE AUDITOR (Node.js 26+ Native)
*
* Enforces standardized npm package manager runtime configuration across .npmrc:
*   1. Guarantees .npmrc exists on disk; auto-scaffolds in --fix mode.
*   2. Guarantees mandatory reproducibility directives:
*      - engine-strict=true (enforces package.json engines)
*      - save-exact=true (pins exact dependency versions)
*      - package-lock=true (ensures deterministic tree resolution)
*   3. Preserves existing private tokens, custom registries, and comments without destruction.
*/
enableCompileCache();
const NPMRC_CONFIG_RULES = ["npmrc-config-missing", "npmrc-config-missing-setting"];
const CANONICAL_NPMRC_LINES = [
	"# Estandares de reproducibilidad de paquetes (francogp/auditor)",
	"engine-strict=true",
	"save-exact=true",
	"package-lock=true",
	""
];
const CANONICAL_NPMRC_CONTENT = CANONICAL_NPMRC_LINES.join("\n");
const MANDATORY_NPMRC_SETTINGS = [
	{
		key: "engine-strict",
		expected: "true"
	},
	{
		key: "save-exact",
		expected: "true"
	},
	{
		key: "package-lock",
		expected: "true"
	}
];
const NPMRC_CONFIG_REQUIREMENT = {
	id: "npmrc-config",
	file: ".npmrc",
	candidateFiles: [".npmrc"],
	description: "Reproducibility and engine configuration for npm (.npmrc)",
	ruleId: "npmrc-config-missing",
	generateDefaultContent: () => CANONICAL_NPMRC_CONTENT
};
var ValidateNpmrcConfigAuditor = class extends BaseAuditor {
	constructor(rootsOrOptions, maybeProjectRoot) {
		const optionsObj = rootsOrOptions && !Array.isArray(rootsOrOptions) ? rootsOrOptions : void 0;
		const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();
		const configRequirement = {
			...NPMRC_CONFIG_REQUIREMENT,
			...optionsObj?.configFile ? {
				file: optionsObj.configFile,
				candidateFiles: [optionsObj.configFile]
			} : {}
		};
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createUniformRuleCapabilities(NPMRC_CONFIG_RULES, {
				speed: "light",
				phase: "setup",
				fix: "priority",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			fixableRuleIds: ["npmrc-config-missing", "npmrc-config-missing-setting"],
			configFiles: [configRequirement],
			id: "validate_npmrc_config",
			name: "NPMRC Configuration Validator",
			description: "Validates reproducibility directives in .npmrc",
			icon: "📦",
			family: "architecture",
			ruleIds: NPMRC_CONFIG_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(NPMRC_CONFIG_RULES, "setup"),
			packageName: "NPMRC",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			ruleDescriptions: {
				"npmrc-config-missing": "Missing .npmrc file",
				"npmrc-config-missing-setting": "Missing mandatory directive"
			},
			ruleRemediations: {
				"npmrc-config-missing": "📖 REMEDIATION GUIDE: npmrc-config-missing\n1. Root Cause: The `.npmrc` file does not exist in the project root.\n2. Diagnosis: Check project root for `.npmrc`.\n3. Canonical Solution: Run `npm run auditor:fix` or `auditor fix` to auto-scaffold canonical reproducibility directives.\n4. Example / Auto-fix command:\n   `npm run auditor:fix`",
				"npmrc-config-missing-setting": "📖 REMEDIATION GUIDE: npmrc-config-missing-setting\n1. Root Cause: Critical directives are missing from `.npmrc` (engine-strict=true, save-exact=true, package-lock=true).\n2. Diagnosis: Inspect existing `.npmrc` directives against mandatory settings.\n3. Canonical Solution: Run `npm run auditor:fix` or `auditor fix` to append or correct directives while preserving registries and tokens.\n4. Example / Auto-fix command:\n   `npm run auditor:fix`"
			},
			coverage: { include: [".npmrc"] },
			projectRoot,
			fix: optionsObj?.fix,
			...optionsObj
		});
	}
	async runAudit() {
		const isFix = this.isFixActive();
		let configFile = null;
		this.runSubAuditorSync("npmrc-config-missing", () => {
			configFile = this.resolveConfigFile(NPMRC_CONFIG_REQUIREMENT);
		});
		if (!configFile) {
			const ensured = await this.runSubAuditor("npmrc-config-missing", () => this.ensureConfigFile(NPMRC_CONFIG_REQUIREMENT));
			if (!ensured) {
				this.markRuleNotApplicable("npmrc-config-missing-setting", "Missing .npmrc file");
				return;
			}
			configFile = ensured.resolvedPath;
		}
		const resolvedPath = configFile;
		const relPath = path.relative(this.projectRoot, resolvedPath) || NPMRC_CONFIG_REQUIREMENT.file;
		this.recordScanned(relPath);
		let rawContent;
		try {
			rawContent = fs.readFileSync(resolvedPath, "utf8");
		} catch {
			this.runSubAuditorSync("npmrc-config-missing", () => {
				this.addViolation({
					ruleId: "npmrc-config-missing",
					severity: "error",
					file: relPath,
					line: 1,
					message: `No se pudo leer ${relPath}.`
				});
			});
			return;
		}
		const lines = rawContent.split(/\r?\n/);
		const parsedSettings = /* @__PURE__ */ new Map();
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]?.trim() ?? "";
			if (!line || line.startsWith("#") || line.startsWith(";")) continue;
			const eqIdx = line.indexOf("=");
			if (eqIdx > 0) {
				const key = line.slice(0, eqIdx).trim();
				const value = line.slice(eqIdx + 1).trim();
				parsedSettings.set(key, {
					value,
					lineIndex: i
				});
			}
		}
		let modified = false;
		this.runSubAuditorSync("npmrc-config-missing-setting", () => {
			for (const req of MANDATORY_NPMRC_SETTINGS) {
				const found = parsedSettings.get(req.key);
				if (!found || found.value !== req.expected) {
					if (isFix) {
						if (found !== void 0) lines[found.lineIndex] = `${req.key}=${req.expected}`;
						else lines.push(`${req.key}=${req.expected}`);
						modified = true;
					} else this.addViolation({
						ruleId: "npmrc-config-missing-setting",
						severity: "error",
						file: relPath,
						line: found ? found.lineIndex + 1 : 1,
						message: `Directive "${req.key}=${req.expected}" is required in .npmrc.`
					});
				}
			}
		});
		if (isFix && modified) {
			const output = lines.join("\n").trimEnd() + "\n";
			fs.writeFileSync(resolvedPath, output, "utf8");
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateNpmrcConfigAuditor());
//#endregion
export { CANONICAL_NPMRC_CONTENT, CANONICAL_NPMRC_LINES, MANDATORY_NPMRC_SETTINGS, NPMRC_CONFIG_REQUIREMENT, NPMRC_CONFIG_RULES, ValidateNpmrcConfigAuditor };
