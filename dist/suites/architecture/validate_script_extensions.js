import { tryOrNull } from "../../core/safeUtils.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/auditCoverage.js";
import { isPathContained } from "../../core/safePath.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases, getEffectiveScannableRoots, isPathIgnored } from "../../core/auditorBase.js";
import { getPackageJson, writePackageJson } from "../../core/packageJson.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_script_extensions.ts
/**
* src/suites/architecture/validate_script_extensions.ts
*
* SCRIPT & MODULE EXTENSIONS VALIDATOR (Node.js 26+ Native)
*
* Enforces canonical TypeScript (.ts) extensions across all project scripts, tools, and modules.
* Detects and prohibits legacy .mjs and .cjs files, as well as unmigrated .js in scripts directories.
* In --fix mode, automatically migrates files to .ts, renames them on disk, rewrites relative
* import statements across the codebase, and updates package.json scripts.
*/
enableCompileCache();
const SCRIPT_EXTENSIONS_RULES = [
	"banned-mjs-extension",
	"banned-cjs-extension",
	"banned-raw-js-script"
];
const CANONICAL_ROOT_CONFIG_SET = /* @__PURE__ */ new Set([
	"eslint.config.js",
	"eslint.config.mjs",
	"eslint.config.cjs",
	"postcss.config.js",
	"postcss.config.mjs",
	"postcss.config.cjs",
	"tailwind.config.js",
	"tailwind.config.mjs",
	"tailwind.config.cjs",
	"stylelint.config.js",
	"stylelint.config.mjs",
	"stylelint.config.cjs",
	"vite.config.js",
	"vite.config.mjs",
	"commitlint.config.js",
	"prettier.config.js",
	"prettier.config.mjs",
	"prettier.config.cjs"
]);
function isCanonicalConfigExempt(relPath) {
	const norm = normalizePosixPath(relPath);
	if (norm.includes("/") && !norm.startsWith(".config/")) return false;
	return CANONICAL_ROOT_CONFIG_SET.has(path.basename(norm));
}
function isExemptScriptFile(relPath, exemptList) {
	if (isCanonicalConfigExempt(relPath)) return true;
	if (!exemptList || exemptList.length === 0) return false;
	const targetRel = normalizePosixPath(relPath).toLowerCase();
	const targetBase = path.basename(targetRel);
	for (const ex of exemptList) {
		const norm = normalizePosixPath(ex).toLowerCase();
		if (targetRel === norm || targetRel.endsWith(`/${norm}`) || targetBase === norm) return true;
	}
	return false;
}
function resolveScriptAndCliDirs(config) {
	const srcRoots = (config.paths?.srcRoots ?? []).map((r) => normalizePosixPath(r));
	const scriptsRoots = (config.paths?.scriptsRoots ?? []).map((r) => normalizePosixPath(r));
	const cliRoots = (config.paths?.cliRoots ?? []).map((r) => normalizePosixPath(r));
	return Array.from(/* @__PURE__ */ new Set([
		...srcRoots,
		...scriptsRoots,
		...cliRoots
	]));
}
var ValidateScriptExtensionsAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const effectiveProjectRoot = options.projectRoot ?? process.cwd();
		const coverageIncludeGlobs = ["**/*.{mjs,cjs}", ...resolveScriptAndCliDirs(getAuditConfig(effectiveProjectRoot)).map((d) => `${d}/**/*.{js,jsx}`)];
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(SCRIPT_EXTENSIONS_RULES, {
				speed: "light",
				phase: "setup",
				fix: "priority",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}, [...SCRIPT_EXTENSIONS_RULES]),
			fixableRuleIds: [...SCRIPT_EXTENSIONS_RULES],
			id: "validate_script_extensions",
			name: "Script & Module Extensions Validator",
			description: "Validates TypeScript scripts and extensions",
			family: "architecture",
			ruleIds: SCRIPT_EXTENSIONS_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(SCRIPT_EXTENSIONS_RULES, "setup"),
			packageName: "Extensions",
			icon: "📜",
			configKey: "scriptExtensions",
			defaultConfig: {
				enabled: true,
				enforceTypeScript: true,
				allowMjs: false,
				allowCjs: false,
				allowJsScripts: false,
				exemptFiles: []
			},
			criticalConfig: {},
			ruleDescriptions: {
				"banned-mjs-extension": "Prohibited .mjs file in TS",
				"banned-cjs-extension": "Prohibited .cjs file in ESM",
				"banned-raw-js-script": "Untyped .js script in scripts"
			},
			ruleRemediations: {
				"banned-mjs-extension": "1. Root Cause:\nA file with the \".mjs\" extension was detected.\nIn native Node.js 26+ architecture with \"type\": \"module\" and native TypeScript execution (\"--experimental-strip-types\"), all project scripts and modules must be canonical TypeScript (.ts). The .mjs extension is an obsolete transitional artifact.\n\n2. Diagnosis:\nInspect the reported .mjs file. If it is a root tool configuration (e.g. postcss.config.mjs), verify if it is exempt or rename to .ts if supported by the tool.\n\n3. Canonical Solution:\n1. Run \"npm run auditor:fix\" or \"auditor fix\". The auditor will automatically rename the file to .ts, update relative import specifiers across the codebase, and rewrite package.json.scripts references.\n2. If a specific third-party tool requires .mjs, declare it in \"config.scriptExtensions.exemptFiles\" in .auditor/audit.config.ts.\n\n4. Example / Auto-fix command:\nnpm run auditor:fix",
				"banned-cjs-extension": "1. Root Cause:\nA file with the \".cjs\" extension was detected.\nThe project standardizes on modern ECMAScript Modules (ESM). CommonJS modules (.cjs) introduce dual-package hazards, defeat static tree-shaking, and violate language consistency.\n\n2. Diagnosis:\nReview the reported .cjs file, which often contains \"require()\" or \"module.exports\".\n\n3. Canonical Solution:\n1. Run \"npm run auditor:fix\". The auditor will migrate the extension to .ts.\n2. Replace \"require()\" or \"module.exports\" with standard ESM syntax (\"import\" and \"export\").\n\n4. Example / Auto-fix command:\nnpm run auditor:fix",
				"banned-raw-js-script": "1. Root Cause:\nAn untyped plain JavaScript script (\".js\" or \".jsx\") was detected in a tooling or script directory (scripts/, src/cli/, etc.).\nAll operational scripts and CLI utilities must be strictly typed TypeScript (.ts / .tsx) for maintainability and safety.\n\n2. Diagnosis:\nInspect the reported script file.\n\n3. Canonical Solution:\n1. Run \"npm run auditor:fix\" to automatically rename the script to .ts and update package.json invocations.\n2. Add type annotations to function parameters and return values.\n\n4. Example / Auto-fix command:\nnpm run auditor:fix"
			},
			coverage: { include: coverageIncludeGlobs },
			...options
		});
	}
	async runAudit() {
		const config = getAuditConfig(this.projectRoot);
		if (config.scriptExtensions?.enabled === false) {
			this.markSkipped("Disabled in config (scriptExtensions.enabled = false)");
			return;
		}
		const allowMjs = config.scriptExtensions?.allowMjs ?? false;
		const allowCjs = config.scriptExtensions?.allowCjs ?? false;
		const allowJsScripts = config.scriptExtensions?.allowJsScripts ?? false;
		const exemptFiles = config.scriptExtensions?.exemptFiles ?? [];
		const scriptAndCliDirs = resolveScriptAndCliDirs(config);
		const candidateFiles = this.collectCandidateFiles(scriptAndCliDirs);
		const violations = [];
		for (const fullPath of candidateFiles) {
			const relPath = toPosixRelative(this.projectRoot, fullPath);
			this.recordScanned(relPath);
		}
		this.runSubAuditorSync("banned-mjs-extension", () => {
			if (allowMjs) return;
			for (const fullPath of candidateFiles) {
				const ext = path.extname(fullPath).toLowerCase();
				if (ext === ".mjs") {
					const relPath = toPosixRelative(this.projectRoot, fullPath);
					if (isExemptScriptFile(relPath, exemptFiles)) continue;
					violations.push({
						file: relPath,
						fullPath,
						ruleId: "banned-mjs-extension",
						message: `File with ".mjs" extension detected: "${relPath}". In native Node.js 26+ projects, all modules and scripts must be TypeScript (.ts).`,
						targetTsPath: fullPath.slice(0, -ext.length) + ".ts"
					});
				}
			}
		});
		this.runSubAuditorSync("banned-cjs-extension", () => {
			if (allowCjs) return;
			for (const fullPath of candidateFiles) {
				const ext = path.extname(fullPath).toLowerCase();
				if (ext === ".cjs") {
					const relPath = toPosixRelative(this.projectRoot, fullPath);
					if (isExemptScriptFile(relPath, exemptFiles)) continue;
					violations.push({
						file: relPath,
						fullPath,
						ruleId: "banned-cjs-extension",
						message: `File with ".cjs" extension detected: "${relPath}". In native Node.js 26+ projects ("type": "module"), CommonJS modules (.cjs) are prohibited.`,
						targetTsPath: fullPath.slice(0, -ext.length) + ".ts"
					});
				}
			}
		});
		this.runSubAuditorSync("banned-raw-js-script", () => {
			if (allowJsScripts) return;
			for (const fullPath of candidateFiles) {
				const ext = path.extname(fullPath).toLowerCase();
				if (ext === ".js" || ext === ".jsx") {
					const relPath = toPosixRelative(this.projectRoot, fullPath);
					if (isExemptScriptFile(relPath, exemptFiles)) continue;
					if (scriptAndCliDirs.some((dir) => isPathContained(dir, relPath))) {
						const targetExt = ext === ".jsx" ? ".tsx" : ".ts";
						violations.push({
							file: relPath,
							fullPath,
							ruleId: "banned-raw-js-script",
							message: `Untyped JavaScript file "${relPath}" detected. Must be migrated to TypeScript (${targetExt}).`,
							targetTsPath: fullPath.slice(0, -ext.length) + targetExt
						});
					}
				}
			}
		});
		if (violations.length === 0) return;
		if (!this.isFixActive()) {
			for (const v of violations) this.addViolation({
				ruleId: v.ruleId,
				severity: "error",
				file: v.file,
				line: 1,
				col: 1,
				message: v.message,
				context: path.basename(v.file),
				fixable: true
			});
			return;
		}
		await this.executeFixes(violations);
	}
	collectCandidateFiles(scriptAndCliDirs) {
		const scannableRoots = getEffectiveScannableRoots(getAuditConfig(this.projectRoot));
		const collected = /* @__PURE__ */ new Set();
		const moduleExtensions = /* @__PURE__ */ new Set([".mjs", ".cjs"]);
		const moduleFiles = this.context.collectFiles(scannableRoots, moduleExtensions);
		for (const f of moduleFiles) collected.add(f);
		if (scriptAndCliDirs.map((d) => path.resolve(this.projectRoot, d)).filter((d) => fs.existsSync(d)).length > 0) {
			const jsFiles = this.context.collectFiles(scriptAndCliDirs, /* @__PURE__ */ new Set([".js", ".jsx"]));
			for (const f of jsFiles) collected.add(f);
		}
		const rootEntries = tryOrNull(() => fs.existsSync(this.projectRoot) ? fs.readdirSync(this.projectRoot, { withFileTypes: true }) : []) ?? [];
		for (const entry of rootEntries) {
			if (!entry.isFile()) continue;
			const ext = path.extname(entry.name).toLowerCase();
			if (moduleExtensions.has(ext)) {
				const absPath = path.resolve(this.projectRoot, entry.name);
				const relPath = toPosixRelative(this.projectRoot, absPath);
				if (!isPathIgnored(relPath)) collected.add(absPath);
			}
		}
		return Array.from(collected);
	}
	async executeFixes(violations) {
		const plans = [];
		for (const v of violations) {
			if (fs.existsSync(v.targetTsPath)) {
				const targetRel = toPosixRelative(this.projectRoot, v.targetTsPath);
				this.addViolation({
					ruleId: v.ruleId,
					severity: "error",
					file: v.file,
					line: 1,
					col: 1,
					message: `Cannot automatically convert "${v.file}": destination file "${targetRel}" already exists on disk.`,
					context: path.basename(v.file),
					fixable: false
				});
				continue;
			}
			plans.push({
				oldFullPath: v.fullPath,
				newFullPath: v.targetTsPath,
				oldRelPath: v.file,
				newRelPath: toPosixRelative(this.projectRoot, v.targetTsPath),
				oldBaseName: path.basename(v.fullPath),
				newBaseName: path.basename(v.targetTsPath)
			});
		}
		if (plans.length === 0) return;
		for (const plan of plans) if (fs.existsSync(plan.oldFullPath)) fs.renameSync(plan.oldFullPath, plan.newFullPath);
		this.rewriteImportReferences(plans);
		this.rewritePackageJsonScripts(plans);
	}
	rewriteImportReferences(plans) {
		const scannableRoots = getEffectiveScannableRoots(getAuditConfig(this.projectRoot));
		const allCodeFiles = this.context.collectFiles(scannableRoots, /* @__PURE__ */ new Set([
			".ts",
			".tsx",
			".vue",
			".js",
			".jsx",
			".mjs",
			".cjs"
		]));
		for (const filePath of allCodeFiles) tryOrNull(() => {
			if (!fs.existsSync(filePath)) return;
			let content = fs.readFileSync(filePath, "utf-8");
			let modified = false;
			for (const plan of plans) {
				const escapedOld = plan.oldBaseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const importPattern = new RegExp(`(['"\`][^'"\`]*?\\/)${escapedOld}(['"\`])`, "g");
				if (importPattern.test(content)) {
					content = content.replace(importPattern, `$1${plan.newBaseName}$2`);
					modified = true;
				}
			}
			if (modified) fs.writeFileSync(filePath, content, "utf-8");
		});
	}
	rewritePackageJsonScripts(plans) {
		const pkg = getPackageJson(this.projectRoot, true);
		if (!pkg?.scripts || typeof pkg.scripts !== "object") return;
		const updatedScripts = { ...pkg.scripts };
		let modified = false;
		for (const [scriptName, scriptCmd] of Object.entries(updatedScripts)) {
			let updatedCmd = scriptCmd;
			for (const plan of plans) if (updatedCmd.includes(plan.oldBaseName)) {
				const escapedOld = plan.oldBaseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const pattern = new RegExp(`\\b${escapedOld}\\b`, "g");
				updatedCmd = updatedCmd.replace(pattern, plan.newBaseName);
				modified = true;
			}
			if (updatedCmd !== scriptCmd) updatedScripts[scriptName] = updatedCmd;
		}
		if (modified) writePackageJson(this.projectRoot, {
			...pkg,
			scripts: updatedScripts
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateScriptExtensionsAuditor());
//#endregion
export { SCRIPT_EXTENSIONS_RULES, ValidateScriptExtensionsAuditor, isCanonicalConfigExempt, isExemptScriptFile, resolveScriptAndCliDirs };
