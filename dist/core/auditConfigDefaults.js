/**
 * packages/auditor/src/core/auditConfigDefaults.ts
 *
 * Canonical default configuration, builders, and defineAuditConfig coordinator.
 */
import path from 'node:path';
import { DEFAULT_MAX_AUDIT_STALENESS_MINUTES, ACKNOWLEDGEABLE_EXEMPTION_POLICIES, AUDITOR_DIR } from "./auditConfigTypes.js";
import { assertNarrowCoverageGlob, assertCoverageReason, getExemptRootsForPolicy, filterOutExemptRoots, validateConstantsExemptGlobs } from "./auditConfigAntiAbuse.js";
export const DEFAULT_SIMILAR_CODE_THRESHOLD = 0.95;
export const DEFAULT_TEST_COVERAGE_PERCENTAGE = 80;
export const DEFAULT_TYPE_COVERAGE_AT_LEAST = 95;
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
        unignoreDirs: [],
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
    valibot: {
        enabled: true,
        targets: []
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
        },
        enforceScss: false,
        exemptCssFiles: []
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
        allowedNpxBinaries: [],
        language: 'en',
        chatLanguage: 'es',
        languageExemptions: []
    },
    fallow: {
        enabled: true,
        security: {
            enabled: true
        },
        enforceTargets: true,
        maxTargetPriority: 'high',
        similarCode: {
            enabled: true,
            threshold: DEFAULT_SIMILAR_CODE_THRESHOLD,
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
    environment: {
        enabled: true
    },
    auditorHygiene: {
        enabled: true,
        exemptFiles: [],
        disabledDetectors: []
    },
    scriptExtensions: {
        enabled: true,
        enforceTypeScript: true,
        allowMjs: false,
        allowCjs: false,
        allowJsScripts: false,
        exemptFiles: []
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
    secretLeaks: {
        enabled: true,
        maskSecrets: true,
        allowedPatterns: [],
        exemptGlobs: []
    },
    dependencyVulnerabilities: {
        enabled: true,
        failOn: 'critical',
        allowList: [],
        includeDev: false
    },
    coverage: {
        enabled: true,
        exemptGlobs: [],
        acknowledgedDegradations: []
    },
    ratchet: {
        enabled: true,
        productionRef: 'origin/main',
        baselineFile: '.auditor/audit-baseline.json'
    },
    testCoverage: {
        enabled: true,
        threshold: 80,
        path: 'coverage/coverage-final.json',
        runCommand: 'npm test -- --coverage',
        roots: ['src'],
        extensions: ['.ts', '.vue', '.js', '.jsx', '.tsx', '.mjs', '.cjs'],
        exemptGlobs: [],
        directoryThresholds: {},
        enforceInAudit: true
    },
    customFamilies: [],
    extensions: [],
    presets: {},
    runner: {
        timeoutMs: 0,
        maxStalenessMinutes: DEFAULT_MAX_AUDIT_STALENESS_MINUTES
    }
};
export function collectDeclaredSubsystems(config) {
    const declared = new Set(config._declaredSubsystems ?? []);
    const keys = [
        'persistence',
        'domain',
        'environment',
        'auditorHygiene',
        'scriptExtensions',
        'styles',
        'stylelint',
        'eslint',
        'valibot',
        'pinia',
        'htmlValidate',
        'templates',
        'bundle',
        'agentPlugin',
        'security',
        'fallow',
        'packageDistribution',
        'packageHygiene',
        'packageScripts',
        'accessibility',
        'typeCoverage',
        'testCoverage',
        'version',
        'secretLeaks',
        'dependencyVulnerabilities',
        'ratchet',
        'constants',
        'documentation',
        'gitIgnore',
        'coverage',
        'animation'
    ];
    for (const k of keys) {
        if (config[k] !== undefined)
            declared.add(k);
    }
    for (const k of Object.keys(config)) {
        if (k !== '_declaredSubsystems' &&
            k !== '_rawPaths' &&
            k !== '_rawConfig' &&
            k !== 'name' &&
            Reflect.get(config, k) !== undefined) {
            declared.add(k);
        }
    }
    return declared;
}
export function buildPathsConfig(raw) {
    const p = raw ?? {};
    return {
        ...DEFAULT_AUDIT_CONFIG.paths,
        ...p,
        cliRoots: p.cliRoots ?? DEFAULT_AUDIT_CONFIG.paths.cliRoots,
        testFilePatterns: p.testFilePatterns ?? [],
        testFragmentationWhitelist: p.testFragmentationWhitelist ?? []
    };
}
export function buildPersistenceConfig(raw) {
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
export function buildDomainConfig(raw) {
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
export function buildTemplatesConfig(raw) {
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
function buildStylelintSubConfig(rawSl) {
    const parsedRules = rawSl?.rules ? { ...rawSl.rules } : undefined;
    return {
        enabled: rawSl?.enabled ?? DEFAULT_AUDIT_CONFIG.styles?.stylelint?.enabled ?? true,
        configFile: rawSl?.configFile,
        rules: parsedRules,
        ignoreGlobs: rawSl?.ignoreGlobs ? [...rawSl.ignoreGlobs] : []
    };
}
function buildZLayersSubConfig(s) {
    const def = DEFAULT_AUDIT_CONFIG.styles;
    return {
        zLayersEnabled: s.zLayersEnabled ?? def?.zLayersEnabled ?? true,
        zLayersScssFile: s.zLayersScssFile,
        baseScssFile: s.baseScssFile ?? s.zLayersScssFile,
        zLayersTsFile: s.zLayersTsFile,
        zLayers: s.zLayers
    };
}
export function buildStylesConfig(raw, rawStylelintTop) {
    const s = raw ?? {};
    const def = DEFAULT_AUDIT_CONFIG.styles;
    const stylelint = buildStylelintSubConfig(s.stylelint ?? rawStylelintTop);
    const zLayers = buildZLayersSubConfig(s);
    return {
        globalUtilityClasses: s.globalUtilityClasses ?? [],
        canonicalButtonVariants: s.canonicalButtonVariants ?? [],
        ...zLayers,
        lineHeightOverlapCheck: s.lineHeightOverlapCheck ?? def?.lineHeightOverlapCheck ?? true,
        heavyEffectPaths: s.heavyEffectPaths ?? [],
        buttonGovernance: s.buttonGovernance,
        stylelint,
        enforceScss: s.enforceScss ?? def?.enforceScss ?? false,
        exemptCssFiles: s.exemptCssFiles ?? []
    };
}
export function buildBundleConfig(raw) {
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
export function buildAgentAndSecurityConfig(config) {
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
function buildConstantsSubConfig(c) {
    const exemptGlobs = c?.exemptGlobs ? [...c.exemptGlobs] : [];
    if (exemptGlobs.length > 0) {
        validateConstantsExemptGlobs(exemptGlobs);
    }
    return {
        ignoredNames: c?.ignoredNames ?? [],
        exemptMagicNumbers: c?.exemptMagicNumbers ?? [],
        allowedNumericPrefixes: c?.allowedNumericPrefixes ?? [],
        exemptGlobs
    };
}
function buildDocumentationSubConfig(d) {
    return {
        knownValidAbstractPaths: d?.knownValidAbstractPaths ?? [],
        skillsRoots: d?.skillsRoots ?? [],
        unignoreDirs: d?.unignoreDirs ?? [],
        allowedNpxBinaries: d?.allowedNpxBinaries ?? [],
        language: d?.language ?? 'en',
        chatLanguage: d?.chatLanguage ?? 'es',
        languageExemptions: d?.languageExemptions ?? []
    };
}
export function buildConstantsAndDocConfig(config) {
    return {
        constants: buildConstantsSubConfig(config.constants),
        documentation: buildDocumentationSubConfig(config.documentation),
        pinia: {
            authorizedMutationFiles: config.pinia?.authorizedMutationFiles ?? []
        },
        e2e: {
            idLocatorsOnly: config.e2e?.idLocatorsOnly ?? false
        }
    };
}
export function buildFallowSimilarCodeConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.fallow?.similarCode;
    const s = raw ?? {};
    return {
        enabled: s.enabled ?? def?.enabled ?? true,
        threshold: s.threshold ?? def?.threshold ?? DEFAULT_SIMILAR_CODE_THRESHOLD,
        ignoreSameFile: s.ignoreSameFile ?? def?.ignoreSameFile ?? true,
        minLines: s.minLines ?? def?.minLines ?? 3
    };
}
function buildFallowFlagsConfig(raw, def) {
    return {
        enabled: raw?.enabled ?? def?.enabled ?? true,
        maxFlagAgeDays: raw?.maxFlagAgeDays ?? def?.maxFlagAgeDays,
        trackRetirement: raw?.trackRetirement ?? def?.trackRetirement ?? true
    };
}
function buildFallowCoverageConfig(raw, def) {
    return {
        enabled: raw?.enabled ?? def?.enabled ?? true,
        path: raw?.path ?? def?.path,
        root: raw?.root ?? def?.root
    };
}
export function buildFallowConfig(raw, rootSecurity) {
    const def = DEFAULT_AUDIT_CONFIG.fallow;
    const f = raw ?? {};
    const secEnabled = f.security?.enabled ?? rootSecurity?.enabled ?? def?.security?.enabled ?? true;
    return {
        enabled: f.enabled ?? def?.enabled ?? true,
        security: {
            enabled: secEnabled
        },
        enforceTargets: f.enforceTargets ?? def?.enforceTargets ?? true,
        maxTargetPriority: f.maxTargetPriority ?? def?.maxTargetPriority ?? 'high',
        similarCode: buildFallowSimilarCodeConfig(f.similarCode),
        flags: buildFallowFlagsConfig(f.flags, def?.flags),
        coverage: buildFallowCoverageConfig(f.coverage, def?.coverage)
    };
}
export function buildPackageHygieneConfig(raw) {
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
export function buildEnvironmentConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.environment;
    const p = raw ?? {};
    return {
        enabled: p.enabled ?? def?.enabled ?? true
    };
}
export function buildAuditorHygieneConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.auditorHygiene;
    const p = raw ?? {};
    return {
        enabled: p.enabled ?? def?.enabled ?? true,
        exemptFiles: p.exemptFiles ? [...p.exemptFiles] : (def?.exemptFiles ?? []),
        disabledDetectors: p.disabledDetectors ? [...p.disabledDetectors] : (def?.disabledDetectors ?? [])
    };
}
export function buildScriptExtensionsConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.scriptExtensions;
    const p = raw ?? {};
    return {
        enabled: p.enabled ?? def?.enabled ?? true,
        enforceTypeScript: p.enforceTypeScript ?? def?.enforceTypeScript ?? true,
        allowMjs: p.allowMjs ?? def?.allowMjs ?? false,
        allowCjs: p.allowCjs ?? def?.allowCjs ?? false,
        allowJsScripts: p.allowJsScripts ?? def?.allowJsScripts ?? false,
        exemptFiles: p.exemptFiles ? [...p.exemptFiles] : (def?.exemptFiles ?? [])
    };
}
export function buildPackageDistributionConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.packageDistribution;
    const p = raw ?? {};
    return {
        enabled: p.enabled ?? def?.enabled ?? false,
        pkgDir: p.pkgDir ?? def?.pkgDir,
        level: p.level ?? def?.level ?? 'warning'
    };
}
export function buildPackageScriptsConfig(raw) {
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
export function buildRatchetConfig(raw) {
    const r = raw ?? {};
    if (r.enabled !== undefined && typeof r.enabled !== 'boolean') {
        throw new Error(`[AuditConfig] 'ratchet.enabled' must be a strict boolean, received '${String(r.enabled)}'.`);
    }
    const productionRef = r.productionRef ?? DEFAULT_AUDIT_CONFIG.ratchet?.productionRef ?? 'origin/main';
    if (productionRef.trim() === '' || /\s/u.test(productionRef) || productionRef.startsWith('-')) {
        throw new Error(`[AuditConfig] 'ratchet.productionRef' must be a non-empty git ref without whitespace or leading '-', received '${productionRef}'.`);
    }
    const baselineFile = r.baselineFile ?? DEFAULT_AUDIT_CONFIG.ratchet?.baselineFile ?? path.posix.join(AUDITOR_DIR, 'audit-baseline.json');
    const normalized = path.posix.normalize(baselineFile.replaceAll('\\', '/'));
    if (path.isAbsolute(baselineFile) || normalized.startsWith('..') || path.extname(baselineFile) !== '.json') {
        throw new Error(`[AuditConfig] 'ratchet.baselineFile' must be a repository-relative '.json' path inside the project, received '${baselineFile}'.`);
    }
    return {
        enabled: r.enabled ?? DEFAULT_AUDIT_CONFIG.ratchet?.enabled ?? true,
        productionRef,
        baselineFile: normalized
    };
}
function validateTestCoverageRaw(t) {
    if (t.enabled !== undefined && typeof t.enabled !== 'boolean') {
        throw new Error(`[AuditConfig] 'testCoverage.enabled' must be a strict boolean, received '${String(t.enabled)}'.`);
    }
    if (t.threshold !== undefined && (typeof t.threshold !== 'number' || Number.isNaN(t.threshold) || t.threshold < 0 || t.threshold > 100)) {
        throw new Error(`[AuditConfig] 'testCoverage.threshold' must be a number between 0 and 100, received '${String(t.threshold)}'.`);
    }
    if (t.enforceInAudit !== undefined && typeof t.enforceInAudit !== 'boolean') {
        throw new Error(`[AuditConfig] 'testCoverage.enforceInAudit' must be a strict boolean, received '${String(t.enforceInAudit)}'.`);
    }
}
function resolveTestCoverageCollections(t, def) {
    return {
        roots: t.roots ? [...t.roots] : (def?.roots ?? ['src']),
        extensions: t.extensions ? [...t.extensions] : (def?.extensions ?? ['.ts', '.vue', '.js', '.jsx', '.tsx', '.mjs', '.cjs']),
        exemptGlobs: t.exemptGlobs ? [...t.exemptGlobs] : (def?.exemptGlobs ?? []),
        directoryThresholds: t.directoryThresholds ? { ...t.directoryThresholds } : (def?.directoryThresholds ?? {})
    };
}
export function buildTestCoverageConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.testCoverage;
    const t = raw ?? {};
    validateTestCoverageRaw(t);
    const collections = resolveTestCoverageCollections(t, def);
    return {
        enabled: t.enabled ?? def?.enabled ?? true,
        threshold: t.threshold ?? def?.threshold ?? DEFAULT_TEST_COVERAGE_PERCENTAGE,
        path: t.path ?? def?.path ?? 'coverage/coverage-final.json',
        runCommand: t.runCommand ?? def?.runCommand ?? 'npm test -- --coverage',
        enforceInAudit: t.enforceInAudit ?? def?.enforceInAudit ?? true,
        ...collections
    };
}
export function buildAccessibilityConfig(raw) {
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
export function buildTypeCoverageConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.typeCoverage;
    const t = raw ?? {};
    return {
        enabled: t.enabled ?? def?.enabled ?? true,
        atLeast: t.atLeast ?? def?.atLeast ?? DEFAULT_TYPE_COVERAGE_AT_LEAST,
        strict: t.strict ?? def?.strict ?? true,
        ignoreFiles: t.ignoreFiles ? [...t.ignoreFiles] : (def?.ignoreFiles ?? [])
    };
}
export function buildGitIgnoreConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.gitIgnore;
    const g = raw ?? {};
    return {
        enabled: g.enabled ?? def?.enabled ?? true,
        extraRequiredEntries: g.extraRequiredEntries ? [...g.extraRequiredEntries] : (def?.extraRequiredEntries ?? [])
    };
}
export function buildEslintConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.eslint;
    const e = raw ?? {};
    return {
        enabled: e.enabled ?? def?.enabled ?? true
    };
}
export function buildVersionConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.version;
    const v = raw ?? {};
    return {
        enabled: v.enabled ?? def?.enabled ?? true,
        autoSyncPublicVersionJson: v.autoSyncPublicVersionJson ?? def?.autoSyncPublicVersionJson ?? true,
        syncTargets: v.syncTargets ? [...v.syncTargets] : (def?.syncTargets ?? [])
    };
}
export function buildSecretLeaksConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.secretLeaks;
    const s = raw ?? {};
    return {
        enabled: s.enabled ?? def?.enabled ?? true,
        maskSecrets: s.maskSecrets ?? def?.maskSecrets ?? true,
        allowedPatterns: s.allowedPatterns ? [...s.allowedPatterns] : (def?.allowedPatterns ?? []),
        exemptGlobs: s.exemptGlobs ? [...s.exemptGlobs] : (def?.exemptGlobs ?? [])
    };
}
export function buildDependencyVulnerabilitiesConfig(raw) {
    const def = DEFAULT_AUDIT_CONFIG.dependencyVulnerabilities;
    const d = raw ?? {};
    return {
        enabled: d.enabled ?? def?.enabled ?? false,
        failOn: d.failOn ?? def?.failOn ?? 'critical',
        allowList: d.allowList ? [...d.allowList] : (def?.allowList ?? []),
        includeDev: d.includeDev ?? def?.includeDev ?? false
    };
}
function resolveCoverageExemptGlobs(rawGlobs, protectedRoots) {
    const exemptGlobs = [];
    for (const entry of rawGlobs ?? []) {
        const glob = entry?.glob ?? '';
        assertNarrowCoverageGlob('coverage.exemptGlobs', glob, protectedRoots);
        assertCoverageReason('coverage.exemptGlobs', glob, entry?.reason);
        exemptGlobs.push({ glob, reason: entry.reason });
    }
    return exemptGlobs;
}
function resolveAcknowledgedDegradations(rawDegradations, paths, protectedRoots) {
    const acknowledgedDegradations = [];
    for (const entry of rawDegradations ?? []) {
        const glob = entry?.glob ?? '';
        const policy = entry?.policy;
        if (!policy || !ACKNOWLEDGEABLE_EXEMPTION_POLICIES.includes(policy)) {
            throw new Error(`[AuditConfig] 'coverage.acknowledgedDegradations' declara una política desconocida '${String(policy)}'. ` +
                `Válidas: ${ACKNOWLEDGEABLE_EXEMPTION_POLICIES.join(', ')}.`);
        }
        const exemptRoots = getExemptRootsForPolicy(policy, paths);
        const effectiveProtectedRoots = exemptRoots.length > 0
            ? filterOutExemptRoots(protectedRoots, exemptRoots)
            : protectedRoots;
        assertNarrowCoverageGlob('coverage.acknowledgedDegradations', glob, effectiveProtectedRoots);
        assertCoverageReason('coverage.acknowledgedDegradations', glob, entry?.reason);
        acknowledgedDegradations.push({ policy, glob, reason: entry.reason });
    }
    return acknowledgedDegradations;
}
export function buildCoverageConfig(raw, paths) {
    const c = raw ?? {};
    const protectedRoots = Array.from(new Set([
        ...(paths.srcRoots ?? []),
        ...(paths.codeRoots ?? []),
        ...(paths.testRoots ?? [])
    ]));
    return {
        enabled: c.enabled ?? DEFAULT_AUDIT_CONFIG.coverage?.enabled ?? true,
        exemptGlobs: resolveCoverageExemptGlobs(c.exemptGlobs, protectedRoots),
        acknowledgedDegradations: resolveAcknowledgedDegradations(c.acknowledgedDegradations, paths, protectedRoots)
    };
}
export function buildValibotConfig(raw) {
    const v = raw ?? {};
    return {
        enabled: v.enabled ?? DEFAULT_AUDIT_CONFIG.valibot?.enabled ?? true,
        targets: v.targets ? v.targets : []
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
        ratchet: buildRatchetConfig(config.ratchet),
        valibot: buildValibotConfig(config.valibot),
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
        environment: buildEnvironmentConfig(config.environment),
        auditorHygiene: buildAuditorHygieneConfig(config.auditorHygiene),
        scriptExtensions: buildScriptExtensionsConfig(config.scriptExtensions),
        accessibility: buildAccessibilityConfig(config.accessibility),
        typeCoverage: buildTypeCoverageConfig(config.typeCoverage),
        testCoverage: buildTestCoverageConfig(config.testCoverage),
        version: buildVersionConfig(config.version),
        secretLeaks: buildSecretLeaksConfig(config.secretLeaks),
        dependencyVulnerabilities: buildDependencyVulnerabilitiesConfig(config.dependencyVulnerabilities),
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
//# sourceMappingURL=auditConfigDefaults.js.map