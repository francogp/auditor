import { ACKNOWLEDGEABLE_EXEMPTION_POLICIES } from "./auditConfigTypes.js";
import { assertCoverageReason, assertNarrowCoverageGlob, filterOutExemptRoots, getExemptRootsForPolicy } from "./auditConfigAntiAbuse.js";
import { AUDITOR_VERSION } from "./version.js";
import path from "node:path";
//#region src/core/auditConfigDefaults.ts
/**
* packages/auditor/src/core/auditConfigDefaults.ts
*
* Canonical default configuration, builders, and defineAuditConfig coordinator.
*/
const DEFAULT_SIMILAR_CODE_THRESHOLD = .95;
const DEFAULT_TEST_COVERAGE_PERCENTAGE = 80;
const DEFAULT_TYPE_COVERAGE_AT_LEAST = 95;
const DEFAULT_PRECOMPRESS_THRESHOLD_BYTES = 512;
const DEFAULT_AUDIT_CONFIG = {
	name: "Generic Project",
	auditorVersion: AUDITOR_VERSION,
	paths: {
		srcRoots: ["src"],
		testRoots: ["tests"],
		e2eRoots: ["tests/e2e"],
		integrationRoots: ["tests/integration"],
		migrationsDir: "supabase/migrations",
		scriptsRoots: ["scripts"],
		codeRoots: ["src", "scripts"],
		cliRoots: ["src/cli"],
		dataRoots: ["src/data"],
		demoRoots: [],
		componentsRoots: ["src/components"],
		viewsRoots: ["src/views"],
		storesRoots: ["src/stores"],
		composablesRoots: ["src/composables"],
		typesRoots: ["src/types"],
		stylesRoots: ["src/styles"],
		logicRoots: ["src/logic"],
		exemptFiles: [],
		includeTestsInCodeAudit: false,
		ignoreGlobs: [],
		ignoredDirs: [],
		unignoreDirs: [],
		ignoredPatterns: []
	},
	persistence: {
		engine: "supabase",
		schemaQualified: true,
		authorizedSaveFiles: [],
		saveKeyPrefixes: [],
		supabaseDir: "supabase",
		dockerContainer: "supabase-db",
		allowedDatabaseDirs: [
			"backups",
			"migrations",
			"schemas"
		],
		allowedDatabaseFiles: ["AGENTS.md", ".gitkeep"],
		exemptRlsTables: [
			"_migrations",
			"schema_migrations",
			"supabase_migrations"
		]
	},
	valibot: {
		enabled: true,
		targets: []
	},
	domain: {
		enabled: true,
		timezoneVariable: "APP_TIMEZONE",
		finiteDomainTypes: [],
		infraIdWhitelist: [],
		fallbackIdPatterns: [],
		o1CatalogPatterns: [],
		allowedNumericConstantPrefixes: [
			"GEN_",
			"ISO_",
			"UTF_8",
			"BASE_64",
			"RGB_",
			"RGBA_",
			"WASM_",
			"HTML_5",
			"CSS_3",
			"HTTP_",
			"D3_"
		],
		caseNormalizationExemptTokens: [],
		allowedStoreSetterPrefixes: [
			"set",
			"update",
			"clear"
		]
	},
	gitIgnore: {
		enabled: true,
		extraRequiredEntries: []
	},
	templates: { requireInputIds: true },
	styles: {
		globalUtilityClasses: [],
		canonicalButtonVariants: [],
		heavyEffectPaths: [],
		zLayersEnabled: true,
		lineHeightOverlapCheck: true,
		stylelint: {
			enabled: true,
			rules: {},
			ignoreGlobs: [],
			order: {
				enabled: true,
				enforceHasBlockPartitioning: true
			}
		},
		enforceScss: true,
		exemptCssFiles: []
	},
	stylelint: {
		enabled: true,
		rules: {},
		ignoreGlobs: [],
		order: {
			enabled: true,
			enforceHasBlockPartitioning: true
		}
	},
	oxlint: { enabled: true },
	oxfmt: { enabled: true },
	vitePlusConfig: {
		enabled: true,
		fmt: {
			enabled: true,
			singleQuote: true,
			semi: true,
			trailingComma: "none",
			printWidth: 100,
			sortPackageJson: true
		},
		lint: {
			enabled: true,
			typeAware: true,
			typeCheck: true
		},
		staged: {
			enabled: true,
			rules: { "*": "vp check --fix" }
		},
		hooks: { enabled: true },
		vscode: {
			enabled: true,
			formatOnSave: true,
			defaultFormatter: "oxc.oxc-vscode"
		}
	},
	bundle: {
		enabled: true,
		statsFile: "scratch/bundle_stats.html",
		distDir: "dist/assets",
		exemptChunkPrefixes: [],
		maxClientChunkWarnBytes: 1228800,
		maxClientChunkErrorBytes: 2048e3,
		budgets: [],
		duplicateModuleThresholdBytes: 512e3,
		topModulesLimit: 15
	},
	agentPlugin: { enabled: true },
	security: { enabled: true },
	documentation: {
		knownValidAbstractPaths: [],
		skillsRoots: [],
		allowedNpxBinaries: [],
		language: "en",
		chatLanguage: "es",
		languageExemptions: []
	},
	fallow: {
		enabled: true,
		security: { enabled: true },
		enforceTargets: true,
		maxTargetPriority: "high",
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
		coverage: { enabled: true },
		typeAware: true,
		showCascade: true,
		duplicates: {
			nearMiss: true,
			mode: "strict"
		},
		viz: {
			enabled: true,
			outputPath: "scratch/fallow_map.html"
		}
	},
	constants: {
		enabled: true,
		ignoredNames: [],
		exemptMagicNumbers: [],
		allowedNumericPrefixes: [],
		exemptPaths: [],
		exemptFiles: [],
		ignoreGlobs: []
	},
	animation: {
		enabled: true,
		customTimerFunctions: [],
		exemptPaths: [],
		exemptFiles: [],
		ignoreGlobs: []
	},
	types: {
		enabled: true,
		exemptPaths: [],
		exemptFiles: [],
		ignoreGlobs: []
	},
	packageHygiene: {
		enabled: true,
		ignoreDependencies: [],
		ignoreBinaries: []
	},
	packageDistribution: {
		enabled: false,
		level: "warning"
	},
	packageScripts: {
		enabled: true,
		enforceBuildAudit: true,
		recommendedScripts: true,
		extraRequiredScripts: []
	},
	scriptCommands: {
		enabled: true,
		exemptGlobs: [],
		allowedNpxBinaries: []
	},
	environment: { enabled: true },
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
		failOn: "critical",
		allowList: [],
		includeDev: false
	},
	coverage: {
		enabled: true,
		exemptGlobs: [],
		acknowledgedDegradations: []
	},
	webPerformance: {
		enabled: true,
		maxDomDepth: 16,
		maxInlineSvgSize: 2048,
		exemptSvgPaths: [],
		exemptImgClasses: [],
		exemptPaths: []
	},
	queryPerformance: {
		enabled: true,
		excludeMigrationsDir: true,
		exemptSelectStarPaths: [],
		exemptPaths: []
	},
	securityHardening: {
		enabled: true,
		exemptPaths: []
	},
	codeSimplification: {
		enabled: true,
		maxNestingDepth: 4,
		allowMatrixLoops: false,
		exemptPaths: []
	},
	scssArchitecture: {
		enabled: true,
		maxNestingDepth: 3,
		scopedMaxNestingDepth: 4,
		allowPixelArtSpacing: false,
		allowedSpacingUnits: [],
		allowScopedColors: false,
		exemptPaths: []
	},
	ratchet: {
		enabled: true,
		productionRef: "origin/main",
		baselineFile: ".auditor/audit-baseline.json"
	},
	testCoverage: {
		enabled: true,
		threshold: 80,
		path: "scratch/coverage/coverage-final.json",
		runCommand: "vp test --coverage",
		roots: ["src"],
		extensions: [
			".ts",
			".vue",
			".js",
			".jsx",
			".tsx",
			".mjs",
			".cjs"
		],
		exemptGlobs: [],
		directoryThresholds: {},
		enforceInAudit: true
	},
	customFamilies: [],
	extensions: [],
	presets: {},
	runner: {
		timeoutMs: 0,
		maxStalenessMinutes: 5
	}
};
function collectDeclaredSubsystems(config) {
	const declared = new Set(config._declaredSubsystems ?? []);
	for (const k of [
		"persistence",
		"domain",
		"environment",
		"auditorHygiene",
		"scriptExtensions",
		"styles",
		"stylelint",
		"oxlint",
		"oxfmt",
		"vitePlusConfig",
		"valibot",
		"pinia",
		"htmlValidate",
		"templates",
		"bundle",
		"agentPlugin",
		"security",
		"fallow",
		"packageDistribution",
		"packageHygiene",
		"packageScripts",
		"scriptCommands",
		"accessibility",
		"typeCoverage",
		"testCoverage",
		"version",
		"secretLeaks",
		"dependencyVulnerabilities",
		"ratchet",
		"constants",
		"documentation",
		"gitIgnore",
		"coverage",
		"animation",
		"types",
		"webPerformance",
		"queryPerformance",
		"securityHardening",
		"codeSimplification",
		"scssArchitecture",
		"vitePlusConfig"
	]) if (config[k] !== void 0) declared.add(k);
	for (const k of Object.keys(config)) if (k !== "_declaredSubsystems" && k !== "_rawPaths" && k !== "_rawConfig" && k !== "name" && Reflect.get(config, k) !== void 0) declared.add(k);
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
		allowedDatabaseDirs: p.allowedDatabaseDirs && p.allowedDatabaseDirs.length > 0 ? Array.from(/* @__PURE__ */ new Set([
			"backups",
			"migrations",
			"schemas",
			...p.allowedDatabaseDirs
		])) : [
			"backups",
			"migrations",
			"schemas"
		],
		allowedDatabaseFiles: p.allowedDatabaseFiles && p.allowedDatabaseFiles.length > 0 ? Array.from(/* @__PURE__ */ new Set([
			"AGENTS.md",
			".gitkeep",
			...p.allowedDatabaseFiles
		])) : ["AGENTS.md", ".gitkeep"],
		allowedHosts: p.allowedHosts ?? ["localhost", "127.0.0.1"],
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
		allowedStoreSetterPrefixes: d.allowedStoreSetterPrefixes ?? [
			"set",
			"update",
			"clear"
		],
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
function buildStylelintSubConfig(rawSl) {
	const parsedRules = rawSl?.rules ? { ...rawSl.rules } : void 0;
	const strictValues = rawSl?.strictValues ? {
		properties: rawSl.strictValues.properties ? [...rawSl.strictValues.properties] : [],
		ignoreValues: rawSl.strictValues.ignoreValues ? { ...rawSl.strictValues.ignoreValues } : {},
		ignoreAtRules: rawSl.strictValues.ignoreAtRules ? [...rawSl.strictValues.ignoreAtRules] : []
	} : void 0;
	const order = {
		enabled: rawSl?.order?.enabled ?? true,
		enforceHasBlockPartitioning: rawSl?.order?.enforceHasBlockPartitioning ?? true
	};
	return {
		enabled: rawSl?.enabled ?? DEFAULT_AUDIT_CONFIG.styles?.stylelint?.enabled ?? true,
		configFile: rawSl?.configFile,
		rules: parsedRules,
		ignoreGlobs: rawSl?.ignoreGlobs ? [...rawSl.ignoreGlobs] : [],
		strictValues,
		order
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
function buildStylesConfig(raw, rawStylelintTop) {
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
		agentPlugin: { enabled: config.agentPlugin?.enabled ?? DEFAULT_AUDIT_CONFIG.agentPlugin?.enabled ?? true },
		security: { enabled: secEnabled },
		animation: { customTimerFunctions: config.animation?.customTimerFunctions ?? [] }
	};
}
function buildConstantsSubConfig(c) {
	return {
		enabled: c?.enabled ?? DEFAULT_AUDIT_CONFIG.constants?.enabled ?? true,
		ignoredNames: c?.ignoredNames ?? [],
		exemptMagicNumbers: c?.exemptMagicNumbers ?? [],
		allowedNumericPrefixes: c?.allowedNumericPrefixes ?? [],
		exemptPaths: c?.exemptPaths ?? [],
		exemptFiles: c?.exemptFiles ?? [],
		ignoreGlobs: c?.ignoreGlobs ?? []
	};
}
function buildDocumentationSubConfig(d) {
	return {
		knownValidAbstractPaths: d?.knownValidAbstractPaths ?? [],
		skillsRoots: d?.skillsRoots ?? [],
		unignoreDirs: d?.unignoreDirs ?? [],
		allowedNpxBinaries: d?.allowedNpxBinaries ?? [],
		language: d?.language ?? "en",
		chatLanguage: d?.chatLanguage ?? "es",
		languageExemptions: d?.languageExemptions ?? []
	};
}
function buildConstantsAndDocConfig(config) {
	return {
		constants: buildConstantsSubConfig(config.constants),
		documentation: buildDocumentationSubConfig(config.documentation),
		pinia: {
			enabled: config.pinia?.enabled ?? true,
			authorizedMutationFiles: config.pinia?.authorizedMutationFiles ?? []
		},
		e2e: { idLocatorsOnly: config.e2e?.idLocatorsOnly ?? false }
	};
}
function buildFallowSimilarCodeConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.fallow?.similarCode;
	const s = raw ?? {};
	return {
		enabled: s.enabled ?? def?.enabled ?? true,
		threshold: s.threshold ?? def?.threshold ?? .95,
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
function buildFallowConfig(raw, rootSecurity) {
	const def = DEFAULT_AUDIT_CONFIG.fallow;
	const f = raw ?? {};
	const secEnabled = f.security?.enabled ?? rootSecurity?.enabled ?? def?.security?.enabled ?? true;
	return {
		enabled: f.enabled ?? def?.enabled ?? true,
		security: { enabled: secEnabled },
		enforceTargets: f.enforceTargets ?? def?.enforceTargets ?? true,
		maxTargetPriority: f.maxTargetPriority ?? def?.maxTargetPriority ?? "high",
		similarCode: buildFallowSimilarCodeConfig(f.similarCode),
		flags: buildFallowFlagsConfig(f.flags, def?.flags),
		coverage: buildFallowCoverageConfig(f.coverage, def?.coverage),
		typeAware: f.typeAware ?? def?.typeAware ?? true,
		showCascade: f.showCascade ?? def?.showCascade ?? true,
		duplicates: {
			nearMiss: f.duplicates?.nearMiss ?? def?.duplicates?.nearMiss ?? true,
			mode: f.duplicates?.mode ?? def?.duplicates?.mode ?? "strict",
			...f.duplicates?.minTokens !== void 0 ? { minTokens: f.duplicates.minTokens } : {},
			...f.duplicates?.minLines !== void 0 ? { minLines: f.duplicates.minLines } : {},
			...f.duplicates?.minOccurrences !== void 0 ? { minOccurrences: f.duplicates.minOccurrences } : {}
		},
		viz: {
			enabled: f.viz?.enabled ?? def?.viz?.enabled ?? true,
			outputPath: f.viz?.outputPath ?? def?.viz?.outputPath ?? "scratch/fallow_map.html"
		}
	};
}
function buildPackageHygieneConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.packageHygiene;
	const p = raw ?? {};
	return {
		enabled: p.enabled ?? def?.enabled ?? true,
		ignoreDependencies: p.ignoreDependencies ? [...p.ignoreDependencies] : def?.ignoreDependencies ?? [],
		ignoreBinaries: p.ignoreBinaries ? [...p.ignoreBinaries] : def?.ignoreBinaries ?? [],
		entry: p.entry ? [...p.entry] : void 0,
		project: p.project ? [...p.project] : void 0
	};
}
function buildEnvironmentConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.environment;
	return { enabled: (raw ?? {}).enabled ?? def?.enabled ?? true };
}
function buildAuditorHygieneConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.auditorHygiene;
	const p = raw ?? {};
	return {
		enabled: p.enabled ?? def?.enabled ?? true,
		exemptFiles: p.exemptFiles ? [...p.exemptFiles] : def?.exemptFiles ?? [],
		disabledDetectors: p.disabledDetectors ? [...p.disabledDetectors] : def?.disabledDetectors ?? []
	};
}
function buildScriptExtensionsConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.scriptExtensions;
	const p = raw ?? {};
	return {
		enabled: p.enabled ?? def?.enabled ?? true,
		enforceTypeScript: p.enforceTypeScript ?? def?.enforceTypeScript ?? true,
		allowMjs: p.allowMjs ?? def?.allowMjs ?? false,
		allowCjs: p.allowCjs ?? def?.allowCjs ?? false,
		allowJsScripts: p.allowJsScripts ?? def?.allowJsScripts ?? false,
		exemptFiles: p.exemptFiles ? [...p.exemptFiles] : def?.exemptFiles ?? []
	};
}
function buildPackageDistributionConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.packageDistribution;
	const p = raw ?? {};
	return {
		enabled: p.enabled ?? def?.enabled ?? false,
		pkgDir: p.pkgDir ?? def?.pkgDir,
		level: p.level ?? def?.level ?? "warning"
	};
}
function buildPackageScriptsConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.packageScripts;
	const p = raw ?? {};
	if (p.recommendedScripts !== void 0 && typeof p.recommendedScripts !== "boolean") throw new Error(`[AuditConfig] Error de tipo en 'packageScripts.recommendedScripts': se recibió '${String(p.recommendedScripts)}'. Debe ser un valor booleano estricto (true o false). El uso de cadenas como 'off' o 'essential' está estrictamente prohibido.`);
	if (p.enforceBuildAudit !== void 0 && typeof p.enforceBuildAudit !== "boolean") throw new Error(`[AuditConfig] Error de tipo en 'packageScripts.enforceBuildAudit': se recibió '${String(p.enforceBuildAudit)}'. Debe ser un valor booleano estricto (true o false).`);
	return {
		enabled: p.enabled ?? def?.enabled ?? true,
		enforceBuildAudit: p.enforceBuildAudit ?? def?.enforceBuildAudit ?? true,
		recommendedScripts: p.recommendedScripts ?? def?.recommendedScripts ?? true,
		extraRequiredScripts: p.extraRequiredScripts ? [...p.extraRequiredScripts] : def?.extraRequiredScripts ?? []
	};
}
function buildScriptCommandsConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.scriptCommands;
	const p = raw ?? {};
	return {
		enabled: p.enabled ?? def?.enabled ?? true,
		exemptGlobs: p.exemptGlobs ? [...p.exemptGlobs] : def?.exemptGlobs ?? [],
		allowedNpxBinaries: p.allowedNpxBinaries ? [...p.allowedNpxBinaries] : def?.allowedNpxBinaries ?? []
	};
}
function buildRatchetConfig(raw) {
	const r = raw ?? {};
	if (r.enabled !== void 0 && typeof r.enabled !== "boolean") throw new Error(`[AuditConfig] 'ratchet.enabled' must be a strict boolean, received '${String(r.enabled)}'.`);
	const productionRef = r.productionRef ?? DEFAULT_AUDIT_CONFIG.ratchet?.productionRef ?? "origin/main";
	if (productionRef.trim() === "" || /\s/u.test(productionRef) || productionRef.startsWith("-")) throw new Error(`[AuditConfig] 'ratchet.productionRef' must be a non-empty git ref without whitespace or leading '-', received '${productionRef}'.`);
	const baselineFile = r.baselineFile ?? DEFAULT_AUDIT_CONFIG.ratchet?.baselineFile ?? path.posix.join(".auditor", "audit-baseline.json");
	const normalized = path.posix.normalize(baselineFile.replaceAll("\\", "/"));
	if (path.isAbsolute(baselineFile) || normalized.startsWith("..") || path.extname(baselineFile) !== ".json") throw new Error(`[AuditConfig] 'ratchet.baselineFile' must be a repository-relative '.json' path inside the project, received '${baselineFile}'.`);
	return {
		enabled: r.enabled ?? DEFAULT_AUDIT_CONFIG.ratchet?.enabled ?? true,
		productionRef,
		baselineFile: normalized
	};
}
function validateTestCoverageRaw(t) {
	if (t.enabled !== void 0 && typeof t.enabled !== "boolean") throw new Error(`[AuditConfig] 'testCoverage.enabled' must be a strict boolean, received '${String(t.enabled)}'.`);
	if (t.threshold !== void 0 && (typeof t.threshold !== "number" || Number.isNaN(t.threshold) || t.threshold < 0 || t.threshold > 100)) throw new Error(`[AuditConfig] 'testCoverage.threshold' must be a number between 0 and 100, received '${String(t.threshold)}'.`);
	if (t.enforceInAudit !== void 0 && typeof t.enforceInAudit !== "boolean") throw new Error(`[AuditConfig] 'testCoverage.enforceInAudit' must be a strict boolean, received '${String(t.enforceInAudit)}'.`);
}
function resolveTestCoverageCollections(t, def) {
	return {
		roots: t.roots ? [...t.roots] : def?.roots ?? ["src"],
		extensions: t.extensions ? [...t.extensions] : def?.extensions ?? [
			".ts",
			".vue",
			".js",
			".jsx",
			".tsx",
			".mjs",
			".cjs"
		],
		exemptGlobs: t.exemptGlobs ? [...t.exemptGlobs] : def?.exemptGlobs ?? [],
		directoryThresholds: t.directoryThresholds ? { ...t.directoryThresholds } : def?.directoryThresholds ?? {}
	};
}
function buildTestCoverageConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.testCoverage;
	const t = raw ?? {};
	validateTestCoverageRaw(t);
	const collections = resolveTestCoverageCollections(t, def);
	return {
		enabled: t.enabled ?? def?.enabled ?? true,
		threshold: t.threshold ?? def?.threshold ?? 80,
		path: t.path ?? def?.path ?? "scratch/coverage/coverage-final.json",
		runCommand: t.runCommand ?? def?.runCommand ?? "vp test --coverage",
		enforceInAudit: t.enforceInAudit ?? def?.enforceInAudit ?? true,
		...collections
	};
}
function buildAccessibilityConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.accessibility;
	const a = raw ?? {};
	const parsedRules = {};
	const sourceRules = a.rules ?? def?.rules ?? {};
	for (const [key, val] of Object.entries(sourceRules)) {
		if (typeof val !== "boolean") throw new Error(`[AuditConfig] Error de tipo en 'accessibility.rules.${key}': se recibió '${String(val)}'. Debe ser un valor booleano estricto (true o false). El uso de cadenas como 'off' o 'error' está estrictamente prohibido.`);
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
		ignoreFiles: t.ignoreFiles ? [...t.ignoreFiles] : def?.ignoreFiles ?? []
	};
}
function buildGitIgnoreConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.gitIgnore;
	const g = raw ?? {};
	return {
		enabled: g.enabled ?? def?.enabled ?? true,
		extraRequiredEntries: g.extraRequiredEntries ? [...g.extraRequiredEntries] : def?.extraRequiredEntries ?? []
	};
}
function buildOxlintConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.oxlint;
	return { enabled: (raw ?? {}).enabled ?? def?.enabled ?? true };
}
function buildOxfmtConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.oxfmt;
	return { enabled: (raw ?? {}).enabled ?? def?.enabled ?? true };
}
function buildVitePlusPrecompressConfig(raw, def) {
	const v = raw ?? {};
	return {
		enabled: v.enabled ?? def?.enabled ?? true,
		brotli: v.brotli ?? def?.brotli ?? true,
		gzip: v.gzip ?? def?.gzip ?? true,
		server: v.server ?? def?.server ?? "nginx",
		spa: v.spa ?? def?.spa ?? true,
		report: v.report ?? def?.report ?? "summary",
		threshold: v.threshold ?? def?.threshold ?? 512,
		outDir: v.outDir ?? def?.outDir
	};
}
function buildVitePlusFmtConfig(raw, def) {
	const v = raw ?? {};
	return {
		enabled: v.enabled ?? def?.enabled ?? true,
		singleQuote: v.singleQuote ?? def?.singleQuote ?? true,
		semi: v.semi ?? def?.semi ?? true,
		trailingComma: v.trailingComma ?? def?.trailingComma ?? "none",
		tabWidth: v.tabWidth ?? def?.tabWidth,
		useTabs: v.useTabs ?? def?.useTabs,
		printWidth: v.printWidth ?? def?.printWidth ?? 100,
		sortPackageJson: v.sortPackageJson ?? def?.sortPackageJson ?? true,
		ignorePatterns: v.ignorePatterns ? [...v.ignorePatterns] : def?.ignorePatterns ?? [],
		overrides: v.overrides ? [...v.overrides] : def?.overrides ?? []
	};
}
function buildVitePlusLintConfig(raw, def) {
	const v = raw ?? {};
	return {
		enabled: v.enabled ?? def?.enabled ?? true,
		typeAware: v.typeAware ?? def?.typeAware ?? true,
		typeCheck: v.typeCheck ?? def?.typeCheck ?? true,
		categories: v.categories ? { ...v.categories } : def?.categories,
		rules: v.rules ? { ...v.rules } : def?.rules,
		ignorePatterns: v.ignorePatterns ? [...v.ignorePatterns] : def?.ignorePatterns ?? [],
		overrides: v.overrides ? [...v.overrides] : def?.overrides ?? []
	};
}
function buildVitePlusStagedConfig(rawStaged, defStaged) {
	const isStagedObject = typeof rawStaged === "object" && rawStaged !== null;
	const isStagedWithRules = isStagedObject && ("rules" in rawStaged || "enabled" in rawStaged);
	const stagedObj = rawStaged;
	const defStagedObj = defStaged;
	return {
		enabled: isStagedWithRules && typeof stagedObj?.enabled === "boolean" ? stagedObj.enabled : typeof defStagedObj?.enabled === "boolean" ? defStagedObj.enabled : true,
		rules: isStagedWithRules && stagedObj?.rules ? stagedObj.rules : isStagedObject && !("rules" in rawStaged) ? rawStaged : defStagedObj?.rules ? defStagedObj.rules : { "*": "vp check --fix" }
	};
}
function buildVitePlusConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.vitePlusConfig;
	const v = raw ?? {};
	return {
		enabled: v.enabled ?? def?.enabled ?? true,
		precompress: buildVitePlusPrecompressConfig(v.precompress, def?.precompress),
		fmt: buildVitePlusFmtConfig(v.fmt, def?.fmt),
		lint: buildVitePlusLintConfig(v.lint, def?.lint),
		staged: buildVitePlusStagedConfig(v.staged, def?.staged),
		hooks: v.hooks ? { ...v.hooks } : def?.hooks,
		vscode: v.vscode ? { ...v.vscode } : def?.vscode,
		extraLintRules: v.extraLintRules ? { ...v.extraLintRules } : def?.extraLintRules
	};
}
function buildVersionConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.version;
	const v = raw ?? {};
	return {
		enabled: v.enabled ?? def?.enabled ?? true,
		autoSyncPublicVersionJson: v.autoSyncPublicVersionJson ?? def?.autoSyncPublicVersionJson ?? true,
		syncTargets: v.syncTargets ? [...v.syncTargets] : def?.syncTargets ?? []
	};
}
function buildSecretLeaksConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.secretLeaks;
	const s = raw ?? {};
	return {
		enabled: s.enabled ?? def?.enabled ?? true,
		maskSecrets: s.maskSecrets ?? def?.maskSecrets ?? true,
		allowedPatterns: s.allowedPatterns ? [...s.allowedPatterns] : def?.allowedPatterns ?? [],
		exemptGlobs: s.exemptGlobs ? [...s.exemptGlobs] : def?.exemptGlobs ?? []
	};
}
function buildDependencyVulnerabilitiesConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.dependencyVulnerabilities;
	const d = raw ?? {};
	return {
		enabled: d.enabled ?? def?.enabled ?? false,
		failOn: d.failOn ?? def?.failOn ?? "critical",
		allowList: d.allowList ? [...d.allowList] : def?.allowList ?? [],
		includeDev: d.includeDev ?? def?.includeDev ?? false
	};
}
function resolveCoverageExemptGlobs(rawGlobs, protectedRoots) {
	const exemptGlobs = [];
	for (const entry of rawGlobs ?? []) {
		const glob = entry?.glob ?? "";
		assertNarrowCoverageGlob("coverage.exemptGlobs", glob, protectedRoots);
		assertCoverageReason("coverage.exemptGlobs", glob, entry?.reason);
		exemptGlobs.push({
			glob,
			reason: entry.reason
		});
	}
	return exemptGlobs;
}
function resolveAcknowledgedDegradations(rawDegradations, paths, protectedRoots) {
	const acknowledgedDegradations = [];
	for (const entry of rawDegradations ?? []) {
		const glob = entry?.glob ?? "";
		const policy = entry?.policy;
		if (!policy || !ACKNOWLEDGEABLE_EXEMPTION_POLICIES.includes(policy)) throw new Error(`[AuditConfig] 'coverage.acknowledgedDegradations' declara una política desconocida '${String(policy)}'. Válidas: ${ACKNOWLEDGEABLE_EXEMPTION_POLICIES.join(", ")}.`);
		const exemptRoots = getExemptRootsForPolicy(policy, paths);
		const effectiveProtectedRoots = exemptRoots.length > 0 ? filterOutExemptRoots(protectedRoots, exemptRoots) : protectedRoots;
		assertNarrowCoverageGlob("coverage.acknowledgedDegradations", glob, effectiveProtectedRoots);
		assertCoverageReason("coverage.acknowledgedDegradations", glob, entry?.reason);
		acknowledgedDegradations.push({
			policy,
			glob,
			reason: entry.reason
		});
	}
	return acknowledgedDegradations;
}
function buildCoverageConfig(raw, paths) {
	const c = raw ?? {};
	const protectedRoots = Array.from(/* @__PURE__ */ new Set([
		...paths.srcRoots ?? [],
		...paths.codeRoots ?? [],
		...paths.testRoots ?? []
	]));
	return {
		enabled: c.enabled ?? DEFAULT_AUDIT_CONFIG.coverage?.enabled ?? true,
		exemptGlobs: resolveCoverageExemptGlobs(c.exemptGlobs, protectedRoots),
		acknowledgedDegradations: resolveAcknowledgedDegradations(c.acknowledgedDegradations, paths, protectedRoots)
	};
}
function buildValibotConfig(raw) {
	const v = raw ?? {};
	return {
		enabled: v.enabled ?? DEFAULT_AUDIT_CONFIG.valibot?.enabled ?? true,
		targets: v.targets ? v.targets : []
	};
}
function buildWebPerformanceConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.webPerformance;
	const w = raw ?? {};
	return {
		enabled: w.enabled ?? def.enabled,
		maxDomDepth: w.maxDomDepth ?? def.maxDomDepth,
		maxInlineSvgSize: w.maxInlineSvgSize ?? def.maxInlineSvgSize,
		exemptSvgPaths: w.exemptSvgPaths ? [...w.exemptSvgPaths] : def.exemptSvgPaths,
		exemptImgClasses: w.exemptImgClasses ? [...w.exemptImgClasses] : def.exemptImgClasses,
		exemptPaths: w.exemptPaths ? [...w.exemptPaths] : def.exemptPaths
	};
}
function buildQueryPerformanceConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.queryPerformance;
	const q = raw ?? {};
	return {
		enabled: q.enabled ?? def.enabled,
		excludeMigrationsDir: q.excludeMigrationsDir ?? def.excludeMigrationsDir,
		exemptSelectStarPaths: q.exemptSelectStarPaths ? [...q.exemptSelectStarPaths] : def.exemptSelectStarPaths,
		exemptPaths: q.exemptPaths ? [...q.exemptPaths] : def.exemptPaths
	};
}
function buildSecurityHardeningConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.securityHardening;
	const s = raw ?? {};
	return {
		enabled: s.enabled ?? def.enabled,
		exemptPaths: s.exemptPaths ? [...s.exemptPaths] : def.exemptPaths
	};
}
function buildCodeSimplificationConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.codeSimplification;
	const c = raw ?? {};
	return {
		enabled: c.enabled ?? def.enabled,
		maxNestingDepth: c.maxNestingDepth ?? def.maxNestingDepth,
		allowMatrixLoops: c.allowMatrixLoops ?? def.allowMatrixLoops,
		exemptPaths: c.exemptPaths ? [...c.exemptPaths] : def.exemptPaths
	};
}
function buildScssArchitectureConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.scssArchitecture;
	const s = raw ?? {};
	return {
		enabled: s.enabled ?? def.enabled,
		maxNestingDepth: s.maxNestingDepth ?? def.maxNestingDepth,
		scopedMaxNestingDepth: s.scopedMaxNestingDepth ?? def.scopedMaxNestingDepth,
		allowPixelArtSpacing: s.allowPixelArtSpacing ?? def.allowPixelArtSpacing,
		allowedSpacingUnits: s.allowedSpacingUnits ? [...s.allowedSpacingUnits] : def.allowedSpacingUnits,
		allowScopedColors: s.allowScopedColors ?? def.allowScopedColors,
		exemptPaths: s.exemptPaths ? [...s.exemptPaths] : def.exemptPaths
	};
}
function defineAuditConfig(config) {
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
			rules: config.stylelint.rules ? Object.assign({}, config.stylelint.rules) : void 0,
			ignoreGlobs: config.stylelint.ignoreGlobs ? [...config.stylelint.ignoreGlobs] : [],
			strictValues: config.stylelint.strictValues ? {
				properties: config.stylelint.strictValues.properties ? [...config.stylelint.strictValues.properties] : [],
				ignoreValues: config.stylelint.strictValues.ignoreValues ? { ...config.stylelint.strictValues.ignoreValues } : {},
				ignoreAtRules: config.stylelint.strictValues.ignoreAtRules ? [...config.stylelint.strictValues.ignoreAtRules] : []
			} : void 0
		} : {
			enabled: true,
			rules: {},
			ignoreGlobs: []
		},
		oxlint: buildOxlintConfig(config.oxlint),
		oxfmt: buildOxfmtConfig(config.oxfmt),
		vitePlusConfig: buildVitePlusConfig(config.vitePlusConfig),
		bundle: buildBundleConfig(config.bundle),
		fallow: buildFallowConfig(config.fallow, config.security),
		packageHygiene: buildPackageHygieneConfig(config.packageHygiene),
		packageDistribution: buildPackageDistributionConfig(config.packageDistribution),
		packageScripts: buildPackageScriptsConfig(config.packageScripts),
		scriptCommands: buildScriptCommandsConfig(config.scriptCommands),
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
		webPerformance: buildWebPerformanceConfig(config.webPerformance),
		queryPerformance: buildQueryPerformanceConfig(config.queryPerformance),
		securityHardening: buildSecurityHardeningConfig(config.securityHardening),
		codeSimplification: buildCodeSimplificationConfig(config.codeSimplification),
		scssArchitecture: buildScssArchitectureConfig(config.scssArchitecture),
		...agentAndSecurity,
		...constantsAndDoc,
		customFamilies: config.customFamilies ?? [],
		extensions: config.extensions ?? [],
		presets: config.presets ?? {},
		runner: config.runner ? {
			timeoutMs: config.runner.timeoutMs ?? 0,
			concurrency: config.runner.concurrency,
			maxStalenessMinutes: config.runner.maxStalenessMinutes ?? 5
		} : {
			timeoutMs: 0,
			maxStalenessMinutes: 5
		},
		_declaredSubsystems: declared,
		_rawPaths: rawPaths,
		_rawConfig: rawConfig
	};
}
//#endregion
export { DEFAULT_AUDIT_CONFIG, DEFAULT_PRECOMPRESS_THRESHOLD_BYTES, DEFAULT_SIMILAR_CODE_THRESHOLD, DEFAULT_TEST_COVERAGE_PERCENTAGE, DEFAULT_TYPE_COVERAGE_AT_LEAST, buildAccessibilityConfig, buildAgentAndSecurityConfig, buildAuditorHygieneConfig, buildBundleConfig, buildCodeSimplificationConfig, buildConstantsAndDocConfig, buildCoverageConfig, buildDependencyVulnerabilitiesConfig, buildDomainConfig, buildEnvironmentConfig, buildFallowConfig, buildFallowSimilarCodeConfig, buildGitIgnoreConfig, buildOxfmtConfig, buildOxlintConfig, buildPackageDistributionConfig, buildPackageHygieneConfig, buildPackageScriptsConfig, buildPathsConfig, buildPersistenceConfig, buildQueryPerformanceConfig, buildRatchetConfig, buildScriptCommandsConfig, buildScriptExtensionsConfig, buildScssArchitectureConfig, buildSecretLeaksConfig, buildSecurityHardeningConfig, buildStylesConfig, buildTemplatesConfig, buildTestCoverageConfig, buildTypeCoverageConfig, buildValibotConfig, buildVersionConfig, buildVitePlusConfig, buildWebPerformanceConfig, collectDeclaredSubsystems, defineAuditConfig };
