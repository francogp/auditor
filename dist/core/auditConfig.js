/**
 * packages/auditor/src/core/auditConfig.ts
 *
 * UNIFIED AUDIT ENGINE CONFIGURATION (Node.js 26+)
 * Canonical configuration contract, schema defaults, loader, and accessor for the generic auditor.
 */
var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export const DEFAULT_AUDIT_CONFIG = {
    name: 'Generic Project',
    paths: {
        srcRoots: ['src'],
        testRoots: ['tests'],
        e2eRoots: ['tests/e2e'],
        integrationRoots: ['tests/integration'],
        migrationsDir: 'supabase/migrations',
        scriptsRoots: ['scripts'],
        codeRoots: ['src', 'scripts'],
        cliRoots: ['src/cli'],
        dataRoots: ['src/data'],
        constantsRoots: ['src/constants'],
        componentsRoots: ['src/components'],
        viewsRoots: ['src/views'],
        storesRoots: ['src/stores'],
        composablesRoots: ['src/composables'],
        typesRoots: ['src/types'],
        stylesRoots: ['src/styles'],
        logicRoots: ['src/logic'],
        exemptFiles: [],
        includeTestsInCodeAudit: false,
        ignoreGlobs: [],
        ignoredDirs: [],
        ignoredPatterns: []
    },
    persistence: {
        engine: 'supabase',
        schemaQualified: true,
        authorizedSaveFiles: [],
        saveKeyPrefixes: [],
        supabaseDir: 'supabase',
        dockerContainer: 'supabase-db'
    },
    domain: {
        timezoneVariable: 'APP_TIMEZONE',
        finiteDomainTypes: [],
        infraIdWhitelist: [],
        fallbackIdPatterns: [],
        o1CatalogPatterns: [],
        allowedNumericConstantPrefixes: [
            'GEN_', 'ISO_', 'UTF_8', 'BASE_64', 'RGB_', 'RGBA_', 'WASM_', 'HTML_5', 'CSS_3', 'HTTP_', 'D3_'
        ]
    },
    templates: {
        requireInputIds: false
    },
    styles: {
        globalUtilityClasses: [],
        canonicalButtonVariants: [],
        heavyEffectPaths: []
    },
    bundle: {
        statsFile: 'scratch/bundle_stats.html',
        distDir: 'dist/assets',
        exemptChunkPrefixes: [],
        maxClientChunkWarnBytes: 1200 * 1024,
        maxClientChunkErrorBytes: 2000 * 1024,
        budgets: [],
        duplicateModuleThresholdBytes: 500 * 1024,
        topModulesLimit: 15
    },
    agentPlugin: {
        enabled: true
    },
    security: {
        enabled: true
    },
    fallow: {
        enabled: true,
        security: {
            enabled: true
        },
        enforceTargets: false,
        maxTargetPriority: 'critical',
        similarCode: {
            enabled: false,
            threshold: 0.95,
            ignoreSameFile: true,
            minLines: 3
        }
    },
    constants: {
        ignoredNames: [],
        exemptMagicNumbers: [],
        allowedNumericPrefixes: []
    },
    customFamilies: [],
    extensions: [],
    presets: {}
};
let cachedConfig = null;
let cachedProjectRoot = null;
function collectDeclaredSubsystems(config) {
    const declared = new Set();
    const keys = ['persistence', 'domain', 'styles', 'templates', 'bundle', 'agentPlugin', 'security', 'fallow'];
    for (const k of keys) {
        if (config[k] !== undefined)
            declared.add(k);
    }
    return declared;
}
function buildPathsConfig(raw) {
    const p = raw ?? {};
    return {
        ...DEFAULT_AUDIT_CONFIG.paths,
        ...p,
        cliRoots: p.cliRoots ?? DEFAULT_AUDIT_CONFIG.paths.cliRoots,
        testFilePatterns: p.testFilePatterns ?? [],
        testFragmentationWhitelist: p.testFragmentationWhitelist ?? []
    };
}
function buildPersistenceConfig(raw) {
    const p = raw ?? {};
    return {
        ...DEFAULT_AUDIT_CONFIG.persistence,
        ...p,
        forbiddenMockModules: p.forbiddenMockModules ?? [],
        positionalArrayColumns: p.positionalArrayColumns ?? [],
        allowedDatabaseDirs: p.allowedDatabaseDirs ?? [],
        allowedDatabaseFiles: p.allowedDatabaseFiles ?? [],
        allowedHosts: p.allowedHosts ?? ['localhost', '127.0.0.1'],
        prohibitedTemplateIdentifiers: p.prohibitedTemplateIdentifiers ?? []
    };
}
function buildDomainConfig(raw) {
    const d = raw ?? {};
    return {
        ...DEFAULT_AUDIT_CONFIG.domain,
        ...d,
        enabled: d.enabled ?? true,
        o1CatalogPatterns: d.o1CatalogPatterns ?? [],
        caseNormalizationExemptTokens: d.caseNormalizationExemptTokens ?? [],
        allowedStoreSetterPrefixes: d.allowedStoreSetterPrefixes ?? ['set', 'update', 'clear'],
        allowedNumericConstantPrefixes: d.allowedNumericConstantPrefixes ?? DEFAULT_AUDIT_CONFIG.domain?.allowedNumericConstantPrefixes ?? []
    };
}
function buildTemplatesConfig(raw) {
    const t = raw ?? {};
    return {
        ...DEFAULT_AUDIT_CONFIG.templates,
        ...t,
        tooltipComponents: t.tooltipComponents ?? [],
        forbiddenTemplateCallPatterns: t.forbiddenTemplateCallPatterns ?? [],
        safeTemplateFunctions: t.safeTemplateFunctions ?? []
    };
}
function buildStylesConfig(raw) {
    const s = raw ?? {};
    return {
        globalUtilityClasses: s.globalUtilityClasses ?? [],
        canonicalButtonVariants: s.canonicalButtonVariants ?? [],
        zLayersEnabled: s.zLayersEnabled,
        zLayersScssFile: s.zLayersScssFile,
        baseScssFile: s.baseScssFile ?? s.zLayersScssFile,
        zLayersTsFile: s.zLayersTsFile,
        zLayers: s.zLayers,
        lineHeightOverlapCheck: s.lineHeightOverlapCheck ?? true,
        heavyEffectPaths: s.heavyEffectPaths ?? [],
        buttonGovernance: s.buttonGovernance
    };
}
function buildBundleConfig(raw) {
    const b = raw ?? {};
    return {
        enabled: b.enabled,
        statsFile: b.statsFile ?? DEFAULT_AUDIT_CONFIG.bundle?.statsFile,
        distDir: b.distDir ?? DEFAULT_AUDIT_CONFIG.bundle?.distDir,
        exemptChunkPrefixes: b.exemptChunkPrefixes ?? [],
        maxClientChunkWarnBytes: b.maxClientChunkWarnBytes ?? DEFAULT_AUDIT_CONFIG.bundle?.maxClientChunkWarnBytes,
        maxClientChunkErrorBytes: b.maxClientChunkErrorBytes ?? DEFAULT_AUDIT_CONFIG.bundle?.maxClientChunkErrorBytes,
        budgets: b.budgets ?? [],
        duplicateModuleThresholdBytes: b.duplicateModuleThresholdBytes ?? DEFAULT_AUDIT_CONFIG.bundle?.duplicateModuleThresholdBytes,
        topModulesLimit: b.topModulesLimit ?? DEFAULT_AUDIT_CONFIG.bundle?.topModulesLimit,
        forbiddenUiImports: b.forbiddenUiImports ?? []
    };
}
function buildAgentAndSecurityConfig(config) {
    const secEnabled = config.fallow?.security?.enabled ?? config.security?.enabled ?? DEFAULT_AUDIT_CONFIG.security?.enabled ?? true;
    return {
        agentPlugin: {
            enabled: config.agentPlugin?.enabled ?? DEFAULT_AUDIT_CONFIG.agentPlugin?.enabled ?? true
        },
        security: {
            enabled: secEnabled
        },
        animation: {
            customTimerFunctions: config.animation?.customTimerFunctions ?? []
        }
    };
}
function buildConstantsAndDocConfig(config) {
    const c = config.constants;
    return {
        constants: {
            ignoredNames: c?.ignoredNames ?? [],
            exemptMagicNumbers: c?.exemptMagicNumbers ?? [],
            allowedNumericPrefixes: c?.allowedNumericPrefixes ?? []
        },
        documentation: {
            knownValidAbstractPaths: config.documentation?.knownValidAbstractPaths ?? [],
            skillsRoots: config.documentation?.skillsRoots ?? []
        },
        pinia: {
            authorizedMutationFiles: config.pinia?.authorizedMutationFiles ?? []
        },
        e2e: {
            idLocatorsOnly: config.e2e?.idLocatorsOnly ?? false
        }
    };
}
function buildFallowSimilarCodeConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.fallow?.similarCode;
    const s = raw ?? {};
    return {
        enabled: s.enabled ?? def?.enabled ?? false,
        threshold: s.threshold ?? def?.threshold ?? 0.95,
        ignoreSameFile: s.ignoreSameFile ?? def?.ignoreSameFile ?? true,
        minLines: s.minLines ?? def?.minLines ?? 3
    };
}
function buildFallowConfig(raw, rootSecurity) {
    const def = DEFAULT_AUDIT_CONFIG.fallow;
    const f = raw ?? {};
    const secEnabled = f.security?.enabled ?? rootSecurity?.enabled ?? def?.security?.enabled ?? true;
    return {
        enabled: f.enabled ?? def?.enabled ?? true,
        security: {
            enabled: secEnabled
        },
        enforceTargets: f.enforceTargets ?? def?.enforceTargets ?? false,
        maxTargetPriority: f.maxTargetPriority ?? def?.maxTargetPriority ?? 'critical',
        similarCode: buildFallowSimilarCodeConfig(f.similarCode)
    };
}
export function defineAuditConfig(config) {
    const declared = collectDeclaredSubsystems(config);
    const agentAndSecurity = buildAgentAndSecurityConfig(config);
    const constantsAndDoc = buildConstantsAndDocConfig(config);
    return {
        name: config.name,
        paths: buildPathsConfig(config.paths),
        persistence: buildPersistenceConfig(config.persistence),
        domain: buildDomainConfig(config.domain),
        templates: buildTemplatesConfig(config.templates),
        styles: buildStylesConfig(config.styles),
        bundle: buildBundleConfig(config.bundle),
        fallow: buildFallowConfig(config.fallow, config.security),
        ...agentAndSecurity,
        ...constantsAndDoc,
        customFamilies: config.customFamilies ?? [],
        extensions: config.extensions ?? [],
        presets: config.presets ?? {},
        _declaredSubsystems: declared
    };
}
function checkInfrastructureSubsystems(declared, config, missing) {
    if (!declared?.has('persistence') || !config.persistence?.engine) {
        missing.push("  - 'persistence': Debe declarar explícitamente 'persistence: { engine: \"supabase\" | \"sqlite\" | \"postgres\" | \"hybrid\" | \"none\" }'.");
    }
    if (!declared?.has('bundle') || config.bundle?.enabled === undefined) {
        missing.push("  - 'bundle': Debe declarar explícitamente 'bundle: { enabled: true }' (con 'exemptChunkPrefixes' si aplica) o 'bundle: { enabled: false }'.");
    }
}
function checkUiSubsystems(declared, config, missing) {
    const s = config.styles;
    const hasZStyles = s?.zLayersEnabled !== undefined || s?.zLayersScssFile || (s?.globalUtilityClasses && s.globalUtilityClasses.length > 0);
    if (!declared?.has('styles') || !hasZStyles) {
        missing.push("  - 'styles': Debe declarar explícitamente 'styles: { zLayersEnabled: true, zLayersScssFile: \"...\" }' o 'styles: { zLayersEnabled: false }'.");
    }
    if (!declared?.has('templates') || config.templates?.requireInputIds === undefined) {
        missing.push("  - 'templates': Debe declarar explícitamente 'templates: { requireInputIds: false }' o 'templates: { requireInputIds: true }'.");
    }
    if (!declared?.has('agentPlugin') || config.agentPlugin?.enabled === undefined) {
        missing.push("  - 'agentPlugin': Debe declarar explícitamente 'agentPlugin: { enabled: true }' o 'agentPlugin: { enabled: false }'.");
    }
}
function checkSubsystemDeclarations(config) {
    const declared = config._declaredSubsystems;
    const missing = [];
    checkInfrastructureSubsystems(declared, config, missing);
    checkUiSubsystems(declared, config, missing);
    return missing;
}
/**
 * Validates that all required subsystems are explicitly declared in audit.config.ts.
 * Enforces the "Mandato de Configuración Explícita y Cero Omisiones Silenciosas".
 */
export function assertAuditConfigComplete(config) {
    const missing = checkSubsystemDeclarations(config);
    if (missing.length > 0) {
        throw new Error(`[AuditConfig] Configuración obligatoria incompleta en audit.config.ts (Mandato de Configuración Explícita y Cero Omisiones Silenciosas):\n` +
            missing.join('\n') +
            `\n\nTodos los subsistemas deben estar explícitamente configurados (activos o ignorados con enabled: false o engine: 'none').`);
    }
}
function tryLoadJsonConfig(jsonConfigPath, projectRoot, logWarning = false) {
    if (!fs.existsSync(jsonConfigPath))
        return null;
    try {
        const content = fs.readFileSync(jsonConfigPath, 'utf-8');
        const parsed = JSON.parse(content);
        cachedConfig = defineAuditConfig(parsed);
        cachedProjectRoot = projectRoot;
        return cachedConfig;
    }
    catch (err) {
        if (logWarning) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[AuditConfig] Warning: Failed to load audit.config.json: ${msg}. Using defaults.`);
        }
        return null;
    }
}
/**
 * Synchronously loads audit.config.ts or audit.config.json if possible, or falls back to defaults.
 */
export async function loadAuditConfig(projectRoot = process.cwd()) {
    if (cachedConfig && cachedProjectRoot === projectRoot)
        return cachedConfig;
    const customConfig = process.env.AUDIT_CONFIG;
    const configPath = customConfig ? path.resolve(projectRoot, customConfig) : path.resolve(projectRoot, 'audit.config.ts');
    const jsonConfigPath = path.resolve(projectRoot, 'audit.config.json');
    if (fs.existsSync(configPath)) {
        try {
            const fileUrl = pathToFileURL(configPath).href;
            const mod = (await import(__rewriteRelativeImportExtension(fileUrl)));
            if (mod.default) {
                cachedConfig = defineAuditConfig(mod.default);
                cachedProjectRoot = projectRoot;
                return cachedConfig;
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[AuditConfig] Warning: Failed to load audit.config.ts: ${msg}. Using defaults.`);
        }
    }
    else {
        const loaded = tryLoadJsonConfig(jsonConfigPath, projectRoot, true);
        if (loaded)
            return loaded;
    }
    cachedConfig = DEFAULT_AUDIT_CONFIG;
    cachedProjectRoot = projectRoot;
    return cachedConfig;
}
/**
 * Returns current configuration or default if not yet loaded.
 */
export function getAuditConfig(projectRoot = process.cwd()) {
    if (cachedConfig && (!cachedProjectRoot || cachedProjectRoot === projectRoot)) {
        return cachedConfig;
    }
    const jsonConfigPath = path.resolve(projectRoot, 'audit.config.json');
    const loaded = tryLoadJsonConfig(jsonConfigPath, projectRoot, false);
    if (loaded)
        return loaded;
    return cachedConfig ?? DEFAULT_AUDIT_CONFIG;
}
/**
 * Manually sets the active configuration in memory (useful for tests or custom runners).
 */
export function setAuditConfig(config, projectRoot = process.cwd()) {
    cachedConfig = config;
    cachedProjectRoot = projectRoot;
}
/**
 * For testing purposes: resets the cached config.
 */
export function resetAuditConfig() {
    cachedConfig = null;
    cachedProjectRoot = null;
}
/**
 * Helper to check if a normalized path matches any of the given root directories.
 */
export function matchesAnyRoot(normalizedPath, roots) {
    if (!normalizedPath || !roots || roots.length === 0)
        return false;
    return roots.some(root => {
        const cleanRoot = root.replace(/^\/+|\/+$/g, '').toLowerCase();
        return cleanRoot !== '' && (normalizedPath === cleanRoot ||
            normalizedPath.startsWith(cleanRoot + '/') ||
            normalizedPath.includes('/' + cleanRoot + '/'));
    });
}
/**
 * Determines whether a file path belongs to a test, spec, mock, or e2e directory
 * driven dynamically by the project's audit.config.ts configuration.
 */
export function isTestPath(filePath) {
    if (!filePath)
        return false;
    const norm = filePath.split('\\').join('/').toLowerCase();
    const base = norm.split('/').pop() || '';
    if (base.includes('.test.') || base.includes('.spec.')) {
        return true;
    }
    const config = getAuditConfig();
    const customTestPatterns = config?.paths?.testFilePatterns ?? [];
    if (customTestPatterns.some(pat => base.includes(pat.toLowerCase()))) {
        return true;
    }
    const configuredRoots = [
        ...(config.paths.testRoots ?? []),
        ...(config.paths.e2eRoots ?? []),
        ...(config.paths.integrationRoots ?? [])
    ];
    if (matchesAnyRoot(norm, configuredRoots)) {
        return true;
    }
    if (configuredRoots.length === 0 && (norm.startsWith('tests/') || norm.includes('/tests/'))) {
        return true;
    }
    return false;
}
/**
 * Determines whether a file path belongs to a data catalog directory (e.g. static game data,
 * catalogs, domain fixtures) configured in paths.dataRoots.
 */
export function isDataPath(filePath) {
    if (!filePath)
        return false;
    const norm = filePath.split('\\').join('/').toLowerCase();
    const config = getAuditConfig();
    const dataRoots = config?.paths?.dataRoots ?? ['src/data'];
    return matchesAnyRoot(norm, dataRoots);
}
/**
 * Determines whether a file path belongs to a constants definition directory or module
 * configured in paths.constantsRoots or located within a /constants/ directory.
 */
export function isConstantsPath(filePath) {
    if (!filePath)
        return false;
    const norm = filePath.split('\\').join('/').toLowerCase();
    if (norm.includes('/constants/') || norm.startsWith('constants/')) {
        return true;
    }
    const config = getAuditConfig();
    const constantsRoots = config?.paths?.constantsRoots ?? ['src/constants'];
    return matchesAnyRoot(norm, constantsRoots);
}
/**
 * Checks whether a file path belongs to an explicitly exempt file in paths.exemptFiles.
 */
export function isExemptFile(filePath, config = getAuditConfig()) {
    if (!filePath)
        return false;
    const norm = filePath.split('\\').join('/').toLowerCase();
    const exemptFiles = config?.paths?.exemptFiles ?? [];
    return exemptFiles.some(f => {
        const clean = f.replace(/^\/+|\/+$/g, '').toLowerCase();
        return norm === clean || norm.endsWith('/' + clean);
    });
}
/**
 * Determines whether a file path belongs to codeRoots configured for general code audits,
 * dynamically respecting whether test directories are included or excluded.
 */
export function isInCodeRoots(filePath, config = getAuditConfig()) {
    if (!filePath)
        return false;
    const norm = filePath.split('\\').join('/').toLowerCase();
    if (norm.includes('node_modules'))
        return false;
    const codeRoots = config?.paths?.codeRoots ?? ['src', 'scripts'];
    if (!matchesAnyRoot(norm, codeRoots))
        return false;
    // When includeTestsInCodeAudit is true, or codeRoots explicitly includes a testRoot, tests ARE audited!
    const includesTests = config?.paths?.includeTestsInCodeAudit === true ||
        (config?.paths?.testRoots ?? []).some(tr => codeRoots.includes(tr));
    if (!includesTests && isTestPath(filePath)) {
        return false;
    }
    return true;
}
/**
 * Checks whether a file path belongs to scriptsRoots.
 */
export function isScriptPath(filePath, config = getAuditConfig()) {
    if (!filePath)
        return false;
    const norm = filePath.split('\\').join('/').toLowerCase();
    const scriptsRoots = config?.paths?.scriptsRoots ?? ['scripts'];
    return matchesAnyRoot(norm, scriptsRoots);
}
/**
 * Checks whether a file path belongs to srcRoots.
 */
export function isSrcPath(filePath, config = getAuditConfig()) {
    if (!filePath)
        return false;
    const norm = filePath.split('\\').join('/').toLowerCase();
    const srcRoots = config?.paths?.srcRoots ?? ['src'];
    return matchesAnyRoot(norm, srcRoots);
}
/**
 * Checks whether a file path belongs to cliRoots.
 */
export function isCliPath(filePath, config = getAuditConfig()) {
    if (!filePath)
        return false;
    const norm = filePath.split('\\').join('/').toLowerCase();
    const cliRoots = config?.paths?.cliRoots ?? ['src/cli'];
    return matchesAnyRoot(norm, cliRoots);
}
/**
 * Resolves the primary SCSS file path for Z-Layers from config or stylesRoots.
 */
export function resolveZLayersScssPath(projectRoot = process.cwd()) {
    const config = getAuditConfig(projectRoot);
    const rawTarget = config.styles?.zLayersScssFile ?? config.styles?.baseScssFile;
    if (rawTarget) {
        const configuredPath = path.resolve(projectRoot, rawTarget);
        if (fs.existsSync(configuredPath))
            return configuredPath;
    }
    const stylesRoots = config.paths?.stylesRoots ?? ['src/styles'];
    const baseNames = ['_base.scss', 'core/_base.scss', 'base.scss', 'main.scss', 'index.scss'];
    for (const r of stylesRoots) {
        for (const b of baseNames) {
            const candidate = path.resolve(projectRoot, r, b);
            if (fs.existsSync(candidate))
                return candidate;
        }
    }
    return undefined;
}
/**
 * Canonical fallback Z-Layers scale matching framework standards.
 */
export const Z_LAYERS = Object.freeze({
    BASE: 0,
    LOW: 50,
    CONTENT: 100,
    HEADER: 500,
    SIDEBAR: 800,
    HUD: 1000,
    NAVIGATION: 5000,
    DROPDOWN: 7000,
    OVERLAY: 10000,
    MODAL: 11000,
    MODAL_STEP: 10,
    TOOLTIP: 15000,
    TOAST: 20000,
    MAX: 100000,
    CRITICAL: 999999
});
function parseZLayersFromTs(tsPath) {
    if (!fs.existsSync(tsPath))
        return null;
    try {
        const content = fs.readFileSync(tsPath, 'utf-8');
        const objMatch = content.match(/(?:export\s+)?const\s+Z_LAYERS\s*=\s*\{([\s\S]*?)\}(?:\s*as\s+const)?\s*;/);
        if (!objMatch?.[1])
            return null;
        const parsed = {};
        for (const line of objMatch[1].split('\n')) {
            const propMatch = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(-?\d+)/);
            if (propMatch?.[1] && propMatch[2]) {
                parsed[propMatch[1]] = parseInt(propMatch[2], 10);
            }
        }
        return Object.keys(parsed).length > 0 ? parsed : null;
    }
    catch {
        // catch-ok: Fallback to default on read or parse failure
        return null;
    }
}
/**
 * Resolves the effective Z-Layers dictionary from config.styles.zLayers,
 * or by parsing the TypeScript file defined in config.styles.zLayersTsFile or config.domain.zLayersFile,
 * or falls back to the default Z_LAYERS.
 */
export function getEffectiveZLayers(projectRoot = process.cwd()) {
    const config = getAuditConfig(projectRoot);
    if (config.styles?.zLayers && Object.keys(config.styles.zLayers).length > 0) {
        return config.styles.zLayers;
    }
    const rawTsTarget = config.styles?.zLayersTsFile ?? config.domain?.zLayersFile;
    if (rawTsTarget) {
        const parsed = parseZLayersFromTs(path.resolve(projectRoot, rawTsTarget));
        if (parsed)
            return parsed;
    }
    return Z_LAYERS;
}
//# sourceMappingURL=auditConfig.js.map