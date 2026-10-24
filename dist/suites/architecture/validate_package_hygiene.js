import { AUDIT_CONFIG_FILE } from "../../core/auditConfigTypes.js";
import { safeJsonParse, safeReadFileSync, safeRmSync, tryOrNull } from "../../core/safeUtils.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { toPosixRelative } from "../../core/safePath.js";
import "../../core/auditConfig.js";
import { executeCliAndReadJson, resolvePackageBin } from "../../cli/cliUtils.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases, getEffectiveScannableRoots } from "../../core/auditorBase.js";
import { getPackageJson } from "../../core/packageJson.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
// src/suites/architecture/validate_package_hygiene.ts
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
	tryOrNull(() => {
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
	});
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
			ruleDescription: "Dependencies: Unused dependencies in package.json",
			severity: "error",
			file: relFile,
			line: dep.line ?? 1,
			col: dep.col ?? 1,
			context: dep.name,
			message: `Unused dependency declared in package.json: "${dep.name}"`
		});
	}
	return findings;
}
function parseUnlistedDeps(fileIssue, relFile) {
	return (fileIssue.unlisted ?? []).map((unlisted) => ({
		suiteId: "validate_package_hygiene",
		suiteName: "Package & Dependency Hygiene Auditor",
		ruleId: "package-unlisted-dependency",
		ruleDescription: "Dependencies: Undeclared phantom dependency",
		severity: "error",
		file: relFile,
		line: unlisted.line ?? 1,
		col: unlisted.col ?? 1,
		context: unlisted.name,
		message: `Phantom dependency not declared in package.json imported in code: "${unlisted.name}"`
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
		ruleDescription: "Dependencies: Unreferenced binary or script",
		severity: "error",
		file: relFile,
		line: bin.line ?? 1,
		col: bin.col ?? 1,
		context: bin.name,
		message: `Unreferenced executable script or binary in project: "${bin.name}"`
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
			ruleDescription: "Dependencies: Corrupted or insecure lockfile",
			severity: "error",
			file: "package-lock.json",
			line: 1,
			context: "package-lock.json",
			message: "package-lock.json not found. The project must commit its lockfile."
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
			ruleDescription: "Dependencies: Corrupted or insecure lockfile",
			severity: "error",
			file: "package-lock.json",
			line: 1,
			context: "package-lock.json",
			message: `Error reading package-lock.json: ${err instanceof Error ? err.message : String(err)}`
		});
		return findings;
	}
	if (/^(?:<<<<<<<|=======|>>>>>>>)/m.exec(rawContent)) {
		findings.push({
			suiteId: "validate_package_hygiene",
			suiteName: "Package & Dependency Hygiene Auditor",
			ruleId: "package-lockfile-integrity",
			ruleDescription: "Dependencies: Corrupted or insecure lockfile",
			severity: "error",
			file: "package-lock.json",
			line: 1,
			context: "merge-conflict",
			message: "package-lock.json contains unresolved merge conflict markers."
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
			ruleDescription: "Dependencies: Corrupted or insecure lockfile",
			severity: "error",
			file: "package-lock.json",
			line: 1,
			context: "json-syntax",
			message: `package-lock.json contains invalid JSON: ${err instanceof Error ? err.message : String(err)}`
		});
		return findings;
	}
	const lockfileVersion = lockfileJson.lockfileVersion;
	if (typeof lockfileVersion === "number" && lockfileVersion < 3) findings.push({
		suiteId: "validate_package_hygiene",
		suiteName: "Package & Dependency Hygiene Auditor",
		ruleId: "package-lockfile-integrity",
		ruleDescription: "Dependencies: Corrupted or insecure lockfile",
		severity: "error",
		file: "package-lock.json",
		line: 1,
		context: `lockfileVersion: ${lockfileVersion}`,
		message: `Outdated lockfileVersion (${lockfileVersion}). Requires lockfileVersion 3 (Node.js 18+ / npm v9+).`
	});
	if (/"resolved"\s*:\s*"http:\/\//.test(rawContent)) findings.push({
		suiteId: "validate_package_hygiene",
		suiteName: "Package & Dependency Hygiene Auditor",
		ruleId: "package-lockfile-integrity",
		ruleDescription: "Dependencies: Corrupted or insecure lockfile",
		severity: "error",
		file: "package-lock.json",
		line: 1,
		context: "insecure-http-resolved",
		message: "package-lock.json contains insecure package resolutions via unencrypted http://."
	});
	const pkgRaw = safeReadFileSync(pkgJsonPath);
	const pkgJson = (pkgRaw ? safeJsonParse(pkgRaw) : null) ?? {};
	const rootPackage = (lockfileJson.packages || {})[""] || {};
	auditFloatingGitDependencies(pkgJson, rootPackage, lockfileJson, pkgJsonPath, lockfilePath, isFixMode, findings);
	verifyLockfileRootDepsSync(rootPackage, {
		...pkgJson.dependencies,
		...pkgJson.devDependencies
	}, findings);
	return findings;
}
function resolveAuditorSemverTag() {
	const selfPkgPath = path.resolve(import.meta.dirname, "../../../package.json");
	const selfPkgRaw = safeReadFileSync(selfPkgPath);
	if (selfPkgRaw) {
		const selfPkg = safeJsonParse(selfPkgRaw);
		if (selfPkg?.version) return selfPkg.version.split("-")[0];
	}
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
				ruleDescription: "Dependencies: Corrupted or insecure lockfile",
				severity: "error",
				file: "package.json",
				line: 1,
				context: `${depName}: ${spec}`,
				message: `Dependency "${depName}" uses a floating git range ("${spec}"). To guarantee deterministic deployments with 'npm ci', you must pin an exact tag (e.g. "github:org/repo#vX.Y.Z") or a commit SHA.`
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
			ruleDescription: "Dependencies: Corrupted or insecure lockfile",
			severity: "error",
			file: "package-lock.json",
			line: 1,
			context: `${depName}: missing`,
			message: `Dependency "${depName}" declared in package.json is not registered in package-lock.json. Run "npm install" to synchronize the lockfile.`
		});
		else if (lockedSpec !== expectedSpec) findings.push({
			suiteId: "validate_package_hygiene",
			suiteName: "Package & Dependency Hygiene Auditor",
			ruleId: "package-lockfile-integrity",
			ruleDescription: "Dependencies: Corrupted or insecure lockfile",
			severity: "error",
			file: "package-lock.json",
			line: 1,
			context: `${depName}: ${expectedSpec} vs ${lockedSpec}`,
			message: `Dependency "${depName}" in package.json ("${expectedSpec}") differs from package-lock.json ("${lockedSpec}"). Run "npm install" to synchronize the lockfile.`
		});
	}
}
function toPosixGlobPattern(targetPath) {
	const norm = normalizePosixPath(targetPath);
	return norm.endsWith(path.posix.sep) ? `${norm}**` : path.posix.join(norm, "**");
}
var ValidatePackageHygieneAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const effectiveRoot = options.projectRoot ?? process.cwd();
		super({
			usesThirdPartyTool: true,
			requiredPermissions: ["--allow-child-process"],
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
			description: "Hygiene of orphaned and phantom dependencies",
			family: "architecture",
			packageName: "Dependencies",
			configKey: "packageHygiene.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "📦",
			ruleIds: PACKAGE_HYGIENE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(PACKAGE_HYGIENE_RULES, "hygiene"),
			ruleDescriptions: {
				"package-unused-dependency": "Unused dependency in package",
				"package-unlisted-dependency": "Undeclared phantom dependency",
				"package-unused-binary": "Unreferenced binary or script",
				"package-lockfile-integrity": "Corrupted or insecure lockfile"
			},
			ruleRemediations: {
				"package-unused-dependency": "📖 REMEDIATION GUIDE: package-unused-dependency\n1. Root Cause: A package was declared in `dependencies` or `devDependencies` of `package.json` that is never imported in source code nor invoked in scripts or build tooling.\n2. Diagnosis: Review the report to identify the orphaned package. Verify with Fallow or global search if any references exist.\n3. Canonical Solution: Remove the unused dependency by running `npm uninstall <package>` to minimize dependency bloat and attack surface.\n4. Example / Auto-fix command:\n   `npm uninstall <orphaned-package>`",
				"package-unlisted-dependency": "📖 REMEDIATION GUIDE: package-unlisted-dependency\n1. Root Cause: Source code imports a third-party package (phantom dependency) that is not formally declared in `dependencies` or `devDependencies` of `package.json`, functioning only coincidentally due to `node_modules` hoisting.\n2. Diagnosis: Inspect the reported path and package name in the violation.\n3. Canonical Solution: Explicitly declare the package in `package.json` via `npm install <package>` or `npm install -D <package>`.\n4. Example / Auto-fix command:\n   `npm install <package>` or `npm install -D <package>`",
				"package-unused-binary": "📖 REMEDIATION GUIDE: package-unused-binary\n1. Root Cause: A script or executable declared in `bin` of `package.json` points to a non-existent, non-executable, or unreferenced file.\n2. Diagnosis: Inspect the `bin` field of `package.json` and ensure the target file exists and includes a valid shebang (`#!/usr/bin/env node`).\n3. Canonical Solution: Correct the executable path in `dist/` or remove the `bin` entry if no longer exposing a CLI binary.\n4. Example / Auto-fix command:\n   `\"bin\": { \"auditor\": \"dist/cli/index.js\" }`",
				"package-lockfile-integrity": "📖 REMEDIATION GUIDE: package-lockfile-integrity\n1. Root Cause: `package-lock.json` is out of sync with declared versions and ranges in `package.json`, or contains invalid/insecure resolutions.\n2. Diagnosis: Check discrepancies between installed packages and declarations in `package.json`.\n3. Canonical Solution: Run `npm install` to regenerate and cleanly synchronize the lockfile without breaking dependency contracts.\n4. Example / Auto-fix command:\n   `npm install`"
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
		safeRmSync(rawOutPath, { force: true });
		const ephemeralConfigPath = this.buildEphemeralKnipConfig(config, scratchDir);
		const report = this.executeKnip(ephemeralConfigPath, cachePath, rawOutPath);
		if (!report) {
			this.markRuleEvaluated("package-unlisted-dependency");
			this.markRuleEvaluated("package-unused-dependency");
			this.markRuleEvaluated("package-unused-binary");
			return;
		}
		const findings = parseKnipIssues(report, this.projectRoot, (p) => this.isPathIgnored(p) || this.isPathExempt(p));
		for (const ruleId of [
			"package-unused-dependency",
			"package-unlisted-dependency",
			"package-unused-binary"
		]) this.runSubAuditorSync(ruleId, () => {
			for (const finding of findings) {
				if ((finding.ruleId ?? "package-unused-dependency") !== ruleId) continue;
				if (finding.file && finding.file !== "package.json" && (this.isPathIgnored(finding.file) || this.isPathExempt(finding.file))) continue;
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
	resolveFallowIgnoredDependencies() {
		const fallowConfigPath = path.resolve(this.projectRoot, ".fallowrc.json");
		if (!fs.existsSync(fallowConfigPath)) return [];
		try {
			const rawFallow = fs.readFileSync(fallowConfigPath, "utf-8");
			const parsedFallow = JSON.parse(rawFallow);
			return Array.isArray(parsedFallow.ignoreDependencies) ? parsedFallow.ignoreDependencies : [];
		} catch {
			return [];
		}
	}
	resolveImplicitCoverageDependencies() {
		const deps = [];
		const viteConfigPath = path.resolve(this.projectRoot, "vite.config.ts");
		if (!fs.existsSync(viteConfigPath)) return deps;
		const viteContent = safeReadFileSync(viteConfigPath);
		if (viteContent) {
			if (viteContent.includes("'v8'") || viteContent.includes("\"v8\"")) deps.push("@vitest/coverage-v8");
			if (viteContent.includes("'istanbul'") || viteContent.includes("\"istanbul\"")) deps.push("@vitest/coverage-istanbul");
		}
		return deps;
	}
	hasVitePlusDependencyOrConfig() {
		if (fs.existsSync(path.resolve(this.projectRoot, "vite.config.ts"))) return true;
		const pkgJsonPath = path.resolve(this.projectRoot, "package.json");
		const pkgRaw = safeReadFileSync(pkgJsonPath);
		if (!pkgRaw) return false;
		const parsed = safeJsonParse(pkgRaw);
		return Boolean(parsed?.dependencies?.["vite-plus"] || parsed?.devDependencies?.["vite-plus"]);
	}
	buildEphemeralKnipConfig(config, scratchDir) {
		const customIgnoredDeps = config.packageHygiene?.ignoreDependencies ?? [];
		const fallowIgnoredDeps = this.resolveFallowIgnoredDependencies();
		const scriptReferencedDeps = Array.from(extractReferencedScriptDependencies(this.projectRoot));
		const implicitTestDeps = this.resolveImplicitCoverageDependencies();
		const allIgnoredDeps = Array.from(/* @__PURE__ */ new Set([
			...customIgnoredDeps,
			...fallowIgnoredDeps,
			...scriptReferencedDeps,
			...implicitTestDeps
		]));
		const customIgnoredBinaries = config.packageHygiene?.ignoreBinaries ?? [];
		const ownBinaries = Array.from(extractOwnPackageBinaries(this.projectRoot));
		const vitePlusBinaries = this.hasVitePlusDependencyOrConfig() ? [
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
		const effectiveEntry = customEntry && customEntry.length > 0 ? [...customEntry] : [
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
				...config.paths.ignoredDirs?.flatMap((d) => [toPosixGlobPattern(d), normalizePosixPath(d)]) ?? [],
				...config.paths.ignoredPatterns?.map((p) => normalizePosixPath(p)) ?? [],
				...config.paths.ignoreGlobs?.map((g) => normalizePosixPath(g)) ?? [],
				...this.extraIgnorePatterns?.map((g) => normalizePosixPath(g)) ?? [],
				...this.exemptPaths?.map(toPosixGlobPattern) ?? []
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
		if (tsconfigHasReferences(this.projectRoot)) cliFlags.push("--use-tsconfig-files");
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
/**
* Detects whether the host root `tsconfig.json` declares project `references`.
* Parsed with the TypeScript JSONC reader (no regex) so comments and trailing commas are tolerated.
*/
function tsconfigHasReferences(projectRoot) {
	const tsconfigPath = path.resolve(projectRoot, "tsconfig.json");
	if (!fs.existsSync(tsconfigPath)) return false;
	const references = ts.parseConfigFileTextToJson(tsconfigPath, fs.readFileSync(tsconfigPath, "utf-8")).config?.references;
	return Array.isArray(references) && references.length > 0;
}
await BaseAuditor.runCliIfMain(import.meta.url, new ValidatePackageHygieneAuditor());
export { PACKAGE_HYGIENE_RULES, ValidatePackageHygieneAuditor, extractOwnPackageBinaries, extractReferencedScriptDependencies, parseKnipIssues, tsconfigHasReferences, verifyLockfileIntegrity };
