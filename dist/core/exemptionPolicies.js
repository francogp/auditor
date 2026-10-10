/**
 * src/core/exemptionPolicies.ts
 *
 * EXEMPTION POLICY REGISTRY (Node.js 26+ Native)
 * Single registry of every path-based policy that silences rules for a set of files.
 * `validate_audit_coverage` replays these policies over every tracked file to report
 * DEGRADED coverage: files that are scanned but have rules silenced by configuration.
 *
 * - `configured` policies depend on host configuration and degrade coverage unless acknowledged
 *   through `coverage.acknowledgedDegradations`.
 * - `structural` policies are framework design (e.g. tests are not production code) and only
 *   appear in the coverage map for transparency.
 */
import { ACKNOWLEDGEABLE_EXEMPTION_POLICIES, getAuditConfig, isCliPath, isDataPath, isDemoPath, isExemptFile, isScriptPath, isTestPath } from "./auditConfig.js";
export const STRUCTURAL_EXEMPTION_POLICIES = ['test'];
export const EXEMPTION_POLICY_IDS = [...ACKNOWLEDGEABLE_EXEMPTION_POLICIES, ...STRUCTURAL_EXEMPTION_POLICIES];
export const EXEMPTION_POLICY_KINDS = ['configured', 'structural'];
export function isCodeFile(relPosixPath) {
    return /\.(?:ts|tsx|js|jsx|mjs|cjs|vue)$/i.test(relPosixPath);
}
export const EXEMPTION_POLICIES = [
    {
        id: 'cli',
        kind: 'configured',
        configKey: 'paths.cliRoots',
        silences: 'consola, seguridad CWE y reglas de producción',
        matches: (p, config) => isCodeFile(p) && isCliPath(p, config)
    },
    {
        id: 'scripts',
        kind: 'configured',
        configKey: 'paths.scriptsRoots',
        silences: 'consola, constantes duplicadas y reglas de producción',
        matches: (p, config) => isCodeFile(p) && isScriptPath(p, config)
    },
    {
        id: 'data',
        kind: 'configured',
        configKey: 'paths.dataRoots',
        silences: 'complejidad, LOC y números mágicos',
        matches: p => isCodeFile(p) && isDataPath(p)
    },
    {
        id: 'demo',
        kind: 'configured',
        configKey: 'paths.demoRoots',
        silences: 'complejidad, LOC y números mágicos',
        matches: p => isCodeFile(p) && isDemoPath(p)
    },
    {
        id: 'exemptFiles',
        kind: 'configured',
        configKey: 'paths.exemptFiles',
        silences: 'reglas de dominio, fechas y timezone',
        matches: (p, config) => isCodeFile(p) && isExemptFile(p, config)
    },
    {
        id: 'test',
        kind: 'structural',
        configKey: 'paths.testRoots',
        silences: 'reglas de código de producción',
        matches: p => isCodeFile(p) && isTestPath(p)
    }
];
/** Every policy matching the given file, in registry order. */
export function getMatchingExemptionPolicies(relPosixPath, config = getAuditConfig()) {
    return EXEMPTION_POLICIES.filter(policy => policy.matches(relPosixPath, config));
}
//# sourceMappingURL=exemptionPolicies.js.map