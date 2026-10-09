/**
 * packages/auditor/src/core/auditConfigValidators.ts
 *
 * Validation, layout definitions, and completeness assertions for the audit configuration engine.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PERSISTENCE_ENGINES, PACKAGE_DISTRIBUTION_LEVELS, FALLOW_TARGET_PRIORITIES, AUDITOR_DIR, AUDIT_CONFIG_FILE, LEGACY_ROOT_CONFIG_FILES } from "./auditConfigTypes.js";
import { validateConstantsExemptGlobs } from "./auditConfigAntiAbuse.js";
export { AUDITOR_DIR, AUDIT_CONFIG_FILE, LEGACY_ROOT_CONFIG_FILES };
function checkPersistenceSubsystem(config, missing) {
    const engine = config.persistence?.engine;
    if (!engine || !PERSISTENCE_ENGINES.some(e => e === engine)) {
        missing.push(`  - 'persistence': Motor de persistencia no válido ('${engine}'). Debe ser uno de: ${PERSISTENCE_ENGINES.join(' | ')}.`);
    }
}
function checkCoverageAndBundleSubsystem(config, missing) {
    if (typeof config.bundle?.enabled !== 'boolean') {
        missing.push("  - 'bundle': El campo 'enabled' debe ser booleano (true o false).");
    }
    if (typeof config.testCoverage?.enabled !== 'boolean') {
        missing.push("  - 'testCoverage': El campo 'enabled' debe ser booleano (true o false).");
    }
    if (typeof config.testCoverage?.enforceInAudit !== 'boolean') {
        missing.push("  - 'testCoverage': El campo 'enforceInAudit' debe ser booleano (true o false). Por defecto es true en todo proyecto gobernado por @francogp/auditor.");
    }
}
function checkPackageGovernanceSubsystem(config, missing) {
    if (typeof config.packageDistribution?.enabled !== 'boolean') {
        missing.push("  - 'packageDistribution': El campo 'enabled' debe ser booleano (true o false).");
    }
    else if (config.packageDistribution.level && !PACKAGE_DISTRIBUTION_LEVELS.some(lvl => lvl === config.packageDistribution?.level)) {
        missing.push(`  - 'packageDistribution': Nivel de distribución no válido ('${config.packageDistribution.level}'). Debe ser uno de: ${PACKAGE_DISTRIBUTION_LEVELS.join(' | ')}.`);
    }
    if (config.packageScripts?.recommendedScripts !== undefined && typeof config.packageScripts.recommendedScripts !== 'boolean') {
        missing.push("  - 'packageScripts': El campo 'recommendedScripts' debe ser un booleano estricto (true o false).");
    }
    if (config.packageScripts?.enforceBuildAudit !== undefined && typeof config.packageScripts.enforceBuildAudit !== 'boolean') {
        missing.push("  - 'packageScripts': El campo 'enforceBuildAudit' debe ser un booleano estricto (true o false).");
    }
    if (config.scriptExtensions?.enabled !== undefined && typeof config.scriptExtensions.enabled !== 'boolean') {
        missing.push("  - 'scriptExtensions': El campo 'enabled' debe ser un booleano estricto (true o false).");
    }
    if (config.scriptExtensions?.enforceTypeScript !== undefined && typeof config.scriptExtensions.enforceTypeScript !== 'boolean') {
        missing.push("  - 'scriptExtensions': El campo 'enforceTypeScript' debe ser un booleano estricto (true o false).");
    }
}
function checkConstantsSubsystem(config, missing) {
    if (config.constants?.exemptGlobs) {
        try {
            validateConstantsExemptGlobs(config.constants.exemptGlobs);
        }
        catch (err) {
            missing.push(`  - 'constants': ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
export function checkInfrastructureSubsystems(config, missing) {
    checkPersistenceSubsystem(config, missing);
    checkCoverageAndBundleSubsystem(config, missing);
    checkPackageGovernanceSubsystem(config, missing);
    checkConstantsSubsystem(config, missing);
}
export function checkUiSubsystems(config, missing) {
    if (typeof config.styles?.zLayersEnabled !== 'boolean') {
        missing.push("  - 'styles': El campo 'zLayersEnabled' debe ser booleano (true o false).");
    }
    if (typeof config.templates?.requireInputIds !== 'boolean') {
        missing.push("  - 'templates': El campo 'requireInputIds' debe ser booleano (true o false).");
    }
    if (typeof config.agentPlugin?.enabled !== 'boolean') {
        missing.push("  - 'agentPlugin': El campo 'enabled' debe ser booleano (true o false).");
    }
    if (config.fallow?.maxTargetPriority !== undefined) {
        const val = config.fallow.maxTargetPriority;
        const isValidString = typeof val === 'string' && FALLOW_TARGET_PRIORITIES.some(p => p === val);
        const isValidNumber = typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 100;
        if (!isValidString && !isValidNumber) {
            missing.push(`  - 'fallow': Prioridad de objetivo no válida ('${val}'). Debe ser un número (0-100) o una de: ${FALLOW_TARGET_PRIORITIES.join(' | ')}.`);
        }
    }
    if (config.runner?.maxStalenessMinutes !== undefined && config.runner.maxStalenessMinutes <= 0) {
        missing.push("  - 'runner': 'maxStalenessMinutes' debe ser un número positivo mayor a 0.");
    }
}
export function checkSubsystemDeclarations(config) {
    const missing = [];
    checkInfrastructureSubsystems(config, missing);
    checkUiSubsystems(config, missing);
    return missing;
}
/**
 * Validates that all required subsystems have valid active or explicitly disabled settings.
 * Enforces the "Active by Default Subsystem Mandate & Zero Silent Skips".
 */
export function assertAuditConfigComplete(config) {
    const missing = checkSubsystemDeclarations(config);
    if (missing.length > 0) {
        throw new Error(`[AuditConfig] Configuración inválida o incompleta en audit.config.ts (Mandato de Configuración Activa por Defecto):\n` +
            missing.join('\n') +
            `\n\nTodos los subsistemas deben estar correctamente configurados (activos por defecto o desactivados con enabled: false o engine: 'none').`);
    }
}
/** Fails loudly when a configuration still lives at the project root (pre-`.auditor/` layout). */
export function assertNoLegacyRootConfig(projectRoot) {
    const legacy = LEGACY_ROOT_CONFIG_FILES.filter(f => fs.existsSync(path.resolve(projectRoot, f)));
    if (legacy.length > 0) {
        throw new Error(`[AuditConfig] Root-level ${legacy.join(', ')} is no longer supported: auditor configuration lives in '${AUDITOR_DIR}/'. ` +
            `Run 'auditor fix' (or 'npm run auditor:fix') to move it to '${AUDIT_CONFIG_FILE}' and rewrite its relative imports.`);
    }
}
//# sourceMappingURL=auditConfigValidators.js.map