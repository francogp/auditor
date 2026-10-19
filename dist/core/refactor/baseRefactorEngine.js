import { getAuditConfig } from "../auditConfigLoader.js";
import { isTestPath } from "../auditTestPredicates.js";
import { isDataPath, isExemptFile } from "../auditPathPredicates.js";
import "../auditConfig.js";
import { toPosixRelative } from "../auditCoverage.js";
import { collectRepositoryFiles } from "../auditorBase.js";
import "../safePath.js";
import path from "node:path";
import fs from "node:fs";
//#region src/core/refactor/baseRefactorEngine.ts
/**
* src/core/refactor/baseRefactorEngine.ts
*
* CANONICAL BASE REFACTOR ENGINE (Node.js 26+ Native)
* Enforces pure configuration-driven resolution (audit.config.ts) and strict OOP inheritance
* across all refactoring CLI tools (auditor-magic, auditor-domain, auditor-motion, auditor-o1, auditor-types).
*
* Mandate: Zero hardcoded directory arrays, zero skipped configurations, and 100% parity
* between auditor validation suites and refactoring engines.
*/
var BaseRefactorEngine = class {
	projectRoot;
	config;
	constructor(projectRootOrOptions, explicitConfig) {
		if (typeof projectRootOrOptions === "string") {
			this.projectRoot = path.resolve(projectRootOrOptions);
			this.config = explicitConfig ?? getAuditConfig(this.projectRoot);
		} else {
			this.projectRoot = path.resolve(projectRootOrOptions?.projectRoot ?? process.cwd());
			this.config = projectRootOrOptions?.config ?? explicitConfig ?? getAuditConfig(this.projectRoot);
		}
	}
	/**
	* Resolves target roots for this refactoring engine dynamically from audit.config.ts.
	* Defaults to config.paths.codeRoots ?? ['src', 'scripts'].
	*/
	resolveTargetRoots() {
		return this.config.paths.codeRoots ?? ["src", "scripts"];
	}
	/**
	* Determines whether this engine should inspect test files.
	* Strictly evaluates config.paths.includeTestsInCodeAudit (defaults to false).
	*/
	shouldIncludeTests() {
		return this.config.paths.includeTestsInCodeAudit === true;
	}
	/**
	* Determines whether this engine should inspect data catalog paths (paths.dataRoots).
	* Defaults to true, but overridden to false in constant / magic number engines.
	*/
	shouldIncludeDataPaths() {
		return true;
	}
	/**
	* Resolves global ignore patterns dynamically from config.paths.ignoreGlobs.
	*/
	resolveGlobalIgnorePatterns() {
		return this.config.paths.ignoreGlobs ?? [];
	}
	/**
	* Resolves section-specific ignore patterns from audit.config.ts.
	*/
	resolveSectionIgnorePatterns() {
		if (!this.configSectionKey) return [];
		const section = this.config[this.configSectionKey];
		if (!section || typeof section !== "object") return [];
		const sectionIgnores = [];
		if (Array.isArray(section.ignoreGlobs)) {
			for (const item of section.ignoreGlobs) if (typeof item === "string") sectionIgnores.push(item);
		}
		return sectionIgnores;
	}
	/**
	* Combines global ignore patterns and tool section-specific ignore patterns.
	*/
	resolveCombinedIgnorePatterns() {
		const combined = [...this.resolveGlobalIgnorePatterns(), ...this.resolveSectionIgnorePatterns()];
		return Array.from(new Set(combined));
	}
	/**
	* Resolves section-specific exempt paths and exempt files from audit.config.ts.
	*/
	resolveSectionExemptPaths() {
		if (!this.configSectionKey) return [];
		const section = this.config[this.configSectionKey];
		if (!section || typeof section !== "object") return [];
		const exempt = [];
		if (Array.isArray(section.exemptPaths)) {
			for (const item of section.exemptPaths) if (typeof item === "string") exempt.push(item);
		}
		if (Array.isArray(section.exemptFiles)) {
			for (const item of section.exemptFiles) if (typeof item === "string") exempt.push(item);
		}
		if (Array.isArray(section.exemptCssFiles)) {
			for (const item of section.exemptCssFiles) if (typeof item === "string") exempt.push(item);
		}
		return Array.from(new Set(exempt));
	}
	/**
	* Checks whether this refactoring tool is enabled in audit.config.ts.
	*/
	isToolEnabled() {
		if (!this.configSectionKey) return true;
		const section = this.config[this.configSectionKey];
		if (!section || typeof section !== "object") return true;
		return section.enabled !== false;
	}
	/**
	* Discovers all scannable files strictly according to audit.config.ts:
	* - Scoped to this engine's target roots (e.g. codeRoots)
	* - Respects global ignoreGlobs and section-specific ignoreGlobs
	* - Respects section-specific exemptPaths and exemptFiles
	* - Excludes test files if shouldIncludeTests() === false
	* - Excludes data catalog files if shouldIncludeDataPaths() === false
	* - Excludes globally exempt files (isExemptFile)
	*/
	getScannableFiles() {
		const roots = this.resolveTargetRoots();
		const combinedIgnores = this.resolveCombinedIgnorePatterns();
		const sectionExemptPaths = this.resolveSectionExemptPaths();
		const seen = /* @__PURE__ */ new Set();
		const scannableFiles = [];
		for (const root of roots) {
			const fullRoot = path.resolve(this.projectRoot, root);
			if (!fs.existsSync(fullRoot)) continue;
			const collected = collectRepositoryFiles(fullRoot, this.projectRoot, combinedIgnores, this.allowedExtensions);
			for (const absFile of collected) {
				const relPosix = toPosixRelative(this.projectRoot, absFile);
				if (seen.has(relPosix)) continue;
				if (!this.shouldIncludeTests() && isTestPath(relPosix)) continue;
				if (relPosix.endsWith(".d.ts")) continue;
				if (!this.shouldIncludeDataPaths() && isDataPath(relPosix, this.config)) continue;
				if (isExemptFile(relPosix, this.config)) continue;
				if (this.isSectionPathExempt(relPosix, sectionExemptPaths)) continue;
				seen.add(relPosix);
				scannableFiles.push(relPosix);
			}
		}
		return scannableFiles.sort((a, b) => a.localeCompare(b));
	}
	/**
	* Checks if a relative file path matches any section-specific exempt path or glob.
	*/
	isSectionPathExempt(relPath, sectionExemptPaths) {
		const norm = relPath.toLowerCase();
		for (const rawExempt of sectionExemptPaths) {
			const normExempt = rawExempt.split("\\").join("/").toLowerCase();
			if (normExempt.endsWith("/**")) {
				const prefix = normExempt.slice(0, -3);
				if (norm === prefix || norm.startsWith(`${prefix}/`)) return true;
			} else if (normExempt.endsWith("/*")) {
				const prefix = normExempt.slice(0, -2);
				if (norm.startsWith(`${prefix}/`)) return true;
			} else if (norm === normExempt || norm.endsWith(`/${normExempt}`)) return true;
		}
		return false;
	}
	/**
	* Discovers refactoring opportunities across all scannable files in the project.
	*/
	discoverAll() {
		const files = this.getScannableFiles();
		const results = [];
		for (const relFile of files) {
			const fullPath = path.resolve(this.projectRoot, relFile);
			const findings = this.discoverInFile(fullPath);
			if (findings.length > 0) results.push({
				file: relFile,
				fullPath,
				findings
			});
		}
		return results;
	}
};
//#endregion
export { BaseRefactorEngine };
