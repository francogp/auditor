import { getAuditConfig } from "../auditConfigLoader.js";
import "../auditConfig.js";
import { isPathContained, stripGlobSuffix } from "../safePath.js";
import "../auditorBase.js";
import path from "node:path";
//#region src/core/refactor/baseRefactorEngine.ts
/**
* src/core/refactor/baseRefactorEngine.ts
*
* CANONICAL BASE REFACTOR ENGINE (Node.js 26+ Native)
* Enforces pure configuration-driven resolution and strict sub-auditor inheritance
* across all refactoring CLI tools (auditor-magic, auditor-domain, auditor-motion, auditor-o1, auditor-types, auditor-dupes).
*
* Mandate: Every refactoring engine constructor requires a canonical sub-auditor instance.
* File discovery, roots, allowed extensions, and exclusions are delegated 100% to the sub-auditor,
* guaranteeing absolute 1:1 parity between audit findings and refactoring tool targets.
*/
var BaseRefactorEngine = class {
	auditor;
	constructor(auditor) {
		if (!auditor) throw new Error("[BaseRefactorEngine]: Constructor requires a canonical sub-auditor instance.");
		this.auditor = auditor;
	}
	get projectRoot() {
		return this.auditor.projectRoot;
	}
	get config() {
		return getAuditConfig(this.projectRoot);
	}
	get allowedExtensions() {
		return this.auditor.allowedExtensions;
	}
	getAuditor() {
		return this.auditor;
	}
	resolveTargetRoots() {
		const codeRoots = this.config.paths?.codeRoots;
		if (codeRoots && codeRoots.length > 0) return codeRoots;
		return this.auditor.roots;
	}
	shouldIncludeTests() {
		return this.config.paths.includeTestsInCodeAudit === true;
	}
	shouldIncludeDataPaths() {
		return true;
	}
	resolveGlobalIgnorePatterns() {
		return this.config.paths.ignoreGlobs ?? [];
	}
	resolveSectionIgnorePatterns() {
		return this.auditor.extraIgnorePatterns;
	}
	resolveCombinedIgnorePatterns() {
		const combined = [...this.resolveGlobalIgnorePatterns(), ...this.resolveSectionIgnorePatterns()];
		return Array.from(new Set(combined));
	}
	resolveSectionExemptPaths() {
		return this.auditor.exemptPaths;
	}
	isToolEnabled() {
		if (!this.configSectionKey) return true;
		const section = this.config[this.configSectionKey];
		if (!section || typeof section !== "object") return true;
		return section.enabled !== false;
	}
	isPathInRoots(relPath, roots) {
		const absPath = path.resolve(this.projectRoot, relPath);
		return roots.some((root) => {
			const cleanRoot = stripGlobSuffix(root);
			const absRoot = path.resolve(this.projectRoot, cleanRoot);
			return isPathContained(absRoot, absPath);
		});
	}
	/**
	* Resolves scannable files strictly delegated to the canonical sub-auditor,
	* enforcing target roots (paths.codeRoots) and data directory exclusions when shouldIncludeDataPaths is false.
	*/
	getScannableFiles() {
		const files = this.auditor.getScannableFiles();
		const codeRoots = this.resolveTargetRoots();
		let filtered = files;
		if (codeRoots && codeRoots.length > 0) filtered = filtered.filter((f) => this.isPathInRoots(f, codeRoots));
		if (this.shouldIncludeDataPaths()) return filtered;
		const dataRoots = this.config.paths.dataRoots ?? [];
		if (dataRoots.length === 0) return filtered;
		return filtered.filter((f) => !this.isPathInRoots(f, dataRoots));
	}
	/**
	* Checks whether a given project-relative path is scannable by the sub-auditor,
	* enforcing target roots (paths.codeRoots) and data directory exclusions when shouldIncludeDataPaths is false.
	*/
	isPathScannable(relPath) {
		if (!this.auditor.isPathScannable(relPath)) return false;
		const codeRoots = this.resolveTargetRoots();
		if (codeRoots && codeRoots.length > 0 && !this.isPathInRoots(relPath, codeRoots)) return false;
		if (!this.shouldIncludeDataPaths()) {
			const dataRoots = this.config.paths.dataRoots ?? [];
			if (dataRoots.length > 0 && this.isPathInRoots(relPath, dataRoots)) return false;
		}
		return true;
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
