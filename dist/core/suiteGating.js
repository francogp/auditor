import { AUDIT_LIST_FILTERS } from "./auditConfigTypes.js";
import { isProductionEnvironment } from "./auditorEnvironment.js";
//#region src/core/suiteGating.ts
function isSimilarEnvSkipped() {
	const v = process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS ?? process.env.AUDIT_SKIP_SIMILAR;
	return v === "1" || v === "true";
}
function checkSimilarCodeGating(config) {
	if (isProductionEnvironment()) return {
		enabled: false,
		reason: "Skipped in production environment (AUDITOR_ENV=production)",
		configKey: "env:AUDITOR_ENV"
	};
	if (isSimilarEnvSkipped()) return {
		enabled: false,
		reason: "Skipped due to AUDIT_SKIP_SIMILAR environment variable",
		configKey: "env:AUDIT_SKIP_SIMILAR"
	};
	if (config.fallow?.similarCode?.enabled === false) return {
		enabled: false,
		reason: "Disabled in config (fallow.similarCode.enabled = false)",
		configKey: "fallow.similarCode.enabled"
	};
	return { enabled: true };
}
function checkSpecialGating(suiteId, config) {
	if (suiteId === "validate_git_config") {
		if (isProductionEnvironment()) return {
			enabled: false,
			reason: "Skipped in production environment (AUDITOR_ENV=production)",
			configKey: "env:AUDITOR_ENV"
		};
	}
	if (suiteId === "validate_similar_code") return checkSimilarCodeGating(config);
	if (suiteId === "validate_stylelint" && (config.stylelint?.enabled === false || config.styles?.stylelint?.enabled === false)) return {
		enabled: false,
		reason: "Disabled in config (stylelint.enabled = false)",
		configKey: "stylelint.enabled"
	};
	if (suiteId === "validate_test_coverage") {
		if (isProductionEnvironment()) return {
			enabled: false,
			reason: "Skipped in production environment (AUDITOR_ENV=production)",
			configKey: "env:AUDITOR_ENV"
		};
		if (config.testCoverage?.enabled === false || !config.testCoverage?.enforceInAudit) return {
			enabled: false,
			reason: "Disabled in config (testCoverage no habilitado o enforceInAudit = false)",
			configKey: "testCoverage.enforceInAudit"
		};
	}
	if (suiteId === "validate_oxlint") {
		if (config.oxlint?.enabled === false || config.vitePlusConfig?.enabled === false || config.vitePlusConfig?.lint?.enabled === false) return {
			enabled: false,
			reason: "Disabled in config (oxlint / vitePlusConfig.lint = false)",
			configKey: "vitePlusConfig.lint.enabled"
		};
	}
	if (suiteId === "validate_oxfmt") {
		if (config.oxfmt?.enabled === false || config.vitePlusConfig?.enabled === false || config.vitePlusConfig?.fmt?.enabled === false) return {
			enabled: false,
			reason: "Disabled in config (oxfmt / vitePlusConfig.fmt = false)",
			configKey: "vitePlusConfig.fmt.enabled"
		};
	}
	if (suiteId === "validate_vite_plus_config") {
		if (config.vitePlusConfig?.enabled === false) return {
			enabled: false,
			reason: "Disabled in config (vitePlusConfig.enabled = false)",
			configKey: "vitePlusConfig.enabled"
		};
	}
	return null;
}
const SIMPLE_GATING_SPECS = {
	validate_domain_types: {
		configKey: "domain.enabled",
		reason: "Disabled in config (domain.enabled = false)",
		path: ["domain", "enabled"]
	},
	audit_bundle: {
		configKey: "bundle.enabled",
		reason: "Disabled in config (bundle.enabled = false)",
		path: ["bundle", "enabled"]
	},
	validate_bundle_budget: {
		configKey: "bundle.enabled",
		reason: "Disabled in config (bundle.enabled = false)",
		path: ["bundle", "enabled"]
	},
	validate_fallow: {
		configKey: "fallow.enabled",
		reason: "Disabled in config (fallow.enabled = false)",
		path: ["fallow", "enabled"]
	},
	validate_html_validate: {
		configKey: "htmlValidate.enabled",
		reason: "Disabled in config (htmlValidate.enabled = false)",
		path: ["htmlValidate", "enabled"]
	},
	validate_accessibility: {
		configKey: "accessibility.enabled",
		reason: "Disabled in config (accessibility.enabled = false)",
		path: ["accessibility", "enabled"]
	},
	validate_template_ids: {
		configKey: "templates.requireInputIds",
		reason: "Disabled in config (templates.requireInputIds = false)",
		path: ["templates", "requireInputIds"]
	},
	validate_z_index: {
		configKey: "styles.zLayersEnabled",
		reason: "Disabled in config (styles.zLayersEnabled = false)",
		path: ["styles", "zLayersEnabled"]
	},
	validate_package_hygiene: {
		configKey: "packageHygiene.enabled",
		reason: "Disabled in config (packageHygiene.enabled = false)",
		path: ["packageHygiene", "enabled"]
	},
	validate_type_coverage: {
		configKey: "typeCoverage.enabled",
		reason: "Disabled in config (typeCoverage.enabled = false)",
		path: ["typeCoverage", "enabled"]
	},
	validate_agent_plugin: {
		configKey: "agentPlugin.enabled",
		reason: "Disabled in config (agentPlugin.enabled = false)",
		path: ["agentPlugin", "enabled"]
	},
	validate_secret_leaks: {
		configKey: "secretLeaks.enabled",
		reason: "Disabled in config (secretLeaks.enabled = false)",
		path: ["secretLeaks", "enabled"]
	},
	validate_dependency_vulnerabilities: {
		configKey: "dependencyVulnerabilities.enabled",
		reason: "Disabled in config (dependencyVulnerabilities.enabled = false)",
		path: ["dependencyVulnerabilities", "enabled"]
	},
	validate_valibot_parity: {
		configKey: "valibot.enabled",
		reason: "Disabled in config (valibot.enabled = false)",
		path: ["valibot", "enabled"]
	},
	validate_pinia_reactivity: {
		configKey: "pinia.enabled",
		reason: "Disabled in config (pinia.enabled = false)",
		path: ["pinia", "enabled"]
	},
	validate_oxlint: {
		configKey: "vitePlusConfig.lint.enabled",
		reason: "Disabled in config (oxlint / vitePlusConfig.lint)",
		path: ["vitePlusConfig", "enabled"]
	},
	validate_oxfmt: {
		configKey: "vitePlusConfig.fmt.enabled",
		reason: "Disabled in config (oxfmt / vitePlusConfig.fmt)",
		path: ["vitePlusConfig", "enabled"]
	},
	validate_vite_plus_config: {
		configKey: "vitePlusConfig.enabled",
		reason: "Disabled in config (vitePlusConfig.enabled = false)",
		path: ["vitePlusConfig", "enabled"]
	}
};
function checkSimpleGating(spec, config) {
	const [section, prop] = spec.path;
	return config[section]?.[prop] === false;
}
function evaluateDynamicConfigKey(configKey, config) {
	if (configKey === "core" || configKey === "paths" || configKey === "none") return {
		enabled: true,
		configKey
	};
	const parts = configKey.split(".");
	let current = config;
	for (const part of parts) {
		if (current === null || current === void 0 || typeof current !== "object") return null;
		current = current[part];
	}
	if (current === false) return {
		enabled: false,
		reason: `Disabled in config (${configKey} = false)`,
		configKey
	};
	if (typeof current === "object" && current !== null && "enabled" in current && current.enabled === false) return {
		enabled: false,
		reason: `Disabled in config (${configKey}.enabled = false)`,
		configKey: `${configKey}.enabled`
	};
	return null;
}
function evaluateSuiteStatus(suiteId, config, declaredConfigKey) {
	const special = checkSpecialGating(suiteId, config);
	if (special) return special;
	if (declaredConfigKey) {
		const dynamic = evaluateDynamicConfigKey(declaredConfigKey, config);
		if (dynamic) return dynamic;
	}
	const spec = SIMPLE_GATING_SPECS[suiteId];
	if (spec && checkSimpleGating(spec, config)) return {
		enabled: false,
		reason: spec.reason,
		configKey: spec.configKey
	};
	return {
		enabled: true,
		configKey: declaredConfigKey ?? spec?.configKey
	};
}
//#endregion
export { AUDIT_LIST_FILTERS, evaluateSuiteStatus };
