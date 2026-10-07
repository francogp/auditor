/**
 * packages/auditor/src/core/suiteGating.ts
 *
 * Single Source of Truth for suite activation and configuration gating.
 * Evaluates whether an audit suite is enabled or disabled in the project's
 * audit configuration, providing transparent skip reasons and CLI introspection.
 */
import { AUDIT_LIST_FILTERS } from "./auditConfigTypes.js";
export { AUDIT_LIST_FILTERS };
function isSimilarEnvSkipped() {
    const v = process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS ?? process.env.AUDIT_SKIP_SIMILAR;
    return v === '1' || v === 'true';
}
function checkSimilarCodeGating(config) {
    if (isSimilarEnvSkipped()) {
        return {
            enabled: false,
            reason: 'Omitido por variable de entorno AUDIT_SKIP_SIMILAR',
            configKey: 'env:AUDIT_SKIP_SIMILAR'
        };
    }
    if (config.fallow?.similarCode?.enabled === false) {
        return {
            enabled: false,
            reason: 'Desactivado en config (fallow.similarCode.enabled = false)',
            configKey: 'fallow.similarCode.enabled'
        };
    }
    return { enabled: true };
}
function checkSpecialGating(suiteId, config) {
    if (suiteId === 'validate_similar_code') {
        return checkSimilarCodeGating(config);
    }
    if (suiteId === 'validate_stylelint' && (config.stylelint?.enabled === false || config.styles?.stylelint?.enabled === false)) {
        return {
            enabled: false,
            reason: 'Desactivado en config (stylelint.enabled = false)',
            configKey: 'stylelint.enabled'
        };
    }
    if (suiteId === 'validate_test_coverage' && (config.testCoverage?.enabled === false || !config.testCoverage?.enforceInAudit)) {
        return {
            enabled: false,
            reason: 'Desactivado en config (testCoverage no habilitado o enforceInAudit = false)',
            configKey: 'testCoverage.enforceInAudit'
        };
    }
    return null;
}
const SIMPLE_GATING_SPECS = {
    validate_domain_types: {
        configKey: 'domain.enabled',
        reason: 'Desactivado en config (domain.enabled = false)',
        path: ['domain', 'enabled']
    },
    audit_bundle: {
        configKey: 'bundle.enabled',
        reason: 'Desactivado en config (bundle.enabled = false)',
        path: ['bundle', 'enabled']
    },
    validate_bundle_budget: {
        configKey: 'bundle.enabled',
        reason: 'Desactivado en config (bundle.enabled = false)',
        path: ['bundle', 'enabled']
    },
    validate_fallow: {
        configKey: 'fallow.enabled',
        reason: 'Desactivado en config (fallow.enabled = false)',
        path: ['fallow', 'enabled']
    },
    validate_html_validate: {
        configKey: 'htmlValidate.enabled',
        reason: 'Desactivado en config (htmlValidate.enabled = false)',
        path: ['htmlValidate', 'enabled']
    },
    validate_accessibility: {
        configKey: 'accessibility.enabled',
        reason: 'Desactivado en config (accessibility.enabled = false)',
        path: ['accessibility', 'enabled']
    },
    validate_template_ids: {
        configKey: 'templates.requireInputIds',
        reason: 'Desactivado en config (templates.requireInputIds = false)',
        path: ['templates', 'requireInputIds']
    },
    validate_z_index: {
        configKey: 'styles.zLayersEnabled',
        reason: 'Desactivado en config (styles.zLayersEnabled = false)',
        path: ['styles', 'zLayersEnabled']
    },
    validate_package_distribution: {
        configKey: 'packageDistribution.enabled',
        reason: 'Desactivado en config (packageDistribution.enabled = false)',
        path: ['packageDistribution', 'enabled']
    },
    validate_package_types: {
        configKey: 'packageDistribution.enabled',
        reason: 'Desactivado en config (packageDistribution.enabled = false)',
        path: ['packageDistribution', 'enabled']
    },
    validate_package_hygiene: {
        configKey: 'packageHygiene.enabled',
        reason: 'Desactivado en config (packageHygiene.enabled = false)',
        path: ['packageHygiene', 'enabled']
    },
    validate_type_coverage: {
        configKey: 'typeCoverage.enabled',
        reason: 'Desactivado en config (typeCoverage.enabled = false)',
        path: ['typeCoverage', 'enabled']
    },
    validate_agent_plugin: {
        configKey: 'agentPlugin.enabled',
        reason: 'Desactivado en config (agentPlugin.enabled = false)',
        path: ['agentPlugin', 'enabled']
    },
    validate_secret_leaks: {
        configKey: 'secretLeaks.enabled',
        reason: 'Desactivado en config (secretLeaks.enabled = false)',
        path: ['secretLeaks', 'enabled']
    },
    validate_dependency_vulnerabilities: {
        configKey: 'dependencyVulnerabilities.enabled',
        reason: 'Desactivado en config (dependencyVulnerabilities.enabled = false)',
        path: ['dependencyVulnerabilities', 'enabled']
    },
    validate_valibot_parity: {
        configKey: 'valibot.enabled',
        reason: 'Desactivado en config (valibot.enabled = false)',
        path: ['valibot', 'enabled']
    },
    validate_pinia_reactivity: {
        configKey: 'pinia.enabled',
        reason: 'Desactivado en config (pinia.enabled = false)',
        path: ['pinia', 'enabled']
    },
    validate_eslint: {
        configKey: 'eslint.enabled',
        reason: 'Desactivado en config (eslint.enabled = false)',
        path: ['eslint', 'enabled']
    },
    validate_eslint_config: {
        configKey: 'eslint.enabled',
        reason: 'Desactivado en config (eslint.enabled = false)',
        path: ['eslint', 'enabled']
    }
};
function checkSimpleGating(spec, config) {
    const [section, prop] = spec.path;
    const sectionObj = config[section]; // open-record: Dynamic config section traversal
    return sectionObj?.[prop] === false;
}
function evaluateDynamicConfigKey(configKey, config) {
    if (configKey === 'core' || configKey === 'paths' || configKey === 'none') {
        return { enabled: true, configKey };
    }
    const parts = configKey.split('.');
    let current = config;
    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return null;
        }
        current = current[part]; // open-record: Generic key-value data dictionary container
    }
    if (current === false) {
        return {
            enabled: false,
            reason: `Desactivado en config (${configKey} = false)`,
            configKey
        };
    }
    return { enabled: true, configKey };
}
export function evaluateSuiteStatus(suiteId, config, declaredConfigKey) {
    const special = checkSpecialGating(suiteId, config);
    if (special) {
        return special;
    }
    if (declaredConfigKey) {
        const dynamic = evaluateDynamicConfigKey(declaredConfigKey, config);
        if (dynamic) {
            return dynamic;
        }
    }
    const spec = SIMPLE_GATING_SPECS[suiteId];
    if (spec && checkSimpleGating(spec, config)) {
        return { enabled: false, reason: spec.reason, configKey: spec.configKey };
    }
    return { enabled: true, configKey: declaredConfigKey ?? spec?.configKey };
}
//# sourceMappingURL=suiteGating.js.map