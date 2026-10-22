import { safeReadFileSync, safeRmSync, tryOrNull } from "./safeUtils.js";
import { getAuditConfig } from "./auditConfigLoader.js";
import "./auditConfig.js";
import { toPosixRelative } from "./auditCoverage.js";
import "./safePath.js";
import { getPackageJson, writePackageJson } from "./packageJson.js";
import { getAuditorCanonicalOverrides, getAuditorMinimumVersions, normalizeToCaretRange } from "./auditorMinimums.js";
import { CANONICAL_LINT_RULES_MAP, buildCanonicalVitePlusAstSource, extractAstPropertyBlock, extractEslintIgnoresFromAst, extractParsedConfigSummary, parseLegacyTestPropertyNode, rewriteModuleSpecifiersToVitePlusAst, synchronizeViteConfigAst } from "./viteConfigAst.js";
import path from "node:path";
import fs from "node:fs";
import childProcess from "node:child_process";
import { Project, QuoteKind, SyntaxKind } from "ts-morph";
//#region src/core/vitePlusConfigSync.ts
/**
* packages/auditor/src/core/vitePlusConfigSync.ts
*
* CANONICAL VITE+ (vp) CONFIGURATION BUILDER & SYNCHRONIZER (Node.js 26+ Native)
* Generates and synchronizes vite.config.ts from .auditor/audit.config.ts (SSoT)
* using TypeScript Compiler AST (viteConfigAst.ts) and native JSON DTOs.
*/
const LEGACY_CONFIG_FILES = [
	"eslint.config.js",
	"eslint.config.mjs",
	"eslint.config.ts",
	".eslintrc.js",
	".eslintrc.cjs",
	".eslintrc.json",
	".eslintrc.yaml",
	".eslintrc.yml",
	"vitest.config.ts",
	"vitest.config.js",
	"vitest.config.mjs",
	"tsdown.config.ts",
	"tsdown.config.js",
	"tsconfig.build.json",
	".oxlintrc.json",
	".oxfmtrc.json"
];
const STRICT_RULE_CHECKS = Object.keys(CANONICAL_LINT_RULES_MAP);
/**
* Scans for legacy ESLint configuration files and extracts globalIgnores entries
* using native JSON parsing (.eslintrc.json) and TypeScript Compiler AST (.js/.mjs/.ts).
*/
function findLegacyEslintIgnores(projectRoot) {
	for (const candidate of [
		"eslint.config.js",
		"eslint.config.mjs",
		"eslint.config.ts",
		".eslintrc.json"
	]) {
		const candidatePath = path.resolve(projectRoot, candidate);
		if (!fs.existsSync(candidatePath)) continue;
		const raw = safeReadFileSync(candidatePath);
		if (raw) {
			let extracted = [];
			if (candidate.endsWith(".json")) {
				const parsed = JSON.parse(raw);
				extracted = (Array.isArray(parsed.ignorePatterns) ? parsed.ignorePatterns : Array.isArray(parsed.ignores) ? parsed.ignores : []).filter((item) => typeof item === "string");
			} else extracted = extractEslintIgnoresFromAst(raw);
			const globs = extracted.filter((candidateGlob) => !LEGACY_CONFIG_FILES.some((f) => f === candidateGlob));
			if (globs.length > 0) return globs;
		}
	}
	return [];
}
/**
* Resolves all canonical ignore globs derived from audit.config.ts (SSoT).
*/
function resolveAuditConfigIgnoreGlobs(config, target = "lint", projectRoot) {
	const baseIgnores = [
		"dist/**",
		"dev-dist/**",
		"node_modules/**",
		"scratch/**",
		"tmp/**",
		".agents/**",
		"coverage/**",
		"**/*.d.ts"
	];
	if (target === "fmt") baseIgnores.push("package-lock.json");
	const projectIgnores = config.paths?.ignoreGlobs ?? [];
	const dirIgnores = (config.paths?.ignoredDirs ?? []).map((d) => d.endsWith("/**") ? d : `${d}/**`);
	const patternIgnores = config.paths?.ignoredPatterns ?? [];
	const exemptFiles = config.paths?.exemptFiles ?? [];
	const testIgnores = [];
	if (target === "lint" && config.paths?.includeTestsInCodeAudit === false) {
		const testRoots = config.paths.testRoots ?? ["tests"];
		const e2eRoots = config.paths.e2eRoots ?? [];
		const integrationRoots = config.paths.integrationRoots ?? [];
		for (const r of [
			...testRoots,
			...e2eRoots,
			...integrationRoots
		]) {
			const glob = r.endsWith("/**") ? r : `${r}/**`;
			testIgnores.push(glob);
		}
		testIgnores.push("**/*.spec.ts", "**/*.test.ts", "**/*.simulation.ts");
	}
	const degradationIgnores = (config.coverage?.acknowledgedDegradations ?? []).map((d) => d.glob);
	const coverageExemptIgnores = (config.coverage?.exemptGlobs ?? []).map((e) => e.glob);
	const testCoverageExemptIgnores = config.testCoverage?.exemptGlobs ?? [];
	const dataDemoIgnores = [];
	if (target === "lint") {
		const dataRoots = (config.paths?.dataRoots ?? []).map((d) => d.endsWith("/**") ? d : `${d}/**`);
		const demoRoots = (config.paths?.demoRoots ?? []).map((d) => d.endsWith("/**") ? d : `${d}/**`);
		dataDemoIgnores.push(...dataRoots, ...demoRoots);
	}
	const legacyIgnores = projectRoot ? findLegacyEslintIgnores(projectRoot) : [];
	const specificTargetIgnores = target === "lint" ? [...config.vitePlusConfig?.lint?.ignorePatterns ?? [], ...config.oxlint?.ignoreGlobs ?? []] : [...config.vitePlusConfig?.fmt?.ignorePatterns ?? [], ...config.oxfmt?.ignoreGlobs ?? []];
	return Array.from(/* @__PURE__ */ new Set([
		...baseIgnores,
		...projectIgnores,
		...dirIgnores,
		...patternIgnores,
		...exemptFiles,
		...degradationIgnores,
		...coverageExemptIgnores,
		...testCoverageExemptIgnores,
		...dataDemoIgnores,
		...testIgnores,
		...legacyIgnores,
		...specificTargetIgnores
	]));
}
/**
* Generates the canonical Vite+ unified configuration (vite.config.ts)
* using the TypeScript Compiler AST printer.
*/
function buildCanonicalVitePlusConfig(auditConfig, projectRoot) {
	const lintIgnores = resolveAuditConfigIgnoreGlobs(auditConfig, "lint", projectRoot);
	const fmtIgnores = resolveAuditConfigIgnoreGlobs(auditConfig, "fmt", projectRoot);
	return buildCanonicalVitePlusAstSource(auditConfig, lintIgnores, fmtIgnores);
}
function findLegacyTestBlock(projectRoot) {
	for (const vitestCandidate of [
		"vitest.config.ts",
		"vitest.config.js",
		"vitest.config.mjs"
	]) {
		const candidatePath = path.resolve(projectRoot, vitestCandidate);
		const vitestRaw = safeReadFileSync(candidatePath);
		if (vitestRaw) {
			const extracted = extractAstPropertyBlock(vitestRaw, "test");
			if (extracted) return extracted;
		}
	}
	const gitHeadRaw = tryOrNull(() => childProcess.execSync("git show HEAD:vitest.config.ts", {
		cwd: projectRoot,
		stdio: [
			"pipe",
			"pipe",
			"ignore"
		],
		encoding: "utf-8"
	}));
	if (gitHeadRaw) {
		const extracted = extractAstPropertyBlock(gitHeadRaw, "test");
		if (extracted) return extracted;
	}
	return null;
}
function syncViteConfigWithAuditConfig(projectRoot, auditConfig) {
	const config = auditConfig ?? getAuditConfig(projectRoot);
	const viteConfigPath = path.resolve(projectRoot, "vite.config.ts");
	const legacyTestBlock = findLegacyTestBlock(projectRoot);
	const legacyTestProp = legacyTestBlock ? parseLegacyTestPropertyNode(legacyTestBlock) : null;
	const lintIgnores = resolveAuditConfigIgnoreGlobs(config, "lint", projectRoot);
	const fmtIgnores = resolveAuditConfigIgnoreGlobs(config, "fmt", projectRoot);
	if (!fs.existsSync(viteConfigPath)) {
		const content = buildCanonicalVitePlusAstSource(config, lintIgnores, fmtIgnores, legacyTestProp);
		fs.writeFileSync(viteConfigPath, content, "utf-8");
		return {
			modified: true,
			content
		};
	}
	const rawContent = fs.readFileSync(viteConfigPath, "utf-8");
	const synced = synchronizeViteConfigAst(rawContent, config, lintIgnores, fmtIgnores, legacyTestProp);
	if (synced.modified) fs.writeFileSync(viteConfigPath, synced.content, "utf-8");
	return synced;
}
function cleanLegacyConfigFiles(projectRoot) {
	const viteConfigPath = path.resolve(projectRoot, "vite.config.ts");
	if (!fs.existsSync(viteConfigPath)) return [];
	let viteContent = "";
	try {
		viteContent = fs.readFileSync(viteConfigPath, "utf-8");
	} catch {
		return [];
	}
	const summary = extractParsedConfigSummary(viteContent);
	const hasTest = summary.hasSection("test");
	const hasLint = summary.hasSection("lint");
	const hasPack = summary.hasSection("pack");
	const removed = [];
	for (const legacy of LEGACY_CONFIG_FILES) {
		if (legacy.startsWith("vitest") && !hasTest) continue;
		if ((legacy.startsWith("eslint") || legacy.startsWith(".eslintrc")) && !hasLint) continue;
		if (legacy.startsWith("tsdown") && !hasPack) continue;
		const fullPath = path.resolve(projectRoot, legacy);
		if (fs.existsSync(fullPath)) {
			if (safeRmSync(fullPath, { force: true })) removed.push(legacy);
		}
	}
	return removed;
}
const BANNED_COMPRESSION_MODULES = ["vite-plugin-compression", "vite-plugin-compression2"];
/**
* Searches for homebrew compression scripts in scripts/ or other project directories.
*/
function findHomebrewCompressionFiles(projectRoot) {
	const detected = [];
	for (const d of ["scripts"]) {
		const fullDir = path.resolve(projectRoot, d);
		if (!fs.existsSync(fullDir)) continue;
		function walk(cur) {
			const entries = fs.readdirSync(cur, { withFileTypes: true });
			for (const entry of entries) {
				const entryPath = path.join(cur, entry.name);
				if (entry.isDirectory()) {
					if (entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== ".git") walk(entryPath);
				} else if (entry.isFile()) {
					const lower = entry.name.toLowerCase();
					if ((lower.includes("precompress") || lower.includes("vite-plugin-compress")) && (lower.endsWith(".ts") || lower.endsWith(".js") || lower.endsWith(".mjs"))) detected.push(toPosixRelative(projectRoot, entryPath));
				}
			}
		}
		walk(fullDir);
	}
	return detected;
}
/**
* Detects homebrew or third-party compression plugin imports in vite.config.ts.
*/
function detectHomebrewCompressionImports(viteConfigContent) {
	const detected = [];
	const lines = viteConfigContent.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("import ") && !trimmed.startsWith("import{")) continue;
		for (const banned of BANNED_COMPRESSION_MODULES) if (line.includes(`'${banned}'`) || line.includes(`"${banned}"`)) detected.push(banned);
		const localMatch = line.match(/from\s+['"](\.[^'"]*precompress[^'"]*)['"]/i) || line.match(/from\s+['"](\.[^'"]*vite-plugin-compress[^'"]*)['"]/i);
		if (localMatch && localMatch[1]) detected.push(localMatch[1]);
	}
	return Array.from(new Set(detected));
}
/**
* Automatically migrates homebrew compression imports and calls in vite.config.ts
* to canonical vitePrecompressPlugin from @francogp/auditor.
*/
function replacePluginIdentifierInCalls(sourceFile, oldName, newName) {
	if (oldName === newName) return;
	const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
	for (const call of calls) {
		const expr = call.getExpression();
		if (expr.getText() === oldName) expr.replaceWithText(newName);
	}
}
function migrateHomebrewCompressionInViteConfig(viteConfigContent) {
	try {
		const sourceFile = new Project({
			useInMemoryFileSystem: true,
			compilerOptions: { allowJs: true },
			manipulationSettings: { quoteKind: QuoteKind.Single }
		}).createSourceFile("vite.config.ts", viteConfigContent);
		let modified = false;
		const imports = sourceFile.getImportDeclarations();
		for (const imp of imports) {
			const moduleSpec = imp.getModuleSpecifierValue();
			if (!(moduleSpec.includes("precompress") || moduleSpec.startsWith("vite-plugin-compression"))) continue;
			for (const named of imp.getNamedImports()) replacePluginIdentifierInCalls(sourceFile, named.getName(), "vitePrecompressPlugin");
			const idx = imp.getChildIndex();
			imp.remove();
			sourceFile.insertImportDeclaration(idx, {
				moduleSpecifier: "@francogp/auditor",
				namedImports: ["vitePrecompressPlugin"]
			});
			modified = true;
		}
		if (modified) {
			sourceFile.formatText({ indentSize: 2 });
			return {
				content: sourceFile.getFullText(),
				modified: true
			};
		}
		return {
			content: viteConfigContent,
			modified: false
		};
	} catch {
		return {
			content: viteConfigContent,
			modified: false
		};
	}
}
function removeDeletedFileFromSiblingAgentsMd(deletedFilePath) {
	const siblingAgentsPath = path.join(path.dirname(deletedFilePath), "AGENTS.md");
	if (!fs.existsSync(siblingAgentsPath)) return;
	tryOrNull(() => {
		const baseName = path.basename(deletedFilePath);
		const lines = fs.readFileSync(siblingAgentsPath, "utf8").split(/\r?\n/);
		const filtered = lines.filter((line) => {
			const trimmed = line.trim();
			return !((trimmed.startsWith("- ") || trimmed.startsWith("* ")) && line.includes(baseName));
		});
		if (filtered.length !== lines.length) fs.writeFileSync(siblingAgentsPath, filtered.join("\n"), "utf8");
	});
}
/**
* Removes homebrew compression scripts found on disk and cleans their stale entries
* from the sibling AGENTS.md DOX index if present.
*/
function cleanHomebrewCompressionFiles(projectRoot) {
	const files = findHomebrewCompressionFiles(projectRoot);
	const removed = [];
	for (const rel of files) {
		const fullPath = path.resolve(projectRoot, rel);
		if (fs.existsSync(fullPath)) {
			if (safeRmSync(fullPath, { force: true })) {
				removeDeletedFileFromSiblingAgentsMd(fullPath);
				removed.push(rel);
			}
		}
	}
	return removed;
}
function rewriteImportsToVitePlus(projectRoot, dirs = [
	"src",
	"scripts",
	"tests"
]) {
	let rewrittenCount = 0;
	function walk(dir) {
		if (!fs.existsSync(dir)) return;
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== "dev-dist") walk(fullPath);
			} else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) tryOrNull(() => {
				const raw = fs.readFileSync(fullPath, "utf-8");
				const updated = rewriteModuleSpecifiersToVitePlusAst(raw, fullPath);
				if (updated !== raw) {
					fs.writeFileSync(fullPath, updated, "utf-8");
					rewrittenCount++;
				}
			});
		}
	}
	for (const dirName of dirs) walk(path.resolve(projectRoot, dirName));
	return rewrittenCount;
}
function migrateNodeVersion(projectRoot) {
	const legacyNvmrc = path.resolve(projectRoot, ".nvmrc");
	const nodeVersionPath = path.resolve(projectRoot, ".node-version");
	let migrated = false;
	if (fs.existsSync(legacyNvmrc)) {
		const nvmrcContent = fs.readFileSync(legacyNvmrc, "utf-8").trim();
		if (nvmrcContent) {
			fs.writeFileSync(nodeVersionPath, `${nvmrcContent}\n`, "utf-8");
			migrated = true;
		}
		safeRmSync(legacyNvmrc, { force: true });
	} else if (!fs.existsSync(nodeVersionPath)) {
		const nodeEngine = getPackageJson(projectRoot, true)?.engines?.node;
		if (typeof nodeEngine === "string") {
			const m = nodeEngine.match(/\d+\.\d+\.\d+/);
			if (m) {
				fs.writeFileSync(nodeVersionPath, `${m[0]}\n`, "utf-8");
				migrated = true;
			}
		}
	}
	return migrated;
}
function getVitePlusDefaultExcludeGlobs(projectRoot) {
	return resolveAuditConfigIgnoreGlobs(getAuditConfig(projectRoot), "lint", projectRoot);
}
const LEGACY_DEPS_TO_REMOVE = [
	"eslint",
	"@eslint/js",
	"typescript-eslint",
	"@typescript-eslint/eslint-plugin",
	"@typescript-eslint/parser",
	"eslint-formatter-codeframe",
	"eslint-plugin-unused-imports",
	"eslint-plugin-vue",
	"eslint-plugin-regexp",
	"globals",
	"vue-eslint-parser"
];
function removeLegacyDependencies(deps, devDeps) {
	let modified = false;
	for (const dep of LEGACY_DEPS_TO_REMOVE) {
		if (devDeps && dep in devDeps) {
			delete devDeps[dep];
			modified = true;
		}
		if (deps && dep in deps) {
			delete deps[dep];
			modified = true;
		}
	}
	return modified;
}
const REQUIRED_VITE_PLUS_SCRIPTS = {
	check: "vp check",
	"check:fix": "vp check --fix",
	fmt: "vp fmt",
	"fmt:check": "vp fmt --check",
	test: "vp test",
	"test:coverage": "vp test --coverage"
};
function migrateViteCommandsToVp(cmd) {
	let updated = cmd;
	updated = updated.replace(/(^|\s|&&|;|\|)vite\s+build\b/g, "$1vp build");
	updated = updated.replace(/(^|\s|&&|;|\|)vite\s+preview\b/g, "$1vp preview");
	updated = updated.replace(/(^|\s|&&|;|\|)vite\s+--/g, "$1vp dev --");
	updated = updated.replace(/(^|\s|&&|;|\|)vite\s+dev\b/g, "$1vp dev");
	updated = updated.replace(/(^|\s|&&|;|\|)vite(?=$|\s*(&&|;|\|))/g, "$1vp dev");
	return updated;
}
function updateVitePlusScripts(scripts) {
	let modified = false;
	for (const [sName, sCmd] of Object.entries(scripts)) if (typeof sCmd === "string") {
		if (/\beslint\b/.test(sCmd)) {
			if (sName === "lint") {
				scripts[sName] = "vp check";
				modified = true;
				continue;
			} else if (sName === "lint:fix") {
				scripts[sName] = "vp check --fix";
				modified = true;
				continue;
			}
		}
		const migrated = migrateViteCommandsToVp(sCmd);
		if (migrated !== sCmd) {
			scripts[sName] = migrated;
			modified = true;
		}
	}
	for (const [key, cmd] of Object.entries(REQUIRED_VITE_PLUS_SCRIPTS)) if (!scripts[key]) {
		scripts[key] = cmd;
		modified = true;
	}
	return modified;
}
function syncPackageJsonForVitePlus(projectRoot) {
	const pkg = getPackageJson(projectRoot, true);
	if (!pkg) return false;
	let modified = false;
	const nextDeps = pkg.dependencies ? { ...pkg.dependencies } : void 0;
	const nextDevDeps = { ...pkg.devDependencies ?? {} };
	const nextScripts = { ...pkg.scripts ?? {} };
	const nextOverrides = { ...pkg.overrides ?? {} };
	const minVersions = getAuditorMinimumVersions();
	const canonicalOverrides = getAuditorCanonicalOverrides();
	if (!nextDeps?.["vite-plus"] && !nextDevDeps["vite-plus"]) {
		const vitePlusFloor = minVersions["vite-plus"] ?? "^1.3.0";
		nextDevDeps["vite-plus"] = normalizeToCaretRange(vitePlusFloor);
		modified = true;
	}
	if (removeLegacyDependencies(nextDeps, nextDevDeps)) modified = true;
	for (const [ovKey, ovVal] of Object.entries(canonicalOverrides)) if (nextOverrides[ovKey] !== ovVal) {
		nextOverrides[ovKey] = ovVal;
		modified = true;
	}
	if (updateVitePlusScripts(nextScripts)) modified = true;
	const pinnedVitestVersion = canonicalOverrides.vitest;
	if (pinnedVitestVersion) {
		if (nextScripts["test:coverage"] && !nextDevDeps["@vitest/coverage-v8"]) {
			nextDevDeps["@vitest/coverage-v8"] = pinnedVitestVersion;
			modified = true;
		}
		if (("vitest" in nextDevDeps || "@vitest/coverage-v8" in nextDevDeps || "@vue/test-utils" in nextDevDeps) && nextDevDeps.vitest !== pinnedVitestVersion) {
			nextDevDeps.vitest = pinnedVitestVersion;
			modified = true;
		}
		if ("@vitest/coverage-v8" in nextDevDeps && nextDevDeps["@vitest/coverage-v8"] !== pinnedVitestVersion) {
			nextDevDeps["@vitest/coverage-v8"] = pinnedVitestVersion;
			modified = true;
		}
	}
	if (modified) writePackageJson(projectRoot, {
		...pkg,
		...nextDeps ? { dependencies: nextDeps } : {},
		devDependencies: nextDevDeps,
		scripts: nextScripts,
		...Object.keys(nextOverrides).length > 0 ? { overrides: nextOverrides } : {}
	});
	return modified;
}
function syncVSCodeSettings(projectRoot, auditConfig) {
	const vscConfig = (auditConfig ?? getAuditConfig(projectRoot)).vitePlusConfig?.vscode;
	if (vscConfig?.enabled === false) return false;
	const vscodeDir = path.resolve(projectRoot, ".vscode");
	fs.mkdirSync(vscodeDir, { recursive: true });
	let modified = false;
	const extPath = path.resolve(vscodeDir, "extensions.json");
	let extJson = {};
	if (fs.existsSync(extPath)) try {
		extJson = JSON.parse(fs.readFileSync(extPath, "utf-8"));
	} catch {
		extJson = {};
	}
	const recommendations = [...extJson.recommendations ?? []];
	const unwantedRecommendations = [...extJson.unwantedRecommendations ?? []];
	if (!recommendations.includes("oxc.oxc-vscode")) {
		recommendations.push("oxc.oxc-vscode");
		modified = true;
	}
	const unwanted = vscConfig?.unwantedRecommendations ?? ["dbaeumer.vscode-eslint", "esbenp.prettier-vscode"];
	for (const unw of unwanted) if (!unwantedRecommendations.includes(unw)) {
		unwantedRecommendations.push(unw);
		modified = true;
	}
	if (modified || !fs.existsSync(extPath)) {
		extJson.recommendations = recommendations;
		extJson.unwantedRecommendations = unwantedRecommendations;
		fs.writeFileSync(extPath, JSON.stringify(extJson, null, 2) + "\n", "utf-8");
	}
	const settingsPath = path.resolve(vscodeDir, "settings.json");
	let settingsJson = {};
	if (fs.existsSync(settingsPath)) try {
		settingsJson = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
	} catch {
		settingsJson = {};
	}
	const defFormatter = vscConfig?.defaultFormatter ?? "oxc.oxc-vscode";
	if (settingsJson["editor.defaultFormatter"] !== defFormatter) {
		settingsJson["editor.defaultFormatter"] = defFormatter;
		modified = true;
	}
	if (vscConfig?.formatOnSave !== false && settingsJson["editor.formatOnSave"] !== true) {
		settingsJson["editor.formatOnSave"] = true;
		modified = true;
	}
	if (modified || !fs.existsSync(settingsPath)) fs.writeFileSync(settingsPath, JSON.stringify(settingsJson, null, 2) + "\n", "utf-8");
	return modified;
}
function repairVitePlusProject(projectRoot) {
	const config = getAuditConfig(projectRoot);
	const viteConfigSync = syncViteConfigWithAuditConfig(projectRoot, config);
	const rewrittenFiles = rewriteImportsToVitePlus(projectRoot);
	const nodeVersionMigrated = migrateNodeVersion(projectRoot);
	const packageJsonUpdated = syncPackageJsonForVitePlus(projectRoot);
	const vscodeSync = syncVSCodeSettings(projectRoot, config);
	const removedConfigs = cleanLegacyConfigFiles(projectRoot);
	const viteConfigPath = path.resolve(projectRoot, "vite.config.ts");
	if (fs.existsSync(viteConfigPath)) tryOrNull(() => {
		const { content, modified } = migrateHomebrewCompressionInViteConfig(fs.readFileSync(viteConfigPath, "utf-8"));
		if (modified) fs.writeFileSync(viteConfigPath, content, "utf-8");
	});
	const removedHomebrew = cleanHomebrewCompressionFiles(projectRoot);
	return {
		removedConfigs: [...removedConfigs, ...removedHomebrew],
		rewrittenFiles,
		viteConfigSync,
		nodeVersionMigrated,
		packageJsonUpdated,
		vscodeSync
	};
}
//#endregion
export { BANNED_COMPRESSION_MODULES, LEGACY_CONFIG_FILES, STRICT_RULE_CHECKS, buildCanonicalVitePlusConfig, cleanHomebrewCompressionFiles, cleanLegacyConfigFiles, detectHomebrewCompressionImports, extractAstPropertyBlock as extractObjectPropertyBlock, findHomebrewCompressionFiles, findLegacyEslintIgnores, getVitePlusDefaultExcludeGlobs, migrateHomebrewCompressionInViteConfig, migrateNodeVersion, migrateViteCommandsToVp, repairVitePlusProject, resolveAuditConfigIgnoreGlobs, rewriteImportsToVitePlus, syncPackageJsonForVitePlus, syncVSCodeSettings, syncViteConfigWithAuditConfig };
