import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { toPosixRelative } from "../../core/safePath.js";
import "../../core/auditConfig.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import "stylelint-declaration-strict-value";
// src/suites/architecture/validate_stylelint_config.ts
/**
* src/suites/architecture/validate_stylelint_config.ts
*
* STYLELINT CONFIGURATION INTEGRITY VALIDATOR (Node.js 26+ Native)
*
* Validates that .stylelintrc.json:
*   1. Physically exists in the project root.
*   2. Configures the required 'stylelint-declaration-strict-value' plugin.
*   3. Enforces the canonical 'scale-unlimited/declaration-strict-value' rule for
*      z-index, font-size, and color to eliminate raw magic values in SCSS/CSS.
*   4. Supports auto-repair in --fix mode.
*/
enableCompileCache();
const STYLELINT_CONFIG_RULES = [
	"stylelint-config-missing",
	"stylelint-config-missing-plugin",
	"stylelint-config-missing-strict-value",
	"stylelint-config-missing-order"
];
const REQUIRED_STYLELINT_PLUGIN = "stylelint-declaration-strict-value";
const REQUIRED_ORDER_PLUGIN = "stylelint-order";
const REQUIRED_STRICT_VALUE_RULE = "scale-unlimited/declaration-strict-value";
const REQUIRED_ORDER_RULE = "order/order";
const CANONICAL_ORDER_CONFIG = [
	"dollar-variables",
	"custom-properties",
	{
		type: "at-rule",
		name: "include",
		hasBlock: false
	},
	"declarations",
	{
		type: "at-rule",
		name: "include",
		hasBlock: true
	},
	{
		type: "rule",
		selector: "^&:\\w"
	},
	"rules"
];
function findIncludeMixinIndex(order, hasBlock) {
	return order.findIndex((item) => typeof item === "object" && item !== null && item.type === "at-rule" && item.name === "include" && item.hasBlock === hasBlock);
}
function validateOrderHasBlockPartitioning(order) {
	if (!Array.isArray(order)) return {
		valid: false,
		reason: "order/order is not configured as an array"
	};
	const declIndex = order.indexOf("declarations");
	if (declIndex === -1) return {
		valid: false,
		reason: "Missing \"declarations\" in order/order"
	};
	const blocklessIncludeIndex = findIncludeMixinIndex(order, false);
	const blockIncludeIndex = findIncludeMixinIndex(order, true);
	if (blocklessIncludeIndex === -1) return {
		valid: false,
		reason: "Missing at-rule @include with hasBlock: false (mixins without block before declarations)"
	};
	if (blockIncludeIndex === -1) return {
		valid: false,
		reason: "Missing at-rule @include with hasBlock: true (mixins with block after declarations)"
	};
	if (blocklessIncludeIndex > declIndex) return {
		valid: false,
		reason: "at-rule @include with hasBlock: false must be placed BEFORE \"declarations\""
	};
	if (blockIncludeIndex < declIndex) return {
		valid: false,
		reason: "at-rule @include with hasBlock: true must be placed AFTER \"declarations\""
	};
	return { valid: true };
}
const REQUIRED_STRICT_PROPERTIES = [
	"/color$/",
	"font-size",
	"z-index",
	"box-shadow",
	"border-radius",
	"font-family",
	"transition-duration",
	"animation-duration",
	"gap",
	"row-gap",
	"column-gap",
	"font-weight",
	"transition-timing-function"
];
const REQUIRED_STRICT_PROPERTIES_SET = new Set(REQUIRED_STRICT_PROPERTIES);
const CANONICAL_IGNORE_AT_RULES = ["@font-face"];
const CANONICAL_IGNORE_VALUES = {
	"": [
		"inherit",
		"initial",
		"unset"
	],
	"/color$/": [
		"transparent",
		"currentColor",
		"none"
	],
	"z-index": [
		"auto",
		"0",
		"-1"
	],
	"font-size": ["inherit", "initial"],
	"box-shadow": ["none"],
	"border-radius": [
		"0",
		"50%",
		"100%",
		"9999px"
	],
	"font-family": [
		"inherit",
		"initial",
		"unset",
		"sans-serif",
		"serif",
		"monospace",
		"cursive",
		"fantasy",
		"system-ui",
		"ui-sans-serif",
		"ui-serif",
		"ui-monospace",
		",",
		"/^var\\(.*\\),?$/",
		"/^\\$.*,?$/"
	],
	"transition-duration": [
		"0",
		"0s",
		"0ms"
	],
	"animation-duration": [
		"0",
		"0s",
		"0ms"
	],
	gap: ["0", "normal"],
	"row-gap": ["0", "normal"],
	"column-gap": ["0", "normal"],
	"font-weight": [
		"normal",
		"bold",
		"bolder",
		"lighter"
	],
	"transition-timing-function": [
		"linear",
		"ease",
		"ease-in",
		"ease-out",
		"ease-in-out",
		"step-start",
		"step-end"
	]
};
function getMergedStrictProperties(config) {
	const custom = config?.stylelint?.strictValues?.properties ?? config?.styles?.stylelint?.strictValues?.properties;
	const merged = new Set(REQUIRED_STRICT_PROPERTIES);
	if (custom && Array.isArray(custom)) {
		for (const prop of custom) if (typeof prop === "string" && prop.trim().length > 0) merged.add(prop.trim());
	}
	return Array.from(merged);
}
function getMergedIgnoreValues(config) {
	const custom = config?.stylelint?.strictValues?.ignoreValues ?? config?.styles?.stylelint?.strictValues?.ignoreValues ?? {};
	const result = {};
	for (const [prop, values] of Object.entries(CANONICAL_IGNORE_VALUES)) result[prop] = [...values];
	for (const [prop, values] of Object.entries(custom)) if (result[prop]) {
		const set = /* @__PURE__ */ new Set([...result[prop], ...values]);
		result[prop] = Array.from(set);
	} else result[prop] = [...values];
	return result;
}
function getMergedIgnoreAtRules(config) {
	const custom = config?.stylelint?.strictValues?.ignoreAtRules ?? config?.styles?.stylelint?.strictValues?.ignoreAtRules ?? [];
	const merged = /* @__PURE__ */ new Set([...CANONICAL_IGNORE_AT_RULES, ...custom]);
	return Array.from(merged);
}
function buildProjectStrictValueConfig(config) {
	const properties = getMergedStrictProperties(config);
	const ignoreValues = getMergedIgnoreValues(config);
	return [properties, {
		ignoreAtRules: getMergedIgnoreAtRules(config),
		ignoreValues,
		message: "Enforce using SCSS variables ($variable) or CSS variables (var(--variable)) instead of literal values (no magic values/numbers in styles)"
	}];
}
const CANONICAL_STRICT_VALUE_CONFIG = buildProjectStrictValueConfig();
const AUDITOR_STYLELINT_EXTENDS_PATH = "./node_modules/@francogp/auditor/.stylelintrc.json";
const CANONICAL_STYLELINT_CONFIG_CONTENT = JSON.stringify({
	$schema: "https://json.schemastore.org/stylelintrc",
	extends: [AUDITOR_STYLELINT_EXTENDS_PATH]
}, null, 2) + "\n";
const STYLELINT_CONFIG_REQUIREMENT = {
	id: "stylelint-config",
	file: ".stylelintrc.json",
	candidateFiles: [
		".stylelintrc.json",
		".stylelintrc.js",
		".stylelintrc.cjs",
		"stylelint.config.js"
	],
	description: "Canonical Stylelint configuration in .stylelintrc.json",
	ruleId: "stylelint-config-missing",
	generateDefaultContent: () => CANONICAL_STYLELINT_CONFIG_CONTENT,
	customMissingMessage: (_ctx, file) => `Stylelint configuration file '${file}' not found. Run "auditor fix" to create it automatically.`
};
function extendsAuditorConfig(parsedConfig) {
	const rawExtends = parsedConfig.extends;
	return (Array.isArray(rawExtends) ? rawExtends : rawExtends ? [rawExtends] : []).some((item) => typeof item === "string" && item.includes("auditor"));
}
var ValidateStylelintConfigAuditor = class extends BaseAuditor {
	constructor(rootsOrOptions, maybeProjectRoot) {
		const optionsObj = rootsOrOptions && !Array.isArray(rootsOrOptions) ? rootsOrOptions : void 0;
		const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(STYLELINT_CONFIG_RULES, {
				speed: "light",
				phase: "setup",
				fix: "priority",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}, [...STYLELINT_CONFIG_RULES]),
			fixableRuleIds: [...STYLELINT_CONFIG_RULES],
			configFiles: [STYLELINT_CONFIG_REQUIREMENT],
			id: "validate_stylelint_config",
			name: "Stylelint Configuration Validator",
			description: "Validates plugins and strict rules in .stylelintrc.json",
			family: "architecture",
			packageName: "Stylelint",
			configKey: "stylelint.enabled",
			defaultConfig: {
				enabled: true,
				order: {
					enabled: true,
					enforceHasBlockPartitioning: true
				}
			},
			criticalConfig: {
				rationale: "Requiring SCSS ($var) or CSS (var(--var)) variables for design properties (color, font-size, z-index, box-shadow, border-radius, font-family, transition-duration, animation-duration, gap, row-gap, column-gap, font-weight, transition-timing-function) is an immutable standard to eradicate magic numbers in styles.",
				requiredMinimums: { "strictValues.properties": [...REQUIRED_STRICT_PROPERTIES] }
			},
			icon: "🎨",
			ruleIds: STYLELINT_CONFIG_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(STYLELINT_CONFIG_RULES, "setup"),
			ruleDescriptions: {
				"stylelint-config-missing": "Missing .stylelintrc.json",
				"stylelint-config-missing-plugin": "Missing stylelint plugin",
				"stylelint-config-missing-strict-value": "Missing strict-value rule",
				"stylelint-config-missing-order": "Missing order/order rule"
			},
			ruleRemediations: {
				"stylelint-config-missing": "1. Root Cause:\nThe canonical .stylelintrc.json configuration file was not found in the project root.\nWithout this configuration, Stylelint cannot verify architectural stylesheet rules or enforce zero magic values.\n\n2. Diagnosis:\nCheck for legacy files like stylelint.config.js or .stylelintrc.js. The unified framework requires .stylelintrc.json extending the base configuration from @francogp/auditor.\n\n3. Canonical Solution:\n1. Run \"npm run auditor:fix\" or \"auditor fix\". The auditor will automatically generate .stylelintrc.json extending \"./node_modules/@francogp/auditor/.stylelintrc.json\".\n2. Or manually create .stylelintrc.json with:\n   {\n     \"$schema\": \"https://json.schemastore.org/stylelintrc\",\n     \"extends\": [\"./node_modules/@francogp/auditor/.stylelintrc.json\"]\n   }\n\n4. Example / Auto-fix command:\nnpm run auditor:fix",
				"stylelint-config-missing-plugin": "1. Root Cause:\nThe local .stylelintrc.json file does not extend the auditor configuration and omits essential plugins like \"stylelint-declaration-strict-value\" or \"stylelint-order\".\n\n2. Diagnosis:\nInspect the \"plugins\" array in .stylelintrc.json. Mandatory plugins for design variable governance and mixin/selector ordering are missing.\n\n3. Canonical Solution:\n1. Run \"npm run auditor:fix\" to automatically inject the missing plugins.\n2. The recommended approach is extending \"./node_modules/@francogp/auditor/.stylelintrc.json\" in \"extends\", which inherits all canonical plugins.\n\n4. Example / Auto-fix command:\nnpm run auditor:fix",
				"stylelint-config-missing-strict-value": "1. Root Cause:\nThe \"scale-unlimited/declaration-strict-value\" rule is missing or fails to cover all mandatory design properties of the strict baseline (Anti-Castration Mandate).\nRequired properties: color, font-size, z-index, box-shadow, border-radius, font-family, transition-duration, animation-duration, gap, row-gap, column-gap, font-weight, transition-timing-function.\n\n2. Diagnosis:\nVerify whether declaration-strict-value in .stylelintrc.json was disabled, degraded, or omitted required design tokens.\n\n3. Canonical Solution:\n1. Run \"npm run auditor:fix\". The auditor will regenerate the full rule with all required properties and safe exempted values (none, transparent, inherit, etc.).\n2. Do not disable properties in this rule; instead, use SCSS ($my-color) or CSS (var(--my-color)) variables in stylesheets.\n\n4. Example / Auto-fix command:\nnpm run auditor:fix",
				"stylelint-config-missing-order": "1. Root Cause:\nThe \"order/order\" rule is missing or does not define block partitioning (hasBlock: true/false) for SCSS mixins and at-rules.\nPartitioning guarantees that blockless mixins (@include theme) are declared before CSS properties, and block mixins (@include respond-to) are declared at the end alongside nested selectors.\n\n2. Diagnosis:\nInspect \"order/order\" in .stylelintrc.json rules. The auditor enforces a deterministic structure to prevent specificity leaks in compiled CSS.\n\n3. Canonical Solution:\n1. Run \"npm run auditor:fix\" to repair the configuration automatically.\n2. Alternatively, extend \"./node_modules/@francogp/auditor/.stylelintrc.json\" to inherit canonical mixin ordering.\n\n4. Example / Auto-fix command:\nnpm run auditor:fix"
			},
			coverage: { include: [".stylelintrc*"] },
			projectRoot,
			fix: optionsObj?.fix
		});
	}
	auditPlugin(parsedConfig, targetFile) {
		const plugins = Array.isArray(parsedConfig.plugins) ? [...parsedConfig.plugins] : [];
		if (extendsAuditorConfig(parsedConfig)) return false;
		const missingPlugins = [REQUIRED_STYLELINT_PLUGIN, REQUIRED_ORDER_PLUGIN].filter((p) => !plugins.includes(p));
		if (missingPlugins.length === 0) return false;
		if (this.isFixActive()) {
			for (const p of missingPlugins) plugins.push(p);
			parsedConfig.plugins = plugins;
			return true;
		}
		this.addViolation({
			ruleId: "stylelint-config-missing-plugin",
			severity: "error",
			file: toPosixRelative(this.projectRoot, targetFile),
			line: 1,
			message: `Missing required plugins (${missingPlugins.join(", ")}) in plugins of ${path.basename(targetFile)}. Run "auditor fix" to add them.`,
			context: missingPlugins.join(", ")
		});
		return false;
	}
	auditOrderRule(parsedConfig, targetFile) {
		if (extendsAuditorConfig(parsedConfig)) return false;
		const rules = typeof parsedConfig.rules === "object" && parsedConfig.rules !== null ? { ...parsedConfig.rules } : {};
		const orderRule = rules[REQUIRED_ORDER_RULE];
		const validation = validateOrderHasBlockPartitioning(orderRule);
		if (validation.valid) return false;
		if (this.isFixActive()) {
			rules[REQUIRED_ORDER_RULE] = CANONICAL_ORDER_CONFIG;
			parsedConfig.rules = rules;
			return true;
		}
		this.addViolation({
			ruleId: "stylelint-config-missing-order",
			severity: "error",
			file: toPosixRelative(this.projectRoot, targetFile),
			line: 1,
			message: `Rule "${REQUIRED_ORDER_RULE}" in ${path.basename(targetFile)} is invalid or missing (${validation.reason}). Run "auditor fix" to auto-repair it.`,
			context: REQUIRED_ORDER_RULE
		});
		return false;
	}
	auditStrictRule(parsedConfig, targetFile, config) {
		const rules = typeof parsedConfig.rules === "object" && parsedConfig.rules !== null ? { ...parsedConfig.rules } : {};
		const strictRule = rules[REQUIRED_STRICT_VALUE_RULE];
		const requiredProps = getMergedStrictProperties(config);
		const hasCustomExtraProps = requiredProps.some((p) => !REQUIRED_STRICT_PROPERTIES_SET.has(p));
		if (strictRule === void 0 && extendsAuditorConfig(parsedConfig)) {
			if (!hasCustomExtraProps) return false;
		}
		const isStrictRuleConfigured = Array.isArray(strictRule) && strictRule.length >= 1;
		let missingProperties = [];
		if (isStrictRuleConfigured && Array.isArray(strictRule[0])) {
			const configuredProps = new Set(strictRule[0].filter((item) => typeof item === "string"));
			missingProperties = requiredProps.filter((p) => !configuredProps.has(p));
		}
		if (isStrictRuleConfigured && missingProperties.length === 0) return false;
		if (this.isFixActive()) {
			rules[REQUIRED_STRICT_VALUE_RULE] = buildProjectStrictValueConfig(config);
			parsedConfig.rules = rules;
			return true;
		}
		const detailMsg = missingProperties.length > 0 ? `Rule "${REQUIRED_STRICT_VALUE_RULE}" in ${path.basename(targetFile)} does not cover all canonical properties (missing: ${missingProperties.join(", ")}). Run "auditor fix" to synchronize.` : `Missing required rule "${REQUIRED_STRICT_VALUE_RULE}" in rules of ${path.basename(targetFile)}. Run "auditor fix" to inject it.`;
		this.addViolation({
			ruleId: "stylelint-config-missing-strict-value",
			severity: "error",
			file: toPosixRelative(this.projectRoot, targetFile),
			line: 1,
			message: detailMsg,
			context: missingProperties.length > 0 ? missingProperties.join(", ") : REQUIRED_STRICT_VALUE_RULE
		});
		return false;
	}
	async runAudit() {
		const config = getAuditConfig(this.projectRoot);
		if (config.stylelint?.enabled === false && config.styles?.stylelint?.enabled === false) {
			for (const r of STYLELINT_CONFIG_RULES) this.runSubAuditorSync(r, () => {
				this.markRuleNotApplicable(r, "Stylelint disabled in audit.config.ts");
			});
			return;
		}
		let configFile = null;
		this.runSubAuditorSync("stylelint-config-missing", () => {
			configFile = this.resolveConfigFile(STYLELINT_CONFIG_REQUIREMENT);
		});
		if (!configFile) {
			let ensured = null;
			await this.runSubAuditor("stylelint-config-missing", async () => {
				ensured = await this.ensureConfigFile(STYLELINT_CONFIG_REQUIREMENT);
			});
			if (!ensured) {
				for (const r of [
					"stylelint-config-missing-plugin",
					"stylelint-config-missing-strict-value",
					"stylelint-config-missing-order"
				]) this.runSubAuditorSync(r, () => {
					this.markRuleNotApplicable(r, "Stylelint configuration missing");
				});
				return;
			}
		}
		const targetFile = configFile ?? path.resolve(this.projectRoot, ".stylelintrc.json");
		this.recordScanned(toPosixRelative(this.projectRoot, targetFile));
		let parsedConfig;
		try {
			const content = fs.readFileSync(targetFile, "utf-8");
			parsedConfig = JSON.parse(content);
		} catch {
			for (const r of [
				"stylelint-config-missing-plugin",
				"stylelint-config-missing-strict-value",
				"stylelint-config-missing-order"
			]) this.runSubAuditorSync(r, () => {
				this.markRuleNotApplicable(r, "Archivo .stylelintrc.json inválido o corrupto");
			});
			return;
		}
		let pluginModified = false;
		this.runSubAuditorSync("stylelint-config-missing-plugin", () => {
			pluginModified = this.auditPlugin(parsedConfig, targetFile);
		});
		let strictModified = false;
		this.runSubAuditorSync("stylelint-config-missing-strict-value", () => {
			strictModified = this.auditStrictRule(parsedConfig, targetFile, config);
		});
		const orderEnabled = config.stylelint?.order?.enforceHasBlockPartitioning ?? config.styles?.stylelint?.order?.enforceHasBlockPartitioning ?? true;
		let orderModified = false;
		if (orderEnabled !== false) this.runSubAuditorSync("stylelint-config-missing-order", () => {
			orderModified = this.auditOrderRule(parsedConfig, targetFile);
		});
		else this.runSubAuditorSync("stylelint-config-missing-order", () => {
			this.markRuleNotApplicable("stylelint-config-missing-order", "Orden de mixins desactivado en configuración");
		});
		if ((pluginModified || strictModified || orderModified) && this.isFixActive()) fs.writeFileSync(targetFile, JSON.stringify(parsedConfig, null, 2) + "\n", "utf-8");
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateStylelintConfigAuditor());
export { AUDITOR_STYLELINT_EXTENDS_PATH, CANONICAL_IGNORE_AT_RULES, CANONICAL_IGNORE_VALUES, CANONICAL_ORDER_CONFIG, CANONICAL_STRICT_VALUE_CONFIG, CANONICAL_STYLELINT_CONFIG_CONTENT, REQUIRED_ORDER_PLUGIN, REQUIRED_ORDER_RULE, REQUIRED_STRICT_PROPERTIES, REQUIRED_STRICT_VALUE_RULE, REQUIRED_STYLELINT_PLUGIN, STYLELINT_CONFIG_REQUIREMENT, STYLELINT_CONFIG_RULES, ValidateStylelintConfigAuditor as StylelintConfigAuditor, ValidateStylelintConfigAuditor, buildProjectStrictValueConfig, extendsAuditorConfig, getMergedIgnoreAtRules, getMergedIgnoreValues, getMergedStrictProperties, validateOrderHasBlockPartitioning };
