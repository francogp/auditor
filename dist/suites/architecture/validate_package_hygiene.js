import { AUDIT_CONFIG_FILE } from "../../core/auditConfigTypes.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/auditCoverage.js";
import { executeCliAndReadJson, resolvePackageBin } from "../../cli/cliUtils.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases, getEffectiveScannableRoots } from "../../core/auditorBase.js";
import "../../core/safePath.js";
import { getPackageJson } from "../../core/packageJson.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_package_hygiene.ts
enableCompileCache();
const PACKAGE_HYGIENE_RULES = [
	"package-unused-dependency",
	"package-unlisted-dependency",
	"package-unused-binary",
	"package-lockfile-integrity"
];
function extractReferencedScriptDependencies(projectRoot) {
	const referenced = /* @__PURE__ */ new Set();
	const pkg = getPackageJson(projectRoot);
	if (!pkg) return referenced;
	try {
		const scripts = pkg.scripts ? Object.values(pkg.scripts).join(" ") : "";
		const allDeps = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
		for (const dep of allDeps) {
			const cleanName = dep.startsWith("@") ? dep.split("/")[1] || dep : dep;
			const rootBin = cleanName.replace(/-cli$/, "");
			const escapedDep = dep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const escapedClean = cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const escapedRoot = rootBin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			if (new RegExp(`(?:^|[\\s"'\`;&|])(?:${escapedDep}|${escapedClean}|${escapedRoot})(?:[\\s"'\`;&|]|$)`, "i").test(scripts)) referenced.add(dep);
		}
	} catch {}
	return referenced;
}
function parseUnusedDeps(fileIssue, relFile, scriptReferencedDeps) {
	const allUnused = [
		...fileIssue.dependencies ?? [],
		...fileIssue.devDependencies ?? [],
		...fileIssue.optionalPeerDependencies ?? []
	];
	const findings = [];
	for (const dep of allUnused) {
		if (scriptReferencedDeps.has(dep.name)) continue;
		findings.push({
			suiteId: "validate_package_hygiene",
			suiteName: "Package & Dependency Hygiene Auditor",
			ruleId: "package-unused-dependency",
			ruleDescription: "Dependencias: Dependencia no utilizada en package",
			severity: "error",
			file: relFile,
			line: dep.line ?? 1,
			col: dep.col ?? 1,
			context: dep.name,
			message: `Dependencia no utilizada declarada en package.json: "${dep.name}"`
		});
	}
	return findings;
}
function parseUnlistedDeps(fileIssue, relFile) {
	return (fileIssue.unlisted ?? []).map((unlisted) => ({
		suiteId: "validate_package_hygiene",
		suiteName: "Package & Dependency Hygiene Auditor",
		ruleId: "package-unlisted-dependency",
		ruleDescription: "Dependencias: Dependencia fantasma no declarada",
		severity: "error",
		file: relFile,
		line: unlisted.line ?? 1,
		col: unlisted.col ?? 1,
		context: unlisted.name,
		message: `Dependencia fantasma no declarada en package.json importada en código: "${unlisted.name}"`
	}));
}
function extractOwnPackageBinaries(projectRoot) {
	const binaries = /* @__PURE__ */ new Set();
	const pkg = getPackageJson(projectRoot);
	if (!pkg) return binaries;
	if (typeof pkg.bin === "string") {
		if (pkg.name) binaries.add(pkg.name.replace(/^@[^/]+\//, ""));
	} else if (pkg.bin && typeof pkg.bin === "object") for (const binName of Object.keys(pkg.bin)) binaries.add(binName);
	return binaries;
}
function parseUnusedBinaries(fileIssue, relFile, ownBinaries = /* @__PURE__ */ new Set()) {
	return (fileIssue.binaries ?? []).filter((bin) => !ownBinaries.has(bin.name)).map((bin) => ({
		suiteId: "validate_package_hygiene",
		suiteName: "Package & Dependency Hygiene Auditor",
		ruleId: "package-unused-binary",
		ruleDescription: "Dependencias: Binario o script no referenciado",
		severity: "error",
		file: relFile,
		line: bin.line ?? 1,
		col: bin.col ?? 1,
		context: bin.name,
		message: `Binario o script ejecutable no referenciado en el proyecto: "${bin.name}"`
	}));
}
/**
* Parses raw JSON output from Knip into canonical AuditFindings.
*/
function parseKnipIssues(report, projectRoot = process.cwd(), isPathIgnored) {
	const issues = Array.isArray(report) ? report : report && "issues" in report && Array.isArray(report.issues) ? report.issues : [];
	const findings = [];
	const scriptReferencedDeps = extractReferencedScriptDependencies(projectRoot);
	const ownBinaries = extractOwnPackageBinaries(projectRoot);
	for (const fileIssue of issues) {
		const rawFile = fileIssue.file || "package.json";
		const relFile = toPosixRelative(projectRoot, rawFile);
		if (relFile !== "package.json" && isPathIgnored?.(relFile)) continue;
		findings.push(...parseUnusedDeps(fileIssue, relFile, scriptReferencedDeps));
		findings.push(...parseUnlistedDeps(fileIssue, relFile));
		findings.push(...parseUnusedBinaries(fileIssue, relFile, ownBinaries));
	}
	return findings;
}
/**
* Validates package-lock.json integrity, version standards, and absence of insecure HTTP registries.
*/
function verifyLockfileIntegrity(projectRoot, isFixMode = false) {
	const findings = [];
	const lockfilePath = path.resolve(projectRoot, "package-lock.json");
	const pkgJsonPath = path.resolve(projectRoot, "package.json");
	if (!fs.existsSync(pkgJsonPath)) return findings;
	if (!fs.existsSync(lockfilePath)) {
		findings.push({
			suiteId: "validate_package_hygiene",
			suiteName: "Package & Dependency Hygiene Auditor",
			ruleId: "package-lockfile-integrity",
			ruleDescription: "Dependencias: Lockfile corrupto o inseguro",
			severity: "error",
			file: "package-lock.json",
			line: 1,
			context: "package-lock.json",
			message: "No se encontró package-lock.json. El proyecto debe versionar el lockfile."
		});
		return findings;
	}
	let rawContent;
	try {
		rawContent = fs.readFileSync(lockfilePath, "utf-8");
	} catch (err) {
		findings.push({
			suiteId: "validate_package_hygiene",
			suiteName: "Package & Dependency Hygiene Auditor",
			ruleId: "package-lockfile-integrity",
			ruleDescription: "Dependencias: Lockfile corrupto o inseguro",
			severity: "error",
			file: "package-lock.json",
			line: 1,
			context: "package-lock.json",
			message: `Error al leer package-lock.json: ${err instanceof Error ? err.message : String(err)}`
		});
		return findings;
	}
	if (/^(?:<<<<<<<|=======|>>>>>>>)/m.exec(rawContent)) {
		findings.push({
			suiteId: "validate_package_hygiene",
			suiteName: "Package & Dependency Hygiene Auditor",
			ruleId: "package-lockfile-integrity",
			ruleDescription: "Dependencias: Lockfile corrupto o inseguro",
			severity: "error",
			file: "package-lock.json",
			line: 1,
			context: "merge-conflict",
			message: "package-lock.json contiene marcadores de conflicto de merge sin resolver."
		});
		return findings;
	}
	let lockfileJson;
	try {
		lockfileJson = JSON.parse(rawContent);
	} catch (err) {
		findings.push({
			suiteId: "validate_package_hygiene",
			suiteName: "Package & Dependency Hygiene Auditor",
			ruleId: "package-lockfile-integrity",
			ruleDescription: "Dependencias: Lockfile corrupto o inseguro",
			severity: "error",
			file: "package-lock.json",
			line: 1,
			context: "json-syntax",
			message: `package-lock.json contiene JSON inválido: ${err instanceof Error ? err.message : String(err)}`
		});
		return findings;
	}
	const lockfileVersion = lockfileJson.lockfileVersion;
	if (typeof lockfileVersion === "number" && lockfileVersion < 3) findings.push({
		suiteId: "validate_package_hygiene",
		suiteName: "Package & Dependency Hygiene Auditor",
		ruleId: "package-lockfile-integrity",
		ruleDescription: "Dependencias: Lockfile corrupto o inseguro",
		severity: "error",
		file: "package-lock.json",
		line: 1,
		context: `lockfileVersion: ${lockfileVersion}`,
		message: `lockfileVersion obsoleto (${lockfileVersion}). Se requiere lockfileVersion 3 (Node.js 18+ / npm v9+).`
	});
	if (/"resolved"\s*:\s*"http:\/\//.test(rawContent)) findings.push({
		suiteId: "validate_package_hygiene",
		suiteName: "Package & Dependency Hygiene Auditor",
		ruleId: "package-lockfile-integrity",
		ruleDescription: "Dependencias: Lockfile corrupto o inseguro",
		severity: "error",
		file: "package-lock.json",
		line: 1,
		context: "insecure-http-resolved",
		message: "package-lock.json contiene resoluciones de paquetes insecure vía http:// no cifrado."
	});
	let pkgJson = {};
	try {
		pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
	} catch {}
	const rootPackage = (lockfileJson.packages || {})[""] || {};
	auditFloatingGitDependencies(pkgJson, rootPackage, lockfileJson, pkgJsonPath, lockfilePath, isFixMode, findings);
	verifyLockfileRootDepsSync(rootPackage, {
		...pkgJson.dependencies,
		...pkgJson.devDependencies
	}, findings);
	return findings;
}
function resolveAuditorSemverTag() {
	try {
		const selfPkgPath = path.resolve(import.meta.dirname, "../../../package.json");
		if (fs.existsSync(selfPkgPath)) {
			const selfPkg = JSON.parse(fs.readFileSync(selfPkgPath, "utf-8"));
			if (selfPkg.version) return selfPkg.version.split("-")[0];
		}
	} catch {}
	return "0.0.0";
}
function auditFloatingGitDependencies(pkgJson, rootPackage, lockfileJson, pkgJsonPath, lockfilePath, isFixMode, findings) {
	let pkgModified = false;
	let lockModified = false;
	const semverTag = isFixMode ? resolveAuditorSemverTag() : "";
	for (const section of ["dependencies", "devDependencies"]) {
		const deps = pkgJson[section];
		if (!deps) continue;
		for (const [depName, spec] of Object.entries(deps)) {
			if (typeof spec !== "string" || !spec.includes("#semver:") && !/#(?:main|master|dev|develop)$/.test(spec)) continue;
			if (isFixMode && depName === "@francogp/auditor") {
				const pinnedSpec = spec.replace(/#.*$/, `#v${semverTag}`);
				deps[depName] = pinnedSpec;
				pkgModified = true;
				const rootSection = rootPackage[section];
				if (rootSection && rootSection[depName]) {
					rootSection[depName] = pinnedSpec;
					lockModified = true;
				}
				continue;
			}
			findings.push({
				suiteId: "validate_package_hygiene",
				suiteName: "Package & Dependency Hygiene Auditor",
				ruleId: "package-lockfile-integrity",
				ruleDescription: "Dependencias: Lockfile corrupto o inseguro",
				severity: "error",
				file: "package.json",
				line: 1,
				context: `${depName}: ${spec}`,
				message: `La dependencia "${depName}" utiliza un rango git flotante ("${spec}"). Para garantizar despliegues deterministas con 'npm ci', debes fijar un tag exacto (ej. "github:org/repo#vX.Y.Z") o un commit SHA.`
			});
		}
	}
	if (pkgModified) fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n", "utf-8");
	if (lockModified) fs.writeFileSync(lockfilePath, JSON.stringify(lockfileJson, null, 2) + "\n", "utf-8");
}
function verifyLockfileRootDepsSync(rootPackage, allDeclaredDeps, findings) {
	if (!rootPackage || typeof rootPackage !== "object") return;
	const rootDeps = {
		...rootPackage.dependencies,
		...rootPackage.devDependencies
	};
	for (const [depName, expectedSpec] of Object.entries(allDeclaredDeps)) {
		const lockedSpec = rootDeps[depName];
		if (!lockedSpec) findings.push({
			suiteId: "validate_package_hygiene",
			suiteName: "Package & Dependency Hygiene Auditor",
			ruleId: "package-lockfile-integrity",
			ruleDescription: "Dependencias: Lockfile corrupto o inseguro",
			severity: "error",
			file: "package-lock.json",
			line: 1,
			context: `${depName}: missing`,
			message: `La dependencia "${depName}" declarada en package.json no está registrada en package-lock.json. Ejecuta "npm install" para sincronizar el lockfile.`
		});
		else if (lockedSpec !== expectedSpec) findings.push({
			suiteId: "validate_package_hygiene",
			suiteName: "Package & Dependency Hygiene Auditor",
			ruleId: "package-lockfile-integrity",
			ruleDescription: "Dependencias: Lockfile corrupto o inseguro",
			severity: "error",
			file: "package-lock.json",
			line: 1,
			context: `${depName}: ${expectedSpec} vs ${lockedSpec}`,
			message: `La dependencia "${depName}" en package.json ("${expectedSpec}") difiere de package-lock.json ("${lockedSpec}"). Ejecuta "npm install" para sincronizar el lockfile.`
		});
	}
}
var ValidatePackageHygieneAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const effectiveRoot = options.projectRoot ?? process.cwd();
		super({
			usesThirdPartyTool: true,
			thirdPartyToolPolicy: {
				toolName: "knip",
				fallbackBehavior: "violation",
				fallbackRuleId: "package-unlisted-dependency"
			},
			ruleCapabilities: createRuleCapabilities(PACKAGE_HYGIENE_RULES, {
				speed: ["heavy", "full"],
				phase: "setup",
				fix: "normal",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}, ["package-unused-dependency"]),
			fixableRuleIds: ["package-unused-dependency"],
			fix: options.fix,
			id: "validate_package_hygiene",
			name: "Package & Dependency Hygiene Auditor",
			description: "Higiene de dependencias huérfanas y fantasmas",
			family: "architecture",
			packageName: "Dependencias",
			configKey: "packageHygiene.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "📦",
			ruleIds: PACKAGE_HYGIENE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(PACKAGE_HYGIENE_RULES, "hygiene"),
			ruleDescriptions: {
				"package-unused-dependency": "Dependencia no utilizada en package",
				"package-unlisted-dependency": "Dependencia fantasma no declarada",
				"package-unused-binary": "Binario o script no referenciado",
				"package-lockfile-integrity": "Lockfile corrupto o inseguro"
			},
			ruleRemediations: {
				"package-unused-dependency": "Guía de diagnóstico y remediación para package-unused-dependency. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"package-unlisted-dependency": "Guía de diagnóstico y remediación para package-unlisted-dependency. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"package-unused-binary": "Guía de diagnóstico y remediación para package-unused-binary. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"package-lockfile-integrity": "Guía de diagnóstico y remediación para package-lockfile-integrity. Revisa la incidencia detectada y ajusta el código correspondiente."
			},
			coverage: { include: ["package.json", "package-lock.json"] },
			projectRoot: effectiveRoot
		});
	}
	async runAudit() {
		if (this.isSuiteGatingDisabled("Package hygiene desactivado en config")) return;
		this.recordScanned("package.json");
		if (fs.existsSync(path.resolve(this.projectRoot, "package-lock.json"))) this.recordScanned("package-lock.json");
		this.runSubAuditorSync("package-lockfile-integrity", () => {
			const lockFindings = verifyLockfileIntegrity(this.projectRoot, this.isFixActive());
			for (const lf of lockFindings) this.addViolation({
				ruleId: lf.ruleId,
				severity: lf.severity,
				file: lf.file,
				line: lf.line,
				col: lf.col,
				context: lf.context,
				message: lf.message
			});
		});
		const config = getAuditConfig(this.projectRoot);
		const scratchDir = path.resolve(this.projectRoot, "scratch/audits/architecture");
		const cacheDir = path.resolve(this.projectRoot, "scratch/cache");
		fs.mkdirSync(scratchDir, { recursive: true });
		fs.mkdirSync(cacheDir, { recursive: true });
		const rawOutPath = path.resolve(scratchDir, "knip-raw.json");
		const cachePath = path.resolve(cacheDir, "knip");
		if (fs.existsSync(rawOutPath)) try {
			fs.unlinkSync(rawOutPath);
		} catch {}
		const ephemeralConfigPath = this.buildEphemeralKnipConfig(config, scratchDir);
		const report = this.executeKnip(ephemeralConfigPath, cachePath, rawOutPath);
		if (!report) {
			this.markRuleEvaluated("package-unlisted-dependency");
			this.markRuleEvaluated("package-unused-dependency");
			this.markRuleEvaluated("package-unused-binary");
			return;
		}
		const findings = parseKnipIssues(report, this.projectRoot, (p) => this.isPathIgnored(p));
		for (const ruleId of [
			"package-unused-dependency",
			"package-unlisted-dependency",
			"package-unused-binary"
		]) this.runSubAuditorSync(ruleId, () => {
			for (const finding of findings) {
				if ((finding.ruleId ?? "package-unused-dependency") !== ruleId) continue;
				if (finding.file && finding.file !== "package.json" && this.isPathIgnored(finding.file)) continue;
				this.addViolation({
					ruleId,
					severity: finding.severity,
					file: finding.file ?? "package.json",
					line: finding.line ?? 1,
					context: finding.context ?? finding.message,
					message: finding.message
				});
			}
		});
	}
	readFallowConfigData() {
		const fallowConfigPath = path.resolve(this.projectRoot, ".fallowrc.json");
		let fallowIgnoredDeps = [];
		let fallowEntries = [];
		if (fs.existsSync(fallowConfigPath)) try {
			const fallowJson = JSON.parse(fs.readFileSync(fallowConfigPath, "utf-8"));
			if (Array.isArray(fallowJson.ignoreDependencies)) fallowIgnoredDeps = fallowJson.ignoreDependencies;
			if (Array.isArray(fallowJson.entry)) fallowEntries = fallowJson.entry;
		} catch {}
		return {
			fallowEntries,
			fallowIgnoredDeps
		};
	}
	buildEphemeralKnipConfig(config, scratchDir) {
		const { fallowEntries, fallowIgnoredDeps } = this.readFallowConfigData();
		const customIgnoredDeps = config.packageHygiene?.ignoreDependencies ?? [];
		const scriptReferencedDeps = Array.from(extractReferencedScriptDependencies(this.projectRoot));
		const implicitTestDeps = [];
		const viteConfigPath = path.resolve(this.projectRoot, "vite.config.ts");
		if (fs.existsSync(viteConfigPath)) try {
			const viteContent = fs.readFileSync(viteConfigPath, "utf-8");
			if (viteContent.includes("'v8'") || viteContent.includes("\"v8\"")) implicitTestDeps.push("@vitest/coverage-v8");
			if (viteContent.includes("'istanbul'") || viteContent.includes("\"istanbul\"")) implicitTestDeps.push("@vitest/coverage-istanbul");
		} catch {}
		const allIgnoredDeps = Array.from(/* @__PURE__ */ new Set([
			...fallowIgnoredDeps,
			...customIgnoredDeps,
			...scriptReferencedDeps,
			...implicitTestDeps
		]));
		const customIgnoredBinaries = config.packageHygiene?.ignoreBinaries ?? [];
		const ownBinaries = Array.from(extractOwnPackageBinaries(this.projectRoot));
		const vitePlusConfigExists = fs.existsSync(path.resolve(this.projectRoot, "vite.config.ts"));
		let hasVitePlusDependency = false;
		const pkgJsonPath = path.resolve(this.projectRoot, "package.json");
		if (fs.existsSync(pkgJsonPath)) try {
			const pkgRaw = fs.readFileSync(pkgJsonPath, "utf-8");
			const parsed = JSON.parse(pkgRaw);
			hasVitePlusDependency = Boolean(parsed.dependencies?.["vite-plus"] || parsed.devDependencies?.["vite-plus"]);
		} catch {}
		const vitePlusBinaries = vitePlusConfigExists || hasVitePlusDependency ? [
			"vite",
			"vitest",
			"tsdown",
			"oxlint",
			"oxfmt",
			"vp"
		] : [];
		const allIgnoredBinaries = Array.from(/* @__PURE__ */ new Set([
			...customIgnoredBinaries,
			...ownBinaries,
			...vitePlusBinaries
		]));
		const customEntry = config.packageHygiene?.entry;
		const effectiveEntry = customEntry && customEntry.length > 0 ? [...customEntry] : fallowEntries.length > 0 ? fallowEntries : [
			"src/index.{ts,js}",
			"src/main.{ts,js}",
			"index.html",
			AUDIT_CONFIG_FILE
		];
		const scannableRoots = getEffectiveScannableRoots(config);
		const customProject = config.packageHygiene?.project;
		const ephemeralConfig = {
			$schema: "https://unpkg.com/knip@6/overview/configuration-schema.json",
			entry: effectiveEntry,
			project: customProject && customProject.length > 0 ? [...customProject] : [...scannableRoots.map((r) => `${r}/**/*.{ts,vue,js,mjs,cjs,json}`), "*.{ts,js,mjs,cjs,json}"],
			ignore: [
				"dist/**",
				"scratch/**",
				"coverage/**",
				"skills/**",
				".agents/**",
				"**/*.d.ts",
				...config.paths.ignoredDirs?.flatMap((d) => [`${d}/**`, d]) ?? [],
				...config.paths.ignoredPatterns ?? [],
				...config.paths.ignoreGlobs ?? []
			],
			ignoreDependencies: allIgnoredDeps,
			ignoreBinaries: allIgnoredBinaries
		};
		const ephemeralConfigPath = path.resolve(scratchDir, "knip-ephemeral.json");
		fs.writeFileSync(ephemeralConfigPath, JSON.stringify(ephemeralConfig, null, 2), "utf-8");
		return ephemeralConfigPath;
	}
	executeKnip(ephemeralConfigPath, cachePath, rawOutPath) {
		const tier = this.getExecutionTier();
		const cliFlags = [
			"--config",
			ephemeralConfigPath,
			"--dependencies",
			"--reporter",
			"json",
			"--cache",
			"--cache-location",
			cachePath
		];
		if (tier === "full") cliFlags.push("--include-libs");
		if (this.fixMode) cliFlags.push("--fix", "--fix-type", "dependencies");
		const resolvedBin = resolvePackageBin("knip", {
			projectRoot: this.projectRoot,
			fallbackRelativeBin: "bin/knip.js"
		});
		const command = resolvedBin ? process.execPath : "knip";
		const finalArgs = resolvedBin ? [resolvedBin, ...cliFlags] : [...cliFlags];
		return executeCliAndReadJson(command, finalArgs, rawOutPath, {
			cwd: this.projectRoot,
			shell: !resolvedBin
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidatePackageHygieneAuditor());
//#endregion
export { PACKAGE_HYGIENE_RULES, ValidatePackageHygieneAuditor, extractOwnPackageBinaries, extractReferencedScriptDependencies, parseKnipIssues, verifyLockfileIntegrity };
