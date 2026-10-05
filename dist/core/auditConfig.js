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
/**
 * Normalizes and cleans file paths safely using Node.js native path primitives.
 */
export function sanitizePath(inputPath) {
    if (!inputPath || typeof inputPath !== 'string')
        return '';
    return path.normalize(inputPath.trim());
}
export const DEFAULT_MAX_AUDIT_STALENESS_MINUTES = 5;
/** Exemption policies whose silencing can be acknowledged (configured, not structural). */
export const ACKNOWLEDGEABLE_EXEMPTION_POLICIES = ['cli', 'scripts', 'data', 'demo', 'exemptFiles'];
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
        demoRoots: [],
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
        dockerContainer: 'supabase-db',
        allowedDatabaseDirs: ['backups', 'migrations', 'schemas'],
        allowedDatabaseFiles: ['AGENTS.md', '.gitkeep'],
        exemptRlsTables: ['_migrations', 'schema_migrations', 'supabase_migrations']
    },
    domain: {
        enabled: true,
        timezoneVariable: 'APP_TIMEZONE',
        finiteDomainTypes: [],
        infraIdWhitelist: [],
        fallbackIdPatterns: [],
        o1CatalogPatterns: [],
        allowedNumericConstantPrefixes: [
            'GEN_', 'ISO_', 'UTF_8', 'BASE_64', 'RGB_', 'RGBA_', 'WASM_', 'HTML_5', 'CSS_3', 'HTTP_', 'D3_'
        ],
        caseNormalizationExemptTokens: [],
        allowedStoreSetterPrefixes: ['set', 'update', 'clear']
    },
    gitIgnore: {
        enabled: true,
        extraRequiredEntries: []
    },
    templates: {
        requireInputIds: true
    },
    styles: {
        globalUtilityClasses: [],
        canonicalButtonVariants: [],
        heavyEffectPaths: [],
        zLayersEnabled: true,
        lineHeightOverlapCheck: true,
        stylelint: {
            enabled: true,
            rules: {},
            ignoreGlobs: []
        }
    },
    stylelint: {
        enabled: true,
        rules: {},
        ignoreGlobs: []
    },
    eslint: {
        enabled: true
    },
    bundle: {
        enabled: true,
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
    documentation: {
        knownValidAbstractPaths: [],
        skillsRoots: [],
        allowedNpxBinaries: []
    },
    fallow: {
        enabled: true,
        security: {
            enabled: true
        },
        enforceTargets: false,
        maxTargetPriority: 'critical',
        similarCode: {
            enabled: true,
            threshold: 0.95,
            ignoreSameFile: true,
            minLines: 3
        },
        flags: {
            enabled: true,
            trackRetirement: true
        },
        coverage: {
            enabled: true
        }
    },
    constants: {
        ignoredNames: [],
        exemptMagicNumbers: [],
        allowedNumericPrefixes: [],
        exemptGlobs: []
    },
    packageHygiene: {
        enabled: true,
        ignoreDependencies: [],
        ignoreBinaries: []
    },
    packageDistribution: {
        enabled: false,
        level: 'warning'
    },
    packageScripts: {
        enabled: true,
        enforceBuildAudit: true,
        recommendedScripts: true,
        extraRequiredScripts: []
    },
    accessibility: {
        enabled: true,
        rules: {}
    },
    typeCoverage: {
        enabled: true,
        atLeast: 95,
        strict: true,
        ignoreFiles: []
    },
    version: {
        enabled: true,
        autoSyncPublicVersionJson: true,
        syncTargets: []
    },
    coverage: {
        enabled: true,
        exemptGlobs: [],
        acknowledgedDegradations: []
    },
    customFamilies: [],
    extensions: [],
    presets: {},
    runner: {
        timeoutMs: 0,
        maxStalenessMinutes: DEFAULT_MAX_AUDIT_STALENESS_MINUTES
    }
};
let cachedConfig = null;
let cachedProjectRoot = null;
function collectDeclaredSubsystems(config) {
    const declared = new Set(config._declaredSubsystems ?? []);
    const keys = [
        'persistence',
        'domain',
        'styles',
        'templates',
        'bundle',
        'agentPlugin',
        'security',
        'fallow',
        'packageDistribution',
        'packageHygiene',
        'accessibility',
        'typeCoverage',
        'version'
    ];
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
        allowedDatabaseDirs: p.allowedDatabaseDirs && p.allowedDatabaseDirs.length > 0
            ? Array.from(new Set(['backups', 'migrations', 'schemas', ...p.allowedDatabaseDirs]))
            : ['backups', 'migrations', 'schemas'],
        allowedDatabaseFiles: p.allowedDatabaseFiles && p.allowedDatabaseFiles.length > 0
            ? Array.from(new Set(['AGENTS.md', '.gitkeep', ...p.allowedDatabaseFiles]))
            : ['AGENTS.md', '.gitkeep'],
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
        requireInputIds: t.requireInputIds ?? DEFAULT_AUDIT_CONFIG.templates?.requireInputIds ?? true,
        tooltipComponents: t.tooltipComponents ?? [],
        forbiddenTemplateCallPatterns: t.forbiddenTemplateCallPatterns ?? [],
        safeTemplateFunctions: t.safeTemplateFunctions ?? []
    };
}
function buildStylesConfig(raw, rawStylelintTop) {
    const s = raw ?? {};
    const rawSl = s.stylelint ?? rawStylelintTop;
    const parsedRules = rawSl?.rules ? { ...rawSl.rules } : undefined;
    const stylelint = {
        enabled: rawSl?.enabled ?? DEFAULT_AUDIT_CONFIG.styles?.stylelint?.enabled ?? true,
        configFile: rawSl?.configFile,
        rules: parsedRules,
        ignoreGlobs: rawSl?.ignoreGlobs ? [...rawSl.ignoreGlobs] : []
    };
    return {
        globalUtilityClasses: s.globalUtilityClasses ?? [],
        canonicalButtonVariants: s.canonicalButtonVariants ?? [],
        zLayersEnabled: s.zLayersEnabled ?? DEFAULT_AUDIT_CONFIG.styles?.zLayersEnabled ?? true,
        zLayersScssFile: s.zLayersScssFile,
        baseScssFile: s.baseScssFile ?? s.zLayersScssFile,
        zLayersTsFile: s.zLayersTsFile,
        zLayers: s.zLayers,
        lineHeightOverlapCheck: s.lineHeightOverlapCheck ?? DEFAULT_AUDIT_CONFIG.styles?.lineHeightOverlapCheck ?? true,
        heavyEffectPaths: s.heavyEffectPaths ?? [],
        buttonGovernance: s.buttonGovernance,
        stylelint
    };
}
function buildBundleConfig(raw) {
    const b = raw ?? {};
    return {
        enabled: b.enabled ?? DEFAULT_AUDIT_CONFIG.bundle?.enabled ?? true,
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
export const FORBIDDEN_PRODUCTION_ROOTS = [
    'src/logic',
    'src/domain',
    'src/stores',
    'src/components',
    'src/views',
    'src/composables',
    'src/services',
    'src/models',
    'src/controllers',
    'src/api',
    'src/server'
];
export const MAX_CONSTANTS_EXEMPT_GLOBS = 15;
export function validateConstantsExemptGlobs(globs) {
    if (globs.length > MAX_CONSTANTS_EXEMPT_GLOBS) {
        throw new Error(`[AuditConfig Anti-Abuse] 'constants.exemptGlobs' excede el límite máximo de ${MAX_CONSTANTS_EXEMPT_GLOBS} patrones (${globs.length} configurados).\n` +
            `No abuses de las excepciones. Si tienes tantas incidencias, extrae constantes nominadas descriptivas o usa fábricas de prueba.`);
    }
    for (const rawGlob of globs) {
        const glob = rawGlob.trim().replace(/\\/g, '/');
        // 1. Universal wildcards check
        if (!glob ||
            glob === '*' ||
            glob === '**' ||
            glob === '*.*' ||
            glob === '.*' ||
            /^src(?:\/\*+|\/)?$/i.test(glob) ||
            /^scripts(?:\/\*+|\/)?$/i.test(glob) ||
            /^\*+\/\*+$/.test(glob)) {
            throw new Error(`[AuditConfig Anti-Abuse] 'constants.exemptGlobs' contiene un comodín global no permitido: '${rawGlob}'.\n` +
                `Está ESTRICTAMENTE PROHIBIDO usar comodines globales ('*', '**', 'src/**', 'scripts/**') para evadir el mandato de números mágicos.`);
        }
        // 2. Production roots check
        const normalizedLower = glob.toLowerCase().replace(/^\/+/, '');
        for (const prodRoot of FORBIDDEN_PRODUCTION_ROOTS) {
            if (normalizedLower === prodRoot ||
                normalizedLower.startsWith(prodRoot + '/') ||
                normalizedLower.includes('/' + prodRoot + '/') ||
                normalizedLower.startsWith('**/' + prodRoot)) {
                throw new Error(`[AuditConfig Anti-Abuse] 'constants.exemptGlobs' contiene una ruta de lógica de producción protegida: '${rawGlob}'.\n` +
                    `Está ESTRICTAMENTE PROHIBIDO eximir directorios de producción (como '${prodRoot}').\n` +
                    `Las excepciones de números mágicos solo están permitidas para scripts de semillas, fixtures o demostraciones aisladas (ej: 'scripts/database/seeds/**', 'ui-demo/**').`);
            }
        }
    }
}
function buildConstantsAndDocConfig(config) {
    const c = config.constants;
    const exemptGlobs = c?.exemptGlobs ? [...c.exemptGlobs] : [];
    if (exemptGlobs.length > 0) {
        validateConstantsExemptGlobs(exemptGlobs);
    }
    return {
        constants: {
            ignoredNames: c?.ignoredNames ?? [],
            exemptMagicNumbers: c?.exemptMagicNumbers ?? [],
            allowedNumericPrefixes: c?.allowedNumericPrefixes ?? [],
            exemptGlobs
        },
        documentation: {
            knownValidAbstractPaths: config.documentation?.knownValidAbstractPaths ?? [],
            skillsRoots: config.documentation?.skillsRoots ?? [],
            allowedNpxBinaries: config.documentation?.allowedNpxBinaries ?? []
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
        enabled: s.enabled ?? def?.enabled ?? true,
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
        similarCode: buildFallowSimilarCodeConfig(f.similarCode),
        flags: {
            enabled: f.flags?.enabled ?? def?.flags?.enabled ?? true,
            maxFlagAgeDays: f.flags?.maxFlagAgeDays ?? def?.flags?.maxFlagAgeDays,
            trackRetirement: f.flags?.trackRetirement ?? def?.flags?.trackRetirement ?? true
        },
        coverage: {
            enabled: f.coverage?.enabled ?? def?.coverage?.enabled ?? true,
            path: f.coverage?.path ?? def?.coverage?.path,
            root: f.coverage?.root ?? def?.coverage?.root
        }
    };
}
function buildPackageHygieneConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.packageHygiene;
    const p = raw ?? {};
    return {
        enabled: p.enabled ?? def?.enabled ?? true,
        ignoreDependencies: p.ignoreDependencies ? [...p.ignoreDependencies] : (def?.ignoreDependencies ?? []),
        ignoreBinaries: p.ignoreBinaries ? [...p.ignoreBinaries] : (def?.ignoreBinaries ?? []),
        entry: p.entry ? [...p.entry] : undefined,
        project: p.project ? [...p.project] : undefined
    };
}
function buildPackageDistributionConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.packageDistribution;
    const p = raw ?? {};
    return {
        enabled: p.enabled ?? def?.enabled ?? false,
        pkgDir: p.pkgDir ?? def?.pkgDir,
        level: p.level ?? def?.level ?? 'warning'
    };
}
function buildPackageScriptsConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.packageScripts;
    const p = raw ?? {};
    if (p.recommendedScripts !== undefined && typeof p.recommendedScripts !== 'boolean') {
        throw new Error(`[AuditConfig] Error de tipo en 'packageScripts.recommendedScripts': se recibió '${String(p.recommendedScripts)}'. ` +
            `Debe ser un valor booleano estricto (true o false). El uso de cadenas como 'off' o 'essential' está estrictamente prohibido.`);
    }
    if (p.enforceBuildAudit !== undefined && typeof p.enforceBuildAudit !== 'boolean') {
        throw new Error(`[AuditConfig] Error de tipo en 'packageScripts.enforceBuildAudit': se recibió '${String(p.enforceBuildAudit)}'. ` +
            `Debe ser un valor booleano estricto (true o false).`);
    }
    return {
        enabled: p.enabled ?? def?.enabled ?? true,
        enforceBuildAudit: p.enforceBuildAudit ?? def?.enforceBuildAudit ?? true,
        recommendedScripts: p.recommendedScripts ?? def?.recommendedScripts ?? true,
        extraRequiredScripts: p.extraRequiredScripts ? [...p.extraRequiredScripts] : (def?.extraRequiredScripts ?? [])
    };
}
function buildAccessibilityConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.accessibility;
    const a = raw ?? {};
    const parsedRules = {};
    const sourceRules = a.rules ?? def?.rules ?? {};
    for (const [key, val] of Object.entries(sourceRules)) {
        if (typeof val !== 'boolean') {
            throw new Error(`[AuditConfig] Error de tipo en 'accessibility.rules.${key}': se recibió '${String(val)}'. ` +
                `Debe ser un valor booleano estricto (true o false). El uso de cadenas como 'off' o 'error' está estrictamente prohibido.`);
        }
        parsedRules[key] = val;
    }
    return {
        enabled: a.enabled ?? def?.enabled ?? true,
        rules: parsedRules
    };
}
function buildTypeCoverageConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.typeCoverage;
    const t = raw ?? {};
    return {
        enabled: t.enabled ?? def?.enabled ?? true,
        atLeast: t.atLeast ?? def?.atLeast ?? 95,
        strict: t.strict ?? def?.strict ?? true,
        ignoreFiles: t.ignoreFiles ? [...t.ignoreFiles] : (def?.ignoreFiles ?? [])
    };
}
function buildGitIgnoreConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.gitIgnore;
    const g = raw ?? {};
    return {
        enabled: g.enabled ?? def?.enabled ?? true,
        extraRequiredEntries: g.extraRequiredEntries ? [...g.extraRequiredEntries] : (def?.extraRequiredEntries ?? [])
    };
}
function buildEslintConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.eslint;
    const e = raw ?? {};
    return {
        enabled: e.enabled ?? def?.enabled ?? true
    };
}
function buildVersionConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.version;
    const v = raw ?? {};
    return {
        enabled: v.enabled ?? def?.enabled ?? true,
        autoSyncPublicVersionJson: v.autoSyncPublicVersionJson ?? def?.autoSyncPublicVersionJson ?? true,
        syncTargets: v.syncTargets ? [...v.syncTargets] : (def?.syncTargets ?? [])
    };
}
export const MIN_COVERAGE_REASON_LENGTH = 15;
/**
 * Rejects globs that would blanket-exempt the repository, a whole extension, or a whole code/test root.
 */
function assertNarrowCoverageGlob(field, rawGlob, protectedRoots) {
    const glob = (rawGlob ?? '').trim();
    const universal = /^(?:\*\*?\/?)+(?:\*(?:\.\*)?)?$/.test(glob) || /^\*\*\/\*\.[\w]+$/.test(glob) || /^\*\.\*$/.test(glob);
    if (!glob || glob.includes('\\') || path.posix.isAbsolute(glob) || universal) {
        throw new Error(`[AuditConfig Anti-Abuse] '${field}' contiene un glob global o inválido: '${rawGlob}'. ` +
            `Usa globs POSIX relativos y acotados (ej: 'dist/**', 'LICENSE').`);
    }
    for (const root of protectedRoots) {
        const cleanRoot = root.replace(/\\/g, '/').replace(/^\.\/|\/+$/g, '');
        if (!cleanRoot)
            continue;
        if (glob === cleanRoot || new RegExp(`^${RegExp.escape(cleanRoot)}/(?:\\*\\*/?)*\\*?(?:\\.\\*|\\.\\w+)?$`).test(glob)) {
            throw new Error(`[AuditConfig Anti-Abuse] '${field}' no puede eximir una raíz de código completa ('${rawGlob}' cubre '${cleanRoot}').`);
        }
    }
}
function assertCoverageReason(field, glob, reason) {
    if (typeof reason !== 'string' || reason.trim().length < MIN_COVERAGE_REASON_LENGTH) {
        throw new Error(`[AuditConfig Anti-Abuse] '${field}' para '${glob}' requiere un 'reason' de al menos ${MIN_COVERAGE_REASON_LENGTH} caracteres.`);
    }
}
function buildCoverageConfig(raw, paths) {
    const c = raw ?? {};
    const protectedRoots = Array.from(new Set([
        ...(paths.srcRoots ?? []),
        ...(paths.codeRoots ?? []),
        ...(paths.testRoots ?? [])
    ]));
    const exemptGlobs = [];
    for (const entry of c.exemptGlobs ?? []) {
        const glob = entry?.glob ?? '';
        assertNarrowCoverageGlob('coverage.exemptGlobs', glob, protectedRoots);
        assertCoverageReason('coverage.exemptGlobs', glob, entry?.reason);
        exemptGlobs.push({ glob, reason: entry.reason });
    }
    const acknowledgedDegradations = [];
    for (const entry of c.acknowledgedDegradations ?? []) {
        const glob = entry?.glob ?? '';
        const policy = entry?.policy;
        if (!policy || !ACKNOWLEDGEABLE_EXEMPTION_POLICIES.includes(policy)) {
            throw new Error(`[AuditConfig] 'coverage.acknowledgedDegradations' declara una política desconocida '${String(policy)}'. ` +
                `Válidas: ${ACKNOWLEDGEABLE_EXEMPTION_POLICIES.join(', ')}.`);
        }
        const effectiveProtectedRoots = policy === 'scripts'
            ? protectedRoots.filter(r => !(paths.scriptsRoots ?? ['scripts']).some(sr => r.replace(/\\/g, '/').replace(/^\.\/|\/+$/g, '') === sr.replace(/\\/g, '/').replace(/^\.\/|\/+$/g, '')))
            : policy === 'demo'
                ? protectedRoots.filter(r => !(paths.demoRoots ?? []).some(dr => r.replace(/\\/g, '/').replace(/^\.\/|\/+$/g, '') === dr.replace(/\\/g, '/').replace(/^\.\/|\/+$/g, '')))
                : policy === 'data'
                    ? protectedRoots.filter(r => !(paths.dataRoots ?? []).some(d => r.replace(/\\/g, '/').replace(/^\.\/|\/+$/g, '') === d.replace(/\\/g, '/').replace(/^\.\/|\/+$/g, '')))
                    : protectedRoots;
        assertNarrowCoverageGlob('coverage.acknowledgedDegradations', glob, effectiveProtectedRoots);
        assertCoverageReason('coverage.acknowledgedDegradations', glob, entry?.reason);
        acknowledgedDegradations.push({ policy, glob, reason: entry.reason });
    }
    return {
        enabled: c.enabled ?? DEFAULT_AUDIT_CONFIG.coverage?.enabled ?? true,
        exemptGlobs,
        acknowledgedDegradations
    };
}
export function defineAuditConfig(config) {
    const declared = collectDeclaredSubsystems(config);
    const agentAndSecurity = buildAgentAndSecurityConfig(config);
    const constantsAndDoc = buildConstantsAndDocConfig(config);
    const rawPaths = config._rawPaths ?? config.paths;
    const rawConfig = config._rawConfig ?? config;
    const paths = buildPathsConfig(config.paths);
    return {
        name: config.name,
        paths,
        persistence: buildPersistenceConfig(config.persistence),
        domain: buildDomainConfig(config.domain),
        gitIgnore: buildGitIgnoreConfig(config.gitIgnore),
        templates: buildTemplatesConfig(config.templates),
        styles: buildStylesConfig(config.styles, config.stylelint),
        stylelint: config.stylelint ? {
            enabled: config.stylelint.enabled ?? true,
            configFile: config.stylelint.configFile,
            rules: config.stylelint.rules ? Object.assign({}, config.stylelint.rules) : undefined,
            ignoreGlobs: config.stylelint.ignoreGlobs ? [...config.stylelint.ignoreGlobs] : []
        } : {
            enabled: true,
            rules: {},
            ignoreGlobs: []
        },
        eslint: buildEslintConfig(config.eslint),
        bundle: buildBundleConfig(config.bundle),
        fallow: buildFallowConfig(config.fallow, config.security),
        packageHygiene: buildPackageHygieneConfig(config.packageHygiene),
        packageDistribution: buildPackageDistributionConfig(config.packageDistribution),
        packageScripts: buildPackageScriptsConfig(config.packageScripts),
        accessibility: buildAccessibilityConfig(config.accessibility),
        typeCoverage: buildTypeCoverageConfig(config.typeCoverage),
        version: buildVersionConfig(config.version),
        coverage: buildCoverageConfig(config.coverage, paths),
        ...agentAndSecurity,
        ...constantsAndDoc,
        customFamilies: config.customFamilies ?? [],
        extensions: config.extensions ?? [],
        presets: config.presets ?? {},
        runner: config.runner ? {
            timeoutMs: config.runner.timeoutMs ?? 0,
            concurrency: config.runner.concurrency,
            maxStalenessMinutes: config.runner.maxStalenessMinutes ?? DEFAULT_MAX_AUDIT_STALENESS_MINUTES
        } : { timeoutMs: 0, maxStalenessMinutes: DEFAULT_MAX_AUDIT_STALENESS_MINUTES },
        _declaredSubsystems: declared,
        _rawPaths: rawPaths,
        _rawConfig: rawConfig
    };
}
const VALID_PERSISTENCE_ENGINES = ['supabase', 'sqlite', 'postgres', 'hybrid', 'none'];
const VALID_DISTRIBUTION_LEVELS = ['suggestion', 'warning', 'error'];
const VALID_TARGET_PRIORITIES = ['critical', 'high', 'all'];
function checkInfrastructureSubsystems(config, missing) {
    if (!config.persistence?.engine || !VALID_PERSISTENCE_ENGINES.includes(config.persistence.engine)) {
        missing.push(`  - 'persistence': Motor de persistencia no válido ('${config.persistence?.engine}'). Debe ser uno de: ${VALID_PERSISTENCE_ENGINES.join(' | ')}.`);
    }
    if (typeof config.bundle?.enabled !== 'boolean') {
        missing.push("  - 'bundle': El campo 'enabled' debe ser booleano (true o false).");
    }
    if (typeof config.packageDistribution?.enabled !== 'boolean') {
        missing.push("  - 'packageDistribution': El campo 'enabled' debe ser booleano (true o false).");
    }
    else if (config.packageDistribution.level && !VALID_DISTRIBUTION_LEVELS.includes(config.packageDistribution.level)) {
        missing.push(`  - 'packageDistribution': Nivel de distribución no válido ('${config.packageDistribution.level}'). Debe ser uno de: ${VALID_DISTRIBUTION_LEVELS.join(' | ')}.`);
    }
    if (config.packageScripts?.recommendedScripts !== undefined && typeof config.packageScripts.recommendedScripts !== 'boolean') {
        missing.push("  - 'packageScripts': El campo 'recommendedScripts' debe ser un booleano estricto (true o false).");
    }
    if (config.packageScripts?.enforceBuildAudit !== undefined && typeof config.packageScripts.enforceBuildAudit !== 'boolean') {
        missing.push("  - 'packageScripts': El campo 'enforceBuildAudit' debe ser un booleano estricto (true o false).");
    }
    if (config.constants?.exemptGlobs) {
        try {
            validateConstantsExemptGlobs(config.constants.exemptGlobs);
        }
        catch (err) {
            missing.push(`  - 'constants': ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
function checkUiSubsystems(config, missing) {
    const s = config.styles;
    if (typeof s?.zLayersEnabled !== 'boolean') {
        missing.push("  - 'styles': El campo 'zLayersEnabled' debe ser booleano (true o false).");
    }
    if (typeof config.templates?.requireInputIds !== 'boolean') {
        missing.push("  - 'templates': El campo 'requireInputIds' debe ser booleano (true o false).");
    }
    if (typeof config.agentPlugin?.enabled !== 'boolean') {
        missing.push("  - 'agentPlugin': El campo 'enabled' debe ser booleano (true o false).");
    }
    if (config.fallow?.maxTargetPriority && !VALID_TARGET_PRIORITIES.includes(config.fallow.maxTargetPriority)) {
        missing.push(`  - 'fallow': Prioridad de objetivo no válida ('${config.fallow.maxTargetPriority}'). Debe ser una de: ${VALID_TARGET_PRIORITIES.join(' | ')}.`);
    }
    if (config.runner?.maxStalenessMinutes !== undefined && config.runner.maxStalenessMinutes <= 0) {
        missing.push("  - 'runner': 'maxStalenessMinutes' debe ser un número positivo mayor a 0.");
    }
}
function checkSubsystemDeclarations(config) {
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
 * Serializes the active configuration so child worker processes automatically inherit it.
 * Populates process.env.AUDIT_ACTIVE_CONFIG_FILE with an ephemeral file path in scratch/cache/
 * and process.env.AUDIT_CONFIG_DATA with the inline JSON if within size limits.
 */
export function serializeAuditConfigToEnv(config, projectRoot = process.cwd()) {
    try {
        process.env.AUDIT_ACTIVE_CONFIG_ROOT = projectRoot;
        const serialized = JSON.stringify(config, (_key, value) => {
            if (value instanceof Set) {
                return Array.from(value);
            }
            return value;
        });
        // 1. Write ephemeral file in scratch/cache to prevent Windows env var 32KB overflow
        try {
            const cacheDir = path.resolve(projectRoot, 'scratch', 'cache');
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }
            const ephemeralConfigFile = path.resolve(cacheDir, `active_audit_config_${process.pid}.json`);
            fs.writeFileSync(ephemeralConfigFile, serialized, 'utf-8');
            process.env.AUDIT_ACTIVE_CONFIG_FILE = ephemeralConfigFile;
        }
        catch {
            // catch-ok: Fallback to process.env.AUDIT_CONFIG_DATA if scratch directory is read-only
        }
        // 2. Also populate in-memory environment variable if under 16KB limit (safe for Windows env vars)
        if (serialized.length < 16384) {
            process.env.AUDIT_CONFIG_DATA = serialized;
        }
    }
    catch {
        // catch-ok: Configuration serialization failure should not crash execution
    }
}
function tryLoadConfigFromEnv(projectRoot) {
    const activeRoot = process.env.AUDIT_ACTIVE_CONFIG_ROOT || process.cwd();
    // If the caller is requesting configuration for a different project directory (e.g. unit test sandbox),
    // do not use the inherited environment configuration of the host repository.
    if (path.resolve(projectRoot) !== path.resolve(activeRoot)) {
        return null;
    }
    // 1. Try ephemeral config file if specified
    const rawEnvFile = process.env.AUDIT_ACTIVE_CONFIG_FILE;
    if (rawEnvFile) {
        const envFilePath = sanitizePath(rawEnvFile);
        if (fs.existsSync(envFilePath)) {
            try {
                const content = fs.readFileSync(envFilePath, 'utf-8');
                const parsed = JSON.parse(content);
                cachedConfig = defineAuditConfig(parsed);
                cachedProjectRoot = projectRoot;
                return cachedConfig;
            }
            catch {
                // catch-ok: Fall back to inline env variable on file read or parse failure
            }
        }
    }
    // 2. Try inline environment variable
    const rawData = process.env.AUDIT_CONFIG_DATA;
    if (rawData) {
        try {
            const parsed = JSON.parse(rawData);
            cachedConfig = defineAuditConfig(parsed);
            cachedProjectRoot = projectRoot;
            return cachedConfig;
        }
        catch {
            // catch-ok: Fall back on JSON parse error
        }
    }
    return null;
}
/**
 * Synchronously loads audit.config.ts or audit.config.json if possible, or falls back to defaults.
 */
export async function loadAuditConfig(projectRoot = process.cwd()) {
    if (cachedConfig && cachedProjectRoot === projectRoot)
        return cachedConfig;
    // In child worker process or when configured via env: check inherited environment configuration first
    if (process.env.AUDIT_SUBPROCESS === 'true' || process.env.AUDIT_ACTIVE_CONFIG_FILE || process.env.AUDIT_CONFIG_DATA) {
        const envConfig = tryLoadConfigFromEnv(projectRoot);
        if (envConfig)
            return envConfig;
    }
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
                serializeAuditConfigToEnv(cachedConfig, projectRoot);
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
        if (loaded) {
            serializeAuditConfigToEnv(loaded, projectRoot);
            return loaded;
        }
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
    // 1. Check inherited environment configuration from parent orchestrator process
    const envConfig = tryLoadConfigFromEnv(projectRoot);
    if (envConfig)
        return envConfig;
    // 2. Check audit.config.json
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
    serializeAuditConfigToEnv(config, projectRoot);
}
/**
 * For testing purposes: resets the cached config and clears inherited environment configuration.
 */
export function resetAuditConfig() {
    cachedConfig = null;
    cachedProjectRoot = null;
    const rawEnvFile = process.env.AUDIT_ACTIVE_CONFIG_FILE;
    if (rawEnvFile) {
        const cleanEnvFile = sanitizePath(rawEnvFile);
        if (fs.existsSync(cleanEnvFile)) {
            try {
                fs.unlinkSync(cleanEnvFile);
            }
            catch {
                // catch-ok: Best effort cleanup
            }
        }
    }
    delete process.env.AUDIT_CONFIG_DATA;
    delete process.env.AUDIT_ACTIVE_CONFIG_FILE;
    delete process.env.AUDIT_ACTIVE_CONFIG_ROOT;
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
 * Determines whether a file path belongs to a demo/showcase/mock directory
 * configured in paths.demoRoots.
 */
export function isDemoPath(filePath) {
    if (!filePath)
        return false;
    const norm = filePath.split('\\').join('/').toLowerCase();
    const config = getAuditConfig();
    const demoRoots = config?.paths?.demoRoots ?? [];
    return matchesAnyRoot(norm, demoRoots);
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
 * Determines whether the specified project root is the @francogp/auditor provider repository itself.
 */
export function isSelfProviderProject(projectRoot) {
    const hostPkgPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(hostPkgPath))
        return false;
    try {
        const pkgData = JSON.parse(fs.readFileSync(hostPkgPath, 'utf8'));
        if (pkgData.name === '@francogp/auditor') {
            const hasPluginJson = fs.existsSync(path.join(projectRoot, 'plugin.json'));
            const hasSkillMd = fs.existsSync(path.join(projectRoot, '.agents/skills/auditor/SKILL.md')) ||
                fs.existsSync(path.join(projectRoot, 'skills/auditor/SKILL.md')) ||
                fs.existsSync(path.join(projectRoot, 'skills/auditor-framework/SKILL.md'));
            return hasPluginJson && hasSkillMd;
        }
    }
    catch {
        // catch-ok: Fallback to false
    }
    return false;
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