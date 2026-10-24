import { ACKNOWLEDGEABLE_EXEMPTION_POLICIES } from "./auditConfigTypes.js";
import { assertCoverageReason, assertNarrowCoverageGlob, filterOutExemptRoots, getExemptRootsForPolicy } from "./auditConfigAntiAbuse.js";
import { DEFAULT_AUDIT_CONFIG, collectDeclaredSubsystems } from "./auditConfigDefaults.js";
import { normalizePosixPath } from "./reportUtils.js";
import path from "node:path";
// src/core/auditConfigBuilders.ts
/**
* packages/auditor/src/core/auditConfigBuilders.ts
*
* Subsystem configuration builders and canonical defineAuditConfig coordinator.
*/
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
		enabled: t.enabled ?? DEFAULT_AUDIT_CONFIG.templates?.enabled ?? true,
		requireInputIds: t.requireInputIds ?? DEFAULT_AUDIT_CONFIG.templates?.requireInputIds ?? true,
		tooltipComponents: t.tooltipComponents ?? [],
		forbiddenTemplateCallPatterns: t.forbiddenTemplateCallPatterns ?? [],
		safeTemplateFunctions: t.safeTemplateFunctions ?? []
	};
}
function buildStandaloneStylelintConfig(stylelint, stylesStylelint) {
	const mergedIgnoreGlobs = Array.from(/* @__PURE__ */ new Set([...stylesStylelint?.ignoreGlobs ?? [], ...stylelint?.ignoreGlobs ?? []]));
	const mergedExemptPaths = Array.from(/* @__PURE__ */ new Set([...stylesStylelint?.exemptPaths ?? [], ...stylelint?.exemptPaths ?? []]));
	const mergedExemptFiles = Array.from(/* @__PURE__ */ new Set([...stylesStylelint?.exemptFiles ?? [], ...stylelint?.exemptFiles ?? []]));
	const base = buildBaseSubsystemConfig({
		...stylesStylelint,
		...stylelint,
		ignoreGlobs: mergedIgnoreGlobs.length > 0 ? mergedIgnoreGlobs : void 0,
		exemptPaths: mergedExemptPaths.length > 0 ? mergedExemptPaths : void 0,
		exemptFiles: mergedExemptFiles.length > 0 ? mergedExemptFiles : void 0
	}, true);
	const effectiveRules = {
		...stylesStylelint?.rules ?? {},
		...stylelint?.rules ?? {}
	};
	const baseStrict = stylesStylelint?.strictValues;
	const topStrict = stylelint?.strictValues;
	const effectiveStrict = topStrict || baseStrict ? {
		enabled: topStrict?.enabled ?? baseStrict?.enabled ?? true,
		properties: Array.from(/* @__PURE__ */ new Set([...baseStrict?.properties ?? [], ...topStrict?.properties ?? []])),
		ignoreValues: {
			...baseStrict?.ignoreValues ?? {},
			...topStrict?.ignoreValues ?? {}
		},
		ignoreAtRules: Array.from(/* @__PURE__ */ new Set([...baseStrict?.ignoreAtRules ?? [], ...topStrict?.ignoreAtRules ?? []]))
	} : void 0;
	const effectiveConfigFile = stylelint?.configFile ?? stylesStylelint?.configFile;
	const order = {
		enabled: stylelint?.order?.enabled ?? stylesStylelint?.order?.enabled ?? true,
		enforceHasBlockPartitioning: stylelint?.order?.enforceHasBlockPartitioning ?? stylesStylelint?.order?.enforceHasBlockPartitioning ?? true
	};
	return {
		...base,
		configFile: effectiveConfigFile,
		rules: Object.keys(effectiveRules).length > 0 ? effectiveRules : {},
		strictValues: effectiveStrict,
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
		zLayers: s.zLayers ? { ...s.zLayers } : void 0
	};
}
function buildStylesConfig(raw, rawStylelintTop) {
	const s = raw ?? {};
	const def = DEFAULT_AUDIT_CONFIG.styles;
	const base = buildBaseSubsystemConfig(s, def?.enabled ?? true);
	const stylelint = buildStandaloneStylelintConfig(rawStylelintTop, s.stylelint);
	const zLayers = buildZLayersSubConfig(s);
	return {
		...base,
		globalUtilityClasses: s.globalUtilityClasses ?? [],
		canonicalButtonVariants: s.canonicalButtonVariants ?? [],
		...zLayers,
		lineHeightOverlapCheck: s.lineHeightOverlapCheck ?? def?.lineHeightOverlapCheck ?? true,
		heavyEffectPaths: s.heavyEffectPaths ?? [],
		buttonGovernance: s.buttonGovernance ? {
			enabled: s.buttonGovernance.enabled ?? true,
			buttonsScssFile: s.buttonGovernance.buttonsScssFile,
			canonicalVariants: s.buttonGovernance.canonicalVariants
		} : void 0,
		stylelint,
		enforceScss: s.enforceScss ?? def?.enforceScss ?? false,
		exemptCssFiles: s.exemptCssFiles ?? []
	};
}
function buildBundleConfig(raw) {
	const b = raw ?? {};
	const def = DEFAULT_AUDIT_CONFIG.bundle;
	return {
		...buildBaseSubsystemConfig(b, def?.enabled ?? true),
		statsFile: b.statsFile ?? def?.statsFile,
		distDir: b.distDir ?? def?.distDir,
		exemptChunkPrefixes: b.exemptChunkPrefixes ?? [],
		maxClientChunkWarnBytes: b.maxClientChunkWarnBytes ?? def?.maxClientChunkWarnBytes,
		maxClientChunkErrorBytes: b.maxClientChunkErrorBytes ?? def?.maxClientChunkErrorBytes,
		budgets: b.budgets ?? [],
		duplicateModuleThresholdBytes: b.duplicateModuleThresholdBytes ?? def?.duplicateModuleThresholdBytes,
		topModulesLimit: b.topModulesLimit ?? def?.topModulesLimit,
		forbiddenUiImports: b.forbiddenUiImports ?? []
	};
}
function buildAgentAndSecurityConfig(config) {
	const secEnabled = config.fallow?.security?.enabled ?? config.security?.enabled ?? DEFAULT_AUDIT_CONFIG.security?.enabled ?? true;
	const agentPluginBase = buildBaseSubsystemConfig(config.agentPlugin, DEFAULT_AUDIT_CONFIG.agentPlugin?.enabled ?? true);
	const securityBase = buildBaseSubsystemConfig(config.security, secEnabled);
	const animationBase = buildBaseSubsystemConfig(config.animation, DEFAULT_AUDIT_CONFIG.animation?.enabled ?? true);
	return {
		agentPlugin: { ...agentPluginBase },
		security: {
			...securityBase,
			enabled: secEnabled
		},
		animation: {
			...animationBase,
			customTimerFunctions: config.animation?.customTimerFunctions ? [...config.animation.customTimerFunctions] : DEFAULT_AUDIT_CONFIG.animation?.customTimerFunctions ?? []
		}
	};
}
function buildConstantsSubConfig(c) {
	const base = buildBaseSubsystemConfig(c, DEFAULT_AUDIT_CONFIG.constants?.enabled ?? true);
	return {
		...base,
		ignoredNames: c?.ignoredNames ? [...c.ignoredNames] : DEFAULT_AUDIT_CONFIG.constants?.ignoredNames ?? [],
		exemptMagicNumbers: c?.exemptMagicNumbers ? [...c.exemptMagicNumbers] : DEFAULT_AUDIT_CONFIG.constants?.exemptMagicNumbers ?? [],
		allowedNumericPrefixes: c?.allowedNumericPrefixes ? [...c.allowedNumericPrefixes] : DEFAULT_AUDIT_CONFIG.constants?.allowedNumericPrefixes ?? [],
		exemptPaths: c?.exemptPaths ? [...c.exemptPaths] : base.exemptPaths ?? [],
		exemptFiles: c?.exemptFiles ? [...c.exemptFiles] : base.exemptFiles ?? [],
		ignoreGlobs: c?.ignoreGlobs ? [...c.ignoreGlobs] : base.ignoreGlobs ?? []
	};
}
function buildDocumentationSubConfig(d) {
	return {
		...buildBaseSubsystemConfig(d, DEFAULT_AUDIT_CONFIG.documentation?.enabled ?? true),
		knownValidAbstractPaths: d?.knownValidAbstractPaths ? [...d.knownValidAbstractPaths] : DEFAULT_AUDIT_CONFIG.documentation?.knownValidAbstractPaths ?? [],
		skillsRoots: d?.skillsRoots ? [...d.skillsRoots] : DEFAULT_AUDIT_CONFIG.documentation?.skillsRoots ?? [],
		unignoreDirs: d?.unignoreDirs ? [...d.unignoreDirs] : DEFAULT_AUDIT_CONFIG.documentation?.unignoreDirs ?? [],
		allowedNpxBinaries: d?.allowedNpxBinaries ? [...d.allowedNpxBinaries] : DEFAULT_AUDIT_CONFIG.documentation?.allowedNpxBinaries ?? [],
		language: d?.language ?? DEFAULT_AUDIT_CONFIG.documentation?.language ?? "en",
		chatLanguage: d?.chatLanguage ?? DEFAULT_AUDIT_CONFIG.documentation?.chatLanguage ?? "es",
		languageExemptions: d?.languageExemptions ? [...d.languageExemptions] : DEFAULT_AUDIT_CONFIG.documentation?.languageExemptions ?? []
	};
}
function buildConstantsAndDocConfig(config) {
	const piniaBase = buildBaseSubsystemConfig(config.pinia, DEFAULT_AUDIT_CONFIG.pinia?.enabled ?? true);
	const e2eBase = buildBaseSubsystemConfig(config.e2e, DEFAULT_AUDIT_CONFIG.e2e?.enabled ?? true);
	return {
		constants: buildConstantsSubConfig(config.constants),
		documentation: buildDocumentationSubConfig(config.documentation),
		pinia: {
			...piniaBase,
			authorizedMutationFiles: config.pinia?.authorizedMutationFiles ? [...config.pinia.authorizedMutationFiles] : DEFAULT_AUDIT_CONFIG.pinia?.authorizedMutationFiles ?? []
		},
		e2e: {
			...e2eBase,
			idLocatorsOnly: config.e2e?.idLocatorsOnly ?? DEFAULT_AUDIT_CONFIG.e2e?.idLocatorsOnly ?? false
		}
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
	const base = buildBaseSubsystemConfig(f, def?.enabled ?? true);
	const secEnabled = f.security?.enabled ?? rootSecurity?.enabled ?? def?.security?.enabled ?? true;
	return {
		...base,
		security: { enabled: secEnabled },
		enforceTargets: f.enforceTargets ?? def?.enforceTargets ?? true,
		maxTargetPriority: f.maxTargetPriority ?? def?.maxTargetPriority ?? "high",
		similarCode: buildFallowSimilarCodeConfig(f.similarCode),
		flags: buildFallowFlagsConfig(f.flags, def?.flags),
		coverage: buildFallowCoverageConfig(f.coverage, def?.coverage),
		typeAware: f.typeAware ?? def?.typeAware ?? true,
		showCascade: f.showCascade ?? def?.showCascade ?? true,
		duplicates: {
			enabled: f.duplicates?.enabled ?? def?.duplicates?.enabled ?? true,
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
		...buildBaseSubsystemConfig(p, def?.enabled ?? true),
		ignoreDependencies: p.ignoreDependencies ? [...p.ignoreDependencies] : def?.ignoreDependencies ?? [],
		ignoreBinaries: p.ignoreBinaries ? [...p.ignoreBinaries] : def?.ignoreBinaries ?? [],
		entry: p.entry ? [...p.entry] : void 0,
		project: p.project ? [...p.project] : void 0
	};
}
function buildEnvironmentConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.environment;
	return buildBaseSubsystemConfig(raw, def?.enabled ?? true);
}
function buildAuditorHygieneConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.auditorHygiene;
	const p = raw ?? {};
	return {
		...buildBaseSubsystemConfig(p, def?.enabled ?? true),
		roots: p.roots ? [...p.roots] : def?.roots ? [...def.roots] : ["scripts/auditors"],
		exemptFiles: p.exemptFiles ? [...p.exemptFiles] : def?.exemptFiles ?? [],
		disabledDetectors: p.disabledDetectors ? [...p.disabledDetectors] : def?.disabledDetectors ?? []
	};
}
function buildScriptExtensionsConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.scriptExtensions;
	const p = raw ?? {};
	return {
		...buildBaseSubsystemConfig(p, def?.enabled ?? true),
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
		...buildBaseSubsystemConfig(p, def?.enabled ?? false),
		pkgDir: p.pkgDir ?? def?.pkgDir,
		level: p.level ?? def?.level ?? "warning"
	};
}
function buildPackageScriptsConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.packageScripts;
	const p = raw ?? {};
	if (p.recommendedScripts !== void 0 && typeof p.recommendedScripts !== "boolean") throw new Error(`[AuditConfig] Type error in 'packageScripts.recommendedScripts': received '${String(p.recommendedScripts)}'. Must be a strict boolean value (true or false). Strings such as 'off' or 'essential' are strictly prohibited.`);
	if (p.enforceBuildAudit !== void 0 && typeof p.enforceBuildAudit !== "boolean") throw new Error(`[AuditConfig] Type error in 'packageScripts.enforceBuildAudit': received '${String(p.enforceBuildAudit)}'. Must be a strict boolean value (true or false).`);
	return {
		...buildBaseSubsystemConfig(p, def?.enabled ?? true),
		enforceBuildAudit: p.enforceBuildAudit ?? def?.enforceBuildAudit ?? true,
		recommendedScripts: p.recommendedScripts ?? def?.recommendedScripts ?? true,
		extraRequiredScripts: p.extraRequiredScripts ? [...p.extraRequiredScripts] : def?.extraRequiredScripts ?? []
	};
}
function buildScriptCommandsConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.scriptCommands;
	const p = raw ?? {};
	return {
		...buildBaseSubsystemConfig(p, def?.enabled ?? true),
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
	const normalized = path.posix.normalize(baselineFile.replaceAll(path.win32.sep, path.posix.sep));
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
function normalizePathToPosixGlob(p) {
	const norm = normalizePosixPath(p);
	return norm.endsWith(path.posix.sep) ? `${norm}**` : path.posix.join(norm, "**");
}
function buildTestCoverageConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.testCoverage;
	const t = raw ?? {};
	validateTestCoverageRaw(t);
	const base = buildBaseSubsystemConfig(t, def?.enabled ?? true);
	const collections = resolveTestCoverageCollections(t, def);
	const combinedExemptGlobs = Array.from(/* @__PURE__ */ new Set([
		...collections.exemptGlobs.map((f) => normalizePosixPath(f)),
		...base.ignoreGlobs?.map((f) => normalizePosixPath(f)) ?? [],
		...base.exemptPaths?.map(normalizePathToPosixGlob) ?? [],
		...base.exemptFiles?.map((f) => normalizePosixPath(f)) ?? []
	]));
	return {
		...base,
		threshold: t.threshold ?? def?.threshold ?? 80,
		path: t.path ?? def?.path ?? "scratch/coverage/coverage-final.json",
		runCommand: t.runCommand ?? def?.runCommand ?? "vp test --coverage",
		enforceInAudit: t.enforceInAudit ?? def?.enforceInAudit ?? true,
		...collections,
		exemptGlobs: combinedExemptGlobs
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
		...buildBaseSubsystemConfig(a, def?.enabled ?? true),
		rules: parsedRules
	};
}
function buildTypeCoverageConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.typeCoverage;
	const t = raw ?? {};
	return {
		...buildBaseSubsystemConfig(t, def?.enabled ?? true),
		atLeast: t.atLeast ?? def?.atLeast ?? 95,
		strict: t.strict ?? def?.strict ?? true,
		ignoreFiles: t.ignoreFiles ? [...t.ignoreFiles] : def?.ignoreFiles ?? []
	};
}
function buildGitIgnoreConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.gitIgnore;
	const g = raw ?? {};
	return {
		...buildBaseSubsystemConfig(g, def?.enabled ?? true),
		extraRequiredEntries: g.extraRequiredEntries ? [...g.extraRequiredEntries] : def?.extraRequiredEntries ?? []
	};
}
function extractStringArrayProperty(arr) {
	if (!Array.isArray(arr)) return void 0;
	return arr.filter((x) => typeof x === "string");
}
function buildBaseSubsystemConfig(raw, defaultEnabled = true) {
	const enabled = raw?.enabled !== void 0 ? raw.enabled : defaultEnabled;
	const ignoreGlobs = extractStringArrayProperty(raw?.ignoreGlobs);
	const exemptPaths = extractStringArrayProperty(raw?.exemptPaths);
	const exemptFiles = extractStringArrayProperty(raw?.exemptFiles);
	const base = {
		enabled,
		...ignoreGlobs !== void 0 ? { ignoreGlobs } : {},
		...exemptPaths !== void 0 ? { exemptPaths } : {},
		...exemptFiles !== void 0 ? { exemptFiles } : {}
	};
	return {
		...raw,
		...base
	};
}
function buildOxlintConfig(raw) {
	return buildBaseSubsystemConfig(raw, DEFAULT_AUDIT_CONFIG.oxlint?.enabled ?? true);
}
function buildOxfmtConfig(raw) {
	return buildBaseSubsystemConfig(raw, DEFAULT_AUDIT_CONFIG.oxfmt?.enabled ?? true);
}
function buildHtmlValidateConfig(raw) {
	return buildBaseSubsystemConfig(raw, DEFAULT_AUDIT_CONFIG.htmlValidate?.enabled ?? true);
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
		hooks: v.hooks ? {
			...v.hooks,
			enabled: v.hooks.enabled ?? def?.hooks?.enabled ?? true
		} : def?.hooks,
		vscode: v.vscode ? {
			...v.vscode,
			enabled: v.vscode.enabled ?? def?.vscode?.enabled ?? true
		} : def?.vscode,
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
		...buildBaseSubsystemConfig(s, def?.enabled ?? true),
		maskSecrets: s.maskSecrets ?? def?.maskSecrets ?? true,
		allowedPatterns: s.allowedPatterns ? [...s.allowedPatterns] : def?.allowedPatterns ?? [],
		exemptGlobs: s.exemptGlobs ? [...s.exemptGlobs] : def?.exemptGlobs ?? []
	};
}
function buildDependencyVulnerabilitiesConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.dependencyVulnerabilities;
	const d = raw ?? {};
	return {
		...buildBaseSubsystemConfig(d, def?.enabled ?? false),
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
		...buildBaseSubsystemConfig(c, DEFAULT_AUDIT_CONFIG.coverage?.enabled ?? true),
		exemptGlobs: resolveCoverageExemptGlobs(c.exemptGlobs, protectedRoots),
		acknowledgedDegradations: resolveAcknowledgedDegradations(c.acknowledgedDegradations, paths, protectedRoots)
	};
}
function buildValibotConfig(raw) {
	const v = raw ?? {};
	return {
		...buildBaseSubsystemConfig(v, DEFAULT_AUDIT_CONFIG.valibot?.enabled ?? true),
		targets: v.targets ? v.targets : []
	};
}
function buildWebPerformanceConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.webPerformance;
	const w = raw ?? {};
	return {
		...buildBaseSubsystemConfig(w, def.enabled ?? true),
		maxDomDepth: w.maxDomDepth ?? def.maxDomDepth,
		maxInlineSvgSize: w.maxInlineSvgSize ?? def.maxInlineSvgSize,
		exemptSvgPaths: w.exemptSvgPaths ? [...w.exemptSvgPaths] : def.exemptSvgPaths,
		exemptImgClasses: w.exemptImgClasses ? [...w.exemptImgClasses] : def.exemptImgClasses
	};
}
function buildQueryPerformanceConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.queryPerformance;
	const q = raw ?? {};
	return {
		...buildBaseSubsystemConfig(q, def.enabled ?? true),
		excludeMigrationsDir: q.excludeMigrationsDir ?? def.excludeMigrationsDir,
		exemptSelectStarPaths: q.exemptSelectStarPaths ? [...q.exemptSelectStarPaths] : def.exemptSelectStarPaths
	};
}
function buildSecurityHardeningConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.securityHardening;
	return buildBaseSubsystemConfig(raw, def.enabled ?? true);
}
function buildCodeSimplificationConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.codeSimplification;
	const c = raw ?? {};
	return {
		...buildBaseSubsystemConfig(c, def.enabled ?? true),
		maxNestingDepth: c.maxNestingDepth ?? def.maxNestingDepth,
		allowMatrixLoops: c.allowMatrixLoops ?? def.allowMatrixLoops
	};
}
function buildScssArchitectureConfig(raw) {
	const def = DEFAULT_AUDIT_CONFIG.scssArchitecture;
	const s = raw ?? {};
	return {
		...buildBaseSubsystemConfig(s, def.enabled ?? true),
		maxNestingDepth: s.maxNestingDepth ?? def.maxNestingDepth,
		scopedMaxNestingDepth: s.scopedMaxNestingDepth ?? def.scopedMaxNestingDepth,
		allowPixelArtSpacing: s.allowPixelArtSpacing ?? def.allowPixelArtSpacing,
		allowedSpacingUnits: s.allowedSpacingUnits ? [...s.allowedSpacingUnits] : def.allowedSpacingUnits,
		allowScopedColors: s.allowScopedColors ?? def.allowScopedColors
	};
}
function buildTypesConfig(types) {
	return buildBaseSubsystemConfig(types, DEFAULT_AUDIT_CONFIG.types?.enabled ?? true);
}
function buildEncodingConfig(encoding) {
	const def = DEFAULT_AUDIT_CONFIG.encoding;
	return {
		...buildBaseSubsystemConfig(encoding, def?.enabled ?? true),
		defaultEncoding: encoding?.defaultEncoding ?? def?.defaultEncoding ?? "utf-8",
		prohibitBom: encoding?.prohibitBom ?? def?.prohibitBom ?? true,
		detectMojibake: encoding?.detectMojibake ?? def?.detectMojibake ?? true,
		allowedExtensions: encoding?.allowedExtensions ? [...encoding.allowedExtensions] : def?.allowedExtensions,
		exemptGlobs: encoding?.exemptGlobs ? [...encoding.exemptGlobs] : def?.exemptGlobs ?? []
	};
}
function buildRunnerConfig(runner) {
	return {
		...buildBaseSubsystemConfig(runner, true),
		timeoutMs: runner?.timeoutMs ?? 0,
		concurrency: runner?.concurrency,
		maxStalenessMinutes: runner?.maxStalenessMinutes ?? 5
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
		stylelint: buildStandaloneStylelintConfig(config.stylelint, config.styles?.stylelint),
		oxlint: buildOxlintConfig(config.oxlint),
		oxfmt: buildOxfmtConfig(config.oxfmt),
		htmlValidate: buildHtmlValidateConfig(config.htmlValidate),
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
		types: buildTypesConfig(config.types),
		encoding: buildEncodingConfig(config.encoding),
		...agentAndSecurity,
		...constantsAndDoc,
		customFamilies: config.customFamilies ?? [],
		extensions: config.extensions ?? [],
		presets: config.presets ?? {},
		runner: buildRunnerConfig(config.runner),
		_declaredSubsystems: declared,
		_rawPaths: rawPaths,
		_rawConfig: rawConfig
	};
}
export { buildAccessibilityConfig, buildAgentAndSecurityConfig, buildAuditorHygieneConfig, buildBaseSubsystemConfig, buildBundleConfig, buildCodeSimplificationConfig, buildConstantsAndDocConfig, buildCoverageConfig, buildDependencyVulnerabilitiesConfig, buildDomainConfig, buildEnvironmentConfig, buildFallowConfig, buildFallowSimilarCodeConfig, buildGitIgnoreConfig, buildHtmlValidateConfig, buildOxfmtConfig, buildOxlintConfig, buildPackageDistributionConfig, buildPackageHygieneConfig, buildPackageScriptsConfig, buildPathsConfig, buildPersistenceConfig, buildQueryPerformanceConfig, buildRatchetConfig, buildScriptCommandsConfig, buildScriptExtensionsConfig, buildScssArchitectureConfig, buildSecretLeaksConfig, buildSecurityHardeningConfig, buildStylesConfig, buildTemplatesConfig, buildTestCoverageConfig, buildTypeCoverageConfig, buildValibotConfig, buildVersionConfig, buildVitePlusConfig, buildWebPerformanceConfig, defineAuditConfig };
