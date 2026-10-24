import { safeJsonParse, safeReadFileSync, tryOrNull } from "./safeUtils.js";
import path from "node:path";
import fs from "node:fs";
// src/core/markdownVersionValidator.ts
/**
* src/core/markdownVersionValidator.ts
*
* Helper module for validating and synchronizing project SemVer and
* @francogp/auditor version references across Markdown documentation.
*/
const EXEMPT_MARKDOWN_FILENAMES = /* @__PURE__ */ new Set(["changelog.md", "v8-migration-guide.md"]);
const HISTORICAL_OR_EXEMPT_LINE_PATTERNS = [/\b(?:since\s+version|from\s+version|prior\s+to|legacy|deprecated|migrating\s+from|upgraded?\s+from|salto|jump)\b/i, /\?\?\s*['"]\d+\.\d+\.\d+['"]/];
function extractBaseSemver(versionStr) {
	const match = /^v?(\d+\.\d+\.\d+)/.exec(versionStr.trim());
	return match ? match[1] : null;
}
function resolveInstalledAuditorVersions(rootDir, pkg) {
	if (pkg.name === "@francogp/auditor" && pkg.version) return {
		semver: extractBaseSemver(pkg.version),
		fullVersion: pkg.version
	};
	const depSpec = {
		...pkg.dependencies,
		...pkg.devDependencies
	}["@francogp/auditor"];
	let semver = null;
	if (typeof depSpec === "string") {
		const tagMatch = /#v?(\d+\.\d+\.\d+)/.exec(depSpec) ?? /(\d+\.\d+\.\d+)/.exec(depSpec);
		if (tagMatch) semver = tagMatch[1];
	}
	let fullVersion = null;
	const installedPkgPath = path.join(rootDir, "node_modules", "@francogp", "auditor", "package.json");
	const installedRaw = safeReadFileSync(installedPkgPath);
	if (installedRaw) {
		const installedPkg = safeJsonParse(installedRaw);
		if (installedPkg?.version) {
			fullVersion = installedPkg.version;
			if (!semver) semver = extractBaseSemver(installedPkg.version);
		}
	}
	return {
		semver,
		fullVersion
	};
}
/**
* Resolves the canonical project version and @francogp/auditor version from package.json.
*/
function resolveProjectVersionInfo(rootDir) {
	const pkgPath = path.join(rootDir, "package.json");
	if (!fs.existsSync(pkgPath)) return null;
	try {
		const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
		if (!pkg.version) return null;
		const currentSemver = extractBaseSemver(pkg.version);
		if (!currentSemver) return null;
		const auditorVer = resolveInstalledAuditorVersions(rootDir, pkg);
		return {
			pkgName: pkg.name ?? "",
			currentSemver,
			fullVersion: pkg.version,
			expectedAuditorSemver: auditorVer.semver,
			expectedAuditorFullVersion: auditorVer.fullVersion
		};
	} catch {
		return null;
	}
}
function isExemptMarkdownFile(relPath) {
	const base = path.basename(relPath).toLowerCase();
	return EXEMPT_MARKDOWN_FILENAMES.has(base);
}
function isHistoricalOrExemptLine(line) {
	return HISTORICAL_OR_EXEMPT_LINE_PATTERNS.some((re) => re.test(line));
}
function replacePrefixedSemver(text, regex, expectedSemver, lineNum, matches) {
	return text.replace(regex, (fullMatch, prefix, ver) => {
		if (ver !== expectedSemver) {
			matches.push({
				lineNum,
				found: `v${ver}`,
				expected: `v${expectedSemver}`,
				context: fullMatch
			});
			return `${prefix}${expectedSemver}`;
		}
		return fullMatch;
	});
}
function inspectLineAndReplace(line, lineNum, info, matches) {
	if (isHistoricalOrExemptLine(line)) return line;
	let updatedLine = line;
	if (info.expectedAuditorSemver) {
		const expectedSemver = info.expectedAuditorSemver;
		updatedLine = replacePrefixedSemver(updatedLine, /(github:francogp\/auditor#v)(\d+\.\d+\.\d+)/g, expectedSemver, lineNum, matches);
		if (updatedLine.includes("@francogp/auditor") || /release\s+tag/i.test(updatedLine)) updatedLine = updatedLine.replace(/(`#v)(\d+\.\d+\.\d+)(`)/g, (fullMatch, prefix, ver, suffix) => {
			if (ver !== expectedSemver) {
				matches.push({
					lineNum,
					found: `#v${ver}`,
					expected: `#v${expectedSemver}`,
					context: fullMatch
				});
				return `${prefix}${expectedSemver}${suffix}`;
			}
			return fullMatch;
		});
		updatedLine = updatedLine.replace(/(auditorVersion:\s*['"])v?(\d+\.\d+\.\d+)(-build\.[^'"]*)?(['"])/g, (fullMatch, prefix, ver, buildSuffix, quoteSuffix) => {
			if (ver !== expectedSemver) {
				const replacementVer = info.expectedAuditorFullVersion ?? `${expectedSemver}${buildSuffix ?? ""}`;
				matches.push({
					lineNum,
					found: `${ver}${buildSuffix ?? ""}`,
					expected: replacementVer,
					context: fullMatch
				});
				return `${prefix}${replacementVer}${quoteSuffix}`;
			}
			return fullMatch;
		});
		updatedLine = replacePrefixedSemver(updatedLine, /(auditor[-:]update(?:\s+--)?\s+v?)(\d+\.\d+\.\d+)/g, expectedSemver, lineNum, matches);
	}
	if (info.pkgName.length > 0) {
		const escapedPkg = info.pkgName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const pkgVerRegex = new RegExp(`(${escapedPkg}(?:@|\\s+v))(\\d+\\.\\d+\\.\\d+)`, "g");
		updatedLine = updatedLine.replace(pkgVerRegex, (fullMatch, prefix, ver) => {
			if (ver !== info.currentSemver) {
				matches.push({
					lineNum,
					found: ver,
					expected: info.currentSemver,
					context: fullMatch
				});
				return `${prefix}${info.currentSemver}`;
			}
			return fullMatch;
		});
	}
	return updatedLine;
}
/**
* Scans raw Markdown lines for outdated project or @francogp/auditor SemVer references,
* optionally returning the updated content when fixing.
*/
function scanAndFixMarkdownProjectVersions(relPath, rawLines, info) {
	if (!info || isExemptMarkdownFile(relPath)) return {
		matches: [],
		updatedContent: null,
		checkedCount: 0
	};
	const matches = [];
	const newLines = [];
	let changed = false;
	for (let i = 0; i < rawLines.length; i++) {
		const line = rawLines[i];
		const replaced = inspectLineAndReplace(line, i + 1, info, matches);
		if (replaced !== line) changed = true;
		newLines.push(replaced);
	}
	return {
		matches,
		updatedContent: changed ? newLines.join("\n") : null,
		checkedCount: rawLines.length
	};
}
/**
* Synchronizes version references in standard documentation files (README.md, skill references)
* during `auditor-version bump`.
*/
function syncDocumentationVersionReferences(cwd) {
	const info = resolveProjectVersionInfo(cwd);
	if (!info) return [];
	const candidateRelPaths = ["README.md", ".agents/skills/auditor/references/host-package-governance.md"];
	const modifiedFiles = [];
	for (const relPath of candidateRelPaths) {
		const absPath = path.join(cwd, relPath);
		if (!fs.existsSync(absPath)) continue;
		tryOrNull(() => {
			const rawContent = fs.readFileSync(absPath, "utf-8");
			const { updatedContent } = scanAndFixMarkdownProjectVersions(relPath, rawContent.split("\n"), info);
			if (updatedContent !== null && updatedContent !== rawContent) {
				fs.writeFileSync(absPath, updatedContent, "utf-8");
				modifiedFiles.push(absPath);
			}
		});
	}
	return modifiedFiles;
}
export { resolveProjectVersionInfo, scanAndFixMarkdownProjectVersions, syncDocumentationVersionReferences };
