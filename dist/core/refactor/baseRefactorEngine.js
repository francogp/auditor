import { getAuditConfig } from "../auditConfigLoader.js";
import "../auditConfig.js";
import { FileScanAuditor } from "../auditorBase.js";
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
		return this.auditor instanceof FileScanAuditor ? this.auditor.exemptPaths : [];
	}
	isToolEnabled() {
		if (!this.configSectionKey) return true;
		const section = this.config[this.configSectionKey];
		if (!section || typeof section !== "object") return true;
		return section.enabled !== false;
	}
	/**
	* Resolves scannable files strictly delegated to the canonical sub-auditor.
	*/
	getScannableFiles() {
		return this.auditor.getScannableFiles();
	}
	/**
	* Checks whether a given project-relative path is scannable by the sub-auditor.
	*/
	isPathScannable(relPath) {
		return this.auditor.isPathScannable(relPath);
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
